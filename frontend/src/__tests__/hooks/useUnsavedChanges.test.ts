/**
 * @fileoverview useUnsavedChanges フックのテスト
 *
 * Task 19: 未保存変更の検出を実装する
 *
 * - isDirtyフラグの管理
 * - ページ離脱時の確認ダイアログ（beforeunload）
 *
 * @see requirements.md - 要件9.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

describe('useUnsavedChanges', () => {
  // beforeunloadイベントのモック
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let preventDefaultMock: ReturnType<typeof vi.fn>;
  let mockEvent: BeforeUnloadEvent;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    preventDefaultMock = vi.fn();
    mockEvent = {
      preventDefault: preventDefaultMock,
      returnValue: '',
    } as unknown as BeforeUnloadEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初期状態', () => {
    it('初期状態ではisDirtyはfalseである', () => {
      const { result } = renderHook(() => useUnsavedChanges());

      expect(result.current.isDirty).toBe(false);
    });

    it('初期値をtrueに設定できる', () => {
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('isDirty状態の管理', () => {
    it('setDirtyでisDirtyをtrueに設定できる', () => {
      const { result } = renderHook(() => useUnsavedChanges());

      act(() => {
        result.current.setDirty(true);
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('setDirtyでisDirtyをfalseに設定できる', () => {
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      act(() => {
        result.current.setDirty(false);
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('markAsChangedでisDirtyをtrueに設定できる', () => {
      const { result } = renderHook(() => useUnsavedChanges());

      act(() => {
        result.current.markAsChanged();
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('markAsSavedでisDirtyをfalseに設定できる', () => {
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      act(() => {
        result.current.markAsSaved();
      });

      expect(result.current.isDirty).toBe(false);
    });

    it('resetでisDirtyをfalseにリセットできる', () => {
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('beforeunloadイベントの管理', () => {
    it('isDirtyがfalseのときはbeforeunloadイベントリスナーが登録されない', () => {
      renderHook(() => useUnsavedChanges());

      // beforeunloadイベントのリスナーがaddされているか確認
      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      // isDirtyがfalseなのでリスナーは追加されていないはず
      expect(beforeunloadCalls.length).toBe(0);
    });

    it('isDirtyがtrueのときはbeforeunloadイベントリスナーが登録される', () => {
      renderHook(() => useUnsavedChanges({ initialDirty: true }));

      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(beforeunloadCalls.length).toBe(1);
    });

    it('isDirtyがtrueからfalseになったときはbeforeunloadイベントリスナーが解除される', () => {
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      act(() => {
        result.current.setDirty(false);
      });

      const removeBeforeunloadCalls = removeEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(removeBeforeunloadCalls.length).toBeGreaterThan(0);
    });

    it('isDirtyがfalseからtrueになったときはbeforeunloadイベントリスナーが登録される', () => {
      const { result } = renderHook(() => useUnsavedChanges());

      // 初期状態ではリスナーなし
      const initialCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );
      expect(initialCalls.length).toBe(0);

      act(() => {
        result.current.setDirty(true);
      });

      const afterCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );
      expect(afterCalls.length).toBe(1);
    });

    it('アンマウント時にbeforeunloadイベントリスナーが解除される', () => {
      const { unmount } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      unmount();

      const removeBeforeunloadCalls = removeEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(removeBeforeunloadCalls.length).toBeGreaterThan(0);
    });

    it('beforeunloadイベント発生時にevent.preventDefaultが呼ばれる', () => {
      renderHook(() => useUnsavedChanges({ initialDirty: true }));

      // 登録されたリスナーを取得
      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(beforeunloadCalls.length).toBe(1);

      // リスナーを実行
      const listener = beforeunloadCalls[0][1] as EventListener;
      listener(mockEvent);

      expect(preventDefaultMock).toHaveBeenCalled();
    });

    it('beforeunloadイベント発生時にevent.returnValueが設定される', () => {
      renderHook(() => useUnsavedChanges({ initialDirty: true }));

      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      const listener = beforeunloadCalls[0][1] as EventListener;
      listener(mockEvent);

      // returnValueが設定されている（ブラウザが確認ダイアログを表示するため）
      expect(mockEvent.returnValue).not.toBe('');
    });
  });

  describe('enabledオプション', () => {
    it('enabled=falseのときはbeforeunloadイベントリスナーが登録されない', () => {
      renderHook(() => useUnsavedChanges({ initialDirty: true, enabled: false }));

      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(beforeunloadCalls.length).toBe(0);
    });

    it('enabled=trueのときはbeforeunloadイベントリスナーが登録される（isDirty=trueの場合）', () => {
      renderHook(() => useUnsavedChanges({ initialDirty: true, enabled: true }));

      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(beforeunloadCalls.length).toBe(1);
    });

    it('enabledがtrueからfalseに変わったときはリスナーが解除される', () => {
      const { rerender } = renderHook(
        ({ enabled }) => useUnsavedChanges({ initialDirty: true, enabled }),
        {
          initialProps: { enabled: true },
        }
      );

      rerender({ enabled: false });

      const removeBeforeunloadCalls = removeEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      expect(removeBeforeunloadCalls.length).toBeGreaterThan(0);
    });
  });

  describe('コールバックオプション', () => {
    it('onDirtyChangeコールバックがisDirty変更時に呼ばれる', () => {
      const onDirtyChange = vi.fn();
      const { result } = renderHook(() => useUnsavedChanges({ onDirtyChange }));

      act(() => {
        result.current.setDirty(true);
      });

      expect(onDirtyChange).toHaveBeenCalledWith(true);

      act(() => {
        result.current.setDirty(false);
      });

      expect(onDirtyChange).toHaveBeenCalledWith(false);
    });

    it('同じ値に設定してもonDirtyChangeコールバックは呼ばれない', () => {
      const onDirtyChange = vi.fn();
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true, onDirtyChange }));

      // 初回レンダリング後にクリア
      onDirtyChange.mockClear();

      act(() => {
        result.current.setDirty(true); // 既にtrue
      });

      expect(onDirtyChange).not.toHaveBeenCalled();
    });
  });

  describe('確認メッセージ', () => {
    it('デフォルトの確認メッセージが設定される', () => {
      renderHook(() => useUnsavedChanges({ initialDirty: true }));

      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      const listener = beforeunloadCalls[0][1] as EventListener;
      listener(mockEvent);

      // デフォルトメッセージが含まれている
      expect(mockEvent.returnValue).toContain('保存されていない変更があります');
    });

    it('カスタム確認メッセージを設定できる', () => {
      const customMessage = 'データが失われます。よろしいですか？';
      renderHook(() => useUnsavedChanges({ initialDirty: true, message: customMessage }));

      const beforeunloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
      );

      const listener = beforeunloadCalls[0][1] as EventListener;
      listener(mockEvent);

      expect(mockEvent.returnValue).toBe(customMessage);
    });
  });

  describe('confirmNavigation', () => {
    it('isDirty=falseのときはconfirmNavigationはtrueを返す', () => {
      const { result } = renderHook(() => useUnsavedChanges());

      const canNavigate = result.current.confirmNavigation();

      expect(canNavigate).toBe(true);
    });

    it('isDirty=trueのときはconfirmNavigationはwindow.confirmを呼び出す', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      let canNavigate: boolean = false;
      act(() => {
        canNavigate = result.current.confirmNavigation();
      });

      expect(confirmSpy).toHaveBeenCalled();
      expect(canNavigate).toBe(true);

      confirmSpy.mockRestore();
    });

    it('isDirty=trueでユーザーがキャンセルした場合はfalseを返す', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      let canNavigate: boolean = true;
      act(() => {
        canNavigate = result.current.confirmNavigation();
      });

      expect(confirmSpy).toHaveBeenCalled();
      expect(canNavigate).toBe(false);

      confirmSpy.mockRestore();
    });

    it('confirmNavigationでユーザーが確認した場合はisDirtyがfalseになる', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { result } = renderHook(() => useUnsavedChanges({ initialDirty: true }));

      act(() => {
        result.current.confirmNavigation();
      });

      expect(result.current.isDirty).toBe(false);

      confirmSpy.mockRestore();
    });
  });
});
