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
 * Task 38.1: バッチ更新APIでdisplayOrderを連番に再計算する
 * - displayOrder重複チェック
 * - 送信された相対順序を1, 2, 3...の連番に正規化
 * - 欠番や重複があっても正しくソート・再番号付け
 *
 * Requirements:
 * - 10.4: 写真コメント（最大2000文字）
 * - 10.8: 報告書出力対象画像の選択
 * - 10.9: displayOrderの正規化（連番に再計算）
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
 * 一括更新用メタデータ入力
 *
 * Task 33.1: 一括更新機能
 * Task 38.1: displayOrderサポート追加
 */
export interface BatchUpdateImageMetadataInput extends UpdateImageMetadataInput {
  /** 画像ID */
  id: string;
  /** 表示順序（送信された値は連番に正規化される） */
  displayOrder?: number;
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
   * Task 28.1: 報告書出力対象画像の取得機能を実装する
   * - includeInReport=trueの画像のみを取得
   * - 表示順序（displayOrder）の昇順でソート
   * - 画像に紐付けられたコメントを取得
   *
   * Requirements:
   * - 11.2: PDF出力対象として報告書出力フラグがONの写真のみを含める
   * - 11.3: PDF出力時に写真を表示順序の通りに配置する
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
   * 複数の画像メタデータを一括で更新する
   *
   * Task 33.1: 写真一覧管理パネルを手動保存方式に変更する
   * - 複数の画像メタデータを一括で受け取る
   * - トランザクション内で一括更新
   * - 更新結果を返却
   *
   * Task 38.1: バッチ更新APIでdisplayOrderを連番に再計算する
   * - displayOrderが含まれる場合は相対順序を1, 2, 3...の連番に正規化
   * - 欠番や重複があっても正しくソート・再番号付け
   *
   * Requirements:
   * - 10.8: 保存ボタンで一括保存
   * - 10.9: displayOrderの正規化（連番に再計算）
   *
   * @param inputs - 更新データの配列
   * @returns 更新後の画像メタデータの配列
   * @throws {ImageNotFoundError} 画像が存在しない場合
   * @throws {CommentTooLongError} コメントが2000文字を超える場合
   */
  async updateMetadataBatch(inputs: BatchUpdateImageMetadataInput[]): Promise<ImageMetadata[]> {
    // 空の配列の場合は即座に空の結果を返す
    if (inputs.length === 0) {
      return [];
    }

    // 事前バリデーション: コメント長のチェック
    for (const input of inputs) {
      if (input.comment !== undefined && input.comment !== null) {
        if (input.comment.length > ImageMetadataService.MAX_COMMENT_LENGTH) {
          throw new CommentTooLongError(
            input.comment.length,
            ImageMetadataService.MAX_COMMENT_LENGTH
          );
        }
      }
    }

    // 画像の存在確認
    const imageIds = inputs.map((input) => input.id);
    const existingImages = await this.prisma.surveyImage.findMany({
      where: { id: { in: imageIds } },
      select: { id: true },
    });

    const existingIdSet = new Set(existingImages.map((img) => img.id));
    for (const input of inputs) {
      if (!existingIdSet.has(input.id)) {
        throw new ImageNotFoundError(input.id);
      }
    }

    // displayOrder正規化: displayOrderが指定されたものを抽出しソート
    const inputsWithDisplayOrder = inputs.filter((input) => input.displayOrder !== undefined);
    const normalizedDisplayOrders = this.normalizeDisplayOrders(inputsWithDisplayOrder);

    // トランザクション内で一括更新
    const updatedImages = await this.prisma.$transaction(async (tx) => {
      const results: SurveyImage[] = [];

      for (const input of inputs) {
        const updateData: {
          comment?: string | null;
          includeInReport?: boolean;
          displayOrder?: number;
        } = {};

        if (input.comment !== undefined) {
          updateData.comment = input.comment;
        }

        if (input.includeInReport !== undefined) {
          updateData.includeInReport = input.includeInReport;
        }

        // displayOrderが指定されている場合は正規化された値を使用
        const normalizedOrder = normalizedDisplayOrders.get(input.id);
        if (normalizedOrder !== undefined) {
          updateData.displayOrder = normalizedOrder;
        }

        // 更新データがある場合のみ更新を実行
        if (Object.keys(updateData).length > 0) {
          const updated = await tx.surveyImage.update({
            where: { id: input.id },
            data: updateData,
          });
          results.push(updated);
        } else {
          // 更新データがない場合は現在の画像を取得して追加
          const current = await tx.surveyImage.findUnique({
            where: { id: input.id },
          });
          if (current) {
            results.push(current);
          }
        }
      }

      return results;
    });

    return updatedImages.map((image) => this.mapToImageMetadata(image));
  }

  /**
   * displayOrderを1から始まる連番に正規化する
   *
   * Task 38.1: バッチ更新APIでdisplayOrderを連番に再計算する
   *
   * @param inputs - displayOrderが指定された更新データの配列
   * @returns 画像IDと正規化されたdisplayOrderのマップ
   */
  private normalizeDisplayOrders(inputs: BatchUpdateImageMetadataInput[]): Map<string, number> {
    const result = new Map<string, number>();

    if (inputs.length === 0) {
      return result;
    }

    // displayOrderでソート（元の配列順序を保持するためにindexも含める）
    const sortedInputs = inputs
      .map((input, index) => ({ input, originalIndex: index }))
      .sort((a, b) => {
        const orderA = a.input.displayOrder ?? 0;
        const orderB = b.input.displayOrder ?? 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // 同じdisplayOrderの場合は元の配列順序を保持
        return a.originalIndex - b.originalIndex;
      });

    // 1から始まる連番を割り当て
    sortedInputs.forEach(({ input }, index) => {
      result.set(input.id, index + 1);
    });

    return result;
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
