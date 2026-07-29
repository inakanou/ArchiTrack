/**
 * @fileoverview 工事写真メタデータ・並び替えサービス
 *
 * 写真項目（ConstructionPhoto）のコメント・印刷対象フラグ・工事看板の関連付け
 * （signboardId）・看板配置（signboardPlacement）・表示順序（displayOrder）を
 * 一括で確定するドメインサービス。既存の `image-metadata.service.ts`
 * （updateMetadataBatch, displayOrder 1..n 正規化, トランザクション）と
 * `image-order.service.ts`（updateImageOrder）の実装パターンを踏襲する。
 *
 * 看板合成は本サービスでは**一切行わない**。看板の指定（signboardId/placement）は
 * 保持するのみで、印字画像の合成は PDF 出力時にオンデマンドで実行する
 * （design Postcondition, R7.6, R9.5）。
 *
 * Requirements:
 * - 7.1: コメントを未保存として保持し保存操作で確定する
 * - 7.3, 7.4: 表示順序（並び替え）の変更を確定する
 * - 7.5: 印刷対象フラグの切替を確定する
 * - 7.6: 未保存のコメント・印刷対象・表示順序をまとめて確定（displayOrder は 1..n 正規化）
 * - 9.1: 写真項目への工事看板の関連付け（signboardId、同一プロジェクトのみ許可）
 * - 9.5: 看板・表示位置・大きさの指定を確定（保持のみ、合成しない）
 * - 11.4: メタ一括更新と表示順序更新の最大2リクエストにまとめて反映
 * - 13.2: 対象アルバムがアクセス可能なプロジェクト配下であることを検証
 *
 * @module services/construction-photo-metadata
 */

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import { NotFoundError, BadRequestError } from '../errors/apiError.js';
import { ConstructionPhotoNotFoundError } from './construction-photo-image.service.js';
import type {
  ConstructionPhotoWithUrls,
  SignboardPlacement,
} from '../types/construction-photo.types.js';

/**
 * コメントの最大長（schema/COMMENT_MAX_LENGTH と一致）。Requirements: 7.2
 */
const MAX_COMMENT_LENGTH = 2000;

/**
 * 署名付きURLの有効期限（秒）。Requirements: 11.6
 */
const SIGNED_URL_EXPIRES_IN = 900;

/**
 * バッチ更新対象のIDが複数アルバムにまたがる（precondition 違反）場合のエラー。
 *
 * `updateMetadataBatch` は全idが同一アルバムに属すること（design Precondition）。
 */
export class ConstructionPhotoBatchAlbumMismatchError extends BadRequestError {
  constructor(public readonly albumIds: string[]) {
    super(
      `Batch update targets span multiple albums: ${albumIds.join(', ')}`,
      'CONSTRUCTION_PHOTO_BATCH_ALBUM_MISMATCH'
    );
    this.name = 'ConstructionPhotoBatchAlbumMismatchError';
  }
}

/**
 * 指定された signboardId が存在しない、または対象アルバムと異なるプロジェクトの
 * 工事看板だった場合のエラー。
 *
 * 工事看板は当該プロジェクト配下でのみ選択・参照可能（R8.9, R13.2）。情報漏洩を
 * 避けるため他プロジェクトの存在有無は区別せず 404 として扱う。
 */
export class SignboardNotAllowedError extends NotFoundError {
  constructor(public readonly signboardId: string) {
    super(`Signboard not found in the album's project: ${signboardId}`, 'SIGNBOARD_NOT_ALLOWED');
    this.name = 'SignboardNotAllowedError';
  }
}

/**
 * コメントが長すぎるエラー（境界の zod で通常は弾かれるが、サービス層でも防御的に検証）
 */
export class CommentTooLongError extends BadRequestError {
  constructor(
    public readonly length: number,
    public readonly maxLength: number
  ) {
    super(
      `コメントが長すぎます。最大${maxLength}文字までです（現在: ${length}文字）`,
      'COMMENT_TOO_LONG'
    );
    this.name = 'CommentTooLongError';
  }
}

