/**
 * @fileoverview ScheduleDetailPage テスト
 *
 * Task 9.1: ScheduleDetailPageと項目入力行を実装する
 * Task 9.2: SortableScheduleListによる並び順管理を実装する
 *
 * Requirements (construction-schedule):
 * - REQ-1.4: 工程表詳細表示
 * - REQ-2.4: 数量表項目の着工日・日数入力欄
 * - REQ-3.1: 着工日入力欄
 * - REQ-3.2: 日数入力欄
 * - REQ-3.4: 着工日未入力バリデーション
 * - REQ-3.5: 日数0以下バリデーション
 * - REQ-4.1: 任意項目追加
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-4.3: 任意項目削除
 * - REQ-4.4: 数量表由来・任意項目の混在管理
 * - REQ-5.1: 並び順変更機能
 * - REQ-5.2: 並び順リアルタイム反映
 * - REQ-9.1: 出力対象チェックボックス表示
 * - REQ-9.2: チェックボックス初期値ON
 * - REQ-10.1: ラベル文字入力欄
 * - REQ-11.1: 詳細文字入力欄
 *
 * @module pages/ScheduleDetailPage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ScheduleDetailPage from './ScheduleDetailPage';
import * as schedulesApi from '../api/schedules';

// モック
vi.mock('../api/schedules');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const mockScheduleDetail: schedulesApi.ScheduleDetail = {
  id: 'schedule-1',
  projectId: 'proj-001',
  name: '本体工事工程表',
  quantityTableId: 'qt-001',
  quantityTableName: '本体工事数量表',
  items: [
    {
      id: 'item-1',
      sourceType: 'QUANTITY_TABLE',
      sourceQuantityItemId: 'qi-1',
      itemName: '基礎工事',
      labelText: '基礎',
      detailText: 'コンクリート打設',
      startDate: '2026-04-01',
      duration: 10,
      displayOrder: 0,
      isExportTarget: true,
      createdAt: '2026-03-14T00:00:00Z',
      updatedAt: '2026-03-14T00:00:00Z',
    },
    {
      id: 'item-2',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '仮設工事',
      labelText: '',
      detailText: '',
      startDate: null,
      duration: null,
      displayOrder: 1,
      isExportTarget: true,
      createdAt: '2026-03-14T00:00:00Z',
      updatedAt: '2026-03-14T00:00:00Z',
    },
  ],
  version: 0,
  createdAt: '2026-03-14T00:00:00Z',
  updatedAt: '2026-03-14T00:00:00Z',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

function renderPage(scheduleId = 'schedule-1') {
  return render(
    <MemoryRouter initialEntries={[`/schedules/${scheduleId}`]}>
      <Routes>
        <Route path="/schedules/:id" element={<ScheduleDetailPage />} />
        <Route path="/projects/:projectId/schedules" element={<div>工程表一覧</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// テスト
// ============================================================================

describe('ScheduleDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(schedulesApi.getScheduleDetail).mockResolvedValue(mockScheduleDetail);
    vi.mocked(schedulesApi.bulkSaveScheduleItems).mockResolvedValue({
      updatedItemCount: 2,
      updatedAt: '2026-03-14T01:00:00Z',
    });
  });

  // --------------------------------------------------------------------------
  // 読み込み・表示テスト
  // --------------------------------------------------------------------------

  describe('読み込み・表示', () => {
    it('ローディング状態が表示される', () => {
      renderPage();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('工程表データ読み込み後に工程表名が表示される', async () => {
      renderPage();
      await waitFor(() => {
        const headings = screen.getAllByText('本体工事工程表');
        expect(headings.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('数量表由来と任意項目が混在表示される', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('item-name-item-1')).toHaveValue('基礎工事');
      });
      expect(screen.getByTestId('item-name-item-2')).toHaveValue('仮設工事');
    });

    it('項目一覧エリアとガントチャートエリアが並列配置される', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('schedule-items-area')).toBeInTheDocument();
      });
      expect(screen.getByTestId('gantt-chart-area')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 任意項目の追加・削除テスト
  // --------------------------------------------------------------------------

  describe('任意項目の追加・削除', () => {
    it('任意項目追加ボタンをクリックすると新しい項目行が追加される', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('add-item-button')).toBeInTheDocument();
      });

      const addButton = screen.getByTestId('add-item-button');
      await user.click(addButton);

      // 3行目が追加される
      const itemRows = screen.getAllByTestId(/^item-row-/);
      expect(itemRows.length).toBe(3);
    });

    it('任意項目の削除ボタンをクリックすると項目が削除される', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('remove-item-item-2')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('remove-item-item-2'));

      await waitFor(() => {
        expect(screen.queryByTestId('item-row-item-2')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 保存テスト
  // --------------------------------------------------------------------------

  describe('保存', () => {
    it('保存ボタンをクリックするとバルク保存APIが呼ばれる', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('save-button')).toBeInTheDocument();
      });

      // 変更を加えてdirty stateにする
      const input = screen.getByTestId('label-text-item-1');
      await user.clear(input);
      await user.type(input, '変更後ラベル');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(schedulesApi.bulkSaveScheduleItems).toHaveBeenCalled();
      });
    });

    it('保存エラー時にエラーメッセージが表示される', async () => {
      vi.mocked(schedulesApi.bulkSaveScheduleItems).mockRejectedValue(
        new Error('保存に失敗しました')
      );
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('save-button')).toBeInTheDocument();
      });

      // 変更を加えてdirty stateにする
      const input = screen.getByTestId('label-text-item-1');
      await user.clear(input);
      await user.type(input, '変更後');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByText('保存に失敗しました')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // エラーテスト
  // --------------------------------------------------------------------------

  describe('エラー処理', () => {
    it('工程表が見つからない場合にエラー表示される', async () => {
      vi.mocked(schedulesApi.getScheduleDetail).mockRejectedValue(
        new Error('工程表が見つかりません')
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('工程表が見つかりません')).toBeInTheDocument();
      });
    });
  });
});
