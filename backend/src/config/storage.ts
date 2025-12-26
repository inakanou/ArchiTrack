/**
 * Cloudflare R2 ストレージ設定
 *
 * S3互換APIを使用してCloudflare R2に接続するための設定と
 * S3Clientのシングルトン管理を行う。
 *
 * @module config/storage
 * @see {@link https://developers.cloudflare.com/r2/api/s3/api/}
 *
 * Requirements: 4.1, 14.6
 */
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import logger from '../utils/logger.js';

/**
 * ストレージ設定
 */
export interface StorageConfig {
  /** R2エンドポイントURL */
  endpoint: string;
  /** バケット名 */
  bucketName: string;
  /** 公開URL（署名なしアクセス用、オプション） */
  publicUrl: string | null;
  /** リージョン（R2は常に'auto'） */
  region: 'auto';
}

/**
 * 接続テスト結果
 */
export interface StorageConnectionResult {
  /** 接続成功かどうか */
  success: boolean;
  /** 結果メッセージ */
  message: string;
}

// シングルトンS3Clientインスタンス
let s3Client: S3Client | null = null;

/**
 * 必須環境変数をチェック
 * @returns 環境変数が全て設定されているかどうか
 */
export function isStorageConfigured(): boolean {
  const requiredEnvVars = [
    'R2_ENDPOINT',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ];

  return requiredEnvVars.every((envVar) => {
    const value = process.env[envVar];
    return value !== undefined && value !== '';
  });
}

/**
 * 環境変数の検証
 * 不足している環境変数があればエラーをスローする
 * @throws {Error} 必須環境変数が設定されていない場合
 */
function validateEnvVars(): void {
  const requiredEnvVars = [
    { name: 'R2_ENDPOINT', value: process.env.R2_ENDPOINT },
    { name: 'R2_ACCESS_KEY_ID', value: process.env.R2_ACCESS_KEY_ID },
    { name: 'R2_SECRET_ACCESS_KEY', value: process.env.R2_SECRET_ACCESS_KEY },
    { name: 'R2_BUCKET_NAME', value: process.env.R2_BUCKET_NAME },
  ];

  const missing = requiredEnvVars.filter((env) => env.value === undefined || env.value === '');

  if (missing.length > 0) {
    const missingNames = missing.map((env) => env.name).join(', ');
    throw new Error(
      `Missing required environment variables for R2 storage: ${missingNames}. ` +
        'Please set these in your .env file or environment.'
    );
  }
}

/**
 * S3Clientのシングルトンインスタンスを取得
 *
 * 初回呼び出し時にクライアントを初期化し、
 * 以降は同じインスタンスを返す。
 *
 * @returns S3Clientインスタンス
 * @throws {Error} 必須環境変数が設定されていない場合
 *
 * @example
 * ```typescript
 * const client = getS3Client();
 * const command = new PutObjectCommand({
 *   Bucket: process.env.R2_BUCKET_NAME,
 *   Key: 'images/photo.jpg',
 *   Body: buffer,
 * });
 * await client.send(command);
 * ```
 */
export function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  // 環境変数の検証
  validateEnvVars();

  const endpoint = process.env.R2_ENDPOINT!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

  s3Client = new S3Client({
    region: 'auto', // R2固有の設定
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  logger.info(
    {
      endpoint: endpoint.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // 認証情報をマスク
      bucketName: process.env.R2_BUCKET_NAME,
    },
    'S3Client initialized for Cloudflare R2'
  );

  return s3Client;
}

/**
 * ストレージ設定を取得
 *
 * @returns ストレージ設定オブジェクト
 * @throws {Error} 必須環境変数が設定されていない場合
 */
export function getStorageConfig(): StorageConfig {
  validateEnvVars();

  return {
    endpoint: process.env.R2_ENDPOINT!,
    bucketName: process.env.R2_BUCKET_NAME!,
    publicUrl: process.env.R2_PUBLIC_URL || null,
    region: 'auto',
  };
}

/**
 * ストレージ接続テスト
 *
 * HeadBucketコマンドを使用してバケットへの接続をテストする。
 *
 * @returns 接続テスト結果
 *
 * @example
 * ```typescript
 * const result = await testStorageConnection();
 * if (result.success) {
 *   console.log('Storage connection successful');
 * } else {
 *   console.error('Storage connection failed:', result.message);
 * }
 * ```
 */
export async function testStorageConnection(): Promise<StorageConnectionResult> {
  try {
    const client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME!;

    const command = new HeadBucketCommand({
      Bucket: bucketName,
    });

    await client.send(command);

    const message = `R2 storage connection successful. Bucket: ${bucketName}`;
    logger.info({ bucketName }, message);

    return {
      success: true,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const message = `R2 storage connection failed: ${errorMessage}`;

    logger.error(
      {
        error: errorMessage,
        endpoint: process.env.R2_ENDPOINT,
        bucketName: process.env.R2_BUCKET_NAME,
      },
      message
    );

    return {
      success: false,
      message,
    };
  }
}

/**
 * ストレージ接続を切断
 *
 * S3Clientのリソースを解放し、シングルトンインスタンスをリセットする。
 * アプリケーションのシャットダウン時に呼び出すこと。
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await disconnectStorage();
 *   process.exit(0);
 * });
 * ```
 */
export async function disconnectStorage(): Promise<void> {
  if (s3Client) {
    s3Client.destroy();
    logger.info('S3Client disconnected');
    s3Client = null;
  }
}

/**
 * S3Clientインスタンスをリセット（テスト用）
 *
 * 注意: この関数は単体テスト用途でのみ使用すること。
 * 本番コードでは使用しないこと。
 */
export function resetS3Client(): void {
  s3Client = null;
}
