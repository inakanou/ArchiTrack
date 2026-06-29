/**
 * @fileoverview useCanvasViewport フック（倍率状態と UI ハンドラの橋渡し）
 *
 * Task 92: canvasViewportController（Task 91.1）と React 状態（現在ズーム倍率）を橋渡しする。
 * コントローラの `onZoomChange` 通知を購読して倍率 state を更新し、ZoomControls（Task 94）と
 * AnnotationEditor（Task 96）が消費するズーム UI ハンドラ（zoomIn/zoomOut/fit）と現在倍率を公開する。
 *
 * 依存方向（design.md「Architecture Integration」）:
 *   CanvasViewportController（Infra/算術） → useCanvasViewport（橋渡し） → ZoomControls / AnnotationEditor（表示）
 * 本フックはコントローラを「使う」側であり、逆向き依存は持たない。
 *
 * 中点ズームフロー（design.md「中点ズームフロー（Req 33.3, 34）」）:
 *   - コントローラ生成時に `onZoomChange` を購読し、`zoomToPoint`/`fit` 完了時の倍率を state へ反映。
 *   - ボタン操作の zoomIn/zoomOut は表示領域の中央を基準点として `zoomToPoint` を呼ぶ。
 *   - ズーム幅は既存 `ZOOM_CONSTANTS.ZOOM_STEP` を用いる（上下限はコントローラ側 clampZoom が担保）。
 *
 * Requirements:
 * - 34.2: 注釈編集モードに現在のズーム倍率を示す視覚的表示（倍率 state）を提供する
 * - 34.3: ズームイン/ズームアウト操作時に倍率表示を最新のズーム倍率へ更新する
 * - 34.4: 全体表示（フィット）操作で等倍へ戻し、パン位置を初期化する
 *
 * @see design.md - Requirements 29.4, 33-34 / 中点ズームフロー
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  createCanvasViewportController,
  type CanvasViewportController,
  type FabricCanvasLike,
  type ViewportPoint,
} from '../components/site-surveys/gestures/canvasViewportController';
import { ZOOM_CONSTANTS } from '../components/site-surveys/image-viewer.constants';

/**
 * useCanvasViewport フックの引数。
 */
export interface UseCanvasViewportOptions {
  /** ビューポートを制御する Fabric Canvas（最小サーフェス）。null の間は no-op。 */
  canvas: FabricCanvasLike | null;
}

/**
 * useCanvasViewport フックの戻り値。
 */
export interface UseCanvasViewportReturn {
  /** 現在のズーム倍率（倍率バッジ表示用, Req 34.2/34.3） */
  zoom: number;
  /** 表示領域中央を基準に1ステップ拡大する（Req 34.1/34.3） */
  zoomIn: () => void;
  /** 表示領域中央を基準に1ステップ縮小する（Req 34.1/34.3） */
  zoomOut: () => void;
  /** 等倍へ戻し、パン位置を初期化する（Req 34.4） */
  fit: () => void;
  /**
   * フックが所有するビューポートコントローラ（null=canvas 未設定）。
   * AnnotationEditor（Task 96）が touchGestureManager へ同一インスタンスを橋渡しするために公開する。
   */
  controller: CanvasViewportController | null;
}

/**
 * 表示領域の中央点を返す。ボタン由来の zoomIn/zoomOut の中点ズーム基準に用いる。
 */
const getCenterPoint = (canvas: FabricCanvasLike): ViewportPoint => ({
  x: canvas.getWidth() / 2,
  y: canvas.getHeight() / 2,
});

/**
 * canvasViewportController と React 状態（現在倍率）を橋渡しするフック。
 *
 * @param options canvas（制御対象の Fabric Canvas）
 */
export function useCanvasViewport({ canvas }: UseCanvasViewportOptions): UseCanvasViewportReturn {
  // 現在のズーム倍率（倍率バッジ表示用）。canvas 未設定時は等倍 1 を既定とする。
  const [zoom, setZoom] = useState<number>(() => (canvas ? canvas.getZoom() : 1));

  // canvas ごとに 1 つのコントローラを所有し、onZoomChange を購読して倍率 state を更新する。
  const controller = useMemo<CanvasViewportController | null>(() => {
    if (!canvas) {
      return null;
    }
    return createCanvasViewportController(canvas, {
      onZoomChange: (next) => setZoom(next),
    });
  }, [canvas]);

  // canvas が切り替わった際、倍率 state を新しい canvas の現在倍率へ同期する。
  useEffect(() => {
    if (canvas) {
      setZoom(canvas.getZoom());
    }
  }, [canvas]);

  const zoomIn = useCallback(() => {
    if (!canvas || !controller) {
      return;
    }
    controller.zoomToPoint(getCenterPoint(canvas), canvas.getZoom() + ZOOM_CONSTANTS.ZOOM_STEP);
  }, [canvas, controller]);

  const zoomOut = useCallback(() => {
    if (!canvas || !controller) {
      return;
    }
    controller.zoomToPoint(getCenterPoint(canvas), canvas.getZoom() - ZOOM_CONSTANTS.ZOOM_STEP);
  }, [canvas, controller]);

  const fit = useCallback(() => {
    controller?.fit();
  }, [controller]);

  return {
    zoom,
    zoomIn,
    zoomOut,
    fit,
    controller,
  };
}
