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
  };
}
