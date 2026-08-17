import { Module } from '@nestjs/common';

import { SearchModule } from '../../infra/search/search.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SocialUsersService } from './social-users.service';
import { SocialUsersController } from './users.controller';

@Module({
  imports: [StorageModule, SearchModule],
  controllers: [PostsController, CommentsController, SearchController, SocialUsersController],
  providers: [PostsService, CommentsService, SearchService, SocialUsersService],
  exports: [PostsService],
})
export class SocialModule {}
