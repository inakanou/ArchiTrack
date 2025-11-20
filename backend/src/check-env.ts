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
 *
 * validateEnv()は検証に失敗すると例外をスローし、詳細なエラー情報を
 * console.errorに出力します。このスクリプトはその結果を適切な
 * exit codeに変換してCI/CDパイプラインに伝えます。
 */
function checkEnvironmentVariables(): void {
  try {
    validateEnv();
    logger.info('✅ Environment variables validated successfully');
    // 正常終了: exit code 0 (自動)
  } catch (error) {
    // validateEnv()が既に詳細なエラー情報を出力しているため、
    // ここでは簡潔なログのみ記録
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'Environment validation failed');
    process.exit(1);
  }
}

// スクリプト実行
checkEnvironmentVariables();

export { checkEnvironmentVariables };
