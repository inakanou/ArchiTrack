/**
 * @fileoverview プロジェクトステータスサービス
 *
 * プロジェクトステータスの遷移ロジックと履歴管理を担当します。
 *
 * Requirements:
 * - 10.1: 12種類のプロジェクトステータス
 * - 10.2: 新規作成時のデフォルトステータスを「準備中」とする
 * - 10.3-10.7: ステータス遷移ルール（順方向・差し戻し・終端）
 * - 10.8: 許可されたステータス遷移の実行
 * - 10.9: 無効なステータス遷移の拒否
 * - 10.10, 10.11: ステータス変更履歴の記録（遷移種別含む）
 * - 10.14: 差し戻し遷移時の理由必須チェック
 * - 10.15: ステータス変更履歴に差し戻し理由を記録
 * - 12.6: 監査ログ連携（PROJECT_STATUS_CHANGED）
 *
 * @module services/project-status
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { ProjectStatus, TransitionType } from '../types/project.types.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import {
  InvalidStatusTransitionError,
  ReasonRequiredError,
  ProjectNotFoundError,
  type AllowedTransition,
} from '../errors/projectError.js';

/**
 * ProjectStatusService依存関係
 */
export interface ProjectStatusServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * プロジェクト情報（ステータス遷移後の戻り値）
 */
export interface ProjectInfo {
  id: string;
  name: string;
  status: ProjectStatus;
  updatedAt: Date;
}

/**
 * ステータス変更履歴
 */
export interface ProjectStatusHistory {
  id: string;
  projectId: string;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  transitionType: TransitionType;
  reason: string | null;
  changedById: string;
  changedAt: Date;
  changedBy?: {
    id: string;
    displayName: string;
  };
}

/**
 * ステータス遷移ルール定義
 * 各ステータスから遷移可能なステータスとその種別を定義
 */
const STATUS_TRANSITIONS: Record<
  ProjectStatus,
  Array<{ status: ProjectStatus; type: Exclude<TransitionType, 'initial'> }>
> = {
  // 準備中: 調査中への順方向遷移、中止への終端遷移
  PREPARING: [
    { status: 'SURVEYING', type: 'forward' },
    { status: 'CANCELLED', type: 'terminate' },
  ],

  // 調査中: 見積中への順方向遷移、準備中への差し戻し、中止への終端遷移
  SURVEYING: [
    { status: 'ESTIMATING', type: 'forward' },
    { status: 'PREPARING', type: 'backward' },
    { status: 'CANCELLED', type: 'terminate' },
  ],

  // 見積中: 決裁待ちへの順方向遷移、調査中への差し戻し、中止への終端遷移
  ESTIMATING: [
    { status: 'APPROVING', type: 'forward' },
    { status: 'SURVEYING', type: 'backward' },
    { status: 'CANCELLED', type: 'terminate' },
  ],

  // 決裁待ち: 契約中への順方向遷移、見積中への差し戻し、失注への終端遷移
  APPROVING: [
    { status: 'CONTRACTING', type: 'forward' },
    { status: 'ESTIMATING', type: 'backward' },
    { status: 'LOST', type: 'terminate' },
  ],

  // 契約中: 工事中への順方向遷移、決裁待ちへの差し戻し、失注への終端遷移
  CONTRACTING: [
    { status: 'CONSTRUCTING', type: 'forward' },
    { status: 'APPROVING', type: 'backward' },
    { status: 'LOST', type: 'terminate' },
  ],

  // 工事中: 引渡中への順方向遷移、契約中への差し戻し
  CONSTRUCTING: [
    { status: 'DELIVERING', type: 'forward' },
    { status: 'CONTRACTING', type: 'backward' },
  ],

  // 引渡中: 請求中への順方向遷移、工事中への差し戻し
  DELIVERING: [
    { status: 'BILLING', type: 'forward' },
    { status: 'CONSTRUCTING', type: 'backward' },
  ],

  // 請求中: 入金待ちへの順方向遷移、引渡中への差し戻し
  BILLING: [
    { status: 'AWAITING', type: 'forward' },
    { status: 'DELIVERING', type: 'backward' },
  ],

  // 入金待ち: 完了への順方向遷移、請求中への差し戻し
  AWAITING: [
    { status: 'COMPLETED', type: 'forward' },
    { status: 'BILLING', type: 'backward' },
  ],

  // 終端ステータス: 遷移不可
  COMPLETED: [],
  CANCELLED: [],
  LOST: [],
};

