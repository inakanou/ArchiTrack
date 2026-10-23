// vitest.global-setup.tsで.env.testが読み込まれるため、ここでは不要
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import { hashInvitationToken } from '../../services/invitation.service.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { hash } from '@node-rs/argon2';
import {
  issuedRefreshToken,
  logoutWithCookie,
  refreshWithCookie,
} from './refresh-cookie-client.js';
import { loginForTokens } from './auth-login-client.js';
import { createTestUser } from './test-user-factory.js';

/**
 * 認証API統合テスト
 * 認証関連エンドポイントの統合動作を検証
 */
describe('Authentication API Integration Tests', () => {
  let prisma: PrismaClient;
  let adminUser: { id: string; email: string; accessToken: string; refreshToken: string };
  // let testUser: { id: string; email: string; accessToken: string; refreshToken: string };
  // let invitationToken: string;

  beforeAll(async () => {
    // Prismaクライアントの初期化
    prisma = getPrismaClient();

    // Redisの初期化
    await initRedis();

    // 管理者ロールと一般ユーザーロールを作成
    await prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: {
        name: 'admin',
        description: 'System Administrator',
        priority: 100,
        isSystem: true,
      },
    });

    await prisma.role.upsert({
      where: { name: 'user' },
      update: {},
      create: {
        name: 'user',
        description: 'Regular User',
        priority: 0,
        isSystem: true,
      },
    });

    // 事前クリーンアップ：管理者ユーザーが存在しないことを確認
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'test-auth-admin@example.com',
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: 'test-auth-admin@example.com',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: 'test-auth-admin@example.com',
      },
    });

    // テスト用管理者ユーザーを作成
    const passwordHash = await hash('AdminPassword123!', {
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    const admin = await createTestUser(prisma, {
      email: 'test-auth-admin@example.com',
      displayName: 'Test Admin',
      passwordHash,
    });

    // 管理者ロールを割り当て
    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    if (adminRole) {
      await prisma.userRole.create({
        data: {
          userId: admin.id,
          roleId: adminRole.id,
        },
      });
    }

    // 管理者としてログインしてトークンを取得
    const loginResponse = await loginForTokens(app, {
      email: 'test-auth-admin@example.com',
      password: 'AdminPassword123!',
    });

    adminUser = {
      id: admin.id,
      email: admin.email,
      accessToken: loginResponse.body.accessToken,
      refreshToken: issuedRefreshToken(loginResponse),
    };
  }, 20000); // タイムアウトを20秒に設定（DB初期化・パスワードハッシュ化・ログインを考慮）

  afterAll(async () => {
    // テストデータのクリーンアップ
    // auth.routes.test.ts で作成されたユーザーのみを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: ['test-auth-admin@example.com'],
          },
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            in: ['test-auth-admin@example.com'],
          },
        },
      },
    });

    await prisma.invitation.deleteMany({
      where: {
        email: {
          contains: 'test-auth-newuser',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: 'test-auth-admin@example.com' },
          { email: { contains: 'test-auth-newuser' } },
        ],
      },
    });

    // Redis クリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-auth-*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    // 接続を切断
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前に招待とリフレッシュトークンをクリーンアップ
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test-auth-newuser',
          },
        },
      },
    });

    await prisma.invitation.deleteMany({
      where: {
        email: {
          contains: 'test-auth-newuser',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-auth-newuser',
        },
      },
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('有効な招待トークンでユーザー登録が成功すること', async () => {
      // まず招待を作成
      await prisma.invitation.create({
        data: {
          email: 'test-auth-newuser1@example.com',
          tokenHash: hashInvitationToken('valid-invitation-token-1'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
          inviterId: adminUser.id,
        },
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: 'valid-invitation-token-1',
        displayName: 'New User 1',
        password: 'xK9#mP2$vL7@qR5!wN8', // ランダムで強力なパスワード
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(issuedRefreshToken(response)).not.toBe('');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test-auth-newuser1@example.com');
      expect(response.body.user.displayName).toBe('New User 1');
    });

    it('無効な招待トークンで登録が失敗すること', async () => {
      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: 'invalid-token',
        displayName: 'New User',
        password: 'xK9#mP2$vL7@qR5!wN8',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('期限切れの招待トークンで登録が失敗すること', async () => {
      // 期限切れの招待を作成
      await prisma.invitation.create({
        data: {
          email: 'test-auth-newuser2@example.com',
          tokenHash: hashInvitationToken('expired-invitation-token'),
          expiresAt: new Date(Date.now() - 1000), // 過去の日時
          inviterId: adminUser.id,
        },
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: 'expired-invitation-token',
        displayName: 'New User 2',
        password: 'xK9#mP2$vL7@qR5!wN8',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('弱いパスワードで登録が失敗すること', async () => {
      await prisma.invitation.create({
        data: {
          email: 'test-auth-newuser3@example.com',
          tokenHash: hashInvitationToken('valid-invitation-token-3'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: adminUser.id,
        },
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: 'valid-invitation-token-3',
        displayName: 'New User 3',
        password: 'weak', // 弱いパスワード
      });

      expect(response.status).toBe(400);
      // Problem Details形式またはWEAK_PASSWORDエラー形式
      expect(
        response.body.error || response.body.detail || response.body.title || response.body.type
      ).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // 既存のログインテストユーザーを削除
      await prisma.userRole.deleteMany({
        where: {
          user: {
            email: 'test-auth-login@example.com',
          },
        },
      });

      await prisma.user.deleteMany({
        where: {
          email: 'test-auth-login@example.com',
        },
      });

      // テストユーザーを作成
      const passwordHash = await hash('TestPassword123!', {
        memoryCost: 64 * 1024,
        timeCost: 3,
        parallelism: 4,
      });

      const user = await createTestUser(
        prisma,
        {
          email: 'test-auth-login@example.com',
          displayName: 'Login Test User',
          passwordHash,
        },
        { twoFactor: false }
      );

      // 一般ユーザーロールを割り当て
      const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
      if (userRole) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: userRole.id,
          },
        });
      }
    }, 15000); // タイムアウトを15秒に設定（パスワードハッシュ化を考慮）

    it('有効な認証情報でログインが成功すること', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'test-auth-login@example.com',
        password: 'TestPassword123!',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(issuedRefreshToken(response)).not.toBe('');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test-auth-login@example.com');
    });

    it('無効なパスワードでログインが失敗すること', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'test-auth-login@example.com',
        password: 'WrongPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('存在しないメールアドレスでログインが失敗すること', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'TestPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('有効なリフレッシュトークンで新しいアクセストークンを取得できること', async () => {
      const response = await refreshWithCookie(app, adminUser.refreshToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      // 後継は Set-Cookie だけで渡る。以降のテストは後継を使う
      adminUser.refreshToken = issuedRefreshToken(response);
    });

    it('無効なリフレッシュトークンでリフレッシュが失敗すること', async () => {
      const response = await refreshWithCookie(app, 'invalid-refresh-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('認証済みユーザーが自分の情報を取得できること', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminUser.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', 'test-auth-admin@example.com');
      expect(response.body).toHaveProperty('displayName');
      expect(response.body).toHaveProperty('roles');
    });

    it('認証トークンなしで401エラーを返すこと', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('無効なトークンで401エラーを返すこと', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/v1/auth/me', () => {
    it('認証済みユーザーが表示名を更新できること', async () => {
      const response = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminUser.accessToken}`)
        .send({
          displayName: 'Updated Admin Name',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('displayName', 'Updated Admin Name');
    });

    it('認証トークンなしで401エラーを返すこと', async () => {
      const response = await request(app).patch('/api/v1/auth/me').send({
        displayName: 'Updated Name',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/2fa/disable', () => {
    /**
     * @requirement user-authentication/REQ-34.6
     */
    it('2FA 登録済みの利用者が正しいパスワードで自己の無効化を求めても 403 で拒否し、秘密鍵・バックアップコード・セッションを残す', async () => {
      const original = await prisma.user.findUniqueOrThrow({
        where: { id: adminUser.id },
        select: { twoFactorEnabled: true, twoFactorSecret: true },
      });
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { twoFactorEnabled: true, twoFactorSecret: 'test-auth-2fa-disable-secret' },
      });
      await prisma.twoFactorBackupCode.create({
        data: { userId: adminUser.id, codeHash: 'test-auth-2fa-disable-code-hash' },
      });
      const refreshTokensBefore = await prisma.refreshToken.count({
        where: { userId: adminUser.id },
      });

      try {
        expect(refreshTokensBefore).toBeGreaterThan(0);

        const response = await request(app)
          .post('/api/v1/auth/2fa/disable')
          .set('Authorization', `Bearer ${adminUser.accessToken}`)
          .send({ password: 'AdminPassword123!' });

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
          status: 403,
          code: 'TWO_FACTOR_DISABLE_NOT_ALLOWED',
          instance: '/api/v1/auth/2fa/disable',
        });

        const after = await prisma.user.findUniqueOrThrow({
          where: { id: adminUser.id },
          select: { twoFactorEnabled: true, twoFactorSecret: true },
        });
        expect(after).toEqual({
          twoFactorEnabled: true,
          twoFactorSecret: 'test-auth-2fa-disable-secret',
        });
        expect(await prisma.twoFactorBackupCode.count({ where: { userId: adminUser.id } })).toBe(1);
        expect(await prisma.refreshToken.count({ where: { userId: adminUser.id } })).toBe(
          refreshTokensBefore
        );
      } finally {
        await prisma.twoFactorBackupCode.deleteMany({ where: { userId: adminUser.id } });
        await prisma.user.update({ where: { id: adminUser.id }, data: original });
      }
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('認証済みユーザーがログアウトできること', async () => {
      const response = await logoutWithCookie(app, adminUser.accessToken, adminUser.refreshToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('認証トークンなしで401エラーを返すこと', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [`refreshToken=${adminUser.refreshToken}`]);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/logout-all', () => {
    it('認証済みユーザーが全デバイスからログアウトできること', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${adminUser.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('認証トークンなしで401エラーを返すこと', async () => {
      const response = await request(app).post('/api/v1/auth/logout-all');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/verify-2fa', () => {
    /**
     * @requirement user-authentication/REQ-32.2
     * @requirement user-authentication/REQ-32.5
     */
    it('2FA 待ちの資格の無い検証は、アクセストークンを添えても 401 INVALID_CHALLENGE を返しトークンを発行しない', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${adminUser.accessToken}`)
        .send({ code: '123456', email: 'test-auth-admin@example.com' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CHALLENGE');
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.headers['set-cookie'] ?? []).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^refreshToken=[^;]+/)])
      );
    });

    /**
     * @requirement user-authentication/REQ-32.5
     */
    it('アクセストークンを資格として送った検証は 401 INVALID_CHALLENGE を返す', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .send({ challengeToken: adminUser.accessToken, code: '123456' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CHALLENGE');
    });
  });
});
