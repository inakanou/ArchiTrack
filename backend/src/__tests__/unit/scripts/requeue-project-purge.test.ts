/**
 * 完全削除の対象に戻す運用の手順の単体検証（project-management タスク83.6）
 *
 * Requirements (project-management):
 * - 46.14: 対象から外したプロジェクトを、サーバー上の運用の手順でプロジェクト ID を指定して対象に戻す
 *
 * 引数の読み取り・3 つの結果ごとの終了コードと出力・ストレージが無いときの扱い・接続の後始末と、
 * 出力にプロジェクト名とエラーの文言を出さないことを確かめる。データベースには触れない。
 * 実データベースでの対象への復帰は統合検証（integration/project-purge.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pathToFileURL } from 'url';

const { prismaClient, disconnectPrisma, getStorageProvider, disconnectStorage } = vi.hoisted(
  () => ({
    prismaClient: { $transaction: vi.fn() },
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    getStorageProvider: vi.fn((): unknown => null),
    disconnectStorage: vi.fn().mockResolvedValue(undefined),
  })
);

vi.mock('../../../db.js', () => ({
  default: () => prismaClient,
  disconnectPrisma: () => disconnectPrisma(),
}));
vi.mock('../../../storage/storage-factory.js', () => ({
  getStorageProvider: () => getStorageProvider(),
  disconnectStorage: () => disconnectStorage(),
}));
vi.mock('../../../services/email.service.js', () => ({
  EmailService: function EmailService() {
    return { sendAdminNotificationEmail: vi.fn() };
  },
}));
vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  EXIT_CODE,
  USAGE,
  createDefaultContext,
  isDirectExecution,
  main,
  parseRequeueProjectPurgeArgs,
  runRequeueProjectPurge,
  type RequeueProjectPurgeContext,
} from '../../../scripts/requeue-project-purge.js';
import { ProjectPurgeService } from '../../../services/project-purge.service.js';

const PROJECT_ID = '3f2b8c1e-7d4a-4b9e-9c21-5a6d7e8f9012';
const PROJECT_NAME = '秘密の改修工事';
const NOW = new Date('2026-11-11T01:00:00.000Z');

function createContext(
  requeue: ReturnType<typeof vi.fn>,
  overrides: Partial<RequeueProjectPurgeContext> = {}
): RequeueProjectPurgeContext & { lines: string[] } {
  const lines: string[] = [];
  return {
    service: { requeue } as unknown as RequeueProjectPurgeContext['service'],
    out: (line) => lines.push(`out:${line}`),
    err: (line) => lines.push(`err:${line}`),
    now: () => NOW,
    close: vi.fn().mockResolvedValue(undefined),
    lines,
    ...overrides,
  };
}

describe('parseRequeueProjectPurgeArgs', () => {
  it('--project-id <UUID> と --project-id=<UUID> を読む', () => {
    expect(parseRequeueProjectPurgeArgs(['--project-id', PROJECT_ID])).toEqual({
      ok: true,
      value: { projectId: PROJECT_ID },
    });
    expect(parseRequeueProjectPurgeArgs([`--project-id=${PROJECT_ID.toUpperCase()}`])).toEqual({
      ok: true,
      value: { projectId: PROJECT_ID.toUpperCase() },
    });
  });

  it('--project-id が無い・値が無い・不明な引数は誤りにする', () => {
    expect(parseRequeueProjectPurgeArgs([])).toEqual({
      ok: false,
      error: '--project-id は必須です',
    });
    expect(parseRequeueProjectPurgeArgs(['--project-id'])).toEqual({
      ok: false,
      error: '--project-id の値がありません',
    });
    expect(parseRequeueProjectPurgeArgs(['--project-id', '--force'])).toEqual({
      ok: false,
      error: '--project-id の値がありません',
    });
    expect(parseRequeueProjectPurgeArgs(['--name', 'x'])).toEqual({
      ok: false,
      error: '不明な引数です: --name',
    });
  });

  it('UUID の形でない ID は誤りにする', () => {
    for (const id of ['abc', `${PROJECT_ID}x`, PROJECT_ID.replace(/-/g, ''), '']) {
      const result = parseRequeueProjectPurgeArgs([`--project-id=${id}`]);
      expect(result.ok).toBe(false);
    }
    expect(parseRequeueProjectPurgeArgs(['--project-id', 'abc'])).toEqual({
      ok: false,
      error: '--project-id が UUID の形ではありません',
    });
  });
});

describe('runRequeueProjectPurge', () => {
  /**
   * @requirement project-management/REQ-46.14
   */
  it('対象に戻したら 0 で終わり、ID だけを出力する', async () => {
    const requeue = vi.fn().mockResolvedValue('requeued');
    const ctx = createContext(requeue);

    await expect(runRequeueProjectPurge({ projectId: PROJECT_ID }, ctx)).resolves.toBe(
      EXIT_CODE.SUCCESS
    );

    expect(requeue).toHaveBeenCalledWith(PROJECT_ID, NOW);
    expect(ctx.lines).toEqual([
      `out:完全削除の対象に戻しました: ${PROJECT_ID}（次の回で先に試みます）`,
    ]);
  });

  /**
   * @requirement project-management/REQ-46.14
   */
  it('既に対象なら何もしていないことを明示して 0 で終わる', async () => {
    const ctx = createContext(vi.fn().mockResolvedValue('not_excluded'));

    await expect(runRequeueProjectPurge({ projectId: PROJECT_ID }, ctx)).resolves.toBe(
      EXIT_CODE.SUCCESS
    );
    expect(ctx.lines).toEqual([`out:既に完全削除の対象です（何もしていません）: ${PROJECT_ID}`]);
  });

  /**
   * @requirement project-management/REQ-46.14
   */
  it('論理削除したプロジェクトが無ければ 1 で終わる', async () => {
    const ctx = createContext(vi.fn().mockResolvedValue('not_found'));

    await expect(runRequeueProjectPurge({ projectId: PROJECT_ID }, ctx)).resolves.toBe(
      EXIT_CODE.FAILURE
    );
    expect(ctx.lines).toEqual([`err:論理削除したプロジェクトが見つかりません: ${PROJECT_ID}`]);
  });

  it('ストレージが設定されていないときは対象に戻さずに 1 で終わり、理由を出す', async () => {
    const ctx = createContext(vi.fn(), { service: null });

    await expect(runRequeueProjectPurge({ projectId: PROJECT_ID }, ctx)).resolves.toBe(
      EXIT_CODE.FAILURE
    );
    expect(ctx.lines).toEqual([
      'err:対象に戻せませんでした: ストレージが設定されていません（STORAGE_TYPE などの設定を確かめてください）',
    ]);
  });

  it('実行の失敗は 1 で終わり、エラーの種類だけを出す（エラーの文言を出さない）', async () => {
    const error = Object.assign(new Error(`connection failed for ${PROJECT_NAME}`), {
      code: 'P1001',
    });
    const ctx = createContext(vi.fn().mockRejectedValue(error));

    await expect(runRequeueProjectPurge({ projectId: PROJECT_ID }, ctx)).resolves.toBe(
      EXIT_CODE.FAILURE
    );
    expect(ctx.lines).toEqual(['err:対象に戻せませんでした（実行の失敗）: Error P1001']);
  });

  it('どの結果でも出力にプロジェクト名とエラーの文言を出さない', async () => {
    const outcomes = [
      vi.fn().mockResolvedValue('requeued'),
      vi.fn().mockResolvedValue('not_excluded'),
      vi.fn().mockResolvedValue('not_found'),
      vi.fn().mockRejectedValue(new Error(`failed: ${PROJECT_NAME}`)),
      vi.fn().mockRejectedValue(`failed: ${PROJECT_NAME}`),
    ];
    for (const requeue of outcomes) {
      const ctx = createContext(requeue);
      await runRequeueProjectPurge({ projectId: PROJECT_ID }, ctx);
      expect(ctx.lines.length).toBe(1);
      expect(ctx.lines.join('\n')).not.toContain(PROJECT_NAME);
      expect(ctx.lines.join('\n')).not.toContain('failed');
    }
  });
});

