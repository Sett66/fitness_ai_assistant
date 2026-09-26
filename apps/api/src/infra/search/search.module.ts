import { Inject, Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { MeiliSearchProvider } from './meili-search.provider';
import { MemorySearchProvider } from './memory-search.provider';
import { PgSearchProvider } from './pg-search.provider';
import { SEARCH_PROVIDER, type SearchProvider } from './search-provider';

@Injectable()
class SearchInitService implements OnModuleInit {
  private readonly logger = new Logger('SearchModule');

  constructor(
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MemorySearchProvider) private readonly memories: MemorySearchProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.provider.init();
    if (this.provider.name === 'meili') {
      await this.memories.init();
      const host = this.config.get<string>('MEILI_HOST') ?? '';
      const prefix = this.config.get<string>('MEILI_INDEX_PREFIX') ?? 'fitness';
      this.logger.log(`检索实现：meili（${host}，索引前缀 ${prefix}）`);
      return;
    }
    this.logger.log('检索实现：pg');
  }
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SEARCH_PROVIDER,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService): SearchProvider => {
        const name = config.get<string>('SEARCH_PROVIDER') ?? 'meili';
        if (name === 'pg') {
          return new PgSearchProvider(prisma);
        }
        return new MeiliSearchProvider(
          config.get<string>('MEILI_HOST') ?? '',
          config.get<string>('MEILI_MASTER_KEY') ?? '',
          config.get<string>('MEILI_INDEX_PREFIX') ?? 'fitness',
        );
      },
    },
    SearchInitService,
    {
      provide: MemorySearchProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new MemorySearchProvider(
          config.get<string>('MEILI_HOST') ?? '',
          config.get<string>('MEILI_MASTER_KEY') ?? '',
          config.get<string>('MEILI_INDEX_PREFIX') ?? 'fitness',
        ),
    },
  ],
  exports: [SEARCH_PROVIDER, MemorySearchProvider],
})
export class SearchModule {}
