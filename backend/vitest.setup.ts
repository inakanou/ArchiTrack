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
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// テスト用データベースの設定
// .envファイルが開発用DBを指定している場合があるため、
// TEST_DATABASE_URL環境変数が設定されていない限り、
// テスト専用DBを使用するように強制する
const isDockerTest = process.env.DATABASE_URL?.includes('architrack_test');
const isExplicitlySet = process.env.TEST_DATABASE_URL;

if (!isDockerTest && !isExplicitlySet) {
  // ローカル環境または.envで開発DBが設定されている場合
  // テストDBに強制変更（データ汚染を防ぐため）
  const originalDbUrl = process.env.DATABASE_URL;

  // Docker環境を検出（DATABASE_URLのホスト名で判定）
  const isInDocker = originalDbUrl?.includes('@postgres:');

  // Docker内の場合はホスト名を'postgres'に、ローカルの場合は'localhost'に設定
  const dbHost = isInDocker ? 'postgres' : 'localhost';
  process.env.DATABASE_URL = `postgresql://postgres:dev@${dbHost}:5432/architrack_test`;

  console.log(
    '[VITEST] DATABASE_URL overridden for tests:',
    originalDbUrl ? 'dev -> test' : 'not set -> test',
    `(${isInDocker ? 'Docker' : 'Local'})`
  );
}

// その他の環境変数のデフォルト設定
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
process.env.PORT = process.env.PORT || '3001';
