/**
 * @fileoverview 工事写真画像サービス（アップロード）
 *
 * 写真項目（ConstructionPhoto）を3系統（ローカル/カメラ/現調コピー）で追加する
 * ドメインサービス。本ファイルでは Task 2.2 の対象である `addFromUpload`
 * （ローカルアップロード＝カメラ撮影もサーバ側は同一経路）を実装する。
 * 現調コピー（addFromSurveyImage=2.3）・一覧（listWithUrls=2.4）・削除（delete=2.5系）・
 * 印字画像（getPrintImage=3.3、看板ありはオンデマンド合成・なしは原本）・
 * 非合成原本（getOriginalImage=10.1、看板配置の有無に関わらず常に非合成原本）を
 * 本ファイルで実装済み。
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
 * - 13.2: 対象が、実在し取り除かれていないプロジェクト配下であることを検証する（取り除かれた
 *   プロジェクト・論理削除済みのアルバムの配下は拒否する）。
 *   アクセスできる利用者はルートの RBAC 権限（requirePermission）だけで決め、本サービスは
 *   プロジェクトの担当者（作成者・営業担当・工事担当）や admin ロールでの絞り込みを行わない
 *   （Task 23.1 の利用者の判断）
 * - 13.4: 画像を公開パスではなく署名付きURL/専用エンドポイント経由でのみ配信する
 * - 14.6: ビューアで表示する原本画像を必要時にのみ取得する（getOriginalImage）
 * - 15.4: ZIPエクスポートの「アップロード原本そのまま」モードを成立させる（getOriginalImage）
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
import { assertSurveyNotDeleted } from '../utils/survey-deleted-guard.js';
import {
  AVAILABILITY_IN_PROJECT_SELECT,
  isAvailableInLiveProject,
} from './construction-photo-availability.js';

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
 * 取り除かれた（論理削除済みの）プロジェクト配下だった場合のエラー。
 *
 * いずれも区別せず 404 として扱う（Requirements: 13.2, 13.3）。メタ更新・並び替え・削除で共有する。
 */
export class ConstructionPhotoNotFoundError extends NotFoundError {
  constructor(public readonly photoId: string) {
    super(`Construction photo not found: ${photoId}`, 'CONSTRUCTION_PHOTO_NOT_FOUND');
    this.name = 'ConstructionPhotoNotFoundError';
  }
}

/**
 * 写真項目が、指し示されたアルバムに属するかを判定する（プロジェクトの境界, Requirements: 13.2）。
 *
 * 写真項目の操作（原本・印字画像・削除・メタの一括更新）は `/api/construction-photos/images/...` で
 * 提供するが、同じルーターをアルバムの配下（`/api/construction-photos/:id/images/...`）にも載せている。
 * アルバムの配下として指したときは、写真項目がそのアルバムに属さなければ解決しない。
 *
 * @param photoAlbumId - 写真項目が属するアルバムID
 * @param addressedAlbumId - 要求のパスが指したアルバムID（アルバムの配下として指していなければ undefined）
 * @returns 指されていない、または指されたアルバムに属すれば true
 */
export function isAddressedAlbum(
  photoAlbumId: string,
  addressedAlbumId: string | undefined
): boolean {
  return addressedAlbumId === undefined || photoAlbumId === addressedAlbumId;
}

/**
 * 署名付きURLの有効期限（秒）。Requirements: 11.6（15分程度）
 * プロジェクト詳細サマリの工事写真のサムネイル（projects.routes.ts）も同じ値を使う。
 */
export const SIGNED_URL_EXPIRES_IN = 900;

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
  /**
   * 注釈・回転を焼き込んだ合成済みサムネイルのパス（未生成なら null）。
   * site-survey 側の詳細/一覧のサムネイル表示元であり、取り込み後の見た目を
   * 取り込み前と一致させるための複製元となる（site-survey Requirements: 20.2, 20.3）。
   */
  annotatedThumbnailPath: string | null;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  /** 親の現場調査ID（論理削除の拒否応答で名指す） */
  surveyId: string;
  /** 親の現場調査の所属プロジェクトと論理削除の状態 */
  survey: { projectId: string; deletedAt: Date | null };
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
  /** 参照先の看板の生死。作成直後の行（看板の指定が無い）では読み込まない */
  signboard?: SignboardLivenessRecord | null;
  thumbnailPath: string;
  createdAt: Date;
}

/**
 * 写真項目が参照する看板の生死（論理削除の有無）だけを運ぶ読取形状。
 */
export interface SignboardLivenessRecord {
  deletedAt: Date | null;
}

/**
 * 写真項目の読み出しに、参照先の看板の生死を同じクエリで含めるための選択。
 *
 * 写真項目の DTO を作る読み出し（一覧・メタの一括更新の応答）はこれを select に加え、
 * {@link resolveSignboardAssignment} へ渡す。看板を引く追加のクエリを発行しない（R11.2）。
 */
