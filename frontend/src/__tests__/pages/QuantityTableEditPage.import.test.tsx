/**
 * @fileoverview 数量表編集画面のインポート機能テスト
 *
 * Requirements:
 * - 27.1: インポートダイアログからの一括取り込み
 * - 42.4: インポートによる一括取り込みはクライアント編集状態にのみ反映し永続化APIを発行しない
 * - 42.6: 保存操作を行っていない状態で永続化目的のサーバーアクセスを発生させない
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

  it('インポートはクライアントドラフトにのみ反映し永続化APIを呼ばない (REQ-42.4, REQ-42.6)', async () => {
    mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

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

    // 取り込んだ項目が対象グループのドラフトへ反映される（名称が編集入力に表示される）
    await waitFor(() => {
      expect(screen.getByDisplayValue('テスト足場')).toBeInTheDocument();
    });

    // REQ-42.4 / REQ-42.6: 永続化API(createQuantityItem)は発行されず、再取得も発生しない
    // （getQuantityTableDetail は編集画面初回表示の1回のみ）
    expect(mockCreateQuantityItem).not.toHaveBeenCalled();
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });

  it('取り込みハンドラはサーバー永続化を行わずドラフト反映のみで正常終了する (REQ-42.4, REQ-42.6)', async () => {
    // 旧モデルでは操作ごとに createQuantityItem を呼び、失敗時に handleImport が throw した。
    // 新モデルでは取り込みはクライアントドラフトへの同期 dispatch のみで、永続化は保存操作時に
    // 限定されるため、取り込み自体は reject せず、サーバーAPIも発行しない（REQ-42.4 / REQ-42.6）。
    mockGetQuantityTableDetail.mockResolvedValue(mockQuantityTableDetail);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // インポートボタンをクリック
    await user.click(screen.getByRole('button', { name: 'インポート' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-import-dialog')).toBeInTheDocument();
    });

    // capturedOnImport を直接呼び、reject せず resolve することを確認
    expect(capturedOnImport).not.toBeNull();
    await expect(
      capturedOnImport!('group-1', [
        {
          majorCategory: '',
          middleCategory: '',
          minorCategory: '',
          customCategory: '',
          workType: '仮設工',
          name: '直接取込項目',
          specification: '',
          quantity: 1,
          unit: 'm',
          remarks: '',
          calculationMethod: 'STANDARD',
          adjustmentFactor: 1,
          roundingUnit: 0.01,
        },
      ])
    ).resolves.toBeUndefined();

    // ドラフトへ反映される一方、永続化API・再取得は発生しない
    await waitFor(() => {
      expect(screen.getByDisplayValue('直接取込項目')).toBeInTheDocument();
    });
    expect(mockCreateQuantityItem).not.toHaveBeenCalled();
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });
});
