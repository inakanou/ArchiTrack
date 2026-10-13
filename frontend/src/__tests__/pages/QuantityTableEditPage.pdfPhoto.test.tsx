/**
 * @fileoverview 数量表PDF出力の写真埋め込み回帰テスト
 *
 * バグ修正: 数量グループが複数あり写真が紐付いている状態でPDF出力すると、
 * 画面に表示済み（可視）のグループの写真だけが欠落する事象。
 * 原因は、画面表示の <img>（crossOrigin 無し）がキャッシュした非CORSレスポンスを、
 * PDF生成側が crossOrigin='anonymous' で再取得しCORS不整合で失敗していたこと。
 * 修正後はPDF生成側が fetch（mode:'cors'）でバイト列を取得し object URL 経由でロードするため、
 * 表示側キャッシュと独立に全グループの写真をレンダリングできる。
 *
 * Requirements: 26.1, 26.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
  };
});

// PDF出力サービスのモック（生成入力を検査するため引数を保持）
const mockGenerateQuantityTablePdf = vi
  .fn()
  .mockResolvedValue(new Blob(['test'], { type: 'application/pdf' }));

vi.mock('../../services/export/QuantityTablePdfExportService', () => ({
  generateQuantityTablePdf: (...args: unknown[]) => mockGenerateQuantityTablePdf(...args),
  QuantityTablePdfExportService: vi.fn(),
}));

const mockDownloadPdf = vi.fn();
vi.mock('../../services/export/PdfExportService', () => ({
  downloadPdf: (...args: unknown[]) => mockDownloadPdf(...args),
  PdfExportService: vi.fn(),
  PDF_EXPORT_PHASES: {
    INITIALIZING: 'initializing',
    GENERATING: 'generating',
    FINALIZING: 'finalizing',
    COMPLETE: 'complete',
  },
}));

// 注釈取得はテストごとに差し替える（既定は注釈なし = null）
const mockGetAnnotation = vi.fn().mockResolvedValue(null);
vi.mock('../../api/survey-annotations', () => ({
  getAnnotation: (...args: unknown[]) => mockGetAnnotation(...args),
}));

// Fabric.js は jsdom 上で実描画できないため、注釈ありの復元経路を観測できる最小モックへ差し替える。
// 注釈なし経路（既存テスト）は fabric を経由しないため影響を受けない。
vi.mock('fabric', () => {
  class MockCanvas {
    backgroundImage: unknown = null;
    add = vi.fn();
    renderAll = vi.fn();
    toDataURL = vi.fn(() => 'data:image/jpeg;base64,FABRIC');
    dispose = vi.fn();
  }
  class MockFabricImage {
    img: unknown;
    constructor(img: unknown) {
      this.img = img;
    }
  }
  return {
    Canvas: MockCanvas,
    FabricImage: MockFabricImage,
    util: { enlivenObjects: vi.fn().mockResolvedValue([]) },
  };
});

const GROUP_COUNT = 6;

vi.mock('../../api/quantity-tables', () => {
  // 写真付きの数量グループを生成する（originalUrl は別オリジンの署名付きURLを模す）。
  // vi.mock はホイストされるため、ヘルパーは factory 内に自己完結させる。
  const buildGroupWithPhoto = (index: number) => ({
    id: `g-${index}`,
    quantityTableId: 'qt-1',
    name: `グループ${index}`,
    surveyImageId: `img-${index}`,
    surveyImage: {
      id: `img-${index}`,
      thumbnailUrl: `https://signed.example.com/thumb-${index}.jpg?sig=x`,
      originalUrl: `https://signed.example.com/original-${index}.jpg?sig=x`,
      fileName: `photo-${index}.jpg`,
      hasAnnotations: false,
      annotatedThumbnailUrl: null,
      comment: null,
    },
    displayOrder: index,
    itemCount: 1,
    items: [
      {
        id: `item-${index}`,
        quantityGroupId: `g-${index}`,
        majorCategory: '建築',
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '仮設',
        name: 'テスト',
        specification: null,
        unit: '式',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1.0,
        roundingUnit: 0.01,
        quantity: 1.0,
        remarks: null,
        displayOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  return {
    getQuantityTableDetail: vi.fn().mockResolvedValue({
      id: 'qt-1',
      projectId: 'proj-1',
      project: { id: 'proj-1', name: 'テストプロジェクト' },
      name: 'テスト数量表',
      groupCount: 6,
      itemCount: 6,
      groups: Array.from({ length: 6 }, (_, i) => buildGroupWithPhoto(i)),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    createQuantityGroup: vi.fn(),
    deleteQuantityGroup: vi.fn(),
    updateQuantityGroup: vi.fn(),
    createQuantityItem: vi.fn(),
    deleteQuantityItem: vi.fn(),
    copyQuantityItem: vi.fn(),
    updateQuantityTable: vi.fn(),
    saveQuantityTableDraft: vi.fn(),
    updateGroupDisplayOrder: vi.fn(),
    updateItemDisplayOrder: vi.fn(),
  };
});

vi.mock('../../api/site-surveys', () => ({
  getSiteSurveys: vi.fn().mockResolvedValue({ data: [] }),
  getSiteSurvey: vi.fn(),
}));

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: () => ({
    isLoading: false,
    error: null,
    getSuggestions: () => [],
    addCandidateOnBlur: () => {},
  }),
}));

// 画面表示のサムネイルは本テストの対象外（PDF生成経路のみ検証）
vi.mock('../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: () => <img data-testid="annotated-image-thumbnail" alt="mock" />,
  default: () => <img data-testid="annotated-image-thumbnail" alt="mock" />,
}));

import { util } from 'fabric';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/qt-1']}>
      <Routes>
        <Route
          path="/projects/:projectId/quantity-tables/:id"
          element={<QuantityTableEditPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * PDF出力経路の共通スタブ環境を組み立てる
 *
 * 画像の取得（fetch / object URL / Image）と canvas の 2D コンテキストは jsdom で
 * 動作しないため、両 describe から同じ手順で用意する。
 */
