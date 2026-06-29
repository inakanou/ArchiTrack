/**
 * touchGestureManager の cooldown 経由ビュー状態維持テスト (Req 33.7)
 *
 * マルチタッチ（2本指ピンチ/パン）でビュー状態（zoom/pan）を変更した後、
 * 1本の指が離脱して `two-finger-pinch-pan → cooldown → idle` と遷移しても、
 * 注入された canvasViewportController のビュー状態（zoom/pan）が
 * touchGestureManager によって変更・リセットされないことを検証する:
 *   - 1本離脱→cooldown→（COOLDOWN_MS 経過）→idle を経てもビュー状態が不変（Req 33.7）
 *   - 描画再開（1本指 down→drawing）後もズーム倍率・表示位置が維持される（Req 33.7）
 *
 * 93.1（viewport.test.ts: 2本指→zoom/pan 駆動）/ 93.2（delegation.test.ts: 描画中断
 * 通知）と重複しない、「cooldown を跨いだビュー状態の保持」のみを対象とする。
 *
 * @requirement site-survey/REQ-33.7
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTouchGestureManager } from '../../../components/site-surveys/gestures/touchGestureManager';
import { COOLDOWN_MS } from '../../../components/site-surveys/gestures/gesture-thresholds';
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
 * ステートフルな canvasViewportController モック。
 * zoomToPoint / pan / fit を呼ぶと内部 state（zoom/pan）が実際に変化し、
 * getState() がその時点の状態のスナップショットを返す。
 * これにより「touchGestureManager が cooldown 経由でビュー状態を変えていないこと」を
 * getState() の不変性として検証できる。
 */
interface StatefulMockController extends CanvasViewportController {
  zoomToPoint: ReturnType<typeof vi.fn<(point: ViewportPoint, zoom: number) => void>>;
  pan: ReturnType<typeof vi.fn<(dx: number, dy: number) => void>>;
  fit: ReturnType<typeof vi.fn<() => void>>;
}

const createStatefulController = (startZoom: number): StatefulMockController => {
  const state: ViewportState = { zoom: startZoom, panX: 0, panY: 0 };
  return {
    zoomToPoint: vi.fn<(point: ViewportPoint, zoom: number) => void>(
      (_point: ViewportPoint, zoom: number) => {
        state.zoom = zoom;
      }
    ),
    pan: vi.fn<(dx: number, dy: number) => void>((dx: number, dy: number) => {
      state.panX += dx;
      state.panY += dy;
    }),
    fit: vi.fn<() => void>(() => {
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
    }),
    clampZoom: vi.fn<(zoom: number) => number>((zoom: number) =>
      Math.max(0.1, Math.min(10, zoom))
    ),
    clampPan: vi.fn<() => void>(),
    // 実コントローラ同様、拡大時（MIN_PAN_ZOOM=1.01 以上）のみパンを有効とする。
    isPanEnabled: vi.fn<() => boolean>(() => state.zoom >= 1.01),
    // 呼び出し毎にスナップショットを返す（参照共有による誤検出を避ける）。
    getState: vi.fn<() => ViewportState>(() => ({ ...state })),
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

describe('touchGestureManager - cooldown 経由のビュー状態維持 (Req 33.7)', () => {
  let canvasElement: HTMLCanvasElement;
  let canvas: MockCanvas;
  const getCurrentTool = (): string => 'rectangle';

  beforeEach(() => {
    vi.useFakeTimers();
    canvasElement = document.createElement('canvas');
    document.body.appendChild(canvasElement);
    canvas = createMockCanvas(canvasElement);
  });

  afterEach(() => {
    if (canvasElement.parentNode) {
      canvasElement.parentNode.removeChild(canvasElement);
    }
    vi.useRealTimers();
  });

  /**
   * 2本指を接地し、指間距離を拡大して zoom=2 + pan を駆動する補助。
   * 駆動後のビュー状態（getState のスナップショット）を返す。
   */
  const driveZoomGesture = (controller: StatefulMockController): ViewportState => {
    // 起点: 指間距離 100、中点 (150,100)
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    // 指2 を (300,100) へ → 距離 200（比 2.0, Δ=100≥閾値）、中点 (200,100)
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 });
    return controller.getState();
  };

  it('1本離脱→cooldown→idle を経てもビュー状態(zoom/pan)が維持される (Req 33.7)', () => {
    const controller = createStatefulController(1);
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    const stateAfterGesture = driveZoomGesture(controller);
    // 前提: ジェスチャーで確かにビュー状態が拡大方向へ変化している
    expect(stateAfterGesture.zoom).toBe(2);
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    // 駆動完了後の呼び出し回数を記録（cooldown 以降に追加駆動がないことの基準）
    const zoomCallsBefore = controller.zoomToPoint.mock.calls.length;
    const panCallsBefore = controller.pan.mock.calls.length;

    // 1本離脱 → cooldown
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    expect(manager.getTouchState()).toBe('cooldown');

    // COOLDOWN_MS 経過 → idle（ビュー状態は維持されるべき, Req 33.7）
    vi.advanceTimersByTime(COOLDOWN_MS);
    expect(manager.getTouchState()).toBe('idle');

    // Req 33.7: cooldown→idle の遷移で zoom/pan は一切変化しない
    expect(controller.getState()).toEqual(stateAfterGesture);
    // touchGestureManager は cooldown 復帰時にビューをリセット（fit）しない
    expect(controller.fit).not.toHaveBeenCalled();
    // cooldown→idle で新たな zoom/pan 駆動も発生しない
    expect(controller.zoomToPoint).toHaveBeenCalledTimes(zoomCallsBefore);
    expect(controller.pan).toHaveBeenCalledTimes(panCallsBefore);

    detach();
  });

  it('cooldown→idle 後に1本指描画を再開してもズーム/パンが維持される (Req 33.7)', () => {
    const controller = createStatefulController(1);
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    const stateAfterGesture = driveZoomGesture(controller);
    expect(stateAfterGesture.zoom).toBe(2);

    // 1本離脱 → cooldown → idle
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(COOLDOWN_MS);
    // 残りの指も離す（全指解放）
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 2, clientX: 300, clientY: 100 });
    expect(manager.getTouchState()).toBe('idle');

    // 描画再開: 新たな1本指 down → 閾値超え move で drawing へ
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 3, clientX: 50, clientY: 50 });
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 3, clientX: 200, clientY: 200 });
    expect(manager.getTouchState()).toBe('drawing');

    // Req 33.7: 描画再開後もズーム倍率・表示位置（zoom/pan）が維持される
    expect(controller.getState()).toEqual(stateAfterGesture);
    // 描画再開時にビューをリセット（fit）しない
    expect(controller.fit).not.toHaveBeenCalled();

    detach();
  });
});
