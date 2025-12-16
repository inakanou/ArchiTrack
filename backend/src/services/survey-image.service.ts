/**
 * @fileoverview 現場調査画像サービス
 *
 * 画像のアップロード、バリデーション、ストレージ管理を担当します。
 *
 * Task 4.1: 画像アップロード機能
 * - Multerによるファイル受信（メモリストレージ）
 * - ファイル形式バリデーション（JPEG、PNG、WEBP）
 * - MIMEタイプとマジックバイトの二重検証
 * - ファイル名サニタイズ
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し現場調査に紐付ける
 * - 4.5: 許可されない形式の場合エラーメッセージを表示してアップロードを拒否する
 * - 4.8: JPEG、PNG、WEBP形式の画像ファイルをサポートする
 *
 * @module services/survey-image
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { S3Client } from '@aws-sdk/client-s3';

/**
 * ファイル形式エラー
 *
 * サポートされていないMIMEタイプのファイルがアップロードされた場合にスローされます。
 */
export class InvalidFileTypeError extends Error {
  readonly code = 'INVALID_FILE_TYPE';
  readonly mimeType: string;

  constructor(mimeType: string) {
    super(
      `サポートされていないファイル形式です: ${mimeType}。サポートされている形式: JPEG, PNG, WEBP`
    );
    this.name = 'InvalidFileTypeError';
    this.mimeType = mimeType;
  }
}

/**
 * マジックバイト検証エラー
 *
 * ファイルのバイナリ内容がMIMEタイプと一致しない場合にスローされます。
 */
export class InvalidMagicBytesError extends Error {
  readonly code = 'INVALID_MAGIC_BYTES';
  readonly expectedMimeType: string;

  constructor(expectedMimeType: string) {
    super(`ファイルの内容がMIMEタイプと一致しません。期待されるタイプ: ${expectedMimeType}`);
    this.name = 'InvalidMagicBytesError';
    this.expectedMimeType = expectedMimeType;
  }
}

/**
 * 現場調査が見つからないエラー
 */
export class SurveySurveyNotFoundError extends Error {
  readonly code = 'SURVEY_NOT_FOUND';
  readonly surveyId: string;

  constructor(surveyId: string) {
    super(`現場調査が見つかりません: ${surveyId}`);
    this.name = 'SurveySurveyNotFoundError';
    this.surveyId = surveyId;
  }
}

/**
 * アップロードファイル情報
 */
export interface UploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * アップロード入力
 */
export interface UploadImageInput {
  surveyId: string;
  file: UploadFile;
  displayOrder?: number;
}

/**
 * 画像情報（作成・取得用）
 */
export interface SurveyImageInfo {
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
 * サービス依存関係
 */
export interface SurveyImageServiceDependencies {
  prisma: PrismaClient;
  s3Client: S3Client;
  bucketName: string;
}

/**
 * マジックバイト定義
 *
 * 各画像フォーマットのファイルシグネチャ（マジックバイト）を定義します。
 */
const MAGIC_BYTES = {
  // JPEG: FFD8FFで始まる
  jpeg: {
    signatures: [
      [0xff, 0xd8, 0xff, 0xe0], // JFIF
      [0xff, 0xd8, 0xff, 0xe1], // EXIF
      [0xff, 0xd8, 0xff, 0xe8], // SPIFF
      [0xff, 0xd8, 0xff, 0xdb], // 量子化テーブル
      [0xff, 0xd8, 0xff, 0xee], // Adobe JPEG
    ],
    minLength: 4,
  },
  // PNG: 89504E470D0A1A0Aで始まる
  png: {
    signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    minLength: 8,
  },
  // WebP: RIFFで始まり、オフセット8-11がWEBP
  webp: {
    // RIFF + any 4 bytes + WEBP
    signatures: [[0x52, 0x49, 0x46, 0x46]], // RIFF header check
    webpOffset: 8,
    webpSignature: [0x57, 0x45, 0x42, 0x50], // WEBP
    minLength: 12,
  },
} as const;

/**
 * 現場調査画像サービス
 *
 * 画像のアップロード、バリデーション、ストレージ管理を担当します。
 */
export class SurveyImageService {
  /**
   * サポートされるMIMEタイプ
   */
  static readonly ALLOWED_MIME_TYPES: readonly string[] = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ] as const;

