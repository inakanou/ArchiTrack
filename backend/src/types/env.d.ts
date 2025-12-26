/**
 * 環境変数の型定義
 * process.env の型安全性を確保
 */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Server
      PORT?: string;
      NODE_ENV?: 'development' | 'production' | 'test';

      // Database
      DATABASE_URL?: string;

      // Redis
      REDIS_URL?: string;

      // Frontend
      FRONTEND_URL?: string;

      // Logging
      LOG_LEVEL?: string;

      // Railway
      RAILWAY_ENVIRONMENT?: string;
      RAILWAY_SERVICE_NAME?: string;

      // CI
      CI?: string;

      // Cloudflare R2 Storage
      R2_ENDPOINT?: string;
      R2_ACCESS_KEY_ID?: string;
      R2_SECRET_ACCESS_KEY?: string;
      R2_BUCKET_NAME?: string;
      R2_PUBLIC_URL?: string;
    }
  }
}

export {};
