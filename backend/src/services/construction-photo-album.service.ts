/**
 * @fileoverview 工事写真アルバムサービス
 *
 * 工事写真アルバムのCRUD操作・一覧・検索・ソート・楽観的排他制御・論理削除を担当する。
 * 既存の現場調査サービス（site-survey.service.ts）の実装パターンを踏襲する。
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規アルバムレコードを作成する
 * - 1.2: アルバムの基本情報を取得する
 * - 1.3: 楽観的排他制御を用いてアルバムレコードを更新する
 * - 1.4: アルバムを論理削除する（配下の写真項目はCascade/親のdeletedAtで無効化）
 * - 1.5: 同時編集による競合が検出される場合、競合エラーを返す
 * - 1.6: プロジェクトが存在しない場合、アルバムの作成を許可しない
 * - 3.1: プロジェクト単位でのページネーション
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: ソート機能（作成日・更新日）
 * - 11.1: 一覧は最大50件のページネーション（既定limit=50）
 * - 13.2: 取得系は対象が要求プロジェクト配下であることを検証する
 *
 * @module services/construction-photo-album
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { NotFoundError, ConflictError } from '../errors/apiError.js';
import type { ConstructionPhotoAlbumDto } from '../types/construction-photo.types.js';

// ============================================================================
// エラークラス（本ドメイン境界内で定義）
// ============================================================================

/**
 * プロジェクトが見つからない場合のエラー（アルバム作成時）
 * 404 Not Found
 *
 * Requirements: 1.6
 */
export class ProjectNotFoundForAlbumError extends NotFoundError {
  constructor(public readonly projectId: string) {
    super(`Project not found: ${projectId}`, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundForAlbumError';
  }
}

/**
 * 工事写真アルバムが見つからないエラー
 * 404 Not Found
 */
export class ConstructionPhotoAlbumNotFoundError extends NotFoundError {
  constructor(public readonly albumId: string) {
    super(`Construction photo album not found: ${albumId}`, 'CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND');
    this.name = 'ConstructionPhotoAlbumNotFoundError';
  }
}

/**
 * 工事写真アルバム競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 *
 * Requirements: 1.5
 */
export class ConstructionPhotoAlbumConflictError extends ConflictError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONSTRUCTION_PHOTO_ALBUM_CONFLICT', details);
    this.name = 'ConstructionPhotoAlbumConflictError';
  }
}

// ============================================================================
// 型定義
// ============================================================================

/**
 * ConstructionPhotoAlbumService依存関係
 */
export interface ConstructionPhotoAlbumServiceDependencies {
  prisma: PrismaClient;
}

/**
 * アルバム作成入力
 * Requirements: 1.1
 */
export interface CreateAlbumInput {
  projectId: string;
  name: string;
  memo?: string | null;
}

/**
 * アルバム更新入力（楽観的排他制御用に updatedAt を必須で受け取る）
 * Requirements: 1.3, 1.5
 */
export interface UpdateAlbumInput {
  name?: string;
  memo?: string | null;
  /** 期待される更新日時（ISO 8601文字列、楽観的排他制御用） */
  updatedAt: string;
}

/**
 * ソート可能フィールド
 * Requirements: 3.4
 */
export type ConstructionPhotoAlbumSortableField = 'createdAt' | 'updatedAt';

/**
 * ソート順序
 */
export type ConstructionPhotoAlbumSortOrder = 'asc' | 'desc';

/**
 * 一覧フィルター条件
 * Requirements: 3.3
 */
export interface AlbumFilter {
  /** アルバム名の部分一致検索 */
  search?: string;
}

/**
 * 一覧取得オプション
 * Requirements: 3.1, 3.3, 3.4, 11.1
 */
export interface FindByProjectOptions {
  page?: number;
  limit?: number;
  filter?: AlbumFilter;
  sort?: ConstructionPhotoAlbumSortableField;
  order?: ConstructionPhotoAlbumSortOrder;
}

