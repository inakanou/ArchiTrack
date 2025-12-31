/**
 * @fileoverview 現場調査サービス
 *
 * 現場調査のCRUD操作とビジネスロジックを担当します。
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.2: 現場調査の基本情報と関連する画像一覧を表示する
 * - 1.3: 楽観的排他制御を用いて現場調査レコードを更新する
 * - 1.4: 現場調査と関連する画像データを論理削除する
 * - 1.5: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
 * - 1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
 * - 3.1: プロジェクト単位でのページネーション
 * - 3.2: キーワード検索（名前・メモの部分一致）
 * - 3.3: 調査日によるフィルタリング
 * - 3.4: ソート機能（調査日・作成日・更新日）
 * - 3.5: サムネイル画像URLの取得
 * - 12.5: 現場調査の作成・更新・削除時に監査ログを記録する
 *
 * @module services/site-survey
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateSiteSurveyInput,
  UpdateSiteSurveyInput,
} from '../schemas/site-survey.schema.js';
import {
  ProjectNotFoundForSurveyError,
  SiteSurveyNotFoundError,
  SiteSurveyConflictError,
} from '../errors/siteSurveyError.js';
import { SITE_SURVEY_TARGET_TYPE } from '../types/audit-log.types.js';

/**
 * SiteSurveyService依存関係
 */
export interface SiteSurveyServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 現場調査情報（作成・更新用）
 */
export interface SiteSurveyInfo {
  id: string;
  projectId: string;
  name: string;
  surveyDate: Date;
  memo: string | null;
  thumbnailUrl: string | null;
  imageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 画像情報
 *
 * Task 27.1: コメントと報告書出力フラグを追加
 */
export interface SurveyImageInfo {
  id: string;
  surveyId: string;
  originalPath: string;
  thumbnailPath: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  comment: string | null;
  includeInReport: boolean;
  createdAt: Date;
}

/**
 * 現場調査詳細情報（Requirements: 1.2）
 * 基本情報に加えて、プロジェクト情報と画像一覧を含む
 */
export interface SiteSurveyDetail extends SiteSurveyInfo {
  project: { id: string; name: string };
  images: SurveyImageInfo[];
}

/**
 * フィルター条件（Requirements: 3.2, 3.3）
 */
export interface SiteSurveyFilter {
  search?: string;
  surveyDateFrom?: string;
  surveyDateTo?: string;
}

/**
 * ページネーション入力（Requirements: 3.1）
 */
export interface SiteSurveyPaginationInput {
  page: number;
  limit: number;
}

/**
 * ソート可能フィールド（Requirements: 3.4）
 */
export type SiteSurveySortableField = 'surveyDate' | 'createdAt' | 'updatedAt';

/**
 * ソート順序
 */
export type SiteSurveySortOrder = 'asc' | 'desc';

/**
 * ソート入力（Requirements: 3.4）
 */
export interface SiteSurveySortInput {
  sort: SiteSurveySortableField;
  order: SiteSurveySortOrder;
}

/**
 * ページネーション情報
 */
export interface SiteSurveyPaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付き現場調査一覧
 */
export interface PaginatedSiteSurveys {
  data: SiteSurveyInfo[];
  pagination: SiteSurveyPaginationInfo;
}

/**
 * プロジェクト別現場調査サマリー（Requirements: 2.1）
 *
 * プロジェクト詳細画面の現場調査セクションで表示する
 * 直近の現場調査一覧と総数を含む。
 */
export interface ProjectSurveySummary {
  /** 現場調査の総数 */
  totalCount: number;
  /** 直近N件の現場調査 */
  latestSurveys: SiteSurveyInfo[];
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 現場調査サービス
 *
 * 現場調査のCRUD操作とビジネスロジックを担当します。
 */
export class SiteSurveyService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: SiteSurveyServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 現場調査作成
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクト存在確認 (Requirements: 1.6)
   * 2. 現場調査作成 (Requirements: 1.1)
   * 3. 監査ログの記録 (Requirements: 12.5)
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された現場調査情報
   * @throws ProjectNotFoundForSurveyError プロジェクトが存在しない、または論理削除済みの場合
   */
  async createSiteSurvey(input: CreateSiteSurveyInput, actorId: string): Promise<SiteSurveyInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクト存在確認 (Requirements: 1.6)
      await this.validateProjectExists(tx, input.projectId);

