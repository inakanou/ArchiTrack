import { z } from 'zod';
import logger from '../utils/logger.js';

/**
 * 環境変数検証用の定数
 */
const JWT_KEY_TYPE = 'OKP' as const;
const JWT_CURVE = 'Ed25519' as const;
const TWO_FACTOR_KEY_LENGTH = 64 as const;
const PORT_MIN = 1 as const;
const PORT_MAX = 65535 as const;

/**
 * 機密情報としてマスキングする環境変数のパターン
 * セキュリティベストプラクティス: 機密情報をログに出力しない
 */
const SENSITIVE_ENV_PATTERNS = [
  /^JWT_/i,
  /^TWO_FACTOR_/i,
  /PASSWORD/i,
  /SECRET/i,
  /TOKEN/i,
  /KEY/i,
  /CREDENTIAL/i,
  /AUTH/i,
  /DSN/i,
  /DATABASE_URL/i,
  /REDIS_URL/i,
] as const;

/**
 * 環境変数の値をマスキング
 * @param key 環境変数名
 * @param value 環境変数の値
 * @returns マスキングされた値または元の値
 */
function maskSensitiveValue(key: string, value: string | number | undefined): string {
  if (value === undefined) {
    return '[not set]';
  }

  const stringValue = String(value);

  // 機密情報かどうかをパターンマッチでチェック
  const isSensitive = SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key));

  if (isSensitive) {
    // 値の長さに応じたマスキング（存在確認のため先頭と末尾を一部表示）
    if (stringValue.length <= 8) {
      return '[REDACTED]';
    }
    return `${stringValue.substring(0, 3)}...[REDACTED]...${stringValue.substring(stringValue.length - 3)}`;
  }

  return stringValue;
}

/**
 * 環境変数スキーマ定義
 * zodによる型安全なバリデーション
 */
