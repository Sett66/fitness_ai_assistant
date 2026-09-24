/** 跨组件共享的点赞意图 generation + 进行中计数（feed / 详情 / 评论列表共用） */

type LikeIntent = {
  generation: number;
  likedByMe: boolean;
};

export class SocialLikeCoordinator {
  private readonly intents = new Map<string, LikeIntent>();
  private readonly inFlight = new Map<string, number>();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** 记录本次点击的目标态，返回 generation 供请求携带 */
  registerIntent(key: string, likedByMe: boolean): number {
    const generation = (this.intents.get(key)?.generation ?? 0) + 1;
    this.intents.set(key, { generation, likedByMe });
    return generation;
  }

  isLatestIntent(key: string, generation: number): boolean {
    return this.intents.get(key)?.generation === generation;
  }

  incrementInFlight(key: string): void {
    this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
    this.notify();
  }

  decrementInFlight(key: string): void {
    const next = (this.inFlight.get(key) ?? 1) - 1;
    if (next <= 0) this.inFlight.delete(key);
    else this.inFlight.set(key, next);
    this.notify();
  }

  isPending(key: string): boolean {
    return (this.inFlight.get(key) ?? 0) > 0;
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
