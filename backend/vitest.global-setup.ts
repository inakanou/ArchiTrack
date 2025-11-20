// Vitest グローバルセットアップファイル
// 全てのテスト実行前に一度だけ実行される
import { config } from 'dotenv';
import { generateKeyPair, exportJWK } from 'jose';

// Docker環境では空文字列として設定されている環境変数を削除
// （dotenvは既存の環境変数を上書きしないため）
const emptyEnvVars = ['TWO_FACTOR_ENCRYPTION_KEY'];
emptyEnvVars.forEach((key) => {
  if (process.env[key] === '') {
    delete process.env[key];
  }
});

// テスト環境用の.env.testファイルを読み込む
// override: falseで既存の環境変数を優先（setup関数で環境に応じて設定するため）
config({ path: '.env.test' });

/**
 * グローバルセットアップ
 * JWT鍵を一度だけ生成し、全てのテストで共有する
 */
export async function setup() {
  // JWT鍵の設定
  // 優先順位:
  // 1. 環境変数に既に設定されている場合: そのまま使用（GitHub Secrets, docker-entrypoint.sh, .env）
  // 2. 設定されていない場合: 新しい鍵を生成（ローカル環境用フォールバック）
  if (!process.env.JWT_PUBLIC_KEY || !process.env.JWT_PRIVATE_KEY) {
    // テスト用JWT鍵を生成
    const { publicKey, privateKey } = await generateKeyPair('EdDSA');
    const publicJWK = await exportJWK(publicKey);
    const privateJWK = await exportJWK(privateKey);

    process.env.JWT_PUBLIC_KEY = Buffer.from(JSON.stringify(publicJWK)).toString('base64');
    process.env.JWT_PRIVATE_KEY = Buffer.from(JSON.stringify(privateJWK)).toString('base64');

    // テスト環境でのみログ出力
    if (process.env.NODE_ENV === 'test') {
      console.log('[GLOBAL SETUP] Generated JWT keys for test environment');
    }
  } else {
    console.log(
      '[GLOBAL SETUP] Using existing JWT keys from environment variables',
      process.env.CI ? '(CI Secrets)' : '(local)'
    );
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
      '[GLOBAL SETUP] DATABASE_URL overridden for tests:',
      originalDbUrl ? 'dev -> test' : 'not set -> test',
      `(${isInDocker ? 'Docker' : 'Local'})`
    );
  }

  // その他の環境変数のデフォルト設定
  // Docker環境の場合は既存の値を保持、ローカル環境のみデフォルト値を設定
  if (!process.env.REDIS_URL) {
    // Docker環境を検出（DATABASE_URLまたはREDIS_URLのホスト名で判定）
    const isInDocker =
      process.env.DATABASE_URL?.includes('@postgres:') ||
      process.env.REDIS_URL?.includes('redis://redis:');

    // Docker内の場合はredis、ローカルの場合はlocalhostに設定
    const redisHost = isInDocker ? 'redis' : 'localhost';
    process.env.REDIS_URL = `redis://${redisHost}:6379/1`;

    console.log(
      '[GLOBAL SETUP] REDIS_URL set for tests:',
      `redis://${redisHost}:6379/1`,
      `(${isInDocker ? 'Docker' : 'Local'})`
    );
  }

  // PORT未設定の場合はデフォルト値を設定（env.tsと統一）
  if (!process.env.PORT) {
    process.env.PORT = '3000';
  }

  // TWO_FACTOR_ENCRYPTION_KEY未設定の場合は.env.testから読み込み
  // テスト環境では固定値を使用してテストの一貫性を保つ
  if (!process.env.TWO_FACTOR_ENCRYPTION_KEY) {
    // .env.testに設定されている値を使用
    // この値は既に.env.testで定義されているため、dotenv.configで読み込まれる
    console.log('[GLOBAL SETUP] TWO_FACTOR_ENCRYPTION_KEY loaded from .env.test');
  }
}
