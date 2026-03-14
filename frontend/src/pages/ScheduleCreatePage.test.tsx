/**
 * @fileoverview ScheduleCreatePage テスト
 *
 * Task 8: フロントエンド工程表作成フォームの実装
 *
 * Requirements (construction-schedule):
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存（API呼び出し）
 * - REQ-1.6: 保存失敗時エラー表示と入力内容保持
 * - REQ-2.1: 数量表選択肢表示
 * - REQ-2.2: 数量表なしで空の工程表作成
 * - REQ-2.3: 数量表指定時の項目自動取得
 *
 * @module pages/ScheduleCreatePage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ScheduleCreatePage from './ScheduleCreatePage';
import * as schedulesApi from '../api/schedules';
import * as quantityTablesApi from '../api/quantity-tables';

// モック
vi.mock('../api/schedules');
vi.mock('../api/quantity-tables');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// テストデータ
const mockQuantityTables = [
  {
    id: 'qt-001',
    projectId: 'proj-001',
    name: '本体工事数量表',
    groupCount: 3,
    itemCount: 15,
    createdAt: '2024-06-01T10:00:00.000Z',
    updatedAt: '2024-06-01T10:00:00.000Z',
  },
];

const mockCreatedSchedule = {
  id: 'schedule-new',
  projectId: 'proj-001',
  name: 'テスト工程表',
  quantityTableId: null,
  quantityTableName: null,
  items: [],
  version: 0,
  createdAt: '2024-06-01T10:00:00.000Z',
  updatedAt: '2024-06-01T10:00:00.000Z',
};

function renderWithRouter(projectId = 'proj-001') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/schedules/new`]}>
      <Routes>
        <Route path="/projects/:projectId/schedules/new" element={<ScheduleCreatePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScheduleCreatePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
      data: mockQuantityTables,
      pagination: {
        page: 1,
        limit: 100,
        total: 1,
        totalPages: 1,
      },
    });
  });

  // ==========================================================================
  // REQ-1.2: 工程表新規作成画面表示
  // ==========================================================================

  /**
   * REQ-1.2: 作成画面が正しくレンダリングされる
   */
  it('作成画面が正しくレンダリングされる', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-create-page')).toBeInTheDocument();
    });

    // タイトルが表示される
    expect(screen.getByRole('heading', { name: '工程表作成' })).toBeInTheDocument();
  });

  /**
   * REQ-1.2: パンくずナビゲーションが表示される
   */
  it('パンくずナビゲーションが表示される', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByTestId('schedule-create-page')).toBeInTheDocument();
    });

    const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    expect(breadcrumb).toBeInTheDocument();
  });

  // ==========================================================================
  // REQ-1.3: 工程表保存（API呼び出しと遷移）
  // ==========================================================================

  /**
   * REQ-1.3: 作成ボタン押下でAPIが呼ばれ、工程表詳細画面へ遷移する
   */
  it('作成ボタン押下でAPIが呼ばれ工程表詳細画面へ遷移する', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockResolvedValue(mockCreatedSchedule);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    await user.type(screen.getByLabelText('工程表名称'), 'テスト工程表');

    // 作成ボタンをクリック
    await user.click(screen.getByRole('button', { name: '作成' }));

    // APIが呼ばれる
    await waitFor(() => {
      expect(schedulesApi.createSchedule).toHaveBeenCalledWith('proj-001', {
        name: 'テスト工程表',
        quantityTableId: null,
      });
    });

    // 工程表詳細画面へ遷移する
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/schedules/schedule-new');
    });
  });

  /**
   * REQ-2.3: 数量表を指定して作成するとquantityTableIdが送信される
   */
  it('数量表を指定して作成するとquantityTableIdが送信される', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockResolvedValue({
      ...mockCreatedSchedule,
      quantityTableId: 'qt-001',
      quantityTableName: '本体工事数量表',
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    await user.type(screen.getByLabelText('工程表名称'), '本体工事工程表');

    // 数量表を選択
    await waitFor(() => {
      expect(screen.getByText('本体工事数量表')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('数量表'), 'qt-001');

    // 作成ボタンをクリック
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(schedulesApi.createSchedule).toHaveBeenCalledWith('proj-001', {
        name: '本体工事工程表',
        quantityTableId: 'qt-001',
      });
    });
  });

  // ==========================================================================
  // REQ-1.6: 保存失敗時エラー表示と入力内容保持
  // ==========================================================================

  /**
   * REQ-1.6: 保存失敗時にエラーメッセージが表示される
   */
  it('保存失敗時にエラーメッセージが表示される', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(new Error('API Error'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    await user.type(screen.getByLabelText('工程表名称'), 'テスト工程表');

    // 作成ボタンをクリック
    await user.click(screen.getByRole('button', { name: '作成' }));

    // エラーメッセージが表示される
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('工程表の作成に失敗しました')).toBeInTheDocument();
    });

    // 遷移しない
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  /**
   * REQ-1.6: エラー時も入力内容が保持される
   */
  it('エラー時も入力内容が保持される', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(new Error('API Error'));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    await user.type(screen.getByLabelText('工程表名称'), '保持テスト');

    // 作成ボタンをクリック（失敗する）
    await user.click(screen.getByRole('button', { name: '作成' }));

    // エラー表示後も入力値が保持されている
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('工程表名称')).toHaveValue('保持テスト');
  });

  // ==========================================================================
  // キャンセル操作
  // ==========================================================================

  /**
   * キャンセルボタン押下で工程表一覧に戻る
   */
  it('キャンセルボタン押下で工程表一覧に戻る', async () => {
    const user = userEvent.setup();
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/schedules');
  });
});
