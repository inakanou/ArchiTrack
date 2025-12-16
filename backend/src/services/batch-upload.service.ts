/**
 * @fileoverview バッチアップロードサービス
 *
 * 複数画像の一括アップロード機能を提供します。
 *
 * Task 4.3: バッチアップロード機能を実装する
 * - 複数ファイルの同時選択対応
 * - 5件を超える場合は5件ずつキュー処理して順次アップロード
 * - 表示順序の自動設定
 * - 進捗状況の追跡
 *
 * Requirements:
 * - 4.2: 複数の画像を同時に選択してバッチアップロードを実行する
 * - 4.3: 同時選択ファイル数が5件を超える場合は5件ずつキュー処理して順次アップロードを実行する
 *
 * @module services/batch-upload
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { ImageProcessorService } from './image-processor.service.js';
import type { SurveyImageService, UploadFile } from './survey-image.service.js';

/**
 * バッチアップロードエラー
 */
export class BatchUploadError extends Error {
  readonly code: string;

  constructor(message: string, code: string, cause?: Error) {
    super(message, { cause });
    this.name = 'BatchUploadError';
    this.code = code;
  }
}

/**
 * バッチアップロード入力
 */
export interface BatchUploadInput {
  surveyId: string;
  files: UploadFile[];
}

/**
 * アップロード成功結果
 */
export interface UploadSuccessResult {
  id: string;
  surveyId: string;
  originalPath: string;
  thumbnailPath: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  createdAt: Date;
}

/**
 * アップロードエラー情報
 */
export interface UploadErrorInfo {
  index: number;
  filename: string;
  error: string;
}

/**
 * バッチアップロード進捗
 */
export interface BatchUploadProgress {
  total: number;
  completed: number;
  current: number;
  results: UploadSuccessResult[];
  errors: UploadErrorInfo[];
}

/**
 * バッチアップロード結果
 */
export interface BatchUploadResult {
  total: number;
  successful: number;
  failed: number;
  results: UploadSuccessResult[];
  errors: UploadErrorInfo[];
}

/**
 * サービス依存関係
 */
export interface BatchUploadDependencies {
  prisma: PrismaClient;
  s3Client: S3Client;
  bucketName: string;
  imageProcessor: ImageProcessorService;
  surveyImageService: SurveyImageService;
}

/**
 * バッチアップロードサービス
 *
 * 複数画像の一括アップロード機能を提供します。
 * 5件を超えるファイルは5件ずつキュー処理して順次アップロードします。
 */
export class BatchUploadService {
  /**
   * 1バッチあたりの処理件数
   */
  static readonly BATCH_SIZE = 5;

  private readonly prisma: PrismaClient;
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly imageProcessor: ImageProcessorService;
  private readonly surveyImageService: SurveyImageService;

  constructor(deps: BatchUploadDependencies) {
    this.prisma = deps.prisma;
    this.s3Client = deps.s3Client;
    this.bucketName = deps.bucketName;
    this.imageProcessor = deps.imageProcessor;
    this.surveyImageService = deps.surveyImageService;
  }

