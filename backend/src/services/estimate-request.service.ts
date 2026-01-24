/**
 * @fileoverview 見積依頼サービス
 *
 * 見積依頼のCRUD操作と項目選択管理を担当します。
 *
 * Requirements:
 * - 3.6: 見積依頼を作成し詳細画面に遷移
 * - 8.1: 見積依頼をプロジェクトに紐付けて保存
 * - 8.2: 見積依頼に選択された項目リストを保存
 * - 8.3: 見積依頼の作成日時と更新日時を記録
 * - 8.4: 見積依頼の削除時に論理削除を行う
 * - 8.5: 楽観的排他制御により同時更新を防止
 * - 4.4: 項目の選択状態更新
 * - 4.5: 選択状態を自動的に保存
 * - 4.10-4.12: 他の見積依頼での選択状態を含む項目一覧取得
 * - 9.6: 変更を保存
 *
 * Task 2.1: EstimateRequestServiceの基本CRUD操作
 * Task 2.2: EstimateRequestServiceの項目選択管理
 *
 * @module services/estimate-request
 */

import type { PrismaClient, EstimateRequestMethod } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { ESTIMATE_REQUEST_TARGET_TYPE } from '../types/audit-log.types.js';
import {
  EstimateRequestNotFoundError,
  EstimateRequestConflictError,
  TradingPartnerNotSubcontractorError,
  EmptyItemizedStatementItemsError,
} from '../errors/estimateRequestError.js';
import { ItemizedStatementNotFoundError } from '../errors/itemizedStatementError.js';
import { NotFoundError } from '../errors/apiError.js';

/**
 * 見積依頼サービス依存関係
 */
export interface EstimateRequestServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 見積依頼作成入力
 */
export interface CreateEstimateRequestInput {
  name: string;
  projectId: string;
  tradingPartnerId: string;
  itemizedStatementId: string;
  method?: EstimateRequestMethod;
  includeBreakdownInBody?: boolean;
}

/**
 * 見積依頼更新入力
 */
export interface UpdateEstimateRequestInput {
  name?: string;
  method?: EstimateRequestMethod;
  includeBreakdownInBody?: boolean;
}

/**
 * 見積依頼ステータス
 * Requirements: 12.2, 12.3
 */
export type EstimateRequestStatus = 'BEFORE_REQUEST' | 'REQUESTED' | 'QUOTATION_RECEIVED';

/**
 * 見積依頼情報（一覧用）
 */
export interface EstimateRequestInfo {
  id: string;
  projectId: string;
  tradingPartnerId: string;
  tradingPartnerName: string;
  itemizedStatementId: string;
  itemizedStatementName: string;
  name: string;
  method: EstimateRequestMethod;
  includeBreakdownInBody: boolean;
  status: EstimateRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  receivedQuotationCount?: number;
}

/**
 * ページネーション付き見積依頼一覧
 */
export interface PaginatedEstimateRequests {
  data: EstimateRequestInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 項目選択入力
 */
export interface ItemSelectionInput {
  itemId: string;
  selected: boolean;
}

/**
 * 他の見積依頼での選択状態情報
 */
export interface OtherRequestInfo {
  estimateRequestId: string;
  estimateRequestName: string;
  tradingPartnerName: string;
}

/**
 * 選択状態を含む項目情報
 */
export interface ItemWithSelectionInfo {
  id: string;
  estimateRequestItemId: string;
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number;
  displayOrder: number;
  selected: boolean;
  otherRequests: OtherRequestInfo[];
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 見積依頼サービス
 *
 * 見積依頼のCRUD操作と項目選択管理を担当します。
 */
export class EstimateRequestService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: EstimateRequestServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 見積依頼を作成する
   *
   * トランザクション内で以下を実行:
   * 1. 取引先の存在確認と協力業者タイプの確認
   * 2. 内訳書の存在確認
   * 3. 内訳書項目の確認（0件の場合エラー）
   * 4. 見積依頼の作成
   * 5. EstimateRequestItemの自動初期化（全項目をselected=falseで作成）
   * 6. 監査ログの記録
   *
   * Requirements: 3.6, 8.1, 8.2, 8.3
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された見積依頼情報
   * @throws TradingPartnerNotSubcontractorError 取引先が協力業者ではない場合
   * @throws ItemizedStatementNotFoundError 内訳書が存在しない場合
   * @throws EmptyItemizedStatementItemsError 内訳書に項目がない場合
   */
  async create(input: CreateEstimateRequestInput, actorId: string): Promise<EstimateRequestInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 取引先の存在確認
      const tradingPartner = await tx.tradingPartner.findUnique({
        where: { id: input.tradingPartnerId },
        select: { id: true, name: true, deletedAt: true },
      });

