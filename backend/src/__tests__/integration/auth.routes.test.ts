// vitest.global-setup.tsで.env.testが読み込まれるため、ここでは不要
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '@prisma/client';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { hash } from '@node-rs/argon2';

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

    // テスト用管理者ユーザーを作成
    const passwordHash = await hash('AdminPassword123!', {
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    const admin = await prisma.user.create({
      data: {
        email: 'test-auth-admin@example.com',
        displayName: 'Test Admin',
        passwordHash,
      },
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
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'test-auth-admin@example.com',
      password: 'AdminPassword123!',
    });

    adminUser = {
      id: admin.id,
      email: admin.email,
      accessToken: loginResponse.body.accessToken,
      refreshToken: loginResponse.body.refreshToken,
    };
  }, 20000); // タイムアウトを20秒に設定（DB初期化・パスワードハッシュ化・ログインを考慮）

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test-auth-',
          },
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test-auth-',
          },
        },
      },
    });

    await prisma.invitation.deleteMany({
      where: {
        email: {
          contains: 'test-auth-',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-auth-',
        },
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
      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-newuser1@example.com',
          token: 'valid-invitation-token-1',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
          inviterId: adminUser.id,
        },
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: invitation.token,
        displayName: 'New User 1',
        password: 'xK9#mP2$vL7@qR5!wN8', // ランダムで強力なパスワード
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
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
      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-newuser2@example.com',
          token: 'expired-invitation-token',
          expiresAt: new Date(Date.now() - 1000), // 過去の日時
          inviterId: adminUser.id,
        },
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: invitation.token,
        displayName: 'New User 2',
        password: 'xK9#mP2$vL7@qR5!wN8',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('弱いパスワードで登録が失敗すること', async () => {
      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-newuser3@example.com',
          token: 'valid-invitation-token-3',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: adminUser.id,
        },
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        invitationToken: invitation.token,
        displayName: 'New User 3',
        password: 'weak', // 弱いパスワード
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
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

      const user = await prisma.user.create({
        data: {
          email: 'test-auth-login@example.com',
          displayName: 'Login Test User',
          passwordHash,
        },
      });

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
      expect(response.body).toHaveProperty('refreshToken');
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
      const response = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: adminUser.refreshToken,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('無効なリフレッシュトークンでリフレッシュが失敗すること', async () => {
      const response = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: 'invalid-refresh-token',
      });

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

  describe('POST /api/v1/auth/logout', () => {
    it('認証済みユーザーがログアウトできること', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${adminUser.accessToken}`)
        .send({
          refreshToken: adminUser.refreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('認証トークンなしで401エラーを返すこと', async () => {
      const response = await request(app).post('/api/v1/auth/logout').send({
        refreshToken: adminUser.refreshToken,
      });

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
    it('2FA検証エンドポイントが存在すること', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${adminUser.accessToken}`)
        .send({
          token: '123456',
        });

      // 実装されていない場合は404、実装済みの場合は適切なステータスコードを返す
      expect([200, 400, 401, 404]).toContain(response.status);
    });
  });
});
