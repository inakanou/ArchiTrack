/**
 * @fileoverview 注釈が焼き込まれた通常サムネイルの是正のテスト
 *
 * Task 115.5: 注釈が焼き込まれた通常サムネイルを素の画像へ戻す手段を用意する
 *
 * Requirements:
 * - 20.2: 現場調査詳細画面の各画像のサムネイルに保存済みの注釈を反映して表示する
 * - 20.3: 現場調査一覧画面の代表画像のサムネイルに保存済みの注釈を反映して表示する
 * - 23.8: 画像変更を伴わない保存でも冪等に動作し既存サムネイルを破損させない
 * - 38.6: 注釈をレンダリングしたサムネイルが利用できない場合の代替手段を維持する
 *
 * @module tests/unit/scripts/restore-plain-thumbnails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StorageProvider } from '../../../storage/storage-provider.interface.js';
import logger from '../../../utils/logger.js';
import {
  restorePlainThumbnails,
  resolveRestoreExitCode,
  buildPlainThumbnailKey,
  parseArgs,
  runRestoreCli,
  createRestorePrismaClient,
  createRestoreRuntimeDependencies,
  createDefaultRestoreCliContext,
  setProcessExitCode,
  reportFatalStartupError,
  isDirectExecution,
  ANNOTATION_BAKED_THUMBNAIL_MARKER,
  type RestoreCliContext,
} from '../../../../scripts/restore-plain-thumbnails.js';

// ============================================================================
// 疑似データストア
//
// 抽出条件と更新の相互作用（処理した画像が抽出条件から外れる）を再現しないと、
// 区切り実行での取りこぼしを検出できない。実DBと同じ振る舞いを持つ配列を保持し、
// 抽出は条件で絞り、更新は配列を書き換える。
// ============================================================================

const SURVEY_ID = 'survey-1';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type ImageFormat = 'jpeg' | 'png';

/** 指定形式のマジックバイトに目印を連結した最小限のバッファ */
function imageBuffer(format: ImageFormat, marker: string): Buffer {
  return Buffer.concat([format === 'png' ? PNG_MAGIC : JPEG_MAGIC, Buffer.from(marker, 'utf-8')]);
}

function formatOf(buffer: Buffer): ImageFormat {
  return buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ? 'png' : 'jpeg';
}

/** バッファからマジックバイトを除いた目印を取り出す */
function markerOf(buffer: Buffer): string {
  const format = formatOf(buffer);
  return buffer.subarray(format === 'png' ? PNG_MAGIC.length : JPEG_MAGIC.length).toString('utf-8');
}

/**
 * マジックバイトからMIMEタイプを判定する（SurveyImageService と同じ判定基準）
 */
function detectMimeTypeByMagicBytes(buffer: Buffer): string {
  return formatOf(buffer) === 'png' ? 'image/png' : 'image/jpeg';
}

/**
 * Prisma の `contains` を SQL の `LIKE '%..%'` と同じ意味に写す
 *
 * Prisma は `contains` の値に含まれる `_` / `%` をエスケープしない。SQL の `LIKE` では
 * `_` が任意の1文字、`%` が任意の文字列にあたるため、抽出結果には厳密には合致しない行が
 * 混ざる。素朴な部分一致で模擬すると実DBより厳しくなり、この取りこぼしを検出できない。
 */
function likeContains(contains: string): RegExp {
  const pattern = contains
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/_/g, '.')
    .replace(/%/g, '.*');
  return new RegExp(pattern);
}

interface FakeImageRow {
  id: string;
  surveyId: string;
  fileName: string;
  originalPath: string;
  thumbnailPath: string;
  annotatedThumbnailPath: string | null;
}

interface FakeFindManyArgs {
  where?: {
    thumbnailPath?: { contains?: string };
    id?: { gt?: string };
  };
  select?: Record<string, boolean>;
  orderBy?: { id: 'asc' | 'desc' };
  take?: number;
  cursor?: { id: string };
  skip?: number;
}

interface FakeStoreEntry {
  id: string;
  /** 通常サムネイルに注釈が焼き込まれているか */
  baked: boolean;
  /** ファイル名（省略時は `${id}.jpg`） */
  fileName?: string;
  /** 合成済みサムネイルのキー */
  annotatedThumbnailPath?: string | null;
  /** 原本の画像形式（省略時は jpeg） */
  format?: ImageFormat;
  /** 通常サムネイルのキーを直接指定する（命名の境界を再現する用途） */
  thumbnailPath?: string;
}

