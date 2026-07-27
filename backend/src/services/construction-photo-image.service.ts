/**
 * @fileoverview 工事写真画像サービス（アップロード）
 *
 * 写真項目（ConstructionPhoto）を3系統（ローカル/カメラ/現調コピー）で追加する
 * ドメインサービス。本ファイルでは Task 2.2 の対象である `addFromUpload`
 * （ローカルアップロード＝カメラ撮影もサーバ側は同一経路）を実装する。
 * 現調コピー（addFromSurveyImage=2.3）・一覧（listWithUrls=2.4）・削除（delete=2.5系）・
 * 印字画像（getPrintImage=3.3、看板ありはオンデマンド合成・なしは原本）を本ファイルで実装済み。
 *
 * 既存の現場調査アップロード実装（image-upload.service.ts / survey-image.service.ts /
 * image-processor.service.ts）のパイプラインを踏襲する。site-survey テーブルへは書込まない。
 *
 * Requirements:
 * - 4.1: 画像をストレージに保存し新規写真項目としてアルバムに紐付ける
 * - 4.2: 複数ファイルを取り込み写真項目を一括追加する
 * - 4.3: アップロード完了時にサムネイルを自動生成する
 * - 4.4: JPEG/PNG/WEBP をサポートする
 * - 4.5: 許可されない形式はアップロードを拒否する
 * - 4.6: 上限（300KB）超過時は段階的に圧縮して登録する（ImageProcessor に委譲）
 * - 4.7: 追加した写真項目を末尾の表示順に配置する
 * - 5.1, 5.2: カメラ撮影もサーバ側は通常の multipart と同一経路
 * - 12.5: ストレージ保存失敗時、失敗分は未登録・成功分は維持
 * - 11.6: 表示用の署名付きURLに有効期限を設定する（TTL 900s）
 * - 7.8, 11.2: 写真項目一覧＋署名付きURLを1リクエストでまとめて取得する（N+1回避, listWithUrls）
 * - 11.3: 一覧・詳細はサムネ優先（一覧では原本URLを返さない）
 * - 13.2: 取得対象がユーザーのアクセス可能なプロジェクト配下であることを検証する
 *
 * @module services/construction-photo-image
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { ImageProcessorService } from './image-processor.service.js';
import type { SurveyImageService, UploadFile } from './survey-image.service.js';
import type { SignboardCompositeService } from './signboard-composite.service.js';
import { ConstructionPhotoAlbumNotFoundError } from './construction-photo-album.service.js';
import { NotFoundError } from '../errors/apiError.js';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboardDto,
  SignboardFreeItem,
  SignboardPlacement,
} from '../types/construction-photo.types.js';
import logger from '../utils/logger.js';

/**
 * 現調写真コピーで参照した SurveyImage が存在しない、または対象アルバムと
 * 異なるプロジェクトの現場調査写真だった場合のエラー。
 *
 * 参照対象を同一プロジェクトの現場調査写真に限定する（Requirements: 6.4, 13.2）。
 * 情報漏洩を避けるため他プロジェクトの存在有無は区別せず 404 として扱う。
 */
export class SurveyImageCopyNotAllowedError extends NotFoundError {
  constructor(public readonly surveyImageIds: string[]) {
    super(
      `Survey image(s) not found in the album's project: ${surveyImageIds.join(', ')}`,
      'SURVEY_IMAGE_NOT_ALLOWED'
    );
    this.name = 'SurveyImageCopyNotAllowedError';
  }
}

/**
 * 写真項目（ConstructionPhoto）が存在しない、または論理削除済みアルバム配下・
 * アクセス不可プロジェクト配下だった場合のエラー。
 *
 * 情報漏洩を避けるため、存在しない場合と権限がない場合を区別せず 404 として扱う
 * （Requirements: 13.2, 13.3）。メタ更新・並び替え・削除で共有する。
 */
export class ConstructionPhotoNotFoundError extends NotFoundError {
  constructor(public readonly photoId: string) {
    super(`Construction photo not found: ${photoId}`, 'CONSTRUCTION_PHOTO_NOT_FOUND');
    this.name = 'ConstructionPhotoNotFoundError';
  }
}

