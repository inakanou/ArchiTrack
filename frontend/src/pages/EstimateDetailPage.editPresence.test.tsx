/**
 * @fileoverview EstimateDetailPage の「他のユーザーが編集中」の警告表示テスト
 *
 * Task 61.1: 見積書詳細画面（常時編集、27.1）を開いている間に在席を通知し、
 * 応答に含まれる編集中の他の利用者を警告として表示することを、実物のページで検証する。
 * 2 人の利用者が実際に同じ見積書を開く一気通貫は E2E
 * `e2e/specs/estimate/estimate-edit-presence-e2e.spec.ts` が検める。
 *
 * Requirements (estimate-creation):
 * - 11.7: 見積書が他のユーザーによって編集中の場合、編集中であることを警告表示する
 *
 * @module pages/EstimateDetailPage.editPresence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

// jsdom は MemoryRouter で描画するためデータルーター前提の `useBlocker` が動かない。
// `EstimateDetailPage.saveError.test.tsx` と同じ確立済みパターンでモックする。
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: 'unblocked' as const, proceed: vi.fn(), reset: vi.fn() }),
  };
});

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [],
  totalAmount: '0',
} as unknown as estimatesApi.EstimateDetail;

const OTHER_EDITOR = {
  userId: 'user-b',
  displayName: '山田 太郎',
  lastSeenAt: '2026-10-10T03:00:00.000Z',
};

const presenceResponse = (otherEditors: estimatesApi.EstimateOtherEditor[]) => ({
  otherEditors,
  ttlSeconds: 90,
  heartbeatIntervalSeconds: 20,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const waitForPage = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
  });
};

describe('EstimateDetailPage 他のユーザーが編集中の警告 (11.7)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue([]);
    vi.mocked(estimatesApi.leaveEstimateEditSession).mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  /**
   * @requirement estimate-creation/REQ-11.7 見積書が他のユーザーによって編集中の場合に編集中であることを警告表示する
   */
  it('他のユーザーが同じ見積書を開いている間、その利用者名を挙げて警告する (11.7)', async () => {
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(
      presenceResponse([OTHER_EDITOR])
    );

    renderPage();
    await waitForPage();

    expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledWith('est-001');
    const warning = await screen.findByTestId('estimate-edit-presence-warning');
    expect(warning).toHaveAttribute('role', 'status');
    expect(warning).toHaveTextContent('山田 太郎さんがこの見積書を編集中です。');
  });

  it('他に編集中の利用者がいなければ警告を出さない (11.7)', async () => {
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(presenceResponse([]));

    renderPage();
    await waitForPage();
    await waitFor(() => {
      expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalledWith('est-001');
    });

    expect(screen.queryByTestId('estimate-edit-presence-warning')).not.toBeInTheDocument();
  });

  it('画面を離れると退出を通知する (11.7)', async () => {
    vi.mocked(estimatesApi.heartbeatEstimateEditSession).mockResolvedValue(presenceResponse([]));

    const { unmount } = renderPage();
    await waitForPage();
    await waitFor(() => {
      expect(estimatesApi.heartbeatEstimateEditSession).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(estimatesApi.leaveEstimateEditSession).toHaveBeenCalledWith('est-001', undefined);
    });
  });
});
