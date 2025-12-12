/**
 * @fileoverview プロジェクトサービス
 *
 * プロジェクトのCRUD操作とビジネスロジックを担当します。
 *
 * Requirements:
 * - 1.7, 1.8, 1.14, 1.15: プロジェクト作成（初期ステータス履歴含む）
 * - 2.1, 2.2, 2.6: プロジェクト一覧表示
 * - 3.1, 3.2, 3.3, 3.4, 3.5: ページネーション
 * - 4.1: 検索（プロジェクト名・顧客名の部分一致）
 * - 5.1, 5.2, 5.3, 5.4: フィルタリング（ステータス、作成日範囲）
 * - 6.1, 6.2, 6.5: ソート
 * - 7.1: プロジェクト詳細取得
 * - 8.2, 8.3, 8.6: プロジェクト更新（楽観的排他制御）
 * - 9.2, 9.6: プロジェクト論理削除
 * - 11.5, 11.6: 関連データ件数取得（機能フラグ対応）
 * - 12.4, 12.6: 監査ログ連携（PROJECT_CREATED, PROJECT_UPDATED, PROJECT_DELETED）
 * - 13.4, 13.6: 担当者IDバリデーション（admin以外の有効ユーザー確認）
 *
 * @module services/project
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  SortableField,
  SortOrder,
} from '../schemas/project.schema.js';
import type { ProjectStatus } from '../types/project.types.js';
import { PROJECT_STATUS_LABELS } from '../types/project.types.js';
import {
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectConflictError,
} from '../errors/projectError.js';

/**
 * ProjectService依存関係
 */
export interface ProjectServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * ユーザー情報（表示用）
 */
export interface UserSummary {
  id: string;
  displayName: string;
}

/**
 * 取引先情報（表示用）
 */
export interface TradingPartnerSummary {
  id: string;
  name: string;
  nameKana: string;
}

/**
 * プロジェクト情報（一覧・作成・更新用）
 */
export interface ProjectInfo {
  id: string;
  name: string;
  tradingPartnerId: string | null;
  tradingPartner: TradingPartnerSummary | null;
  salesPerson: UserSummary;
  constructionPerson?: UserSummary;
  siteAddress?: string;
  description?: string;
  status: ProjectStatus;
  statusLabel: string;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
}

/**
 * プロジェクト詳細（詳細取得用）
 */
export interface ProjectDetail extends ProjectInfo {
  createdBy: UserSummary;
}

/**
 * フィルター条件
 */
export interface ProjectFilter {
  search?: string;
  status?: ProjectStatus[];
  createdFrom?: string;
  createdTo?: string;
  tradingPartnerId?: string;
}

/**
 * ページネーション入力
 */
export interface PaginationInput {
  page: number;
  limit: number;
}

/**
 * ソート入力
 */
export interface SortInput {
  sort: SortableField;
  order: SortOrder;
}

/**
 * ページネーション情報
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付きプロジェクト一覧
 */
export interface PaginatedProjects {
  data: ProjectInfo[];
  pagination: PaginationInfo;
}

/**
 * 関連データ件数
 */
export interface RelatedCounts {
  surveyCount: number;
  estimateCount: number;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * プロジェクトサービス
 *
 * プロジェクトのCRUD操作とビジネスロジックを担当します。
 */
export class ProjectService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: ProjectServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * プロジェクト作成
   *
   * トランザクション内で以下を実行:
   * 1. 担当者IDのバリデーション（admin以外の有効ユーザー確認）
   * 2. プロジェクト作成
   * 3. 初期ステータス履歴の記録（transitionType='initial'）
   * 4. 監査ログの記録
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成されたプロジェクト情報
   * @throws ProjectValidationError 担当者IDが無効な場合
   */
  async createProject(input: CreateProjectInput, actorId: string): Promise<ProjectInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 担当者IDのバリデーション
      await this.validateAssignableUser(tx, input.salesPersonId, 'salesPersonId');

      if (input.constructionPersonId) {
        await this.validateAssignableUser(tx, input.constructionPersonId, 'constructionPersonId');
      }

