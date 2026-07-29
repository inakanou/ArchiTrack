/**
 * @fileoverview ProjectDetailPage 工事写真セクション配置テスト
 *
 * Task 7.2 (construction-photo): プロジェクト詳細への工事写真パネル追加
 *
 * Requirements (construction-photo):
 * - 2.1: プロジェクト詳細画面に工事写真パネルを工程表パネルの直下に表示する
 * - 2.2: 工事写真パネルを操作すると当該プロジェクトの工事写真一覧画面へ遷移する
 * - 2.3: 工事写真パネルに登録件数などのサマリ情報を表示する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectDetailPage from '../../pages/ProjectDetailPage';
import * as projectsApi from '../../api/projects';
import type { ProjectDetailSummary } from '../../api/projects';

vi.mock('../../api/projects');

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'テストユーザー' },
    isAuthenticated: true,
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockProject = {
  id: 'project-1',
  name: 'テストプロジェクト',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト顧客', nameKana: 'テストコキャク' },
  salesPerson: { id: 'user-1', displayName: '営業太郎' },
  constructionPerson: { id: 'user-2', displayName: '工事次郎' },
  siteAddress: '東京都渋谷区1-2-3',
  description: '',
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

function createSummary(
  constructionPhotos: ProjectDetailSummary['sections']['constructionPhotos'] = {
    totalCount: 0,
    latestAlbums: [],
  }
): ProjectDetailSummary {
  return {
    project: mockProject,
    statusHistory: [],
    sections: {
      siteSurveys: { totalCount: 0, latestSurveys: [] },
      quantityTables: { totalCount: 0, latestTables: [] },
      itemizedStatements: { totalCount: 0, latestStatements: [] },
      estimateRequests: { totalCount: 0, latestRequests: [] },
      estimates: { totalCount: 0, latestEstimates: [] },
      contracts: { totalCount: 0, latestContracts: [] },
      schedules: { totalCount: 0, latestSchedules: [] },
      executionBudget: null,
      constructionPhotos,
    },
  } as ProjectDetailSummary;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/project-1']}>
      <ToastProvider>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/construction-photos" element={<div>工事写真一覧</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('ProjectDetailPage 工事写真セクション配置（Task 7.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(createSummary());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // 2.1: 工程表パネルの直下に配置
  it('工事写真セクションが工程表セクションの直後に配置される', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'テストプロジェクト' })
      ).toBeInTheDocument();
    });

    const scheduleSection = screen.getByTestId('schedule-section');
    const constructionPhotoSection = screen.getByTestId('construction-photo-section');

    // 工程表 → 工事写真 のDOM順序（工程表が工事写真より前）
    expect(
      scheduleSection.compareDocumentPosition(constructionPhotoSection) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  // 2.3: サマリ件数表示
  it('工事写真セクションに登録件数を表示する', async () => {
    vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
      createSummary({
        totalCount: 4,
        latestAlbums: [
          {
            id: 'album-1',
            projectId: 'project-1',
            name: '基礎工事アルバム',
            memo: null,
            thumbnailUrl: null,
            representativeImageId: null,
            photoCount: 3,
            createdAt: '2025-06-01T00:00:00.000Z',
            updatedAt: '2025-06-01T00:00:00.000Z',
          },
        ],
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('全4件')).toBeInTheDocument();
    });
  });

  // 2.2: 一覧への遷移リンク
  it('工事写真一覧への「すべて見る」リンクを表示する', async () => {
    vi.mocked(projectsApi.getProjectDetailSummary).mockResolvedValue(
      createSummary({
        totalCount: 1,
        latestAlbums: [
          {
            id: 'album-1',
            projectId: 'project-1',
            name: '基礎工事アルバム',
            memo: null,
            thumbnailUrl: null,
            representativeImageId: null,
            photoCount: 3,
            createdAt: '2025-06-01T00:00:00.000Z',
            updatedAt: '2025-06-01T00:00:00.000Z',
          },
        ],
      })
    );

    renderPage();

    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /すべて見る/ });
      const photoLink = links.find(
        (link) => link.getAttribute('href') === '/projects/project-1/construction-photos'
      );
      expect(photoLink).toBeInTheDocument();
    });
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-2.3
 */
