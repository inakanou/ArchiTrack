/**
 * 外部アプリの接続の定期処理（user-authentication タスク76.4）
 *
 * Requirements (user-authentication):
 * - REQ-48.2・48.3: 未使用 30 日・同意から 90 日を過ぎた接続を、接続の有効性の判定（`assertActive`）を
 *   送信元なしで呼んで終了する。終了と監査（送信元 IP は null）はその判定が持つ
 * - REQ-50.6: 許可の一覧から外れたアプリの接続を `CLIENT_REMOVED` で終了する。許可するアプリが設定されず
 *   認可の窓口が載らない環境でも動き、一覧が空なら全ての接続を終了する。起動時にも 1 回照合する
 * - REQ-47.10・48.6: 期限切れの認可サーバーの保存データを消す。ただし接続が存続している Grant の行と、
 *   再利用の検知に要る使用済みの認可コード・リフレッシュトークンの行は残す（タスク73.1）
 * - 接続の無い Grant（同意の失敗で Grant の消去も失敗した行など。タスク71.1・74.2）とその行を消す
 *
 * 定期処理の実行基盤（scheduled-job-runner.ts）から毎時 20 分に呼ばれる。繰り返しジョブは Bull が 1 つの
 * インスタンスでだけ実行する。起動時の照合と同時に動いても、接続の終了は Grant の行のロックと条件付きの消去
 * で行うので、監査は接続を消せた 1 件だけになる。
 *
 * - 各段は一定の件数ずつ ID の昇順で読み、1 件ずつ別のトランザクションで処理する。1 件の失敗は
 *   そのトランザクションだけを戻し、残りの処理を続ける。失敗があれば全ての段を終えてから
 *   `ExternalAppMaintenanceError` を投げ、Bull の再試行に任せる（再実行で結果は変わらない）
 * - ログには件数と接続の ID だけを残し、トークンの値・HMAC の ID・Grant の ID を出さない（要件48.8）
 */

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { parseExternalAppOAuthConfig } from '../oauth/client-registry.js';
import { AuditLogService } from '../services/audit-log.service.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  ConnectionBatchEndError,
  ExternalAppConnectionService,
} from '../services/external-app-connection.service.js';
import logger from '../utils/logger.js';

/** 定期処理のジョブ名（繰り返しジョブの識別子を兼ねる） */
export const EXTERNAL_APP_MAINTENANCE_JOB_NAME = 'external-app-maintenance';

/** 毎時 20 分（Asia/Tokyo） */
export const EXTERNAL_APP_MAINTENANCE_CRON = '20 * * * *';

/** 1 回の問い合わせで読む接続・Grant・保存データの行の件数 */
export const EXTERNAL_APP_MAINTENANCE_BATCH_SIZE = 100;

/**
 * 接続の無い Grant を孤立したとみなすまでの、Grant の発行からの時間。
 * 同意は Grant を保存してから接続を作るので、その間の Grant を消さない（申し込みの期限 600 秒より長くする）
 */
export const ORPHANED_GRANT_MIN_AGE_MS = 60 * 60 * 1000;

/** 再利用の検知のために、使用済みなら接続が続く間は残す種別（store-adapter の REUSE_DETECTED_KINDS） */
const REUSE_DETECTED_KINDS = ['AuthorizationCode', 'RefreshToken'] as const;

/** 定期処理が使う接続のサービスの範囲 */
export type MaintenanceConnectionService = Pick<
  ExternalAppConnectionService,
  'assertActive' | 'revokeForRemovedClients'
>;

export interface ExternalAppMaintenanceDeps {
  readonly prisma: PrismaClient;
  readonly connectionService: MaintenanceConnectionService;
  /** 許可の一覧のクライアント ID。設定が不正なら例外を投げる（そのとき接続を終了しない） */
  readonly loadAllowedClientIds: () => readonly string[];
  readonly batchSize?: number;
}

export interface ExternalAppMaintenanceResult {
  /** 許可の一覧から外れたアプリの、この実行が終了した接続の数 */
  removedClientConnectionsEnded: number;
  /** 期限切れと判定して終了した接続の数 */
  expiredConnectionsEnded: number;
  /** 消した期限切れの保存データの行の数 */
  expiredStoreRecordsDeleted: number;
  /** 消した接続の無い Grant の行とその保存データの行の数 */
  orphanedStoreRecordsDeleted: number;
  /** 失敗した接続・Grant・段の数 */
  failures: number;
}

