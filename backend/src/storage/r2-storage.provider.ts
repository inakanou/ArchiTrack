/**
 * Cloudflare R2 ストレージプロバイダー
 *
 * S3互換APIを使用してCloudflare R2に接続するストレージ実装。
 * 本番環境での使用を想定しています。
 *
 * @module storage/r2-storage.provider
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageProvider,
  UploadOptions,
  UploadResult,
  SignedUrlOptions,
} from './storage-provider.interface.js';
import logger from '../utils/logger.js';

/**
 * R2ストレージ設定
 */
export interface R2StorageConfig {
  /** R2エンドポイントURL */
  endpoint: string;
  /** アクセスキーID */
  accessKeyId: string;
  /** シークレットアクセスキー */
  secretAccessKey: string;
  /** バケット名 */
  bucketName: string;
  /** 公開URL（署名なしアクセス用、オプション） */
  publicUrl?: string;
}

/**
 * Cloudflare R2 ストレージプロバイダー
 *
 * S3互換APIを使用してCloudflare R2にファイルを保存・取得します。
 */
export class R2StorageProvider implements StorageProvider {
  readonly type = 'r2' as const;
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string | null;

  constructor(config: R2StorageConfig) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl || null;

    logger.info(
      {
        endpoint: config.endpoint.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
        bucketName: config.bucketName,
      },
      'R2StorageProvider initialized'
    );
  }

  /**
   * S3Clientを取得（既存コードとの互換性用）
   */
  getS3Client(): S3Client {
    return this.client;
  }

  /**
   * バケット名を取得
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * ファイルをアップロード
   */
  async upload(key: string, data: Buffer, options?: UploadOptions): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: options?.contentType,
      CacheControl: options?.cacheControl,
      Metadata: options?.metadata,
    });

    const result = await this.client.send(command);

    logger.debug({ key, size: data.length, etag: result.ETag }, 'File uploaded to R2');

    return {
      key,
      size: data.length,
      etag: result.ETag,
    };
  }

  /**
   * ファイルを取得
   */
  async get(key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const result = await this.client.send(command);

      if (!result.Body) {
        return null;
      }

      // StreamをBufferに変換
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * ファイルを削除
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
    logger.debug({ key }, 'File deleted from R2');
  }

  /**
   * ファイルの存在確認
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 署名付きURLを取得
   */
  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: options?.responseContentDisposition,
    });

    const expiresIn = options?.expiresIn || 3600; // デフォルト1時間
    const url = await getSignedUrl(this.client, command, { expiresIn });

    return url;
  }

  /**
   * 公開URLを取得
   */
  getPublicUrl(key: string): string | null {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
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
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${sourceKey}`,
      Key: destinationKey,
    });

    await this.client.send(command);
    logger.debug({ sourceKey, destinationKey }, 'File copied in R2');
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      const command = new HeadBucketCommand({
        Bucket: this.bucketName,
      });

      await this.client.send(command);
      logger.info({ bucketName: this.bucketName }, 'R2 storage connection test successful');
      return true;
    } catch (error) {
      logger.error({ error, bucketName: this.bucketName }, 'R2 storage connection test failed');
      return false;
    }
  }

  /**
   * リソースのクリーンアップ
   */
  async disconnect(): Promise<void> {
    this.client.destroy();
    logger.info('R2StorageProvider disconnected');
  }
}
