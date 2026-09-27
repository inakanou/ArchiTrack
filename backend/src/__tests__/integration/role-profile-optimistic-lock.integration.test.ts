/**
 * @fileoverview ロールの更新とプロフィールの更新の楽観的ロックの統合検証（タスク35.7）
 *
 * design.md は、PATCH /api/v1/roles/:id と PATCH /api/v1/auth/me が任意の expectedUpdatedAt を受け、
 * 与えられたときは updatedAt を条件に含めた更新（条件付きの更新）で競合を検出すると定めている。
 * 読んでから比べる方式は、READ COMMITTED では同じ版から並行する2件がどちらも比較を通りうるため採らない。
 *
 * ここでは実データベースで次を確かめる。
 * - 同じ版からの2件の更新を順に行うと、後の1件は競合になり、先の1件の内容が残る
 * - 同じ版からの2件の更新が本当に並行する（先行がコミット前に止まっている間に後続が来る）と、
 *   後続は先行の行ロックを待ち、先行のコミット後に条件を最新の行で評価し直して競合になる
 * - HTTP では、GET /api/v1/auth/me の updatedAt を送り返す更新は通り、古い版の更新は 409 の Problem Details になる
 *
 * 並行の順序は時間で待たずに決める。先行の UPDATE を BEFORE UPDATE のトリガーでアドバイザリロックの待ちに止め、
 * 止まったこと・後続が行ロックの待ちに入ったことを pg_stat_activity で観測してから次へ進む。
 * トリガーと関数は本ファイル専用の名前（接頭辞 ua357_）で作り、各検証の後に必ず外す。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、アプリとサービスのインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { AuthService } from '../../services/auth.service.js';
import { RoleService } from '../../services/role.service.js';

const MARK = 'test-ua357-optlock';
const PAUSE_KEY = 357_000_357;
const PAUSE_FUNCTION = 'ua357_pause_update';
const PAUSE_TRIGGER = 'ua357_pause_update_trigger';
/** 先行の更新だけを止めるための目印（後続は別の値を書くので止まらない） */
const FROM_A = 'ua357-from-a';
const FROM_B = 'ua357-from-b';