function bakedThumbnailKey(id: string, fileName: string): string {
  return `surveys/${SURVEY_ID}/1700000000000_thumb_annotated_${fileName}`.replace(
    '1700000000000',
    `17000000000${id.replace(/\D/g, '').padStart(2, '0')}`
  );
}

function createFakeStore(entries: FakeStoreEntry[]) {
  const rows: FakeImageRow[] = entries.map((entry) => {
    const fileName = entry.fileName ?? `${entry.id}.jpg`;
    return {
      id: entry.id,
      surveyId: SURVEY_ID,
      fileName,
      originalPath: `surveys/${SURVEY_ID}/1700000000000_${fileName}`,
      thumbnailPath:
        entry.thumbnailPath ??
        (entry.baked
          ? bakedThumbnailKey(entry.id, fileName)
          : `surveys/${SURVEY_ID}/1700000000000_thumb_${fileName}`),
      annotatedThumbnailPath:
        entry.annotatedThumbnailPath === undefined ? null : entry.annotatedThumbnailPath,
    };
  });

  /** 実行順序の観測用イベントログ */
  const events: string[] = [];

  /** ストレージ上の実体（キー → 内容） */
  const objects = new Map<string, Buffer>();
  rows.forEach((row, index) => {
    const format = entries[index]?.format ?? 'jpeg';
    objects.set(row.originalPath, imageBuffer(format, `original:${row.id}`));
    objects.set(row.thumbnailPath, imageBuffer(format, `thumb:${row.id}`));
    if (row.annotatedThumbnailPath !== null) {
      objects.set(row.annotatedThumbnailPath, imageBuffer(format, `annotated:${row.id}`));
    }
  });

  const matchesMarker = (row: FakeImageRow, contains: string | undefined): boolean =>
    contains === undefined ? true : likeContains(contains).test(row.thumbnailPath);

  const findMany = vi.fn((args: FakeFindManyArgs = {}) => {
    let candidates = rows
      .filter((row) => matchesMarker(row, args.where?.thumbnailPath?.contains))
      .sort((a, b) => a.id.localeCompare(b.id));

    const gt = args.where?.id?.gt;
    if (gt !== undefined) {
      candidates = candidates.filter((row) => row.id > gt);
    }

    // Prisma のカーソルは「抽出条件を満たす行のうちカーソルID以上」に OFFSET を適用する。
    // 処理で対象から外れた行があってもオフセットは詰められるため、カーソル+skip 方式は
    // 実DBと同じ取りこぼしを起こす。ここでも同じ振る舞いを再現する。
    if (args.cursor !== undefined) {
      const cursorId = args.cursor.id;
      candidates = candidates.filter((row) => row.id >= cursorId);
    }
    if (args.skip !== undefined) {
      candidates = candidates.slice(args.skip);
    }

    const take = args.take ?? candidates.length;
    return Promise.resolve(candidates.slice(0, take).map((row) => ({ ...row })));
  });

  const update = vi.fn(
    ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (row === undefined) {
        return Promise.reject(new Error(`record not found: ${where.id}`));
      }
      events.push(`update:${where.id}`);
      if (typeof data.thumbnailPath === 'string') {
        row.thumbnailPath = data.thumbnailPath;
      }
      if ('annotatedThumbnailPath' in data) {
        row.annotatedThumbnailPath = data.annotatedThumbnailPath as string | null;
      }
      return Promise.resolve({ id: row.id });
    }
  );

  // count は意図的に提供しない。抽出条件が SQL の LIKE へ写る以上、件数の集計を
  // データベース側へ委ねると厳密には合致しない行まで数えてしまうためである。
  const count = vi.fn(() => Promise.reject(new Error('count は用いない')));

  const get = vi.fn((key: string) => {
    events.push(`get:${key}`);
    return Promise.resolve(objects.get(key) ?? null);
  });

  const upload = vi.fn((key: string, data: Buffer) => {
    events.push(`upload:${key}`);
    objects.set(key, data);
    return Promise.resolve({ key, size: data.length });
  });

  const del = vi.fn((key: string) => {
    events.push(`delete:${key}`);
    objects.delete(key);
    return Promise.resolve();
  });

  // 実装の generateThumbnail は元画像の形式を保つ。疑似実装も同じ性質を持たせる。
  const generateThumbnail = vi.fn((buffer: Buffer) =>
    Promise.resolve(imageBuffer(formatOf(buffer), `regenerated:${markerOf(buffer)}`))
  );

  const deps = {
    prisma: { surveyImage: { findMany, update, count } },
    storageProvider: { get, upload, delete: del },
    imageProcessorService: { generateThumbnail },
    surveyImageService: { detectMimeTypeByMagicBytes },
  };

  return {
    rows,
    events,
    objects,
    findMany,
    update,
    get,
    upload,
    del,
    generateThumbnail,
    deps,
    row: (id: string) => rows.find((candidate) => candidate.id === id),
    /** 通常サムネイルに注釈が焼き込まれたまま残っている画像ID */
    bakedIds: () =>
      rows
        .filter((row) => row.thumbnailPath.includes(ANNOTATION_BAKED_THUMBNAIL_MARKER))
        .map((row) => row.id),
    run: (options?: { batchSize?: number; dryRun?: boolean }) =>
      restorePlainThumbnails(deps as never, options),
  };
}

