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

// 注釈なしの画像として扱う（注釈取得は null）
vi.mock('../../api/survey-annotations', () => ({
  getAnnotation: vi.fn().mockResolvedValue(null),
}));

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

describe('数量表PDF出力 写真埋め込み (REQ-26.1, 26.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,TEST'
    );
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
