/**
 * touchGestureManager のビューポート駆動テスト (Req 33.2, 33.3, 33.4, 34.7)
 *
 * `two-finger-pinch-pan` 状態で activePointers の 2 点から距離比と中点を算出し、
 * 注入された canvasViewportController を駆動することを検証する:
 *   - 2本指ピンチ（距離変化）→ controller.zoomToPoint(中点, clamp済み倍率)（Req 33.2/33.3）
 *   - 2本指ドラッグ（中点移動）→ controller.pan(dx, dy)（Req 33.4）
 *   - 等倍（isPanEnabled=false）時は controller.pan を呼ばない（Req 34.7）
 *
 * controller は呼び出し側（task96 の AnnotationEditor）から注入する設計のため、
 * attach の第 3 引数 `options.viewportController` 経由でモックを与える。
 *
 * @requirement site-survey/REQ-33.2
 * @requirement site-survey/REQ-33.3
 * @requirement site-survey/REQ-33.4
 * @requirement site-survey/REQ-34.7
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTouchGestureManager } from '../../../components/site-surveys/gestures/touchGestureManager';
import type {
  CanvasViewportController,
  ViewportPoint,
  ViewportState,
} from '../../../components/site-surveys/gestures/canvasViewportController';

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

/**
 * canvasViewportController のモック。
 * - clampZoom: 実コントローラと同様に [0.1, 10] へクランプ（呼出値の検証に使う）
 * - getState: ピンチ突入時の基準ズーム（zoom）を供給
 * - isPanEnabled: 等倍抑止（Req 34.7）の分岐を制御
 */
interface MockController extends CanvasViewportController {
  zoomToPoint: ReturnType<typeof vi.fn<(point: ViewportPoint, zoom: number) => void>>;
  pan: ReturnType<typeof vi.fn<(dx: number, dy: number) => void>>;
  clampZoom: ReturnType<typeof vi.fn<(zoom: number) => number>>;
  isPanEnabled: ReturnType<typeof vi.fn<() => boolean>>;
}

const createMockController = (options: {
  startZoom: number;
  panEnabled: boolean;
}): MockController => {
  const state: ViewportState = { zoom: options.startZoom, panX: 0, panY: 0 };
  return {
    zoomToPoint: vi.fn<(point: ViewportPoint, zoom: number) => void>(),
    pan: vi.fn<(dx: number, dy: number) => void>(),
    fit: vi.fn<() => void>(),
    clampZoom: vi.fn<(zoom: number) => number>((zoom: number) => Math.max(0.1, Math.min(10, zoom))),
    clampPan: vi.fn<() => void>(),
    isPanEnabled: vi.fn<() => boolean>(() => options.panEnabled),
    getState: vi.fn<() => ViewportState>((): ViewportState => state),
  };
};

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

describe('touchGestureManager - viewport 駆動 (Req 33.2, 33.3, 33.4, 34.7)', () => {
  let canvasElement: HTMLCanvasElement;
  let canvas: MockCanvas;
  const getCurrentTool = (): string => 'rectangle';

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

  /** 2本指を接地して two-finger-pinch-pan を開始する補助 */
  const startTwoFinger = (p0: { x: number; y: number }, p1: { x: number; y: number }): void => {
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: p0.x, clientY: p0.y });
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: p1.x, clientY: p1.y });
  };

  it('2本指 move（距離拡大）で zoomToPoint が中点・clamp済み倍率で呼ばれる (Req 33.2/33.3)', () => {
    const controller = createMockController({ startZoom: 1, panEnabled: false });
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    // 起点: 指間距離 100、中点 (150,100)
    startTwoFinger({ x: 100, y: 100 }, { x: 200, y: 100 });
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    // 指2 を (300,100) へ → 距離 200、中点 (200,100)、距離比 2.0
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 });

    // clampZoom(2.0) が呼ばれ、その戻り値で中点ズームが駆動される
    expect(controller.clampZoom).toHaveBeenCalledWith(2);
    expect(controller.zoomToPoint).toHaveBeenCalledTimes(1);
    expect(controller.zoomToPoint).toHaveBeenCalledWith({ x: 200, y: 100 }, 2);

    detach();
  });

  it('距離変化が閾値未満なら zoomToPoint は呼ばれない (Req 33.2)', () => {
    const controller = createMockController({ startZoom: 1, panEnabled: false });
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    // 起点: 距離 100
    startTwoFinger({ x: 100, y: 100 }, { x: 200, y: 100 });

    // 指2 を 5px だけ移動（距離 105、Δ=5 < PINCH_THRESHOLD=10）
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 2, clientX: 205, clientY: 100 });

    expect(controller.zoomToPoint).not.toHaveBeenCalled();

    detach();
  });

  it('中点移動（距離ほぼ一定）で pan が dx/dy 付きで呼ばれる (Req 33.4)', () => {
    // 拡大中相当: パン有効
    const controller = createMockController({ startZoom: 2, panEnabled: true });
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    // 起点: 距離 100、中点 (150,100)
    startTwoFinger({ x: 100, y: 100 }, { x: 200, y: 100 });

    // 指1 を (105,100) へ: 距離 95（Δ=5 < 閾値なので zoom なし）、中点 (152.5,100)
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 1, clientX: 105, clientY: 100 });

    expect(controller.zoomToPoint).not.toHaveBeenCalled();
    expect(controller.pan).toHaveBeenCalledTimes(1);
    // dx = 152.5 - 150 = 2.5, dy = 0
    expect(controller.pan).toHaveBeenCalledWith(2.5, 0);

    detach();
  });

  it('等倍時（isPanEnabled=false）は pan を呼ばない (Req 34.7)', () => {
    const controller = createMockController({ startZoom: 1, panEnabled: false });
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    startTwoFinger({ x: 100, y: 100 }, { x: 200, y: 100 });

    // 中点を移動させる（距離変化は閾値未満）が、等倍のため pan は抑止される
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 1, clientX: 105, clientY: 100 });

    expect(controller.pan).not.toHaveBeenCalled();

    detach();
  });

  it('controller 未注入時は two-finger move でも何も駆動せず例外も出さない（後方互換）', () => {
    const manager = createTouchGestureManager();
    // options なしの従来シグネチャ
    const detach = manager.attach(canvas as unknown as never, getCurrentTool);

    startTwoFinger({ x: 100, y: 100 }, { x: 200, y: 100 });
    expect(() =>
      dispatchPointer(canvasElement, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 })
    ).not.toThrow();

    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    detach();
  });
});
