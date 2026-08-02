/**
 * @fileoverview NetAllocationDialog テスト
 *
 * Task 55.3: 案分ダイアログの入力元を編集中の明細へ変更
 *
 * Requirements (estimate-creation):
 * - 5.1: 業者と対象の業者金額行を指定した場合、案分対象として選択状態にする
 * - 5.2: 案分から除外する諸経費行を指定した場合、案分対象から除外する
 * - 5.3: NET金額を入力した場合、除外行以外の業者金額行を実行金額行に転記する
 * - 5.9: 未保存の新規行が案分対象に含まれる場合、その行も案分対象として扱う
 * - 18.4: 選択した業者の業者金額行一覧をチェックボックス付きで表示する
 * - 18.7: NET金額が入力された場合、各行の案分率と案分後金額のプレビューを表示する
 * - 18.10: 編集中の業者金額行（未保存の追加・編集を含む）を案分対象の一覧に表示する
 * - 31.1, 31.2: 受領見積書情報（合計金額・NET金額）を縦並びで表示する
 * - 33.1〜33.4: 選択済み案分対象行の合計金額を編集中の値に基づいて表示する
 * - 36.1: 対象業者を選択した場合、受領見積書のNET金額を自動設定する
 * - 36.2: 自動設定されたNET金額をユーザーが手動で変更可能とする
 * - 49.7: 計算対象に未保存の新規項目を含める
 *
 * Task 55.7: 受領見積書の取得が業者選択より遅れて解決した場合にも 36.1 が成立すること、
 * および常時マウント構成での起動ごとの初期化を追加で固定した。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetAllocationDialog } from '../../../components/estimate/NetAllocationDialog';
import type { EstimateItemHierarchyEdit } from '../../../hooks/useEstimateEditor';
import type { NetAllocationPayload } from '../../../domain/estimate/estimateEditReducer.types';

// apiClientをモック（49.3: 案分の実行でサーバーへ書き込まないことを固定する）
vi.mock('../../../api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// received-quotationsをモック
vi.mock('../../../api/received-quotations', () => ({
  getReceivedQuotationsByProject: vi.fn().mockResolvedValue([]),
}));

// 55.1 の計算関数が実際にプレビューへ使われていることを観測する。
// プレビューが独自の計算を持つと `allocateNet` が呼ばれず、この監視が落ちる。
vi.mock('../../../domain/estimate/estimateCalculations', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../domain/estimate/estimateCalculations')>();
  return { ...actual, allocateNet: vi.fn(actual.allocateNet) };
});

import { apiClient } from '../../../api/client';
import { getReceivedQuotationsByProject } from '../../../api/received-quotations';
import { allocateNet } from '../../../domain/estimate/estimateCalculations';

const mockApiPost = vi.mocked(apiClient.post);
const mockGetQuotations = vi.mocked(getReceivedQuotationsByProject);
const spiedAllocateNet = vi.mocked(allocateNet);

const createMockItems = (): EstimateItemHierarchyEdit[] => [
  {
    id: 'item-1',
    estimateId: 'est-1',
    parentId: null,
    displayOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    lines: [
      {
        id: 'line-e-1',
        estimateItemId: 'item-1',
        lineType: 'ESTIMATE',
        name: '外壁塗装',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '100000',
        amount: '100000',
        remarks: null,
      },
      {
        id: 'line-x-1',
        estimateItemId: 'item-1',
        lineType: 'EXECUTION',
        name: '外壁塗装',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '90000',
        amount: '90000',
        remarks: null,
      },
      {
        id: 'line-v-1',
        estimateItemId: 'item-1',
        lineType: 'VENDOR',
        name: '外壁塗装',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '80000',
        amount: '80000',
        remarks: null,
        sourceVendorName: '業者A',
      },
    ],
    children: [],
  },
  {
    id: 'item-2',
    estimateId: 'est-1',
    parentId: null,
    displayOrder: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    lines: [
      {
        id: 'line-e-2',
        estimateItemId: 'item-2',
        lineType: 'ESTIMATE',
        name: '防水工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '50000',
        amount: '50000',
        remarks: null,
      },
      {
        id: 'line-x-2',
        estimateItemId: 'item-2',
        lineType: 'EXECUTION',
        name: '防水工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '45000',
        amount: '45000',
        remarks: null,
      },
      {
        id: 'line-v-2',
        estimateItemId: 'item-2',
        lineType: 'VENDOR',
        name: '防水工事',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '40000',
        amount: '40000',
        remarks: null,
        sourceVendorName: '業者A',
      },
    ],
    children: [],
  },
];

/** 案分対象行の一覧（表示順） */
const targetRowKeys = (): string[] =>
  screen
    .getAllByTestId('allocation-target')
    .map((row) => row.getAttribute('data-allocation-key') ?? '');

