/**
 * @fileoverview AnnotationEditor - 寸法値入力欄の画面結線（Task 115.82）
 *
 * Requirements:
 * - 6.2: When 寸法線が描画される, the Site Survey Service shall 寸法値入力用の
 *        テキストフィールドを表示する
 * - 6.3: When ユーザーが寸法値を入力する, the Site Survey Service shall
 *        寸法線上に数値とオプションの単位を表示する
 *
 * 本ファイルは**出荷される描画経路**（`AnnotationEditor` のレンダリング）だけを入口として
 * 検証する。`DimensionValueInput` を直接組み立てて確かめると、「部品はあるが結線が無い」
 * 状態を構造的に検出できないためである（Task 115.81 と同型の是正）。
 *
 * 寸法線そのものは本番実装（`tools/DimensionTool`）をそのまま使う。値の書き込み結果は
 * 寸法線 Group の子（ラベル）のテキストとして観測し、本番の描画物を確認する。
 *
 * Boundary: 寸法値入力欄と注釈編集画面の結線
 *
 * @requirement site-survey/REQ-6.2
 * @requirement site-survey/REQ-6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';

const IMAGE_ID = 'test-image-id';
const SURVEY_ID = 'test-survey-id';

// act 警告と画像/注釈読み込みエラーログを抑制
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

vi.mock('../../../hooks/useMediaQuery', () => ({
  default: () => false,
}));

// ============================================================================
// Fabric / API モック
// ============================================================================
const { mockCanvasInstance, mockFromURL, canvasHandlers, canvasObjects } = vi.hoisted(() => {
  const canvasHandlers = new Map<string, Set<(payload?: unknown) => void>>();
  const canvasObjects: unknown[] = [];

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
      canvasObjects.push(obj);
    }),
    remove: vi.fn((obj: unknown) => {
      const index = canvasObjects.indexOf(obj);
      if (index >= 0) canvasObjects.splice(index, 1);
    }),
    clear: vi.fn(),
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      if (!canvasHandlers.has(event)) canvasHandlers.set(event, new Set());
      canvasHandlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler?: (payload?: unknown) => void) => {
      if (!handler) {
        canvasHandlers.delete(event);
        return;
      }
      canvasHandlers.get(event)?.delete(handler);
    }),
    fire: vi.fn((event: string, payload?: unknown) => {
      for (const handler of [...(canvasHandlers.get(event) ?? [])]) {
        handler(payload);
      }
    }),
    setViewportTransform: vi.fn(),
    zoomToPoint: vi.fn(),
    getObjects: vi.fn(() => [...canvasObjects]),
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
    calcOffset: vi.fn(),
  };

  const mockFabricImageInstance = {
    scaleToWidth: vi.fn(),
    scaleToHeight: vi.fn(),
    set: vi.fn(),
    scale: vi.fn(),
    getScaledWidth: vi.fn(() => 800),
    getScaledHeight: vi.fn(() => 600),
    width: 800,
    height: 600,
    scaleX: 1,
    scaleY: 1,
  };

  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  return { mockCanvasInstance, mockFromURL, canvasHandlers, canvasObjects };
});

vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
  saveAnnotation: vi.fn().mockResolvedValue({
    id: 'test-annotation-id',
    imageId: 'test-image-id',
    data: { version: '1.0', objects: [] },
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    annotatedThumbnailUrl: null,
  }),
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

vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: vi.fn(() => ({
    attach: vi.fn(() => vi.fn()),
    getTouchState: vi.fn(() => 'idle'),
  })),
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

vi.mock('fabric', async () => {
  // Task 115.104 (Req 6.5): 寸法線が端点ハンドル（Fabric `Control`）を持つようになったため、
  // 幾何演算とハンドル生成に必要な最小の代替を `fabric-geometry-mock` から取り込む。
  const { MockPoint, mockFabricUtil } = await import('../../helpers/fabric-geometry-mock');

  /** Fabric `Control` の代替（端点ハンドル生成でのみ用いる） */
  class MockControl {
    constructor(options?: Record<string, unknown>) {
      if (options) {
        Object.assign(this, options);
      }
    }
  }

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
      return { type: 'mockShape' };
    }
  }
  /** FabricText は第1引数がテキスト本体。寸法値ラベルの観測に必要なので忠実に保持する */
  class MockText extends MockShape {
    text: string;
    constructor(text?: string, options?: Record<string, unknown>) {
      super(undefined, options);
      this.text = text ?? '';
    }
  }
  class MockIText extends MockShape {
    enterEditing(): void {}
    exitEditing(): void {}
    selectAll(): void {}
  }
  class MockGroup {
    _objects: unknown[];
    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects || [];
      if (options) Object.assign(this, options);
    }
    getObjects(): unknown[] {
      return this._objects;
    }
    setCoords(): void {}
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
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
    Text: MockText,
    FabricText: MockText,
    IText: MockIText,
    Group: MockGroup,
    PencilBrush: MockPencilBrush,
    classRegistry: { setClass: vi.fn(), getClass: vi.fn() },
    util: {
      enlivenObjects: vi.fn(() => Promise.resolve([] as unknown[])),
      makeBoundingBoxFromPoints: mockFabricUtil.makeBoundingBoxFromPoints,
      invertTransform: mockFabricUtil.invertTransform,
    },
    Control: MockControl,
    Point: MockPoint,
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: IMAGE_ID,
  surveyId: SURVEY_ID,
};

