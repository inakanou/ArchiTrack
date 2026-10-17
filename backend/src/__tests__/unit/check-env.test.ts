import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

/**
 * デプロイ前の環境変数の検査（src/check-env.ts、ci.yml の staging・production の `check:env`）が、
 * 起動と同じ本番の前提の検査を通すことを確かめる（user-authentication タスク44.6）。
 */

/** 試験専用の固定の鍵（秘密ではない。本番では使わない） */
const TEST_ONLY_ARCHIVE_KEY = '0f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c4b5a69780f1e2d3c4b5a6978';

describe('check-env', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://prod:prod@db.internal:5432/architrack';
    process.env.REDIS_URL = 'redis://redis.internal:6379';
    process.env.TRUST_PROXY_HOPS = '2';
    process.env.ARCHIVE_ENCRYPTION_KEY = TEST_ONLY_ARCHIVE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('本番の前提が揃っていれば終了コードを返さない（成功）', async () => {
    await import('../../check-env.js');

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it.each(['ARCHIVE_ENCRYPTION_KEY', 'TRUST_PROXY_HOPS'])(
    '本番の設定で %s が無いと終了コード 1 で失敗する',
    async (name) => {
      delete process.env[name];

      await import('../../check-env.js');

      expect(exitSpy).toHaveBeenCalledWith(1);
    }
  );

  it('環境変数の検証に失敗すると、本番の前提の欠落の表示をせずに終了コード 1 で失敗する', async () => {
    process.env.JWT_ISSUER = '';

    await import('../../check-env.js');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Production prerequisites')
    );
  });

  it('Error 以外の値が投げられても終了コード 1 で失敗する', async () => {
    vi.doMock('../../config/env.js', () => ({
      validateEnv: () => {
        throw 'unexpected';
      },
    }));

    try {
      await import('../../check-env.js');

      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      vi.doUnmock('../../config/env.js');
    }
  });

  it('試験の実行環境では本番の前提を求めない', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ARCHIVE_ENCRYPTION_KEY;
    delete process.env.TRUST_PROXY_HOPS;

    await import('../../check-env.js');

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
