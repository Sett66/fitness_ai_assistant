import { SocialLikeCoordinator, type LikeSync } from './social-like-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

function fixture() {
  let state = { revision: 0, likedByMe: false, likeCount: 0 };
  const apply = (likedByMe: boolean, revision: number) => {
    const applied = revision === state.revision;
    if (applied) state = { revision: revision + 1, likedByMe, likeCount: Number(likedByMe) };
    return { ...state, applied };
  };
  const sync: LikeSync = {
    read: jest.fn(async () => ({ ...state })),
    write: jest.fn(async (liked, revision) => apply(liked, revision)),
    optimistic: jest.fn(),
    confirmed: jest.fn(),
    failed: jest.fn(),
    shouldRetry: () => true,
  };
  const coordinator = new SocialLikeCoordinator({ timeoutMs: 100, retryMs: 10 });
  return { coordinator, sync, apply, state: () => state };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('读取版本前连点使用最新意图，不依赖尚未重渲染的 props', async () => {
  const { coordinator, sync, state } = fixture();
  coordinator.toggle('p', false, sync);
  coordinator.toggle('p', false, sync);
  expect(coordinator.getTarget('p')).toBe(false);
  await flush();
  expect(sync.write).toHaveBeenCalledTimes(1);
  expect(sync.write).toHaveBeenCalledWith(false, 0);
  expect(state()).toMatchObject({ revision: 1, likedByMe: false });
  expect(coordinator.isPending('p')).toBe(false);
});

it('旧点赞已提交但响应丢失，最新取消仍被提交并确认', async () => {
  const { coordinator, sync, apply, state } = fixture();
  jest.mocked(sync.write).mockImplementationOnce(async (liked, revision) => {
    apply(liked, revision);
    throw new Error('response lost');
  });
  coordinator.toggle('p', false, sync);
  await flush();
  expect(state().likedByMe).toBe(true);
  coordinator.toggle('p', true, sync);
  await jest.advanceTimersByTimeAsync(10);
  await flush();
  expect(state()).toMatchObject({ revision: 2, likedByMe: false });
  expect(sync.confirmed).toHaveBeenCalledTimes(1);
  expect(coordinator.isPending('p')).toBe(false);
});

it('旧请求超时后迟到，也不能覆盖已确认的最后一次取消', async () => {
  const { coordinator, sync, apply, state } = fixture();
  const slow = deferred<ReturnType<typeof apply>>();
  jest.mocked(sync.write).mockImplementationOnce(() => slow.promise);
  coordinator.toggle('p', false, sync);
  await flush();
  coordinator.toggle('p', true, sync);
  await jest.advanceTimersByTimeAsync(100);
  await flush();
  expect(state()).toMatchObject({ revision: 1, likedByMe: false });
  const old = apply(true, 0);
  expect(old.applied).toBe(false);
  slow.resolve(old);
  await flush();
  expect(state().likedByMe).toBe(false);
  expect(sync.confirmed).toHaveBeenCalledTimes(1);
});

it('最后一次请求失败后重试；冲突时使用返回版本提交最新目标', async () => {
  const { coordinator, sync, apply, state } = fixture();
  jest
    .mocked(sync.write)
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(async (liked, revision) => {
      apply(false, revision); // 另一个已在途操作先提交
      return apply(liked, revision);
    });
  coordinator.toggle('p', false, sync);
  await flush();
  expect(coordinator.isPending('p')).toBe(true);
  await jest.advanceTimersByTimeAsync(10);
  await flush();
  expect(state()).toMatchObject({ revision: 2, likedByMe: true });
  expect(sync.write).toHaveBeenCalledTimes(3);
});

it('跨组件共享同一同步循环，中间点击合并，旧成功不会刷新 UI', async () => {
  const { coordinator, sync, apply, state } = fixture();
  const slow = deferred<ReturnType<typeof apply>>();
  jest.mocked(sync.write).mockImplementationOnce(() => slow.promise);
  coordinator.toggle('p', false, sync);
  await flush();
  const other = { ...sync, confirmed: jest.fn() };
  coordinator.toggle('p', true, other);
  coordinator.toggle('p', false, other);
  coordinator.toggle('p', true, other);
  slow.resolve(apply(true, 0));
  await flush();
  expect(state().likedByMe).toBe(false);
  expect(sync.write).toHaveBeenCalledTimes(2);
  expect(sync.confirmed).not.toHaveBeenCalled();
  expect(other.confirmed).toHaveBeenCalledTimes(1);
});

it('明确拒绝会停止重试并提示；退出账号会停止旧循环和回调', async () => {
  const { coordinator, sync } = fixture();
  sync.shouldRetry = () => false;
  jest.mocked(sync.write).mockRejectedValueOnce(new Error('not found'));
  coordinator.toggle('p', false, sync);
  await flush();
  expect(sync.failed).toHaveBeenCalledTimes(1);
  expect(coordinator.isPending('p')).toBe(false);
  const pending = deferred<{ revision: number; likedByMe: boolean; likeCount: number }>();
  jest.mocked(sync.read).mockReturnValueOnce(pending.promise);
  coordinator.toggle('p', false, sync);
  coordinator.reset();
  pending.resolve({ revision: 0, likedByMe: false, likeCount: 0 });
  await flush();
  expect(sync.write).toHaveBeenCalledTimes(1);
  expect(sync.confirmed).not.toHaveBeenCalled();
});
