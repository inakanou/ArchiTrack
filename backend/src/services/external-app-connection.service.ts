/**
 * @fileoverview 外部アプリの接続の作成・置き換え・有効性の判定・一覧・取り消し
 * （user-authentication タスク 72.1、72.2）
 *
 * 接続の唯一の持ち主として、行の変更と監査を同じトランザクションで行う。
 * 期限切れの終了の持ち主は `assertActive` であり、検証と定期処理はこれを呼ぶ。
 *
 * Requirements: 47.8, 48.2, 48.3, 48.8, 48.10, 49.1, 49.4, 49.5, 49.6, 49.7, 49.8, 51.7
 *
 * @module services/external-app-connection
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { ExternalAppClientRegistry } from '../oauth/client-registry.js';
import type {
  ActiveConnection,
  AdminExternalAppConnectionView,
  AuditActor,
  ConnectionAuditEvent,
  ConnectionEndReason,
  ConnectionFilter,
  CreateConnectionInput,
  ExternalAppConnectionView,
  ExternalAppScope,
  PaginatedConnections,
} from '../oauth/oauth.types.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type { RequestContext } from '../types/auth.types.js';
import { Err, Ok, type Result } from '../types/result.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 最後の利用（未使用なら同意）からこの時間が経過した接続は失効する（要件48.2） */
export const CONNECTION_IDLE_MS = 30 * DAY_MS;
/** 同意からこの時間が経過した接続は失効する（要件48.3） */
export const CONNECTION_ABSOLUTE_MS = 90 * DAY_MS;
/** 最後に使われた日時を更新する最短の間隔 */
export const CONNECTION_TOUCH_INTERVAL_MS = 60_000;
/** 全利用者の一覧の 1 ページの上限（利用者の棚卸しの一覧と同じ） */
export const CONNECTION_LIST_MAX_LIMIT = 100;
/** 全利用者の一覧で読み飛ばせる行数の上限（DB の問い合わせの OFFSET を 32 ビットに収める） */
export const CONNECTION_LIST_MAX_OFFSET = 2_147_483_647;

/** 同じ利用者とアプリの接続の置き換えを直列化する取引ロックの名前空間（第1キー） */
const CONNECTION_LOCK_NAMESPACE = 72_001;

/** 監査の対象の種別。対象は接続の利用者である（要件51.7） */
const AUDIT_TARGET_TYPE = 'User';

const KNOWN_SCOPES: ReadonlySet<string> = new Set<ExternalAppScope>(['read', 'write']);

type ConnectionRow = Prisma.ExternalAppConnectionGetPayload<object>;

/** 一覧で読む列。Grant の ID を選択しない */
const CONNECTION_VIEW_SELECT = {
  id: true,
  clientId: true,
  scopes: true,
  consentedAt: true,
  lastUsedAt: true,
  expiresAt: true,
} as const satisfies Prisma.ExternalAppConnectionSelect;

/** 管理者の一覧で読む列。利用者の秘密の値を選択しない */
const ADMIN_CONNECTION_SELECT = {
  ...CONNECTION_VIEW_SELECT,
  user: { select: { id: true, displayName: true, email: true } },
} as const satisfies Prisma.ExternalAppConnectionSelect;

type ConnectionViewRow = Prisma.ExternalAppConnectionGetPayload<{
  select: typeof CONNECTION_VIEW_SELECT;
}>;

/** 一覧の並び順。同意の日時が同じ行は ID で決め、ページの間の欠けと重複を防ぐ */
const CONNECTION_LIST_ORDER_BY: Prisma.ExternalAppConnectionOrderByWithRelationInput[] = [
  { consentedAt: 'desc' },
  { id: 'asc' },
];

export interface ExternalAppConnectionServiceDependencies {
  prisma: PrismaClient;
  auditLogService: Pick<IAuditLogService, 'createLog'>;
  clientRegistry: Pick<ExternalAppClientRegistry, 'loadAllowedClients'>;
}

/** DB の範囲のうち、知っている値だけを権限として扱う */
function toScopes(scopes: readonly string[]): ExternalAppScope[] {
  return scopes.filter((scope): scope is ExternalAppScope => KNOWN_SCOPES.has(scope));
}

/** 未使用の期限。最後の利用（未使用なら同意）から 30 日（要件48.2） */
function idleDeadline(row: Pick<ConnectionRow, 'lastUsedAt' | 'consentedAt'>): Date {
  const base = row.lastUsedAt ?? row.consentedAt;
  return new Date(base.getTime() + CONNECTION_IDLE_MS);
}

/**
 * 接続の期限切れの理由を返す。「経過する」は期限の時刻の到達を含む。
 * 両方を過ぎたときは、利用では延ばせない同意からの期限を理由にする
 */
