import { useCoachStreamStore } from '../../features/coach/coach-stream-store';
import { ApiError, apiStreamSSE } from '../client';
import { reconnectCoachChatStream, resumeCoachMessageStream } from './coach';

jest.mock('../client', () => {
  class MockApiError extends Error {
    status: number;
    code?: string;
    details?: Record<string, unknown>;
    constructor(
      message: string,
      mockStatus: number,
      mockCode?: string,
      mockDetails?: Record<string, unknown>,
    ) {
      super(message);
      this.name = 'ApiError';
      this.status = mockStatus;
      this.code = mockCode;
      this.details = mockDetails;
    }
  }
  return {
    ApiError: MockApiError,
    apiStreamSSE: jest.fn(),
    apiFetch: jest.fn(),
    abortActiveSseStream: jest.fn(),
    pollAiTask: jest.fn(),
    uploadToPresignedUrl: jest.fn(),
  };
});
jest.mock('./media', () => ({ presignRequestBody: jest.fn() }));
jest.mock('../../features/location', () => ({ resolveLocationContextForChat: jest.fn() }));
jest.mock('../../env', () => ({
  AI_POLL_INTERVAL_MS: 1,
  AI_POLL_TIMEOUT_MS: 1,
  AI_POLL_TIMEOUT_PLAN_MS: 1,
  DEFAULT_TIMEZONE_OFFSET_MINUTES: 480,
}));

type Emit = (event: string, data: unknown) => void;
type Step = { events?: [string, unknown][]; fail?: Error };

const mockedSse = apiStreamSSE as jest.MockedFunction<typeof apiStreamSSE>;

const delta = (sequence: number, text: string): [string, unknown] => ['delta', { sequence, text }];
const done = (sequence: number, finalText: string, lastTextSequence = sequence - 1) =>
  ['done', { sequence, lastTextSequence, finalText, suggestedActions: [], toolTrace: [] }] as [
    string,
    unknown,
  ];
const cancelled = (sequence: number, finalText: string, lastTextSequence = sequence - 1) =>
  ['cancelled', { sequence, lastTextSequence, finalText, toolTrace: [] }] as [string, unknown];
const networkError = () => new ApiError('网络错误', 0);

/** 每次 SSE 连接按脚本推送事件，之后正常结束或抛出网络错误 */
function scriptConnections(steps: Step[]) {
  let index = 0;
  mockedSse.mockImplementation(async (_path, onEvent: Emit) => {
    const step = steps[Math.min(index, steps.length - 1)]!;
    index += 1;
    for (const [event, data] of step.events ?? []) onEvent(event, data);
    if (step.fail) throw step.fail;
  });
}

const afterSequences = () => mockedSse.mock.calls.map((call) => call[2]?.afterSequence);

const resume = () =>
  resumeCoachMessageStream({
    conversationId: 'conv-1',
    streamId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    userContent: '你好',
  });

