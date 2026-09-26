/**
 * @fileoverview 認証系の書き込みの ACID 特性の統合検証（タスク35.6）
 *
 * design.md は認証系の書き込みの ACID 特性を次のように定めている。
 * - 原子性: 各フローの書き込みは一つの $transaction で行う（失敗注入による検証は auth-write-atomicity の統合テスト）
 * - 分離性: PostgreSQL の既定の READ COMMITTED に依拠し、アプリケーションは分離レベルを上げも下げもしない
 * - 一貫性: 並行する書き込みの間の重複は、事前の確認ではなくデータベースの一意制約が防ぐ
 * - 永続性: PostgreSQL の既定（fsync・synchronous_commit が on）に依拠し、アプリケーションは緩めない
 *
 * ここではそれらの前提を実データベースで確かめる。分離レベルは設定値を読むだけでなく、
 * 認証系の各フローが実際に書き込んだトランザクションの中で PostgreSQL のトリガーに観測させる。
 * サービスや Prisma クライアントが分離レベルを指定すれば、観測値が変わって赤くなる。
 *
 * トリガーと観測用の表は本ファイル専用の名前（接頭辞 ua356_）で作り、終了時に必ず外す。
 * 統合検証は1ワーカーで逐次に走る（vitest.config.ts の maxWorkers: 1）ため、他のファイルへ漏れない。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'crypto';
import type { Queue } from 'bull';
import type { Transporter } from 'nodemailer';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import { AuthService } from '../../services/auth.service.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { UserRoleService } from '../../services/user-role.service.js';
import { RolePermissionService } from '../../services/role-permission.service.js';
import { PasswordService } from '../../services/password.service.js';
import { EmailService } from '../../services/email.service.js';
import { seedRoles } from '../../utils/seed-helpers.js';

const MARK = 'test-ua356-acid';
const DOCUMENTED_ISOLATION = 'read committed';
const OBSERVATION_TABLE = 'ua356_observed_isolation';
const OBSERVE_FUNCTION = 'ua356_observe_isolation';
/** 認証系の書き込みが触れる表。各表の書き込みがどの分離レベルで行われたかを観測する */
const OBSERVED_TABLES = [
  'users',
  'invitations',
  'user_roles',
  'role_permissions',
  'password_reset_tokens',
  'audit_logs',
] as const;

function triggerNameOf(table: string): string {
  return `ua356_observe_${table}`;
}

