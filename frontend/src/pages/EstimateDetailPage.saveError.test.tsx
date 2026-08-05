/**
 * @fileoverview EstimateDetailPage の保存エラー表示テスト（実物のコンポーネントで検証）
 *
 * Task 57.8: 保存が制限時間を超えた原因を利用者に伝える
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「明細を編集する → 保存する → 失敗の理由が画面に出る」という一気通貫を、
 * 実在するボタンの操作で辿れない（54.2 / 53.16 の死んだ props と同じ死角）。
 * 本ファイルは `EstimateDetailPage.toolbar.test.tsx` の先例に倣い、ツールバーと
 * 明細テーブルを**実物のまま**描画し、実際の操作から保存失敗の提示までを固定する。
 *
 * Requirements (estimate-creation):
 * - 42.3: 保存操作の一部に失敗した場合、変更をすべて破棄して保存前の状態を保ち、
 *   エラーメッセージを表示する
 *
 * @module pages/EstimateDetailPage.saveError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
import { ApiError } from '../api/client';

vi.mock('../api/estimates');

// jsdom は MemoryRouter で描画するためデータルーター前提の `useBlocker` が動かない。
// `EstimateDetailPage.toolbar.test.tsx` と同じ確立済みパターンでモックする（27.6）。
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: 'unblocked' as const, proceed: vi.fn(), reset: vi.fn() }),
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const buildLine = (
  id: string,
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string
) => ({
  id,
  estimateItemId: itemId,
  lineType,
  name,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: '100000',
  amount: '100000',
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const buildItem = (id: string, name: string, parentId: string | null, displayOrder: number) => ({
  id,
  estimateId: 'est-001',
  parentId,
  displayOrder,
  lines: [
    buildLine(`${id}-l1`, id, 'ESTIMATE', name),
    buildLine(`${id}-l2`, id, 'EXECUTION', name),
    buildLine(`${id}-l3`, id, 'VENDOR', name),
  ],
  children: [],
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: 'is-001',
  sourceItemizedStatementName: '内訳書A',
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [buildItem('item-a', '項目A', null, 0), buildItem('item-b', '項目B', null, 1)],
  totalAmount: '200000',
} as unknown as estimatesApi.EstimateDetail;

/**
 * バックエンドが制限時間超過で返す RFC7807 応答（Task 57.6 で新設）
 *
 * `backend/src/errors/estimateError.ts` の `EstimateSaveTimeoutError` および
 * `estimate-draft-save.api.integration.test.ts` の実応答アサーションと同じ形。
 */
const SAVE_TIMEOUT_DETAIL =
  '保存処理が制限時間内に完了しなかったため、変更は保存されていません。' +
  '見積書は保存前の状態のまま変更されていません。' +
  '明細の件数を減らして保存し直すか、時間をおいて再度お試しください';

const saveTimeoutResponseBody = {
  type: 'https://architrack.example.com/problems/internal-server-error',
  title: 'ESTIMATE_SAVE_TIMEOUT',
  status: 500,
  detail: SAVE_TIMEOUT_DETAIL,
  code: 'ESTIMATE_SAVE_TIMEOUT',
  details: { timeoutMs: 15000, maxItems: 2000 },
  message: SAVE_TIMEOUT_DETAIL,
};

/** 汎用のフォールバック文言（これに丸められていないことを主張するための対照） */
const GENERIC_SAVE_ERROR_MESSAGE = '保存に失敗しました。再度お試しください。';

// ============================================================================
// ヘルパー
// ============================================================================

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const waitForItems = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getByTestId('estimate-item-item-a')).toBeInTheDocument();
  });
};

const toolbar = (): HTMLElement => screen.getByTestId('estimate-item-toolbar');

/** 実物のツールバーから項目を追加して未保存の変更を作る（23.2） */
const addRootItem = async (): Promise<void> => {
  fireEvent.click(within(toolbar()).getByRole('button', { name: '+ 項目追加' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });
};

const clickSave = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
};

const saveErrorBanner = async (): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(screen.getByTestId('estimate-save-error')).toBeInTheDocument();
  });
  return screen.getByTestId('estimate-save-error');
};

describe('EstimateDetailPage 保存エラーの提示（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  /**
   * 42.3: 保存に失敗した場合、保存前の状態が保たれていることとエラーメッセージを表示する
   *
   * 制限時間超過は `code: ESTIMATE_SAVE_TIMEOUT` で識別する。HTTP ステータスだけでは
   * 他の 500 と区別できず、メッセージ文字列での判定は文言変更で壊れる。
   */
  /**
   * @requirement estimate-creation/REQ-42.3 保存操作の一部に失敗した場合に変更をすべて破棄して保存前の状態を保ち原因を伝える
   */
  it('制限時間超過の保存失敗で原因・未保存・回避策が読み取れる文言を出すこと (42.3)', async () => {
    vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValue(
      new ApiError(500, SAVE_TIMEOUT_DETAIL, saveTimeoutResponseBody)
    );
    renderPage();
    await waitForItems();
    await addRootItem();

    clickSave();

    const banner = await saveErrorBanner();
    // 原因: 制限時間内に完了しなかったこと
    expect(banner).toHaveTextContent('制限時間');
    // 結果: 変更が保存されておらず、保存前の状態が保たれていること
    expect(banner).toHaveTextContent('変更は保存されていません');
    expect(banner).toHaveTextContent('保存前の状態');
    // 回避策: 明細の件数を減らして保存し直す
    expect(banner).toHaveTextContent('件数を減らして');
    // 汎用文言に丸められていないこと
    expect(banner).not.toHaveTextContent(GENERIC_SAVE_ERROR_MESSAGE);
  });

  /**
   * 42.3: 制限時間超過だけを個別化しており、500 一律の置き換えになっていないこと
   *
   * この対照が無いと「500 をすべて制限時間超過として表示する」実装でも上のテストが
   * 通ってしまい、`code` による判定を主張したことにならない。
   */
  it('コードの無い 500 は従来どおり汎用文言のままであること (42.3)', async () => {
    vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValue(
      new ApiError(500, 'Internal Server Error', { status: 500, detail: 'Internal Server Error' })
    );
    renderPage();
    await waitForItems();
    await addRootItem();

    clickSave();

    const banner = await saveErrorBanner();
    expect(banner).toHaveTextContent(GENERIC_SAVE_ERROR_MESSAGE);
    expect(banner).not.toHaveTextContent('制限時間');
  });

  /**
   * 42.3: 編集中の内容は破棄せず、そのまま保存し直せる
   */
  it('制限時間超過でも画面の未保存の編集内容が保持されること (42.3)', async () => {
    vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValue(
      new ApiError(500, SAVE_TIMEOUT_DETAIL, saveTimeoutResponseBody)
    );
    renderPage();
    await waitForItems();
    const rowCountBeforeAdd = document.querySelectorAll('[data-estimate-row-key]').length;
    await addRootItem();
    const rowCountAfterAdd = document.querySelectorAll('[data-estimate-row-key]').length;
    expect(rowCountAfterAdd).toBe(rowCountBeforeAdd + 1);

    clickSave();
    await saveErrorBanner();

    // 追加した行は消えず、保存ボタンも押し直せる状態に戻る
    expect(document.querySelectorAll('[data-estimate-row-key]')).toHaveLength(rowCountAfterAdd);
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });
});
