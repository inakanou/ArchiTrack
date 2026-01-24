/**
 * @fileoverview 見積依頼ステータスサービス
 *
 * 見積依頼ステータスの遷移ロジックと履歴管理を担当します。
 *
 * Requirements:
 * - 12.2: ステータスは「依頼前」「依頼済」「見積受領済」の3種類
 * - 12.5: 依頼前のとき「依頼済にする」ボタン
 * - 12.6: 依頼済のとき「見積受領済にする」ボタン
 * - 12.7: 依頼済のとき「依頼前に戻す」ボタンは表示しない
 * - 12.8: 見積受領済のとき「依頼済に戻す」ボタン
 * - 12.9, 12.10: ステータス遷移の実行
 * - 12.11: ステータス変更履歴を記録
 *
 * Task 12.2: EstimateRequestStatusServiceの実装
 *
 * @module services/estimate-request-status
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  EstimateRequestStatus,
  AllowedStatusTransition,
  EstimateRequestStatusHistory,
  StatusTransitionResult,
} from '../types/estimate-request-status.types.js';
import {
  EstimateRequestStatusNotFoundError,
  InvalidEstimateRequestStatusTransitionError,
} from '../errors/estimateRequestStatusError.js';

/**
 * EstimateRequestStatusService依存関係
 */
export interface EstimateRequestStatusServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * ステータス遷移ルール定義
 *
 * Requirements:
 * - 12.5: 依頼前 → 依頼済
 * - 12.6: 依頼済 → 見積受領済
 * - 12.7: 依頼済 → 依頼前 は不可
 * - 12.8: 見積受領済 → 依頼済
 */
const STATUS_TRANSITIONS: Record<EstimateRequestStatus, EstimateRequestStatus[]> = {
  BEFORE_REQUEST: ['REQUESTED'],
  REQUESTED: ['QUOTATION_RECEIVED'],
  QUOTATION_RECEIVED: ['REQUESTED'],
};

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 見積依頼ステータスサービス
 *
 * ステータス遷移の妥当性検証、履歴管理、監査ログ連携を担当します。
 */
export class EstimateRequestStatusService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: EstimateRequestStatusServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 現在のステータスから遷移可能なステータス一覧を取得
   *
   * Requirements: 12.5, 12.6, 12.7, 12.8
   *
   * @param currentStatus - 現在のステータス
   * @returns 遷移可能なステータスのリスト
   */
  getAllowedTransitions(currentStatus: EstimateRequestStatus): AllowedStatusTransition[] {
    const transitions = STATUS_TRANSITIONS[currentStatus];

    return transitions.map((status) => ({
      status,
    }));
  }

  /**
   * ステータス遷移が有効かどうかを判定
   *
   * @param fromStatus - 遷移元ステータス
   * @param toStatus - 遷移先ステータス
   * @returns 有効な遷移の場合true
   */
  isValidTransition(fromStatus: EstimateRequestStatus, toStatus: EstimateRequestStatus): boolean {
    const transitions = STATUS_TRANSITIONS[fromStatus];
    return transitions.includes(toStatus);
  }

  /**
   * ステータス遷移を実行
   *
   * トランザクション内で以下を実行:
   * 1. 見積依頼の存在確認
   * 2. 遷移の妥当性検証
   * 3. ステータス更新
   * 4. 履歴記録
   * 5. 監査ログ記録
   *
   * Requirements: 12.9, 12.10, 12.11
   *
   * @param estimateRequestId - 見積依頼ID
   * @param newStatus - 新しいステータス
   * @param actorId - 実行者ID
   * @returns 更新された見積依頼情報
   * @throws EstimateRequestStatusNotFoundError 見積依頼が存在しない
   * @throws InvalidEstimateRequestStatusTransitionError 無効なステータス遷移
   */
  async transitionStatus(
    estimateRequestId: string,
    newStatus: EstimateRequestStatus,
    actorId: string
  ): Promise<StatusTransitionResult> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 見積依頼の存在確認
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id: estimateRequestId },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestStatusNotFoundError(estimateRequestId);
      }

      const currentStatus = estimateRequest.status as EstimateRequestStatus;

      // 2. 遷移の妥当性検証
      if (!this.isValidTransition(currentStatus, newStatus)) {
        const allowedTransitions = this.getAllowedTransitions(currentStatus);
        throw new InvalidEstimateRequestStatusTransitionError(
          currentStatus,
          newStatus,
          allowedTransitions
        );
      }

      // 3. ステータス更新
      const updatedRequest = await tx.estimateRequest.update({
        where: { id: estimateRequestId },
        data: { status: newStatus },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      });

      // 4. 履歴記録
      await tx.estimateRequestStatusHistory.create({
        data: {
          estimateRequestId,
          fromStatus: currentStatus,
          toStatus: newStatus,
          changedById: actorId,
        },
      });

      // 5. 監査ログ記録
      await this.auditLogService.createLog({
        action: 'ESTIMATE_REQUEST_STATUS_CHANGED',
        actorId,
        targetType: 'EstimateRequest',
        targetId: estimateRequestId,
        before: { status: currentStatus },
        after: { status: newStatus },
      });

      return {
        id: updatedRequest.id,
        status: updatedRequest.status as EstimateRequestStatus,
        updatedAt: updatedRequest.updatedAt,
      };
    });
  }

  /**
   * 見積依頼のステータス変更履歴を取得
   *
   * Requirements: 12.11
   *
   * @param estimateRequestId - 見積依頼ID
   * @returns ステータス変更履歴（変更日時降順）
   * @throws EstimateRequestStatusNotFoundError 見積依頼が存在しない
   */
  async getStatusHistory(estimateRequestId: string): Promise<EstimateRequestStatusHistory[]> {
    // 見積依頼の存在確認
    const estimateRequest = await this.prisma.estimateRequest.findUnique({
      where: { id: estimateRequestId },
      select: { id: true, deletedAt: true },
    });

    if (!estimateRequest || estimateRequest.deletedAt !== null) {
      throw new EstimateRequestStatusNotFoundError(estimateRequestId);
    }

    const histories = await this.prisma.estimateRequestStatusHistory.findMany({
      where: { estimateRequestId },
      orderBy: { changedAt: 'desc' },
      include: {
        changedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    return histories.map((h) => ({
      id: h.id,
      estimateRequestId: h.estimateRequestId,
      fromStatus: h.fromStatus as EstimateRequestStatus | null,
      toStatus: h.toStatus as EstimateRequestStatus,
      changedById: h.changedById,
      changedAt: h.changedAt,
      changedBy: h.changedBy,
    }));
  }
}