describe('main', () => {
  it('引数の誤りは部品を作らずに 2 で終わり、使い方を出す', async () => {
    const createContextFn = vi.fn();
    const lines: string[] = [];

    await expect(
      main(['--project-id', 'not-a-uuid'], createContextFn, (line) => lines.push(line))
    ).resolves.toBe(EXIT_CODE.USAGE);
    await expect(main([], createContextFn, (line) => lines.push(line))).resolves.toBe(
      EXIT_CODE.USAGE
    );

    expect(createContextFn).not.toHaveBeenCalled();
    expect(lines).toEqual([
      '--project-id が UUID の形ではありません',
      USAGE,
      '--project-id は必須です',
      USAGE,
    ]);
    expect(USAGE).toBe('使い方: npm run project:purge-requeue -- --project-id <プロジェクト ID>');
  });

  it('出力先を渡さないときは引数の誤りと使い方を標準エラーへ出し、標準出力には出さない', async () => {
    const createContextFn = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(main(['--unknown'], createContextFn)).resolves.toBe(EXIT_CODE.USAGE);

      expect(createContextFn).not.toHaveBeenCalled();
      expect(error.mock.calls).toEqual([['不明な引数です: --unknown'], [USAGE]]);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  /**
   * @requirement project-management/REQ-46.14
   */
  it('実行の後に必ず接続を閉じ、結果の終了コードを返す', async () => {
    const requeued = createContext(vi.fn().mockResolvedValue('requeued'));
    await expect(main(['--project-id', PROJECT_ID], async () => requeued)).resolves.toBe(
      EXIT_CODE.SUCCESS
    );
    expect(requeued.close).toHaveBeenCalledTimes(1);

    const failed = createContext(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(main(['--project-id', PROJECT_ID], async () => failed)).resolves.toBe(
      EXIT_CODE.FAILURE
    );
    expect(failed.close).toHaveBeenCalledTimes(1);

    const noStorage = createContext(vi.fn(), { service: null });
    await expect(main(['--project-id', PROJECT_ID], async () => noStorage)).resolves.toBe(
      EXIT_CODE.FAILURE
    );
    expect(noStorage.close).toHaveBeenCalledTimes(1);
  });
});

describe('createDefaultContext', () => {
  beforeEach(() => {
    getStorageProvider.mockReset();
    disconnectPrisma.mockClear();
    disconnectStorage.mockClear();
  });

  it('定期処理と同じ本番の組み立てで部品を作り、通知の部品は渡さない', async () => {
    const storageProvider = { delete: vi.fn() };
    getStorageProvider.mockReturnValue(storageProvider);

    const ctx = await createDefaultContext();

    expect(ctx.service).toBeInstanceOf(ProjectPurgeService);
    const deps = (ctx.service as unknown as { deps: Record<string, unknown> }).deps;
    expect(deps.prisma).toBe(prismaClient);
    expect(deps.storageProvider).toBe(storageProvider);
    expect(deps.adminNotificationService).toBeUndefined();

    const before = Date.now();
    const now = ctx.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());

    await ctx.close();
    expect(disconnectStorage).toHaveBeenCalledTimes(1);
    expect(disconnectPrisma).toHaveBeenCalledTimes(1);
  });

  it('ストレージが設定されていないときは部品を空にし、close で接続を閉じる', async () => {
    getStorageProvider.mockReturnValue(null);

    const ctx = await createDefaultContext();

    expect(ctx.service).toBeNull();
    await ctx.close();
    expect(disconnectStorage).toHaveBeenCalledTimes(1);
    expect(disconnectPrisma).toHaveBeenCalledTimes(1);
    // ストレージを閉じてからデータベースを閉じる
    expect(disconnectStorage.mock.invocationCallOrder[0]).toBeLessThan(
      disconnectPrisma.mock.invocationCallOrder[0]!
    );
  });

  it('出力は標準出力と標準エラーへ出す', async () => {
    getStorageProvider.mockReturnValue(null);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = await createDefaultContext();
      ctx.out('o');
      ctx.err('e');
      expect(log).toHaveBeenCalledWith('o');
      expect(error).toHaveBeenCalledWith('e');
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});

describe('isDirectExecution', () => {
  it('起動されたパスが自身のモジュールのときだけ真', () => {
    const scriptPath = '/app/dist/src/scripts/requeue-project-purge.js';
    expect(isDirectExecution(scriptPath, pathToFileURL(scriptPath).href)).toBe(true);
    expect(isDirectExecution('/app/other.js', pathToFileURL(scriptPath).href)).toBe(false);
    expect(isDirectExecution(undefined, pathToFileURL(scriptPath).href)).toBe(false);
  });
});
