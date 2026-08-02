/**
 * @fileoverview EstimateDetailPage の諸経費行・値引き行追加の統合テスト（実物のコンポーネントで検証）
 *
 * Task 55.6: 諸経費行・値引き行の追加をクライアント側へ移行
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「パネル／ツールバーを操作する → 編集中の明細に行が入る」の一気通貫を捉えられない
 * （53.16 / 54.10 で繰り返し死角になった死んだ props と同じ問題）。
 * 本ファイルは諸経費パネル・明細テーブル・ツールバーを**実物のまま**描画する。
 *
 * Requirements (estimate-creation):
 * - 7.1, 8.1, 9.1: 諸経費行の追加でプリセット値（名称・規格＝空白・単位＝式・数量＝1）を設定する
 * - 7.3, 8.3, 9.3: 自動計算は国土交通省基準の計算式に準じる（書き込みを伴わない既存の計算経路）
 * - 7.7, 8.7, 9.7: 諸経費行の追加を未保存の変更として扱い、保存操作で確定する
 * - 41.1: ツールバーに「値引き行追加」ボタンを提供する
 * - 41.2: 名称：値引き、規格：空白、単位：式、数量：1をプリセット値としてルートレベルに追加する
 * - 41.11: 値引き行の追加を未保存の変更として扱い、保存操作で確定する
 * - 43.4: 諸経費追加を行った場合、それまでの未保存の編集内容を保持する
 * - 48.8, 49.8: 追加による変更を取り消し可能とする
 * - 49.3: 実行の時点でデータベースへの書き込みを行わない
 *
 * @module pages/EstimateDetailPage.overheadCost
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

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
  items: [buildItem('item-a', '建築工事', 0), buildItem('item-b', 'electrical', 1)],
  totalAmount: '200000',
} as unknown as estimatesApi.EstimateDetail;

const savedResponse = () =>
  ({
    id: 'est-001',
    projectId: 'proj-001',
    project: { id: 'proj-001', name: 'テストプロジェクト' },
    name: 'テスト見積書',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-03-01T00:00:00.000Z',
    itemCount: 2,
    reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
    items: mockEstimateDetail.items,
  }) as unknown as estimatesApi.SaveEstimateDraftResponse;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

// ============================================================================
// ヘルパー
// ============================================================================

const rowOf = (itemKey: string): HTMLElement => screen.getByTestId(`estimate-item-${itemKey}`);

const lineInput = (itemKey: string, lineType: string, label: string): HTMLInputElement =>
  within(within(rowOf(itemKey)).getByTestId(`line-type-${lineType}`)).getByLabelText(
    label
  ) as HTMLInputElement;

const lineAmountText = (itemKey: string, lineType: string): string =>
  within(within(rowOf(itemKey)).getByTestId(`line-type-${lineType}`))
    .getByTestId('amount-field')
    .textContent?.trim() ?? '';

/** 明細テーブルに現れる見積項目のキー（描画順） */
const rowKeys = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-estimate-row-key]')).map(
    (row) => row.dataset.estimateRowKey ?? ''
  );

/** 読み込み時の2件以外に増えた項目のキー */
const addedKeys = (): string[] => rowKeys().filter((key) => key !== 'item-a' && key !== 'item-b');

/**
 * 参照系（`get*`）以外の API 呼び出し名の一覧
 *
 * 「サーバーへ書き込まない」（49.3）は否定の要件のため、特定のエンドポイント名を
 * 名指しせず**参照系以外の全呼び出し**を列挙して判定する。書き込み経路が別名で
 * 復活しても捕捉できる。諸経費の計算（`calculateOverhead`）は書き込みを伴わない
 * 計算専用の経路（`POST /:id/calculate-overhead` はDBを更新しない）だが、名前が
 * `get` で始まらないため本一覧に現れる。呼ばれてよい場面と呼ばれてはならない場面を
 * テストごとに明示するため、除外せずそのまま数える。
 */
