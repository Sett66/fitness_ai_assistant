import { Module } from '@nestjs/common';

import { GeoModule } from '../../infra/geo/geo.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { StorageModule } from '../../infra/storage/storage.module';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule, StorageModule, GeoModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
