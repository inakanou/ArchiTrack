/**
 * @fileoverview パスワードの変更・リセットと全デバイスのログアウトによる接続の失効の統合検証（user-authentication タスク 76.1）
 *
 * 本物のアプリ（app.ts の経路・認証ミドルウェア）と実 PostgreSQL・実 Redis を通す。接続は接続の管理の
 * `createOrReplace` で作り、Grant とトークンの保存データの行を足す（認可サーバーの搭載は要らない）。
 *
 * 確かめること:
 * - 50.1: パスワードの変更・リセットで利用者の全ての接続と保存データの行が直ちに消える
 * - 50.2: 全デバイスのログアウト（`POST /api/v1/auth/logout-all` と `DELETE /api/v1/auth/sessions`）で同じく消える
 * - 50.5: 1 端末のログアウト（`POST /api/v1/auth/logout` と `DELETE /api/v1/auth/sessions/:id`）では接続が残る
 * - 51.7: 接続の終了の監査に実行者・理由・送信元 IP・ユーザーエージェントが残る
 * - design.md の「アクセストークンの即失効」: 同じ取引で `users.access_token_generation` を 1 進め、
 *   状態のキャッシュをコミットの後に無効化し、発行済みの画面用アクセストークンが直ちに 401 になる
 * - 途中の失敗で取引を戻すと、失効・世代・パスワード・リフレッシュトークンがすべて戻る
 * - 進行中の同意と各入口の競合で、コミットの後に接続が残らない
 * - ロックの順序（リフレッシュトークンの取引ロック → users の行 → 失効の取引ロック）により、
 *   ローテーションやパスワードの変更と全デバイスのログアウトが同時に進んでもデッドロックしない
 *
 * Design: Requirements 46-51 > ExternalAppConnectionService（Invariants: ロックの順序・アクセストークンの即失効）
 *
 * @requirement user-authentication/REQ-50.1
 * @requirement user-authentication/REQ-50.2
 * @requirement user-authentication/REQ-50.5
 * @requirement user-authentication/REQ-51.7
 */

