import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * 環境変数スキーマ定義
 * zodによる型安全なバリデーション
 */
const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .optional()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val < 65536, {
      message: 'PORT must be between 1 and 65535',
    }),

  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),

  // Database
  DATABASE_URL: z.string().url().optional(),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // Frontend
  FRONTEND_URL: z.string().url().optional().default('http://localhost:5173'),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .optional()
    .default('info'),

  // Railway
  RAILWAY_ENVIRONMENT: z.string().optional(),
  RAILWAY_SERVICE_NAME: z.string().optional(),

  // CI
  CI: z.string().optional(),
});

/**
 * 環境変数の型（zodスキーマから推論）
 */
export type Env = z.infer<typeof envSchema>;

/**
 * 検証済み環境変数
 */
let validatedEnv: Env | null = null;

/**
 * 環境変数を検証して取得
 * アプリケーション起動時に一度だけ実行すべき
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    validatedEnv = envSchema.parse(process.env);
    logger.info({ env: validatedEnv.NODE_ENV }, 'Environment variables validated successfully');
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ errors: error.issues }, 'Environment validation failed');
      console.error('Environment validation errors:');
      error.issues.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    throw new Error('Failed to validate environment variables');
  }
}

/**
 * 検証済み環境変数を取得（すでに検証済みである必要がある）
 */
export function getEnv(): Env {
  if (!validatedEnv) {
    throw new Error('Environment not validated. Call validateEnv() first.');
  }
  return validatedEnv;
}
