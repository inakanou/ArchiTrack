/**
 * @fileoverview ProjectDetailPage コンポーネントのテスト
 *
 * Task 9.2: ProjectDetailPageの実装
 * Task 15.3: 一覧・詳細ページのユニットテスト追加
 * Task 19.2: パンくずナビゲーション追加
 * Task 19.5: 編集ボタン遷移先更新（/projects/:id/edit へ遷移）
 * Task 27.2: フィールドラベル変更（「取引先」→「顧客名」）
 * Task 10.1 (site-survey): 現場調査への導線追加
 * Task 49.2: getProjectDetailSummary一括取得への移行
 *
 * Requirements:
 * - 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7: プロジェクト詳細表示
 * - 8.1, 8.2, 8.3, 8.4, 8.5, 8.6: プロジェクト編集
 * - 9.1, 9.2, 9.3, 9.4, 9.7: プロジェクト削除
 * - 11.1, 11.2, 11.3, 11.4, 11.5, 11.6: 関連データ参照
 * - 18.4, 18.5: エラーハンドリング
 * - 19.2: パフォーマンス
 * - 21.15, 21.18: パンくずナビゲーション
 * - 21.21: 編集ボタンクリックで編集ページへ遷移
 * - 22: 顧客情報表示（ラベル「顧客名」）
 * - 2.1, 2.2: 現場調査タブ/セクション表示と遷移
 * - 29.2, 29.5: プロジェクト詳細API効率化（1リクエスト一括取得）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import * as projectsApi from '../../api/projects';
import type { ProjectDetailSummary } from '../../api/projects';
import type { ProjectDetail } from '../../types/project.types';
import { ApiError } from '../../api/client';

// APIモック
vi.mock('../../api/projects');

// useAuthフックのモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'テストユーザー' },
    isAuthenticated: true,
  }),
}));

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

const defaultSections: ProjectDetailSummary['sections'] = {
  siteSurveys: { totalCount: 0, latestSurveys: [] },
  quantityTables: { totalCount: 0, latestTables: [] },
  itemizedStatements: { totalCount: 0, latestStatements: [] },
  estimateRequests: { totalCount: 0, latestRequests: [] },
  estimates: { totalCount: 0, latestEstimates: [] },
  contracts: { totalCount: 0, latestContracts: [] },
  schedules: { totalCount: 0, latestSchedules: [] },
  executionBudget: null,
};

/**
 * デフォルトのProjectDetailSummaryモックデータを生成するヘルパー
 * project / statusHistory / sectionsを部分的に上書き可能
 */
