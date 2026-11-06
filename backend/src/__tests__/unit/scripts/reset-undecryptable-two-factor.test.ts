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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pathToFileURL } from 'url';

const { prismaClient, redisMock, initRedis, disconnectPrisma, sharedInvalidate } = vi.hoisted(
  () => ({
    prismaClient: { user: { findMany: vi.fn() } },
    redisMock: {
      getClient: vi.fn((): { status: string } | null => ({ status: 'ready' })),
      disconnect: vi.fn().mockResolvedValue(undefined),
    },
    initRedis: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    sharedInvalidate: vi.fn().mockResolvedValue(undefined),
  })
);

vi.mock('../../../db.js', () => ({
  default: () => prismaClient,
  disconnectPrisma: () => disconnectPrisma(),
}));
vi.mock('../../../redis.js', () => ({
  default: redisMock,
  initRedis: () => initRedis(),
}));
vi.mock('../../../services/authenticated-user-state.service.js', () => ({
  getSharedAuthenticatedUserStateService: () => ({ invalidate: sharedInvalidate }),
}));

import {
  createDefaultContext,
  DEFAULT_RESET_REASON,
  EXIT_CODE,
  isDirectExecution,
  main,
  parseResetUndecryptableArgs,
  runResetUndecryptable,
  type ResetUndecryptableContext,
  type TwoFactorCandidate,
} from '../../../scripts/reset-undecryptable-two-factor.js';
import {
  TwoFactorService,
  type UndecryptableTwoFactorKind,
} from '../../../services/two-factor.service.js';

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

  it('読み出しの後に削除された利用者（USER_NOT_FOUND）は変えていない人数に数え、成功で終わる', async () => {
    const { ctx, out } = createContext({});
    vi.mocked(ctx.listCandidates).mockResolvedValue([candidate('gone@example.com')]);
    vi.mocked(ctx.service.resetUndecryptableByOperatorScript).mockResolvedValue({
      ok: false,
      error: { type: 'USER_NOT_FOUND' },
    });

    const code = await runResetUndecryptable({ apply: true, reason: 'r' }, ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(out).toContain(
      '再設定した: 未登録へ戻す 0 人・再登録中の秘密を消す 0 人（現在の鍵で復号できる 1 人は変えていません）'
    );
  });

  it('Error でない失敗も文字列にして報告する', async () => {
    const { ctx, err } = createContext({});
    vi.mocked(ctx.listCandidates).mockResolvedValue([candidate('odd@example.com')]);
    vi.mocked(ctx.service.resetUndecryptableByOperatorScript).mockRejectedValue('timeout');

    const code = await runResetUndecryptable({ apply: true, reason: 'r' }, ctx);

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(err).toContain('再設定に失敗しました: odd@example.com（timeout）');
  });
});

describe('createDefaultContext', () => {
  const originalKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.getClient.mockReturnValue({ status: 'ready' });
    process.env.TWO_FACTOR_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('キャッシュ基盤とデータベースで部品を作り、環境変数の鍵を渡し、close で接続を閉じる', async () => {
    const ctx = await createDefaultContext();

    expect(initRedis).toHaveBeenCalled();
    expect(ctx.service).toBeInstanceOf(TwoFactorService);
    expect(ctx.encryptionKey).toBe(VALID_KEY);
    expect(ctx.stateCacheAvailable).toBe(true);

    await ctx.close();
    expect(redisMock.disconnect).toHaveBeenCalled();
    expect(disconnectPrisma).toHaveBeenCalled();
  });

  it.each([
    ['接続が無い', null],
    ['接続が準備できていない', { status: 'reconnecting' }],
  ])('キャッシュ基盤の%sときは状態のキャッシュを無効化できないと示す', async (_label, client) => {
    redisMock.getClient.mockReturnValue(client);

    const ctx = await createDefaultContext();

    expect(ctx.stateCacheAvailable).toBe(false);
  });

  it('2FA を登録済み、または秘密を持つ利用者を、2FA の列だけ読む', async () => {
    const rows = [candidate('a@example.com')];
    prismaClient.user.findMany.mockResolvedValue(rows);

    const ctx = await createDefaultContext();

    await expect(ctx.listCandidates()).resolves.toBe(rows);
    expect(prismaClient.user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { twoFactorEnabled: true },
          { twoFactorSecret: { not: null } },
          { twoFactorPendingSecret: { not: null } },
        ],
      },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorPendingSecret: true,
      },
      orderBy: { email: 'asc' },
    });
  });

  it('作った部品は、再設定の後に共有の状態のキャッシュを無効化する', async () => {
    const ctx = await createDefaultContext();
    const service = ctx.service as TwoFactorService;
    // 再設定の取引を、対象の 2FA が復号できない（full）として進めた後の無効化だけを確かめる
    vi.spyOn(service, 'classifyUndecryptableTwoFactor').mockResolvedValue('full');
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          twoFactorEnabled: true,
          twoFactorSecret: 'old',
          twoFactorPendingSecret: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      twoFactorBackupCode: { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    (prismaClient as unknown as { $transaction: unknown }).$transaction = vi.fn(
      async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx)
    );

    await expect(service.resetUndecryptableByOperatorScript('user-1', 'r')).resolves.toEqual({
      ok: true,
      value: 'full',
    });
    expect(sharedInvalidate).toHaveBeenCalledWith('user-1');
  });

  it('出力は標準出力と標準エラーへ送る', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const ctx = await createDefaultContext();
    ctx.out('出力');
    ctx.err('エラー');

    expect(log).toHaveBeenCalledWith('出力');
    expect(error).toHaveBeenCalledWith('エラー');
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

describe('main（既定の部品と出力先）', () => {
  const originalKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('引数の誤りは標準エラーへ出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await main(['--unknown']);

    expect(code).toBe(EXIT_CODE.USAGE);
    expect(error).toHaveBeenCalledWith('不明な引数です: --unknown');
  });

  it('既定の部品で実行し、鍵が無ければ何も読まずに止まり、接続を閉じる', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    vi.clearAllMocks();

    const code = await main(['--apply']);

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(prismaClient.user.findMany).not.toHaveBeenCalled();
    expect(redisMock.disconnect).toHaveBeenCalled();
    expect(disconnectPrisma).toHaveBeenCalled();
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