/** プレビュー行の識別子（表示順） */
const previewRowKeys = (): string[] =>
  screen
    .getAllByTestId('allocation-preview-row')
    .map((row) => row.getAttribute('data-allocation-key') ?? '');

describe('NetAllocationDialog', () => {
  const onApply = vi.fn<(payload: NetAllocationPayload) => void>();
  const onClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    projectId: 'proj-1',
    items: createMockItems(),
    onClose,
    onApply,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuotations.mockResolvedValue([]);
  });

  it('isOpen=falseの場合は何も表示しない', () => {
    const { container } = render(<NetAllocationDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=trueの場合はダイアログが表示される (REQ-18.2)', () => {
    render(<NetAllocationDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('業者金額を実行金額に転記（NET金額案分）')).toBeInTheDocument();
  });

  it('対象業者のドロップダウンが表示される (REQ-18.3)', () => {
    render(<NetAllocationDialog {...defaultProps} />);
    const select = screen.getByLabelText('対象業者を選択');
    expect(select).toBeInTheDocument();
    expect(select.tagName.toLowerCase()).toBe('select');
  });

  it('業者名がドロップダウンに表示される', () => {
    render(<NetAllocationDialog {...defaultProps} />);
    const select = screen.getByLabelText('対象業者を選択');
    const options = within(select).getAllByRole('option');
    expect(options.length).toBe(2); // 「選択してください」+ 業者A
    expect(options[1]).toHaveTextContent('業者A');
  });

  it('業者選択後に業者金額行一覧が表示される (REQ-18.4)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    expect(screen.getByText('外壁塗装')).toBeInTheDocument();
    expect(screen.getByText('防水工事')).toBeInTheDocument();
    expect(screen.getByText('80,000円')).toBeInTheDocument();
    expect(screen.getByText('40,000円')).toBeInTheDocument();
  });

  it('チェックボックスで諸経費行を除外できる (REQ-18.5)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();

    // チェックを外す
    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();

    // 再度チェックする
    await user.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
  });

  it('NET金額入力フィールドが業者選択後に表示される (REQ-18.6)', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    // 業者未選択時はNET金額フィールドが表示されない
    expect(screen.queryByLabelText('NET金額')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

    expect(screen.getByLabelText('NET金額')).toBeInTheDocument();
  });

  it('不正なNET金額ではプレビューが表示されない', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
    await user.type(screen.getByLabelText('NET金額'), 'abc');

    expect(screen.queryByText('案分プレビュー')).not.toBeInTheDocument();
  });

  it('フォームが無効な場合は案分実行ボタンが無効', () => {
    render(<NetAllocationDialog {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: '案分実行' });
    expect(submitButton).toBeDisabled();
  });

  it('キャンセルボタンでonCloseが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<NetAllocationDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('業者金額がないVENDOR行は一覧に表示されない', () => {
    const items: EstimateItemHierarchyEdit[] = [
      {
        id: 'item-1',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [
          {
            id: 'line-v-1',
            estimateItemId: 'item-1',
            lineType: 'VENDOR',
            name: '金額なし業者',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: null,
            remarks: null,
            sourceVendorName: '業者B',
          },
        ],
        children: [],
      },
    ];

    render(<NetAllocationDialog {...defaultProps} items={items} />);

    // 業者Bは金額がないので選択肢に表示されない
    const select = screen.getByLabelText('対象業者を選択');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(1); // 「選択してください」のみ
  });

  it('子項目のVENDOR行も収集される', () => {
    const items: EstimateItemHierarchyEdit[] = [
      {
        id: 'item-parent',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [],
        children: [
          {
            id: 'item-child',
            estimateId: 'est-1',
            parentId: 'item-parent',
            displayOrder: 0,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            lines: [
              {
                id: 'line-e-child',
                estimateItemId: 'item-child',
                lineType: 'ESTIMATE',
                name: '子項目工事',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: null,
                amount: null,
                remarks: null,
              },
              {
                id: 'line-x-child',
                estimateItemId: 'item-child',
                lineType: 'EXECUTION',
                name: '子項目工事',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: null,
                amount: null,
                remarks: null,
              },
              {
                id: 'line-v-child',
                estimateItemId: 'item-child',
                lineType: 'VENDOR',
                name: '子項目工事',
                specification: null,
                unit: '式',
                quantity: '1',
                unitPrice: '30000',
                amount: '30000',
                remarks: null,
                sourceVendorName: '業者C',
              },
            ],
            children: [],
          },
        ],
      },
    ];

    render(<NetAllocationDialog {...defaultProps} items={items} />);

    const select = screen.getByLabelText('対象業者を選択');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(2); // 「選択してください」+ 業者C
  });

  // ==========================================================================
  // 55.3: 入力元は編集中の明細・識別子は一時識別子を含む項目キー
  // ==========================================================================
  describe('編集中の明細を入力元とする案分対象 (5.9, 18.10, 49.7)', () => {
    /** 未保存の新規行（`tmp-` 接頭辞の一時識別子）を含む編集中ツリー */
    const createItemsWithUnsavedRow = (): EstimateItemHierarchyEdit[] => [
      ...createMockItems(),
      {
        id: 'tmp-7',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 2,
        createdAt: '',
        updatedAt: '',
        lines: [
          {
            id: 'tmp-7::ESTIMATE',
            estimateItemId: 'tmp-7',
            lineType: 'ESTIMATE',
            name: '未保存の追加工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: null,
            amount: null,
            remarks: null,
          },
          {
            id: 'tmp-7::EXECUTION',
            estimateItemId: 'tmp-7',
            lineType: 'EXECUTION',
            name: '未保存の追加工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: null,
            amount: null,
            remarks: null,
          },
          {
            id: 'tmp-7::VENDOR',
            estimateItemId: 'tmp-7',
            lineType: 'VENDOR',
            name: '未保存の追加工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '30000',
            amount: '30000',
            remarks: null,
            sourceVendorName: '業者A',
          },
        ],
        children: [],
      },
    ];

    /** @requirement estimate-creation/REQ-18.10 */
    it('未保存の新規行が案分対象の一覧に一時識別子で現れること (5.9, 18.10)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithUnsavedRow()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      expect(targetRowKeys()).toEqual(['item-1', 'item-2', 'tmp-7']);
      expect(screen.getByText('未保存の追加工事')).toBeInTheDocument();
    });

    /** @requirement estimate-creation/REQ-49.7 */
    it('案分実行で未保存の新規行の一時識別子が対象キーに含まれること (5.9, 49.7)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithUnsavedRow()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '150000');
      await user.click(screen.getByRole('button', { name: '案分実行' }));

      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onApply).toHaveBeenCalledWith({
        targetKeys: ['item-1', 'item-2', 'tmp-7'],
        excludeKeys: [],
        netAmount: '150000',
      });
      expect(onClose).toHaveBeenCalled();
    });

    /** @requirement estimate-creation/REQ-5.1 */
    it('未保存の新規行がプレビューにも現れること (5.1, 18.7)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithUnsavedRow()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '150000');

      expect(previewRowKeys()).toEqual(['item-1', 'item-2', 'tmp-7']);
    });

    /** @requirement estimate-creation/REQ-33.4 */
    it('合計金額が未保存の新規行の業者金額を含むこと (33.1, 33.4)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithUnsavedRow()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 80,000 + 40,000 + 30,000（未保存分）
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('150,000円');
      });
    });

    /**
     * 実行金額行を持たない項目は対象に含めない（適用側との選定一致）
     *
     * 適用側 `estimateEditReducer.applyNetAllocationAction` は実行金額行を持たない項目を
     * スキップするため、ダイアログが対象に含めると**案分の分母だけがプレビューで大きくなり**、
     * 除外されなかった他の行の案分後金額までプレビューと適用でずれる。
     * 5.8「プレビューに表示した案分後金額と実際に反映される金額を一致させる」に直接違反するため、
     * 一覧・合計・プレビューの3点すべてを固定する。
     */
    const createItemsWithoutExecutionLine = (): EstimateItemHierarchyEdit[] => [
      ...createMockItems(),
      {
        id: 'item-no-exec',
        estimateId: 'est-1',
        parentId: null,
        displayOrder: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lines: [
          {
            id: 'line-e-no-exec',
            estimateItemId: 'item-no-exec',
            lineType: 'ESTIMATE',
            name: '実行金額行なし工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '60000',
            amount: '60000',
            remarks: null,
          },
          {
            id: 'line-v-no-exec',
            estimateItemId: 'item-no-exec',
            lineType: 'VENDOR',
            name: '実行金額行なし工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '60000',
            amount: '60000',
            remarks: null,
            sourceVendorName: '業者A',
          },
        ],
        children: [],
      },
    ];

    /** @requirement estimate-creation/REQ-18.10 */
    it('実行金額行を持たない項目は案分対象の一覧に現れないこと (18.10)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithoutExecutionLine()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      expect(targetRowKeys()).toEqual(['item-1', 'item-2']);
      expect(screen.queryByText('実行金額行なし工事')).not.toBeInTheDocument();
    });

    /** @requirement estimate-creation/REQ-33.4 */
    it('実行金額行を持たない項目の業者金額を合計に算入しないこと (33.4)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithoutExecutionLine()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 80,000 + 40,000。60,000 を足すと 180,000 になる
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('120,000円');
      });
    });

    /** @requirement estimate-creation/REQ-5.8 */
    it('実行金額行を持たない項目が案分の分母に混ざらないこと (5.8, 18.7)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} items={createItemsWithoutExecutionLine()} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '100000');

      // 分母は 120,000（80,000 : 40,000 = 2 : 1）。
      // 60,000 が混ざると分母 180,000 となり 44.44% / 44,444円・22.22% / 22,222円 に変わる。
      // 案分後金額の検証を先に置き、行数の一致だけで守られている状態にしない。
      const rows = screen.getAllByTestId('allocation-preview-row');
      expect(within(rows[0]!).getByTestId('preview-ratio')).toHaveTextContent('66.67%');
      expect(within(rows[0]!).getByTestId('preview-allocated')).toHaveTextContent('66,667円');
      expect(within(rows[1]!).getByTestId('preview-ratio')).toHaveTextContent('33.33%');
      expect(within(rows[1]!).getByTestId('preview-allocated')).toHaveTextContent('33,333円');
      expect(previewRowKeys()).toEqual(['item-1', 'item-2']);
    });
  });

  // ==========================================================================
  // 55.3: プレビューと適用が同一の計算関数を用いる
  // ==========================================================================
  describe('プレビューの計算 (5.4, 5.5, 18.7)', () => {
    /** @requirement estimate-creation/REQ-18.7 */
    it('プレビューが estimateCalculations.allocateNet の結果を表示すること', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '100000');

      expect(screen.getByText('案分プレビュー')).toBeInTheDocument();

      // 単一実装の呼び出しであること（プレビューが独自計算を持つと呼ばれない）
      expect(spiedAllocateNet).toHaveBeenCalled();
      const calls = spiedAllocateNet.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      expect(lastCall![0].map((row) => row.key)).toEqual(['item-1', 'item-2']);
      expect(lastCall![0].map((row) => row.amount?.toString())).toEqual(['80000', '40000']);
      expect(lastCall![0].map((row) => row.quantity?.toString())).toEqual(['1', '1']);
      expect(lastCall![1].toString()).toBe('100000');
      expect(Array.from(lastCall![2])).toEqual([]);

      // 固定値（80,000 : 40,000 = 2 : 1 の案分。丸めは小数第1位で四捨五入）
      const rows = screen.getAllByTestId('allocation-preview-row');
      expect(within(rows[0]!).getByTestId('preview-ratio')).toHaveTextContent('66.67%');
      expect(within(rows[0]!).getByTestId('preview-allocated')).toHaveTextContent('66,667円');
      expect(within(rows[1]!).getByTestId('preview-ratio')).toHaveTextContent('33.33%');
      expect(within(rows[1]!).getByTestId('preview-allocated')).toHaveTextContent('33,333円');
    });

    /** @requirement estimate-creation/REQ-5.2 */
    it('除外した行がプレビューから外れ残りの比率が再計算されること (5.2, 18.5)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '100000');
      await user.click(screen.getAllByRole('checkbox')[0]!);

      expect(previewRowKeys()).toEqual(['item-2']);
      const rows = screen.getAllByTestId('allocation-preview-row');
      expect(within(rows[0]!).getByTestId('preview-ratio')).toHaveTextContent('100%');
      expect(within(rows[0]!).getByTestId('preview-allocated')).toHaveTextContent('100,000円');
    });
  });

  // ==========================================================================
  // 55.3: 案分実行は編集状態への反映（サーバーへ書き込まない）
  // ==========================================================================
  describe('案分実行 (5.3, 18.8, 49.3)', () => {
    /** @requirement estimate-creation/REQ-18.8 */
    it('案分実行で対象キーと除外キーが onApply へ渡ること (5.1, 5.2, 18.8)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.click(screen.getAllByRole('checkbox')[0]!);
      await user.type(screen.getByLabelText('NET金額'), '100000');
      await user.click(screen.getByRole('button', { name: '案分実行' }));

      expect(onApply).toHaveBeenCalledWith({
        targetKeys: ['item-1', 'item-2'],
        excludeKeys: ['item-1'],
        netAmount: '100000',
      });
    });

    /** @requirement estimate-creation/REQ-49.3 */
    it('案分実行がサーバーへ書き込まないこと (49.3)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '100000');
      await user.click(screen.getByRole('button', { name: '案分実行' }));

      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 41.9 / 55.4: 値引き行・注記行は案分の対象外
  // ==========================================================================
  describe('値引き行・注記行の除外 (41.9, 55.4)', () => {
    it('値引き行は業者金額行を持っていても案分対象に現れないこと (41.9)', async () => {
      const user = userEvent.setup();
      const items: EstimateItemHierarchyEdit[] = [
        ...createMockItems(),
        {
          id: 'item-discount',
          estimateId: 'est-1',
          parentId: null,
          displayOrder: 2,
          itemType: 'DISCOUNT',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          lines: [
            {
              id: 'line-e-d',
              estimateItemId: 'item-discount',
              lineType: 'ESTIMATE',
              name: '値引き',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '-10000',
              amount: '-10000',
              remarks: null,
            },
            {
              id: 'line-x-d',
              estimateItemId: 'item-discount',
              lineType: 'EXECUTION',
              name: '値引き',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '-10000',
              amount: '-10000',
              remarks: null,
            },
            {
              id: 'line-v-d',
              estimateItemId: 'item-discount',
              lineType: 'VENDOR',
              name: '値引き',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '-10000',
              amount: '-10000',
              remarks: null,
              sourceVendorName: '業者A',
            },
          ],
          children: [],
        },
      ];

      render(<NetAllocationDialog {...defaultProps} items={items} />);
      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      expect(targetRowKeys()).toEqual(['item-1', 'item-2']);
      // 合計にも算入されない（80,000 + 40,000）
      expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('120,000円');
    });
  });

  // ==========================================================================
  // REQ-31: 受領見積書情報表示
  // ==========================================================================
  describe('受領見積書情報表示 (REQ-31)', () => {
    it('受領見積書の合計金額が業者選択後に表示されること (REQ-31.1)', async () => {
      const user = userEvent.setup();

      // 受領見積書のモックデータ
      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 100000,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-1',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '業者A外壁',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 80000,
              amount: 80000,
              remarks: null,
            },
            {
              id: 'li-2',
              receivedQuotationId: 'rq-1',
              sortOrder: 1,
              customCategory: null,
              workType: null,
              name: '業者A防水',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 40000,
              amount: 40000,
              remarks: null,
            },
          ],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ]);

      // VENDOR行にsourceReceivedQuotationLineItemIdを設定
      const itemsWithSource = createMockItems().map((item) => ({
        ...item,
        lines: item.lines.map((line) => {
          if (line.id === 'line-v-1') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-1' };
          }
          if (line.id === 'line-v-2') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-2' };
          }
          return line;
        }),
      }));

      render(<NetAllocationDialog {...defaultProps} items={itemsWithSource} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 受領見積書情報セクションが表示されるまで待機
      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });

      expect(screen.getByText('受領見積書合計金額')).toBeInTheDocument();
    });

    it('NET金額が設定されている場合はNET金額が表示されること (REQ-31.2)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 70000,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-1',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '業者A外壁',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 80000,
              amount: 80000,
              remarks: null,
            },
          ],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ]);

      const itemsWithSource = createMockItems().map((item) => ({
        ...item,
        lines: item.lines.map((line) => {
          if (line.id === 'line-v-1') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-1' };
          }
          return line;
        }),
      }));

      render(<NetAllocationDialog {...defaultProps} items={itemsWithSource} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });

      // NET金額の表示ラベル
      expect(screen.getByText(/NET金額（受領見積書入力値）/)).toBeInTheDocument();
    });

    it('受領見積書情報セクションが縦並びレイアウトで表示されること (REQ-31.2 update)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 70000,
          lineItems: [
            {
              id: 'li-1',
              receivedQuotationId: 'rq-1',
              sortOrder: 0,
              customCategory: null,
              workType: null,
              name: '業者A外壁',
              specification: null,
              unit: '式',
              quantity: 1,
              unitPrice: 80000,
              amount: 80000,
              remarks: null,
            },
          ],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ]);

      const itemsWithSource = createMockItems().map((item) => ({
        ...item,
        lines: item.lines.map((line) => {
          if (line.id === 'line-v-1') {
            return { ...line, sourceReceivedQuotationLineItemId: 'li-1' };
          }
          return line;
        }),
      }));

      render(<NetAllocationDialog {...defaultProps} items={itemsWithSource} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });

      // 受領見積書情報セクションのグリッドが縦並び（1fr）であること
      const infoSection = screen.getByTestId('quotation-info-grid');
      expect(infoSection).toBeInTheDocument();
      expect(infoSection.style.gridTemplateColumns).toBe('1fr');
    });
  });

  // ==========================================================================
  // REQ-36: NET金額の自動設定
  // ==========================================================================
  describe('NET金額の自動設定 (REQ-36)', () => {
    it('業者選択時にNET金額が自動設定されること (REQ-36.1)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        const netInput = screen.getByLabelText('NET金額') as HTMLInputElement;
        expect(netInput.value).toBe('95000');
      });
    });

    it('自動設定されたNET金額を手動変更できること (REQ-36.2)', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        const netInput = screen.getByLabelText('NET金額') as HTMLInputElement;
        expect(netInput.value).toBe('95000');
      });

      // 手動で変更
      const netInput = screen.getByLabelText('NET金額');
      await user.clear(netInput);
      await user.type(netInput, '88000');
      expect((netInput as HTMLInputElement).value).toBe('88000');
    });

    /**
     * 受領見積書の取得が業者選択より遅れて解決しても自動設定されること (REQ-36.1)
     *
     * 業者の選択肢は編集中の明細（業者金額行の業者名）から即座に作られるのに対し、
     * NET金額の自動設定は受領見積書一覧の非同期取得を待つ。取得より先に業者を
     * 選んだ場合に再適用する経路が無いと、NET金額欄は空のままになる。
     * ダイアログは常時マウントで `selectedVendor` を保持するため、同じ業者を
     * 選び直しても `onChange` は再発火せず、業者が1社の場合は回復手段が無い。
     *
     * 他のテストが `mockResolvedValue` で事前解決しているのに対し、ここでは
     * 意図的に取得を保留し、業者選択の**後**に解決させる。
     */
    it('業者選択の後に受領見積書の取得が解決してもNET金額が自動設定されること (REQ-36.1)', async () => {
      const user = userEvent.setup();

      let resolveQuotations: (value: unknown) => void = () => {};
      mockGetQuotations.mockReturnValue(
        new Promise((resolve) => {
          resolveQuotations = resolve;
        }) as never
      );

      render(<NetAllocationDialog {...defaultProps} />);

      // 取得が未解決のまま業者を選ぶ
      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      expect((screen.getByLabelText('NET金額') as HTMLInputElement).value).toBe('');

      // 取得が解決する
      resolveQuotations([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        },
      ]);

      await waitFor(() => {
        expect((screen.getByLabelText('NET金額') as HTMLInputElement).value).toBe('95000');
      });
    });

    /**
     * 遅れて解決した取得が手入力のNET金額を上書きしないこと (REQ-36.2)
     *
     * 自動設定を「取得の解決」でも駆動する以上、利用者が先に手入力していた値を
     * 踏み潰さないことを同時に固定する。空欄かどうかで判定すると
     * 「意図的に空にした」操作も握り潰されるため、業者ごとに自動設定を
     * 適用済みかを追跡する必要がある。
     */
    it('業者選択後に手入力したNET金額を、遅れて解決した受領見積書が上書きしないこと (REQ-36.2)', async () => {
      const user = userEvent.setup();

      let resolveQuotations: (value: unknown) => void = () => {};
      mockGetQuotations.mockReturnValue(
        new Promise((resolve) => {
          resolveQuotations = resolve;
        }) as never
      );

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await user.type(screen.getByLabelText('NET金額'), '77777');

      resolveQuotations([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        },
      ]);

      // 受領見積書情報の表示まで進んでも手入力値が残っていること
      await waitFor(() => {
        expect(screen.getByText('受領見積書情報')).toBeInTheDocument();
      });
      expect((screen.getByLabelText('NET金額') as HTMLInputElement).value).toBe('77777');
    });

    /**
     * ダイアログを閉じて開き直すと選択が初期化されること
     *
     * ダイアログは常時マウント（`EstimateDetailPage` が無条件に描画し、
     * `isOpen=false` で `null` を返す）なので、明示的に初期化しないと
     * 前回の業者選択とNET金額が次回の起動へ漏れる。
     */
    it('閉じて開き直すと対象業者とNET金額が初期化されること', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: 95000,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      const { rerender } = render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');
      await waitFor(() => {
        expect((screen.getByLabelText('NET金額') as HTMLInputElement).value).toBe('95000');
      });

      rerender(<NetAllocationDialog {...defaultProps} isOpen={false} />);
      rerender(<NetAllocationDialog {...defaultProps} isOpen />);

      expect((screen.getByLabelText('対象業者を選択') as HTMLSelectElement).value).toBe('');
      expect(screen.queryByLabelText('NET金額')).not.toBeInTheDocument();
    });

    it('NET金額がnullの場合は自動設定をスキップすること', async () => {
      const user = userEvent.setup();

      mockGetQuotations.mockResolvedValue([
        {
          id: 'rq-1',
          estimateRequestId: 'er-1',
          name: '業者A見積',
          submittedAt: new Date('2025-01-01'),
          fileName: null,
          fileMimeType: null,
          fileSize: null,
          totalAmount: 120000,
          netAmount: null,
          lineItems: [],
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          tradingPartnerName: '業者A',
        } as never,
      ]);

      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      await waitFor(() => {
        const netInput = screen.getByLabelText('NET金額') as HTMLInputElement;
        expect(netInput.value).toBe('');
      });
    });
  });

  // ==========================================================================
  // REQ-33: 案分対象行の合計金額表示
  // ==========================================================================
  /**
   * @requirement estimate-creation/REQ-33.1
   * @requirement estimate-creation/REQ-33.2
   * @requirement estimate-creation/REQ-33.3
   */
  describe('案分対象行の合計金額表示 (REQ-33)', () => {
    /** @requirement estimate-creation/REQ-33.1 */
    it('選択済み案分対象行の合計金額が表示されること (REQ-33.1)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 合計金額行が表示されること（80000 + 40000 = 120000）
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toBeInTheDocument();
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('120,000円');
      });
    });

    /** @requirement estimate-creation/REQ-33.2 */
    it('チェックボックスの切替で合計金額が再計算されること (REQ-33.2)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 初期状態: 全チェックON = 120,000円
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('120,000円');
      });

      // 最初の行のチェックを外す（80000を除外）
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]!);

      // 40,000円のみ
      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('40,000円');
      });
    });

    /** @requirement estimate-creation/REQ-33.3 */
    it('全チェックOFF時に0円が表示されること (REQ-33.3)', async () => {
      const user = userEvent.setup();
      render(<NetAllocationDialog {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText('対象業者を選択'), '業者A');

      // 全チェックを外す
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]!);
      await user.click(checkboxes[1]!);

      await waitFor(() => {
        expect(screen.getByTestId('selected-lines-total')).toHaveTextContent('0円');
      });
    });
  });
});
