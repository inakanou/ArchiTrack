/**
 * canvasViewportController (Req 33.3, 33.7, 33.9, 34.4, 34.7)
 *
 * Fabric Canvas の「ビューポート制御」（ズーム/パン/中点ズーム/フィット/クランプ）を
 * 単一実装として提供する React 非依存モジュール。閲覧モード（ImageViewer）と編集モード
 * （AnnotationEditor）の双方が同一コントローラを採用し、二重実装を解消する（Req 33.10）。
 *
 * 設計上の重要決定（design.md「座標系の分離」）:
 *   - ズーム/パンは `viewportTransform`（表示変換）のみで実現し、注釈オブジェクトの
 *     保存座標には一切影響させない。保存/復元は既存どおり canvas サイズ基準のスケールを
 *     用いるため、本コントローラの操作は保存 JSON に不連動。
 *   - 中点ズームは Fabric 標準 `zoomToPoint(point, value)` を採用し、指定点（2本指中点）を
 *     画面上で固定したまま拡大/縮小する（直接操作の原則, Req 33.3）。
 *
 * 依存は `FabricCanvasLike` 最小サーフェスのみ（touchGestureManager の FabricCanvasLike
 * パターンに倣う）。React・Fabric の内部型に過度に結合せず、単体テスト容易性を確保する。
 *
 * @requirement site-survey/REQ-33.3
 * @requirement site-survey/REQ-33.7
 * @requirement site-survey/REQ-33.9
 * @requirement site-survey/REQ-34.4
 * @requirement site-survey/REQ-34.7
 */
import { ZOOM_CONSTANTS, PAN_CONSTANTS } from '../image-viewer.constants';

/**
 * 画面（viewport）座標上の点。2本指中点やズーム基準点に用いる。
 */
export interface ViewportPoint {
  x: number;
  y: number;
}

/**
 * ビューポート状態。zoom と pan（平行移動量）を保持する。
 * Req 33.7（マルチタッチ→1本指描画への再開時にビュー状態を維持）の基礎データ。
 */
export interface ViewportState {
  /** 現在のズーム倍率 */
  zoom: number;
  /** パン位置X（viewportTransform[4]） */
  panX: number;
  /** パン位置Y（viewportTransform[5]） */
  panY: number;
}

/**
 * Fabric の viewportTransform 行列（`TMat2D` と同形の 6 要素タプル）。
 * [scaleX, skewY, skewX, scaleY, translateX, translateY]
 */
export type ViewportTransform = [number, number, number, number, number, number];

/**
 * Fabric Canvas のうち、canvasViewportController が依存する最小 API サーフェス。
 * Fabric.js 7.x の `Canvas` はこのサーフェスを構造的に満たす。
 */
export interface FabricCanvasLike {
  /** [scaleX, skewY, skewX, scaleY, translateX, translateY] */
  viewportTransform: ViewportTransform;
  /** 現在のズーム倍率（viewportTransform[0]） */
  getZoom(): number;
  /** 表示領域の幅（ズーム=1 時のコンテンツ基準幅） */
  getWidth(): number;
  /** 表示領域の高さ（ズーム=1 時のコンテンツ基準高さ） */
  getHeight(): number;
  /** viewportTransform を直接設定する */
  setViewportTransform(transform: ViewportTransform): void;
  /** 指定点を画面上で固定したままズームする（中点ズーム） */
  zoomToPoint(point: ViewportPoint, value: number): void;
  /** 次フレームで再描画を要求する */
  requestRenderAll(): void;
}

/**
 * コントローラ生成オプション。
 */
export interface CanvasViewportControllerOptions {
  /**
   * ズーム倍率が変化した際の通知（useCanvasViewport が現在倍率 state を更新するために購読）。
   * design.md 中点ズームフローの `Ctl-->>Hook: onZoomChange(z)` に対応。
   */
  onZoomChange?: (zoom: number) => void;
}

/**
 * ビューポート制御コントローラの公開インターフェース。
 */
