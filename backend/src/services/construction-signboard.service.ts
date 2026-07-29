/**
 * @fileoverview 工事看板マスタサービス
 *
 * プロジェクト単位の工事看板（電子小黒板調・構造化テキスト）マスタの CRUD・一覧・
 * 楽観的排他制御・論理削除を担当する。使用中看板の削除では、当該看板を参照する
 * 写真項目の件数（inUseCount）を返す。既存の工事写真アルバムサービス
 * （construction-photo-album.service.ts）の実装パターンを踏襲する。
 *
 * Requirements:
 * - 8.1: 当該プロジェクトに紐付く工事看板レコードを作成する
 * - 8.2: 標準項目「工事件名」「工事場所」（それぞれ値）を保持する
 * - 8.3: ラベルと値の組からなる任意数の自由項目行を保持する
 * - 8.4: 下部記入欄の固定テキスト（複数行を許容）を保持する
 * - 8.6: 工事看板を編集して保存する（楽観的排他制御で更新する）
 * - 8.7: 工事看板を削除する（論理削除）
 * - 8.8: 使用中の看板削除時に使用件数（inUseCount）を返す
 * - 8.9: 工事看板を当該プロジェクト配下でのみ選択・参照可能とする
 * - 8.10: 当該プロジェクトに登録済みの工事看板を一覧表示する
 * - 13.2: 取得・更新・削除は対象が要求プロジェクト配下であることを検証する
 *
 * @module services/construction-signboard
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { NotFoundError, ConflictError } from '../errors/apiError.js';
import type {
  ConstructionSignboardDto,
  SignboardFreeItem,
} from '../types/construction-photo.types.js';

// ============================================================================
// エラークラス（本ドメイン境界内で定義）
// ============================================================================

/**
 * プロジェクトが見つからない場合のエラー（看板作成時）
 * 404 Not Found
 *
 * Requirements: 8.9
 */
export class ProjectNotFoundForSignboardError extends NotFoundError {
  constructor(public readonly projectId: string) {
    super(`Project not found: ${projectId}`, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundForSignboardError';
  }
}

/**
 * 工事看板が見つからないエラー
 * 404 Not Found
 */
export class ConstructionSignboardNotFoundError extends NotFoundError {
  constructor(public readonly signboardId: string) {
    super(`Construction signboard not found: ${signboardId}`, 'CONSTRUCTION_SIGNBOARD_NOT_FOUND');
    this.name = 'ConstructionSignboardNotFoundError';
  }
}

/**
 * 工事看板競合エラー（楽観的排他制御エラー）
 * 409 Conflict
 *
 * Requirements: 8.6
 */
export class ConstructionSignboardConflictError extends ConflictError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONSTRUCTION_SIGNBOARD_CONFLICT', details);
    this.name = 'ConstructionSignboardConflictError';
  }
}

// ============================================================================
// 型定義
// ============================================================================

/**
 * ConstructionSignboardService依存関係
 */
export interface ConstructionSignboardServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 看板作成入力
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export interface CreateSignboardInput {
  projectId: string;
  workName: string;
  workLocation: string;
  freeItems: SignboardFreeItem[];
  footerText?: string | null;
}

/**
 * 看板更新入力（楽観的排他制御用に updatedAt を必須で受け取る）
 * Requirements: 8.6
 */
export interface UpdateSignboardInput {
  workName?: string;
  workLocation?: string;
  freeItems?: SignboardFreeItem[];
  footerText?: string | null;
  /** 期待される更新日時（ISO 8601文字列、楽観的排他制御用） */
  updatedAt: string;
}

/**
 * 削除結果（使用件数）
 * Requirements: 8.8
 */
export interface DeleteSignboardResult {
  /** 当該看板を参照している写真項目の件数（>0 は使用中） */
  inUseCount: number;
}

/**
 * Prismaが返す看板レコードの最小形（DTO変換用）
 */
