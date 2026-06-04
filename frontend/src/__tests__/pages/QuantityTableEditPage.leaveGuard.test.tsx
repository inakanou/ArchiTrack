/**
 * @fileoverview 数量表編集画面の離脱ガードのテスト
 *
 * Task 62.1: 未保存変更時の離脱ガードを実装する（TDDテストファースト）
 *
 * Requirements:
 * - 43.1: 未保存変更がある状態でアプリ内ナビゲーションが発生したとき、確認ダイアログを表示する
 * - 43.2: 未保存変更がある状態でタブクローズ・リロード時に標準確認（beforeunload）を表示する
 * - 43.3: 確認ダイアログで「ページを離れる」を選ぶと遷移を続行する（blocker.proceed）
 * - 43.4: 確認ダイアログで「このページにとどまる」を選ぶと遷移を取り消す（blocker.reset）
 * - 43.5: 未保存変更がない（isDirty=false）場合はガードしない
 * - 43.6: 保存成功後（isDirty=false）は確認ダイアログを表示しない
 *
 * Design:
 * - design.md L166（useUnsavedChanges + useBlocker 流用）
 * - design.md L2129-2140（離脱ガード Implementation Notes）
 *
 * 設計上の理由でテストは useBlocker / useUnsavedChanges をモックする。
 * jsdom にはデータルーター連携の実遷移ブロックが無いため、既存の
 * CompanyInfoPage / ItemizedStatementDetailPage と同じ確立済みパターン
 * （useBlocker をモックして配線を検証）に準拠する。
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { QuantityTableDetail } from '../../types/quantity-table.types';

// APIモック
vi.mock('../../api/quantity-tables');
vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-annotations');
vi.mock('../../services/export/QuantityTablePdfExportService');
vi.mock('../../services/export/PdfExportService');

// useAutocompleteCandidateStore フックのモック
vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: vi.fn(() => ({
    isLoading: false,
    error: null,
    getSuggestions: vi.fn().mockReturnValue([]),
    addCandidateOnBlur: vi.fn(),
  })),
}));

// useBlocker をモック（データルーターなしでテストするため、確立済みパターン）。
// 各テストで返り値（state/proceed/reset）と isDirty 引数を制御・検証する。
const mockProceed = vi.fn();
const mockReset = vi.fn();
const mockUseBlocker = vi.fn(
  (_shouldBlock?: boolean) => ({
    state: 'unblocked' as 'unblocked' | 'blocked' | 'proceeding',
    proceed: mockProceed,
    reset: mockReset,
  })
);
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useBlocker: (shouldBlock?: boolean) => mockUseBlocker(shouldBlock),
  };
});

// useUnsavedChanges をモックし、beforeunload 連携の enabled フラグ（isDirty）を検証する。
const mockUseUnsavedChanges = vi.fn(
  (_options?: { enabled?: boolean; initialDirty?: boolean }) => ({
    isDirty: false,
    setDirty: vi.fn(),
    markAsChanged: vi.fn(),
    markAsSaved: vi.fn(),
    reset: vi.fn(),
    confirmNavigation: vi.fn().mockReturnValue(true),
  })
);
vi.mock('../../hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: (options?: { enabled?: boolean; initialDirty?: boolean }) =>
    mockUseUnsavedChanges(options),
  default: (options?: { enabled?: boolean; initialDirty?: boolean }) =>
    mockUseUnsavedChanges(options),
}));

import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockSaveQuantityTableDraft = vi.mocked(quantityTablesApi.saveQuantityTableDraft);

// テストデータ
const mockDetail: QuantityTableDetail = {
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

function renderPage(tableId = 'qt-123') {
  return render(
    <MemoryRouter initialEntries={[`/quantity-tables/${tableId}/edit`]}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 未保存状態を作る: 数量表名を変更してドラフトを dirty にする（REQ-42.2） */
async function makeDirty(user: ReturnType<typeof userEvent.setup>) {
  const nameInput = screen.getByLabelText('数量表名');
  await user.clear(nameInput);
  await user.type(nameInput, '変更後の名前');
  await user.tab(); // blur でドラフトへ反映 → isDirty=true
}

