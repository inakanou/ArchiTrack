/**
 * @fileoverview AnnotationEditor - ダブルタップ用途調停（テキスト編集 vs ズームトグル）
 *
 * Task 96.3: touchGestureManager が発火する custom:dbltap を、ダブルタップ位置の対象によって
 * 排他的に振り分けることを検証する（design.md「ダブルタップ用途調停」）。
 *   - テキスト注釈上 → target.enterEditing() を呼び、ズーム（zoomToPoint/fit）は呼ばない（Req 27.1）
 *   - 空き領域（対象なし） かつ 等倍（≒1） → controller.zoomToPoint(タップ点, 2)（Req 33.8）
 *   - 空き領域 かつ 拡大中（zoom>1） → controller.fit()（Req 33.8）
 *
 * 重要（round 1 修正）: 実運用の custom:dbltap payload は target を持たない（touchGestureManager の
 * buildPayload は {pointerType, clientX, clientY, currentTool} のみ。Fabric の canvas.fire は
 * カスタムイベントに target を付与しない）。本テストは payload に合成 target を注入せず、
 * 実 GesturePayload 形状（target なし）で発火し、canvas.findTarget が返す対象をモックして
 * ヒットテスト経路込みで分岐を検証する。
 *
 * viewportController は useCanvasViewport をモックし、getState/zoomToPoint/fit をスパイした
 * コントローラを注入して観測する。
 *
 * Boundary: AnnotationEditor (ext)
 *
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-33.8
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

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
// vi.hoisted で spy / モックを定義
// ============================================================================

const {
  mockCanvasInstance,
  mockFromURL,
  createTouchGestureManagerSpy,
  configureHandleSizesSpy,
  controllerSpy,
  setMockZoom,
} = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (...args: unknown[]) => void>();

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
    on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
      registeredHandlers.set(eventName, handler);
    }),
    off: vi.fn((eventName: string) => {
      registeredHandlers.delete(eventName);
    }),
    setViewportTransform: vi.fn(),
    zoomToPoint: vi.fn(),
    // Task 96.3: handleDoubleTap は payload.target ではなく canvas.findTarget による
    // 実ヒットテストで対象を判定する。Fabric v7 の findTarget は
    // { target?, subTargets, currentSubTargets, ... } を返す。
    findTarget: vi.fn(() => ({ target: undefined, subTargets: [], currentSubTargets: [] })),
    getObjects: vi.fn(() => []),
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
    __getHandler: (eventName: string): ((...args: unknown[]) => void) | undefined =>
      registeredHandlers.get(eventName),
    __clearHandlers: () => {
      registeredHandlers.clear();
    },
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

  const detachSpy = vi.fn();
  const attachSpy = vi.fn((_canvas: unknown, _getCurrentTool: () => string) => detachSpy);
  const createTouchGestureManagerSpy = vi.fn(() => ({
    attach: attachSpy,
    getTouchState: vi.fn(() => 'idle'),
  }));

  const configureHandleSizesSpy = vi.fn();

  // useCanvasViewport が返す controller のスパイ。getState のズームをテスト毎に切替える。
  let mockZoom = 1;
  const setMockZoom = (z: number): void => {
    mockZoom = z;
  };
  const controllerSpy = {
    zoomToPoint: vi.fn(),
    pan: vi.fn(),
    fit: vi.fn(),
    clampZoom: vi.fn((z: number) => z),
    clampPan: vi.fn(),
    isPanEnabled: vi.fn(() => mockZoom > 1),
    getState: vi.fn(() => ({ zoom: mockZoom, panX: 0, panY: 0 })),
  };

  return {
    mockCanvasInstance,
    mockFromURL,
    createTouchGestureManagerSpy,
    configureHandleSizesSpy,
    controllerSpy,
    setMockZoom,
  };
});

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

vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: createTouchGestureManagerSpy,
}));

// viewportController をスパイに差し替え、handleDoubleTap の分岐を観測可能にする。
vi.mock('../../../hooks/useCanvasViewport', () => ({
  useCanvasViewport: () => ({
    zoom: 1,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fit: controllerSpy.fit,
    controller: controllerSpy,
  }),
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

  class MockIText {
    isEditing?: boolean;
    constructor(_text?: string, options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    setCoords(): void {}
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
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
    FabricImage: { fromURL: mockFromURL },
    FabricObject: MockFabricObject,
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
    classRegistry: mockClassRegistry,
    util: {
      enlivenObjects: vi.fn(() => Promise.resolve([])),
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
  __getHandler: (eventName: string) => ((payload: unknown) => void) | undefined;
  __clearHandlers: () => void;
};

const getRegisteredHandler = (eventName: string): ((payload: unknown) => void) | undefined => {
  return (mockCanvasInstance as unknown as HandlerAccess).__getHandler(eventName);
};

/**
 * canvas.findTarget の戻り値（Fabric v7 形状）をセットする。
 * handleDoubleTap は clientX/clientY からヒットテストして対象を得るため、
 * ここで「タップ点にどの対象が居るか」をモックする。
 */
