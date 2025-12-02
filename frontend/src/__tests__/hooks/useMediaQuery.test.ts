import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useMediaQuery from '../../hooks/useMediaQuery';

describe('useMediaQuery', () => {
  // matchMediaのモック
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let addListenerMock: ReturnType<typeof vi.fn>;
  let removeListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addListenerMock = vi.fn();
    removeListenerMock = vi.fn();

    matchMediaMock = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: addListenerMock, // deprecated
      removeListener: removeListenerMock, // deprecated
      addEventListener: addListenerMock,
      removeEventListener: removeListenerMock,
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基本動作', () => {
    it('メディアクエリがマッチしない場合、falseを返す', () => {
      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

      expect(result.current).toBe(false);
    });

    it('メディアクエリがマッチする場合、trueを返す', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: addListenerMock,
        removeListener: removeListenerMock,
        addEventListener: addListenerMock,
        removeEventListener: removeListenerMock,
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

      expect(result.current).toBe(true);
    });

    it('window.matchMediaが指定されたクエリで呼ばれる', () => {
      renderHook(() => useMediaQuery('(max-width: 600px)'));

      expect(matchMediaMock).toHaveBeenCalledWith('(max-width: 600px)');
    });
  });

  describe('リスナー登録', () => {
    it('マウント時にイベントリスナーが登録される', () => {
      renderHook(() => useMediaQuery('(min-width: 768px)'));

      expect(addListenerMock).toHaveBeenCalled();
    });

    it('アンマウント時にイベントリスナーが削除される', () => {
      const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

      unmount();

      expect(removeListenerMock).toHaveBeenCalled();
    });
  });

  describe('レスポンシブ動作', () => {
    it('メディアクエリの変更を検知する', async () => {
      let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;

      // addEventListener用のモック（changeとeventTypeの両方に対応）
      const customAddEventListener = vi.fn(
        (eventType: string, handler: (e: MediaQueryListEvent) => void) => {
          if (eventType === 'change') {
            changeHandler = handler;
          }
        }
      ) as unknown as (eventType: string, listener: (e: MediaQueryListEvent) => void) => void;

      matchMediaMock.mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: addListenerMock,
        removeListener: removeListenerMock,
        addEventListener: customAddEventListener,
        removeEventListener: removeListenerMock,
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

      expect(result.current).toBe(false);

      // メディアクエリがマッチする状態に変更
      if (changeHandler) {
        (changeHandler as (e: MediaQueryListEvent) => void)({
          matches: true,
        } as MediaQueryListEvent);
      }

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });
  });

  describe('複数のメディアクエリ', () => {
    it('異なるメディアクエリで異なる結果を返す', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px)',
        media: query,
        onchange: null,
        addListener: addListenerMock,
        removeListener: removeListenerMock,
        addEventListener: addListenerMock,
        removeEventListener: removeListenerMock,
        dispatchEvent: vi.fn(),
      }));

      const { result: result1 } = renderHook(() => useMediaQuery('(min-width: 768px)'));
      const { result: result2 } = renderHook(() => useMediaQuery('(max-width: 600px)'));

      expect(result1.current).toBe(true);
      expect(result2.current).toBe(false);
    });
  });

  describe('エッジケース', () => {
    it('空文字列のクエリでもエラーにならない', () => {
      expect(() => {
        renderHook(() => useMediaQuery(''));
      }).not.toThrow();
    });

    it('無効なクエリでもエラーにならない', () => {
      expect(() => {
        renderHook(() => useMediaQuery('invalid query'));
      }).not.toThrow();
    });

    it('window.matchMediaが存在しない場合、falseを返す', () => {
      // matchMediaを削除
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

      expect(result.current).toBe(false);
    });
  });
});
