import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export type JwtUserPayload = {
  userId: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    const user = request.user;
    if (!user?.userId) {
      throw new Error('CurrentUser decorator used without JwtAuthGuard');
    }
    return user;
  },
);
