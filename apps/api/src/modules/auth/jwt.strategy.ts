import type { Role } from '@fitness/db';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type AccessJwtPayload = {
  sub: string;
  typ?: string;
  role: Role;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessJwtPayload): { userId: string; role: Role } {
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException();
    }

    return { userId: payload.sub, role: payload.role };
  }
}
