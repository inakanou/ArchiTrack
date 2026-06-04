/**
 * @fileoverview 数量表編集画面のPDF出力ボタン統合テスト
 *
 * Task 41.1: 数量表編集画面にPDF出力ボタンと生成制御を実装する
 *
 * Requirements:
 * - 26.1: PDF出力操作でPDFファイル生成・ダウンロード
 * - 26.9: PDF生成中インジケーター・重複操作防止
 * - 26.10: PDF生成エラー時のエラーメッセージ表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// useBlocker をモック（データルーターなしでテストするため。Task 62.1 離脱ガード対応）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({
      state: 'unblocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    })),
  };
});

// PDF出力サービスのモック
const mockGenerateQuantityTablePdf = vi
  .fn()
  .mockResolvedValue(new Blob(['test'], { type: 'application/pdf' }));

vi.mock('../../services/export/QuantityTablePdfExportService', () => ({
  generateQuantityTablePdf: (...args: unknown[]) => mockGenerateQuantityTablePdf(...args),
  QuantityTablePdfExportService: vi.fn(),
}));

// PdfExportServiceのdownloadPdfモック
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

// APIモック
vi.mock('../../api/quantity-tables', () => ({
  getQuantityTableDetail: vi.fn().mockResolvedValue({
    id: 'qt-1',
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'テストプロジェクト' },
    name: 'テスト数量表',
    groupCount: 1,
    itemCount: 1,
    groups: [
      {
        id: 'g-1',
        quantityTableId: 'qt-1',
        name: 'グループ1',
        surveyImageId: null,
        surveyImage: null,
        displayOrder: 0,
        itemCount: 1,
        items: [
          {
            id: 'item-1',
            quantityGroupId: 'g-1',
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
      },
    ],
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
}));

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

// AnnotatedImageThumbnailをモック
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

describe('数量表編集画面 PDF出力ボタン (REQ-26.1, 26.9, 26.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ヘッダーに「PDF出力」ボタンが表示される', async () => {
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    expect(pdfButton).toBeTruthy();
  });

  it('PDF出力ボタンクリックでPDF生成関数が呼び出される', async () => {
    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    await waitFor(() => {
      expect(mockGenerateQuantityTablePdf).toHaveBeenCalledTimes(1);
    });
  });

  it('PDF生成中はボタンが無効化される (REQ-26.9)', async () => {
    // PDF生成を遅延させるモック
    let resolveGenerate: (value: Blob) => void;
    mockGenerateQuantityTablePdf.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveGenerate = resolve;
        })
    );

    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    // 生成中はボタンが無効化される
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const generating = buttons.find(
        (b) => b.textContent?.includes('PDF') && (b as HTMLButtonElement).disabled
      );
      expect(generating).toBeTruthy();
    });

    // 解決して終了
    resolveGenerate!(new Blob(['test'], { type: 'application/pdf' }));
  });

  it('PDF生成完了後にdownloadPdfが呼び出される (REQ-26.1)', async () => {
    mockGenerateQuantityTablePdf.mockResolvedValue(new Blob(['test'], { type: 'application/pdf' }));

    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    await waitFor(() => {
      expect(mockDownloadPdf).toHaveBeenCalledWith(expect.any(Blob), 'テスト数量表.pdf');
    });
  });

  it('PDF生成エラー時にエラーメッセージが表示される (REQ-26.10)', async () => {
    mockGenerateQuantityTablePdf.mockRejectedValueOnce(new Error('PDF error'));

    const user = userEvent.setup();
    renderPage();

    const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
    await user.click(pdfButton);

    await waitFor(() => {
      const errorText = screen.getByText(/PDF生成中にエラーが発生しました/);
      expect(errorText).toBeTruthy();
    });
  });
});
