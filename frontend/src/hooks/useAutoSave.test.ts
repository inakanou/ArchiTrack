/**
 * @fileoverview 自動保存フックのテスト
 *
 * Task 8.1: 自動保存機能を実装する
 *
 * Requirements:
 * - 11.5: 自動保存が有効な状態で、一定間隔で数量表を自動保存する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // localStorage mock
    const localStorageMock: Record<string, string> = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => localStorageMock[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      localStorageMock[key] = value;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
      delete localStorageMock[key];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('基本的な自動保存機能', () => {
    it('デバウンス後に保存関数が呼ばれること', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 1500,
          enabled: true,
        })
      );

      // 変更をトリガー
      act(() => {
        result.current.triggerSave();
      });

      // デバウンス中は呼ばれない
      expect(saveFn).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');

      // デバウンス時間経過
      await act(async () => {
        vi.advanceTimersByTime(1500);
        await vi.runAllTimersAsync();
      });

      expect(saveFn).toHaveBeenCalledTimes(1);
    });

    it('連続トリガー時にデバウンスが効くこと', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = renderHook(
        ({ data }) =>
          useAutoSave({
            data,
            saveFn,
            debounceMs: 1500,
            enabled: true,
          }),
        { initialProps: { data: { name: 'test1' } } }
      );

      // 連続してトリガー
      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // データ変更でrerender
      rerender({ data: { name: 'test2' } });

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      rerender({ data: { name: 'test3' } });

      act(() => {
        result.current.triggerSave();
      });

      // まだ呼ばれていない
      expect(saveFn).not.toHaveBeenCalled();

      // 最後のトリガーから1500ms経過
      await act(async () => {
        vi.advanceTimersByTime(1500);
        await vi.runAllTimersAsync();
      });

      expect(saveFn).toHaveBeenCalledTimes(1);
    });

    it('enabled=falseの場合は保存関数が呼ばれないこと', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 1500,
          enabled: false,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();
      });

      expect(saveFn).not.toHaveBeenCalled();
    });
  });

  describe('保存ステータス管理', () => {
    it('保存中はstatus=savingになること', async () => {
      let resolvePromise: () => void;
      const saveFn = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePromise = resolve;
          })
      );

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      // デバウンス時間経過
      await act(async () => {
        vi.advanceTimersByTime(100);
        // タイマー発火後、setStatusの更新を待つ
        await Promise.resolve();
      });

      // 保存中の状態を確認
      expect(result.current.status).toBe('saving');

      // 保存完了
      await act(async () => {
        resolvePromise!();
        await Promise.resolve();
      });

      expect(result.current.status).toBe('saved');
    });

    it('保存成功時にstatus=savedとlastSavedAtが更新されること', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
        })
      );

      expect(result.current.lastSavedAt).toBeNull();

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe('saved');
      expect(result.current.lastSavedAt).not.toBeNull();
    });

    it('保存失敗時にstatus=errorとerrorMessageが設定されること', async () => {
      const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('Network error');
    });
  });

  describe('リトライ機能', () => {
    it('保存失敗時にretry関数で再試行できること', async () => {
      let callCount = 0;
      const saveFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First try failed'));
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          maxRetries: 3,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe('error');

      // リトライ
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.status).toBe('saved');
      expect(saveFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('ローカルストレージへのドラフト保存', () => {
    it('変更時にローカルストレージにドラフトが保存されること', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'draft data' },
          saveFn,
          debounceMs: 1500,
          enabled: true,
          draftKey: 'test-draft',
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      // ドラフトが保存されていることを確認
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'test-draft',
        expect.stringContaining('draft data')
      );
    });

    it('保存成功後にドラフトがクリアされること', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          draftKey: 'test-draft',
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(result.current.status).toBe('saved');
      expect(localStorage.removeItem).toHaveBeenCalledWith('test-draft');
    });

    it('hasDraftが正しく機能すること', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);

      // ドラフトを設定
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(
        JSON.stringify({ name: 'saved draft' })
      );

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          draftKey: 'test-draft',
        })
      );

      expect(result.current.hasDraft).toBe(true);
    });

    it('loadDraftでドラフトを読み込めること', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const draftData = { name: 'saved draft' };

      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(draftData));

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          draftKey: 'test-draft',
        })
      );

      const loadedDraft = result.current.loadDraft();
      expect(loadedDraft).toEqual(draftData);
    });

    it('clearDraftでドラフトをクリアできること', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          draftKey: 'test-draft',
        })
      );

      act(() => {
        result.current.clearDraft();
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith('test-draft');
    });
  });

  describe('hasUnsavedChanges', () => {
    it('変更トリガー後はhasUnsavedChanges=trueになること', () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 1500,
          enabled: true,
        })
      );

      expect(result.current.hasUnsavedChanges).toBe(false);

      act(() => {
        result.current.triggerSave();
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('保存成功後はhasUnsavedChanges=falseになること', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe('即座に保存', () => {
    it('saveNowでデバウンスなしに即座に保存できること', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 10000, // 長いデバウンス
          enabled: true,
        })
      );

      await act(async () => {
        await result.current.saveNow();
      });

      expect(saveFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('コールバック', () => {
    it('onSaveSuccessコールバックが呼ばれること', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const onSaveSuccess = vi.fn();

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          onSaveSuccess,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(onSaveSuccess).toHaveBeenCalled();
    });

    it('onSaveErrorコールバックが呼ばれること', async () => {
      const error = new Error('Save failed');
      const saveFn = vi.fn().mockRejectedValue(error);
      const onSaveError = vi.fn();

      const { result } = renderHook(() =>
        useAutoSave({
          data: { name: 'test' },
          saveFn,
          debounceMs: 100,
          enabled: true,
          onSaveError,
        })
      );

      act(() => {
        result.current.triggerSave();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await vi.runAllTimersAsync();
      });

      expect(onSaveError).toHaveBeenCalledWith(error);
    });
  });
});
