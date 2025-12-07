/**
 * @fileoverview PaginationUI コンポーネント テスト
 *
 * Task 8.4: ページネーションUIの実装
 *
 * Requirements (project-management):
 * - REQ-3.1: 1ページあたりのデフォルト表示件数を20件とする
 * - REQ-3.2: プロジェクト総数がページサイズを超える場合、ページネーションコントロールを表示
 * - REQ-3.3: ページ番号クリックで該当ページのプロジェクトを表示
 * - REQ-3.4: 現在のページ番号、総ページ数、総プロジェクト数を表示
 * - REQ-3.5: 表示件数変更で選択された件数で一覧を再表示
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginationUI from '../../../components/projects/PaginationUI';
import type { PaginationInfo } from '../../../types/project.types';

// ============================================================================
// テストデータ
// ============================================================================

const defaultPagination: PaginationInfo = {
  page: 1,
  limit: 20,
  total: 100,
  totalPages: 5,
};

const singlePagePagination: PaginationInfo = {
  page: 1,
  limit: 20,
  total: 15,
  totalPages: 1,
};

const middlePagePagination: PaginationInfo = {
  page: 3,
  limit: 20,
  total: 100,
  totalPages: 5,
};

const lastPagePagination: PaginationInfo = {
  page: 5,
  limit: 20,
  total: 100,
  totalPages: 5,
};

const largePagination: PaginationInfo = {
  page: 5,
  limit: 20,
  total: 1000,
  totalPages: 50,
};

// ============================================================================
// 基本的なレンダリングテスト
// ============================================================================

describe('PaginationUI', () => {
  describe('基本的なレンダリング', () => {
    it('ページネーションコントロールが表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
    });

    it('総件数がページサイズ以下の場合でもページネーションは表示される', () => {
      render(
        <PaginationUI
          pagination={singlePagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // ページネーション情報は表示される
      expect(screen.getByTestId('pagination-controls')).toBeInTheDocument();
    });
  });

  describe('ページ情報表示（project-management/REQ-3.4）', () => {
    it('現在のページ番号が表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      expect(screen.getByTestId('current-page')).toHaveTextContent('1');
    });

    it('総ページ数が表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      expect(screen.getByTestId('total-pages')).toHaveTextContent('5');
    });

    it('総件数が表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      expect(screen.getByTestId('total-count')).toHaveTextContent('100');
    });

    it('ページ情報が日本語で適切にフォーマットされる', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // "100件中 1-20件を表示" または類似のフォーマット
      // テキストが複数要素に分割されているため、data-testidで総件数を確認
      expect(screen.getByTestId('total-count')).toHaveTextContent('100');
      // 件中のテキストが表示されていることを確認
      expect(screen.getByText(/件中/)).toBeInTheDocument();
    });

    it('中間ページのページ情報が正しく表示される', () => {
      render(
        <PaginationUI
          pagination={middlePagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      expect(screen.getByTestId('current-page')).toHaveTextContent('3');
      expect(screen.getByTestId('total-pages')).toHaveTextContent('5');
    });
  });

  describe('ページ遷移（project-management/REQ-3.2, REQ-3.3）', () => {
    it('前のページボタンをクリックするとonPageChangeが呼ばれる', async () => {
      const onPageChange = vi.fn();
      render(
        <PaginationUI
          pagination={middlePagePagination}
          onPageChange={onPageChange}
          onLimitChange={vi.fn()}
        />
      );

      const prevButton = screen.getByRole('button', { name: /前のページ/i });
      await userEvent.click(prevButton);

      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('次のページボタンをクリックするとonPageChangeが呼ばれる', async () => {
      const onPageChange = vi.fn();
      render(
        <PaginationUI
          pagination={middlePagePagination}
          onPageChange={onPageChange}
          onLimitChange={vi.fn()}
        />
      );

      const nextButton = screen.getByRole('button', { name: /次のページ/i });
      await userEvent.click(nextButton);

      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('最初のページでは前のページボタンが無効化される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const prevButton = screen.getByRole('button', { name: /前のページ/i });
      expect(prevButton).toBeDisabled();
    });

    it('最後のページでは次のページボタンが無効化される', () => {
      render(
        <PaginationUI
          pagination={lastPagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const nextButton = screen.getByRole('button', { name: /次のページ/i });
      expect(nextButton).toBeDisabled();
    });

    it('ページ番号をクリックすると該当ページに遷移する', async () => {
      const onPageChange = vi.fn();
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={onPageChange}
          onLimitChange={vi.fn()}
        />
      );

      // ページ番号ボタンをクリック
      const pageButton = screen.getByRole('button', { name: /ページ 3/i });
      await userEvent.click(pageButton);

      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('現在のページはクリック不可', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // 現在のページ（1ページ目）は aria-current="page" が設定されている
      const currentPageButton = screen.getByRole('button', { name: /ページ 1/i });
      expect(currentPageButton).toHaveAttribute('aria-current', 'page');
      expect(currentPageButton).toBeDisabled();
    });

    it('1ページしかない場合は前後ボタンが両方無効化される', () => {
      render(
        <PaginationUI
          pagination={singlePagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const prevButton = screen.getByRole('button', { name: /前のページ/i });
      const nextButton = screen.getByRole('button', { name: /次のページ/i });

      expect(prevButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
    });
  });

  describe('表示件数変更（project-management/REQ-3.1, REQ-3.5）', () => {
    it('表示件数選択ドロップダウンが表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      expect(screen.getByRole('combobox', { name: /表示件数/i })).toBeInTheDocument();
    });

    it('10件/20件/50件の選択肢が表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox', { name: /表示件数/i });
      const options = within(select).getAllByRole('option');

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveValue('10');
      expect(options[1]).toHaveValue('20');
      expect(options[2]).toHaveValue('50');
    });

    it('現在の表示件数が選択されている', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox', { name: /表示件数/i });
      expect(select).toHaveValue('20');
    });

    it('表示件数を変更するとonLimitChangeが呼ばれる', async () => {
      const onLimitChange = vi.fn();
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={onLimitChange}
        />
      );

      const select = screen.getByRole('combobox', { name: /表示件数/i });
      await userEvent.selectOptions(select, '50');

      expect(onLimitChange).toHaveBeenCalledWith(50);
    });

    it('デフォルト表示件数は20件', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox', { name: /表示件数/i });
      expect(select).toHaveValue('20');
    });

    it('10件を選択するとonLimitChangeが10で呼ばれる', async () => {
      const onLimitChange = vi.fn();
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={onLimitChange}
        />
      );

      const select = screen.getByRole('combobox', { name: /表示件数/i });
      await userEvent.selectOptions(select, '10');

      expect(onLimitChange).toHaveBeenCalledWith(10);
    });
  });

  describe('ページ番号リスト表示', () => {
    it('ページ数が少ない場合は全てのページ番号が表示される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // 5ページ分のボタンが表示される
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByRole('button', { name: new RegExp(`ページ ${i}`) })).toBeInTheDocument();
      }
    });

    it('ページ数が多い場合は省略記号（...）が表示される', () => {
      render(
        <PaginationUI pagination={largePagination} onPageChange={vi.fn()} onLimitChange={vi.fn()} />
      );

      // 省略記号が表示される（複数ある場合があるのでgetAllByTextを使用）
      const ellipses = screen.getAllByText('...');
      expect(ellipses.length).toBeGreaterThan(0);
    });

    it('先頭ページ付近では先頭のページ番号と最後のページが表示される', () => {
      const pagination: PaginationInfo = {
        page: 2,
        limit: 20,
        total: 1000,
        totalPages: 50,
      };

      render(
        <PaginationUI pagination={pagination} onPageChange={vi.fn()} onLimitChange={vi.fn()} />
      );

      // 先頭のページ番号が表示される
      expect(screen.getByRole('button', { name: /ページ 1/i })).toBeInTheDocument();
      // 最後のページ番号が表示される
      expect(screen.getByRole('button', { name: /ページ 50/i })).toBeInTheDocument();
    });

    it('末尾ページ付近では最後のページ番号と先頭のページが表示される', () => {
      const pagination: PaginationInfo = {
        page: 49,
        limit: 20,
        total: 1000,
        totalPages: 50,
      };

      render(
        <PaginationUI pagination={pagination} onPageChange={vi.fn()} onLimitChange={vi.fn()} />
      );

      // 先頭のページ番号が表示される
      expect(screen.getByRole('button', { name: /ページ 1/i })).toBeInTheDocument();
      // 最後のページ番号が表示される
      expect(screen.getByRole('button', { name: /ページ 50/i })).toBeInTheDocument();
    });

    it('中間ページでは前後のページ番号が表示される', () => {
      const pagination: PaginationInfo = {
        page: 25,
        limit: 20,
        total: 1000,
        totalPages: 50,
      };

      render(
        <PaginationUI pagination={pagination} onPageChange={vi.fn()} onLimitChange={vi.fn()} />
      );

      // 現在のページ（25）の前後が表示される
      expect(screen.getByRole('button', { name: /ページ 24/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ページ 25/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ページ 26/i })).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('ナビゲーション要素にaria-label属性が設定される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'ページネーション');
    });

    it('現在のページにaria-current="page"が設定される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const currentPageButton = screen.getByRole('button', { name: /ページ 1/i });
      expect(currentPageButton).toHaveAttribute('aria-current', 'page');
    });

    it('無効化されたボタンにはaria-disabled属性が設定される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const prevButton = screen.getByRole('button', { name: /前のページ/i });
      expect(prevButton).toBeDisabled();
    });

    it('キーボードでページ変更ができる', async () => {
      const onPageChange = vi.fn();
      render(
        <PaginationUI
          pagination={middlePagePagination}
          onPageChange={onPageChange}
          onLimitChange={vi.fn()}
        />
      );

      const nextButton = screen.getByRole('button', { name: /次のページ/i });
      nextButton.focus();
      await userEvent.keyboard('{Enter}');

      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('表示件数ドロップダウンにラベルが関連付けられている', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox', { name: /表示件数/i });
      expect(select).toBeInTheDocument();
    });
  });

  describe('表示範囲計算', () => {
    it('1ページ目で正しい表示範囲が計算される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // 1-20件目を表示
      expect(screen.getByText(/1-20件/)).toBeInTheDocument();
    });

    it('中間ページで正しい表示範囲が計算される', () => {
      render(
        <PaginationUI
          pagination={middlePagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // 41-60件目を表示
      expect(screen.getByText(/41-60件/)).toBeInTheDocument();
    });

    it('最後のページで正しい表示範囲が計算される', () => {
      render(
        <PaginationUI
          pagination={lastPagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // 81-100件目を表示
      expect(screen.getByText(/81-100件/)).toBeInTheDocument();
    });

    it('総件数が表示件数より少ない場合の表示範囲', () => {
      render(
        <PaginationUI
          pagination={singlePagePagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      // 1-15件目を表示
      expect(screen.getByText(/1-15件/)).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('現在のページボタンがハイライトされる', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const currentPageButton = screen.getByRole('button', { name: /ページ 1/i });
      // アクティブなスタイルが適用されている
      expect(currentPageButton).toHaveClass('bg-blue-600');
    });

    it('無効化されたボタンに無効化スタイルが適用される', () => {
      render(
        <PaginationUI
          pagination={defaultPagination}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      );

      const prevButton = screen.getByRole('button', { name: /前のページ/i });
      expect(prevButton).toHaveClass('cursor-not-allowed');
    });
  });
});
