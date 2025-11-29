/**
 * @fileoverview 2FA暗号化鍵生成スクリプト
 *
 * Task 19.1: 2FA暗号化鍵設定ガイド
 *
 * このスクリプトは、TOTPシークレットをデータベースに保存する際に
 * 使用するAES-256-GCM暗号化鍵を生成します。
 *
 * 使用方法:
 *   npx tsx scripts/generate-2fa-key.ts
 *
 * 出力:
 *   - コンソールに環境変数形式で鍵を出力
 *   - .env.2fa-key ファイルに鍵を保存
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AES-256-GCM暗号化鍵を生成する
 *
 * AES-256は256ビット（32バイト）の鍵を必要とします。
 * 暗号学的に安全な乱数生成器を使用して鍵を生成します。
 */
function generate2FAEncryptionKey(): string {
  // 32バイト = 256ビットの鍵を生成
  const keyBuffer = randomBytes(32);
  // Base64エンコードして文字列として返す
  return keyBuffer.toString('base64');
}

/**
 * メイン処理
 */
function main(): void {
  console.log('============================================');
  console.log('  2FA暗号化鍵生成スクリプト');
  console.log('============================================\n');

  // 鍵を生成
  const encryptionKey = generate2FAEncryptionKey();

  // 生成日時
  const generatedAt = new Date().toISOString();

  // コンソールに出力
  console.log('生成された2FA暗号化鍵:\n');
  console.log(`TWO_FACTOR_ENCRYPTION_KEY=${encryptionKey}\n`);

  // .envファイル形式のコンテンツ
  const envContent = `# 2FA暗号化鍵 (AES-256-GCM)
# 生成日時: ${generatedAt}
#
# 重要: この鍵は絶対にGitにコミットしないでください！
# この鍵を紛失すると、保存された2FAシークレットを復号化できなくなります。
#
TWO_FACTOR_ENCRYPTION_KEY=${encryptionKey}
`;

  // ファイルに保存
  const outputPath = path.join(process.cwd(), '.env.2fa-key');
  fs.writeFileSync(outputPath, envContent, 'utf-8');

  console.log(`鍵が .env.2fa-key に保存されました\n`);

  // 使用方法を表示
  console.log('============================================');
  console.log('  セットアップ手順');
  console.log('============================================\n');

  console.log('【開発環境】');
  console.log('1. 以下のコマンドで.envに追加:');
  console.log('   cat .env.2fa-key >> backend/.env\n');
  console.log('2. .env.2fa-keyを削除:');
  console.log('   rm .env.2fa-key\n');

  console.log('【Railway本番環境】');
  console.log('1. Railway Dashboard > Variables を開く');
  console.log('2. 環境変数を追加:');
  console.log(`   - Variable name: TWO_FACTOR_ENCRYPTION_KEY`);
  console.log(`   - Value: ${encryptionKey}`);
  console.log('3. Deployボタンをクリックして再デプロイ');
  console.log('4. ローカルの.env.2fa-keyを削除:');
  console.log('   rm .env.2fa-key\n');

  console.log('============================================');
  console.log('  セキュリティ注意事項');
  console.log('============================================\n');
  console.log('1. この鍵は絶対にGitにコミットしないでください');
  console.log('2. この鍵を紛失すると、保存された2FAシークレットを');
  console.log('   復号化できなくなります');
  console.log('3. 鍵をSlackやメールで共有しないでください');
  console.log('4. 鍵はパスワードマネージャーで安全に保管してください\n');
}

// スクリプト実行
main();
