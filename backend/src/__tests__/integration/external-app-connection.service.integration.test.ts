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
 *
 * Design: Requirements 46-51 > ExternalAppConnectionService
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import type { ConnectionAuditEvent, ExternalAppScope } from '../../oauth/oauth.types.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  CONNECTION_ABSOLUTE_MS,
  CONNECTION_IDLE_MS,
  CONNECTION_TOUCH_INTERVAL_MS,
  ExternalAppConnectionService,
} from '../../services/external-app-connection.service.js';
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
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
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
      grantId?: string;
      scopes?: ExternalAppScope[];
      consentedAt?: Date;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ) {
    const grantId = overrides.grantId ?? newGrantId();
    const view = await prisma.$transaction((tx) =>
      service.createOrReplace(
        {
          userId,
          clientId: CLIENT_ID,
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
    it('初回の同意で 90 日の期限の接続を作り、置き換えの監査を残さない', async () => {
      const { grantId, view } = await createConnection({ scopes: ['read', 'write'] });

      expect(view).toEqual({
        id: expect.any(String),
        appName: APP_NAME,
        scopes: ['read', 'write'],
        consentedAt: CONSENTED_AT.toISOString(),
        lastUsedAt: null,
        expiresAt: at(CONSENTED_AT, 90 * DAY_MS).toISOString(),
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
});
