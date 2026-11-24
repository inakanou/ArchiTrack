/**
 * @fileoverview 外部アプリの接続の定期処理の統合検証（user-authentication タスク 76.4）
 *
 * 確かめること:
 * - 48.2: 最後の利用（未使用なら同意）から 30 日が経過した接続を、送信元なしの有効性の判定で終了する
 * - 48.3: 同意から 90 日が経過した接続を、利用の有無にかかわらず終了する
 * - 50.6: 許可の一覧から外れたアプリの接続を終了する。一覧が空（窓口が載らない環境）なら全接続を終了する
 * - 51.7: 終了を監査に残し、要求の無い処理なので実行者と送信元 IP は null になる
 * - 47.10・48.6: 期限切れの保存データを消しても、接続が存続している使用済みの行は残す
 * - 再実行・同時の実行で結果と監査が変わらない。1 件の失敗で他の接続の処理が止まらない
 *
 * 共有のデータベースの全接続が処理の対象になる。本試験の利用者の接続と行だけを確かめ、後始末する。
 *
 * Design: Requirements 46-51 > ExternalAppMaintenanceJob, ExternalAppConnectionService
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import {
  EXTERNAL_APP_MAINTENANCE_BATCH_SIZE,
  ExternalAppMaintenanceError,
  ORPHANED_GRANT_MIN_AGE_MS,
  createExternalAppConnectionServiceForJob,
  createExternalAppMaintenanceRun,
  reconcileExternalAppClientsAtStartup,
  runExternalAppMaintenance,
} from '../../jobs/external-app-maintenance.job.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  ExternalAppConnectionService,
} from '../../services/external-app-connection.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-oauth764-maintenance';
const CLIENT_ID = `${MARK}-client`;
const REMOVED_CLIENT_ID = `${MARK}-removed-client`;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const LOCK_WAIT_DEADLINE_MS = 4000;

/** 設定の環境変数（許可するアプリが無い環境。認可の窓口は載らない） */
const UNCONFIGURED_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

function before(base: Date, ms: number): Date {
  return new Date(base.getTime() - ms);
}

/** 許可するアプリを設定した環境変数（試験の実行環境。鍵はこの試験だけの無作為の値） */
function configuredEnv(clientIds: readonly string[]): NodeJS.ProcessEnv {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    NODE_ENV: 'test',
    OAUTH_ALLOWED_CLIENTS: JSON.stringify(
      clientIds.map((clientId) => ({
        clientId,
        clientSecret: randomBytes(24).toString('hex'),
        displayName: 'Test App',
        redirectUris: ['https://client.example/callback'],
      }))
    ),
    OAUTH_ISSUER: 'http://127.0.0.1:4999',
    OAUTH_RESOURCE_URL: 'http://127.0.0.1:4999/mcp',
    OAUTH_JWKS: JSON.stringify({
      keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }],
    }),
    OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
    OAUTH_TOKEN_HMAC_KEY: randomBytes(32).toString('hex'),
  };
}