/**
 * プロジェクトステータスサービス
 *
 * ステータス遷移の妥当性検証、履歴管理、監査ログ連携を担当します。
 */
export class ProjectStatusService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: ProjectStatusServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 現在のステータスから遷移可能なステータス一覧を取得
   *
   * @param currentStatus - 現在のステータス
   * @returns 遷移可能なステータスと遷移種別のリスト
   */
  getAllowedTransitions(currentStatus: ProjectStatus): AllowedTransition[] {
    const transitions = STATUS_TRANSITIONS[currentStatus];

    return transitions.map((t) => ({
      status: t.status,
      type: t.type,
      requiresReason: t.type === 'backward',
    }));
  }

  /**
   * ステータス遷移の種別を判定
   *
   * @param fromStatus - 遷移元ステータス
   * @param toStatus - 遷移先ステータス
   * @returns 遷移種別（無効な遷移の場合はnull）
   */
  getTransitionType(fromStatus: ProjectStatus, toStatus: ProjectStatus): TransitionType | null {
    const transitions = STATUS_TRANSITIONS[fromStatus];
    const transition = transitions.find((t) => t.status === toStatus);

    return transition?.type ?? null;
  }

  /**
   * ステータス遷移を実行
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクトの存在確認
   * 2. 遷移の妥当性検証
   * 3. 差し戻し時の理由必須チェック
   * 4. ステータス更新
   * 5. 履歴記録
   * 6. 監査ログ記録
   *
   * @param projectId - プロジェクトID
   * @param newStatus - 新しいステータス
   * @param actorId - 実行者ID
   * @param reason - 差し戻し理由（backward遷移時は必須）
   * @returns 更新されたプロジェクト情報
   * @throws ProjectNotFoundError プロジェクトが存在しない
   * @throws InvalidStatusTransitionError 無効なステータス遷移
   * @throws ReasonRequiredError 差し戻し理由が未入力
   */
  async transitionStatus(
    projectId: string,
    newStatus: ProjectStatus,
    actorId: string,
    reason?: string
  ): Promise<ProjectInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクトの存在確認
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      });

      if (!project) {
        throw new ProjectNotFoundError(projectId);
      }

      const currentStatus = project.status as ProjectStatus;

      // 2. 遷移の妥当性検証
      const transitionType = this.getTransitionType(currentStatus, newStatus);

      if (!transitionType) {
        const allowedTransitions = this.getAllowedTransitions(currentStatus);
        throw new InvalidStatusTransitionError(currentStatus, newStatus, allowedTransitions);
      }

      // 3. 差し戻し時の理由必須チェック
      if (transitionType === 'backward') {
        if (!reason || reason.trim().length === 0) {
          throw new ReasonRequiredError();
        }
      }

      // 4. ステータス更新
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: { status: newStatus },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      });

      // 5. 履歴記録
      await tx.projectStatusHistory.create({
        data: {
          projectId,
          fromStatus: currentStatus,
          toStatus: newStatus,
          transitionType,
          reason: transitionType === 'backward' ? reason : null,
          changedById: actorId,
        },
      });

      // 6. 監査ログ記録
      await this.auditLogService.createLog({
        action: 'PROJECT_STATUS_CHANGED',
        actorId,
        targetType: 'Project',
        targetId: projectId,
        before: { status: currentStatus },
        after: { status: newStatus },
        metadata: {
          transitionType,
          reason: transitionType === 'backward' ? reason : null,
        },
      });

      return {
        id: updatedProject.id,
        name: updatedProject.name,
        status: updatedProject.status as ProjectStatus,
        updatedAt: updatedProject.updatedAt,
      };
    });
  }

  /**
   * プロジェクトのステータス変更履歴を取得
   *
   * @param projectId - プロジェクトID
   * @returns ステータス変更履歴（変更日時降順）
   * @throws ProjectNotFoundError プロジェクトが存在しない
   */
  async getStatusHistory(projectId: string): Promise<ProjectStatusHistory[]> {
    // プロジェクトの存在確認
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    const histories = await this.prisma.projectStatusHistory.findMany({
      where: { projectId },
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
      projectId: h.projectId,
      fromStatus: h.fromStatus as ProjectStatus | null,
      toStatus: h.toStatus as ProjectStatus,
      transitionType: h.transitionType as TransitionType,
      reason: h.reason,
      changedById: h.changedById,
      changedAt: h.changedAt,
      changedBy: h.changedBy,
    }));
  }
}
