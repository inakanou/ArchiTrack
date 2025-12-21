/**
 * @fileoverview 画像メタデータサービス
 *
 * 画像単位でのコメントと報告書出力フラグの管理を担当します。
 *
 * Task 27.1: 画像メタデータサービスを実装する
 * - 画像単位でのコメント保存・取得機能
 * - 報告書出力フラグ（includeInReport）の管理機能
 * - コメント最大2000文字のバリデーション
 * - includeInReportのデフォルト値をfalseに設定
 *
 * Requirements:
 * - 10.4: 写真コメント（最大2000文字）
 * - 10.8: 報告書出力対象画像の選択
 *
 * @module services/image-metadata
 */

import type { PrismaClient, SurveyImage } from '../generated/prisma/client.js';

/**
 * 画像が見つからないエラー
 */
export class ImageNotFoundError extends Error {
  readonly code = 'IMAGE_NOT_FOUND';
  readonly imageId: string;

  constructor(imageId: string) {
    super(`画像が見つかりません: ${imageId}`);
    this.name = 'ImageNotFoundError';
    this.imageId = imageId;
  }
}

/**
 * コメントが長すぎるエラー
 */
export class CommentTooLongError extends Error {
  readonly code = 'COMMENT_TOO_LONG';
  readonly length: number;
  readonly maxLength: number;

  constructor(length: number, maxLength: number) {
    super(`コメントが長すぎます。最大${maxLength}文字までです（現在: ${length}文字）`);
    this.name = 'CommentTooLongError';
    this.length = length;
    this.maxLength = maxLength;
  }
}

/**
 * メタデータ更新入力
 */
export interface UpdateImageMetadataInput {
  /** 写真コメント（最大2000文字、nullでクリア） */
  comment?: string | null;
  /** 報告書出力フラグ */
  includeInReport?: boolean;
}

/**
 * 画像メタデータ
 */
export interface ImageMetadata {
  id: string;
  surveyId: string;
  originalPath: string;
  thumbnailPath: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  comment: string | null;
  includeInReport: boolean;
  createdAt: Date;
}

/**
 * サービス依存関係
 */
export interface ImageMetadataServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 画像メタデータサービス
 *
 * 画像のコメントと報告書出力フラグの管理を担当します。
 */
export class ImageMetadataService {
  /**
   * コメントの最大長
   */
  static readonly MAX_COMMENT_LENGTH = 2000;

  private readonly prisma: PrismaClient;

  constructor(deps: ImageMetadataServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 画像メタデータを更新する
   *
   * @param imageId - 画像ID
   * @param input - 更新データ
   * @returns 更新後の画像メタデータ
   * @throws {ImageNotFoundError} 画像が存在しない場合
   * @throws {CommentTooLongError} コメントが2000文字を超える場合
   */
  async updateMetadata(imageId: string, input: UpdateImageMetadataInput): Promise<ImageMetadata> {
    // 画像の存在確認
    const existingImage = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
    });

    if (!existingImage) {
      throw new ImageNotFoundError(imageId);
    }

    // コメントのバリデーション
    if (input.comment !== undefined && input.comment !== null) {
      if (input.comment.length > ImageMetadataService.MAX_COMMENT_LENGTH) {
        throw new CommentTooLongError(
          input.comment.length,
          ImageMetadataService.MAX_COMMENT_LENGTH
        );
      }
    }

    // 更新データの構築
    const updateData: { comment?: string | null; includeInReport?: boolean } = {};
    let hasUpdates = false;

    if (input.comment !== undefined) {
      updateData.comment = input.comment;
      hasUpdates = true;
    }

    if (input.includeInReport !== undefined) {
      updateData.includeInReport = input.includeInReport;
      hasUpdates = true;
    }

    // 更新データがない場合は現在の値を返す
    if (!hasUpdates) {
      return this.mapToImageMetadata(existingImage);
    }

    // 更新実行
    const updatedImage = await this.prisma.surveyImage.update({
      where: { id: imageId },
      data: updateData,
    });

    return this.mapToImageMetadata(updatedImage);
  }

  /**
   * 報告書出力対象の画像を取得する
   *
   * @param surveyId - 現場調査ID
   * @returns 報告書出力対象の画像リスト（表示順序でソート）
   */
  async findForReport(surveyId: string): Promise<ImageMetadata[]> {
    const images = await this.prisma.surveyImage.findMany({
      where: {
        surveyId,
        includeInReport: true,
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });

    return images.map((image) => this.mapToImageMetadata(image));
  }

  /**
   * 画像メタデータを取得する
   *
   * @param imageId - 画像ID
   * @returns 画像メタデータ、存在しない場合はnull
   */
  async getMetadata(imageId: string): Promise<ImageMetadata | null> {
    const image = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      return null;
    }

    return this.mapToImageMetadata(image);
  }

  /**
   * SurveyImageをImageMetadataにマッピングする
   */
  private mapToImageMetadata(image: SurveyImage): ImageMetadata {
    return {
      id: image.id,
      surveyId: image.surveyId,
      originalPath: image.originalPath,
      thumbnailPath: image.thumbnailPath,
      fileName: image.fileName,
      fileSize: image.fileSize,
      width: image.width,
      height: image.height,
      displayOrder: image.displayOrder,
      comment: image.comment,
      includeInReport: image.includeInReport,
      createdAt: image.createdAt,
    };
  }
}