describe('外部アプリの接続の定期処理（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: ExternalAppConnectionService;
  let userId: string;
  let otherUserId: string;
  let now: Date;

  async function markedUserIds(): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async function cleanup(): Promise<void> {
    const ids = await markedUserIds();
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { contains: MARK } } });
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  function newGrantId(): string {
    return `${MARK}-grant-${randomUUID()}`;
  }

  /** ライブラリが保存する形の Grant の行（発行の時刻 iat を秒で持つ） */
  async function addGrantRow(
    grantId: string,
    options: { owner?: string; clientId?: string; issuedAt?: Date; expiresAt?: Date } = {}
  ): Promise<string> {
    const issuedAt = options.issuedAt ?? now;
    const id = `Grant:${grantId}`;
    await prisma.oAuthStoreRecord.create({
      data: {
        id,
        kind: 'Grant',
        grantId,
        payload: {
          kind: 'Grant',
          accountId: options.owner ?? userId,
          clientId: options.clientId ?? CLIENT_ID,
          iat: Math.floor(issuedAt.getTime() / 1000),
        },
        expiresAt: options.expiresAt ?? new Date(issuedAt.getTime() + CONNECTION_ABSOLUTE_MS),
      },
    });
    return id;
  }

  async function addRow(
    kind: string,
    options: { grantId?: string | null; consumedAt?: Date | null; expiresAt?: Date | null } = {}
  ): Promise<string> {
    const id = `${kind}:${MARK}-${randomUUID()}`;
    await prisma.oAuthStoreRecord.create({
      data: {
        id,
        kind,
        grantId: options.grantId ?? null,
        payload: { kind },
        consumedAt: options.consumedAt ?? null,
        expiresAt:
          options.expiresAt === undefined ? new Date(now.getTime() + DAY_MS) : options.expiresAt,
      },
    });
    return id;
  }

  /** Grant の行・アクセストークンの行と接続を作る */
  async function createConnection(
    options: {
      owner?: string;
      clientId?: string;
      consentedAt?: Date;
      lastUsedAt?: Date | null;
    } = {}
  ): Promise<{ id: string; grantId: string; owner: string }> {
    const grantId = newGrantId();
    const owner = options.owner ?? userId;
    const clientId = options.clientId ?? CLIENT_ID;
    const consentedAt = options.consentedAt ?? before(now, DAY_MS);
    await addGrantRow(grantId, { owner, clientId, issuedAt: consentedAt });
    await addRow('AccessToken', { grantId });
    const created = await prisma.externalAppConnection.create({
      data: {
        userId: owner,
        clientId,
        grantId,
        scopes: ['read'],
        consentedAt,
        lastUsedAt: options.lastUsedAt ?? null,
        expiresAt: new Date(consentedAt.getTime() + CONNECTION_ABSOLUTE_MS),
      },
    });
    return { id: created.id, grantId, owner };
  }

  async function connectionExists(grantId: string): Promise<boolean> {
    return (await prisma.externalAppConnection.count({ where: { grantId } })) === 1;
  }

  async function storeRowCount(grantId: string): Promise<number> {
    return prisma.oAuthStoreRecord.count({ where: { grantId } });
  }

  async function endedAudits(targetUserId: string = userId) {
    return prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ENDED', targetId: targetUserId },
      orderBy: { createdAt: 'asc' },
    });
  }

  function run(allowedClientIds: readonly string[] = [CLIENT_ID]) {
    return runExternalAppMaintenance(
      { prisma, connectionService: service, loadAllowedClientIds: () => allowedClientIds },
      now
    );
  }

  async function expectEndedWithoutSource(
    connection: { grantId: string; owner: string },
    reason: string,
    clientId: string = CLIENT_ID
  ): Promise<void> {
    expect(await connectionExists(connection.grantId)).toBe(false);
    expect(await storeRowCount(connection.grantId)).toBe(0);
    const audits = (await endedAudits(connection.owner)).filter(
      (audit) => (audit.metadata as Record<string, unknown>).clientId === clientId
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorId).toBeNull();
    expect(audits[0]?.metadata).toMatchObject({
      clientId,
      scopes: ['read'],
      reason,
      ipAddress: null,
      userAgent: null,
    });
  }

  /** `holderPid` のロックを待つ接続が現れるまで待つ。期限内に現れなければ失敗させる */
  async function waitUntilBlockedBy(holderPid: number): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
        WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))`;
      if ((rows[0]?.waiting ?? 0) > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Grant の行のロックを待つ接続が現れませんでした');
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
  });

  beforeEach(async () => {
    now = new Date();
    const user = await createTestUser(prisma, {
      email: `${MARK}-${randomUUID()}@example.com`,
      displayName: 'Maintenance User',
      passwordHash: 'x',
    });
    userId = user.id;
    const other = await createTestUser(prisma, {
      email: `${MARK}-other-${randomUUID()}@example.com`,
      displayName: 'Maintenance Other',
      passwordHash: 'x',
    });
    otherUserId = other.id;
    service = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('期限切れの終了（48.2、48.3）', () => {
    it('最後の利用から 30 日を過ぎた接続を IDLE_EXPIRED で終了し、監査の送信元は null になる', async () => {
      const idle = await createConnection({
        consentedAt: before(now, 40 * DAY_MS),
        lastUsedAt: before(now, CONNECTION_IDLE_MS + MINUTE_MS),
      });

      const result = await run();

      expect(result.expiredConnectionsEnded).toBeGreaterThanOrEqual(1);
      await expectEndedWithoutSource(idle, 'IDLE_EXPIRED');
    });

    it('一度も使われず同意から 30 日を過ぎた接続を IDLE_EXPIRED で終了する', async () => {
      const unused = await createConnection({
        consentedAt: before(now, CONNECTION_IDLE_MS + MINUTE_MS),
        lastUsedAt: null,
      });

      await run();

      await expectEndedWithoutSource(unused, 'IDLE_EXPIRED');
    });

    it('同意から 90 日を過ぎた接続を、最近使われていても ABSOLUTE_EXPIRED で終了する', async () => {
      const absolute = await createConnection({
        consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
        lastUsedAt: before(now, DAY_MS),
      });

      await run();

      await expectEndedWithoutSource(absolute, 'ABSOLUTE_EXPIRED');
    });

    it('期限内の接続は残し、監査も残さない', async () => {
      const recent = await createConnection({
        consentedAt: before(now, 80 * DAY_MS),
        lastUsedAt: before(now, CONNECTION_IDLE_MS - MINUTE_MS),
      });
      const unusedYoung = await createConnection({
        owner: otherUserId,
        consentedAt: before(now, CONNECTION_IDLE_MS - MINUTE_MS),
        lastUsedAt: null,
      });

      await run();

      expect(await connectionExists(recent.grantId)).toBe(true);
      expect(await storeRowCount(recent.grantId)).toBe(2);
      expect(await connectionExists(unusedYoung.grantId)).toBe(true);
      expect(await endedAudits(userId)).toHaveLength(0);
      expect(await endedAudits(otherUserId)).toHaveLength(0);
    });

    it('1 回の取り出しの件数を超える接続もすべて終了する', async () => {
      const count = EXTERNAL_APP_MAINTENANCE_BATCH_SIZE + 3;
      const owners = await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const user = await createTestUser(prisma, {
            email: `${MARK}-batch-${index}-${randomUUID()}@example.com`,
            displayName: 'Batch User',
            passwordHash: 'x',
          });
          return user.id;
        })
      );
      for (const owner of owners) {
        await createConnection({
          owner,
          consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
        });
      }

      await run();

      expect(await prisma.externalAppConnection.count({ where: { userId: { in: owners } } })).toBe(
        0
      );
      expect(
        await prisma.auditLog.count({
          where: { action: 'CONNECTION_ENDED', targetId: { in: owners } },
        })
      ).toBe(count);
    });
  });

  describe('許可の一覧から外れたアプリ（50.6）', () => {
    it('一覧に無いアプリの接続を CLIENT_REMOVED で終了し、一覧にあるアプリの接続は残す', async () => {
      const removed = await createConnection({ clientId: REMOVED_CLIENT_ID });
      const allowed = await createConnection({ owner: otherUserId });

      const result = await run([CLIENT_ID]);

      expect(result.removedClientConnectionsEnded).toBeGreaterThanOrEqual(1);
      await expectEndedWithoutSource(removed, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);
      expect(await connectionExists(allowed.grantId)).toBe(true);
      expect(await endedAudits(otherUserId)).toHaveLength(0);
    });

    it('一覧が空なら全ての接続を終了する', async () => {
      const first = await createConnection();
      const second = await createConnection({ owner: otherUserId, clientId: REMOVED_CLIENT_ID });

      await run([]);

      await expectEndedWithoutSource(first, 'CLIENT_REMOVED');
      await expectEndedWithoutSource(second, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);
    });

    it('許可するアプリが設定されず窓口が載らない環境でも、定期処理は動いて全ての接続を終了する', async () => {
      const first = await createConnection();
      const expired = await createConnection({
        owner: otherUserId,
        consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
      });

      const result = await createExternalAppMaintenanceRun(prisma, {
        source: UNCONFIGURED_ENV,
        clock: () => now,
      })();

      expect(result.removedClientConnectionsEnded).toBeGreaterThanOrEqual(2);
      await expectEndedWithoutSource(first, 'CLIENT_REMOVED');
      // 一覧の照合が先に終了するので、期限切れの接続も CLIENT_REMOVED になる
      await expectEndedWithoutSource(expired, 'CLIENT_REMOVED');
    });

    it('許可するアプリの設定が不正なら照合で接続を終了せず、他の処理を済ませてから失敗する', async () => {
      const kept = await createConnection();
      const expired = await createConnection({
        owner: otherUserId,
        consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
      });

      await expect(
        createExternalAppMaintenanceRun(prisma, {
          source: { NODE_ENV: 'test', OAUTH_ALLOWED_CLIENTS: '[{"clientId":' },
          clock: () => now,
        })()
      ).rejects.toBeInstanceOf(ExternalAppMaintenanceError);

      expect(await connectionExists(kept.grantId)).toBe(true);
      await expectEndedWithoutSource(expired, 'ABSOLUTE_EXPIRED');
    });

    it('起動時の照合は一覧から外れたアプリの接続を終了し、2 つのインスタンスが同時に起動しても監査は 1 件になる', async () => {
      const removed = await createConnection();
      const removedOther = await createConnection({ owner: otherUserId });

      const [first, second] = await Promise.all([
        reconcileExternalAppClientsAtStartup(prisma, UNCONFIGURED_ENV),
        reconcileExternalAppClientsAtStartup(prisma, UNCONFIGURED_ENV),
      ]);

      expect(first + second).toBeGreaterThanOrEqual(2);
      await expectEndedWithoutSource(removed, 'CLIENT_REMOVED');
      await expectEndedWithoutSource(removedOther, 'CLIENT_REMOVED');
    });

    it('起動時の照合は設定の許可の一覧を読み、一覧にあるアプリの接続を残す', async () => {
      const removed = await createConnection({ clientId: REMOVED_CLIENT_ID });
      const allowed = await createConnection({ owner: otherUserId });

      const ended = await reconcileExternalAppClientsAtStartup(prisma, configuredEnv([CLIENT_ID]));

      expect(ended).toBeGreaterThanOrEqual(1);
      await expectEndedWithoutSource(removed, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);
      expect(await connectionExists(allowed.grantId)).toBe(true);
      expect(await endedAudits(otherUserId)).toHaveLength(0);
    });

    it('起動時の照合は設定が不正なら接続を終了せずに失敗する', async () => {
      const kept = await createConnection({ clientId: REMOVED_CLIENT_ID });

      await expect(
        reconcileExternalAppClientsAtStartup(prisma, {
          NODE_ENV: 'test',
          OAUTH_ALLOWED_CLIENTS: '[{"clientId":',
        })
      ).rejects.toThrow();

      expect(await connectionExists(kept.grantId)).toBe(true);
      expect(await endedAudits(userId)).toHaveLength(0);
    });

    it('照合の終了は保存側と同じ Grant の行のロックを待ち、終了の後にトークンの行を残さない', async () => {
      const removed = await createConnection({ clientId: REMOVED_CLIENT_ID });
      const tokenId = `AccessToken:${MARK}-${randomUUID()}`;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let inserted: (pid: number) => void = () => undefined;
      const holderPid = new Promise<number>((resolve) => {
        inserted = resolve;
      });
      const holder = prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
          await tx.$queryRaw`
            SELECT id FROM "oauth_store_records"
            WHERE "grant_id" = ${removed.grantId} AND "kind" = 'Grant' FOR UPDATE`;
          await tx.oAuthStoreRecord.create({
            data: { id: tokenId, kind: 'AccessToken', grantId: removed.grantId, payload: {} },
          });
          inserted(rows[0]?.pid as number);
          await gate;
        },
        { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
      );
      const pid = await holderPid;

      const running = service.revokeForRemovedClients([CLIENT_ID]);
      let waitError: unknown = null;
      try {
        await waitUntilBlockedBy(pid);
      } catch (error) {
        waitError = error;
      }
      release();
      await holder;
      await running;
      if (waitError !== null) {
        throw waitError;
      }

      expect(await prisma.oAuthStoreRecord.count({ where: { id: tokenId } })).toBe(0);
      await expectEndedWithoutSource(removed, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);
    });
  });

  describe('保存データの片付け（47.10、48.6）', () => {
    it('接続が存続している使用済みの行と Grant の行は期限の後も残し、期限切れの他の行を消す', async () => {
      const live = await createConnection();
      const expiredAt = before(now, MINUTE_MS);
      const consumedCode = await addRow('AuthorizationCode', {
        grantId: live.grantId,
        consumedAt: before(now, 20 * MINUTE_MS),
        expiresAt: expiredAt,
      });
      const consumedRefresh = await addRow('RefreshToken', {
        grantId: live.grantId,
        consumedAt: before(now, 20 * MINUTE_MS),
        expiresAt: expiredAt,
      });
      const expiredAccess = await addRow('AccessToken', {
        grantId: live.grantId,
        expiresAt: expiredAt,
      });
      const expiredUnusedCode = await addRow('AuthorizationCode', {
        grantId: live.grantId,
        expiresAt: expiredAt,
      });
      await prisma.oAuthStoreRecord.update({
        where: { id: `Grant:${live.grantId}` },
        data: { expiresAt: expiredAt },
      });
      const expiredSession = await addRow('Session', { expiresAt: expiredAt });
      const expiredInteraction = await addRow('Interaction', { expiresAt: expiredAt });
      const liveInteraction = await addRow('Interaction', {
        expiresAt: new Date(now.getTime() + 600_000),
      });

      const result = await run();

      const remaining = new Set(
        (
          await prisma.oAuthStoreRecord.findMany({
            where: { id: { contains: MARK } },
            select: { id: true },
          })
        ).map((row) => row.id)
      );
      expect(remaining.has(consumedCode)).toBe(true);
      expect(remaining.has(consumedRefresh)).toBe(true);
      expect(remaining.has(`Grant:${live.grantId}`)).toBe(true);
      expect(remaining.has(liveInteraction)).toBe(true);
      expect(remaining.has(expiredAccess)).toBe(false);
      expect(remaining.has(expiredUnusedCode)).toBe(false);
      expect(remaining.has(expiredSession)).toBe(false);
      expect(remaining.has(expiredInteraction)).toBe(false);
      expect(result.expiredStoreRecordsDeleted).toBeGreaterThanOrEqual(4);
      expect(await connectionExists(live.grantId)).toBe(true);
    });

    it('接続の無い古い Grant（消去に失敗して残った行を含む）とその行を消し、作られたばかりの Grant は残す', async () => {
      const orphanGrantId = newGrantId();
      await addGrantRow(orphanGrantId, {
        issuedAt: before(now, ORPHANED_GRANT_MIN_AGE_MS + MINUTE_MS),
      });
      const orphanCode = await addRow('AuthorizationCode', {
        grantId: orphanGrantId,
        consumedAt: before(now, ORPHANED_GRANT_MIN_AGE_MS),
        expiresAt: before(now, MINUTE_MS),
      });
      const orphanRefresh = await addRow('RefreshToken', { grantId: orphanGrantId });

      // Grant の行が既に無い、接続の無いトークンの行
      const missingGrantId = newGrantId();
      const strayRefresh = await addRow('RefreshToken', { grantId: missingGrantId });

      // 同意の途中（Grant を保存し、接続をまだ作っていない）
      const youngGrantId = newGrantId();
      await addGrantRow(youngGrantId, { issuedAt: before(now, MINUTE_MS) });

      const result = await run();

      expect(await storeRowCount(orphanGrantId)).toBe(0);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: orphanCode } })).toBe(0);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: orphanRefresh } })).toBe(0);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: strayRefresh } })).toBe(0);
      expect(await storeRowCount(youngGrantId)).toBe(1);
      // 期限切れの使用済みのコードは、接続が無いので期限切れの片付けが先に消す
      expect(result.orphanedStoreRecordsDeleted).toBeGreaterThanOrEqual(3);
    });
  });

  describe('再実行と同時の実行', () => {
    it('再実行しても結果が変わらず、監査が増えない', async () => {
      const expired = await createConnection({
        consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
      });
      const removed = await createConnection({ owner: otherUserId, clientId: REMOVED_CLIENT_ID });
      const live = await createConnection({ owner: otherUserId });
      const consumedCode = await addRow('AuthorizationCode', {
        grantId: live.grantId,
        consumedAt: before(now, 20 * MINUTE_MS),
        expiresAt: before(now, MINUTE_MS),
      });

      await run();
      const snapshot = async () => ({
        connections: await prisma.externalAppConnection.findMany({
          where: { userId: { in: [userId, otherUserId] } },
          orderBy: { id: 'asc' },
        }),
        rows: await prisma.oAuthStoreRecord.findMany({
          where: { id: { contains: MARK } },
          orderBy: { id: 'asc' },
        }),
        audits: await prisma.auditLog.count({
          where: { action: 'CONNECTION_ENDED', targetId: { in: [userId, otherUserId] } },
        }),
      });
      const afterFirst = await snapshot();

      await run();

      expect(await snapshot()).toEqual(afterFirst);
      expect(afterFirst.audits).toBe(2);
      await expectEndedWithoutSource(expired, 'ABSOLUTE_EXPIRED');
      await expectEndedWithoutSource(removed, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: consumedCode } })).toBe(1);
    });

    it('同時の 2 つの実行でも、各接続の監査は 1 件になる', async () => {
      const connections = [
        await createConnection({ consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS) }),
        await createConnection({
          owner: otherUserId,
          consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
        }),
        await createConnection({ clientId: REMOVED_CLIENT_ID }),
        await createConnection({ owner: otherUserId, clientId: REMOVED_CLIENT_ID }),
      ];

      await Promise.all([run(), run()]);

      for (const connection of connections) {
        expect(await connectionExists(connection.grantId)).toBe(false);
      }
      expect(await endedAudits(userId)).toHaveLength(2);
      expect(await endedAudits(otherUserId)).toHaveLength(2);
    });
  });

  describe('一部の失敗', () => {
    it('期限切れの 1 件の判定が失敗しても他の接続を終了し、失敗を報告し、次の実行で終了する', async () => {
      const failing = await createConnection({
        consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
      });
      const other = await createConnection({
        owner: otherUserId,
        consentedAt: before(now, CONNECTION_ABSOLUTE_MS + MINUTE_MS),
      });
      const flaky: Pick<ExternalAppConnectionService, 'assertActive' | 'revokeForRemovedClients'> =
        {
          assertActive: (grantId, at, source) =>
            grantId === failing.grantId
              ? Promise.reject(new Error('injected expiry failure'))
              : service.assertActive(grantId, at, source),
          revokeForRemovedClients: (ids) => service.revokeForRemovedClients(ids),
        };

      const failure = await runExternalAppMaintenance(
        { prisma, connectionService: flaky, loadAllowedClientIds: () => [CLIENT_ID] },
        now
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ExternalAppMaintenanceError);
      expect((failure as ExternalAppMaintenanceError).result.failures).toBe(1);
      await expectEndedWithoutSource(other, 'ABSOLUTE_EXPIRED');
      expect(await connectionExists(failing.grantId)).toBe(true);
      expect(await storeRowCount(failing.grantId)).toBe(2);
      expect(await endedAudits(userId)).toHaveLength(0);

      await run();

      await expectEndedWithoutSource(failing, 'ABSOLUTE_EXPIRED');
    });

    it('一覧から外れたアプリの 1 件の終了が失敗しても他の接続を終了し、失敗した接続は行も監査も変えない', async () => {
      const first = await createConnection({ clientId: REMOVED_CLIENT_ID });
      const second = await createConnection({ owner: otherUserId, clientId: REMOVED_CLIENT_ID });
      const auditLogService = new AuditLogService({ prisma });
      // 監査は終了と同じトランザクションに入るので、監査の失敗でその接続の終了全体が戻る
      const flakyService = new ExternalAppConnectionService({
        prisma,
        auditLogService: {
          createLog: (input, tx) =>
            input.targetId === first.owner
              ? Promise.reject(new Error('injected audit failure'))
              : auditLogService.createLog(input, tx),
        },
      });

      await expect(flakyService.revokeForRemovedClients([CLIENT_ID])).rejects.toThrow();

      expect(await connectionExists(first.grantId)).toBe(true);
      expect(await storeRowCount(first.grantId)).toBe(2);
      expect(await endedAudits(first.owner)).toHaveLength(0);
      await expectEndedWithoutSource(second, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);

      await service.revokeForRemovedClients([CLIENT_ID]);

      await expectEndedWithoutSource(first, 'CLIENT_REMOVED', REMOVED_CLIENT_ID);
    });
  });

  it('定期処理の組み立ては本番の部品で接続のサービスを作る', () => {
    expect(createExternalAppConnectionServiceForJob(prisma)).toBeInstanceOf(
      ExternalAppConnectionService
    );
  });
});