/**
 * メタデータ一括更新の1項目
 */
export interface BatchUpdatePhotoMetadataInput {
  /** 写真項目ID */
  id: string;
  /** 写真コメント（最大2000文字、null でクリア） */
  comment?: string | null;
  /** 印刷対象フラグ */
  includeInReport?: boolean;
  /** 関連付ける工事看板ID（null で解除） */
  signboardId?: string | null;
  /** 看板配置ジオメトリ（null でクリア） */
  signboardPlacement?: SignboardPlacement | null;
  /** 表示順序（送信された相対順序は 1..n に正規化される） */
  displayOrder?: number;
}

/**
 * 並び替えの1項目
 */
export interface PhotoOrderUpdate {
  /** 写真項目ID */
  id: string;
  /** 新しい表示順序（相対順序、1..n に正規化される） */
  order: number;
}

/**
 * サービス依存関係
 */
export interface ConstructionPhotoMetadataServiceDependencies {
  prisma: PrismaClient;
  /** DTO のサムネ署名付きURL生成に利用（返却型 ConstructionPhotoWithUrls[] のため） */
  storageProvider: StorageProvider;
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

/** DTO 変換で選択する列（サムネ優先: 原本パスは含めない, R11.3） */
const PHOTO_DTO_SELECT = {
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
} as const;

/**
 * 工事写真メタデータ・並び替えサービス
 */
export class ConstructionPhotoMetadataService {
  private readonly prisma: PrismaClient;
  private readonly storageProvider: StorageProvider;

  constructor(deps: ConstructionPhotoMetadataServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider;
  }

