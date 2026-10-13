/**
 * @fileoverview 並び順の個別 API が並行する要求に対しても displayOrder を重ねないことの統合検証（Task 92.4）
 *
 * Task 92.1 / 92.3 は「逐次の呼び出し」について重なりを塞いだが、検査も採番も
 * **数えてから書く**形であり、行ロックが無いため並行する2要求が互いの書き込みを見ないまま
 * 同じ検査を通過しうる窓が残っていた。Task 92.4 がその窓の実在を実測し、対象の全経路へ
 * 数量表の行ロックを入れて塞いだ。本ファイルはその決着を固定する。
 *
 * ## なぜ行ロックを単体検証で固定できないか
 *
 * モックの `$queryRaw` は足場にすぎず、ロックを外しても単体は緑のままである（Task 88.1 の
 * 学び）。決定的に検出できるのは実データベースへ接続する本ファイルだけである。
 *
 * ## 決定的にする仕掛け
 *
 * 第三のトランザクションが数量表の行を `SELECT ... FOR UPDATE` で握る。対象の経路は
 * トランザクションの最初に同じ行のロックを取るので、2本ともそこで待たされる。
 * 2本が待ちに入ったことを `pg_stat_activity` で見届けてから関門を放つと、2本は必ず
 * 直列に実行される（Task 88.1 が `saveDraft` について用いた形の流用）。
 *
 * ロックを取り除く変異を当てると、2本は待ちに入らないので待機の観測が期限切れで失敗し、
 * かつ関門を使わない検証が重なりを検出して失敗する。
 *
 * @module __tests__/integration/quantity-display-order-concurrency.api.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';

const TEST_EMAIL = 'test-qdo-concurrency-integration@example.com';
const PASSWORD = 'TestPassword123!';

describe('並び順の個別 API の並行制御（Task 92.4）', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;
  let testProjectId: string;

  const loginTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });

    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, displayName: 'QDO Concurrency Test User', passwordHash },
    });

    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    if (userRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: userRole.id } });
    }

    await prisma.permission.createMany({
      data: [
        { resource: 'quantity_table', action: 'create', description: '数量表の作成' },
        { resource: 'quantity_table', action: 'read', description: '数量表の閲覧' },
        { resource: 'quantity_table', action: 'update', description: '数量表の更新' },
        { resource: 'quantity_table', action: 'delete', description: '数量表の削除' },
      ],
      skipDuplicates: true,
    });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: 'project', action: { in: ['create', 'read', 'update', 'delete'] } },
          { resource: 'quantity_table', action: { in: ['create', 'read', 'update', 'delete'] } },
        ],
      },
    });

    if (userRole && permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: userRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD });

    return { token: response.body.accessToken, userId: user.id };
  };

  const createQuantityTable = async (name: string): Promise<string> => {
    const table = await prisma.quantityTable.create({
      data: { projectId: testProjectId, name },
    });
    return table.id;
  };

  const postGroup = (quantityTableId: string, body: Record<string, unknown>): request.Test =>
    request(app)
      .post(`/api/quantity-tables/${quantityTableId}/groups`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);

  const postItem = (groupId: string, body: Record<string, unknown>): request.Test =>
    request(app)
      .post(`/api/quantity-groups/${groupId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        majorCategory: '土工事',
        workType: '掘削',
        unit: 'm3',
        quantity: 1,
        calculationMethod: 'STANDARD',
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        ...body,
      });

  const readGroupOrders = async (quantityTableId: string): Promise<number[]> =>
    (
      await prisma.quantityGroup.findMany({
        where: { quantityTableId },
        select: { displayOrder: true },
        orderBy: { displayOrder: 'asc' },
      })
    ).map((r) => r.displayOrder);

  const readItemOrders = async (quantityGroupId: string): Promise<number[]> =>
    (
      await prisma.quantityItem.findMany({
        where: { quantityGroupId },
        select: { displayOrder: true },
        orderBy: { displayOrder: 'asc' },
      })
    ).map((r) => r.displayOrder);

  /** displayOrder に重なりが無いこと（母集団が空でないことも同時に主張する） */
  const expectNoOverlap = (orders: number[]): void => {
    expect(orders.length).toBeGreaterThan(0);
    expect(new Set(orders).size).toBe(orders.length);
  };

  /**
   * 数量表の行のロック待ちに入った接続が expected 本現れるまで待つ。
   * 期限内に現れなければ失敗させる（ロックが無い状態で検証を素通りさせないため）。
   * 時間の計測は単調時計で行う（WSL2 では壁時計が単調時計より遅れるため）。
   */
  const waitForLockWaiters = async (expected: number): Promise<void> => {
    const deadline = performance.now() + 15_000;
    let last = -1;
    while (performance.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%quantity_tables%'
      `;
      last = rows[0]?.n ?? 0;
      if (last >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      `数量表の行のロック待ちが ${expected} 本に達しなかった（最後の観測: ${last}）。` +
        '対象経路が行ロックを取っていない可能性がある'
    );
  };

  /** 数量表の行を FOR UPDATE で握り、release されるまで保持し続ける関門を開く */
  const openBarrier = (
    quantityTableId: string
  ): { started: Promise<void>; release: () => void; done: Promise<unknown> } => {
    let release!: () => void;
    const mayRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    const done = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "quantity_tables" WHERE id = ${quantityTableId} FOR UPDATE
        `;
        signalStarted();
        await mayRelease;
      },
      { timeout: 60_000 }
    );

    return { started, release, done };
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    const auth = await loginTestUser();
    accessToken = auth.token;
    testUserId = auth.userId;

    const project = await prisma.project.create({
      data: {
        name: 'テスト用プロジェクト_並び順並行制御',
        status: 'PREPARING',
        salesPersonId: testUserId,
        createdById: testUserId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    if (testProjectId) {
      await prisma.quantityTable.deleteMany({ where: { projectId: testProjectId } });
    }
  });

  describe('数量グループの作成（POST /api/quantity-tables/:quantityTableId/groups）', () => {
    it('displayOrder を省いた2本を並行させても、直列化されて別々の値が採番される', async () => {
      const tableId = await createQuantityTable('並行の採番');
      expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);
      expect((await postGroup(tableId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      const barrier = openBarrier(tableId);
      let responses: request.Response[] = [];
      try {
        await barrier.started;

        const first = postGroup(tableId, { name: '並行1' }).then((r) => r);
        await waitForLockWaiters(1);
        const second = postGroup(tableId, { name: '並行2' }).then((r) => r);
        await waitForLockWaiters(2);

        barrier.release();
        responses = await Promise.all([first, second]);
      } finally {
        barrier.release();
        await barrier.done.catch(() => undefined);
      }

      expect(responses.map((r) => r.status)).toEqual([201, 201]);
      // 2本とも成功し、採番は 2 と 3 に分かれる（重ならない）
      expect([...responses.map((r) => r.body.displayOrder as number)].sort()).toEqual([2, 3]);
      expectNoOverlap(await readGroupOrders(tableId));
    }, 90_000);

    it('同じ displayOrder を明示した2本を並行させると、後発が 400 で拒まれる', async () => {
      const tableId = await createQuantityTable('並行の明示値');
      expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);

      const barrier = openBarrier(tableId);
      let responses: request.Response[] = [];
      try {
        await barrier.started;

        const first = postGroup(tableId, { name: '並行1', displayOrder: 7 }).then((r) => r);
        await waitForLockWaiters(1);
        const second = postGroup(tableId, { name: '並行2', displayOrder: 7 }).then((r) => r);
        await waitForLockWaiters(2);

        barrier.release();
        responses = await Promise.all([first, second]);
      } finally {
        barrier.release();
        await barrier.done.catch(() => undefined);
      }

      // 一方だけが通り、他方は重複検査に掛かる
      expect([...responses.map((r) => r.status)].sort()).toEqual([201, 400]);
      const rejected = responses.find((r) => r.status === 400)!;
      expect(rejected.body.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expectNoOverlap(await readGroupOrders(tableId));
    }, 90_000);

    it('関門を使わずに同時に送っても重ならない（実利用に近い形）', async () => {
      const ROUNDS = 3;
      for (let i = 0; i < ROUNDS; i++) {
        const tableId = await createQuantityTable(`同時送信 ${i}`);
        expect((await postGroup(tableId, { name: 'A', displayOrder: 0 })).status).toBe(201);
        expect((await postGroup(tableId, { name: 'B', displayOrder: 1 })).status).toBe(201);

        const responses = await Promise.all([
          postGroup(tableId, { name: '並行1' }).then((r) => r),
          postGroup(tableId, { name: '並行2' }).then((r) => r),
        ]);

        // 2本とも成功していることを先に主張する。重なりの不在だけを見る形では、
        // 2本とも 500 で死んでも「残る並びが一意」で通過してしまう（Task 92.4 の独立レビュー）
        expect(responses.map((r) => r.status)).toEqual([201, 201]);
        expectNoOverlap(await readGroupOrders(tableId));
      }
    }, 120_000);
  });

  describe('数量項目の作成（POST /api/quantity-groups/:groupId/items）', () => {
    it('displayOrder を省いた2本を並行させても、直列化されて別々の値が採番される', async () => {
      const tableId = await createQuantityTable('項目の並行の採番');
      const created = await postGroup(tableId, { name: 'G', displayOrder: 0 });
      expect(created.status).toBe(201);
      const groupId = created.body.id as string;
      expect((await postItem(groupId, { name: 'A', displayOrder: 0 })).status).toBe(201);
      expect((await postItem(groupId, { name: 'B', displayOrder: 1 })).status).toBe(201);

      const barrier = openBarrier(tableId);
      let responses: request.Response[] = [];
      try {
        await barrier.started;

        const first = postItem(groupId, { name: '並行1' }).then((r) => r);
        await waitForLockWaiters(1);
        const second = postItem(groupId, { name: '並行2' }).then((r) => r);
        await waitForLockWaiters(2);

        barrier.release();
        responses = await Promise.all([first, second]);
      } finally {
        barrier.release();
        await barrier.done.catch(() => undefined);
      }

      expect(responses.map((r) => r.status)).toEqual([201, 201]);
      expect([...responses.map((r) => r.body.displayOrder as number)].sort()).toEqual([2, 3]);
      expectNoOverlap(await readItemOrders(groupId));
    }, 90_000);

    it('関門を使わずに同時に送っても重ならない（実利用に近い形）', async () => {
      const ROUNDS = 3;
      for (let i = 0; i < ROUNDS; i++) {
        const tableId = await createQuantityTable(`項目の同時送信 ${i}`);
        const created = await postGroup(tableId, { name: 'G', displayOrder: 0 });
        expect(created.status).toBe(201);
        const groupId = created.body.id as string;
        expect((await postItem(groupId, { name: 'A', displayOrder: 0 })).status).toBe(201);
        expect((await postItem(groupId, { name: 'B', displayOrder: 1 })).status).toBe(201);

        const responses = await Promise.all([
          postItem(groupId, { name: '並行1' }).then((r) => r),
          postItem(groupId, { name: '並行2' }).then((r) => r),
        ]);

        // 2本とも成功していることを先に主張する（上と同じ理由）
        expect(responses.map((r) => r.status)).toEqual([201, 201]);
        expectNoOverlap(await readItemOrders(groupId));
      }
    }, 120_000);
  });
});