export interface CanvasViewportController {
  /** 指定した中点を基準にズームする（範囲は clampZoom で制限, Req 33.3/33.9） */
  zoomToPoint(point: ViewportPoint, zoom: number): void;
  /** 表示領域を平行移動する。等倍時は抑止する（Req 34.7） */
  pan(dx: number, dy: number): void;
  /** 等倍（zoom=1）へ戻し、パン位置を初期化する（Req 34.4） */
  fit(): void;
  /** ズーム倍率を ZOOM_CONSTANTS の範囲へクランプする（Req 33.9） */
  clampZoom(zoom: number): number;
  /** 現在のパンが画像を表示領域外へ流さないよう範囲補正する */
  clampPan(): void;
  /** パン操作が有効か（MIN_PAN_ZOOM 以上か）を返す（Req 34.7） */
  isPanEnabled(): boolean;
  /** 現在のビュー状態（zoom/pan）を返す（Req 33.7） */
  getState(): ViewportState;
}

/**
 * ズーム倍率を ZOOM_CONSTANTS の上下限へクランプする純関数（Req 33.9）。
 * 閲覧モード ImageViewer.tsx の `clampZoom` 算術を抽出・共有する。
 */
const clampZoomValue = (zoom: number): number =>
  Math.max(ZOOM_CONSTANTS.MIN_ZOOM, Math.min(ZOOM_CONSTANTS.MAX_ZOOM, zoom));

/**
 * canvasViewportController を生成する。
 *
 * @param canvas ビューポートを制御する Fabric Canvas（最小サーフェス）
 * @param options onZoomChange 等の通知設定
 */
export const createCanvasViewportController = (
  canvas: FabricCanvasLike,
  options: CanvasViewportControllerOptions = {}
): CanvasViewportController => {
  const { onZoomChange } = options;

  const clampZoom = (zoom: number): number => clampZoomValue(zoom);

  const isPanEnabled = (): boolean => canvas.getZoom() >= PAN_CONSTANTS.MIN_PAN_ZOOM;

  const getState = (): ViewportState => {
    const vpt = canvas.viewportTransform;
    return { zoom: vpt[0], panX: vpt[4], panY: vpt[5] };
  };

  /**
   * パン位置を「コンテンツが表示領域を覆う範囲」へ補正する。
   * コンテンツ幅 = width * zoom、表示幅 = width とみなし、
   * translateX は [width - width*zoom, 0] の範囲に収める（zoom<=1 では 0=中央固定）。
   */
  const clampPan = (): void => {
    const vpt = canvas.viewportTransform;
    const zoom = vpt[0];
    const width = canvas.getWidth();
    const height = canvas.getHeight();

    const minX = Math.min(0, width - width * zoom);
    const minY = Math.min(0, height - height * zoom);

    const clampedX = Math.min(0, Math.max(minX, vpt[4]));
    const clampedY = Math.min(0, Math.max(minY, vpt[5]));

    if (clampedX !== vpt[4] || clampedY !== vpt[5]) {
      canvas.setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], clampedX, clampedY]);
    }
  };

  const zoomToPoint = (point: ViewportPoint, zoom: number): void => {
    const clamped = clampZoom(zoom);
    // 注釈の保存座標には影響しない（viewportTransform のみ変更）。
    canvas.zoomToPoint(point, clamped);
    clampPan();
    canvas.requestRenderAll();
    onZoomChange?.(canvas.getZoom());
  };

  const pan = (dx: number, dy: number): void => {
    // 等倍時はパンを抑止する（Req 34.7）。
    if (!isPanEnabled()) return;

    const vpt = canvas.viewportTransform;
    canvas.setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4] + dx, vpt[5] + dy]);
    clampPan();
    canvas.requestRenderAll();
  };

  const fit = (): void => {
    // 等倍へ戻し、パン位置を初期化する（Req 34.4）。
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
    onZoomChange?.(canvas.getZoom());
  };

  return {
    zoomToPoint,
    pan,
    fit,
    clampZoom,
    clampPan,
    isPanEnabled,
    getState,
  };
};
