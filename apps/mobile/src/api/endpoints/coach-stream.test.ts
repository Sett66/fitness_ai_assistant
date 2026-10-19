import { useCoachStreamStore } from '../../features/coach/coach-stream-store';
import { ApiError, apiStreamSSE } from '../client';
import {
  reconnectCoachChatStream,
  resumeCoachMessageStream,
  unsubscribeCoachChatStream,
} from './coach';

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
  unsubscribeCoachChatStream();
  mockedSse.mockReset();
  useCoachStreamStore.getState().reset();
});

afterEach(() => {
  unsubscribeCoachChatStream();
  jest.useRealTimers();
});

describe('订阅所有权与缓冲顺序', () => {
  function controlledConnections() {
    const connections: { emit: Emit; close: () => void }[] = [];
    mockedSse.mockImplementation(
      (_path, emit) => new Promise<void>((close) => connections.push({ emit, close })),
    );
    return connections;
  }

  it('重复恢复复用同一连接和缓冲，终态校正前正文已按顺序拼接', async () => {
    const connections = controlledConnections();
    const first = resume();
    await jest.advanceTimersByTimeAsync(0);
    connections[0]!.emit(...delta(1, 'A'));
    connections[0]!.emit(...delta(2, 'B'));
    const reconnect = reconnectCoachChatStream();
    const duplicate = resume();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockedSse).toHaveBeenCalledTimes(1);

    connections[0]!.emit(...delta(3, 'C'));
    await jest.advanceTimersByTimeAsync(32);
    expect(useCoachStreamStore.getState().assistantContent).toBe('ABC');
    connections[0]!.emit(...done(4, 'ABC'));
    connections[0]!.close();
    await Promise.all([first, reconnect, duplicate]);
  });

  it('断开同步刷入缓冲；旧回调和旧清理不能污染替代订阅', async () => {
    const connections = controlledConnections();
    const oldResult = resume().catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(0);
    connections[0]!.emit(...delta(1, 'A'));
    connections[0]!.emit(...delta(2, 'B'));
    expect(useCoachStreamStore.getState().assistantContent).toBe('A');

    unsubscribeCoachChatStream();
    expect(useCoachStreamStore.getState().assistantContent).toBe('AB');
    expect(mockedSse.mock.calls[0]![2]?.signal?.aborted).toBe(true);
    const replacement = reconnectCoachChatStream();
    await jest.advanceTimersByTimeAsync(0);
    expect(afterSequences()).toEqual([0, 2]);
    connections[1]!.emit(...delta(3, 'C'));
    connections[0]!.emit(...delta(99, '旧连接'));
    connections[0]!.emit(...done(100, '错误快照'));
    connections[0]!.close();
    await expect(oldResult).resolves.toMatchObject({ code: 'STREAM_UNSUBSCRIBED' });
    const duplicate = reconnectCoachChatStream();
    await jest.advanceTimersByTimeAsync(32);
    expect(mockedSse).toHaveBeenCalledTimes(2);
    expect(useCoachStreamStore.getState().assistantContent).toBe('ABC');
    expect(useCoachStreamStore.getState().lastProcessedSequence).toBe(3);
    connections[1]!.emit(...done(4, 'ABC'));
    connections[1]!.close();
    await Promise.all([replacement, duplicate]);
  });

  it('切换流后，旧流的定时缓冲和终态不能写入新会话', async () => {
    const connections = controlledConnections();
    const oldResult = resume().catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(0);
    connections[0]!.emit(...delta(1, '旧'));
    connections[0]!.emit(...delta(2, '缓冲'));
    const next = resumeCoachMessageStream({
      conversationId: 'conv-2',
      streamId: 'run-2',
      userMessageId: 'user-2',
      assistantMessageId: 'assistant-2',
      userContent: '新问题',
    });
    await jest.advanceTimersByTimeAsync(0);
    connections[1]!.emit(...delta(1, '新回答'));
    connections[0]!.emit(...cancelled(3, '旧内容'));
    connections[0]!.close();
    await expect(oldResult).resolves.toMatchObject({ code: 'STREAM_UNSUBSCRIBED' });
    await jest.advanceTimersByTimeAsync(32);
    expect(useCoachStreamStore.getState().assistantContent).toBe('新回答');
    expect(useCoachStreamStore.getState().isCancelled).toBe(false);
    connections[1]!.emit(...done(2, '新回答'));
    connections[1]!.close();
    await next;
  });

  it('退避等待期间重复恢复不会另开连接，取消后旧重试不再启动', async () => {
    const connections = controlledConnections();
    mockedSse.mockRejectedValueOnce(networkError());
    const oldResult = resume().catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(0);
    const duplicateResult = reconnectCoachChatStream().catch((err: unknown) => err);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockedSse).toHaveBeenCalledTimes(1);
    unsubscribeCoachChatStream();
    const next = reconnectCoachChatStream();
    await jest.advanceTimersByTimeAsync(500);
    expect(mockedSse).toHaveBeenCalledTimes(2);
    await expect(oldResult).resolves.toMatchObject({ code: 'STREAM_UNSUBSCRIBED' });
    await expect(duplicateResult).resolves.toMatchObject({ code: 'STREAM_UNSUBSCRIBED' });
    connections[0]!.emit(...done(1, '恢复成功', 0));
    connections[0]!.close();
    await next;
  });

  it('自动重试后也拒绝同一订阅内上一条连接的延迟事件', async () => {
    const connections = controlledConnections();
    let oldEmit: Emit | undefined;
    mockedSse.mockImplementationOnce(async (_path, emit) => {
      oldEmit = emit;
      emit(...delta(1, 'A'));
      emit(...delta(2, 'B'));
      throw networkError();
    });
    const result = resume();
    await jest.advanceTimersByTimeAsync(500);
    oldEmit!(...delta(99, '过期事件'));
    connections[0]!.emit(...delta(3, 'C'));
    await jest.advanceTimersByTimeAsync(32);
    expect(useCoachStreamStore.getState().assistantContent).toBe('ABC');
    expect(useCoachStreamStore.getState().lastProcessedSequence).toBe(3);
    connections[0]!.emit(...done(4, 'ABC'));
    connections[0]!.close();
    await result;
  });

  it('刚启动就取消时不建立网络连接', async () => {
    controlledConnections();
    const result = resume().catch((err: unknown) => err);
    unsubscribeCoachChatStream();
    await expect(result).resolves.toMatchObject({ code: 'STREAM_UNSUBSCRIBED' });
    expect(mockedSse).not.toHaveBeenCalled();
  });
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
