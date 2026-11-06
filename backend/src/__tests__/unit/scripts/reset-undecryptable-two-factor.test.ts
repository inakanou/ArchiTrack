/**
 * 2FA の暗号化鍵の入れ替えの後始末のスクリプトの単体検証
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 2FA の再設定で全リフレッシュトークンを失効させ、アクセストークンの世代を進める
 * - REQ-34.10: 2FA の再設定を監査に記録する
 *
 * 引数の読み取り・鍵の確認・確認だけの実行と書き込みの実行・終了コード・接続の後始末を確かめる。
 * 実データベースでの再設定と監査は統合検証（integration/two-factor-undecryptable-reset.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import { pathToFileURL } from 'url';

vi.mock('../../../db.js', () => ({
  default: () => ({}),
  disconnectPrisma: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../redis.js', () => ({
  default: { getClient: vi.fn(() => null), disconnect: vi.fn().mockResolvedValue(undefined) },
  initRedis: vi.fn().mockResolvedValue(undefined),
}));

import {
  DEFAULT_RESET_REASON,
  EXIT_CODE,
  isDirectExecution,
  main,
  parseResetUndecryptableArgs,
  runResetUndecryptable,
  type ResetUndecryptableContext,
  type TwoFactorCandidate,
} from '../../../scripts/reset-undecryptable-two-factor.js';
import type { UndecryptableTwoFactorKind } from '../../../services/two-factor.service.js';

const VALID_KEY = 'a'.repeat(64);

function candidate(email: string): TwoFactorCandidate {
  return {
    id: `id-${email}`,
    email,
    twoFactorEnabled: true,
    twoFactorSecret: 'iv:tag:data',
    twoFactorPendingSecret: null,
  };
}

/** 利用者ごとの判定を与えた部品を作る */
function createContext(
  kinds: Record<string, UndecryptableTwoFactorKind | Error>,
  overrides: Partial<ResetUndecryptableContext> = {}
) {
  const out: string[] = [];
  const err: string[] = [];
  const classify = vi.fn(async (user: { twoFactorSecret: string | null }) => {
    const entry = Object.entries(kinds).find(
      ([email]) => user.twoFactorSecret === `secret-${email}`
    );
    const kind = entry?.[1];
    return kind instanceof Error || kind === undefined ? 'none' : kind;
  });
  const reset = vi.fn(async (userId: string) => {
    const kind = kinds[userId.replace(/^id-/, '')];
    if (kind instanceof Error) {
      throw kind;
    }
    return { ok: true as const, value: kind ?? 'none' };
  });
  const candidates = Object.keys(kinds).map((email) => ({
    ...candidate(email),
    twoFactorSecret: `secret-${email}`,
  }));
  const ctx: ResetUndecryptableContext = {
    listCandidates: vi.fn(async () => candidates),
    service: {
      classifyUndecryptableTwoFactor: classify,
      resetUndecryptableByOperatorScript: reset,
    },
    encryptionKey: VALID_KEY,
    stateCacheAvailable: true,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ctx, out, err, classify, reset };
}

describe('parseResetUndecryptableArgs', () => {
  it('引数が無ければ確認だけ（既定の理由）', () => {
    expect(parseResetUndecryptableArgs([])).toEqual({
      ok: true,
      value: { apply: false, reason: DEFAULT_RESET_REASON },
    });
  });

  it('--apply と --reason（区切りの 2 形式）を読む', () => {
    expect(parseResetUndecryptableArgs(['--apply', '--reason', ' 鍵の入れ替え '])).toEqual({
      ok: true,
      value: { apply: true, reason: '鍵の入れ替え' },
    });
    expect(parseResetUndecryptableArgs(['--reason=鍵の入れ替え'])).toEqual({
      ok: true,
      value: { apply: false, reason: '鍵の入れ替え' },
    });
  });

  it('不明な引数・値の無い --reason・空の --reason を拒否する', () => {
    expect(parseResetUndecryptableArgs(['--force'])).toEqual({
      ok: false,
      error: '不明な引数です: --force',
    });
    expect(parseResetUndecryptableArgs(['--reason'])).toEqual({
      ok: false,
      error: '--reason の値がありません',
    });
    expect(parseResetUndecryptableArgs(['--reason', '--apply'])).toEqual({
      ok: false,
      error: '--reason の値がありません',
    });
    expect(parseResetUndecryptableArgs(['--reason=  '])).toEqual({
      ok: false,
      error: '--reason が空です',
    });
  });
});

