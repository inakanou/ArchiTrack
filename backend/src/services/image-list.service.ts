/**
 * @fileoverview 画像一覧取得サービス
 *
 * 現場調査画像の一覧取得機能を提供します。
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - GET /api/site-surveys/:id/images（一覧）
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 *
 * @module services/image-list
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { SignedUrlService } from './signed-url.service.js';

/**
 * 画像情報（基本情報）
 */
export interface SurveyImageInfo {
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
 * 署名付きURLを含む画像情報
 */
export interface ImageWithUrls extends SurveyImageInfo {
  originalUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * サービス依存関係
 */
export interface ImageListServiceDependencies {
  prisma: PrismaClient;
  signedUrlService: SignedUrlService;
}

/**
 * 画像一覧取得サービス
 *
 * 現場調査に紐付く画像の一覧取得機能を提供します。
 *
 * Requirements:
 * - 4.9: 画像一覧を固定の表示順序で表示する
 */
export class ImageListService {
  private readonly prisma: PrismaClient;
  private readonly signedUrlService: SignedUrlService;

  constructor(deps: ImageListServiceDependencies) {
    this.prisma = deps.prisma;
    this.signedUrlService = deps.signedUrlService;
  }

  /**
   * 現場調査に紐付く画像一覧を取得
   *
   * displayOrderの昇順でソートして返します。
   *
   * Requirements: 4.9
   *
   * @param surveyId - 現場調査ID
   * @returns 画像情報の配列
   */
  async findBySurveyId(surveyId: string): Promise<SurveyImageInfo[]> {
    const images = await this.prisma.surveyImage.findMany({
      where: { surveyId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        surveyId: true,
        fileName: true,
        fileSize: true,
        width: true,
        height: true,
        displayOrder: true,
        originalPath: true,
        thumbnailPath: true,
        createdAt: true,
      },
    });

    return images;
  }

  /**
   * 現場調査に紐付く画像一覧を署名付きURL付きで取得
   *
   * 各画像に対して署名付きURLを生成して返します。
   * URL生成に失敗した画像にはnullが設定されます。
   *
   * Requirements: 4.9, 4.1
   *
   * @param surveyId - 現場調査ID
   * @param userId - ユーザーID（アクセス権限検証用）
   * @returns 署名付きURL付き画像情報の配列
   */
  async findBySurveyIdWithUrls(surveyId: string, userId: string): Promise<ImageWithUrls[]> {
    const images = await this.findBySurveyId(surveyId);

    if (images.length === 0) {
      return [];
    }

    // 画像IDの配列を作成
    const imageIds = images.map((img) => img.id);

    // 一括で署名付きURLを取得（原画像用）
    const originalUrlResults = await this.signedUrlService.generateBatchSignedUrls(
      imageIds,
      userId,
      'original'
    );

    // 結果をマップに変換（高速アクセス用）
    const originalUrlMap = new Map<string, string | null>();
    for (const result of originalUrlResults) {
      if (result.success) {
        originalUrlMap.set(result.imageId, result.url);
      } else {
        originalUrlMap.set(result.imageId, null);
      }
    }

    // 各画像に署名付きURLを付与
    const imagesWithUrls: ImageWithUrls[] = [];

    for (const image of images) {
      let thumbnailUrl: string | null = null;

      // サムネイルURLを個別に取得
      try {
        thumbnailUrl = await this.signedUrlService.generateSignedUrl(image.id, 'thumbnail');
      } catch {
        thumbnailUrl = null;
      }

      imagesWithUrls.push({
        ...image,
        originalUrl: originalUrlMap.get(image.id) ?? null,
        thumbnailUrl,
      });
    }

    return imagesWithUrls;
  }

  /**
   * 現場調査に紐付く画像数を取得
   *
   * @param surveyId - 現場調査ID
   * @returns 画像数
   */
  async countBySurveyId(surveyId: string): Promise<number> {
    return this.prisma.surveyImage.count({
      where: { surveyId },
    });
  }
}
