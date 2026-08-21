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
 * Task 115.94 で、同じ cooldown タイマが「次のジェスチャーを踏み潰す」欠陥を持つことが
 * 判明したため、その回帰検証（Req 33.4 / 34.7）を本ファイルに併置する。
 *
 * @requirement site-survey/REQ-33.7
 * @requirement site-survey/REQ-33.4
 * @requirement site-survey/REQ-34.7
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
    clampZoom: vi.fn<(zoom: number) => number>((zoom: number) => Math.max(0.1, Math.min(10, zoom))),
    clampPan: vi.fn<() => void>(),
    // 実コントローラ同様、拡大時（MIN_PAN_ZOOM=1.01 以上）のみパンを有効とする。
    isPanEnabled: vi.fn<() => boolean>(() => state.zoom >= 1.01),
    // 呼び出し毎にスナップショットを返す（参照共有による誤検出を避ける）。
    getState: vi.fn<() => ViewportState>(() => ({ ...state })),
    // jsdom の bounding rect は全て 0 のため、実コントローラと同じく変換は恒等になる。
    toCanvasPoint: vi.fn<(point: ViewportPoint) => ViewportPoint>(
      (point: ViewportPoint): ViewportPoint => point
    ),
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

/**
 * cooldown タイマによる後続ジェスチャーの踏み潰し回帰 (Task 115.94, Req 33.4 / 34.7)
 *
 * マルチタッチ解除時に張られる COOLDOWN_MS のタイマは、以前は発火時に無条件で
 * `touchState = 'idle'` を代入していた。そのため COOLDOWN_MS 以内に次のジェスチャーを
 * 始めると、進行中の `two-finger-pinch-pan` が遅延タイマに `idle` へ戻され、以降の
 * pointermove がズーム/パン駆動へ到達しなくなる（ピンチが途中で無音停止する）。
 *
 * E2E（site-survey-annotation-mobile.spec.ts の「等倍時はパン抑止・拡大時のみ2本指パン」）
 * では、前のジェスチャー解放から次の接地までが実測 89〜118ms、最初の pointermove までが
 * 114〜150ms であり、閾値 150ms に対する余裕が数十ミリ秒しか無い。そのため踏み潰しが
 * 起こるかどうかが実行環境の負荷で揺れ、間欠失敗として表面化していた。
 *
 * 実時間に依存せず判定できるよう、fake timer で「cooldown 経過の瞬間」を厳密に再現する。
 */
describe('touchGestureManager - cooldown タイマが後続ジェスチャーを踏み潰さない (Req 33.4/34.7)', () => {
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

  it('cooldown 中に始めた2本指ピンチが、残存タイマの発火後も拡大を続ける (Req 33.4/34.7)', () => {
    const controller = createStatefulController(1);
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    // 1回目のジェスチャー: 2本指を接地して全指解放 → cooldown タイマ開始
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 2, clientX: 200, clientY: 100 });
    expect(manager.getTouchState()).toBe('cooldown');

    // COOLDOWN_MS 未満で次の2本指ジェスチャーを開始する（実機・E2E の実測レンジ）
    vi.advanceTimersByTime(COOLDOWN_MS - 50);
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 3, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 4, clientX: 200, clientY: 100 });
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    // 1回目の pointermove: 距離 100 → 150（比 1.5）
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 4, clientX: 250, clientY: 100 });
    expect(controller.getState().zoom).toBe(1.5);

    // ここで前ジェスチャー由来の cooldown タイマが発火する。
    // Req 33.4/34.7: 進行中のピンチは `idle` へ踏み潰されてはならない。
    vi.advanceTimersByTime(50);
    expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

    // 2回目以降の pointermove もズーム駆動へ到達し、拡大が最後まで続く
    dispatchPointer(canvasElement, 'pointermove', { pointerId: 4, clientX: 400, clientY: 100 });
    expect(controller.getState().zoom).toBe(3);

    detach();
  });

  it('cooldown 中に始めた2本指パンが、残存タイマの発火後も追従する (Req 33.4/34.7)', () => {
    // 既に拡大済み（zoom=2）＝パン有効の状態から始める
    const controller = createStatefulController(2);
    const manager = createTouchGestureManager();
    const detach = manager.attach(canvas as unknown as never, getCurrentTool, {
      viewportController: controller,
    });

    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerup', { pointerId: 2, clientX: 200, clientY: 100 });

    vi.advanceTimersByTime(COOLDOWN_MS - 50);
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 3, clientX: 100, clientY: 100 });
    dispatchPointer(canvasElement, 'pointerdown', { pointerId: 4, clientX: 200, clientY: 100 });

    // 残存タイマの発火を跨いで、指間距離を保ったまま2本指を平行移動する。
    // 実機同様に指は 1 本ずつ動くため、片方だけ動いた中間状態でも指間距離の
    // 起点からのずれが PINCH_DISTANCE_THRESHOLD_PX 未満に収まる歩幅（5px）で
    // 交互に進め、パン中に意図しないズームが混ざらないようにする。
    vi.advanceTimersByTime(50);
    let x3 = 100;
    let y3 = 100;
    let x4 = 200;
    let y4 = 100;
    for (let step = 0; step < 8; step++) {
      x3 -= 5;
      y3 -= 5;
      dispatchPointer(canvasElement, 'pointermove', { pointerId: 3, clientX: x3, clientY: y3 });
      x4 -= 5;
      y4 -= 5;
      dispatchPointer(canvasElement, 'pointermove', { pointerId: 4, clientX: x4, clientY: y4 });
    }

    // Req 33.4: 中点移動量ぶんパンする（踏み潰されていれば pan は一度も呼ばれない）
    expect(controller.pan).toHaveBeenCalled();
    const state = controller.getState();
    expect(state.panX).toBeCloseTo(-40, 5);
    expect(state.panY).toBeCloseTo(-40, 5);
    // Req 34.7 と整合: 指間距離を保った平行移動ではズーム倍率は変化しない
    expect(controller.zoomToPoint).not.toHaveBeenCalled();
    expect(state.zoom).toBe(2);

    detach();
  });
});
