/**
 * 復旧用の再有効化のスクリプトの単体検証（user-authentication タスク49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.3: 再有効化で再び利用できるようにする
 * - REQ-36.8: 最後の有効なシステム管理者が自動無効化されてもサーバー上で復旧できる
 *
 * 引数の読み取り・終了コード・接続の後始末を確かめる。実データベースでの再有効化と監査は統合検証
 * （integration/inactive-user-deactivation.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pathToFileURL } from 'url';

const {
  queue,
  redisMock,
  initRedis,
  disconnectPrisma,
  prismaClient,
  tx,
  invalidate,
  enqueueAdminNotificationEmail,
} = vi.hoisted(() => {
  const redisClient = { status: 'ready' };
  const tx = {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    invalidate: vi.fn().mockResolvedValue(undefined),
    enqueueAdminNotificationEmail: vi.fn().mockResolvedValue(undefined),
    queue: {
      on: vi.fn(),
      add: vi.fn().mockResolvedValue({}),
      close: vi.fn().mockResolvedValue(undefined),
    },
    redisMock: {
      getClient: vi.fn((): { status: string } | null => redisClient),
      disconnect: vi.fn().mockResolvedValue(undefined),
    },
    initRedis: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    prismaClient: {
      $transaction: vi.fn(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx)),
      user: { findMany: vi.fn() },
    },
  };
});

vi.mock('../../../db.js', () => ({
  default: () => prismaClient,
  disconnectPrisma: () => disconnectPrisma(),
}));
vi.mock('../../../redis.js', () => ({
  default: redisMock,
  initRedis: () => initRedis(),
}));
vi.mock('../../../services/email.service.js', () => ({
  createEmailQueue: () => queue,
  enqueueAdminNotificationEmail: (...args: unknown[]) => enqueueAdminNotificationEmail(...args),
}));
vi.mock('../../../services/authenticated-user-state.service.js', () => ({
  getSharedAuthenticatedUserStateService: () => ({ invalidate }),
}));
vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import {
  DEFAULT_REACTIVATION_REASON,
  EXIT_CODE,
  USAGE,
  createDefaultContext,
  isDirectExecution,
  main,
  parseReactivateUserArgs,
  runReactivateUser,
  type ReactivateUserContext,
} from '../../../scripts/reactivate-user.js';
import { AccountStatusService } from '../../../services/account-status.service.js';

function contextWith(
  reactivateByOperatorScript: ReactivateUserContext['service']['reactivateByOperatorScript'],
  stateCacheAvailable = true
) {
  const out = vi.fn();
  const err = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  const ctx: ReactivateUserContext = {
    service: { reactivateByOperatorScript },
    stateCacheAvailable,
    out,
    err,
    close,
  };
  return { ctx, out, err, close };
}

describe('parseReactivateUserArgs', () => {
  it('--email を読み、理由を省くと既定の理由にする', () => {
    expect(parseReactivateUserArgs(['--email', ' admin@example.com '])).toEqual({
      ok: true,
      value: { email: 'admin@example.com', reason: DEFAULT_REACTIVATION_REASON },
    });
  });

  it('--email=値 と --reason を読む', () => {
    expect(parseReactivateUserArgs(['--email=admin@example.com', '--reason', '復旧'])).toEqual({
      ok: true,
      value: { email: 'admin@example.com', reason: '復旧' },
    });
  });

  it.each([
    [[], '--email は必須です'],
    [['--email'], '--email の値がありません'],
    [['--email', '--reason', 'x'], '--email の値がありません'],
    [['admin@example.com'], '不明な引数です: admin@example.com'],
    [['--email', 'a@example.com', '--reason='], '--reason が空です'],
  ])('誤った引数 %j を拒否する', (argv, error) => {
    expect(parseReactivateUserArgs(argv)).toEqual({ ok: false, error });
  });
});

describe('runReactivateUser', () => {
  /**
   * @requirement user-authentication/REQ-36.3
   * @requirement user-authentication/REQ-36.8
   */
  it('再有効化したら 0 で終わり、対象を出力する', async () => {
    const reactivate = vi.fn().mockResolvedValue({ ok: true, value: { userId: 'u1' } });
    const { ctx, out } = contextWith(reactivate);

    const code = await runReactivateUser({ email: 'a@example.com', reason: '復旧' }, ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(reactivate).toHaveBeenCalledWith('a@example.com', '復旧');
    expect(out).toHaveBeenCalledWith(expect.stringContaining('再有効化しました: a@example.com'));
  });

  it('該当する利用者が無ければ 0 以外で終わる', async () => {
    const { ctx, err } = contextWith(
      vi.fn().mockResolvedValue({ ok: false, error: { type: 'USER_NOT_FOUND' } })
    );

    const code = await runReactivateUser({ email: 'x@example.com', reason: '復旧' }, ctx);

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(err).toHaveBeenCalledWith('該当する利用者がいません: x@example.com');
  });

  it('既に有効なら何もしていないことを明示して 0 で終わる', async () => {
    const { ctx, out } = contextWith(
      vi.fn().mockResolvedValue({ ok: false, error: { type: 'ALREADY_IN_STATE' } })
    );

    const code = await runReactivateUser({ email: 'a@example.com', reason: '復旧' }, ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(out).toHaveBeenCalledWith('既に有効です（何もしていません）: a@example.com');
  });

  it('想定外の失敗の種別は 0 以外で終わる', async () => {
    const { ctx, err } = contextWith(
      vi.fn().mockResolvedValue({ ok: false, error: { type: 'LAST_ACTIVE_ADMIN_PROTECTED' } })
    );

    expect(await runReactivateUser({ email: 'a@example.com', reason: '復旧' }, ctx)).toBe(
      EXIT_CODE.FAILURE
    );
    expect(err).toHaveBeenCalledWith(expect.stringContaining('LAST_ACTIVE_ADMIN_PROTECTED'));
  });

  it('キャッシュ基盤に接続できないときは警告してから再有効化する', async () => {
    const reactivate = vi.fn().mockResolvedValue({ ok: true, value: { userId: 'u1' } });
    const { ctx, err } = contextWith(reactivate, false);

    expect(await runReactivateUser({ email: 'a@example.com', reason: '復旧' }, ctx)).toBe(
      EXIT_CODE.SUCCESS
    );
    expect(err).toHaveBeenCalledWith(expect.stringContaining('REDIS_URL'));
  });
});

