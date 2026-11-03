/**
 * @fileoverview 利用者の棚卸しの API の統合検証（user-authentication タスク49.5）
 *
 * Requirements (user-authentication):
 * - REQ-36.10: 全利用者の表示名・メールアドレス・ロール・状態・2FA 登録・最終ログイン・作成日時・招待者を返す
 * - REQ-36.11: 状態と最終ログインからの経過日数で絞り込む（組み合わせを含む）
 * - REQ-36.12: 一般ユーザーの取得を 403 で拒否する
 *
 * モックを使わず、本物のアプリ（認証ミドルウェア・権限の確認・ルート・エラーハンドラー）と実 PostgreSQL・
 * 実 Redis を通す。共有の DB には seed の利用者が居るため、件数の絶対値でなく本試験が作った印の付いた
 * 利用者で結果を確かめる。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../utils/seed-helpers.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { createTestUser, type TestUserData, type TestUserState } from './test-user-factory.js';

const MARK = 'test-49-5-user-inventory';
const DAY_MS = 24 * 60 * 60 * 1000;
const INVENTORY_PATH = '/api/v1/users/inventory';

interface InventoryItem {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  status: 'active' | 'inactive';
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedBy: { id: string; displayName: string } | null;
}

function daysBeforeNow(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

describe('利用者の棚卸しの API（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    // 招待者の参照（invited_by_id）は SetNull のため、順を問わず消せる
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function createUser(
    label: string,
    roleName: string,
    data: Partial<TestUserData> = {},
    state: TestUserState = {}
  ) {
    const user = await createTestUser(
      prisma,
      {
        email: `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`,
        displayName: `${MARK}-${label}`,
        passwordHash: 'not-used-for-login',
        ...data,
      },
      state
    );
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }

  async function bearerFor(
    user: { id: string; email: string },
    role: string
  ): Promise<[string, string]> {
    const accessToken = await tokenService.generateAccessToken({
      accessTokenGeneration: 0,
      userId: user.id,
      email: user.email,
      roles: [role],
    });
    return ['Authorization', `Bearer ${accessToken}`];
  }

  /** 全ページを読み、本試験の印の付いた利用者だけを返す（並びは API の順のまま） */
  async function fetchMarked(
    bearer: [string, string],
    query: Record<string, string> = {}
  ): Promise<InventoryItem[]> {
    const marked: InventoryItem[] = [];
    for (let page = 1; ; page++) {
      const response = await request(app)
        .get(INVENTORY_PATH)
        .query({ ...query, page: String(page), limit: '100' })
        .set(...bearer);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const body = response.body as {
        data: InventoryItem[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body.pagination.page).toBe(page);
      expect(body.pagination.limit).toBe(100);
      marked.push(...body.data.filter((item) => item.email.includes(MARK)));
      if (page >= body.pagination.totalPages) {
        return marked;
      }
    }
  }

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
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  /** 棚卸しの対象の利用者（最終ログイン・作成日時・状態を固定する） */
  async function createInventoryTargets(inviterId: string) {
    return {
      // 有効・最終ログイン 100 日前・招待者あり・2FA 未登録
      oldLogin: await createUser(
        'old-login',
        'user',
        {
          lastLoginAt: daysBeforeNow(100),
          createdAt: daysBeforeNow(300),
          invitedBy: { connect: { id: inviterId } },
        },
        { twoFactor: false }
      ),
      // 有効・最終ログイン 10 日前（作成は古くても最終ログインで数える）
      recentLogin: await createUser('recent-login', 'user', {
        lastLoginAt: daysBeforeNow(10),
        createdAt: daysBeforeNow(400),
      }),
      // 無効・最終ログイン 200 日前
      inactiveOld: await createUser(
        'inactive-old',
        'user',
        { lastLoginAt: daysBeforeNow(200), createdAt: daysBeforeNow(500) },
        { isActive: false }
      ),
      // 無効・最終ログイン 5 日前
      inactiveRecent: await createUser(
        'inactive-recent',
        'user',
        { lastLoginAt: daysBeforeNow(5), createdAt: daysBeforeNow(50) },
        { isActive: false }
      ),
      // 有効・ログインの実績なし・作成 120 日前（作成日時から数える）
      neverOld: await createUser('never-old', 'user', {
        lastLoginAt: null,
        createdAt: daysBeforeNow(120),
      }),
      // 有効・ログインの実績なし・作成 5 日前
      neverRecent: await createUser('never-recent', 'user', {
        lastLoginAt: null,
        createdAt: daysBeforeNow(5),
      }),
    };
  }

  /**
   * @requirement user-authentication/REQ-36.10
   */
  it('全利用者の表示名・メールアドレス・ロール・状態・2FA 登録・最終ログイン・作成日時・招待者を返し、秘密の値を含めない', async () => {
    const admin = await createUser('admin', 'admin');
    const targets = await createInventoryTargets(admin.id);
    const multiRole = await createUser('multi-role', 'user', {
      lastLoginAt: daysBeforeNow(1),
      createdAt: daysBeforeNow(2),
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: multiRole.id, roleId: adminRole.id } });

    const items = await fetchMarked(await bearerFor(admin, 'admin'));

    // 本試験の全員（管理者自身・無効な利用者を含む）が一覧に載る
    expect(items.map((item) => item.id).sort()).toEqual(
      [admin.id, multiRole.id, ...Object.values(targets).map((u) => u.id)].sort()
    );

    const oldLogin = items.find((item) => item.id === targets.oldLogin.id)!;
    expect(oldLogin).toEqual({
      id: targets.oldLogin.id,
      displayName: `${MARK}-old-login`,
      email: targets.oldLogin.email,
      roles: ['user'],
      status: 'active',
      twoFactorEnabled: false,
      lastLoginAt: targets.oldLogin.lastLoginAt!.toISOString(),
      createdAt: targets.oldLogin.createdAt.toISOString(),
      invitedBy: { id: admin.id, displayName: `${MARK}-admin` },
    });

    const inactiveOld = items.find((item) => item.id === targets.inactiveOld.id)!;
    expect(inactiveOld.status).toBe('inactive');
    expect(inactiveOld.twoFactorEnabled).toBe(true);
    expect(inactiveOld.invitedBy).toBeNull();

    const neverOld = items.find((item) => item.id === targets.neverOld.id)!;
    expect(neverOld.lastLoginAt).toBeNull();

    // ロールはロール名で、優先度の高い順
    expect(items.find((item) => item.id === multiRole.id)!.roles).toEqual(['admin', 'user']);

    // 秘密の値の項目を含めない
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'createdAt',
          'displayName',
          'email',
          'id',
          'invitedBy',
          'lastLoginAt',
          'roles',
          'status',
          'twoFactorEnabled',
        ].sort()
      );
    }
  });

  /**
   * @requirement user-authentication/REQ-36.10
   */
  it('ログインの実績が無い利用者を先に、続いて最終ログインの古い順に並べる', async () => {
    const admin = await createUser('admin', 'admin', { createdAt: daysBeforeNow(1) });
    const targets = await createInventoryTargets(admin.id);

    const items = await fetchMarked(await bearerFor(admin, 'admin'));

    expect(items.map((item) => item.id)).toEqual([
      // ログインの実績なし（作成日時の古い順）
      targets.neverOld.id,
      targets.neverRecent.id,
      admin.id,
      // 最終ログインの古い順
      targets.inactiveOld.id,
      targets.oldLogin.id,
      targets.recentLogin.id,
      targets.inactiveRecent.id,
    ]);
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it('状態で絞り込む', async () => {
    const admin = await createUser('admin', 'admin');
    const targets = await createInventoryTargets(admin.id);
    const bearer = await bearerFor(admin, 'admin');

    const inactive = await fetchMarked(bearer, { status: 'inactive' });
    expect(inactive.map((item) => item.id).sort()).toEqual(
      [targets.inactiveOld.id, targets.inactiveRecent.id].sort()
    );
    expect(inactive.every((item) => item.status === 'inactive')).toBe(true);

    const active = await fetchMarked(bearer, { status: 'active' });
    expect(active.map((item) => item.id).sort()).toEqual(
      [
        admin.id,
        targets.oldLogin.id,
        targets.recentLogin.id,
        targets.neverOld.id,
        targets.neverRecent.id,
      ].sort()
    );
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it('最終ログインからの経過日数で絞り込み、ログインの実績が無い利用者は作成日時から数える', async () => {
    const admin = await createUser('admin', 'admin');
    const targets = await createInventoryTargets(admin.id);
    const bearer = await bearerFor(admin, 'admin');

    const over90 = await fetchMarked(bearer, { inactiveDaysAtLeast: '90' });
    expect(over90.map((item) => item.id).sort()).toEqual(
      [targets.oldLogin.id, targets.inactiveOld.id, targets.neverOld.id].sort()
    );

    // 境界: 経過 100 日の利用者は 100 日以上に入り、101 日以上に入らない
    const over100 = await fetchMarked(bearer, { inactiveDaysAtLeast: '100' });
    expect(over100.map((item) => item.id)).toContain(targets.oldLogin.id);
    const over101 = await fetchMarked(bearer, { inactiveDaysAtLeast: '101' });
    expect(over101.map((item) => item.id)).not.toContain(targets.oldLogin.id);
    expect(over101.map((item) => item.id).sort()).toEqual(
      [targets.inactiveOld.id, targets.neverOld.id].sort()
    );
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it('状態と経過日数を組み合わせて絞り込む', async () => {
    const admin = await createUser('admin', 'admin');
    const targets = await createInventoryTargets(admin.id);
    const bearer = await bearerFor(admin, 'admin');

    const activeOver90 = await fetchMarked(bearer, { status: 'active', inactiveDaysAtLeast: '90' });
    expect(activeOver90.map((item) => item.id).sort()).toEqual(
      [targets.oldLogin.id, targets.neverOld.id].sort()
    );

    const inactiveOver30 = await fetchMarked(bearer, {
      status: 'inactive',
      inactiveDaysAtLeast: '30',
    });
    expect(inactiveOver30.map((item) => item.id)).toEqual([targets.inactiveOld.id]);
  });

  it('ページの件数とページ情報を返す', async () => {
    const admin = await createUser('admin', 'admin');
    await createInventoryTargets(admin.id);

    const response = await request(app)
      .get(INVENTORY_PATH)
      .query({ page: '1', limit: '2' })
      .set(...(await bearerFor(admin, 'admin')));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    const total = await prisma.user.count();
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total,
      totalPages: Math.ceil(total / 2),
    });
  });

  /**
   * @requirement user-authentication/REQ-36.12
   */
  it('一般ユーザー（user ロール）の取得を 403 で拒否する', async () => {
    const general = await createUser('general', 'user');

    const response = await request(app)
      .get(INVENTORY_PATH)
      .set(...(await bearerFor(general, 'user')));

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('data');
  });

  it('認証の無い取得を 401 で拒否する', async () => {
    const response = await request(app).get(INVENTORY_PATH);

    expect(response.status).toBe(401);
  });

  it.each([
    { status: 'locked' },
    { inactiveDaysAtLeast: '-1' },
    { inactiveDaysAtLeast: '1.5' },
    { inactiveDaysAtLeast: 'abc' },
    { page: '0' },
    { limit: '101' },
  ])('不正なクエリ %j を 400 VALIDATION_ERROR で返す', async (query) => {
    const admin = await createUser('admin', 'admin');

    const response = await request(app)
      .get(INVENTORY_PATH)
      .query(query)
      .set(...(await bearerFor(admin, 'admin')));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