      if (!tradingPartner || tradingPartner.deletedAt !== null) {
        throw new NotFoundError(`取引先が見つかりません: ${input.tradingPartnerId}`);
      }

      // 2. 協力業者タイプの確認
      const subcontractorType = await tx.tradingPartnerTypeMapping.findFirst({
        where: {
          tradingPartnerId: input.tradingPartnerId,
          type: 'SUBCONTRACTOR',
        },
      });

      if (!subcontractorType) {
        throw new TradingPartnerNotSubcontractorError(input.tradingPartnerId);
      }

      // 3. 内訳書の存在確認と項目取得
      const itemizedStatement = await tx.itemizedStatement.findUnique({
        where: { id: input.itemizedStatementId },
        select: {
          id: true,
          name: true,
          projectId: true,
          deletedAt: true,
          items: {
            select: { id: true, displayOrder: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      if (!itemizedStatement || itemizedStatement.deletedAt !== null) {
        throw new ItemizedStatementNotFoundError(input.itemizedStatementId);
      }

      // 4. 内訳書項目が0件の場合エラー (Requirements: 4.13)
      if (itemizedStatement.items.length === 0) {
        throw new EmptyItemizedStatementItemsError(input.itemizedStatementId);
      }

      // 5. 見積依頼の作成
      const estimateRequest = await tx.estimateRequest.create({
        data: {
          projectId: input.projectId,
          tradingPartnerId: input.tradingPartnerId,
          itemizedStatementId: input.itemizedStatementId,
          name: input.name.trim(),
          method: input.method ?? 'EMAIL',
          includeBreakdownInBody: input.includeBreakdownInBody ?? false,
        },
        include: {
          tradingPartner: { select: { id: true, name: true } },
          itemizedStatement: { select: { id: true, name: true } },
        },
      });

      // 6. EstimateRequestItemの自動初期化（全項目をselected=falseで作成）
      const itemsData = itemizedStatement.items.map((item) => ({
        estimateRequestId: estimateRequest.id,
        itemizedStatementItemId: item.id,
        selected: false,
      }));

      await tx.estimateRequestItem.createMany({ data: itemsData });

      // 7. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_REQUEST_CREATED',
        actorId,
        targetType: ESTIMATE_REQUEST_TARGET_TYPE,
        targetId: estimateRequest.id,
        before: null,
        after: {
          projectId: estimateRequest.projectId,
          tradingPartnerId: estimateRequest.tradingPartnerId,
          itemizedStatementId: estimateRequest.itemizedStatementId,
          name: estimateRequest.name,
          method: estimateRequest.method,
          itemCount: itemizedStatement.items.length,
        },
      });

      return this.toEstimateRequestInfo(estimateRequest);
    });
  }

  /**
   * 見積依頼詳細を取得する
   *
   * Task 13.4: ステータスと受領見積書数を含める
   * Requirements: 12.1, 12.4
   *
   * @param id - 見積依頼ID
   * @returns 見積依頼詳細情報（存在しない場合はnull）
   */
  async findById(id: string): Promise<EstimateRequestInfo | null> {
    const estimateRequest = await this.prisma.estimateRequest.findUnique({
      where: { id },
      include: {
        tradingPartner: { select: { id: true, name: true } },
        itemizedStatement: { select: { id: true, name: true } },
        _count: {
          select: {
            receivedQuotations: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!estimateRequest || estimateRequest.deletedAt !== null) {
      return null;
    }

    return this.toEstimateRequestInfo(estimateRequest);
  }

  /**
   * プロジェクトに紐付く見積依頼一覧を取得する（ページネーション対応）
   *
   * @param projectId - プロジェクトID
   * @param pagination - ページネーション設定
   * @returns ページネーション付き見積依頼一覧
   */
  async findByProjectId(
    projectId: string,
    pagination: { page: number; limit: number }
  ): Promise<PaginatedEstimateRequests> {
    const where = {
      projectId,
      deletedAt: null,
    };

    const [requests, total] = await Promise.all([
      this.prisma.estimateRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          tradingPartner: { select: { id: true, name: true } },
          itemizedStatement: { select: { id: true, name: true } },
        },
      }),
      this.prisma.estimateRequest.count({ where }),
    ]);

    return {
      data: requests.map((request) => this.toEstimateRequestInfo(request)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * 見積依頼を更新する（楽観的排他制御付き）
   *
   * Requirements: 8.5, 9.6
   *
   * @param id - 見積依頼ID
   * @param input - 更新入力
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された見積依頼情報
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   * @throws EstimateRequestConflictError 楽観的排他制御エラー
   */
  async update(
    id: string,
    input: UpdateEstimateRequestInput,
    actorId: string,
    expectedUpdatedAt: Date
  ): Promise<EstimateRequestInfo> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積依頼の存在確認
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id },
        include: {
          tradingPartner: { select: { id: true, name: true } },
          itemizedStatement: { select: { id: true, name: true } },
        },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestNotFoundError(id);
      }

      // 2. 楽観的排他制御
      if (estimateRequest.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new EstimateRequestConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: estimateRequest.updatedAt.toISOString(),
        });
      }