export const SIGNBOARD_LIVENESS_SELECT = { select: { deletedAt: true } } as const;

/**
 * 写真項目の看板の指定を、参照先の看板の生死を踏まえて解決する（Requirements: 9.7）。
 *
 * 看板の削除は論理削除であり、削除の処理（ConstructionSignboardService.delete）が参照側の
 * 指定と配置を解除する。それでも次の行には、論理削除済みの看板を指す指定が残りうる:
 * - 削除の処理が参照側を解除するようになる前に作られた行
 * - 削除と、同じ看板を指定するメタの一括更新が競合した行（一括更新の看板の検証は
 *   トランザクションの外にあり、検証の後・書き込みの前に削除が確定しうる）
 *
 * データ移行で一度きり掃除する方式では後者を防げないため、読み出しの時点で解決する。
 * 看板が指定されているのに生きている看板を確かめられない（論理削除済み、または参照先を
 * 読めていない）ときは、看板の指定と配置の両方を null として返す。配置は看板の指定に
 * 従属するため、片方だけを残さない。印字画像の生成（getPrintImage）が削除済みの看板を
 * 看板なしとして扱うのと同じ判定である。
 *
 * 看板が指定されていない行は、配置を従来どおりそのまま返す。
 *
 * @param photo - 看板の指定・配置と、参照先の看板の生死
 * @returns 一覧 DTO に載せる看板の指定と配置
 */
