/**
 * @fileoverview QuantityTableSectionCardコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 4.1: QuantityTableSectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 1.1: プロジェクト詳細画面に数量表セクションを表示する
 * - 1.2: 数量表の総数とヘッダーを表示する
 * - 1.3: 直近の数量表カードを一覧表示する
 * - 1.4: 数量表一覧画面への遷移リンク
 * - 1.5: 数量表詳細/編集画面への遷移リンク
 * - 1.6: 空状態表示（数量表がない場合）
 * - 1.7: 新規作成ボタン
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QuantityTableSectionCard } from './QuantityTableSectionCard';

// ルーター付きレンダリングヘルパー
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// テスト用モックデータ
const mockQuantityTables = [
  {
    id: 'table-1',
    name: '第1回見積数量表',
    groupCount: 3,
    itemCount: 25,
    projectId: 'project-123',
    createdAt: '2024-05-15T00:00:00.000Z',
    updatedAt: '2024-05-15T00:00:00.000Z',
  },
  {
    id: 'table-2',
    name: '第2回見積数量表',
    groupCount: 5,
    itemCount: 40,
    projectId: 'project-123',
    createdAt: '2024-04-15T00:00:00.000Z',
    updatedAt: '2024-04-15T00:00:00.000Z',
  },
];

describe('QuantityTableSectionCard', () => {
  const projectId = 'project-123';

  describe('基本表示', () => {
    it('セクションタイトル「数量表」を表示する（Requirements: 1.1）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      expect(screen.getByText('数量表')).toBeInTheDocument();
    });

    it('総数を表示する（Requirements: 1.2）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('直近の数量表カードを表示する（Requirements: 1.3）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      expect(screen.getByText('第2回見積数量表')).toBeInTheDocument();
    });

    it('グループ数と項目数を表示する（Requirements: 1.3）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      // 第1回: 3グループ、25項目
      expect(screen.getByText(/3グループ/)).toBeInTheDocument();
      expect(screen.getByText(/25項目/)).toBeInTheDocument();
    });

    it('作成日を表示する', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      // 日付フォーマット: 2024年5月15日
      expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
      expect(screen.getByText(/2024年4月15日/)).toBeInTheDocument();
    });
  });

  describe('ナビゲーション', () => {
    it('「すべて見る」リンクが数量表一覧に遷移する（Requirements: 1.4）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/quantity-tables`);
    });

    it('数量表カードが詳細画面への遷移リンクを持つ（Requirements: 1.5）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      // 数量表カードへのリンクを取得（新規作成ボタンを除外）
      const tableLinks = screen
        .getAllByRole('link', { name: /数量表/ })
        .filter((link) => !link.getAttribute('href')?.includes('/new'));
      expect(tableLinks[0]).toHaveAttribute(
        'href',
        `/projects/${projectId}/quantity-tables/table-1`
      );
    });
  });

  describe('空状態', () => {
    it('数量表が0件の場合はメッセージを表示する（Requirements: 1.6）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={0}
          latestTables={[]}
          isLoading={false}
        />
      );

      expect(screen.getByText(/数量表はまだありません/)).toBeInTheDocument();
    });

    it('数量表が0件でも新規作成リンクを表示する（Requirements: 1.7）', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={0}
          latestTables={[]}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /新規作成/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/quantity-tables/new`);
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={0}
          latestTables={[]}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('quantity-table-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数を非表示にする', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={true}
        />
      );

      expect(screen.queryByText('全5件')).not.toBeInTheDocument();
    });
  });

  describe('アイコン表示', () => {
    it('数量表アイコンを表示する', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      // 各数量表カードにテーブルアイコンが表示されていることを確認（複数存在）
      const icons = screen.getAllByTestId('quantity-table-icon');
      expect(icons.length).toBe(2); // mockQuantityTablesは2件
    });
  });

  describe('アクセシビリティ', () => {
    it('セクション要素を持つ', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('見出し要素を持つ', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      expect(screen.getByRole('heading', { name: '数量表' })).toBeInTheDocument();
    });

    it('リンクに適切なaria-labelを持つ', () => {
      renderWithRouter(
        <QuantityTableSectionCard
          projectId={projectId}
          totalCount={5}
          latestTables={mockQuantityTables}
          isLoading={false}
        />
      );

      const link = screen.getByLabelText('第1回見積数量表の数量表詳細を見る');
      expect(link).toBeInTheDocument();
    });
  });
});
