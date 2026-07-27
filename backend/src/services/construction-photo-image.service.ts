/**
 * @fileoverview 工事写真画像サービス（アップロード）
 *
 * 写真項目（ConstructionPhoto）を3系統（ローカル/カメラ/現調コピー）で追加する
 * ドメインサービス。本ファイルでは Task 2.2 の対象である `addFromUpload`
 * （ローカルアップロード＝カメラ撮影もサーバ側は同一経路）を実装する。
 * 現調コピー（addFromSurveyImage=2.3）・一覧（listWithUrls=2.4）・印字画像
 * （getPrintImage=3.3）・削除（delete=2.5系）は後続タスクで本ファイルへ追加する。
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
 *
 * @module services/construction-photo-image
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { ImageProcessorService } from './image-processor.service.js';
import type { SurveyImageService, UploadFile } from './survey-image.service.js';
import { ConstructionPhotoAlbumNotFoundError } from './construction-photo-album.service.js';
import type {
  ConstructionPhotoWithUrls,
  SignboardPlacement,
} from '../types/construction-photo.types.js';
import logger from '../utils/logger.js';

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

  constructor(deps: ConstructionPhotoImageServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider;
    this.surveyImageService = deps.surveyImageService;
    this.imageProcessorService = deps.imageProcessorService;
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
