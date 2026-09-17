import { z } from 'zod';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('ru-1'),
  S3_PUBLIC_URL: z.string().url().optional(),
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
  AI_TENANT_DAILY_REQUESTS: z.coerce.number().int().min(1).default(100),
  PREVIEW_INITIAL_PAGES: z.coerce.number().int().min(1).default(15),
  PREVIEW_MAX_PAGES: z.coerce.number().int().min(1).default(200),
  PREVIEW_THUMB_BATCH: z.coerce.number().int().min(1).default(20),
  PREVIEW_JOB_TIMEOUT_MS: z.coerce.number().int().min(10000).default(300000),
  AI_JOB_TIMEOUT_MS: z.coerce.number().int().min(10000).default(180000),
  GOTENBERG_URL: z.string().url().optional(),
  PDF_TO_DOCX_URL: z.string().url().optional(),
  QUEUE_WARN_WAITING: z.coerce.number().int().min(1).default(50),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  API_PUBLIC_URL: z.string().url().optional(),

  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(30),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),
  MAGIC_LINK_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  SKIP_EMAIL_MX_CHECK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  YANDEX_OAUTH_CLIENT_ID: z.string().optional(),
  YANDEX_OAUTH_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),  
  SMTP_FROM: z.string().optional(), 
  SMTP_FROM_NAME: z.string().optional(),
  GUEST_COMMENT_WEBHOOK_URL: z.string().url().optional(),
  GUEST_COMMENT_TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  GUEST_COMMENT_TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  SMS_PROVIDER: z.enum(['console', 'dummy']).default('console'),
  SMS_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  ESIA_CLIENT_ID: z.string().optional(),
  ESIA_CLIENT_SECRET: z.string().optional(),
  ESIA_REDIRECT_URI: z.string().optional(),
  MEDIA_MAX_FILE_BYTES: z.coerce.number().int().positive().optional(),
  MEDIA_TENANT_QUOTA_BYTES: z.coerce.number().int().positive().optional(),
  MEDIA_MAX_PIXEL_SIDE: z.coerce.number().int().positive().optional(),
});
export type Env = z.infer<typeof envSchema>;
export function loadEnv(): Env {
  return envSchema.parse(process.env);
}