  /**
   * バッチアップロードを実行
   *
   * Requirements:
   * - 4.2: 複数の画像を同時に選択してバッチアップロードを実行する
   * - 4.3: 同時選択ファイル数が5件を超える場合は5件ずつキュー処理して順次アップロードを実行する
   *
   * @param input - バッチアップロード入力
   * @param onProgress - 進捗コールバック（オプション）
   * @returns バッチアップロード結果
   * @throws {BatchUploadError} 現場調査が存在しない場合、またはファイルリストが空の場合
   */
  async uploadBatch(
    input: BatchUploadInput,
    onProgress?: (progress: BatchUploadProgress) => void
  ): Promise<BatchUploadResult> {
    // ファイルリストのバリデーション
    if (input.files.length === 0) {
      throw new BatchUploadError(
        'アップロードするファイルが指定されていません。',
        'EMPTY_FILE_LIST'
      );
    }

    // 現場調査の存在確認
    const survey = await this.prisma.siteSurvey.findUnique({
      where: { id: input.surveyId },
    });

    if (!survey) {
      throw new BatchUploadError(`現場調査が見つかりません: ${input.surveyId}`, 'SURVEY_NOT_FOUND');
    }

    if (survey.deletedAt) {
      throw new BatchUploadError(
        `削除された現場調査にはアップロードできません: ${input.surveyId}`,
        'SURVEY_DELETED'
      );
    }

    // 既存の画像数を取得（表示順序の開始位置を決定）
    const existingImageCount = await this.prisma.surveyImage.count({
      where: { surveyId: input.surveyId },
    });

    const results: UploadSuccessResult[] = [];
    const errors: UploadErrorInfo[] = [];
    const total = input.files.length;

    // ファイルを5件ずつのバッチに分割
    const batches = this.splitIntoBatches(input.files, BatchUploadService.BATCH_SIZE);

    let processedCount = 0;

    // 各バッチを順次処理
    for (const batch of batches) {
      for (let i = 0; i < batch.length; i++) {
        const file = batch[i]!;
        const globalIndex = processedCount;
        const displayOrder = existingImageCount + globalIndex + 1;

        try {
          const result = await this.uploadSingleFile(input.surveyId, file, displayOrder);
          results.push(result);
        } catch (error) {
          errors.push({
            index: globalIndex,
            filename: file.originalname,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        processedCount++;

        // 進捗コールバックを呼び出し
        if (onProgress) {
          onProgress({
            total,
            completed: results.length,
            current: processedCount,
            results: [...results],
            errors: [...errors],
          });
        }
      }
    }

    return {
      total,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * ファイルをバッチに分割
   *
   * @param files - ファイル配列
   * @param batchSize - バッチサイズ
   * @returns バッチ配列
   */
  private splitIntoBatches(files: UploadFile[], batchSize: number): UploadFile[][] {
    const batches: UploadFile[][] = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 単一ファイルをアップロード
   *
   * @param surveyId - 現場調査ID
   * @param file - アップロードファイル
   * @param displayOrder - 表示順序
   * @returns アップロード成功結果
   */
  private async uploadSingleFile(
    surveyId: string,
    file: UploadFile,
    displayOrder: number
  ): Promise<UploadSuccessResult> {
    // ファイルのバリデーション
    this.surveyImageService.validateFile(file);

    // 画像処理（圧縮・サムネイル生成）
    const processed = await this.imageProcessor.processImage(file.buffer);

    // ファイル名のサニタイズ
    const sanitizedFilename = this.surveyImageService.sanitizeFileName(file.originalname);

    // ストレージパスを生成
    const timestamp = Date.now();
    const originalPath = `surveys/${surveyId}/${timestamp}_${sanitizedFilename}`;
    const thumbnailPath = `surveys/${surveyId}/${timestamp}_thumb_${sanitizedFilename}`;

    // S3にアップロード
    await this.uploadToS3(originalPath, processed.original.buffer, file.mimetype);
    await this.uploadToS3(thumbnailPath, processed.thumbnail, file.mimetype);

    // データベースに保存
    const imageRecord = await this.prisma.surveyImage.create({
      data: {
        surveyId,
        originalPath,
        thumbnailPath,
        fileName: sanitizedFilename,
        fileSize: processed.metadata.size,
        width: processed.metadata.width,
        height: processed.metadata.height,
        displayOrder,
      },
    });

    return {
      id: imageRecord.id,
      surveyId: imageRecord.surveyId,
      originalPath: imageRecord.originalPath,
      thumbnailPath: imageRecord.thumbnailPath,
      fileName: imageRecord.fileName,
      fileSize: imageRecord.fileSize,
      width: imageRecord.width,
      height: imageRecord.height,
      displayOrder: imageRecord.displayOrder,
      createdAt: imageRecord.createdAt,
    };
  }

  /**
   * S3にファイルをアップロード
   *
   * @param key - S3オブジェクトキー
   * @param buffer - ファイルバッファ
   * @param contentType - コンテンツタイプ
   */
  private async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await this.s3Client.send(command);
  }
}
