/**
 * @fileoverview LazyImage コンポーネント テスト
 *
 * Task 23.1: 画像遅延読み込みを実装する
 *
 * Requirements:
 * - 14.1: 画像一覧の初期表示を2秒以内に完了する
 *
 * 機能:
 * - IntersectionObserverによる遅延読み込み
 * - サムネイル優先表示
 * - ローディングプレースホルダー
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LazyImage } from '../../../components/site-surveys/LazyImage';

// ============================================================================
// モック設定
// ============================================================================

type IntersectionObserverCallback = (entries: IntersectionObserverEntry[]) => void;

interface MockIntersectionObserverEntry {
  isIntersecting: boolean;
  target: Element;
  boundingClientRect: DOMRect;
  intersectionRatio: number;
  intersectionRect: DOMRect;
  rootBounds: DOMRect | null;
  time: number;
}

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  static triggerIntersection: (target: Element, isIntersecting: boolean) => void;

  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [];

  private callback: IntersectionObserverCallback;
  private elements: Set<Element> = new Set();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.elements.add(element);
  }

  unobserve(element: Element): void {
    this.elements.delete(element);
  }

  disconnect(): void {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(isIntersecting: boolean, target?: Element): void {
    const entries: MockIntersectionObserverEntry[] = [];
    const targets = target ? [target] : Array.from(this.elements);

    for (const t of targets) {
      entries.push({
        isIntersecting,
        target: t,
        boundingClientRect: {} as DOMRect,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRect,
        rootBounds: null,
        time: Date.now(),
      });
    }

    this.callback(entries as unknown as IntersectionObserverEntry[]);
  }
}

// グローバル設定
let originalIntersectionObserver: typeof window.IntersectionObserver;

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  originalIntersectionObserver = window.IntersectionObserver;
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  MockIntersectionObserver.triggerIntersection = (target: Element, isIntersecting: boolean) => {
    for (const observer of MockIntersectionObserver.instances) {
      observer.trigger(isIntersecting, target);
    }
  };
});

afterEach(() => {
  window.IntersectionObserver = originalIntersectionObserver;
  MockIntersectionObserver.instances = [];
});

// ============================================================================
// テストスイート
// ============================================================================

/**
 * img要素を取得するヘルパー関数
 * role="img"を持つコンテナではなく、実際の<img>タグを取得する
 */
function getImgElement(): HTMLImageElement | null {
  const container = screen.queryByTestId('lazy-image-container');
  return container?.querySelector('img') ?? null;
}

function getImgElementOrThrow(): HTMLImageElement {
  const container = screen.getByTestId('lazy-image-container');
  const img = container.querySelector('img');
  if (!img) throw new Error('img element not found');
  return img;
}