/** 一部の処理が失敗した。終えた処理はコミット済みで、`result` に件数を持つ */
export class ExternalAppMaintenanceError extends Error {
  constructor(readonly result: ExternalAppMaintenanceResult) {
    super(`外部アプリの接続の定期処理で ${result.failures} 件が失敗しました`);
    this.name = 'ExternalAppMaintenanceError';
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * 許可の一覧が空で照合が接続を終了したときに警告を残す（設定の欠落で全接続が切れたことに気付けるようにする）。
 * 件数だけを記録し、接続・利用者の ID やトークンは出さない。0 件・一覧が空でないときは何もしない
 */
function warnIfAllConnectionsEnded(
  allowedClientIds: readonly string[],
  endedConnections: number,
  trigger: 'startup' | 'scheduled'
): void {
  if (allowedClientIds.length > 0 || endedConnections === 0) {
    return;
  }
  logger.warn(
    { endedConnections, trigger },
    'The allowed client list is empty, so all external app connections were ended. ' +
      'Check the OAUTH_ALLOWED_CLIENTS setting'
  );
}

/**
 * 環境変数の許可の一覧のクライアント ID を返す。許可するアプリが無い環境では空
 *
 * @param source - 環境変数
 * @throws {ExternalAppConfigError} 設定が不正なとき（空として扱わず、接続を終了させない）
 */
export function loadAllowedClientIds(source: NodeJS.ProcessEnv = process.env): string[] {
  const config = parseExternalAppOAuthConfig(source);
  return config?.clients.map((client) => client.clientId) ?? [];
}

/**
 * 本番の部品で接続のサービスを作る。表示名の解決は使わないので許可の一覧は渡さない
 *
 * @param prisma - データベースのクライアント
 */
export function createExternalAppConnectionServiceForJob(
  prisma: PrismaClient
): ExternalAppConnectionService {
  return new ExternalAppConnectionService({
    prisma,
    auditLogService: new AuditLogService({ prisma }),
  });
}

/**
 * 期限切れの候補の接続を、有効性の判定を送信元なしで呼んで終了する。
 * 候補の条件は索引のある列（expires_at・last_used_at）で絞る。未使用の接続は `expires_at` が同意 + 90 日なので、
 * 同意 + 30 日の到達を `expires_at <= now + 60 日` で索引から引き、同意の日時で確かめる
 */
async function endExpiredConnections(
  deps: ExternalAppMaintenanceDeps,
  now: Date,
  batchSize: number
): Promise<{ ended: number; failed: number }> {
  const idleCutoff = new Date(now.getTime() - CONNECTION_IDLE_MS);
  const unusedExpiresAtCutoff = new Date(idleCutoff.getTime() + CONNECTION_ABSOLUTE_MS);
  let ended = 0;
  let failed = 0;
  let cursor = '';
  for (;;) {
    const batch = await deps.prisma.externalAppConnection.findMany({
      where: {
        id: { gt: cursor },
        OR: [
          { expiresAt: { lte: now } },
          { lastUsedAt: { lte: idleCutoff } },
          {
            lastUsedAt: null,
            expiresAt: { lte: unusedExpiresAtCutoff },
            consentedAt: { lte: idleCutoff },
          },
        ],
      },
      select: { id: true, grantId: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    for (const connection of batch) {
      try {
        const result = await deps.connectionService.assertActive(connection.grantId, now);
        if (!result.ok) {
          ended += 1;
        }
      } catch (error) {
        failed += 1;
        logger.warn(
          { connectionId: connection.id, errorName: errorName(error) },
          'Failed to end an expired external app connection'
        );
      }
    }
    const last = batch.at(-1);
    if (last === undefined || batch.length < batchSize) {
      return { ended, failed };
    }
    cursor = last.id;
  }
}

/**
 * 期限切れの保存データの行を消す。接続が存続している Grant の行と、使用済みの認可コード・
 * リフレッシュトークンの行は残す（消すと Grant の行のロックが効かず、再利用を検知できない）
 */
async function deleteExpiredStoreRecords(
  prisma: PrismaClient,
  now: Date,
  batchSize: number
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const count = await prisma.$executeRaw`
      DELETE FROM "oauth_store_records"
      WHERE "id" IN (
        SELECT r."id" FROM "oauth_store_records" r
        WHERE r."expires_at" <= ${now}
          AND NOT (
            r."grant_id" IS NOT NULL
            AND (
              r."kind" = 'Grant'
              OR (r."consumed_at" IS NOT NULL AND r."kind" = ANY(${[...REUSE_DETECTED_KINDS]}::text[]))
            )
            AND EXISTS (
              SELECT 1 FROM "external_app_connections" c WHERE c."grant_id" = r."grant_id"
            )
          )
        ORDER BY r."id"
        LIMIT ${batchSize}
      )`;
    deleted += count;
    if (count < batchSize) {
      return deleted;
    }
  }
}

/**
 * 接続の無い Grant の ID を昇順に返す。Grant の行が無いか、期限切れか、発行から
 * `ORPHANED_GRANT_MIN_AGE_MS` を過ぎたものに限る（同意の途中の Grant を除く）
 */
async function findOrphanedGrantIds(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  now: Date,
  filter: { after: string; limit: number } | { only: string }
): Promise<string[]> {
  const issuedBefore = Math.floor((now.getTime() - ORPHANED_GRANT_MIN_AGE_MS) / 1000);
  const range =
    'only' in filter
      ? Prisma.sql`r."grant_id" = ${filter.only}`
      : Prisma.sql`r."grant_id" > ${filter.after}`;
  const limit = 'only' in filter ? 1 : filter.limit;
  const rows = await db.$queryRaw<{ grant_id: string }[]>`
    SELECT DISTINCT r."grant_id" FROM "oauth_store_records" r
    WHERE r."grant_id" IS NOT NULL
      AND ${range}
      AND NOT EXISTS (
        SELECT 1 FROM "external_app_connections" c WHERE c."grant_id" = r."grant_id"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "oauth_store_records" g
        WHERE g."grant_id" = r."grant_id"
          AND g."kind" = 'Grant'
          AND (g."expires_at" IS NULL OR g."expires_at" > ${now})
          AND NOT (
            CASE WHEN jsonb_typeof(g."payload" -> 'iat') = 'number'
              THEN (g."payload" ->> 'iat')::numeric <= ${issuedBefore}::numeric
              ELSE FALSE
            END
          )
      )
    ORDER BY r."grant_id"
    LIMIT ${limit}`;
  return rows.map((row) => row.grant_id);
}

/**
 * 接続の無い Grant とその保存データの行を消す。Grant ごとに Grant の行をロックしてから条件を確かめ直す
 * （トークンの保存は同じ行をロックして Grant の存在を確かめるので、消した後にトークンの行は書かれない）
 */
async function deleteOrphanedGrants(
  prisma: PrismaClient,
  now: Date,
  batchSize: number
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  let cursor = '';
  for (;;) {
    const grantIds = await findOrphanedGrantIds(prisma, now, { after: cursor, limit: batchSize });
    for (const grantId of grantIds) {
      try {
        deleted += await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT "id" FROM "oauth_store_records"
            WHERE "grant_id" = ${grantId} AND "kind" = 'Grant'
            FOR UPDATE`;
          const still = await findOrphanedGrantIds(tx, now, { only: grantId });
          if (still.length === 0) {
            return 0;
          }
          const { count } = await tx.oAuthStoreRecord.deleteMany({ where: { grantId } });
          return count;
        });
      } catch (error) {
        failed += 1;
        logger.warn(
          { errorName: errorName(error) },
          'Failed to delete an orphaned external app grant'
        );
      }
    }
    const last = grantIds.at(-1);
    if (last === undefined || grantIds.length < batchSize) {
      return { deleted, failed };
    }
    cursor = last;
  }
}

/**
 * 許可の一覧の照合・期限切れの終了・保存データの片付けを順に行う。
 * 各段の失敗は記録して次の段へ進み、失敗があれば最後に `ExternalAppMaintenanceError` を投げる
 *
 * @param deps - 依存
 * @param now - 期限の判定の基準の時刻
 */
export async function runExternalAppMaintenance(
  deps: ExternalAppMaintenanceDeps,
  now: Date
): Promise<ExternalAppMaintenanceResult> {
  const batchSize = deps.batchSize ?? EXTERNAL_APP_MAINTENANCE_BATCH_SIZE;
  const result: ExternalAppMaintenanceResult = {
    removedClientConnectionsEnded: 0,
    expiredConnectionsEnded: 0,
    expiredStoreRecordsDeleted: 0,
    orphanedStoreRecordsDeleted: 0,
    failures: 0,
  };

  // 期限切れより先に照合する。一覧から外れたアプリの接続の理由を CLIENT_REMOVED にする
  let allowedClientIds: readonly string[] | null = null;
  try {
    allowedClientIds = deps.loadAllowedClientIds();
    result.removedClientConnectionsEnded =
      await deps.connectionService.revokeForRemovedClients(allowedClientIds);
    warnIfAllConnectionsEnded(allowedClientIds, result.removedClientConnectionsEnded, 'scheduled');
  } catch (error) {
    if (error instanceof ConnectionBatchEndError && allowedClientIds !== null) {
      result.removedClientConnectionsEnded = error.ended;
      result.failures += error.failed;
      warnIfAllConnectionsEnded(allowedClientIds, error.ended, 'scheduled');
    } else {
      result.failures += 1;
      logger.error(
        { errorName: errorName(error) },
        'Failed to reconcile external app connections with the allowed clients'
      );
    }
  }

  try {
    const expired = await endExpiredConnections(deps, now, batchSize);
    result.expiredConnectionsEnded = expired.ended;
    result.failures += expired.failed;
  } catch (error) {
    result.failures += 1;
    logger.error({ errorName: errorName(error) }, 'Failed to end expired external app connections');
  }

  try {
    result.expiredStoreRecordsDeleted = await deleteExpiredStoreRecords(
      deps.prisma,
      now,
      batchSize
    );
  } catch (error) {
    result.failures += 1;
    logger.error({ errorName: errorName(error) }, 'Failed to delete expired OAuth store records');
  }

  try {
    const orphaned = await deleteOrphanedGrants(deps.prisma, now, batchSize);
    result.orphanedStoreRecordsDeleted = orphaned.deleted;
    result.failures += orphaned.failed;
  } catch (error) {
    result.failures += 1;
    logger.error({ errorName: errorName(error) }, 'Failed to delete orphaned external app grants');
  }

  if (result.failures > 0) {
    throw new ExternalAppMaintenanceError(result);
  }
  return result;
}

/**
 * 定期処理の処理を返す（接続のサービスは最初の実行のときに一度だけ作る）
 *
 * @param prisma - データベースのクライアント
 * @param options.source - 許可の一覧を読む環境変数（既定は process.env。実行のたびに読む）
 * @param options.createService - 接続のサービスの作成（既定は本番の組み立て）
 * @param options.clock - 現在の時刻
 */
export function createExternalAppMaintenanceRun(
  prisma: PrismaClient,
  options: {
    source?: NodeJS.ProcessEnv;
    createService?: (prisma: PrismaClient) => MaintenanceConnectionService;
    clock?: () => Date;
  } = {}
): () => Promise<ExternalAppMaintenanceResult> {
  const createService = options.createService ?? createExternalAppConnectionServiceForJob;
  const clock = options.clock ?? (() => new Date());
  let service: MaintenanceConnectionService | null = null;
  return () => {
    service ??= createService(prisma);
    return runExternalAppMaintenance(
      {
        prisma,
        connectionService: service,
        loadAllowedClientIds: () => loadAllowedClientIds(options.source ?? process.env),
      },
      clock()
    );
  };
}

/**
 * 起動時に許可の一覧を照合し、一覧から外れたアプリの接続を終了する（要件50.6）
 *
 * 設定の検証（validateEnv）の後に呼ぶ。複数のインスタンスが同時に起動しても、接続の終了は条件付きの消去で
 * 行うので監査は 1 件になる。
 *
 * @param prisma - データベースのクライアント
 * @param source - 許可の一覧を読む環境変数
 * @returns 終了した接続の数
 * @throws 設定が不正なとき（接続を終了しない）、一部の接続を終了できなかったとき
 */
export async function reconcileExternalAppClientsAtStartup(
  prisma: PrismaClient,
  source: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const allowedClientIds = loadAllowedClientIds(source);
  const ended =
    await createExternalAppConnectionServiceForJob(prisma).revokeForRemovedClients(
      allowedClientIds
    );
  warnIfAllConnectionsEnded(allowedClientIds, ended, 'startup');
  logger.info(
    { endedConnections: ended, allowedClients: allowedClientIds.length },
    'Reconciled external app connections with the allowed clients'
  );
  return ended;
}
