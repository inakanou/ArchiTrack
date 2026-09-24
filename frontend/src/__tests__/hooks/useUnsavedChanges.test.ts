/**
 * @fileoverview useUnsavedChanges フックのテスト
 *
 * Task 19: 未保存変更の検出を実装する
 * Task 100.24（quantity-table-generation）: API を一本化した。
 *
 * フックは未保存かどうか（`isDirty`）を**呼び出し側から直接受け取る**だけで、自前の dirty 状態を
 * 持たない。旧 API は `enabled` を受け取りながら登録条件が「`enabled` かつ**内部の** dirty」で
 * あったため、`enabled` だけを渡す呼び出しは黙って無効化されていた（100.13 の実測）。
 * 本ファイルは「渡した `isDirty` だけで beforeunload が登録される／外れる」ことを直接測る。
 *
 * @see requirements.md - 要件9.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChanges, type UseUnsavedChangesOptions } from '../../hooks/useUnsavedChanges';

describe('useUnsavedChanges', () => {
  // beforeunloadイベントのモック
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let preventDefaultMock: ReturnType<typeof vi.fn>;
  let mockEvent: BeforeUnloadEvent;

  const beforeunloadAdds = () =>
    addEventListenerSpy.mock.calls.filter(
      (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
    );
  const beforeunloadRemoves = () =>
    removeEventListenerSpy.mock.calls.filter(
      (call: [string, ...unknown[]]) => call[0] === 'beforeunload'
    );

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

  /**
   * 未保存の変更がある間だけ beforeunload ハンドラが登録され、発火時に既定動作を
   * 抑止することをこの区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-43.2
   */
  describe('beforeunloadイベントの管理', () => {
    it('isDirty=false を渡したときはbeforeunloadイベントリスナーが登録されない', () => {
      renderHook(() => useUnsavedChanges({ isDirty: false }));

      expect(beforeunloadAdds().length).toBe(0);
    });

    it('isDirty=true を渡しただけでbeforeunloadイベントリスナーが登録される（他の操作を要しない）', () => {
      renderHook(() => useUnsavedChanges({ isDirty: true }));

      expect(beforeunloadAdds().length).toBe(1);
    });

    it('渡す isDirty が false から true になったときはbeforeunloadイベントリスナーが登録される', () => {
      const { rerender } = renderHook(({ isDirty }) => useUnsavedChanges({ isDirty }), {
        initialProps: { isDirty: false },
      });

      expect(beforeunloadAdds().length).toBe(0);

      rerender({ isDirty: true });

      expect(beforeunloadAdds().length).toBe(1);
    });

    it('渡す isDirty が true から false になったときはbeforeunloadイベントリスナーが解除される', () => {
      const { rerender } = renderHook(({ isDirty }) => useUnsavedChanges({ isDirty }), {
        initialProps: { isDirty: true },
      });

      const [added] = beforeunloadAdds();
      expect(added).toBeDefined();

      rerender({ isDirty: false });

      const removed = beforeunloadRemoves();
      expect(removed.length).toBeGreaterThan(0);
      // 登録したものと同じハンドラが外れていること
      expect(removed.some((call: [string, ...unknown[]]) => call[1] === added![1])).toBe(true);
    });

    it('アンマウント時にbeforeunloadイベントリスナーが解除される', () => {
      const { unmount } = renderHook(() => useUnsavedChanges({ isDirty: true }));

      unmount();

      expect(beforeunloadRemoves().length).toBeGreaterThan(0);
    });

    it('beforeunloadイベント発生時にevent.preventDefaultが呼ばれる', () => {
      renderHook(() => useUnsavedChanges({ isDirty: true }));

      const calls = beforeunloadAdds();
      expect(calls.length).toBe(1);

      const listener = calls[0]![1] as EventListener;
      listener(mockEvent);

      expect(preventDefaultMock).toHaveBeenCalled();
    });

    it('beforeunloadイベント発生時にevent.returnValueが設定される', () => {
      renderHook(() => useUnsavedChanges({ isDirty: true }));

      const listener = beforeunloadAdds()[0]![1] as EventListener;
      listener(mockEvent);

      // returnValueが設定されている（ブラウザが確認ダイアログを表示するため）
      expect(mockEvent.returnValue).not.toBe('');
    });

    it('実際に window へ beforeunload を送ると既定動作が抑止される（isDirty=true）', () => {
      renderHook(() => useUnsavedChanges({ isDirty: true }));

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('実際に window へ beforeunload を送っても既定動作は抑止されない（isDirty=false）', () => {
      renderHook(() => useUnsavedChanges({ isDirty: false }));

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('API の形（Task 100.24: 渡した引数が黙って無視される形を持たない）', () => {
    it('isDirty は必須であり、省略すると型エラーになる', () => {
      // @ts-expect-error isDirty を省略した引数は型で弾かれる
      const options: UseUnsavedChangesOptions = {};
      expect(options).toEqual({});
    });

    it('旧 API の enabled は受け付けない（型エラーになる）', () => {
      const options: UseUnsavedChangesOptions = {
        isDirty: true,
        // @ts-expect-error enabled は廃止された
        enabled: true,
      };
      expect(options.isDirty).toBe(true);
    });

    it('自前の dirty 状態を操作する手段（setDirty/markAsChanged 等）を返さない', () => {
      const { result } = renderHook(() => useUnsavedChanges({ isDirty: true }));

      expect(result.current).toBeUndefined();
    });
  });

  describe('確認メッセージ', () => {
    it('デフォルトの確認メッセージが設定される', () => {
      renderHook(() => useUnsavedChanges({ isDirty: true }));

      const listener = beforeunloadAdds()[0]![1] as EventListener;
      listener(mockEvent);

      expect(mockEvent.returnValue).toContain('保存されていない変更があります');
    });

    it('カスタム確認メッセージを設定できる', () => {
      const customMessage = 'データが失われます。よろしいですか？';
      renderHook(() => useUnsavedChanges({ isDirty: true, message: customMessage }));

      const listener = beforeunloadAdds()[0]![1] as EventListener;
      listener(mockEvent);

      expect(mockEvent.returnValue).toBe(customMessage);
    });
  });
});
