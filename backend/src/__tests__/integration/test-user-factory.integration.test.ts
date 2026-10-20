/**
 * @fileoverview 統合テスト用の利用者の生成の部品（`test-user-factory.ts`）の検証（タスク47.3）
 *
 * 部品は、既定で 2FA 登録済み（本番と同じ暗号化で保存した秘密鍵）・有効・初回の変更を要しない利用者を作り、
 * 状態を引数で変えられる。既定の利用者がログインの補助（47.2）でアクセストークンを得られ、未登録の利用者は
 * ログインの応答がそのままトークンを返すことを、モックを使わず本物のアプリと実 PostgreSQL・実 Redis で確かめる。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { seedRoles } from '../../utils/seed-helpers.js';
import { TwoFactorService } from '../../services/two-factor.service.js';
import { loginForAccessToken } from './auth-login-client.js';
import { createTestUser, createTestUsers } from './test-user-factory.js';

const MARK = 'test-ua473-user-factory';
const PASSWORD = 'UserFactory!Passphrase-2026';

describe('統合テスト用の利用者の生成の部品', () => {
  let prisma: PrismaClient;
  let passwordHash: string;
  let email: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  async function clearRateLimits(): Promise<void> {
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('rl:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    await seedRoles(prisma);
    passwordHash = await hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await clearRateLimits();
    email = `${MARK}-${randomBytes(4).toString('hex')}@example.com`;
  });

  it('既定では 2FA 登録済み・有効・初回の変更を要しない利用者を作り、秘密鍵を本番と同じ暗号化で保存する', async () => {
    const user = await createTestUser(prisma, {
      email,
      displayName: 'Factory Default',
      passwordHash,
    });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.twoFactorEnabled).toBe(true);
    expect(stored.isActive).toBe(true);
    expect(stored.mustChangePassword).toBe(false);
    expect(stored.twoFactorSecret).not.toBeNull();
    // 平文ではなく、本番の TwoFactorService で復号できる形で保存されている
    const secret = await new TwoFactorService().decryptSecret(stored.twoFactorSecret as string);
    expect(stored.twoFactorSecret).not.toBe(secret);
    expect(authenticator.generate(secret)).toMatch(/^\d{6}$/);
  });

  it('既定の利用者のログインは 2FA の検証を求め、ログインの補助でアクセストークンを得られる', async () => {
    await createTestUser(prisma, { email, displayName: 'Factory Login', passwordHash });

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.requires2FA).toBe(true);
    expect(login.body).not.toHaveProperty('accessToken');

    const accessToken = await loginForAccessToken(app, { email, password: PASSWORD });
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  it('2FA 未登録を指定すると、秘密鍵を持たず、ログインの応答がそのままトークンを返す', async () => {
    const user = await createTestUser(
      prisma,
      { email, displayName: 'Factory Plain', passwordHash },
      { twoFactor: false }
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.twoFactorEnabled).toBe(false);
    expect(stored.twoFactorSecret).toBeNull();

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.requires2FA).not.toBe(true);
    expect(typeof login.body.accessToken).toBe('string');
  });

  it('既知の秘密鍵を指定すると、その秘密鍵を暗号化して登録する', async () => {
    const secret = authenticator.generateSecret();
    const user = await createTestUser(
      prisma,
      { email, displayName: 'Factory Known Secret', passwordHash },
      { twoFactor: { secret } }
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.twoFactorEnabled).toBe(true);
    expect(stored.twoFactorSecret).not.toBe(secret);
    expect(await new TwoFactorService().decryptSecret(stored.twoFactorSecret as string)).toBe(
      secret
    );
  });

  it('有効状態と初回の変更の要否を引数で変えられる', async () => {
    const user = await createTestUser(
      prisma,
      { email, displayName: 'Factory State', passwordHash },
      { isActive: false, mustChangePassword: true }
    );

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.isActive).toBe(false);
    expect(stored.mustChangePassword).toBe(true);
    expect(stored.twoFactorEnabled).toBe(true);
  });

  it('入れ子の作成を含むデータをそのまま渡し、トランザクションのクライアントでも作れる', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'user' } });

    const user = await prisma.$transaction((tx) =>
      createTestUser(tx, {
        email,
        displayName: 'Factory Nested',
        passwordHash,
        userRoles: { create: { roleId: role.id } },
      })
    );

    const roles = await prisma.userRole.findMany({ where: { userId: user.id } });
    expect(roles.map((r) => r.roleId)).toEqual([role.id]);
  });

  it('複数の利用者をまとめて作り、全員に同じ状態を与える', async () => {
    const users = await createTestUsers(
      prisma,
      [1, 2].map((n) => ({ email: `${n}-${email}`, displayName: `Factory ${n}`, passwordHash })),
      { twoFactor: false }
    );

    expect(users).toHaveLength(2);
    const stored = await prisma.user.findMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    expect(stored.map((u) => u.twoFactorEnabled)).toEqual([false, false]);
  });
});