      // 2. 現場調査作成
      const siteSurvey = await tx.siteSurvey.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          surveyDate: new Date(input.surveyDate),
          memo: input.memo ?? null,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // 3. 監査ログの記録 (Requirements: 12.5)
      await this.auditLogService.createLog({
        action: 'SITE_SURVEY_CREATED',
        actorId,
        targetType: SITE_SURVEY_TARGET_TYPE,
        targetId: siteSurvey.id,
        before: null,
        after: {
          name: siteSurvey.name,
          projectId: siteSurvey.projectId,
          surveyDate: siteSurvey.surveyDate.toISOString(),
          memo: siteSurvey.memo,
        },
      });

      return this.toSiteSurveyInfo(siteSurvey);
    });
  }

  /**
   * プロジェクト存在確認
   *
   * 指定されたプロジェクトが存在し、論理削除されていないことを確認する。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param projectId - プロジェクトID
   * @throws ProjectNotFoundForSurveyError プロジェクトが存在しない、または論理削除済みの場合
   */
  private async validateProjectExists(
    tx: PrismaTransactionClient,
    projectId: string
  ): Promise<void> {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundForSurveyError(projectId);
    }
  }

  /**
   * 現場調査更新
   *
   * 楽観的排他制御を実装。expectedUpdatedAtと実際のupdatedAtが一致しない場合は
   * SiteSurveyConflictErrorをスロー。
   *
   * トランザクション内で以下を実行:
   * 1. 現場調査の存在確認・楽観的排他制御 (Requirements: 1.3, 1.5)
   * 2. 現場調査更新
   * 3. 監査ログの記録 (Requirements: 12.5)
   *
   * Requirements:
   * - 1.3: 楽観的排他制御を用いて現場調査レコードを更新する
   * - 1.5: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
   * - 12.5: 現場調査の更新時に監査ログを記録する
   *
   * @param id - 現場調査ID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された現場調査情報
   * @throws SiteSurveyNotFoundError 現場調査が存在しない、または論理削除済みの場合
   * @throws SiteSurveyConflictError 楽観的排他制御エラー（他のユーザーによる更新との競合）
   */
  async updateSiteSurvey(
    id: string,
    input: UpdateSiteSurveyInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<SiteSurveyInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 現場調査の存在確認
      const siteSurvey = await tx.siteSurvey.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          surveyDate: true,
          memo: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!siteSurvey || siteSurvey.deletedAt !== null) {
        throw new SiteSurveyNotFoundError(id);
      }

      // 楽観的排他制御: updatedAtの比較 (Requirements: 1.5)
      if (siteSurvey.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new SiteSurveyConflictError(
          '現場調査は他のユーザーによって更新されました。最新データを確認してください。',
          {
            expectedUpdatedAt: expectedUpdatedAt.toISOString(),
            actualUpdatedAt: siteSurvey.updatedAt.toISOString(),
          }
        );
      }

      // 2. 更新データの構築
      const updateData: {
        name?: string;
        surveyDate?: Date;
        memo?: string | null;
      } = {};

      if (input.name !== undefined) {
        updateData.name = input.name;
      }
      if (input.surveyDate !== undefined) {
        updateData.surveyDate = new Date(input.surveyDate);
      }
      if (input.memo !== undefined) {
        updateData.memo = input.memo;
      }

      // 3. 現場調査更新
      const updatedSurvey = await tx.siteSurvey.update({
        where: { id },
        data: updateData,
      });

      // 4. 監査ログの記録 (Requirements: 12.5)
      await this.auditLogService.createLog({
        action: 'SITE_SURVEY_UPDATED',
        actorId,
        targetType: SITE_SURVEY_TARGET_TYPE,
        targetId: id,
        before: {
          name: siteSurvey.name,
          surveyDate: siteSurvey.surveyDate.toISOString(),
          memo: siteSurvey.memo,
        },
        after: {
          name: updatedSurvey.name,
          surveyDate: updatedSurvey.surveyDate.toISOString(),
          memo: updatedSurvey.memo,
        },
      });

      return this.toSiteSurveyInfo(updatedSurvey);
    });
  }

  /**
   * 現場調査詳細取得
   *
   * 現場調査の基本情報、プロジェクト情報、画像一覧を取得する。
   * 論理削除されたレコードは除外される。
   *
   * Requirements:
   * - 1.2: 現場調査の基本情報と関連する画像一覧を表示する
   *
   * @param id - 現場調査ID
   * @returns 現場調査詳細情報、存在しない場合はnull
   */
  async findById(id: string): Promise<SiteSurveyDetail | null> {
    const siteSurvey = await this.prisma.siteSurvey.findUnique({
      where: {
        id,
        deletedAt: null, // 論理削除されたレコードを除外
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        images: {
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    });

    if (!siteSurvey) {
      return null;
    }

    return this.toSiteSurveyDetail(siteSurvey);
  }

  /**
   * 現場調査削除
   *
   * 論理削除を実行。関連する画像データも同時に論理削除する。
   *
   * トランザクション内で以下を実行:
   * 1. 現場調査の存在確認
   * 2. 関連画像の論理削除
   * 3. 現場調査の論理削除
   * 4. 監査ログの記録 (Requirements: 12.5)
   *
   * Requirements:
   * - 1.4: 現場調査と関連する画像データを論理削除する
   * - 12.5: 現場調査の削除時に監査ログを記録する
   *
   * @param id - 現場調査ID
   * @param actorId - 実行者ID
   * @throws SiteSurveyNotFoundError 現場調査が存在しない、または論理削除済みの場合
   */
  async deleteSiteSurvey(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 現場調査の存在確認（画像情報も含めて取得）
      const siteSurvey = await tx.siteSurvey.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          name: true,
          surveyDate: true,
          memo: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          images: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!siteSurvey || siteSurvey.deletedAt !== null) {
        throw new SiteSurveyNotFoundError(id);
      }

      const deletedAt = new Date();
      const imageCount = siteSurvey.images.length;

      // 2. 現場調査の論理削除
      // 注: SurveyImageにはdeletedAtフィールドがない設計
      // 現場調査が論理削除されると、関連画像はfindById等のクエリで
      // SiteSurveyのdeletedAtフィルタにより自動的に除外される
      await tx.siteSurvey.update({
        where: { id },
        data: { deletedAt },
      });

      // 3. 監査ログの記録 (Requirements: 12.5)
      await this.auditLogService.createLog({
        action: 'SITE_SURVEY_DELETED',
        actorId,
        targetType: SITE_SURVEY_TARGET_TYPE,
        targetId: id,
        before: {
          name: siteSurvey.name,
          projectId: siteSurvey.projectId,
          surveyDate: siteSurvey.surveyDate.toISOString(),
          memo: siteSurvey.memo,
          imageCount,
        },
        after: null,
      });
    });
  }

  /**
   * データベースの結果をSiteSurveyInfoに変換
   */
  private toSiteSurveyInfo(
    siteSurvey: {
      id: string;
      projectId: string;
      name: string;
      surveyDate: Date;
      memo: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    images: SurveyImageInfo[] = []
  ): SiteSurveyInfo {
    return {
      id: siteSurvey.id,
      projectId: siteSurvey.projectId,
      name: siteSurvey.name,
      surveyDate: siteSurvey.surveyDate,
      memo: siteSurvey.memo,
      thumbnailUrl: images.length > 0 && images[0] ? images[0].thumbnailPath : null,
      imageCount: images.length,
      createdAt: siteSurvey.createdAt,
      updatedAt: siteSurvey.updatedAt,
    };
  }

  /**
   * データベースの結果をSiteSurveyDetailに変換
   */
  private toSiteSurveyDetail(siteSurvey: {
    id: string;
    projectId: string;
    name: string;
    surveyDate: Date;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
    project: { id: string; name: string };
    images: Array<{
      id: string;
      surveyId: string;
      originalPath: string;
      thumbnailPath: string;
      fileName: string;
      fileSize: number;
      width: number;
      height: number;
      displayOrder: number;
      comment: string | null;
      includeInReport: boolean;
      createdAt: Date;
    }>;
  }): SiteSurveyDetail {
    const images: SurveyImageInfo[] = siteSurvey.images.map((img) => ({
      id: img.id,
      surveyId: img.surveyId,
      originalPath: img.originalPath,
      thumbnailPath: img.thumbnailPath,
      fileName: img.fileName,
      fileSize: img.fileSize,
      width: img.width,
      height: img.height,
      displayOrder: img.displayOrder,
      comment: img.comment,
      includeInReport: img.includeInReport,
      createdAt: img.createdAt,
    }));

    return {
      ...this.toSiteSurveyInfo(siteSurvey, images),
      project: siteSurvey.project,
      images,
    };
  }

  /**
   * プロジェクトIDによる現場調査一覧取得
   *
   * 指定されたプロジェクトに属する現場調査の一覧を、
   * ページネーション、検索、フィルタリング、ソートに対応して取得する。
   *
   * Requirements:
   * - 3.1: プロジェクト単位でのページネーション
   * - 3.2: キーワード検索（名前・メモの部分一致）
   * - 3.3: 調査日によるフィルタリング
   * - 3.4: ソート機能（調査日・作成日・更新日）
   * - 3.5: サムネイル画像URLの取得
   *
   * @param projectId - プロジェクトID
   * @param filter - フィルタ条件
   * @param pagination - ページネーション入力
   * @param sort - ソート入力
   * @returns ページネーション付き現場調査一覧
   */
  async findByProjectId(
    projectId: string,
    filter: SiteSurveyFilter,
    pagination: SiteSurveyPaginationInput,
    sort: SiteSurveySortInput
  ): Promise<PaginatedSiteSurveys> {
    // WHERE条件の構築
    const where: Prisma.SiteSurveyWhereInput = {
      projectId,
      deletedAt: null,
    };

    // キーワード検索（Requirements: 3.2）
    if (filter.search && filter.search.trim() !== '') {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { memo: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    // 調査日フィルタリング（Requirements: 3.3）
    if (filter.surveyDateFrom || filter.surveyDateTo) {
      const surveyDateFilter: { gte?: Date; lte?: Date } = {};
      if (filter.surveyDateFrom) {
        surveyDateFilter.gte = new Date(filter.surveyDateFrom);
      }
      if (filter.surveyDateTo) {
        surveyDateFilter.lte = new Date(filter.surveyDateTo);
      }
      where.surveyDate = surveyDateFilter;
    }

    // ソート条件の構築（Requirements: 3.4）
    const orderBy: Prisma.SiteSurveyOrderByWithRelationInput = {
      [sort.sort]: sort.order,
    };

    // ページネーション計算（Requirements: 3.1）
    const skip = (pagination.page - 1) * pagination.limit;
    const take = pagination.limit;

    // データ取得と件数カウントを並行実行
    const [surveys, total] = await Promise.all([
      this.prisma.siteSurvey.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          images: {
            orderBy: { displayOrder: 'asc' },
            take: 1, // サムネイル用に最初の1件のみ取得
          },
        },
      }),
      this.prisma.siteSurvey.count({ where }),
    ]);

    // 結果の変換（Requirements: 3.5）
    const data: SiteSurveyInfo[] = surveys.map((survey) => {
      const firstImage = survey.images[0];
      return {
        id: survey.id,
        projectId: survey.projectId,
        name: survey.name,
        surveyDate: survey.surveyDate,
        memo: survey.memo,
        thumbnailUrl: firstImage ? firstImage.thumbnailPath : null,
        imageCount: survey.images.length, // includeで取得した件数を使用
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
      };
    });

    // 実際の画像件数を取得するため、_countを使用した再クエリが必要
    // パフォーマンスのため、データベースから直接カウントを取得
    const surveysWithCount = await this.prisma.siteSurvey.findMany({
      where: {
        id: { in: surveys.map((s) => s.id) },
      },
      select: {
        id: true,
        _count: {
          select: { images: true },
        },
      },
    });

    // 画像件数をマッピング
    const imageCountMap = new Map(surveysWithCount.map((s) => [s.id, s._count.images]));

    // 画像件数を正確な値で更新
    data.forEach((item) => {
      item.imageCount = imageCountMap.get(item.id) ?? 0;
    });

    // ページネーション情報の計算
    const totalPages = total > 0 ? Math.ceil(total / pagination.limit) : 0;

    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * プロジェクト別の直近N件と総数を取得
   *
   * プロジェクト詳細画面の現場調査セクションで使用する。
   * 直近N件の現場調査と、現場調査の総数を返却する。
   *
   * Requirements:
   * - 2.1: プロジェクト詳細画面に直近2件の現場調査と総数を表示する
   *
   * @param projectId - プロジェクトID
   * @param limit - 取得件数（デフォルト: 2）
   * @returns プロジェクト別現場調査サマリー
   */
  async findLatestByProjectId(projectId: string, limit: number = 2): Promise<ProjectSurveySummary> {
    // WHERE条件
    const where = {
      projectId,
      deletedAt: null,
    };

    // データ取得と件数カウントを並行実行
    const [surveys, totalCount] = await Promise.all([
      this.prisma.siteSurvey.findMany({
        where,
        orderBy: { surveyDate: 'desc' },
        take: limit,
        include: {
          images: {
            orderBy: { displayOrder: 'asc' },
            take: 1, // サムネイル用に最初の1件のみ取得
            select: {
              id: true,
              thumbnailPath: true,
            },
          },
          _count: {
            select: { images: true },
          },
        },
      }),
      this.prisma.siteSurvey.count({ where }),
    ]);

    // 結果の変換
    const latestSurveys: SiteSurveyInfo[] = surveys.map((survey) => {
      const firstImage = survey.images[0];
      return {
        id: survey.id,
        projectId: survey.projectId,
        name: survey.name,
        surveyDate: survey.surveyDate,
        memo: survey.memo,
        thumbnailUrl: firstImage ? firstImage.thumbnailPath : null,
        imageCount: survey._count.images,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
      };
    });

    return {
      totalCount,
      latestSurveys,
    };
  }
}
