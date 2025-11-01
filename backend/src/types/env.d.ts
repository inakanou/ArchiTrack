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
    }
  }
}

export {};
