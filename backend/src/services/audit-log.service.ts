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

import { Prisma } from '../generated/prisma/client.js';
import {
  IAuditLogService,
  CreateAuditLogInput,
  AuditLogFilter,
  AuditLogInfo,
  AuditLogAction,
  AuditLogServiceDependencies,
} from '../types/audit-log.types.js';

/** 記録時に写す実行者のメールアドレスと表示名（要件40.7） */
export interface AuditActorSnapshot {
  actorEmail: string | null;
  actorDisplayName: string | null;
}

/**
 * 監査ログの実行者のメールアドレスと表示名を、記録の時点の利用者から写す。
 *
 * 監査ログの実行者は利用者への外部キーを持たないため、実行者の利用者が削除された後も
 * 誰が操作したかを識別できるよう、記録時に写しを書く（要件40.7）。
 * 実行者が利用者でない（存在しない）ときは写しを空にする。
 *
 * @param client - Prisma クライアントまたは記録と同じトランザクション
 * @param actorId - 実行者のユーザーID
 */
export async function snapshotAuditActor(
  client: Pick<Prisma.TransactionClient, 'user'>,
  actorId: string | null
): Promise<AuditActorSnapshot> {
  if (!actorId) {
    return { actorEmail: null, actorDisplayName: null };
  }
  const actor = await client.user.findUnique({
    where: { id: actorId },
    select: { email: true, displayName: true },
  });
  return { actorEmail: actor?.email ?? null, actorDisplayName: actor?.displayName ?? null };
}

/** 監査ログの読み取りで返す列（実行者の表示は外部キーの結合でなく写しを使う） */
const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  actorId: true,
  actorEmail: true,
  actorDisplayName: true,
  targetType: true,
  targetId: true,
  before: true,
  after: true,
  metadata: true,
  createdAt: true,
} as const satisfies Prisma.AuditLogSelect;

type SelectedAuditLog = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_LOG_SELECT }>;

function toAuditLogInfo(log: SelectedAuditLog): AuditLogInfo {
  return {
    id: log.id,
    action: log.action as AuditLogAction,
    actorId: log.actorId,
    actorEmail: log.actorEmail,
    actorDisplayName: log.actorDisplayName,
    targetType: log.targetType,
    targetId: log.targetId,
    before: log.before,
    after: log.after,
    metadata: log.metadata,
    createdAt: log.createdAt,
  };
}

/**
 * 監査ログサービス実装
 */
export class AuditLogService implements IAuditLogService {
  constructor(private readonly deps: AuditLogServiceDependencies) {}

  /**
   * 監査ログを記録する
   * @param input - 監査ログ作成入力
   * @param tx - 呼び出し元のトランザクション（渡すと記録が元の操作と同じトランザクションに入り、
   *   記録の失敗で元の操作もロールバックされる。省略時は単独で書き込む）
   * @returns 作成された監査ログ情報
   */
  async createLog(
    input: CreateAuditLogInput,
    tx?: Prisma.TransactionClient
  ): Promise<AuditLogInfo> {
    const client = tx ?? this.deps.prisma;
    // 実行者の写しは記録と同じトランザクションで読む（要件40.7）
    const snapshot = await snapshotAuditActor(client, input.actorId);

    // nullをPrisma.JsonNullに変換
    const data = {
      action: input.action,
      actorId: input.actorId,
      actorEmail: snapshot.actorEmail,
      actorDisplayName: snapshot.actorDisplayName,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before === null ? Prisma.JsonNull : input.before,
      after: input.after === null ? Prisma.JsonNull : input.after,
      metadata: input.metadata === null ? Prisma.JsonNull : input.metadata,
    };

    const log = await client.auditLog.create({ data, select: AUDIT_LOG_SELECT });

    return toAuditLogInfo(log);
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
      select: AUDIT_LOG_SELECT,
      orderBy: { createdAt: 'desc' },
      ...pagination,
    });

    return logs.map(toAuditLogInfo);
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
