/**
 * 不整合な見積依頼を確かめる運用の手順の単体検証（estimate-request タスク121.2）
 *
 * Requirements (estimate-request):
 * - 51.3: 別のプロジェクトの内訳書を参照する見積依頼の件数と見積依頼 ID を確かめられ、確かめる手順ではデータを変えない
 *
 * 出力の形（件数・行・ID と種別だけ）・終了コード・エラーの種類だけを出すこと・接続の後始末を確かめる。
 * データベースには触れない（読むのは `$queryRaw` の 1 文だけであることを偽のクライアントで確かめる）。
 * 実データベースでの照会は統合検証（integration/find-cross-project-estimate-requests.integration.test.ts）で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pathToFileURL } from 'url';

const { prismaClient, disconnectPrisma } = vi.hoisted(() => ({
  prismaClient: { $queryRaw: vi.fn() },
  disconnectPrisma: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../db.js', () => ({
  default: () => prismaClient,
  disconnectPrisma: () => disconnectPrisma(),
}));

import {
  EXIT_CODE,
  createDefaultContext,
  findCrossProjectEstimateRequests,
  formatFindings,
  isDirectExecution,
  main,
  runFindCrossProjectEstimateRequests,
  type CrossProjectFinding,
  type FindCrossProjectClient,
  type FindCrossProjectContext,
} from '../../../scripts/find-cross-project-estimate-requests.js';

const REQUEST_1 = '11111111-1111-4111-8111-111111111111';
const REQUEST_2 = '22222222-2222-4222-8222-222222222222';
const PROJECT_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const FINDINGS: CrossProjectFinding[] = [
  { estimateRequestId: REQUEST_1, projectId: PROJECT_1, referencedProjectId: PROJECT_2, kind: 'a' },
  { estimateRequestId: REQUEST_1, projectId: PROJECT_1, referencedProjectId: PROJECT_2, kind: 'b' },
  { estimateRequestId: REQUEST_2, projectId: PROJECT_2, referencedProjectId: PROJECT_1, kind: 'b' },
];

function createFakeClient(queryRaw: ReturnType<typeof vi.fn>): FindCrossProjectClient {
  return { $queryRaw: queryRaw } as unknown as FindCrossProjectClient;
}

function createContext(
  queryRaw: ReturnType<typeof vi.fn>
): FindCrossProjectContext & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    prisma: createFakeClient(queryRaw),
    out: (line) => outLines.push(line),
    err: (line) => errLines.push(line),
    close: vi.fn().mockResolvedValue(undefined),
    outLines,
    errLines,
  };
}

describe('findCrossProjectEstimateRequests', () => {
  it('SELECT の 1 文だけを投げ、結果をそのまま返す（書き込みをしない）', async () => {
    const queryRaw = vi.fn().mockResolvedValue(FINDINGS);

    await expect(findCrossProjectEstimateRequests(createFakeClient(queryRaw))).resolves.toBe(
      FINDINGS
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    // 埋め込む値は無い
    expect(values).toEqual([]);
    const sql = strings.join('');
    expect(sql.trim().startsWith('SELECT')).toBe(true);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    // (a) 内訳書と (b) 内訳書の項目の両方を、見積依頼のプロジェクトと違うものに絞って読む
    expect(sql).toContain('"estimate_requests"');
    expect(sql).toContain('"estimate_request_items"');
    expect(sql).toContain('"itemized_statement_items"');
    expect(sql.match(/s\."projectId" <> er\."projectId"/g)).toHaveLength(2);
    expect(sql).toContain('UNION');
  });
});

describe('formatFindings', () => {
  it('1 行目に見積依頼の数（重複を 1 件と数える）と行の数、続けて ID と種別だけの行を出す', () => {
    expect(formatFindings(FINDINGS)).toEqual([
      '別のプロジェクトの内訳書を参照する見積依頼: 2 件（行は 3 行）',
      `見積依頼 ${REQUEST_1} 見積依頼のプロジェクト ${PROJECT_1} 参照先のプロジェクト ${PROJECT_2} 種別 (a)`,
      `見積依頼 ${REQUEST_1} 見積依頼のプロジェクト ${PROJECT_1} 参照先のプロジェクト ${PROJECT_2} 種別 (b)`,
      `見積依頼 ${REQUEST_2} 見積依頼のプロジェクト ${PROJECT_2} 参照先のプロジェクト ${PROJECT_1} 種別 (b)`,
    ]);
  });

  it('食い違いが無ければ 0 件の 1 行だけを出す', () => {
    expect(formatFindings([])).toEqual([
      '別のプロジェクトの内訳書を参照する見積依頼: 0 件（行は 0 行）',
    ]);
  });
});

describe('runFindCrossProjectEstimateRequests', () => {
  it('読めたら行を標準出力に出して 0 で終わる（0 件でも 0）', async () => {
    const found = createContext(vi.fn().mockResolvedValue(FINDINGS));
    await expect(runFindCrossProjectEstimateRequests(found)).resolves.toBe(EXIT_CODE.SUCCESS);
    expect(found.outLines).toEqual(formatFindings(FINDINGS));
    expect(found.errLines).toEqual([]);

    const none = createContext(vi.fn().mockResolvedValue([]));
    await expect(runFindCrossProjectEstimateRequests(none)).resolves.toBe(EXIT_CODE.SUCCESS);
    expect(none.outLines).toEqual([
      '別のプロジェクトの内訳書を参照する見積依頼: 0 件（行は 0 行）',
    ]);
  });

  it('実行の失敗は 1 で終わり、エラーの種類だけを出す（エラーの文言を出さない）', async () => {
    const withCode = Object.assign(new Error('secret connection string'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P1001',
    });
    const coded = createContext(vi.fn().mockRejectedValue(withCode));
    await expect(runFindCrossProjectEstimateRequests(coded)).resolves.toBe(EXIT_CODE.FAILURE);
    expect(coded.outLines).toEqual([]);
    expect(coded.errLines).toEqual([
      '不整合な見積依頼を確かめられませんでした（実行の失敗）: PrismaClientKnownRequestError P1001',
    ]);

    const plain = createContext(vi.fn().mockRejectedValue(new TypeError('secret detail')));
    await expect(runFindCrossProjectEstimateRequests(plain)).resolves.toBe(EXIT_CODE.FAILURE);
    expect(plain.errLines).toEqual([
      '不整合な見積依頼を確かめられませんでした（実行の失敗）: TypeError',
    ]);

    const nonError = createContext(vi.fn().mockRejectedValue('secret string'));
    await expect(runFindCrossProjectEstimateRequests(nonError)).resolves.toBe(EXIT_CODE.FAILURE);
    expect(nonError.errLines).toEqual([
      '不整合な見積依頼を確かめられませんでした（実行の失敗）: string',
    ]);

    for (const line of [...coded.errLines, ...plain.errLines, ...nonError.errLines]) {
      expect(line).not.toContain('secret');
    }
  });
});

describe('main', () => {
  it('実行の後に必ず接続を閉じ、結果の終了コードを返す', async () => {
    const ok = createContext(vi.fn().mockResolvedValue(FINDINGS));
    await expect(main(async () => ok)).resolves.toBe(EXIT_CODE.SUCCESS);
    expect(ok.close).toHaveBeenCalledTimes(1);

    const failed = createContext(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(main(async () => failed)).resolves.toBe(EXIT_CODE.FAILURE);
    expect(failed.close).toHaveBeenCalledTimes(1);
  });

  it('部品を渡さないときは本番の部品で実行し、データベースの接続を閉じる', async () => {
    prismaClient.$queryRaw.mockReset().mockResolvedValue([]);
    disconnectPrisma.mockClear();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(main()).resolves.toBe(EXIT_CODE.SUCCESS);
      expect(prismaClient.$queryRaw).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        '別のプロジェクトの内訳書を参照する見積依頼: 0 件（行は 0 行）'
      );
      expect(disconnectPrisma).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});

describe('createDefaultContext', () => {
  beforeEach(() => {
    disconnectPrisma.mockClear();
  });

  it('データベースのクライアントを使い、出力は標準出力と標準エラーへ出し、close で接続を閉じる', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const ctx = await createDefaultContext();
      expect(ctx.prisma).toBe(prismaClient);

      ctx.out('o');
      ctx.err('e');
      expect(log).toHaveBeenCalledWith('o');
      expect(error).toHaveBeenCalledWith('e');

      await ctx.close();
      expect(disconnectPrisma).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});

describe('isDirectExecution', () => {
  it('起動されたパスが自身のモジュールのときだけ真', () => {
    const scriptPath = '/app/dist/src/scripts/find-cross-project-estimate-requests.js';
    expect(isDirectExecution(scriptPath, pathToFileURL(scriptPath).href)).toBe(true);
    expect(isDirectExecution('/app/other.js', pathToFileURL(scriptPath).href)).toBe(false);
    expect(isDirectExecution(undefined, pathToFileURL(scriptPath).href)).toBe(false);
  });
});
