/**
 * @fileoverview AnnotationEditor のツール切替時カーソル適用連動テスト
 *
 * Task 72.5 (Req 29.1, 29.2): ツール切替時に applyToolCursor を呼び出し、
 * canvas.defaultCursor / hoverCursor / freeDrawingCursor を設定したうえで
 * canvas.setCursor(canvas.defaultCursor) により即時反映する挙動を検証する。
 *
 * - 初期マウント時 (activeTool='select') で defaultCursor='default'
 * - 矢印ツールに切替えると defaultCursor/hoverCursor='crosshair'
 * - テキストツールに切替えると defaultCursor='text'
 * - ツール切替後、canvas.setCursor が新しい defaultCursor で呼ばれる
 *
 * 既存 AnnotationEditor.test.tsx は `applyToolCursor` 全体をモックしているため、
 * 本テストでは `annotation-visual-feedback` を実モジュールとして利用し、
 * Canvas モック側で mutable な defaultCursor/hoverCursor/freeDrawingCursor と
 * setCursor spy を提供する。
 *
 * @requirement site-survey/REQ-29.1
 * @requirement site-survey/REQ-29.2
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

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

// vi.hoistedでモックインスタンスを定義（ホイスティング対応）
const { mockCanvasInstance, mockFabricImageInstance, mockFromURL } = vi.hoisted(() => {
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
    // カーソル関連プロパティ（Task 72.5 で操作される）
    defaultCursor: 'default' as string,
    hoverCursor: 'default' as string,
    freeDrawingCursor: 'default' as string,
    setCursor: vi.fn(),
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

  return {
    mockCanvasInstance,
    mockFabricImageInstance,
    mockFromURL,
  };
});

// survey-annotations APIのモック
vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
  saveAnnotation: vi.fn().mockResolvedValue({ id: 'test-annotation-id' }),
  exportAnnotationJson: vi.fn().mockResolvedValue('{}'),
  updateThumbnail: vi.fn().mockResolvedValue({ success: true, thumbnailPath: '/test/path' }),
}));

// useToastのモック
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

// touchGestureManager のモック
vi.mock('../../../components/site-surveys/gestures/touchGestureManager', () => ({
  createTouchGestureManager: () => ({
    attach: () => () => {},
    getTouchState: () => 'idle',
  }),
}));

// NOTE: annotation-visual-feedback は **モックしない**（実挙動を検証するため）

// Fabric.jsのモック
vi.mock('fabric', () => {
  function MockCanvas() {
    return mockCanvasInstance;
  }

  class MockFabricObject {
    static ownDefaults = {
      cornerSize: 13,
      touchCornerSize: 24,
    };
  }

  class MockPath {
    set(): this {
      return this;
    }
    toObject(): Record<string, unknown> {
      return {};
    }
    setCoords(): void {}
  }

  class MockEllipse {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockRect {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockPolygon {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockPolyline {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockLine {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockText {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockIText {
    set(): this {
      return this;
    }
    setCoords(): void {}
    enterEditing(): void {}
    exitEditing(): void {}
  }

  class MockGroup {
    set(): this {
      return this;
    }
    setCoords(): void {}
  }

  class MockPencilBrush {
    color = '#000000';
    width = 1;
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
    Path: MockPath,
    Ellipse: MockEllipse,
    Rect: MockRect,
    Polygon: MockPolygon,
    Polyline: MockPolyline,
    Line: MockLine,
    Text: MockText,
    IText: MockIText,
    Group: MockGroup,
    PencilBrush: MockPencilBrush,
    classRegistry: mockClassRegistry,
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: 'test-image-id',
  surveyId: 'test-survey-id',
};

describe('AnnotationEditor - ツール切替時のカーソル適用連動 (Task 72.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // カーソル関連プロパティをリセット
    mockCanvasInstance.defaultCursor = 'default';
    mockCanvasInstance.hoverCursor = 'default';
    mockCanvasInstance.freeDrawingCursor = 'default';
    Object.values(mockCanvasInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
    Object.values(mockFabricImageInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('初期マウント時（activeTool=select）では Canvas の defaultCursor が "default" になる', async () => {
    render(<AnnotationEditor {...defaultProps} />);

    await waitFor(() => {
      expect(mockCanvasInstance.setDimensions).toHaveBeenCalled();
    });

    // select ツールに対応する default カーソルが設定されている
    expect(mockCanvasInstance.defaultCursor).toBe('default');
    expect(mockCanvasInstance.hoverCursor).toBe('default');
    expect(mockCanvasInstance.freeDrawingCursor).toBe('default');
  });

  it('矢印ツールに切替えると Canvas の defaultCursor/hoverCursor が "crosshair" になる', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<AnnotationEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    const arrowButton = screen.getByRole('button', { name: /矢印/i });
    await user.click(arrowButton);

    await waitFor(() => {
      expect(mockCanvasInstance.defaultCursor).toBe('crosshair');
    });
    expect(mockCanvasInstance.hoverCursor).toBe('crosshair');
    expect(mockCanvasInstance.freeDrawingCursor).toBe('crosshair');
  });

  it('テキストツールに切替えると Canvas の defaultCursor が "text" になる', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<AnnotationEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    const textButton = screen.getByRole('button', { name: /テキスト/i });
    await user.click(textButton);

    await waitFor(() => {
      expect(mockCanvasInstance.defaultCursor).toBe('text');
    });
    expect(mockCanvasInstance.hoverCursor).toBe('text');
    expect(mockCanvasInstance.freeDrawingCursor).toBe('text');
  });

  it('ツール切替後、canvas.setCursor が新しい defaultCursor で呼ばれる（即時反映）', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<AnnotationEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    // 初期マウント後の setCursor 呼び出しをクリア
    mockCanvasInstance.setCursor.mockClear();

    const arrowButton = screen.getByRole('button', { name: /矢印/i });
    await user.click(arrowButton);

    await waitFor(() => {
      expect(mockCanvasInstance.setCursor).toHaveBeenCalledWith('crosshair');
    });
  });
});
