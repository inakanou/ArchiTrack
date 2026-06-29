/**
 * @fileoverview AnnotationEditor - 2本指検出時の描画中断（isDrawingMode 退避/ブラシ破棄）と座標整合 統合テスト
 *
 * Task 96.2: 描画途中で2本目の指が追加され two-finger-pinch-pan へ遷移する瞬間に
 * touchGestureManager が発火する `onGestureStart` を AnnotationEditor が受け、
 *   - 進行中のフリーハンド描画を中断（isDrawingMode を退避し false 化）
 *   - 進行中ブラシストロークを破棄（PencilBrush._reset）
 *   - ジェスチャー終了（cooldown→idle）で描画モードを復帰
 * すること。さらに canvas ラッパに `touch-action: none` が付与されていること。
 *
 * Boundary: AnnotationEditor (ext)
 *
 * Requirements:
 * - 33.5: 描画操作の途中で2本目の指を追加すると進行中の描画を確定せず中断する
 * - 33.6: 拡大表示中の1本指描画を拡大後の座標系へ正しく反映する（options.scenePoint 使用）
 * - 33.7: マルチタッチ後に1本指描画へ戻ると直前のビュー状態を維持して再開する
 * - 30.1: 2本指タッチで進行中の描画を中断しピンチズーム/パンへ遷移する
 *
 * @requirement site-survey/REQ-33.5
 * @requirement site-survey/REQ-33.6
 * @requirement site-survey/REQ-33.7
 * @requirement site-survey/REQ-30.1
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import type { TouchGestureAttachOptions } from '../../../components/site-surveys/gestures/touchGestureManager';

// act 警告と画像読み込みエラーログを抑制
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (
      message.includes('act(...)') ||
      message.includes('画像の読み込みに失敗しました') ||
      message.includes('注釈データの読み込みに失敗しました')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

// ============================================================================
// vi.hoisted で spy / モックを定義（ホイスト対応）
// ============================================================================

const {
  mockCanvasInstance,
  mockFromURL,
  attachSpy,
  createTouchGestureManagerSpy,
  brushResetSpy,
  gestureState,
} = vi.hoisted(() => {
  const mockCanvasInstance = {
    setDimensions: vi.fn(),
    backgroundImage: null as unknown,
    renderAll: vi.fn(),
    dispose: vi.fn(),
    getZoom: vi.fn(() => 1),
    setZoom: vi.fn(),
    getWidth: vi.fn(() => 800),
    getHeight: vi.fn(() => 600),
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    setViewportTransform: vi.fn(),
    zoomToPoint: vi.fn(),
    getObjects: vi.fn(() => []),
    requestRenderAll: vi.fn(),
    getActiveObject: vi.fn((): unknown => null),
    discardActiveObject: vi.fn(),
    setActiveObject: vi.fn(),
    toJSON: vi.fn(() => ({ version: '6.0.0', objects: [] })),
    loadFromJSON: vi.fn(),
    viewportTransform: [1, 0, 0, 1, 0, 0] as number[],
    selection: false,
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    isDrawingMode: false,
    freeDrawingBrush: null as unknown,
  };

  const mockFabricImageInstance = {
    scaleToWidth: vi.fn(),
    scaleToHeight: vi.fn(),
    set: vi.fn(),
    scale: vi.fn(),
    getScaledWidth: vi.fn(() => 800),
    getScaledHeight: vi.fn(() => 600),
    width: 1000,
    height: 800,
    scaleX: 0.8,
    scaleY: 0.75,
  };

  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  // ブラシストローク破棄（PencilBrush._reset）の呼出検証用 spy。
  const brushResetSpy = vi.fn();

  // touchGestureManager の状態。getTouchState() がこの値を返す。
  // cooldown→idle の復帰タイミングをテストから制御するために mutable とする。
  const gestureState = { value: 'idle' as string };

  const detachSpy = vi.fn();
  // attach は (canvas, getCurrentTool, options?) の 3 引数。options を捕捉する。
  const attachSpy = vi.fn(
    (_canvas: unknown, _getCurrentTool: () => string, _options?: unknown) => detachSpy
  );
  const createTouchGestureManagerSpy = vi.fn(() => ({
    attach: attachSpy,
    getTouchState: vi.fn(() => gestureState.value),
  }));

  return {
    mockCanvasInstance,
    mockFabricImageInstance,
    mockFromURL,
    detachSpy,
    attachSpy,
    createTouchGestureManagerSpy,
    brushResetSpy,
    gestureState,
  };
});

// survey-annotations APIのモック
vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
  saveAnnotation: vi.fn().mockResolvedValue({ id: 'test-annotation-id' }),
  exportAnnotationJson: vi.fn().mockResolvedValue('{}'),
  updateThumbnail: vi.fn().mockResolvedValue({ success: true, thumbnailPath: '/test/path' }),
}));

const mockToast = {
  toasts: [],
  addToast: vi.fn(),
  removeToast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  projectCreated: vi.fn(),
  projectUpdated: vi.fn(),
  projectDeleted: vi.fn(),
  projectStatusChanged: vi.fn(),
  operationFailed: vi.fn(),
};

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

// touchGestureManager のモック（attach の options を捕捉するため）
vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: createTouchGestureManagerSpy,
}));

// annotation-visual-feedback のモック
vi.mock('../../../components/site-surveys/annotation-visual-feedback', () => ({
  configureHandleSizes: vi.fn(),
  applyToolCursor: vi.fn(),
  TOOL_CURSOR_MAP: {
    select: 'default',
    arrow: 'crosshair',
    text: 'text',
    dimension: 'crosshair',
    circle: 'crosshair',
    rectangle: 'crosshair',
    polygon: 'crosshair',
    polyline: 'crosshair',
    freehand: 'crosshair',
  },
}));

// Fabric.js のモック
vi.mock('fabric', () => {
  function MockCanvas() {
    return mockCanvasInstance;
  }

  class MockShape {
    constructor(_a?: unknown, options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    setCoords(): void {}
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockIText extends MockShape {
    isEditing?: boolean;
    enterEditing(): void {
      this.isEditing = true;
    }
    exitEditing(): void {
      this.isEditing = false;
    }
    selectAll(): void {}
  }

  class MockGroup {
    _objects: unknown[];
    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects || [];
      if (options) Object.assign(this, options);
    }
    setCoords(): void {}
    add(obj: unknown): void {
      this._objects.push(obj);
    }
  }

  // PencilBrush: 進行中ストローク破棄 (_reset) を検証可能にする。
  class MockPencilBrush {
    _reset = brushResetSpy;
    color = '';
    width = 0;
    decimate = 0;
    constructor(_canvas?: unknown) {}
  }

  return {
    Canvas: MockCanvas,
    FabricImage: { fromURL: mockFromURL },
    FabricObject: MockShape,
    Path: MockShape,
    Ellipse: MockShape,
    Rect: MockShape,
    Polygon: MockShape,
    Polyline: MockShape,
    Line: MockShape,
    Text: MockShape,
    IText: MockIText,
    Group: MockGroup,
    PencilBrush: MockPencilBrush,
    classRegistry: { setClass: vi.fn(), getClass: vi.fn() },
    util: { enlivenObjects: vi.fn(() => Promise.resolve([])) },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

/** attach に注入された onGestureStart を取り出す。 */
const getInjectedOnGestureStart = (): (() => void) => {
  const calls = attachSpy.mock.calls;
  const lastCall = calls[calls.length - 1];
  expect(lastCall).toBeDefined();
  const options = lastCall![2] as TouchGestureAttachOptions | undefined;
  expect(options).toBeDefined();
  expect(typeof options!.onGestureStart).toBe('function');
  return options!.onGestureStart as () => void;
};