/**
 * ページネーション情報
 */
export interface AlbumPaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付きアルバム一覧
 */
export interface PaginatedAlbums {
  data: ConstructionPhotoAlbumDto[];
  pagination: AlbumPaginationInfo;
}

/**
 * 一覧の既定件数（最大50件）
 * Requirements: 11.1
 */
const DEFAULT_LIMIT = 50;

/**
 * 一覧の既定ソート
 */
const DEFAULT_SORT: ConstructionPhotoAlbumSortableField = 'createdAt';
const DEFAULT_ORDER: ConstructionPhotoAlbumSortOrder = 'desc';

/**
 * Prismaが返すアルバムレコードの最小形（DTO変換用）
 */
interface AlbumRecord {
  id: string;
  projectId: string;
  name: string;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 工事写真アルバムサービス
 */
export class ConstructionPhotoAlbumService {
  private readonly prisma: PrismaClient;

  constructor(deps: ConstructionPhotoAlbumServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * アルバム作成
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクト存在確認（Requirements: 1.6）
   * 2. アルバム作成（Requirements: 1.1）
   *
   * @param input - 作成入力
   * @returns 作成されたアルバムDTO
   * @throws ProjectNotFoundForAlbumError プロジェクトが存在しない、または論理削除済みの場合
   */
  async create(input: CreateAlbumInput): Promise<ConstructionPhotoAlbumDto> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクト存在確認（Requirements: 1.6）
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, deletedAt: true },
      });
      if (!project || project.deletedAt !== null) {
        throw new ProjectNotFoundForAlbumError(input.projectId);
      }

      // 2. アルバム作成（Requirements: 1.1）
      const album = await tx.constructionPhotoAlbum.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          memo: input.memo ?? null,
        },
      });

      return this.toDto(album);
    });
  }

  /**
   * アルバム更新（楽観的排他制御）
   *
   * expectedUpdatedAt（input.updatedAt）と実際のupdatedAtが一致しない場合は
   * ConstructionPhotoAlbumConflictError をスローする。
   *
   * Requirements:
   * - 1.3: 楽観的排他制御を用いてアルバムレコードを更新する
   * - 1.5: 同時編集による競合が検出される場合、競合エラーを返す
   *
   * @param id - アルバムID
   * @param input - 更新入力（updatedAt必須）
   * @returns 更新されたアルバムDTO
   * @throws ConstructionPhotoAlbumNotFoundError 存在しない、または論理削除済みの場合
   * @throws ConstructionPhotoAlbumConflictError 楽観的排他制御エラー（競合）
   */
  async update(id: string, input: UpdateAlbumInput): Promise<ConstructionPhotoAlbumDto> {
    return await this.prisma.$transaction(async (tx) => {
      const album = await tx.constructionPhotoAlbum.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          memo: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!album || album.deletedAt !== null) {
        throw new ConstructionPhotoAlbumNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較（Requirements: 1.5）
      const expectedUpdatedAt = new Date(input.updatedAt);
      if (album.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConstructionPhotoAlbumConflictError(
          'アルバムは他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: album.updatedAt.toISOString(),
          }
        );
      }

      const updateData: { name?: string; memo?: string | null } = {};
      if (input.name !== undefined) {
        updateData.name = input.name;
      }
      if (input.memo !== undefined) {
        updateData.memo = input.memo;
      }

      const updated = await tx.constructionPhotoAlbum.update({
        where: { id },
        data: updateData,
      });

      return this.toDto(updated);
    });
  }

  /**
   * アルバム論理削除
   *
   * deletedAt を設定して論理削除する。配下の写真項目は親アルバムの deletedAt
   * により取得クエリから除外される（親子一括無効化）。
   *
   * Requirements:
   * - 1.4: アルバムと関連する写真項目・看板配置データを論理削除する
   *
   * @param id - アルバムID
   * @throws ConstructionPhotoAlbumNotFoundError 存在しない、または論理削除済みの場合
   */
  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const album = await tx.constructionPhotoAlbum.findUnique({
        where: { id },
        select: { id: true, deletedAt: true },
      });

      if (!album || album.deletedAt !== null) {
        throw new ConstructionPhotoAlbumNotFoundError(id);
      }

      await tx.constructionPhotoAlbum.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  /**
   * アルバム詳細取得
   *
   * 論理削除されたレコードは除外する。projectId が指定された場合は、対象アルバムが
   * 当該プロジェクト配下であることを検証する（要求プロジェクト外は取得不可）。
   *
   * Requirements:
   * - 1.2: アルバムの基本情報を取得する
   * - 13.2: 取得系は対象が要求プロジェクト配下であることを検証する
   *
   * @param id - アルバムID
   * @param projectId - （任意）要求プロジェクトID。指定時は配下検証を行う
   * @returns アルバムDTO
   * @throws ConstructionPhotoAlbumNotFoundError 存在しない、論理削除済み、または要求プロジェクト外の場合
   */
  async findById(id: string, projectId?: string): Promise<ConstructionPhotoAlbumDto> {
    const album = await this.prisma.constructionPhotoAlbum.findUnique({
      where: { id, deletedAt: null },
    });

    if (!album) {
      throw new ConstructionPhotoAlbumNotFoundError(id);
    }

    // プロジェクト境界の検証（Requirements: 13.2）
    if (projectId !== undefined && album.projectId !== projectId) {
      throw new ConstructionPhotoAlbumNotFoundError(id);
    }

    return this.toDto(album);
  }

  /**
   * プロジェクトIDによるアルバム一覧取得
   *
   * ページネーション（最大50件）、アルバム名の部分一致検索、作成日/更新日ソートに対応する。
   * 論理削除済みを除外し、指定プロジェクト配下のアルバムのみを返す。
   *
   * Requirements:
   * - 3.1: プロジェクト単位でのページネーション
   * - 3.3: アルバム名での部分一致検索
   * - 3.4: ソート機能（作成日・更新日）
   * - 11.1: 一覧は最大50件のページネーション（既定limit=50）
   * - 13.2: 指定プロジェクト配下のアルバムのみを返す
   *
   * @param projectId - プロジェクトID
   * @param opts - 一覧取得オプション
   * @returns ページネーション付きアルバム一覧
   */
  async findByProject(projectId: string, opts: FindByProjectOptions): Promise<PaginatedAlbums> {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const sort = opts.sort ?? DEFAULT_SORT;
    const order = opts.order ?? DEFAULT_ORDER;

    // WHERE条件の構築（Requirements: 13.2）
    const where: Prisma.ConstructionPhotoAlbumWhereInput = {
      projectId,
      deletedAt: null,
    };

    // アルバム名の部分一致検索（Requirements: 3.3）
    const search = opts.filter?.search;
    if (search && search.trim() !== '') {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // ソート条件（Requirements: 3.4）
    const orderBy: Prisma.ConstructionPhotoAlbumOrderByWithRelationInput = { [sort]: order };

    // ページネーション（Requirements: 3.1, 11.1）
    const skip = (page - 1) * limit;

    const [albums, total] = await Promise.all([
      this.prisma.constructionPhotoAlbum.findMany({ where, orderBy, skip, take: limit }),
      this.prisma.constructionPhotoAlbum.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: albums.map((album) => this.toDto(album)),
      pagination: { page, limit, total, totalPages },
    };
  }

  /**
   * DBレコードをDTOへ変換する（createdAt/updatedAt を ISO 文字列化）
   */
  private toDto(album: AlbumRecord): ConstructionPhotoAlbumDto {
    return {
      id: album.id,
      projectId: album.projectId,
      name: album.name,
      memo: album.memo,
      createdAt: album.createdAt.toISOString(),
      updatedAt: album.updatedAt.toISOString(),
    };
  }
}
