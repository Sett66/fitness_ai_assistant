import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ACCESS_TOKEN_TTL_SEC } from '@fitness/shared';

import { PrismaModule } from '../../infra/prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { JwtStrategy } from './jwt.strategy';
import { SMS_SENDER, DevSmsSender } from './sms-sender';
import { SmsService } from './sms.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SEC },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    CaptchaService,
    SmsService,
    { provide: SMS_SENDER, useClass: DevSmsSender },
  ],
})
export class AuthModule {}