export function resolveSignboardAssignment(photo: {
  signboardId: string | null;
  signboardPlacement: unknown;
  signboard?: SignboardLivenessRecord | null;
}): { signboardId: string | null; signboardPlacement: SignboardPlacement | null } {
  const placement = (photo.signboardPlacement as SignboardPlacement | null) ?? null;

  if (photo.signboardId === null) {
    return { signboardId: null, signboardPlacement: placement };
  }

  const isLive =
    photo.signboard !== undefined && photo.signboard !== null && photo.signboard.deletedAt === null;
  if (!isLive) {
    return { signboardId: null, signboardPlacement: null };
  }

  return { signboardId: photo.signboardId, signboardPlacement: placement };
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
   * @throws {ConstructionPhotoAlbumNotFoundError} アルバムが存在しない、またはアルバムかプロジェクトが論理削除済みの場合
   */
  async addFromUpload(
    albumId: string,
    files: ConstructionPhotoUploadFile[]
  ): Promise<ConstructionPhotoUploadResult> {
    // アルバムの存在確認（アルバムかプロジェクトが論理削除済みなら対象外, R13.2, R13.3）
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, ...AVAILABILITY_IN_PROJECT_SELECT },
    });
    if (!album || !isAvailableInLiveProject(album)) {
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
   * @throws {ConstructionPhotoAlbumNotFoundError} アルバムが存在しない、またはアルバムかプロジェクトが論理削除済みの場合
   * @throws {SurveyImageCopyNotAllowedError} 参照が存在しない、または他プロジェクトの現調写真を含む場合
   * @throws {SurveyDeletedError} 親の現場調査が論理削除済みの現調写真を含む場合（Task 17.1）
   */
  async addFromSurveyImage(
    albumId: string,
    surveyImageIds: string[]
  ): Promise<ConstructionPhotoCopyResult> {
    // アルバムの存在確認＋プロジェクト特定（アルバムかプロジェクトが論理削除済みなら対象外, R13.2, R13.3）
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, projectId: true, ...AVAILABILITY_IN_PROJECT_SELECT },
    });
    if (!album || !isAvailableInLiveProject(album)) {
      throw new ConstructionPhotoAlbumNotFoundError(albumId);
    }

    // 参照候補を SurveyImage→survey→projectId で読取（同一プロジェクト検証用）
    const sources = (await this.prisma.surveyImage.findMany({
      where: { id: { in: surveyImageIds } },
      select: {
        id: true,
        originalPath: true,
        thumbnailPath: true,
        annotatedThumbnailPath: true,
        fileName: true,
        fileSize: true,
        width: true,
        height: true,
        surveyId: true,
        survey: { select: { projectId: true, deletedAt: true } },
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

    // 親の現場調査が論理削除済みの参照が1件でもあれば、複製を一切行わず拒否する
    // （site-survey スペックの論理削除の不変条件）。判定は survey-deleted-guard の
    // 共通機構をそのまま用い、site-survey・数量表の経路と同じ SurveyDeletedError
    // （経路側で 410 へ写す）を投げる。不存在・他プロジェクトの拒否（404）を先に
    // 済ませるのは、他プロジェクトの現場調査の削除状態を漏らさないためである。
    // `failed` へ積まないのは、`failed` が個々の複製の一過性の失敗（保存基盤）を
    // 表す場であり、参照の正当性は送信前に確定する前提条件だからである。
    for (const id of surveyImageIds) {
      const source = sourceById.get(id)!;
      assertSurveyNotDeleted(
        source.survey,
        source.surveyId,
        `削除された現場調査の画像は追加できません: ${source.surveyId}`
      );
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
   * 看板の指定は、参照先の看板が生きているときだけ返す。論理削除済みの看板を指す指定が行に
   * 残っていても、看板の指定と配置を null（看板なし）として返す（R9.7）。
   *
   * 取得対象は、実在し取り除かれていないプロジェクト配下の、論理削除されていないアルバムに
   * 限定する。アルバムが存在しない・アルバムかプロジェクトが論理削除済みの場合は NotFound(404)
   * として扱う（R13.2, R13.3）。取得できる利用者はルートの RBAC 権限（construction_photo:read）
   * が決め、プロジェクトの担当者での絞り込みは行わない。
   *
   * Requirements: 7.8, 9.7, 11.2, 11.3, 13.2
   *
   * @param albumId - 対象アルバムID
   * @returns displayOrder 昇順の写真項目（署名付きサムネURL同梱）
   * @throws {ConstructionPhotoAlbumNotFoundError} 未存在、またはアルバムかプロジェクトが論理削除済みの場合
   */
  async listWithUrls(albumId: string): Promise<ConstructionPhotoWithUrls[]> {
    // アルバムの存在確認（アルバムかプロジェクトが論理削除済みなら対象外, R13.2, R13.3）
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, ...AVAILABILITY_IN_PROJECT_SELECT },
    });
    if (!album || !isAvailableInLiveProject(album)) {
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
        // 参照先の看板の生死を同じクエリで読む（削除済みは看板なしとして返す, R9.7）
        signboard: SIGNBOARD_LIVENESS_SELECT,
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
   * 対象写真が、実在し取り除かれていないプロジェクト配下の、論理削除されていないアルバムに
   * 属することを検証する。未存在・アルバムかプロジェクトが論理削除済みのいずれも
   * 404（ConstructionPhotoNotFoundError）として扱う（R13.2, R13.3）。削除できる利用者は
   * ルートの RBAC 権限（construction_photo:delete）が決め、プロジェクトの担当者での絞り込みは
   * 行わない。
   *
   * Requirements: 7.7, 13.2
   *
   * @param photoId - 削除対象の写真項目ID
   * @param albumId - （任意）写真項目をアルバムの配下として指したときのアルバムID。指定時は所属を検証する
   * @throws {ConstructionPhotoNotFoundError} 未存在・指定アルバムに属さない・アルバムかプロジェクトが論理削除済みの場合
   */
  async delete(photoId: string, albumId?: string): Promise<void> {
    // 写真項目＋所属アルバムとプロジェクトの論理削除状態を取得
    const photo = await this.prisma.constructionPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        albumId: true,
        originalPath: true,
        thumbnailPath: true,
        album: { select: AVAILABILITY_IN_PROJECT_SELECT },
      },
    });
    if (
      !photo ||
      !isAddressedAlbum(photo.albumId, albumId) ||
      !isAvailableInLiveProject(photo.album)
    ) {
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

    logger.info({ photoId }, 'Construction photo deleted');
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
   * 対象写真が、実在し取り除かれていないプロジェクト配下の、論理削除されていないアルバムに
   * 属することを検証する。未存在・アルバムかプロジェクトが論理削除済みのいずれも
   * 404（ConstructionPhotoNotFoundError）として扱う（R13.2, R13.3）。取得できる利用者は
   * ルートの RBAC 権限（construction_photo:read）が決め、プロジェクトの担当者での絞り込みは
   * 行わない。
   *
   * Requirements: 9.6, 9.7, 10.8, 10.9, 13.2
   *
   * @param photoId - 対象写真項目ID
   * @param albumId - （任意）写真項目をアルバムの配下として指したときのアルバムID。指定時は所属を検証する
   * @returns 印字用画像バッファ（看板ありは合成後 JPEG、なしは原本）
   * @throws {ConstructionPhotoNotFoundError} 未存在・指定アルバムに属さない・アルバムかプロジェクトが論理削除済み・原本欠損の場合
   */
  async getPrintImage(photoId: string, albumId?: string): Promise<Buffer> {
    // 写真項目＋所属アルバムとプロジェクトの論理削除状態＋看板指定を取得
    const photo = await this.prisma.constructionPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        albumId: true,
        originalPath: true,
        signboardId: true,
        signboardPlacement: true,
        album: { select: AVAILABILITY_IN_PROJECT_SELECT },
      },
    });
    if (
      !photo ||
      !isAddressedAlbum(photo.albumId, albumId) ||
      !isAvailableInLiveProject(photo.album)
    ) {
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
   * 非合成の原本画像をオンデマンドで取得する（ビューア/ZIP用）。
   *
   * `getPrintImage` とは異なり、看板配置（`signboardId`/`signboardPlacement`）の
   * 有無で分岐せず、SVG看板合成を一切行わずに保存済み原本バッファをそのまま返す
   * （R14.6: ビューアは必要時にのみ原本を取得、R15.4: ZIPの「アップロード原本そのまま」
   * モードを成立させる）。原本は一覧DTO（`ConstructionPhotoWithUrls`）には含めず、
   * 本メソッド専用の配信エンドポイントを経由してのみ取得可能とする（R13.4）。
   *
   * 対象写真が、実在し取り除かれていないプロジェクト配下の、論理削除されていないアルバムに
   * 属することを検証する。未存在・アルバムかプロジェクトが論理削除済み・原本欠損のいずれも
   * 404（ConstructionPhotoNotFoundError）として扱う（R13.2, R13.3）。取得できる利用者は
   * ルートの RBAC 権限（construction_photo:read）が決め、プロジェクトの担当者での絞り込みは
   * 行わない。
   *
   * Requirements: 14.6, 15.4, 13.2, 13.4
   *
   * @param photoId - 対象写真項目ID
   * @param albumId - （任意）写真項目をアルバムの配下として指したときのアルバムID。指定時は所属を検証する
   * @returns 非合成の原本画像バッファ
   * @throws {ConstructionPhotoNotFoundError} 未存在・指定アルバムに属さない・アルバムかプロジェクトが論理削除済み・原本欠損の場合
   */
  async getOriginalImage(photoId: string, albumId?: string): Promise<Buffer> {
    // 写真項目＋所属アルバムとプロジェクトの論理削除状態を取得（看板情報は不要）
    const photo = await this.prisma.constructionPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        albumId: true,
        originalPath: true,
        album: { select: AVAILABILITY_IN_PROJECT_SELECT },
      },
    });
    if (
      !photo ||
      !isAddressedAlbum(photo.albumId, albumId) ||
      !isAvailableInLiveProject(photo.album)
    ) {
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    // 看板配置の有無に関わらず、常に非合成の原本バッファをそのまま返す
    const originalBuffer = await this.storageProvider.get(photo.originalPath);
    if (!originalBuffer) {
      logger.warn(
        { photoId, path: photo.originalPath },
        'Original image: original not found in storage'
      );
      throw new ConstructionPhotoNotFoundError(photoId);
    }

    return originalBuffer;
  }

  /**
   * 1件の現場調査写真を新キーへ複製し ConstructionPhoto を作成、DTO を返す。
   *
   * 原本＋サムネを storage.copy でバイト複製し、寸法/サイズは複製元から流用する。
   * サムネの複製元は合成済みサムネイルがあればそれを、無ければ通常サムネイルを用いる。
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
    //
    // サムネの複製元は site-survey 側の表示元と同じ規則で選ぶ。site-survey の詳細/一覧の
    // サムネイルは注釈をレンダリングした状態で表示され（site-survey Requirements: 20.2, 20.3）、
    // その実体は合成済みサムネイル（annotatedThumbnailPath）である。通常サムネイルは
    // アップロード時の素の画像として不変になったため、通常サムネイルを複製すると
    // 取り込み後に注釈が消えて取り込み前の見た目と一致しなくなる。
    // 原本は注釈を焼き込まない素の画像であり、複製元は常に原本とする。
    //
    // 合成済みサムネイルが無い場合は通常サムネイルを複製する。これは稀な例外ではなく、
    // 合成済みサムネイルが埋まるのは画像編集画面での再保存時のみであるため、現時点の
    // 既存データではこちらが既定の経路である。したがって注釈があっても合成済み
    // サムネイルが未生成であれば、取り込み結果に注釈は写らない。これは
    // 「取り込み後の見た目が取り込み前と一致する」ことに対する承認済みの差分であり、
    // 取り込み自体を失敗させない（design.md「工事写真への取り込み時の見た目（承認済みの差分）」）。
    // 当該画像を一度でも画像編集画面で保存すれば、以降は注釈付きサムネイルが複製される。
    const thumbnailSourcePath = source.annotatedThumbnailPath ?? source.thumbnailPath;
    await this.storageProvider.copy(source.originalPath, originalPath);
    await this.storageProvider.copy(thumbnailSourcePath, thumbnailPath);

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
   * 看板の指定と配置は、参照先の看板の生死を踏まえて解決した値を載せる（R9.7）。
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
      ...resolveSignboardAssignment(photo),
      thumbnailUrl,
      printImageUrl: `/api/construction-photos/images/${photo.id}/print-image`,
      createdAt: photo.createdAt.toISOString(),
    };
  }
}
