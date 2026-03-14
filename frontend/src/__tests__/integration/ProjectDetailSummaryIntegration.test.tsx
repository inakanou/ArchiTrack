/**
 * @fileoverview プロジェクト詳細一括取得API統合テスト
 *
 * Task 51.1: 差分実装の統合テスト
 *
 * Requirements:
 * - 29.1: detail-summary APIが全セクションデータを一括返却
 * - 29.2: 最小限のAPIリクエスト数でデータ取得
 * - 29.3: レスポンスにtotalCountとlatestデータを含む
 * - 29.4: 個別セクションエラー時にデフォルト値フォールバック
 * - 29.5: APIリクエスト数削減
 * - 29.6: 既存個別APIと互換性のあるデータ構造
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import * as projectsApi from '../../api/projects';
import type { ProjectDetailSummary } from '../../api/projects';

// APIモック
vi.mock('../../api/projects');

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
  name: '統合テストプロジェクト',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: { id: 'user-2', displayName: '工事次郎' },
  siteAddress: '東京都渋谷区1-2-3',
  description: '統合テスト用プロジェクト',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
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
    changedAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * 全セクションにデータがある完全なサマリーを返す
 */
function createFullSummary(): ProjectDetailSummary {
  return {
    project: mockProject,
    statusHistory: mockStatusHistory,
    sections: {
      siteSurveys: {
        totalCount: 3,
        latestSurveys: [
          {
            id: 'survey-1',
            projectId: 'project-1',
            name: '第1回現場調査',
            surveyDate: '2026-01-15',
            memo: null,
            thumbnailUrl: null,
            imageCount: 5,
            createdAt: '2026-01-15T00:00:00.000Z',
            updatedAt: '2026-01-15T00:00:00.000Z',
          },
          {
            id: 'survey-2',
            projectId: 'project-1',
            name: '第2回現場調査',
            surveyDate: '2026-01-20',
            memo: null,
            thumbnailUrl: null,
            imageCount: 3,
            createdAt: '2026-01-20T00:00:00.000Z',
            updatedAt: '2026-01-20T00:00:00.000Z',
          },
        ],
      },
      quantityTables: {
        totalCount: 2,
        latestTables: [
          {
            id: 'qt-1',
            projectId: 'project-1',
            name: 'テスト数量表',
            groupCount: 3,
            itemCount: 15,
            createdAt: '2026-01-10T00:00:00.000Z',
            updatedAt: '2026-01-10T00:00:00.000Z',
          },
        ],
      },
      itemizedStatements: {
        totalCount: 1,
        latestStatements: [
          {
            id: 'is-1',
            projectId: 'project-1',
            name: 'テスト内訳書',
            sourceQuantityTableId: 'qt-1',
            sourceQuantityTableName: 'テスト数量表',
            itemCount: 10,
            createdAt: '2026-01-12T00:00:00.000Z',
            updatedAt: '2026-01-12T00:00:00.000Z',
          },
        ],
      },
      estimateRequests: {
        totalCount: 1,
        latestRequests: [
          {
            id: 'er-1',
            projectId: 'project-1',
            tradingPartnerId: 'partner-1',
            tradingPartnerName: 'テスト業者',
            itemizedStatementId: 'is-1',
            itemizedStatementName: 'テスト内訳書',
            name: 'テスト見積依頼',
            method: 'EMAIL',
            includeBreakdownInBody: false,
            status: 'REQUESTED',
            createdAt: '2026-01-14T00:00:00.000Z',
            updatedAt: '2026-01-14T00:00:00.000Z',
          },
        ],
      },
      estimates: {
        totalCount: 1,
        latestEstimates: [
          {
            id: 'est-1',
            projectId: 'project-1',
            name: 'テスト見積書',
            sourceItemizedStatementId: 'is-1',
            sourceItemizedStatementName: 'テスト内訳書',
            createdAt: '2026-01-15T00:00:00.000Z',
            updatedAt: '2026-01-15T00:00:00.000Z',
            totalAmount: '1500000',
          },
        ],
      },
      contracts: { totalCount: 0, latestContracts: [] },
      schedules: { totalCount: 0, latestSchedules: [] },
    },
  } as ProjectDetailSummary;
}