function setupPdfExportEnvironment(): void {
  vi.clearAllMocks();
  // 既定は注釈なし（fabric 経路を通らない）
  mockGetAnnotation.mockResolvedValue(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
  vi.mocked(util.enlivenObjects).mockResolvedValue([] as any);

  // fetch: 画像バイト列を返す（mode:'cors' での取得を模す）
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob(['imgbytes'], { type: 'image/jpeg' }),
  });
  vi.stubGlobal('fetch', fetchMock);

  // object URL の生成・解放をスタブ
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock-object-url'),
    revokeObjectURL: vi.fn(),
  });

  // Image: src 設定後に onload を発火し、幅・高さを持つ
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 100;
    height = 80;
    crossOrigin = '';
    private _src = '';
    set src(value: string) {
      this._src = value;
      // 非同期に onload を発火
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this._src;
    }
  }
  vi.stubGlobal('Image', MockImage as unknown as typeof Image);

  // canvas 2D コンテキストと toDataURL をスタブ（jsdom は未実装）
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,TEST');
}

describe('数量表PDF出力 写真埋め込み (REQ-26.1, 26.5)', () => {
  beforeEach(() => {
    setupPdfExportEnvironment();
  });

  it('全グループの写真を fetch(mode:cors) で取得し photoDataUrl 付きでPDF生成に渡す', async () => {
    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    await waitFor(() => {
      expect(mockGenerateQuantityTablePdf).toHaveBeenCalledTimes(1);
    });

    // fetch が各グループの originalUrl に対して CORS モードで呼ばれること
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      'https://signed.example.com/original-0.jpg?sig=x',
      expect.objectContaining({ mode: 'cors' })
    );
    expect(fetchMock).toHaveBeenCalledTimes(GROUP_COUNT);

    // 生成入力の全グループに photoDataUrl が埋め込まれていること（写真欠落がないこと）
    const pdfInput = mockGenerateQuantityTablePdf.mock.calls[0]![0] as {
      groups: Array<{ photoDataUrl: string | null }>;
    };
    expect(pdfInput.groups).toHaveLength(GROUP_COUNT);
    for (const group of pdfInput.groups) {
      expect(group.photoDataUrl).toBe('data:image/jpeg;base64,TEST');
    }
  });
});

/**
 * 数量表PDF出力の注釈復元における表示倍率の適用先（Task 115.110 / Req 32.2, 32.8）
 *
 * 要件 32.8 はサムネイル・プレビュー・PDF・個別エクスポート・一括エクスポートを同列に扱う。
 * 本経路（renderAnnotatedImageToDataUrl）も `util.enlivenObjects` で現場調査の注釈を復元し
 * `toDataURL` で書き出すため、書き出し経路の 5 箇所目にあたる。
 */
