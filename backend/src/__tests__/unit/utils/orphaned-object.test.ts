/**
 * @fileoverview 孤立ファイル回収ユーティリティのユニットテスト
 *
 * Task 115.12: 合成済みサムネイルの保存に成功し項目更新に失敗した試行の実体を
 * 回収対象にするにあたり、既存の孤立ファイル回収（orphaned/ プレフィックスへの移動）を
 * 共有ユーティリティとして切り出した。ここではその全分岐を検証する。
 *
 * Requirements:
 * - 4.8: 孤立ファイルとして専用プレフィックス（orphaned/）に移動し、
 *   Object Lifecycle Rule により 7 日後に自動削除する
 *
 * @requirement site-survey/REQ-4.8
 *
 * @module tests/unit/utils/orphaned-object
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import logger from '../../../utils/logger.js';
import { moveToOrphaned, toOrphanedPath, ORPHANED_PREFIX } from '../../../utils/orphaned-object.js';

const TARGET_PATH = 'annotated-thumbnails/image-123.1700000000000.jpg';

describe('toOrphanedPath (Req 4.8)', () => {
  it('orphaned/ プレフィックスを付与する', () => {
    expect(ORPHANED_PREFIX).toBe('orphaned');
    expect(toOrphanedPath(TARGET_PATH)).toBe(`orphaned/${TARGET_PATH}`);
  });
});

describe('moveToOrphaned (Req 4.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('回収先へコピーし警告として記録する', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);

    await moveToOrphaned({ copy }, TARGET_PATH, new Error('db update failed'));

    expect(copy).toHaveBeenCalledWith(TARGET_PATH, `orphaned/${TARGET_PATH}`);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        originalPath: TARGET_PATH,
        orphanedPath: `orphaned/${TARGET_PATH}`,
        path: `orphaned/${TARGET_PATH}`,
        deleteError: 'db update failed',
      }),
      expect.stringContaining('7日後に自動削除されます')
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('追加情報をログへ併記する', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);

    await moveToOrphaned({ copy }, TARGET_PATH, new Error('db update failed'), {
      imageId: 'image-123',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: 'image-123' }),
      expect.any(String)
    );
  });

  it('コピーに失敗してもスローせずエラーとして記録する', async () => {
    const copy = vi.fn().mockRejectedValue(new Error('copy failed'));

    await expect(
      moveToOrphaned({ copy }, TARGET_PATH, new Error('db update failed'))
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        originalPath: TARGET_PATH,
        orphanedPath: `orphaned/${TARGET_PATH}`,
        error: 'copy failed',
        deleteError: 'db update failed',
      }),
      expect.stringContaining('孤立ファイルの移動に失敗')
    );
  });

  it('copy を持たないストレージでは手動対応を促す警告のみ記録する', async () => {
    await moveToOrphaned({}, TARGET_PATH, new Error('delete failed'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: TARGET_PATH, error: 'delete failed' }),
      expect.stringContaining('手動での削除が必要です')
    );
  });

  it('ストレージが未設定でも手動対応を促す警告のみ記録する', async () => {
    await moveToOrphaned(null, TARGET_PATH, new Error('delete failed'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: TARGET_PATH }),
      expect.stringContaining('手動での削除が必要です')
    );
  });

  it('Error 以外の原因は Unknown error として記録する', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);

    await moveToOrphaned({ copy }, TARGET_PATH, 'not-an-error');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deleteError: 'Unknown error' }),
      expect.any(String)
    );
  });

  it('コピー失敗の原因が Error 以外でも Unknown error として記録する', async () => {
    const copy = vi.fn().mockRejectedValue('not-an-error');

    await moveToOrphaned({ copy }, TARGET_PATH, new Error('db update failed'));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unknown error' }),
      expect.stringContaining('孤立ファイルの移動に失敗')
    );
  });
});
