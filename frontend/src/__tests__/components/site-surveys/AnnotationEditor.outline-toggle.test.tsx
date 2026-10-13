/**
 * @fileoverview AnnotationEditor - 白縁取り切替の結線と取り消し履歴への記録の検証
 *
 * Task 115.96 (Req 24.5, 25.2, 32.5, 24.10, 25.11, 32.10):
 * 白縁取りの切替UIは、本番の描画経路から一度も参照されていない `StylePanel.tsx` にしか
 * 存在せず（しかも矢印と文字だけで図形六種を持たない）、実際に描かれる道具帯の
 * スタイルパネルには切替の操作要素が無かった。型の水準でも `StyleOptions` に白縁取りの
 * 項目が無く、切替は表現できなかった。
 *
 * 本テストは結線側（`AnnotationEditor` → `AnnotationToolbar` が内包するスタイルパネル）で
 * 次を観測する:
 *
 * - 切替の存在と反応: 対象ツール（矢印・テキスト・図形六種）で切替が現れ、操作で状態が変わる
 * - 描画経路への反映: フリーハンドのブラシへ切替結果が渡る（実際に描画へ使われる値の側）
 * - 取り消し履歴への記録: 切替後に「元に戻す」で切替前の状態へ戻る
 *
 * Boundary: 白縁取りの切替UIと注釈の道具帯（型・UI・取り消し記録）
 *
 * Requirements:
 * - 24.5: 矢印の描画設定で白縁取りの有効/無効を任意に切替可能にする
 * - 25.2: テキストの白アウトラインの有効/無効を任意に切替可能にする
 * - 32.5: 寸法線・円・四角形・多角形・折れ線・フリーハンドで白縁取りの有効/無効を
 *         任意に切替可能にする
 * - 24.10 / 25.11 / 32.10: 白縁取り（白アウトライン）の切替を Undo/Redo 履歴に記録する
 *
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-32.5
 * @requirement site-survey/REQ-24.10
 * @requirement site-survey/REQ-25.11
 * @requirement site-survey/REQ-32.10
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// act警告とエラーログを抑制
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

const { mockCanvasInstance, mockFromURL } = vi.hoisted(() => {
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
    skipTargetFind: false,
    defaultCursor: 'default' as string,
    hoverCursor: 'default' as string,
    freeDrawingCursor: 'default' as string,
    setCursor: vi.fn(),
    fire: vi.fn(),
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

  return { mockCanvasInstance, mockFromURL };
});

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

vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: () => ({
    attach: () => () => {},
    getTouchState: () => 'idle',
  }),
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

  class MockFabricObject {
    static ownDefaults = { cornerSize: 13, touchCornerSize: 24 };
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockShape {
    constructor(_a?: unknown, options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    setCoords(): void {}
    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockPath extends MockShape {
    path: unknown;
    constructor(pathData?: unknown, options?: Record<string, unknown>) {
      super(undefined, options);
      this.path = pathData ?? '';
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
      this._objects = objects ? [...objects] : [];
      if (options) Object.assign(this, options);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    setCoords(): void {}
    add(object: unknown): void {
      this._objects.push(object);
    }
    remove(object: unknown): void {
      const index = this._objects.indexOf(object);
      if (index > -1) this._objects.splice(index, 1);
    }
    toObject(): Record<string, unknown> {
      return {};
    }
  }

  class MockPencilBrush {
    color = '#000000';
    width = 1;
    decimate = 8;
    strokeLineCap = 'round';
    strokeLineJoin = 'round';
    constructor(_canvas?: unknown) {}
    createPath(pathData: unknown): unknown {
      return new MockPath(pathData);
    }
  }

  const mockClassRegistry = { setClass: vi.fn(), getClass: vi.fn() };

  return {
    Canvas: MockCanvas,
    FabricImage: { fromURL: mockFromURL },
    FabricObject: MockFabricObject,
    Path: MockPath,
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
      joinPath: (pathData: Array<Array<string | number>>) =>
        pathData.map((segment) => segment.join(' ')).join(' '),
    },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';
import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

/**
 * 切替UIが現れるべきツールと、当該ツールの既定の切替状態。
 *
 * 要件 24.5（矢印）・25.2（テキスト）・32.5（寸法線・円・四角形・多角形・折れ線・
 * フリーハンド）の対象がちょうど描画ツール全体になる。既定値は一元管理の資材から引く
 * （ここで真偽値を literal で持つと資材と食い違う二つ目の供給元になる）。
 */
const OUTLINE_TOOLS: ReadonlyArray<{
  toolLabel: string;
  expectedLabel: string;
  defaultEnabled: boolean;
}> = [
  {
    toolLabel: '矢印',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.arrowOutline.enabled,
  },
  {
    toolLabel: 'テキスト',
    expectedLabel: '白アウトライン',
    defaultEnabled: ANNOTATION_DEFAULTS.textOutline.enabled,
  },
  {
    toolLabel: '寸法線',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.dimensionOutline.enabled,
  },
  {
    toolLabel: '円',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.circleOutline.enabled,
  },
  {
    toolLabel: '四角形',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.rectangleOutline.enabled,
  },
  {
    toolLabel: '多角形',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.polygonOutline.enabled,
  },
  {
    toolLabel: '折れ線',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.polylineOutline.enabled,
  },
  {
    toolLabel: 'フリーハンド',
    expectedLabel: '白縁取り',
    defaultEnabled: ANNOTATION_DEFAULTS.freehandOutline.enabled,
  },
];

