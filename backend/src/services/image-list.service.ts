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
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import { getStorageProvider, isStorageConfigured } from '../storage/index.js';
import {
  PROJECT_SURVEY_IMAGE_ORDER_BY,
  SURVEY_IMAGE_ORDER_BY,
} from '../utils/survey-image-order.js';
import { ProjectSurveyImagesAccessDeniedError } from '../errors/siteSurveyError.js';

/**
 * 署名付きURLの有効期限（秒）- 15分
 *
 * `SignedUrlService` の既定値と揃える。
 */
const SIGNED_URL_EXPIRES_IN = 900;

/**
 * プロジェクト写真一覧の取得件数を既定値・上限へ収める
 *
 * Requirements (quantity-table-generation): 49.9
 *
 * @param limit - 呼び出し元が指定した件数（未指定可）
 * @returns 1以上・上限以下へ収めた件数
 */
const resolveProjectSurveyImageLimit = (limit?: number): number => {
  if (limit === undefined) {
    return PROJECT_SURVEY_IMAGE_DEFAULT_LIMIT;
  }
  const normalized = Math.floor(limit);
  if (!Number.isFinite(normalized) || normalized < 1) {
    return 1;
  }
  return Math.min(normalized, PROJECT_SURVEY_IMAGE_MAX_LIMIT);
};

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
 * プロジェクト写真一覧の既定件数
 *
 * 注釈付きの写真のみを対象とするため想定件数は小さい。ページングを設けず、
 * 上限に達したことだけを応答で明示する（`hasMore`）。
 *
 * Requirements (quantity-table-generation): 49.9
 */
export const PROJECT_SURVEY_IMAGE_DEFAULT_LIMIT = 200;

/**
 * プロジェクト写真一覧の最大件数
 *
 * Requirements (quantity-table-generation): 49.9
 */
export const PROJECT_SURVEY_IMAGE_MAX_LIMIT = 500;

/**
 * プロジェクト内の注釈付き現場調査写真
 *
 * 写真選択・変更ダイアログの一覧表示に必要な情報のみを持つ。
 * 表示用の署名付きURLは1件あたり1本（`displayUrl`）に限る。署名付きURLは1本あたり
 * 数百バイト規模になり得るため、複数本を返すとリクエスト件数の削減が通信量の増加で
 * 相殺される（Requirement 49 の目的は件数と通信量の双方）。
 *
 * Requirements (quantity-table-generation): 49.9, 49.10
 */
export interface ProjectSurveyImage {
  id: string;
  surveyId: string;
  surveyName: string;
  fileName: string;
  /**
   * 一覧表示に用いる画像（署名付きURL）
   *
   * 注釈をレンダリングしたサムネイルを優先し、無い場合は通常のサムネイルへ解決した
   * 結果を1本だけ返す。優先順位はサーバー側で解決し、呼び出し側に再実装させない。
   */
  displayUrl: string | null;
  /** 原本画像（署名付きURL）。選択確定後の拡大表示に用いる */
  originalUrl: string | null;
  /**
   * `displayUrl` が注釈をレンダリング済みの合成サムネイルであるか
   *
   * `displayUrl` は「注釈付きサムネイル」と「通常サムネイル」をサーバー側で1本へ畳んだ
   * 結果であり、値だけでは両者を区別できない。区別できないまま合成済みの画像を
   * クライアント側の合成へ渡すと、注釈が二重に重なる（回転補正済みの画像では重ね位置も
   * ずれる）。表示用URLの本数は増やさず、真偽値1つで判別できるようにする。
   *
   * Requirements (quantity-table-generation): 49.5, 49.9
   */
  isDisplayUrlAnnotated: boolean;
  /**
   * 描画された注釈の有無（Requirement 20.2、site-survey Task 115.13）
   *
   * 本一覧は「注釈レコードが存在する写真」に限られるが、画像編集画面は注釈0件
   * （回転のみ）でも注釈レコードを残すため、レコードの存在は描画の有無を意味しない。
   * 注釈の目印はこちらで判定する。未算出（バックフィル未実施）は従来どおり注釈ありとして
   * 扱う。
   */
  hasDrawnAnnotations: boolean;
  comment: string | null;
  /** 画像の実寸（表示領域確保に用いる） */
  width: number;
  height: number;
  displayOrder: number;
}

/**
 * プロジェクト写真一覧の取得結果
 *
 * `hasMore` が真の場合、上限に達して切り捨てが発生したことを示す。
 *
 * Requirements (quantity-table-generation): 49.9
 */
export interface ProjectSurveyImageList {
  images: ProjectSurveyImage[];
  hasMore: boolean;
}

/**
 * プロジェクト写真一覧の取得オプション
 */
export interface FindAnnotatedByProjectIdOptions {
  /** 取得件数の上限（既定 200、最大 500） */
  limit?: number;
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
    const signUrl = (objectKey: string | null): Promise<string | null> =>
      this.signObjectUrl(storageProvider, objectKey);

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
   * ストレージキーから署名付きURLを生成する
   *
   * ストレージ未設定・キー未設定・生成失敗のいずれもnullを返し、一覧全体の取得は妨げない。
   *
   * @param storageProvider - ストレージプロバイダ（未設定時はnull）
   * @param objectKey - ストレージキー
   * @returns 署名付きURL。生成できない場合はnull
   */
  private async signObjectUrl(
    storageProvider: StorageProvider | null,
    objectKey: string | null
  ): Promise<string | null> {
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
  }