describe('main', () => {
  it('引数の誤りは接続を作らずに 2 で終わり、使い方を出す', async () => {
    const createContext = vi.fn();
    const err = vi.fn();

    expect(await main([], createContext, err)).toBe(EXIT_CODE.USAGE);
    expect(createContext).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(USAGE);
  });

  it('実行の後に必ず接続を閉じる（失敗しても）', async () => {
    const ok = contextWith(vi.fn().mockResolvedValue({ ok: true, value: { userId: 'u1' } }));
    expect(await main(['--email', 'a@example.com'], async () => ok.ctx)).toBe(EXIT_CODE.SUCCESS);
    expect(ok.close).toHaveBeenCalledTimes(1);

    const failing = contextWith(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(main(['--email', 'a@example.com'], async () => failing.ctx)).rejects.toThrow(
      'db down'
    );
    expect(failing.close).toHaveBeenCalledTimes(1);
  });
});

describe('createDefaultContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('キャッシュ基盤・データベース・メールキューで部品を作り、close で全ての接続を閉じる', async () => {
    const ctx = await createDefaultContext();

    expect(initRedis).toHaveBeenCalled();
    expect(ctx.service).toBeInstanceOf(AccountStatusService);
    expect(ctx.stateCacheAvailable).toBe(true);
    expect(queue.on).toHaveBeenCalledWith('error', expect.any(Function));

    await ctx.close();
    expect(queue.close).toHaveBeenCalled();
    expect(redisMock.disconnect).toHaveBeenCalled();
    expect(disconnectPrisma).toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-36.3
   */
  it('作った部品は、再有効化の後に共有の状態のキャッシュを無効化し、通知のメールを送信の処理を持たずにキューへ入れる', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      displayName: '利用者 A',
      isActive: false,
      userRoles: [],
    });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    prismaClient.user.findMany.mockResolvedValue([{ email: 'admin@example.com' }]);
    const ctx = await createDefaultContext();

    expect(await ctx.service.reactivateByOperatorScript('a@example.com', '復旧')).toEqual({
      ok: true,
      value: { userId: 'u1' },
    });
    expect(invalidate).toHaveBeenCalledWith('u1');
    expect(enqueueAdminNotificationEmail).toHaveBeenCalledWith(
      queue,
      'admin@example.com',
      expect.stringContaining('利用者 A'),
      expect.arrayContaining(['実行者: サーバー上の復旧スクリプト'])
    );
  });

  it('出力は標準出力と標準エラーへ、メールキューの接続の失敗は標準エラーへ出す', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = await createDefaultContext();
      ctx.out('出力');
      ctx.err('警告');
      const onError = queue.on.mock.calls.find(([event]) => event === 'error')?.[1] as (
        e: Error
      ) => void;
      onError(new Error('ECONNREFUSED'));
      // 引数の誤りの既定の出力先も標準エラー
      expect(await main([])).toBe(EXIT_CODE.USAGE);

      expect(log).toHaveBeenCalledWith('出力');
      expect(error).toHaveBeenCalledWith('警告');
      expect(error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
      expect(error).toHaveBeenCalledWith(USAGE);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('キャッシュ基盤に接続できないときは状態のキャッシュを使えないものとする', async () => {
    redisMock.getClient.mockReturnValueOnce(null);
    const ctx = await createDefaultContext();
    expect(ctx.stateCacheAvailable).toBe(false);
  });
});

describe('isDirectExecution', () => {
  it('起動されたパスが自身のモジュールのときだけ真', () => {
    const path = '/app/dist/src/scripts/reactivate-user.js';
    expect(isDirectExecution(path, pathToFileURL(path).href)).toBe(true);
    expect(isDirectExecution('/app/other.js', pathToFileURL(path).href)).toBe(false);
    expect(isDirectExecution(undefined, pathToFileURL(path).href)).toBe(false);
  });
});
