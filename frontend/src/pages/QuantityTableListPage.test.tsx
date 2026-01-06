/**
 * @fileoverview 数量表一覧画面のテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 4.2: 数量表一覧画面を実装する
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableListPage from './QuantityTableListPage';
import * as quantityTablesApi from '../api/quantity-tables';

// APIモック
vi.mock('../api/quantity-tables');

// テスト用モックデータ
const mockQuantityTables = {
  data: [
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
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  },
};

// ルーター付きレンダリングヘルパー
const renderWithRouter = (projectId: string = 'project-123') => {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/quantity-tables`]}>
      <Routes>
        <Route path="/projects/:projectId/quantity-tables" element={<QuantityTableListPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('QuantityTableListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('ページタイトル「数量表一覧」を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '数量表一覧' })).toBeInTheDocument();
      });
    });

    it('数量表一覧を表示する（Requirements: 2.3）', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
        expect(screen.getByText('第2回見積数量表')).toBeInTheDocument();
      });
    });

    it('グループ数と項目数を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/3グループ/)).toBeInTheDocument();
        expect(screen.getByText(/25項目/)).toBeInTheDocument();
      });
    });

    it('作成日を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
        expect(screen.getByText(/2024年4月15日/)).toBeInTheDocument();
      });
    });
  });

  describe('新規作成', () => {
    it('新規作成ボタンを表示する（Requirements: 2.1）', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /新規作成/ })).toBeInTheDocument();
      });
    });

    it('新規作成ボタンが正しいパスにリンクする', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter('project-123');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /新規作成/ });
        expect(link).toHaveAttribute('href', '/projects/project-123/quantity-tables/new');
      });
    });
  });

  describe('空状態', () => {
    it('数量表が0件の場合はメッセージを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/数量表はまだありません/)).toBeInTheDocument();
      });
    });

    it('空状態でも新規作成リンクを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /新規作成/ })).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスピナーを表示する', async () => {
      // 解決しないPromiseでローディング状態を維持
      vi.mocked(quantityTablesApi.getQuantityTables).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時はエラーメッセージを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('エラー時は再試行ボタンを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
      });
    });
  });

  describe('ナビゲーション', () => {
    it('数量表カードが詳細画面へのリンクを持つ', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter('project-123');

      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /数量表詳細を見る/ });
        expect(links[0]).toHaveAttribute('href', '/projects/project-123/quantity-tables/table-1');
      });
    });

    it('「戻る」リンクがプロジェクト詳細画面へ遷移する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter('project-123');

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /プロジェクト詳細に戻る/ });
        expect(backLink).toHaveAttribute('href', '/projects/project-123');
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('メイン要素を持つ', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('見出し要素を持つ', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });
  });
});
