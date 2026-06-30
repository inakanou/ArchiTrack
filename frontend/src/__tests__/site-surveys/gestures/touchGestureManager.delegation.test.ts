/**
 * touchGestureManager の描画中断通知 / 選択ツール委譲テスト (Req 33.1, 33.5, 33.13)
 *
 * - 描画中断通知（Req 33.5）: 描画ツールで描画中（または one-finger-down）に
 *   2本目のポインタが追加され `two-finger-pinch-pan` へ遷移する瞬間、
 *   `options.onGestureStart` が1回だけ発火する。
 * - 選択ツール委譲（Req 33.1/33.13）: `getCurrentTool()` が `'select'` のとき、
 *   1本指 move では `drawing` 状態へ遷移せず（getTouchState が 'drawing' にならない）、
 *   Fabric の選択/移動へ委ねる。描画ツール時は従来どおり `drawing` へ遷移する。
 *
 * @requirement site-survey/REQ-33.1
 * @requirement site-survey/REQ-33.5
 * @requirement site-survey/REQ-33.13
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTouchGestureManager } from '../../../components/site-surveys/gestures/touchGestureManager';

/**
 * Fabric Canvas の最小モック（touchGestureManager が依存する fire / getElement）。
 */
interface MockCanvas {
  fire: ReturnType<typeof vi.fn>;
  getElement: () => HTMLCanvasElement;
}

const createMockCanvas = (element: HTMLCanvasElement): MockCanvas => ({
  fire: vi.fn(),
  getElement: () => element,
});

const dispatchPointer = (
  target: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: { pointerId: number; clientX: number; clientY: number }
): void => {
  const event = new PointerEvent(type, {
    pointerId: init.pointerId,
    clientX: init.clientX,
    clientY: init.clientY,
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
};

describe('touchGestureManager - 描画中断通知/選択ツール委譲 (Req 33.1, 33.5, 33.13)', () => {
  let canvasElement: HTMLCanvasElement;
  let canvas: MockCanvas;

  beforeEach(() => {
    canvasElement = document.createElement('canvas');
    document.body.appendChild(canvasElement);
    canvas = createMockCanvas(canvasElement);
  });

  afterEach(() => {
    if (canvasElement.parentNode) {
      canvasElement.parentNode.removeChild(canvasElement);
    }
  });

  it('描画ツール時: 描画中に2本目追加で onGestureStart が1回発火する (Req 33.5)', () => {
    const onGestureStart = vi.fn();
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, () => 'rectangle', {
      onGestureStart,
    });

    // 1本指接地 → ドラッグ閾値超えで drawing へ
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 1, clientX: 200, clientY: 200 });
    expect(manager.getTouchState()).toBe('drawing');
    expect(onGestureStart).not.toHaveBeenCalled();

    // 2本目追加 → two-finger-pinch-pan へ遷移、描画中断通知が1回発火
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 100 });
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');
    expect(onGestureStart).toHaveBeenCalledTimes(1);

    detach();
  });

  it('描画ツール時: one-finger-down で2本目追加でも onGestureStart が発火する (Req 33.5)', () => {
    const onGestureStart = vi.fn();
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, () => 'rectangle', {
      onGestureStart,
    });

    // 1本指接地のみ（閾値未満、one-finger-down のまま）
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(manager.getTouchState()).toBe('one-finger-down');

    // 2本目追加 → 描画中断通知
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 100 });
    expect(onGestureStart).toHaveBeenCalledTimes(1);

    detach();
  });

  it('選択ツール時でも2本目追加で onGestureStart が発火する（中断通知はツール非依存, Req 33.5）', () => {
    const onGestureStart = vi.fn();
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, () => 'select', {
      onGestureStart,
    });

    // 選択ツールでも 1本指接地→2本目追加（移動/選択中の中断）は通知する
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(manager.getTouchState()).toBe('one-finger-down');
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 100 });
    expect(onGestureStart).toHaveBeenCalledTimes(1);

    detach();
  });

  it('選択ツール時: 1本指 move で drawing 状態へ遷移しない (Req 33.1/33.13)', () => {
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, () => 'select');

    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(manager.getTouchState()).toBe('one-finger-down');

    // 閾値を大きく超える move でも、選択ツールでは drawing へ遷移しない
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 1, clientX: 300, clientY: 300 });
    expect(manager.getTouchState()).not.toBe('drawing');
    expect(manager.getTouchState()).toBe('one-finger-down');

    detach();
  });

  it('描画ツール時: 1本指 move で従来どおり drawing 状態へ遷移する (Req 33.1)', () => {
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, () => 'rectangle');

    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 1, clientX: 300, clientY: 300 });
    expect(manager.getTouchState()).toBe('drawing');

    detach();
  });

  it('onGestureStart 未注入でも2本目追加で例外を出さない（後方互換）', () => {
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, () => 'rectangle');

    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(() =>
      dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 100 })
    ).not.toThrow();
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    detach();
  });
});