const envSchema = z
  .object({
    // Server
    PORT: z
      .string()
      .optional()
      .default('3000')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= PORT_MIN && val <= PORT_MAX, {
        message: `PORT must be between ${PORT_MIN} and ${PORT_MAX}`,
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

    // Authentication (REQUIRED for application to function)
    JWT_PUBLIC_KEY: z
      .string()
      .min(1, 'JWT_PUBLIC_KEY is required for authentication')
      .refine(
        (val) => {
          try {
            // Base64デコードしてJWK形式かチェック
            const jwk = JSON.parse(Buffer.from(val, 'base64').toString());
            return jwk.kty === JWT_KEY_TYPE && jwk.crv === JWT_CURVE;
          } catch {
            return false;
          }
        },
        { message: `JWT_PUBLIC_KEY must be a valid Base64-encoded ${JWT_CURVE} JWK` }
      ),

    JWT_PRIVATE_KEY: z
      .string()
      .min(1, 'JWT_PRIVATE_KEY is required for authentication')
      .refine(
        (val) => {
          try {
            // Base64デコードしてJWK形式かチェック
            const jwk = JSON.parse(Buffer.from(val, 'base64').toString());
            return jwk.kty === JWT_KEY_TYPE && jwk.crv === JWT_CURVE && 'd' in jwk;
          } catch {
            return false;
          }
        },
        {
          message: `JWT_PRIVATE_KEY must be a valid Base64-encoded ${JWT_CURVE} JWK with private key`,
        }
      ),

    // JWT Key Rotation Support (OPTIONAL)
    // 旧公開鍵：キーローテーション時に、古い鍵で署名されたトークンの検証に使用
    JWT_PUBLIC_KEY_OLD: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true; // オプショナルなので未定義はOK
          try {
            // Base64デコードしてJWK形式かチェック
            const jwk = JSON.parse(Buffer.from(val, 'base64').toString());
            return jwk.kty === JWT_KEY_TYPE && jwk.crv === JWT_CURVE;
          } catch {
            return false;
          }
        },
        { message: `JWT_PUBLIC_KEY_OLD must be a valid Base64-encoded ${JWT_CURVE} JWK` }
      ),

    // Two-Factor Authentication
    TWO_FACTOR_ENCRYPTION_KEY: z
      .string()
      .min(1, 'TWO_FACTOR_ENCRYPTION_KEY is required for 2FA functionality')
      .regex(
        new RegExp(`^[0-9a-f]{${TWO_FACTOR_KEY_LENGTH}}$`, 'i'),
        `TWO_FACTOR_ENCRYPTION_KEY must be exactly ${TWO_FACTOR_KEY_LENGTH} hex characters`
      ),
  })
  .refine(
    (data) => {
      // production環境では DATABASE_URL と REDIS_URL が必須
      if (data.NODE_ENV === 'production') {
        if (!data.DATABASE_URL) {
          return false;
        }
        if (!data.REDIS_URL) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        'DATABASE_URL and REDIS_URL are required in production environment. ' +
        'In test/development environments, these are provided by Docker Compose.',
    }
  );

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
    logger.info(
      {
        env: validatedEnv.NODE_ENV,
        port: validatedEnv.PORT,
        hasDatabase: !!validatedEnv.DATABASE_URL,
        hasRedis: !!validatedEnv.REDIS_URL,
      },
      'Environment variables validated successfully'
    );

    // LOG_LEVELがdebugまたはtraceの場合、全環境変数をログ出力
    // セキュリティ: 機密情報はマスキング、本番環境でも安全に使用可能
    if (validatedEnv.LOG_LEVEL === 'debug' || validatedEnv.LOG_LEVEL === 'trace') {
      logAllEnvironmentVariables(validatedEnv);
    }

    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ errors: error.issues }, 'Environment validation failed');
      console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ Environment Validation Failed');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.error('The following environment variables have issues:\n');

      error.issues.forEach((err) => {
        const path = err.path.join('.') || 'schema';
        console.error(`  ❌ ${path}`);
        console.error(`     Issue: ${err.message}`);

        // 修正方法のヒントを提供
        if (path === 'JWT_PUBLIC_KEY' || path === 'JWT_PRIVATE_KEY') {
          console.error(
            '     Fix: Run "npm run generate-keys" in the backend directory to generate new JWT keys'
          );
        } else if (path === 'TWO_FACTOR_ENCRYPTION_KEY') {
          console.error(
            "     Fix: Generate a 256-bit key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
          );
        } else if (path === 'DATABASE_URL' || path === 'REDIS_URL') {
          console.error(
            '     Fix: Ensure DATABASE_URL and REDIS_URL are set in production environment'
          );
          console.error(
            '          In development/test, Docker Compose provides these automatically'
          );
        } else if (path === 'PORT') {
          console.error('     Fix: Set PORT to a value between 1 and 65535 (default: 3000)');
        } else if (path === 'NODE_ENV') {
          console.error('     Fix: Set NODE_ENV to one of: development, production, test');
        }
        console.error('');
      });

      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('💡 Quick Start Guide:');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.error('1. Copy the example environment file:');
      console.error('   cp .env.example .env\n');
      console.error('2. Generate required keys:');
      console.error('   npm run generate-keys\n');
      console.error(
        '3. Generate 2FA encryption key and add to .env (TWO_FACTOR_ENCRYPTION_KEY):\n'
      );
      console.error(
        "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
      );
      console.error('4. Verify your configuration:');
      console.error('   npm run check:env\n');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
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

/**
 * 全環境変数をログ出力（機密情報はマスキング）
 * LOG_LEVELがdebugまたはtraceの場合にのみ呼び出される
 *
 * @param env 検証済み環境変数
 */
function logAllEnvironmentVariables(env: Env): void {
  // 検証済み環境変数をマスキング付きでログ出力
  const maskedEnv: Record<string, string> = {};

  // Env型のキーを取得して処理
  const envKeys = Object.keys(env) as Array<keyof Env>;
  for (const key of envKeys) {
    maskedEnv[key] = maskSensitiveValue(key, env[key]);
  }

  logger.debug(
    {
      environmentVariables: maskedEnv,
      totalCount: envKeys.length,
    },
    'All validated environment variables (sensitive values masked)'
  );
}
