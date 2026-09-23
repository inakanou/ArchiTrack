/**
 * @fileoverview 数量表編集画面のタブクローズ/リロード離脱確認（beforeunload）のテスト
 *
 * Task 100.13: REQ-43.2 が除外に在籍したまま本番に実装されていない状態を解消する
 *
 * Requirements:
 * - 43.2: 未保存変更がある状態でタブクローズ・リロード操作に対してブラウザ標準の離脱確認を表示する
 * - 43.5: 未保存変更が存在しない状態では離脱時に警告を表示しない（本ファイルの陰性対照）
 *
 * 既存の `QuantityTableEditPage.leaveGuard.test.tsx` は `useUnsavedChanges` を**モックして**
 * 「`enabled: isDirty` が渡されること」だけを検査していた。その検査は緑のままで、実際には
 * beforeunload リスナーが一度も登録されない状態が本番に残っていた（フック内部の dirty 状態が
 * 真にならないため。Task 100.13 の測定）。したがって本ファイルは **`useUnsavedChanges` を
 * モックせず実物を使い**、window に beforeunload を dispatch して `defaultPrevented` を
 * 観測する。これは「フックへ何を渡したか」ではなく「離脱時にブラウザへ警告を要求するか」を
 * 測る判定である。
 *
 * 限界: jsdom はネイティブの離脱確認ダイアログを描画しないため、観測できるのは
 * 「既定動作の抑止（＝ブラウザに確認を出させる要求）」までである。ブラウザが実際に確認を
 * 描画することまでは実ブラウザの E2E
 * （`e2e/specs/quantity-tables/edit-guard-indicator-sticky-header-e2e.spec.ts`）で測る。
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

// useBlocker のみモックする（MemoryRouter はデータルーターではないため）。
// 本ファイルの検査対象である `useUnsavedChanges` は**モックしない**。
const mockProceed = vi.fn();
const mockReset = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useBlocker: () => ({
      state: 'unblocked' as const,
      proceed: mockProceed,
      reset: mockReset,
    }),
  };
});

import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);

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

/**
 * window へ beforeunload を dispatch し、既定動作が抑止されたか（＝ブラウザ標準の
 * 離脱確認を要求したか）を返す。
 */
function dispatchBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** 未保存状態を作る: 数量表名を変更してドラフトを dirty にする（REQ-42.2） */
async function makeDirty(user: ReturnType<typeof userEvent.setup>) {
  const nameInput = screen.getByLabelText('数量表名');
  await user.clear(nameInput);
  await user.type(nameInput, '変更後の名前');
  await user.tab(); // blur でドラフトへ反映 → isDirty=true
}

describe('QuantityTableEditPage - タブクローズ/リロードの離脱確認 (Task 100.13)', () => {
  beforeEach(() => {
    mockGetQuantityTableDetail.mockResolvedValue(mockDetail);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('REQ-43.2: 未保存変更があると beforeunload の既定動作を抑止する（未編集時は抑止しない）', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
    });

    // 陰性対照（REQ-43.5）: 未保存変更が無い間は離脱確認を要求しない
    expect(dispatchBeforeUnload()).toBe(false);

    await makeDirty(user);

    // 未保存インジケーター（REQ-44.1）で dirty 状態に達したことを先に確かめる。
    // これが出ていない状態で下の判定が緑になると、判定が別の理由で通ったことになる。
    await waitFor(() => {
      expect(screen.getByText(/未保存の変更があります/)).toBeInTheDocument();
    });

    // REQ-43.2: 未保存変更がある間はブラウザ標準の離脱確認を要求する
    await waitFor(() => {
      expect(dispatchBeforeUnload()).toBe(true);
    });
  });

  it('REQ-43.2: 画面の撤去後は離脱確認を要求しない（リスナーを残さない）', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
    });

    await makeDirty(user);
    await waitFor(() => {
      expect(dispatchBeforeUnload()).toBe(true);
    });

    unmount();

    expect(dispatchBeforeUnload()).toBe(false);
  });
});
