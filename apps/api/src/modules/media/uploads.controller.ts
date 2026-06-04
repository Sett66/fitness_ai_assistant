import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { type UploadsService } from './uploads.service';

@ApiTags('media')
@ApiBearerAuth('access-token')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('sign')
  presign(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.uploads.presign(user, body);
  }

  @Post('complete')
  complete(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.uploads.complete(user, body);
  }
}
