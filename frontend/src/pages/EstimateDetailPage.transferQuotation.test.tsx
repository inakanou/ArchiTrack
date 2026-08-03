/**
 * @fileoverview EstimateDetailPage の受領見積書転記の統合テスト（実物のコンポーネントで検証）
 *
 * Task 55.5: 受領見積書転記ダイアログの入力元を編集中の明細へ変更
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「未保存の新規項目を転記先に選ぶ → 転記結果が明細へ入る」の一気通貫を捉えられない
 * （53.16 / 54.10 で繰り返し死角になった死んだ props と同じ問題）。
 * 本ファイルは明細テーブルと転記ダイアログを**実物のまま**描画する。
 *
 * Requirements (estimate-creation):
 * - 4.2: 転記先を指定しない場合は新規見積項目行を作りその業者金額行へ転記する
 * - 4.3: 名称・規格・単位・数量・単価を転記対象とする
 * - 4.4: 選択した明細行はそれぞれ別の見積項目行の業者金額行として反映する
 * - 4.6, 49.1: 転記結果を未保存の変更として編集中の内容に反映する
 * - 17.4: 見積業者列に受領見積書の業者名を表示する
 * - 30.3, 30.4: 未保存の新規項目を含む既存項目の子項目として転記する
 * - 31.1, 31.2: NET案分ダイアログが転記元の受領見積書の合計金額・NET金額を表示する
 * - 49.2: 明細の再取得を行わず、それまでの未保存の編集内容を保持する
 * - 49.3: 実行の時点でデータベースへの書き込みを行わない
 * - 49.7: 計算対象に未保存の新規項目を含める
 * - 49.8: 転記による変更を取り消し可能とする
 *
 * @module pages/EstimateDetailPage.transferQuotation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
import { getReceivedQuotationsByProject } from '../api/received-quotations';
import { ESTIMATE_ROW_KEY_ATTRIBUTE } from '../domain/estimate/estimateKeymap';

vi.mock('../api/estimates');

vi.mock('../api/received-quotations', () => ({
  getReceivedQuotationsByProject: vi.fn(),
}));

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
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string
) => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name: lineType === 'ESTIMATE' ? name : null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const buildItem = (id: string, name: string, displayOrder: number) => ({
  id,
  estimateId: 'est-001',
  parentId: null,
  displayOrder,
  itemType: 'STANDARD',
  lines: [
    buildLine(id, 'ESTIMATE', name),
    buildLine(id, 'EXECUTION', name),
    buildLine(id, 'VENDOR', name),
  ],
  children: [],
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
});

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [buildItem('item-a', '建築工事', 0)],
  totalAmount: '0',
} as unknown as estimatesApi.EstimateDetail;

/**
 * 受領見積書。業者名（協力業者名）と見積書名を**別の文字列**にしてある。
 *
 * 転記先の業者金額行に載るのは協力業者名（`業者甲`）なので、受領見積書名
 * （`一次見積書`）を手がかりにした逆引きでは REQ-31 の表示が成立しない。
 */