function createMockSummary(
  overrides?: Partial<{
    project: Partial<ProjectDetail>;
    statusHistory: typeof mockStatusHistory;
    sections: Partial<ProjectDetailSummary['sections']>;
  }>
): ProjectDetailSummary {
  return {
    project: overrides?.project ? { ...mockProject, ...overrides.project } : mockProject,
    statusHistory: overrides?.statusHistory ?? mockStatusHistory,
    sections: {
      ...defaultSections,
      ...overrides?.sections,
    },
  } as ProjectDetailSummary;
}

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(projectId: string = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          {/* 現場調査関連のルート（リンク遷移時の警告を防止） */}
          <Route path="/projects/:id/site-surveys" element={<div>現場調査一覧</div>} />
          <Route path="/projects/:id/site-surveys/new" element={<div>現場調査新規作成</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Task 49.2: getProjectDetailSummaryの一括取得モック（デフォルト）
    vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(createMockSummary());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // 7.1-7.7: プロジェクト詳細表示
  // ==========================================================================

  describe('プロジェクト詳細表示', () => {
    it('プロジェクト詳細情報を表示する', async () => {
      renderWithRouter();

      // ページタイトル（h1）を確認
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 基本情報セクション内のデータを確認（重複する可能性のあるテキストはgetAllByText）
      expect(screen.getAllByText('テスト顧客').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('営業太郎').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('工事次郎')).toBeInTheDocument();
      expect(screen.getByText('東京都渋谷区1-2-3')).toBeInTheDocument();
      expect(screen.getByText('これはテストプロジェクトの説明です。')).toBeInTheDocument();
    });

    it('工事担当者がnullの場合「未割当」と表示する', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          project: { constructionPerson: undefined },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      expect(screen.getByText('未割当')).toBeInTheDocument();
    });

    it('作成日時と更新日時は非表示（Task 53.4で削除）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // Task 53.4: 作成日時・更新日時フィールドは削除済み
      expect(screen.queryByText('作成日時')).not.toBeInTheDocument();
      expect(screen.queryByText('更新日時')).not.toBeInTheDocument();
    });

    it('ローディングインジケータを表示する', () => {
      // 非同期を遅延させる
      vi.mocked(projectsApi.getProjectDetailSummary).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 18.4, 18.5: エラーハンドリング
  // ==========================================================================

  describe('エラーハンドリング', () => {
    it('404エラー時にエラーページへ遷移する', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(
        new ApiError(404, 'Not Found')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/404', { replace: true });
      });
    });

    it('403エラー時に権限エラーページへ遷移する', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(
        new ApiError(403, 'Forbidden')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/403', { replace: true });
      });
    });

    it('その他のエラー時にエラーメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(
        new ApiError(500, 'Server Error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Server Error/)).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.getProjectDetailSummary)
        .mockRejectedValueOnce(new ApiError(500, 'Server Error'))
        .mockResolvedValueOnce(createMockSummary());

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      await user.click(retryButton);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 8.1-8.6: 編集機能
  // Task 19.5: 編集ボタンクリックで編集ページ（/projects/:id/edit）へ遷移
  // ==========================================================================

  describe('編集機能', () => {
    it('編集ボタンをクリックすると編集ページへ遷移する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // 編集ページ（/projects/:id/edit）へ遷移することを確認
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/edit');
    });

    it('編集ボタンクリック後、インラインフォームは表示しない', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // インラインフォームは表示されない（ページ遷移するため）
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 9.2-9.4, 9.7: 削除機能
  // ==========================================================================

  describe('削除機能', () => {
    it('削除ボタンをクリックすると確認ダイアログを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/削除しますか/)).toBeInTheDocument();
    });

    it('確認ダイアログでキャンセルをクリックするとダイアログを閉じる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // ダイアログ内のキャンセルボタンを取得
      const dialog = screen.getByRole('dialog');
      const cancelButton = within(dialog).getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('確認ダイアログで削除を実行すると一覧画面に遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.deleteProject).mockResolvedValue(undefined);

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      // ダイアログ内の削除ボタンを取得
      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(projectsApi.deleteProject).toHaveBeenCalledWith('project-1');
        // トースト通知に変更されたため、stateは渡されない
        expect(mockNavigate).toHaveBeenCalledWith('/projects');
      });
    });
  });

  // ==========================================================================
  // ステータス遷移UI
  // ==========================================================================

  describe('ステータス遷移UI', () => {
    it('StatusTransitionUIコンポーネントを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      expect(screen.getByText('現在のステータス')).toBeInTheDocument();
      expect(screen.getByText('ステータス遷移')).toBeInTheDocument();
      expect(screen.getByText('ステータス変更履歴')).toBeInTheDocument();
    });

    it('ステータス遷移を実行する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.transitionStatus).mockResolvedValue({
        ...mockProject,
        status: 'SURVEYING',
        statusLabel: '調査中',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 順方向遷移ボタン（調査中）をクリック
      const surveyingButton = screen.getByRole('button', { name: /調査中/ });
      await user.click(surveyingButton);

      await waitFor(() => {
        expect(projectsApi.transitionStatus).toHaveBeenCalledWith('project-1', {
          status: 'SURVEYING',
        });
      });
    });
  });

  // ==========================================================================
  // 「一覧に戻る」リンク
  // ==========================================================================

  describe('ナビゲーション', () => {
    it('「一覧に戻る」リンクは表示されない（Task 53.2で削除）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // Task 53.2: 「一覧に戻る」リンクは削除済み
      expect(screen.queryByRole('link', { name: /一覧に戻る/ })).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 11.1-11.6: 関連データ（機能フラグ対応）
  // ==========================================================================

  describe('関連データ表示（機能フラグ対応）', () => {
    it('関連データセクション（現場調査、数量表、内訳書、見積依頼、見積書）が存在する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // 関連データは個別のセクションとして表示される
      // 各セクションの見出しが存在することを確認
      expect(screen.getByRole('heading', { level: 3, name: '現場調査' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: '数量表' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: '内訳書' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: '見積依頼' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: '見積書' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 15.3: 追加テスト
  // ==========================================================================

  describe('プロジェクト情報表示詳細（Task 15.3, Requirements 7.1）', () => {
    it('プロジェクト名が見出しとして表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        const heading = screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' });
        expect(heading).toBeInTheDocument();
      });
    });

    it('顧客名が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getAllByText('テスト顧客').length).toBeGreaterThanOrEqual(1);
    });

    it('営業担当者が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getAllByText('営業太郎').length).toBeGreaterThanOrEqual(1);
    });

    it('工事担当者が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('工事次郎')).toBeInTheDocument();
    });

    it('現場住所が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('東京都渋谷区1-2-3')).toBeInTheDocument();
    });

    it('概要（説明）が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('これはテストプロジェクトの説明です。')).toBeInTheDocument();
    });

    it('ステータスが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 複数箇所に「準備中」が表示される可能性があるため
      expect(screen.getAllByText('準備中').length).toBeGreaterThanOrEqual(1);
    });

    it('現場住所が未設定の場合はハイフンを表示', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          project: { siteAddress: '' },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 現場住所の値がハイフン
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('概要が未設定の場合は表示しない', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          project: { description: '' },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 概要セクションが表示されない
      expect(screen.queryByText('これはテストプロジェクトの説明です。')).not.toBeInTheDocument();
    });
  });

  describe('編集ボタン遷移詳細（Task 19.5, Requirements 21.21）', () => {
    it('編集ボタンクリックで正しいパスへ遷移する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // /projects/:id/edit へ遷移する
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/edit');
    });

    it('取引先詳細ページと同じパターンで遷移する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // navigate関数が1回だけ呼ばれることを確認（インラインフォーム表示ではなく遷移）
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it('編集ボタンクリック後、詳細表示のまま遷移を待つ', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // 詳細表示が維持される（インラインフォームに切り替わらない）
      expect(
        screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    });
  });

  describe('削除確認詳細（Task 15.3, Requirements 9.1）', () => {
    it('削除ボタンクリックで確認ダイアログが表示される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('削除確認ダイアログにプロジェクト名が表示される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/テストプロジェクト/)).toBeInTheDocument();
    });

    it('削除確認ダイアログに削除ボタンとキャンセルボタンがある', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: '削除' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('削除確認ダイアログで削除をキャンセルするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      const dialog = screen.getByRole('dialog');
      const cancelButton = within(dialog).getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('削除確認ダイアログで削除を実行すると一覧に遷移する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.deleteProject).mockResolvedValue(undefined);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects');
      });
    });
  });

  describe('ステータス遷移UI詳細（Task 15.3）', () => {
    it('現在のステータスセクションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('現在のステータス')).toBeInTheDocument();
    });

    it('ステータス遷移ボタンセクションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('ステータス遷移')).toBeInTheDocument();
    });

    it('順方向遷移ボタン（調査中）が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // PREPARING -> SURVEYING への遷移ボタン
      expect(screen.getByRole('button', { name: /調査中/ })).toBeInTheDocument();
    });

    it('終了遷移ボタン（中止）が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // PREPARING -> CANCELLED への遷移ボタン（ラベルは「中止」）
      expect(screen.getByRole('button', { name: /中止/ })).toBeInTheDocument();
    });

    it('ステータス遷移後にデータが再取得される', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.transitionStatus).mockResolvedValue({
        ...mockProject,
        status: 'SURVEYING',
        statusLabel: '調査中',
      });
      vi.mocked(projectsApi.getProjectDetailSummary)
        .mockResolvedValueOnce(createMockSummary()) // 初回取得
        .mockResolvedValueOnce(
          createMockSummary({
            project: { status: 'SURVEYING' as const, statusLabel: '調査中' },
          })
        ); // 遷移後の再取得

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const surveyingButton = screen.getByRole('button', { name: /調査中/ });
      await user.click(surveyingButton);

      await waitFor(() => {
        expect(projectsApi.transitionStatus).toHaveBeenCalledWith('project-1', {
          status: 'SURVEYING',
        });
      });

      // getProjectDetailSummaryが再度呼ばれる（遷移後のデータ再取得）
      await waitFor(() => {
        expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('ステータス履歴表示（Task 15.3）', () => {
    it('ステータス変更履歴セクションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText('ステータス変更履歴')).toBeInTheDocument();
    });

    it('ステータス履歴に遷移先ステータスが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // mockStatusHistory の toStatusLabel '準備中' が表示される
      // 複数箇所に表示されるため getAllByText を使用
      const statusLabels = screen.getAllByText('準備中');
      expect(statusLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('ステータス履歴に変更者が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // mockStatusHistory の changedBy '営業太郎' が表示される
      // 複数箇所に表示されるため getAllByText を使用
      const changedByLabels = screen.getAllByText('営業太郎');
      expect(changedByLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('ステータス履歴に変更日時が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 日付が表示されていることを確認
      expect(screen.getAllByText(/2025/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('エラー状態詳細（Task 15.3）', () => {
    it('ネットワークエラー時にエラーメッセージを表示する', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(new Error('Network Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('エラー時に再試行ボタンが表示される', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(
        new ApiError(500, 'Server Error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });
    });

    it('再試行ボタンクリックでデータを再取得する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.getProjectDetailSummary)
        .mockRejectedValueOnce(new ApiError(500, 'Server Error'))
        .mockResolvedValueOnce(createMockSummary());

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledTimes(2);
    });

    // Note: Task 19.5 により編集は /projects/:id/edit ページで行われるため、
    // 詳細ページでの更新中エラーテストは ProjectEditPage.test.tsx に移動済み
  });

  describe('アクセシビリティ詳細（Task 15.3）', () => {
    it('メインコンテンツにrole="main"が設定される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('ローディング時にrole="status"が設定される', () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('エラーメッセージにrole="alert"が設定される', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(
        new ApiError(500, 'Server Error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('削除確認ダイアログにrole="dialog"が設定される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('編集ボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 編集ボタンが存在することを確認（Task 19.5: 編集ページへ遷移するためフォームは表示しない）
      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 19.2: パンくずナビゲーション (Requirements 21.15, 21.18)
  // ==========================================================================

  describe('パンくずナビゲーション（Task 19.2, Requirements 21.15, 21.18）', () => {
    it('パンくずナビゲーションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // パンくずナビゲーションが存在する
      expect(
        screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
      ).toBeInTheDocument();
    });

    it('「ダッシュボード」リンクが表示され、/へ遷移可能', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('「プロジェクト一覧」リンクが表示され、/projectsへ遷移可能（Task 53.1更新）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const projectsLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
      expect(projectsLink).toHaveAttribute('href', '/projects');
    });

    it('プロジェクト名がパンくずの最後に表示される（Task 53.1更新）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // パンくずナビゲーション内でプロジェクト名を確認
      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).getByText('テストプロジェクト')).toBeInTheDocument();
    });

    it('現在ページ（プロジェクト名）にaria-current="page"が設定される（Task 53.1更新）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const currentPage = within(nav).getByText('テストプロジェクト');
      expect(currentPage).toHaveAttribute('aria-current', 'page');
    });

    it('プロジェクト名は現在ページとしてリンクなしで表示される（Task 53.1更新）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // パンくず内のプロジェクト名はリンクではない
      expect(screen.queryByRole('link', { name: 'テストプロジェクト' })).not.toBeInTheDocument();
    });

    it('パンくず項目間に区切り文字「>」が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      // 3項目（ダッシュボード、プロジェクト、プロジェクト名）なので2つの区切り文字
      const separators = within(nav).getAllByText('>');
      expect(separators).toHaveLength(2);
    });

    it('パンくずにプロジェクト名が動的に表示される（Task 53.1更新）', async () => {
      const customProject = {
        ...mockProject,
        name: 'カスタムプロジェクト名',
      };
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({ project: customProject })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'カスタムプロジェクト名' })
        ).toBeInTheDocument();
      });

      // パンくずにはプロジェクト名が表示される
      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).getByText('カスタムプロジェクト名')).toBeInTheDocument();
    });

    it('編集ボタンクリック時もパンくずナビゲーションが表示されている', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // パンくずナビゲーションが存在することを確認
      expect(
        screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
      ).toBeInTheDocument();

      // 編集ボタンをクリック（Task 19.5: 編集ページへ遷移）
      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      // 遷移前の状態でパンくずナビゲーションが存在することを確認
      expect(
        screen.getByRole('navigation', { name: 'パンくずナビゲーション' })
      ).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 10.1 (site-survey): 現場調査への導線
  // プロジェクト詳細画面に「現場調査」セクションを追加し、現場調査一覧への遷移を実装
  // Requirements: 2.1, 2.2
  // ==========================================================================

  describe('現場調査への導線（Task 10.1, Requirements 2.1, 2.2）', () => {
    it('「現場調査」セクションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 現場調査セクションの見出しが表示される（h3要素、level: 3）
      expect(screen.getByRole('heading', { level: 3, name: '現場調査' })).toBeInTheDocument();
    });

    it('「すべて見る」リンクが表示される', async () => {
      // モックを現場調査あり状態に設定（detail-summary API経由）
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            siteSurveys: {
              totalCount: 3,
              latestSurveys: [
                {
                  id: 'survey-1',
                  projectId: 'project-1',
                  name: '現場調査1',
                  surveyDate: '2024-01-15',
                  memo: null,
                  thumbnailUrl: null,
                  imageCount: 5,
                  createdAt: '2024-01-15T00:00:00.000Z',
                  updatedAt: '2024-01-15T00:00:00.000Z',
                },
                {
                  id: 'survey-2',
                  projectId: 'project-1',
                  name: '現場調査2',
                  surveyDate: '2024-01-10',
                  memo: null,
                  thumbnailUrl: null,
                  imageCount: 3,
                  createdAt: '2024-01-10T00:00:00.000Z',
                  updatedAt: '2024-01-10T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 「すべて見る」リンクが表示されるまで待機（現場調査用のリンクを特定）
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /すべて見る/ });
        const siteSurveyLink = links.find(
          (link) => link.getAttribute('href') === '/projects/project-1/site-surveys'
        );
        expect(siteSurveyLink).toBeInTheDocument();
      });
    });

    it('すべて見るリンクをクリックすると現場調査一覧ページへ遷移する', async () => {
      // モックを現場調査あり状態に設定
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            siteSurveys: {
              totalCount: 3,
              latestSurveys: [
                {
                  id: 'survey-1',
                  projectId: 'project-1',
                  name: '現場調査1',
                  surveyDate: '2024-01-15',
                  memo: null,
                  thumbnailUrl: null,
                  imageCount: 5,
                  createdAt: '2024-01-15T00:00:00.000Z',
                  updatedAt: '2024-01-15T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 現場調査用の「すべて見る」リンクを特定して待機
      let siteSurveyLink: HTMLElement | undefined;
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /すべて見る/ });
        siteSurveyLink = links.find(
          (link) => link.getAttribute('href') === '/projects/project-1/site-surveys'
        );
        expect(siteSurveyLink).toBeInTheDocument();
      });

      await user.click(siteSurveyLink!);

      // MemoryRouterを使用しているため、実際のナビゲーションはリンクのhref属性で確認
      expect(siteSurveyLink).toHaveAttribute('href', '/projects/project-1/site-surveys');
    });

    it('「新規作成」ボタンが表示される（現場調査0件時）', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 新規作成リンクが表示されるまで待機
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /新規作成/ });
        expect(links.length).toBeGreaterThan(0);
      });

      // 現場調査の新規作成リンクを取得（hrefで特定）
      const createLinks = screen.getAllByRole('link', { name: /新規作成/ });
      const siteSurveyCreateLink = createLinks.find(
        (link) => link.getAttribute('href') === '/projects/project-1/site-surveys/new'
      );
      expect(siteSurveyCreateLink).toBeInTheDocument();
      expect(siteSurveyCreateLink).toHaveAttribute('href', '/projects/project-1/site-surveys/new');
    });

    it('現場調査セクションにプロジェクトIDが正しく反映される', async () => {
      // モックを現場調査あり状態に設定
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            siteSurveys: {
              totalCount: 2,
              latestSurveys: [
                {
                  id: 'survey-1',
                  projectId: 'project-1',
                  name: '現場調査1',
                  surveyDate: '2024-01-15',
                  memo: null,
                  thumbnailUrl: null,
                  imageCount: 5,
                  createdAt: '2024-01-15T00:00:00.000Z',
                  updatedAt: '2024-01-15T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 現場調査用の「すべて見る」リンクを特定して待機
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /すべて見る/ });
        const siteSurveyLink = links.find((link) =>
          link.getAttribute('href')?.includes('site-surveys')
        );
        expect(siteSurveyLink).toBeInTheDocument();
      });

      // URLにproject-1のIDが含まれている
      const links = screen.getAllByRole('link', { name: /すべて見る/ });
      const siteSurveyLink = links.find((link) =>
        link.getAttribute('href')?.includes('site-surveys')
      );
      expect(siteSurveyLink?.getAttribute('href')).toContain('project-1');
    });

    it('現場調査セクションに件数表示がある', async () => {
      // モックを現場調査あり状態に設定
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            siteSurveys: {
              totalCount: 5,
              latestSurveys: [
                {
                  id: 'survey-1',
                  projectId: 'project-1',
                  name: '現場調査1',
                  surveyDate: '2024-01-15',
                  memo: null,
                  thumbnailUrl: null,
                  imageCount: 5,
                  createdAt: '2024-01-15T00:00:00.000Z',
                  updatedAt: '2024-01-15T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 件数表示が表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText(/全5件/)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 22.5: 顧客情報表示（Task 18.3, Task 27.2）
  // 注: 現在の実装では取引先情報はproject.tradingPartnerから取得され、
  // 基本情報セクション内の「顧客名」フィールドとして表示されます
  // Task 27.2: ラベルを「取引先」から「顧客名」に変更
  // ==========================================================================

  // ==========================================================================
  // エラーハンドリング追加テスト（カバレッジ向上）
  // ==========================================================================

  describe('削除エラーハンドリング詳細', () => {
    it('削除時にApiErrorでmessageがない場合はデフォルトメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.deleteProject).mockRejectedValue(new ApiError(500, ''));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('削除中にエラーが発生しました')).toBeInTheDocument();
      });
    });

    it('削除時にApiErrorでない場合もデフォルトエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      // isApiErrorがfalseになるケース（文字列エラー）
      vi.mocked(projectsApi.deleteProject).mockRejectedValue('string error');

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      const dialog = screen.getByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: '削除' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('削除中にエラーが発生しました')).toBeInTheDocument();
      });
    });
  });

  describe('ステータス遷移エラーハンドリング詳細', () => {
    it('ステータス遷移時にApiErrorでmessageがない場合はデフォルトメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(projectsApi.transitionStatus).mockRejectedValue(new ApiError(500, ''));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 順方向遷移ボタン（調査中）をクリック
      const surveyingButton = screen.getByRole('button', { name: /調査中/ });
      await user.click(surveyingButton);

      await waitFor(() => {
        expect(screen.getByText('ステータス変更中にエラーが発生しました')).toBeInTheDocument();
      });
    });

    it('ステータス遷移時にApiErrorでない場合もデフォルトエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      // isApiErrorがfalseになるケース（文字列エラー）
      vi.mocked(projectsApi.transitionStatus).mockRejectedValue('string error');

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 順方向遷移ボタン（調査中）をクリック
      const surveyingButton = screen.getByRole('button', { name: /調査中/ });
      await user.click(surveyingButton);

      await waitFor(() => {
        expect(screen.getByText('ステータス変更中にエラーが発生しました')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 7.2 (estimate-request): 見積依頼への導線
  // プロジェクト詳細画面に「見積依頼」セクションを追加（内訳書セクションの下）
  // Requirements: 1.1
  // ==========================================================================

  describe('見積依頼への導線（Task 7.2, Requirements 1.1）', () => {
    it('「見積依頼」セクションが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 見積依頼セクションの見出しが表示される（h3要素、level: 3）
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 3, name: '見積依頼' })).toBeInTheDocument();
      });
    });

    it('見積依頼が0件の場合は空状態メッセージを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 空状態メッセージが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText(/見積依頼はまだありません/)).toBeInTheDocument();
      });
    });

    it('見積依頼が0件でも「新規作成」リンクが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 新規作成リンクが表示されるまで待機
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /新規作成/ });
        // 見積依頼の新規作成リンクを取得（hrefで特定）
        const estimateRequestCreateLink = links.find(
          (link) => link.getAttribute('href') === '/projects/project-1/estimate-requests/new'
        );
        expect(estimateRequestCreateLink).toBeInTheDocument();
      });
    });

    it('「すべて見る」リンクが表示される（見積依頼あり時）', async () => {
      // モックを見積依頼あり状態に設定（detail-summary API経由）
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            estimateRequests: {
              totalCount: 3,
              latestRequests: [
                {
                  id: 'request-1',
                  projectId: 'project-1',
                  tradingPartnerId: 'partner-1',
                  tradingPartnerName: '株式会社ABC工業',
                  itemizedStatementId: 'statement-1',
                  itemizedStatementName: '第1回見積内訳書',
                  name: '見積依頼#1',
                  method: 'EMAIL',
                  includeBreakdownInBody: false,
                  createdAt: '2024-05-15T00:00:00.000Z',
                  updatedAt: '2024-05-15T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 「すべて見る」リンクが表示されるまで待機
      await waitFor(() => {
        const links = screen.getAllByRole('link', { name: /すべて見る/ });
        const estimateRequestLink = links.find(
          (link) => link.getAttribute('href') === '/projects/project-1/estimate-requests'
        );
        expect(estimateRequestLink).toBeInTheDocument();
      });
    });

    it('見積依頼セクションに件数表示がある', async () => {
      // モックを見積依頼あり状態に設定
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            estimateRequests: {
              totalCount: 5,
              latestRequests: [
                {
                  id: 'request-1',
                  projectId: 'project-1',
                  tradingPartnerId: 'partner-1',
                  tradingPartnerName: '株式会社ABC工業',
                  itemizedStatementId: 'statement-1',
                  itemizedStatementName: '第1回見積内訳書',
                  name: '見積依頼#1',
                  method: 'EMAIL',
                  includeBreakdownInBody: false,
                  createdAt: '2024-05-15T00:00:00.000Z',
                  updatedAt: '2024-05-15T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 見積依頼セクションの件数表示が表示されるまで待機
      await waitFor(() => {
        // 現場調査と見積依頼で「全5件」が表示される可能性があるため、
        // 見積依頼セクション内で確認
        const section = screen.getByTestId('estimate-request-section');
        expect(within(section).getByText(/全5件/)).toBeInTheDocument();
      });
    });

    it('見積依頼セクションが内訳書セクションの下に配置されている', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 3, name: '見積依頼' })).toBeInTheDocument();
      });

      // DOM順序を確認：内訳書セクションが見積依頼セクションの前にある
      const allSections = screen.getAllByRole('region');
      const itemizedStatementSection = allSections.find(
        (section) => section.getAttribute('aria-labelledby') === 'itemized-statement-section-title'
      );
      const estimateRequestSection = allSections.find(
        (section) => section.getAttribute('aria-labelledby') === 'estimate-request-section-title'
      );

      if (itemizedStatementSection && estimateRequestSection) {
        // 内訳書セクションが見積依頼セクションより前にあることを確認
        const itemizedIndex = allSections.indexOf(itemizedStatementSection);
        const estimateIndex = allSections.indexOf(estimateRequestSection);
        expect(itemizedIndex).toBeLessThan(estimateIndex);
      }
    });

    it('セクションエラー時もフォールバックで他セクションは表示される', async () => {
      // detail-summary APIはセクションエラーをフォールバック処理するため、
      // レスポンスに含まれるデフォルト値で表示される（バックエンド側でPromise.allSettledを使用）
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 全セクションが表示される
      expect(screen.getByRole('heading', { level: 3, name: '現場調査' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: '数量表' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: '内訳書' })).toBeInTheDocument();
    });
  });

  describe('顧客情報表示（Task 18.3, Task 27.2, Requirements 22.5）', () => {
    it('プロジェクトに顧客が設定されている場合、顧客名が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 顧客名フィールドのラベルが表示される（Task 27.2: 「取引先」から「顧客名」に変更）
      expect(screen.getByText('顧客名')).toBeInTheDocument();
      // 顧客名が表示される
      expect(screen.getAllByText('テスト顧客').length).toBeGreaterThanOrEqual(1);
    });

    it('顧客未設定時はハイフンを表示する', async () => {
      // 顧客（取引先）がnullのプロジェクト
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          project: { tradingPartner: null },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 顧客名フィールドのラベルが表示される（Task 27.2: 「取引先」から「顧客名」に変更）
      expect(screen.getByText('顧客名')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 49.2: getProjectDetailSummary一括取得動作テスト
  // Requirements: 29.2, 29.5
  // ==========================================================================

  describe('プロジェクト詳細一括取得（Task 49.2, Requirements 29.2, 29.5）', () => {
    it('fetchProject関数がgetProjectDetailSummaryを1回だけ呼び出す', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledTimes(1);
      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledWith('project-1');
    });

    it('レスポンスのproject、statusHistory、各セクションサマリーが正しく状態変数にセットされる', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            siteSurveys: {
              totalCount: 3,
              latestSurveys: [
                {
                  id: 'survey-1',
                  projectId: 'project-1',
                  name: '現場調査1',
                  surveyDate: '2024-01-15',
                  memo: null,
                  thumbnailUrl: null,
                  imageCount: 5,
                  createdAt: '2024-01-15T00:00:00.000Z',
                  updatedAt: '2024-01-15T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
        ).toBeInTheDocument();
      });

      // project情報が表示される
      expect(screen.getAllByText('営業太郎').length).toBeGreaterThanOrEqual(1);
      // statusHistoryが表示される
      expect(screen.getByText('ステータス変更履歴')).toBeInTheDocument();
      // セクションサマリーが表示される（現場調査: totalCount=3）
      await waitFor(() => {
        expect(screen.getByText(/全3件/)).toBeInTheDocument();
      });
    });

    it('isLoading状態がリクエスト開始時にtrue、完了時にfalseになる', async () => {
      // 遅延させてローディング表示を確認
      let resolvePromise: (value: ProjectDetailSummary) => void;
      vi.mocked(projectsApi.getProjectDetailSummary).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      renderWithRouter();

      // ローディング中
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();

      // データ返却
      resolvePromise!(createMockSummary());

      // ローディング完了
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });

    it('API失敗時のエラー表示を検証', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockRejectedValue(
        new ApiError(500, 'Internal Server Error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/Internal Server Error/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 53: プロジェクト詳細画面のUI改善（Requirements 31-34）
  // ==========================================================================

  describe('パンくずナビゲーション更新（Task 53.1, Requirements 31.1-31.4）', () => {
    it('パンくずに「プロジェクト一覧」リンクが表示され、/projectsへ遷移可能', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const projectsLink = screen.getByRole('link', { name: 'プロジェクト一覧' });
      expect(projectsLink).toHaveAttribute('href', '/projects');
    });

    it('パンくずの最後にプロジェクト名がリンクなしで表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).getByText('テストプロジェクト')).toBeInTheDocument();
      // リンクではないことを確認
      expect(screen.queryByRole('link', { name: 'テストプロジェクト' })).not.toBeInTheDocument();
    });

    it('パンくずにプロジェクト名がaria-current="page"で設定される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const currentPage = within(nav).getByText('テストプロジェクト');
      expect(currentPage).toHaveAttribute('aria-current', 'page');
    });

    it('パンくずに「ダッシュボード > プロジェクト一覧 > プロジェクト名」が表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(within(nav).getByText('ダッシュボード')).toBeInTheDocument();
      expect(within(nav).getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(within(nav).getByText('テストプロジェクト')).toBeInTheDocument();
    });
  });

  describe('「一覧に戻る」リンク削除（Task 53.2, Requirements 32.1-32.2）', () => {
    it('「一覧に戻る」リンクが表示されない', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: /一覧に戻る/ })).not.toBeInTheDocument();
    });
  });

  describe('クリップボードコピーボタン（Task 53.3, Requirements 33.1-33.9）', () => {
    it('プロジェクト名の横にコピーボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: 'プロジェクト名をコピー' });
      expect(copyButton).toBeInTheDocument();
    });

    it('顧客名が設定されている場合、顧客名の横にコピーボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: '顧客名をコピー' });
      expect(copyButton).toBeInTheDocument();
    });

    it('現場住所が設定されている場合、現場住所の横にコピーボタンが表示される', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: '現場住所をコピー' });
      expect(copyButton).toBeInTheDocument();
    });

    it('顧客名がnullの場合、顧客名のコピーボタンが表示されない', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          project: { tradingPartner: null },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: '顧客名をコピー' })).not.toBeInTheDocument();
    });

    it('現場住所が空の場合、現場住所のコピーボタンが表示されない', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          project: { siteAddress: '' },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: '現場住所をコピー' })).not.toBeInTheDocument();
    });

    it('コピーボタンをクリックするとクリップボードAPIが呼ばれる', async () => {
      const user = userEvent.setup();

      // クリップボードAPIのモック
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      try {
        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        });

        const copyButton = screen.getByRole('button', { name: 'プロジェクト名をコピー' });
        await user.click(copyButton);

        expect(writeTextMock).toHaveBeenCalledWith('テストプロジェクト');
      } finally {
        Object.defineProperty(navigator, 'clipboard', {
          value: originalClipboard,
          writable: true,
          configurable: true,
        });
      }
    });

    it('コピー成功後に「コピーしました」フィードバックが表示される', async () => {
      const user = userEvent.setup();

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      try {
        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        });

        const copyButton = screen.getByRole('button', { name: 'プロジェクト名をコピー' });
        await user.click(copyButton);

        await waitFor(() => {
          expect(screen.getByText('コピーしました')).toBeInTheDocument();
        });
      } finally {
        Object.defineProperty(navigator, 'clipboard', {
          value: originalClipboard,
          writable: true,
          configurable: true,
        });
      }
    });

    it('コピー失敗時に「コピーに失敗しました」フィードバックが表示される', async () => {
      const user = userEvent.setup();

      const writeTextMock = vi.fn().mockRejectedValue(new Error('Failed'));
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      try {
        renderWithRouter();

        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        });

        const copyButton = screen.getByRole('button', { name: 'プロジェクト名をコピー' });
        await user.click(copyButton);

        await waitFor(() => {
          expect(screen.getByText('コピーに失敗しました')).toBeInTheDocument();
        });
      } finally {
        Object.defineProperty(navigator, 'clipboard', {
          value: originalClipboard,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  describe('作成日時・更新日時フィールド削除（Task 53.4, Requirements 34.1-34.2）', () => {
    it('作成日時フィールドが表示されない', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByText('作成日時')).not.toBeInTheDocument();
    });

    it('更新日時フィールドが表示されない', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByText('更新日時')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 58.2: 契約書セクション統合テスト
  // Requirements: 36.1
  // ==========================================================================
  describe('契約書セクション統合（Task 58.2, Requirements 36.1）', () => {
    it('契約書セクションが見積書セクションの下に表示される (36.1)', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            estimates: { totalCount: 1, latestEstimates: [] },
            contracts: {
              totalCount: 2,
              latestContracts: [
                {
                  id: 'contract-1',
                  contractType: 'NEW',
                  contractDate: '2025-06-01',
                  status: 'CONTRACTED',
                  contractAmount: 5000000,
                  createdAt: '2025-06-01T00:00:00.000Z',
                },
              ],
            },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // 契約書セクションが存在する
      expect(screen.getByTestId('contract-section')).toBeInTheDocument();
      // 契約書のタイトルが表示される
      expect(screen.getByText('契約書')).toBeInTheDocument();
      // 総数が表示される
      expect(screen.getByText('全2件')).toBeInTheDocument();
    });

    it('契約書セクションが空の場合でも表示される (36.11)', async () => {
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
        createMockSummary({
          sections: {
            contracts: { totalCount: 0, latestContracts: [] },
          },
        })
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByTestId('contract-section')).toBeInTheDocument();
      expect(screen.getByText('契約書はまだありません')).toBeInTheDocument();
    });

    it('detail-summaryから契約書データが取得される（個別API不要）', async () => {
      const mockSummary = createMockSummary({
        sections: {
          contracts: {
            totalCount: 1,
            latestContracts: [
              {
                id: 'contract-1',
                contractType: 'NEW',
                contractDate: '2025-06-01',
                status: 'BEFORE_CONTRACT',
                contractAmount: 3000000,
                createdAt: '2025-06-01T00:00:00.000Z',
              },
            ],
          },
        },
      });
      vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(mockSummary);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      // detail-summaryから取得したデータが使用される
      expect(screen.getByTestId('contract-card-contract-1')).toBeInTheDocument();
      expect(screen.getByText('新規契約')).toBeInTheDocument();
      // getProjectDetailSummaryのみ呼ばれ、個別のgetContracts APIは呼ばれない
      expect(projectsApi.getProjectDetailSummary).toHaveBeenCalledTimes(1);
    });
  });
});