      // 2. プロジェクト作成
      const project = await tx.project.create({
        data: {
          name: input.name,
          tradingPartnerId: input.tradingPartnerId || null,
          salesPersonId: input.salesPersonId,
          constructionPersonId: input.constructionPersonId || null,
          siteAddress: input.siteAddress || null,
          description: input.description || null,
          status: 'PREPARING',
          createdById: actorId,
        },
        include: {
          tradingPartner: {
            select: {
              id: true,
              name: true,
              nameKana: true,
            },
          },
          salesPerson: {
            select: {
              id: true,
              displayName: true,
            },
          },
          constructionPerson: {
            select: {
              id: true,
              displayName: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      // 3. 初期ステータス履歴の記録
      await tx.projectStatusHistory.create({
        data: {
          projectId: project.id,
          fromStatus: null,
          toStatus: 'PREPARING',
          transitionType: 'initial',
          reason: null,
          changedById: actorId,
        },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'PROJECT_CREATED',
        actorId,
        targetType: 'Project',
        targetId: project.id,
        before: null,
        after: {
          name: project.name,
          tradingPartnerId: project.tradingPartnerId,
          salesPersonId: project.salesPersonId,
          constructionPersonId: project.constructionPersonId,
          siteAddress: project.siteAddress,
          description: project.description,
          status: project.status,
        },
      });

      return this.toProjectInfo(project);
    });
  }

  /**
   * プロジェクト一覧取得
   *
   * ページネーション、検索、フィルタリング、ソートに対応。
   * 論理削除されたプロジェクトは除外される。
   *
   * @param filter - フィルター条件
   * @param pagination - ページネーション入力
   * @param sort - ソート入力
   * @returns ページネーション付きプロジェクト一覧
   */
  async getProjects(
    filter: ProjectFilter,
    pagination: PaginationInput,
    sort: SortInput
  ): Promise<PaginatedProjects> {
    // WHERE条件の構築
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
    };

    // 検索キーワード（プロジェクト名・取引先名の部分一致）
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' as const } },
        { tradingPartner: { name: { contains: filter.search, mode: 'insensitive' as const } } },
        { tradingPartner: { nameKana: { contains: filter.search, mode: 'insensitive' as const } } },
      ];
    }

    // ステータスフィルター
    if (filter.status && filter.status.length > 0) {
      where.status = { in: filter.status };
    }

    // 作成日範囲フィルター
    if (filter.createdFrom || filter.createdTo) {
      where.createdAt = {};
      if (filter.createdFrom) {
        where.createdAt.gte = new Date(filter.createdFrom);
      }
      if (filter.createdTo) {
        where.createdAt.lte = new Date(filter.createdTo);
      }
    }

    // 取引先IDフィルター
    if (filter.tradingPartnerId) {
      where.tradingPartnerId = filter.tradingPartnerId;
    }

    // 総件数取得
    const total = await this.prisma.project.count({ where });

