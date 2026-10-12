import {
  CoachStreamFaultInjector,
  createCoachStreamFaultInjector,
  parseCoachStreamFault,
} from '../src/modules/conversations/coach-stream-fault';

describe('parseCoachStreamFault', () => {
  it('解析数值与开关项，忽略非法值', () => {
    expect(
      parseCoachStreamFault(
        'dropAfter:5, skipDelta:4,deltaDelay:-1,dropBeforeTerminal,unknown:3',
        'development',
      ),
    ).toEqual({ dropAfter: 5, skipDelta: 4, dropBeforeTerminal: true });
  });

  it('生产环境始终关闭', () => {
    expect(parseCoachStreamFault('dropAfter:5,wipeOnTerminal', 'production')).toBeNull();
  });

  it('未配置或全部无效时关闭', () => {
    expect(parseCoachStreamFault(undefined, 'development')).toBeNull();
    expect(parseCoachStreamFault('dropAfter:abc', 'development')).toBeNull();
  });
});

describe('CoachStreamFaultInjector', () => {
  const noop = () => undefined;

  it('dropAfter：本连接写满 N 个事件后断开', () => {
    const injector = new CoachStreamFaultInjector({ dropAfter: 2 }, noop);
    expect(injector.beforeWrite('s1', 'delta', 1, 0)).toBe('write');
    expect(injector.beforeWrite('s1', 'delta', 2, 1)).toBe('write');
    expect(injector.beforeWrite('s1', 'delta', 3, 2)).toBe('drop');
  });

  it('skipDelta：仅跳过序号为 K 倍数的 delta', () => {
    const injector = new CoachStreamFaultInjector({ skipDelta: 3 }, noop);
    expect(injector.beforeWrite('s1', 'delta', 3, 0)).toBe('skip');
    expect(injector.beforeWrite('s1', 'delta', 4, 0)).toBe('write');
    expect(injector.beforeWrite('s1', 'tool_start', 6, 0)).toBe('write');
  });

  it('dropBeforeTerminal：每个流只在首次终态前断开一次，可选删除 Redis', () => {
    const injector = new CoachStreamFaultInjector(
      { dropBeforeTerminal: true, wipeOnTerminal: true },
      noop,
    );
    expect(injector.beforeWrite('s1', 'done', 9, 0)).toBe('dropAndWipe');
    expect(injector.beforeWrite('s1', 'done', 9, 0)).toBe('write');
    expect(injector.beforeWrite('s2', 'cancelled', 4, 0)).toBe('dropAndWipe');
  });

  it('开启时打启动日志，生产环境不创建', () => {
    const warn = jest.fn();
    expect(createCoachStreamFaultInjector('dropAfter:3', 'development', { warn })).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('故障注入已开启'));
    expect(createCoachStreamFaultInjector('dropAfter:3', 'production', { warn })).toBeNull();
  });
});
