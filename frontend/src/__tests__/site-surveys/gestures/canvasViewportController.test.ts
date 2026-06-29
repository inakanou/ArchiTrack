/**
 * canvasViewportController のテスト (Req 33.3, 33.7, 33.9, 34.4, 34.7)
 *
 * Fabric Canvas の viewportTransform のみを操作する React 非依存の
 * ビューポート制御コントローラを検証する。
 *
 *   - clampZoom: ZOOM_CONSTANTS の上下限でクランプ（Req 33.9）
 *   - zoomToPoint: 2本指中点を基準に拡大/縮小し、中点が画面上で保持される（Req 33.3）
 *   - pan: viewportTransform の平行移動。等倍時は抑止（Req 34.7）
 *   - clampPan: 画像が表示領域外へ流れないよう範囲制限
 *   - fit: 等倍（zoom=1）へ戻しパン位置を初期化（Req 34.4）
 *   - getState: 現在の zoom/pan を返す（再開時のビュー維持の基礎, Req 33.7）
 *
 * @requirement site-survey/REQ-33.3
 * @requirement site-survey/REQ-33.7
 * @requirement site-survey/REQ-33.9
 * @requirement site-survey/REQ-34.4
 * @requirement site-survey/REQ-34.7
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCanvasViewportController,
  type FabricCanvasLike,
  type ViewportTransform,
} from '../../../components/site-surveys/gestures/canvasViewportController';
import {
  ZOOM_CONSTANTS,
  PAN_CONSTANTS,
} from '../../../components/site-surveys/image-viewer.constants';

/**
 * Fabric Canvas の最小モック。
 * Fabric v7 の zoomToPoint と同等の「指定点を画面上で固定したままズーム」する
 * 算術を再現し、viewportTransform を保持する。
 */
const makeCanvas = (
  width: number,
  height: number,
  initialVpt: ViewportTransform = [1, 0, 0, 1, 0, 0]
): FabricCanvasLike & { requestRenderAll: ReturnType<typeof vi.fn> } => {
  const canvas = {
    viewportTransform: [...initialVpt] as ViewportTransform,
    getWidth: () => width,
    getHeight: () => height,
    getZoom: () => canvas.viewportTransform[0],
    setViewportTransform: (next: ViewportTransform): void => {
      canvas.viewportTransform = [...next] as ViewportTransform;
    },
    zoomToPoint: (point: { x: number; y: number }, value: number): void => {
      const vpt = canvas.viewportTransform;
      const oldZoom = vpt[0];
      const sceneX = (point.x - vpt[4]) / oldZoom;
      const sceneY = (point.y - vpt[5]) / oldZoom;
      const newPanX = point.x - sceneX * value;
      const newPanY = point.y - sceneY * value;
      canvas.viewportTransform = [value, 0, 0, value, newPanX, newPanY] as ViewportTransform;
    },
    requestRenderAll: vi.fn(),
  };
  return canvas;
};

