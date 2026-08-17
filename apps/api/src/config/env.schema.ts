import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  S3_ENDPOINT: Joi.string().required(),
  S3_REGION: Joi.string().required(),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
  S3_PUBLIC_ENDPOINT: Joi.string().optional().allow('', null),
  COACH_AGENT_ENABLED: Joi.string().valid('true', 'false').default('false'),
  SOCIAL_MODERATION_ENABLED: Joi.string().valid('true', 'false').default('true'),
  LANGFUSE_ENABLED: Joi.string().valid('true', 'false').default('false'),
  LANGFUSE_PUBLIC_KEY: Joi.when('LANGFUSE_ENABLED', {
    is: 'true',
    then: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().optional().allow('', null),
      otherwise: Joi.string().required(),
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),
  LANGFUSE_SECRET_KEY: Joi.when('LANGFUSE_ENABLED', {
    is: 'true',
    then: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().optional().allow('', null),
      otherwise: Joi.string().required(),
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),
  LANGFUSE_BASE_URL: Joi.string().uri().default('https://cloud.langfuse.com'),
  LANGFUSE_SAMPLE_RATE: Joi.number().min(0).max(1).default(1),
  AMAP_WEB_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow('', null),
  }),
  AMAP_WEB_SECRET: Joi.string().optional().allow('', null),
  OPEN_METEO_BASE_URL: Joi.string().uri().optional().allow('', null),
  SMS_PROVIDER: Joi.string().valid('dev', 'aliyun', 'tencent').default('dev'),
  SMS_DEV_FIXED_CODE: Joi.string()
    .pattern(/^\d{6}$/)
    .default('123456'),
  SEARCH_PROVIDER: Joi.string().valid('meili', 'pg').default('meili'),
  MEILI_HOST: Joi.when('SEARCH_PROVIDER', {
    is: 'meili',
    then: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().optional().allow('', null),
      otherwise: Joi.string().uri().required(),
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),
  MEILI_MASTER_KEY: Joi.when('SEARCH_PROVIDER', {
    is: 'meili',
    then: Joi.when('NODE_ENV', {
      is: 'test',
      then: Joi.string().optional().allow('', null),
      otherwise: Joi.string().required(),
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),
  MEILI_INDEX_PREFIX: Joi.string().default('fitness'),
});

export type EnvShape = {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_BUCKET: string;
  S3_FORCE_PATH_STYLE: boolean;
  S3_PUBLIC_ENDPOINT?: string;
  COACH_AGENT_ENABLED: 'true' | 'false';
  SOCIAL_MODERATION_ENABLED: 'true' | 'false';
  LANGFUSE_ENABLED: 'true' | 'false';
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL: string;
  LANGFUSE_SAMPLE_RATE: number;
  AMAP_WEB_KEY?: string;
  AMAP_WEB_SECRET?: string;
  OPEN_METEO_BASE_URL?: string;
  SMS_PROVIDER: 'dev' | 'aliyun' | 'tencent';
  SMS_DEV_FIXED_CODE: string;
  SEARCH_PROVIDER: 'meili' | 'pg';
  MEILI_HOST?: string;
  MEILI_MASTER_KEY?: string;
  MEILI_INDEX_PREFIX: string;
};

function parseOptionalUrl(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  return value;
}

export function mapEnv(env: NodeJS.ProcessEnv): EnvShape {
  const forceRaw = env.S3_FORCE_PATH_STYLE ?? 'true';
  return {
    NODE_ENV: (env.NODE_ENV as EnvShape['NODE_ENV']) ?? 'development',
    PORT: env.PORT ? Number(env.PORT) : 3000,
    DATABASE_URL: env.DATABASE_URL ?? '',
    REDIS_URL: env.REDIS_URL ?? '',
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? '',
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET ?? '',
    S3_ENDPOINT: env.S3_ENDPOINT ?? '',
    S3_REGION: env.S3_REGION ?? '',
    S3_ACCESS_KEY: env.S3_ACCESS_KEY ?? '',
    S3_SECRET_KEY: env.S3_SECRET_KEY ?? '',
    S3_BUCKET: env.S3_BUCKET ?? '',
    S3_FORCE_PATH_STYLE: forceRaw === 'true',
    S3_PUBLIC_ENDPOINT: parseOptionalUrl(env.S3_PUBLIC_ENDPOINT),
    COACH_AGENT_ENABLED: env.COACH_AGENT_ENABLED === 'true' ? 'true' : 'false',
    SOCIAL_MODERATION_ENABLED: env.SOCIAL_MODERATION_ENABLED === 'false' ? 'false' : 'true',
    LANGFUSE_ENABLED: env.LANGFUSE_ENABLED === 'true' ? 'true' : 'false',
    LANGFUSE_PUBLIC_KEY: parseOptionalUrl(env.LANGFUSE_PUBLIC_KEY),
    LANGFUSE_SECRET_KEY: parseOptionalUrl(env.LANGFUSE_SECRET_KEY),
    LANGFUSE_BASE_URL: env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
    LANGFUSE_SAMPLE_RATE: env.LANGFUSE_SAMPLE_RATE ? Number(env.LANGFUSE_SAMPLE_RATE) : 1,
    AMAP_WEB_KEY: parseOptionalUrl(env.AMAP_WEB_KEY),
    AMAP_WEB_SECRET: parseOptionalUrl(env.AMAP_WEB_SECRET),
    OPEN_METEO_BASE_URL: parseOptionalUrl(env.OPEN_METEO_BASE_URL),
    SMS_PROVIDER: (env.SMS_PROVIDER as EnvShape['SMS_PROVIDER']) ?? 'dev',
    SMS_DEV_FIXED_CODE: env.SMS_DEV_FIXED_CODE ?? '123456',
    SEARCH_PROVIDER: env.SEARCH_PROVIDER === 'pg' ? 'pg' : 'meili',
    MEILI_HOST: parseOptionalUrl(env.MEILI_HOST),
    MEILI_MASTER_KEY: parseOptionalUrl(env.MEILI_MASTER_KEY),
    MEILI_INDEX_PREFIX: env.MEILI_INDEX_PREFIX?.trim() || 'fitness',
  };
}