function expiryReason(row: ConnectionRow, now: Date): ConnectionEndReason | null {
  if (now.getTime() >= row.expiresAt.getTime()) {
    return 'ABSOLUTE_EXPIRED';
  }
  if (now.getTime() >= idleDeadline(row).getTime()) {
    return 'IDLE_EXPIRED';
  }
  return null;
}

function toActive(row: ConnectionRow): ActiveConnection {
  return {
    id: row.id,
    userId: row.userId,
    clientId: row.clientId,
    grantId: row.grantId,
    scopes: toScopes(row.scopes),
  };
}

/** 出来事を監査の metadata へ写す。トークンの値と HMAC の ID は含めない（要件48.8） */
function auditMetadata(event: ConnectionAuditEvent): Prisma.InputJsonObject {
  const userAgent =
    event.userAgent === null ? null : boundAuditText(event.userAgent, AUDIT_USER_AGENT_MAX_LENGTH);
  return {
    clientId: event.clientId,
    scopes: [...event.scopes],
    reason: event.reason,
    occurredAt: event.occurredAt.toISOString(),
    ipAddress:
      event.ipAddress === null
        ? null
        : boundAuditText(event.ipAddress, AUDIT_IP_ADDRESS_MAX_LENGTH).value,
    userAgent: userAgent?.value ?? null,
    ...(userAgent?.truncated ? { userAgentTruncated: true } : {}),
  };
}

export class ExternalAppConnectionService {
  constructor(private readonly deps: ExternalAppConnectionServiceDependencies) {}

