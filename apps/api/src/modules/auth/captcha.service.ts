import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  CAPTCHA_BOARD_HEIGHT,
  CAPTCHA_BOARD_WIDTH,
  CAPTCHA_CHALLENGE_TTL_SEC,
  CAPTCHA_PIECE_SIZE,
  CAPTCHA_TOKEN_TTL_SEC,
  CAPTCHA_TOLERANCE_PX,
  errorMessagesZhCN,
} from '@fitness/shared';
import type { CaptchaChallengeResponse, CaptchaVerifyResponse } from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { RedisService } from '../../infra/redis/redis.service';

/** 可用的内置背景图数量（与移动端 captcha-assets 数量保持一致） */
const BG_COUNT = 4;

/** 缺口 X 取值范围，避免贴边导致无法拖动/太易对齐 */
const GAP_X_MIN = CAPTCHA_PIECE_SIZE + 10;
const GAP_X_MAX = CAPTCHA_BOARD_WIDTH - CAPTCHA_PIECE_SIZE - 10;

const GAP_Y_MIN = 10;
const GAP_Y_MAX = CAPTCHA_BOARD_HEIGHT - CAPTCHA_PIECE_SIZE - 10;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

@Injectable()
export class CaptchaService {
  constructor(private readonly redis: RedisService) {}

  private challengeKey(captchaId: string): string {
    return `auth:cap:chal:${captchaId}`;
  }

  private tokenKey(token: string): string {
    return `auth:cap:tok:${token}`;
  }

  async challenge(): Promise<CaptchaChallengeResponse> {
    const captchaId = randomUUID();
    const gapX = randInt(GAP_X_MIN, GAP_X_MAX);
    const gapY = randInt(GAP_Y_MIN, GAP_Y_MAX);
    const bgIndex = randInt(0, BG_COUNT - 1);

    await this.redis.setEx(this.challengeKey(captchaId), String(gapX), CAPTCHA_CHALLENGE_TTL_SEC);

    return {
      captchaId,
      bgIndex,
      gapX,
      gapY,
      boardWidth: CAPTCHA_BOARD_WIDTH,
      boardHeight: CAPTCHA_BOARD_HEIGHT,
      pieceSize: CAPTCHA_PIECE_SIZE,
    };
  }

  async verify(captchaId: string, x: number): Promise<CaptchaVerifyResponse> {
    const key = this.challengeKey(captchaId);
    const stored = await this.redis.get(key);
    if (stored === null) {
      throw new BizException('AUTH_CAPTCHA_EXPIRED', errorMessagesZhCN.AUTH_CAPTCHA_EXPIRED, 400);
    }
    // 挑战一次性消费，无论成功失败都失效，避免暴力尝试
    await this.redis.del(key);

    const gapX = Number(stored);
    if (Math.abs(x - gapX) > CAPTCHA_TOLERANCE_PX) {
      throw new BizException('AUTH_CAPTCHA_INVALID', errorMessagesZhCN.AUTH_CAPTCHA_INVALID, 400);
    }

    const captchaToken = randomUUID();
    await this.redis.setEx(this.tokenKey(captchaToken), '1', CAPTCHA_TOKEN_TTL_SEC);
    return { captchaToken };
  }

  /** 消费一次性 captchaToken；有效则删除并返回 true */
  async consumeToken(token: string): Promise<boolean> {
    const key = this.tokenKey(token);
    const exists = await this.redis.exists(key);
    if (!exists) return false;
    await this.redis.del(key);
    return true;
  }
}
