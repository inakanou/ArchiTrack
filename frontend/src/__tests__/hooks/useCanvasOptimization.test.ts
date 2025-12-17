/**
 * @fileoverview Canvas描画最適化フックのテスト
 *
 * Task 23.2: Canvas描画最適化を実装する
 *
 * - オブジェクトキャッシングの有効化
 * - 不要な再描画の抑制
 * - 大量オブジェクト時の描画パフォーマンス確保
 *
 * Requirements: 14.2 - 注釈の描画・編集操作を60fps以上で応答する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useCanvasOptimization,
  CanvasOptimizationConfig,
  DEFAULT_OPTIMIZATION_CONFIG,
  applyObjectCaching,
  disableObjectCaching,
  batchRenderObjects,
  optimizeCanvasForManyObjects,
  cleanupCanvasOptimization,
} from '../../hooks/useCanvasOptimization';
import { renderHook, act } from '@testing-library/react';

// Fabric.jsのモック
interface MockFabricObject {
  objectCaching: boolean;
  statefullCache: boolean;
  dirty: boolean;
  setCoords: () => void;
  set: (props: Record<string, unknown>) => void;
}

interface MockCanvas {
  renderOnAddRemove: boolean;
  skipTargetFind: boolean;
  enableRetinaScaling: boolean;
  renderAll: () => void;
  requestRenderAll: () => void;
  add: (...objects: MockFabricObject[]) => void;
  getObjects: () => MockFabricObject[];
  off: (event: string) => void;
  on: (event: string, handler: () => void) => void;
  dispose: () => void;
}

// モックFabricオブジェクトを作成するヘルパー
function createMockFabricObject(): MockFabricObject {
  return {
    objectCaching: false,
    statefullCache: false,
    dirty: false,
    setCoords: vi.fn(),
    set: vi.fn(function (this: MockFabricObject, props: Record<string, unknown>) {
      Object.assign(this, props);
    }),
  };
}

// モックCanvasを作成するヘルパー
function createMockCanvas(objects: MockFabricObject[] = []): MockCanvas {
  return {
    renderOnAddRemove: true,
    skipTargetFind: false,
    enableRetinaScaling: true,
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
    add: vi.fn(),
    getObjects: vi.fn(() => objects),
    off: vi.fn(),
    on: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('useCanvasOptimization', () => {
  describe('DEFAULT_OPTIMIZATION_CONFIG', () => {
    it('デフォルト設定が正しい値を持つ', () => {
      expect(DEFAULT_OPTIMIZATION_CONFIG).toEqual({
        enableObjectCaching: true,
        enableStatefulCache: false,
        batchRenderThreshold: 50,
        renderDebounceMs: 16, // ~60fps
        disableRetinaOnManyObjects: true,
        manyObjectsThreshold: 100,
      });
    });
  });

  describe('applyObjectCaching', () => {
    it('オブジェクトにキャッシングを有効化する', () => {
      const obj = createMockFabricObject();

      applyObjectCaching(obj as unknown as Parameters<typeof applyObjectCaching>[0]);

      expect(obj.objectCaching).toBe(true);
      expect(obj.statefullCache).toBe(false);
      expect(obj.dirty).toBe(true);
    });

    it('カスタム設定でキャッシングを適用する', () => {
      const obj = createMockFabricObject();
      const config: Partial<CanvasOptimizationConfig> = {
        enableStatefulCache: true,
      };

      applyObjectCaching(obj as unknown as Parameters<typeof applyObjectCaching>[0], config);

      expect(obj.objectCaching).toBe(true);
      expect(obj.statefullCache).toBe(true);
    });

    it('キャッシングが無効の設定ではobjectCachingをfalseにする', () => {
      const obj = createMockFabricObject();
      const config: Partial<CanvasOptimizationConfig> = {
        enableObjectCaching: false,
      };

      applyObjectCaching(obj as unknown as Parameters<typeof applyObjectCaching>[0], config);

      expect(obj.objectCaching).toBe(false);
    });
  });

  describe('disableObjectCaching', () => {
    it('オブジェクトのキャッシングを無効化する', () => {
      const obj = createMockFabricObject();
      obj.objectCaching = true;
      obj.statefullCache = true;

      disableObjectCaching(obj as unknown as Parameters<typeof disableObjectCaching>[0]);

      expect(obj.objectCaching).toBe(false);
      expect(obj.statefullCache).toBe(false);
      expect(obj.dirty).toBe(true);
    });
  });

  describe('batchRenderObjects', () => {
    it('複数オブジェクトをバッチで追加し、最後に1回だけrenderAllを呼ぶ', () => {
      const canvas = createMockCanvas();
      const objects = [
        createMockFabricObject(),
        createMockFabricObject(),
        createMockFabricObject(),
      ];

      batchRenderObjects(
        canvas as unknown as Parameters<typeof batchRenderObjects>[0],
        objects as unknown as Parameters<typeof batchRenderObjects>[1]
      );

      // renderOnAddRemoveが一時的にfalseになる
      expect(canvas.add).toHaveBeenCalledTimes(objects.length);
      // 最後に1回だけrenderAll
      expect(canvas.renderAll).toHaveBeenCalledTimes(1);
    });

    it('空の配列では何もしない', () => {
      const canvas = createMockCanvas();

      batchRenderObjects(canvas as unknown as Parameters<typeof batchRenderObjects>[0], []);

      expect(canvas.add).not.toHaveBeenCalled();
      expect(canvas.renderAll).not.toHaveBeenCalled();
    });

    it('各オブジェクトにキャッシング設定を適用する', () => {
      const canvas = createMockCanvas();
      const objects = [createMockFabricObject(), createMockFabricObject()];

      batchRenderObjects(
        canvas as unknown as Parameters<typeof batchRenderObjects>[0],
        objects as unknown as Parameters<typeof batchRenderObjects>[1],
        { enableObjectCaching: true }
      );

      objects.forEach((obj) => {
        expect(obj.objectCaching).toBe(true);
      });
    });
  });

  describe('optimizeCanvasForManyObjects', () => {
    it('大量オブジェクト時にCanvas設定を最適化する', () => {
      const objects = Array.from({ length: 150 }, () => createMockFabricObject());
      const canvas = createMockCanvas(objects);

      const cleanup = optimizeCanvasForManyObjects(
        canvas as unknown as Parameters<typeof optimizeCanvasForManyObjects>[0]
      );

      // 最適化設定が適用される
      expect(canvas.renderOnAddRemove).toBe(false);
      expect(canvas.skipTargetFind).toBe(true);
      // enableRetinaScalingがfalseになる（大量オブジェクト時）
      expect(canvas.enableRetinaScaling).toBe(false);

      // クリーンアップ関数を返す
      expect(typeof cleanup).toBe('function');
    });

    it('オブジェクト数が閾値以下の場合は最適化しない', () => {
      const objects = Array.from({ length: 50 }, () => createMockFabricObject());
      const canvas = createMockCanvas(objects);

      const cleanup = optimizeCanvasForManyObjects(
        canvas as unknown as Parameters<typeof optimizeCanvasForManyObjects>[0]
      );

      // 設定は変更されない
      expect(canvas.renderOnAddRemove).toBe(true);
      expect(canvas.skipTargetFind).toBe(false);

      // クリーンアップ関数は返す（何もしない）
      expect(typeof cleanup).toBe('function');
    });

    it('カスタム閾値を使用できる', () => {
      const objects = Array.from({ length: 30 }, () => createMockFabricObject());
      const canvas = createMockCanvas(objects);
      const config: Partial<CanvasOptimizationConfig> = {
        manyObjectsThreshold: 20,
      };

      optimizeCanvasForManyObjects(
        canvas as unknown as Parameters<typeof optimizeCanvasForManyObjects>[0],
        config
      );

      // 30 > 20 なので最適化が適用される
      expect(canvas.renderOnAddRemove).toBe(false);
    });

    it('クリーンアップで元の設定に戻す', () => {
      const objects = Array.from({ length: 150 }, () => createMockFabricObject());
      const canvas = createMockCanvas(objects);

      const cleanup = optimizeCanvasForManyObjects(
        canvas as unknown as Parameters<typeof optimizeCanvasForManyObjects>[0]
      );

      // 最適化適用
      expect(canvas.renderOnAddRemove).toBe(false);

      // クリーンアップ実行
      cleanup();

      // 元の設定に戻る
      expect(canvas.renderOnAddRemove).toBe(true);
      expect(canvas.skipTargetFind).toBe(false);
      expect(canvas.enableRetinaScaling).toBe(true);
    });
  });

  describe('cleanupCanvasOptimization', () => {
    it('Canvas最適化のクリーンアップを行う', () => {
      const objects = Array.from({ length: 5 }, () => createMockFabricObject());
      const canvas = createMockCanvas(objects);

      cleanupCanvasOptimization(
        canvas as unknown as Parameters<typeof cleanupCanvasOptimization>[0]
      );

      // 全オブジェクトのキャッシングが無効化される
      objects.forEach((obj) => {
        expect(obj.objectCaching).toBe(false);
      });
    });
  });

  describe('useCanvasOptimization hook', () => {
    let mockCanvas: MockCanvas;

    beforeEach(() => {
      mockCanvas = createMockCanvas();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Canvasが設定されるまでは何もしない', () => {
      const { result } = renderHook(() => useCanvasOptimization(null));

      expect(result.current.optimizedRender).toBeDefined();
      expect(result.current.applyOptimization).toBeDefined();
    });

    it('optimizedRenderがdebounceされたrenderAllを呼ぶ', async () => {
      const { result } = renderHook(() =>
        useCanvasOptimization(mockCanvas as unknown as Parameters<typeof useCanvasOptimization>[0])
      );

      act(() => {
        result.current.optimizedRender();
        result.current.optimizedRender();
        result.current.optimizedRender();
      });

      // debounce中は呼ばれない
      expect(mockCanvas.requestRenderAll).not.toHaveBeenCalled();

      // タイマーを進める
      act(() => {
        vi.advanceTimersByTime(DEFAULT_OPTIMIZATION_CONFIG.renderDebounceMs);
      });

      // 1回だけ呼ばれる
      expect(mockCanvas.requestRenderAll).toHaveBeenCalledTimes(1);
    });

    it('applyOptimizationがオブジェクトにキャッシング設定を適用する', () => {
      const obj = createMockFabricObject();
      const { result } = renderHook(() =>
        useCanvasOptimization(mockCanvas as unknown as Parameters<typeof useCanvasOptimization>[0])
      );

      act(() => {
        result.current.applyOptimization(
          obj as unknown as Parameters<typeof result.current.applyOptimization>[0]
        );
      });

      expect(obj.objectCaching).toBe(true);
    });

    it('カスタム設定を使用できる', () => {
      const customConfig: Partial<CanvasOptimizationConfig> = {
        renderDebounceMs: 32, // 30fps
        enableObjectCaching: false,
      };

      const obj = createMockFabricObject();
      const { result } = renderHook(() =>
        useCanvasOptimization(
          mockCanvas as unknown as Parameters<typeof useCanvasOptimization>[0],
          customConfig
        )
      );

      act(() => {
        result.current.applyOptimization(
          obj as unknown as Parameters<typeof result.current.applyOptimization>[0]
        );
      });

      // カスタム設定が適用される
      expect(obj.objectCaching).toBe(false);
    });

    it('unmount時にクリーンアップが実行される', () => {
      const objects = [createMockFabricObject()];
      mockCanvas = createMockCanvas(objects);

      const { unmount } = renderHook(() =>
        useCanvasOptimization(mockCanvas as unknown as Parameters<typeof useCanvasOptimization>[0])
      );

      unmount();

      // クリーンアップが実行される（キャッシングが無効化される）
      objects.forEach((obj) => {
        expect(obj.objectCaching).toBe(false);
      });
    });
  });

  describe('パフォーマンス要件', () => {
    it('60fps（16ms）以下のdebounce時間がデフォルト', () => {
      // 60fps = 1000ms / 60 ≈ 16.67ms
      expect(DEFAULT_OPTIMIZATION_CONFIG.renderDebounceMs).toBeLessThanOrEqual(17);
    });

    it('大量オブジェクト（100件以上）で最適化が適用される', () => {
      expect(DEFAULT_OPTIMIZATION_CONFIG.manyObjectsThreshold).toBe(100);
    });

    it('バッチ処理閾値が50件', () => {
      expect(DEFAULT_OPTIMIZATION_CONFIG.batchRenderThreshold).toBe(50);
    });
  });
});
