/**
 * @fileoverview 工事写真アルバム検索・フィルタUIコンポーネントのテスト
 *
 * Task 6.1: 工事写真一覧画面
 *
 * Requirements:
 * - 3.3: アルバム名での部分一致検索
 * - 3.4: 作成日・更新日でソート
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConstructionPhotoSearchFilter from './ConstructionPhotoSearchFilter';
import type { ConstructionPhotoAlbumFilter } from './ConstructionPhotoSearchFilter';
import type {
  ConstructionPhotoAlbumSortableField,
  ConstructionPhotoSortOrder,
} from '../../types/construction-photo.types';

describe('ConstructionPhotoSearchFilter', () => {
  const defaultProps = {
    filter: {} as ConstructionPhotoAlbumFilter,
    sortField: 'createdAt' as ConstructionPhotoAlbumSortableField,
    sortOrder: 'desc' as ConstructionPhotoSortOrder,
    onFilterChange: vi.fn(),
    onSortChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 基本レンダリング
  // ==========================================================================

  describe('基本レンダリング', () => {
    it('検索フォームが正しくレンダリングされること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      expect(screen.getByRole('searchbox', { name: /検索キーワード/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/アルバム名で検索/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '検索' })).toBeInTheDocument();
    });

    it('ソート選択が表示されること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /並び替え/i })).toBeInTheDocument();
    });

    it('フィルタクリアボタンが表示されること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      expect(screen.getByRole('button', { name: /フィルタをクリア/i })).toBeInTheDocument();
    });

    it('検索フォームにrole="search"が設定されていること（アクセシビリティ）', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      expect(screen.getByRole('search', { name: /工事写真検索・フィルタ/i })).toBeInTheDocument();
    });

    it('初期値として検索キーワードが表示されること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} filter={{ search: '初期検索語' }} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      expect(searchInput).toHaveValue('初期検索語');
    });
  });

  // ==========================================================================
  // キーワード検索 (Requirement 3.3)
  // ==========================================================================

  describe('キーワード検索 (Requirement 3.3)', () => {
    it('検索キーワードを入力してEnterキーを押すと検索が実行されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<ConstructionPhotoSearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.type(searchInput, '基礎工事{Enter}');

      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ search: '基礎工事' }));
    });

    it('検索ボタンをクリックすると検索が実行されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<ConstructionPhotoSearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.type(searchInput, 'テストアルバム');
      await user.click(screen.getByRole('button', { name: '検索' }));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'テストアルバム' })
      );
    });

    it('空文字で検索すると全件取得（searchを空文字に設定）になること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <ConstructionPhotoSearchFilter
          {...defaultProps}
          filter={{ search: '既存の検索語' }}
          onFilterChange={onFilterChange}
        />
      );

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.clear(searchInput);
      await user.click(screen.getByRole('button', { name: '検索' }));

      expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ search: '' }));
    });

    it('1文字以下の検索キーワードでエラーメッセージが表示されonFilterChangeが呼ばれないこと', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(<ConstructionPhotoSearchFilter {...defaultProps} onFilterChange={onFilterChange} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });
      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      expect(onFilterChange).not.toHaveBeenCalled();
    });

    it('検索入力中にエラーがクリアされること', async () => {
      const user = userEvent.setup();
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });

      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => {
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      await user.type(searchInput, 'B');

      await waitFor(() => {
        expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ソート切り替え (Requirement 3.4)
  // ==========================================================================

  describe('ソート切り替え (Requirement 3.4)', () => {
    it('ソートフィールドを変更するとonSortChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(<ConstructionPhotoSearchFilter {...defaultProps} onSortChange={onSortChange} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      await user.selectOptions(sortSelect, 'updatedAt');

      expect(onSortChange).toHaveBeenCalledWith('updatedAt', 'desc');
    });

    it('作成日ソートが選択肢に含まれていること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toContainElement(screen.getByRole('option', { name: /作成日/i }));
    });

    it('更新日ソートが選択肢に含まれていること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toContainElement(screen.getByRole('option', { name: /更新日/i }));
    });

    it('現在のソートフィールドが選択されていること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} sortField="updatedAt" />);

      const sortSelect = screen.getByRole('combobox', { name: /並び替え/i });
      expect(sortSelect).toHaveValue('updatedAt');
    });

    it('降順の場合、ソート順序ボタンのaria-labelが降順を示すこと', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} sortOrder="desc" />);

      const sortOrderButton = screen.getByRole('button', { name: /ソート順序を切り替え/i });
      expect(sortOrderButton).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/降順|新しい順/i)
      );
    });

    it('昇順の場合、ソート順序ボタンのaria-labelが昇順を示すこと', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} sortOrder="asc" />);

      const sortOrderButton = screen.getByRole('button', { name: /ソート順序を切り替え/i });
      expect(sortOrderButton).toHaveAttribute('aria-label', expect.stringMatching(/昇順|古い順/i));
    });

    it('降順時にソート順序ボタンをクリックすると昇順に切り替わること', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(
        <ConstructionPhotoSearchFilter
          {...defaultProps}
          sortField="createdAt"
          sortOrder="desc"
          onSortChange={onSortChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /ソート順序を切り替え/i }));

      expect(onSortChange).toHaveBeenCalledWith('createdAt', 'asc');
    });

    it('昇順時にソート順序ボタンをクリックすると降順に切り替わること', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(
        <ConstructionPhotoSearchFilter
          {...defaultProps}
          sortField="updatedAt"
          sortOrder="asc"
          onSortChange={onSortChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /ソート順序を切り替え/i }));

      expect(onSortChange).toHaveBeenCalledWith('updatedAt', 'desc');
    });
  });

  // ==========================================================================
  // フィルタクリア
  // ==========================================================================

  describe('フィルタクリア', () => {
    it('フィルタクリアボタンをクリックするとsearchが空文字で解除されること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <ConstructionPhotoSearchFilter
          {...defaultProps}
          filter={{ search: '検索語' }}
          onFilterChange={onFilterChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /フィルタをクリア/i }));

      expect(onFilterChange).toHaveBeenCalledWith({ search: '' });
    });

    it('フィルタクリア後、検索入力フィールドもクリアされること', async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();
      render(
        <ConstructionPhotoSearchFilter
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
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });

      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => {
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /フィルタをクリア/i }));

      await waitFor(() => {
        expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // アクティブフィルタ表示
  // ==========================================================================

  describe('アクティブフィルタ表示', () => {
    it('フィルタが適用されていない場合、アクティブフィルタ数は表示されないこと', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} filter={{}} />);

      expect(screen.queryByText(/件のフィルタが適用中/i)).not.toBeInTheDocument();
    });

    it('検索フィルタが適用されている場合、「件のフィルタが適用中」と表示されること', () => {
      render(<ConstructionPhotoSearchFilter {...defaultProps} filter={{ search: '検索語' }} />);

      expect(screen.getByText(/件のフィルタが適用中/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // キーボードナビゲーション
  // ==========================================================================

  describe('キーボードナビゲーション', () => {
    it('Escapeキーでエラーがクリアされること', async () => {
      const user = userEvent.setup();
      render(<ConstructionPhotoSearchFilter {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox', { name: /検索キーワード/i });

      await user.type(searchInput, 'A');
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => {
        expect(screen.getByText(/2文字以上で入力してください/i)).toBeInTheDocument();
      });

      await user.type(searchInput, '{Escape}');

      await waitFor(() => {
        expect(screen.queryByText(/2文字以上で入力してください/i)).not.toBeInTheDocument();
      });
    });
  });
});