describe('AnnotationEditor - 2本指検出時の描画中断と座標整合 (Task 96.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gestureState.value = 'idle';
    mockCanvasInstance.isDrawingMode = false;
    mockCanvasInstance.freeDrawingBrush = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('canvas ラッパの touch-action (Req 33.5, 30.1)', () => {
    it('canvas ラッパに touch-action: none が付与される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      const wrapper = await screen.findByTestId('annotation-canvas-wrapper');
      expect(wrapper.style.touchAction).toBe('none');
    });
  });

  describe('onGestureStart の配線 (Req 33.5, 30.1)', () => {
    it('attach の options に onGestureStart が渡される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(attachSpy).toHaveBeenCalled();
      });

      const onGestureStart = getInjectedOnGestureStart();
      expect(typeof onGestureStart).toBe('function');
    });
  });

  describe('2本目検出での描画中断 (Req 33.5, 30.1)', () => {
    it('onGestureStart 発火で isDrawingMode が false 化され、進行中ブラシパスが破棄される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      // 画像読み込み完了（ZoomControls 出現＝!isLoading）を待つ
      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });

      // フリーハンドツールへ切替 → isDrawingMode=true, freeDrawingBrush 設定
      fireEvent.click(screen.getByRole('button', { name: 'フリーハンド' }));
      expect(mockCanvasInstance.isDrawingMode).toBe(true);
      expect(mockCanvasInstance.freeDrawingBrush).not.toBeNull();

      const onGestureStart = getInjectedOnGestureStart();

      // 2本目の指追加によりジェスチャー進行中（idle ではない）
      gestureState.value = 'two-finger-pinch-pan';
      act(() => {
        onGestureStart();
      });

      // 描画モードが退避・停止され、進行中ブラシストロークが破棄される
      expect(mockCanvasInstance.isDrawingMode).toBe(false);
      expect(brushResetSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('ジェスチャー終了での描画モード復帰 (Req 33.7)', () => {
    it('cooldown→idle 復帰でフリーハンド時の isDrawingMode が元に戻る', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'フリーハンド' }));
      expect(mockCanvasInstance.isDrawingMode).toBe(true);

      const onGestureStart = getInjectedOnGestureStart();

      // ジェスチャー進行中: 描画中断
      gestureState.value = 'two-finger-pinch-pan';
      act(() => {
        onGestureStart();
      });
      expect(mockCanvasInstance.isDrawingMode).toBe(false);

      // 全指離脱後 cooldown→idle に復帰 → ポーリングが描画モードを復元する
      gestureState.value = 'idle';
      await waitFor(() => {
        expect(mockCanvasInstance.isDrawingMode).toBe(true);
      });
    });

    it('idle 復帰時に select ツールへ切替済みなら描画モードは復元しない', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'フリーハンド' }));
      expect(mockCanvasInstance.isDrawingMode).toBe(true);

      const onGestureStart = getInjectedOnGestureStart();

      gestureState.value = 'two-finger-pinch-pan';
      act(() => {
        onGestureStart();
      });
      expect(mockCanvasInstance.isDrawingMode).toBe(false);

      // ジェスチャー中に選択ツールへ切替（描画モードは選択ツールでは無効）
      fireEvent.click(screen.getByRole('button', { name: '選択' }));
      expect(mockCanvasInstance.isDrawingMode).toBe(false);

      // idle 復帰してもフリーハンドではないため描画モードは復元されない
      gestureState.value = 'idle';
      // ポーリング間隔（150ms）を十分に超えて待機しても false のまま
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(mockCanvasInstance.isDrawingMode).toBe(false);
    });
  });
});