  /**
   * 写真項目のメタデータ（コメント/印刷対象/看板ID/看板配置/表示順序）を一括更新する。
   *
   * 全idが同一アルバムに属することを検証し（design Precondition）、対象アルバムが
   * アクセス可能なプロジェクト配下であることを確認する（R13.2）。signboardId 指定時は
   * 当該看板が同一プロジェクトに存在することを検証し、不正なら弾く（R9.1, R8.9）。
   * displayOrder が指定された項目は 1..n に正規化する（R7.6）。すべての更新は1つの
   * トランザクションで確定する（11.4 のメタ側=1リクエスト）。
   *
   * 看板合成はここでは行わない。配置情報を保持するのみで、印字画像は PDF 出力時に
   * オンデマンド合成する（Postcondition, R7.6, R9.5）。
   *
   * Requirements: 7.1, 7.5, 7.6, 9.1, 9.5, 11.4, 13.2
   *
   * @param inputs - 更新項目の配列（全て同一アルバムの写真項目）
   * @param userId - リクエストユーザーID（プロジェクト境界検証用）
   * @returns 更新後の写真項目（署名付きサムネURL同梱）
   * @throws {ConstructionPhotoNotFoundError} 存在しない写真・論理削除済み・アクセス不可の場合
   * @throws {ConstructionPhotoBatchAlbumMismatchError} 複数アルバムにまたがる場合
   * @throws {SignboardNotAllowedError} 存在しない/他プロジェクトの signboardId を含む場合
   * @throws {CommentTooLongError} コメントが2000文字を超える場合
   */
  async updateMetadataBatch(
    inputs: BatchUpdatePhotoMetadataInput[],
    userId: string
  ): Promise<ConstructionPhotoWithUrls[]> {
    if (inputs.length === 0) {
      return [];
    }

    // コメント長の防御的検証（境界 zod と二重化）
    for (const input of inputs) {
      if (
        input.comment !== undefined &&
        input.comment !== null &&
        input.comment.length > MAX_COMMENT_LENGTH
      ) {
        throw new CommentTooLongError(input.comment.length, MAX_COMMENT_LENGTH);
      }
    }

    // 対象写真の存在確認＋所属アルバム/プロジェクト取得
    const ids = inputs.map((i) => i.id);
    const photos = await this.prisma.constructionPhoto.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        albumId: true,
        album: { select: { projectId: true, deletedAt: true } },
      },
    });

    const foundIds = new Set(photos.map((p) => p.id));
    for (const input of inputs) {
      if (!foundIds.has(input.id)) {
        throw new ConstructionPhotoNotFoundError(input.id);
      }
    }

    // 全idが同一アルバムに属すること（Precondition）
    const albumIds = [...new Set(photos.map((p) => p.albumId))];
    if (albumIds.length > 1) {
      throw new ConstructionPhotoBatchAlbumMismatchError(albumIds);
    }

    const album = photos[0]!.album;
    // 論理削除済みアルバム配下は 404
    if (album.deletedAt !== null) {
      throw new ConstructionPhotoNotFoundError(inputs[0]!.id);
    }

    // プロジェクト境界検証（R13.2）。アクセス不可は存在秘匿のため 404 とする
    const hasAccess = await this.canAccessProject(album.projectId, userId);
    if (!hasAccess) {
      throw new ConstructionPhotoNotFoundError(inputs[0]!.id);
    }

    // signboardId 指定（非 null）の整合検証: 同一プロジェクトに存在すること（R9.1, R8.9）
    const signboardIds = [
      ...new Set(
        inputs
          .filter((i) => i.signboardId !== undefined && i.signboardId !== null)
          .map((i) => i.signboardId as string)
      ),
    ];
    if (signboardIds.length > 0) {
      const signboards = await this.prisma.constructionSignboard.findMany({
        where: { id: { in: signboardIds } },
        select: { id: true, projectId: true, deletedAt: true },
      });
      const signboardById = new Map(signboards.map((s) => [s.id, s]));
      for (const signboardId of signboardIds) {
        const signboard = signboardById.get(signboardId);
        if (!signboard || signboard.deletedAt !== null || signboard.projectId !== album.projectId) {
          throw new SignboardNotAllowedError(signboardId);
        }
      }
    }

    // displayOrder 正規化: 指定された項目を抽出し 1..n に再番号付け（R7.6）
    const inputsWithOrder = inputs.filter((i) => i.displayOrder !== undefined);
    const normalizedOrders = this.normalizeDisplayOrders(
      inputsWithOrder.map((i) => ({ id: i.id, order: i.displayOrder! }))
    );

    // 1トランザクションで一括更新（看板合成は行わない）
    const updated = await this.prisma.$transaction(async (tx) => {
      const results: ConstructionPhotoRecord[] = [];

      for (const input of inputs) {
        const data: Prisma.ConstructionPhotoUncheckedUpdateInput = {};

        if (input.comment !== undefined) {
          data.comment = input.comment;
        }
        if (input.includeInReport !== undefined) {
          data.includeInReport = input.includeInReport;
        }
        if (input.signboardId !== undefined) {
          data.signboardId = input.signboardId;
        }
        if (input.signboardPlacement !== undefined) {
          // Json? のクリアは Prisma の JSON null 表現を用いる
          data.signboardPlacement =
            input.signboardPlacement === null
              ? Prisma.JsonNull
              : (input.signboardPlacement as unknown as Prisma.InputJsonValue);
        }
        const normalizedOrder = normalizedOrders.get(input.id);
        if (normalizedOrder !== undefined) {
          data.displayOrder = normalizedOrder;
        }

        if (Object.keys(data).length > 0) {
          results.push(
            (await tx.constructionPhoto.update({
              where: { id: input.id },
              data,
              select: PHOTO_DTO_SELECT,
            })) as ConstructionPhotoRecord
          );
        } else {
          const current = (await tx.constructionPhoto.findUnique({
            where: { id: input.id },
            select: PHOTO_DTO_SELECT,
          })) as ConstructionPhotoRecord | null;
          if (current) {
            results.push(current);
          }
        }
      }

      return results;
    });

    return Promise.all(updated.map((photo) => this.toDtoWithUrls(photo)));
  }

  /**
   * アルバム配下の写真項目の表示順序を一括更新する。
   *
   * 指定アルバムがアクセス可能なプロジェクト配下であることを確認し（R13.2）、
   * 全ての順序対象が当該アルバムに属することを検証する。送信された相対順序を
   * 1..n に正規化して1トランザクションで確定する（R7.3, R7.4, R7.6, 11.4 の順序側）。
   *
   * Requirements: 7.3, 7.4, 7.6, 11.4, 13.2
   *
   * @param albumId - 対象アルバムID
   * @param orders - 順序更新の配列
   * @param userId - リクエストユーザーID（プロジェクト境界検証用）
   * @throws {ConstructionPhotoNotFoundError} アルバム未特定・写真がアルバム外・アクセス不可の場合
   */
  async updateOrder(albumId: string, orders: PhotoOrderUpdate[], userId: string): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    // 対象写真の存在確認＋所属アルバム/プロジェクト取得
    const ids = orders.map((o) => o.id);
    const photos = await this.prisma.constructionPhoto.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        albumId: true,
        album: { select: { projectId: true, deletedAt: true } },
      },
    });

    // 存在しない、または指定アルバムに属さない写真が1件でもあれば 404
    const byId = new Map(photos.map((p) => [p.id, p]));
    for (const order of orders) {
      const photo = byId.get(order.id);
      if (!photo || photo.albumId !== albumId || photo.album.deletedAt !== null) {
        throw new ConstructionPhotoNotFoundError(order.id);
      }
    }

    // プロジェクト境界検証（R13.2）。アクセス不可は存在秘匿のため 404 とする
    const projectId = photos[0]!.album.projectId;
    const hasAccess = await this.canAccessProject(projectId, userId);
    if (!hasAccess) {
      throw new ConstructionPhotoNotFoundError(orders[0]!.id);
    }

    // 相対順序を 1..n に正規化（R7.6）
    const normalizedOrders = this.normalizeDisplayOrders(orders);

    // 1トランザクションで一括更新
    await this.prisma.$transaction(async (tx) => {
      for (const order of orders) {
        await tx.constructionPhoto.update({
          where: { id: order.id },
          data: { displayOrder: normalizedOrders.get(order.id)! },
        });
      }
    });
  }

  /**
   * 相対順序を 1 から始まる連番に正規化する。
   *
   * order 昇順（同値は元の配列順を保持）で並べ、1..n を割り当てる。
   * 欠番・重複・非連番があっても安定した連番を得る（R7.6）。
   *
   * @param items - id と相対順序の配列
   * @returns id → 正規化後の displayOrder のマップ
   */
  private normalizeDisplayOrders(items: Array<{ id: string; order: number }>): Map<string, number> {
    const result = new Map<string, number>();
    if (items.length === 0) {
      return result;
    }

    const sorted = items
      .map((item, index) => ({ item, originalIndex: index }))
      .sort((a, b) => {
        if (a.item.order !== b.item.order) {
          return a.item.order - b.item.order;
        }
        return a.originalIndex - b.originalIndex;
      });

    sorted.forEach(({ item }, index) => {
      result.set(item.id, index + 1);
    });

    return result;
  }

  /**
   * ユーザーが指定プロジェクトにアクセス可能かを判定する（R13.2, R13.3）。
   *
   * 以下のいずれかを満たす場合に true:
   * 1. プロジェクトの作成者/営業担当者/工事担当者である
   * 2. admin ロールを持つ
   *
   * 注: プロジェクトアクセス判定の共有ヘルパーが未整備のため、ConstructionPhotoImageService
   * と同一ポリシーを本サービスでも適用する（将来は共通化候補）。
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
   * ConstructionPhoto レコードを署名付きURL同梱の DTO へ変換する。
   *
   * thumbnailUrl はサムネの署名付きURL（TTL 900s、失敗時 null）。原本URLは含めない
   * （サムネ優先, R11.3）。printImageUrl は PDF 用の印字画像取得エンドポイント。
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
