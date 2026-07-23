import { z } from 'zod';
const envSchema = z.object({
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  DATABASE_URL: z.string(),
  GOTENBERG_URL: z.string().default('http://127.0.0.1:3003'),
  PDF_TO_DOCX_URL: z.string().default('http://127.0.0.1:8080'),
  PDF_TO_DOCX_TIMEOUT_MS: z.coerce.number().int().min(30_000).default(600_000),
  PRECONVERT_MAX_PDF_MB: z.coerce.number().int().min(0).default(45),
  JODCONVERTER_URL: z.string().optional(),
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
  AI_CHAT_MODE: z.enum(['auto', 'rag', 'full']).default('auto'),
  GIGACHAT_CREDENTIALS: z.string().optional(),
  GIGACHAT_SCOPE: z.string().default('GIGACHAT_API_PERS'),
  GIGACHAT_MODEL: z.string().default('GigaChat'),
  GIGACHAT_TIMEOUT: z.coerce.number().default(180),
  YANDEX_FOLDER_ID: z.string().optional(),
  YANDEX_IAM_TOKEN: z.string().optional(),
  YANDEX_MODEL: z.string().default('yandexgpt/latest'),
  PREVIEW_INITIAL_PAGES: z.coerce.number().int().min(1).default(15),
  PREVIEW_MAX_PAGES: z.coerce.number().int().min(1).default(200),
  PREVIEW_VIEW_WIDTH: z.coerce.number().int().min(400).max(4096).default(1440),
  PREVIEW_JOB_TIMEOUT_MS: z.coerce.number().int().min(10000).default(300000),
  PREVIEW_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  OPTIMIZE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  AI_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
});
export type WorkerEnv = z.infer<typeof envSchema>;
export function loadWorkerEnv(): WorkerEnv {
  return envSchema.parse(process.env);
}
