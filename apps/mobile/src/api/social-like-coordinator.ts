import type { LikeState, LikeWriteResponse } from '@fitness/shared';

export type LikeSync = {
  read: () => Promise<LikeState>;
  write: (likedByMe: boolean, expectedRevision: number) => Promise<LikeWriteResponse>;
  optimistic: (likedByMe: boolean) => void;
  confirmed: (state: LikeState) => void;
  failed: (error: unknown) => void;
  shouldRetry: (error: unknown) => boolean;
};

type Intent = { generation: number; likedByMe: boolean; sync: LikeSync };

/** 每个目标一个同步循环。新点击只替换目标；旧请求不能自行刷新版本后重试。 */
export class SocialLikeCoordinator {
  private readonly intents = new Map<string, Intent>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options = { timeoutMs: 15_000, retryMs: 1_000 }) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  isPending(key: string): boolean {
    return this.intents.has(key);
  }

  getTarget(key: string): boolean | undefined {
    return this.intents.get(key)?.likedByMe;
  }

  reset(): void {
    this.intents.clear();
    this.notify();
  }

  toggle(key: string, currentLikedByMe: boolean, sync: LikeSync): void {
    const existing = this.intents.get(key);
    const likedByMe = !(existing?.likedByMe ?? currentLikedByMe);
    if (existing) {
      existing.generation += 1;
      existing.likedByMe = likedByMe;
      existing.sync = sync;
    } else {
      this.intents.set(key, { generation: 1, likedByMe, sync });
    }
    sync.optimistic(likedByMe);
    this.notify();
    if (!existing) void this.drain(key, this.intents.get(key)!);
  }

  private async bounded<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('点赞同步超时')), this.options.timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async drain(key: string, intent: Intent): Promise<void> {
    let state: LikeState | undefined;
    let failures = 0;
    const active = () => this.intents.get(key) === intent;
    while (active()) {
      let generation = intent.generation;
      try {
        if (!state) state = await this.bounded(intent.sync.read());
        if (!active()) return;
        generation = intent.generation;
        const result = await this.bounded(intent.sync.write(intent.likedByMe, state.revision));
        if (!active()) return;
        state = result;
        failures = 0;
        if (generation !== intent.generation) continue;
        // 同态写入也必须推进版本，挡住仍在网络中的旧请求。
        if (!result.applied) continue;
        intent.sync.confirmed(result);
        this.intents.delete(key);
        this.notify();
        return;
      } catch (error) {
        if (!active()) return;
        state = undefined;
        if (generation !== intent.generation) continue;
        if (!intent.sync.shouldRetry(error)) {
          this.intents.delete(key);
          this.notify();
          intent.sync.failed(error);
          return;
        }
        failures += 1;
        await new Promise<void>((resolve) =>
          setTimeout(
            resolve,
            Math.min(this.options.retryMs * 2 ** Math.min(failures - 1, 4), 15_000),
          ),
        );
      }
    }
  }
}

export const postLikeCoordinator = new SocialLikeCoordinator();
export const commentLikeCoordinator = new SocialLikeCoordinator();

export function postLikeKey(postId: string): string {
  return postId;
}

export function commentLikeKey(postId: string, commentId: string): string {
  return `${postId}:${commentId}`;
}