/**
 * 登録済みのキャンバスイベントを発火する。
 *
 * 購読者が居ない場合は「結線が無い」ことを意味するため例外にする。
 */
function emitCanvasEvent(event: string, payload: unknown): void {
  const handlers = canvasHandlers.get(event);
  if (!handlers || handlers.size === 0) {
    throw new Error(`キャンバスイベント '${event}' の購読者が居ない（結線されていない）`);
  }
  for (const handler of [...handlers]) {
    handler(payload);
  }
}

/** エディタを描画し、画像・注釈の読み込み完了まで待つ */
async function renderEditorAndWaitLoaded(): Promise<void> {
  render(<AnnotationEditor {...defaultProps} />);
  await waitFor(() => {
    expect(screen.queryByLabelText('読み込み中')).toBeNull();
  });
}

/** ツールバーから寸法線ツールを選択する */
async function selectDimensionTool(): Promise<void> {
  const tool = screen.getByRole('button', { name: '寸法線' });
  await act(async () => {
    fireEvent.click(tool);
  });
}

/**
 * 出荷経路（キャンバスのポインタ操作）で寸法線を 1 本描く。
 *
 * @param from 始点（キャンバス座標）
 * @param to 終点（キャンバス座標）
 */
async function drawDimensionLine(
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  await act(async () => {
    emitCanvasEvent('mouse:down', {
      scenePoint: from,
      e: { clientX: from.x + 40, clientY: from.y + 30 },
    });
    emitCanvasEvent('mouse:up', {
      scenePoint: to,
      e: { clientX: to.x + 40, clientY: to.y + 30 },
    });
  });
}

/** キャンバスへ追加された寸法線 Group を取り出す */
function getDimensionObject(): { getObjects(): Array<{ text?: string }> } {
  const dimension = canvasObjects.find(
    (obj) => (obj as { type?: string }).type === 'dimensionLine'
  );
  expect(dimension, '寸法線がキャンバスへ追加されていない').toBeDefined();
  return dimension as { getObjects(): Array<{ text?: string }> };
}

/** 寸法線 Group の子から寸法値ラベルのテキストを読み出す */
function readDimensionLabelText(): string {
  const children = getDimensionObject().getObjects();
  const label = children.find((child) => typeof child.text === 'string');
  return label?.text ?? '';
}

/** 寸法線 Group の customData（確定した寸法値と単位）を読み出す */
function readDimensionCustomData(): { dimensionValue?: string; dimensionUnit?: string } {
  return (
    (
      getDimensionObject() as unknown as {
        customData?: { dimensionValue?: string; dimensionUnit?: string };
      }
    ).customData ?? {}
  );
}

