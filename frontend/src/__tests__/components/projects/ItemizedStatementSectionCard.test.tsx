/**
 * @fileoverview ItemizedStatementSectionCard テスト
 *
 * Task 18.1: ItemizedStatementSectionCardの更新テスト
 *
 * Requirements:
 * - 1.8: プロジェクトに数量表が存在しない場合、内訳書セクションは「まず数量表を作成してください」メッセージを表示し新規作成ボタンを非表示とする
 * - 3.3: 数量表が存在しない場合、内訳書セクションは「まず数量表を作成してください」メッセージを表示する
 * - 3.4: 数量表は存在するが内訳書が存在しない場合、内訳書セクションは「内訳書はまだありません」メッセージを表示する
 * - 11.3: 数量表が存在する場合、内訳書セクションは新規作成ボタンを表示する
 * - 11.4: ユーザーが新規作成ボタンをクリックすると、システムは内訳書新規作成画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ItemizedStatementSectionCard } from '../../../components/projects/ItemizedStatementSectionCard';
import type { ItemizedStatementInfo } from '../../../types/itemized-statement.types';
import type { QuantityTableInfo } from '../../../types/quantity-table.types';

// モックデータ
const mockQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    name: 'テスト数量表',
    projectId: 'project-123',
    itemCount: 10,
    groupCount: 2,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
  },
];

const mockEmptyQuantityTables: QuantityTableInfo[] = [];

const mockItemizedStatements: ItemizedStatementInfo[] = [
  {
    id: 'statement-1',
    name: 'テスト内訳書1',
    projectId: 'project-123',
    sourceQuantityTableId: 'qt-1',
    sourceQuantityTableName: 'テスト数量表',
    itemCount: 10,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
  },
];

// テストヘルパー
const renderWithRouter = (
  props: Partial<React.ComponentProps<typeof ItemizedStatementSectionCard>> = {}
) => {
  const defaultProps = {
    projectId: 'project-123',
    totalCount: 0,
    latestStatements: [],
    quantityTables: mockQuantityTables,
    isLoading: false,
  };

  return render(
    <MemoryRouter initialEntries={['/projects/project-123']}>
      <Routes>
        <Route
          path="/projects/:projectId"
          element={<ItemizedStatementSectionCard {...defaultProps} {...props} />}
        />
        <Route
          path="/projects/:projectId/itemized-statements/new"
          element={<div data-testid="create-page">内訳書作成画面</div>}
        />
        <Route
          path="/projects/:projectId/quantity-tables/new"
          element={<div data-testid="quantity-table-create-page">数量表作成画面</div>}
        />
      </Routes>
    </MemoryRouter>
  );
};

describe('ItemizedStatementSectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('数量表がない場合 (Requirements 1.8, 3.3)', () => {
    it('数量表がない場合「まず数量表を作成してください」メッセージが表示されること', async () => {
      renderWithRouter({
        quantityTables: mockEmptyQuantityTables,
        totalCount: 0,
        latestStatements: [],
      });

      await waitFor(() => {
        expect(screen.getByText('まず数量表を作成してください')).toBeInTheDocument();
      });
    });

    it('数量表がない場合、新規作成ボタンが非表示であること', async () => {
      renderWithRouter({
        quantityTables: mockEmptyQuantityTables,
        totalCount: 0,
        latestStatements: [],
      });

      await waitFor(() => {
        expect(screen.getByText('まず数量表を作成してください')).toBeInTheDocument();
      });

      // 新規作成ボタンが表示されていないことを確認
      expect(screen.queryByRole('link', { name: /新規作成/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /新規作成/i })).not.toBeInTheDocument();
    });

    it('数量表がない場合、数量表作成へのリンクが表示されること', async () => {
      renderWithRouter({
        quantityTables: mockEmptyQuantityTables,
        totalCount: 0,
        latestStatements: [],
      });

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /数量表を作成/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/projects/project-123/quantity-tables/new');
      });
    });
  });

  describe('数量表あり・内訳書なしの場合 (Requirements 3.4, 11.3)', () => {
    it('数量表あり・内訳書なしの場合「内訳書はまだありません」メッセージが表示されること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 0,
        latestStatements: [],
      });

      await waitFor(() => {
        expect(screen.getByText('内訳書はまだありません')).toBeInTheDocument();
      });
    });

    it('数量表あり・内訳書なしの場合、新規作成ボタンが表示されること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 0,
        latestStatements: [],
      });

      await waitFor(() => {
        const createLink = screen.getByRole('link', { name: /新規作成/i });
        expect(createLink).toBeInTheDocument();
      });
    });
  });

  describe('新規作成ボタンのLink遷移 (Requirement 11.4)', () => {
    it('新規作成ボタンが/projects/${projectId}/itemized-statements/newへのLinkであること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 0,
        latestStatements: [],
      });

      await waitFor(() => {
        const createLink = screen.getByRole('link', { name: /新規作成/i });
        expect(createLink).toHaveAttribute('href', '/projects/project-123/itemized-statements/new');
      });
    });

    it('内訳書があるときのヘッダーの新規作成ボタンもLinkであること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 1,
        latestStatements: mockItemizedStatements,
      });

      await waitFor(() => {
        const createLink = screen.getByRole('link', { name: /内訳書を新規作成/i });
        expect(createLink).toHaveAttribute('href', '/projects/project-123/itemized-statements/new');
      });
    });
  });

  describe('内訳書一覧表示', () => {
    it('内訳書一覧が正しく表示されること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 1,
        latestStatements: mockItemizedStatements,
      });

      await waitFor(() => {
        expect(screen.getByText('テスト内訳書1')).toBeInTheDocument();
      });
    });

    it('内訳書詳細へのリンクが正しく設定されていること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 1,
        latestStatements: mockItemizedStatements,
      });

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /テスト内訳書1の内訳書詳細を見る/i });
        expect(link).toHaveAttribute('href', '/itemized-statements/statement-1');
      });
    });

    it('一覧画面へのリンクが表示されること', async () => {
      renderWithRouter({
        quantityTables: mockQuantityTables,
        totalCount: 1,
        latestStatements: mockItemizedStatements,
      });

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /すべて見る/i });
        expect(link).toHaveAttribute('href', '/projects/project-123/itemized-statements');
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトン表示されること', async () => {
      renderWithRouter({
        isLoading: true,
      });

      expect(screen.getByTestId('itemized-statement-section-skeleton')).toBeInTheDocument();
    });
  });

  describe('セクションヘッダー', () => {
    it('セクションタイトル「内訳書」が表示されること', async () => {
      renderWithRouter();

      expect(screen.getByRole('heading', { name: '内訳書' })).toBeInTheDocument();
    });

    it('総数が表示されること', async () => {
      renderWithRouter({
        totalCount: 5,
        latestStatements: mockItemizedStatements,
      });

      expect(screen.getByText('全5件')).toBeInTheDocument();
    });
  });
});
