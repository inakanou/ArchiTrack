/**
 * touchGestureManager のテスト (Req 27.1, 27.2, 27.6, 30.1-30.3, 30.6-30.8)
 *
 * Fabric Canvas にアタッチされたのち、PointerEvent を listen し、
 * 以下のジェスチャーを判定して canvas.fire() で発火することを検証する:
 *   - ダブルタップ: custom:dbltap（300ms 以内の 2 連続 pointerdown 同位置）
 *   - 長押し: custom:longpress（500ms 保持、移動なし）
 *
 * 状態遷移:
 *   idle → one-finger-down → drawing | two-finger-pinch-pan | three-plus-suspend → cooldown → idle
 *
 * @requirement site-survey/REQ-27.6
 * @requirement site-survey/REQ-30.2
 * @requirement site-survey/REQ-30.3
 * @requirement site-survey/REQ-30.4
 * @requirement site-survey/REQ-30.8
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTouchGestureManager } from '../../../../components/site-surveys/gestures/touchGestureManager';

/**
 * Fabric Canvas の最小モック。
 * - fire(): custom:dbltap / custom:longpress の引数検証に使用
 * - getElement(): 実際の HTMLCanvasElement を返し、PointerEvent を dispatch する
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
 * PointerEvent を dispatch するヘルパ。
 * jsdom は PointerEvent コンストラクタを提供する。
 */