    // プロジェクト一覧取得
    const projects = await this.prisma.project.findMany({
      where,
      include: {
        tradingPartner: {
          select: {
            id: true,
            name: true,
            nameKana: true,
          },
        },
        salesPerson: {
          select: {
            id: true,
            displayName: true,
          },
        },
        constructionPerson: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: { [sort.sort]: sort.order },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });

    return {
      data: projects.map((p) => this.toProjectInfo(p)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * プロジェクト詳細取得
   *
   * @param id - プロジェクトID
   * @returns プロジェクト詳細
   * @throws ProjectNotFoundError プロジェクトが存在しない、または論理削除済みの場合
   */
  async getProject(id: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        tradingPartner: {
          select: {
            id: true,
            name: true,
            nameKana: true,
          },
        },
        salesPerson: {
          select: {
            id: true,
            displayName: true,
          },
        },
        constructionPerson: {
          select: {
            id: true,
            displayName: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError(id);
    }

    return this.toProjectDetail(project);
  }

  /**
   * プロジェクト更新
   *
   * 楽観的排他制御を実装。expectedUpdatedAtと実際のupdatedAtが一致しない場合は
   * ProjectConflictErrorをスロー。
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクトの存在確認・楽観的排他制御
   * 2. 担当者IDのバリデーション（更新対象の場合のみ）
   * 3. プロジェクト更新
   * 4. 監査ログの記録
   *
   * @param id - プロジェクトID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新されたプロジェクト情報
   * @throws ProjectNotFoundError プロジェクトが存在しない場合
   * @throws ProjectConflictError 楽観的排他制御エラー
   * @throws ProjectValidationError 担当者IDが無効な場合
   */
  async updateProject(
    id: string,
    input: UpdateProjectInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<ProjectInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクトの存在確認
      const project = await tx.project.findUnique({
        where: { id },
        include: {
          tradingPartner: {
            select: {
              id: true,
              name: true,
              nameKana: true,
            },
          },
          salesPerson: {
            select: {
              id: true,
              displayName: true,
            },
          },
          constructionPerson: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      if (!project || project.deletedAt !== null) {
        throw new ProjectNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較
      if (project.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ProjectConflictError(
          'プロジェクトは他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: project.updatedAt.toISOString(),
          }
        );
      }

      // 2. 担当者IDのバリデーション（更新対象の場合のみ）
      if (input.salesPersonId) {
        await this.validateAssignableUser(tx, input.salesPersonId, 'salesPersonId');
      }

      if (input.constructionPersonId) {
        await this.validateAssignableUser(tx, input.constructionPersonId, 'constructionPersonId');
      }

      // 3. プロジェクト更新
      const updateData: Prisma.ProjectUpdateInput = {};

      if (input.name !== undefined) {
        updateData.name = input.name;
      }
      if (input.tradingPartnerId !== undefined) {
        if (input.tradingPartnerId === null) {
          updateData.tradingPartner = { disconnect: true };
        } else {
          updateData.tradingPartner = { connect: { id: input.tradingPartnerId } };
        }
      }
      if (input.salesPersonId !== undefined) {
        updateData.salesPerson = { connect: { id: input.salesPersonId } };
      }
      if (input.constructionPersonId !== undefined) {
        if (input.constructionPersonId === null) {
          updateData.constructionPerson = { disconnect: true };
        } else {
          updateData.constructionPerson = { connect: { id: input.constructionPersonId } };
        }
      }
      if (input.siteAddress !== undefined) {
        updateData.siteAddress = input.siteAddress;
      }
      if (input.description !== undefined) {
        updateData.description = input.description;
      }

      const updatedProject = await tx.project.update({
        where: { id },
        data: updateData,
        include: {
          tradingPartner: {
            select: {
              id: true,
              name: true,
              nameKana: true,
            },
          },
          salesPerson: {
            select: {
              id: true,
              displayName: true,
            },
          },
          constructionPerson: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'PROJECT_UPDATED',
        actorId,
        targetType: 'Project',
        targetId: id,
        before: {
          name: project.name,
          tradingPartnerId: project.tradingPartnerId,
          salesPersonId: project.salesPersonId,
          constructionPersonId: project.constructionPersonId,
          siteAddress: project.siteAddress,
          description: project.description,
        },
        after: {
          name: updatedProject.name,
          tradingPartnerId: updatedProject.tradingPartnerId,
          salesPersonId: updatedProject.salesPersonId,
          constructionPersonId: updatedProject.constructionPersonId,
          siteAddress: updatedProject.siteAddress,
          description: updatedProject.description,
        },
      });

      return this.toProjectInfo(updatedProject);
    });
  }

  /**
   * プロジェクト削除（論理削除）
   *
   * deletedAtフィールドに現在日時を設定して論理削除を行う。
   *
   * @param id - プロジェクトID
   * @param actorId - 実行者ID
   * @throws ProjectNotFoundError プロジェクトが存在しない、または既に削除済みの場合
   */
  async deleteProject(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // プロジェクトの存在確認
      const project = await tx.project.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          tradingPartnerId: true,
          status: true,
          deletedAt: true,
        },
      });

      if (!project || project.deletedAt !== null) {
        throw new ProjectNotFoundError(id);
      }

      // 論理削除
      await tx.project.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 監査ログの記録
      await this.auditLogService.createLog({
        action: 'PROJECT_DELETED',
        actorId,
        targetType: 'Project',
        targetId: id,
        before: {
          name: project.name,
          tradingPartnerId: project.tradingPartnerId,
          status: project.status,
        },
        after: null,
      });
    });
  }

  /**
   * 関連データ件数取得
   *
   * 現場調査・見積書の件数を取得する。
   * 現時点では機能が未実装のため、常に0を返す。
   *
   * @param id - プロジェクトID
   * @returns 関連データ件数
   * @throws ProjectNotFoundError プロジェクトが存在しない場合
   */
  async getRelatedCounts(id: string): Promise<RelatedCounts> {
    // プロジェクトの存在確認
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError(id);
    }

    // 現場調査機能・見積機能は将来実装予定
    // 現時点では常に0を返す
    return {
      surveyCount: 0,
      estimateCount: 0,
    };
  }