const setHitTarget = (target: unknown): void => {
  (mockCanvasInstance.findTarget as ReturnType<typeof vi.fn>).mockReturnValue({
    target,
    subTargets: [],
    currentSubTargets: [],
  });
};

describe('AnnotationEditor - ダブルタップ用途調停 (Task 96.3, Req 27.1 / 33.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCanvasInstance as unknown as HandlerAccess).__clearHandlers();
    setMockZoom(1);
    // 既定は空き領域（ヒットなし）
    setHitTarget(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('テキスト注釈上の dbltap で enterEditing が呼ばれ、ズーム（zoomToPoint/fit）は呼ばれない (Req 27.1)', async () => {
    render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
    });

    const dbltapHandler = getRegisteredHandler('custom:dbltap')!;
    const enterEditingSpy = vi.fn();
    // ヒットテストでタップ点にテキスト注釈が居る
    setHitTarget({ type: 'textAnnotation', enterEditing: enterEditingSpy });

    // 実 payload 形状（target なし）
    dbltapHandler({
      pointerType: 'touch',
      clientX: 100,
      clientY: 200,
      currentTool: 'select',
    });

    expect(enterEditingSpy).toHaveBeenCalledTimes(1);
    expect(controllerSpy.zoomToPoint).not.toHaveBeenCalled();
    expect(controllerSpy.fit).not.toHaveBeenCalled();
  });

  it('空き領域 dbltap で等倍時は controller.zoomToPoint(タップ点, 2) が呼ばれる (Req 33.8)', async () => {
    setMockZoom(1);
    render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
    });

    const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

    dbltapHandler({
      pointerType: 'touch',
      clientX: 150,
      clientY: 250,
      // target なし = 空き領域
      currentTool: 'select',
    });

    expect(controllerSpy.zoomToPoint).toHaveBeenCalledTimes(1);
    expect(controllerSpy.zoomToPoint).toHaveBeenCalledWith({ x: 150, y: 250 }, 2);
    expect(controllerSpy.fit).not.toHaveBeenCalled();
  });

  it('拡大中の空き領域 dbltap で controller.fit が呼ばれる (Req 33.8)', async () => {
    setMockZoom(2);
    render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
    });

    const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

    dbltapHandler({
      pointerType: 'touch',
      clientX: 150,
      clientY: 250,
      currentTool: 'select',
    });

    expect(controllerSpy.fit).toHaveBeenCalledTimes(1);
    expect(controllerSpy.zoomToPoint).not.toHaveBeenCalled();
  });

  it('背景画像 (type: image) がヒットした dbltap でも空き領域扱いでズームトグルする (Req 33.8)', async () => {
    setMockZoom(1);
    // 背景画像は通常 canvas.backgroundImage でヒットテスト対象外（findTarget は undefined）だが、
    // 万一 image オブジェクトがヒットした場合も空き領域扱いとする防御的分岐を検証する。
    setHitTarget({ type: 'image' });
    render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
    });

    const dbltapHandler = getRegisteredHandler('custom:dbltap')!;

    dbltapHandler({
      pointerType: 'touch',
      clientX: 10,
      clientY: 20,
      currentTool: 'select',
    });

    expect(controllerSpy.zoomToPoint).toHaveBeenCalledTimes(1);
    expect(controllerSpy.zoomToPoint).toHaveBeenCalledWith({ x: 10, y: 20 }, 2);
  });

  it('テキスト以外の注釈（rectangle）上の dbltap では編集もズームも行わない', async () => {
    setMockZoom(1);
    render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      expect(getRegisteredHandler('custom:dbltap')).toBeDefined();
    });

    const dbltapHandler = getRegisteredHandler('custom:dbltap')!;
    const enterEditingSpy = vi.fn();
    // ヒットテストでタップ点にテキスト以外の注釈（rectangle）が居る
    setHitTarget({ type: 'rectangle', enterEditing: enterEditingSpy });

    dbltapHandler({
      pointerType: 'touch',
      clientX: 150,
      clientY: 250,
      currentTool: 'select',
    });

    expect(enterEditingSpy).not.toHaveBeenCalled();
    expect(controllerSpy.zoomToPoint).not.toHaveBeenCalled();
    expect(controllerSpy.fit).not.toHaveBeenCalled();
  });
});