describe('数量表PDF出力 注釈復元の倍率適用先 (REQ-32.2, 32.8)', () => {
  beforeEach(() => {
    setupPdfExportEnvironment();
  });

  /** 保存時 200x320 / 描画時 100x80 → scaleX = 0.5, scaleY = 0.25, 平均 0.375 */
  const SAVED_CANVAS_WIDTH = 200;
  const SAVED_CANVAS_HEIGHT = 320;
  const SCALE_X = 0.5;
  const SCALE_Y = 0.25;
  const AVERAGE_SCALE = (SCALE_X + SCALE_Y) / 2;

  const INPUT_BODY_STROKE_WIDTH = 4;
  const INPUT_OUTLINE_WIDTH_PX = 3;

  interface MockGroupShape extends Record<string, unknown> {
    childOutline: Record<string, unknown>;
    childBody: Record<string, unknown>;
    getObjects: () => readonly unknown[];
  }

  /**
   * 集合体として復元された注釈のモック
   *
   * 本番（七形状の構築処理）と同じく子は `[outline*, body*]` の順で、集合体自身へ本体線幅を
   * 複写（後方互換のミラー）した状態を再現する。
   */
  function createMockGroupShape(): MockGroupShape {
    const childOutline: Record<string, unknown> = {
      type: 'path',
      stroke: '#ffffff',
      strokeWidth: INPUT_BODY_STROKE_WIDTH + INPUT_OUTLINE_WIDTH_PX * 2,
    };
    const childBody: Record<string, unknown> = {
      type: 'path',
      stroke: '#ef4444',
      strokeWidth: INPUT_BODY_STROKE_WIDTH,
    };
    const children = [childOutline, childBody];

    const obj: MockGroupShape = {
      type: 'arrow',
      left: 100,
      top: 50,
      scaleX: 1,
      scaleY: 1,
      // 集合体本体へ複写された線幅（本体線幅と同じ値）
      strokeWidth: INPUT_BODY_STROKE_WIDTH,
      stroke: '#ef4444',
      childOutline,
      childBody,
      getObjects: () => children,
      set(this: Record<string, unknown>, options: Record<string, unknown>) {
        Object.assign(this, options);
        return this;
      },
    };
    return obj;
  }

  it('集合体注釈の複写線幅は実描画の本体線幅と同じ座標系に保たれる', async () => {
    mockGetAnnotation.mockResolvedValue({
      id: 'annotation-1',
      imageId: 'img-0',
      data: {
        version: '1.0',
        objects: [{ type: 'arrow', stroke: '#ef4444', strokeWidth: INPUT_BODY_STROKE_WIDTH }],
        canvasWidth: SAVED_CANVAS_WIDTH,
        canvasHeight: SAVED_CANVAS_HEIGHT,
      },
      version: '1.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    // 復元されるたびに新しいモックを返し、観測対象として記録する
    const restoredShapes: MockGroupShape[] = [];
    vi.mocked(util.enlivenObjects).mockImplementation(async () => {
      const shape = createMockGroupShape();
      restoredShapes.push(shape);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      return [shape] as any;
    });

    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    await waitFor(() => {
      expect(mockGenerateQuantityTablePdf).toHaveBeenCalledTimes(1);
    });

    // 全グループで注釈復元経路（fabric）を通っていること
    expect(restoredShapes).toHaveLength(GROUP_COUNT);
    const pdfInput = mockGenerateQuantityTablePdf.mock.calls[0]![0] as {
      groups: Array<{ photoDataUrl: string | null }>;
    };
    for (const group of pdfInput.groups) {
      expect(group.photoDataUrl).toBe('data:image/jpeg;base64,FABRIC');
    }

    for (const shape of restoredShapes) {
      // 表示倍率は集合体の scaleX / scaleY が担う（当該分岐が実際に適用されたことの確認）
      expect(shape.scaleX).toBeCloseTo(SCALE_X, 10);
      expect(shape.scaleY).toBeCloseTo(SCALE_Y, 10);
      // 実描画（子）の線幅は入力値のまま。分母をここで厳密に固定する
      expect(shape.childBody.strokeWidth).toBe(INPUT_BODY_STROKE_WIDTH);
      expect(shape.childOutline.strokeWidth).toBe(
        INPUT_BODY_STROKE_WIDTH + INPUT_OUTLINE_WIDTH_PX * 2
      );
      // 複写値は実描画の本体線幅と一致する（平均倍率を重ねて掛けない）
      expect(shape.strokeWidth).toBe(shape.childBody.strokeWidth);
      expect(shape.strokeWidth).toBe(INPUT_BODY_STROKE_WIDTH);
      // 位置は従来どおり倍率が掛かる
      expect(shape.left).toBeCloseTo(100 * SCALE_X, 10);
      expect(shape.top).toBeCloseTo(50 * SCALE_Y, 10);
    }
  });

  it('自身の線で描かれるテキスト注釈の線幅には従来どおり平均倍率が掛かる', async () => {
    mockGetAnnotation.mockResolvedValue({
      id: 'annotation-1',
      imageId: 'img-0',
      data: {
        version: '1.0',
        objects: [{ type: 'textAnnotation', text: 'サンプル' }],
        canvasWidth: SAVED_CANVAS_WIDTH,
        canvasHeight: SAVED_CANVAS_HEIGHT,
      },
      version: '1.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const INPUT_TEXT_STROKE_WIDTH = 24 * 0.12;
    const restoredTexts: Record<string, unknown>[] = [];
    vi.mocked(util.enlivenObjects).mockImplementation(async () => {
      // 集合体ではない（getObjects を持たない）注釈
      const obj: Record<string, unknown> = {
        type: 'textAnnotation',
        left: 100,
        top: 50,
        scaleX: 1,
        scaleY: 1,
        strokeUniform: true,
        strokeWidth: INPUT_TEXT_STROKE_WIDTH,
        set(this: Record<string, unknown>, options: Record<string, unknown>) {
          Object.assign(this, options);
          return this;
        },
      };
      restoredTexts.push(obj);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      return [obj] as any;
    });

    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    await waitFor(() => {
      expect(mockGenerateQuantityTablePdf).toHaveBeenCalledTimes(1);
    });

    expect(restoredTexts).toHaveLength(GROUP_COUNT);
    for (const obj of restoredTexts) {
      expect(obj.strokeWidth).toBeCloseTo(INPUT_TEXT_STROKE_WIDTH * AVERAGE_SCALE, 10);
      expect(obj.strokeWidth).not.toBeCloseTo(INPUT_TEXT_STROKE_WIDTH, 10);
    }
  });
});
