/**
 * @fileoverview 画像アップロードサービス
 *
 * 画像のアップロード、処理、ストレージ保存を担当します。
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - POST /api/site-surveys/:id/images（アップロード、multipart/form-data）
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し現場調査に紐付ける
 * - 4.2: バッチアップロードを実行する
 *
 * @module services/image-upload
 */

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { SurveyImageService, UploadFile } from './survey-image.service.js';
import type { ImageProcessorService } from './image-processor.service.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import logger from '../utils/logger.js';

/**
 * 現場調査が見つからないエラー
 */
export class SurveyNotFoundError extends Error {
  readonly code = 'SURVEY_NOT_FOUND';
  readonly surveyId: string;

  constructor(surveyId: string) {
    super(`現場調査が見つかりません: ${surveyId}`);
    this.name = 'SurveyNotFoundError';
    this.surveyId = surveyId;
  }
}

/**
 * 画像数上限超過エラー
 */
export class MaxImagesExceededError extends Error {
  readonly code = 'MAX_IMAGES_EXCEEDED';
  readonly currentCount: number;
  readonly maxCount: number;

  constructor(currentCount: number, maxCount: number) {
    super(`画像数の上限（${maxCount}枚）に達しています。現在の画像数: ${currentCount}枚`);
    this.name = 'MaxImagesExceededError';
    this.currentCount = currentCount;
    this.maxCount = maxCount;
  }
}

/**
 * アップロード入力
 */
export interface UploadInput {
  surveyId: string;
  file: UploadFile;
  displayOrder?: number;
}

/**
 * アップロード結果
 */
export interface UploadResult {
  id: string;
  surveyId: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  originalPath: string;
  thumbnailPath: string;
  createdAt: Date;
}

/**
 * バッチアップロード結果
 */
export interface BatchUploadResult {
  successful: UploadResult[];
  failed: Array<{
    fileName: string;
    error: string;
  }>;
}

/**
 * サービス依存関係
 *
 * storageProviderを指定した場合、s3ClientとbucketNameは無視されます。
 * 後方互換性のため、s3ClientとbucketNameも引き続きサポートしています。
 */
export interface ImageUploadServiceDependencies {
  prisma: PrismaClient;
  /** @deprecated storageProviderを使用してください */
  s3Client?: S3Client;
  /** @deprecated storageProviderを使用してください */
  bucketName?: string;
  /** ストレージプロバイダー（推奨） */
  storageProvider?: StorageProvider;
  surveyImageService: SurveyImageService;
  imageProcessorService: ImageProcessorService;
}

/**
 * 画像アップロードサービス
 *
 * 画像のアップロード、処理、ストレージ保存を担当します。
 */
export class ImageUploadService {
  /**
   * 現場調査あたりの画像数上限
   */
  static readonly MAX_IMAGES_PER_SURVEY = 50;

  private readonly prisma: PrismaClient;
  private readonly s3Client: S3Client | null;
  private readonly bucketName: string | null;
  private readonly storageProvider: StorageProvider | null;
  private readonly surveyImageService: SurveyImageService;
  private readonly imageProcessorService: ImageProcessorService;

  constructor(deps: ImageUploadServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider || null;
    this.s3Client = deps.s3Client || null;
    this.bucketName = deps.bucketName || null;
    this.surveyImageService = deps.surveyImageService;
    this.imageProcessorService = deps.imageProcessorService;

    // どちらかのストレージ設定が必要
    if (!this.storageProvider && (!this.s3Client || !this.bucketName)) {
      throw new Error('Either storageProvider or s3Client+bucketName is required');
    }
  }