  /**
   * 担当者IDのバリデーション
   *
   * 指定されたユーザーIDが以下の条件を満たすことを確認:
   * - ユーザーが存在する
   * - ユーザーがadminロールを持っていない
   *
   * @param tx - Prismaトランザクションクライアント
   * @param userId - 検証するユーザーID
   * @param fieldName - エラーメッセージ用のフィールド名
   * @throws ProjectValidationError ユーザーが存在しない、またはadminの場合
   */
  private async validateAssignableUser(
    tx: PrismaTransactionClient,
    userId: string,
    fieldName: string
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isLocked: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new ProjectValidationError({
        [fieldName]: '指定されたユーザーが存在しません',
      });
    }

    // adminロールを持っているかチェック
    const isAdmin = user.userRoles.some((ur) => ur.role.name === 'admin');

    if (isAdmin) {
      throw new ProjectValidationError({
        [fieldName]: '管理者ユーザーは担当者として指定できません',
      });
    }
  }

  /**
   * データベースの結果をProjectInfoに変換
   */
  private toProjectInfo(project: {
    id: string;
    name: string;
    tradingPartnerId: string | null;
    tradingPartner: { id: string; name: string; nameKana: string } | null;
    salesPersonId: string;
    constructionPersonId: string | null;
    siteAddress: string | null;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
    salesPerson: { id: string; displayName: string };
    constructionPerson: { id: string; displayName: string } | null;
  }): ProjectInfo {
    const result: ProjectInfo = {
      id: project.id,
      name: project.name,
      tradingPartnerId: project.tradingPartnerId,
      tradingPartner: project.tradingPartner
        ? {
            id: project.tradingPartner.id,
            name: project.tradingPartner.name,
            nameKana: project.tradingPartner.nameKana,
          }
        : null,
      salesPerson: {
        id: project.salesPerson.id,
        displayName: project.salesPerson.displayName,
      },
      status: project.status as ProjectStatus,
      statusLabel: PROJECT_STATUS_LABELS[project.status as ProjectStatus],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      createdById: project.createdById,
    };

    if (project.constructionPerson) {
      result.constructionPerson = {
        id: project.constructionPerson.id,
        displayName: project.constructionPerson.displayName,
      };
    }

    if (project.siteAddress) {
      result.siteAddress = project.siteAddress;
    }

    if (project.description) {
      result.description = project.description;
    }

    return result;
  }

  /**
   * データベースの結果をProjectDetailに変換
   */
  private toProjectDetail(project: {
    id: string;
    name: string;
    tradingPartnerId: string | null;
    tradingPartner: { id: string; name: string; nameKana: string } | null;
    salesPersonId: string;
    constructionPersonId: string | null;
    siteAddress: string | null;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
    salesPerson: { id: string; displayName: string };
    constructionPerson: { id: string; displayName: string } | null;
    createdBy: { id: string; displayName: string };
  }): ProjectDetail {
    const projectInfo = this.toProjectInfo(project);

    return {
      ...projectInfo,
      createdBy: {
        id: project.createdBy.id,
        displayName: project.createdBy.displayName,
      },
    };
  }
}
