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
import { ApiError } from '../api/client';

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

  /**
   * @requirement construction-schedule/REQ-12.1: The 工程表管理システム shall 1つの工程表あたり最大200項目までの登録をサポートする
   *
   * 200 件を超える数量表からの作成はサーバーが 400 で拒む（利用者の判断 2026-10-09）。
   * 作成画面はサーバーの detail をそのまま示し、入力を保ったまま再び操作できる。
   */
  it('作成が400で拒まれた場合はサーバーのdetailを表示し、入力を保持して再び操作できる', async () => {
    const user = userEvent.setup();
    const detail = '数量表の項目が200件を超えているため工程表を作成できません（201件）';
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(
      new ApiError(400, detail, {
        status: 400,
        code: 'SCHEDULE_ITEMS_LIMIT_EXCEEDED',
        detail,
        details: { itemCount: 201, maxItemCount: 200 },
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: '本体工事数量表' })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('工程表名称'), '上限超過の工程表');
    await user.selectOptions(screen.getByLabelText('数量表'), 'qt-001');
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(detail);
    });
    expect(screen.queryByText('工程表の作成に失敗しました')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('工程表名称')).toHaveValue('上限超過の工程表');
    expect(screen.getByLabelText('数量表')).toHaveValue('qt-001');
    expect(screen.getByRole('button', { name: '作成' })).toBeEnabled();
  });

  /**
   * @requirement construction-schedule/REQ-1.6: If 工程表の保存に失敗する, then the 工程表管理システム shall エラーメッセージを表示し、入力内容を保持する
   *
   * 入力の検証（validate ミドルウェアの ValidationError、code は VALIDATION_ERROR）で 400 となった
   * 場合は、サーバーの detail が利用者の直すべき入力を示すため、そのまま示す（Task 21.2）
   */
  it('作成が入力の検証エラーの400で拒まれた場合はサーバーのdetailを表示し、入力を保持する', async () => {
    const user = userEvent.setup();
    const detail = '工程表名は200文字以内で入力してください';
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(
      new ApiError(400, detail, {
        type: 'https://architrack.example.com/problems/validation-error',
        title: 'VALIDATION_ERROR',
        status: 400,
        detail,
        code: 'VALIDATION_ERROR',
        message: detail,
        details: [{ path: 'name', message: detail, code: 'too_big' }],
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('工程表名称'), '検証エラーの工程表');
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(detail);
    });
    expect(screen.queryByText('工程表の作成に失敗しました')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('工程表名称')).toHaveValue('検証エラーの工程表');
    expect(screen.getByRole('button', { name: '作成' })).toBeEnabled();
  });

  /**
   * @requirement construction-schedule/REQ-1.6: If 工程表の保存に失敗する, then the 工程表管理システム shall エラーメッセージを表示し、入力内容を保持する
   *
   * Prisma 由来の 400（例: 存在しないプロジェクトの指定による外部キー違反）はエラーハンドラーが
   * code を持たない英語の detail「Database operation failed」で返す。利用者に見せる理由ではないため、
   * 汎用の日本語の文言を示す（Task 21.2）
   */
  it('作成がPrisma由来の400で失敗した場合はサーバーのdetailを出さず汎用のエラーメッセージを表示し、入力を保持する', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(
      new ApiError(400, 'Database operation failed', {
        type: 'https://architrack.example.com/problems/bad-request',
        title: 'Database Error',
        status: 400,
        detail: 'Database operation failed',
        instance: '/api/projects/project-123/schedules',
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: '本体工事数量表' })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('工程表名称'), '外部キー違反の工程表');
    await user.selectOptions(screen.getByLabelText('数量表'), 'qt-001');
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('工程表の作成に失敗しました');
    });
    expect(screen.queryByText('Database operation failed')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('工程表名称')).toHaveValue('外部キー違反の工程表');
    expect(screen.getByLabelText('数量表')).toHaveValue('qt-001');
    expect(screen.getByRole('button', { name: '作成' })).toBeEnabled();
  });

  /**
   * code を持たない 400（上限超過でも入力の検証でもない）は、detail があっても汎用の文言を示す（Task 21.2）
   */
  it('作成がcodeを持たない400で失敗した場合はサーバーのdetailを出さず汎用のエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(
      new ApiError(400, 'Some internal reason', { status: 400, detail: 'Some internal reason' })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('工程表名称'), 'テスト工程表');
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('工程表の作成に失敗しました');
    });
    expect(screen.queryByText('Some internal reason')).not.toBeInTheDocument();
  });

  /**
   * 400 以外の失敗（サーバーの障害など）は従来の汎用の文言を示す
   */
  it('作成が500で失敗した場合は汎用のエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    vi.mocked(schedulesApi.createSchedule).mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('工程表名称'), 'テスト工程表');
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('工程表の作成に失敗しました');
    });
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
