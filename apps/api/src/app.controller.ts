import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from './common/decorators/public.decorator';

@ApiTags('meta')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }

  /** 便于客户端探活：`GET /v1` */
  @Public()
  @Get()
  root(): Readonly<{ service: string; version: string }> {
    return { service: 'fitness-api', version: '0.0.0-m2' } as const;
  }
}
