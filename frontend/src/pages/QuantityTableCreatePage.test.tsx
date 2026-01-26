/**
 * @fileoverview 数量表新規作成画面テスト
 *
 * Task 10.1: ルーティングと画面遷移の統合
 *
 * Requirements:
 * - 2.1: 数量表名を入力して作成を確定する
 * - 2.2: 新しい数量表を作成し、数量表編集画面に遷移する
 * - 12.3: パンくずナビゲーション「プロジェクト一覧 > {プロジェクト名} > 数量表 > 新規作成」
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import QuantityTableCreatePage from './QuantityTableCreatePage';
import * as quantityTablesApi from '../api/quantity-tables';
import * as projectsApi from '../api/projects';

// モック設定
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
    useParams: vi.fn(),
  };
});

vi.mock('../api/quantity-tables', () => ({
  createQuantityTable: vi.fn(),
}));

vi.mock('../api/projects', () => ({
  getProject: vi.fn(),
}));

// ============================================================================
// テストユーティリティ
// ============================================================================

const mockNavigate = vi.fn();
const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  status: 'PREPARING' as const,
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/projects/project-123/quantity-tables/new']}>
      <Routes>
        <Route
          path="/projects/:projectId/quantity-tables/new"
          element={<QuantityTableCreatePage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// テスト
// ============================================================================

describe('QuantityTableCreatePage', () => {
  beforeEach(() => {
    (useNavigate as Mock).mockReturnValue(mockNavigate);
    (useParams as Mock).mockReturnValue({ projectId: 'project-123' });
    (projectsApi.getProject as Mock).mockResolvedValue(mockProject);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('画面表示', () => {
    it('数量表作成フォームが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /新規作成/i })).toBeInTheDocument();
      });
    });

    it('数量表名入力フィールドが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/数量表名/i)).toBeInTheDocument();
      });
    });

    it('数量表名にデフォルト値「数量表」が設定される', async () => {
      // REQ-2.1: 数量表名フィールドにデフォルト値「数量表」を設定
      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByLabelText(/数量表名/i);
        expect(input).toHaveValue('数量表');
      });
    });

    it('作成ボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /作成/i })).toBeInTheDocument();
      });
    });

    it('パンくずナビゲーションが表示される', async () => {
      // REQ-12.3: パンくず「プロジェクト一覧 > {プロジェクト名} > 数量表 > 新規作成」
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
        expect(screen.getByText('プロジェクト')).toBeInTheDocument();
        expect(screen.getByText(mockProject.name)).toBeInTheDocument();
        expect(screen.getByText('数量表一覧')).toBeInTheDocument();
        expect(screen.getByText('新規作成')).toBeInTheDocument();
      });
    });

    it('戻るリンクが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /数量表一覧に戻る/i })).toBeInTheDocument();
      });
    });
  });

  describe('フォーム操作', () => {
    it('数量表名を入力できる', async () => {
      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByLabelText(/数量表名/i);
        fireEvent.change(input, { target: { value: '第1回見積数量表' } });
        expect(input).toHaveValue('第1回見積数量表');
      });
    });

    it('作成ボタンクリックで数量表を作成できる', async () => {
      // REQ-2.1, REQ-2.2
      const createdTable = {
        id: 'qt-new',
        projectId: 'project-123',
        name: '第1回見積数量表',
        groupCount: 0,
        itemCount: 0,
        createdAt: '2025-01-02T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      };

      (quantityTablesApi.createQuantityTable as Mock).mockResolvedValue(createdTable);

      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByLabelText(/数量表名/i);
        fireEvent.change(input, { target: { value: '第1回見積数量表' } });
      });

      const createButton = screen.getByRole('button', { name: /作成/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(quantityTablesApi.createQuantityTable).toHaveBeenCalledWith('project-123', {
          name: '第1回見積数量表',
        });
      });
    });

    it('作成成功後に編集画面に遷移する', async () => {
      // REQ-2.2: 新しい数量表を作成し、数量表編集画面に遷移する
      const createdTable = {
        id: 'qt-new',
        projectId: 'project-123',
        name: '第1回見積数量表',
        groupCount: 0,
        itemCount: 0,
        createdAt: '2025-01-02T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      };

      (quantityTablesApi.createQuantityTable as Mock).mockResolvedValue(createdTable);

      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByLabelText(/数量表名/i);
        fireEvent.change(input, { target: { value: '第1回見積数量表' } });
      });

      const createButton = screen.getByRole('button', { name: /作成/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/quantity-tables/qt-new/edit');
      });
    });

    it('空の数量表名では作成ボタンが無効になる', async () => {
      renderWithRouter();

      await waitFor(() => {
        // デフォルト値を空にする
        const input = screen.getByLabelText(/数量表名/i);
        fireEvent.change(input, { target: { value: '' } });
      });

      const createButton = screen.getByRole('button', { name: /作成/i });
      expect(createButton).toBeDisabled();
    });
  });

  describe('エラーハンドリング', () => {
    it('作成失敗時にエラーメッセージを表示する', async () => {
      (quantityTablesApi.createQuantityTable as Mock).mockRejectedValue(
        new Error('作成に失敗しました')
      );

      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByLabelText(/数量表名/i);
        fireEvent.change(input, { target: { value: '第1回見積数量表' } });
      });

      const createButton = screen.getByRole('button', { name: /作成/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('プロジェクト取得失敗時にエラーメッセージを表示する', async () => {
      (projectsApi.getProject as Mock).mockRejectedValue(new Error('取得に失敗しました'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('作成中にローディングインジケーターを表示する', async () => {
      (quantityTablesApi.createQuantityTable as Mock).mockImplementation(
        () => new Promise(() => {}) // 永久に解決しないPromise
      );

      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByLabelText(/数量表名/i);
        fireEvent.change(input, { target: { value: '第1回見積数量表' } });
      });

      const createButton = screen.getByRole('button', { name: /作成/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /作成中/i })).toBeDisabled();
      });
    });
  });
});