function renderWithRouter(projectId: string = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('Task 51.1: プロジェクト詳細一括取得 統合テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 29.1, 29.3: detail-summary APIが全セクションデータを正しく一括返却
  // ==========================================================================

  describe('detail-summary APIで全セクションデータを一括取得 (REQ-29.1, REQ-29.3)', () => {
    it('1リクエストで全データを取得し全セクションをレンダリングする', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(createFullSummary());

      renderWithRouter();

      // プロジェクト基本情報が表示される
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '統合テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // ステータスバッジが表示される
      expect(screen.getByTestId('current-status-badge')).toHaveTextContent('準備中');

      // 現場調査セクション
      expect(screen.getByRole('heading', { level: 3, name: '現場調査' })).toBeInTheDocument();
      expect(screen.getByText('全3件')).toBeInTheDocument();
      expect(screen.getByText('第1回現場調査')).toBeInTheDocument();
      expect(screen.getByText('第2回現場調査')).toBeInTheDocument();

      // 数量表セクション
      expect(screen.getByTestId('quantity-table-section')).toBeInTheDocument();

      // 内訳書セクション
      expect(screen.getByTestId('itemized-statement-section')).toBeInTheDocument();

      // 見積依頼セクション
      expect(screen.getByTestId('estimate-request-section')).toBeInTheDocument();

      // 見積書セクション
      expect(screen.getByTestId('estimate-section')).toBeInTheDocument();

      // getProjectDetailSummaryが1回だけ呼ばれたことを検証
      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledTimes(1);
      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledWith('project-1');
    });
  });

  // ==========================================================================
  // 29.2, 29.5: APIリクエスト数削減
  // ==========================================================================

  describe('APIリクエスト数が最小限 (REQ-29.2, REQ-29.5)', () => {
    it('個別API(getProject, getStatusHistory等)が呼ばれず、getProjectDetailSummaryのみ使用される', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(createFullSummary());

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '統合テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 一括取得APIのみが呼ばれている
      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledTimes(1);

      // 個別APIは呼ばれていない（vi.mock でモック化されているので、callsが空の場合はOK）
      expect(vi.mocked(projectsApi.getProject)).not.toHaveBeenCalled();
      expect(vi.mocked(projectsApi.getStatusHistory)).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 29.4: 個別セクションエラー時のフォールバック（フロントエンド側）
  // ==========================================================================

  describe('エラー時のフォールバック表示 (REQ-29.4)', () => {
    it('API失敗時にエラーメッセージが表示される', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(new Error('Network error'));

      renderWithRouter();

      // エラー表示を確認
      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/i)).toBeInTheDocument();
      });

      // 再試行ボタンが表示される
      expect(screen.getByRole('button', { name: /再試行/i })).toBeInTheDocument();
    });

    it('セクションデータが0件の場合でも他セクションは正常に表示される', async () => {
      // 全セクション0件のサマリー
      const emptySummary: ProjectDetailSummary = {
        project: mockProject,
        statusHistory: mockStatusHistory,
        sections: {
          siteSurveys: { totalCount: 0, latestSurveys: [] },
          quantityTables: { totalCount: 0, latestTables: [] },
          itemizedStatements: { totalCount: 0, latestStatements: [] },
          estimateRequests: { totalCount: 0, latestRequests: [] },
          estimates: { totalCount: 0, latestEstimates: [] },
          contracts: { totalCount: 0, latestContracts: [] },
          schedules: { totalCount: 0, latestSchedules: [] },
        },
      } as ProjectDetailSummary;
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(emptySummary);

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '統合テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 全セクションが表示される（空状態メッセージ付き）
      expect(screen.getByRole('heading', { level: 3, name: '現場調査' })).toBeInTheDocument();
      expect(screen.getByTestId('quantity-table-section')).toBeInTheDocument();
      expect(screen.getByTestId('itemized-statement-section')).toBeInTheDocument();
      expect(screen.getByTestId('estimate-request-section')).toBeInTheDocument();
      expect(screen.getByTestId('estimate-section')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 29.6: 既存個別APIと互換性のあるデータ構造
  // ==========================================================================

  describe('レスポンスデータ構造の互換性 (REQ-29.6)', () => {
    it('各セクションのデータがコンポーネントで正しくレンダリングされる', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(createFullSummary());

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: '統合テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 現場調査データがSiteSurveySectionCardで正しく表示される
      expect(screen.getByText('第1回現場調査')).toBeInTheDocument();
      expect(screen.getByText('第2回現場調査')).toBeInTheDocument();

      // 数量表データがQuantityTableSectionCardで正しく表示される
      expect(screen.getByText('テスト数量表')).toBeInTheDocument();

      // 内訳書データがItemizedStatementSectionCardで正しく表示される
      expect(screen.getByText('テスト内訳書')).toBeInTheDocument();

      // ステータス変更履歴が表示される
      expect(screen.getByText(/ステータス変更履歴/i)).toBeInTheDocument();
    });
  });
});
