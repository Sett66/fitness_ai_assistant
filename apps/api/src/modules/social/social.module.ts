import { Module } from '@nestjs/common';

import { StorageModule } from '../../infra/storage/storage.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [StorageModule],
  controllers: [PostsController, CommentsController],
  providers: [PostsService, CommentsService],
  exports: [PostsService],
})
export class SocialModule {}
