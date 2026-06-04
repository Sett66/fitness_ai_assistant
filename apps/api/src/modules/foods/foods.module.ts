import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infra/prisma/prisma.module';

import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';

@Module({
  imports: [PrismaModule],
  controllers: [FoodsController],
  providers: [FoodsService],
})
export class FoodsModule {}
