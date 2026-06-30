/**
 * @fileoverview AnnotationEditor - 選択ツール時のタッチ選択・移動の確実化（拡大中追従）テスト
 *
 * Task 96.4 (Req 33.11, 33.12): 選択ツール選択中に、既存注釈がタッチでタップ選択でき、
 * ドラッグで移動でき、拡大表示中（viewportTransform 適用時）も指の移動へ追従することを
 * 確実化する。AnnotationEditor 境界での観測可能な責務を検証する:
 *
 *   - 選択ツール時、復元された既存注釈が `selectable`/`evented` 有効、かつ `canvas.selection` 有効
 *     （Fabric のタップ選択 / object:moving 移動へ委譲できる土台。Req 33.11/33.12）
 *   - 描画ツール時は注釈が `selectable=false`/`evented=false`、`canvas.selection=false`
 *     （Req 17「描画ツール使用中のオブジェクト選択防止」維持）
 *   - 選択ツールへ戻すと再び選択可能になる（往復）
 *   - 拡大状態（zoom>1, viewportTransform 適用）でも選択フラグが維持され、
 *     かつ選択ツールの 1 本指ドラッグが AnnotationEditor の描画ロジックを誘発しない
 *     （= Fabric の object:moving（scenePoint, viewport 考慮）へ委譲し、描画として誤発火しない。
 *       Req 33.12 / 33.13 と整合）
 *   - object:moving リスナが配線されており、移動経路が AnnotationEditor によって阻害されない
 *
 * 責務分岐表（design.md「1本指ジェスチャーの責務分岐表」）:
 *   選択ツール+1本タップ→選択 / +1本ドラッグ→移動（拡大中も追従） / パンは2本指専用。
 *
 * Boundary: AnnotationEditor
 *
 * @requirement site-survey/REQ-33.11
 * @requirement site-survey/REQ-33.12
 * @requirement site-survey/REQ-17
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

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
// 復元注釈オブジェクトのモック（selectable/evented の設定を記録する）
// ============================================================================

interface MockAnnotationFlags {
  selectable?: boolean;
  evented?: boolean;
  [key: string]: unknown;
}

class MockAnnotationObject {
  type: string;
  left = 100;
  top = 100;
  scaleX = 1;
  scaleY = 1;
  strokeWidth = 2;
  selectable?: boolean;
  evented?: boolean;
  constructor(type: string) {
    this.type = type;
  }
  set(options: MockAnnotationFlags | string, value?: unknown): this {
    if (typeof options === 'string') {
      (this as Record<string, unknown>)[options] = value;
    } else {
      Object.assign(this, options);
    }
    return this;
  }
  toObject(): Record<string, unknown> {
    return { type: this.type };
  }
}

// ============================================================================
// vi.hoisted で spy / モックを定義
// ============================================================================

const {
  mockCanvasInstance,
  mockFromURL,
  createTouchGestureManagerSpy,
  configureHandleSizesSpy,
  restoredObjects,
  getAnnotationMock,
} = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (...args: unknown[]) => void>();

  // getAnnotation は既存注釈データを返す（loadImage の復元経路を走らせる）。
  const getAnnotationMock = vi.fn().mockResolvedValue({
    data: {
      version: '1.0',
      objects: [{ type: 'rect' }, { type: 'arrow' }],
      canvasWidth: 800,
      canvasHeight: 600,
      imageRotation: 0,
    },
  });

  // loadImage が復元する既存注釈（enlivenObjects の戻り値）。
  class HoistedAnnotationObject {
    type: string;
    left = 100;
    top = 100;
    scaleX = 1;
    scaleY = 1;
    strokeWidth = 2;
    selectable?: boolean;
    evented?: boolean;
    constructor(type: string) {
      this.type = type;
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
      }
      return this;
    }
    toObject(): Record<string, unknown> {
      return { type: this.type };
    }
  }

  const restoredObjects = [
    new HoistedAnnotationObject('rect'),
    new HoistedAnnotationObject('arrow'),
  ];

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

  // canvas.add で積まれたオブジェクトを保持し、getObjects で返す（背景画像は除外）。
  const addedObjects: unknown[] = [];

  const mockCanvasInstance = {
    setDimensions: vi.fn(),
    backgroundImage: null as unknown,
    renderAll: vi.fn(),
    dispose: vi.fn(),
    getZoom: vi.fn(() => 1),
    setZoom: vi.fn(),
    getWidth: vi.fn(() => 800),
    getHeight: vi.fn(() => 600),
    add: vi.fn((obj: unknown) => {
      addedObjects.push(obj);
    }),
    remove: vi.fn((obj: unknown) => {
      const idx = addedObjects.indexOf(obj);
      if (idx >= 0) addedObjects.splice(idx, 1);
    }),
    clear: vi.fn(),
    on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
      registeredHandlers.set(eventName, handler);
    }),
    off: vi.fn((eventName: string) => {
      registeredHandlers.delete(eventName);
    }),
    setViewportTransform: vi.fn(),
    zoomToPoint: vi.fn(),
    findTarget: vi.fn(() => ({ target: undefined, subTargets: [], currentSubTargets: [] })),
    getObjects: vi.fn(() => addedObjects.filter((o) => o !== mockFabricImageInstance)),
    requestRenderAll: vi.fn(),
    getActiveObject: vi.fn((): unknown => null),
    discardActiveObject: vi.fn(),
    setActiveObject: vi.fn(),
    toJSON: vi.fn(() => ({ version: '6.0.0', objects: [] })),
    loadFromJSON: vi.fn(),
    viewportTransform: [1, 0, 0, 1, 0, 0],
    selection: false,
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    isDrawingMode: false,
    freeDrawingBrush: null as unknown,
    skipTargetFind: false,
    setCursor: vi.fn(),
    defaultCursor: 'default',
    __getHandler: (eventName: string): ((...args: unknown[]) => void) | undefined =>
      registeredHandlers.get(eventName),
    __clearHandlers: () => {
      registeredHandlers.clear();
    },
    __resetObjects: () => {
      addedObjects.length = 0;
    },
  };

  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  const detachSpy = vi.fn();
  const attachSpy = vi.fn(
    (_canvas: unknown, _getCurrentTool: () => string, _opts?: unknown) => detachSpy
  );
  const createTouchGestureManagerSpy = vi.fn(() => ({
    attach: attachSpy,
    getTouchState: vi.fn(() => 'idle'),
  }));

  const configureHandleSizesSpy = vi.fn();

  return {
    mockCanvasInstance,
    mockFromURL,
    createTouchGestureManagerSpy,
    configureHandleSizesSpy,
    restoredObjects,
    mockFabricImageInstance,
    getAnnotationMock,
  };
});

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: getAnnotationMock,
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

vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: createTouchGestureManagerSpy,
}));

vi.mock('../../../components/site-surveys/annotation-visual-feedback', () => ({
  configureHandleSizes: configureHandleSizesSpy,
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
  function MockCanvas(this: Record<string, unknown>) {
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
  }

  class MockPencilBrush {
    constructor(_canvas?: unknown) {}
  }

  class MockFabricObject {
    constructor(options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
  }

  const mockClassRegistry = {
    setClass: vi.fn(),
    getClass: vi.fn(),
  };

  return {
    Canvas: MockCanvas,
    FabricImage: {
      fromURL: mockFromURL,
    },
    FabricObject: MockFabricObject,
    Path: MockShape,
    Ellipse: MockShape,
    Rect: MockShape,
    Polygon: MockShape,
    Polyline: MockShape,
    Line: MockShape,
    Text: MockShape,
    IText: MockShape,
    Group: MockShape,
    PencilBrush: MockPencilBrush,
    classRegistry: mockClassRegistry,
    util: {
      // 復元する既存注釈をそのまま返す（loadImage が selectable/evented を設定後 canvas.add する）。
      enlivenObjects: vi.fn(() => Promise.resolve(restoredObjects)),
    },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

type HandlerAccess = {
  __getHandler: (eventName: string) => ((...args: unknown[]) => void) | undefined;
  __clearHandlers: () => void;
  __resetObjects: () => void;
};

const getRegisteredHandler = (eventName: string): ((...args: unknown[]) => void) | undefined => {
  return (mockCanvasInstance as unknown as HandlerAccess).__getHandler(eventName);
};

// 復元注釈の selectable/evented を観測するため、現在 getObjects が返すオブジェクト群を取得。
const getRestoredObjects = (): MockAnnotationObject[] =>
  mockCanvasInstance.getObjects() as unknown as MockAnnotationObject[];

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationEditor - 選択ツール時のタッチ選択・移動の確実化 (Task 96.4, Req 33.11/33.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCanvasInstance as unknown as HandlerAccess).__clearHandlers();
    (mockCanvasInstance as unknown as HandlerAccess).__resetObjects();
    // 復元注釈のフラグ汚染をリセット
    restoredObjects.forEach((o) => {
      delete (o as MockAnnotationObject).selectable;
      delete (o as MockAnnotationObject).evented;
    });
    mockCanvasInstance.selection = false;
    mockCanvasInstance.viewportTransform = [1, 0, 0, 1, 0, 0];
    (mockCanvasInstance.getZoom as ReturnType<typeof vi.fn>).mockReturnValue(1);
    getAnnotationMock.mockResolvedValue({
      data: {
        version: '1.0',
        objects: [{ type: 'rect' }, { type: 'arrow' }],
        canvasWidth: 800,
        canvasHeight: 600,
        imageRotation: 0,
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  /**
   * 復元後の既存注釈が選択可能になるまで待機するヘルパ。
   */
  const renderAndWaitForRestore = async (): Promise<void> => {
    render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      const objs = getRestoredObjects();
      expect(objs.length).toBe(2);
      expect(objs[0]?.selectable).toBe(true);
    });
  };

  describe('Req 33.11: 選択ツール時の選択土台（selectable/evented + canvas.selection）', () => {
    it('初回ロード時、選択ツールでは復元注釈が selectable/evented かつ canvas.selection が有効', async () => {
      await renderAndWaitForRestore();

      const objs = getRestoredObjects();
      for (const obj of objs) {
        expect(obj.selectable).toBe(true);
        expect(obj.evented).toBe(true);
      }
      // 選択ツールでは Fabric の選択（マーキー/委譲）を有効化していること。
      expect(mockCanvasInstance.selection).toBe(true);
    });

    it('object:moving リスナが配線されており、移動経路が AnnotationEditor に阻害されない (Req 33.12)', async () => {
      await renderAndWaitForRestore();

      // Fabric が拡大中の移動を object:moving（scenePoint=viewport 考慮）で処理できるよう、
      // AnnotationEditor 側でリスナが配線されていること。
      expect(getRegisteredHandler('object:moving')).toBeDefined();
    });
  });

  describe('Req 17: 描画ツール時は選択を抑止する', () => {
    it('描画ツールへ切替えると復元注釈が selectable=false/evented=false、canvas.selection=false', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      await renderAndWaitForRestore();

      const arrowButton = screen.getByRole('button', { name: '矢印' });
      await user.click(arrowButton);

      await waitFor(() => {
        expect(arrowButton).toHaveAttribute('aria-pressed', 'true');
      });

      const objs = getRestoredObjects();
      for (const obj of objs) {
        expect(obj.selectable).toBe(false);
        expect(obj.evented).toBe(false);
      }
      expect(mockCanvasInstance.selection).toBe(false);
    });

    it('描画ツール→選択ツールへ戻すと再び selectable/evented + canvas.selection が有効になる', async () => {
      const user = (await import('@testing-library/user-event')).default.setup();
      await renderAndWaitForRestore();

      const arrowButton = screen.getByRole('button', { name: '矢印' });
      await user.click(arrowButton);
      await waitFor(() => {
        expect(mockCanvasInstance.selection).toBe(false);
      });

      const selectButton = screen.getByRole('button', { name: '選択' });
      await user.click(selectButton);

      await waitFor(() => {
        expect(mockCanvasInstance.selection).toBe(true);
      });
      const objs = getRestoredObjects();
      for (const obj of objs) {
        expect(obj.selectable).toBe(true);
        expect(obj.evented).toBe(true);
      }
    });
  });

  describe('Req 33.12: 拡大表示中（zoom>1）の選択・移動が指に追従（描画として誤発火しない）', () => {
    it('拡大状態でも選択ツールの注釈は選択可能なまま維持される', async () => {
      await renderAndWaitForRestore();

      // 拡大状態をエミュレート（viewportTransform = 2倍、ズーム 2）。
      mockCanvasInstance.viewportTransform = [2, 0, 0, 2, -100, -50];
      (mockCanvasInstance.getZoom as ReturnType<typeof vi.fn>).mockReturnValue(2);

      const objs = getRestoredObjects();
      for (const obj of objs) {
        expect(obj.selectable).toBe(true);
        expect(obj.evented).toBe(true);
      }
      expect(mockCanvasInstance.selection).toBe(true);
    });

    it('拡大状態の選択ツールでの1本指ドラッグは AnnotationEditor の描画ロジックを誘発しない（Fabric の移動へ委譲）', async () => {
      await renderAndWaitForRestore();

      // 拡大状態をエミュレート。
      mockCanvasInstance.viewportTransform = [2, 0, 0, 2, -100, -50];
      (mockCanvasInstance.getZoom as ReturnType<typeof vi.fn>).mockReturnValue(2);

      const mouseDown = getRegisteredHandler('mouse:down');
      const mouseMove = getRegisteredHandler('mouse:move');
      const mouseUp = getRegisteredHandler('mouse:up');
      expect(mouseDown).toBeDefined();
      expect(mouseMove).toBeDefined();
      expect(mouseUp).toBeDefined();

      // ドラッグ前の add 呼出し回数（復元時の add を含む）を記録。
      const addCallsBefore = (mockCanvasInstance.add as ReturnType<typeof vi.fn>).mock.calls.length;

      // 既存注釈上を 1 本指でドラッグ（select ツール）するシーケンスを再現。
      // viewport を考慮した座標は Fabric の options.scenePoint が供給する。
      mouseDown!({ scenePoint: { x: 120, y: 130 } });
      mouseMove!({ scenePoint: { x: 160, y: 180 } });
      mouseUp!({ scenePoint: { x: 160, y: 180 } });

      // 選択ツールでは AnnotationEditor が新規図形を作らず（描画として誤発火しない）、
      // 移動は Fabric の object:moving（scenePoint）に委譲される。
      const addCallsAfter = (mockCanvasInstance.add as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(addCallsAfter).toBe(addCallsBefore);
    });
  });
});