describe('restorePlainThumbnails (Task 115.5, Requirements: 20.2, 20.3, 23.8, 38.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('対象の識別', () => {
    it('注釈が焼き込まれた命名の通常サムネイルのみを抽出条件とする', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);

      await store.run();

      const where = store.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({
        thumbnailPath: { contains: ANNOTATION_BAKED_THUMBNAIL_MARKER },
      });
    });

    it('素のサムネイルを持つ画像は対象にせず一切書き換えない', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: false },
        { id: 'img-2', baked: true },
      ]);
      const untouched = store.row('img-1')?.thumbnailPath;

      const result = await store.run();

      expect(result.targeted).toBe(1);
      expect(store.row('img-1')?.thumbnailPath).toBe(untouched);
      expect(store.update).toHaveBeenCalledTimes(1);
      expect(store.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'img-2' } })
      );
    });

    it('データベース側の絞り込みに緩く合致するだけの画像は対象にせず残件にも数えない', async () => {
      // SQL の LIKE では `_thumb_annotated_` の `_` が任意の1文字に一致するため、
      // 是正済みの `_plainthumb_annotated_x.jpg` も抽出されてしまう。
      const store = createFakeStore([
        {
          id: 'img-1',
          baked: false,
          fileName: 'annotated_x.jpg',
          thumbnailPath: `surveys/${SURVEY_ID}/1700000000000_plainthumb_annotated_x.jpg`,
        },
        { id: 'img-2', baked: true },
      ]);
      // 前提: 疑似ストアは実DBと同じく緩い一致で抽出する
      const candidates = await store.deps.prisma.surveyImage.findMany({
        where: { thumbnailPath: { contains: ANNOTATION_BAKED_THUMBNAIL_MARKER } },
      });
      expect(candidates.map((row) => row.id)).toEqual(['img-1', 'img-2']);

      const result = await store.run({ batchSize: 5 });

      expect(result.targeted).toBe(1);
      expect(result.restored).toBe(1);
      expect(result.remaining).toBe(0);
      expect(store.update).toHaveBeenCalledTimes(1);
      expect(store.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'img-2' } })
      );
    });

    it('対象が0件の場合は何も書き換えない', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: false }]);

      const result = await store.run();

      expect(result.targeted).toBe(0);
      expect(result.restored).toBe(0);
      expect(store.update).not.toHaveBeenCalled();
      expect(store.upload).not.toHaveBeenCalled();
    });
  });

  describe('素のサムネイルへの再生成', () => {
    it('原本から再生成した内容を新しいキーへ保存し通常サムネイルを差し替える', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);

      const result = await store.run();

      expect(result.restored).toBe(1);
      expect(store.get).toHaveBeenCalledWith(`surveys/${SURVEY_ID}/1700000000000_img-1.jpg`);
      expect(store.generateThumbnail).toHaveBeenCalledTimes(1);

      const newPath = store.row('img-1')?.thumbnailPath ?? '';
      expect(newPath).not.toContain(ANNOTATION_BAKED_THUMBNAIL_MARKER);
      // 差し替え後の実体は原本から再生成した内容である（焼き込み済みの中身ではない）
      const stored = store.objects.get(newPath);
      expect(stored).toBeDefined();
      expect(markerOf(stored as Buffer)).toBe('regenerated:original:img-1');
    });

    it('再生成した実体の形式に合わせた Content-Type で保存する', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true, format: 'png' }]);

      await store.run();

      expect(store.upload).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/png' })
      );
    });

    it('合成済みサムネイルの項目には触れない', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true, annotatedThumbnailPath: 'annotated-thumbnails/img-1.1.jpg' },
      ]);

      await store.run();

      expect(store.row('img-1')?.annotatedThumbnailPath).toBe('annotated-thumbnails/img-1.1.jpg');
      expect(store.objects.has('annotated-thumbnails/img-1.1.jpg')).toBe(true);
      for (const call of store.update.mock.calls) {
        expect(call[0]?.data).not.toHaveProperty('annotatedThumbnailPath');
      }
      expect(store.del).not.toHaveBeenCalledWith('annotated-thumbnails/img-1.1.jpg');
    });

    it('新しいキーの保存・項目の更新・旧キーの削除の順に行い表示元が失われる瞬間を作らない', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);
      const oldPath = store.row('img-1')?.thumbnailPath ?? '';

      await store.run();

      const newPath = store.row('img-1')?.thumbnailPath ?? '';
      const uploadIndex = store.events.indexOf(`upload:${newPath}`);
      const updateIndex = store.events.indexOf('update:img-1');
      const deleteIndex = store.events.indexOf(`delete:${oldPath}`);

      expect(uploadIndex).toBeGreaterThanOrEqual(0);
      expect(uploadIndex).toBeLessThan(updateIndex);
      expect(updateIndex).toBeLessThan(deleteIndex);
    });

    it('保存に失敗した場合は項目を更新せず焼き込み済みの表示元を維持する', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);
      const oldPath = store.row('img-1')?.thumbnailPath ?? '';
      store.upload.mockImplementationOnce(() => Promise.reject(new Error('storage unavailable')));

      const result = await store.run();

      expect(result.restored).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ imageId: 'img-1' });
      expect(result.failures[0]?.reason).toContain('storage unavailable');
      expect(store.update).not.toHaveBeenCalled();
      expect(store.row('img-1')?.thumbnailPath).toBe(oldPath);
      expect(store.objects.has(oldPath)).toBe(true);
    });

    it('原本が取得できない画像は失敗として記録し残りの処理を継続する', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true },
        { id: 'img-2', baked: true },
      ]);
      store.objects.delete(`surveys/${SURVEY_ID}/1700000000000_img-1.jpg`);

      const result = await store.run({ batchSize: 2 });

      expect(result.targeted).toBe(2);
      expect(result.restored).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.imageId).toBe('img-1');
      expect(store.bakedIds()).toEqual(['img-1']);
    });

    it('項目の更新に失敗した場合は参照されない新しい実体を残さない', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);
      const oldPath = store.row('img-1')?.thumbnailPath ?? '';
      store.update.mockImplementationOnce(() => Promise.reject(new Error('deadlock detected')));

      const result = await store.run();

      expect(result.failures).toHaveLength(1);
      expect(store.row('img-1')?.thumbnailPath).toBe(oldPath);
      // アップロード済みの新キーは後始末され、旧い表示元は維持される
      const uploadedKeys = store.upload.mock.calls.map((call) => call[0] as string);
      for (const key of uploadedKeys) {
        expect(store.objects.has(key)).toBe(false);
      }
      expect(store.objects.has(oldPath)).toBe(true);
    });
  });

  describe('実行件数の区切り', () => {
    const sevenImages: FakeStoreEntry[] = [
      { id: 'img-1', baked: true },
      { id: 'img-2', baked: true },
      { id: 'img-3', baked: true },
      { id: 'img-4', baked: true },
      { id: 'img-5', baked: true },
      { id: 'img-6', baked: true },
      { id: 'img-7', baked: true },
    ];

    it('総件数が区切り件数を超えても1件も取りこぼさず全件を是正する', async () => {
      const store = createFakeStore(sevenImages);

      const result = await store.run({ batchSize: 2 });

      expect(store.bakedIds()).toEqual([]);
      expect(result.targeted).toBe(7);
      expect(result.restored).toBe(7);
      expect(result.failures).toHaveLength(0);
      expect(result.remaining).toBe(0);
    });

    it('1回の抽出は区切り件数までに限り全件を一度に読み出さない', async () => {
      const store = createFakeStore(sevenImages);

      await store.run({ batchSize: 2 });

      expect(store.findMany.mock.calls.length).toBeGreaterThan(0);
      for (const call of store.findMany.mock.calls) {
        expect(call[0]?.take).toBe(2);
      }
    });

    it('集計のみの実行でも対象が減らないまま前進し全件を数える', async () => {
      const store = createFakeStore(sevenImages);

      const result = await store.run({ batchSize: 2, dryRun: true });

      expect(result.targeted).toBe(7);
      expect(result.restored).toBe(0);
      expect(store.upload).not.toHaveBeenCalled();
      expect(store.update).not.toHaveBeenCalled();
      expect(store.bakedIds()).toHaveLength(7);
      expect(result.remaining).toBe(7);
    });
  });

  describe('冪等性', () => {
    it('是正済みの画像は次回の抽出条件に合致せず再実行で0件になる', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true },
        { id: 'img-2', baked: true },
      ]);

      const first = await store.run({ batchSize: 1 });
      expect(first.restored).toBe(2);

      const second = await store.run({ batchSize: 1 });

      expect(second.targeted).toBe(0);
      expect(second.restored).toBe(0);
      expect(store.update).toHaveBeenCalledTimes(2);
    });

    it('ファイル名自体が annotated_ で始まる画像でも再実行で二重処理しない', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true, fileName: 'annotated_photo.jpg' },
      ]);

      const first = await store.run();
      expect(first.restored).toBe(1);
      expect(store.row('img-1')?.thumbnailPath).not.toContain(ANNOTATION_BAKED_THUMBNAIL_MARKER);

      const second = await store.run();

      expect(second.targeted).toBe(0);
      expect(second.remaining).toBe(0);
    });
  });

  describe('残件の報告', () => {
    it('是正できなかった画像が残った場合は残件数を報告する', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true },
        { id: 'img-2', baked: true },
        { id: 'img-3', baked: true },
      ]);
      store.upload.mockImplementationOnce(() => Promise.reject(new Error('storage unavailable')));

      const result = await store.run({ batchSize: 2 });

      expect(result.failures).toHaveLength(1);
      expect(result.remaining).toBe(1);
      expect(store.bakedIds()).toEqual(['img-1']);
    });

    it('全件を是正できた場合の残件数は0である', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true },
        { id: 'img-2', baked: true },
      ]);

      const result = await store.run({ batchSize: 1 });

      expect(result.remaining).toBe(0);
    });
  });

  describe('終了コードの決定', () => {
    const clean = { targeted: 3, restored: 3, failures: [], remaining: 0 };

    it('全件を是正できた場合は0を返す', () => {
      expect(resolveRestoreExitCode(clean, {})).toBe(0);
    });

    it('未是正が残った場合は完了と誤認させないため1を返す', () => {
      expect(resolveRestoreExitCode({ ...clean, remaining: 2 }, {})).toBe(1);
    });

    it('失敗した画像がある場合は1を返す', () => {
      expect(
        resolveRestoreExitCode(
          { ...clean, failures: [{ imageId: 'img-1', reason: 'storage unavailable' }] },
          {}
        )
      ).toBe(1);
    });

    it('集計のみの実行では未是正が残っていても0を返す', () => {
      expect(resolveRestoreExitCode({ ...clean, remaining: 5 }, { dryRun: true })).toBe(0);
    });
  });

  describe('新しいキーの命名', () => {
    it('通常のファイル名では素のサムネイルと同じ命名規則を用いる', () => {
      expect(buildPlainThumbnailKey('survey-1', 'photo.jpg', 1700000000000)).toBe(
        'surveys/survey-1/1700000000000_thumb_photo.jpg'
      );
    });

    it('識別条件に合致してしまうファイル名では合致しない命名へ退避する', () => {
      const key = buildPlainThumbnailKey('survey-1', 'annotated_photo.jpg', 1700000000000);

      expect(key).not.toContain(ANNOTATION_BAKED_THUMBNAIL_MARKER);
      expect(key).toContain('annotated_photo.jpg');
    });
  });

  describe('引数の解釈', () => {
    it('集計のみの実行と区切り件数を受け付ける', () => {
      expect(parseArgs(['--dry-run', '--batch-size=25'])).toEqual({
        dryRun: true,
        batchSize: 25,
      });
    });

    it('指定が無い場合は既定の挙動とする', () => {
      expect(parseArgs([])).toEqual({});
    });

    it('区切り件数に0を指定した場合は既定の区切りを維持する', () => {
      expect(parseArgs(['--batch-size=0'])).toEqual({});
    });

    it('解釈できない引数は無視する', () => {
      expect(parseArgs(['--batch-size=abc', '--unknown'])).toEqual({});
    });
  });

  describe('Error 以外で失敗した場合の記録', () => {
    it('原本の取得が Error 以外で失敗しても理由を文字列として記録する', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);
      store.get.mockImplementationOnce(() => Promise.reject('socket hang up'));

      const result = await store.run();

      expect(result.failures).toEqual([{ imageId: 'img-1', reason: 'socket hang up' }]);
    });

    it('旧いキーの後始末が Error 以外で失敗しても是正は成立する', async () => {
      const store = createFakeStore([{ id: 'img-1', baked: true }]);
      store.del.mockImplementationOnce(() => Promise.reject('access denied'));

      const result = await store.run();

      expect(result.restored).toBe(1);
      expect(result.failures).toHaveLength(0);
      expect(store.bakedIds()).toEqual([]);
    });

    it('項目の更新に失敗した場合は新しい実体の後始末に失敗しても処理を継続する', async () => {
      const store = createFakeStore([
        { id: 'img-1', baked: true },
        { id: 'img-2', baked: true },
      ]);
      store.update.mockImplementationOnce(() => Promise.reject(new Error('deadlock detected')));
      store.del.mockImplementationOnce(() => Promise.reject(new Error('access denied')));

      const result = await store.run();

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ imageId: 'img-1' });
      // 後続の画像は是正されている（後始末の失敗で全体を中断しない）
      expect(result.restored).toBe(1);
      expect(store.bakedIds()).toEqual(['img-1']);
    });
  });
});

