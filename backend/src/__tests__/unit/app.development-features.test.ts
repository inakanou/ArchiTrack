import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

/** 試験専用の 2 要素認証の暗号化鍵（環境変数の検証が必須とする。開発者の .env に頼らない） */
const TEST_ONLY_TWO_FACTOR_KEY = '1a2b3c4d5e6f70811a2b3c4d5e6f70811a2b3c4d5e6f70811a2b3c4d5e6f7081';

/**
 * 実際の app の組み立てで、開発用の機能（API ドキュメント `/docs`）が
 * 実行環境の明示（NODE_ENV が development / test）のときだけ有効になることを確かめる
 * （user-authentication タスク44.6、design.md の RuntimeMode）。
 *
 * 環境変数の検証（config/env.ts）はモックせず、実際の起動と同じ経路で app を組み立てる。
 * NODE_ENV が未設定のとき、検証のスキーマは既定値 development を補うが、
 * 開発用の機能の判定はその既定値に頼らない。
 */

vi.mock('../../db.js', () => ({
  default: vi.fn(() => ({
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../redis.js', () => ({
  default: {
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
    getClient: vi.fn().mockReturnValue(null),
  },
}));

describe('app の開発用の機能（API ドキュメント）', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadApp(nodeEnv: 'development' | 'test' | 'production' | undefined) {
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = nodeEnv;
    }
    // 本番の検証は DATABASE_URL と REDIS_URL を求める（接続はモックする）
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.TWO_FACTOR_ENCRYPTION_KEY = TEST_ONLY_TWO_FACTOR_KEY;
    const { default: app } = await import('../../app.js');
    return app;
  }

  /**
   * @requirement user-authentication/REQ-42.9: 実行環境の指定が無い起動では API ドキュメント画面（/docs）を提供しない
   */
  it('実行環境の指定が無い起動で /docs と API の定義の配布が 404 になる', async () => {
    const app = await loadApp(undefined);

    const page = await request(app).get('/docs/');
    expect(page.status).toBe(404);
    const init = await request(app).get('/docs/swagger-ui-init.js');
    expect(init.status).toBe(404);
  });

  it('本番の起動で /docs が 404 になる', async () => {
    const app = await loadApp('production');

    // 本番は HTTPS へ寄せるため、中継が HTTPS で受けた要求として送る
    const page = await request(app).get('/docs/').set('X-Forwarded-Proto', 'https');
    expect(page.status).toBe(404);
  });

  it.each(['development', 'test'] as const)(
    'NODE_ENV=%s と明示された起動で /docs と API の定義の配布が提供される',
    async (nodeEnv) => {
      const app = await loadApp(nodeEnv);

      const page = await request(app).get('/docs/');
      expect(page.status).toBe(200);
      expect(page.text).toContain('ArchiTrack API Documentation');
      // API の定義は swagger-ui-init.js の swaggerDoc に埋め込まれて配られる
      const init = await request(app).get('/docs/swagger-ui-init.js');
      expect(init.status).toBe(200);
      expect(init.text).toContain('"openapi"');
    }
  );
});