  /**
   * プロジェクト内の注釈付き現場調査写真を一括で取得する
   *
   * 写真選択・変更ダイアログが選択可能な写真をまとめて取得する経路。現場調査ごとの
   * 個別リクエストへ分割しない（49.9）。対象は注釈レコードが存在する写真のみで、
   * これは現場調査API・数量表APIの `hasAnnotations` と同じ判定である
   * （Requirement 4.3 / 19.2 が定める「注釈エディタで編集済みの画像」）。
   *
   * 問い合わせ回数を写真枚数・現場調査数に比例させないため、次の3点を守る。
   * - アクセス可否の判定はプロジェクト単位で1回のみ（現場調査単位・画像単位へ分割しない）
   * - 現場調査の抽出と画像の抽出をそれぞれ1回で行う
   * - 署名付きURLは抽出結果に含まれるストレージキーから生成し、画像ごとに引き直さない
   *
   * 応答に含める表示用の署名付きURLは1件あたり1本（`displayUrl`）に限る。署名付きURLは
   * 1本あたり数百バイト規模になり得るため、複数本を返すとリクエスト件数の削減が通信量の
   * 増加で相殺される。優先順位（注釈付きサムネイル > 通常サムネイル）はここで解決する。
   *
   * 表示用URLを1本へ畳んだ結果、呼び出し側は値だけでは合成済みか否かを判別できない。
   * また注釈レコードの存在は描画の有無を意味しない。この2点を真偽値
   * （`isDisplayUrlAnnotated` / `hasDrawnAnnotations`）で伝える。いずれも応答サイズは
   * 無視できる大きさで、署名付きURLを増やさない。
   *
   * Requirements (quantity-table-generation): 49.9, 49.10
   *
   * @param projectId - プロジェクトID
   * @param userId - ユーザーID（アクセス権限検証用）
   * @param options - 取得オプション（件数上限）
   * @returns 注釈付き写真の一覧と、上限による切り捨ての有無
   * @throws {ProjectSurveyImagesAccessDeniedError} プロジェクトへのアクセス権限がない場合
   */
  async findAnnotatedByProjectIdWithUrls(
    projectId: string,
    userId: string,
    options: FindAnnotatedByProjectIdOptions = {}
  ): Promise<ProjectSurveyImageList> {
    // アクセス可否はプロジェクト単位で1回だけ判定する。判定基準は
    // `SignedUrlService` が唯一の出所であり、ここで複製しない。
    const hasAccess = await this.signedUrlService.validateProjectAccess(projectId, userId);
    if (!hasAccess) {
      throw new ProjectSurveyImagesAccessDeniedError(projectId, userId);
    }

    const limit = resolveProjectSurveyImageLimit(options.limit);

    // 現場調査の抽出は1回。論理削除済みの現場調査は選択対象にしない。
    const surveys = await this.prisma.siteSurvey.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (surveys.length === 0) {
      return { images: [], hasMore: false };
    }

    const surveyNameById = new Map(surveys.map((survey) => [survey.id, survey.name]));

    // 画像の抽出も1回。注釈レコードの存在で絞り込み、上限判定のため上限+1件を取得する。
    const images = await this.prisma.surveyImage.findMany({
      where: {
        surveyId: { in: [...surveyNameById.keys()] },
        annotation: { isNot: null },
      },
      orderBy: PROJECT_SURVEY_IMAGE_ORDER_BY,
      take: limit + 1,
      select: {
        id: true,
        surveyId: true,
        fileName: true,
        comment: true,
        width: true,
        height: true,
        displayOrder: true,
        originalPath: true,
        thumbnailPath: true,
        annotatedThumbnailPath: true,
        // 描画された注釈の有無は、絞り込み（annotation: { isNot: null }）で既に結合済みの
        // 関連から同じ問い合わせで取得する。注釈表を別に引くと写真の抽出が2回になり、
        // 74.2 が立てた問い合わせ回数の保証（アクセス判定1回・調査1回・写真1回）が崩れる。
        // 重い注釈データ（data）は読まないため判定コストは増えない（Requirement 20.2）。
        annotation: { select: { hasDrawnAnnotations: true } },
      },
    });

    const hasMore = images.length > limit;
    const page = hasMore ? images.slice(0, limit) : images;

    const storageProvider = isStorageConfigured() ? getStorageProvider() : null;

    const resolvedImages = await Promise.all(
      page.map(async (image) => {
        const [displayUrl, originalUrl] = await Promise.all([
          // 表示用は注釈付きサムネイルを優先し、1件あたり1本へ解決する
          this.signObjectUrl(storageProvider, image.annotatedThumbnailPath ?? image.thumbnailPath),
          // 原本はプロジェクト単位の判定を通過しているため生成できる
          this.signObjectUrl(storageProvider, image.originalPath),
        ]);

        return {
          id: image.id,
          surveyId: image.surveyId,
          surveyName: surveyNameById.get(image.surveyId) ?? '',
          fileName: image.fileName,
          displayUrl,
          originalUrl,
          // 解決に成功した表示用URLが合成済みサムネイル由来であるときだけ真とする。
          // 署名の生成に失敗して null になった場合は合成済みと名乗らない。
          isDisplayUrlAnnotated: displayUrl !== null && image.annotatedThumbnailPath !== null,
          // 未算出（バックフィル未実施）は従来どおり注釈ありとして扱う。絞り込みにより
          // 関連は必ず存在するが、取得結果の型に合わせて欠落も同じ既定へ寄せる。
          hasDrawnAnnotations: image.annotation?.hasDrawnAnnotations ?? true,
          comment: image.comment,
          width: image.width,
          height: image.height,
          displayOrder: image.displayOrder,
        };
      })
    );

    return { images: resolvedImages, hasMore };
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
