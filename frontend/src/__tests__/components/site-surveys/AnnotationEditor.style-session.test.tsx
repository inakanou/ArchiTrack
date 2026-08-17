/**
 * @fileoverview AnnotationEditor - 編集セッション内でユーザー選択スタイルが引き継がれることの検証
 *
 * Task 115.70 (Req 26.4, 26.6): 要件26.4 / 26.6 の受入基準カバレッジは、これまで本番から
 * 一度も参照されていない `StylePanel.tsx` の単体検証（`StylePanel.outline-toggle.test.tsx`）
 * にしか存在しなかった。未結線の部品を検証しても要件が守られている証拠にはならないため、
 * 主張を結線側（`AnnotationEditor` → `AnnotationToolbar` が内包するスタイルパネル）へ移す。
 *
 * 旧主張は制御コンポーネントへ同じ props を再投入して表示が変わらないことを見ていただけで、
 * セッション状態を保持する主体（`AnnotationEditor.styleOptionsRef`、design.md の
 * 「セッション内継承（Req 26.4）は既存 `AnnotationEditor.styleOptionsRef` の仕組みを
 * そのまま流用」）を一切通っていなかった。本テストは次の二経路で観測する:
 *
 * - 表示経路: ツールを切替えて戻しても、スタイルパネルの入力値がユーザー選択値のまま
 * - 描画経路: フリーハンドツールへ切替えた際にブラシへ渡る色・線幅がユーザー選択値
 *   （既定値へ巻き戻らないことを、実際に描画へ使われる値の側で確かめる）
 *
 * Boundary: 注釈編集画面のセッション内スタイル状態
 *
 * Requirements:
 * - 26.4: ユーザーがスタイルを変更して注釈を描画した後、当該編集セッション内の同ツール
 *         再利用時に直前のスタイル設定を引き継ぐ
 * - 26.6: 既存の注釈エディタ設定にユーザーが明示的に選択した色・線幅が存在する場合、
 *         当該セッション中はユーザー選択値を優先する
 *
 * @requirement site-survey/REQ-26.4
 * @requirement site-survey/REQ-26.6
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
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
import { DEFAULT_STYLE_OPTIONS } from '../../../components/site-surveys/annotation-toolbar.constants';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

/** ユーザーが明示的に選ぶ線幅（既定値と必ず異なる値を選ぶ） */
const USER_STROKE_WIDTH = DEFAULT_STYLE_OPTIONS.strokeWidth + 5;

/** ユーザーが明示的に選ぶ本体色（既定値と必ず異なる値を選ぶ） */
const USER_STROKE_COLOR = '#0000ff';

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

/**
 * スタイルパネルの線幅・本体色をユーザー選択値へ変更する
 *
 * `fireEvent.change` を使うのは、数値入力へ一文字ずつ入力すると途中の値でも
 * `onStyleChange` が発火し、意図した値以外の中間状態が混ざるため。
 */
function selectUserStyle(): void {
  fireEvent.change(screen.getByTestId('line-width'), {
    target: { value: String(USER_STROKE_WIDTH) },
  });
  fireEvent.change(screen.getByTestId('color-picker'), {
    target: { value: USER_STROKE_COLOR },
  });
}

describe('AnnotationEditor - セッション内のスタイル引継ぎ (Task 115.70)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasInstance.isDrawingMode = false;
    mockCanvasInstance.freeDrawingBrush = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ユーザーが選んだ色・線幅は既定値より優先して保持される (Req 26.6)', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: '矢印' }));

    // 変更前は一元管理の既定値が供給されている（前提の固定）
    expect((screen.getByTestId('line-width') as HTMLInputElement).value).toBe(
      String(DEFAULT_STYLE_OPTIONS.strokeWidth)
    );

    selectUserStyle();

    expect((screen.getByTestId('line-width') as HTMLInputElement).value).toBe(
      String(USER_STROKE_WIDTH)
    );
    expect((screen.getByTestId('color-picker') as HTMLInputElement).value).toBe(USER_STROKE_COLOR);
  });

  it('別ツールを経由して同じツールへ戻しても直前のスタイルを引き継ぐ (Req 26.4)', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: '矢印' }));
    selectUserStyle();

    // 別ツール（四角形）へ切替える
    await user.click(screen.getByRole('button', { name: '四角形' }));
    expect((screen.getByTestId('line-width') as HTMLInputElement).value).toBe(
      String(USER_STROKE_WIDTH)
    );

    // 選択ツールを挟んでスタイルパネル自体を消してから、同じツール（矢印）へ戻す
    await user.click(screen.getByRole('button', { name: '選択' }));
    expect(screen.queryByTestId('line-width')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '矢印' }));

    expect((screen.getByTestId('line-width') as HTMLInputElement).value).toBe(
      String(USER_STROKE_WIDTH)
    );
    expect((screen.getByTestId('color-picker') as HTMLInputElement).value).toBe(USER_STROKE_COLOR);
  });

  it('ユーザー選択値は描画経路（フリーハンドのブラシ）へも引き継がれる (Req 26.4, 26.6)', async () => {
    const user = await renderEditor();
    await user.click(screen.getByRole('button', { name: '矢印' }));
    selectUserStyle();

    await user.click(screen.getByRole('button', { name: 'フリーハンド' }));

    const brush = mockCanvasInstance.freeDrawingBrush as { color: string; width: number } | null;
    expect(brush).not.toBeNull();
    expect(brush?.width).toBe(USER_STROKE_WIDTH);
    expect(brush?.color).toBe(USER_STROKE_COLOR);
  });
});