describe('ロールとプロフィールの更新の楽観的ロック（統合）', () => {
  let prisma: PrismaClient;
  let roleService: RoleService;
  let authService: AuthService;
  let roleId: string;
  let userId: string;
  let releasePause: (() => void) | undefined;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: MARK } } });
  }

  async function dropPauseTrigger(): Promise<void> {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${PAUSE_TRIGGER} ON roles`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${PAUSE_TRIGGER} ON users`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${PAUSE_FUNCTION}()`);
  }

  /** 与えた表の行のうち、条件に合う行の UPDATE をアドバイザリロックが解放されるまで止めるトリガーを作る */
  async function installPauseTrigger(table: 'roles' | 'users', when: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION ${PAUSE_FUNCTION}() RETURNS trigger AS $$ BEGIN PERFORM pg_advisory_xact_lock(${PAUSE_KEY}); RETURN NEW; END; $$ LANGUAGE plpgsql`
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${PAUSE_TRIGGER} BEFORE UPDATE ON ${table} FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${PAUSE_FUNCTION}()`
    );
  }

  /**
   * アドバイザリロックを保持するトランザクションを開き、取得できたら返す。
   * releasePause でロックを解放し、返り値の done でその完了を待つ。
   */
  async function holdPause(): Promise<{ done: Promise<void> }> {
    let signalHeld!: () => void;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releasePause = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT 1 AS held FROM (SELECT pg_advisory_xact_lock(${PAUSE_KEY})) AS lock`
        );
        signalHeld();
        await released;
      },
      { timeout: 20_000 }
    );
    await Promise.race([held, holder]);
    return { done: holder };
  }

  async function waitingBackends(condition: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ waiting: bigint }[]>(
      `SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND ${condition}`
    );
    return Number(rows[0]?.waiting ?? 0);
  }

  /** 先行がトリガーの中でアドバイザリロックの待ちに入るまで待つ */
  async function waitUntilPausedOnAdvisory(): Promise<void> {
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      if ((await waitingBackends(`wait_event = 'advisory'`)) > 0) {
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the preceding update never paused on the advisory lock');
  }

  /** 後続が終わるか、アドバイザリロック以外のロックの待ち（行ロック）に入るまで待つ */
  async function settleOrBlock(contender: Promise<unknown>): Promise<'settled' | 'blocked'> {
    let settled = false;
    contender.then(
      () => (settled = true),
      () => (settled = true)
    );
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      if (settled) {
        return 'settled';
      }
      if ((await waitingBackends(`wait_event <> 'advisory'`)) > 0) {
        return 'blocked';
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the contender neither settled nor blocked on a lock');
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    roleService = new RoleService(prisma);
    authService = new AuthService(prisma);
    await dropPauseTrigger();
  });

  beforeEach(async () => {
    await cleanup();
    const role = await prisma.role.create({
      data: { name: `${MARK}-role`, description: 'initial' },
    });
    roleId = role.id;
    const user = await prisma.user.create({
      data: {
        email: `${MARK}-user@example.com`,
        displayName: 'initial',
        passwordHash: 'not-used-in-this-test',
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    // 検証が途中で失敗しても、開いたままのトランザクションとトリガーを残さない
    releasePause?.();
    releasePause = undefined;
    await dropPauseTrigger();
  });

  afterAll(async () => {
    await dropPauseTrigger();
    await cleanup();
    await prisma.$disconnect();
  });

  describe('ロールの更新（PATCH /api/v1/roles/:id の経路）', () => {
    /**
     * @requirement user-authentication/REQ-25.8
     */
    it('同じ版からの2件を順に行うと、後の1件は ROLE_CONFLICT になり、先の1件の内容が残る', async () => {
      const { updatedAt: version } = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });

      const first = await roleService.updateRole(roleId, {
        description: FROM_A,
        expectedUpdatedAt: version,
      });
      const second = await roleService.updateRole(roleId, {
        description: FROM_B,
        expectedUpdatedAt: version,
      });
      const stored = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });

      expect(first.ok).toBe(true);
      expect({ second, description: stored.description }).toEqual({
        second: {
          ok: false,
          error: {
            type: 'ROLE_CONFLICT',
            expectedUpdatedAt: version,
            actualUpdatedAt: stored.updatedAt,
          },
        },
        description: FROM_A,
      });
      expect(stored.updatedAt.getTime()).not.toBe(version.getTime());
      // 成功した側の応答の版は保存された版と一致する（次の更新で送り返せる）
      expect(first.ok && first.value.updatedAt).toEqual(stored.updatedAt);
    });

    /**
     * @requirement user-authentication/REQ-25.8
     *
     * 先行がコミット前に止まっている間に後続が同じ版で来ると、後続は先行の行ロックを待ち、
     * 先行のコミット後に条件（updatedAt = 版）を最新の行で評価し直して 0 件になる。
     * 読んでから比べる方式では、後続は先行のコミット前の版を読んで比較を通り、双方が成功する。
     */
    it('同じ版からの2件が並行すると、後続は先行の行ロックを待ってから ROLE_CONFLICT になり、先行の内容が残る', async () => {
      const { updatedAt: version } = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
      await installPauseTrigger('roles', `NEW.description = '${FROM_A}'`);
      const holder = await holdPause();

      const preceding = roleService.updateRole(roleId, {
        description: FROM_A,
        expectedUpdatedAt: version,
      });
      await waitUntilPausedOnAdvisory();

      const contender = roleService.updateRole(roleId, {
        description: FROM_B,
        expectedUpdatedAt: version,
      });
      const contenderState = await settleOrBlock(contender);

      releasePause?.();
      releasePause = undefined;
      await holder.done;
      const precedingResult = await preceding;
      const contenderResult = await contender;
      const stored = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });

      expect({
        precedingOk: precedingResult.ok,
        contenderResult,
        description: stored.description,
        contenderState,
      }).toEqual({
        precedingOk: true,
        contenderResult: {
          ok: false,
          error: {
            type: 'ROLE_CONFLICT',
            expectedUpdatedAt: version,
            actualUpdatedAt: stored.updatedAt,
          },
        },
        description: FROM_A,
        contenderState: 'blocked',
      });
    });

    /**
     * @requirement user-authentication/REQ-25.8
     */
    it('版を与えても、ロールが無ければ競合ではなく ROLE_NOT_FOUND になる', async () => {
      const { updatedAt: version } = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
      await prisma.role.delete({ where: { id: roleId } });

      const result = await roleService.updateRole(roleId, {
        description: FROM_A,
        expectedUpdatedAt: version,
      });

      expect(result).toEqual({ ok: false, error: { type: 'ROLE_NOT_FOUND' } });
    });
  });

  describe('プロフィールの更新（PATCH /api/v1/auth/me の経路）', () => {
    /**
     * @requirement user-authentication/REQ-25.8
     */
    it('同じ版からの2件を順に行うと、後の1件は PROFILE_CONFLICT になり、先の1件の内容が残る', async () => {
      const { updatedAt: version } = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      const first = await authService.updateProfileIfUnchanged(
        userId,
        { displayName: FROM_A },
        version
      );
      const second = await authService.updateProfileIfUnchanged(
        userId,
        { displayName: FROM_B },
        version
      );
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      expect({ first, second, displayName: stored.displayName }).toEqual({
        first: { ok: true, value: undefined },
        second: {
          ok: false,
          error: {
            type: 'PROFILE_CONFLICT',
            expectedUpdatedAt: version,
            actualUpdatedAt: stored.updatedAt,
          },
        },
        displayName: FROM_A,
      });
    });

    /**
     * @requirement user-authentication/REQ-25.8
     */
    it('同じ版からの2件が並行すると、後続は先行の行ロックを待ってから PROFILE_CONFLICT になり、先行の内容が残る', async () => {
      const { updatedAt: version } = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await installPauseTrigger('users', `NEW."displayName" = '${FROM_A}'`);
      const holder = await holdPause();

      const preceding = authService.updateProfileIfUnchanged(
        userId,
        { displayName: FROM_A },
        version
      );
      await waitUntilPausedOnAdvisory();

      const contender = authService.updateProfileIfUnchanged(
        userId,
        { displayName: FROM_B },
        version
      );
      const contenderState = await settleOrBlock(contender);

      releasePause?.();
      releasePause = undefined;
      await holder.done;
      const precedingResult = await preceding;
      const contenderResult = await contender;
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      expect({
        precedingResult,
        contenderResult,
        displayName: stored.displayName,
        contenderState,
      }).toEqual({
        precedingResult: { ok: true, value: undefined },
        contenderResult: {
          ok: false,
          error: {
            type: 'PROFILE_CONFLICT',
            expectedUpdatedAt: version,
            actualUpdatedAt: stored.updatedAt,
          },
        },
        displayName: FROM_A,
        contenderState: 'blocked',
      });
    });

    /**
     * @requirement user-authentication/REQ-25.8
     *
     * HTTP の契約: 版は GET /api/v1/auth/me の updatedAt で得られ、送り返した更新は通り、
     * 同じ古い版での更新は 409 の Problem Details になって内容を変えない。版を送らない更新は従来どおり通る。
     */
    it('HTTP では、取得した版での更新は 200、古い版での更新は 409 の Problem Details、版なしの更新は従来どおり 200', async () => {
      const accessToken = await tokenService.generateAccessToken({
        userId,
        email: `${MARK}-user@example.com`,
        roles: [],
      });
      const auth = { Authorization: `Bearer ${accessToken}` };

      const me = await request(app).get('/api/v1/auth/me').set(auth);
      expect(me.status).toBe(200);
      const version = me.body.updatedAt as string;
      expect(typeof version).toBe('string');

      const fresh = await request(app)
        .patch('/api/v1/auth/me')
        .set(auth)
        .send({ displayName: FROM_A, expectedUpdatedAt: version });
      expect(fresh.status).toBe(200);
      expect(fresh.body.displayName).toBe(FROM_A);
      expect(fresh.body.updatedAt).not.toBe(version);

      const stale = await request(app)
        .patch('/api/v1/auth/me')
        .set(auth)
        .send({ displayName: FROM_B, expectedUpdatedAt: version });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({
        type: 'https://api.architrack.com/errors/conflict',
        status: 409,
        code: 'PROFILE_CONFLICT',
        details: { expectedUpdatedAt: version, actualUpdatedAt: fresh.body.updatedAt },
      });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName).toBe(
        FROM_A
      );

      const unversioned = await request(app)
        .patch('/api/v1/auth/me')
        .set(auth)
        .send({ displayName: FROM_B });
      expect(unversioned.status).toBe(200);
      expect(unversioned.body.displayName).toBe(FROM_B);
    });
  });
});