  /**
   * 画像をアップロード
   *
   * Requirements: 4.1
   *
   * @param input - アップロード入力
   * @returns アップロード結果
   * @throws {SurveyNotFoundError} 現場調査が存在しない場合
   * @throws {MaxImagesExceededError} 画像数上限に達している場合
   */
  async upload(input: UploadInput): Promise<UploadResult> {
    const { surveyId, file, displayOrder } = input;

    // 現場調査の存在確認
    const survey = await this.prisma.siteSurvey.findUnique({
      where: { id: surveyId },
      select: { id: true, deletedAt: true },
    });

    if (!survey) {
      throw new SurveyNotFoundError(surveyId);
    }

    if (survey.deletedAt) {
      throw new SurveyNotFoundError(surveyId);
    }

    // 画像数上限チェック
    const currentCount = await this.prisma.surveyImage.count({
      where: { surveyId },
    });

    if (currentCount >= ImageUploadService.MAX_IMAGES_PER_SURVEY) {
      throw new MaxImagesExceededError(currentCount, ImageUploadService.MAX_IMAGES_PER_SURVEY);
    }

    // ファイルバリデーション
    this.surveyImageService.validateFile(file);

    // ファイル名をサニタイズ
    const sanitizedFileName = this.surveyImageService.sanitizeFileName(file.originalname);

    // 画像処理（圧縮、サムネイル生成）
    const processedImage = await this.imageProcessorService.processImage(file.buffer);

    // ストレージパスを生成
    const timestamp = Date.now();
    const originalPath = `surveys/${surveyId}/${timestamp}_${sanitizedFileName}`;
    const thumbnailPath = `surveys/${surveyId}/${timestamp}_thumb_${sanitizedFileName}`;

    // S3にアップロード（原画像）
    await this.uploadToStorage(originalPath, processedImage.original.buffer, file.mimetype);

    // S3にアップロード（サムネイル）
    await this.uploadToStorage(thumbnailPath, processedImage.thumbnail, file.mimetype);

    // 表示順序を決定
    const nextDisplayOrder = displayOrder ?? (await this.getNextDisplayOrder(surveyId));

    // データベースに登録
    const image = await this.prisma.surveyImage.create({
      data: {
        surveyId,
        fileName: sanitizedFileName,
        fileSize: processedImage.metadata.size,
        width: processedImage.metadata.width,
        height: processedImage.metadata.height,
        displayOrder: nextDisplayOrder,
        originalPath,
        thumbnailPath,
      },
    });

    logger.info(
      {
        imageId: image.id,
        surveyId,
        fileName: sanitizedFileName,
        fileSize: processedImage.metadata.size,
      },
      '画像をアップロードしました'
    );

    return {
      id: image.id,
      surveyId: image.surveyId,
      fileName: image.fileName,
      fileSize: image.fileSize,
      width: image.width,
      height: image.height,
      displayOrder: image.displayOrder,
      originalPath: image.originalPath,
      thumbnailPath: image.thumbnailPath,
      createdAt: image.createdAt,
    };
  }

  /**
   * 複数の画像を一括アップロード
   *
   * Requirements: 4.2
   *
   * @param surveyId - 現場調査ID
   * @param files - アップロードするファイルの配列
   * @returns バッチアップロード結果
   * @throws {SurveyNotFoundError} 現場調査が存在しない場合
   */
  async uploadBatch(surveyId: string, files: UploadFile[]): Promise<BatchUploadResult> {
    // 現場調査の存在確認
    const survey = await this.prisma.siteSurvey.findUnique({
      where: { id: surveyId },
      select: { id: true, deletedAt: true },
    });

    if (!survey) {
      throw new SurveyNotFoundError(surveyId);
    }

    if (survey.deletedAt) {
      throw new SurveyNotFoundError(surveyId);
    }

    // 現在の画像数を取得
    let currentCount = await this.prisma.surveyImage.count({
      where: { surveyId },
    });

    const successful: UploadResult[] = [];
    const failed: Array<{ fileName: string; error: string }> = [];

    for (const file of files) {
      // 上限チェック
      if (currentCount >= ImageUploadService.MAX_IMAGES_PER_SURVEY) {
        failed.push({
          fileName: file.originalname,
          error: `画像数の上限（${ImageUploadService.MAX_IMAGES_PER_SURVEY}枚）に達しました`,
        });
        continue;
      }

      try {
        const result = await this.upload({
          surveyId,
          file,
          displayOrder: currentCount + 1,
        });
        successful.push(result);
        currentCount++;
      } catch (error) {
        failed.push({
          fileName: file.originalname,
          error: error instanceof Error ? error.message : 'アップロードに失敗しました',
        });
      }
    }

    logger.info(
      {
        surveyId,
        totalFiles: files.length,
        successCount: successful.length,
        failCount: failed.length,
      },
      'バッチアップロードが完了しました'
    );

    return { successful, failed };
  }

  /**
   * 次の表示順序を取得
   *
   * @param surveyId - 現場調査ID
   * @returns 次の表示順序（現在の画像数 + 1）
   */
  async getNextDisplayOrder(surveyId: string): Promise<number> {
    const count = await this.prisma.surveyImage.count({
      where: { surveyId },
    });
    return count + 1;
  }

  /**
   * ストレージにファイルをアップロード
   *
   * StorageProviderが設定されている場合はそちらを使用し、
   * そうでない場合は従来のS3Clientを使用します。
   *
   * @param key - オブジェクトキー
   * @param buffer - ファイルバッファ
   * @param contentType - コンテントタイプ
   */
  private async uploadToStorage(key: string, buffer: Buffer, contentType: string): Promise<void> {
    if (this.storageProvider) {
      await this.storageProvider.upload(key, buffer, { contentType });
      return;
    }

    // 従来のS3Client方式（後方互換性）
    if (!this.s3Client || !this.bucketName) {
      throw new Error('No storage provider configured');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
  }
}
