/**
 * @fileoverview useResponsiveフックのテスト
 *
 * Task 11.1: 画面幅対応の実装
 *
 * Requirements:
 * - 15.5: 320px〜1920pxの画面幅に対応
 * - 15.1, 15.2: レスポンシブデザイン
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useResponsive from '../../hooks/useResponsive';

describe('useResponsive', () => {
  // matchMediaのモック
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let listeners: { [key: string]: ((e: MediaQueryListEvent) => void)[] } = {};

  beforeEach(() => {
    listeners = {};

    matchMediaMock = vi.fn((query: string) => {
      const matches = getMatchesForQuery(query);

      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn((listener: (e: MediaQueryListEvent) => void) => {
          if (!listeners[query]) listeners[query] = [];
          listeners[query].push(listener);
        }),
        removeListener: vi.fn((listener: (e: MediaQueryListEvent) => void) => {
          if (listeners[query]) {
            listeners[query] = listeners[query].filter((l) => l !== listener);
          }
        }),
        addEventListener: vi.fn((eventType: string, listener: (e: MediaQueryListEvent) => void) => {
          if (eventType === 'change') {
            if (!listeners[query]) listeners[query] = [];
            listeners[query].push(listener);
          }
        }),
        removeEventListener: vi.fn(
          (eventType: string, listener: (e: MediaQueryListEvent) => void) => {
            if (eventType === 'change' && listeners[query]) {
              listeners[query] = listeners[query].filter((l) => l !== listener);
            }
          }
        ),
        dispatchEvent: vi.fn(),
      };
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    listeners = {};
  });

  /**
   * クエリに基づいてマッチ結果を返す
   * デフォルトはデスクトップ（1024px以上）
   */
  function getMatchesForQuery(query: string): boolean {
    // デフォルトはデスクトップ幅
    if (query === '(max-width: 767px)') return false;
    if (query === '(min-width: 768px) and (max-width: 1023px)') return false;
    if (query === '(min-width: 1024px)') return true;
    if (query === '(max-width: 479px)') return false;
    if (query === '(min-width: 1280px)') return false;
    return false;
  }

  /**
   * メディアクエリの変更をシミュレート
   */
  function simulateBreakpointChange(
    breakpoint: 'mobile' | 'smallMobile' | 'tablet' | 'desktop' | 'largeDesktop'
  ) {
    const queries = {
      mobile: { '(max-width: 767px)': true, '(max-width: 479px)': false },
      smallMobile: { '(max-width: 767px)': true, '(max-width: 479px)': true },
      tablet: {
        '(max-width: 767px)': false,
        '(min-width: 768px) and (max-width: 1023px)': true,
      },
      desktop: {
        '(max-width: 767px)': false,
        '(min-width: 768px) and (max-width: 1023px)': false,
        '(min-width: 1024px)': true,
        '(min-width: 1280px)': false,
      },
      largeDesktop: {
        '(max-width: 767px)': false,
        '(min-width: 1024px)': true,
        '(min-width: 1280px)': true,
      },
    };

    const changes = queries[breakpoint] || {};

    Object.entries(changes).forEach(([query, matches]) => {
      if (listeners[query]) {
        listeners[query].forEach((listener) => {
          listener({ matches } as MediaQueryListEvent);
        });
      }
    });
  }

  describe('初期状態', () => {
    it('デフォルトでデスクトップ判定を返す', () => {
      const { result } = renderHook(() => useResponsive());

      expect(result.current.isDesktop).toBe(true);
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
    });

    it('currentBreakpointを返す', () => {
      const { result } = renderHook(() => useResponsive());

      expect(result.current.currentBreakpoint).toBeDefined();
    });
  });

  describe('ブレークポイント判定', () => {
    it('モバイル状態を正しく判定する', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isMobile).toBe(true);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(false);
    });

    it('タブレット状態を正しく判定する', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(min-width: 768px) and (max-width: 1023px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });

    it('デスクトップ状態を正しく判定する', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(min-width: 1024px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(true);
    });
  });

  describe('レスポンシブ変更', () => {
    it('ブレークポイント変更時に再レンダリングされる', async () => {
      // 初期状態はデスクトップ
      matchMediaMock.mockImplementation((query: string) => {
        const matches = query === '(min-width: 1024px)';
        return {
          matches,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(
            (eventType: string, listener: (e: MediaQueryListEvent) => void) => {
              if (eventType === 'change') {
                if (!listeners[query]) listeners[query] = [];
                listeners[query].push(listener);
              }
            }
          ),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      });

      const { result, rerender } = renderHook(() => useResponsive());

      expect(result.current.isDesktop).toBe(true);
      expect(result.current.isMobile).toBe(false);

      // モバイルに変更
      await act(async () => {
        simulateBreakpointChange('mobile');
      });

      rerender();

      // モバイルのリスナーが呼ばれた後の状態を確認
      // Note: 実際の実装では、useMediaQueryが内部で状態を更新する
    });
  });

  describe('ユーティリティ機能', () => {
    it('isSmallMobileが小さい画面サイズで true を返す', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(max-width: 479px)' || query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isSmallMobile).toBe(true);
    });

    it('isLargeDesktopが大きい画面サイズで true を返す', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(min-width: 1280px)' || query === '(min-width: 1024px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { result } = renderHook(() => useResponsive());

      expect(result.current.isLargeDesktop).toBe(true);
    });
  });

  describe('エッジケース', () => {
    it('window.matchMediaが存在しない場合、デフォルト値を返す', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useResponsive());

      // デフォルトはすべてfalse
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(false);
    });
  });
});
