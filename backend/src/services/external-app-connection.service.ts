/**
 * @fileoverview 外部アプリの接続の作成・置き換え・有効性の判定（user-authentication タスク 72.1）
 *
 * 接続の唯一の持ち主として、行の変更と監査を同じトランザクションで行う。
 * 期限切れの終了の持ち主は `assertActive` であり、検証と定期処理はこれを呼ぶ。
 *
 * Requirements: 47.8, 48.2, 48.3, 48.8, 48.10, 51.7
 *
 * @module services/external-app-connection
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { ExternalAppClientRegistry } from '../oauth/client-registry.js';
import type {
  ActiveConnection,
  ConnectionAuditEvent,
  ConnectionEndReason,
  CreateConnectionInput,
  ExternalAppConnectionView,
  ExternalAppScope,
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

/** 同じ利用者とアプリの接続の置き換えを直列化する取引ロックの名前空間（第1キー） */
const CONNECTION_LOCK_NAMESPACE = 72_001;

/** 監査の対象の種別。対象は接続の利用者である（要件51.7） */
const AUDIT_TARGET_TYPE = 'User';

const KNOWN_SCOPES: ReadonlySet<string> = new Set<ExternalAppScope>(['read', 'write']);

type ConnectionRow = Prisma.ExternalAppConnectionGetPayload<object>;

export interface ExternalAppConnectionServiceDependencies {
  prisma: PrismaClient;
  auditLogService: Pick<IAuditLogService, 'createLog'>;
  clientRegistry: Pick<ExternalAppClientRegistry, 'loadAllowedClients'>;
}

/** DB の範囲のうち、知っている値だけを権限として扱う */
function toScopes(scopes: readonly string[]): ExternalAppScope[] {
  return scopes.filter((scope): scope is ExternalAppScope => KNOWN_SCOPES.has(scope));
}

/**
 * 接続の期限切れの理由を返す。「経過する」は期限の時刻の到達を含む。
 * 両方を過ぎたときは、利用では延ばせない同意からの期限を理由にする
 */
function expiryReason(row: ConnectionRow, now: Date): ConnectionEndReason | null {
  if (now.getTime() >= row.expiresAt.getTime()) {
    return 'ABSOLUTE_EXPIRED';
  }
  const idleBase = row.lastUsedAt ?? row.consentedAt;
  if (now.getTime() - idleBase.getTime() >= CONNECTION_IDLE_MS) {
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

  private toView(row: ConnectionRow): ExternalAppConnectionView {
    const app = this.deps.clientRegistry
      .loadAllowedClients()
      .find((client) => client.clientId === row.clientId);
    return {
      id: row.id,
      appName: app?.displayName ?? row.clientId,
      scopes: toScopes(row.scopes),
      consentedAt: row.consentedAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