const dispatchPointer = (
  target: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    pointerType?: 'touch' | 'mouse' | 'pen';
  }
): void => {
  const event = new PointerEvent(type, {
    pointerId: init.pointerId,
    clientX: init.clientX,
    clientY: init.clientY,
    pointerType: init.pointerType ?? 'touch',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
};

describe('touchGestureManager', () => {
  let canvasElement: HTMLCanvasElement;
  let canvas: MockCanvas;
  let getCurrentTool: ReturnType<typeof vi.fn<() => string>>;

  beforeEach(() => {
    vi.useFakeTimers();
    canvasElement = document.createElement('canvas');
    document.body.appendChild(canvasElement);
    canvas = createMockCanvas(canvasElement);
    getCurrentTool = vi.fn<() => string>(() => 'select');
  });

  afterEach(() => {
    vi.useRealTimers();
    if (canvasElement.parentNode) {
      canvasElement.parentNode.removeChild(canvasElement);
    }
  });

  describe('attach / detach', () => {
    it('attach() は detach 関数を返す', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      expect(typeof detach).toBe('function');
      detach();
    });

    it('初期状態は idle で、attach 後も idle のまま', () => {
      const manager = createTouchGestureManager();
      expect(manager.getTouchState()).toBe('idle');

      const detach = manager.attach(canvas as unknown as never, getCurrentTool);
      expect(manager.getTouchState()).toBe('idle');

      detach();
    });

    it('detach() はリスナーを除去し、以降の pointerdown で状態遷移しない', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      detach();

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      // detach 後は一切の状態遷移が発生しない
      expect(manager.getTouchState()).toBe('idle');
      expect(canvas.fire).not.toHaveBeenCalled();
    });
  });

  describe('ダブルタップ判定 (Req 27.1, 27.6)', () => {
    it('300ms 以内の 2 連続 pointerdown + pointerup（同位置）で custom:dbltap が発火する', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      // 1 回目のタップ
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      // 250ms 後に 2 回目のタップ
      vi.advanceTimersByTime(250);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 102, // 8px 以内
        clientY: 101,
      });

      // custom:dbltap が発火していること
      const dbltapCalls = canvas.fire.mock.calls.filter((call) => call[0] === 'custom:dbltap');
      expect(dbltapCalls).toHaveLength(1);

      const payload = dbltapCalls[0]?.[1];
      expect(payload).toMatchObject({
        pointerType: 'touch',
        clientX: 102,
        clientY: 101,
        currentTool: 'select',
      });

      detach();
    });

    it('301ms 以上経過した 2 連続タップでは custom:dbltap は発火しない', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      // 301ms 経過
      vi.advanceTimersByTime(301);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 100,
        clientY: 100,
      });

      const dbltapCalls = canvas.fire.mock.calls.filter((call) => call[0] === 'custom:dbltap');
      expect(dbltapCalls).toHaveLength(0);

      detach();
    });

    it('2 連続タップが離れた位置（>8px）の場合、custom:dbltap は発火しない', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      vi.advanceTimersByTime(100);

      // 10px ずれた位置
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 110,
        clientY: 100,
      });

      const dbltapCalls = canvas.fire.mock.calls.filter((call) => call[0] === 'custom:dbltap');
      expect(dbltapCalls).toHaveLength(0);

      detach();
    });
  });

  describe('長押し判定 (Req 27.2, 27.6)', () => {
    it('500ms 保持で custom:longpress が発火する（移動なし）', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      // 500ms 経過で longpress 発火
      vi.advanceTimersByTime(500);

      const longpressCalls = canvas.fire.mock.calls.filter(
        (call) => call[0] === 'custom:longpress'
      );
      expect(longpressCalls).toHaveLength(1);

      const payload = longpressCalls[0]?.[1];
      expect(payload).toMatchObject({
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
        currentTool: 'select',
      });

      detach();
    });

    it('500ms 未満で pointerup すると custom:longpress は発火しない', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      vi.advanceTimersByTime(300);

      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      vi.advanceTimersByTime(300); // さらに時間経過してもタイマは既に解除されている

      const longpressCalls = canvas.fire.mock.calls.filter(
        (call) => call[0] === 'custom:longpress'
      );
      expect(longpressCalls).toHaveLength(0);

      detach();
    });

    it('8px を超える移動が発生した場合、長押しタイマは解除される（描画ツール時）', () => {
      // Req 33.1/33.13: drawing への遷移は描画ツール選択中のみ。長押し解除はツール非依存。
      getCurrentTool.mockReturnValue('rectangle');
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      vi.advanceTimersByTime(100);

      // 10px 移動（8px 超過）
      dispatchPointer(canvasElement, 'pointermove', {
        pointerId: 1,
        clientX: 110,
        clientY: 100,
      });

      // 移動後 drawing 状態になっていること
      expect(manager.getTouchState()).toBe('drawing');

      vi.advanceTimersByTime(500);

      const longpressCalls = canvas.fire.mock.calls.filter(
        (call) => call[0] === 'custom:longpress'
      );
      expect(longpressCalls).toHaveLength(0);

      detach();
    });
  });

  describe('一本指状態遷移 (Req 30.8)', () => {
    it('pointerdown 1 本指で one-finger-down に遷移する', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      expect(manager.getTouchState()).toBe('one-finger-down');

      detach();
    });

    it('一本指 pointerdown 後に 8px を超える pointermove で drawing に遷移する（描画ツール時, Req 30.8/33.1）', () => {
      // Req 33.1/33.13: drawing への遷移は描画ツール選択中のみ。選択ツール時は委譲。
      getCurrentTool.mockReturnValue('rectangle');
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      dispatchPointer(canvasElement, 'pointermove', {
        pointerId: 1,
        clientX: 110,
        clientY: 100,
      });

      expect(manager.getTouchState()).toBe('drawing');

      detach();
    });
  });

  describe('マルチタッチ状態遷移 (Req 30.1, 30.2, 30.3, 30.6, 30.7, 30.8)', () => {
    it('2 本指 pointerdown で two-finger-pinch-pan に遷移し、長押しタイマが解除される', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
      });

      expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

      // 500ms 経過しても longpress は発火しない（タイマがクリアされているため）
      vi.advanceTimersByTime(500);

      const longpressCalls = canvas.fire.mock.calls.filter(
        (call) => call[0] === 'custom:longpress'
      );
      expect(longpressCalls).toHaveLength(0);

      detach();
    });

    it('3 本指以上の pointerdown で three-plus-suspend に遷移し、全タイマがクリアされる', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
      });
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 3,
        clientX: 300,
        clientY: 300,
      });

      expect(manager.getTouchState()).toBe('three-plus-suspend');

      // タイマがすべてクリアされ、時間経過しても発火しない
      vi.advanceTimersByTime(1000);
      expect(canvas.fire).not.toHaveBeenCalled();

      detach();
    });

    it('two-finger-pinch-pan から全指を離すと cooldown → idle に遷移する (150ms)', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
      });

      // 全指解放
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
      });

      // 全指解放直後は cooldown
      expect(manager.getTouchState()).toBe('cooldown');

      // 150ms 経過で idle に復帰
      vi.advanceTimersByTime(150);
      expect(manager.getTouchState()).toBe('idle');

      detach();
    });

    it('three-plus-suspend から全指を離すと cooldown → idle に遷移する (150ms)', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
      });
      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 3,
        clientX: 300,
        clientY: 300,
      });

      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 3,
        clientX: 300,
        clientY: 300,
      });

      expect(manager.getTouchState()).toBe('cooldown');

      vi.advanceTimersByTime(150);
      expect(manager.getTouchState()).toBe('idle');

      detach();
    });
  });

  describe('pointercancel (Req 30.8)', () => {
    it('pointercancel で全状態とタイマが idle に戻る', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      dispatchPointer(canvasElement, 'pointercancel', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      expect(manager.getTouchState()).toBe('idle');

      // 500ms 経過しても longpress は発火しない
      vi.advanceTimersByTime(500);
      const longpressCalls = canvas.fire.mock.calls.filter(
        (call) => call[0] === 'custom:longpress'
      );
      expect(longpressCalls).toHaveLength(0);

      detach();
    });
  });

  describe('イベントターゲットは upper-canvas (Req 33.2, 33.3, 33.4, 33.5, 34.7)', () => {
    /**
     * Fabric 7.x の Canvas は getElement() が lower-canvas を返す一方、
     * 実ブラウザのタッチ/ポインタイベントは最前面の upper-canvas に配送される。
     * attach() は upperCanvasEl（存在する場合）にリスナを張らなければ、
     * 実機でジェスチャーが一切発火しない（lower=0 / upper=2 の本番バグ）。
     */
    interface UpperLowerMockCanvas {
      fire: ReturnType<typeof vi.fn>;
      upperCanvasEl: HTMLCanvasElement;
      getElement: () => HTMLCanvasElement;
    }

    let lowerElement: HTMLCanvasElement;
    let upperElement: HTMLCanvasElement;
    let dualCanvas: UpperLowerMockCanvas;

    beforeEach(() => {
      lowerElement = document.createElement('canvas');
      upperElement = document.createElement('canvas');
      document.body.appendChild(lowerElement);
      document.body.appendChild(upperElement);
      dualCanvas = {
        fire: vi.fn(),
        upperCanvasEl: upperElement,
        getElement: () => lowerElement,
      };
    });

    afterEach(() => {
      if (lowerElement.parentNode) lowerElement.parentNode.removeChild(lowerElement);
      if (upperElement.parentNode) upperElement.parentNode.removeChild(upperElement);
    });

    it('upper-canvas へ dispatch した pointer イベントで custom:dbltap が発火する', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(dualCanvas as unknown as never, getCurrentTool);

      dispatchPointer(upperElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      dispatchPointer(upperElement, 'pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
      vi.advanceTimersByTime(100);
      dispatchPointer(upperElement, 'pointerdown', { pointerId: 2, clientX: 101, clientY: 100 });

      const dbltapCalls = dualCanvas.fire.mock.calls.filter((call) => call[0] === 'custom:dbltap');
      expect(dbltapCalls).toHaveLength(1);

      detach();
    });

    it('upper-canvas への 2 本指 pointerdown で two-finger-pinch-pan に遷移する', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(dualCanvas as unknown as never, getCurrentTool);

      dispatchPointer(upperElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      dispatchPointer(upperElement, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 200 });

      expect(manager.getTouchState()).toBe('two-finger-pinch-pan');

      detach();
    });

    it('lower-canvas（getElement()）への pointer イベントは無視される', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(dualCanvas as unknown as never, getCurrentTool);

      dispatchPointer(lowerElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });

      // upper にアタッチしているため lower への入力では状態遷移しない
      expect(manager.getTouchState()).toBe('idle');

      detach();
    });

    it('detach() は upper-canvas のリスナを除去する', () => {
      const manager = createTouchGestureManager();
      const detach = manager.attach(dualCanvas as unknown as never, getCurrentTool);

      detach();

      dispatchPointer(upperElement, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });

      expect(manager.getTouchState()).toBe('idle');
      expect(dualCanvas.fire).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentTool 連携 (Req 27 payload)', () => {
    it('custom:longpress の payload には getCurrentTool() の返却値が含まれる', () => {
      const manager = createTouchGestureManager();
      getCurrentTool.mockReturnValue('rectangle');
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 60,
      });

      vi.advanceTimersByTime(500);

      const longpressCalls = canvas.fire.mock.calls.filter(
        (call) => call[0] === 'custom:longpress'
      );
      expect(longpressCalls).toHaveLength(1);
      const longpressPayload = longpressCalls[0]?.[1];
      expect(longpressPayload).toMatchObject({
        pointerType: 'touch',
        clientX: 50,
        clientY: 60,
        currentTool: 'rectangle',
      });

      detach();
    });

    it('custom:dbltap の payload には getCurrentTool() の返却値が含まれる', () => {
      const manager = createTouchGestureManager();
      getCurrentTool.mockReturnValue('text');
      const detach = manager.attach(canvas as unknown as never, getCurrentTool);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 60,
      });
      dispatchPointer(canvasElement, 'pointerup', {
        pointerId: 1,
        clientX: 50,
        clientY: 60,
      });

      vi.advanceTimersByTime(100);

      dispatchPointer(canvasElement, 'pointerdown', {
        pointerId: 2,
        clientX: 50,
        clientY: 60,
      });

      const dbltapCalls = canvas.fire.mock.calls.filter((call) => call[0] === 'custom:dbltap');
      expect(dbltapCalls).toHaveLength(1);
      const dbltapPayload = dbltapCalls[0]?.[1];
      expect(dbltapPayload).toMatchObject({
        pointerType: 'touch',
        clientX: 50,
        clientY: 60,
        currentTool: 'text',
      });

      detach();
    });
  });
});