describe('QuantityTableEditPage - 離脱ガード (Task 62.1)', () => {
  beforeEach(() => {
    mockGetQuantityTableDetail.mockResolvedValue(mockDetail);
    mockUseBlocker.mockReturnValue({
      state: 'unblocked',
      proceed: mockProceed,
      reset: mockReset,
    });
    mockUseUnsavedChanges.mockImplementation(() => ({
      isDirty: false,
      setDirty: vi.fn(),
      markAsChanged: vi.fn(),
      markAsSaved: vi.fn(),
      reset: vi.fn(),
      confirmNavigation: vi.fn().mockReturnValue(true),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-43.1/43.5: isDirty に応じて useBlocker を有効化する', () => {
    it('初期（未編集）状態では useBlocker(false) で呼ばれガードしない', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });
      // 最新の useBlocker 呼び出しは false（ガード無効）
      const calls = mockUseBlocker.mock.calls;
      expect(calls[calls.length - 1]?.[0]).toBe(false);
      void user;
    });

    it('編集して未保存（isDirty=true）になると useBlocker(true) で呼ばれる', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      await makeDirty(user);

      await waitFor(() => {
        const calls = mockUseBlocker.mock.calls;
        expect(calls[calls.length - 1]?.[0]).toBe(true);
      });
    });
  });

  describe('REQ-43.2: beforeunload は isDirty のときだけ有効化する', () => {
    it('初期状態では useUnsavedChanges に enabled=false で渡される', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });
      const calls = mockUseUnsavedChanges.mock.calls;
      expect(calls[calls.length - 1]?.[0]).toMatchObject({ enabled: false });
    });

    it('未保存変更があると useUnsavedChanges に enabled=true で渡される', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      await makeDirty(user);

      await waitFor(() => {
        const calls = mockUseUnsavedChanges.mock.calls;
        expect(calls[calls.length - 1]?.[0]).toMatchObject({ enabled: true });
      });
    });
  });

  describe('REQ-43.1/43.3/43.4: blocker.state==="blocked" で確認ダイアログを表示し操作を配線する', () => {
    it('blocked のとき確認ダイアログ（UnsavedChangesDialog）が表示される', async () => {
      mockUseBlocker.mockReturnValue({
        state: 'blocked',
        proceed: mockProceed,
        reset: mockReset,
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('変更が保存されていません')).toBeInTheDocument();
      });
      expect(
        screen.getByText('変更が保存されていません。ページを離れますか？')
      ).toBeInTheDocument();
    });

    it('「ページを離れる」を押すと blocker.proceed() が呼ばれる（REQ-43.3）', async () => {
      const user = userEvent.setup();
      mockUseBlocker.mockReturnValue({
        state: 'blocked',
        proceed: mockProceed,
        reset: mockReset,
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('変更が保存されていません')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'ページを離れる' }));
      expect(mockProceed).toHaveBeenCalledTimes(1);
      expect(mockReset).not.toHaveBeenCalled();
    });

    it('「このページにとどまる」を押すと blocker.reset() が呼ばれる（REQ-43.4）', async () => {
      const user = userEvent.setup();
      mockUseBlocker.mockReturnValue({
        state: 'blocked',
        proceed: mockProceed,
        reset: mockReset,
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('変更が保存されていません')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'このページにとどまる' }));
      expect(mockReset).toHaveBeenCalledTimes(1);
      expect(mockProceed).not.toHaveBeenCalled();
    });
  });

  describe('REQ-43.5: unblocked のとき確認ダイアログを表示しない', () => {
    it('blocker.state==="unblocked" では確認ダイアログが表示されない', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });
      expect(screen.queryByText('変更が保存されていません')).not.toBeInTheDocument();
    });
  });

  describe('REQ-43.6: 保存成功後（isDirty=false）はガードしない', () => {
    it('保存成功後は useBlocker(false) で呼ばれる', async () => {
      const user = userEvent.setup();
      // 保存レスポンス（updatedAt を更新して同期 → isDirty=false）
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...mockDetail,
        updatedAt: '2025-02-01T00:00:00Z',
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      // 一度 dirty にする
      await makeDirty(user);
      await waitFor(() => {
        const calls = mockUseBlocker.mock.calls;
        expect(calls[calls.length - 1]?.[0]).toBe(true);
      });

      // 保存実行 → saveSync で isDirty=false
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        const calls = mockUseBlocker.mock.calls;
        expect(calls[calls.length - 1]?.[0]).toBe(false);
      });
    });
  });
});