/**
 * 注釈編集画面を描画し、ツールバーが利用可能になるまで待つ
 */
async function renderEditor(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<AnnotationEditor {...defaultProps} />);

  await waitFor(() => {
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  return user;
}

/** 現在表示されている白縁取り切替のチェック状態を読む */
function readOutlineToggle(): boolean {
  return (screen.getByTestId('outline-toggle') as HTMLInputElement).checked;
}

describe('AnnotationEditor - 白縁取り切替の結線 (Task 115.96)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasInstance.isDrawingMode = false;
    mockCanvasInstance.freeDrawingBrush = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(OUTLINE_TOOLS)(
    '$toolLabel ツールの描画設定に白縁取りの切替が現れる (Req 24.5, 25.2, 32.5)',
    async ({ toolLabel, expectedLabel, defaultEnabled }) => {
      const user = await renderEditor();
      await user.click(screen.getByRole('button', { name: toolLabel }));

      const toggle = screen.getByTestId('outline-toggle') as HTMLInputElement;
      expect(toggle.type).toBe('checkbox');
      // Req 26.3 / 32.11: 初回選択時は有効な初期状態で起動する
      expect(toggle.checked).toBe(defaultEnabled);
      expect(screen.getByLabelText(expectedLabel)).toBe(toggle);
    }
  );

  it('選択ツールでは切替を表示しない（注釈を描かないため）', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: '矢印' }));
    expect(screen.getByTestId('outline-toggle')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '選択' }));
    expect(screen.queryByTestId('outline-toggle')).not.toBeInTheDocument();
  });

  it.each(OUTLINE_TOOLS)(
    '$toolLabel ツールで切替を操作すると状態が変わる (Req 24.5, 25.2, 32.5)',
    async ({ toolLabel, defaultEnabled }) => {
      const user = await renderEditor();
      await user.click(screen.getByRole('button', { name: toolLabel }));

      await user.click(screen.getByTestId('outline-toggle'));

      expect(readOutlineToggle()).toBe(!defaultEnabled);
    }
  );

  it('切替はツールごとに独立して保持される (Req 24.5, 32.5)', async () => {
    const user = await renderEditor();

    await user.click(screen.getByRole('button', { name: '矢印' }));
    await user.click(screen.getByTestId('outline-toggle'));
    expect(readOutlineToggle()).toBe(!ANNOTATION_DEFAULTS.arrowOutline.enabled);

    // 別ツールへ切替えても、そのツールの切替は既定のまま
    await user.click(screen.getByRole('button', { name: '四角形' }));
    expect(readOutlineToggle()).toBe(ANNOTATION_DEFAULTS.rectangleOutline.enabled);

    // 元のツールへ戻すと、直前の切替が引き継がれている（Req 26.4）
    await user.click(screen.getByRole('button', { name: '矢印' }));
    expect(readOutlineToggle()).toBe(!ANNOTATION_DEFAULTS.arrowOutline.enabled);
  });

  it('切替の結果は描画経路（フリーハンドのブラシ）へ渡る (Req 32.5)', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: 'フリーハンド' }));
    await user.click(screen.getByTestId('outline-toggle'));

    const brush = mockCanvasInstance.freeDrawingBrush as {
      setOutlineEnabled?: (enabled: boolean) => void;
      createPath?: (pathData: unknown) => { getOutline?: () => { enabled: boolean } };
    } | null;
    expect(brush).not.toBeNull();

    // ブラシが組み立てる形状の白縁取りが、切替結果（無効）に一致する
    const created = brush?.createPath?.([
      ['M', 0, 0],
      ['L', 10, 10],
    ]);
    expect(created?.getOutline?.()).toEqual(
      expect.objectContaining({ enabled: !ANNOTATION_DEFAULTS.freehandOutline.enabled })
    );
  });

  it('切替は Undo で切替前の状態へ戻る (Req 24.10, 25.11, 32.10)', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: '矢印' }));

    const initial = readOutlineToggle();
    await user.click(screen.getByTestId('outline-toggle'));
    expect(readOutlineToggle()).toBe(!initial);

    await user.click(screen.getByRole('button', { name: '元に戻す' }));

    expect(readOutlineToggle()).toBe(initial);
  });

  it('Undo した切替は Redo で再適用される (Req 24.10, 25.11, 32.10)', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: '矢印' }));

    const initial = readOutlineToggle();
    await user.click(screen.getByTestId('outline-toggle'));
    await user.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(readOutlineToggle()).toBe(initial);

    await user.click(screen.getByRole('button', { name: 'やり直し' }));

    expect(readOutlineToggle()).toBe(!initial);
  });
});
