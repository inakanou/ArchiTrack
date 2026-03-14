/**
 * @fileoverview ScheduleForm コンポーネントのテスト
 *
 * Task 8: フロントエンド工程表作成フォームの実装
 *
 * Requirements (construction-schedule):
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存
 * - REQ-1.6: 保存失敗時エラー表示
 * - REQ-2.1: 数量表選択肢表示
 * - REQ-2.2: 数量表なしで空の工程表作成
 * - REQ-2.3: 数量表指定時の項目自動取得
 *
 * @module components/schedule/ScheduleForm.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScheduleForm from './ScheduleForm';
import * as quantityTablesApi from '../../api/quantity-tables';

// モック
vi.mock('../../api/quantity-tables');

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
  {
    id: 'qt-002',
    projectId: 'proj-001',
    name: '外構工事数量表',
    groupCount: 2,
    itemCount: 8,
    createdAt: '2024-07-01T10:00:00.000Z',
    updatedAt: '2024-07-01T10:00:00.000Z',
  },
];

describe('ScheduleForm', () => {
  const defaultProps = {
    projectId: 'proj-001',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    isSubmitting: false,
    error: null as string | null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
      data: mockQuantityTables,
      pagination: {
        page: 1,
        limit: 100,
        total: 2,
        totalPages: 1,
      },
    });
  });

  // ==========================================================================
  // REQ-1.2: 工程表新規作成画面表示
  // ==========================================================================

  /**
   * REQ-1.2: フォームが正しくレンダリングされる
   */
  it('フォームが正しくレンダリングされる', async () => {
    render(<ScheduleForm {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-form')).toBeInTheDocument();
    });

    // 名称入力フィールドが表示される
    expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();

    // 作成ボタンとキャンセルボタンが表示される
    expect(screen.getByRole('button', { name: '作成' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
  });

  /**
   * REQ-1.2: 工程表名称入力が可能
   */
  it('工程表名称を入力できる', async () => {
    const user = userEvent.setup();
    render(<ScheduleForm {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('工程表名称');
    await user.type(nameInput, '第1期工程表');

    expect(nameInput).toHaveValue('第1期工程表');
  });

  // ==========================================================================
  // REQ-2.1: 数量表選択肢表示
  // ==========================================================================

  /**
   * REQ-2.1: 同一プロジェクトの数量表が選択肢として表示される
   */
  it('同一プロジェクトの数量表が選択肢として表示される', async () => {
    render(<ScheduleForm {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText('数量表')).toBeInTheDocument();
    });

    // 数量表選択肢が表示される
    const select = screen.getByLabelText('数量表');
    expect(select).toBeInTheDocument();

    // 「数量表なし」オプションが表示される
    expect(screen.getByText('数量表なし')).toBeInTheDocument();

    // 数量表の選択肢が表示される
    expect(screen.getByText('本体工事数量表')).toBeInTheDocument();
    expect(screen.getByText('外構工事数量表')).toBeInTheDocument();
  });

  /**
   * REQ-2.1: 数量表APIがプロジェクトIDで呼び出される
   */
  it('数量表一覧をプロジェクトIDで取得する', async () => {
    render(<ScheduleForm {...defaultProps} />);

    await waitFor(() => {
      expect(quantityTablesApi.getQuantityTables).toHaveBeenCalledWith('proj-001', {
        limit: 100,
      });
    });
  });

  /**
   * REQ-2.1: 数量表を選択できる
   */
  it('数量表を選択できる', async () => {
    const user = userEvent.setup();
    render(<ScheduleForm {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText('数量表')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('数量表');
    await user.selectOptions(select, 'qt-001');

    expect(select).toHaveValue('qt-001');
  });

  // ==========================================================================
  // REQ-2.2: 数量表なしで空の工程表作成
  // ==========================================================================

  /**
   * REQ-2.2: 数量表なしで作成ボタンを押すとonSubmitが呼ばれる
   */
  it('数量表なしで作成ボタンを押すとonSubmitが呼ばれる', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScheduleForm {...defaultProps} onSubmit={onSubmit} />);

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    const nameInput = screen.getByLabelText('工程表名称');
    await user.type(nameInput, '空の工程表');

    // 作成ボタンをクリック
    const createButton = screen.getByRole('button', { name: '作成' });
    await user.click(createButton);

    expect(onSubmit).toHaveBeenCalledWith({
      name: '空の工程表',
      quantityTableId: null,
    });
  });

  // ==========================================================================
  // REQ-2.3: 数量表指定時の項目自動取得
  // ==========================================================================

  /**
   * REQ-2.3: 数量表を指定して作成ボタンを押すとquantityTableIdがonSubmitに渡される
   */
  it('数量表を指定して作成するとquantityTableIdが送信される', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScheduleForm {...defaultProps} onSubmit={onSubmit} />);

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    await user.type(screen.getByLabelText('工程表名称'), '本体工事工程表');

    // 数量表を選択
    await user.selectOptions(screen.getByLabelText('数量表'), 'qt-001');

    // 作成ボタンをクリック
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: '本体工事工程表',
      quantityTableId: 'qt-001',
    });
  });

  // ==========================================================================
  // REQ-1.3: 工程表保存 - バリデーション
  // ==========================================================================

  /**
   * REQ-1.3: 名称未入力時はバリデーションエラーを表示する
   */
  it('名称未入力時はバリデーションエラーを表示する', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScheduleForm {...defaultProps} onSubmit={onSubmit} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '作成' })).toBeInTheDocument();
    });

    // 名称を入力せずに作成ボタンをクリック
    await user.click(screen.getByRole('button', { name: '作成' }));

    // バリデーションエラーが表示される
    expect(screen.getByText('工程表名称を入力してください')).toBeInTheDocument();

    // onSubmitは呼ばれない
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // REQ-1.6: 保存失敗時エラー表示
  // ==========================================================================

  /**
   * REQ-1.6: エラーメッセージが表示される
   */
  it('エラーメッセージが表示される', async () => {
    render(<ScheduleForm {...defaultProps} error="工程表の作成に失敗しました" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('工程表の作成に失敗しました')).toBeInTheDocument();
  });

  /**
   * REQ-1.6: エラー表示時も入力内容が保持される
   */
  it('エラー表示時も入力内容が保持される', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ScheduleForm {...defaultProps} error={null} />);

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 名称を入力
    await user.type(screen.getByLabelText('工程表名称'), 'テスト工程表');

    // 数量表を選択
    await user.selectOptions(screen.getByLabelText('数量表'), 'qt-002');

    // エラー状態でリレンダリング
    rerender(<ScheduleForm {...defaultProps} error="保存に失敗しました" />);

    // 入力内容が保持されている
    expect(screen.getByLabelText('工程表名称')).toHaveValue('テスト工程表');
    expect(screen.getByLabelText('数量表')).toHaveValue('qt-002');
  });

  // ==========================================================================
  // 送信中状態
  // ==========================================================================

  /**
   * 送信中はボタンが無効化される
   */
  it('送信中はボタンが無効化される', async () => {
    render(<ScheduleForm {...defaultProps} isSubmitting={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '作成中...' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '作成中...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
  });

  // ==========================================================================
  // キャンセル操作
  // ==========================================================================

  /**
   * キャンセルボタン押下でonCancelが呼ばれる
   */
  it('キャンセルボタン押下でonCancelが呼ばれる', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ScheduleForm {...defaultProps} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onCancel).toHaveBeenCalled();
  });

  // ==========================================================================
  // 数量表取得エラー
  // ==========================================================================

  /**
   * 数量表取得に失敗しても、フォームは表示される（選択肢が空になるだけ）
   */
  it('数量表取得に失敗してもフォームは表示される', async () => {
    vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(new Error('API Error'));

    render(<ScheduleForm {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText('工程表名称')).toBeInTheDocument();
    });

    // 「数量表なし」オプションは常に表示される
    expect(screen.getByText('数量表なし')).toBeInTheDocument();
  });
});
