/**
 * @fileoverview 画像順序変更サービス
 *
 * 現場調査画像の表示順序変更機能を提供します。
 *
 * Task 4.4: 画像順序変更機能を実装する
 * - ドラッグアンドドロップによる順序変更のバックエンド対応
 * - 一括更新処理
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 * - 4.10: ユーザーが画像をドラッグアンドドロップすると、画像の表示順序を変更して保存する
 *
 * @module services/image-order
 */

import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * 画像順序エラー
 *
 * 画像順序の更新処理で発生するエラーを表します。
 */
export class ImageOrderError extends Error {
  readonly code: string;

  constructor(message: string, code: string, cause?: Error) {
    super(message, { cause });
    this.name = 'ImageOrderError';
    this.code = code;
  }
}

/**
 * 画像順序更新入力
 *
 * 単一画像の順序更新情報を表します。
 */
export interface ImageOrderUpdate {
  /** 画像ID */
  id: string;
  /** 新しい表示順序（1以上の正の整数） */
  order: number;
}

/**
 * サービス依存関係
 */
export interface ImageOrderServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 画像順序変更サービス
 *
 * 現場調査画像の表示順序を一括で更新するサービスです。
 * ドラッグアンドドロップによる順序変更のバックエンド対応を提供します。
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 * - 4.10: ユーザーが画像をドラッグアンドドロップすると、画像の表示順序を変更して保存する
 */
export class ImageOrderService {
  private readonly prisma: PrismaClient;

  constructor(deps: ImageOrderServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 画像の表示順序を一括更新
   *
   * 指定された現場調査に属する画像の表示順序を一括で更新します。
   * すべての更新はトランザクション内で実行され、一部の更新が失敗した場合は
   * 全体がロールバックされます。
   *
   * Requirements:
   * - 4.9: 画像一覧を固定の表示順序で表示する
   * - 4.10: ユーザーが画像をドラッグアンドドロップすると、画像の表示順序を変更して保存する
   *
   * @param surveyId - 現場調査ID
   * @param orders - 画像順序更新情報の配列
   * @throws {ImageOrderError} 現場調査が存在しない場合
   * @throws {ImageOrderError} 現場調査が削除済みの場合
   * @throws {ImageOrderError} 順序情報が空の場合
   * @throws {ImageOrderError} 存在しない画像IDが含まれる場合
   * @throws {ImageOrderError} 無効な順序値が含まれる場合
   * @throws {ImageOrderError} 順序値が重複している場合
   * @throws {ImageOrderError} 画像IDが重複している場合
   */
  async updateImageOrder(surveyId: string, orders: ImageOrderUpdate[]): Promise<void> {
    // 現場調査の存在確認
    const survey = await this.prisma.siteSurvey.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new ImageOrderError(`現場調査が見つかりません: ${surveyId}`, 'SURVEY_NOT_FOUND');
    }

    if (survey.deletedAt) {
      throw new ImageOrderError(
        `削除された現場調査の画像順序は変更できません: ${surveyId}`,
        'SURVEY_DELETED'
      );
    }

    // 順序情報のバリデーション
    if (orders.length === 0) {
      throw new ImageOrderError('順序情報が指定されていません。', 'EMPTY_ORDERS');
    }

    // 画像IDの重複チェック
    const imageIds = orders.map((o) => o.id);
    const uniqueImageIds = new Set(imageIds);
    if (uniqueImageIds.size !== imageIds.length) {
      throw new ImageOrderError('画像IDが重複しています。', 'DUPLICATE_IMAGE_IDS');
    }

    // 順序値の重複チェック
    const orderValues = orders.map((o) => o.order);
    const uniqueOrderValues = new Set(orderValues);
    if (uniqueOrderValues.size !== orderValues.length) {
      throw new ImageOrderError('順序値が重複しています。', 'DUPLICATE_ORDER_VALUES');
    }

    // 順序値のバリデーション（1以上の正の整数）
    for (const order of orders) {
      if (order.order < 1 || !Number.isInteger(order.order)) {
        throw new ImageOrderError(
          `無効な順序値です: ${order.order}。順序は1以上の正の整数である必要があります。`,
          'INVALID_ORDER_VALUE'
        );
      }
    }

    // 指定された画像が現場調査に属しているか確認
    const existingImages = await this.prisma.surveyImage.findMany({
      where: { surveyId },
      select: { id: true, surveyId: true, displayOrder: true },
    });

    const existingImageIds = new Set(existingImages.map((img) => img.id));

    for (const order of orders) {
      if (!existingImageIds.has(order.id)) {
        throw new ImageOrderError(
          `存在しない画像ID、または現場調査に属していない画像です: ${order.id}`,
          'IMAGE_NOT_FOUND'
        );
      }
    }

    // トランザクションで一括更新
    await this.prisma.$transaction(async (tx) => {
      for (const order of orders) {
        await tx.surveyImage.update({
          where: { id: order.id },
          data: { displayOrder: order.order },
        });
      }
    });
  }
}