// ============================================================================
// 実行入口
//
// 「関数はあるが起動できない」状態を防ぐため、npm スクリプトとして起動できることと、
// スクリプトを直接実行すると実際に処理が始まることを、実起動で確認する。
// ============================================================================

describe('restore-plain-thumbnails の実行入口', () => {
  const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url));

  it('npm スクリプトとして起動できる', () => {
    const packageJson = JSON.parse(readFileSync(`${backendRoot}package.json`, 'utf-8')) as {
      scripts: Record<string, string>;
    };

    const entry = packageJson.scripts['restore:plain-thumbnails'];
    expect(entry).toBeDefined();
    expect(entry).toContain('scripts/restore-plain-thumbnails.ts');
  });

  it('スクリプトを直接実行すると起動処理が動きDB接続の準備段階まで到達する', () => {
    // 接続先を与えずに起動する。入口が結線されていれば起動処理が動き、接続先の欠落で
    // 失敗して終了コード1になる。入口が壊れていれば何もせず正常終了してしまう。
    const isolatedCwd = mkdtempSync(join(tmpdir(), 'restore-plain-thumbs-entry-'));
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DATABASE_URL;

    const proc = spawnSync(
      `${backendRoot}node_modules/.bin/tsx`,
      [`${backendRoot}scripts/restore-plain-thumbnails.ts`],
      { cwd: isolatedCwd, env, encoding: 'utf-8', timeout: 120_000 }
    );

    const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
    expect(proc.error).toBeUndefined();
    expect(output).toContain('restore_plain_thumbnails_failed');
    expect(output).toContain('DATABASE_URL');
    expect(proc.status).toBe(1);
  }, 150_000);
});

