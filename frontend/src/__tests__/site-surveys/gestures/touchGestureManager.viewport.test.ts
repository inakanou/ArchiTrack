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
import { createCanvasViewportController } from '../../../components/site-surveys/gestures/canvasViewportController';
import type {
  CanvasViewportController,
  FabricCanvasLike,
  ViewportPoint,
  ViewportState,
  ViewportTransform,
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
  toCanvasPoint: ReturnType<typeof vi.fn<(point: ViewportPoint) => ViewportPoint>>;
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
    // jsdom の bounding rect は全て 0 のため、実コントローラと同じく変換は恒等になる。
    toCanvasPoint: vi.fn<(point: ViewportPoint) => ViewportPoint>(
      (point: ViewportPoint): ViewportPoint => point
    ),
  };
};

/**
 * Fabric Canvas の最小モック（ジェスチャー検出面 + ビューポート制御面の双方を満たす）。
 * zoomToPoint は Fabric v7 `StaticCanvas.zoomToPoint` と同等に「指定点を面上で固定して拡大」する。
 */
interface FabricLikeCanvas extends FabricCanvasLike {
  fire: ReturnType<typeof vi.fn>;
  getElement(): HTMLCanvasElement;
  upperCanvasEl: HTMLCanvasElement;
}

const createFabricLikeCanvas = (
  element: HTMLCanvasElement,
  width: number,
  height: number
): FabricLikeCanvas => {
  const canvas: FabricLikeCanvas = {
    fire: vi.fn(),
    getElement: () => element,
    upperCanvasEl: element,
    viewportTransform: [1, 0, 0, 1, 0, 0] as ViewportTransform,
    getWidth: () => width,
    getHeight: () => height,
    getZoom: () => canvas.viewportTransform[0],
    setViewportTransform: (next: ViewportTransform): void => {
      canvas.viewportTransform = [...next] as ViewportTransform;
    },
    zoomToPoint: (point: ViewportPoint, value: number): void => {
      const vpt = canvas.viewportTransform;
      const oldZoom = vpt[0];
      const sceneX = (point.x - vpt[4]) / oldZoom;
      const sceneY = (point.y - vpt[5]) / oldZoom;
      canvas.viewportTransform = [
        value,
        0,
        0,
        value,
        point.x - sceneX * value,
        point.y - sceneY * value,
      ] as ViewportTransform;
    },
    requestRenderAll: vi.fn(),
  };
  return canvas;
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

/**
 * 縦方向にオフセットのある配置（ヘッダ＋ツールバーの下に canvas がある実機相当）で、
 * 中点ズームの基準が描画面基準へ揃っていることを検証する（Task 115.129, Req 33.3）。
 *
 * モックの controller ではなく **実コントローラ** を注入し、Fabric v7 の zoomToPoint と
 * 同等の算術を持つ canvas モックの viewportTransform を観測する。中点ズームが成立していれば
 * 「描画面上の中点に見えているシーン座標」はピンチ前後で不変である。画面座標のまま渡すと
 * 要素オフセットぶん基準が下へずれ、この不変量が崩れる。
 */
describe('touchGestureManager - 縦オフセット配置の中点ズーム (Req 33.3)', () => {
  /** canvas 要素の配置（画面上端から ELEMENT_TOP だけ下にある） */
  const ELEMENT_LEFT = 12;
  const ELEMENT_TOP = 220;
  const CANVAS_WIDTH = 360;
  const CANVAS_HEIGHT = 300;

  let element: HTMLCanvasElement;
  let fabricCanvas: FabricLikeCanvas;
  let controller: CanvasViewportController;
  const getCurrentTool = (): string => 'rectangle';

  /**
   * 描画面上の点 y に見えているシーン座標を返す（viewportTransform の逆変換）。
   */
  const sceneYAt = (canvasY: number): number => {
    const vpt = fabricCanvas.viewportTransform;
    return (canvasY - vpt[5]) / vpt[0];
  };

  beforeEach(() => {
    element = document.createElement('canvas');
    document.body.appendChild(element);
    // jsdom はレイアウトを行わないため、実配置の bounding rect を明示的に与える。
    element.getBoundingClientRect = (): DOMRect =>
      ({
        x: ELEMENT_LEFT,
        y: ELEMENT_TOP,
        left: ELEMENT_LEFT,
        top: ELEMENT_TOP,
        right: ELEMENT_LEFT + CANVAS_WIDTH,
        bottom: ELEMENT_TOP + CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        toJSON: () => ({}),
      }) as DOMRect;

    fabricCanvas = createFabricLikeCanvas(element, CANVAS_WIDTH, CANVAS_HEIGHT);
    controller = createCanvasViewportController(fabricCanvas);
  });

  afterEach(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('2本指ピンチの中心が描画面基準へ揃い、中点のシーン座標がピンチ前後で保たれる (Req 33.3)', () => {
    const manager = createTouchGestureManager();
    const detach = manager.attach(fabricCanvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    // 描画面上の中点＝canvas 中央 (180,150)。画面座標では (192,370)。
    const midClientX = ELEMENT_LEFT + CANVAS_WIDTH / 2;
    const midClientY = ELEMENT_TOP + CANVAS_HEIGHT / 2;
    const sceneYBefore = sceneYAt(CANVAS_HEIGHT / 2);

    // 起点: 指間距離 100（中点固定）
    dispatchPointer(element, 'pointerdown', {
      pointerId: 1,
      clientX: midClientX - 50,
      clientY: midClientY,
    });
    dispatchPointer(element, 'pointerdown', {
      pointerId: 2,
      clientX: midClientX + 50,
      clientY: midClientY,
    });
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    // 中点を動かさずに距離を 100 → 200 へ（比 2.0）。
    dispatchPointer(element, 'pointermove', {
      pointerId: 1,
      clientX: midClientX - 100,
      clientY: midClientY,
    });
    dispatchPointer(element, 'pointermove', {
      pointerId: 2,
      clientX: midClientX + 100,
      clientY: midClientY,
    });

    // Req 33.2: 指示した距離比そのもの（2.0）まで拡大していること。
    expect(fabricCanvas.getZoom()).toBeCloseTo(2, 5);
    // Req 33.3: 描画面上の中点に見えているシーン座標が不変＝中点が拡大の中心である。
    expect(sceneYAt(CANVAS_HEIGHT / 2)).toBeCloseTo(sceneYBefore, 5);

    detach();
  });
});
