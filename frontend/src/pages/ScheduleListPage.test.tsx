/**
 * @fileoverview ScheduleListPage テスト
 *
 * Task 7: フロントエンド工程表一覧画面の実装
 *
 * Requirements (construction-schedule):
 * - REQ-1.1: 工程表一覧表示
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.4: 工程表詳細表示（選択時の遷移）
 * - REQ-1.5: 工程表削除
 *
 * @module pages/ScheduleListPage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ScheduleListPage from './ScheduleListPage';
import * as schedulesApi from '../api/schedules';

// モック
vi.mock('../api/schedules');

const mockSchedules = [
  {
    id: 'schedule-001',
    name: '第1期工程表',
    quantityTableName: '本体工事数量表',
    itemCount: 15,
    createdAt: '2024-06-01T10:00:00.000Z',
    updatedAt: '2024-06-01T10:00:00.000Z',
  },
  {
    id: 'schedule-002',
    name: '第2期工程表',
    quantityTableName: null,
    itemCount: 8,
    createdAt: '2024-07-15T10:00:00.000Z',
    updatedAt: '2024-07-15T10:00:00.000Z',
  },
];

function renderWithRouter(projectId = 'proj-001') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/schedules`]}>
      <Routes>
        <Route path="/projects/:projectId/schedules" element={<ScheduleListPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScheduleListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // REQ-1.1: 工程表一覧表示
  // ==========================================================================

  /**
   * REQ-1.1: 工程表一覧画面が正しくレンダリングされる
   */
  it('工程表一覧画面が正しくレンダリングされる', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-page')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: '工程表一覧' })).toBeInTheDocument();
  });

  /**
   * REQ-1.1: 工程表リストの表示（名称、数量表名、項目数、作成日時）
   */
  it('工程表リストを表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    // 2行の工程表が表示される
    const rows = screen.getAllByTestId(/^schedule-row-/);
    expect(rows).toHaveLength(2);
  });

  /**
   * REQ-1.1: テーブルヘッダーとデータの表示確認
   */
  it('名称、数量表名、項目数、作成日時がカラムに表示される', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    // テーブルヘッダーの確認
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('数量表')).toBeInTheDocument();
    expect(screen.getByText('項目数')).toBeInTheDocument();
    expect(screen.getByText('作成日時')).toBeInTheDocument();

    // データの表示確認
    expect(screen.getByText('第1期工程表')).toBeInTheDocument();
    expect(screen.getByText('第2期工程表')).toBeInTheDocument();
    expect(screen.getByText('本体工事数量表')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  /**
   * REQ-1.1: 数量表未指定の場合の表示
   */
  it('数量表が未指定の場合「-」を表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: [mockSchedules[1]!],
      total: 1,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    const row = screen.getByTestId('schedule-row-schedule-002');
    expect(within(row).getByText('-')).toBeInTheDocument();
  });

  /**
   * REQ-1.1: 件数表示
   */
  it('全件数を表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('全2件')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-1.2: 工程表新規作成画面表示
  // ==========================================================================

  /**
   * REQ-1.2: 新規作成ボタンが表示される
   */
  it('新規作成ボタンが表示される', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toBeInTheDocument();
    });
  });

  /**
   * REQ-1.2: 新規作成ボタンのリンク先が正しい
   */
  it('新規作成ボタンのリンク先が正しい', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toHaveAttribute('href', '/projects/proj-001/schedules/new');
    });
  });

  // ==========================================================================
  // REQ-1.4: 工程表詳細表示（選択時の遷移）
  // ==========================================================================

  /**
   * REQ-1.4: 工程表行クリック時の詳細画面遷移リンクが正しい
   */
  it('工程表行クリック時の詳細画面遷移リンクが正しい', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      const row = screen.getByTestId('schedule-row-schedule-001');
      expect(row).toBeInTheDocument();
    });

    // 行内にリンクが存在し、詳細画面へのhrefが設定されている
    const row = screen.getByTestId('schedule-row-schedule-001');
    const links = row.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/schedules/schedule-001');
  });

  // ==========================================================================
  // REQ-1.5: 工程表削除
  // ==========================================================================

  /**
   * REQ-1.5: 削除ボタンが各行に表示される
   */
  it('削除ボタンが各行に表示される', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    expect(deleteButtons).toHaveLength(2);
  });

  /**
   * REQ-1.5: 削除ボタン押下で確認ダイアログが表示される
   */
  it('削除ボタン押下で確認ダイアログが表示される', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    // non-null assertion: getAllByRole guarantees at least 1 result
    await user.click(deleteButtons[0] as HTMLElement);

    // 確認ダイアログが表示される
    expect(screen.getByText(/本当に削除しますか/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /確認/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
  });

  /**
   * REQ-1.5: 削除確認後にAPIが呼ばれ一覧が更新される
   */
  it('削除確認後にAPIが呼ばれ一覧が更新される', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.getSchedules)
      .mockResolvedValueOnce({
        schedules: mockSchedules,
        total: 2,
      })
      .mockResolvedValueOnce({
        schedules: [mockSchedules[1]!],
        total: 1,
      });
    vi.mocked(schedulesApi.deleteSchedule).mockResolvedValue(undefined);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    // non-null assertion: getAllByRole guarantees at least 1 result
    await user.click(deleteButtons[0] as HTMLElement);

    // 確認ダイアログで確認ボタンをクリック
    const confirmButton = screen.getByRole('button', { name: /確認/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(schedulesApi.deleteSchedule).toHaveBeenCalledWith('schedule-001');
    });

    // 一覧が更新される
    await waitFor(() => {
      expect(schedulesApi.getSchedules).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * REQ-1.5: 削除キャンセルで何も起きない
   */
  it('削除キャンセルで何も起きない', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    // non-null assertion: getAllByRole guarantees at least 1 result
    await user.click(deleteButtons[0] as HTMLElement);

    // キャンセルボタンをクリック
    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    // ダイアログが閉じる
    expect(screen.queryByText(/本当に削除しますか/)).not.toBeInTheDocument();

    // deleteScheduleは呼ばれない
    expect(schedulesApi.deleteSchedule).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // パンくずナビゲーション
  // ==========================================================================

  /**
   * パンくずナビゲーションの表示
   */
  it('パンくずナビゲーションを表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: mockSchedules,
      total: 2,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-page')).toBeInTheDocument();
    });

    const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    expect(breadcrumb).toBeInTheDocument();

    expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();

    const breadcrumbItems = breadcrumb.querySelectorAll('li');
    const labels = Array.from(breadcrumbItems).map((li) =>
      li.textContent?.replace(/^>\s*/, '').trim()
    );
    expect(labels).toContain('プロジェクト');
    expect(labels).toContain('工程表一覧');
  });

  // ==========================================================================
  // UI状態のテスト
  // ==========================================================================

  /**
   * ローディング状態のテスト
   */
  it('ローディング中はスピナーを表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );

    renderWithRouter();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * エラー状態のテスト
   */
  it('エラー時はエラーメッセージと再試行ボタンを表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockRejectedValue(new Error('API Error'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('工程表の取得に失敗しました')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  /**
   * 空状態のテスト
   */
  it('工程表が存在しない場合、空状態メッセージを表示する', async () => {
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue({
      schedules: [],
      total: 0,
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('工程表はまだありません')).toBeInTheDocument();
    });
  });

  /**
   * 再試行機能のテスト
   */
  it('再試行ボタンクリックでAPIを再呼び出しする', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.getSchedules)
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        schedules: mockSchedules,
        total: 2,
      });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: '再試行' });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
    });

    expect(schedulesApi.getSchedules).toHaveBeenCalledTimes(2);
  });
});
