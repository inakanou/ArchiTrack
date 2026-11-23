/**
 * @fileoverview 接続の作成・置き換え・有効性の判定の統合検証（user-authentication タスク 72.1）
 *
 * 確かめること:
 * - 47.8: 再度の同意で接続を置き換え、前のトークンの行を同じトランザクションで消す
 * - 48.2: 最後の利用（未使用なら同意）から 30 日が経過した接続を終了する
 * - 48.3: 同意から 90 日が経過した接続を、利用の有無にかかわらず終了する
 * - 48.10: 利用の記録は最終ログインを更新しない
 * - 51.7: 実行者・対象・アプリ・範囲・理由・日時・送信元 IP を監査に残す
 * - 48.8: 監査にトークンの値と HMAC の ID を書かない
 * - 49.1, 49.6, 49.7: 本人の一覧と、絞り込みとページの切り替えのある全利用者の一覧（タスク 72.2）
 * - 49.4, 49.5, 49.8: 接続と全トークンの行の取り消し。他の利用者の接続は存在を明かさず拒む（タスク 72.2）
 * - 48.6, 50.1〜50.4, 51.9: 利用者単位の失効、権限の喪失、再利用の処理（タスク 72.3）
 *
 * Design: Requirements 46-51 > ExternalAppConnectionService
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { validateEnv } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import type { ConnectionAuditEvent, ExternalAppScope } from '../../oauth/oauth.types.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  CONNECTION_LIST_MAX_LIMIT,
  CONNECTION_LIST_MAX_OFFSET,
  CONNECTION_TOUCH_INTERVAL_MS,
  ConnectionRevocationConflictError,
  ExternalAppConnectionService,
} from '../../services/external-app-connection.service.js';
import type { AnomalyObservation } from '../../services/security-anomaly-monitor.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-oauth721-connection';
const CLIENT_ID = `${MARK}-client`;
const APP_NAME = 'テストのアプリ';
const CONSENTED_AT = new Date('2026-06-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET_RECORD_ID = 'AccessToken:hmac-value-must-not-appear';
const LOCK_WAIT_DEADLINE_MS = 4000;

function at(base: Date, offsetMs: number): Date {
  return new Date(base.getTime() + offsetMs);
}

describe('ExternalAppConnectionService（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: ExternalAppConnectionService;
  let userId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { actorId: { in: ids } },
        { targetId: { in: ids } },
        { targetType: 'ExternalAppGrant', targetId: 'unknown' },
      ],
    });
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { contains: MARK } } });
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  function newGrantId(): string {
    return `${MARK}-grant-${randomUUID()}`;
  }

  async function addTokenRow(grantId: string, kind = 'AccessToken'): Promise<string> {
    const id = `${kind}:${MARK}-${randomUUID()}`;
    await prisma.oAuthStoreRecord.create({ data: { id, kind, grantId, payload: {} } });
    return id;
  }

  async function createConnection(
    overrides: {
      userId?: string;
      clientId?: string;
      grantId?: string;
      scopes?: ExternalAppScope[];
      consentedAt?: Date;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ) {
    const grantId = overrides.grantId ?? newGrantId();
    const targetUserId = overrides.userId ?? userId;
    const { externalAppRevocationGeneration } = await prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: { externalAppRevocationGeneration: true },
    });
    const view = await prisma.$transaction((tx) =>
      service.createOrReplace(
        {
          userId: targetUserId,
          expectedRevocationGeneration: externalAppRevocationGeneration,
          clientId: overrides.clientId ?? CLIENT_ID,
          grantId,
          scopes: overrides.scopes ?? ['read'],
          consentedAt: overrides.consentedAt ?? CONSENTED_AT,
          source: { ipAddress: overrides.ipAddress, userAgent: overrides.userAgent },
        },
        tx
      )
    );
    return { grantId, view };
  }

  function auditLogs(action: ConnectionAuditEvent['kind']) {
    return prisma.auditLog.findMany({
      where: { action, targetId: userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** `holderPid` の接続のロックを待つ接続が現れるまで待つ。期限内に現れなければ失敗させる */
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

  /**
   * 設計どおりの保存側（Grant の行を FOR UPDATE してトークンを挿入）のコミット前に `run` を始め、
   * `run` がその行のロックを待つのを確かめてからコミットする
   */
  async function raceWithTokenInsert<T>(
    grantId: string,
    tokenId: string,
    run: () => Promise<T>
  ): Promise<T> {
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
          WHERE "grant_id" = ${grantId} AND "kind" = 'Grant' FOR UPDATE`;
        await tx.oAuthStoreRecord.create({
          data: { id: tokenId, kind: 'AccessToken', grantId, payload: {} },
        });
        inserted(rows[0]?.pid as number);
        await gate;
      },
      { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
    );
    const pid = await Promise.race([
      holderPid,
      holder.then(() => {
        throw new Error('保存側のトランザクションが先に終わりました');
      }),
    ]);

    const running = run();
    let waitError: unknown = null;
    try {
      await waitUntilBlockedBy(pid);
    } catch (error) {
      waitError = error;
    }
    release();
    await holder;
    const result = await running;
    if (waitError !== null) {
      throw waitError;
    }
    return result;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
  });

  beforeEach(async () => {
    const user = await createTestUser(prisma, {
      email: `${MARK}-${randomUUID()}@example.com`,
      displayName: 'Connection User',
      passwordHash: 'x',
    });
    userId = user.id;
    service = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry: {
        loadAllowedClients: () => [
          {
            clientId: CLIENT_ID,
            clientSecret: 'unused',
            displayName: APP_NAME,
            redirectUris: ['https://example.com/callback'],
            tokenEndpointAuthMethod: 'client_secret_post',
          },
        ],
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createOrReplace', () => {
    it('初回の同意で 90 日の期限を保存し、表示は未使用の 30 日とし、置き換えの監査を残さない', async () => {
      const { grantId, view } = await createConnection({ scopes: ['read', 'write'] });

      expect(view).toEqual({
        id: expect.any(String),
        appName: APP_NAME,
        scopes: ['read', 'write'],
        consentedAt: CONSENTED_AT.toISOString(),
        lastUsedAt: null,
        expiresAt: at(CONSENTED_AT, 30 * DAY_MS).toISOString(),
      });
      const row = await prisma.externalAppConnection.findUniqueOrThrow({ where: { grantId } });
      expect(row.expiresAt).toEqual(at(CONSENTED_AT, 90 * DAY_MS));
      expect(await auditLogs('CONNECTION_REPLACED')).toHaveLength(0);
    });

    it('再度の同意で接続を置き換え、前の Grant の行だけを消し、監査を残す（47.8・51.7）', async () => {
      const first = await createConnection();
      const oldToken = await addTokenRow(first.grantId);
      const oldRefresh = await addTokenRow(first.grantId, 'RefreshToken');
      const newGrantIdValue = newGrantId();
      const newToken = await addTokenRow(newGrantIdValue);
      const replacedAt = at(CONSENTED_AT, DAY_MS);

      const second = await createConnection({
        grantId: newGrantIdValue,
        scopes: ['read', 'write'],
        consentedAt: replacedAt,
        ipAddress: '203.0.113.10',
        userAgent: 'consent-agent',
      });

      const rows = await prisma.externalAppConnection.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.grantId).toBe(newGrantIdValue);
      expect(rows[0]?.id).not.toBe(first.view.id);
      expect(rows[0]?.lastUsedAt).toBeNull();
      expect(rows[0]?.expiresAt).toEqual(at(replacedAt, 90 * DAY_MS));
      expect(second.view.id).toBe(rows[0]?.id);

      const remaining = await prisma.oAuthStoreRecord.findMany({
        where: { id: { in: [oldToken, oldRefresh, newToken] } },
        select: { id: true },
      });
      expect(remaining.map((row) => row.id)).toEqual([newToken]);

      const logs = await auditLogs('CONNECTION_REPLACED');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorId).toBe(userId);
      expect(logs[0]?.targetType).toBe('User');
      expect(logs[0]?.targetId).toBe(userId);
      expect(logs[0]?.metadata).toEqual({
        clientId: CLIENT_ID,
        scopes: ['read', 'write'],
        reason: 'REPLACED',
        occurredAt: replacedAt.toISOString(),
        ipAddress: '203.0.113.10',
        userAgent: 'consent-agent',
      });
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(first.grantId);
      expect(serialized).not.toContain(oldToken);
    });

    it('呼び出し元のトランザクションを戻すと、置き換えも行の消去も監査も戻る', async () => {
      const first = await createConnection();
      const oldToken = await addTokenRow(first.grantId);

      await expect(
        prisma.$transaction(async (tx) => {
          await service.createOrReplace(
            {
              userId,
              clientId: CLIENT_ID,
              grantId: newGrantId(),
              scopes: ['read'],
              expectedRevocationGeneration: 0,
              consentedAt: at(CONSENTED_AT, DAY_MS),
            },
            tx
          );
          throw new Error('rollback');
        })
      ).rejects.toThrow('rollback');

      const row = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { userId_clientId: { userId, clientId: CLIENT_ID } },
      });
      expect(row.grantId).toBe(first.grantId);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: oldToken } })).toBe(1);
      expect(await auditLogs('CONNECTION_REPLACED')).toHaveLength(0);
    });

    it('同じ Grant の再利用は拒み、その Grant の行を消さない', async () => {
      const first = await createConnection();
      const token = await addTokenRow(first.grantId);

      await expect(createConnection({ grantId: first.grantId })).rejects.toThrow();

      expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(1);
      expect(await prisma.externalAppConnection.count({ where: { grantId: first.grantId } })).toBe(
        1
      );
    });

    it('同時の置き換えでも接続は 1 件で、負けた側のトークンの行も残らない', async () => {
      const first = await createConnection();
      const oldToken = await addTokenRow(first.grantId);
      const grants = Array.from({ length: 6 }, () => newGrantId());
      const tokens = await Promise.all(grants.map((grantId) => addTokenRow(grantId)));

      await Promise.all(grants.map((grantId) => createConnection({ grantId })));

      const rows = await prisma.externalAppConnection.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      const winner = rows[0]?.grantId as string;
      expect(grants).toContain(winner);
      const remaining = await prisma.oAuthStoreRecord.findMany({
        where: { id: { in: [oldToken, ...tokens] } },
        select: { grantId: true },
      });
      expect(remaining.map((row) => row.grantId)).toEqual([winner]);
      expect(await auditLogs('CONNECTION_REPLACED')).toHaveLength(grants.length);
    });
  });

  describe('assertActive', () => {
    it('期限の定数は 30 日・90 日・1 分である', () => {
      expect(CONNECTION_IDLE_MS).toBe(30 * DAY_MS);
      expect(CONNECTION_ABSOLUTE_MS).toBe(90 * DAY_MS);
      expect(CONNECTION_TOUCH_INTERVAL_MS).toBe(60_000);
    });

    it('存在しない Grant は NOT_ACTIVE で、監査を残さない', async () => {
      const result = await service.assertActive(newGrantId(), CONSENTED_AT);

      expect(result).toEqual({ ok: false, error: 'NOT_ACTIVE' });
      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
    });

    it('未使用の接続は同意から 30 日の 1 ミリ秒前まで有効である（48.2）', async () => {
      const { grantId, view } = await createConnection({ scopes: ['read', 'write'] });

      const result = await service.assertActive(grantId, at(CONSENTED_AT, 30 * DAY_MS - 1));

      expect(result).toEqual({
        ok: true,
        value: {
          id: view.id,
          userId,
          clientId: CLIENT_ID,
          grantId,
          scopes: ['read', 'write'],
        },
      });
      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
    });

    it('未使用の接続は同意からちょうど 30 日で終了する（48.2）', async () => {
      const { grantId } = await createConnection();
      const token = await addTokenRow(grantId);
      const now = at(CONSENTED_AT, 30 * DAY_MS);

      const result = await service.assertActive(grantId, now, {
        ipAddress: '198.51.100.7',
        userAgent: 'mcp-client',
      });

      expect(result).toEqual({ ok: false, error: 'NOT_ACTIVE' });
      expect(await prisma.externalAppConnection.count({ where: { grantId } })).toBe(0);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(0);
      const logs = await auditLogs('CONNECTION_ENDED');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorId).toBeNull();
      expect(logs[0]?.targetId).toBe(userId);
      expect(logs[0]?.metadata).toEqual({
        clientId: CLIENT_ID,
        scopes: ['read'],
        reason: 'IDLE_EXPIRED',
        occurredAt: now.toISOString(),
        ipAddress: '198.51.100.7',
        userAgent: 'mcp-client',
      });
      expect(JSON.stringify(logs)).not.toContain(grantId);
    });

    it('使用済みの接続は最後の利用から測る（30 日の前後）', async () => {
      const { grantId } = await createConnection();
      const lastUsedAt = at(CONSENTED_AT, 10 * DAY_MS);
      await prisma.externalAppConnection.update({ where: { grantId }, data: { lastUsedAt } });

      const before = await service.assertActive(grantId, at(lastUsedAt, 30 * DAY_MS - 1));
      expect(before.ok).toBe(true);

      const atBoundary = await service.assertActive(grantId, at(lastUsedAt, 30 * DAY_MS));
      expect(atBoundary).toEqual({ ok: false, error: 'NOT_ACTIVE' });
      const logs = await auditLogs('CONNECTION_ENDED');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.metadata).toMatchObject({ reason: 'IDLE_EXPIRED' });
    });

    it('使い続けても同意から 90 日の 1 ミリ秒前までで、ちょうど 90 日で終了する（48.3）', async () => {
      const { grantId } = await createConnection();
      const absolute = at(CONSENTED_AT, 90 * DAY_MS);
      await prisma.externalAppConnection.update({
        where: { grantId },
        data: { lastUsedAt: at(absolute, -DAY_MS) },
      });

      expect((await service.assertActive(grantId, at(absolute, -1))).ok).toBe(true);
      expect(await service.assertActive(grantId, absolute)).toEqual({
        ok: false,
        error: 'NOT_ACTIVE',
      });

      const logs = await auditLogs('CONNECTION_ENDED');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.metadata).toMatchObject({ reason: 'ABSOLUTE_EXPIRED' });
    });

    it('両方の期限を過ぎたら理由は ABSOLUTE_EXPIRED とする', async () => {
      const { grantId } = await createConnection();

      await service.assertActive(grantId, at(CONSENTED_AT, 120 * DAY_MS));

      const logs = await auditLogs('CONNECTION_ENDED');
      expect(logs[0]?.metadata).toMatchObject({ reason: 'ABSOLUTE_EXPIRED' });
    });

    it('送信元が無い定期処理では IP とユーザーエージェントを null で記録する', async () => {
      const { grantId } = await createConnection();

      await service.assertActive(grantId, at(CONSENTED_AT, 30 * DAY_MS));

      const logs = await auditLogs('CONNECTION_ENDED');
      expect(logs[0]?.metadata).toMatchObject({ ipAddress: null, userAgent: null });
    });

    it('同時の判定でも監査は 1 件で、全員が NOT_ACTIVE を受ける', async () => {
      const { grantId } = await createConnection();
      await addTokenRow(grantId);
      const now = at(CONSENTED_AT, 30 * DAY_MS);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => service.assertActive(grantId, now))
      );

      expect(results.every((result) => !result.ok)).toBe(true);
      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(1);
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
    });

    it('監査の失敗では接続もトークンの行も消えない', async () => {
      const { grantId } = await createConnection();
      const token = await addTokenRow(grantId);
      const auditLogService = new AuditLogService({ prisma });
      vi.spyOn(auditLogService, 'createLog').mockRejectedValue(new Error('audit failed'));
      const failing = new ExternalAppConnectionService({
        prisma,
        auditLogService,
        clientRegistry: { loadAllowedClients: () => [] },
      });

      await expect(failing.assertActive(grantId, at(CONSENTED_AT, 30 * DAY_MS))).rejects.toThrow(
        'audit failed'
      );

      expect(await prisma.externalAppConnection.count({ where: { grantId } })).toBe(1);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(1);
    });

    it('判定の読み取りの後に利用が記録されたら、接続を終了せず有効を返す', async () => {
      const { grantId, view } = await createConnection();
      const token = await addTokenRow(grantId);
      const now = at(CONSENTED_AT, 30 * DAY_MS);
      const original = prisma.externalAppConnection.findUnique.bind(prisma.externalAppConnection);
      let raced = false;
      const spy = vi.spyOn(prisma.externalAppConnection, 'findUnique').mockImplementation(((
        args: Parameters<typeof original>[0]
      ) => {
        const read = original(args);
        if (raced) {
          return read;
        }
        raced = true;
        return read.then(async (row) => {
          await prisma.externalAppConnection.update({
            where: { id: view.id },
            data: { lastUsedAt: at(now, -1000) },
          });
          return row;
        });
      }) as never);

      const result = await service.assertActive(grantId, now);
      spy.mockRestore();

      expect(result.ok).toBe(true);
      expect(await prisma.externalAppConnection.count({ where: { grantId } })).toBe(1);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(1);
      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
    });

    it('監査を書いた直後の失敗では、監査・接続・トークンの行がすべて戻る', async () => {
      const { grantId } = await createConnection();
      const token = await addTokenRow(grantId);
      const realAudit = new AuditLogService({ prisma });
      const failing = new ExternalAppConnectionService({
        prisma,
        auditLogService: {
          createLog: async (input, tx) => {
            await realAudit.createLog(input, tx);
            throw new Error('audit written then failed');
          },
        },
        clientRegistry: { loadAllowedClients: () => [] },
      });

      await expect(failing.assertActive(grantId, at(CONSENTED_AT, 30 * DAY_MS))).rejects.toThrow(
        'audit written then failed'
      );

      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
      expect(await prisma.externalAppConnection.count({ where: { grantId } })).toBe(1);
      expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(1);
    });

    it('Grant の行をロックして挿入中のトークンも、期限切れの終了の後に残らない', async () => {
      const { grantId } = await createConnection();
      await addTokenRow(grantId, 'Grant');
      const racedToken = `AccessToken:${MARK}-${randomUUID()}`;

      const result = await raceWithTokenInsert(grantId, racedToken, () =>
        service.assertActive(grantId, at(CONSENTED_AT, 30 * DAY_MS))
      );

      expect(result).toEqual({ ok: false, error: 'NOT_ACTIVE' });
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(1);
    });
  });

  describe('置き換えと他の処理の競合', () => {
    it('Grant の行をロックして挿入中のトークンも、置き換えの後に残らない', async () => {
      const first = await createConnection();
      await addTokenRow(first.grantId, 'Grant');
      const racedToken = `AccessToken:${MARK}-${randomUUID()}`;
      const nextGrantId = newGrantId();

      await raceWithTokenInsert(first.grantId, racedToken, () =>
        createConnection({ grantId: nextGrantId, consentedAt: at(CONSENTED_AT, DAY_MS) })
      );

      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: first.grantId } })).toBe(0);
      const rows = await prisma.externalAppConnection.findMany({ where: { userId } });
      expect(rows.map((row) => row.grantId)).toEqual([nextGrantId]);
      expect(await auditLogs('CONNECTION_REPLACED')).toHaveLength(1);
    });

    it('読み取りの後に期限切れの終了が先に勝つと、置き換えの監査を残さない', async () => {
      const first = await createConnection();
      await addTokenRow(first.grantId, 'Grant');
      const nextGrantId = newGrantId();
      const now = at(CONSENTED_AT, 30 * DAY_MS);

      await prisma.$transaction(async (tx) => {
        // 置き換えの読み取りの直後に、別のトランザクションで期限切れの終了を完了させる
        const findAfterExpiry = async (
          args: Parameters<typeof tx.externalAppConnection.findUnique>[0]
        ) => {
          const row = await tx.externalAppConnection.findUnique(args);
          await service.assertActive(first.grantId, now);
          return row;
        };
        const hookedDelegate = new Proxy(tx.externalAppConnection, {
          get(delegate, prop) {
            if (prop === 'findUnique') {
              return findAfterExpiry;
            }
            const value = Reflect.get(delegate, prop);
            return typeof value === 'function' ? value.bind(delegate) : value;
          },
        });
        const hookedTx = new Proxy(tx, {
          get(client, prop) {
            if (prop === 'externalAppConnection') {
              return hookedDelegate;
            }
            const value = Reflect.get(client, prop);
            return typeof value === 'function' ? value.bind(client) : value;
          },
        });
        await service.createOrReplace(
          {
            userId,
            clientId: CLIENT_ID,
            grantId: nextGrantId,
            scopes: ['read'],
            expectedRevocationGeneration: 0,
            consentedAt: now,
          },
          hookedTx
        );
      });

      expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(1);
      expect(await auditLogs('CONNECTION_REPLACED')).toHaveLength(0);
      const rows = await prisma.externalAppConnection.findMany({ where: { userId } });
      expect(rows.map((row) => row.grantId)).toEqual([nextGrantId]);
      expect(await prisma.oAuthStoreRecord.count({ where: { grantId: first.grantId } })).toBe(0);
    });
  });

  describe('touch', () => {
    async function lastUsedAt(connectionId: string): Promise<Date | null> {
      const row = await prisma.externalAppConnection.findUniqueOrThrow({
        where: { id: connectionId },
      });
      return row.lastUsedAt;
    }

    it('初回の利用を記録し、最終ログインを更新しない（48.10）', async () => {
      const { view } = await createConnection();
      const lastLoginAt = new Date('2026-05-01T00:00:00.000Z');
      await prisma.user.update({ where: { id: userId }, data: { lastLoginAt } });
      const now = at(CONSENTED_AT, DAY_MS);

      await service.touch(view.id, now);

      expect(await lastUsedAt(view.id)).toEqual(now);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.lastLoginAt).toEqual(lastLoginAt);
    });

    it('1 分未満では更新せず、ちょうど 1 分で更新する', async () => {
      const { view } = await createConnection();
      const first = at(CONSENTED_AT, DAY_MS);
      await service.touch(view.id, first);

      await service.touch(view.id, at(first, 59_999));
      expect(await lastUsedAt(view.id)).toEqual(first);

      await service.touch(view.id, at(first, 60_000));
      expect(await lastUsedAt(view.id)).toEqual(at(first, 60_000));
    });

    it('同時の呼び出しでも更新は 1 回だけである', async () => {
      const { view } = await createConnection();
      const first = at(CONSENTED_AT, DAY_MS);
      await service.touch(view.id, first);
      const candidates = Array.from({ length: 8 }, (_, index) => at(first, 60_000 + index));
      const updateMany = vi.spyOn(prisma.externalAppConnection, 'updateMany');

      await Promise.all(candidates.map((now) => service.touch(view.id, now)));

      const results = await Promise.all(updateMany.mock.results.map((result) => result.value));
      expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
      const stored = await lastUsedAt(view.id);
      expect(candidates.map((value) => value.getTime())).toContain(stored?.getTime());
    });

    it('過去の時刻では最後の利用を巻き戻さない', async () => {
      const { view } = await createConnection();
      const first = at(CONSENTED_AT, DAY_MS);
      await service.touch(view.id, first);

      await service.touch(view.id, at(first, -5 * 60_000));

      expect(await lastUsedAt(view.id)).toEqual(first);
    });

    it('未使用の期限を過ぎた接続を利用の記録で生き返らせない', async () => {
      const { grantId, view } = await createConnection();
      const now = at(CONSENTED_AT, 30 * DAY_MS);

      await service.touch(view.id, now);

      expect(await lastUsedAt(view.id)).toBeNull();
      expect((await service.assertActive(grantId, now)).ok).toBe(false);
    });

    it('使用済みで未使用の期限を過ぎた接続も生き返らせない', async () => {
      const { grantId, view } = await createConnection();
      const used = at(CONSENTED_AT, DAY_MS);
      await service.touch(view.id, used);
      const now = at(used, 30 * DAY_MS);

      await service.touch(view.id, now);

      expect(await lastUsedAt(view.id)).toEqual(used);
      expect((await service.assertActive(grantId, now)).ok).toBe(false);
    });

    it('同意から 90 日を過ぎた接続には記録しない', async () => {
      const { view } = await createConnection();
      const used = at(CONSENTED_AT, 89 * DAY_MS);
      await prisma.externalAppConnection.update({
        where: { id: view.id },
        data: { lastUsedAt: used },
      });

      await service.touch(view.id, at(CONSENTED_AT, 90 * DAY_MS));

      expect(await lastUsedAt(view.id)).toEqual(used);
    });

    it('同意より前の時刻は初回の利用として記録しない', async () => {
      const { view } = await createConnection();

      await service.touch(view.id, at(CONSENTED_AT, -1));
      expect(await lastUsedAt(view.id)).toBeNull();

      await service.touch(view.id, CONSENTED_AT);
      expect(await lastUsedAt(view.id)).toEqual(CONSENTED_AT);
    });

    it('存在しない接続では何もしない', async () => {
      await expect(service.touch(randomUUID(), CONSENTED_AT)).resolves.toBeUndefined();
    });
  });

  describe('recordEvent', () => {
    it('出来事を監査の形へ写し、渡されたトランザクションで記録する', async () => {
      const occurredAt = at(CONSENTED_AT, DAY_MS);
      const event: ConnectionAuditEvent = {
        kind: 'CONSENT_DENIED',
        actorUserId: userId,
        targetUserId: userId,
        clientId: CLIENT_ID,
        scopes: ['read'],
        reason: null,
        occurredAt,
        ipAddress: '192.0.2.1',
        userAgent: 'browser',
      };

      await expect(
        prisma.$transaction(async (tx) => {
          await service.recordEvent(event, tx);
          throw new Error('rollback');
        })
      ).rejects.toThrow('rollback');
      expect(await auditLogs('CONSENT_DENIED')).toHaveLength(0);

      await service.recordEvent(event);
      const logs = await auditLogs('CONSENT_DENIED');
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorId).toBe(userId);
      expect(logs[0]?.metadata).toEqual({
        clientId: CLIENT_ID,
        scopes: ['read'],
        reason: null,
        occurredAt: occurredAt.toISOString(),
        ipAddress: '192.0.2.1',
        userAgent: 'browser',
      });
    });

    it('長いユーザーエージェントは監査の上限で切り、切ったことを残す', async () => {
      await service.recordEvent({
        kind: 'CONSENT_GRANTED',
        actorUserId: userId,
        targetUserId: userId,
        clientId: CLIENT_ID,
        scopes: ['read'],
        reason: null,
        occurredAt: CONSENTED_AT,
        ipAddress: null,
        userAgent: 'a'.repeat(5000),
      });

      const logs = await auditLogs('CONSENT_GRANTED');
      const metadata = logs[0]?.metadata as { userAgent: string; userAgentTruncated: boolean };
      expect(metadata.userAgent.length).toBeLessThan(5000);
      expect(metadata.userAgentTruncated).toBe(true);
    });
  });

  describe('一覧と取り消し（タスク 72.2）', () => {
    const SOURCE = { ipAddress: '198.51.100.7', userAgent: 'revoke-browser' };

    async function newUser(displayName: string) {
      const user = await createTestUser(prisma, {
        email: `${MARK}-${randomUUID()}@example.com`,
        displayName,
        passwordHash: 'x',
      });
      return { id: user.id, email: user.email, displayName };
    }

    function endedLogsFor(targetId: string) {
      return prisma.auditLog.findMany({ where: { action: 'CONNECTION_ENDED', targetId } });
    }

    function failingAuditService(): ExternalAppConnectionService {
      const realAudit = new AuditLogService({ prisma });
      return new ExternalAppConnectionService({
        prisma,
        auditLogService: {
          createLog: async (input, tx) => {
            await realAudit.createLog(input, tx);
            throw new Error('audit written then failed');
          },
        },
        clientRegistry: { loadAllowedClients: () => [] },
      });
    }

    describe('listOwn', () => {
      it('本人の接続だけを同意の新しい順に返し、Grant とトークンを含めない（49.1）', async () => {
        const other = await newUser('Other');
        const older = await createConnection({ scopes: ['read', 'write'] });
        const newer = await createConnection({
          clientId: `${MARK}-unlisted-a`,
          consentedAt: at(CONSENTED_AT, DAY_MS),
        });
        await createConnection({ userId: other.id });
        await addTokenRow(older.grantId);

        const list = await service.listOwn(userId);

        expect(list.map((item) => item.id)).toEqual([newer.view.id, older.view.id]);
        expect(list[1]).toEqual({
          id: older.view.id,
          appName: APP_NAME,
          scopes: ['read', 'write'],
          consentedAt: CONSENTED_AT.toISOString(),
          lastUsedAt: null,
          expiresAt: at(CONSENTED_AT, 30 * DAY_MS).toISOString(),
        });
        expect(JSON.stringify(list)).not.toContain(older.grantId);
      });

      it('接続が無ければ空を返す', async () => {
        await expect(service.listOwn(userId)).resolves.toEqual([]);
      });

      it('許可の一覧から外れたアプリの接続はクライアント ID を名称として返す', async () => {
        const clientId = `${MARK}-removed-client`;
        await createConnection({ clientId });

        const list = await service.listOwn(userId);

        expect(list[0]?.appName).toBe(clientId);
      });
    });

    describe('一覧の期限（49.1、49.6、48.2、48.3）', () => {
      it.each([
        {
          name: '未使用なら同意から 30 日',
          lastUsedOffset: null,
          expectedOffset: 30 * DAY_MS,
        },
        {
          name: '利用があれば最後の利用から 30 日',
          lastUsedOffset: 10 * DAY_MS,
          expectedOffset: 40 * DAY_MS,
        },
        {
          name: '最後の利用から 30 日より同意から 90 日が先なら同意から 90 日',
          lastUsedOffset: 70 * DAY_MS,
          expectedOffset: 90 * DAY_MS,
        },
      ])('$name を本人と管理者の一覧に返し、その時刻に終了する', async (testCase) => {
        const { grantId, view } = await createConnection();
        if (testCase.lastUsedOffset !== null) {
          await prisma.externalAppConnection.update({
            where: { id: view.id },
            data: { lastUsedAt: at(CONSENTED_AT, testCase.lastUsedOffset) },
          });
        }
        const expected = at(CONSENTED_AT, testCase.expectedOffset);

        const own = await service.listOwn(userId);
        const all = await service.listAll({ userId, page: 1, limit: 10 });

        expect(own[0]?.expiresAt).toBe(expected.toISOString());
        expect(all.data[0]?.expiresAt).toBe(expected.toISOString());
        const row = await prisma.externalAppConnection.findUniqueOrThrow({ where: { grantId } });
        expect(row.expiresAt).toEqual(at(CONSENTED_AT, 90 * DAY_MS));
        expect((await service.assertActive(grantId, at(expected, -1))).ok).toBe(true);
        expect((await service.assertActive(grantId, expected)).ok).toBe(false);
      });
    });

    describe('listAll', () => {
      it('利用者の情報を付けて全利用者の接続を返し、秘密の値を含めない（49.6）', async () => {
        const other = await newUser('Other User');
        const own = await createConnection();
        const others = await createConnection({ userId: other.id, scopes: ['read', 'write'] });
        await addTokenRow(others.grantId);

        const page = await service.listAll({ page: 1, limit: CONNECTION_LIST_MAX_LIMIT });

        const ids = page.data.map((item) => item.id);
        expect(ids).toEqual(expect.arrayContaining([own.view.id, others.view.id]));
        expect(page.data.find((item) => item.id === others.view.id)).toEqual({
          ...others.view,
          clientId: CLIENT_ID,
          user: { id: other.id, displayName: 'Other User', email: other.email },
        });
        const serialized = JSON.stringify(page);
        expect(serialized).not.toContain(others.grantId);
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain('clientSecret');
      });

      it('利用者とアプリで絞り込む（49.7）', async () => {
        const other = await newUser('Other');
        const clientB = `${MARK}-client-b`;
        const a = await createConnection();
        const b = await createConnection({ clientId: clientB });
        const c = await createConnection({ userId: other.id, clientId: clientB });

        const byUser = await service.listAll({ userId, page: 1, limit: 10 });
        const byClient = await service.listAll({ clientId: clientB, page: 1, limit: 10 });
        const byBoth = await service.listAll({ userId, clientId: clientB, page: 1, limit: 10 });

        expect(byUser.data.map((item) => item.id).sort()).toEqual([a.view.id, b.view.id].sort());
        expect(byClient.data.map((item) => item.id).sort()).toEqual([b.view.id, c.view.id].sort());
        expect(byBoth.data.map((item) => item.id)).toEqual([b.view.id]);
        expect(byBoth.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
      });

      it('同意の日時が同じ行も ID の順で並び、ページの間で欠けも重複もしない（49.7）', async () => {
        const created: string[] = [];
        for (let index = 0; index < 5; index += 1) {
          const { view } = await createConnection({ clientId: `${MARK}-page-${index}` });
          created.push(view.id);
        }

        const pages = [];
        for (const pageNumber of [1, 2, 3]) {
          pages.push(await service.listAll({ userId, page: pageNumber, limit: 2 }));
        }

        expect(pages.map((page) => page.data.length)).toEqual([2, 2, 1]);
        expect(pages.flatMap((page) => page.data.map((item) => item.id))).toEqual(
          [...created].sort()
        );
        expect(pages[1]?.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
      });

      it('最後のページより後は空の一覧と総数を返す', async () => {
        await createConnection();

        const page = await service.listAll({ userId, page: 9, limit: 10 });

        expect(page.data).toEqual([]);
        expect(page.pagination).toEqual({ page: 9, limit: 10, total: 1, totalPages: 1 });
      });

      it.each([
        { page: 0, limit: 10 },
        { page: -1, limit: 10 },
        { page: 1.5, limit: 10 },
        { page: Number.NaN, limit: 10 },
        { page: 1, limit: 0 },
        { page: 1, limit: 2.5 },
        { page: 1, limit: CONNECTION_LIST_MAX_LIMIT + 1 },
        { page: CONNECTION_LIST_MAX_OFFSET + 2, limit: 1 },
      ])('範囲外のページと件数 $page / $limit を拒む', async (bounds) => {
        await expect(service.listAll({ userId, ...bounds })).rejects.toThrow(RangeError);
      });

      it('上限ちょうどの件数とオフセットは受け付ける', async () => {
        await expect(
          service.listAll({ userId, page: 1, limit: CONNECTION_LIST_MAX_LIMIT })
        ).resolves.toMatchObject({ data: [] });
        await expect(
          service.listAll({ userId, page: CONNECTION_LIST_MAX_OFFSET + 1, limit: 1 })
        ).resolves.toMatchObject({ data: [] });
      });
    });

    describe('revokeOwn', () => {
      it('接続と全トークンの行を消し、取り消しを監査に残す（49.4、51.7）', async () => {
        const { grantId, view } = await createConnection({ scopes: ['read', 'write'] });
        const access = await addTokenRow(grantId);
        const refresh = await addTokenRow(grantId, 'RefreshToken');
        const unrelated = await createConnection({ clientId: `${MARK}-unrelated` });
        const unrelatedToken = await addTokenRow(unrelated.grantId);

        const result = await service.revokeOwn(userId, view.id, { userId, source: SOURCE });

        expect(result).toEqual({ ok: true, value: undefined });
        expect(await prisma.externalAppConnection.count({ where: { id: view.id } })).toBe(0);
        expect(
          await prisma.oAuthStoreRecord.count({ where: { id: { in: [access, refresh] } } })
        ).toBe(0);
        expect(await prisma.oAuthStoreRecord.count({ where: { id: unrelatedToken } })).toBe(1);
        const logs = await endedLogsFor(userId);
        expect(logs).toHaveLength(1);
        expect(logs[0]?.actorId).toBe(userId);
        expect(logs[0]?.targetId).toBe(userId);
        expect(logs[0]?.metadata).toEqual({
          clientId: CLIENT_ID,
          scopes: ['read', 'write'],
          reason: 'USER_REVOKED',
          occurredAt: expect.any(String),
          ipAddress: SOURCE.ipAddress,
          userAgent: SOURCE.userAgent,
        });
        const serialized = JSON.stringify(logs);
        expect(serialized).not.toContain(grantId);
        expect(serialized).not.toContain(access);
      });

      it('他の利用者の接続は存在しない ID と同じ結果で拒み、何も変えない（49.5）', async () => {
        const other = await newUser('Other');
        const { grantId, view } = await createConnection({ userId: other.id });
        const token = await addTokenRow(grantId);

        const foreign = await service.revokeOwn(userId, view.id, { userId, source: SOURCE });
        const missing = await service.revokeOwn(userId, randomUUID(), { userId, source: SOURCE });
        const malformed = await service.revokeOwn(userId, 'not-a-uuid', { userId, source: SOURCE });

        expect(foreign).toEqual({ ok: false, error: 'NOT_FOUND' });
        expect(missing).toEqual(foreign);
        expect(malformed).toEqual(foreign);
        expect(await prisma.externalAppConnection.count({ where: { id: view.id } })).toBe(1);
        expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(1);
        expect(await endedLogsFor(other.id)).toHaveLength(0);
        expect(await endedLogsFor(userId)).toHaveLength(0);
      });

      it('監査を書いた直後の失敗では、接続・トークンの行・監査がすべて戻る', async () => {
        const { grantId, view } = await createConnection();
        const token = await addTokenRow(grantId);

        await expect(
          failingAuditService().revokeOwn(userId, view.id, { userId, source: SOURCE })
        ).rejects.toThrow('audit written then failed');

        expect(await prisma.externalAppConnection.count({ where: { id: view.id } })).toBe(1);
        expect(await prisma.oAuthStoreRecord.count({ where: { id: token } })).toBe(1);
        expect(await endedLogsFor(userId)).toHaveLength(0);
      });

      it('同時の取り消しは 1 件だけが成功し、監査も 1 件になる', async () => {
        const { grantId, view } = await createConnection();
        await prisma.oAuthStoreRecord.create({
          data: { id: `Grant:${MARK}-${randomUUID()}`, kind: 'Grant', grantId, payload: {} },
        });
        await addTokenRow(grantId);

        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            service.revokeOwn(userId, view.id, { userId, source: SOURCE })
          )
        );

        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => !result.ok)).toEqual(
          Array.from({ length: 4 }, () => ({ ok: false, error: 'NOT_FOUND' }))
        );
        expect(await endedLogsFor(userId)).toHaveLength(1);
        expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
      });

      it('Grant の行のロックを待った後に保存されたトークンの行も消す', async () => {
        const { grantId, view } = await createConnection();
        await prisma.oAuthStoreRecord.create({
          data: { id: `Grant:${MARK}-${randomUUID()}`, kind: 'Grant', grantId, payload: {} },
        });
        const tokenId = `AccessToken:${MARK}-${randomUUID()}`;

        const result = await raceWithTokenInsert(grantId, tokenId, () =>
          service.revokeOwn(userId, view.id, { userId, source: SOURCE })
        );

        expect(result.ok).toBe(true);
        expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
      });
    });

    describe('revokeByAdmin', () => {
      it('他の利用者の接続と全トークンの行を消し、管理者を実行者として残す（49.8、51.7）', async () => {
        const admin = await newUser('Admin');
        const { grantId, view } = await createConnection();
        await addTokenRow(grantId);

        const result = await service.revokeByAdmin(view.id, { userId: admin.id, source: SOURCE });

        expect(result).toEqual({ ok: true, value: undefined });
        expect(await prisma.externalAppConnection.count({ where: { id: view.id } })).toBe(0);
        expect(await prisma.oAuthStoreRecord.count({ where: { grantId } })).toBe(0);
        const logs = await endedLogsFor(userId);
        expect(logs).toHaveLength(1);
        expect(logs[0]?.actorId).toBe(admin.id);
        expect(logs[0]?.targetId).toBe(userId);
        expect(logs[0]?.metadata).toMatchObject({
          clientId: CLIENT_ID,
          scopes: ['read'],
          reason: 'ADMIN_REVOKED',
          ipAddress: SOURCE.ipAddress,
          userAgent: SOURCE.userAgent,
        });
        expect(JSON.stringify(logs)).not.toContain(grantId);
      });

      it('存在しない接続は NOT_FOUND を返し、監査を残さない', async () => {
        const admin = await newUser('Admin');

        const result = await service.revokeByAdmin(randomUUID(), { userId: admin.id });

        expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
        expect(
          await prisma.auditLog.count({ where: { action: 'CONNECTION_ENDED', actorId: admin.id } })
        ).toBe(0);
      });

      it('送信元が無い取り消しは監査の IP とユーザーエージェントを null にする', async () => {
        const admin = await newUser('Admin');
        const { view } = await createConnection();

        await service.revokeByAdmin(view.id, { userId: admin.id });

        const logs = await endedLogsFor(userId);
        expect(logs[0]?.metadata).toMatchObject({ ipAddress: null, userAgent: null });
      });

      it('本人と管理者の同時の取り消しでも監査は 1 件になる', async () => {
        const admin = await newUser('Admin');
        const { grantId, view } = await createConnection();
        await prisma.oAuthStoreRecord.create({
          data: { id: `Grant:${MARK}-${randomUUID()}`, kind: 'Grant', grantId, payload: {} },
        });

        const results = await Promise.all([
          service.revokeOwn(userId, view.id, { userId, source: SOURCE }),
          service.revokeByAdmin(view.id, { userId: admin.id, source: SOURCE }),
        ]);

        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(await endedLogsFor(userId)).toHaveLength(1);
      });
    });
  });

  it('監査に HMAC の ID の例を書かない（48.8）', async () => {
    const { grantId } = await createConnection();
    await prisma.oAuthStoreRecord.create({
      data: {
        id: `${SECRET_RECORD_ID}-${MARK}-${randomUUID()}`,
        kind: 'AccessToken',
        grantId,
        payload: {},
      },
    });

    await service.assertActive(grantId, at(CONSENTED_AT, 90 * DAY_MS));

    const logs = await auditLogs('CONNECTION_ENDED');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain('hmac-value');
  });

  describe('利用者単位の失効と再利用（タスク 72.3）', () => {
    const ACTOR = {
      userId: null,
      source: { ipAddress: '203.0.113.72', userAgent: 'test-agent/72.3' },
    };
    const createdPermissionIds: string[] = [];

    async function newUser(): Promise<string> {
      const user = await createTestUser(prisma, {
        email: `${MARK}-${randomUUID()}@example.com`,
        displayName: 'Other User',
        passwordHash: 'x',
      });
      return user.id;
    }

    /** 権限を持つロールを作る。無かった権限はこのテストの後に消す */
    async function addRole(permissions: readonly (readonly [string, string])[]): Promise<string> {
      const role = await prisma.role.create({
        data: { name: `${MARK}-role-${randomUUID()}`, description: MARK },
      });
      for (const [resource, action] of permissions) {
        let permission = await prisma.permission.findUnique({
          where: { resource_action: { resource, action } },
        });
        if (!permission) {
          permission = await prisma.permission.create({
            data: { resource, action, description: MARK },
          });
          createdPermissionIds.push(permission.id);
        }
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
      return role.id;
    }

    async function assignRole(targetUserId: string, roleId: string): Promise<void> {
      await prisma.userRole.create({ data: { userId: targetUserId, roleId } });
    }

    function connectionCount(targetUserId: string): Promise<number> {
      return prisma.externalAppConnection.count({ where: { userId: targetUserId } });
    }

    function storeRowCount(grantId: string): Promise<number> {
      return prisma.oAuthStoreRecord.count({ where: { grantId } });
    }

    function serviceWithObserver(observeAnomaly: (observation: AnomalyObservation) => void) {
      return new ExternalAppConnectionService({
        prisma,
        auditLogService: new AuditLogService({ prisma }),
        clientRegistry: { loadAllowedClients: () => [] },
        observeAnomaly,
      });
    }

    /** Grant の行をロックした取引の中で `body` を実行する */
    function withLockedGrant<T>(grantId: string, body: (pid: number) => Promise<T>): Promise<T> {
      return prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
          await tx.$queryRaw`
            SELECT id FROM "oauth_store_records"
            WHERE "grant_id" = ${grantId} AND "kind" = 'Grant' FOR UPDATE`;
          return body(rows[0]?.pid as number);
        },
        { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
      );
    }

    afterEach(async () => {
      await prisma.role.deleteMany({ where: { name: { contains: MARK } } });
      await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
      createdPermissionIds.length = 0;
    });

    describe('revokeAllForUser', () => {
      it('全接続と全トークンの行を消し、接続ごとに理由つきの監査を残す（50.1、51.7）', async () => {
        const first = await createConnection({ clientId: `${CLIENT_ID}-1`, scopes: ['read'] });
        const second = await createConnection({
          clientId: `${CLIENT_ID}-2`,
          scopes: ['read', 'write'],
        });
        await addTokenRow(first.grantId);
        await addTokenRow(second.grantId, 'RefreshToken');
        const otherUserId = await newUser();
        const other = await createConnection({ userId: otherUserId });
        await addTokenRow(other.grantId);

        const count = await prisma.$transaction((tx) =>
          service.revokeAllForUser(userId, 'PASSWORD_CHANGED', ACTOR, tx)
        );

        expect(count).toBe(2);
        expect(await connectionCount(userId)).toBe(0);
        expect(await storeRowCount(first.grantId)).toBe(0);
        expect(await storeRowCount(second.grantId)).toBe(0);
        expect(await connectionCount(otherUserId)).toBe(1);
        expect(await storeRowCount(other.grantId)).toBe(1);

        const logs = await auditLogs('CONNECTION_ENDED');
        expect(logs).toHaveLength(2);
        for (const log of logs) {
          expect(log.actorId).toBeNull();
          expect(log.targetId).toBe(userId);
          expect(log.metadata).toMatchObject({
            reason: 'PASSWORD_CHANGED',
            ipAddress: '203.0.113.72',
            userAgent: 'test-agent/72.3',
          });
        }
        const clients = logs.map((log) => (log.metadata as { clientId: string }).clientId).sort();
        expect(clients).toEqual([`${CLIENT_ID}-1`, `${CLIENT_ID}-2`]);
        const serialized = JSON.stringify(logs);
        expect(serialized).not.toContain(first.grantId);
        expect(serialized).not.toContain(second.grantId);
      });

      it('実行者の ID を監査に残す', async () => {
        await createConnection();

        await prisma.$transaction((tx) =>
          service.revokeAllForUser(userId, 'LOGOUT_ALL', { userId }, tx)
        );

        const logs = await auditLogs('CONNECTION_ENDED');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.actorId).toBe(userId);
      });

      it('接続が無ければ 0 を返し、監査を残さない', async () => {
        const count = await prisma.$transaction((tx) =>
          service.revokeAllForUser(userId, 'LOGOUT_ALL', ACTOR, tx)
        );

        expect(count).toBe(0);
        expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
      });

      it('呼び出し元の取引を戻すと、接続・トークンの行・監査がすべて戻る', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId);

        await expect(
          prisma.$transaction(async (tx) => {
            await service.revokeAllForUser(userId, 'ACCOUNT_DEACTIVATED', ACTOR, tx);
            throw new Error('呼び出し元の失敗');
          })
        ).rejects.toThrow('呼び出し元の失敗');

        expect(await connectionCount(userId)).toBe(1);
        expect(await storeRowCount(grantId)).toBe(1);
        expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
      });

      it('同時の一括の失効でも、接続ごとの監査は 1 件でデッドロックしない', async () => {
        for (let round = 0; round < 3; round += 1) {
          const grants: string[] = [];
          for (let index = 0; index < 6; index += 1) {
            const { grantId } = await createConnection({
              clientId: `${CLIENT_ID}-bulk-${round}-${index}`,
            });
            await addTokenRow(grantId, 'Grant');
            grants.push(grantId);
          }

          const counts = await Promise.all(
            [0, 1].map(() =>
              prisma.$transaction(
                (tx) => service.revokeAllForUser(userId, 'LOGOUT_ALL', ACTOR, tx),
                { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
              )
            )
          );

          expect(counts[0]! + counts[1]!).toBe(6);
          expect(await connectionCount(userId)).toBe(0);
          for (const grantId of grants) {
            expect(await storeRowCount(grantId)).toBe(0);
          }
        }
        expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(18);
      });

      it('複数の接続は grantId の昇順でロックする', async () => {
        const suffix = randomUUID();
        const grants = ['a', 'b', 'c'].map((key) => `${MARK}-grant-order-${key}-${suffix}`);
        // 作成の順に依存しないよう、昇順と逆に作る
        for (const [index, grantId] of [...grants].reverse().entries()) {
          await createConnection({ grantId, clientId: `${CLIENT_ID}-order-${index}` });
          await addTokenRow(grantId, 'Grant');
        }
        const [lowest, ...rest] = grants;

        const { running, lockedOthers } = await withLockedGrant(lowest as string, async (pid) => {
          const started = prisma.$transaction(
            (tx) => service.revokeAllForUser(userId, 'LOGOUT_ALL', ACTOR, tx),
            { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
          );
          await waitUntilBlockedBy(pid);
          // 最小の Grant で待っている間、他の Grant の行はロックされていない
          const free = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "oauth_store_records"
            WHERE "grant_id" = ANY(${rest}::text[]) AND "kind" = 'Grant'
            FOR UPDATE SKIP LOCKED`;
          return { running: { promise: started }, lockedOthers: rest.length - free.length };
        });

        expect(lockedOthers).toBe(0);
        expect(await running.promise).toBe(3);
      });

      it('読み取りの後に置き換えられた接続も終了する', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId, 'Grant');
        const replacementGrantId = newGrantId();

        const { running } = await prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
            await service.createOrReplace(
              {
                userId,
                clientId: CLIENT_ID,
                grantId: replacementGrantId,
                scopes: ['read'],
                expectedRevocationGeneration: 0,
                consentedAt: CONSENTED_AT,
              },
              tx
            );
            const started = prisma.$transaction(
              (inner) => service.revokeAllForUser(userId, 'PASSWORD_CHANGED', ACTOR, inner),
              { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
            );
            await waitUntilBlockedBy(rows[0]?.pid as number);
            return { running: { promise: started } };
          },
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );

        expect(await running.promise).toBe(1);
        expect(await connectionCount(userId)).toBe(0);
      });
    });

    describe('revokeForUsersWithoutPermission', () => {
      it('権限を失った利用者の接続を PERMISSION_LOST で終了する（50.4）', async () => {
        const roleId = await addRole([['project', 'read']]);
        await assignRole(userId, roleId);
        const { grantId } = await createConnection();
        await addTokenRow(grantId);

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([userId], ACTOR, tx)
        );

        expect(count).toBe(1);
        expect(await connectionCount(userId)).toBe(0);
        expect(await storeRowCount(grantId)).toBe(0);
        const logs = await auditLogs('CONNECTION_ENDED');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.metadata).toMatchObject({
          reason: 'PERMISSION_LOST',
          ipAddress: '203.0.113.72',
        });
      });

      it('ロールが 1 つも無い利用者の接続を終了する', async () => {
        await createConnection();

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([userId], ACTOR, tx)
        );

        expect(count).toBe(1);
      });

      it.each([
        ['external_app', 'connect'],
        ['external_app', '*'],
        ['*', 'connect'],
        ['*', '*'],
      ] as const)('%s:%s を持つ利用者の接続は残す', async (resource, action) => {
        const roleId = await addRole([[resource, action]]);
        await assignRole(userId, roleId);
        await createConnection();

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([userId], ACTOR, tx)
        );

        expect(count).toBe(0);
        expect(await connectionCount(userId)).toBe(1);
        expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
      });

      it.each([
        ['external_app', 'read'],
        ['project', '*'],
        ['*', 'read'],
      ] as const)('%s:%s では権限を持つと扱わない', async (resource, action) => {
        const roleId = await addRole([[resource, action]]);
        await assignRole(userId, roleId);
        await createConnection();

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([userId], ACTOR, tx)
        );

        expect(count).toBe(1);
      });

      it('別のロールで権限を持ち続ける利用者の接続は残す', async () => {
        const removed = await addRole([['external_app', 'connect']]);
        const kept = await addRole([['external_app', '*']]);
        await assignRole(userId, removed);
        await assignRole(userId, kept);
        await createConnection();

        const count = await prisma.$transaction(async (tx) => {
          await tx.userRole.deleteMany({ where: { userId, roleId: removed } });
          return service.revokeForUsersWithoutPermission([userId], ACTOR, tx);
        });

        expect(count).toBe(0);
        expect(await connectionCount(userId)).toBe(1);
      });

      it('呼び出し元の取引の変更を判定に含め、戻すと失効も戻る', async () => {
        const roleId = await addRole([['external_app', 'connect']]);
        await assignRole(userId, roleId);
        const { grantId } = await createConnection();
        await addTokenRow(grantId);

        await expect(
          prisma.$transaction(async (tx) => {
            await tx.userRole.deleteMany({ where: { userId, roleId } });
            const count = await service.revokeForUsersWithoutPermission([userId], ACTOR, tx);
            expect(count).toBe(1);
            throw new Error('呼び出し元の失敗');
          })
        ).rejects.toThrow('呼び出し元の失敗');

        expect(await connectionCount(userId)).toBe(1);
        expect(await storeRowCount(grantId)).toBe(1);
        expect(await auditLogs('CONNECTION_ENDED')).toHaveLength(0);
      });

      it('空の一覧では何も失効しない', async () => {
        await createConnection();

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([], ACTOR, tx)
        );

        expect(count).toBe(0);
        expect(await connectionCount(userId)).toBe(1);
      });

      it('一覧に無い利用者の接続は、権限が無くても残す', async () => {
        const otherUserId = await newUser();
        await createConnection();
        await createConnection({ userId: otherUserId });

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([userId], ACTOR, tx)
        );

        expect(count).toBe(1);
        expect(await connectionCount(otherUserId)).toBe(1);
      });

      it("'ALL' は権限を失った利用者だけを終了する", async () => {
        const keeperId = await newUser();
        const roleId = await addRole([['external_app', 'connect']]);
        await assignRole(keeperId, roleId);
        await createConnection();
        await createConnection({ userId: keeperId });

        const count = await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission('ALL', ACTOR, tx)
        );

        expect(count).toBeGreaterThanOrEqual(1);
        expect(await connectionCount(userId)).toBe(0);
        expect(await connectionCount(keeperId)).toBe(1);
      });

      it('同じ利用者の 2 つのロールを同時に外しても、後の判定が接続を終了する', async () => {
        const roleA = await addRole([['external_app', 'connect']]);
        const roleB = await addRole([['external_app', 'connect']]);
        await assignRole(userId, roleA);
        await assignRole(userId, roleB);
        await createConnection();

        const { later, firstCount } = await prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
            await tx.userRole.deleteMany({ where: { userId, roleId: roleA } });
            const counted = await service.revokeForUsersWithoutPermission([userId], ACTOR, tx);
            const started = prisma.$transaction(
              async (inner) => {
                await inner.userRole.deleteMany({ where: { userId, roleId: roleB } });
                return service.revokeForUsersWithoutPermission([userId], ACTOR, inner);
              },
              { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
            );
            await waitUntilBlockedBy(rows[0]?.pid as number);
            return { later: { promise: started }, firstCount: counted };
          },
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );

        expect(firstCount).toBe(0);
        expect(await later.promise).toBe(1);
        expect(await connectionCount(userId)).toBe(0);
      });
    });

    describe('失効の世代（50.1〜50.4）', () => {
      function generationOf(targetUserId: string): Promise<number> {
        return prisma.user
          .findUniqueOrThrow({
            where: { id: targetUserId },
            select: { externalAppRevocationGeneration: true },
          })
          .then((row) => row.externalAppRevocationGeneration);
      }

      function consentInput(grantId: string, expectedRevocationGeneration: number) {
        return {
          userId,
          clientId: CLIENT_ID,
          grantId,
          scopes: ['read'] as ExternalAppScope[],
          consentedAt: CONSENTED_AT,
          expectedRevocationGeneration,
        };
      }

      function runConsent(grantId: string, expected: number) {
        return prisma.$transaction(
          (tx) => service.createOrReplace(consentInput(grantId, expected), tx),
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );
      }

      function runRevokeAll() {
        return prisma.$transaction(
          (tx) => service.revokeAllForUser(userId, 'PASSWORD_CHANGED', ACTOR, tx),
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );
      }

      /** 取引の中で本体を実行する。本体は待ち合わせる相手の pid として自身の pid を受け取る */
      function holdTransaction<T>(
        body: (tx: Prisma.TransactionClient, pid: number) => Promise<T>
      ): Promise<T> {
        return prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
            return body(tx, rows[0]?.pid as number);
          },
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );
      }

      it('B: 未コミットの同意を失効が待ち、同意のコミット後にその接続を終了する', async () => {
        const grantId = newGrantId();
        const expected = await generationOf(userId);

        const { revoking } = await holdTransaction(async (tx, pid) => {
          await service.createOrReplace(consentInput(grantId, expected), tx);
          const started = runRevokeAll();
          await waitUntilBlockedBy(pid);
          return { revoking: { promise: started } };
        });

        expect(await revoking.promise).toBe(1);
        expect(await connectionCount(userId)).toBe(0);
        expect(await generationOf(userId)).toBe(expected + 1);
      });

      it('C: 失効の間に待った再度の同意は、失効のコミット後に接続を作らず失敗する', async () => {
        const { grantId: oldGrantId } = await createConnection();
        await addTokenRow(oldGrantId, 'Grant');
        const expected = await generationOf(userId);
        const newGrant = newGrantId();

        const { consenting, revoked } = await holdTransaction(async (tx, pid) => {
          const count = await service.revokeAllForUser(userId, 'LOGOUT_ALL', ACTOR, tx);
          const started = runConsent(newGrant, expected).then(
            () => null,
            (error: unknown) => error
          );
          await waitUntilBlockedBy(pid);
          return { consenting: { promise: started }, revoked: count };
        });

        expect(revoked).toBe(1);
        const error = await consenting.promise;
        expect(error).toBeInstanceOf(ConnectionRevocationConflictError);
        expect((error as ConnectionRevocationConflictError).code).toBe(
          'CONNECTION_REVOCATION_CONFLICT'
        );
        expect(await connectionCount(userId)).toBe(0);
      });

      it('接続が無くても世代を進め、進行中の初回の同意を止める', async () => {
        const expected = await generationOf(userId);

        await prisma.$transaction((tx) =>
          service.revokeAllForUser(userId, 'ACCOUNT_DEACTIVATED', ACTOR, tx)
        );

        expect(await generationOf(userId)).toBe(expected + 1);
        await expect(runConsent(newGrantId(), expected)).rejects.toBeInstanceOf(
          ConnectionRevocationConflictError
        );
        expect(await connectionCount(userId)).toBe(0);
      });

      it('世代が違う同意は既存の接続を置き換えない', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId);
        const current = await generationOf(userId);

        await expect(runConsent(newGrantId(), current + 1)).rejects.toBeInstanceOf(
          ConnectionRevocationConflictError
        );

        expect(await prisma.externalAppConnection.count({ where: { userId, grantId } })).toBe(1);
        expect(await storeRowCount(grantId)).toBe(1);
        expect(await auditLogs('CONNECTION_REPLACED')).toHaveLength(0);
      });

      it('現在の世代を渡した同意は失効の後でも接続を作れる', async () => {
        await runRevokeAll();

        await runConsent(newGrantId(), await generationOf(userId));

        expect(await connectionCount(userId)).toBe(1);
      });

      it('存在しない利用者の同意は型付きの失敗になる', async () => {
        await expect(
          prisma.$transaction((tx) =>
            service.createOrReplace({ ...consentInput(newGrantId(), 0), userId: randomUUID() }, tx)
          )
        ).rejects.toBeInstanceOf(ConnectionRevocationConflictError);
      });

      it('呼び出し元の取引を戻すと世代も戻る', async () => {
        const before = await generationOf(userId);

        await expect(
          prisma.$transaction(async (tx) => {
            await service.revokeAllForUser(userId, 'LOGOUT_ALL', ACTOR, tx);
            throw new Error('呼び出し元の失敗');
          })
        ).rejects.toThrow('呼び出し元の失敗');

        expect(await generationOf(userId)).toBe(before);
      });

      it('世代の更新は利用者の更新日時を変えない', async () => {
        const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

        await runRevokeAll();

        const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        expect(after.updatedAt).toEqual(before.updatedAt);
      });

      it('権限の喪失は、失った利用者の世代だけを進める（接続が無くても）', async () => {
        const keeperId = await newUser();
        const lostId = await newUser();
        const unlistedId = await newUser();
        const roleId = await addRole([['external_app', 'connect']]);
        await assignRole(keeperId, roleId);

        await prisma.$transaction((tx) =>
          service.revokeForUsersWithoutPermission([keeperId, lostId], ACTOR, tx)
        );

        expect(await generationOf(keeperId)).toBe(0);
        expect(await generationOf(lostId)).toBe(1);
        expect(await generationOf(unlistedId)).toBe(0);
      });

      it("'ALL' は権限を持つ利用者の世代を進めず、接続の無い喪失者の世代を進める", async () => {
        const keeperId = await newUser();
        const lostId = await newUser();
        const roleId = await addRole([['*', 'connect']]);
        await assignRole(keeperId, roleId);
        await createConnection({ userId: keeperId });

        await prisma.$transaction(
          (tx) => service.revokeForUsersWithoutPermission('ALL', ACTOR, tx),
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );

        expect(await generationOf(keeperId)).toBe(0);
        expect(await generationOf(lostId)).toBe(1);
        expect(await connectionCount(keeperId)).toBe(1);
      });

      it('権限の喪失の判定中に待った同意は、喪失のコミット後に失敗する', async () => {
        const expected = await generationOf(userId);
        const newGrant = newGrantId();

        const { consenting } = await holdTransaction(async (tx, pid) => {
          await service.revokeForUsersWithoutPermission([userId], ACTOR, tx);
          const started = runConsent(newGrant, expected).then(
            () => null,
            (error: unknown) => error
          );
          await waitUntilBlockedBy(pid);
          return { consenting: { promise: started } };
        });

        expect(await consenting.promise).toBeInstanceOf(ConnectionRevocationConflictError);
        expect(await connectionCount(userId)).toBe(0);
      });

      it('呼び出し元が利用者の行を更新した後の失効と、別の失効がデッドロックしない', async () => {
        const before = await generationOf(userId);

        const { other } = await holdTransaction(async (tx, pid) => {
          await tx.user.update({ where: { id: userId }, data: { displayName: 'changed' } });
          const started = runRevokeAll();
          await waitUntilBlockedBy(pid);
          await service.revokeAllForUser(userId, 'PASSWORD_CHANGED', ACTOR, tx);
          return { other: { promise: started } };
        });

        await other.promise;
        expect(await generationOf(userId)).toBe(before + 2);
      });

      it('利用者の行を更新した失効と同意がデッドロックせず、同意が失敗する', async () => {
        const expected = await generationOf(userId);
        const newGrant = newGrantId();

        const { consenting } = await holdTransaction(async (tx, pid) => {
          // メールは一意の列なので、接続の外部キーの検査（FOR KEY SHARE）とも競合する
          await tx.user.update({
            where: { id: userId },
            data: { email: `${MARK}-${randomUUID()}@example.com` },
          });
          const started = runConsent(newGrant, expected).then(
            () => null,
            (error: unknown) => error
          );
          await waitUntilBlockedBy(pid);
          await service.revokeAllForUser(userId, 'PASSWORD_CHANGED', ACTOR, tx);
          return { consenting: { promise: started } };
        });

        expect(await consenting.promise).toBeInstanceOf(ConnectionRevocationConflictError);
        expect(await connectionCount(userId)).toBe(0);
      });

      it('複数の利用者は渡した順によらず ID の昇順でロックする', async () => {
        const otherId = await newUser();
        const [lowest, highest] = [userId, otherId].sort((left, right) =>
          left < right ? -1 : 1
        ) as [string, string];

        const { running, highestFree } = await holdTransaction(async (tx, pid) => {
          await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${lowest} FOR NO KEY UPDATE`;
          const started = prisma.$transaction(
            (inner) => service.revokeForUsersWithoutPermission([highest, lowest], ACTOR, inner),
            { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
          );
          await waitUntilBlockedBy(pid);
          // 最小の ID で待っている間、大きい ID の行はロックされていない
          const free = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "users" WHERE id = ${highest} FOR NO KEY UPDATE SKIP LOCKED`;
          return { running: { promise: started }, highestFree: free.length };
        });

        expect(highestFree).toBe(1);
        await running.promise;
      });

      it('複数の利用者を逆の順で渡す同時の判定がデッドロックしない', async () => {
        const others = [await newUser(), await newUser(), await newUser()];
        const ids = [userId, ...others];
        for (let round = 0; round < 5; round += 1) {
          for (const id of ids) {
            await createConnection({ userId: id, clientId: `${CLIENT_ID}-multi-${round}` });
          }
          const results = await Promise.all(
            [ids, [...ids].reverse()].map((list) =>
              prisma.$transaction(
                (tx) => service.revokeForUsersWithoutPermission(list, ACTOR, tx),
                { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
              )
            )
          );
          expect(results[0]! + results[1]!).toBe(ids.length);
        }
      });
    });

    describe('handleReuse', () => {
      const REUSE = {
        kind: 'refresh_token',
        ipAddress: '198.51.100.9',
        userAgent: 'reuse-agent/1.0',
      } as const;

      it('接続を終了し、監査を残してコミットの後に管理者へ通知する（48.6、51.7、51.9）', async () => {
        const { grantId } = await createConnection({ scopes: ['read', 'write'] });
        await addTokenRow(grantId, 'Grant');
        await addTokenRow(grantId, 'RefreshToken');
        const seen: { connections: number; audits: number }[] = [];
        const observed: AnomalyObservation[] = [];
        let check: Promise<void> = Promise.resolve();
        const target = serviceWithObserver((observation) => {
          observed.push(observation);
          check = (async () => {
            seen.push({
              connections: await connectionCount(userId),
              audits: (await auditLogs('TOKEN_REUSE_DETECTED')).length,
            });
          })();
        });

        await target.handleReuse({ grantId, ...REUSE });
        await check;

        expect(await connectionCount(userId)).toBe(0);
        expect(await storeRowCount(grantId)).toBe(0);
        expect(observed).toEqual([
          {
            signal: 'external_app_token_reuse',
            sourceIp: REUSE.ipAddress,
            userId,
          },
        ]);
        expect(seen).toEqual([{ connections: 0, audits: 1 }]);

        const logs = await auditLogs('TOKEN_REUSE_DETECTED');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.actorId).toBeNull();
        expect(logs[0]?.metadata).toMatchObject({
          clientId: CLIENT_ID,
          scopes: ['read', 'write'],
          reason: 'TOKEN_REUSE',
          reuseKind: 'refresh_token',
          ipAddress: REUSE.ipAddress,
          userAgent: REUSE.userAgent,
        });
        expect(JSON.stringify(logs)).not.toContain(grantId);
      });

      it('同じ Grant への同時の呼び出しでも監査と通知は 1 件', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId, 'Grant');
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        await Promise.all(
          Array.from({ length: 8 }, () => target.handleReuse({ grantId, ...REUSE }))
        );

        expect(observe).toHaveBeenCalledTimes(1);
        expect(await auditLogs('TOKEN_REUSE_DETECTED')).toHaveLength(1);
      });

      it('読み取りの後に他の処理が接続を消したら、監査も通知もしない', async () => {
        // Grant の行が無いとロックで直列化されないので、接続の条件付きの消去だけが勝者を決める
        const { grantId } = await createConnection();
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        const { running } = await prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`;
            await tx.externalAppConnection.deleteMany({ where: { grantId } });
            const started = target.handleReuse({ grantId, ...REUSE });
            await waitUntilBlockedBy(rows[0]?.pid as number);
            return { running: { promise: started } };
          },
          { timeout: LOCK_WAIT_DEADLINE_MS * 2 }
        );
        await running.promise;

        expect(observe).not.toHaveBeenCalled();
        expect(await auditLogs('TOKEN_REUSE_DETECTED')).toHaveLength(0);
      });

      it('通知は取引のコミットの後に行う', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId, 'Grant');
        const order: string[] = [];
        const tracked = new Proxy(prisma, {
          get(client, key) {
            if (key === '$transaction') {
              return async (...args: unknown[]) => {
                const result = await (
                  client.$transaction as unknown as (...inner: unknown[]) => Promise<unknown>
                )(...args);
                order.push('committed');
                return result;
              };
            }
            const value: unknown = Reflect.get(client, key);
            return typeof value === 'function' ? value.bind(client) : value;
          },
        });
        const target = new ExternalAppConnectionService({
          prisma: tracked,
          auditLogService: new AuditLogService({ prisma }),
          clientRegistry: { loadAllowedClients: () => [] },
          observeAnomaly: () => order.push('notified'),
        });

        await target.handleReuse({ grantId, ...REUSE });

        expect(order).toEqual(['committed', 'notified']);
      });

      it('2 回目の呼び出しは何もしない', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId, 'Grant');
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        await target.handleReuse({ grantId, ...REUSE });
        await target.handleReuse({ grantId, ...REUSE });

        expect(observe).toHaveBeenCalledTimes(1);
        expect(await auditLogs('TOKEN_REUSE_DETECTED')).toHaveLength(1);
      });

      it('通知の失敗では失効を戻さず、例外を投げない', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId, 'Grant');
        const target = serviceWithObserver(() => {
          throw new Error('通知の失敗');
        });

        await expect(target.handleReuse({ grantId, ...REUSE })).resolves.toBeUndefined();

        expect(await connectionCount(userId)).toBe(0);
        expect(await storeRowCount(grantId)).toBe(0);
        expect(await auditLogs('TOKEN_REUSE_DETECTED')).toHaveLength(1);
      });

      it('監査に失敗すると接続の消去も戻り、通知しない', async () => {
        const { grantId } = await createConnection();
        await addTokenRow(grantId, 'Grant');
        const observe = vi.fn();
        const target = new ExternalAppConnectionService({
          prisma,
          auditLogService: {
            createLog: async () => {
              throw new Error('監査の失敗');
            },
          },
          clientRegistry: { loadAllowedClients: () => [] },
          observeAnomaly: observe,
        });

        await expect(target.handleReuse({ grantId, ...REUSE })).rejects.toThrow('監査の失敗');

        expect(await connectionCount(userId)).toBe(1);
        expect(await storeRowCount(grantId)).toBe(1);
        expect(observe).not.toHaveBeenCalled();
      });

      it('接続の無い Grant の行を消し、利用者不明として監査と通知を 1 回だけ行う', async () => {
        const grantId = newGrantId();
        await addTokenRow(grantId, 'Grant');
        await addTokenRow(grantId, 'RefreshToken');
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        await Promise.all(
          Array.from({ length: 4 }, () => target.handleReuse({ grantId, ...REUSE }))
        );
        await target.handleReuse({ grantId, ...REUSE });

        expect(await storeRowCount(grantId)).toBe(0);
        expect(observe).toHaveBeenCalledTimes(1);
        expect(observe).toHaveBeenCalledWith({
          signal: 'external_app_token_reuse',
          sourceIp: REUSE.ipAddress,
          userId: null,
        });
        const logs = await prisma.auditLog.findMany({
          where: {
            action: 'TOKEN_REUSE_DETECTED',
            targetType: 'ExternalAppGrant',
            metadata: { path: ['ipAddress'], equals: REUSE.ipAddress },
          },
        });
        expect(logs).toHaveLength(1);
        expect(logs[0]?.targetId).toBe('unknown');
        expect(logs[0]?.metadata).toMatchObject({
          clientId: null,
          reason: 'TOKEN_REUSE',
          reuseKind: 'refresh_token',
        });
        expect(JSON.stringify(logs)).not.toContain(grantId);
      });

      it('接続の無い Grant は payload の利用者とアプリを監査と通知に使い、他の値を書かない', async () => {
        const grantId = newGrantId();
        await prisma.oAuthStoreRecord.create({
          data: {
            id: `Grant:${MARK}-${randomUUID()}`,
            kind: 'Grant',
            grantId,
            payload: { accountId: userId, clientId: CLIENT_ID, extra: 'payload-other-value' },
          },
        });
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        await target.handleReuse({ grantId, ...REUSE });

        expect(await storeRowCount(grantId)).toBe(0);
        expect(observe).toHaveBeenCalledWith({
          signal: 'external_app_token_reuse',
          sourceIp: REUSE.ipAddress,
          userId,
        });
        const logs = await auditLogs('TOKEN_REUSE_DETECTED');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.targetType).toBe('User');
        expect(logs[0]?.metadata).toMatchObject({
          clientId: CLIENT_ID,
          reason: 'TOKEN_REUSE',
          reuseKind: 'refresh_token',
        });
        const serialized = JSON.stringify(logs);
        expect(serialized).not.toContain(grantId);
        expect(serialized).not.toContain('payload-other-value');
      });

      it.each([
        ['accountId が文字列でない', { accountId: 42, clientId: 'app' }],
        ['accountId が長すぎる', { accountId: 'a'.repeat(256), clientId: 'app' }],
        ['accountId に制御文字がある', { accountId: 'a\nb', clientId: 'app' }],
        ['accountId が実在しない', { accountId: randomUUID(), clientId: 'app' }],
        ['payload が配列', ['accountId']],
      ])('%s の Grant は利用者を不明として記録する', async (_name, payload) => {
        const grantId = newGrantId();
        await prisma.oAuthStoreRecord.create({
          data: { id: `Grant:${MARK}-${randomUUID()}`, kind: 'Grant', grantId, payload },
        });
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        await target.handleReuse({ grantId, ...REUSE });

        expect(await storeRowCount(grantId)).toBe(0);
        expect(observe).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
        const logs = await prisma.auditLog.findMany({
          where: { action: 'TOKEN_REUSE_DETECTED', targetType: 'ExternalAppGrant' },
        });
        expect(logs).toHaveLength(1);
        expect(logs[0]?.targetId).toBe('unknown');
      });

      it('不正な clientId は記録せず、実在の利用者は対象に使う', async () => {
        const grantId = newGrantId();
        await prisma.oAuthStoreRecord.create({
          data: {
            id: `Grant:${MARK}-${randomUUID()}`,
            kind: 'Grant',
            grantId,
            payload: { accountId: userId, clientId: 'x'.repeat(256) },
          },
        });

        await serviceWithObserver(vi.fn()).handleReuse({ grantId, ...REUSE });

        const logs = await auditLogs('TOKEN_REUSE_DETECTED');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.metadata).toMatchObject({ clientId: null });
      });

      it('行も接続も無い Grant では何もしない', async () => {
        const observe = vi.fn();
        const target = serviceWithObserver(observe);

        await target.handleReuse({ grantId: newGrantId(), ...REUSE });

        expect(observe).not.toHaveBeenCalled();
        expect(
          await prisma.auditLog.count({
            where: { action: 'TOKEN_REUSE_DETECTED', targetType: 'ExternalAppGrant' },
          })
        ).toBe(0);
      });
    });
  });
});
