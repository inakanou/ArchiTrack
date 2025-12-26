/**
 * @fileoverview 現場調査検索・フィルタUIコンポーネントのテスト
 *
 * Task 8.2: 検索・フィルタリングUIを実装する
 *
 * Requirements:
 * - 3.2: キーワード検索（名前・メモの部分一致）
 * - 3.3: 調査日範囲フィルター
 * - 3.4: ソート切り替え（調査日・作成日・更新日）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteSurveySearchFilter from '../../../components/site-surveys/SiteSurveySearchFilter';
import type {
  SiteSurveyFilter,
  SiteSurveySortableField,
  SiteSurveySortOrder,
} from '../../../types/site-survey.types';

describe('SiteSurveySearchFilter', () => {
  // ============================================================================
  // テストセットアップ
  // ============================================================================

  const defaultProps = {
    filter: {} as SiteSurveyFilter,
    sortField: 'surveyDate' as SiteSurveySortableField,
    sortOrder: 'desc' as SiteSurveySortOrder,
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 基本レンダリングテスト
  // ============================================================================

  describe('基本レンダリング', () => {
    it('検索フォームが正しくレンダリングされること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      // 検索フィールド
      expect(screen.getByRole('searchbox', { name: /検索キーワード/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/現場調査名・メモで検索/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /検索/i })).toBeInTheDocument();
    });

    it('調査日範囲フィルターが表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      // 調査日フィルター
      expect(screen.getByLabelText(/調査日（開始）/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/調査日（終了）/i)).toBeInTheDocument();
    });

    it('ソート選択が表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      // ソート選択
      expect(screen.getByLabelText(/並び替え/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /並び替え/i })).toBeInTheDocument();
    });

    it('フィルタクリアボタンが表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      expect(screen.getByRole('button', { name: /フィルタをクリア/i })).toBeInTheDocument();
    });

    it('検索フォームにrole="search"が設定されていること（アクセシビリティ）', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      expect(screen.getByRole('search', { name: /現場調査検索・フィルタ/i })).toBeInTheDocument();
    });
  });

  // ============================================================================
  // キーワード検索テスト (Requirement 3.2)
  // ============================================================================

  describe('キーワード検索 (Requirement 3.2)', () => {
    it('検索キーワードを入力してEnterキーを押すと検索が実行されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.type(searchInput, '現場調査A{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ search: '現場調査A' }));
    });

    it('検索ボタンをクリックすると検索が実行されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.type(searchInput, 'テスト調査');
      await user.click(screen.getByRole('button', { name: /検索/i }));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'テスト調査' })
      );
    });

    it('空文字で検索すると全件取得（searchを空文字に設定）になること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          filter={{ search: '既存の検索語' }}
          onFilterChange={onFilterChange}
        />
      );

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.clear(searchInput);
      await user.click(screen.getByRole('button', { name: /検索/i }));

      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ search: '' }));
    });

    it('1文字以下の検索キーワードでエラーメッセージが表示されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: /検索/i }));

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      // onFilterChangeは呼ばれない
      expect(onFilterChange).not.toHaveBeenCalled();
    });

    it('検索入力中にエラーがクリアされること', async () => {
      const user = userEvent.setup();
      render(<SiteSurveySearchFilter {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });

      // 1文字入力して検索（エラー発生）
      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: /検索/i }));

      // エラー表示を確認
      await waitFor(() => {
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      // さらに入力するとエラーがクリア
      await user.type(searchInput, 'B');

      await waitFor(() => {
        expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
      });
    });

    it('初期値として検索キーワードが表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} filter={{ search: '初期検索語' }} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      expect(searchInput).toHaveValue('初期検索語');
    });
  });

  // ============================================================================
  // 調査日範囲フィルターテスト (Requirement 3.3)
  // ============================================================================

  describe('調査日範囲フィルター (Requirement 3.3)', () => {
    it('開始日を選択するとonFilterChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const fromDateInput = screen.getByLabelText(/調査日（開始）/i);
      await user.type(fromDateInput, '2025-01-01');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ surveyDateFrom: '2025-01-01' })
      );
    });

    it('終了日を選択するとonFilterChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const toDateInput = screen.getByLabelText(/調査日（終了）/i);
      await user.type(toDateInput, '2025-12-31');

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ surveyDateTo: '2025-12-31' })
      );
    });

    it('日付範囲を指定して両方の値が設定されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const fromDateInput = screen.getByLabelText(/調査日（開始）/i);
      const toDateInput = screen.getByLabelText(/調査日（終了）/i);

      await user.type(fromDateInput, '2025-01-01');
      await user.type(toDateInput, '2025-03-31');

      // 開始日と終了日の両方が設定されている
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ surveyDateFrom: '2025-01-01' })
      );
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ surveyDateTo: '2025-03-31' })
      );
    });

    it('日付をクリアするとフィルタが解除されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          filter={{ surveyDateFrom: '2025-01-01' }}
          onFilterChange={onFilterChange}
        />
      );

      const fromDateInput = screen.getByLabelText(/調査日（開始）/i);
      await user.clear(fromDateInput);

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ surveyDateFrom: undefined })
      );
    });

    it('初期値として日付範囲が表示されること', () => {
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          filter={{ surveyDateFrom: '2025-01-01', surveyDateTo: '2025-12-31' }}
        />
      );

      const fromDateInput = screen.getByLabelText(/調査日（開始）/i);
      const toDateInput = screen.getByLabelText(/調査日（終了）/i);

      expect(fromDateInput).toHaveValue('2025-01-01');
      expect(toDateInput).toHaveValue('2025-12-31');
    });
  });

  // ============================================================================
  // ソート切り替えテスト (Requirement 3.4)
  // ============================================================================

  describe('ソート切り替え (Requirement 3.4)', () => {
    it('ソートフィールドを変更するとonSortChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(<SiteSurveySearchFilter {...defaultProps} onSortChange={onSortChange} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      await user.selectOptions(sortSelect, 'createdAt');

      expect(onSortChange).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('調査日ソートが選択肢に含まれていること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toContainElement(screen.getByRole('option', { name: /調査日/i }));
    });

    it('作成日ソートが選択肢に含まれていること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toContainElement(screen.getByRole('option', { name: /作成日/i }));
    });

    it('更新日ソートが選択肢に含まれていること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toContainElement(screen.getByRole('option', { name: /更新日/i }));
    });

    it('現在のソートフィールドが選択されていること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} sortField="createdAt" />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toHaveValue('createdAt');
    });

    it('ソート順序切り替えボタンがあること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} />);

      expect(screen.getByRole('button', { name: /ソート順序を切り替え/i })).toBeInTheDocument();
    });

    it('降順の場合、ソート順序ボタンに降順アイコンが表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} sortOrder="desc" />);

      // アイコンまたはテキストで降順を示す
      const sortOrderButton = screen.getByRole('button', { name: /ソート順序を切り替え/i });
      expect(sortOrderButton).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/降順|新しい順/i)
      );
    });

    it('昇順の場合、ソート順序ボタンに昇順アイコンが表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} sortOrder="asc" />);

      const sortOrderButton = screen.getByRole('button', { name: /ソート順序を切り替え/i });
      expect(sortOrderButton).toHaveAttribute('aria-label', expect.stringMatching(/昇順|古い順/i));
    });

    it('ソート順序ボタンをクリックするとonSortChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          sortField="surveyDate"
          sortOrder="desc"
          onSortChange={onSortChange}
        />
      );

      const sortOrderButton = screen.getByRole('button', { name: /ソート順序を切り替え/i });
      await user.click(sortOrderButton);

      // 降順から昇順に変更
      expect(onSortChange).toHaveBeenCalledWith('surveyDate', 'asc');
    });
  });

  // ============================================================================
  // フィルタクリアテスト
  // ============================================================================

  describe('フィルタクリア', () => {
    it('フィルタクリアボタンをクリックするとすべてのフィルタが解除されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          filter={{
            search: '検索語',
            surveyDateFrom: '2025-01-01',
            surveyDateTo: '2025-12-31',
          }}
          onFilterChange={onFilterChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /フィルタをクリア/i }));

      expect(onFilterChange).toHaveBeenCalledWith({
        search: '',
        surveyDateFrom: undefined,
        surveyDateTo: undefined,
      });
    });

    it('フィルタクリア後、検索入力フィールドもクリアされること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          filter={{ search: '検索語' }}
          onFilterChange={onFilterChange}
        />
      );

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      expect(searchInput).toHaveValue('検索語');

      await user.click(screen.getByRole('button', { name: /フィルタをクリア/i }));

      expect(searchInput).toHaveValue('');
    });

    it('フィルタクリア後、エラーメッセージもクリアされること', async () => {
      const user = userEvent.setup();
      render(<SiteSurveySearchFilter {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });

      // 1文字入力して検索（エラー発生）
      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: /検索/i }));

      // エラー表示を確認
      await waitFor(() => {
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      // フィルタクリア
      await user.click(screen.getByRole('button', { name: /フィルタをクリア/i }));

      // エラーがクリアされる
      await waitFor(() => {
        expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // アクティブフィルタ表示テスト
  // ============================================================================

  describe('アクティブフィルタ表示', () => {
    it('フィルタが適用されていない場合、アクティブフィルタ数は表示されないこと', () => {
      render(<SiteSurveySearchFilter {...defaultProps} filter={{}} />);

      expect(screen.queryByText(/件のフィルタが適用中/i)).not.toBeInTheDocument();
    });

    it('1件のフィルタが適用されている場合、「1件のフィルタが適用中」と表示されること', () => {
      render(<SiteSurveySearchFilter {...defaultProps} filter={{ search: '検索語' }} />);

      expect(screen.getByText(/1/)).toBeInTheDocument();
      expect(screen.getByText(/件のフィルタが適用中/i)).toBeInTheDocument();
    });

    it('複数のフィルタが適用されている場合、正確な件数が表示されること', () => {
      render(
        <SiteSurveySearchFilter
          {...defaultProps}
          filter={{
            search: '検索語',
            surveyDateFrom: '2025-01-01',
            surveyDateTo: '2025-12-31',
          }}
        />
      );

      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/件のフィルタが適用中/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // レスポンシブデザインテスト
  // ============================================================================

  describe('レスポンシブデザイン', () => {
    it('コンポーネントがgridレイアウトを使用していること', () => {
      const { container } = render(<SiteSurveySearchFilter {...defaultProps} />);

      // grid クラスが存在することを確認
      const gridElement = container.querySelector('.grid');
      expect(gridElement).toBeInTheDocument();
    });
  });

  // ============================================================================
  // キーボードナビゲーションテスト
  // ============================================================================

  describe('キーボードナビゲーション', () => {
    it('Escapeキーでエラーがクリアされること', async () => {
      const user = userEvent.setup();
      render(<SiteSurveySearchFilter {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });

      // 1文字入力して検索（エラー発生）
      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: /検索/i }));

      // エラー表示を確認
      await waitFor(() => {
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      // Escapeキーでエラーをクリア
      await user.type(searchInput, '{Escape}');

      await waitFor(() => {
        expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
      });
    });
  });
});
