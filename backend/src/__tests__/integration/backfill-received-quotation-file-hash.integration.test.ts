/**
 * @fileoverview 既存の受領見積書のファイルの原本の指紋の埋め戻しの統合テスト
 *
 * タスク115.1: design の章「Requirements 43-50」の Migration Strategy の 2 と D6。
 * 実際の DB とローカルのストレージで、指紋の無いファイルを持つ受領見積書だけに sha256 が入ること、
 * 再実行で何も変わらないこと、集計だけの実行で書かないこと、読めないファイルを飛ばして件数を報告すること、
 * ファイルの無い受領見積書に触れないことを主張する。
 *
 * @requirement estimate-request/REQ-48.8 本要件の追加の前に登録された受領見積書のファイルにも指紋を求めて保持する
 *
 * @module __tests__/integration/backfill-received-quotation-file-hash.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { join } from 'path';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import { createTestUser } from './test-user-factory.js';
import { LocalStorageProvider } from '../../storage/local-storage.provider.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import { computeOriginalFingerprint } from '../../services/received-quotation.service.js';
import {
  backfillReceivedQuotationFileHashes,
  parseArgs,
  resolveBackfillExitCode,
  runBackfillCli,
  type BackfillCliContext,
} from '../../../scripts/backfill-received-quotation-file-hash.js';

describe('既存の受領見積書のファイルの指紋の埋め戻し（タスク115.1）', () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let prisma: PrismaClient;
  let storageRoot: string;
  let storage: LocalStorageProvider;
  let userId: string;
  let projectId: string;

  /** 指紋が null・ファイルあり（読める）の行 */
  let readableIds: string[];
  /** 指紋が null・ファイルあり（ストレージに実体が無い）の行 */
  let missingFileId: string;
  /** 指紋が null・ファイル無しの行 */
  let noFileId: string;
  /** 既に指紋を持つ行（埋め戻しの対象外） */
  let alreadyHashedId: string;
  const alreadyHashedValue = 'f'.repeat(64);

  const contentOf = (label: string) => Buffer.from(`%PDF-1.4 ${label} ${suffix}`);
  const sha256Of = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

  const insertQuotation = async (
    label: string,
    file: { key: string; content?: Buffer } | null,
    fileSha256: string | null = null
  ): Promise<string> => {
    if (file?.content) {
      await storage.upload(file.key, file.content, { contentType: 'application/pdf' });
    }
    const row = await prisma.receivedQuotation.create({
      data: {
        projectId,
        vendorName: `埋め戻しの業者_${suffix}`,
        name: `埋め戻し_${label}_${suffix}`,
        submittedAt: new Date('2026-11-08T00:00:00.000Z'),
        filePath: file?.key ?? null,
        fileName: file ? `${label}.pdf` : null,
        fileMimeType: file ? 'application/pdf' : null,
        fileSize: file?.content?.length ?? (file ? 10 : null),
        fileSha256,
      },
    });
    return row.id;
  };

  const rowsOf = (ids: string[]) =>
    prisma.receivedQuotation.findMany({
      where: { id: { in: ids } },
      select: { id: true, fileSha256: true, filePath: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });

  const allIds = () => [...readableIds, missingFileId, noFileId, alreadyHashedId];

  /**
   * 埋め戻しが読む・数える・書く行をこのテストの案件の行に絞る受領見積書の窓口。
   * 共有のテストの DB には他のテストや E2E の行が出入りしうるため、残りの件数・飛ばした行・終了コードを
   * このテストが作った行だけで決める
   */
  const scopedReceivedQuotation = () => {
    const delegate = prisma.receivedQuotation;
    const scope = <T extends { where?: object }>(args: T): T => ({
      ...args,
      where: { AND: [args.where ?? {}, { projectId }] },
    });
    return {
      findMany: (args: Parameters<typeof delegate.findMany>[0]) =>
        delegate.findMany(scope(args ?? {})),
      count: (args: Parameters<typeof delegate.count>[0]) => delegate.count(scope(args ?? {})),
      updateMany: (args: Parameters<typeof delegate.updateMany>[0]) =>
        delegate.updateMany(scope(args)),
    } as unknown as PrismaClient['receivedQuotation'];
  };

  /** このテストの案件の行のうち、指紋が null でファイルを持つ行の ID */
  const ownNullHashIdsWithFile = async () =>
    (await rowsOf(allIds()))
      .filter((row) => row.fileSha256 === null && row.filePath !== null)
      .map((row) => row.id)
      .sort();

  beforeAll(async () => {
    prisma = getPrismaClient();
    storageRoot = await mkdtemp(join(tmpdir(), 'rq-backfill-hash-'));
    storage = new LocalStorageProvider({ basePath: storageRoot });
    await storage.initialize();

    const user = await createTestUser(prisma, {
      email: `backfill-file-hash-${suffix}@example.com`,
      displayName: '指紋の埋め戻しの利用者',
      passwordHash: 'unused-password-hash',
    });
    userId = user.id;
    const project = await prisma.project.create({
      data: {
        name: `指紋の埋め戻しの案件_${suffix}`,
        status: 'PREPARING',
        salesPersonId: userId,
        createdById: userId,
      },
    });
    projectId = project.id;
  });

  beforeEach(async () => {
    await prisma.receivedQuotation.deleteMany({ where: { projectId } });
    await rm(join(storageRoot, 'quotations'), { recursive: true, force: true });

    readableIds = [];
    for (const label of ['読める1', '読める2', '読める3']) {
      readableIds.push(
        await insertQuotation(label, {
          key: `quotations/projects/${projectId}/${label}-${suffix}.pdf`,
          content: contentOf(label),
        })
      );
    }
    missingFileId = await insertQuotation('実体なし', {
      key: `quotations/projects/${projectId}/missing-${suffix}.pdf`,
    });
    noFileId = await insertQuotation('ファイルなし', null);
    alreadyHashedId = await insertQuotation(
      '指紋あり',
      {
        key: `quotations/projects/${projectId}/hashed-${suffix}.pdf`,
        content: contentOf('指紋あり'),
      },
      alreadyHashedValue
    );
  });

  afterAll(async () => {
    // 案件の外部キーは Restrict のため、案件を消す前に受領見積書を消す
    await prisma.receivedQuotation.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('指紋の無いファイルを持つ行だけに、ファイルの内容の sha256（16 進の小文字）を入れる', async () => {
    const before = await rowsOf(allIds());

    const result = await backfillReceivedQuotationFileHashes(
      { prisma, storageProvider: storage },
      { batchSize: 2 }
    );

    const after = new Map((await rowsOf(allIds())).map((row) => [row.id, row]));
    ['読める1', '読める2', '読める3'].forEach((label, index) => {
      const row = after.get(readableIds[index]!)!;
      expect(row.fileSha256).toBe(sha256Of(contentOf(label)));
      expect(row.fileSha256).toMatch(/^[0-9a-f]{64}$/);
      // サービスが保存のときに求める指紋と同じ関数の値である
      expect(row.fileSha256).toBe(computeOriginalFingerprint(contentOf(label)));
    });
    // ファイルの無い行・既に指紋を持つ行・読めない行は変わらない
    expect(after.get(noFileId)!.fileSha256).toBeNull();
    expect(after.get(alreadyHashedId)!.fileSha256).toBe(alreadyHashedValue);
    expect(after.get(missingFileId)!.fileSha256).toBeNull();
    // 指紋の埋め戻しは利用者の編集ではないため、更新日時を進めない（開いている編集の楽観的排他を崩さない）
    for (const row of before) {
      expect(after.get(row.id)!.updatedAt.toISOString()).toBe(row.updatedAt.toISOString());
    }

    expect(result.processed).toBe(3);
    expect(result.failures).toEqual([]);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ receivedQuotationId: missingFileId })
    );
    expect(result.skipped.map((entry) => entry.receivedQuotationId)).not.toContain(noFileId);
  });

  it('読めないファイルの行を飛ばして件数を報告し、残りの行は埋めて正常に終わる', async () => {
    const failingKey = `quotations/projects/${projectId}/読める2-${suffix}.pdf`;
    const throwingStorage: Pick<StorageProvider, 'get'> = {
      get: async (key) => {
        if (key === failingKey) throw new Error('storage unavailable');
        return storage.get(key);
      },
    };

    const result = await backfillReceivedQuotationFileHashes(
      {
        prisma: { receivedQuotation: scopedReceivedQuotation() },
        storageProvider: throwingStorage,
      },
      {}
    );

    const after = new Map((await rowsOf(allIds())).map((row) => [row.id, row]));
    expect(after.get(readableIds[0]!)!.fileSha256).toBe(sha256Of(contentOf('読める1')));
    expect(after.get(readableIds[1]!)!.fileSha256).toBeNull();
    expect(after.get(readableIds[2]!)!.fileSha256).toBe(sha256Of(contentOf('読める3')));

    const skippedIds = result.skipped.map((entry) => entry.receivedQuotationId);
    expect(skippedIds).toContain(missingFileId);
    expect(skippedIds).toContain(readableIds[1]);
    expect(result.skipped.find((e) => e.receivedQuotationId === readableIds[1])!.reason).toContain(
      'storage unavailable'
    );
    expect(result.skipped.find((e) => e.receivedQuotationId === missingFileId)!.reason).toBe(
      'ファイルがストレージに存在しない'
    );
    expect(result.processed).toBe(2);
    // 読めないファイルは致命的ではない（飛ばした行は残るが、残りがそれで説明できれば正常終了）
    // 走査はこのテストの案件の行に絞っているため、飛ばした行はちょうどこの 2 件である
    expect([...skippedIds].sort()).toEqual([missingFileId, readableIds[1]!].sort());
    expect(await ownNullHashIdsWithFile()).toEqual([missingFileId, readableIds[1]!].sort());
    expect(result.remaining).toBe(2);
    expect(result.remaining).toBe(result.skipped.length);
    expect(resolveBackfillExitCode(result, {})).toBe(0);
  });

  it('2 回目の実行では何も変わらない', async () => {
    await backfillReceivedQuotationFileHashes({ prisma, storageProvider: storage }, {});
    const afterFirst = await rowsOf(allIds());

    const second = await backfillReceivedQuotationFileHashes(
      { prisma, storageProvider: storage },
      {}
    );

    expect(second.processed).toBe(0);
    expect(second.failures).toEqual([]);
    expect(await rowsOf(allIds())).toEqual(afterFirst);
  });

  it('--dry-run では何も書かず、埋める件数と飛ばす行を報告する', async () => {
    const before = await rowsOf(allIds());

    const result = await backfillReceivedQuotationFileHashes(
      { prisma, storageProvider: storage },
      { dryRun: true, batchSize: 1 }
    );

    expect(await rowsOf(allIds())).toEqual(before);
    expect(result.processed).toBe(3);
    expect(result.skipped.map((entry) => entry.receivedQuotationId)).toContain(missingFileId);
    expect(result.remaining).toBeGreaterThanOrEqual(4);
    expect(resolveBackfillExitCode(result, { dryRun: true })).toBe(0);
  });

  it('引数の --dry-run と --batch-size を解釈する', () => {
    expect(parseArgs([])).toEqual({});
    expect(parseArgs(['--dry-run', '--batch-size=25'])).toEqual({ dryRun: true, batchSize: 25 });
    expect(parseArgs(['--batch-size=0'])).toEqual({});
    expect(parseArgs(['--batch-size=abc'])).toEqual({});
  });

  it('更新に失敗した行があれば異常終了の終了コードを返す', () => {
    expect(
      resolveBackfillExitCode(
        {
          processed: 0,
          skipped: [],
          failures: [{ receivedQuotationId: 'x', reason: 'boom' }],
          remaining: 1,
        },
        {}
      )
    ).toBe(1);
    // 飛ばした行で説明できない未処理が残るときも完了とみなさない
    expect(
      resolveBackfillExitCode({ processed: 0, skipped: [], failures: [], remaining: 1 }, {})
    ).toBe(1);
  });

  it('コマンドの入口は DB とストレージへつないで埋め戻し、終了コードを通知して切断する', async () => {
    let exitCode: number | null = null;
    let disconnected = false;
    const context: BackfillCliContext = {
      argv: ['--batch-size=2'],
      env: { DATABASE_URL: 'postgresql://unused' },
      loadEnv: () => {},
      createPrismaClient: () =>
        ({
          receivedQuotation: scopedReceivedQuotation(),
          $disconnect: async () => {
            disconnected = true;
          },
        }) as unknown as ReturnType<BackfillCliContext['createPrismaClient']>,
      createStorageProvider: () => storage,
      setExitCode: (code) => {
        exitCode = code;
      },
    };

    await runBackfillCli(context);

    const after = new Map((await rowsOf(allIds())).map((row) => [row.id, row]));
    expect(after.get(readableIds[0]!)!.fileSha256).toBe(sha256Of(contentOf('読める1')));
    // このテストの案件の行で残るのは実体の無いファイルの 1 件だけで、飛ばした行で説明できるため正常終了
    expect(await ownNullHashIdsWithFile()).toEqual([missingFileId]);
    expect(exitCode).toBe(0);
    expect(disconnected).toBe(true);
  });

  it('コマンドの入口は接続先やストレージの設定が無ければ失敗する', async () => {
    const base: BackfillCliContext = {
      argv: [],
      env: {},
      loadEnv: () => {},
      createPrismaClient: () => {
        throw new Error('呼ばれない');
      },
      createStorageProvider: () => null,
      setExitCode: () => {},
    };
    await expect(runBackfillCli(base)).rejects.toThrow('DATABASE_URL が設定されていません');
    await expect(
      runBackfillCli({ ...base, env: { DATABASE_URL: 'postgresql://unused' } })
    ).rejects.toThrow('ストレージが設定されていません');
  });
});
