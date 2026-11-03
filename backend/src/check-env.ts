/**
 * 環境変数チェックスクリプト
 *
 * デプロイ前に環境変数が正しく設定されているかを検証します。
 * CI/CDパイプラインで使用されます。
 *
 * @module check-env
 */

import { validateEnv } from './config/env.js';
import { runtimeMode, ProductionPrerequisiteError } from './config/runtime-mode.js';
import logger from './utils/logger.js';

/**
 * 環境変数チェックを実行
 *
 * validateEnv()は検証に失敗すると例外をスローし、詳細なエラー情報を
 * console.errorに出力します。続けて起動時と同じ本番の前提の検査
 * （runtimeMode.assertProductionPrerequisites）を通します。
 * このスクリプトはその結果を適切なexit codeに変換してCI/CDパイプラインに伝えます。
 */
function checkEnvironmentVariables(): void {
  try {
    validateEnv();
    runtimeMode.assertProductionPrerequisites();
    logger.info('✅ Environment variables validated successfully');
    // 正常終了: exit code 0 (自動)
  } catch (error) {
    // validateEnv()が既に詳細なエラー情報を出力しているため、
    // ここでは簡潔なログのみ記録（本番の前提の欠落は変数名を示す）
    const err = error instanceof Error ? error : new Error(String(error));
    if (err instanceof ProductionPrerequisiteError) {
      console.error(`❌ ${err.message}`);
    }
    logger.error({ err }, 'Environment validation failed');
    process.exit(1);
  }
}

// スクリプト実行
checkEnvironmentVariables();

export { checkEnvironmentVariables };
