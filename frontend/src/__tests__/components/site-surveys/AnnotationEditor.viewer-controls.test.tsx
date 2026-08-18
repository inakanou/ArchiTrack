/**
 * @fileoverview AnnotationEditor - 閲覧モードの表示操作（ズーム/回転/パン/表示状態共有）
 *
 * Task 115.83: 要件5（画像ビューア）の担当部品を実態（`SiteSurveyImageViewerPage` +
 * `AnnotationEditor`）へ付け替えるにあたり、閲覧モード（`readOnly`）に欠けていた
 * 要件5.2 / 5.3 / 5.4 / 5.6 の機能を本経路へ実装する。
 *
 * 本ファイルが検証するのは「閲覧のみの状態で表示操作の手段が実在し、実際に効くこと」であり、
 * 編集モード側の検証（Req 34）は `AnnotationEditor.viewport.test.tsx` が担う。
 *
 * Requirements:
 * - 5.2: ズームイン/ズームアウト操作で画像を拡大/縮小表示する
 * - 5.3: 回転ボタンを押すと画像を90度単位で回転表示する
 * - 5.4: パン操作で拡大時の表示領域を移動する
 * - 5.6: 画像の表示状態（ズーム・回転・位置）を注釈編集モードと共有する
 *
 * Boundary: 閲覧時の表示操作の結線
 *
 * @requirement site-survey/REQ-5.2
 * @requirement site-survey/REQ-5.3
 * @requirement site-survey/REQ-5.4
 * @requirement site-survey/REQ-5.6
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const { mockCanvasInstance, mockFabricImageInstance, mockFromURL, resetViewport } = vi.hoisted(
  () => {
    const state = { zoom: 1 };

    const mockFabricImageInstance = {
      scaleToWidth: vi.fn(),
      scaleToHeight: vi.fn(),
      set: vi.fn((options: Record<string, unknown>) => {
        Object.assign(mockFabricImageInstance, options);
      }),
      scale: vi.fn(),
      getScaledWidth: vi.fn(() => 800),
      getScaledHeight: vi.fn(() => 600),
      width: 1000,
      height: 800,
      scaleX: 0.8,
      scaleY: 0.75,
      angle: 0,
    };

    // touchGestureManager は実装をモックせず本物を動かす。attach 先の要素は DOM に
    // 挿入しない独立要素とし、本ファイルが検証する単一ポインタのパン（コンテナ結線）と
    // 経路が混ざらないようにする。
    const gestureElement = globalThis.document?.createElement('canvas');

    const mockCanvasInstance = {
      getElement: vi.fn(() => gestureElement),
      setDimensions: vi.fn(),
      backgroundImage: null as unknown,
      renderAll: vi.fn(),
      dispose: vi.fn(),
      getZoom: vi.fn(() => state.zoom),
      setZoom: vi.fn(),
      getWidth: vi.fn(() => 800),
      getHeight: vi.fn(() => 600),
      add: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      fire: vi.fn(),
      calcOffset: vi.fn(),
      setViewportTransform: vi.fn((vpt: number[]) => {
        mockCanvasInstance.viewportTransform = vpt;
        state.zoom = vpt[0]!;
      }),
      zoomToPoint: vi.fn((_point: { x: number; y: number }, z: number) => {
        state.zoom = z;
        mockCanvasInstance.viewportTransform = [
          z,
          0,
          0,
          z,
          mockCanvasInstance.viewportTransform[4]!,
          mockCanvasInstance.viewportTransform[5]!,
        ];
      }),
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

    const resetViewport = (): void => {
      state.zoom = 1;
      mockCanvasInstance.viewportTransform = [1, 0, 0, 1, 0, 0];
      mockFabricImageInstance.angle = 0;
    };

    const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

    return { mockCanvasInstance, mockFabricImageInstance, mockFromURL, resetViewport };
  }
);

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
  saveAnnotation: vi.fn().mockResolvedValue({ id: 'test-annotation-id' }),
  exportAnnotationJson: vi.fn().mockResolvedValue('{}'),
  updateAnnotatedThumbnail: vi.fn().mockResolvedValue({
    success: true,
    annotatedThumbnailPath: 'annotated-thumbnails/test.jpg',
    annotatedThumbnailUrl: null,
  }),
  deleteAnnotatedThumbnail: vi.fn().mockResolvedValue({
    success: true,
    annotatedThumbnailPath: null,
    annotatedThumbnailUrl: null,
  }),
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

  class MockPencilBrush {
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

/** 閲覧モードで描画され、canvas の準備完了（isLoading=false）を待つ。 */
const renderViewer = async (
  props: Partial<React.ComponentProps<typeof AnnotationEditor>> = {}
): Promise<void> => {
  render(<AnnotationEditor {...defaultProps} readOnly {...props} />);
  await waitFor(() => {
    expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
  });
};