describe('LazyImage', () => {
  // ========================================================================
  // 基本表示テスト
  // ========================================================================

  describe('基本表示', () => {
    it('初期状態ではプレースホルダーが表示される', () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      // プレースホルダーが表示されていることを確認
      const placeholder = screen.getByTestId('lazy-image-placeholder');
      expect(placeholder).toBeInTheDocument();
    });

    it('alt属性が正しく設定される', () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      // 画像がロードされた後、alt属性が設定されていることを確認
      const container = screen.getByTestId('lazy-image-container');
      expect(container).toHaveAttribute('aria-label', 'テスト画像');
    });

    it('width と height が正しく設定される', () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={300} height={200} />
      );

      const container = screen.getByTestId('lazy-image-container');
      expect(container).toHaveStyle({ width: '300px', height: '200px' });
    });
  });

  // ========================================================================
  // IntersectionObserver テスト
  // ========================================================================

  describe('IntersectionObserverによる遅延読み込み', () => {
    it('ビューポートに入ると画像が読み込まれる', async () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      // 初期状態では画像は非表示
      expect(getImgElement()).toBeNull();

      // ビューポートに入った状態をシミュレート
      const container = screen.getByTestId('lazy-image-container');
      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      // 画像要素が表示されることを確認
      await waitFor(() => {
        expect(getImgElement()).not.toBeNull();
      });
    });

    it('ビューポートに入る前は画像が読み込まれない', () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      // 画像がまだ読み込まれていないことを確認
      expect(getImgElement()).toBeNull();
    });

    it('一度読み込まれた後はビューポートから出ても画像は維持される', async () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      const container = screen.getByTestId('lazy-image-container');

      // ビューポートに入る
      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        expect(getImgElement()).not.toBeNull();
      });

      // ビューポートから出る
      act(() => {
        MockIntersectionObserver.triggerIntersection(container, false);
      });

      // 画像は維持される
      expect(getImgElement()).not.toBeNull();
    });

    it('rootMarginが正しく設定される（事前読み込み用）', () => {
      render(
        <LazyImage
          src="https://example.com/image.jpg"
          alt="テスト画像"
          width={200}
          height={200}
          rootMargin="100px"
        />
      );

      // IntersectionObserverが正しく設定されていることを確認
      expect(MockIntersectionObserver.instances).toHaveLength(1);
    });
  });

  // ========================================================================
  // サムネイル優先表示テスト
  // ========================================================================

  describe('サムネイル優先表示', () => {
    it('thumbnailSrcが指定されている場合、最初にサムネイルを読み込む', async () => {
      render(
        <LazyImage
          src="https://example.com/original.jpg"
          thumbnailSrc="https://example.com/thumbnail.jpg"
          alt="テスト画像"
          width={200}
          height={200}
        />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        const img = getImgElementOrThrow();
        expect(img).toHaveAttribute('src', 'https://example.com/thumbnail.jpg');
      });
    });

    it('サムネイル読み込み後、オリジナル画像に切り替わる', async () => {
      const onLoadComplete = vi.fn();

      render(
        <LazyImage
          src="https://example.com/original.jpg"
          thumbnailSrc="https://example.com/thumbnail.jpg"
          alt="テスト画像"
          width={200}
          height={200}
          onLoadComplete={onLoadComplete}
        />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      // サムネイルが読み込まれる
      await waitFor(() => {
        const img = getImgElementOrThrow();
        expect(img).toHaveAttribute('src', 'https://example.com/thumbnail.jpg');
      });

      // サムネイルのonLoadをシミュレート
      const img = getImgElementOrThrow();
      act(() => {
        img.dispatchEvent(new Event('load'));
      });

      // オリジナル画像に切り替わることを確認
      await waitFor(() => {
        const updatedImg = getImgElementOrThrow();
        expect(updatedImg).toHaveAttribute('src', 'https://example.com/original.jpg');
      });
    });

    it('thumbnailSrcがない場合は直接オリジナルを読み込む', async () => {
      render(
        <LazyImage
          src="https://example.com/original.jpg"
          alt="テスト画像"
          width={200}
          height={200}
        />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        const img = getImgElementOrThrow();
        expect(img).toHaveAttribute('src', 'https://example.com/original.jpg');
      });
    });
  });

  // ========================================================================
  // ローディング状態テスト
  // ========================================================================

  describe('ローディング状態', () => {
    it('読み込み中はスピナーが表示される', async () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      // ローディングスピナーが表示されることを確認
      expect(screen.getByTestId('lazy-image-loading')).toBeInTheDocument();
    });

    it('画像読み込み完了後、スピナーが非表示になる', async () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        expect(getImgElement()).not.toBeNull();
      });

      // 画像のonLoadをシミュレート
      const img = getImgElementOrThrow();
      act(() => {
        img.dispatchEvent(new Event('load'));
      });

      // ローディングスピナーが非表示になる
      await waitFor(() => {
        expect(screen.queryByTestId('lazy-image-loading')).not.toBeInTheDocument();
      });
    });
  });

  // ========================================================================
  // エラーハンドリングテスト
  // ========================================================================

  describe('エラーハンドリング', () => {
    it('画像読み込みエラー時にフォールバックが表示される', async () => {
      render(
        <LazyImage
          src="https://example.com/invalid.jpg"
          alt="テスト画像"
          width={200}
          height={200}
        />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        expect(getImgElement()).not.toBeNull();
      });

      // 画像のエラーをシミュレート
      const img = getImgElementOrThrow();
      act(() => {
        img.dispatchEvent(new Event('error'));
      });

      // フォールバック表示を確認
      await waitFor(() => {
        expect(screen.getByTestId('lazy-image-error')).toBeInTheDocument();
      });
    });

    it('onErrorコールバックが呼ばれる', async () => {
      const onError = vi.fn();

      render(
        <LazyImage
          src="https://example.com/invalid.jpg"
          alt="テスト画像"
          width={200}
          height={200}
          onError={onError}
        />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        expect(getImgElement()).not.toBeNull();
      });

      const img = getImgElementOrThrow();
      act(() => {
        img.dispatchEvent(new Event('error'));
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // アクセシビリティテスト
  // ========================================================================

  describe('アクセシビリティ', () => {
    it('適切なaria属性が設定される', () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      const container = screen.getByTestId('lazy-image-container');
      expect(container).toHaveAttribute('role', 'img');
      expect(container).toHaveAttribute('aria-label', 'テスト画像');
    });

    it('読み込み中のaria-busy属性', async () => {
      render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      // 読み込み中はaria-busy="true"
      expect(container).toHaveAttribute('aria-busy', 'true');

      // 画像読み込み完了
      await waitFor(() => {
        expect(getImgElement()).not.toBeNull();
      });

      const img = getImgElementOrThrow();
      act(() => {
        img.dispatchEvent(new Event('load'));
      });

      // 読み込み完了後はaria-busy="false"
      await waitFor(() => {
        expect(container).toHaveAttribute('aria-busy', 'false');
      });
    });
  });

  // ========================================================================
  // カスタマイズテスト
  // ========================================================================

  describe('カスタマイズ', () => {
    it('classNameが適用される', () => {
      render(
        <LazyImage
          src="https://example.com/image.jpg"
          alt="テスト画像"
          width={200}
          height={200}
          className="custom-class"
        />
      );

      const container = screen.getByTestId('lazy-image-container');
      expect(container).toHaveClass('custom-class');
    });

    it('objectFitが適用される', async () => {
      render(
        <LazyImage
          src="https://example.com/image.jpg"
          alt="テスト画像"
          width={200}
          height={200}
          objectFit="contain"
        />
      );

      const container = screen.getByTestId('lazy-image-container');

      act(() => {
        MockIntersectionObserver.triggerIntersection(container, true);
      });

      await waitFor(() => {
        const img = getImgElementOrThrow();
        expect(img).toHaveStyle({ objectFit: 'contain' });
      });
    });

    it('borderRadiusが適用される', () => {
      render(
        <LazyImage
          src="https://example.com/image.jpg"
          alt="テスト画像"
          width={200}
          height={200}
          borderRadius="8px"
        />
      );

      const container = screen.getByTestId('lazy-image-container');
      expect(container).toHaveStyle({ borderRadius: '8px' });
    });
  });

  // ========================================================================
  // クリーンアップテスト
  // ========================================================================

  describe('クリーンアップ', () => {
    it('アンマウント時にIntersectionObserverがdisconnectされる', () => {
      const { unmount } = render(
        <LazyImage src="https://example.com/image.jpg" alt="テスト画像" width={200} height={200} />
      );

      const observer = MockIntersectionObserver.instances[0];
      expect(observer).toBeDefined();
      const disconnectSpy = vi.spyOn(observer!, 'disconnect');

      unmount();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});
