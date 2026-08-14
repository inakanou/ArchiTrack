/**
 * @fileoverview 画像一覧取得サービス
 *
 * 現場調査画像の一覧取得機能を提供します。
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - GET /api/site-surveys/:id/images（一覧）
 *
 * Requirements:
 * - 4.10: 画像一覧を固定の表示順序で表示する
 *
 * @module services/image-list
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { SignedUrlService } from './signed-url.service.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import { SURVEY_IMAGE_ORDER_BY } from '../utils/survey-image-order.js';

/**
 * 署名付きURLの有効期限（秒）- 15分
 *
 * `SignedUrlService` の既定値と揃える。
 */
const SIGNED_URL_EXPIRES_IN = 900;

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
  annotatedThumbnailPath: string | null;
  createdAt: Date;
}

/**
 * 署名付きURLを含む画像情報
 */
export interface ImageWithUrls extends SurveyImageInfo {
  originalUrl: string | null;
  thumbnailUrl: string | null;
  annotatedThumbnailUrl: string | null;
  hasAnnotations: boolean;
  /** 描画された注釈の有無（Requirement 20.2、Task 115.13） */
  hasDrawnAnnotations: boolean;
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
 * - 4.10: 画像一覧を固定の表示順序で表示する
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
   * displayOrderは同一現場調査内で重複し得るため、並びが実行ごとに変わらないよう
   * 一意な鍵まで含めて並び替えます（Task 115.20 / Requirements 4.10）。
   *
   * Requirements: 4.10
   *
   * @param surveyId - 現場調査ID
   * @returns 画像情報の配列
   */
  async findBySurveyId(surveyId: string): Promise<SurveyImageInfo[]> {
    const images = await this.prisma.surveyImage.findMany({
      where: { surveyId },
      orderBy: SURVEY_IMAGE_ORDER_BY,
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
        annotatedThumbnailPath: true,
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
   * Requirements: 4.10, 4.1
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

    // 注釈有無を一括確認（要件20.4対応）
    // 描画された注釈の有無（hasDrawnAnnotations）も同じクエリで取得する。
    // 重いdataは読まないため、判定コストは従来と変わらない（Requirement 20.2、Task 115.13）。
    const annotations = await this.prisma.imageAnnotation.findMany({
      where: { imageId: { in: imageIds } },
      select: { imageId: true, hasDrawnAnnotations: true },
    });
    const annotationImageIds = new Set(annotations.map((a) => a.imageId));
    // 未算出（バックフィル未実施）のレコードは従来どおり注釈ありとして扱う
    const drawnAnnotationImageIds = new Set(
      annotations.filter((a) => (a.hasDrawnAnnotations ?? true) === true).map((a) => a.imageId)
    );

    // 原画像URLのアクセス権限は画像単位ではなく、画像が属する現場調査のプロジェクト単位で
    // 決まる。画像ごとに検証すると同じ判定を枚数分繰り返すため（1枚あたりプロジェクト・
    // ロール照会が発生し、写真が多い現場調査で初期表示が著しく遅くなる）、現場調査単位で
    // 1回だけ検証する。
    // Requirements: 16.1（画像一覧の初期表示を2秒以内に完了する）
    const hasOriginalAccess = await this.signedUrlService.validateSurveyAccess(surveyId, userId);

    const storageProvider = isStorageConfigured() ? getStorageProvider() : null;

    // 署名付きURLの生成に必要なストレージキーは findBySurveyId の結果に含まれているため、
    // 画像ごとにDBを引き直さずパスから直接生成する。
    const signUrl = async (objectKey: string | null): Promise<string | null> => {
      if (!storageProvider || !objectKey) {
        return null;
      }
      try {
        return await storageProvider.getSignedUrl(objectKey, {
          expiresIn: SIGNED_URL_EXPIRES_IN,
        });
      } catch {
        return null;
      }
    };

    // 各画像に署名付きURLを付与
    return Promise.all(
      images.map(async (image) => {
        const [originalUrl, thumbnailUrl, annotatedThumbnailUrl] = await Promise.all([
          // 原画像はアクセス権限検証を通過した場合のみURLを返す
          hasOriginalAccess ? signUrl(image.originalPath) : Promise.resolve(null),
          // サムネイル・注釈付きサムネイルは従来から権限検証を経ずに生成しており、
          // 本メソッドのリクエスト削減にあたっても挙動を変えていない
          signUrl(image.thumbnailPath),
          signUrl(image.annotatedThumbnailPath),
        ]);

        return {
          ...image,
          originalUrl,
          thumbnailUrl,
          annotatedThumbnailUrl,
          hasAnnotations: annotationImageIds.has(image.id),
          // 回転のみの保存でも注釈レコードは残るため hasAnnotations とは一致しない
          hasDrawnAnnotations: drawnAnnotationImageIds.has(image.id),
        };
      })
    );
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
