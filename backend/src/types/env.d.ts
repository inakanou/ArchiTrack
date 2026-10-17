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

      // 信頼する中継の段数（送信元 IP の識別）
      TRUST_PROXY_HOPS?: string;

      // トークンの発行者・想定利用者（JWT の iss・aud）
      JWT_ISSUER?: string;
      JWT_AUDIENCE?: string;

      // 監査ログのアーカイブの暗号鍵（64 桁の 16 進。本番で必須）
      ARCHIVE_ENCRYPTION_KEY?: string;

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

      // Anthropic Claude Vision API
      ANTHROPIC_API_KEY?: string;
    }
  }
}

export {};
