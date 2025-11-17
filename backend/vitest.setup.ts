// Vitest セットアップファイル
// テスト実行前の共通設定をここに記述
import 'dotenv/config';
import { generateKeyPair, exportJWK } from 'jose';

// JWT鍵の設定
// 優先順位:
// 1. 環境変数に既に設定されている場合: そのまま使用（docker-entrypoint.sh または .env から）
// 2. 設定されていない場合: 新しい鍵を生成（CI環境のユニットテスト用）
if (!process.env.JWT_PUBLIC_KEY || !process.env.JWT_PRIVATE_KEY) {
  // テスト用JWT鍵を生成
  const { publicKey, privateKey } = await generateKeyPair('EdDSA');
  const publicJWK = await exportJWK(publicKey);
  const privateJWK = await exportJWK(privateKey);

  process.env.JWT_PUBLIC_KEY = Buffer.from(JSON.stringify(publicJWK)).toString('base64');
  process.env.JWT_PRIVATE_KEY = Buffer.from(JSON.stringify(privateJWK)).toString('base64');

  // テスト環境でのみログ出力
  if (process.env.NODE_ENV === 'test') {
    console.log('Generated JWT keys for test environment');
  }
}

// 環境変数のデフォルト設定（テスト用）
// 既に設定されている場合は上書きしない（GitHub Actions等での設定を尊重）
// CI環境ではGitHub Actionsが環境変数を設定する
// ローカル環境では.envファイルから読み込まれる
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

if (!process.env.CI) {
  // ローカル環境: テスト専用データベースを使用
  // 開発用DBと分離してテストデータの汚染を防ぐ
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://postgres:dev@localhost:5432/architrack_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
  process.env.PORT = process.env.PORT || '3001';
} else {
  // CI環境: GitHub Actionsが設定した環境変数を使用
  process.env.PORT = process.env.PORT || '3001';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
}
