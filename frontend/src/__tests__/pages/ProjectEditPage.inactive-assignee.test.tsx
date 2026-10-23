/**
 * @fileoverview 案件の編集画面で、無効化された担当者の表示名が担当者選択に表示されるテスト
 *
 * タスク49.7: 案件の詳細（getProject）が返す担当者の表示名を、編集フォームの担当者選択へ渡す。
 * 担当者候補（有効な利用者だけ）に無い担当者は「（無効）」を添えて選択中のまま表示する。
 *
 * Requirements (user-authentication):
 * - REQ-36.6: 無効化されたユーザーが担当者として設定された既存データの表示で、表示名を引き続き表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../components/ToastProvider';
import ProjectEditPage from '../../pages/ProjectEditPage';
import * as projectsApi from '../../api/projects';
import type { ProjectDetail } from '../../types/project.types';

vi.mock('../../api/projects');
vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
}));

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getAccessToken: vi.fn(() => 'mock-token'),
    },
  };
});

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', displayName: '山田太郎', email: 'yamada@example.com' },
    isAuthenticated: true,
    isInitialized: true,
  })),
}));

const project: ProjectDetail = {
  id: 'project-1',
  name: '無効化された担当者の案件',
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'inactive-sales', displayName: '退職営業' },
  constructionPerson: { id: 'inactive-construction', displayName: '退職工事' },
  siteAddress: undefined,
  description: undefined,
  status: 'PREPARING',
  statusLabel: '準備中',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/project-1/edit']}>
      <ToastProvider>
        <Routes>
          <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('ProjectEditPage — 無効化された担当者の表示名（36.6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(project);
    // 候補 API は有効な利用者だけを返す（無効化された担当者は含まれない）
    vi.mocked(projectsApi.getAssignableUsers).mockResolvedValue([
      { id: 'user-1', displayName: '山田太郎' },
    ]);
  });

  it('営業担当者・工事担当者が無効化されていても、選択欄に表示名と「（無効）」を表示する', async () => {
    renderPage();

    const sales = (await screen.findByRole('combobox', {
      name: '営業担当者',
    })) as HTMLSelectElement;
    const construction = screen.getByRole('combobox', { name: '工事担当者' }) as HTMLSelectElement;

    await waitFor(() => {
      expect(sales.value).toBe('inactive-sales');
    });
    expect(sales.selectedOptions[0]?.textContent).toBe('退職営業（無効）');
    expect(construction.value).toBe('inactive-construction');
    expect(construction.selectedOptions[0]?.textContent).toBe('退職工事（無効）');
  });
});
