import { describe, it, expect } from 'vitest';
import { createRuntimeMode } from '../../../config/runtime-mode.js';

/**
 * runtime-mode.ts のユニットテスト
 *
 * 開発用機能の有効化と本番の前提の判定（user-authentication タスク44.6、design.md の RuntimeMode）
 */

/** 試験専用の固定の鍵（秘密ではない。本番では使わない） */
const TEST_ONLY_ARCHIVE_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** 本番の前提を全て満たす環境 */
const productionEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  ARCHIVE_ENCRYPTION_KEY: TEST_ONLY_ARCHIVE_KEY,
  TRUST_PROXY_HOPS: '2',
  REDIS_URL: 'redis://redis.internal:6379',
});

describe('RuntimeMode', () => {
  describe('kind', () => {
    it.each([
      ['production', 'production'],
      ['development', 'development'],
      ['test', 'test'],
    ] as const)('NODE_ENV=%s のとき %s を返す', (value, expected) => {
      expect(createRuntimeMode({ NODE_ENV: value }).kind()).toBe(expected);
    });

    it('NODE_ENV が未設定・空・未知の値のとき unspecified を返す（スキーマの既定値を使わない）', () => {
      expect(createRuntimeMode({}).kind()).toBe('unspecified');
      expect(createRuntimeMode({ NODE_ENV: '' as 'test' }).kind()).toBe('unspecified');
      expect(createRuntimeMode({ NODE_ENV: 'staging' as 'test' }).kind()).toBe('unspecified');
    });

    it('呼び出しのたびに環境変数を読み直す', () => {
      const source: NodeJS.ProcessEnv = {};
      const mode = createRuntimeMode(source);
      expect(mode.kind()).toBe('unspecified');
      source.NODE_ENV = 'development';
      expect(mode.kind()).toBe('development');
    });
  });

  describe('isDevelopmentFeatureEnabled', () => {
    /**
     * @requirement user-authentication/REQ-42.9: 実行環境の指定が無いとき、開発用の機能（API ドキュメント、エラー応答のスタックトレース）を無効にする
     */
    it('NODE_ENV が未設定のとき false（開発用の機能を無効にする）', () => {
      expect(createRuntimeMode({}).isDevelopmentFeatureEnabled()).toBe(false);
    });

    it('NODE_ENV が production・未知の値のとき false', () => {
      expect(createRuntimeMode({ NODE_ENV: 'production' }).isDevelopmentFeatureEnabled()).toBe(
        false
      );
      expect(
        createRuntimeMode({ NODE_ENV: 'staging' as 'test' }).isDevelopmentFeatureEnabled()
      ).toBe(false);
    });

    it('NODE_ENV が development または test と明示されたときだけ true', () => {
      expect(createRuntimeMode({ NODE_ENV: 'development' }).isDevelopmentFeatureEnabled()).toBe(
        true
      );
      expect(createRuntimeMode({ NODE_ENV: 'test' }).isDevelopmentFeatureEnabled()).toBe(true);
    });
  });

  // 試行回数の制限の無効化（user-authentication タスク48.1、design.md の RateLimitPolicy・RuntimeMode）
  describe('isRateLimitBypassAllowed', () => {
    /** 読まれた環境変数の名前を記録する環境 */
    const recordingEnv = (
      values: NodeJS.ProcessEnv
    ): { env: NodeJS.ProcessEnv; read: string[] } => {
      const read: string[] = [];
      const env = new Proxy(values, {
        get(target, name) {
          if (typeof name === 'string') {
            read.push(name);
          }
          return target[name as string];
        },
      });
      return { env, read };
    };

    it('本番では DISABLE_RATE_LIMIT=true でも false で、無効化の変数を読まない', () => {
      const { env, read } = recordingEnv({ NODE_ENV: 'production', DISABLE_RATE_LIMIT: 'true' });

      expect(createRuntimeMode(env).isRateLimitBypassAllowed()).toBe(false);
      expect(read).not.toContain('DISABLE_RATE_LIMIT');
    });

    it('試験の明示（NODE_ENV=test）のとき true', () => {
      expect(createRuntimeMode({ NODE_ENV: 'test' }).isRateLimitBypassAllowed()).toBe(true);
    });

    it('開発では DISABLE_RATE_LIMIT=true の明示のときだけ true', () => {
      expect(
        createRuntimeMode({
          NODE_ENV: 'development',
          DISABLE_RATE_LIMIT: 'true',
        }).isRateLimitBypassAllowed()
      ).toBe(true);
      expect(createRuntimeMode({ NODE_ENV: 'development' }).isRateLimitBypassAllowed()).toBe(false);
      expect(
        createRuntimeMode({
          NODE_ENV: 'development',
          DISABLE_RATE_LIMIT: 'TRUE',
        }).isRateLimitBypassAllowed()
      ).toBe(false);
    });

    it('実行環境の指定が無い・未知の値のときは DISABLE_RATE_LIMIT=true でも false', () => {
      expect(createRuntimeMode({ DISABLE_RATE_LIMIT: 'true' }).isRateLimitBypassAllowed()).toBe(
        false
      );
      expect(
        createRuntimeMode({
          NODE_ENV: 'staging' as 'test',
          DISABLE_RATE_LIMIT: 'true',
        }).isRateLimitBypassAllowed()
      ).toBe(false);
    });
  });

  describe('assertProductionPrerequisites', () => {
    it('本番の前提を全て満たすとき例外を投げない', () => {
      expect(() =>
        createRuntimeMode(productionEnv()).assertProductionPrerequisites()
      ).not.toThrow();
    });

    /**
     * @requirement user-authentication/REQ-41.3: 本番でアーカイブの暗号鍵が設定されていないと起動を止める（判定）
     */
    it('本番で ARCHIVE_ENCRYPTION_KEY が未設定のとき例外を投げ、変数名を示す', () => {
      const env = productionEnv();
      delete env.ARCHIVE_ENCRYPTION_KEY;
      expect(() => createRuntimeMode(env).assertProductionPrerequisites()).toThrow(
        /ARCHIVE_ENCRYPTION_KEY/
      );
    });

    it.each([
      ['短い', '0123456789abcdef'],
      ['16進以外の文字を含む', 'z123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'],
      ['空', ''],
    ])('本番で ARCHIVE_ENCRYPTION_KEY が64桁の16進でない（%s）とき例外を投げる', (_label, key) => {
      const env = { ...productionEnv(), ARCHIVE_ENCRYPTION_KEY: key };
      expect(() => createRuntimeMode(env).assertProductionPrerequisites()).toThrow(
        /ARCHIVE_ENCRYPTION_KEY/
      );
    });

    it('本番で TRUST_PROXY_HOPS が未設定・空のとき例外を投げる', () => {
      const missing = productionEnv();
      delete missing.TRUST_PROXY_HOPS;
      expect(() => createRuntimeMode(missing).assertProductionPrerequisites()).toThrow(
        /TRUST_PROXY_HOPS/
      );
      expect(() =>
        createRuntimeMode({
          ...productionEnv(),
          TRUST_PROXY_HOPS: '',
        }).assertProductionPrerequisites()
      ).toThrow(/TRUST_PROXY_HOPS/);
    });

    it('本番で TRUST_PROXY_HOPS が 0 のときは設定済みとして例外を投げない', () => {
      expect(() =>
        createRuntimeMode({
          ...productionEnv(),
          TRUST_PROXY_HOPS: '0',
        }).assertProductionPrerequisites()
      ).not.toThrow();
    });

    it('本番で REDIS_URL が未設定のとき例外を投げる', () => {
      const env = productionEnv();
      delete env.REDIS_URL;
      expect(() => createRuntimeMode(env).assertProductionPrerequisites()).toThrow(/REDIS_URL/);
    });

    it('欠けた変数を全て列挙し、鍵の値を含めない', () => {
      const leakedKey = 'a'.repeat(63);
      let message = '';
      try {
        createRuntimeMode({
          NODE_ENV: 'production',
          ARCHIVE_ENCRYPTION_KEY: leakedKey,
        }).assertProductionPrerequisites();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/ARCHIVE_ENCRYPTION_KEY/);
      expect(message).toMatch(/TRUST_PROXY_HOPS/);
      expect(message).toMatch(/REDIS_URL/);
      expect(message).not.toContain(leakedKey);
    });

    it.each([['development'], ['test'], [undefined]] as const)(
      'NODE_ENV=%s のときは前提が欠けても例外を投げない',
      (value) => {
        const env: NodeJS.ProcessEnv = value === undefined ? {} : { NODE_ENV: value };
        expect(() => createRuntimeMode(env).assertProductionPrerequisites()).not.toThrow();
      }
    );
  });
});
