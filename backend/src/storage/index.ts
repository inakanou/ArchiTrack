/**
 * ストレージモジュール
 *
 * ファイルストレージの抽象化レイヤーを提供します。
 *
 * @module storage
 */

// インターフェース
export type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  SignedUrlOptions,
} from './storage-provider.interface.js';

// プロバイダー
export { LocalStorageProvider, type LocalStorageConfig } from './local-storage.provider.js';
export { R2StorageProvider, type R2StorageConfig } from './r2-storage.provider.js';

// ファクトリー
export {
  getStorageType,
  getStorageProvider,
  isStorageConfigured,
  initializeStorage,
  disconnectStorage,
  resetStorageProvider,
  type StorageType,
} from './storage-factory.js';
