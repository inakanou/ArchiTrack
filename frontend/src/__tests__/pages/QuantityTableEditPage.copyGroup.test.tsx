/**
 * @fileoverview 数量表編集画面のグループコピー配線テスト（クライアントサイドドラフト）
 *
 * Task 61.2: 数量グループコピーをクライアントサイドドラフト化する
 *
 * コピーはサーバー POST（copyQuantityGroup）ではなく reducer の `copyGroup` アクションに
 * よるクライアントサイドのドラフト複製として行う。複製先は元グループの直下に挿入され、
 * 後続グループの displayOrder はシフトし、名前は「{元名}のコピー」、未保存（isDirty）となる。
 * 永続化は保存操作（Task 61.4）で行うため、コピー操作ではサーバーアクセスを発生させない。
 *
 * Requirements:
 * - 42.4: グループ追加・削除・コピー・並び替えはクライアント編集状態にのみ反映（保存前はサーバー非送信）
 * - 38.13: コピーは保存操作まで永続化せずクライアント編集状態に反映（直下挿入・名称・項目複製）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockCopyQuantityGroup = vi.mocked(quantityTablesApi.copyQuantityGroup);

// ============================================================================
// テストフィクスチャ
// ============================================================================

/**
 * テスト用の数量表詳細
 * 2つのグループを持ち、後続グループの displayOrder シフトを検証できる構造。
 * 元グループには項目を 1 件持たせ、項目複製を検証できるようにする。
 */
const buildInitialDetail = (): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 2,
  itemCount: 1,
  groups: [
    {
      id: 'group-a',
      quantityTableId: 'qt-123',
      name: '元グループA',
      surveyImageId: 'image-1',
      surveyImage: null,
      displayOrder: 0,
      itemCount: 1,
      items: [
        {
          id: 'item-1',
          quantityGroupId: 'group-a',
          majorCategory: '土工',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '掘削',
          name: '根切り',
          specification: null,
          calculationMethod: 'STANDARD',
          calculationParams: null,
          adjustmentFactor: 1,
          roundingUnit: 0.01,
          quantity: 10,
          unit: 'm3',
          remarks: null,
          displayOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'group-b',
      quantityTableId: 'qt-123',
      name: '別グループB',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 1,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/quantity-tables/qt-123/edit']}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * グループのコピーボタン群を取得する（aria-label="グループをコピー"）。
 */
function getCopyButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /グループをコピー/ });
}

// ============================================================================
// テストケース
// ============================================================================

describe('QuantityTableEditPage - グループコピー（クライアントサイドドラフト, Task 61.2）', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('コピー押下でサーバー copyQuantityGroup API を呼び出さない（クライアント完結・保存前は非送信）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act: 1番目のグループ（元グループA）のコピーボタンをクリック
    const copyButtons = getCopyButtons();
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    await user.click(copyButtons[0]!);

    // Assert: 複製先が画面に現れた後でも、サーバーコピー API は一度も呼ばれない
    await waitFor(() => {
      expect(screen.getByText('元グループAのコピー')).toBeInTheDocument();
    });
    expect(mockCopyQuantityGroup).not.toHaveBeenCalled();
    // 再取得（getQuantityTableDetail）も初回ロードの 1 回のみ（コピーで再取得しない）
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });

  it('複製先が元グループの直下に表示され、後続グループはシフトする（直下挿入・displayOrder シフト）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: 複製先グループが画面に表示される
    await waitFor(() => {
      expect(screen.getByText('元グループAのコピー')).toBeInTheDocument();
    });

    // 並び順: 元グループA → 元グループAのコピー → 別グループB
    const groupSections = screen.getAllByTestId('quantity-group');
    expect(groupSections).toHaveLength(3);
    expect(within(groupSections[0]!).getByText('元グループA')).toBeInTheDocument();
    expect(within(groupSections[1]!).getByText('元グループAのコピー')).toBeInTheDocument();
    expect(within(groupSections[2]!).getByText('別グループB')).toBeInTheDocument();
  });

  it('複製先に元グループの項目が複製される（配下項目の複製）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: 複製先カード内に元グループの項目名「根切り」が複製されて表示される
    await waitFor(() => {
      expect(screen.getByText('元グループAのコピー')).toBeInTheDocument();
    });
    const groupSections = screen.getAllByTestId('quantity-group');
    const copiedItemNameInputs = within(groupSections[1]!).getAllByDisplayValue('根切り');
    expect(copiedItemNameInputs.length).toBeGreaterThanOrEqual(1);
  });

  it('複製先グループ名がクリックでインライン編集可能なヘッダーとして表示される（Req 22 整合）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: 複製先グループ名ヘッダーが button role を持ち、クリックで編集 input にスワップ
    const copiedHeader = await screen.findByText('元グループAのコピー');
    expect(copiedHeader).toHaveAttribute('role', 'button');

    await user.click(copiedHeader);
    const editingInput = await screen.findByRole('textbox', { name: 'グループ名を編集' });
    expect(editingInput).toHaveValue('元グループAのコピー');
    expect(editingInput).not.toBeDisabled();
  });

  it('コピー操作ではエラーメッセージを表示しない（純粋なクライアント操作）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: 複製先が反映され、エラー alert は出ない
    await waitFor(() => {
      expect(screen.getByText('元グループAのコピー')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockCopyQuantityGroup).not.toHaveBeenCalled();
  });
});