describe('認証系の書き込みの ACID 特性（統合）', () => {
  let prisma: PrismaClient;
  let auditLogService: AuditLogService;
  let userRoleService: UserRoleService;

  let actorId: string;
  let targetUserId: string;
  let roleAId: string;
  let roleBId: string;
  let permAId: string;
  let permBId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const roles = await prisma.role.findMany({
      where: { name: { startsWith: MARK } },
      select: { id: true },
    });
    const roleIds = roles.map((r) => r.id);
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }] },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.invitation.deleteMany({ where: { email: { contains: MARK } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.permission.deleteMany({ where: { resource: MARK } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await seedRoles(prisma);
  });

  beforeEach(async () => {
    await cleanup();

    const actor = await prisma.user.create({
      data: {
        email: `${MARK}-actor@example.com`,
        displayName: 'ACID Actor',
        passwordHash: 'not-used-in-this-test',
      },
    });
    actorId = actor.id;
    const target = await prisma.user.create({
      data: {
        email: `${MARK}-target@example.com`,
        displayName: 'ACID Target',
        passwordHash: 'not-used-in-this-test',
      },
    });
    targetUserId = target.id;

    const roleA = await prisma.role.create({
      data: { name: `${MARK}-role-a`, description: 'acid a' },
    });
    const roleB = await prisma.role.create({
      data: { name: `${MARK}-role-b`, description: 'acid b' },
    });
    roleAId = roleA.id;
    roleBId = roleB.id;

    const permA = await prisma.permission.create({
      data: { resource: MARK, action: 'a', description: 'acid a' },
    });
    const permB = await prisma.permission.create({
      data: { resource: MARK, action: 'b', description: 'acid b' },
    });
    permAId = permA.id;
    permBId = permB.id;

    auditLogService = new AuditLogService({ prisma });
    userRoleService = new UserRoleService(prisma, undefined, auditLogService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('分離性と永続性の前提（要件25.4）', () => {
    /**
     * @requirement user-authentication/REQ-25.4
     *
     * 設定値を読むだけの検証だが、トートロジーではない。design.md の分離性・永続性の主張は
     * 「アプリケーションの Prisma クライアント（接続プール・既定のトランザクション設定を含む）を通した
     * トランザクションが、この値で動く」という環境の前提に依拠しており、ここはその前提を固定する。
     * 接続文字列やプールの設定（例: options の -c synchronous_commit=off）、クライアントの
     * transactionOptions、データベース側の既定値のいずれかが変われば赤くなる。
     */
    it('アプリケーションのクライアントで開いたトランザクションは READ COMMITTED で、コミットは同期的に永続化される', async () => {
      const settings = await prisma.$transaction(async (tx) => {
        const [isolation] = await tx.$queryRawUnsafe<{ transaction_isolation: string }[]>(
          'SHOW transaction_isolation'
        );
        const [synchronousCommit] =
          await tx.$queryRawUnsafe<{ synchronous_commit: string }[]>('SHOW synchronous_commit');
        const [fsync] = await tx.$queryRawUnsafe<{ fsync: string }[]>('SHOW fsync');
        return {
          isolation: isolation?.transaction_isolation,
          synchronousCommit: synchronousCommit?.synchronous_commit,
          fsync: fsync?.fsync,
        };
      });

      expect(settings).toEqual({
        isolation: DOCUMENTED_ISOLATION,
        synchronousCommit: 'on',
        fsync: 'on',
      });
    });
  });

  describe('認証系の各フローが書き込んだトランザクションの分離レベル（要件25.4）', () => {
    beforeAll(async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS ${OBSERVATION_TABLE} (table_name text NOT NULL, operation text NOT NULL, isolation text NOT NULL)`
      );
      await prisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION ${OBSERVE_FUNCTION}() RETURNS trigger AS $$ BEGIN INSERT INTO ${OBSERVATION_TABLE} VALUES (TG_TABLE_NAME, TG_OP, current_setting('transaction_isolation')); RETURN NULL; END; $$ LANGUAGE plpgsql`
      );
      for (const table of OBSERVED_TABLES) {
        await prisma.$executeRawUnsafe(
          `CREATE OR REPLACE TRIGGER ${triggerNameOf(table)} AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION ${OBSERVE_FUNCTION}()`
        );
      }
    });

    beforeEach(async () => {
      // 準備の書き込みの観測を捨て、検証対象のフローの観測だけを残す
      await prisma.$executeRawUnsafe(`DELETE FROM ${OBSERVATION_TABLE}`);
    });

    afterAll(async () => {
      for (const table of OBSERVED_TABLES) {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS ${triggerNameOf(table)} ON ${table}`
        );
      }
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${OBSERVE_FUNCTION}()`);
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${OBSERVATION_TABLE}`);
    });

    async function observations(): Promise<
      { table_name: string; operation: string; isolation: string }[]
    > {
      return prisma.$queryRawUnsafe(
        `SELECT table_name, operation, isolation FROM ${OBSERVATION_TABLE} ORDER BY table_name, operation`
      );
    }

    /**
     * 観測が空のまま素通りしないよう、期待する表・操作がすべて観測されたことも主張する
     */
    async function expectAllWritesAtDocumentedIsolation(
      expectedWrites: { table_name: string; operation: string }[]
    ): Promise<void> {
      const observed = await observations();
      for (const write of expectedWrites) {
        expect(observed).toContainEqual({ ...write, isolation: expect.any(String) });
      }
      expect(observed.length).toBeGreaterThan(0);
      for (const row of observed) {
        expect(row).toEqual({ ...row, isolation: DOCUMENTED_ISOLATION });
      }
    }

    /**
     * @requirement user-authentication/REQ-25.4
     */
    it('ユーザー登録（ユーザー作成・招待の使用済み化・既定ロールの割り当て）は READ COMMITTED で書き込まれる', async () => {
      const token = randomBytes(32).toString('hex');
      await prisma.invitation.create({
        data: {
          email: `${MARK}-invitee@example.com`,
          token,
          inviterId: actorId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await prisma.$executeRawUnsafe(`DELETE FROM ${OBSERVATION_TABLE}`);

      const result = await new AuthService(prisma).register(token, {
        password: 'Ac1d!Isolation#2026',
        displayName: 'ACID Invitee',
      });

      expect(result.ok).toBe(true);
      await expectAllWritesAtDocumentedIsolation([
        { table_name: 'users', operation: 'INSERT' },
        { table_name: 'invitations', operation: 'UPDATE' },
        { table_name: 'user_roles', operation: 'INSERT' },
      ]);
    });

    /**
     * @requirement user-authentication/REQ-25.4
     */
    it('ロールの一括割り当て・一括削除と監査ログは READ COMMITTED で書き込まれる', async () => {
      const added = await userRoleService.addRolesToUser(targetUserId, [roleAId, roleBId], actorId);
      expect(added.ok).toBe(true);
      const removed = await userRoleService.removeRolesFromUser(targetUserId, [roleAId, roleBId]);
      expect(removed.ok).toBe(true);

      await expectAllWritesAtDocumentedIsolation([
        { table_name: 'user_roles', operation: 'INSERT' },
        { table_name: 'user_roles', operation: 'DELETE' },
        { table_name: 'audit_logs', operation: 'INSERT' },
      ]);
    });

    /**
     * @requirement user-authentication/REQ-25.4
     */
    it('ロールへの権限の一括追加・一括削除と監査ログは READ COMMITTED で書き込まれる', async () => {
      const rolePermissionService = new RolePermissionService(prisma, undefined, auditLogService);
      const added = await rolePermissionService.addPermissionsToRole(
        roleAId,
        [permAId, permBId],
        actorId
      );
      expect(added.ok).toBe(true);
      const removed = await rolePermissionService.removePermissionsFromRole(
        roleAId,
        [permAId, permBId],
        actorId
      );
      expect(removed.ok).toBe(true);

      await expectAllWritesAtDocumentedIsolation([
        { table_name: 'role_permissions', operation: 'INSERT' },
        { table_name: 'role_permissions', operation: 'DELETE' },
        { table_name: 'audit_logs', operation: 'INSERT' },
      ]);
    });

    /**
     * @requirement user-authentication/REQ-25.4
     */
    it('パスワードリセット要求（リセットトークンと監査ログ）は READ COMMITTED で書き込まれる', async () => {
      const queue = { add: vi.fn().mockResolvedValue(undefined), process: vi.fn() };
      const unusedTransporter = { sendMail: vi.fn() } as unknown as Transporter;
      const passwordService = new PasswordService(
        prisma,
        new EmailService(unusedTransporter, queue as unknown as Queue),
        auditLogService
      );

      const result = await passwordService.requestPasswordReset(`${MARK}-target@example.com`);

      expect(result.ok).toBe(true);
      await expectAllWritesAtDocumentedIsolation([
        { table_name: 'password_reset_tokens', operation: 'INSERT' },
        { table_name: 'audit_logs', operation: 'INSERT' },
      ]);
    });
  });

  describe('並行する書き込みの一貫性（要件25.4）', () => {
    let releaseHolder: (() => void) | undefined;

    afterEach(() => {
      // 検証が途中で失敗しても、開いたままのトランザクションを残さない
      releaseHolder?.();
      releaseHolder = undefined;
    });

    /**
     * 与えた条件に合う接続が行ロックの待ちに入るまで、pg_stat_activity を問い合わせて待つ。
     * 時間で待たず、待ちに入ったことを観測してから次へ進むため、順序が決定的になる。
     */
    async function waitUntilBlockedOnLock(queryPattern: string): Promise<void> {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const rows = await prisma.$queryRawUnsafe<{ waiting: bigint }[]>(
          `SELECT count(*) AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE $1`,
          queryPattern
        );
        if (Number(rows[0]?.waiting ?? 0) > 0) {
          return;
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error(`no backend became blocked on a lock for query like ${queryPattern}`);
    }

    /**
     * @requirement user-authentication/REQ-25.4
     *
     * READ COMMITTED では、コミット前の他のトランザクションの書き込みは見えない（ダーティリードが無い）。
     * そのため同じロールの並行する割り当ては、サービスの事前の重複確認をどちらも通り抜ける。
     * 重複を防ぐのは user_roles の一意制約で、後から来た書き込みは先の書き込みのコミットを待ってから失敗し、
     * そのトランザクション（監査ログを含む）はロールバックされる。
     */
    it('コミット前の割り当ては他から見えず、並行する同じ割り当ては一意制約で片方が失敗して重複も監査ログも残らない', async () => {
      let signalInserted!: () => void;
      const inserted = new Promise<void>((resolve) => {
        signalInserted = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });

      // 先行するトランザクション: 割り当てを書き込み、コミットせずに保持する
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.userRole.create({ data: { userId: targetUserId, roleId: roleAId } });
          signalInserted();
          await released;
        },
        { timeout: 20_000 }
      );
      await inserted;

      // ダーティリードが無い: コミット前の割り当ては他の接続から見えない
      expect(
        await prisma.userRole.count({ where: { userId: targetUserId, roleId: roleAId } })
      ).toBe(0);

      // 後続: サービスが同じ割り当てを行う。事前の重複確認は通り、INSERT が一意制約の行ロックで待つ
      const contender = userRoleService.addRoleToUser(targetUserId, roleAId, actorId);
      await waitUntilBlockedOnLock('%INSERT INTO%user_roles%');

      releaseHolder?.();
      releaseHolder = undefined;
      await holder;
      const result = await contender;

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ type: 'DATABASE_ERROR' });
      // 重複は残らない（先行の1件だけ）
      expect(
        await prisma.userRole.count({ where: { userId: targetUserId, roleId: roleAId } })
      ).toBe(1);
      // 失敗したトランザクションの監査ログも残らない
      expect(
        await prisma.auditLog.count({
          where: { targetId: targetUserId, action: 'USER_ROLE_ASSIGNED' },
        })
      ).toBe(0);
    });
  });

  describe('最後の管理者の保護の直列化（要件25.4 / 25.7）', () => {
    const PAUSE_KEY = 356356;
    const PAUSE_FUNCTION = 'ua356_pause_on_delete';
    const PAUSE_TRIGGER = 'ua356_pause_user_roles_delete';

    let adminRoleId: string;
    /** 準備が途中で失敗したときに後始末が未設定の ID を使わないよう、空文字を「未設定」とする */
    let adminXId = '';
    let adminYId = '';
    /** 検証の間だけ外しておく、本ファイル以外の admin の割り当て */
    let stashedAdminAssignments: {
      id: string;
      userId: string;
      roleId: string;
      assignedAt: Date;
    }[] = [];
    let releasePause: (() => void) | undefined;

    async function adminAssignmentCount(): Promise<number> {
      return prisma.userRole.count({ where: { roleId: adminRoleId } });
    }

    beforeEach(async () => {
      adminXId = '';
      adminYId = '';
      // 前の検証で他の admin の割り当てを戻せていなければ、上書きして失わないよう先へ進まない
      if (stashedAdminAssignments.length > 0) {
        throw new Error('stashed admin assignments from a previous test were not restored');
      }
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
      adminRoleId = adminRole.id;

      // 管理者がちょうど2人（X と Y）の状態を作る。他の admin の割り当ては外し、終了後に同じ行で戻す
      stashedAdminAssignments = await prisma.userRole.findMany({
        where: { roleId: adminRoleId },
        select: { id: true, userId: true, roleId: true, assignedAt: true },
      });
      await prisma.userRole.deleteMany({ where: { roleId: adminRoleId } });

      const adminX = await prisma.user.create({
        data: {
          email: `${MARK}-admin-x@example.com`,
          displayName: 'ACID Admin X',
          passwordHash: 'not-used-in-this-test',
        },
      });
      const adminY = await prisma.user.create({
        data: {
          email: `${MARK}-admin-y@example.com`,
          displayName: 'ACID Admin Y',
          passwordHash: 'not-used-in-this-test',
        },
      });
      adminXId = adminX.id;
      adminYId = adminY.id;
      await prisma.userRole.createMany({
        data: [
          { userId: adminXId, roleId: adminRoleId },
          { userId: adminYId, roleId: adminRoleId },
        ],
      });

      // X の admin の割り当てを削除する文を、アドバイザリロックが解放されるまで止めるトリガー
      await prisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION ${PAUSE_FUNCTION}() RETURNS trigger AS $$ BEGIN PERFORM pg_advisory_xact_lock(${PAUSE_KEY}); RETURN OLD; END; $$ LANGUAGE plpgsql`
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER ${PAUSE_TRIGGER} BEFORE DELETE ON user_roles FOR EACH ROW WHEN (OLD."userId" = '${adminXId}' AND OLD."roleId" = '${adminRoleId}') EXECUTE FUNCTION ${PAUSE_FUNCTION}()`
      );
    });

    afterEach(async () => {
      releasePause?.();
      releasePause = undefined;
      try {
        // 他の admin の割り当ての復元を最初に行う（後続の後始末が失敗しても戻っているように）
        if (stashedAdminAssignments.length > 0) {
          await prisma.userRole.createMany({
            data: stashedAdminAssignments,
            skipDuplicates: true,
          });
        }
        // 戻せたときだけ空にする（戻せなければ次の beforeEach が止まる）
        stashedAdminAssignments = [];
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${PAUSE_TRIGGER} ON user_roles`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${PAUSE_FUNCTION}()`);
        const testAdminIds = [adminXId, adminYId].filter((id) => id !== '');
        if (adminRoleId && testAdminIds.length > 0) {
          await prisma.userRole.deleteMany({
            where: { roleId: adminRoleId, userId: { in: testAdminIds } },
          });
        }
      }
    });

    /**
     * アドバイザリロックを保持するトランザクションを開き、取得できたら返す。
     * releasePause でロックを解放し（トランザクションをコミットし）、返り値の done でその完了を待つ。
     * async 関数が Promise を返すと呼び出し側の await がその完了まで待ってしまうため、オブジェクトに包んで返す。
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
      // 保持に失敗したときは待ち続けずにその失敗を投げる
      await Promise.race([held, holder]);
      return { done: holder };
    }

    /** 与えた条件に合う待ちの接続の数 */
    async function waitingBackends(condition: string): Promise<number> {
      const rows = await prisma.$queryRawUnsafe<{ waiting: bigint }[]>(
        `SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND ${condition}`
      );
      return Number(rows[0]?.waiting ?? 0);
    }

    /** 先行（X の削除）がアドバイザリロックの待ちで止まるまで待つ */
    async function waitUntilPausedOnAdvisory(): Promise<void> {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        if ((await waitingBackends(`wait_event = 'advisory'`)) > 0) {
          return;
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error('the preceding removal never paused on the advisory lock');
    }

    /**
     * 後続が終わるか、アドバイザリロック以外のロックの待ち（行ロック）に入るまで待つ。
     * 時間で待たず、どちらかを観測してから先行を再開するため、順序が決定的になる。
     */
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

    /**
     * @requirement user-authentication/REQ-25.4
     * @requirement user-authentication/REQ-25.7
     *
     * 管理者が2人のとき、X からの削除（1件）と Y からの削除（一括）が並行すると、READ COMMITTED では
     * 双方が件数 2 を読んで双方が削除しうる（write skew）。admin ロールの行のロックで判定を直列化し、
     * 後続は先行のコミットを待ってから件数 1 を読み、LAST_ADMIN_PROTECTED で失敗する。
     */
    it('異なる管理者からの admin の並行する削除は直列化され、後続は LAST_ADMIN_PROTECTED で失敗して管理者が1人残る', async () => {
      const holder = await holdPause();

      // 先行: X から admin を外す。件数の確認を済ませ、削除の文でコミット前に止まる
      const preceding = userRoleService.removeRoleFromUser(adminXId, adminRoleId);
      await waitUntilPausedOnAdvisory();

      // 後続: Y から admin を一括削除の経路で外す
      const contender = userRoleService.removeRolesFromUser(adminYId, [adminRoleId]);
      const contenderState = await settleOrBlock(contender);

      releasePause?.();
      releasePause = undefined;
      await holder.done;
      const precedingResult = await preceding;
      const contenderResult = await contender;

      // 結果と残った状態をまとめて主張する（失敗時に全体の差分が一度に読める）
      expect({
        precedingResult,
        contenderResult,
        adminCount: await adminAssignmentCount(),
        yStillAdmin: await prisma.userRole.count({
          where: { userId: adminYId, roleId: adminRoleId },
        }),
        // 後続は先行のコミットを待った（ロックで直列化された）
        contenderState,
      }).toEqual({
        precedingResult: { ok: true, value: undefined },
        contenderResult: { ok: false, error: { type: 'LAST_ADMIN_PROTECTED' } },
        adminCount: 1,
        yStillAdmin: 1,
        contenderState: 'blocked',
      });
    });

    /**
     * @requirement user-authentication/REQ-25.4
     *
     * ユーザーの削除も同じロックを取るため、admin の削除と並行しても最後の管理者は削除されない。
     */
    it('admin の削除と並行する管理者ユーザーの削除は直列化され、後続は LAST_ADMIN_PROTECTED で失敗して管理者が1人残る', async () => {
      const holder = await holdPause();

      const preceding = userRoleService.removeRoleFromUser(adminXId, adminRoleId);
      await waitUntilPausedOnAdvisory();

      // 後続: 管理者 Y のユーザーそのものを削除する
      const contender = userRoleService.deleteUser(adminYId);
      const contenderState = await settleOrBlock(contender);

      releasePause?.();
      releasePause = undefined;
      await holder.done;
      const precedingResult = await preceding;
      const contenderResult = await contender;

      expect({
        precedingResult,
        contenderResult,
        adminCount: await adminAssignmentCount(),
        yStillExists: (await prisma.user.findUnique({ where: { id: adminYId } })) !== null,
        contenderState,
      }).toEqual({
        precedingResult: { ok: true, value: undefined },
        contenderResult: { ok: false, error: { type: 'LAST_ADMIN_PROTECTED' } },
        adminCount: 1,
        yStillExists: true,
        contenderState: 'blocked',
      });
    });
  });
});
