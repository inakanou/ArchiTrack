/**
 * @fileoverview useInViewport フックのテスト
 *
 * Task 110.2: 要素が表示領域へ到達したことを判定する共有フックを実装する
 *
 * ref は実際の描画で要素へ結び付いた状態を前提とするため、フック単体ではなく
 * ref を要素へ付与するコンポーネントを描画して検証する。
 *
 * Requirements:
 * - 38.8: 表示領域外の画像は表示領域に入るまで取得しない
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useInViewport, type UseInViewportOptions } from '../../hooks/useInViewport';
import {
  triggerIntersection,
  isObserving,
  activeObserverCount,
  disconnectCount,
  installIntersectionObserverStub,
} from '../../test-support/intersection-observer';

/**
 * ref を要素へ付与し、到達状態を data 属性で観測できるテスト用コンポーネント
 */
function InViewportProbe({ options }: { options?: UseInViewportOptions }) {
  const { ref, isInViewport } = useInViewport<HTMLDivElement>(options);
  return (
    <div ref={ref} data-testid="target" data-in-viewport={isInViewport ? 'true' : 'false'} />
  );
}

/** 到達状態を読み取る */
function readInViewport(): boolean {
  return screen.getByTestId('target').getAttribute('data-in-viewport') === 'true';
}

describe('useInViewport', () => {
  afterEach(() => {
    // 実行環境に観測の仕組みが無い状況を再現するテストの後始末
    installIntersectionObserverStub();
  });

  describe('表示領域到達の判定', () => {
    it('観測対象が交差するまでは未到達を返す', () => {
      render(<InViewportProbe />);

      expect(readInViewport()).toBe(false);
      expect(isObserving(screen.getByTestId('target'))).toBe(true);
    });

    it('観測対象が交差すると到達済みへ変わる', () => {
      render(<InViewportProbe />);
      const target = screen.getByTestId('target');

      act(() => {
        triggerIntersection(target, true);
      });

      expect(readInViewport()).toBe(true);
    });

    it('交差していない通知では到達済みにならない', () => {
      render(<InViewportProbe />);
      const target = screen.getByTestId('target');

      act(() => {
        triggerIntersection(target, false);
      });

      expect(readInViewport()).toBe(false);
    });

    it('一度到達したら表示領域から外れても到達済みのまま変わらない', () => {
      render(<InViewportProbe />);
      const target = screen.getByTestId('target');

      act(() => {
        triggerIntersection(target, true);
      });
      act(() => {
        triggerIntersection(target, false);
      });

      expect(readInViewport()).toBe(true);
    });

    it('到達後は観測を解除する', () => {
      render(<InViewportProbe />);
      const target = screen.getByTestId('target');
      const before = disconnectCount();

      act(() => {
        triggerIntersection(target, true);
      });

      // 到達時にコールバック内で解除し、依存の変化に伴うクリーンアップでも解除されるため
      // 回数は1回とは限らない。観測が解除されていることを本質とする
      expect(disconnectCount()).toBeGreaterThan(before);
      expect(isObserving(target)).toBe(false);
    });
  });

  describe('観測の無効化', () => {
    it('enabled が false のときは観測せず常に到達済みとして扱う', () => {
      render(<InViewportProbe options={{ enabled: false }} />);

      expect(readInViewport()).toBe(true);
      expect(isObserving(screen.getByTestId('target'))).toBe(false);
      expect(activeObserverCount()).toBe(0);
    });

    it('enabled を false から true へ切り替えると観測を開始し未到達へ戻る', () => {
      const { rerender } = render(<InViewportProbe options={{ enabled: false }} />);

      expect(readInViewport()).toBe(true);

      rerender(<InViewportProbe options={{ enabled: true }} />);

      expect(readInViewport()).toBe(false);
      expect(isObserving(screen.getByTestId('target'))).toBe(true);
    });
  });

  describe('観測の仕組みが存在しない環境', () => {
    it('IntersectionObserver が未定義の場合は到達済みとして扱う', () => {
      const original = globalThis.IntersectionObserver;
      // @ts-expect-error 実行環境に IntersectionObserver が存在しない状況を再現する
      delete globalThis.IntersectionObserver;

      try {
        render(<InViewportProbe />);
        expect(readInViewport()).toBe(true);
      } finally {
        globalThis.IntersectionObserver = original;
      }
    });
  });

  describe('クリーンアップ', () => {
    it('アンマウント時に観測を解除する', () => {
      const { unmount } = render(<InViewportProbe />);
      const target = screen.getByTestId('target');
      const before = disconnectCount();

      unmount();

      expect(disconnectCount()).toBe(before + 1);
      expect(isObserving(target)).toBe(false);
    });
  });

  describe('先読み余白', () => {
    it('rootMargin の既定値は 50px である', () => {
      const captured: (string | undefined)[] = [];
      const OriginalObserver = globalThis.IntersectionObserver;

      class CapturingObserver extends OriginalObserver {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          super(callback, options);
          captured.push(options?.rootMargin);
        }
      }
      globalThis.IntersectionObserver = CapturingObserver as typeof IntersectionObserver;

      try {
        render(<InViewportProbe />);
        expect(captured).toContain('50px');
      } finally {
        globalThis.IntersectionObserver = OriginalObserver;
      }
    });

    it('rootMargin を指定した場合はその値が使われる', () => {
      const captured: (string | undefined)[] = [];
      const OriginalObserver = globalThis.IntersectionObserver;

      class CapturingObserver extends OriginalObserver {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          super(callback, options);
          captured.push(options?.rootMargin);
        }
      }
      globalThis.IntersectionObserver = CapturingObserver as typeof IntersectionObserver;

      try {
        render(<InViewportProbe options={{ rootMargin: '200px' }} />);
        expect(captured).toContain('200px');
      } finally {
        globalThis.IntersectionObserver = OriginalObserver;
      }
    });
  });
});
