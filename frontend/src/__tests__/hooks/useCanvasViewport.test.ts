/**
 * @fileoverview useCanvasViewport フックのテスト
 *
 * Task 92: useCanvasViewport フック（倍率状態と UI ハンドラの橋渡し）
 * - canvasViewportController（91.1）と React 状態（現在ズーム倍率）の橋渡し
 * - onZoomChange による倍率 state 更新、zoomIn/zoomOut/fit ハンドラの提供
 *
 * Requirements:
 * - 34.2: 注釈編集モードに現在のズーム倍率を示す視覚的表示（倍率 state）を提供する
 * - 34.3: ズームイン/ズームアウト操作時に倍率表示を最新のズーム倍率へ更新する
 * - 34.4: 全体表示（フィット）操作で等倍へ戻し、パン位置を初期化する
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasViewport } from '../../hooks/useCanvasViewport';
import { ZOOM_CONSTANTS } from '../../components/site-surveys/image-viewer.constants';
import type {
  FabricCanvasLike,
  ViewportTransform,
} from '../../components/site-surveys/gestures/canvasViewportController';

/**
 * canvasViewportController が依存する最小サーフェスを満たすモック Canvas。
 * zoomToPoint は viewportTransform[0] を value に更新し、getZoom がそれを返す
 * （実 Fabric Canvas の中点ズーム挙動を倍率反映の観点で再現）。
 */
function createMockCanvas(width = 800, height = 600): FabricCanvasLike {
  let vpt: ViewportTransform = [1, 0, 0, 1, 0, 0];
  return {
    get viewportTransform(): ViewportTransform {
      return vpt;
    },
    set viewportTransform(next: ViewportTransform) {
      vpt = next;
    },
    getZoom: () => vpt[0],
    getWidth: () => width,
    getHeight: () => height,
    setViewportTransform: (transform: ViewportTransform) => {
      vpt = transform;
    },
    zoomToPoint: (_point, value) => {
      vpt = [value, 0, 0, value, vpt[4], vpt[5]];
    },
    requestRenderAll: () => {},
  };
}

describe('useCanvasViewport', () => {
  it('canvas の現在倍率で zoom state を初期化する', () => {
    const canvas = createMockCanvas();
    const { result } = renderHook(() => useCanvasViewport({ canvas }));

    expect(result.current.zoom).toBe(1);
  });

  it('zoomIn で ZOOM_STEP 分だけ倍率 state を更新する（Req 34.3）', () => {
    const canvas = createMockCanvas();
    const { result } = renderHook(() => useCanvasViewport({ canvas }));

    act(() => {
      result.current.zoomIn();
    });

    expect(result.current.zoom).toBeCloseTo(1 + ZOOM_CONSTANTS.ZOOM_STEP, 5);
    expect(canvas.getZoom()).toBeCloseTo(1 + ZOOM_CONSTANTS.ZOOM_STEP, 5);
  });

  it('zoomOut で ZOOM_STEP 分だけ倍率 state を下げる（Req 34.3）', () => {
    const canvas = createMockCanvas();
    const { result } = renderHook(() => useCanvasViewport({ canvas }));

    act(() => {
      result.current.zoomIn();
    });
    act(() => {
      result.current.zoomOut();
    });

    expect(result.current.zoom).toBeCloseTo(1, 5);
  });

  it('zoomIn は MAX_ZOOM を超えない（Req 33.9 のクランプを尊重）', () => {
    const canvas = createMockCanvas();
    // 倍率を上限近くへ進める
    canvas.setViewportTransform([
      ZOOM_CONSTANTS.MAX_ZOOM,
      0,
      0,
      ZOOM_CONSTANTS.MAX_ZOOM,
      0,
      0,
    ]);
    const { result } = renderHook(() => useCanvasViewport({ canvas }));

    act(() => {
      result.current.zoomIn();
    });

    expect(result.current.zoom).toBe(ZOOM_CONSTANTS.MAX_ZOOM);
  });

  it('fit で等倍へ戻し、パン位置を初期化する（Req 34.4）', () => {
    const canvas = createMockCanvas();
    // ズーム＋パンした状態を作る
    canvas.setViewportTransform([2, 0, 0, 2, -50, -30]);
    const { result } = renderHook(() => useCanvasViewport({ canvas }));

    act(() => {
      result.current.fit();
    });

    expect(result.current.zoom).toBe(1);
    expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('canvas が null の場合、ハンドラは no-op で zoom は既定値 1 を保つ', () => {
    const { result } = renderHook(() => useCanvasViewport({ canvas: null }));

    expect(result.current.zoom).toBe(1);
    expect(() => {
      act(() => {
        result.current.zoomIn();
        result.current.zoomOut();
        result.current.fit();
      });
    }).not.toThrow();
    expect(result.current.zoom).toBe(1);
  });
});
