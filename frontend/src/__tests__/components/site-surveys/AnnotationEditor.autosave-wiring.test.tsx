/**
 * @fileoverview AnnotationEditor - 自動保存・復元基盤の画面結線（Task 115.81）
 *
 * Requirements:
 * - 15.4: While 注釈編集中, 一定間隔（30秒）で自動保存を実行する
 * - 15.5: When ページをリロードまたは再訪問した場合, localStorageから未保存の編集状態を復元する
 * - 15.7: If QuotaExceededErrorが発生する, then LRU戦略で古いキャッシュを削除してリトライする
 * - 15.8: If リトライ後も保存に失敗する, then 警告を表示し手動で「今すぐ保存」を促す
 * - 15.9: プライベートブラウジングモードのlocalStorage制限（SecurityError）を検出し、
 *         自動保存機能を無効化して手動保存のみで動作する
 * - 15.10: localStorageのエラー検出にクロスブラウザ対応（code===22, code===1014,
 *          name===QuotaExceededError, name===NS_ERROR_DOM_QUOTA_REACHED）を実装する
 *
 * 本ファイルは**出荷される描画経路**（`AnnotationEditor` のレンダリング）だけを入口として
 * 検証する。基盤（`AutoSaveManager` / `useAnnotationRestoration` /
 * `RestoreAnnotationDialog` / `StorageWarningBanner`）を直接組み立てて確かめると、
 * 「部品はあるが結線が無い」状態を構造的に検出できないためである。
 *
 * Boundary: 自動保存・復元基盤と注釈編集画面の結線
 *
 * @requirement site-survey/REQ-15.4
 * @requirement site-survey/REQ-15.5
 * @requirement site-survey/REQ-15.7
 * @requirement site-survey/REQ-15.8
 * @requirement site-survey/REQ-15.9
 * @requirement site-survey/REQ-15.10
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';

const STORAGE_KEY_PREFIX = 'architrack_annotation_';
const IMAGE_ID = 'test-image-id';
const SURVEY_ID = 'test-survey-id';
const DRAFT_KEY = `${STORAGE_KEY_PREFIX}${IMAGE_ID}`;

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
const {
  mockCanvasInstance,
  mockFabricImageInstance,
  mockFromURL,
  mockEnlivenObjects,
  canvasHandlers,
  canvasObjects,
} = vi.hoisted(() => {
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
  const mockEnlivenObjects = vi.fn(() => Promise.resolve([] as unknown[]));

  return {
    mockCanvasInstance,
    mockFabricImageInstance,
    mockFromURL,
    mockEnlivenObjects,
    canvasHandlers,
    canvasObjects,
  };
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
      return { type: 'mockShape' };
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
    util: { enlivenObjects: mockEnlivenObjects },
  };
});

import AnnotationEditor from '../../../components/site-surveys/AnnotationEditor';

const defaultProps = {
  imageUrl: 'https://example.com/test-image.jpg',
  imageId: IMAGE_ID,
  surveyId: SURVEY_ID,
};

/**
 * キャンバス上の注釈オブジェクトの模擬（`toObject` で永続化形へ変換される）
 */
function createAnnotationStub(id: string): Record<string, unknown> {
  return {
    type: 'rectShape',
    id,
    set: vi.fn(),
    toObject: () => ({ type: 'rectShape', id }),
  };
}

/**
 * 登録済みのキャンバスイベントを発火する
 */
function emitCanvasEvent(event: string): void {
  const handlers = canvasHandlers.get(event);
  if (!handlers || handlers.size === 0) {
    throw new Error(`キャンバスイベント '${event}' の購読者が居ない（結線されていない）`);
  }
  // Undo 連携など他の購読者も同じイベントを受け取るため、Fabric と同じ形の payload を渡す
  const payload = { target: canvasObjects[canvasObjects.length - 1] ?? { type: 'mockShape' } };
  for (const handler of [...handlers]) {
    handler(payload);
  }
}

/**
 * エディタを描画し、画像・注釈の読み込み完了まで待つ
 */
async function renderEditorAndWaitLoaded(): Promise<void> {
  render(<AnnotationEditor {...defaultProps} />);
  await waitFor(() => {
    expect(screen.queryByLabelText('読み込み中')).toBeNull();
  });
}

/**
 * DOMException 互換のストレージエラーを作る（jsdom の DOMException は code を持たない
 * 名前があるため、name / code の双方を明示した最小実体を使う）
 */
function createStorageError(name: string, code: number): Error {
  const error = new Error(name);
  error.name = name;
  (error as Error & { code: number }).code = code;
  return error;
}

