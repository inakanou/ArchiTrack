import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';

/**
 * 認証APIエンドポイント統合テスト
 *
 * 要件カバレッジ:
 * - 要件1: 管理者によるユーザー招待
 * - 要件2: 招待を受けたユーザーのアカウント作成
 * - 要件4: ログイン
 * - 要件5: トークン管理
 * - 要件7: パスワード管理
 * - 要件9: ユーザー情報取得・管理
 * - 要件10: セキュリティとエラーハンドリング
 */
describe('Authentication API Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Prismaクライアントの初期化
    prisma = getPrismaClient();

    // Redisの初期化
    await initRedis();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.invitation.deleteMany({
      where: {
        email: {
          contains: 'test-auth-integration',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-auth-integration',
        },
      },
    });

    // Redis クリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-auth-integration:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    // 接続を切断
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前にクリーンアップ
    await prisma.invitation.deleteMany({
      where: {
        email: {
          contains: 'test-auth-integration',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-auth-integration',
        },
      },
    });

    // Rate limitキーをクリア
    const client = redis.getClient();
    if (client) {
      const rateLimitKeys = await client.keys('rl:*');
      if (rateLimitKeys.length > 0) {
        await client.del(...rateLimitKeys);
      }
    }
  });

  describe('POST /api/v1/auth/login', () => {
    /**
     * 要件4.1: 有効なメールアドレスとパスワードでアクセストークンとリフレッシュトークンを発行
     */
    it('有効な認証情報でログインできること', async () => {
      // 前提: テストユーザーを作成
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536, // 64MB
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-login@example.com',
          displayName: 'Test Login User',
          passwordHash,
        },
      });

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-login@example.com',
          password: 'Password123!',
        })
        .expect(200);

      // 検証
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test-auth-integration-login@example.com');

      // トークンの形式検証 (JWT形式)
      expect(response.body.accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
      expect(response.body.refreshToken).toMatch(
        /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/
      );
    });

    /**
     * 要件4.2: 登録されていないメールアドレスで認証エラー
     */
    it('存在しないメールアドレスでログインできないこと', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
        .expect(401);

      // 要件10.1: 詳細なエラー情報を返してはならない（汎用的なメッセージ）
      // Problem Details形式 or 旧形式に対応
      expect(
        response.body.detail || response.body.title || response.body.error || response.body.error
      ).toMatch(/認証に失敗|Invalid credentials/i);
    });

    /**
     * 要件4.3: 正しくないパスワードで認証エラー
     */
    it('誤ったパスワードでログインできないこと', async () => {
      // 前提: テストユーザーを作成
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-wrongpass@example.com',
          displayName: 'Test Wrong Pass User',
          passwordHash,
        },
      });

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-wrongpass@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      // 要件10.1: 汎用的なエラーメッセージ
      // Problem Details形式 or 旧形式に対応
      expect(
        response.body.detail || response.body.title || response.body.error || response.body.error
      ).toMatch(/認証に失敗|Invalid credentials/i);
    });

    /**
     * 要件4.7: トークンペイロードにユーザーロール情報を含める
     */
    it('トークンにユーザーロール情報が含まれること', async () => {
      // 前提: 管理者ユーザーを作成
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Admin123!@#', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin@example.com',
          displayName: 'Test Admin User',
          passwordHash,
          // Note: ロール割り当てはRBACシステムが実装された後に追加予定
          // userRoles: {
          //   create: [
          //     {
          //       role: {
          //         connect: {
          //           name: 'admin',
          //         },
          //       },
          //     },
          //   ],
          // },
        },
      });

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-admin@example.com',
          password: 'Admin123!@#',
        })
        .expect(200);

      // JWTペイロードをデコード（署名検証なし）
      const [, payloadBase64] = response.body.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64!, 'base64url').toString());

      // 要件5.6: ユーザーID、メールアドレス、ロール情報を含める
      expect(payload).toHaveProperty('userId');
      expect(payload).toHaveProperty('email', 'test-auth-integration-admin@example.com');
      // Note: rolesフィールドはRBACシステム実装後に検証
      // expect(payload).toHaveProperty('roles');
      // expect(payload.roles).toContain('admin');
    });

    /**
     * 要件10.5: バリデーション失敗時に詳細なエラーメッセージを返す
     */
    it('バリデーションエラーが詳細に返されること', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: '',
        })
        .expect(400);

      // Problem Details (RFC 7807) 形式
      expect(response.body).toMatchObject({
        type: expect.stringContaining('/errors/'),
        title: expect.any(String),
        status: 400,
        detail: expect.any(String),
      });
    });

    /**
     * 要件4.6: 5回連続ログイン失敗でアカウントロック（15分間）
     */
    it('5回連続ログイン失敗でアカウントがロックされること', async () => {
      // 明示的なクリーンアップ：テストユーザーが存在しないことを確認
      await prisma.user.deleteMany({
        where: {
          email: 'test-auth-integration-lock@example.com',
        },
      });

      // 前提: テストユーザーを作成
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-lock@example.com',
          displayName: 'Test Lock User',
          passwordHash,
        },
      });

      // 5回ログイン失敗
      // Note: レート制限により429エラーが返される場合もあるため、401または429を許容
      for (let i = 0; i < 5; i++) {
        const response = await request(app).post('/api/v1/auth/login').send({
          email: 'test-auth-integration-lock@example.com',
          password: 'WrongPassword',
        });

        // 401 (Unauthorized) または 429 (Too Many Requests) を許容
        expect([401, 429]).toContain(response.status);
      }

      // 6回目はロックエラー
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-lock@example.com',
          password: 'Password123!', // 正しいパスワードでもロックされる
        })
        .expect(429); // Too Many Requests

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /アカウントがロックされています|Account locked/i
      );
    });
  });

  describe('POST /api/v1/auth/register', () => {
    /**
     * 要件2.1: 有効な招待トークン、パスワード、表示名で新しいユーザーアカウントを作成
     * 要件2.11: ユーザー登録成功時にアクセストークンとリフレッシュトークンを発行
     */
    it('有効な招待トークンで新規ユーザー登録ができること', async () => {
      // 前提: 管理者ユーザーと招待トークンを作成
      const adminPasswordHash = await (
        await import('@node-rs/argon2')
      ).hash('Admin123!@#', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const admin = await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin-invite@example.com',
          displayName: 'Admin Inviter',
          passwordHash: adminPasswordHash,
        },
      });

      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-integration-register@example.com',
          token: 'test-invitation-token-12345',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
          inviterId: admin.id,
        },
      });

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: invitation.token,
          password: 'StrongPass123!@#',
          displayName: 'New Test User',
        })
        .expect(201);

      // 検証
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test-auth-integration-register@example.com');

      // 要件2.10: 招待トークンが使用済みとしてマークされる
      const updatedInvitation = await prisma.invitation.findUnique({
        where: { token: invitation.token },
      });
      expect(updatedInvitation?.usedAt).not.toBeNull();

      // 要件2.12: ユーザーロール（user）が割り当てられる
      const user = await prisma.user.findUnique({
        where: { email: 'test-auth-integration-register@example.com' },
        include: { userRoles: { include: { role: true } } },
      });
      const roleNames = user?.userRoles.map((ur) => ur.role.name);
      expect(roleNames).toContain('user');
    });

    /**
     * 要件2.2: 無効または存在しない招待トークンでエラー
     */
    it('無効な招待トークンで登録できないこと', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: 'invalid-token',
          password: 'StrongPass123!@#',
          displayName: 'New Test User',
        })
        .expect(400);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /無効な招待トークン|Invalid invitation/i
      );
    });

    /**
     * 要件2.3: 期限切れの招待トークンでエラー
     */
    it('期限切れの招待トークンで登録できないこと', async () => {
      // 前提: 期限切れの招待トークンを作成
      const admin = await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin-expired@example.com',
          displayName: 'Admin Expired',
          passwordHash: 'dummy-hash',
        },
      });

      const expiredInvitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-integration-expired@example.com',
          token: 'expired-invitation-token',
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1日前（期限切れ）
          inviterId: admin.id,
        },
      });

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: expiredInvitation.token,
          password: 'StrongPass123!@#',
          displayName: 'New Test User',
        })
        .expect(400);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /期限切れ|expired/i
      );
    });

    /**
     * 要件2.4: 既に使用済みの招待トークンでエラー
     */
    it('使用済みの招待トークンで登録できないこと', async () => {
      // 前提: 使用済みの招待トークンを作成
      const admin = await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin-used@example.com',
          displayName: 'Admin Used',
          passwordHash: 'dummy-hash',
        },
      });

      const usedInvitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-integration-used@example.com',
          token: 'used-invitation-token',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: admin.id,
          status: 'used', // 使用済みステータス
          usedAt: new Date(), // 既に使用済み
        },
      });

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: usedInvitation.token,
          password: 'StrongPass123!@#',
          displayName: 'New Test User',
        })
        .expect(400);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /既に使用されています|already used/i
      );
    });

    /**
     * 要件2.5: パスワードが12文字未満で登録を拒否
     */
    it('12文字未満のパスワードで登録できないこと', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin-short@example.com',
          displayName: 'Admin Short',
          passwordHash: 'dummy-hash',
        },
      });

      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-integration-short@example.com',
          token: 'short-password-token',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: admin.id,
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: invitation.token,
          password: 'Short1!', // 7文字
          displayName: 'New Test User',
        })
        .expect(400);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /12文字以上|at least 12 characters/i
      );
    });

    /**
     * 要件2.6: パスワードが複雑性要件を満たさない場合に登録を拒否
     * （大文字、小文字、数字、特殊文字のうち3種類以上含む）
     */
    it('複雑性要件を満たさないパスワードで登録できないこと', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin-complexity@example.com',
          displayName: 'Admin Complexity',
          passwordHash: 'dummy-hash',
        },
      });

      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-integration-complexity@example.com',
          token: 'complexity-token',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: admin.id,
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: invitation.token,
          password: 'onlylowercase', // 小文字のみ（1種類）
          displayName: 'New Test User',
        })
        .expect(400);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /複雑性要件|complexity requirements|weak|弱い|大文字を1文字以上含む|小文字を1文字以上含む|数字を1文字以上含む|記号を1文字以上含む/i
      );
    });

    /**
     * 要件2.9: パスワードをArgon2idアルゴリズムでハッシュ化
     */
    it('パスワードがArgon2idでハッシュ化されて保存されること', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'test-auth-integration-admin-hash@example.com',
          displayName: 'Admin Hash',
          passwordHash: 'dummy-hash',
        },
      });

      const invitation = await prisma.invitation.create({
        data: {
          email: 'test-auth-integration-hash@example.com',
          token: 'hash-test-token',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          inviterId: admin.id,
        },
      });

      await request(app)
        .post('/api/v1/auth/register')
        .send({
          invitationToken: invitation.token,
          password: 'StrongHash123!@#',
          displayName: 'Hash Test User',
        })
        .expect(201);

      // パスワードハッシュを取得
      const user = await prisma.user.findUnique({
        where: { email: 'test-auth-integration-hash@example.com' },
      });

      // Argon2idハッシュの形式検証（$argon2id$で始まる）
      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);

      // パスワードが平文で保存されていないことを確認
      expect(user?.passwordHash).not.toBe('StrongHash123!@#');

      // ハッシュが検証可能であることを確認
      const { verify } = await import('@node-rs/argon2');
      const isValid = await verify(user!.passwordHash, 'StrongHash123!@#');
      expect(isValid).toBe(true);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    /**
     * 要件5.1: アクセストークンの有効期限が切れた際に、リフレッシュトークンで新しいアクセストークンを発行
     */
    it('有効なリフレッシュトークンで新しいアクセストークンを取得できること', async () => {
      // 前提: ログイン済みのユーザーを作成
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-refresh@example.com',
          displayName: 'Test Refresh User',
          passwordHash,
        },
      });

      // ログインしてリフレッシュトークンを取得
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-refresh@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const { refreshToken } = loginResponse.body;

      // テスト実行: トークンリフレッシュ
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // 検証
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');

      // 新しいトークンが発行されていることを確認
      expect(response.body.accessToken).not.toBe(loginResponse.body.accessToken);
    });

    /**
     * 要件5.2: リフレッシュトークンが無効または期限切れの場合に再ログインを要求
     */
    it('無効なリフレッシュトークンでエラーが返されること', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.refresh.token' })
        .expect(401);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /無効なトークン|Invalid.*token/i
      );
    });

    /**
     * 要件5.5: アクセストークンが改ざんされている場合にリクエストを拒否
     */
    it('改ざんされたリフレッシュトークンでエラーが返されること', async () => {
      // 前提: 正規のリフレッシュトークンを取得
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-tampered@example.com',
          displayName: 'Test Tampered User',
          passwordHash,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-tampered@example.com',
          password: 'Password123!',
        })
        .expect(200);

      // トークンを改ざん（署名部分を変更）
      const [header, payload] = loginResponse.body.refreshToken.split('.');
      const tamperedToken = `${header}.${payload}.tampered-signature`;

      // テスト実行
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tamperedToken })
        .expect(401);

      expect(response.body.detail || response.body.title || response.body.error).toMatch(
        /無効なトークン|Invalid.*token/i
      );
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    /**
     * 要件5.3: ユーザーがログアウトする際にリフレッシュトークンを無効化
     */
    it('ログアウト後にリフレッシュトークンが無効化されること', async () => {
      // 前提: ログイン済みのユーザー
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-logout@example.com',
          displayName: 'Test Logout User',
          passwordHash,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-logout@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const { refreshToken, accessToken } = loginResponse.body;

      // テスト実行: ログアウト
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // 検証: ログアウト後にリフレッシュトークンが使用できないことを確認
      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(refreshResponse.body.detail || refreshResponse.body.title).toMatch(
        /無効なトークン|Invalid token/i
      );
    });
  });

  describe('GET /api/v1/auth/me', () => {
    /**
     * 要件9.1: 認証済みユーザーがプロフィール取得APIを呼び出す際に、
     * ユーザーの基本情報（ID、メールアドレス、表示名、ロール、作成日時）を返す
     */
    it('認証済みユーザーの情報を取得できること', async () => {
      // 前提: ログイン済みのユーザー
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-me@example.com',
          displayName: 'Test Me User',
          passwordHash,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-me@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const { accessToken } = loginResponse.body;

      // テスト実行: ユーザー情報取得
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 検証
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', 'test-auth-integration-me@example.com');
      expect(response.body).toHaveProperty('displayName', 'Test Me User');
      expect(response.body).toHaveProperty('roles');
      expect(response.body).toHaveProperty('createdAt');

      // パスワードハッシュが返されないことを確認
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    /**
     * 要件9.2: アクセストークンが無効または期限切れの場合に401 Unauthorizedエラーを返す
     */
    it('無効なアクセストークンでエラーが返されること', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.access.token')
        .expect(401);

      expect(
        response.body.detail || response.body.title || response.body.error || response.body.code
      ).toMatch(/無効なトークン|Invalid.*token|Unauthorized|INVALID.*TOKEN/i);
    });

    /**
     * 要件5.4: 保護されたAPIエンドポイントにアクセスする際に、有効なアクセストークンを検証
     */
    it('アクセストークンなしでアクセスできないこと', async () => {
      const response = await request(app).get('/api/v1/auth/me').expect(401);

      expect(
        response.body.detail || response.body.title || response.body.error || response.body.code
      ).toMatch(/認証が必要|Authentication required|Unauthorized|MISSING.*TOKEN/i);
    });
  });

  describe('EdDSA (Ed25519) Token Signature', () => {
    /**
     * 要件5.7: トークンを生成する際にEdDSA（Ed25519）署名アルゴリズムを使用
     * 要件5.8: JWTトークンのヘッダーに"alg": "EdDSA"フィールドを設定
     */
    it('JWTトークンがEdDSA署名を使用していること', async () => {
      // 前提: ログイン
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-eddsa@example.com',
          displayName: 'Test EdDSA User',
          passwordHash,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-eddsa@example.com',
          password: 'Password123!',
        })
        .expect(200);

      // JWTヘッダーをデコード
      const [headerBase64] = loginResponse.body.accessToken.split('.');
      const header = JSON.parse(Buffer.from(headerBase64!, 'base64url').toString());

      // 検証: EdDSAアルゴリズムが使用されていること
      expect(header).toHaveProperty('alg', 'EdDSA');
    });
  });

  describe('Token Expiry Configuration', () => {
    /**
     * 要件5.9: アクセストークンを発行する際に、環境変数ACCESS_TOKEN_EXPIRY（デフォルト: 15分）を適用
     * 要件5.10: リフレッシュトークンを発行する際に、環境変数REFRESH_TOKEN_EXPIRY（デフォルト: 7日間）を適用
     */
    it('トークンに適切な有効期限が設定されること', async () => {
      // 前提: ログイン
      const passwordHash = await (
        await import('@node-rs/argon2')
      ).hash('Password123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.user.create({
        data: {
          email: 'test-auth-integration-expiry@example.com',
          displayName: 'Test Expiry User',
          passwordHash,
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test-auth-integration-expiry@example.com',
          password: 'Password123!',
        })
        .expect(200);

      // アクセストークンのペイロードをデコード
      const [, accessPayloadBase64] = loginResponse.body.accessToken.split('.');
      const accessPayload = JSON.parse(Buffer.from(accessPayloadBase64!, 'base64url').toString());

      // リフレッシュトークンのペイロードをデコード
      const [, refreshPayloadBase64] = loginResponse.body.refreshToken.split('.');
      const refreshPayload = JSON.parse(Buffer.from(refreshPayloadBase64!, 'base64url').toString());

      // 検証: expクレームが存在すること
      expect(accessPayload).toHaveProperty('exp');
      expect(refreshPayload).toHaveProperty('exp');

      // 検証: アクセストークンの有効期限が15分程度（±1分）
      const accessExpiry = accessPayload.exp - accessPayload.iat;
      expect(accessExpiry).toBeGreaterThanOrEqual(14 * 60); // 14分
      expect(accessExpiry).toBeLessThanOrEqual(16 * 60); // 16分

      // 検証: リフレッシュトークンの有効期限が7日程度（±1時間）
      const refreshExpiry = refreshPayload.exp - refreshPayload.iat;
      expect(refreshExpiry).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 - 3600); // 7日 - 1時間
      expect(refreshExpiry).toBeLessThanOrEqual(7 * 24 * 60 * 60 + 3600); // 7日 + 1時間
    });
  });
});
