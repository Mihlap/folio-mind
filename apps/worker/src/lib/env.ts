import { z } from 'zod';

const envSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DATABASE_URL: z.string(),

  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('ru-1'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  AI_PROVIDER: z.enum(['gigachat', 'yandex']).default('gigachat'),
  GIGACHAT_CREDENTIALS: z.string().optional(),
  GIGACHAT_SCOPE: z.string().default('GIGACHAT_API_PERS'),
  GIGACHAT_MODEL: z.string().default('GigaChat'),
  GIGACHAT_TIMEOUT: z.coerce.number().default(180),
  YANDEX_FOLDER_ID: z.string().optional(),
  YANDEX_IAM_TOKEN: z.string().optional(),
  YANDEX_MODEL: z.string().default('yandexgpt/latest'),
  PREVIEW_INITIAL_PAGES: z.coerce.number().int().min(1).default(15),
  PREVIEW_MAX_PAGES: z.coerce.number().int().min(1).default(200),
  PREVIEW_JOB_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(300_000),
  PREVIEW_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  AI_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(): WorkerEnv {
  return envSchema.parse(process.env);
}
