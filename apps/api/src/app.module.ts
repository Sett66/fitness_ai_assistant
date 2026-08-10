import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { envValidationSchema } from './config/env.schema';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ObservabilityModule } from './infra/observability/observability.module';
import { GeoModule } from './infra/geo/geo.module';
import { FitnessQueueModule } from './infra/queue/fitness-queue.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { FoodsModule } from './modules/foods/foods.module';
import { UploadsModule } from './modules/media/uploads.module';
import { AiTasksModule } from './modules/ai-tasks/ai-tasks.module';
import { MealLogsModule } from './modules/meal-logs/meal-logs.module';
import { PlansModule } from './modules/plans/plans.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DomainModule } from './domain/domain.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              }
            : undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    ObservabilityModule,
    DomainModule,
    GeoModule,
    FitnessQueueModule,
    AuthModule,
    UsersModule,
    ExercisesModule,
    FoodsModule,
    UploadsModule,
    AiTasksModule,
    MealLogsModule,
    PlansModule,
    ConversationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