import { randomBytes, randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import {
  ConnectionRevocationConflictError,
  ExternalAppConnectionService,
} from '../../services/external-app-connection.service.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { lockUserRefreshTokens } from '../../utils/refresh-token-lock.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { loginForTokens } from './auth-login-client.js';
import { createStoredPasswordResetToken } from './password-reset-token-fixture.js';
import {
  issuedRefreshToken,
  logoutWithCookie,
  refreshWithCookie,
} from './refresh-cookie-client.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua761-credential-revoke';
const PASSWORD = 'CredRevoke!Passphrase-2026';
const NEW_PASSWORD = 'CredRevoke!Rotated-2026xyz';
const USER_AGENT = 'ua761-integration-agent/1.0';
const CLIENT_IDS = [`${MARK}-client-a`, `${MARK}-client-b`] as const;
const LOCK_WAIT_DEADLINE_MS = 8000;

type EntryName =
  'パスワードの変更' | 'パスワードのリセット' | 'POST /logout-all' | 'DELETE /sessions';

interface Entry {
  readonly name: EntryName;
  readonly reason: 'PASSWORD_CHANGED' | 'LOGOUT_ALL';
  /** 失効の途中の DB の失敗の応答（既存の経路の対応づけ。全デバイスのログアウトは 2 つの入口で同じ） */
  readonly failure: { readonly status: number; readonly code: string };
  /** 入口を呼ぶ。`accessToken` はログインで得た画面用のアクセストークン */
  readonly call: (userId: string, accessToken: string) => Promise<request.Response>;
}

describe('パスワードの変更・リセットと全デバイスのログアウトによる接続の失効（統合・タスク76.1）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let passwordHash: string;
  let connectionService: ExternalAppConnectionService;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.oAuthStoreRecord.deleteMany({ where: { id: { contains: MARK } } });
    await prisma.externalAppConnection.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordHistory.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function clearRateLimits(): Promise<void> {
    const keys = await redisClient.keys('rl:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }

  async function newUser(): Promise<{ id: string; email: string }> {
    const email = `${MARK}-${randomBytes(4).toString('hex')}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: `${MARK}-user`,
      passwordHash,
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'user' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { id: user.id, email };
  }

  async function login(email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await loginForTokens(app, { email, password: PASSWORD });
    return {
      accessToken: response.body.accessToken as string,
      refreshToken: issuedRefreshToken(response),
    };
  }

  function generationOf(userId: string): Promise<number> {
    return prisma.user
      .findUniqueOrThrow({
        where: { id: userId },
        select: { externalAppRevocationGeneration: true },
      })
      .then((row) => row.externalAppRevocationGeneration);
  }

  function accessGenerationOf(userId: string): Promise<number> {
    return prisma.user
      .findUniqueOrThrow({ where: { id: userId }, select: { accessTokenGeneration: true } })
      .then((row) => row.accessTokenGeneration);
  }

  function consentInput(userId: string, clientId: string, grantId: string, expected: number) {
    return {
      userId,
      clientId,
      grantId,
      scopes: ['read' as const],
      consentedAt: new Date(),
      expectedRevocationGeneration: expected,
    };
  }

  /** 利用者に接続を作り、Grant とトークンの保存データの行を足す */
  async function addConnection(userId: string, clientId: string): Promise<string> {
    const grantId = `${MARK}-grant-${randomUUID()}`;
    const expected = await generationOf(userId);
    await prisma.$transaction((tx) =>
      connectionService.createOrReplace(consentInput(userId, clientId, grantId, expected), tx)
    );
    await prisma.oAuthStoreRecord.createMany({
      data: [
        { id: `Grant:${MARK}-${randomUUID()}`, kind: 'Grant', grantId, payload: {} },
        { id: `AccessToken:${MARK}-${randomUUID()}`, kind: 'AccessToken', grantId, payload: {} },
      ],
    });
    return grantId;
  }

  async function addConnections(userId: string): Promise<string[]> {
    const grants: string[] = [];
    for (const clientId of CLIENT_IDS) {
      grants.push(await addConnection(userId, clientId));
    }
    return grants;
  }

  function connectionCount(userId: string): Promise<number> {
    return prisma.externalAppConnection.count({ where: { userId } });
  }

  function storeRowCount(grantIds: readonly string[]): Promise<number> {
    return prisma.oAuthStoreRecord.count({ where: { grantId: { in: [...grantIds] } } });
  }

  function endedAudits(userId: string) {
    return prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ENDED', targetId: userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  function me(accessToken: string) {
    return request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  }

  /** `holderPid` の接続のロックを待つ接続が `count` 件現れるまで待つ。期限内に現れなければ失敗させる */
  async function waitUntilBlockedBy(holderPid: number, count = 1): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
        WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))`;
      if ((rows[0]?.waiting ?? 0) >= count) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`ロックを待つ接続が ${count} 件現れませんでした`);
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

  /** supertest の要求を直ちに送り始める（`then` を呼ぶまで送られないため） */
  function start(pending: request.Test): Promise<request.Response> {
    return pending.then((response) => response);
  }

  const ENTRIES: readonly Entry[] = [
    {
      name: 'パスワードの変更',
      reason: 'PASSWORD_CHANGED',
      failure: { status: 400, code: 'INVALID_CURRENT_PASSWORD' },
      call: (_userId, accessToken) =>
        start(
          request(app)
            .post('/api/v1/auth/password/change')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('User-Agent', USER_AGENT)
            .send({
              currentPassword: PASSWORD,
              newPassword: NEW_PASSWORD,
              newPasswordConfirm: NEW_PASSWORD,
            })
        ),
    },
    {
      name: 'パスワードのリセット',
      reason: 'PASSWORD_CHANGED',
      failure: { status: 400, code: 'RESET_TOKEN_INVALID' },
      call: async (userId) => {
        const { rawToken } = await createStoredPasswordResetToken(prisma, {
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
        return start(
          request(app)
            .post('/api/v1/auth/password/reset')
            .set('User-Agent', USER_AGENT)
            .send({ token: rawToken, newPassword: NEW_PASSWORD })
        );
      },
    },
    {
      name: 'POST /logout-all',
      reason: 'LOGOUT_ALL',
      failure: { status: 500, code: 'INTERNAL_ERROR' },
      call: (_userId, accessToken) =>
        start(
          request(app)
            .post('/api/v1/auth/logout-all')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('User-Agent', USER_AGENT)
        ),
    },
    {
      name: 'DELETE /sessions',
      reason: 'LOGOUT_ALL',
      failure: { status: 500, code: 'INTERNAL_ERROR' },
      call: (_userId, accessToken) =>
        start(
          request(app)
            .delete('/api/v1/auth/sessions')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('User-Agent', USER_AGENT)
        ),
    },
  ];

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ赤にする。読み飛ばさない）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    connectionService = new ExternalAppConnectionService({
      prisma,
      auditLogService: new AuditLogService({ prisma }),
      clientRegistry: { loadAllowedClients: () => [] },
    });
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  describe.each(ENTRIES)('$name', (entry) => {
    it('全ての接続と保存データの行を消し、理由と送信元を監査に残し、画面用のアクセストークンを直ちに 401 にする', async () => {
      const user = await newUser();
      const { accessToken } = await login(user.email);
      const grants = await addConnections(user.id);
      const revocationBefore = await generationOf(user.id);
      const accessBefore = await accessGenerationOf(user.id);
      // 状態のキャッシュを載せておく（無効化しなければ古い世代で通ってしまう）
      expect((await me(accessToken)).status).toBe(200);
      expect(await redisClient.get(authUserStateCacheKey(user.id))).not.toBeNull();

      const response = await entry.call(user.id, accessToken);

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(await connectionCount(user.id)).toBe(0);
      expect(await storeRowCount(grants)).toBe(0);
      expect(await generationOf(user.id)).toBe(revocationBefore + 1);
      expect(await accessGenerationOf(user.id)).toBe(accessBefore + 1);
      // コミットの後に状態のキャッシュを無効化している（パスワードの変更の応答は利用者を読み直して
      // キャッシュを載せ直すので、残るなら新しい世代の値に限る）
      const cached = await redisClient.get(authUserStateCacheKey(user.id));
      expect(
        cached === null ? null : (JSON.parse(cached) as { accessTokenGeneration: number })
      ).toEqual(
        entry.name === 'パスワードの変更'
          ? expect.objectContaining({ accessTokenGeneration: accessBefore + 1 })
          : null
      );

      const audits = await endedAudits(user.id);
      expect(audits).toHaveLength(CLIENT_IDS.length);
      for (const audit of audits) {
        expect(audit.actorId).toBe(user.id);
        const metadata = audit.metadata as Record<string, unknown>;
        expect(metadata.reason).toBe(entry.reason);
        expect(metadata.ipAddress).toEqual(expect.stringMatching(/127\.0\.0\.1|::1/));
        expect(metadata.userAgent).toBe(USER_AGENT);
      }
      expect(
        audits.map((audit) => (audit.metadata as Record<string, unknown>).clientId).sort()
      ).toEqual([...CLIENT_IDS].sort());

      // 発行済みの画面用アクセストークンは直ちに使えない
      const after = await me(accessToken);
      expect(after.status).toBe(401);
      expect(after.body.error).toBe('INVALID_TOKEN');
      // 利用者の全てのリフレッシュトークンも失効している
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    });

    it('途中の失敗で取引を戻すと、接続・保存データの行・世代・リフレッシュトークン・パスワードが戻る', async () => {
      const user = await newUser();
      const { accessToken } = await login(user.email);
      const grants = await addConnections(user.id);
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const refreshBefore = await prisma.refreshToken.count({ where: { userId: user.id } });
      expect(refreshBefore).toBeGreaterThan(0);

      // 2 件目の接続の終了の監査で失敗させる（1 件目の消去は取引の中で済んでいる）
      const original = AuditLogService.prototype.createLog;
      let ended = 0;
      vi.spyOn(AuditLogService.prototype, 'createLog').mockImplementation(async function (
        this: AuditLogService,
        input,
        tx
      ) {
        if (input.action === 'CONNECTION_ENDED' && ++ended === 2) {
          throw new Error('injected audit failure');
        }
        return original.call(this, input, tx);
      });

      const response = await entry.call(user.id, accessToken);

      expect(ended).toBe(2);
      expect(response.status).toBe(entry.failure.status);
      expect(response.body.code).toBe(entry.failure.code);
      if (entry.failure.code === 'INTERNAL_ERROR') {
        // 障害の文言を応答に出さない（要件42.8）
        expect(response.body).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
      }
      expect(await connectionCount(user.id)).toBe(CLIENT_IDS.length);
      expect(await storeRowCount(grants)).toBe(CLIENT_IDS.length * 2);
      expect(await endedAudits(user.id)).toHaveLength(0);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.externalAppRevocationGeneration).toBe(before.externalAppRevocationGeneration);
      expect(after.accessTokenGeneration).toBe(before.accessTokenGeneration);
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(refreshBefore);
      vi.restoreAllMocks();
      expect((await me(accessToken)).status).toBe(200);
    });

    it('未コミットの同意を待ち、同意のコミットの後にその接続も終了する', async () => {
      const user = await newUser();
      const { accessToken } = await login(user.email);
      const grantId = `${MARK}-grant-${randomUUID()}`;
      const expected = await generationOf(user.id);

      const { pending } = await holdTransaction(async (tx, pid) => {
        await connectionService.createOrReplace(
          consentInput(user.id, CLIENT_IDS[0], grantId, expected),
          tx
        );
        const started = entry.call(user.id, accessToken);
        await waitUntilBlockedBy(pid);
        return { pending: { promise: started } };
      });

      const response = await pending.promise;
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(await connectionCount(user.id)).toBe(0);
      const audits = await endedAudits(user.id);
      expect(audits).toHaveLength(1);
      expect((audits[0]!.metadata as Record<string, unknown>).reason).toBe(entry.reason);
    });

    it('入口より前に始まった同意は、入口のコミットの後に接続を作れない', async () => {
      const user = await newUser();
      const { accessToken } = await login(user.email);
      // 同意の手続きの開始時に読む世代
      const expected = await generationOf(user.id);

      const response = await entry.call(user.id, accessToken);
      expect(response.status, JSON.stringify(response.body)).toBe(200);

      await expect(
        prisma.$transaction((tx) =>
          connectionService.createOrReplace(
            consentInput(user.id, CLIENT_IDS[0], `${MARK}-grant-${randomUUID()}`, expected),
            tx
          )
        )
      ).rejects.toBeInstanceOf(ConnectionRevocationConflictError);
      expect(await connectionCount(user.id)).toBe(0);
    });
  });

  describe('1 端末のログアウト（50.5）', () => {
    it('POST /logout は接続も世代も変えず、接続の終了を監査に残さない', async () => {
      const user = await newUser();
      const other = await login(user.email);
      const current = await login(user.email);
      await addConnections(user.id);
      const revocationBefore = await generationOf(user.id);
      const accessBefore = await accessGenerationOf(user.id);

      const response = await logoutWithCookie(app, current.accessToken, current.refreshToken);

      expect(response.status).toBe(200);
      expect(await connectionCount(user.id)).toBe(CLIENT_IDS.length);
      expect(await generationOf(user.id)).toBe(revocationBefore);
      expect(await accessGenerationOf(user.id)).toBe(accessBefore);
      expect(await endedAudits(user.id)).toHaveLength(0);
      // 他の端末の画面用アクセストークンは使い続けられる
      expect((await me(other.accessToken)).status).toBe(200);
    });

    it('DELETE /sessions/:id は接続も世代も変えず、接続の終了を監査に残さない', async () => {
      const user = await newUser();
      const current = await login(user.email);
      await login(user.email);
      await addConnections(user.id);
      const revocationBefore = await generationOf(user.id);
      const accessBefore = await accessGenerationOf(user.id);
      const sessions = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${current.accessToken}`);
      expect(sessions.status).toBe(200);
      const target = (sessions.body.sessions as { id: string }[])[0]!;

      const response = await request(app)
        .delete(`/api/v1/auth/sessions/${target.id}`)
        .set('Authorization', `Bearer ${current.accessToken}`);

      expect(response.status).toBe(200);
      expect(await connectionCount(user.id)).toBe(CLIENT_IDS.length);
      expect(await generationOf(user.id)).toBe(revocationBefore);
      expect(await accessGenerationOf(user.id)).toBe(accessBefore);
      expect(await endedAudits(user.id)).toHaveLength(0);
    });
  });

  describe('全デバイスのログアウトの監査と利用者の行', () => {
    it.each(['POST /logout-all', 'DELETE /sessions'] as const)(
      '%s はセッションの終了 LOGOUT_ALL を送信元つきで監査に残し、利用者の更新日時を変えない',
      async (name) => {
        const user = await newUser();
        const { accessToken } = await login(user.email);
        const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        const entry = ENTRIES.find((candidate) => candidate.name === name)!;

        const response = await entry.call(user.id, accessToken);

        expect(response.status).toBe(200);
        const logs = await prisma.auditLog.findMany({
          where: { action: 'LOGOUT_ALL', targetId: user.id },
        });
        expect(logs).toHaveLength(1);
        expect(logs[0]!.actorId).toBe(user.id);
        expect(JSON.stringify(logs[0]!.metadata)).toContain(USER_AGENT);
        const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        // プロフィールの楽観的な排他（更新日時）を変えない
        expect(after.updatedAt).toEqual(before.updatedAt);
      }
    );
  });

  describe('パスワードを変更した本人の画面の続け方', () => {
    it('変更の応答は 200 と利用者を返し、旧いトークンのログアウトは 401 になり、新しいパスワードで再びログインして使える', async () => {
      const user = await newUser();
      const { accessToken, refreshToken } = await login(user.email);

      const changed = await ENTRIES[0]!.call(user.id, accessToken);
      expect(changed.status).toBe(200);
      expect(changed.body.message).toBe('Password changed successfully');
      expect(changed.body.user).toMatchObject({ id: user.id, mustChangePassword: false });

      // 画面は変更の後にログアウトしてログイン画面へ移る。旧いアクセストークンのログアウトは 401 になる
      // （画面はログアウトの API の失敗でも手元の資格を消してログイン画面へ移る）
      const logout = await logoutWithCookie(app, accessToken, refreshToken);
      expect(logout.status).toBe(401);
      expect(logout.body.error).toBe('INVALID_TOKEN');
      // リフレッシュトークンは変更で失効している
      expect((await refreshWithCookie(app, refreshToken)).status).toBe(401);

      const relogin = await loginForTokens(app, { email: user.email, password: NEW_PASSWORD });
      expect((await me(relogin.body.accessToken as string)).status).toBe(200);
    });
  });

  describe('ロックの順序（リフレッシュトークンの取引ロック → users の行 → 失効の取引ロック）', () => {
    /** 利用者のリフレッシュトークンの取引ロックを持つ取引の中で `run` を始め、`waiters` 件の待ちを確かめて放す */
    async function behindRefreshLock<T>(
      userId: string,
      waiters: number,
      run: (pid: number) => Promise<T>
    ): Promise<T> {
      const { pending } = await holdTransaction(async (tx, pid) => {
        await lockUserRefreshTokens(tx, userId);
        const started = run(pid);
        await waitUntilBlockedBy(pid, waiters);
        return { pending: { promise: started } };
      });
      return pending.promise;
    }

    it('ローテーションと全デバイスのログアウトが同時に進んでもデッドロックせず、失効の前に発行されたトークンは残らない', async () => {
      const user = await newUser();
      const { accessToken, refreshToken } = await login(user.email);
      const grants = await addConnections(user.id);

      const [refreshed, loggedOut] = await behindRefreshLock(user.id, 2, async (pid) => {
        const rotating = refreshWithCookie(app, refreshToken).then((response) => response);
        await waitUntilBlockedBy(pid, 1);
        const logoutAll = ENTRIES[2]!.call(user.id, accessToken);
        return Promise.all([rotating, logoutAll]);
      });

      expect(loggedOut.status, JSON.stringify(loggedOut.body)).toBe(200);
      // 先に待ったローテーションが先に取引ロックを得て後継を発行し、その後に全デバイスのログアウトが進む
      expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
      expect(await connectionCount(user.id)).toBe(0);
      expect(await storeRowCount(grants)).toBe(0);
      // 失効より前に発行された後継とアクセストークンは、失効の後に直ちに使えない
      expect((await me(refreshed.body.accessToken as string)).status).toBe(401);
      expect((await refreshWithCookie(app, issuedRefreshToken(refreshed))).status).toBe(401);
      expect((await me(accessToken)).status).toBe(401);
    });

    it('パスワードの変更と全デバイスのログアウトが同時に進んでもデッドロックせず、両方が成功する', async () => {
      const user = await newUser();
      const { accessToken } = await login(user.email);
      await addConnections(user.id);
      const accessBefore = await accessGenerationOf(user.id);

      // パスワードの変更を先に取引ロックで待たせてから、全デバイスのログアウトを始める。全デバイスのログアウトが
      // users の行を取引ロックより先に取ると、先に取引ロックを得たパスワードの変更が users の行を待ち、
      // 互いに待つ（デッドロック）
      const [changed, loggedOut] = await behindRefreshLock(user.id, 2, async (pid) => {
        const changing = ENTRIES[0]!.call(user.id, accessToken);
        await waitUntilBlockedBy(pid, 1);
        const logoutAll = ENTRIES[2]!.call(user.id, accessToken);
        return Promise.all([changing, logoutAll]);
      });

      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(loggedOut.status, JSON.stringify(loggedOut.body)).toBe(200);
      expect(await connectionCount(user.id)).toBe(0);
      expect(await accessGenerationOf(user.id)).toBe(accessBefore + 2);
    });
  });
});