describe('canvasViewportController', () => {
  describe('clampZoom (Req 33.9)', () => {
    let canvas: ReturnType<typeof makeCanvas>;

    beforeEach(() => {
      canvas = makeCanvas(800, 600);
    });

    it('下限 MIN_ZOOM 未満は MIN_ZOOM にクランプする', () => {
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.clampZoom(ZOOM_CONSTANTS.MIN_ZOOM - 1)).toBe(ZOOM_CONSTANTS.MIN_ZOOM);
    });

    it('上限 MAX_ZOOM 超過は MAX_ZOOM にクランプする', () => {
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.clampZoom(ZOOM_CONSTANTS.MAX_ZOOM + 100)).toBe(ZOOM_CONSTANTS.MAX_ZOOM);
    });

    it('範囲内の値はそのまま返す', () => {
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.clampZoom(2.5)).toBe(2.5);
    });

    it('境界値ちょうど（MIN_ZOOM / MAX_ZOOM）はその値を保持する', () => {
      // 「未満/超過」だけでなく境界そのものを通すことを保証する（off-by-one 防止）
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.clampZoom(ZOOM_CONSTANTS.MIN_ZOOM)).toBe(ZOOM_CONSTANTS.MIN_ZOOM);
      expect(ctl.clampZoom(ZOOM_CONSTANTS.MAX_ZOOM)).toBe(ZOOM_CONSTANTS.MAX_ZOOM);
    });
  });

  describe('zoomToPoint 中点保持 (Req 33.3)', () => {
    it('指定した中点が画面上の同じ位置に保持される', () => {
      const canvas = makeCanvas(800, 600);
      const ctl = createCanvasViewportController(canvas);
      const midpoint = { x: 300, y: 200 };

      // 中点直下のシーン座標（ズーム前）
      const before = canvas.viewportTransform;
      const sceneX = (midpoint.x - before[4]) / before[0];
      const sceneY = (midpoint.y - before[5]) / before[0];

      ctl.zoomToPoint(midpoint, 2);

      const after = canvas.viewportTransform;

      // --- ハードニング: モックの再実装に依存しない独立期待値で viewportTransform を検証 ---
      // 開始 vpt=[1,0,0,1,0,0]、zoom 1->2、中点(300,200) を手計算する:
      //   panX = midpoint.x - sceneX * newZoom = 300 - 300 * 2 = -300
      //   panY = midpoint.y - sceneY * newZoom = 200 - 200 * 2 = -200
      // clampPan は範囲内（minX = 800 - 800*2 = -800 <= -300 <= 0、minY = -600 <= -200 <= 0）
      // のため translate は不変。よって最終 vpt = [2, 0, 0, 2, -300, -200]。
      const EXPECTED_ZOOM = 2;
      const EXPECTED_PAN_X = midpoint.x - sceneX * EXPECTED_ZOOM; // = -300
      const EXPECTED_PAN_Y = midpoint.y - sceneY * EXPECTED_ZOOM; // = -200
      expect(after[0]).toBeCloseTo(EXPECTED_ZOOM, 5);
      expect(after[3]).toBeCloseTo(EXPECTED_ZOOM, 5);
      expect(after[4]).toBeCloseTo(EXPECTED_PAN_X, 5);
      expect(after[5]).toBeCloseTo(EXPECTED_PAN_Y, 5);
      expect(EXPECTED_PAN_X).toBe(-300);
      expect(EXPECTED_PAN_Y).toBe(-200);

      // 上記独立期待値が成り立つ結果として、指定中点は画面上の同じ位置に保持される
      const screenX = sceneX * after[0] + after[4];
      const screenY = sceneY * after[3] + after[5];
      expect(screenX).toBeCloseTo(midpoint.x, 5);
      expect(screenY).toBeCloseTo(midpoint.y, 5);
      expect(ctl.getState().zoom).toBe(2);
    });

    it('範囲外ズームは clampZoom 後に適用される', () => {
      const canvas = makeCanvas(800, 600);
      const ctl = createCanvasViewportController(canvas);
      ctl.zoomToPoint({ x: 400, y: 300 }, ZOOM_CONSTANTS.MAX_ZOOM + 50);
      expect(ctl.getState().zoom).toBe(ZOOM_CONSTANTS.MAX_ZOOM);
    });

    it('縮小方向（zoom 4→2）でも指定中点が画面上で保持される', () => {
      // 拡大方向だけでなく縮小方向でも中点基準変換が成立することを保証する。
      // 開始 vpt=[4,0,0,4,-800,-600]（zoom4 のパン有効範囲内）、中点(400,300) を zoom 2 へ縮小。
      const START_ZOOM = 4;
      const canvas = makeCanvas(800, 600, [START_ZOOM, 0, 0, START_ZOOM, -800, -600]);
      const ctl = createCanvasViewportController(canvas);
      const midpoint = { x: 400, y: 300 };

      const before = canvas.viewportTransform;
      const sceneX = (midpoint.x - before[4]) / before[0]; // (400+800)/4 = 300
      const sceneY = (midpoint.y - before[5]) / before[0]; // (300+600)/4 = 225

      ctl.zoomToPoint(midpoint, 2);
      const after = canvas.viewportTransform;

      // 独立期待値（手計算）: newPanX = 400 - 300*2 = -200, newPanY = 300 - 225*2 = -150
      // zoom2 のパン範囲 X[-800,0] / Y[-600,0] 内のため clampPan は不変。
      const EXPECTED_ZOOM = 2;
      const EXPECTED_PAN_X = midpoint.x - sceneX * EXPECTED_ZOOM;
      const EXPECTED_PAN_Y = midpoint.y - sceneY * EXPECTED_ZOOM;
      expect(EXPECTED_PAN_X).toBe(-200);
      expect(EXPECTED_PAN_Y).toBe(-150);
      expect(after[0]).toBeCloseTo(EXPECTED_ZOOM, 5);
      expect(after[4]).toBeCloseTo(EXPECTED_PAN_X, 5);
      expect(after[5]).toBeCloseTo(EXPECTED_PAN_Y, 5);

      // 縮小後も指定中点は画面上の同じ位置に保持される
      const screenX = sceneX * after[0] + after[4];
      const screenY = sceneY * after[3] + after[5];
      expect(screenX).toBeCloseTo(midpoint.x, 5);
      expect(screenY).toBeCloseTo(midpoint.y, 5);
    });
  });

  describe('pan と isPanEnabled (Req 34.7)', () => {
    it('ズーム時はパンが反映される', () => {
      const canvas = makeCanvas(800, 600, [2, 0, 0, 2, 0, 0]);
      const ctl = createCanvasViewportController(canvas);
      ctl.pan(-100, -50);
      const state = ctl.getState();
      expect(state.panX).toBe(-100);
      expect(state.panY).toBe(-50);
    });

    it('等倍（fit）時はパンを抑止する', () => {
      const canvas = makeCanvas(800, 600, [1, 0, 0, 1, 0, 0]);
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.isPanEnabled()).toBe(false);
      ctl.pan(-100, -50);
      const state = ctl.getState();
      expect(state.panX).toBe(0);
      expect(state.panY).toBe(0);
    });

    it('MIN_PAN_ZOOM 以上でパンが有効になる', () => {
      const canvas = makeCanvas(800, 600, [
        PAN_CONSTANTS.MIN_PAN_ZOOM,
        0,
        0,
        PAN_CONSTANTS.MIN_PAN_ZOOM,
        0,
        0,
      ]);
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.isPanEnabled()).toBe(true);
    });
  });

  describe('clampPan 範囲制限', () => {
    it('過剰なパンを画像が表示領域外に出ない範囲へ補正する', () => {
      const canvas = makeCanvas(800, 600, [2, 0, 0, 2, 0, 0]);
      const ctl = createCanvasViewportController(canvas);
      // 大きく右下方向へパン（正方向）→ 上限0へ補正される
      ctl.pan(500, 500);
      const state = ctl.getState();
      expect(state.panX).toBeLessThanOrEqual(0);
      expect(state.panY).toBeLessThanOrEqual(0);
      // 左上方向の下限: w - w*zoom = 800 - 1600 = -800
      ctl.pan(-5000, -5000);
      const state2 = ctl.getState();
      expect(state2.panX).toBeGreaterThanOrEqual(800 - 800 * 2);
      expect(state2.panY).toBeGreaterThanOrEqual(600 - 600 * 2);
    });

    it('クランプ下限はズーム倍率に比例して拡がる（zoom=4 で width-width*zoom）', () => {
      // zoom=2 だけでなく別倍率でも下限が w-w*zoom / h-h*zoom に追従することを保証する。
      const ZOOM = 4;
      const canvas = makeCanvas(800, 600, [ZOOM, 0, 0, ZOOM, 0, 0]);
      const ctl = createCanvasViewportController(canvas);

      // 左上方向へ極端にパン → 下限 [-2400, -1800] ちょうどへ補正される
      ctl.pan(-100000, -100000);
      const lower = ctl.getState();
      expect(lower.panX).toBe(800 - 800 * ZOOM); // -2400
      expect(lower.panY).toBe(600 - 600 * ZOOM); // -1800

      // 右下方向へ極端にパン → 上限 0 へ補正される
      ctl.pan(100000, 100000);
      const upper = ctl.getState();
      expect(upper.panX).toBe(0);
      expect(upper.panY).toBe(0);
    });
  });

  describe('fit (Req 34.4)', () => {
    it('等倍へ戻しパン位置を初期化する', () => {
      const canvas = makeCanvas(800, 600, [3, 0, 0, 3, -120, -80]);
      const ctl = createCanvasViewportController(canvas);
      ctl.fit();
      const state = ctl.getState();
      expect(state.zoom).toBe(1);
      expect(state.panX).toBe(0);
      expect(state.panY).toBe(0);
    });

    it('既に等倍の状態から呼んでも等倍を保持し onZoomChange(1) と再描画を行う', () => {
      // 変化が無い場合でもフィットは確定的に等倍へ揃え、購読側へ 1 を通知する。
      const canvas = makeCanvas(800, 600, [1, 0, 0, 1, 0, 0]);
      const onZoomChange = vi.fn();
      const ctl = createCanvasViewportController(canvas, { onZoomChange });

      ctl.fit();

      expect(ctl.getState()).toEqual({ zoom: 1, panX: 0, panY: 0 });
      expect(onZoomChange).toHaveBeenLastCalledWith(1);
      expect(canvas.requestRenderAll).toHaveBeenCalled();
    });
  });

  describe('getState (Req 33.7)', () => {
    it('現在の zoom/pan を viewportTransform から返す', () => {
      const canvas = makeCanvas(800, 600, [2.5, 0, 0, 2.5, -40, -30]);
      const ctl = createCanvasViewportController(canvas);
      expect(ctl.getState()).toEqual({ zoom: 2.5, panX: -40, panY: -30 });
    });
  });

  describe('onZoomChange 通知', () => {
    it('zoomToPoint/fit でズーム変化を通知する', () => {
      const canvas = makeCanvas(800, 600);
      const onZoomChange = vi.fn();
      const ctl = createCanvasViewportController(canvas, { onZoomChange });
      ctl.zoomToPoint({ x: 400, y: 300 }, 2);
      expect(onZoomChange).toHaveBeenLastCalledWith(2);
      ctl.fit();
      expect(onZoomChange).toHaveBeenLastCalledWith(1);
    });
  });

  describe('描画呼び出し', () => {
    it('ビュー変更後に requestRenderAll を呼ぶ', () => {
      const canvas = makeCanvas(800, 600, [2, 0, 0, 2, 0, 0]);
      const ctl = createCanvasViewportController(canvas);
      ctl.zoomToPoint({ x: 100, y: 100 }, 3);
      ctl.pan(-10, -10);
      ctl.fit();
      expect(canvas.requestRenderAll).toHaveBeenCalled();
    });
  });
});
