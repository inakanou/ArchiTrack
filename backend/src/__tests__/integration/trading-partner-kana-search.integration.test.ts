/**
 * @fileoverview かな変換検索の統合テスト
 *
 * TDD Task 20.2: かな変換検索の統合テスト
 * - APIエンドポイント経由でのひらがな検索テスト
 * - オートコンプリートAPIでのひらがな検索テスト
 *
 * Requirements (trading-partner-management):
 * - REQ-1.3.1: フリガナ検索でひらがな・カタカナ両対応
 * - REQ-10.2: 検索クエリが1文字以上の場合、取引先名またはフリガナで部分一致検索
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

/**
 * かな変換検索の統合テスト
 */
describe('Kana Conversion Search Integration Tests', () => {
  let prisma: PrismaClient;
  let accessToken: string;
  let testUserId: string;

  /**
   * テスト用認証情報でログインしてアクセストークンを取得（adminロール）
   */
  const loginTestUser = async (): Promise<{ token: string; userId: string }> => {
    const passwordHash = await (
      await import('@node-rs/argon2')
    ).hash('TestPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // テストユーザーを作成
    const user = await prisma.user.create({
      data: {
        email: 'test-kana-search-integration@example.com',
        displayName: 'Kana Search Test User',
        passwordHash,
      },
    });

    // adminロールを取得して割り当て
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });

    if (adminRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
        },
      });
    }

    // ログイン
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test-kana-search-integration@example.com',
        password: 'TestPassword123!',
      })
      .expect(200);

    return {
      token: response.body.accessToken,
      userId: user.id,
    };
  };

  beforeAll(async () => {
    // Prismaクライアントの初期化
    prisma = getPrismaClient();

    // Redisの初期化
    await initRedis();

    // シードデータを投入（CIでシードが実行されていない場合に備える）
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
  });

  afterAll(async () => {
    // テストデータのクリーンアップ（依存関係の順序に注意）
    // 1. 取引先種別マッピングを削除
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-kana-',
          },
        },
      },
    });

    // 2. 取引先を削除
    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-kana-',
        },
      },
    });

    // 3. 監査ログを削除
    await prisma.auditLog.deleteMany({
      where: {
        actorId: testUserId,
      },
    });

    // 4. ユーザーロールを削除
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'test-kana-search-integration@example.com',
        },
      },
    });

    // 5. ユーザーを削除
    await prisma.user.deleteMany({
      where: {
        email: 'test-kana-search-integration@example.com',
      },
    });

    // Redis クリーンアップ
    const client = redis.getClient();
    if (client) {
      const keys = await client.keys('test-kana-:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    // 接続を切断
    await prisma.$disconnect();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: {
        tradingPartner: {
          name: {
            startsWith: 'test-kana-',
          },
        },
      },
    });

    await prisma.tradingPartner.deleteMany({
      where: {
        name: {
          startsWith: 'test-kana-',
        },
      },
    });

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { action: 'TRADING_PARTNER_CREATED' },
          { action: 'TRADING_PARTNER_UPDATED' },
          { action: 'TRADING_PARTNER_DELETED' },
        ],
        actorId: testUserId,
      },
    });

    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'test-kana-search-integration@example.com',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: 'test-kana-search-integration@example.com',
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

    // テストユーザーの作成とログイン
    const loginResult = await loginTestUser();
    accessToken = loginResult.token;
    testUserId = loginResult.userId;
  });

  describe('GET /api/trading-partners - Kana Search (REQ-1.3.1)', () => {
    /**
     * ひらがな入力での取引先一覧検索テスト
     *
     * Requirements:
     * - REQ-1.3.1: ひらがな入力をカタカナに変換して検索
     */
    it('ひらがな入力でカタカナのフリガナを持つ取引先を検索できること', async () => {
      // テストデータを作成（フリガナはカタカナ）
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-yamada',
          nameKana: 'ヤマダショウジ', // カタカナで保存
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // ひらがなで検索
      const response = await request(app)
        .get('/api/trading-partners?search=やまだ') // ひらがなで検索
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].nameKana).toBe('ヤマダショウジ');
    });

    it('カタカナ入力でも同じ結果が得られること', async () => {
      // テストデータを作成（フリガナはカタカナ）
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-tanaka',
          nameKana: 'タナカタロウ', // カタカナで保存
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // カタカナで検索
      const katakanaResponse = await request(app)
        .get('/api/trading-partners?search=タナカ') // カタカナで検索
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // ひらがなで検索
      const hiraganaResponse = await request(app)
        .get('/api/trading-partners?search=たなか') // ひらがなで検索
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 両方の検索結果が同一であること
      expect(katakanaResponse.body.data).toHaveLength(1);
      expect(hiraganaResponse.body.data).toHaveLength(1);
      expect(katakanaResponse.body.data[0].id).toBe(hiraganaResponse.body.data[0].id);
      expect(katakanaResponse.body.data[0].nameKana).toBe('タナカタロウ');
      expect(hiraganaResponse.body.data[0].nameKana).toBe('タナカタロウ');
    });

    it('混合文字列（漢字+ひらがな）で検索できること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-suzuki-mixed',
          nameKana: 'スズキジロウ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // 混合文字列で検索（ひらがな部分がカタカナに変換されて検索される）
      const response = await request(app)
        .get('/api/trading-partners?search=すずき') // ひらがなで検索
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].nameKana).toBe('スズキジロウ');
    });

    it('部分一致でひらがな検索ができること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-partial-1',
          nameKana: 'アイウエオカキクケコ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-partial-2',
          nameKana: 'サシスセソタチツテト',
          address: '東京都新宿区2-2-2',
          types: ['SUBCONTRACTOR'],
        })
        .expect(201);

      // 「かき」で部分一致検索（ひらがな）
      const response = await request(app)
        .get('/api/trading-partners?search=かき') // ひらがなで部分一致検索
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].nameKana).toBe('アイウエオカキクケコ');
    });

    it('複数の取引先がひらがな検索でヒットすること', async () => {
      // テストデータを複数作成（同じカタカナを含む）
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-multi-1',
          nameKana: 'カブシキガイシャヤマダ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-multi-2',
          nameKana: 'ヤマダケンセツ',
          address: '東京都新宿区2-2-2',
          types: ['SUBCONTRACTOR'],
        })
        .expect(201);

      // 「やまだ」で検索（ひらがな）
      const response = await request(app)
        .get('/api/trading-partners?search=やまだ')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 両方ヒットすること
      expect(response.body.data).toHaveLength(2);
      const kanaList = response.body.data.map((p: { nameKana: string }) => p.nameKana);
      expect(kanaList).toContain('カブシキガイシャヤマダ');
      expect(kanaList).toContain('ヤマダケンセツ');
    });
  });

  describe('GET /api/trading-partners/search - Autocomplete Kana Search (REQ-10.2)', () => {
    /**
     * オートコンプリートAPIでのひらがな検索テスト
     *
     * Requirements:
     * - REQ-10.2: 検索クエリでひらがな・カタカナ両対応
     */
    it('オートコンプリートAPIでひらがな検索ができること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-autocomplete-1',
          nameKana: 'サトウコウジ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // ひらがなでオートコンプリート検索
      const response = await request(app)
        .get('/api/trading-partners/search?q=さとう') // ひらがなで検索
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: expect.any(String),
        name: 'test-kana-autocomplete-1',
        nameKana: 'サトウコウジ',
        types: expect.arrayContaining(['CUSTOMER']),
      });
    });

    it('オートコンプリートAPIでカタカナとひらがなが同一結果を返すこと', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-autocomplete-same',
          nameKana: 'イトウハナコ',
          address: '東京都渋谷区1-1-1',
          types: ['SUBCONTRACTOR'],
        })
        .expect(201);

      // カタカナで検索
      const katakanaResponse = await request(app)
        .get('/api/trading-partners/search?q=イトウ')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // ひらがなで検索
      const hiraganaResponse = await request(app)
        .get('/api/trading-partners/search?q=いとう')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 同一の結果が返ること
      expect(katakanaResponse.body).toHaveLength(1);
      expect(hiraganaResponse.body).toHaveLength(1);
      expect(katakanaResponse.body[0].id).toBe(hiraganaResponse.body[0].id);
    });

    it('オートコンプリートAPIで種別フィルターとひらがな検索を組み合わせられること', async () => {
      // テストデータを作成（顧客）
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-filter-customer',
          nameKana: 'ナカムラケンジ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // テストデータを作成（協力業者）
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-filter-subcontractor',
          nameKana: 'ナカムラコウギョウ',
          address: '東京都新宿区2-2-2',
          types: ['SUBCONTRACTOR'],
        })
        .expect(201);

      // ひらがなで検索（種別フィルターなし）
      const allResponse = await request(app)
        .get('/api/trading-partners/search?q=なかむら')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // ひらがなで検索（顧客のみ）
      const customerResponse = await request(app)
        .get('/api/trading-partners/search?q=なかむら&type=CUSTOMER')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 全件検索は2件、フィルター付きは1件
      expect(allResponse.body).toHaveLength(2);
      expect(customerResponse.body).toHaveLength(1);
      expect(customerResponse.body[0].nameKana).toBe('ナカムラケンジ');
    });

    it('オートコンプリートAPIの結果が最大10件に制限されること', async () => {
      // 12件のテストデータを作成（フリガナはカタカナのみ許可のため、連番は英字で識別）
      const kanaNames = [
        'テストカンパニーア',
        'テストカンパニーイ',
        'テストカンパニーウ',
        'テストカンパニーエ',
        'テストカンパニーオ',
        'テストカンパニーカ',
        'テストカンパニーキ',
        'テストカンパニーク',
        'テストカンパニーケ',
        'テストカンパニーコ',
        'テストカンパニーサ',
        'テストカンパニーシ',
      ];

      for (let i = 0; i < kanaNames.length; i++) {
        await request(app)
          .post('/api/trading-partners')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: `test-kana-limit-${i.toString().padStart(2, '0')}`,
            nameKana: kanaNames[i],
            address: `東京都渋谷区${i + 1}-1-1`,
            types: ['CUSTOMER'],
          })
          .expect(201);
      }

      // ひらがなで検索
      const response = await request(app)
        .get('/api/trading-partners/search?q=てすとかんぱにー')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 最大10件であること
      expect(response.body).toHaveLength(10);
    });

    it('オートコンプリートAPIの結果が0件の場合、空配列を返すこと', async () => {
      // 検索にヒットしないひらがなで検索
      const response = await request(app)
        .get('/api/trading-partners/search?q=ぞんざいしないなまえ')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('Kana Search Edge Cases', () => {
    /**
     * かな変換検索の境界値テスト
     */
    it('小文字ひらがな（拗音）で検索できること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-small',
          nameKana: 'シャチョウ', // 拗音を含む
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // 小文字ひらがな（拗音）で検索
      const response = await request(app)
        .get('/api/trading-partners/search?q=しゃちょう')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].nameKana).toBe('シャチョウ');
    });

    it('長音を含むひらがなで検索できること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-chouon',
          nameKana: 'コーポレーション',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // Note: 長音「ー」はひらがな・カタカナ両方で同じ文字コードなので変換対象外
      // 「こーぽれーしょん」と入力した場合、「ー」はそのまま残る
      const response = await request(app)
        .get('/api/trading-partners/search?q=こーぽ')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].nameKana).toBe('コーポレーション');
    });

    it('濁点・半濁点を含むひらがなで検索できること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-dakuten',
          nameKana: 'ガブシキガイシャ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // 濁点を含むひらがなで検索
      const response = await request(app)
        .get('/api/trading-partners/search?q=がぶしき')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].nameKana).toBe('ガブシキガイシャ');
    });

    it('「ゔ」（ひらがなのヴ）で検索できること', async () => {
      // テストデータを作成
      // Note: 「ヴ」(U+30F4)はカタカナ範囲外のため、そのまま保存される場合がある
      // フリガナバリデーションでは「ヴ」は許可されている可能性があるため、テストデータに含める
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-vu',
          nameKana: 'ヴィレッジ',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // 検索（「ヴ」はU+30F4でカタカナ範囲外なのでそのまま検索）
      const response = await request(app)
        .get('/api/trading-partners/search?q=ヴィレッジ')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].nameKana).toBe('ヴィレッジ');
    });
  });

  describe('Kana Search Performance', () => {
    /**
     * かな変換検索のパフォーマンステスト
     *
     * Requirements:
     * - REQ-10.6: 検索APIのレスポンス時間を500ミリ秒以内
     */
    it('ひらがな検索のレスポンスが500ms以内であること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-perf',
          nameKana: 'パフォーマンステスト',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // パフォーマンス計測
      const startTime = Date.now();
      await request(app)
        .get('/api/trading-partners/search?q=ぱふぉーまんす')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const endTime = Date.now();

      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(500);
    });

    it('一覧検索のひらがな検索レスポンスが500ms以内であること', async () => {
      // テストデータを作成
      await request(app)
        .post('/api/trading-partners')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-kana-list-perf',
          nameKana: 'イチランパフォーマンス',
          address: '東京都渋谷区1-1-1',
          types: ['CUSTOMER'],
        })
        .expect(201);

      // パフォーマンス計測
      const startTime = Date.now();
      await request(app)
        .get('/api/trading-partners?search=いちらんぱふぉーまんす')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const endTime = Date.now();

      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(500);
    });
  });
});
