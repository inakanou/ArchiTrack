#!/usr/bin/env node
/**
 * 環境変数チェックスクリプト
 *
 * デプロイ前に環境変数が正しく設定されているかを検証します。
 * CI/CDパイプラインで使用されます。
 *
 * @module check-env
 */

import { validateEnv } from './config/env.js';
import logger from './utils/logger.js';

/**
 * 環境変数チェックを実行
 */
function checkEnvironmentVariables(): void {
  try {
    logger.info('🔍 環境変数の検証を開始します...');

    // 環境変数を検証
    const env = validateEnv();

    logger.info('✅ 環境変数の検証に成功しました');
    logger.info({
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      hasDatabaseURL: !!env.DATABASE_URL,
      hasRedisURL: !!env.REDIS_URL,
      hasFrontendURL: !!env.FRONTEND_URL,
      hasJWTKeys: !!(env.JWT_PUBLIC_KEY && env.JWT_PRIVATE_KEY),
      has2FAKey: !!env.TWO_FACTOR_ENCRYPTION_KEY,
    });

    // 成功時は exit code 0
    process.exit(0);
  } catch (error) {
    logger.error('❌ 環境変数の検証に失敗しました');

    if (error instanceof Error) {
      logger.error(error.message);
    }

    // 失敗時は exit code 1
    process.exit(1);
  }
}

// スクリプトとして直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  checkEnvironmentVariables();
}

export { checkEnvironmentVariables };
