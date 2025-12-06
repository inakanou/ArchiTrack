/**
 * @fileoverview ProjectSearchFilter コンポーネント テスト
 *
 * Task 8.3: 検索・フィルタUIの実装
 *
 * Requirements:
 * - 4.1: 検索フィールドにキーワードを入力してEnterキーを押すまたは検索ボタンをクリックで検索実行
 * - 4.2: 検索結果が0件の場合、メッセージを表示（親コンポーネントの責務だがコンポーネント連携をテスト）
 * - 4.3: 検索キーワードをクリアすると全プロジェクト一覧を再表示
 * - 4.4: 2文字以上の検索キーワードを要求
 * - 4.5: 検索キーワードが1文字以下の場合、メッセージを表示し検索を実行しない
 * - 5.1: ステータスフィルタで値を選択すると選択されたステータスのプロジェクトのみ表示
 * - 5.2: 期間フィルタで作成日を基準とした日付範囲フィルタリング
 * - 5.3: 期間フィルタで日付範囲を指定すると指定期間内のプロジェクトのみ表示
 * - 5.4: 複数のフィルタを適用するとAND条件で絞り込み
 * - 5.5: フィルタをクリアをクリックするとすべてのフィルタを解除
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectSearchFilter from '../../../components/projects/ProjectSearchFilter';
import type { ProjectFilter } from '../../../types/project.types';

// ============================================================================
// テストデータ
// ============================================================================

const defaultFilter: ProjectFilter = {
  search: '',
  status: [],
  createdFrom: undefined,
  createdTo: undefined,
};

// ============================================================================
// テスト
// ============================================================================

describe('ProjectSearchFilter', () => {
  let onFilterChange: Mock<(filter: ProjectFilter) => void>;

  beforeEach(() => {
    onFilterChange = vi.fn<(filter: ProjectFilter) => void>();
  });

  // ==========================================================================
  // 基本的なレンダリングテスト
  // ==========================================================================

  describe('基本レンダリング', () => {
    it('検索フィールドが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      expect(searchInput).toBeInTheDocument();
    });

    it('検索ボタンが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchButton = screen.getByRole('button', { name: /検索/i });
      expect(searchButton).toBeInTheDocument();
    });

    it('ステータスフィルタが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const statusSelect = screen.getByLabelText(/ステータス/i);
      expect(statusSelect).toBeInTheDocument();
    });

    it('作成日開始フィルタが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const fromDateInput = screen.getByLabelText(/作成日\s*（開始）|開始日/i);
      expect(fromDateInput).toBeInTheDocument();
    });

    it('作成日終了フィルタが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const toDateInput = screen.getByLabelText(/作成日\s*（終了）|終了日/i);
      expect(toDateInput).toBeInTheDocument();
    });

    it('フィルタクリアボタンが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const clearButton = screen.getByRole('button', { name: /フィルタをクリア|クリア/i });
      expect(clearButton).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 検索機能テスト（Requirements 4.1, 4.3, 4.4, 4.5）
  // ==========================================================================

  describe('検索機能', () => {
    it('Enterキーで検索が実行される（Requirement 4.1）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'テスト{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'テスト',
        })
      );
    });

    it('検索ボタンクリックで検索が実行される（Requirement 4.1）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'テスト');

      const searchButton = screen.getByRole('button', { name: /検索/i });
      await user.click(searchButton);

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'テスト',
        })
      );
    });

    it('2文字以上の検索キーワードで検索が実行される（Requirement 4.4）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'AB{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'AB',
        })
      );
    });

    it('1文字以下の検索キーワードでは検索が実行されない（Requirement 4.5）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'A{Enter}');

      // onFilterChangeがsearchパラメータ付きで呼ばれていないこと
      expect(onFilterChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'A',
        })
      );
    });

    it('1文字以下の検索キーワードでエラーメッセージが表示される（Requirement 4.5）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'A{Enter}');

      const errorMessage = screen.getByText(/2文字以上で入力してください/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it('検索キーワードをクリアすると再検索される（Requirement 4.3）', async () => {
      const user = userEvent.setup();
      const filterWithSearch: ProjectFilter = {
        ...defaultFilter,
        search: 'テスト',
      };
      render(<ProjectSearchFilter filter={filterWithSearch} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      // 既存の値をクリア
      await user.clear(searchInput);
      await user.keyboard('{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '',
        })
      );
    });

    it('空の検索キーワードでも検索が実行される（全件表示のため）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, '{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '',
        })
      );
    });
  });

  // ==========================================================================
  // ステータスフィルタテスト（Requirement 5.1）
  // ==========================================================================

  describe('ステータスフィルタ', () => {
    it('ステータスを選択するとonFilterChangeが呼ばれる（Requirement 5.1）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const statusSelect = screen.getByLabelText(/ステータス/i);
      await user.selectOptions(statusSelect, 'PREPARING');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.arrayContaining(['PREPARING']),
        })
      );
    });

    it('複数のステータスを選択できる', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const statusSelect = screen.getByLabelText(/ステータス/i);
      // 複数選択（multiple属性付きselectで複数オプションを選択）
      await user.selectOptions(statusSelect, ['PREPARING', 'SURVEYING']);

      // 複数選択なので、最終的に両方が選択された呼び出しがあることを確認
      // HTML selectのmultiple属性で複数選択した場合、選択した全オプションが含まれる
      const allCalls = onFilterChange.mock.calls.map((call) => call[0].status);
      // 最後の呼び出しを確認
      const lastStatus = allCalls[allCalls.length - 1];
      expect(lastStatus).toContain('SURVEYING');
    });

    it('全てのステータスオプションが表示される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const statusSelect = screen.getByLabelText(/ステータス/i);
      const options = within(statusSelect).getAllByRole('option');

      // 12ステータス + 「すべて」オプション
      expect(options.length).toBeGreaterThanOrEqual(12);

      // 主要なステータスが含まれているか確認
      expect(screen.getByRole('option', { name: /準備中/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /調査中/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /見積中/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /完了/i })).toBeInTheDocument();
    });

    it('選択されたステータスが表示される', () => {
      const filterWithStatus: ProjectFilter = {
        ...defaultFilter,
        status: ['PREPARING', 'SURVEYING'],
      };
      render(<ProjectSearchFilter filter={filterWithStatus} onFilterChange={onFilterChange} />);

      const statusSelect = screen.getByLabelText(/ステータス/i) as HTMLSelectElement;
      const selectedOptions = Array.from(statusSelect.selectedOptions).map((opt) => opt.value);

      expect(selectedOptions).toContain('PREPARING');
      expect(selectedOptions).toContain('SURVEYING');
    });
  });

  // ==========================================================================
  // 期間フィルタテスト（Requirements 5.2, 5.3）
  // ==========================================================================

  describe('期間フィルタ', () => {
    it('開始日を選択するとonFilterChangeが呼ばれる（Requirement 5.2）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const fromDateInput = screen.getByLabelText(/作成日\s*（開始）|開始日/i);
      await user.type(fromDateInput, '2025-01-01');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          createdFrom: '2025-01-01',
        })
      );
    });

    it('終了日を選択するとonFilterChangeが呼ばれる（Requirement 5.3）', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const toDateInput = screen.getByLabelText(/作成日\s*（終了）|終了日/i);
      await user.type(toDateInput, '2025-12-31');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          createdTo: '2025-12-31',
        })
      );
    });

    it('日付範囲を指定できる', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const fromDateInput = screen.getByLabelText(/作成日\s*（開始）|開始日/i);
      const toDateInput = screen.getByLabelText(/作成日\s*（終了）|終了日/i);

      await user.type(fromDateInput, '2025-01-01');
      await user.type(toDateInput, '2025-12-31');

      // 最後のコールを確認
      const calls = onFilterChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall).toMatchObject({
        createdTo: '2025-12-31',
      });
    });

    it('設定された日付範囲が表示される', () => {
      const filterWithDates: ProjectFilter = {
        ...defaultFilter,
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      };
      render(<ProjectSearchFilter filter={filterWithDates} onFilterChange={onFilterChange} />);

      const fromDateInput = screen.getByLabelText(/作成日\s*（開始）|開始日/i) as HTMLInputElement;
      const toDateInput = screen.getByLabelText(/作成日\s*（終了）|終了日/i) as HTMLInputElement;

      expect(fromDateInput.value).toBe('2025-01-01');
      expect(toDateInput.value).toBe('2025-12-31');
    });
  });

  // ==========================================================================
  // 複合フィルタテスト（Requirement 5.4）
  // ==========================================================================

  describe('複合フィルタ', () => {
    it('検索とステータスフィルタを組み合わせられる（Requirement 5.4）', async () => {
      const user = userEvent.setup();
      // 制御コンポーネントなので、既にステータスが設定されているfilterを渡す
      const filterWithStatus: ProjectFilter = {
        ...defaultFilter,
        status: ['PREPARING'],
      };
      render(<ProjectSearchFilter filter={filterWithStatus} onFilterChange={onFilterChange} />);

      // 検索実行
      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'テスト{Enter}');

      // 最後のコールを確認（filterWithStatusのステータスを維持しつつ検索が追加される）
      const calls = onFilterChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall).toMatchObject({
        search: 'テスト',
        status: expect.arrayContaining(['PREPARING']),
      });
    });

    it('すべてのフィルタを組み合わせられる', async () => {
      const user = userEvent.setup();
      // 制御コンポーネントなので、既にフィルタが設定されている状態を渡す
      const filterWithAll: ProjectFilter = {
        search: '',
        status: ['PREPARING'],
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      };
      render(<ProjectSearchFilter filter={filterWithAll} onFilterChange={onFilterChange} />);

      // 検索を追加
      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'テスト{Enter}');

      // 最後のコールを確認
      const calls = onFilterChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall.search).toBe('テスト');
      expect(lastCall.status).toContain('PREPARING');
      expect(lastCall.createdFrom).toBe('2025-01-01');
      expect(lastCall.createdTo).toBe('2025-12-31');
    });
  });

  // ==========================================================================
  // フィルタクリアテスト（Requirement 5.5）
  // ==========================================================================

  describe('フィルタクリア', () => {
    it('フィルタクリアボタンをクリックすると全フィルタがリセットされる（Requirement 5.5）', async () => {
      const user = userEvent.setup();
      const filterWithValues: ProjectFilter = {
        search: 'テスト',
        status: ['PREPARING', 'SURVEYING'],
        createdFrom: '2025-01-01',
        createdTo: '2025-12-31',
      };
      render(<ProjectSearchFilter filter={filterWithValues} onFilterChange={onFilterChange} />);

      const clearButton = screen.getByRole('button', { name: /フィルタをクリア|クリア/i });
      await user.click(clearButton);

      expect(onFilterChange).toHaveBeenCalledWith({
        search: '',
        status: [],
        createdFrom: undefined,
        createdTo: undefined,
      });
    });

    it('フィルタが設定されていない場合もクリアボタンは動作する', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const clearButton = screen.getByRole('button', { name: /フィルタをクリア|クリア/i });
      await user.click(clearButton);

      expect(onFilterChange).toHaveBeenCalledWith({
        search: '',
        status: [],
        createdFrom: undefined,
        createdTo: undefined,
      });
    });
  });

  // ==========================================================================
  // アクセシビリティテスト
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('検索フィールドにaria-label属性が設定される', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      expect(searchInput).toHaveAttribute('aria-label');
    });

    it('エラーメッセージがaria-liveで通知される', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'A{Enter}');

      const errorMessage = screen.getByText(/2文字以上で入力してください/i);
      expect(errorMessage.closest('[aria-live]') || errorMessage).toHaveAttribute('aria-live');
    });

    it('フォーム要素にラベルが関連付けられる', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      // ステータスセレクトにラベルがあること
      const statusSelect = screen.getByLabelText(/ステータス/i);
      expect(statusSelect).toBeInTheDocument();

      // 日付入力にラベルがあること
      const fromDateInput = screen.getByLabelText(/作成日\s*（開始）|開始日/i);
      const toDateInput = screen.getByLabelText(/作成日\s*（終了）|終了日/i);
      expect(fromDateInput).toBeInTheDocument();
      expect(toDateInput).toBeInTheDocument();
    });

    it('検索フォームがform要素としてマークアップされる', () => {
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const form = screen.getByRole('search');
      expect(form).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // キーボード操作テスト
  // ==========================================================================

  describe('キーボード操作', () => {
    it('Tabキーでフォーカス移動ができる', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });

      // 最初のフォーカス
      await user.tab();
      expect(searchInput).toHaveFocus();

      // 次のフォーカス（検索ボタンまたは次のフィールド）
      await user.tab();
      // フォーカスが移動していることを確認
      expect(searchInput).not.toHaveFocus();
    });

    it('Escapeキーでエラーメッセージがクリアされる', async () => {
      const user = userEvent.setup();
      render(<ProjectSearchFilter filter={defaultFilter} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索/i });
      await user.type(searchInput, 'A{Enter}');

      // エラーメッセージが表示される
      expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();

      // Escapeキーでクリア
      await user.keyboard('{Escape}');

      // エラーメッセージが消える
      expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
    });
  });
});
