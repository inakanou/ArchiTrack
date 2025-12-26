/**
 * @fileoverview 画像処理サービス
 *
 * 画像の圧縮、サムネイル生成、メタデータ取得を担当します。
 *
 * Task 4.2: 画像圧縮・サムネイル生成機能
 * - Sharpによる画像処理
 * - 300KB超過時の段階的圧縮（品質を10%ずつ下げながらリサイズ、250KB〜350KB範囲に収める）
 * - サムネイル生成（200x200px）
 * - 画像メタデータ（幅・高さ・サイズ）の取得
 *
 * Requirements:
 * - 4.4: 画像アップロード完了時にサムネイルを自動生成する
 * - 4.6: ファイルサイズが上限（300KB）を超える場合、画像サイズと品質を段階的に下げて
 *        250KB〜350KBの範囲に圧縮した上で登録する
 *
 * @module services/image-processor
 */

/**
 * 画像処理エラー
 */
export class ImageProcessingError extends Error {
  readonly code: string;

  constructor(message: string, code: string, cause?: Error) {
    super(message, { cause });
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

/**
 * 画像メタデータ
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

/**
 * 圧縮結果
 */
export interface CompressedImage {
  buffer: Buffer;
  metadata: ImageMetadata;
  wasCompressed: boolean;
}

/**
 * 処理済み画像
 */
export interface ProcessedImage {
  original: CompressedImage;
  thumbnail: Buffer;
  metadata: ImageMetadata;
}

/**
 * Sharpインスタンスの型定義（テスト用モック対応）
 */
export interface SharpInstance {
  metadata(): Promise<{
    width?: number;
    height?: number;
    format?: string;
    size?: number;
  }>;
  resize(
    width: number,
    height: number,
    options?: { fit?: string; position?: string }
  ): SharpInstance;
  jpeg(options?: { quality?: number }): SharpInstance;
  png(options?: { compressionLevel?: number }): SharpInstance;
  webp(options?: { quality?: number }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}

/**
 * Sharp静的関数の型定義（テスト用モック対応）
 */
export interface SharpStatic {
  (input: Buffer): SharpInstance;
}

/**
 * 画像処理サービス
 *
 * Sharpを使用した画像処理を提供します。
 */
export class ImageProcessorService {
  /**
   * 最大ファイルサイズ（300KB）
   */
  static readonly MAX_SIZE_BYTES = 300 * 1024;

  /**
   * 圧縮目標の下限（250KB）
   */
  static readonly TARGET_MIN_SIZE_BYTES = 250 * 1024;

  /**
   * 圧縮目標の上限（350KB）
   */
  static readonly TARGET_MAX_SIZE_BYTES = 350 * 1024;

  /**
   * サムネイル幅（200px）
   */
  static readonly THUMBNAIL_WIDTH = 200;

  /**
   * サムネイル高さ（200px）
   */
  static readonly THUMBNAIL_HEIGHT = 200;

  /**
   * 品質減少ステップ（10%）
   */
  static readonly QUALITY_STEP = 10;

  /**
   * 最小品質（30%）
   */
  private static readonly MIN_QUALITY = 30;

  /**
   * リサイズステップ（50%）
   */
  private static readonly RESIZE_STEP = 0.5;

  /**
   * 最小リサイズ比率（25%）
   */
  private static readonly MIN_RESIZE_RATIO = 0.25;

  private readonly sharp: SharpStatic;

  constructor(sharp: SharpStatic) {
    this.sharp = sharp;
  }

  /**
   * 画像メタデータを取得
   *
   * @param buffer - 画像バッファ
   * @returns 画像メタデータ
   * @throws {ImageProcessingError} メタデータ取得に失敗した場合
   */
  async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    try {
      const instance = this.sharp(buffer);
      const metadata = await instance.metadata();

      if (!metadata.width || !metadata.height) {
        throw new ImageProcessingError(
          '画像のメタデータが不正です。幅または高さが取得できませんでした。',
          'INVALID_METADATA'
        );
      }

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: metadata.size || buffer.length,
      };
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError(
        '画像メタデータの取得に失敗しました。',
        'METADATA_EXTRACTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * サムネイルを生成
   *
   * Requirements: 4.4
   *
   * @param buffer - 元画像バッファ
   * @param width - サムネイル幅（デフォルト: 200px）
   * @param height - サムネイル高さ（デフォルト: 200px）
   * @returns サムネイルバッファ
   * @throws {ImageProcessingError} サムネイル生成に失敗した場合
   */
  async generateThumbnail(
    buffer: Buffer,
    width: number = ImageProcessorService.THUMBNAIL_WIDTH,
    height: number = ImageProcessorService.THUMBNAIL_HEIGHT
  ): Promise<Buffer> {
    try {
      const metadata = await this.getMetadata(buffer);
      const instance = this.sharp(buffer);

      // サムネイルサイズにリサイズ（カバーモードで中央を切り抜き）
      instance.resize(width, height, {
        fit: 'cover',
        position: 'centre',
      });

      // フォーマットに応じた出力設定
      this.applyFormatSettings(instance, metadata.format, 80);

      return await instance.toBuffer();
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError(
        'サムネイルの生成に失敗しました。',
        'THUMBNAIL_GENERATION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 画像を圧縮
   *
   * Requirements: 4.6
   * 300KB超過時は品質を10%ずつ下げながら、250KB〜350KBの範囲に収める
   *
   * @param buffer - 元画像バッファ
   * @returns 圧縮結果
   * @throws {ImageProcessingError} 圧縮に失敗した場合
   */
  async compressImage(buffer: Buffer): Promise<CompressedImage> {
    try {
      const originalMetadata = await this.getMetadata(buffer);

      // 300KB以下の場合は圧縮不要
      if (originalMetadata.size <= ImageProcessorService.MAX_SIZE_BYTES) {
        return {
          buffer,
          metadata: originalMetadata,
          wasCompressed: false,
        };
      }

      // 段階的圧縮を実行
      return await this.performCompression(buffer, originalMetadata);
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError(
        '画像の圧縮に失敗しました。',
        'COMPRESSION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 画像を処理（圧縮 + サムネイル生成）
   *
   * @param buffer - 元画像バッファ
   * @returns 処理済み画像
   * @throws {ImageProcessingError} 処理に失敗した場合
   */
  async processImage(buffer: Buffer): Promise<ProcessedImage> {
    // 圧縮処理
    const compressedResult = await this.compressImage(buffer);

    // サムネイル生成（圧縮済み画像から生成）
    const thumbnail = await this.generateThumbnail(compressedResult.buffer);

    // 最終的なメタデータを取得
    const finalMetadata = await this.getMetadata(compressedResult.buffer);

    return {
      original: compressedResult,
      thumbnail,
      metadata: finalMetadata,
    };
  }

  /**
   * 段階的圧縮を実行
   *
   * @param buffer - 元画像バッファ
   * @param originalMetadata - 元画像メタデータ
   * @returns 圧縮結果
   */
  private async performCompression(
    buffer: Buffer,
    originalMetadata: ImageMetadata
  ): Promise<CompressedImage> {
    let currentBuffer = buffer;
    let currentQuality = 90; // 初期品質
    let resizeRatio = 1.0;
    let currentMetadata = originalMetadata;

    // 品質を段階的に下げて圧縮
    while (
      currentMetadata.size > ImageProcessorService.TARGET_MAX_SIZE_BYTES &&
      currentQuality >= ImageProcessorService.MIN_QUALITY
    ) {
      const instance = this.sharp(buffer);

      // リサイズが必要な場合は適用
      if (resizeRatio < 1.0) {
        const newWidth = Math.round(originalMetadata.width * resizeRatio);
        const newHeight = Math.round(originalMetadata.height * resizeRatio);
        instance.resize(newWidth, newHeight);
      }

      // 品質設定を適用
      this.applyFormatSettings(instance, originalMetadata.format, currentQuality);

      currentBuffer = await instance.toBuffer();
      currentMetadata = await this.getMetadata(currentBuffer);

      // サイズが目標範囲内ならOK
      if (this.isWithinTargetRange(currentMetadata.size)) {
        break;
      }

      // 品質を下げる
      currentQuality -= ImageProcessorService.QUALITY_STEP;
    }

    // 品質だけでは不十分な場合、リサイズを適用
    while (
      currentMetadata.size > ImageProcessorService.TARGET_MAX_SIZE_BYTES &&
      resizeRatio > ImageProcessorService.MIN_RESIZE_RATIO
    ) {
      resizeRatio *= ImageProcessorService.RESIZE_STEP;
      const instance = this.sharp(buffer);

      const newWidth = Math.round(originalMetadata.width * resizeRatio);
      const newHeight = Math.round(originalMetadata.height * resizeRatio);
      instance.resize(newWidth, newHeight);

      // 最低品質で圧縮
      this.applyFormatSettings(
        instance,
        originalMetadata.format,
        ImageProcessorService.MIN_QUALITY
      );

      currentBuffer = await instance.toBuffer();
      currentMetadata = await this.getMetadata(currentBuffer);

      if (this.isWithinTargetRange(currentMetadata.size)) {
        break;
      }
    }

    return {
      buffer: currentBuffer,
      metadata: currentMetadata,
      wasCompressed: true,
    };
  }

  /**
   * サイズが目標範囲内かチェック
   *
   * @param size - ファイルサイズ
   * @returns 目標範囲内ならtrue
   */
  private isWithinTargetRange(size: number): boolean {
    return (
      size >= ImageProcessorService.TARGET_MIN_SIZE_BYTES &&
      size <= ImageProcessorService.TARGET_MAX_SIZE_BYTES
    );
  }

  /**
   * フォーマットに応じた出力設定を適用
   *
   * @param instance - Sharpインスタンス
   * @param format - 画像フォーマット
   * @param quality - 品質（0-100）
   */
  private applyFormatSettings(instance: SharpInstance, format: string, quality: number): void {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        instance.jpeg({ quality });
        break;
      case 'png':
        // PNGは品質ではなく圧縮レベル（0-9）を使用
        // 品質が高いほど圧縮レベルは低く
        const compressionLevel = Math.round(9 - (quality / 100) * 6);
        instance.png({ compressionLevel });
        break;
      case 'webp':
        instance.webp({ quality });
        break;
      default:
        // 不明なフォーマットの場合はJPEGとして処理
        instance.jpeg({ quality });
    }
  }
}
