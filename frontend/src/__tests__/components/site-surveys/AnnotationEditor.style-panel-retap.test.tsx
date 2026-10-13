/**
 * @fileoverview AnnotationEditor - 選択中ツールの再タップで詳細属性パネルを開閉する
 *
 * Task 115.104 (Req 28.8): `AnnotationToolbar` には再タップを通知する口
 * （`onActiveToolReTap`）が以前から用意されていたが、**編集画面がそれを渡していなかった**。
 * そのため要件28.8 の「選択中のツールをタップすると詳細属性パネルを表示/非表示トグルする」
 * は本番の経路で一度も成立していなかった。本ファイルは出荷される描画経路
 * （`AnnotationEditor` のレンダリング）だけを入口に、その結線を検証する。
 *
 * 主張は「パネルが実際に画面から消える／戻る」で置く。通知が飛んだことだけを見ると、
 * 受け手が何もしなくても緑になり、結線の欠落を検出できないためである。
 *
 * Boundary: 道具帯の再たたきと詳細属性パネルの開閉
 *
 * Requirements:
 * - 28.8: When ユーザーがツールバー上で現在選択中のツールをタップする, the Site Survey
 *         Service shall 選択状態を維持しつつ、利用可能な場合は当該ツールの詳細属性パネル
 *         （色・線幅・白縁取り有無等）を表示/非表示トグルする
 *
 * @requirement site-survey/REQ-28.8
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

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

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

/** 詳細属性パネル（スタイルパネル）が画面に出ているか */
function stylePanel(): HTMLElement | null {
  return screen.queryByTestId('style-options');
}

describe('AnnotationEditor - 選択中ツール再タップでの属性パネル開閉 (Task 115.104, Req 28.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvasInstance.isDrawingMode = false;
    mockCanvasInstance.freeDrawingBrush = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('選択中ツールを再タップすると詳細属性パネルが閉じ、もう一度で開く', async () => {
    const user = await renderEditor();
    const arrowTool = screen.getByRole('button', { name: '矢印' });

    // 前提: 描画ツールを選ぶとパネルが出ている
    await user.click(arrowTool);
    expect(stylePanel(), '矢印ツール選択直後に属性パネルが出ていない').toBeInTheDocument();

    // 1 回目の再タップ: 閉じる（＝既定でない状態から始める）
    await user.click(arrowTool);
    expect(stylePanel(), '再タップで属性パネルが閉じない').not.toBeInTheDocument();

    // 2 回目の再タップ: 開く
    await user.click(arrowTool);
    expect(stylePanel(), '再々タップで属性パネルが戻らない').toBeInTheDocument();
  });

  it('再タップしても選択状態は維持される', async () => {
    const user = await renderEditor();
    const arrowTool = screen.getByRole('button', { name: '矢印' });

    await user.click(arrowTool);
    await user.click(arrowTool);

    expect(arrowTool.getAttribute('aria-pressed'), '再タップで選択状態が外れた').toBe('true');
    expect(stylePanel(), '再タップで属性パネルが閉じない').not.toBeInTheDocument();
  });

  it('閉じた状態から別のツールへ切替えると属性パネルは再び開く', async () => {
    const user = await renderEditor();
    const arrowTool = screen.getByRole('button', { name: '矢印' });

    await user.click(arrowTool);
    await user.click(arrowTool);
    expect(stylePanel(), '再タップで属性パネルが閉じない').not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '四角形' }));
    expect(stylePanel(), '別ツールへ切替えても属性パネルが閉じたまま').toBeInTheDocument();
  });

  it('属性パネルを持たない選択ツールの再タップでは何も起きない', async () => {
    const user = await renderEditor();
    const selectionTool = screen.getByRole('button', { name: '選択' });

    // 初期状態は選択ツール。属性パネルは元から存在しない
    expect(stylePanel(), '選択ツールで属性パネルが出ている').not.toBeInTheDocument();

    await user.click(selectionTool);
    expect(selectionTool.getAttribute('aria-pressed'), '選択ツールの選択状態が外れた').toBe('true');
    expect(stylePanel(), '選択ツールの再タップで属性パネルが現れた').not.toBeInTheDocument();

    // その後に描画ツールを選ぶと通常どおりパネルが出る（開閉状態が壊れていない）
    await user.click(screen.getByRole('button', { name: '矢印' }));
    expect(
      stylePanel(),
      '選択ツール再タップ後に描画ツールの属性パネルが出ない'
    ).toBeInTheDocument();
  });
});