let setItemSpy: ReturnType<typeof vi.spyOn> | null = null;

/**
 * 注釈下書きキーへの書き込みだけを失敗させる
 *
 * @param error 送出するエラー
 * @param failTimes 失敗させる回数（`Infinity` で常に失敗）
 */
function failAnnotationWrites(error: Error, failTimes: number): { count: () => number } {
  const original = Storage.prototype.setItem;
  let failures = 0;
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string
  ) {
    if (key.startsWith(STORAGE_KEY_PREFIX) && failures < failTimes) {
      failures += 1;
      throw error;
    }
    original.call(this, key, value);
  });
  return { count: () => failures };
}

beforeEach(() => {
  vi.clearAllMocks();
  canvasHandlers.clear();
  canvasObjects.length = 0;
  localStorage.clear();
  mockCanvasInstance.backgroundImage = null;
  mockCanvasInstance.getWidth.mockReturnValue(800);
  mockCanvasInstance.getHeight.mockReturnValue(600);
  mockFromURL.mockResolvedValue(mockFabricImageInstance);
  mockEnlivenObjects.mockResolvedValue([]);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setItemSpy?.mockRestore();
  setItemSpy = null;
  localStorage.clear();
});

describe('AnnotationEditor - 自動保存の結線 (Req 15.4)', () => {
  it('注釈を追加してから30秒経過するとlocalStorageへ自動保存される', async () => {
    await renderEditorAndWaitLoaded();

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });

    // 30秒未満では保存されない（一定間隔＝30秒であることの検証）
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    const stored = localStorage.getItem(DRAFT_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as {
      imageId: string;
      surveyId: string;
      annotationData: { objects: { id: string }[]; canvasWidth: number; canvasHeight: number };
    };
    expect(parsed.imageId).toBe(IMAGE_ID);
    expect(parsed.surveyId).toBe(SURVEY_ID);
    expect(parsed.annotationData.objects.map((o) => o.id)).toEqual(['rect-1']);
    expect(parsed.annotationData.canvasWidth).toBe(800);
    expect(parsed.annotationData.canvasHeight).toBe(600);
  });

  it('注釈の変更・削除でも自動保存が起動する', async () => {
    await renderEditorAndWaitLoaded();

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:modified');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    localStorage.clear();
    canvasObjects.length = 0;
    act(() => {
      emitCanvasEvent('object:removed');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('描き続けている最中でも一定間隔で自動保存される', async () => {
    await renderEditorAndWaitLoaded();

    const savedObjectCounts: number[] = [];

    // 5秒ごとに図形を描き足し続ける（＝間隔30秒より短い間隔で操作が届き続ける）
    for (let step = 1; step <= 18; step += 1) {
      canvasObjects.push(createAnnotationStub(`rect-${step}`));
      act(() => {
        emitCanvasEvent('object:added');
      });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });

      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as { annotationData: { objects: { id: string }[] } };
        savedObjectCounts.push(parsed.annotationData.objects.length);
        localStorage.removeItem(DRAFT_KEY);
      }
    }

    // 90秒描き続けたあいだに 30秒間隔で3回保存されている（手を止めていない）
    expect(savedObjectCounts).toHaveLength(3);
    // 各回の保存はその時点までの図形を含む（保存が進行している）
    expect(savedObjectCounts[0]).toBeLessThan(savedObjectCounts[1]!);
    expect(savedObjectCounts[1]).toBeLessThan(savedObjectCounts[2]!);
  });

  it('編集が止まれば保存も止まり、変更が無い間は書き込まない', async () => {
    await renderEditorAndWaitLoaded();

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    // 保存済みの下書きを消し、以後は編集しない。周期が回っても書き込みは起こらない
    localStorage.removeItem(DRAFT_KEY);
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('閲覧モード（readOnly）では自動保存を起動しない', async () => {
    render(<AnnotationEditor {...defaultProps} readOnly />);
    await waitFor(() => {
      expect(screen.queryByLabelText('読み込み中')).toBeNull();
    });

    // 閲覧モードでも Undo 連携などが object:added を購読する。自動保存だけが起動しないことを見る
    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('AnnotationEditor - 未保存データの復元 (Req 15.5)', () => {
  function seedDraft(objects: { type: string; id: string }[]): void {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        imageId: IMAGE_ID,
        surveyId: SURVEY_ID,
        annotationData: {
          version: '1.0',
          objects,
          canvasWidth: 800,
          canvasHeight: 600,
        },
        savedAt: '2026-02-01T10:00:00.000Z',
        serverUpdatedAt: null,
      })
    );
  }

  it('未保存の下書きがある状態で開くと復元確認ダイアログが表示される', async () => {
    seedDraft([{ type: 'rectShape', id: 'draft-1' }]);

    await renderEditorAndWaitLoaded();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('未保存のデータがあります');
    expect(dialog).toHaveTextContent('注釈数: 1個');
  });

  it('「復元する」を押すと下書きの注釈がキャンバスへ適用される', async () => {
    seedDraft([{ type: 'rectShape', id: 'draft-1' }]);
    const restoredStub = { type: 'rectShape', set: vi.fn() };
    mockEnlivenObjects.mockResolvedValue([restoredStub]);

    await renderEditorAndWaitLoaded();
    await screen.findByRole('dialog');

    const addCallsBefore = mockCanvasInstance.add.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '復元する' }));
    });

    await waitFor(() => {
      expect(mockEnlivenObjects).toHaveBeenCalledWith([{ type: 'rectShape', id: 'draft-1' }]);
    });
    await waitFor(() => {
      expect(mockCanvasInstance.add.mock.calls.length).toBe(addCallsBefore + 1);
    });
    expect(mockCanvasInstance.add).toHaveBeenLastCalledWith(restoredStub);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('「破棄する」を押すと下書きが削除されダイアログが閉じる', async () => {
    seedDraft([{ type: 'rectShape', id: 'draft-1' }]);

    await renderEditorAndWaitLoaded();
    await screen.findByRole('dialog');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '破棄する' }));
    });

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('下書きが無ければ復元確認ダイアログは表示されない', async () => {
    await renderEditorAndWaitLoaded();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AnnotationEditor - QuotaExceededError の扱い (Req 15.7, 15.8, 15.10)', () => {
  /**
   * LRU の削除順序を判別できる下書きの母集団を積む（対象画像とは別IDのエントリ）
   *
   * 要件15.7 が名指しするのは「古いキャッシュを削除する」ことである。古い下書きだけを
   * 積むと、古い順に消しても新しい順に消しても任意の順に消しても同じ結果になり、主張が
   * 削除順序を判別できない。消えてはならない新しい下書きを母集団へ混ぜる。
   *
   * 積む順序は新しいものを先にする。localStorage の列挙は挿入順であり、savedAt での
   * 並べ替えを省いた実装（挿入順のまま先頭から消す）でも主張が崩れるようにするためである。
   */
  function seedDraftsForLruOrdering(
    oldCount: number,
    freshCount: number
  ): { oldKeys: string[]; freshKeys: string[] } {
    const write = (imageId: string, savedAt: Date): string => {
      const key = `${STORAGE_KEY_PREFIX}${imageId}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          imageId,
          surveyId: SURVEY_ID,
          annotationData: { version: '1.0', objects: [] },
          savedAt: savedAt.toISOString(),
          serverUpdatedAt: null,
        })
      );
      return key;
    };

    // 新しいものを先に積む（挿入順＝新しい順）
    const freshKeys: string[] = [];
    for (let i = 0; i < freshCount; i++) {
      freshKeys.push(write(`fresh-${i}`, new Date(2035, 0, i + 1)));
    }
    const oldKeys: string[] = [];
    for (let i = 0; i < oldCount; i++) {
      oldKeys.push(write(`old-${i}`, new Date(2020, 0, i + 1)));
    }
    return { oldKeys, freshKeys };
  }

  /** localStorage 上の自動保存下書きキーを列挙する */
  function readDraftKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }

  it('QuotaExceededError発生時は古いキャッシュを削除してリトライし保存が成立する (Req 15.7)', async () => {
    await renderEditorAndWaitLoaded();

    // 本番は容量超過時に古い方から3件を削除する（AutoSaveManager.clearOldestEntries(3)）。
    // 削除件数と同じ3件の古い下書きに加えて、消えてはならない新しい下書きを2件積む。
    const { oldKeys, freshKeys } = seedDraftsForLruOrdering(3, 2);
    expect(readDraftKeys().sort()).toEqual([...oldKeys, ...freshKeys].sort());
    const failure = failAnnotationWrites(createStorageError('QuotaExceededError', 22), 1);

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // 1回目は失敗し、LRUで古いエントリを削除してからリトライして成功する
    expect(failure.count()).toBe(1);
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    // 消えるのは古い3件だけであり、新しい2件は残る
    // （新しい順・任意順で消す実装ではここが崩れる）
    expect(readDraftKeys().sort()).toEqual([...freshKeys, DRAFT_KEY].sort());
    expect(screen.queryByText('自動保存に失敗しました')).toBeNull();
  });

  it('リトライ後も失敗すると警告帯を表示し「今すぐ保存」を促す (Req 15.8)', async () => {
    await renderEditorAndWaitLoaded();

    failAnnotationWrites(createStorageError('QuotaExceededError', 22), Number.POSITIVE_INFINITY);

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveAttribute('data-warning-type', 'quota-exceeded');
    expect(banner).toHaveTextContent('自動保存に失敗しました');
    expect(screen.getByRole('button', { name: '今すぐ保存' })).toBeInTheDocument();
  });

  it('「今すぐ保存」を押すとサーバー保存が実行される (Req 15.8)', async () => {
    const { saveAnnotation } = await import('../../../api/survey-annotations');

    await renderEditorAndWaitLoaded();

    failAnnotationWrites(createStorageError('QuotaExceededError', 22), Number.POSITIVE_INFINITY);

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    await screen.findByRole('button', { name: '今すぐ保存' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '今すぐ保存' }));
    });

    await waitFor(() => {
      expect(saveAnnotation).toHaveBeenCalledTimes(1);
    });
    expect((saveAnnotation as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(IMAGE_ID);
  });

  it('Firefox形式のエラー（code===1014 / NS_ERROR_DOM_QUOTA_REACHED）も容量超過として扱う (Req 15.10)', async () => {
    await renderEditorAndWaitLoaded();

    // Req 15.7 と同じ判別可能な母集団を使う（古い3件＋残るべき新しい2件）
    const { oldKeys, freshKeys } = seedDraftsForLruOrdering(3, 2);
    expect(readDraftKeys().sort()).toEqual([...oldKeys, ...freshKeys].sort());
    const failure = failAnnotationWrites(createStorageError('NS_ERROR_DOM_QUOTA_REACHED', 1014), 1);

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(failure.count()).toBe(1);
    // 名前が QuotaExceededError でなくても LRU リトライ経路へ入り、保存が成立する
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    // 消えるのは古い3件だけであり、新しい2件は残る
    expect(readDraftKeys().sort()).toEqual([...freshKeys, DRAFT_KEY].sort());
  });

  it('Firefox形式のエラーでリトライ後も失敗すると警告帯を表示する (Req 15.10)', async () => {
    await renderEditorAndWaitLoaded();

    failAnnotationWrites(
      createStorageError('NS_ERROR_DOM_QUOTA_REACHED', 1014),
      Number.POSITIVE_INFINITY
    );

    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveAttribute('data-warning-type', 'quota-exceeded');
  });
});

describe('AnnotationEditor - プライベートブラウジングモード (Req 15.9)', () => {
  it('SecurityErrorを検出すると自動保存を無効化し警告帯を表示する', async () => {
    // localStorage への書き込みが常に SecurityError になる環境を再現する
    const strictSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw createStorageError('SecurityError', 18);
    });
    setItemSpy = strictSpy;

    await renderEditorAndWaitLoaded();

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveAttribute('data-warning-type', 'private-browsing');
    expect(banner).toHaveTextContent('自動保存が無効です');

    // 自動保存は無効なので、編集しても下書きは書き込まれない（手動保存のみで動作する）
    canvasObjects.push(createAnnotationStub('rect-1'));
    act(() => {
      emitCanvasEvent('object:added');
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    strictSpy.mockRestore();
    setItemSpy = null;
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('「今後表示しない」を選ぶと編集セッションの間は再表示しない', async () => {
    const strictSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw createStorageError('SecurityError', 18);
    });
    setItemSpy = strictSpy;

    const { rerender } = render(<AnnotationEditor {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByLabelText('読み込み中')).toBeNull();
    });
    await screen.findByRole('alert');

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: '今後表示しない' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();

    // 閲覧モードへ切り替えて戻す（警告帯の判定 effect が再実行される経路）
    await act(async () => {
      rerender(<AnnotationEditor {...defaultProps} readOnly />);
    });
    await act(async () => {
      rerender(<AnnotationEditor {...defaultProps} />);
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    strictSpy.mockRestore();
    setItemSpy = null;
  });

  it('警告帯は閉じられる（手動保存の導線は維持される）', async () => {
    const strictSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw createStorageError('SecurityError', 18);
    });
    setItemSpy = strictSpy;

    await renderEditorAndWaitLoaded();
    await screen.findByRole('alert');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();

    strictSpy.mockRestore();
    setItemSpy = null;
  });
});