/**
 * 署名付きURLの有効期限（秒）。Requirements: 11.6（15分程度）
 */
const SIGNED_URL_EXPIRES_IN = 900;

/**
 * アップロードファイル（multer 受信後の実体）
 *
 * 既存の site-survey の UploadFile と同形。
 */
export type ConstructionPhotoUploadFile = UploadFile;

/**
 * アップロード結果
 *
 * バッチ処理は部分失敗を許容し、成功分は確定・失敗分のみ通知する（design Error Handling / R12.5）。
 */
export interface ConstructionPhotoUploadResult {
  /** 登録に成功した写真項目（署名付きURL同梱） */
  successful: ConstructionPhotoWithUrls[];
  /** 登録に失敗したファイルとエラー内容 */
  failed: Array<{ fileName: string; error: string }>;
}

/**
 * 現調写真コピー結果
 *
 * addFromUpload と同じく部分失敗を許容し、成功分は確定・失敗分のみ通知する。
 * 失敗はコピー元の現場調査画像ID単位で通知する（R6.2）。
 */
export interface ConstructionPhotoCopyResult {
  /** 複製に成功した写真項目（署名付きURL同梱） */
  successful: ConstructionPhotoWithUrls[];
  /** 複製に失敗した現場調査画像IDとエラー内容 */
  failed: Array<{ surveyImageId: string; error: string }>;
}

/**
 * 複製元 SurveyImage の読取形状（storage.copy と DTO 生成に必要な最小列）
 */
interface SurveyImageSource {
  id: string;
  originalPath: string;
  thumbnailPath: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  survey: { projectId: string };
}

/**
 * サービス依存関係
 */
export interface ConstructionPhotoImageServiceDependencies {
  prisma: PrismaClient;
  /** ストレージプロバイダー（upload / getSignedUrl を利用） */
  storageProvider: StorageProvider;
  /** マジックバイト検証・ファイル名サニタイズを再利用（ステートレスなヘルパー） */
  surveyImageService: SurveyImageService;
  /** 圧縮・サムネ生成・寸法取得（sharp）を担う */
  imageProcessorService: ImageProcessorService;
  /**
   * 看板合成（SVG→sharp composite）を担う。印字画像（getPrintImage）でのみ使用。
   * ストレージ未設定時は本サービス自体が初期化されないため任意（未設定時は合成不可）。
   */
  signboardCompositeService?: SignboardCompositeService;
}

/**
 * Prisma が返す ConstructionPhoto レコードの最小形（DTO 変換用）
 */
interface ConstructionPhotoRecord {
  id: string;
  albumId: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  comment: string | null;
  includeInReport: boolean;
  signboardId: string | null;
  signboardPlacement: unknown;
  thumbnailPath: string;
  createdAt: Date;
}

/**
 * 工事写真画像サービス
 */
export class ConstructionPhotoImageService {
  private readonly prisma: PrismaClient;
  private readonly storageProvider: StorageProvider;
  private readonly surveyImageService: SurveyImageService;
  private readonly imageProcessorService: ImageProcessorService;
  private readonly signboardCompositeService?: SignboardCompositeService;

  constructor(deps: ConstructionPhotoImageServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider;
    this.surveyImageService = deps.surveyImageService;
    this.imageProcessorService = deps.imageProcessorService;
    this.signboardCompositeService = deps.signboardCompositeService;
  }