      // 3. 更新データの準備
      const updateData: {
        name?: string;
        method?: EstimateRequestMethod;
        includeBreakdownInBody?: boolean;
      } = {};

      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }
      if (input.method !== undefined) {
        updateData.method = input.method;
      }
      if (input.includeBreakdownInBody !== undefined) {
        updateData.includeBreakdownInBody = input.includeBreakdownInBody;
      }

      // 4. 更新
      const before = {
        name: estimateRequest.name,
        method: estimateRequest.method,
        includeBreakdownInBody: estimateRequest.includeBreakdownInBody,
      };

      const updatedRequest = await tx.estimateRequest.update({
        where: { id },
        data: updateData,
        include: {
          tradingPartner: { select: { id: true, name: true } },
          itemizedStatement: { select: { id: true, name: true } },
        },
      });

      // 5. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_REQUEST_UPDATED',
        actorId,
        targetType: ESTIMATE_REQUEST_TARGET_TYPE,
        targetId: id,
        before,
        after: {
          name: updatedRequest.name,
          method: updatedRequest.method,
          includeBreakdownInBody: updatedRequest.includeBreakdownInBody,
        },
      });

      return this.toEstimateRequestInfo(updatedRequest);
    });
  }

  /**
   * 見積依頼を論理削除する（楽観的排他制御付き）
   *
   * Requirements: 8.4, 8.5
   *
   * @param id - 見積依頼ID
   * @param actorId - 実行者ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @throws EstimateRequestNotFoundError 見積依頼が存在しないか既に削除済みの場合
   * @throws EstimateRequestConflictError 楽観的排他制御エラー
   */
  async delete(id: string, actorId: string, expectedUpdatedAt: Date): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積依頼の存在確認
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id },
        select: {
          id: true,
          projectId: true,
          tradingPartnerId: true,
          itemizedStatementId: true,
          name: true,
          method: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestNotFoundError(id);
      }

      // 2. 楽観的排他制御
      if (estimateRequest.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new EstimateRequestConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: estimateRequest.updatedAt.toISOString(),
        });
      }

      // 3. 論理削除
      await tx.estimateRequest.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 4. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_REQUEST_DELETED',
        actorId,
        targetType: ESTIMATE_REQUEST_TARGET_TYPE,
        targetId: id,
        before: {
          projectId: estimateRequest.projectId,
          tradingPartnerId: estimateRequest.tradingPartnerId,
          itemizedStatementId: estimateRequest.itemizedStatementId,
          name: estimateRequest.name,
          method: estimateRequest.method,
        },
        after: null,
      });
    });
  }

  /**
   * 項目の選択状態を更新する
   *
   * Requirements: 4.4, 4.5
   *
   * @param estimateRequestId - 見積依頼ID
   * @param itemSelections - 項目選択情報の配列
   * @param actorId - 実行者ID
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   */
  async updateItemSelection(
    estimateRequestId: string,
    itemSelections: ItemSelectionInput[],
    actorId: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積依頼の存在確認
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id: estimateRequestId },
        select: { id: true, deletedAt: true },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestNotFoundError(estimateRequestId);
      }

      // 2. 各項目の選択状態を更新
      for (const selection of itemSelections) {
        await tx.estimateRequestItem.updateMany({
          where: {
            estimateRequestId,
            id: selection.itemId,
          },
          data: { selected: selection.selected },
        });
      }

      // 3. 監査ログの記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_REQUEST_ITEMS_UPDATED',
        actorId,
        targetType: ESTIMATE_REQUEST_TARGET_TYPE,
        targetId: estimateRequestId,
        before: null,
        after: {
          updatedItems: itemSelections.map((s) => ({ itemId: s.itemId, selected: s.selected })),
        },
      });
    });
  }

  /**
   * 他の見積依頼での選択状態を含む項目一覧を取得する
   *
   * Requirements: 4.10, 4.11, 4.12
   *
   * @param estimateRequestId - 見積依頼ID
   * @returns 選択状態を含む項目情報の配列
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   */
  async findItemsWithOtherRequestStatus(
    estimateRequestId: string
  ): Promise<ItemWithSelectionInfo[]> {
    // 1. 見積依頼の存在確認
    const estimateRequest = await this.prisma.estimateRequest.findUnique({
      where: { id: estimateRequestId },
      select: { id: true, projectId: true, itemizedStatementId: true, deletedAt: true },
    });

    if (!estimateRequest || estimateRequest.deletedAt !== null) {
      throw new EstimateRequestNotFoundError(estimateRequestId);
    }

    // 2. 対象見積依頼の項目を取得
    const items = await this.prisma.estimateRequestItem.findMany({
      where: { estimateRequestId },
      include: {
        itemizedStatementItem: {
          select: {
            id: true,
            customCategory: true,
            workType: true,
            name: true,
            specification: true,
            unit: true,
            quantity: true,
            displayOrder: true,
          },
        },
      },
      orderBy: { itemizedStatementItem: { displayOrder: 'asc' } },
    });

    // 3. 同じ内訳書項目を使用している他の見積依頼での選択状態を取得
    const itemizedStatementItemIds = items.map((item) => item.itemizedStatementItemId);

    const otherSelections = await this.prisma.estimateRequestItem.findMany({
      where: {
        itemizedStatementItemId: { in: itemizedStatementItemIds },
        estimateRequestId: { not: estimateRequestId },
        selected: true,
        estimateRequest: { deletedAt: null },
      },
      select: {
        itemizedStatementItemId: true,
        estimateRequest: {
          select: {
            id: true,
            name: true,
            tradingPartner: { select: { name: true } },
          },
        },
      },
    });

    // 4. 他の見積依頼での選択状態をマップに変換
    const otherSelectionsMap = new Map<string, OtherRequestInfo[]>();
    for (const selection of otherSelections) {
      const itemId = selection.itemizedStatementItemId;
      if (!otherSelectionsMap.has(itemId)) {
        otherSelectionsMap.set(itemId, []);
      }
      otherSelectionsMap.get(itemId)!.push({
        estimateRequestId: selection.estimateRequest.id,
        estimateRequestName: selection.estimateRequest.name,
        tradingPartnerName: selection.estimateRequest.tradingPartner.name,
      });
    }

    // 5. 結果を構築
    return items.map((item) => {
      const quantity = item.itemizedStatementItem.quantity;
      return {
        id: item.itemizedStatementItem.id,
        estimateRequestItemId: item.id,
        customCategory: item.itemizedStatementItem.customCategory,
        workType: item.itemizedStatementItem.workType,
        name: item.itemizedStatementItem.name,
        specification: item.itemizedStatementItem.specification,
        unit: item.itemizedStatementItem.unit,
        quantity: typeof quantity === 'number' ? quantity : parseFloat(quantity.toString()),
        displayOrder: item.itemizedStatementItem.displayOrder,
        selected: item.selected,
        otherRequests: otherSelectionsMap.get(item.itemizedStatementItemId) ?? [],
      };
    });
  }

  /**
   * データベースの結果をEstimateRequestInfoに変換
   *
   * Task 13.4: ステータスと受領見積書数を追加
   */
  private toEstimateRequestInfo(request: {
    id: string;
    projectId: string;
    tradingPartnerId: string;
    itemizedStatementId: string;
    name: string;
    method: EstimateRequestMethod;
    includeBreakdownInBody: boolean;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    tradingPartner: { id: string; name: string };
    itemizedStatement: { id: string; name: string };
    _count?: {
      receivedQuotations: number;
    };
  }): EstimateRequestInfo {
    return {
      id: request.id,
      projectId: request.projectId,
      tradingPartnerId: request.tradingPartnerId,
      tradingPartnerName: request.tradingPartner.name,
      itemizedStatementId: request.itemizedStatementId,
      itemizedStatementName: request.itemizedStatement.name,
      name: request.name,
      method: request.method,
      includeBreakdownInBody: request.includeBreakdownInBody,
      status: request.status as EstimateRequestStatus,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      receivedQuotationCount: request._count?.receivedQuotations,
    };
  }
}
