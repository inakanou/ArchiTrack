/**
 * @fileoverview 数量表編集画面のグループコピー配線テスト
 *
 * Task 53.3: 数量表編集画面にコピーハンドラを配線する
 *
 * Requirements:
 * - 38.7: 複製先グループを元グループの直下に挿入
 * - 38.9: コピー処理中インジケーター表示・重複操作防止
 * - 38.10: エラー時のメッセージ表示とロールバック
 * - 38.11: コピー成功後に複製先を画面に表示し編集可能状態にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import { ApiError } from '../../api/client';
import type { QuantityTableDetail, QuantityGroupInfo } from '../../types/quantity-table.types';

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
 * 2つのグループを持ち、後続グループの displayOrder シフトを検証できる構造
 */
const buildInitialDetail = (): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 2,
  itemCount: 0,
  groups: [
    {
      id: 'group-a',
      quantityTableId: 'qt-123',
      name: '元グループA',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 0,
      items: [],
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

/**
 * コピー成功時のレスポンス（QuantityGroupInfo）
 * バックエンドは元グループの直下（displayOrder = 元 + 1）に複製先を挿入する
 */
const buildCopyResponse = (): QuantityGroupInfo => ({
  id: 'group-a-copy',
  quantityTableId: 'qt-123',
  name: '元グループAのコピー',
  surveyImageId: null,
  displayOrder: 1,
  itemCount: 0,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
});

/**
 * コピー成功後の再取得用詳細
 * - group-a (displayOrder: 0)
 * - group-a-copy (displayOrder: 1)  ← 元グループ直下
 * - group-b (displayOrder: 2)        ← +1 シフト
 */
const buildAfterCopyDetail = (): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 3,
  itemCount: 0,
  groups: [
    {
      id: 'group-a',
      quantityTableId: 'qt-123',
      name: '元グループA',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'group-a-copy',
      quantityTableId: 'qt-123',
      name: '元グループAのコピー',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 1,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
    {
      id: 'group-b',
      quantityTableId: 'qt-123',
      name: '別グループB',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 2,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
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
 * 指定グループ ID のコピーボタンを取得する
 *
 * QuantityGroupCard は `data-testid="quantity-group"` の div に包まれていないため、
 * `aria-label="グループをコピー"` のボタンを「対象グループのカード内」から探す。
 * 簡易にコピーボタン群を取得して順序で特定する。
 */
function getCopyButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /グループをコピー/ });
}

// ============================================================================
// テストケース
// ============================================================================

describe('QuantityTableEditPage - グループコピー配線 (Task 53.3)', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('コピーボタン押下で copyQuantityGroup API が対象グループ ID で呼び出される', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockCopyQuantityGroup.mockResolvedValue(buildCopyResponse());
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildAfterCopyDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act: 1番目のグループ（元グループA）のコピーボタンをクリック
    const copyButtons = getCopyButtons();
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    await user.click(copyButtons[0]!);

    // Assert
    await waitFor(() => {
      expect(mockCopyQuantityGroup).toHaveBeenCalledWith('group-a');
    });
    expect(mockCopyQuantityGroup).toHaveBeenCalledTimes(1);
  });

  it('コピー成功時に再取得が走り、複製先が元グループの直下に表示される', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockCopyQuantityGroup.mockResolvedValue(buildCopyResponse());
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildAfterCopyDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: 再取得が複製成功後に走る
    await waitFor(() => {
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(2);
    });

    // 再取得後、複製先グループが画面に表示される（h3 ヘッダーとして表示）
    await waitFor(() => {
      expect(screen.getByText('元グループAのコピー')).toBeInTheDocument();
    });

    // 並び順: 元グループA → 元グループAのコピー → 別グループB
    const groupSections = screen.getAllByTestId('quantity-group');
    expect(groupSections).toHaveLength(3);
    // 1番目のカードに元グループAのヘッダー
    expect(within(groupSections[0]!).getByText('元グループA')).toBeInTheDocument();
    // 2番目のカードに複製先（直下挿入）
    expect(within(groupSections[1]!).getByText('元グループAのコピー')).toBeInTheDocument();
    // 3番目のカードは displayOrder シフト後の別グループB
    expect(within(groupSections[2]!).getByText('別グループB')).toBeInTheDocument();
  });

  it('複製先グループ名がクリックでインライン編集可能なヘッダーとして表示される（Req 22 整合）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockCopyQuantityGroup.mockResolvedValue(buildCopyResponse());
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildAfterCopyDetail());
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: 複製先グループ名のヘッダーが button role を持ち、クリック可能（編集 UI 起動可能）
    const copiedHeader = await screen.findByText('元グループAのコピー');
    // Requirement 22: 編集可能状態 — Card は isEditable + onRenameGroup を受け取っているため
    // h3 が role="button" として振る舞い、クリックで input にスワップされる
    expect(copiedHeader).toHaveAttribute('role', 'button');

    // クリックすると input にスワップされ、編集状態に入る
    await user.click(copiedHeader);
    const editingInput = await screen.findByRole('textbox', { name: 'グループ名を編集' });
    expect(editingInput).toHaveValue('元グループAのコピー');
    expect(editingInput).not.toBeDisabled();
  });

  it('コピー中はボタンが disabled になり、重複押下で API が再呼び出しされない', async () => {
    // Arrange: copyQuantityGroup を解決を遅延させて「コピー中」状態を観測
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    let resolveCopy: ((value: QuantityGroupInfo) => void) | null = null;
    mockCopyQuantityGroup.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCopy = resolve;
        })
    );
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act 1: 1回目クリック → ボタンがコピー中（disabled）に
    await user.click(getCopyButtons()[0]!);
    await waitFor(() => {
      const buttons = getCopyButtons();
      expect(buttons[0]).toBeDisabled();
    });

    // Act 2: 2回目クリック → disabled のため副作用なし
    await user.click(getCopyButtons()[0]!);
    expect(mockCopyQuantityGroup).toHaveBeenCalledTimes(1);

    // Cleanup: pending promise を解決して finally を走らせる
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildAfterCopyDetail());
    resolveCopy!(buildCopyResponse());
    await waitFor(() => {
      expect(screen.getByText('元グループAのコピー')).toBeInTheDocument();
    });
  });

  it('API 失敗時（500 系）に "グループのコピーに失敗しました" エラーメッセージが表示される', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockCopyQuantityGroup.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('グループのコピーに失敗しました');
    });
    // 再取得は走らない
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });

  it('409 レスポンス時に "他のユーザーが操作中です。再試行してください" メッセージが表示される', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockCopyQuantityGroup.mockRejectedValue(new ApiError(409, 'Conflict'));
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '他のユーザーが操作中です。再試行してください'
      );
    });
  });

  it('エラー後にコピーボタンが再有効化される（リトライ可能状態）', async () => {
    // Arrange
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockCopyQuantityGroup.mockRejectedValue(new ApiError(409, 'Conflict'));
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Act
    await user.click(getCopyButtons()[0]!);

    // Assert: エラーメッセージ表示後、ボタンは再度有効
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(getCopyButtons()[0]).not.toBeDisabled();
    });
  });
});
