import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import useElementSize from '../../hooks/useElementSize';

/**
 * useElementSize フックの単体テスト
 *
 * Task 99.2: useElementSize フック（ResizeObserver 購読）
 *
 * @see design.md - 「## Requirements 35-36」 useElementSize / 再フィットフロー
 * @see requirements.md - 要件 36.4（表示領域高さの可変UI追従・再フィット発火）
 */

// ResizeObserver コールバックの型
type ResizeCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

// テスト用モックの ResizeObserver。
// コールバックを保持し、手動で発火できる構成にする（jsdom は ResizeObserver 未実装）。
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  public readonly callback: ResizeCallback;
  public readonly observed: Set<Element> = new Set();
  public readonly disconnect = vi.fn(() => {
    this.observed.clear();
  });

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }
}

/**
 * 指定要素の resize を手動で発火するヘルパー。
 * 直近に生成された ResizeObserver インスタンスの callback を呼ぶ。
 */
function latestObserver(): MockResizeObserver {
  const observer = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
  if (!observer) {
    throw new Error('ResizeObserver instance not created');
  }
  return observer;
}

function fireResize(target: Element, size: { width: number; height: number }): void {
  const observer = latestObserver();
  const entry = {
    target,
    contentRect: {
      width: size.width,
      height: size.height,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
    } as DOMRectReadOnly,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  } as unknown as ResizeObserverEntry;
  observer.callback([entry], observer as unknown as ResizeObserver);
}

describe('useElementSize', () => {
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    MockResizeObserver.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).ResizeObserver;
    }
    vi.restoreAllMocks();
  });

  it('初期状態では {width:0, height:0} を返す（未計測）', () => {
    const el = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: el };

    const { result } = renderHook(() => useElementSize(ref));

    expect(result.current).toEqual({ width: 0, height: 0 });
  });

  it('マウント時に対象要素を observe する', () => {
    const el = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: el };

    renderHook(() => useElementSize(ref));

    const observer = latestObserver();
    expect(observer.observed.has(el)).toBe(true);
  });

  it('ResizeObserver 発火で width/height が更新される（要件 36.4）', () => {
    const el = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: el };

    const { result } = renderHook(() => useElementSize(ref));

    act(() => {
      fireResize(el, { width: 800, height: 600 });
    });

    expect(result.current).toEqual({ width: 800, height: 600 });
  });

  it('resize が繰り返されるたびに最新の寸法へ更新される', () => {
    const el = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: el };

    const { result } = renderHook(() => useElementSize(ref));

    act(() => {
      fireResize(el, { width: 375, height: 500 });
    });
    expect(result.current).toEqual({ width: 375, height: 500 });

    act(() => {
      fireResize(el, { width: 375, height: 320 });
    });
    expect(result.current).toEqual({ width: 375, height: 320 });
  });

  it('アンマウント時に ResizeObserver を disconnect する（cleanup）', () => {
    const el = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: el };

    const { unmount } = renderHook(() => useElementSize(ref));

    const observer = latestObserver();
    expect(observer.disconnect).not.toHaveBeenCalled();

    unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ref.current が null の場合は observe せず例外も出さない', () => {
    const ref: RefObject<HTMLDivElement | null> = { current: null };

    expect(() => {
      renderHook(() => useElementSize(ref));
    }).not.toThrow();

    expect(MockResizeObserver.instances.length).toBe(0);
  });

  it('ResizeObserver 非対応環境でも例外を出さず {width:0, height:0} を返す', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).ResizeObserver;

    const el = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: el };

    let result: { current: { width: number; height: number } } | undefined;
    expect(() => {
      result = renderHook(() => useElementSize(ref)).result;
    }).not.toThrow();

    expect(result?.current).toEqual({ width: 0, height: 0 });
  });
});
