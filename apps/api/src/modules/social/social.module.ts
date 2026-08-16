import { Module } from '@nestjs/common';

import { StorageModule } from '../../infra/storage/storage.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [StorageModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class SocialModule {}