  /**
   * サポートされるファイル拡張子
   */
  static readonly ALLOWED_EXTENSIONS: readonly string[] = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
  ] as const;

  /**
   * ファイル名の最大長
   */
  private static readonly MAX_FILENAME_LENGTH = 255;

  /**
   * Prismaクライアント
   * @internal Used in subsequent tasks (4.2+) for database operations
   */
  protected readonly prisma: PrismaClient;

  /**
   * S3クライアント
   * @internal Used in subsequent tasks (4.2+) for storage operations
   */
  protected readonly s3Client: S3Client;

  /**
   * バケット名
   * @internal Used in subsequent tasks (4.2+) for storage operations
   */
  protected readonly bucketName: string;

  constructor(deps: SurveyImageServiceDependencies) {
    this.prisma = deps.prisma;
    this.s3Client = deps.s3Client;
    this.bucketName = deps.bucketName;
  }

  /**
   * バケット名を取得
   * @returns バケット名
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * S3クライアントを取得
   * @returns S3クライアント
   */
  getS3Client(): S3Client {
    return this.s3Client;
  }

  /**
   * Prismaクライアントを取得
   * @returns Prismaクライアント
   */
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * MIMEタイプのバリデーション
   *
   * Requirements: 4.5, 4.8
   * JPEG、PNG、WEBP形式のみサポート
   *
   * @param mimeType - 検証するMIMEタイプ
   * @throws {InvalidFileTypeError} サポートされていないMIMEタイプの場合
   */
  validateMimeType(mimeType: string): void {
    if (!SurveyImageService.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new InvalidFileTypeError(mimeType);
    }
  }

  /**
   * マジックバイトのバリデーション
   *
   * ファイルのバイナリ内容を検証し、MIMEタイプと一致することを確認します。
   * これによりファイル拡張子の偽装を検出できます。
   *
   * Requirements: 4.5, 4.8
   *
   * @param buffer - ファイルのバッファ
   * @param mimeType - 期待されるMIMEタイプ
   * @throws {InvalidMagicBytesError} マジックバイトがMIMEタイプと一致しない場合
   */
  validateMagicBytes(buffer: Buffer, mimeType: string): void {
    if (buffer.length === 0) {
      throw new InvalidMagicBytesError(mimeType);
    }

    switch (mimeType) {
      case 'image/jpeg':
        this.validateJpegMagicBytes(buffer);
        break;
      case 'image/png':
        this.validatePngMagicBytes(buffer);
        break;
      case 'image/webp':
        this.validateWebpMagicBytes(buffer);
        break;
      default:
        throw new InvalidMagicBytesError(mimeType);
    }
  }

  /**
   * JPEGマジックバイトの検証
   */
  private validateJpegMagicBytes(buffer: Buffer): void {
    const { signatures, minLength } = MAGIC_BYTES.jpeg;

    if (buffer.length < minLength) {
      throw new InvalidMagicBytesError('image/jpeg');
    }

    const isValid = signatures.some((signature) =>
      signature.every((byte, index) => buffer[index] === byte)
    );

    if (!isValid) {
      throw new InvalidMagicBytesError('image/jpeg');
    }
  }

  /**
   * PNGマジックバイトの検証
   */
  private validatePngMagicBytes(buffer: Buffer): void {
    const { signatures, minLength } = MAGIC_BYTES.png;

    if (buffer.length < minLength) {
      throw new InvalidMagicBytesError('image/png');
    }

    const signature = signatures[0];
    if (!signature) {
      throw new InvalidMagicBytesError('image/png');
    }

    const isValid = signature.every((byte, index) => buffer[index] === byte);

    if (!isValid) {
      throw new InvalidMagicBytesError('image/png');
    }
  }

  /**
   * WebPマジックバイトの検証
   *
   * WebPファイルはRIFFコンテナ形式を使用。
   * - オフセット0-3: "RIFF"
   * - オフセット8-11: "WEBP"
   */
  private validateWebpMagicBytes(buffer: Buffer): void {
    const { signatures, webpOffset, webpSignature, minLength } = MAGIC_BYTES.webp;

    if (buffer.length < minLength) {
      throw new InvalidMagicBytesError('image/webp');
    }

    // RIFF header check
    const riffSignature = signatures[0];
    if (!riffSignature) {
      throw new InvalidMagicBytesError('image/webp');
    }

    const hasRiffHeader = riffSignature.every((byte, index) => buffer[index] === byte);

    if (!hasRiffHeader) {
      throw new InvalidMagicBytesError('image/webp');
    }

    // WEBP signature check at offset 8
    const hasWebpSignature = webpSignature.every(
      (byte, index) => buffer[webpOffset + index] === byte
    );

    if (!hasWebpSignature) {
      throw new InvalidMagicBytesError('image/webp');
    }
  }

  /**
   * ファイル名のサニタイズ
   *
   * セキュリティ上危険な文字を除去し、安全なファイル名に変換します。
   * - パストラバーサル攻撃の防止
   * - 特殊文字の除去
   * - ファイル名長の制限
   *
   * @param filename - 元のファイル名
   * @returns サニタイズされたファイル名
   */
  sanitizeFileName(filename: string): string {
    // 空文字・空白のみの場合はフォールバック名を生成
    if (!filename || filename.trim() === '') {
      return `image_${Date.now()}`;
    }

    // Step 1: まず危険なシーケンスを全体から除去
    let sanitized = filename;

    // パストラバーサルシーケンスを除去 (../ や ..\)
    // 繰り返し除去することで、.../ や ..../ などもカバー
    while (sanitized.includes('..')) {
      sanitized = sanitized.replace(/\.\./g, '');
    }

    // ディレクトリセパレータを除去
    sanitized = sanitized.replace(/[/\\]/g, '');

    // Step 2: 拡張子を取得
    const lastDotIndex = sanitized.lastIndexOf('.');
    let baseName: string;
    let extension: string;

    if (lastDotIndex > 0) {
      baseName = sanitized.substring(0, lastDotIndex);
      extension = sanitized.substring(lastDotIndex).toLowerCase();
    } else {
      baseName = sanitized;
      extension = '';
    }

    // 危険な特殊文字を除去 (<>:"|?*)
    baseName = baseName.replace(/[<>:"|?*]/g, '');

    // スペースをアンダースコアに置換
    baseName = baseName.replace(/\s+/g, '_');

    // 日本語など非ASCII文字を除去し、英数字・アンダースコア・ハイフン・ドットのみ許可
    baseName = baseName.replace(/[^\w.\-]/g, '');

    // ベースネームが空になった場合はフォールバック
    if (baseName === '') {
      baseName = `image_${Date.now()}`;
    }

    // ファイル名長の制限
    const maxBaseLength = SurveyImageService.MAX_FILENAME_LENGTH - extension.length;
    if (baseName.length > maxBaseLength) {
      baseName = baseName.substring(0, maxBaseLength);
    }

    return baseName + extension;
  }

  /**
   * ファイルの総合バリデーション
   *
   * MIMEタイプとマジックバイトの二重検証を実行します。
   *
   * Requirements: 4.5, 4.8
   *
   * @param file - 検証するファイル
   * @throws {InvalidFileTypeError} サポートされていないMIMEタイプの場合
   * @throws {InvalidMagicBytesError} マジックバイトがMIMEタイプと一致しない場合
   */
  validateFile(file: UploadFile): void {
    // Step 1: MIMEタイプの検証
    this.validateMimeType(file.mimetype);

    // Step 2: マジックバイトの検証
    this.validateMagicBytes(file.buffer, file.mimetype);
  }

  /**
   * ストレージパスを生成
   *
   * @param surveyId - 現場調査ID
   * @param filename - ファイル名
   * @returns ストレージパス
   */
  getStoragePath(surveyId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitizedFilename = this.sanitizeFileName(filename);
    return `surveys/${surveyId}/${timestamp}_${sanitizedFilename}`;
  }
}
