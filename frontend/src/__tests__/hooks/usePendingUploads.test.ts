import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePendingUploads } from '../../hooks/usePendingUploads';
import type { FailedUpload, PendingUpload } from '../../types/upload.types';

/**
 * usePendingUploads フックの単体テスト
 *
 * Task 106.1: 未送信画像を保持し重複排除とプレビューの生存を管理する仕組み
 *
 * @see requirements.md - 要件 37.1 / 37.5 / 37.6 / 37.9 / 37.17
 * @see design.md - 「## Requirement 37」 Hooks: `usePendingUploads`
 */

// ============================================================================
// URL.createObjectURL / revokeObjectURL のスタブ
//
// jsdom は ObjectURL API を実装しないため、テストを条件付きで無効化せず
// スタブへ差し替えて呼び出し回数と引数を検証する（AI運用第3原則）。
// ============================================================================

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

/** 発行済み ObjectURL の通し番号 */
let issuedUrlCount = 0;

const createObjectURLMock = vi.fn((_object: Blob | MediaSource): string => {
  issuedUrlCount += 1;
  return `blob:mock/${issuedUrlCount}`;
});

const revokeObjectURLMock = vi.fn((_url: string): void => {
  // 解放の記録のみ行う
});

beforeEach(() => {
  issuedUrlCount = 0;
  createObjectURLMock.mockClear();
  revokeObjectURLMock.mockClear();
  URL.createObjectURL = createObjectURLMock;
  URL.revokeObjectURL = revokeObjectURLMock;
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

// ============================================================================
// テストヘルパ
// ============================================================================

/** 既定の更新時刻。安定キーの検証で固定値が必要なため定数化する */
const DEFAULT_LAST_MODIFIED = 1_700_000_000_000;

/**
 * 単体テスト用の画像 File を組み立てる。
 * 安定キーの要素（名前・サイズ・更新時刻）を明示的に制御できるようにする。
 */
function createFile(name: string, options: { size?: number; lastModified?: number } = {}): File {
  const { size = 8, lastModified = DEFAULT_LAST_MODIFIED } = options;
  return new File([new Uint8Array(size)], name, {
    type: 'image/jpeg',
    lastModified,
  });
}

/** 再送可能な失敗を組み立てる */
function retriableFailure(file: File, error = 'ネットワークエラー'): FailedUpload {
  return { file, error, kind: 'retriable' };
}

/** 再送不可の失敗を組み立てる */
function permanentFailure(file: File, error = 'サポートされていない画像形式です'): FailedUpload {
  return { file, error, kind: 'permanent' };
}

/**
 * 保持中の指定位置の項目を取り出す。
 * 想定した位置に項目が無い場合は握り潰さずテストを失敗させる。
 */
function pendingAt(pending: readonly PendingUpload[], index: number): PendingUpload {
  const entry = pending[index];
  if (!entry) {
    throw new Error(`未送信画像が index=${index} に存在しません（保持件数: ${pending.length}）`);
  }
  return entry;
}

describe('usePendingUploads', () => {
  describe('初期状態', () => {
    it('保持は空で ObjectURL を生成しない', () => {
      const { result } = renderHook(() => usePendingUploads());

      expect(result.current.pending).toEqual([]);
      expect(result.current.retriableFiles).toEqual([]);
      expect(createObjectURLMock).not.toHaveBeenCalled();
    });
  });

  describe('record: 失敗画像の保持（37.1）', () => {
    it('失敗した画像を未送信画像として保持する', () => {
      const failedFile = createFile('failed.jpg');
      const succeededFile = createFile('succeeded.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record(
          [failedFile, succeededFile],
          [retriableFailure(failedFile, '通信に失敗しました')]
        );
      });

      expect(result.current.pending).toHaveLength(1);
      expect(pendingAt(result.current.pending, 0).file).toBe(failedFile);
      expect(pendingAt(result.current.pending, 0).error).toBe('通信に失敗しました');
      expect(pendingAt(result.current.pending, 0).kind).toBe('retriable');
      expect(pendingAt(result.current.pending, 0).previewUrl).toBe('blob:mock/1');
    });

    it('安定キーを画像名・サイズ・更新時刻から組み立てる', () => {
      const file = createFile('photo.jpg', { size: 12, lastModified: 1_699_999_999_000 });
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([file], [retriableFailure(file)]);
      });

      expect(pendingAt(result.current.pending, 0).id).toBe('photo.jpg:12:1699999999000');
    });

    it('複数の失敗を試行順に保持する', () => {
      const first = createFile('first.jpg');
      const second = createFile('second.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([first, second], [retriableFailure(first), retriableFailure(second)]);
      });

      expect(result.current.pending.map((entry) => entry.file.name)).toEqual([
        'first.jpg',
        'second.jpg',
      ]);
    });
  });

  describe('record: 成功画像の除去（37.5, 37.6）', () => {
    it('試行して失敗しなかった画像を保持から取り除く', () => {
      const keptFile = createFile('kept.jpg');
      const recoveredFile = createFile('recovered.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record(
          [keptFile, recoveredFile],
          [retriableFailure(keptFile), retriableFailure(recoveredFile)]
        );
      });
      expect(result.current.pending).toHaveLength(2);

      // 再送で recovered.jpg のみ成功した
      act(() => {
        result.current.record([keptFile, recoveredFile], [retriableFailure(keptFile)]);
      });

      expect(result.current.pending).toHaveLength(1);
      expect(pendingAt(result.current.pending, 0).file.name).toBe('kept.jpg');
    });

    it('全件成功で保持が空になる', () => {
      const first = createFile('first.jpg');
      const second = createFile('second.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([first, second], [retriableFailure(first), retriableFailure(second)]);
      });

      act(() => {
        result.current.record([first, second], []);
      });

      expect(result.current.pending).toEqual([]);
      expect(result.current.retriableFiles).toEqual([]);
    });
  });

  describe('record: 重複排除と既存保持の温存（37.9）', () => {
    it('同一画像が繰り返し失敗しても保持件数が増えない', () => {
      const file = createFile('same.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([file], [retriableFailure(file, '1回目の失敗')]);
      });
      act(() => {
        result.current.record([file], [retriableFailure(file, '2回目の失敗')]);
      });
      act(() => {
        result.current.record([file], [retriableFailure(file, '3回目の失敗')]);
      });

      expect(result.current.pending).toHaveLength(1);
      // 失敗理由は最新の試行結果へ更新される
      expect(pendingAt(result.current.pending, 0).error).toBe('3回目の失敗');
      // プレビューURLは再生成されない（生成は1回のみ）
      expect(pendingAt(result.current.pending, 0).previewUrl).toBe('blob:mock/1');
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).not.toHaveBeenCalled();
    });

    it('内容が同一でも更新時刻が異なる画像は別項目として保持する', () => {
      const original = createFile('same.jpg', { lastModified: 1_700_000_000_000 });
      const retaken = createFile('same.jpg', { lastModified: 1_700_000_001_000 });
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record(
          [original, retaken],
          [retriableFailure(original), retriableFailure(retaken)]
        );
      });

      expect(result.current.pending).toHaveLength(2);
    });

    it('新たな試行の結果を反映しても、その試行に含まれない既存の保持が残る', () => {
      const existing = createFile('existing.jpg');
      const added = createFile('added.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([existing], [retriableFailure(existing)]);
      });

      // 新規選択の試行。既存の保持は試行対象に含まれない
      act(() => {
        result.current.record([added], [retriableFailure(added)]);
      });

      expect(result.current.pending.map((entry) => entry.file.name)).toEqual([
        'existing.jpg',
        'added.jpg',
      ]);
      expect(revokeObjectURLMock).not.toHaveBeenCalled();
    });

    it('その試行に含まれない既存の保持は、新規試行が全件成功しても残る', () => {
      const existing = createFile('existing.jpg');
      const added = createFile('added.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([existing], [retriableFailure(existing)]);
      });
      act(() => {
        result.current.record([added], []);
      });

      expect(result.current.pending).toHaveLength(1);
      expect(pendingAt(result.current.pending, 0).file.name).toBe('existing.jpg');
    });
  });

  describe('retriableFiles: 再送対象の抽出（37.17）', () => {
    it('再送可能な画像のみを提供し、再送不可を除外する', () => {
      const retriable = createFile('retriable.jpg');
      const permanent = createFile('permanent.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record(
          [retriable, permanent],
          [retriableFailure(retriable), permanentFailure(permanent)]
        );
      });

      expect(result.current.pending).toHaveLength(2);
      expect(result.current.retriableFiles).toEqual([retriable]);
    });

    it('保持が全て再送不可のとき再送対象は空になる', () => {
      const permanent = createFile('permanent.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([permanent], [permanentFailure(permanent)]);
      });

      expect(result.current.retriableFiles).toEqual([]);
    });

    it('再送不可へ区分が変わった画像は再送対象から外れる', () => {
      const file = createFile('changed.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([file], [retriableFailure(file)]);
      });
      expect(result.current.retriableFiles).toEqual([file]);

      act(() => {
        result.current.record([file], [permanentFailure(file)]);
      });

      expect(result.current.pending).toHaveLength(1);
      expect(pendingAt(result.current.pending, 0).kind).toBe('permanent');
      expect(result.current.retriableFiles).toEqual([]);
    });
  });

  describe('プレビューURLの生存管理', () => {
    it('保持開始時に生成し、保持から外れた時点で解放する', () => {
      const kept = createFile('kept.jpg');
      const recovered = createFile('recovered.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record(
          [kept, recovered],
          [retriableFailure(kept), retriableFailure(recovered)]
        );
      });
      expect(createObjectURLMock).toHaveBeenCalledTimes(2);
      const recoveredUrl = pendingAt(result.current.pending, 1).previewUrl;

      act(() => {
        result.current.record([kept, recovered], [retriableFailure(kept)]);
      });

      expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith(recoveredUrl);
    });

    it('discardAll で保持を空にし、全てのプレビューURLを解放する', () => {
      const first = createFile('first.jpg');
      const second = createFile('second.jpg');
      const { result } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([first, second], [retriableFailure(first), retriableFailure(second)]);
      });
      const urls = result.current.pending.map((entry) => entry.previewUrl);

      act(() => {
        result.current.discardAll();
      });

      expect(result.current.pending).toEqual([]);
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
      expect(revokeObjectURLMock.mock.calls.map((call) => call[0])).toEqual(urls);
    });

    it('discardAll 後のアンマウントで二重解放しない', () => {
      const file = createFile('single.jpg');
      const { result, unmount } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([file], [retriableFailure(file)]);
      });
      act(() => {
        result.current.discardAll();
      });
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);

      unmount();

      expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    });

    it('アンマウントで保持中のプレビューURLを解放する', () => {
      const first = createFile('first.jpg');
      const second = createFile('second.jpg');
      const { result, unmount } = renderHook(() => usePendingUploads());

      act(() => {
        result.current.record([first, second], [retriableFailure(first), retriableFailure(second)]);
      });
      const urls = result.current.pending.map((entry) => entry.previewUrl);

      unmount();

      expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
      expect(revokeObjectURLMock.mock.calls.map((call) => call[0])).toEqual(urls);
    });

    it('保持が空のままアンマウントしても解放を試みない', () => {
      const { unmount } = renderHook(() => usePendingUploads());

      unmount();

      expect(revokeObjectURLMock).not.toHaveBeenCalled();
    });
  });
});
