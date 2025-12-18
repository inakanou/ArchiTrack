/**
 * ストレージファクトリー
 *
 * 環境変数に基づいて適切なストレージプロバイダーを初期化します。
 *
 * 環境設定:
 * - STORAGE_TYPE: 'local' | 'r2' (デフォルト: 環境による自動判定)
 * - LOCAL_STORAGE_PATH: ローカルストレージのベースパス
 * - LOCAL_STORAGE_URL: ローカルストレージの公開URL（オプション）
 * - R2_ENDPOINT: R2エンドポイントURL
 * - R2_ACCESS_KEY_ID: R2アクセスキーID
 * - R2_SECRET_ACCESS_KEY: R2シークレットアクセスキー
 * - R2_BUCKET_NAME: R2バケット名
 * - R2_PUBLIC_URL: R2公開URL（オプション）
 *
 * @module storage/storage-factory
 */

import type { StorageProvider } from './storage-provider.interface.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { R2StorageProvider } from './r2-storage.provider.js';
import logger from '../utils/logger.js';

/**
 * ストレージタイプ
 */
export type StorageType = 'local' | 'r2';

/**
 * シングルトンストレージプロバイダーインスタンス
 */
let storageProvider: StorageProvider | null = null;

/**
 * 環境変数からストレージタイプを判定
 */
export function getStorageType(): StorageType | null {
  // 明示的に指定されている場合
  const explicitType = process.env.STORAGE_TYPE?.toLowerCase();
  if (explicitType === 'local' || explicitType === 'r2') {
    return explicitType;
  }

  // R2の設定が完備されている場合はR2を使用
  const r2Configured = !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
  if (r2Configured) {
    return 'r2';
  }

  // ローカルストレージのパスが設定されている場合はローカルを使用
  if (process.env.LOCAL_STORAGE_PATH) {
    return 'local';
  }

  // どちらも設定されていない場合
  return null;
}

/**
 * ストレージが設定されているかチェック
 */
export function isStorageConfigured(): boolean {
  return getStorageType() !== null;
}

/**
 * ローカルストレージプロバイダーを作成
 */
function createLocalStorageProvider(): LocalStorageProvider {
  const basePath = process.env.LOCAL_STORAGE_PATH;
  if (!basePath) {
    throw new Error('LOCAL_STORAGE_PATH environment variable is required for local storage');
  }

  return new LocalStorageProvider({
    basePath,
    publicBaseUrl: process.env.LOCAL_STORAGE_URL,
  });
}

/**
 * R2ストレージプロバイダーを作成
 */
function createR2StorageProvider(): R2StorageProvider {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      'R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are required for R2 storage'
    );
  }

  return new R2StorageProvider({
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: process.env.R2_PUBLIC_URL,
  });
}

/**
 * ストレージプロバイダーを取得（シングルトン）
 *
 * 初回呼び出し時にプロバイダーを初期化し、以降は同じインスタンスを返します。
 *
 * @returns ストレージプロバイダー、設定されていない場合はnull
 */
export function getStorageProvider(): StorageProvider | null {
  if (storageProvider) {
    return storageProvider;
  }

  const storageType = getStorageType();
  if (!storageType) {
    logger.warn('No storage configured. File upload features will be disabled.');
    return null;
  }

  try {
    switch (storageType) {
      case 'local':
        storageProvider = createLocalStorageProvider();
        break;
      case 'r2':
        storageProvider = createR2StorageProvider();
        break;
    }

    logger.info({ storageType }, 'Storage provider initialized');
    return storageProvider;
  } catch (error) {
    logger.error({ error, storageType }, 'Failed to initialize storage provider');
    return null;
  }
}

/**
 * ストレージプロバイダーを初期化（接続テスト付き）
 *
 * アプリケーション起動時に呼び出して、ストレージへの接続を確認します。
 *
 * @returns 初期化成功の場合true
 */
export async function initializeStorage(): Promise<boolean> {
  const provider = getStorageProvider();
  if (!provider) {
    return false;
  }

  // ローカルストレージの場合は初期化を実行
  if (provider.type === 'local') {
    await (provider as LocalStorageProvider).initialize();
  }

  // 接続テスト
  const connected = await provider.testConnection();
  if (!connected) {
    logger.error('Storage connection test failed');
    return false;
  }

  return true;
}

/**
 * ストレージプロバイダーを切断
 */
export async function disconnectStorage(): Promise<void> {
  if (storageProvider) {
    await storageProvider.disconnect();
    storageProvider = null;
  }
}

/**
 * ストレージプロバイダーをリセット（テスト用）
 */
export function resetStorageProvider(): void {
  storageProvider = null;
}

/**
 * 既存のconfig/storage.tsとの互換性のためのエクスポート
 */
export { getStorageType as getConfiguredStorageType };
