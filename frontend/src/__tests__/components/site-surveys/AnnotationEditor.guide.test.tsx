/**
 * @fileoverview AnnotationEditor - AnnotationGuide マウントと idle タイマー連動テスト
 *
 * Task 72.4: `AnnotationGuide` を AnnotationEditor にマウントし、以下を検証する。
 *   - ツール選択変更時に idle タイマ（GUIDE_IDLE_MS=3000）を開始する
 *   - 3 秒間描画操作が無い場合に AnnotationGuide を visible にする
 *   - 描画開始または別操作で guide を dismiss する
 *   - 観測可能完了: 矢印ツール選択後 3 秒経過でガイドが表示され、
 *     描画操作を開始すると即座に消える
 *
 * Requirements:
 * - 29.7: ツール選択後、一定時間内に描画操作を開始しない場合、選択中ツールに対する
 *         簡易ガイドを画像領域に非侵襲的に提示する
 * - 29.8: 視覚フィードバック要素がコンテキストメニュー表示中および
 *         マルチタッチ入力中でも互いに競合しないよう制御する
 *
 * Boundary: AnnotationEditor (ext)
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

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

const { mockCanvasInstance, mockFromURL, createTouchGestureManagerSpy, configureHandleSizesSpy } =
  vi.hoisted(() => {
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
      skipTargetFind: false as boolean,
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

    return {
      mockCanvasInstance,
      mockFromURL,
      createTouchGestureManagerSpy,
      configureHandleSizesSpy,
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

  class MockPath {
    constructor(_path?: string, options?: Record<string, unknown>) {
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
    FabricImage: {
      fromURL: mockFromURL,
    },
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

// ============================================================================
// テスト用ヘルパ
// ============================================================================

type HandlerAccess = {
  __getHandler: (eventName: string) => ((payload: unknown) => void) | undefined;
  __clearHandlers: () => void;
};

const getRegisteredHandler = (eventName: string): ((payload: unknown) => void) | undefined => {
  return (mockCanvasInstance as unknown as HandlerAccess).__getHandler(eventName);
};

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationEditor - AnnotationGuide idle タイマー連動 (Task 72.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockCanvasInstance as unknown as HandlerAccess).__clearHandlers();
    mockCanvasInstance.skipTargetFind = false;
    Object.values(mockCanvasInstance).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockClear();
      }
    });
    // 純粋なフェイクタイマ。userEvent.setup({ advanceTimers }) でクリック処理内部の
    // タイマも明示的に進めるため、shouldAdvanceTime は使わない（時刻は vi.advanceTimersByTime が独占制御）。
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  describe('デフォルト（select）ツール: ガイドを表示しない (Req 29.7)', () => {
    it('初期マウント時に activeTool=select の場合、3000ms 経過してもガイドは表示されない', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      // マウント直後の useEffect 実行を保証
      await act(async () => {
        await Promise.resolve();
      });

      // 初期状態でガイドが出ていない
      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();

      // 3000ms 進めても表示されない（select ツールは対象外）
      await act(async () => {
        vi.advanceTimersByTime(3100);
      });

      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();
    });
  });

  describe('描画ツール選択時: idle タイマー開始とガイド表示 (Req 29.7)', () => {
    it('矢印ツールに切り替え、3000ms 未満ではガイド非表示、3000ms 経過で表示される', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await act(async () => {
        await Promise.resolve();
      });

      // 矢印ツールに切り替え（fireEvent は同期的に動作するためフェイクタイマと相性が良い）
      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      await act(async () => {
        fireEvent.click(arrowButton);
      });

      // 直後はガイド非表示
      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();

      // 2999ms 進める → まだ非表示（タイマー閾値未満）
      await act(async () => {
        vi.advanceTimersByTime(2999);
      });
      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();

      // さらに 1ms 進める → 表示される（累計 3000ms = GUIDE_IDLE_MS）
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByTestId('annotation-guide')).toBeInTheDocument();
      // ガイド文言も確認（arrow の場合は「ドラッグで描画」）
      expect(screen.getByTestId('annotation-guide')).toHaveTextContent('ドラッグで描画');
    });
  });

  describe('描画開始で dismiss する (Req 29.7, 29.8)', () => {
    it('ガイド表示中に canvas.mouse:down が発火すると、即座にガイドが消える', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await act(async () => {
        await Promise.resolve();
      });

      // 矢印ツールに切り替え → 3000ms 経過 → ガイド表示
      const arrowButton = screen.getByRole('button', { name: /矢印/i });
      await act(async () => {
        fireEvent.click(arrowButton);
      });

      await act(async () => {
        vi.advanceTimersByTime(3100);
      });

      expect(screen.getByTestId('annotation-guide')).toBeInTheDocument();

      // canvas の mouse:down ハンドラ（setupEventListeners 経由で登録済み）を
      // 直接発火して「描画開始」を模倣する
      const mouseDownHandler = getRegisteredHandler('mouse:down');
      expect(mouseDownHandler).toBeDefined();

      await act(async () => {
        mouseDownHandler!({ scenePoint: { x: 10, y: 10 } });
      });

      // ガイドが即消える
      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();
    });
  });

  describe('ツール切替でタイマーがリセットされる (Req 29.7)', () => {
    it('arrow 選択 → 1500ms → text に切替 → 2999ms では非表示 → +1ms で表示（タイマー再開）', async () => {
      render(<AnnotationEditor {...defaultProps} />);

      await act(async () => {
        await Promise.resolve();
      });

      // arrow に切替
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /矢印/i }));
      });
      // 1500ms 進める（arrow 用 idle の途中）
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();

      // text に切替（タイマーは再起動される）
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /テキスト/i }));
      });

      // 2999ms 進めても未表示（text の idle が新規開始したため）
      await act(async () => {
        vi.advanceTimersByTime(2999);
      });
      expect(screen.queryByTestId('annotation-guide')).not.toBeInTheDocument();

      // +1ms で表示
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByTestId('annotation-guide')).toBeInTheDocument();
      // text の場合は「タップでテキスト入力」
      expect(screen.getByTestId('annotation-guide')).toHaveTextContent('タップでテキスト入力');
    });
  });

  describe('アンマウント時のクリーンアップ (Req 29.8)', () => {
    it('アンマウント後に idle タイマーが発火しても React state 更新で警告が出ない', async () => {
      const { unmount } = render(<AnnotationEditor {...defaultProps} />);

      await act(async () => {
        await Promise.resolve();
      });

      // arrow に切替（タイマー開始）
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /矢印/i }));
      });

      // タイマー発火前にアンマウント
      unmount();

      // コンソール警告を監視
      const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // アンマウント後にタイマー閾値を越えて進める
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      // React の「unmounted component に setState」警告が出ていないこと
      const hasUnmountWarning = warnSpy.mock.calls.some((call) => {
        const msg = call[0];
        return typeof msg === 'string' && msg.includes("Can't perform a React state update");
      });
      expect(hasUnmountWarning).toBe(false);

      warnSpy.mockRestore();
    });
  });
});
