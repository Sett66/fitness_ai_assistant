import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

/**
 * 轻量 Redis 封装，用于滑块挑战 / 短信验证码等短期状态存储。
 * 与 BullMQ 的连接分开，避免相互影响。
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: IORedis;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('REDIS_URL');
    this.client = new IORedis(url, { maxRetriesPerRequest: null });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** 写入并设置过期（秒） */
  async setEx(key: string, value: string, ttlSec: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSec);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /** 原子自增，并在首次写入时设置 TTL；返回自增后的值 */
  async incrWithTtl(key: string, ttlSec: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) {
      await this.client.expire(key, ttlSec);
    }
    return value;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
