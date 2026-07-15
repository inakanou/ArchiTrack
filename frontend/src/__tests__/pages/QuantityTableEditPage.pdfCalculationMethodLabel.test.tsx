/**
 * @fileoverview 数量表編集画面 PDF出力の計算方法ラベル変換テスト
 *
 * Task 68.5: PDF出力の計算方法ラベル変換をレジストリ参照へ置換する
 *
 * 従来のラベル変換はネストした三項演算子で、最終分岐が「ピッチ」固定だった。
 * このため計算方法「箇所数」（COUNT）が PDF 上で「ピッチ」と誤表示される
 * （型エラーにならない無言のフォールバック）。
 * 本テストはラベル変換が計算方法レジストリ（CALCULATION_METHOD_LABELS）を
 * 単一情報源として参照することを検証する。
 *
 * Requirements:
 * - 47.17: 計算方法「箇所数」の数量項目を含む数量表をPDF出力する場合、
 *          当該数量項目を他の計算方法の数量項目と同様に数量表内へ出力する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  CALCULATION_METHOD_ORDER,
  CALCULATION_METHOD_LABELS,
} from '../../utils/calculation-method';
import type {
  QuantityTablePdfInput,
  QuantityTablePdfItem,
} from '../../services/export/QuantityTablePdfExportService';

// useBlocker をモック（データルーターなしでテストするため）
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

// 4つの計算方法すべてを含む数量表（COUNT を含む点が本テストの主眼）
// vi.mock は巻き上げられるため、共通フィクスチャはファクトリ内で定義する
vi.mock('../../api/quantity-tables', () => {
  const baseItem = {
    quantityGroupId: 'g-1',
    majorCategory: '建築',
    middleCategory: null,
    minorCategory: null,
    customCategory: null,
    workType: '仮設',
    specification: null,
    unit: '式',
    adjustmentFactor: 1.0,
    roundingUnit: 0.01,
    quantity: 1.0,
    remarks: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    getQuantityTableDetail: vi.fn().mockResolvedValue({
      id: 'qt-1',
      projectId: 'proj-1',
      project: { id: 'proj-1', name: 'テストプロジェクト' },
      name: 'テスト数量表',
      groupCount: 1,
      itemCount: 4,
      groups: [
        {
          id: 'g-1',
          quantityTableId: 'qt-1',
          name: 'グループ1',
          surveyImageId: null,
          surveyImage: null,
          displayOrder: 0,
          itemCount: 4,
          items: [
            {
              ...baseItem,
              id: 'item-standard',
              name: '標準の項目',
              calculationMethod: 'STANDARD',
              calculationParams: null,
              displayOrder: 0,
            },
            {
              ...baseItem,
              id: 'item-area-volume',
              name: '面積・体積の項目',
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 2, depth: 3, height: 4 },
              displayOrder: 1,
            },
            {
              ...baseItem,
              id: 'item-pitch',
              name: 'ピッチの項目',
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 1,
                endLength2: 1,
                pitchLength: 2,
              },
              displayOrder: 2,
            },
            {
              ...baseItem,
              id: 'item-count',
              name: '箇所数の項目',
              calculationMethod: 'COUNT',
              calculationParams: { count: 5, length: 2, weight: 3 },
              displayOrder: 3,
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

/** PDF出力ボタンを押し、PDF生成サービスへ渡されたグループ1の数量項目を返す */
async function exportPdfAndCaptureItems(): Promise<QuantityTablePdfItem[]> {
  const user = userEvent.setup();
  renderPage();

  const pdfButton = await screen.findByRole('button', { name: /PDF出力/ }, { timeout: 5000 });
  await user.click(pdfButton);

  await waitFor(() => {
    expect(mockGenerateQuantityTablePdf).toHaveBeenCalledTimes(1);
  });

  const input = mockGenerateQuantityTablePdf.mock.calls[0]?.[0] as
    | QuantityTablePdfInput
    | undefined;
  const group = input?.groups[0];

  expect(group).toBeDefined();
  if (!group) throw new Error('PDF生成へ数量グループが渡されていない');

  return group.items;
}

/** 指定した数量項目名の、PDF出力された計算方法ラベルを返す */
function labelOf(items: QuantityTablePdfItem[], itemName: string): string {
  const item = items.find((candidate) => candidate.name === itemName);

  expect(item).toBeDefined();
  if (!item) throw new Error(`数量項目「${itemName}」がPDF出力に含まれていない`);

  return item.calculationMethod;
}

describe('数量表編集画面 PDF出力の計算方法ラベル変換 (REQ-47.17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuantityTablePdf.mockResolvedValue(new Blob(['test'], { type: 'application/pdf' }));
  });

  it('計算方法「箇所数」の数量項目は計算方法欄に「箇所数」と出力される', async () => {
    const items = await exportPdfAndCaptureItems();

    const countLabel = labelOf(items, '箇所数の項目');

    expect(countLabel).toBe('箇所数');
    // ネスト三項の最終分岐（'ピッチ' 固定）へフォールバックしていないこと
    expect(countLabel).not.toBe('ピッチ');
  });

  it('既存3方式（標準・面積・体積・ピッチ）のラベルが変わらない', async () => {
    const items = await exportPdfAndCaptureItems();

    expect(labelOf(items, '標準の項目')).toBe('標準');
    expect(labelOf(items, '面積・体積の項目')).toBe('面積・体積');
    expect(labelOf(items, 'ピッチの項目')).toBe('ピッチ');
  });

  it('レジストリに定義された全計算方法がレジストリのラベルへ変換される', async () => {
    const items = await exportPdfAndCaptureItems();
    const exportedLabels = items.map((item) => item.calculationMethod);

    // 計算方法を列挙せず、レジストリを単一情報源として全方式を検証する
    const expectedLabels = CALCULATION_METHOD_ORDER.map(
      (method) => CALCULATION_METHOD_LABELS[method]
    );

    expect(exportedLabels).toEqual(expectedLabels);
  });
});