  /**
   * ローカル/カメラアップロードで写真項目を追加する
   *
   * 各ファイルを sharp で圧縮・サムネ生成し、原本＋サムネをストレージへ保存して
   * ConstructionPhoto を作成する。表示順は既存の最大 displayOrder の次（末尾）から採番する。
   * 1ファイルが失敗しても他ファイルの処理は継続し、成功分の登録は維持する（R12.5）。
   *
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 12.5
   *
   * @param albumId - 追加先アルバムID
   * @param files - アップロードファイル配列
   * @returns 成功/失敗を含むアップロード結果
   * @throws {ConstructionPhotoAlbumNotFoundError} アルバムが存在しない、または論理削除済みの場合
   */
  async addFromUpload(
    albumId: string,
    files: ConstructionPhotoUploadFile[]
  ): Promise<ConstructionPhotoUploadResult> {
    // アルバムの存在確認（論理削除済みは対象外）
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, deletedAt: true },
    });
    if (!album || album.deletedAt !== null) {
      throw new ConstructionPhotoAlbumNotFoundError(albumId);
    }

    // 末尾採番の起点（既存の最大 displayOrder + 1）（Requirements: 4.7）
    let nextDisplayOrder = await this.getNextDisplayOrder(albumId);

    const successful: ConstructionPhotoWithUrls[] = [];
    const failed: Array<{ fileName: string; error: string }> = [];

    for (const file of files) {
      try {
        const dto = await this.persistOne(albumId, file, nextDisplayOrder);
        successful.push(dto);
        nextDisplayOrder += 1;
      } catch (error) {
        failed.push({
          fileName: file.originalname,
          error: error instanceof Error ? error.message : 'アップロードに失敗しました',
        });
      }
    }

    logger.info(
      {
        albumId,
        totalFiles: files.length,
        successCount: successful.length,
        failCount: failed.length,
      },
      'Construction photo upload completed'
    );

    return { successful, failed };
  }

  /**
   * 同一プロジェクトの現場調査写真をコピー（独立複製）して写真項目を追加する。
   *
   * `storage.copy` で原本＋サムネの2キーを新キー（construction-photos/${albumId}/...）へ
   * バイト複製し、寸法/サイズは複製元 `SurveyImage` からそのまま流用する（Sharp再処理なし）。
   * 来歴として `sourceSurveyImageId` を記録するが FK にはせず、site-survey テーブルへは
   * 一切書込まない。生成された写真項目は独立行のため、複製後にコピー元が変更・削除されても
   * 影響を受けない（R6.3）。参照対象は対象アルバムと同一プロジェクトの現場調査写真に限定し、
   * 1件でも存在しない/他プロジェクトの場合は複製を一切行わず拒否する（R6.4, 13.2）。
   *
   * 個々のコピー失敗は部分失敗として扱い、成功分の登録は維持する（R6.2）。
   *
   * Requirements: 6.1, 6.2, 6.3, 6.4
   *
   * @param albumId - 追加先アルバムID
   * @param surveyImageIds - コピー元の現場調査画像ID配列
   * @returns 成功/失敗を含むコピー結果
   * @throws {ConstructionPhotoAlbumNotFoundError} アルバムが存在しない、または論理削除済みの場合
   * @throws {SurveyImageCopyNotAllowedError} 参照が存在しない、または他プロジェクトの現調写真を含む場合
   */
  async addFromSurveyImage(
    albumId: string,
    surveyImageIds: string[]
  ): Promise<ConstructionPhotoCopyResult> {
    // アルバムの存在確認＋プロジェクト特定（論理削除済みは対象外）
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, deletedAt: true, projectId: true },
    });
    if (!album || album.deletedAt !== null) {
      throw new ConstructionPhotoAlbumNotFoundError(albumId);
    }

    // 参照候補を SurveyImage→survey→projectId で読取（同一プロジェクト検証用）
    const sources = (await this.prisma.surveyImage.findMany({
      where: { id: { in: surveyImageIds } },
      select: {
        id: true,
        originalPath: true,
        thumbnailPath: true,
        fileName: true,
        fileSize: true,
        width: true,
        height: true,
        survey: { select: { projectId: true } },
      },
    })) as SurveyImageSource[];

    // 存在しない/他プロジェクトの参照が1件でもあれば拒否（R6.4, 13.2）
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const rejected = surveyImageIds.filter((id) => {
      const src = sourceById.get(id);
      return !src || src.survey.projectId !== album.projectId;
    });
    if (rejected.length > 0) {
      throw new SurveyImageCopyNotAllowedError(rejected);
    }

    // 末尾採番の起点（既存の最大 displayOrder + 1）（R6.2, 4.7）
    let nextDisplayOrder = await this.getNextDisplayOrder(albumId);

    const successful: ConstructionPhotoWithUrls[] = [];
    const failed: Array<{ surveyImageId: string; error: string }> = [];

    // 入力順を保ちつつ複製（部分失敗は継続）
    for (const id of surveyImageIds) {
      const source = sourceById.get(id)!;
      try {
        const dto = await this.copyOne(albumId, source, nextDisplayOrder);
        successful.push(dto);
        nextDisplayOrder += 1;
      } catch (error) {
        failed.push({
          surveyImageId: id,
          error: error instanceof Error ? error.message : '現調写真のコピーに失敗しました',
        });
      }
    }

    logger.info(
      {
        albumId,
        totalSurveyImages: surveyImageIds.length,
        successCount: successful.length,
        failCount: failed.length,
      },
      'Construction photo copy from survey images completed'
    );

    return { successful, failed };
  }

  /**
   * アルバム配下の写真項目一覧を署名付きURL同梱で取得する。
   *
   * 1回の `findMany` で全写真項目を displayOrder 昇順に取得し、取得済みの
   * サムネパスから署名付きURLをまとめて生成して返す。写真項目ごとの個別クエリ・
   * 個別リクエストを発生させない（N+1回避, R7.8/R11.2）。一覧では原本URLは返さず
   * サムネイルを優先する（R11.3）。原本/印字画像は必要時にのみ別エンドポイントで取得する。
   *
   * 取得対象はリクエストユーザーがアクセス可能なプロジェクト配下のアルバムに限定する。
   * アルバムが存在しない・論理削除済み・ユーザーがアクセスできないプロジェクトの場合は、
   * 存在有無を漏らさないためいずれも NotFound(404) として扱う（R13.2, R13.3）。
   *
   * Requirements: 7.8, 11.2, 11.3, 13.2
   *
   * @param albumId - 対象アルバムID
   * @param userId - リクエストユーザーID（プロジェクト境界検証用）
   * @returns displayOrder 昇順の写真項目（署名付きサムネURL同梱）
   * @throws {ConstructionPhotoAlbumNotFoundError} 未存在・論理削除済み・アクセス不可の場合
   */
  async listWithUrls(albumId: string, userId: string): Promise<ConstructionPhotoWithUrls[]> {
    // アルバムの存在確認＋プロジェクト特定（論理削除済みは対象外）
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, deletedAt: true, projectId: true },
    });
    if (!album || album.deletedAt !== null) {
      throw new ConstructionPhotoAlbumNotFoundError(albumId);
    }

    // プロジェクト境界の検証（R13.2, R13.3）。アクセス不可も存在秘匿のため 404 とする
    const hasAccess = await this.canAccessProject(album.projectId, userId);
    if (!hasAccess) {
      throw new ConstructionPhotoAlbumNotFoundError(albumId);
    }

    // 全写真項目を1クエリで displayOrder 昇順取得（N+1回避）。原本パスは取得しない（サムネ優先）
    const photos = await this.prisma.constructionPhoto.findMany({
      where: { albumId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        albumId: true,
        fileName: true,
        fileSize: true,
        width: true,
        height: true,
        displayOrder: true,
        comment: true,
        includeInReport: true,
        signboardId: true,
        signboardPlacement: true,
        thumbnailPath: true,
        createdAt: true,
      },
    });

    // 取得済みのサムネパスから署名付きURLをまとめて生成（追加のDBラウンドトリップなし）
    return Promise.all(photos.map((photo) => this.toDtoWithUrls(photo)));
  }

  /**
   * 写真項目を削除する。関連する original/thumbnail のストレージも削除する。
   *
   * DB 行を削除すると、当該行が所有する看板配置情報（`signboardPlacement` カラム）も
   * 併せて消える（R7.7）。看板合成はオンデマンド（保存しない）方式のため、削除すべき
   * 保存済み合成物は存在せず、原本とサムネの2キーのみを削除する。ストレージ削除は
   * ベストエフォートとし、失敗しても DB 行削除は確定させる（孤立オブジェクトは残るが
   * データの整合性=行の消去を優先）。
   *
   * 対象写真がアクセス可能なプロジェクト配下のアルバムに属することを検証する。
   * 未存在・論理削除済みアルバム配下・アクセス不可のいずれも、存在有無を漏らさない
   * ため 404（ConstructionPhotoNotFoundError）として扱う（R13.2, R13.3）。
   *
   * Requirements: 7.7, 13.2
   *
   * @param photoId - 削除対象の写真項目ID
   * @param userId - リクエストユーザーID（プロジェクト境界検証用）
   * @throws {ConstructionPhotoNotFoundError} 未存在・論理削除済み・アクセス不可の場合
   */
  async delete(photoId: string, userId: string): Promise<void> {
    // 写真項目＋所属アルバムのプロジェクト/論理削除状態を取得
    const photo = await this.prisma.constructionPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        originalPath: true,
        thumbnailPath: true,
        album: { select: { projectId: true, deletedAt: true } },
      },
    });
    if (!photo || photo.album.deletedAt !== null) {
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    // プロジェクト境界の検証（R13.2, R13.3）。アクセス不可も存在秘匿のため 404 とする
    const hasAccess = await this.canAccessProject(photo.album.projectId, userId);
    if (!hasAccess) {
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    // DB 行を先に削除（看板配置カラムも同時に消える, R7.7）
    await this.prisma.constructionPhoto.delete({ where: { id: photoId } });

    // 関連ストレージ（原本＋サムネ）をベストエフォートで削除
    for (const key of [photo.originalPath, photo.thumbnailPath]) {
      await this.storageProvider.delete(key).catch((error: unknown) => {
        logger.warn(
          { photoId, key, error: error instanceof Error ? error.message : String(error) },
          'Failed to delete construction photo storage object (row already deleted)'
        );
      });
    }

    logger.info({ photoId, userId }, 'Construction photo deleted');
  }

  /**
   * 印字用画像（PDF台帳用）をオンデマンドで取得する。
   *
   * 看板が指定されている写真は、原本へ電子小黒板SVGを sharp composite して重畳した
   * 画像を返す（保存しない）。看板が未指定、または参照先の看板が削除済み（論理削除/
   * 物理削除）・配置が未設定の場合は、重畳なしで原本をそのまま返す（R9.7, R10.9）。
   * 合成はサーバ権威かつオンデマンドのため、看板マスタ編集・配置変更でも常に最新内容で
   * 焼き込まれ、キャッシュ無効化が不要となる。
   *
   * 対象写真がアクセス可能なプロジェクト配下のアルバムに属することを検証する。
   * 未存在・論理削除済みアルバム配下・アクセス不可のいずれも、存在有無を漏らさない
   * ため 404（ConstructionPhotoNotFoundError）として扱う（R13.2, R13.3）。
   *
   * Requirements: 9.6, 9.7, 10.8, 10.9, 13.2
   *
   * @param photoId - 対象写真項目ID
   * @param userId - リクエストユーザーID（プロジェクト境界検証用）
   * @returns 印字用画像バッファ（看板ありは合成後 JPEG、なしは原本）
   * @throws {ConstructionPhotoNotFoundError} 未存在・論理削除済み・アクセス不可・原本欠損の場合
   */
  async getPrintImage(photoId: string, userId: string): Promise<Buffer> {
    // 写真項目＋所属アルバムのプロジェクト/論理削除状態＋看板指定を取得
    const photo = await this.prisma.constructionPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        originalPath: true,
        signboardId: true,
        signboardPlacement: true,
        album: { select: { projectId: true, deletedAt: true } },
      },
    });
    if (!photo || photo.album.deletedAt !== null) {
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    // プロジェクト境界の検証（R13.2, R13.3）。アクセス不可も存在秘匿のため 404 とする
    const hasAccess = await this.canAccessProject(photo.album.projectId, userId);
    if (!hasAccess) {
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    // 原本バッファを取得（オンデマンド合成の入力／看板なし時はこれをそのまま返す）
    const originalBuffer = await this.storageProvider.get(photo.originalPath);
    if (!originalBuffer) {
      logger.warn(
        { photoId, path: photo.originalPath },
        'Print image: original not found in storage'
      );
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    const placement = (photo.signboardPlacement as SignboardPlacement | null) ?? null;

    // 看板未指定・配置未設定は重畳なしで原本を返す（R10.9）
    if (!photo.signboardId || !placement) {
      return originalBuffer;
    }

    // 看板を取得。削除済み（論理削除）／存在しない（物理削除）は看板なし扱い＝原本を返す（R9.7）
    const signboard = await this.prisma.constructionSignboard.findUnique({
      where: { id: photo.signboardId },
      select: {
        id: true,
        projectId: true,
        workName: true,
        workLocation: true,
        freeItems: true,
        footerText: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!signboard || signboard.deletedAt !== null) {
      return originalBuffer;
    }

    // 合成サービスが未設定なら合成不可のため原本を返す（ストレージ未設定時は本サービス自体が
    // 生成されないため通常は発生しない防御的分岐）
    if (!this.signboardCompositeService) {
      logger.warn({ photoId }, 'Print image: composite service unavailable, returning original');
      return originalBuffer;
    }

    // 原本へ看板SVGをオンデマンド合成して返す（保存しない）（R9.6, R10.8）
    const signboardDto: ConstructionSignboardDto = {
      id: signboard.id,
      projectId: signboard.projectId,
      workName: signboard.workName,
      workLocation: signboard.workLocation,
      freeItems: (signboard.freeItems ?? []) as unknown as SignboardFreeItem[],
      footerText: signboard.footerText,
      // 印字合成では未使用（DTO契約上の必須項目）。使用件数は一覧/削除でのみ意味を持つ
      inUseCount: 0,
      createdAt: signboard.createdAt.toISOString(),
      updatedAt: signboard.updatedAt.toISOString(),
    };

    return this.signboardCompositeService.composite(originalBuffer, signboardDto, placement);
  }

  /**
   * ユーザーが指定プロジェクトにアクセス可能かを判定する（R13.2, R13.3）。
   *
   * 以下のいずれかを満たす場合に true:
   * 1. プロジェクトの作成者/営業担当者/工事担当者である
   * 2. admin ロールを持つ
   *
   * 注: 現時点でプロジェクトアクセス判定の共有ヘルパーは存在せず、SignedUrlService が
   * SurveyImage 固有の同等ロジックを持つのみのため、ここでは同一ポリシーをアルバムの
   * プロジェクトに対して適用する。
   */
  private async canAccessProject(projectId: string, userId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        deletedAt: true,
        createdById: true,
        salesPersonId: true,
        constructionPersonId: true,
      },
    });
    if (!project || project.deletedAt !== null) {
      return false;
    }

    if (
      project.createdById === userId ||
      project.salesPersonId === userId ||
      project.constructionPersonId === userId
    ) {
      return true;
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    });
    return userRoles.some((ur) => ur.role.name === 'admin');
  }

  /**
   * 1件の現場調査写真を新キーへ複製し ConstructionPhoto を作成、DTO を返す。
   *
   * 原本＋サムネを storage.copy でバイト複製し、寸法/サイズは複製元から流用する。
   * ここで送出された例外は呼び出し側で failed として集約される（部分失敗継続）。
   */
  private async copyOne(
    albumId: string,
    source: SurveyImageSource,
    displayOrder: number
  ): Promise<ConstructionPhotoWithUrls> {
    const sanitizedFileName = this.surveyImageService.sanitizeFileName(source.fileName);

    // 新キー（design: construction-photos/${albumId}/...）。複製元IDで衝突回避
    const uniquePrefix = `${Date.now()}_${source.id}`;
    const originalPath = `construction-photos/${albumId}/${uniquePrefix}_${sanitizedFileName}`;
    const thumbnailPath = `construction-photos/${albumId}/${uniquePrefix}_thumb_${sanitizedFileName}`;

    // 原本＋サムネの2キーをバイト複製（Sharp再処理なし）（R6.2）
    await this.storageProvider.copy(source.originalPath, originalPath);
    await this.storageProvider.copy(source.thumbnailPath, thumbnailPath);

    // 独立した写真項目を作成。寸法/サイズは複製元流用、来歴を記録（R6.2, 6.3）
    const photo = await this.prisma.constructionPhoto.create({
      data: {
        albumId,
        fileName: sanitizedFileName,
        fileSize: source.fileSize,
        width: source.width,
        height: source.height,
        displayOrder,
        originalPath,
        thumbnailPath,
        sourceSurveyImageId: source.id,
      },
    });

    return this.toDtoWithUrls(photo);
  }

  /**
   * 1ファイルを検証・処理・保存し、DTO を返す。
   *
   * ここで送出された例外は呼び出し側で failed として集約される（部分失敗継続）。
   */
  private async persistOne(
    albumId: string,
    file: ConstructionPhotoUploadFile,
    displayOrder: number
  ): Promise<ConstructionPhotoWithUrls> {
    // マジックバイトで実体の画像形式を判定（拡張子/申告MIMEに依存しない）（Requirements: 4.4, 4.5）
    const detectedMimeType = this.surveyImageService.validateFile(file);

    // ファイル名サニタイズ
    const sanitizedFileName = this.surveyImageService.sanitizeFileName(file.originalname);

    // 圧縮・サムネ生成・寸法取得（Requirements: 4.3, 4.6）
    const processed = await this.imageProcessorService.processImage(file.buffer);

    // ストレージキー（design: construction-photos/${albumId}/...）
    const timestamp = Date.now();
    const originalPath = `construction-photos/${albumId}/${timestamp}_${sanitizedFileName}`;
    const thumbnailPath = `construction-photos/${albumId}/${timestamp}_thumb_${sanitizedFileName}`;

    // 原本＋サムネを保存（Content-Type はマジックバイト判定結果）（Requirements: 4.1, 4.3）
    await this.storageProvider.upload(originalPath, processed.original.buffer, {
      contentType: detectedMimeType,
    });
    await this.storageProvider.upload(thumbnailPath, processed.thumbnail, {
      contentType: detectedMimeType,
    });

    // 写真項目を作成
    const photo = await this.prisma.constructionPhoto.create({
      data: {
        albumId,
        fileName: sanitizedFileName,
        fileSize: processed.metadata.size,
        width: processed.metadata.width,
        height: processed.metadata.height,
        displayOrder,
        originalPath,
        thumbnailPath,
      },
    });

    return this.toDtoWithUrls(photo);
  }

  /**
   * 次の表示順（末尾）を取得する。既存の最大 displayOrder + 1、無ければ 1。
   *
   * Requirements: 4.7
   */
  private async getNextDisplayOrder(albumId: string): Promise<number> {
    const last = await this.prisma.constructionPhoto.findFirst({
      where: { albumId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    return last ? last.displayOrder + 1 : 1;
  }

  /**
   * ConstructionPhoto レコードを署名付きURL同梱の DTO へ変換する。
   *
   * thumbnailUrl はサムネの署名付きURL（TTL 900s、失敗時 null）。
   * printImageUrl は PDF 用の印字画像取得エンドポイント（看板ありはサーバでオンデマンド合成）。
   */
  private async toDtoWithUrls(photo: ConstructionPhotoRecord): Promise<ConstructionPhotoWithUrls> {
    const thumbnailUrl = await this.storageProvider
      .getSignedUrl(photo.thumbnailPath, { expiresIn: SIGNED_URL_EXPIRES_IN })
      .catch(() => null);

    return {
      id: photo.id,
      albumId: photo.albumId,
      fileName: photo.fileName,
      fileSize: photo.fileSize,
      width: photo.width,
      height: photo.height,
      displayOrder: photo.displayOrder,
      comment: photo.comment ?? null,
      includeInReport: photo.includeInReport,
      signboardId: photo.signboardId ?? null,
      signboardPlacement: (photo.signboardPlacement as SignboardPlacement | null) ?? null,
      thumbnailUrl,
      printImageUrl: `/api/construction-photos/images/${photo.id}/print-image`,
      createdAt: photo.createdAt.toISOString(),
    };
  }
}