const nonGetApiCalls = (): string[] => {
  const calls: string[] = [];
  for (const [name, exported] of Object.entries(estimatesApi)) {
    if (typeof exported !== 'function' || !vi.isMockFunction(exported)) continue;
    if (name.startsWith('get')) continue;
    for (let i = 0; i < exported.mock.calls.length; i += 1) calls.push(name);
  }
  return calls.sort();
};

const savePayload = (): estimatesApi.SaveEstimateDraftRequest =>
  vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1];

const saveButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;

describe('EstimateDetailPage 諸経費行・値引き行の追加（実物のコンポーネント）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(mockEstimateDetail.items);
  });

  const waitForItems = async (): Promise<void> => {
    await waitFor(() => {
      expect(screen.getByTestId('estimate-item-item-a')).toBeInTheDocument();
    });
  };

  /** 諸経費ダイアログを開く */
  const openOverheadDialog = async (): Promise<HTMLElement> => {
    fireEvent.click(screen.getByRole('button', { name: '諸経費を計算して追加' }));
    return await screen.findByTestId('overhead-cost-dialog');
  };

  /**
   * 諸経費種別を選び、計算金額を手入力して「項目追加」を押す
   *
   * 計算そのものはサーバーの計算経路が担う（7.3/8.3/9.3）。ここでは
   * 「自動計算結果を手入力で上書き可能」（7.5/8.5/9.5）と同じ入力欄を使う。
   */
  const addOverheadRow = async (
    user: ReturnType<typeof userEvent.setup>,
    costTypeLabel: string,
    unitPrice: string
  ): Promise<void> => {
    const dialog = await openOverheadDialog();
    await user.selectOptions(within(dialog).getByLabelText('諸経費種別'), [costTypeLabel]);
    fireEvent.change(within(dialog).getByLabelText('計算金額'), { target: { value: unitPrice } });
    await user.click(within(dialog).getByRole('button', { name: '項目追加' }));
  };

  // ==========================================================================
  // 諸経費行の追加（7.1, 8.1, 9.1）
  // ==========================================================================

  /**
   * 選んだ費目のプリセット値がそのまま編集中の明細に現れる。
   *
   * 費目を1種類だけで固定すると「費目に関わらず共通仮設費を作る」実装でも
   * 通ってしまうため、3費目すべてを回して名称の対応を固定する。
   *
   * @requirement estimate-creation/REQ-8.1
   */
  it.each([
    ['共通仮設費', '共通仮設費'],
    ['現場管理費', '現場管理費'],
    ['一般管理費', '一般管理費'],
  ])(
    '%s の追加でプリセット値の見積金額行が編集中の明細に現れること (7.1, 8.1, 9.1)',
    async (option, expectedName) => {
      const user = userEvent.setup();
      renderPage();
      await waitForItems();

      await addOverheadRow(user, option, '250000');

      await waitFor(() => {
        expect(addedKeys()).toHaveLength(1);
      });
      const key = addedKeys()[0]!;
      // 未保存の新規項目として追加される（43.1）
      expect(key.startsWith('tmp-')).toBe(true);

      expect(lineInput(key, 'ESTIMATE', '名称').value).toBe(expectedName);
      expect(lineInput(key, 'ESTIMATE', '規格').value).toBe('');
      expect(lineInput(key, 'ESTIMATE', '単位').value).toBe('式');
      expect(lineInput(key, 'ESTIMATE', '数量').value).toBe('1');
      expect(lineInput(key, 'ESTIMATE', '単価').value).toBe('250000');
      // 金額は 数量 × 単価 として自動計算する（22.9）
      expect(lineAmountText(key, 'ESTIMATE')).toBe('250,000');

      // 追加後はダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByTestId('overhead-cost-dialog')).not.toBeInTheDocument();
      });
    }
  );

  /**
   * 追加の実行時点でサーバーへ書き込まず、明細の再取得も行わない（49.2, 49.3）。
   *
   * @requirement estimate-creation/REQ-49.3
   */
  it('諸経費追加でサーバーへ書き込まず明細も再取得しないこと (49.2, 49.3)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await addOverheadRow(user, '現場管理費', '80000');

    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });

    // 計算を押していないので、参照系以外の呼び出しは1件も無い
    expect(nonGetApiCalls()).toEqual([]);
    // 初回読み込みの1回のみ（追加後の再取得が無い）
    expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    expect(estimatesApi.getEstimateItems).toHaveBeenCalledTimes(1);
  });

  /**
   * 追加は未保存の変更として扱われ、保存操作で確定する（7.7, 8.7, 9.7）。
   *
   * @requirement estimate-creation/REQ-7.7
   */
  it('諸経費追加が未保存の変更となり保存操作で確定すること (7.7, 8.7, 9.7)', async () => {
    vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(savedResponse());
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    expect(saveButton()).toBeDisabled();

    await addOverheadRow(user, '一般管理費', '120000');
    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });

    // 未保存の変更として扱われる
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());
    await waitFor(() => {
      expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
    });

    // 保存操作で確定する＝追加した行がペイロードに現れる
    const nodes = savePayload().items;
    expect(nodes).toHaveLength(3);
    const added = nodes[2]!;
    expect(added.id).toBeNull();
    expect(added.tempId).not.toBeNull();
    expect(added.itemType).toBe('STANDARD');
    const estimateLine = added.lines.find((line) => line.lineType === 'ESTIMATE')!;
    expect(estimateLine.name).toBe('一般管理費');
    expect(estimateLine.unit).toBe('式');
    expect(estimateLine.quantity).toBe('1');
    expect(estimateLine.unitPrice).toBe('120000');
  });

  /**
   * 追加直後に取り消せる（48.8, 49.8）。
   *
   * @requirement estimate-creation/REQ-49.8
   */
  it('諸経費追加を直後に取り消せること (48.8, 49.8)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await addOverheadRow(user, '共通仮設費', '50000');
    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('undo-button'));

    await waitFor(() => {
      expect(addedKeys()).toHaveLength(0);
    });
    expect(rowKeys()).toEqual(['item-a', 'item-b']);
    expect(saveButton()).toBeDisabled();
  });

  /**
   * 未保存の編集を抱えたままでも諸経費を追加でき、それまでの編集内容は失われない（43.4）。
   *
   * 53.9 の暫定ガードは未保存の間ダイアログの起動そのものを抑止していた。
   * サーバー書き込みが消えた以上、抑止する理由も再同期による上書きの危険も無い。
   *
   * @requirement estimate-creation/REQ-43.4
   */
  it('未保存の編集があっても諸経費を追加でき編集内容が保持されること (43.4)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    fireEvent.change(lineInput('item-a', 'ESTIMATE', '名称'), { target: { value: '編集済みA' } });
    expect(saveButton()).toBeEnabled();

    await addOverheadRow(user, '現場管理費', '70000');

    // 未保存を理由に抑止されない
    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });
    // それまでの未保存の編集はそのまま残る
    expect(lineInput('item-a', 'ESTIMATE', '名称').value).toBe('編集済みA');
    expect(screen.queryByTestId('estimate-transfer-guard')).not.toBeInTheDocument();
  });

  /**
   * 計算は書き込みを伴わない既存の計算経路（`POST /:id/calculate-overhead`）をそのまま使う。
   *
   * 追加をクライアント側へ移しても、自動計算までクライアントへ持ち込まない
   * （タスク 55.6 の第2項）。
   *
   * @requirement estimate-creation/REQ-8.3
   */
  it('諸経費の計算が既存の計算経路を呼び結果を単価に反映すること (8.3, 8.5)', async () => {
    vi.mocked(estimatesApi.calculateOverhead).mockResolvedValue({
      costType: 'SITE_MANAGEMENT',
      rate: '9.5',
      amount: '95000',
      formula: 'Kr = ...',
    } as unknown as Awaited<ReturnType<typeof estimatesApi.calculateOverhead>>);
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    const dialog = await openOverheadDialog();
    await user.selectOptions(within(dialog).getByLabelText('諸経費種別'), ['現場管理費']);
    fireEvent.change(within(dialog).getByLabelText('直接工事費'), {
      target: { value: '1000000' },
    });
    fireEvent.change(within(dialog).getByLabelText('純工事費'), { target: { value: '900000' } });
    await user.click(within(dialog).getByRole('button', { name: '計算' }));

    await waitFor(() => {
      expect(estimatesApi.calculateOverhead).toHaveBeenCalledWith(
        'est-001',
        expect.objectContaining({
          costType: 'SITE_MANAGEMENT',
          directCost: '1000000',
          pureConstructionCost: '900000',
          isRenovation: false,
        })
      );
    });

    // 計算結果が単価の入力欄へ入る（7.5/8.5/9.5 の上書き可能な値として）
    await waitFor(() => {
      expect((within(dialog).getByLabelText('計算金額') as HTMLInputElement).value).toBe('95000');
    });

    // 計算経路以外の呼び出しは発生しない（計算は書き込みを伴わない）
    expect(nonGetApiCalls()).toEqual(['calculateOverhead']);

    // 計算結果のまま追加すると、その金額が単価として明細に入る
    await user.click(within(dialog).getByRole('button', { name: '項目追加' }));
    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });
    expect(lineInput(addedKeys()[0]!, 'ESTIMATE', '単価').value).toBe('95000');
  });

  // ==========================================================================
  // 値引き行の追加（41.1, 41.2, 41.11）
  // ==========================================================================

  /**
   * ツールバーの「値引き行追加」がサーバーへ書き込まず、プリセット値の値引き行を
   * ルートレベル末尾へ追加し、未保存の変更として保存操作で確定する。
   *
   * @requirement estimate-creation/REQ-41.2
   */
  it('値引き行追加がプリセット値の行をルート末尾へ入れ保存で確定すること (41.1, 41.2, 41.11)', async () => {
    vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(savedResponse());
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: '値引き行追加' }));

    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });
    const key = addedKeys()[0]!;
    // ルートレベルの末尾（41.2）
    expect(rowKeys()).toEqual(['item-a', 'item-b', key]);
    expect(lineInput(key, 'ESTIMATE', '名称').value).toBe('値引き');
    expect(lineInput(key, 'ESTIMATE', '規格').value).toBe('');
    expect(lineInput(key, 'ESTIMATE', '単位').value).toBe('式');
    expect(lineInput(key, 'ESTIMATE', '数量').value).toBe('1');
    // 実行金額行・業者金額行を持たない（41.3）
    expect(within(rowOf(key)).queryByTestId('line-type-EXECUTION')).not.toBeInTheDocument();
    expect(within(rowOf(key)).queryByTestId('line-type-VENDOR')).not.toBeInTheDocument();

    // 追加の時点でサーバーへ書き込まない（49.3）
    expect(nonGetApiCalls()).toEqual([]);

    // 未保存の変更として扱い、保存操作で確定する（41.11）
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());
    await waitFor(() => {
      expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
    });
    const added = savePayload().items[2]!;
    expect(added.itemType).toBe('DISCOUNT');
    expect(added.lines).toHaveLength(1);
    expect(added.lines[0]!.name).toBe('値引き');
    expect(added.lines[0]!.unit).toBe('式');
    expect(added.lines[0]!.quantity).toBe('1');
  });

  /**
   * 値引き行の追加も直後に取り消せる（48.8, 49.8）。
   *
   * @requirement estimate-creation/REQ-48.8
   */
  it('値引き行追加を直後に取り消せること (48.8)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForItems();

    await user.click(screen.getByRole('button', { name: '値引き行追加' }));
    await waitFor(() => {
      expect(addedKeys()).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('undo-button'));

    await waitFor(() => {
      expect(addedKeys()).toHaveLength(0);
    });
    expect(saveButton()).toBeDisabled();
  });
});
