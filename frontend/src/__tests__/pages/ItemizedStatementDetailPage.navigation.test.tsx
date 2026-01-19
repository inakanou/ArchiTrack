/**
 * @fileoverview 内訳書詳細ページのルーティングとナビゲーションテスト
 *
 * Task 11: 内訳書機能のルーティング設定
 *
 * Requirements:
 * - 3.5: 内訳書行をクリックで詳細画面に遷移する
 * - 4.4: パンくずナビゲーションでプロジェクト詳細画面への戻りリンクを提供する
 * - 7.3: 削除成功後にプロジェクト詳細画面に遷移する
 * - 9.3: プロジェクト名クリックでプロジェクト詳細画面に遷移する
 * - 9.4: プロジェクト一覧クリックでプロジェクト一覧画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

// APIモック
vi.mock('../../api/itemized-statements');

// モックデータ
const mockStatementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-1',
  project: {
    id: 'project-1',
    name: 'テストプロジェクト',
  },
  name: 'テスト内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 3,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      customCategory: '分類A',
      workType: '工種1',
      name: '名称1',
      specification: '規格1',
      unit: '本',
      quantity: 10.5,
    },
  ],
};

// 現在のパスを表示するヘルパーコンポーネント
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

describe('ItemizedStatementDetailPage - ルーティングとナビゲーション', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // テスト用レンダリングヘルパー
  const renderWithRouter = (statementId: string = 'statement-1') => {
    return render(
      <MemoryRouter initialEntries={[`/itemized-statements/${statementId}`]}>
        <Routes>
          <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
          <Route
            path="/projects"
            element={
              <div>
                <h1>プロジェクト一覧</h1>
                <LocationDisplay />
              </div>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <div>
                <h1>プロジェクト詳細</h1>
                <LocationDisplay />
              </div>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Task 11: ルーティングとナビゲーション', () => {
    describe('Req 9.3: パンくずのプロジェクト名クリックでプロジェクト詳細画面に遷移', () => {
      it('パンくずのプロジェクト名リンクが正しいURLを持つ', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
          const projectLink = within(breadcrumb).getByRole('link', { name: 'テストプロジェクト' });
          expect(projectLink).toHaveAttribute('href', '/projects/project-1');
        });
      });

      it('パンくずのプロジェクト名クリックでプロジェクト詳細画面に遷移する', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );
        const user = userEvent.setup();

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
        });

        const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectLink = within(breadcrumb).getByRole('link', { name: 'テストプロジェクト' });
        await user.click(projectLink);

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'プロジェクト詳細' })).toBeInTheDocument();
          expect(screen.getByTestId('location-display')).toHaveTextContent('/projects/project-1');
        });
      });
    });

    describe('Req 9.4: パンくずのプロジェクト一覧クリックでプロジェクト一覧画面に遷移', () => {
      it('パンくずのプロジェクト一覧リンクが正しいURLを持つ', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
          const projectsLink = within(breadcrumb).getByRole('link', { name: 'プロジェクト一覧' });
          expect(projectsLink).toHaveAttribute('href', '/projects');
        });
      });

      it('パンくずのプロジェクト一覧クリックでプロジェクト一覧画面に遷移する', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );
        const user = userEvent.setup();

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
        });

        const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
        const projectsLink = within(breadcrumb).getByRole('link', { name: 'プロジェクト一覧' });
        await user.click(projectsLink);

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'プロジェクト一覧' })).toBeInTheDocument();
          expect(screen.getByTestId('location-display')).toHaveTextContent('/projects');
        });
      });
    });

    describe('Req 4.4: プロジェクトに戻るリンク', () => {
      it('「プロジェクトに戻る」リンクが表示される', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('link', { name: /プロジェクトに戻る/ })).toBeInTheDocument();
        });
      });

      it('「プロジェクトに戻る」リンクが正しいURLを持つ', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter();

        await waitFor(() => {
          const backLink = screen.getByRole('link', { name: /プロジェクトに戻る/ });
          expect(backLink).toHaveAttribute('href', '/projects/project-1');
        });
      });

      it('「プロジェクトに戻る」クリックでプロジェクト詳細画面に遷移する', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );
        const user = userEvent.setup();

        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'テスト内訳書' })).toBeInTheDocument();
        });

        const backLink = screen.getByRole('link', { name: /プロジェクトに戻る/ });
        await user.click(backLink);

        await waitFor(() => {
          expect(screen.getByRole('heading', { name: 'プロジェクト詳細' })).toBeInTheDocument();
          expect(screen.getByTestId('location-display')).toHaveTextContent('/projects/project-1');
        });
      });
    });

    describe('URLパラメータからの内訳書ID取得', () => {
      it('URLパラメータから内訳書IDを取得してAPIを呼び出す', async () => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
          mockStatementDetail
        );

        renderWithRouter('statement-abc-123');

        await waitFor(() => {
          expect(itemizedStatementsApi.getItemizedStatementDetail).toHaveBeenCalledWith(
            'statement-abc-123'
          );
        });
      });
    });
  });
});
