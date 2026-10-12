/**
 * 仅开发环境：Coach SSE 弱网故障注入，用于手测补播 / 重连 / 终态校正。
 * `COACH_STREAM_FAULT=dropAfter:5,skipDelta:4,deltaDelay:150,dropBeforeTerminal,wipeOnTerminal`
 */
export type CoachStreamFault = {
  /** 每条订阅连接写出 N 个业务事件后主动断开 */
  dropAfter?: number;
  /** 不向客户端写出序号为 K 的倍数的 delta（模拟丢包，靠终态 finalText 校正） */
  skipDelta?: number;
  /** 每个模型 delta 额外延迟（毫秒），放慢生成以便测取消 / 切后台 */
  deltaDelay?: number;
  /** 每个流第一次要写终态事件时改为断开，迫使客户端重连后补到终态 */
  dropBeforeTerminal?: boolean;
  /** 终态写入后立即删除 Redis 事件，迫使重连走数据库合成终态 */
  wipeOnTerminal?: boolean;
};

const NUMERIC_KEYS = ['dropAfter', 'skipDelta', 'deltaDelay'] as const;
const FLAG_KEYS = ['dropBeforeTerminal', 'wipeOnTerminal'] as const;

export function parseCoachStreamFault(
  raw: string | undefined,
  nodeEnv: string | undefined,
): CoachStreamFault | null {
  if (!raw?.trim() || nodeEnv === 'production') return null;
  const fault: CoachStreamFault = {};
  for (const part of raw.split(',')) {
    const [name, value] = part.split(':').map((item) => item.trim());
    if ((NUMERIC_KEYS as readonly string[]).includes(name ?? '')) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        fault[name as (typeof NUMERIC_KEYS)[number]] = parsed;
      }
    } else if ((FLAG_KEYS as readonly string[]).includes(name ?? '')) {
      fault[name as (typeof FLAG_KEYS)[number]] = true;
    }
  }
  return Object.keys(fault).length > 0 ? fault : null;
}

export type CoachStreamFaultDecision = 'write' | 'skip' | 'drop' | 'dropAndWipe';

const TERMINAL_EVENTS = new Set(['done', 'cancelled', 'error']);
const MAX_TRACKED_STREAMS = 500;

export class CoachStreamFaultInjector {
  private readonly terminalDropped = new Set<string>();

  constructor(
    readonly fault: CoachStreamFault,
    private readonly log: (message: string) => void,
  ) {}

  async delayDelta(): Promise<void> {
    if (!this.fault.deltaDelay) return;
    await new Promise<void>((resolve) => setTimeout(resolve, this.fault.deltaDelay));
  }

  /** 订阅连接写出事件前调用；writtenOnConnection 为本连接已写出的业务事件数 */
  beforeWrite(
    streamId: string,
    event: string,
    sequence: number,
    writtenOnConnection: number,
  ): CoachStreamFaultDecision {
    if (
      TERMINAL_EVENTS.has(event) &&
      this.fault.dropBeforeTerminal &&
      !this.terminalDropped.has(streamId)
    ) {
      if (this.terminalDropped.size >= MAX_TRACKED_STREAMS) this.terminalDropped.clear();
      this.terminalDropped.add(streamId);
      const wipe = this.fault.wipeOnTerminal === true;
      this.log(
        `[fault] ${streamId} 终态 ${event}#${sequence} 前断开${wipe ? '，并删除 Redis 事件' : ''}`,
      );
      return wipe ? 'dropAndWipe' : 'drop';
    }
    if (event === 'delta' && this.fault.skipDelta && sequence % this.fault.skipDelta === 0) {
      this.log(`[fault] ${streamId} 跳过 delta#${sequence}`);
      return 'skip';
    }
    if (this.fault.dropAfter && writtenOnConnection >= this.fault.dropAfter) {
      this.log(
        `[fault] ${streamId} 已写出 ${writtenOnConnection} 个事件，在 ${event}#${sequence} 前断开`,
      );
      return 'drop';
    }
    return 'write';
  }
}

export function createCoachStreamFaultInjector(
  raw: string | undefined,
  nodeEnv: string | undefined,
  logger: { warn: (message: string) => void },
): CoachStreamFaultInjector | null {
  const fault = parseCoachStreamFault(raw, nodeEnv);
  if (!fault) return null;
  logger.warn(`Coach SSE 故障注入已开启: ${JSON.stringify(fault)}`);
  return new CoachStreamFaultInjector(fault, (message) => logger.warn(message));
}
