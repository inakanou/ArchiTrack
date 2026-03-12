/**
 * @fileoverview 数量表編集画面のインポート機能テスト
 *
 * Requirements:
 * - 27.1: インポートダイアログからの一括取り込み
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import type { QuantityTableDetail } from '../../types/quantity-table.types';

// APIモック
vi.mock('../../api/quantity-tables');
vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-annotations');
vi.mock('../../services/export/QuantityTablePdfExportService');
vi.mock('../../services/export/PdfExportService');

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: vi.fn(() => ({
    isLoading: false,
    error: null,
    getSuggestions: vi.fn().mockReturnValue([]),
    addCandidateOnBlur: vi.fn(),
  })),
}));

// ImportDialogをモック化して、onImportを直接呼べるようにする
let capturedOnImport: ((groupId: string, items: unknown[]) => Promise<void>) | null = null;
vi.mock('../../components/quantity-table-import/ImportDialog', () => ({
  ImportDialog: ({
    isOpen,
    onImport,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onImport: (groupId: string, items: unknown[]) => Promise<void>;
    groups: unknown[];
  }) => {
    capturedOnImport = onImport;
    if (!isOpen) return null;
    return (
      <div data-testid="mock-import-dialog">
        <button
          data-testid="trigger-import"
          onClick={() =>
            onImport('group-1', [
              {
                majorCategory: '共通仮設',
                middleCategory: '',
                minorCategory: '',
                customCategory: '',
                workType: '仮設工',
                name: 'テスト足場',
                specification: '',
                quantity: 50,
                unit: 'm2',
                remarks: '',
                calculationMethod: 'STANDARD',
                adjustmentFactor: 1,
                roundingUnit: 0.01,
              },
            ])
          }
        >
          テスト取り込み
        </button>
      </div>
    );
  },
}));

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockCreateQuantityItem = vi.mocked(quantityTablesApi.createQuantityItem);

const mockQuantityTableDetail: QuantityTableDetail = {
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 1,
  itemCount: 1,
  groups: [
    {
      id: 'group-1',
      quantityTableId: 'qt-123',
      name: 'グループ1',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 1,
      items: [
        {
          id: 'item-1',
          quantityGroupId: 'group-1',
          majorCategory: '共通仮設',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '仮設工',
          name: '足場',
          specification: null,
          unit: 'm2',
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
          quantity: 100,
          remarks: null,
          displayOrder: 0,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/quantity-tables/qt-123/edit']}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('QuantityTableEditPage - インポート機能', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnImport = null;
  });

  it('インポートボタンをクリックするとダイアログが開き、取り込みを実行できる', async () => {
    mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
    mockCreateQuantityItem.mockResolvedValue({
      id: 'new-item-1',
      quantityGroupId: 'group-1',
      majorCategory: '共通仮設',
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '仮設工',
      name: 'テスト足場',
      specification: null,
      unit: 'm2',
      calculationMethod: 'STANDARD',
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 50,
      remarks: null,
      displayOrder: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // インポートボタンをクリック
    const importButton = screen.getByRole('button', { name: 'インポート' });
    await user.click(importButton);

    // モックダイアログが表示される
    await waitFor(() => {
      expect(screen.getByTestId('mock-import-dialog')).toBeInTheDocument();
    });

    // 取り込みを実行
    const triggerButton = screen.getByTestId('trigger-import');
    await user.click(triggerButton);

    // createQuantityItemが呼ばれることを確認
    await waitFor(() => {
      expect(mockCreateQuantityItem).toHaveBeenCalledWith(
        'group-1',
        expect.objectContaining({
          workType: '仮設工',
          name: 'テスト足場',
          quantity: 50,
          unit: 'm2',
        })
      );
    });
  });

  it('インポート失敗時にエラーがスローされる', async () => {
    mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);
    mockCreateQuantityItem.mockRejectedValue(new Error('Create failed'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // インポートボタンをクリック
    await user.click(screen.getByRole('button', { name: 'インポート' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-import-dialog')).toBeInTheDocument();
    });

    // capturedOnImportを直接呼んでエラーを確認
    expect(capturedOnImport).not.toBeNull();
    await expect(
      capturedOnImport!('group-1', [
        {
          majorCategory: '',
          middleCategory: '',
          minorCategory: '',
          customCategory: '',
          workType: '仮設工',
          name: 'テスト',
          specification: '',
          quantity: 1,
          unit: 'm',
          remarks: '',
          calculationMethod: 'STANDARD',
          adjustmentFactor: 1,
          roundingUnit: 0.01,
        },
      ])
    ).rejects.toThrow('インポートに失敗しました');
  });
});