  /**
   * 接続を作る。同じ利用者とアプリの接続があれば置き換え、前の Grant の行を消して監査に残す（要件47.8）
   *
   * 初回の同意の監査（CONSENT_GRANTED）は同意の手続きが `recordEvent` で記録する。
   *
   * @param input - 接続の内容。`grantId` は今回の同意で作った新しい Grant
   * @param tx - 呼び出し元のトランザクション
   * @returns 作成した接続
   * @throws 既存の接続と同じ Grant を渡したとき（有効なトークンの行を消さないため）
   */
  async createOrReplace(
    input: CreateConnectionInput,
    tx: Prisma.TransactionClient
  ): Promise<ExternalAppConnectionView> {
    // 行がまだ無い組の同時の同意も直列化するため、行ロックでなく取引ロックを使う
    const lockKey = `${input.userId}:${input.clientId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CONNECTION_LOCK_NAMESPACE}::int, hashtext(${lockKey}))`;

    const existing = await tx.externalAppConnection.findUnique({
      where: { userId_clientId: { userId: input.userId, clientId: input.clientId } },
    });
    if (existing?.grantId === input.grantId) {
      throw new Error('再度の同意では新しい Grant が必要です');
    }

    let replaced = false;
    if (existing) {
      // 期限切れの終了が先に消していたら、その終了が監査を持つので置き換えとして記録しない
      replaced = await this.deleteConnectionAndGrantRows(tx, { id: existing.id }, existing.grantId);
    }

    const created = await tx.externalAppConnection.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        grantId: input.grantId,
        scopes: [...input.scopes],
        consentedAt: input.consentedAt,
        expiresAt: new Date(input.consentedAt.getTime() + CONNECTION_ABSOLUTE_MS),
      },
    });

    if (replaced) {
      await this.recordEvent(
        {
          kind: 'CONNECTION_REPLACED',
          actorUserId: input.userId,
          targetUserId: input.userId,
          clientId: input.clientId,
          scopes: input.scopes,
          reason: 'REPLACED',
          occurredAt: input.consentedAt,
          ipAddress: input.source?.ipAddress ?? null,
          userAgent: input.source?.userAgent ?? null,
        },
        tx
      );
    }

    return this.toView(created);
  }

  /**
   * 接続の有効性を判定し、期限を過ぎていれば理由つきで終了する（要件48.2、48.3）
   *
   * @param grantId - Grant の ID
   * @param now - 判定の時刻
   * @param source - 要求の送信元。要求の無い定期処理では渡さず、監査の IP は null になる
   * @returns 有効な接続。無い・期限切れは NOT_ACTIVE
   */
  async assertActive(
    grantId: string,
    now: Date,
    source?: RequestContext
  ): Promise<Result<ActiveConnection, 'NOT_ACTIVE'>> {
    const row = await this.deps.prisma.externalAppConnection.findUnique({ where: { grantId } });
    if (!row) {
      return Err('NOT_ACTIVE');
    }
    const reason = expiryReason(row, now);
    if (reason === null) {
      return Ok(toActive(row));
    }

    const ended = await this.endExpired(row, reason, now, source);
    if (ended) {
      return Err('NOT_ACTIVE');
    }

    // 消せなかったのは、他の判定が先に終了したか、読み取りの後に利用が記録されたとき
    const current = await this.deps.prisma.externalAppConnection.findUnique({
      where: { grantId },
    });
    return current && expiryReason(current, now) === null
      ? Ok(toActive(current))
      : Err('NOT_ACTIVE');
  }

  /**
   * 最後に使われた日時を 1 分に 1 回まで記録する。最終ログインは更新しない（要件48.10）
   *
   * 条件を 1 文の UPDATE に含めるので、同時の呼び出しでも更新は 1 回になる。
   * 期限を過ぎた接続は更新せず、利用の記録で生き返らせない。
   *
   * @param connectionId - 接続の ID
   * @param now - 利用の時刻
   */
  async touch(connectionId: string, now: Date): Promise<void> {
    const idleCutoff = new Date(now.getTime() - CONNECTION_IDLE_MS);
    const touchCutoff = new Date(now.getTime() - CONNECTION_TOUCH_INTERVAL_MS);
    await this.deps.prisma.externalAppConnection.updateMany({
      where: {
        id: connectionId,
        expiresAt: { gt: now },
        consentedAt: { lte: now },
        OR: [
          { lastUsedAt: null, consentedAt: { gt: idleCutoff } },
          { lastUsedAt: { gt: idleCutoff, lte: touchCutoff } },
        ],
      },
      data: { lastUsedAt: now },
    });
  }

  /**
   * 本人の接続の一覧を返す（要件49.1）
   *
   * @param userId - 本人の ID
   * @returns 同意の新しい順の接続
   */
  async listOwn(userId: string): Promise<readonly ExternalAppConnectionView[]> {
    const rows = await this.deps.prisma.externalAppConnection.findMany({
      where: { userId },
      select: CONNECTION_VIEW_SELECT,
      orderBy: CONNECTION_LIST_ORDER_BY,
    });
    return rows.map((row) => this.toView(row));
  }

  /**
   * 全利用者の接続を、利用者とアプリの絞り込みとページの切り替えつきで返す（要件49.6、49.7）
   *
   * @param filter - 絞り込みとページ
   * @returns 接続のページ
   * @throws {RangeError} ページか件数が範囲外のとき。経路の検証を通った値では起きない
   */
  async listAll(filter: ConnectionFilter): Promise<PaginatedConnections> {
    const { page, limit } = filter;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > CONNECTION_LIST_MAX_LIMIT ||
      (page - 1) * limit > CONNECTION_LIST_MAX_OFFSET
    ) {
      throw new RangeError('ページまたは件数が範囲外です');
    }

    const where: Prisma.ExternalAppConnectionWhereInput = {
      ...(filter.userId !== undefined ? { userId: filter.userId } : {}),
      ...(filter.clientId !== undefined ? { clientId: filter.clientId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.deps.prisma.externalAppConnection.findMany({
        where,
        select: ADMIN_CONNECTION_SELECT,
        orderBy: CONNECTION_LIST_ORDER_BY,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.deps.prisma.externalAppConnection.count({ where }),
    ]);

    return {
      data: rows.map((row): AdminExternalAppConnectionView => ({
        ...this.toView(row),
        clientId: row.clientId,
        user: row.user,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 本人の接続を取り消す（要件49.4、49.5）
   *
   * ID と利用者を 1 つの問い合わせで絞るので、他の利用者の接続と存在しない ID は同じ経路で
   * `NOT_FOUND` になり、存在を明かさない。
   *
   * @param userId - 本人の ID
   * @param connectionId - 接続の ID
   * @param actor - 実行者と要求の送信元
   * @returns 取り消せたら Ok。対象が無い、または他の取り消しが先に終えたら NOT_FOUND
   */
  async revokeOwn(
    userId: string,
    connectionId: string,
    actor: AuditActor
  ): Promise<Result<void, 'NOT_FOUND'>> {
    return this.revoke({ id: connectionId, userId }, 'USER_REVOKED', actor);
  }

  /**
   * 管理者が接続を取り消す（要件49.8）
   *
   * @param connectionId - 接続の ID
   * @param actor - 実行者（管理者）と要求の送信元
   * @returns 取り消せたら Ok。対象が無い、または他の取り消しが先に終えたら NOT_FOUND
   */
  async revokeByAdmin(connectionId: string, actor: AuditActor): Promise<Result<void, 'NOT_FOUND'>> {
    return this.revoke({ id: connectionId }, 'ADMIN_REVOKED', actor);
  }

  /**
   * 接続の出来事を監査に記録する（要件51.7）
   *
   * @param event - 出来事
   * @param tx - 呼び出し元のトランザクション
   */
  async recordEvent(event: ConnectionAuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
    await this.deps.auditLogService.createLog(
      {
        action: event.kind,
        actorId: event.actorUserId,
        targetType: AUDIT_TARGET_TYPE,
        targetId: event.targetUserId,
        metadata: auditMetadata(event),
      },
      tx
    );
  }

  /**
   * 読み取った状態のままの接続だけを消し、消せたときに限りトークンの行の消去と監査を行う。
   * 未使用の期限は最後の利用の値も条件にして、読み取りの後に記録された利用を失効させない
   */
  private async endExpired(
    row: ConnectionRow,
    reason: ConnectionEndReason,
    now: Date,
    source?: RequestContext
  ): Promise<boolean> {
    return this.deps.prisma.$transaction(async (tx) => {
      const removed = await this.deleteConnectionAndGrantRows(
        tx,
        {
          id: row.id,
          grantId: row.grantId,
          ...(reason === 'IDLE_EXPIRED' ? { lastUsedAt: row.lastUsedAt } : {}),
        },
        row.grantId
      );
      if (!removed) {
        return false;
      }
      await this.recordEvent(
        {
          kind: 'CONNECTION_ENDED',
          actorUserId: null,
          targetUserId: row.userId,
          clientId: row.clientId,
          scopes: toScopes(row.scopes),
          reason,
          occurredAt: now,
          ipAddress: source?.ipAddress ?? null,
          userAgent: source?.userAgent ?? null,
        },
        tx
      );
      return true;
    });
  }

  /**
   * 接続と全トークンの行の消去と監査を同じトランザクションで行う。
   * 監査はこの呼び出しが接続を消せたときだけ残すので、同時の取り消しでも 1 件になる
   */
  private async revoke(
    where: { id: string; userId?: string },
    reason: 'USER_REVOKED' | 'ADMIN_REVOKED',
    actor: AuditActor
  ): Promise<Result<void, 'NOT_FOUND'>> {
    const removed = await this.deps.prisma.$transaction(async (tx) => {
      const row = await tx.externalAppConnection.findFirst({ where });
      if (!row) {
        return false;
      }
      const deleted = await this.deleteConnectionAndGrantRows(
        tx,
        { ...where, grantId: row.grantId },
        row.grantId
      );
      if (!deleted) {
        return false;
      }
      await this.recordEvent(
        {
          kind: 'CONNECTION_ENDED',
          actorUserId: actor.userId,
          targetUserId: row.userId,
          clientId: row.clientId,
          scopes: toScopes(row.scopes),
          reason,
          occurredAt: new Date(),
          ipAddress: actor.source?.ipAddress ?? null,
          userAgent: actor.source?.userAgent ?? null,
        },
        tx
      );
      return true;
    });
    return removed ? Ok(undefined) : Err('NOT_FOUND');
  }

  /**
   * Grant の行をロックしてから接続を条件付きで消し、消せたときだけその Grant の保存データの行を消す。
   *
   * ロックの順序は「Grant の行 → 接続の行」とする。トークンの保存側は同じ Grant の行をロックして挿入する。
   * 分離レベルは READ COMMITTED を前提とする。ロックを待った相手がコミットしたトークンの行は、
   * ロックの文より後に始まる別の文のスナップショットにだけ入るので、ロックと行の消去を 1 文にまとめない。
   *
   * @param tx - 呼び出し元のトランザクション
   * @param where - 消す接続の条件
   * @param grantId - 接続の Grant の ID
   * @returns 接続を消せたら true。条件に合う行が無ければ false で、保存データの行は消さない
   */
  private async deleteConnectionAndGrantRows(
    tx: Prisma.TransactionClient,
    where: Prisma.ExternalAppConnectionWhereInput,
    grantId: string
  ): Promise<boolean> {
    await tx.$queryRaw`
      SELECT "id" FROM "oauth_store_records"
      WHERE "grant_id" = ${grantId} AND "kind" = 'Grant'
      FOR UPDATE`;
    const { count } = await tx.externalAppConnection.deleteMany({ where });
    if (count === 0) {
      return false;
    }
    await tx.oAuthStoreRecord.deleteMany({ where: { grantId } });
    return true;
  }

  private toView(row: ConnectionViewRow): ExternalAppConnectionView {
    const app = this.deps.clientRegistry
      .loadAllowedClients()
      .find((client) => client.clientId === row.clientId);
    return {
      id: row.id,
      appName: app?.displayName ?? row.clientId,
      scopes: toScopes(row.scopes),
      consentedAt: row.consentedAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      // 画面の期限は、実際に終了する時刻である未使用の期限と同意からの期限の早い方
      expiresAt: new Date(
        Math.min(row.expiresAt.getTime(), idleDeadline(row).getTime())
      ).toISOString(),
    };
  }
}