describe('AnnotationEditor - 寸法値入力欄の結線 (Task 115.82)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canvasHandlers.clear();
    canvasObjects.length = 0;
    mockCanvasInstance.backgroundImage = null;
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Requirement 6.2: 寸法線が描画されると寸法値入力欄が表示される', () => {
    it('寸法線を描画すると寸法値入力欄が本番の描画経路から表示される', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();

      expect(screen.queryByRole('dialog', { name: '寸法値入力' })).toBeNull();

      await drawDimensionLine({ x: 100, y: 200 }, { x: 320, y: 200 });

      const dialog = await screen.findByRole('dialog', { name: '寸法値入力' });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: '寸法値' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: '単位' })).toBeInTheDocument();
    });

    it('寸法線が作られない短すぎる操作では入力欄を表示しない', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();

      // 2 点間の距離が最小長未満のため寸法線は作成されない
      await drawDimensionLine({ x: 100, y: 200 }, { x: 102, y: 200 });

      expect(canvasObjects.some((obj) => (obj as { type?: string }).type === 'dimensionLine')).toBe(
        false
      );
      expect(screen.queryByRole('dialog', { name: '寸法値入力' })).toBeNull();
    });

    it('別のツールへ切り替えると未確定の入力欄を閉じる', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();
      await drawDimensionLine({ x: 100, y: 200 }, { x: 320, y: 200 });
      await screen.findByRole('dialog', { name: '寸法値入力' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '選択' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: '寸法値入力' })).toBeNull();
      });
    });
  });

  describe('Requirement 6.3: 入力した寸法値が寸法線上に表示される', () => {
    it('寸法値と単位を確定すると寸法線のラベルに数値と単位が描かれる', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();
      await drawDimensionLine({ x: 100, y: 200 }, { x: 320, y: 200 });
      await screen.findByRole('dialog', { name: '寸法値入力' });

      // 描画直後はラベルが空である（値が入るのは入力の結果であることを示す）
      expect(readDimensionLabelText()).toBe('');

      await act(async () => {
        fireEvent.change(screen.getByRole('spinbutton', { name: '寸法値' }), {
          target: { value: '1250' },
        });
        fireEvent.change(screen.getByRole('combobox', { name: '単位' }), {
          target: { value: 'cm' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '確定' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: '寸法値入力' })).toBeNull();
      });

      expect(readDimensionLabelText()).toBe('1250 cm');
    });

    it('確定は object:modified を発火して Undo・自動保存へ変更を伝える', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();
      await drawDimensionLine({ x: 100, y: 200 }, { x: 320, y: 200 });
      await screen.findByRole('dialog', { name: '寸法値入力' });

      mockCanvasInstance.fire.mockClear();

      await act(async () => {
        fireEvent.change(screen.getByRole('spinbutton', { name: '寸法値' }), {
          target: { value: '800' },
        });
        fireEvent.click(screen.getByRole('button', { name: '確定' }));
      });

      expect(mockCanvasInstance.fire).toHaveBeenCalledWith(
        'object:modified',
        expect.objectContaining({ target: getDimensionObject() })
      );
    });

    it('値を入力せず確定すると単位だけのラベルを描かない', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();
      await drawDimensionLine({ x: 100, y: 200 }, { x: 320, y: 200 });
      await screen.findByRole('dialog', { name: '寸法値入力' });

      // 数値を一切入力せずに確定する（単位は初期値 mm のまま）
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '確定' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: '寸法値入力' })).toBeNull();
      });

      // 要件6.3 の単位は「数値に付随するオプション」であり、数値が無いときは単位も表示しない
      expect(readDimensionLabelText()).toBe('');
      expect(readDimensionCustomData().dimensionValue ?? '').toBe('');
      expect(readDimensionCustomData().dimensionUnit ?? '').toBe('');
    });

    it('キャンセルすると寸法線は残り、ラベルは空のままになる', async () => {
      await renderEditorAndWaitLoaded();
      await selectDimensionTool();
      await drawDimensionLine({ x: 100, y: 200 }, { x: 320, y: 200 });
      await screen.findByRole('dialog', { name: '寸法値入力' });

      await act(async () => {
        fireEvent.change(screen.getByRole('spinbutton', { name: '寸法値' }), {
          target: { value: '1250' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: '寸法値入力' })).toBeNull();
      });

      expect(canvasObjects.some((obj) => (obj as { type?: string }).type === 'dimensionLine')).toBe(
        true
      );
      expect(readDimensionLabelText()).toBe('');
    });
  });
});
