/**
 * 監査ログサービス
 *
 * 監査ログの記録・取得・エクスポート機能を提供します。
 * - センシティブな操作（ロール変更、権限変更、認証イベント）を記録
 * - フィルタリング機能（ユーザー、日付範囲、アクションタイプ）
 * - JSON形式でのエクスポート
 *
 * @module services/audit-log
 */

import { Prisma } from '@prisma/client';
import {
  IAuditLogService,
  CreateAuditLogInput,
  AuditLogFilter,
  AuditLogInfo,
  AuditLogAction,
  AuditLogServiceDependencies,
} from '../types/audit-log.types.js';

/**
 * 監査ログサービス実装
 */
export class AuditLogService implements IAuditLogService {
  constructor(private readonly deps: AuditLogServiceDependencies) {}

  /**
   * 監査ログを記録する
   * @param input - 監査ログ作成入力
   * @returns 作成された監査ログ情報
   */
  async createLog(input: CreateAuditLogInput): Promise<AuditLogInfo> {
    // nullをPrisma.JsonNullに変換
    const data = {
      action: input.action,
      actorId: input.actorId,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before === null ? Prisma.JsonNull : input.before,
      after: input.after === null ? Prisma.JsonNull : input.after,
      metadata: input.metadata === null ? Prisma.JsonNull : input.metadata,
    };

    const log = await this.deps.prisma.auditLog.create({
      data,
      select: {
        id: true,
        action: true,
        actorId: true,
        targetType: true,
        targetId: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
      },
    });

    return {
      id: log.id,
      action: log.action as AuditLogAction,
      actorId: log.actorId,
      targetType: log.targetType,
      targetId: log.targetId,
      before: log.before,
      after: log.after,
      metadata: log.metadata,
      createdAt: log.createdAt,
    };
  }

  /**
   * 監査ログを取得する（フィルタリング対応）
   * @param filter - フィルター条件
   * @returns 監査ログ一覧
   */
  async getLogs(filter?: AuditLogFilter): Promise<AuditLogInfo[]> {
    const where: Record<string, unknown> = {};

    // actorIdフィルタリング
    if (filter?.actorId) {
      where.actorId = filter.actorId;
    }

    // targetIdフィルタリング
    if (filter?.targetId) {
      where.targetId = filter.targetId;
    }

    // actionフィルタリング
    if (filter?.action) {
      where.action = filter.action;
    }

    // 日付範囲フィルタリング
    if (filter?.startDate || filter?.endDate) {
      where.createdAt = {};
      if (filter.startDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(filter.endDate);
      }
    }

    // ページネーション
    const pagination: { skip?: number; take?: number } = {};
    if (filter?.skip !== undefined) {
      pagination.skip = filter.skip;
    }
    if (filter?.take !== undefined) {
      pagination.take = filter.take;
    }

    const logs = await this.deps.prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        actorId: true,
        targetType: true,
        targetId: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action as AuditLogAction,
      actorId: log.actorId,
      targetType: log.targetType,
      targetId: log.targetId,
      before: log.before,
      after: log.after,
      metadata: log.metadata,
      createdAt: log.createdAt,
    }));
  }

  /**
   * 監査ログをJSON形式でエクスポートする
   * @param filter - フィルター条件
   * @returns JSON文字列
   */
  async exportLogs(filter?: AuditLogFilter): Promise<string> {
    const logs = await this.getLogs(filter);
    return JSON.stringify(logs, null, 2);
  }
}
