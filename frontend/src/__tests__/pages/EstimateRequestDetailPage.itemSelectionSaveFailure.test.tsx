/**
 * @fileoverview 見積依頼詳細画面の項目選択の保存の失敗（Task 97.1）
 *
 * 項目選択パネル（ItemSelectionPanel）をモックせず、画面（EstimateRequestDetailPage）から
 * 通して検証する。パネル単体のテストは失敗をパネルの props へ直接注入するため、画面の
 * `handleItemSelectionChange` が API の例外を握りつぶすとパネルの失敗の分岐へ届かない欠陥を
 * 検出できなかった（保存の失敗で「保存しました」と表示され、選択状態が戻らなかった）。
 *
 * Requirements (estimate-request):
 * - 4.8: 選択状態の保存が成功したとき、保存完了のフィードバックを表示する
 * - 4.9: 選択状態の保存が失敗した場合、エラーメッセージを表示し選択状態をサーバー側の最新状態に復元する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestDetailPage from '../../pages/EstimateRequestDetailPage';
import * as estimateRequestApi from '../../api/estimate-requests';
import * as receivedQuotationApi from '../../api/received-quotations';
import { ApiError } from '../../api/client';

vi.mock('../../api/estimate-requests');
vi.mock('../../api/received-quotations');
vi.mock('../../api/estimate-request-status');
vi.mock('../../api/projects', () => ({
  getProject: vi.fn().mockResolvedValue({ name: 'テストプロジェクト' }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    sessionExpiredDuringOperation: false,
    sessionExpired: false,
  }),
}));

const mockEstimateRequest = {
  id: 'er-1',
  name: 'テスト見積依頼',
  projectId: 'project-1',
  tradingPartnerId: 'tp-1',
  tradingPartnerName: 'テスト取引先',
  itemizedStatementId: 'is-1',
  itemizedStatementName: 'テスト内訳書',
  method: 'EMAIL' as const,
  includeBreakdownInBody: false,
  status: 'BEFORE_REQUEST' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

const mockItems = [
  {
    id: 'item-1',
    estimateRequestItemId: 'eri-1',
    customCategory: 'カテゴリ1',
    workType: '工種1',
    name: '項目1',
    specification: '規格1',
    unit: '個',
    quantity: 10,
    displayOrder: 1,
    selected: true,
    otherRequests: [],
  },
  {
    id: 'item-2',
    estimateRequestItemId: 'eri-2',
    customCategory: 'カテゴリ2',
    workType: '工種2',
    name: '項目2',
    specification: '規格2',
    unit: '式',
    quantity: 1,
    displayOrder: 2,
    selected: false,
    otherRequests: [],
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/estimate-requests/er-1']}>
      <Routes>
        <Route path="/estimate-requests/:id" element={<EstimateRequestDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateRequestDetailPage 項目選択の保存（パネルをモックしない）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockResolvedValue(mockEstimateRequest);
    vi.mocked(estimateRequestApi.getEstimateRequestItems).mockResolvedValue(mockItems);
    vi.mocked(receivedQuotationApi.getReceivedQuotations).mockResolvedValue([]);
  });

  it('保存が失敗すると「失敗」を含むエラーを表示し、チェックをサーバー状態へ戻す（4.9）', async () => {
    const user = userEvent.setup();
    vi.mocked(estimateRequestApi.updateItemSelection).mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );

    renderPage();

    const checkbox = await screen.findByRole('checkbox', { name: '項目2を選択' });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: '選択状態を保存' }));

    expect(estimateRequestApi.updateItemSelection).toHaveBeenCalledTimes(1);
    const feedback = await screen.findByTestId('save-feedback');
    await waitFor(() => {
      expect(feedback).toHaveTextContent('失敗');
    });
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument();
    // サーバー側の最新状態（未選択）へ復元される
    expect(screen.getByRole('checkbox', { name: '項目2を選択' })).not.toBeChecked();
    // 未保存の変更は残らない
    expect(screen.getByRole('button', { name: '選択状態を保存' })).toBeDisabled();
  });

  it('保存が成功すると保存完了のフィードバックを表示する（4.8）', async () => {
    const user = userEvent.setup();
    vi.mocked(estimateRequestApi.updateItemSelection).mockResolvedValue(undefined);

    renderPage();

    const checkbox = await screen.findByRole('checkbox', { name: '項目2を選択' });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: '選択状態を保存' }));

    const feedback = await screen.findByTestId('save-feedback');
    expect(feedback).toHaveTextContent('保存しました');
    expect(feedback).not.toHaveTextContent('失敗');
  });

  it('保存が成功し、その後の項目の再取得だけが失敗しても保存の失敗として扱わない（4.8）', async () => {
    const user = userEvent.setup();
    vi.mocked(estimateRequestApi.updateItemSelection).mockResolvedValue(undefined);
    vi.mocked(estimateRequestApi.getEstimateRequestItems)
      .mockResolvedValueOnce(mockItems)
      .mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'));

    renderPage();

    const checkbox = await screen.findByRole('checkbox', { name: '項目2を選択' });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: '選択状態を保存' }));

    const feedback = await screen.findByTestId('save-feedback');
    expect(feedback).toHaveTextContent('保存しました');
    // 保存済みの選択状態は戻されない
    expect(screen.getByRole('checkbox', { name: '項目2を選択' })).toBeChecked();
  });
});
