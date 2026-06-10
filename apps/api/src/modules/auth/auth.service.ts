import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { User } from '@fitness/db';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC, errorMessagesZhCN } from '@fitness/shared';
import type {
  AuthSuccessResponse,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  TokenPair,
} from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { PrismaService } from '../../infra/prisma/prisma.service';

const REFRESH_JWT_TYP = 'refresh' as const;

const ACCESS_JWT_TYP = 'access' as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterRequest): Promise<AuthSuccessResponse> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const user = await this.prisma.client.user.create({
      data: {
        phone: input.phone,
        passwordHash,
      },
    });

    const tokens = await this.issueTokensForNewSession(user.id);
    return { user: toUserResponse(user), tokens };
  }

  async login(input: LoginRequest): Promise<AuthSuccessResponse> {
    const user = await this.prisma.client.user.findFirst({
      where: { phone: input.phone, deletedAt: null },
    });
    if (!user) {
      throw new BizException(
        'AUTH_INVALID_CREDENTIALS',
        errorMessagesZhCN.AUTH_INVALID_CREDENTIALS,
        401,
      );
    }

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new BizException(
        'AUTH_INVALID_CREDENTIALS',
        errorMessagesZhCN.AUTH_INVALID_CREDENTIALS,
        401,
      );
    }

    const tokens = await this.issueTokensForNewSession(user.id);
    return { user: toUserResponse(user), tokens };
  }

  async refresh(body: RefreshRequest): Promise<TokenPair> {
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    let payload: { sid: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sid: string; typ?: string }>(body.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new BizException('AUTH_TOKEN_INVALID', errorMessagesZhCN.AUTH_TOKEN_INVALID, 401);
    }

    if (payload.typ !== REFRESH_JWT_TYP) {
      throw new BizException('AUTH_TOKEN_INVALID', errorMessagesZhCN.AUTH_TOKEN_INVALID, 401);
    }

    const session = await this.prisma.client.session.findFirst({
      where: { id: payload.sid },
    });
    if (!session || session.revokedAt) {
      throw new BizException('AUTH_REFRESH_REVOKED', errorMessagesZhCN.AUTH_REFRESH_REVOKED, 401);
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new BizException('AUTH_TOKEN_EXPIRED', errorMessagesZhCN.AUTH_TOKEN_EXPIRED, 401);
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: session.userId, deletedAt: null },
    });
    if (!user) {
      throw new BizException('USER_NOT_FOUND', errorMessagesZhCN.USER_NOT_FOUND, 404);
    }

    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      refreshToken: body.refreshToken,
      expiresInSec: ACCESS_TOKEN_TTL_SEC,
    };
  }

  async logout(body: RefreshRequest): Promise<{ ok: true }> {
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    let payload: { sid: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sid: string; typ?: string }>(body.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new BizException('AUTH_TOKEN_INVALID', errorMessagesZhCN.AUTH_TOKEN_INVALID, 401);
    }
    if (payload.typ !== REFRESH_JWT_TYP) {
      throw new BizException('AUTH_TOKEN_INVALID', errorMessagesZhCN.AUTH_TOKEN_INVALID, 401);
    }

    await this.prisma.client.session.updateMany({
      where: { id: payload.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  private async issueTokensForNewSession(userId: string): Promise<TokenPair> {
    const session = await this.prisma.client.session.create({
      data: {
        userId,
        refreshTokenHash: 'jwt-refresh',
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
      },
    });

    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });

    const accessToken = await this.signAccessToken(user);
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const refreshToken = await this.jwt.signAsync(
      { sid: session.id, typ: REFRESH_JWT_TYP },
      { secret: refreshSecret, expiresIn: REFRESH_TOKEN_TTL_SEC },
    );

    return {
      accessToken,
      refreshToken,
      expiresInSec: ACCESS_TOKEN_TTL_SEC,
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      typ: ACCESS_JWT_TYP,
      role: user.role,
    });
  }
}

function toUserResponse(user: User): AuthSuccessResponse['user'] {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarMediaId: user.avatarMediaId,
    role: user.role as AuthSuccessResponse['user']['role'],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt ?? undefined,
  };
}
