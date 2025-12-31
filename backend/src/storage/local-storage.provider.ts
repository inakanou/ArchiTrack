/**
 * ローカルファイルシステムストレージプロバイダー
 *
 * 開発・テスト環境用のローカルファイルシステムストレージ実装。
 * 本番環境では使用しないこと。
 *
 * @module storage/local-storage.provider
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  SignedUrlOptions,
} from './storage-provider.interface.js';
import logger from '../utils/logger.js';

/**
 * ローカルストレージ設定
 */
export interface LocalStorageConfig {
  /** ファイル保存先のベースパス */
  basePath: string;
  /** 公開URL のベースURL（オプション） */
  publicBaseUrl?: string;
}

/**
 * ローカルファイルシステムストレージプロバイダー
 *
 * ファイルシステムを使用してファイルを保存・取得します。
 * 開発・テスト環境での使用を想定しています。
 */
export class LocalStorageProvider implements StorageProvider {
  readonly type = 'local' as const;
  private readonly basePath: string;
  private readonly publicBaseUrl: string | null;

  constructor(config: LocalStorageConfig) {
    this.basePath = path.resolve(config.basePath);
    this.publicBaseUrl = config.publicBaseUrl || null;

    logger.info({ basePath: this.basePath }, 'LocalStorageProvider initialized');
  }

  /**
   * ベースディレクトリを初期化（存在しない場合は作成）
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      logger.debug({ basePath: this.basePath }, 'Storage directory ensured');
    } catch (error) {
      logger.error({ error, basePath: this.basePath }, 'Failed to create storage directory');
      throw error;
    }
  }

  /**
   * ファイルをアップロード
   */
  async upload(key: string, data: Buffer, options?: UploadOptions): Promise<UploadResult> {
    const filePath = this.getFilePath(key);
    const dirPath = path.dirname(filePath);

    // ディレクトリを作成
    await fs.mkdir(dirPath, { recursive: true });

    // ファイルを書き込み
    await fs.writeFile(filePath, data);

    // メタデータがある場合は別ファイルに保存
    if (options?.contentType || options?.metadata) {
      const metadataPath = `${filePath}.meta.json`;
      const metadata = {
        contentType: options.contentType,
        cacheControl: options.cacheControl,
        ...options.metadata,
      };
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    // ETagを計算（MD5ハッシュ）
    const etag = crypto.createHash('md5').update(data).digest('hex');

    logger.debug({ key, size: data.length, filePath }, 'File uploaded to local storage');

    return {
      key,
      size: data.length,
      etag: `"${etag}"`,
    };
  }

  /**
   * ファイルを取得
   */
  async get(key: string): Promise<Buffer | null> {
    const filePath = this.getFilePath(key);

    try {
      const data = await fs.readFile(filePath);
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * ファイルを削除
   */
  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const metadataPath = `${filePath}.meta.json`;

    try {
      await fs.unlink(filePath);
      logger.debug({ key, filePath }, 'File deleted from local storage');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // メタデータファイルも削除
    try {
      await fs.unlink(metadataPath);
    } catch {
      // メタデータファイルが存在しなくてもエラーにしない
    }
  }

  /**
   * ファイルの存在確認
   */
  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 署名付きURLを取得
   *
   * ローカルストレージでは署名なしの直接URLを返します。
   * セキュリティが必要な場合は本番環境でR2/S3を使用してください。
   */
  async getSignedUrl(key: string, _options?: SignedUrlOptions): Promise<string> {
    // ローカルでは公開URLまたはファイルパスを返す
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    // 公開URLがない場合はファイルパスを返す（開発用）
    return `file://${this.getFilePath(key)}`;
  }

  /**
   * 公開URLを取得
   */
  getPublicUrl(key: string): string | null {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    return null;
  }

  /**
   * ファイルをコピー
   *
   * Task 32.1: 孤立ファイル移動機能 (Requirements: 4.8)
   *
   * @param sourceKey - コピー元のキー（パス）
   * @param destinationKey - コピー先のキー（パス）
   */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = this.getFilePath(sourceKey);
    const destPath = this.getFilePath(destinationKey);
    const destDir = path.dirname(destPath);

    // コピー先ディレクトリを作成
    await fs.mkdir(destDir, { recursive: true });

    // ファイルをコピー
    await fs.copyFile(sourcePath, destPath);

    // メタデータファイルがあればそれもコピー
    const sourceMetaPath = `${sourcePath}.meta.json`;
    const destMetaPath = `${destPath}.meta.json`;
    try {
      await fs.access(sourceMetaPath);
      await fs.copyFile(sourceMetaPath, destMetaPath);
    } catch {
      // メタデータファイルが存在しなくてもエラーにしない
    }

    logger.debug({ sourceKey, destinationKey }, 'File copied in local storage');
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      // ベースディレクトリが書き込み可能かテスト
      await this.initialize();
      const testFile = path.join(this.basePath, '.connection-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      logger.info({ basePath: this.basePath }, 'Local storage connection test successful');
      return true;
    } catch (error) {
      logger.error({ error, basePath: this.basePath }, 'Local storage connection test failed');
      return false;
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async disconnect(): Promise<void> {
    // ローカルストレージでは特にクリーンアップ不要
    logger.info('LocalStorageProvider disconnected');
  }

  /**
   * キーからファイルパスを生成
   */
  private getFilePath(key: string): string {
    // キーのサニタイズ（パストラバーサル防止）
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.basePath, sanitizedKey);
  }

  /**
   * ストレージ内のファイル一覧を取得（デバッグ用）
   */
  async listFiles(prefix?: string): Promise<string[]> {
    const searchPath = prefix ? path.join(this.basePath, prefix) : this.basePath;
    const files: string[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
            files.push(path.relative(this.basePath, fullPath));
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    };

    await walkDir(searchPath);
    return files;
  }
}
