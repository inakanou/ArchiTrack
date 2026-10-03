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
 * - 13.2: 対象アルバムが、実在し取り除かれていないプロジェクト配下であることを検証する（取り除かれた
 *   プロジェクト・論理削除済みのアルバムの配下は拒否する）。
 *   更新できる利用者はルートの RBAC 権限（requirePermission）だけで決め、本サービスは
 *   プロジェクトの担当者（作成者・営業担当・工事担当）や admin ロールでの絞り込みを行わない
 *   （Task 23.1 の利用者の判断）
 *
 * @module services/construction-photo-metadata
 */

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import { NotFoundError, BadRequestError } from '../errors/apiError.js';
import {
  ConstructionPhotoNotFoundError,
  isAddressedAlbum,
  resolveSignboardAssignment,
  SIGNBOARD_LIVENESS_SELECT,
  // 署名付きURLの有効期限（秒）。工事写真の全呼び出しで一つの出所を引く（Requirements: 11.6）
  SIGNED_URL_EXPIRES_IN,
  type SignboardLivenessRecord,
} from './construction-photo-image.service.js';
import {
  AVAILABILITY_IN_PROJECT_SELECT,
  isAvailableInLiveProject,
} from './construction-photo-availability.js';
import type {
  ConstructionPhotoWithUrls,
  SignboardPlacement,
} from '../types/construction-photo.types.js';

/**
 * コメントの最大長（schema/COMMENT_MAX_LENGTH と一致）。Requirements: 7.2
 */
const MAX_COMMENT_LENGTH = 2000;

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
  /** 参照先の看板の生死（応答の看板の指定の解決に使う, R9.7） */
  signboard?: SignboardLivenessRecord | null;
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
  // 参照先の看板の生死を同じ読み出しに含める（削除済みは看板なしとして返す, R9.7）
  signboard: SIGNBOARD_LIVENESS_SELECT,
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
   * 全idが同一アルバムに属することを検証し（design Precondition）、対象アルバムとその
   * プロジェクトが論理削除されていないことを確認する（R13.2, R13.3）。更新できる利用者はルートの
   * RBAC 権限（construction_photo:update）が決め、プロジェクトの担当者での絞り込みは行わない。
   * signboardId 指定時は
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
   * @param albumId - （任意）写真項目をアルバムの配下として指したときのアルバムID。指定時は所属を検証する
   * @returns 更新後の写真項目（署名付きサムネURL同梱）
   * @throws {ConstructionPhotoNotFoundError} 存在しない写真・指定アルバムに属さない・アルバムかプロジェクトが論理削除済みの場合
   * @throws {ConstructionPhotoBatchAlbumMismatchError} 複数アルバムにまたがる場合
   * @throws {SignboardNotAllowedError} 存在しない/他プロジェクトの signboardId を含む場合
   * @throws {CommentTooLongError} コメントが2000文字を超える場合
   */
  async updateMetadataBatch(
    inputs: BatchUpdatePhotoMetadataInput[],
    albumId?: string
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

    // 対象写真の存在確認＋所属アルバム/プロジェクトの特定と論理削除状態の取得
    const ids = inputs.map((i) => i.id);
    const photos = await this.prisma.constructionPhoto.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        albumId: true,
        album: { select: { projectId: true, ...AVAILABILITY_IN_PROJECT_SELECT } },
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
    // 指定アルバムに属さない、またはアルバムかプロジェクトが論理削除済みなら 404（R13.2, R13.3）
    if (!isAddressedAlbum(photos[0]!.albumId, albumId) || !isAvailableInLiveProject(album)) {
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
   * 全ての順序対象が当該アルバムに属し、アルバムとそのプロジェクトが論理削除されていない
   * ことを検証する（R13.2, R13.3）。更新できる利用者はルートの RBAC 権限
   * （construction_photo:update）が決め、プロジェクトの担当者での絞り込みは行わない。送信された相対順序を
   * 1..n に正規化して1トランザクションで確定する（R7.3, R7.4, R7.6, 11.4 の順序側）。
   *
   * Requirements: 7.3, 7.4, 7.6, 11.4, 13.2
   *
   * @param albumId - 対象アルバムID
   * @param orders - 順序更新の配列
   * @throws {ConstructionPhotoNotFoundError} 写真が存在しない・アルバム外・アルバムかプロジェクトが論理削除済みの場合
   */
  async updateOrder(albumId: string, orders: PhotoOrderUpdate[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    // 対象写真の存在確認＋所属アルバムとプロジェクトの論理削除状態の取得
    const ids = orders.map((o) => o.id);
    const photos = await this.prisma.constructionPhoto.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        albumId: true,
        album: { select: AVAILABILITY_IN_PROJECT_SELECT },
      },
    });

    // 存在しない・指定アルバムに属さない・アルバムかプロジェクトが論理削除済みの写真が
    // 1件でもあれば 404（R13.2, R13.3）
    const byId = new Map(photos.map((p) => [p.id, p]));
    for (const order of orders) {
      const photo = byId.get(order.id);
      if (!photo || photo.albumId !== albumId || !isAvailableInLiveProject(photo.album)) {
        throw new ConstructionPhotoNotFoundError(order.id);
      }
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
   * ConstructionPhoto レコードを署名付きURL同梱の DTO へ変換する。
   *
   * thumbnailUrl はサムネの署名付きURL（TTL 900s、失敗時 null）。原本URLは含めない
   * （サムネ優先, R11.3）。printImageUrl は PDF 用の印字画像取得エンドポイント。
   * 看板の指定と配置は、写真一覧と同じく参照先の看板の生死を踏まえて解決する（R9.7）。
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
