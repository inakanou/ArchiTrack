/**
 * @fileoverview 現場調査一覧ページ: 捕捉した誤りの監視送出テスト
 *
 * Task 115.84: 画面が捕捉した誤りを監視基盤（Sentry）へ送る
 *
 * 要件16.8 は「エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する」の
 * 2点を求める。表示側は出荷済みだが、一覧画面の捕捉処理（`catch`）は状態を設定するだけで
 * 記録を送っていなかった。全画面共通の `ErrorBoundary` は描画時の未捕捉例外しか拾わないため、
 * 捕捉済みの通信誤りは監視へ届かない。
 *
 * 本テストは `utils/sentry` を境界として差し替え、画面 → `logger.exception` →
 * `captureException` の出荷経路が実際に通ることを検証する。`logger` 自体は差し替えないため、
 * 機密情報のマスキングを含む本番の実装を通過する。
 *
 * Requirements:
 * - 16.8: エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SiteSurveyListPage from '../../pages/SiteSurveyListPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';
import * as sentry from '../../utils/sentry';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';

vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');
vi.mock('../../hooks/useSiteSurveyPermission');

// 監視基盤への送出境界のみを差し替える（logger は本番実装をそのまま通す）
vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: 'テスト説明',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'tp-1',
  tradingPartner: { id: 'tp-1', name: '取引先A', nameKana: 'トリヒキサキエー' },
  salesPerson: { id: 'user-1', displayName: '営業担当A' },
  constructionPerson: undefined,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockSiteSurveys = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

const mockPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  isLoading: false,
  getPermissionError: vi.fn().mockReturnValue(null),
};

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/projects/project-123/site-surveys']}>
      <Routes>
        <Route path="/projects/:projectId/site-surveys" element={<SiteSurveyListPage />} />
      </Routes>
    </MemoryRouter>
  );

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
  vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue(mockSiteSurveys);
  vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(mockPermission);
  // logger は開発環境で console.error へも出力するため、出力を抑えて内容だけ検証可能にする
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('SiteSurveyListPage の誤り送出 (Task 115.84, Requirement 16.8)', () => {
  /**
   * 表示（`role="alert"`）と送出の双方が起きることを、同一の失敗から確認する。
   * 表示だけでは要件16.8 の後半（Sentry へのログ送信）を満たさない。
   * @requirement site-survey/REQ-16.8
   */
  it('データ取得に失敗したとき、エラー表示に加えて監視基盤へ例外を送出する', async () => {
    const failure = new Error('プロジェクトが見つかりません');
    vi.mocked(projectsApi.getProject).mockRejectedValue(failure);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [sentError, sentContext] = vi.mocked(sentry.captureException).mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(sentError).toBe(failure);
    // 送出内容は画面と操作の特定に必要な最小限に限る（資格情報・個人情報を含めない）
    expect(sentContext).toEqual({
      screen: 'SiteSurveyListPage',
      operation: 'fetchSiteSurveyList',
      projectId: 'project-123',
    });
  });

  /**
   * Error 以外がスローされた場合も監視へ届く必要がある。
   * 画面は文言のフォールバックを持つが、送出側は `Error` を要求するため正規化が要る。
   * @requirement site-survey/REQ-16.8
   */
  it('Error 以外がスローされた場合も Error へ正規化して監視基盤へ送出する', async () => {
    vi.mocked(projectsApi.getProject).mockRejectedValue('文字列エラー');

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('データの取得に失敗しました')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [sentError] = vi.mocked(sentry.captureException).mock.calls[0] as [Error];
    expect(sentError).toBeInstanceOf(Error);
    expect(sentError.message).toContain('文字列エラー');
  });

  /**
   * 誤りが起きていないときに送出してはならない（監視のノイズ化を防ぐ）。
   * @requirement site-survey/REQ-16.8
   */
  it('取得が成功したときは監視基盤へ送出しない', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '現場調査一覧' })).toBeInTheDocument();
    });

    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