interface SignboardRecord {
  id: string;
  projectId: string;
  workName: string;
  workLocation: string;
  freeItems: Prisma.JsonValue;
  footerText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 工事看板マスタサービス
 */
export class ConstructionSignboardService {
  private readonly prisma: PrismaClient;

  constructor(deps: ConstructionSignboardServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 看板作成
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクト存在確認（Requirements: 8.9）
   * 2. 看板作成（Requirements: 8.1, 8.2, 8.3, 8.4）
   *
   * @param input - 作成入力
   * @returns 作成された看板DTO
   * @throws ProjectNotFoundForSignboardError プロジェクトが存在しない、または論理削除済みの場合
   */
  async create(input: CreateSignboardInput): Promise<ConstructionSignboardDto> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクト存在確認（Requirements: 8.9）
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, deletedAt: true },
      });
      if (!project || project.deletedAt !== null) {
        throw new ProjectNotFoundForSignboardError(input.projectId);
      }

      // 2. 看板作成（Requirements: 8.1, 8.2, 8.3, 8.4）
      const signboard = await tx.constructionSignboard.create({
        data: {
          projectId: input.projectId,
          workName: input.workName,
          workLocation: input.workLocation,
          freeItems: input.freeItems as unknown as Prisma.InputJsonValue,
          footerText: input.footerText ?? null,
        },
      });

      return this.toDto(signboard);
    });
  }

  /**
   * 看板更新（楽観的排他制御）
   *
   * expectedUpdatedAt（input.updatedAt）と実際のupdatedAtが一致しない場合は
   * ConstructionSignboardConflictError をスローする。projectId が指定された場合は、
   * 対象看板が当該プロジェクト配下であることを検証する（Requirements: 13.2）。
   *
   * Requirements:
   * - 8.6: 工事看板を編集して保存する（楽観的排他制御）
   * - 13.2: 対象が要求プロジェクト配下であることを検証する
   *
   * @param id - 看板ID
   * @param input - 更新入力（updatedAt必須）
   * @param projectId - （任意）要求プロジェクトID。指定時は配下検証を行う
   * @returns 更新された看板DTO
   * @throws ConstructionSignboardNotFoundError 存在しない、論理削除済み、または要求プロジェクト外の場合
   * @throws ConstructionSignboardConflictError 楽観的排他制御エラー（競合）
   */
  async update(
    id: string,
    input: UpdateSignboardInput,
    projectId?: string
  ): Promise<ConstructionSignboardDto> {
    return await this.prisma.$transaction(async (tx) => {
      const signboard = await tx.constructionSignboard.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          workName: true,
          workLocation: true,
          freeItems: true,
          footerText: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!signboard || signboard.deletedAt !== null) {
        throw new ConstructionSignboardNotFoundError(id);
      }

      // プロジェクト境界の検証（Requirements: 13.2）
      if (projectId !== undefined && signboard.projectId !== projectId) {
        throw new ConstructionSignboardNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較（Requirements: 8.6）
      const expectedUpdatedAt = new Date(input.updatedAt);
      if (signboard.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConstructionSignboardConflictError(
          '工事看板は他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: signboard.updatedAt.toISOString(),
          }
        );
      }

      const updateData: Prisma.ConstructionSignboardUpdateInput = {};
      if (input.workName !== undefined) {
        updateData.workName = input.workName;
      }
      if (input.workLocation !== undefined) {
        updateData.workLocation = input.workLocation;
      }
      if (input.freeItems !== undefined) {
        updateData.freeItems = input.freeItems as unknown as Prisma.InputJsonValue;
      }
      if (input.footerText !== undefined) {
        updateData.footerText = input.footerText;
      }

      const updated = await tx.constructionSignboard.update({
        where: { id },
        data: updateData,
      });

      return this.toDto(updated);
    });
  }

  /**
   * 看板論理削除（使用件数を返す）
   *
   * deletedAt を設定して論理削除する。削除に先立ち、当該看板を参照する写真項目
   * （ConstructionPhoto.signboardId）の件数を数えて返す。呼び出し側（ルート/UI）は
   * inUseCount>0 のとき使用中である旨を警告する（Requirements: 8.8）。看板削除後の
   * 写真項目は看板なしとして扱われる（参照側の解決は印字画像生成時に行う）。
   *
   * Requirements:
   * - 8.7: 工事看板を削除する（論理削除）
   * - 8.8: 使用中の看板削除時に使用件数（inUseCount）を返す
   * - 13.2: 対象が要求プロジェクト配下であることを検証する
   *
   * @param id - 看板ID
   * @param projectId - （任意）要求プロジェクトID。指定時は配下検証を行う
   * @returns 使用件数（inUseCount）
   * @throws ConstructionSignboardNotFoundError 存在しない、論理削除済み、または要求プロジェクト外の場合
   */
  async delete(id: string, projectId?: string): Promise<DeleteSignboardResult> {
    return await this.prisma.$transaction(async (tx) => {
      const signboard = await tx.constructionSignboard.findUnique({
        where: { id },
        select: { id: true, projectId: true, deletedAt: true },
      });

      if (!signboard || signboard.deletedAt !== null) {
        throw new ConstructionSignboardNotFoundError(id);
      }

      // プロジェクト境界の検証（Requirements: 13.2）
      if (projectId !== undefined && signboard.projectId !== projectId) {
        throw new ConstructionSignboardNotFoundError(id);
      }

      // 使用件数（当該看板を参照する写真項目）を数える（Requirements: 8.8）
      const inUseCount = await tx.constructionPhoto.count({
        where: { signboardId: id },
      });

      await tx.constructionSignboard.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return { inUseCount };
    });
  }

  /**
   * プロジェクトIDによる看板一覧取得
   *
   * 論理削除済みを除外し、指定プロジェクト配下の看板のみを作成日降順で返す。
   *
   * Requirements:
   * - 8.9: 工事看板を当該プロジェクト配下でのみ選択・参照可能とする
   * - 8.10: 当該プロジェクトに登録済みの工事看板を一覧表示する
   * - 13.2: 指定プロジェクト配下の看板のみを返す
   *
   * @param projectId - プロジェクトID
   * @returns 看板DTO配列
   */
  async findByProject(projectId: string): Promise<ConstructionSignboardDto[]> {
    const signboards = await this.prisma.constructionSignboard.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // 各看板の使用件数（当該看板を参照する写真項目の件数）を1クエリで集計する。
    // 看板ごとに count するとN+1になるため groupBy で一括集計する（Requirements: 8.8）
    const inUseCountMap = new Map<string, number>();
    if (signboards.length > 0) {
      const grouped = await this.prisma.constructionPhoto.groupBy({
        by: ['signboardId'],
        where: { signboardId: { in: signboards.map((s) => s.id) } },
        _count: { _all: true },
      });
      for (const row of grouped) {
        if (row.signboardId !== null) {
          inUseCountMap.set(row.signboardId, row._count._all);
        }
      }
    }

    return signboards.map((signboard) =>
      this.toDto(signboard, inUseCountMap.get(signboard.id) ?? 0)
    );
  }

  /**
   * DBレコードをDTOへ変換する（createdAt/updatedAt を ISO 文字列化、freeItems を型付け）。
   *
   * inUseCount は当該看板を参照する写真項目の件数。一覧（findByProject）が集計値を渡す。
   * 作成・更新の応答では既定 0（新規は0、更新の使用件数はリスト/削除応答で取得する）。
   */
  private toDto(signboard: SignboardRecord, inUseCount = 0): ConstructionSignboardDto {
    return {
      id: signboard.id,
      projectId: signboard.projectId,
      workName: signboard.workName,
      workLocation: signboard.workLocation,
      freeItems: (signboard.freeItems ?? []) as unknown as SignboardFreeItem[],
      footerText: signboard.footerText,
      inUseCount,
      createdAt: signboard.createdAt.toISOString(),
      updatedAt: signboard.updatedAt.toISOString(),
    };
  }
}