/** 退避等待用 setTimeout：推进假时钟直到订阅结束 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let finished = false;
  const tracked = promise.finally(() => {
    finished = true;
  });
  tracked.catch(() => undefined);
  for (let i = 0; i < 50 && !finished; i += 1) {
    await jest.advanceTimersByTimeAsync(20_000);
  }
  return tracked;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedSse.mockReset();
  useCoachStreamStore.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('序号补播', () => {
  it('断线后带 afterSequence 重连，重复事件被丢弃，正文不重不漏', async () => {
    scriptConnections([
      { events: [delta(1, '你'), delta(2, '好')], fail: networkError() },
      { events: [delta(2, '好'), delta(3, '！'), done(4, '你好！')] },
    ]);

    const original = useCoachStreamStore.getState().correctAssistantContent;
    const correct = jest.fn(original);
    useCoachStreamStore.setState({ correctAssistantContent: correct });
    try {
      await settle(resume());
    } finally {
      useCoachStreamStore.setState({ correctAssistantContent: original });
    }

    const state = useCoachStreamStore.getState();
    expect(afterSequences()).toEqual([0, 2]);
    expect(state.assistantContent).toBe('你好！');
    // 去重生效时拼出的正文已与 finalText 一致，无需终态校正
    expect(correct).not.toHaveBeenCalled();
    expect(state.isStreaming).toBe(false);
    expect(state.lastProcessedSequence).toBe(4);
  });

  it('已收到终态后断线不再重连', async () => {
    scriptConnections([
      { events: [delta(1, 'A'), done(2, 'A')], fail: networkError() },
      { events: [done(2, 'A')] },
    ]);

    await settle(resume());

    expect(mockedSse).toHaveBeenCalledTimes(1);
    expect(useCoachStreamStore.getState().assistantContent).toBe('A');
  });
});

describe('断线重连', () => {
  it('连续失败 6 次退避后进入"需手动重连"', async () => {
    scriptConnections([{ fail: networkError() }]);

    await expect(settle(resume())).rejects.toMatchObject({ code: 'STREAM_RECONNECT_REQUIRED' });

    expect(mockedSse).toHaveBeenCalledTimes(7);
    expect(useCoachStreamStore.getState().reconnectRequired).toBe(true);
  });

  it('每次重连都收到新事件时重试计数清零，不会误判为耗尽', async () => {
    const flaky: Step[] = Array.from({ length: 10 }, (_, i) => ({
      events: [delta(i + 1, String(i))],
      fail: networkError(),
    }));
    scriptConnections([...flaky, { events: [done(11, '0123456789')] }]);

    await settle(resume());

    const state = useCoachStreamStore.getState();
    expect(state.reconnectRequired).toBe(false);
    expect(state.assistantContent).toBe('0123456789');
  });

  it('4xx（如 410 已过期）不重试，直接抛出', async () => {
    scriptConnections([{ fail: new ApiError('生成事件已过期', 410, 'COACH_STREAM_EXPIRED') }]);

    await expect(settle(resume())).rejects.toMatchObject({ status: 410 });
    expect(mockedSse).toHaveBeenCalledTimes(1);
  });

  it('手动重连从上次处理到的序号继续', async () => {
    scriptConnections([{ events: [delta(1, '前半')], fail: networkError() }]);
    await expect(settle(resume())).rejects.toMatchObject({ code: 'STREAM_RECONNECT_REQUIRED' });

    mockedSse.mockReset();
    scriptConnections([{ events: [delta(2, '后半'), done(3, '前半后半')] }]);
    await settle(reconnectCoachChatStream());

    const state = useCoachStreamStore.getState();
    expect(afterSequences()).toEqual([1]);
    expect(state.reconnectRequired).toBe(false);
    expect(state.assistantContent).toBe('前半后半');
  });
});

describe('服务端取消', () => {
  it('收到 cancelled 后停止并保留服务端确认的部分正文', async () => {
    scriptConnections([{ events: [delta(1, '部分'), cancelled(2, '部分')] }]);

    await settle(resume());

    const state = useCoachStreamStore.getState();
    expect(state.isCancelled).toBe(true);
    expect(state.isStreaming).toBe(false);
    expect(state.assistantContent).toBe('部分');
  });

  it('取消期间断线：重连后收到服务端合成的终态并以其为准', async () => {
    scriptConnections([
      { events: [delta(1, '部分正文')], fail: networkError() },
      { events: [cancelled(5, '部分正文多', 3)] },
    ]);

    await settle(resume());

    const state = useCoachStreamStore.getState();
    expect(afterSequences()).toEqual([0, 1]);
    expect(state.isCancelled).toBe(true);
    expect(state.assistantContent).toBe('部分正文多');
  });
});

describe('终态快照校正', () => {
  it('中间 delta 丢失时以 done.finalText 覆盖客户端正文', async () => {
    scriptConnections([{ events: [delta(1, '你'), delta(3, '！'), done(4, '你好！')] }]);

    await settle(resume());

    expect(useCoachStreamStore.getState().assistantContent).toBe('你好！');
  });

  it('带序号的 error 事件进入失败态并清空未确认正文', async () => {
    scriptConnections([
      {
        events: [delta(1, '半句'), ['error', { sequence: 2, message: '回答生成失败', code: 'X' }]],
      },
    ]);

    await settle(resume());

    const state = useCoachStreamStore.getState();
    expect(state.error).toBe('回答生成失败');
    expect(state.assistantContent).toBe('');
    expect(state.isStreaming).toBe(false);
  });
});