const mockQuotations = [
  {
    id: 'rq-001',
    estimateRequestId: 'er-001',
    name: '一次見積書',
    submittedAt: new Date('2024-01-10'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    totalAmount: 300000,
    netAmount: 240000,
    tradingPartnerName: '業者甲',
    lineItems: [
      {
        id: 'rql-001',
        receivedQuotationId: 'rq-001',
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '仮設工事',
        specification: 'A規格',
        unit: '式',
        quantity: 2,
        unitPrice: 50000,
        amount: 100000,
        remarks: null,
      },
      {
        id: 'rql-002',
        receivedQuotationId: 'rq-001',
        sortOrder: 1,
        customCategory: null,
        workType: null,
        name: '土工事',
        specification: 'B規格',
        unit: 'm3',
        quantity: 4,
        unitPrice: 50000,
        amount: 200000,
        remarks: null,
      },
    ],
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const rowOf = (itemId: string): HTMLElement => screen.getByTestId(`estimate-item-${itemId}`);

/** 指定した項目・行タイプのセル値（入力欄） */
const lineInput = (itemId: string, lineType: string, label: string): HTMLInputElement =>
  within(within(rowOf(itemId)).getByTestId(`line-type-${lineType}`)).getByLabelText(
    label
  ) as HTMLInputElement;

/** 指定した項目・行タイプの金額表示（自動計算） */
const lineAmountText = (itemId: string, lineType: string): string =>
  within(within(rowOf(itemId)).getByTestId(`line-type-${lineType}`))
    .getByTestId('amount-field')
    .textContent?.trim() ?? '';

/** 明細テーブルに現れる見積項目のキー（描画順） */
const renderedItemKeys = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`[${ESTIMATE_ROW_KEY_ATTRIBUTE}]`),
    (element) => element.getAttribute(ESTIMATE_ROW_KEY_ATTRIBUTE) ?? ''
  );

/** 転記で新しく作られた項目のキー（読み込み時の item-a 以外） */
const transferredKeys = (): string[] => renderedItemKeys().filter((key) => key !== 'item-a');

/** 読み取り専用の見積書API（呼ばれてもデータベースを変更しない） */
const READ_ONLY_ESTIMATE_APIS = new Set([
  'getEstimates',
  'getEstimatesSummary',
  'getEstimateDetail',
  'getEstimateItems',
  'calculateOverhead',
]);

/**
 * 書き込み系の見積書APIが一つも呼ばれていないことを確かめる（49.3）
 *
 * かつては撤去対象の `transferFromQuotation` を名指しで検証していたが、
 * 関数そのものが消えた（Task 55.7）ため名指しでは書けない。読み取り専用の
 * 関数だけを除外し、残り全部の呼び出しゼロで固定することで、
 * 将来どの書き込み関数が足されても転記経路から呼ばれれば落ちる。
 */
const expectNoEstimateWriteApiCall = (): void => {
  const called = Object.entries(estimatesApi)
    .filter(
      ([name, value]) =>
        vi.isMockFunction(value) &&
        !READ_ONLY_ESTIMATE_APIS.has(name) &&
        value.mock.calls.length > 0
    )
    .map(([name]) => name);
  expect(called).toEqual([]);
};

describe('EstimateDetailPage 受領見積書転記の統合（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
    vi.mocked(getReceivedQuotationsByProject).mockResolvedValue(
      mockQuotations as unknown as Awaited<ReturnType<typeof getReceivedQuotationsByProject>>
    );
  });

  const waitForItems = async (): Promise<void> => {
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a')).toBeInTheDocument();
    });
  };

  const openTransferDialog = async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
    await waitFor(() => {
      expect(screen.getByText('受領見積書から転記')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  };

  /**
   * 55.5 の中心的な受入基準。
   *
   * 未保存の新規項目（`tmp-*`）を転記先に選んで転記でき、転記結果が
   * その子として編集中の明細に現れる（30.3, 30.4, 49.7）。
   * 転記先が保存済みの項目キーしか受け付けないと、この経路は成立しない。
   */
  /** @requirement estimate-creation/REQ-30.4 */
  it('未保存の新規項目を転記先に選んで転記できること (30.3, 30.4, 49.7)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    // 未保存の新規項目を追加する
    fireEvent.click(screen.getByRole('button', { name: '+ 項目追加' }));
    await waitFor(() => {
      expect(renderedItemKeys().length).toBe(2);
    });
    const newKey = transferredKeys()[0]!;
    expect(newKey.startsWith('tmp-')).toBe(true);
    fireEvent.change(lineInput(newKey, 'ESTIMATE', '名称'), { target: { value: '未保存の親' } });

    await openTransferDialog();

    await user.selectOptions(screen.getByLabelText('受領見積書を選択'), 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });

    // 未保存の新規項目が転記先の選択肢に出る（30.4）
    const targetSelect = screen.getByLabelText('転記先見積項目') as HTMLSelectElement;
    expect(
      within(targetSelect)
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value)
    ).toContain(newKey);

    await user.selectOptions(targetSelect, newKey);
    await user.click(screen.getByRole('button', { name: '転記' }));

    await waitFor(() => {
      expect(screen.queryByText('受領見積書から転記')).not.toBeInTheDocument();
    });

    // 選択した2明細行が、未保存の新規項目の子として現れる（30.3, 4.4）
    const created = renderedItemKeys().filter((key) => key !== 'item-a' && key !== newKey);
    expect(created).toHaveLength(2);
    expect(lineInput(created[0]!, 'VENDOR', '名称').value).toBe('仮設工事');
    expect(lineInput(created[1]!, 'VENDOR', '名称').value).toBe('土工事');

    // 親の業者金額は子の合計（2.3）＝ 100,000 + 200,000
    expect(lineAmountText(newKey, 'VENDOR')).toBe('300,000');
    // 未保存の編集はそのまま残る（49.2）
    expect(lineInput(newKey, 'ESTIMATE', '名称').value).toBe('未保存の親');
  });

  /** @requirement estimate-creation/REQ-4.3 */
  it('転記先未指定で名称・規格・単位・数量・単価を業者金額行へ反映すること (4.2, 4.3, 17.4)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await openTransferDialog();
    await user.selectOptions(screen.getByLabelText('受領見積書を選択'), 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: '転記' }));

    await waitFor(() => {
      expect(transferredKeys()).toHaveLength(2);
    });
    const first = transferredKeys()[0]!;

    expect(lineInput(first, 'VENDOR', '名称').value).toBe('仮設工事');
    expect(lineInput(first, 'VENDOR', '規格').value).toBe('A規格');
    expect(lineInput(first, 'VENDOR', '単位').value).toBe('式');
    expect(lineInput(first, 'VENDOR', '数量').value).toBe('2');
    expect(lineInput(first, 'VENDOR', '単価').value).toBe('50000');
    // 金額は転記対象ではなく 数量 × 単価 として自動計算する（22.9）
    expect(lineAmountText(first, 'VENDOR')).toBe('100,000');
    // 見積業者列に受領見積書の業者名を表示する（17.4）
    expect(within(rowOf(first)).getByText('業者甲')).toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-49.3 */
  it('転記の実行でサーバーへ書き込まず明細も再取得しないこと (49.2, 49.3)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    // 未保存の編集を抱えたままでも転記できる（49.2, 49.6）
    fireEvent.change(lineInput('item-a', 'ESTIMATE', '名称'), { target: { value: '編集済みA' } });

    await openTransferDialog();
    await user.selectOptions(screen.getByLabelText('受領見積書を選択'), 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: '転記' }));

    await waitFor(() => {
      expect(transferredKeys()).toHaveLength(2);
    });

    expectNoEstimateWriteApiCall();
    // 初回読み込みの1回のみ（転記後の再取得が無い）
    expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    expect(lineInput('item-a', 'ESTIMATE', '名称').value).toBe('編集済みA');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  /** @requirement estimate-creation/REQ-49.8 */
  it('転記の結果を取り消せること (48.8, 49.8)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await openTransferDialog();
    await user.selectOptions(screen.getByLabelText('受領見積書を選択'), 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: '転記' }));

    await waitFor(() => {
      expect(transferredKeys()).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));

    await waitFor(() => {
      expect(transferredKeys()).toHaveLength(0);
    });
  });

  /**
   * 55.2 → 55.5 の申し送り(2)の帰結。
   *
   * クライアント側の転記は受領見積書明細行の識別子（`sourceReceivedQuotationLineItemId`）を
   * 残さない。NET案分ダイアログの受領見積書情報（31.1, 31.2）は業者金額行に残る
   * 業者名（`sourceVendorName`）から引き当てる必要がある。
   * 受領見積書名（`一次見積書`）は業者名（`業者甲`）と別の文字列なので、
   * 見積書名を手がかりにした逆引きでは表示が成立しない。
   */
  /** @requirement estimate-creation/REQ-31.1 */
  it('転記した業者を選ぶとNET案分に受領見積書の合計金額とNET金額が出ること (31.1, 31.2)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await openTransferDialog();
    await user.selectOptions(screen.getByLabelText('受領見積書を選択'), 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: '転記' }));

    await waitFor(() => {
      expect(transferredKeys()).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /業者金額を実行金額に転記/ }));
    await waitFor(() => {
      expect(screen.getByText('業者金額を実行金額に転記（NET金額案分）')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者甲');

    await waitFor(() => {
      expect(screen.getByTestId('quotation-info-grid')).toBeInTheDocument();
    });
    const info = screen.getByTestId('quotation-info-grid');
    expect(within(info).getByText('300,000円')).toBeInTheDocument();
    expect(within(info).getByText('240,000円')).toBeInTheDocument();
  });
});
