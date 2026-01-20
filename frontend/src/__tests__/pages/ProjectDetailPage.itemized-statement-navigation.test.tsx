/**
 * @fileoverview プロジェクト詳細ページの内訳書作成後のナビゲーションテスト
 *
 * Task 11: 内訳書機能のルーティング設定
 *
 * Requirements:
 * - 3.5: 内訳書行をクリックで詳細画面に遷移する
 * - 内訳書作成成功時に詳細画面への自動遷移を実装する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveyApi from '../../api/site-surveys';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as itemizedStatementsApi from '../../api/itemized-statements';

// APIモック
vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');
vi.mock('../../api/quantity-tables');
vi.mock('../../api/itemized-statements');

// useAuthフックのモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'テストユーザー' },
    isAuthenticated: true,
  }),
}));

// テストデータ
const mockProject = {
  id: 'project-1',
  name: 'テストプロジェクト',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: { id: 'user-2', displayName: '工事次郎' },
  siteAddress: '東京都渋谷区1-2-3',
  description: 'これはテストプロジェクトの説明です。',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

const mockStatusHistory = [
  {
    id: 'history-1',
    fromStatus: null,
    fromStatusLabel: null,
    toStatus: 'PREPARING' as const,
    toStatusLabel: '準備中',
    transitionType: 'initial' as const,
    transitionTypeLabel: '初期遷移',
    reason: null,
    changedBy: { id: 'user-1', displayName: '営業太郎' },
    changedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockQuantityTables = [
  {
    id: 'qt-1',
    projectId: 'project-1',
    name: 'テスト数量表',
    groupCount: 2,
    itemCount: 10,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
];

const mockCreatedStatement = {
  id: 'is-new',
  projectId: 'project-1',
  name: '新規内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 20,
  createdAt: '2026-01-19T12:00:00.000Z',
  updatedAt: '2026-01-19T12:00:00.000Z',
};

// 現在のパスを表示するヘルパーコンポーネント
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

describe('ProjectDetailPage - 内訳書作成後のナビゲーション', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(projectsApi.getStatusHistory).mockResolvedValue(mockStatusHistory);
    vi.mocked(siteSurveyApi.getLatestSiteSurveys).mockResolvedValue({
      totalCount: 0,
      latestSurveys: [],
    });
    vi.mocked(quantityTablesApi.getLatestQuantityTables).mockResolvedValue({
      totalCount: 1,
      latestTables: mockQuantityTables,
    });
    vi.mocked(itemizedStatementsApi.getLatestItemizedStatements).mockResolvedValue({
      totalCount: 0,
      latestStatements: [],
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  /**
   * テストコンポーネントのラッパー
   */
  function renderWithRouter() {
    return render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <ToastProvider>
          <Routes>
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route
              path="/itemized-statements/:id"
              element={
                <div>
                  <h1>内訳書詳細</h1>
                  <LocationDisplay />
                </div>
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );
  }

  describe('Task 11: 内訳書作成成功時に詳細画面への自動遷移', () => {
    it('内訳書作成成功時に作成された内訳書の詳細画面に遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(itemizedStatementsApi.createItemizedStatement).mockResolvedValue(
        mockCreatedStatement
      );

      renderWithRouter();

      // ページが表示されるまで待機
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 内訳書セクションが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByTestId('itemized-statement-section')).toBeInTheDocument();
      });

      // 内訳書セクション内の新規作成ボタンをクリック
      const itemizedStatementSection = screen.getByTestId('itemized-statement-section');
      const createButton = within(itemizedStatementSection).getByRole('button', {
        name: /新規作成/,
      });
      await user.click(createButton);

      // フォームが表示される（内訳書名フィールド）
      await waitFor(() => {
        expect(within(itemizedStatementSection).getByLabelText(/内訳書名/)).toBeInTheDocument();
      });

      // フォームに入力
      const nameInput = within(itemizedStatementSection).getByLabelText(/内訳書名/);
      await user.type(nameInput, '新規内訳書');

      // 数量表を選択（id="quantityTableId"で特定）
      const select = screen.getByRole('combobox', { name: /数量表/ });
      await user.selectOptions(select, 'qt-1');

      // 送信
      const submitButton = within(itemizedStatementSection).getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // 内訳書詳細画面に遷移する
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書詳細' })).toBeInTheDocument();
        expect(screen.getByTestId('location-display')).toHaveTextContent(
          '/itemized-statements/is-new'
        );
      });
    });

    it('内訳書作成APIが正しいパラメータで呼び出される', async () => {
      const user = userEvent.setup();
      vi.mocked(itemizedStatementsApi.createItemizedStatement).mockResolvedValue(
        mockCreatedStatement
      );

      renderWithRouter();

      // ページが表示されるまで待機
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 内訳書セクションが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByTestId('itemized-statement-section')).toBeInTheDocument();
      });

      // 内訳書セクション内の新規作成ボタンをクリック
      const itemizedStatementSection = screen.getByTestId('itemized-statement-section');
      const createButton = within(itemizedStatementSection).getByRole('button', {
        name: /新規作成/,
      });
      await user.click(createButton);

      // フォームが表示される
      await waitFor(() => {
        expect(within(itemizedStatementSection).getByLabelText(/内訳書名/)).toBeInTheDocument();
      });

      // フォームに入力
      const nameInput = within(itemizedStatementSection).getByLabelText(/内訳書名/);
      await user.type(nameInput, '新規内訳書');

      // 数量表を選択（id="quantityTableId"で特定）
      const select = screen.getByRole('combobox', { name: /数量表/ });
      await user.selectOptions(select, 'qt-1');

      // 送信
      const submitButton = within(itemizedStatementSection).getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // APIが正しく呼び出される
      await waitFor(() => {
        expect(itemizedStatementsApi.createItemizedStatement).toHaveBeenCalledWith('project-1', {
          name: '新規内訳書',
          quantityTableId: 'qt-1',
        });
      });
    });
  });

  describe('Req 3.5: 内訳書行をクリックで詳細画面に遷移', () => {
    it('既存の内訳書リンクをクリックすると詳細画面に遷移する', async () => {
      const user = userEvent.setup();
      const mockExistingStatements = [
        {
          id: 'is-1',
          projectId: 'project-1',
          name: '既存内訳書',
          sourceQuantityTableId: 'qt-1',
          sourceQuantityTableName: 'テスト数量表',
          itemCount: 15,
          createdAt: '2026-01-18T10:00:00.000Z',
          updatedAt: '2026-01-18T10:00:00.000Z',
        },
      ];
      vi.mocked(itemizedStatementsApi.getLatestItemizedStatements).mockResolvedValue({
        totalCount: 1,
        latestStatements: mockExistingStatements,
      });

      renderWithRouter();

      // ページが表示されるまで待機
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 内訳書リストが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText('既存内訳書')).toBeInTheDocument();
      });

      // 内訳書リンクをクリック
      const statementLink = screen.getByRole('link', { name: /既存内訳書の内訳書詳細を見る/ });
      await user.click(statementLink);

      // 内訳書詳細画面に遷移する
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '内訳書詳細' })).toBeInTheDocument();
        expect(screen.getByTestId('location-display')).toHaveTextContent(
          '/itemized-statements/is-1'
        );
      });
    });
  });
});
