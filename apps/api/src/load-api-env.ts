import { config } from 'dotenv';
import { resolve } from 'node:path';

/** 固定从 apps/api/.env 加载，避免 monorepo 根目录 .env 中 localhost 覆盖 S3/DB 配置。 */
export function loadApiEnv(): void {
  config({ path: resolve(__dirname, '../.env'), override: true });
}