describe('runResetUndecryptable', () => {
  it.each([
    ['未設定', undefined],
    ['16 進でない', 'z'.repeat(64)],
    ['長さが違う', 'a'.repeat(32)],
  ])('鍵が%sなら何も読まず書かずに失敗で終わる', async (_label, key) => {
    const { ctx, err, reset } = createContext({ 'a@example.com': 'full' }, { encryptionKey: key });

    const code = await runResetUndecryptable({ apply: true, reason: 'r' }, ctx);

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(ctx.listCandidates).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(err.join('\n')).toContain('TWO_FACTOR_ENCRYPTION_KEY');
  });

  it('確認だけの実行は判定だけを行い、書き込まない', async () => {
    const { ctx, out, classify, reset } = createContext({
      'full@example.com': 'full',
      'pending@example.com': 'pending_only',
      'ok@example.com': 'none',
    });

    const code = await runResetUndecryptable({ apply: false, reason: 'r' }, ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(classify).toHaveBeenCalledTimes(3);
    expect(reset).not.toHaveBeenCalled();
    expect(out).toContain('対象（2FA を未登録へ戻す）: full@example.com');
    expect(out).toContain('対象（再登録中の秘密だけを消す）: pending@example.com');
    expect(out.join('\n')).not.toContain('ok@example.com');
    expect(out).toContain(
      '再設定の対象: 未登録へ戻す 1 人・再登録中の秘密を消す 1 人（現在の鍵で復号できる 1 人は変えていません）'
    );
    expect(out).toContain('書き込むには --apply を付けて実行してください');
  });

  it('--apply は利用者ごとに再設定し、理由を渡す', async () => {
    const { ctx, out, reset } = createContext({
      'full@example.com': 'full',
      'ok@example.com': 'none',
    });

    const code = await runResetUndecryptable({ apply: true, reason: '鍵の入れ替え' }, ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(reset).toHaveBeenCalledWith('id-full@example.com', '鍵の入れ替え');
    expect(reset).toHaveBeenCalledWith('id-ok@example.com', '鍵の入れ替え');
    expect(out).toContain('再設定しました（2FA を未登録へ戻す）: full@example.com');
    expect(out).toContain(
      '再設定した: 未登録へ戻す 1 人・再登録中の秘密を消す 0 人（現在の鍵で復号できる 1 人は変えていません）'
    );
  });

  it('一部の利用者の失敗は残りを続け、失敗で終わる', async () => {
    const { ctx, err, reset } = createContext({
      'broken@example.com': new Error('deadlock'),
      'full@example.com': 'full',
    });

    const code = await runResetUndecryptable({ apply: true, reason: 'r' }, ctx);

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(err).toContain('再設定に失敗しました: broken@example.com（deadlock）');
    expect(err.join('\n')).toContain('1 人の再設定に失敗しました');
  });

  it('--apply でキャッシュ基盤に接続できなければ警告し、続ける', async () => {
    const { ctx, err } = createContext(
      { 'full@example.com': 'full' },
      { stateCacheAvailable: false }
    );

    const code = await runResetUndecryptable({ apply: true, reason: 'r' }, ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(err.join('\n')).toContain('REDIS_URL');
  });
});

describe('main', () => {
  it('引数の誤りは部品を作らず、使い方を示して 2 で終わる', async () => {
    const createContextFn = vi.fn();
    const err: string[] = [];

    const code = await main(['--unknown'], createContextFn, (line) => err.push(line));

    expect(code).toBe(EXIT_CODE.USAGE);
    expect(createContextFn).not.toHaveBeenCalled();
    expect(err[1]).toContain('使い方');
  });

  it('実行の後に接続を閉じる（失敗でも閉じる）', async () => {
    const { ctx } = createContext({}, { encryptionKey: undefined });

    const code = await main(['--apply'], async () => ctx);

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});

describe('isDirectExecution', () => {
  it('実行したファイルとモジュールが一致するときだけ真', () => {
    const file = '/app/src/scripts/reset-undecryptable-two-factor.ts';
    expect(isDirectExecution(file, pathToFileURL(file).href)).toBe(true);
    expect(isDirectExecution('/other.ts', pathToFileURL(file).href)).toBe(false);
    expect(isDirectExecution(undefined, pathToFileURL(file).href)).toBe(false);
  });
});