describe('AnnotationEditor - 閲覧モードの表示操作 (Task 115.83)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetViewport();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('ズーム操作手段 (Req 5.2)', () => {
    it('閲覧のみの状態でもズーム操作コントロールが表示される', async () => {
      await renderViewer();

      expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ズームイン' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ズームアウト' })).toBeInTheDocument();
      // 編集モードの道具帯は閲覧では出さない（Req 9.2 の非回帰）
      expect(screen.queryByRole('toolbar', { name: /注釈ツール/ })).not.toBeInTheDocument();
    });

    it('閲覧のみの状態でズームインすると画像が拡大され倍率表示が追従する', async () => {
      const user = userEvent.setup();
      await renderViewer();

      await user.click(screen.getByRole('button', { name: 'ズームイン' }));

      expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalledWith(
        { x: 400, y: 300 },
        expect.closeTo(1.1, 5)
      );
      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('110%');
      });
    });

    it('閲覧のみの状態でズームアウトすると画像が縮小される', async () => {
      const user = userEvent.setup();
      await renderViewer();

      await user.click(screen.getByRole('button', { name: 'ズームアウト' }));

      expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalledWith(
        { x: 400, y: 300 },
        expect.closeTo(0.9, 5)
      );
      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('90%');
      });
    });
  });

  describe('回転操作手段 (Req 5.3)', () => {
    it('閲覧のみの状態で回転ボタンを押すと背景画像が90度回転する', async () => {
      const user = userEvent.setup();
      await renderViewer();

      const rotateButton = screen.getByRole('button', { name: '画像を90度回転' });
      await user.click(rotateButton);

      expect(mockFabricImageInstance.angle).toBe(90);

      await user.click(rotateButton);
      expect(mockFabricImageInstance.angle).toBe(180);
    });
  });

  describe('パン操作 (Req 5.4)', () => {
    it('拡大中は単一ポインタのドラッグで表示領域が移動する', async () => {
      const user = userEvent.setup();
      await renderViewer();

      // 先に拡大してパンを有効化する（等倍では抑止されるため）
      await user.click(screen.getByRole('button', { name: 'ズームイン' }));
      await user.click(screen.getByRole('button', { name: 'ズームイン' }));
      await waitFor(() => {
        expect(screen.getByTestId('zoom-badge')).toHaveTextContent('120%');
      });
      mockCanvasInstance.setViewportTransform.mockClear();

      const surface = screen.getByTestId('annotation-editor-container');
      fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(surface, { pointerId: 1, isPrimary: true, clientX: 160, clientY: 170 });
      fireEvent.pointerUp(surface, { pointerId: 1, isPrimary: true, clientX: 160, clientY: 170 });

      const moved = mockCanvasInstance.setViewportTransform.mock.calls.some(
        (call) => call[0][4] !== 0 || call[0][5] !== 0
      );
      expect(moved).toBe(true);
    });

    it('等倍表示中は単一ポインタのドラッグで表示領域を移動しない (Req 34.7 と整合)', async () => {
      await renderViewer();
      mockCanvasInstance.setViewportTransform.mockClear();

      const surface = screen.getByTestId('annotation-editor-container');
      fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(surface, { pointerId: 1, isPrimary: true, clientX: 160, clientY: 170 });
      fireEvent.pointerUp(surface, { pointerId: 1, isPrimary: true, clientX: 160, clientY: 170 });

      expect(mockCanvasInstance.setViewportTransform).not.toHaveBeenCalled();
    });
  });

  describe('表示状態の共有 (Req 5.6)', () => {
    it('ズーム・回転・パンの変化を onViewStateChange で通知する', async () => {
      const user = userEvent.setup();
      const onViewStateChange = vi.fn();
      await renderViewer({ onViewStateChange });

      await user.click(screen.getByRole('button', { name: 'ズームイン' }));
      await waitFor(() => {
        expect(onViewStateChange).toHaveBeenCalledWith(
          expect.objectContaining({ zoom: expect.closeTo(1.1, 5) })
        );
      });

      onViewStateChange.mockClear();
      await user.click(screen.getByRole('button', { name: '画像を90度回転' }));
      await waitFor(() => {
        expect(onViewStateChange).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
      });
    });

    it('initialRotation を初期表示の回転として適用する', async () => {
      await renderViewer({ initialRotation: 270 });

      await waitFor(() => {
        expect(mockFabricImageInstance.angle).toBe(270);
      });
    });

    it('initialZoom / initialPan を絶対値として復元する', async () => {
      render(
        <AnnotationEditor
          {...defaultProps}
          readOnly
          initialZoom={2}
          initialPan={{ x: -120, y: -80 }}
        />
      );

      await waitFor(() => {
        expect(mockCanvasInstance.zoomToPoint).toHaveBeenCalledWith({ x: 400, y: 300 }, 2);
      });

      await waitFor(() => {
        const restored = mockCanvasInstance.setViewportTransform.mock.calls.some(
          (call) => call[0][4] === -120 && call[0][5] === -80
        );
        expect(restored).toBe(true);
      });
    });
  });
});