// ============================================================================
// 起動処理
//
// 実起動での確認（上記）は入口が結線されていることしか示さない。起動処理が
// 前提条件の確認・引数の解釈・実行時の依存の組み立て・終了コードの通知まで
// 正しく行うことは、外部と接する部分を差し替えて直接検証する。
// ============================================================================

describe('runRestoreCli（起動処理）', () => {
  const CONNECTION_STRING = 'postgresql://user:pass@localhost:5432/architrack';

  /**
   * 外部と接する部分を差し替えた実行文脈を組み立てる
   *
   * @param options - 対象画像・引数・環境変数・前提条件
   */
  function createCliHarness(
    options: {
      entries?: FakeStoreEntry[];
      argv?: string[];
      env?: NodeJS.ProcessEnv;
      storageConfigured?: boolean;
      storageProvider?: unknown;
    } = {}
  ) {
    const store = createFakeStore(options.entries ?? [{ id: 'img-1', baked: true }]);
    const disconnect = vi.fn(() => Promise.resolve());
    const prisma = { ...store.deps.prisma, $disconnect: disconnect };
    const createPrismaClient = vi.fn(() => prisma);
    const storageProvider =
      options.storageProvider === undefined ? store.deps.storageProvider : options.storageProvider;
    const isStorageConfiguredFn = vi.fn(() => options.storageConfigured ?? true);
    const getStorageProviderFn = vi.fn(() => storageProvider);
    const createRestoreDependencies = vi.fn((injectedPrisma: unknown, injectedStorage: unknown) =>
      Promise.resolve({
        ...store.deps,
        prisma: injectedPrisma,
        storageProvider: injectedStorage,
      })
    );
    const setExitCode = vi.fn();
    const loadEnv = vi.fn();

    const context = {
      argv: options.argv ?? [],
      env: options.env ?? { DATABASE_URL: CONNECTION_STRING },
      loadEnv,
      isStorageConfigured: isStorageConfiguredFn,
      getStorageProvider: getStorageProviderFn,
      createPrismaClient,
      createRestoreDependencies,
      setExitCode,
    } as unknown as RestoreCliContext;

    return {
      store,
      prisma,
      disconnect,
      createPrismaClient,
      createRestoreDependencies,
      isStorageConfiguredFn,
      getStorageProviderFn,
      setExitCode,
      loadEnv,
      context,
    };
  }

  it('接続先が未設定の場合は起動を中止し接続を試みない', async () => {
    const harness = createCliHarness({ env: {} });

    await expect(runRestoreCli(harness.context)).rejects.toThrow('DATABASE_URL');

    expect(harness.loadEnv).toHaveBeenCalledTimes(1);
    expect(harness.createPrismaClient).not.toHaveBeenCalled();
    expect(harness.setExitCode).not.toHaveBeenCalled();
  });

  it('ストレージが未設定の場合は起動を中止する', async () => {
    const harness = createCliHarness({ storageConfigured: false });

    await expect(runRestoreCli(harness.context)).rejects.toThrow('ストレージが設定されていません');

    expect(harness.createPrismaClient).not.toHaveBeenCalled();
  });

  it('ストレージプロバイダーを初期化できない場合は起動を中止する', async () => {
    const harness = createCliHarness({ storageProvider: null });

    await expect(runRestoreCli(harness.context)).rejects.toThrow(
      'ストレージプロバイダーを初期化できませんでした'
    );

    expect(harness.createPrismaClient).not.toHaveBeenCalled();
  });

  it('接続先とストレージを実行時の依存の組み立てへ引き渡す', async () => {
    const harness = createCliHarness();

    await runRestoreCli(harness.context);

    expect(harness.createPrismaClient).toHaveBeenCalledWith(CONNECTION_STRING);
    expect(harness.createRestoreDependencies).toHaveBeenCalledWith(
      harness.prisma,
      harness.store.deps.storageProvider
    );
  });

  it('引数を解釈して是正へ反映する', async () => {
    const harness = createCliHarness({
      entries: [
        { id: 'img-1', baked: true },
        { id: 'img-2', baked: true },
        { id: 'img-3', baked: true },
      ],
      argv: ['--batch-size=2'],
    });

    await runRestoreCli(harness.context);

    expect(harness.store.findMany.mock.calls.length).toBeGreaterThan(0);
    for (const call of harness.store.findMany.mock.calls) {
      expect(call[0]?.take).toBe(2);
    }
    expect(harness.store.bakedIds()).toEqual([]);
  });

  it('全件を是正できた場合は終了コード0を通知する', async () => {
    const harness = createCliHarness();

    await runRestoreCli(harness.context);

    expect(harness.setExitCode).toHaveBeenCalledWith(0);
  });

  it('焼き込みが残った場合は終了コード1を通知する', async () => {
    const harness = createCliHarness();
    harness.store.get.mockImplementationOnce(() => Promise.resolve(null));

    await runRestoreCli(harness.context);

    expect(harness.setExitCode).toHaveBeenCalledWith(1);
  });

  it('集計のみの実行では差し替えず終了コード0を通知する', async () => {
    const harness = createCliHarness({ argv: ['--dry-run'] });

    await runRestoreCli(harness.context);

    expect(harness.store.upload).not.toHaveBeenCalled();
    expect(harness.store.update).not.toHaveBeenCalled();
    expect(harness.setExitCode).toHaveBeenCalledWith(0);
  });

  it('是正が例外で終わっても接続を解放する', async () => {
    const harness = createCliHarness();
    harness.store.findMany.mockImplementationOnce(() =>
      Promise.reject(new Error('connection refused'))
    );

    await expect(runRestoreCli(harness.context)).rejects.toThrow('connection refused');

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it('正常終了時にも接続を解放する', async () => {
    const harness = createCliHarness();

    await runRestoreCli(harness.context);

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('実行時の依存の組み立て', () => {
  it('接続先から Prisma クライアントを組み立てる', async () => {
    const client = createRestorePrismaClient(
      'postgresql://user:pass@127.0.0.1:65432/architrack_unused'
    );

    expect(typeof client.surveyImage.findMany).toBe('function');
    expect(typeof client.surveyImage.update).toBe('function');

    await client.$disconnect();
  });

  it('sharp と各サービスを結線した依存を組み立て、実際に素のサムネイルを生成できる', async () => {
    const prisma = { surveyImage: {} } as unknown as PrismaClient;
    const storageProvider = {
      get: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
    } as unknown as StorageProvider;

    const deps = await createRestoreRuntimeDependencies(prisma, storageProvider);

    expect(deps.prisma).toBe(prisma);
    expect(deps.storageProvider).toBe(storageProvider);

    // 組み立てた依存が実体として動作すること（sharp の結線を含む）を確かめる
    const sharp = (await import('sharp')).default;
    const source = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const thumbnail = await deps.imageProcessorService.generateThumbnail(source);
    const metadata = await sharp(thumbnail).metadata();

    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(200);
    expect(deps.surveyImageService.detectMimeTypeByMagicBytes(thumbnail)).toBe('image/jpeg');
  }, 30_000);

  it('既定の実行文脈は実プロセスの引数と環境変数を用いる', () => {
    const context = createDefaultRestoreCliContext();

    expect(context.argv).toEqual(process.argv.slice(2));
    expect(context.env).toBe(process.env);
    expect(context.createPrismaClient).toBe(createRestorePrismaClient);
    expect(context.createRestoreDependencies).toBe(createRestoreRuntimeDependencies);
    expect(context.setExitCode).toBe(setProcessExitCode);
    expect(typeof context.loadEnv).toBe('function');
    expect(typeof context.isStorageConfigured).toBe('function');
    expect(typeof context.getStorageProvider).toBe('function');
  });

  it('終了コードの通知はプロセスの終了コードへ反映される', () => {
    const original = process.exitCode;
    try {
      setProcessExitCode(0);
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = original;
    }
  });
});

describe('起動時の致命的な失敗の扱い', () => {
  it('失敗を記録して異常終了させる', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never);

    try {
      reportFatalStartupError(new Error('DATABASE_URL が設定されていません'));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'restore_plain_thumbnails_failed',
          error: 'DATABASE_URL が設定されていません',
        })
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('Error 以外の失敗も文字列として記録する', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never);

    try {
      reportFatalStartupError('unexpected token');

      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'unexpected token' }));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('直接実行の判定', () => {
  it('起動されたスクリプトが自身と一致する場合のみ真とする', () => {
    expect(isDirectExecution('/app/scripts/x.ts', 'file:///app/scripts/x.ts')).toBe(true);
  });

  it('別のモジュールから読み込まれた場合は偽とする', () => {
    expect(isDirectExecution('/app/scripts/other.ts', 'file:///app/scripts/x.ts')).toBe(false);
  });

  it('起動されたスクリプトが特定できない場合は偽とする', () => {
    expect(isDirectExecution(undefined, 'file:///app/scripts/x.ts')).toBe(false);
  });
});
