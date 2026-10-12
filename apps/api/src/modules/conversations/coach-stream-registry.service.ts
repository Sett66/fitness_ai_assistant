import { Injectable } from '@nestjs/common';

import { RedisService } from '../../infra/redis/redis.service';

export type CoachStreamEventName =
  | 'delta'
  | 'tool_start'
  | 'tool_end'
  | 'done'
  | 'cancelled'
  | 'error';
export type CoachStreamEvent = { event: CoachStreamEventName; data: Record<string, unknown> };

const ACTIVE_TTL_SECONDS = 5 * 60;
const TERMINAL_TTL_SECONDS = 3 * 60;
const APPEND_EVENT_LUA = `
local sequence = redis.call('INCR', KEYS[1])
if ARGV[1] == 'delta' and redis.call('XLEN', KEYS[2]) >= 1999 then
  redis.call('DECR', KEYS[1])
  return 0
end
redis.call('XADD', KEYS[2], tostring(sequence) .. '-0', 'event', ARGV[1], 'data', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return sequence
`;

@Injectable()
export class CoachStreamRegistryService {
  constructor(private readonly redis: RedisService) {}

  async assertAvailable(): Promise<void> {
    await this.redis.client.ping();
  }

  async initialize(streamId: string): Promise<void> {
    await this.assertAvailable();
    const keys = this.keys(streamId);
    await this.redis.client.del(keys.sequence, keys.events);
    await this.redis.client.set(keys.sequence, '0', 'EX', ACTIVE_TTL_SECONDS);
  }

  async publish(
    streamId: string,
    event: CoachStreamEventName,
    data: Record<string, unknown>,
  ): Promise<CoachStreamEvent | null> {
    const terminal = event === 'done' || event === 'cancelled' || event === 'error';
    const keys = this.keys(streamId);
    const sequence = Number(
      await this.redis.client.eval(
        APPEND_EVENT_LUA,
        2,
        keys.sequence,
        keys.events,
        event,
        JSON.stringify(data),
        terminal ? TERMINAL_TTL_SECONDS : ACTIVE_TTL_SECONDS,
      ),
    );
    if (sequence === 0) return null;
    return { event, data: { ...data, sequence } };
  }

  async readAfter(streamId: string, afterSequence: number): Promise<CoachStreamEvent[]> {
    const rows = await this.redis.client.xrange(
      this.keys(streamId).events,
      `(${afterSequence}-0`,
      '+',
      'COUNT',
      2000,
    );
    return rows.map(([id, fields]) => {
      const values = this.toRecord(fields);
      return {
        event: values.event as CoachStreamEventName,
        data: {
          ...(JSON.parse(values.data ?? '{}') as Record<string, unknown>),
          sequence: Number(id.split('-', 1)[0]),
        },
      };
    });
  }

  async hasEvents(streamId: string): Promise<boolean> {
    return (await this.redis.client.exists(this.keys(streamId).events)) === 1;
  }

  async hasSequence(streamId: string): Promise<boolean> {
    return (await this.redis.client.exists(this.keys(streamId).sequence)) === 1;
  }

  async lastSequence(streamId: string): Promise<number> {
    return Number((await this.redis.client.get(this.keys(streamId).sequence)) ?? '0');
  }

  async waitForEvents(milliseconds = 200): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  async shortenRetention(streamId: string): Promise<void> {
    const keys = this.keys(streamId);
    await this.redis.client.expire(keys.sequence, TERMINAL_TTL_SECONDS);
    await this.redis.client.expire(keys.events, TERMINAL_TTL_SECONDS);
  }

  async delete(streamId: string): Promise<void> {
    const keys = this.keys(streamId);
    await this.redis.client.del(keys.sequence, keys.events);
  }

  private keys(streamId: string): { sequence: string; events: string } {
    const prefix = `coach:message-stream:${streamId}`;
    return { sequence: `${prefix}:sequence`, events: `${prefix}:events` };
  }

  private toRecord(fields: string[]): Record<string, string> {
    const record: Record<string, string> = {};
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const key = fields[index];
      const value = fields[index + 1];
      if (key && value !== undefined) record[key] = value;
    }
    return record;
  }
}
