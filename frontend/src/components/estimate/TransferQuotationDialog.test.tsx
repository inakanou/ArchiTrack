/**
 * @fileoverview TransferQuotationDialog テスト
 *
 * Task 55.5: 受領見積書転記ダイアログの入力元を編集中の明細へ変更
 *
 * 転記先の選択肢は**編集中の明細ツリー**（未保存の新規項目を含む）から構成し、
 * 転記は `onApply` で編集状態への遷移へ渡す。受領見積書の一覧・明細の取得のみ
 * 従来どおりサーバーから行う。
 *
 * Requirements (estimate-creation):
 * - 4.1, 4.2: 転記先の指定有無で子項目として作るか新規項目として作るかを切り替える
 * - 4.3: 名称・規格・単位・数量・単価を転記対象とする
 * - 4.4: 選択した明細行はそれぞれ別の見積項目行の業者金額行として反映する
 * - 4.5: 見積依頼機能で登録された受領見積書のみを転記元として選択可能とする
 * - 4.6, 49.1, 49.3: 転記結果を未保存の変更として反映し、サーバーへ書き込まない
 * - 17.1, 17.2: プロジェクトに紐付く受領見積書一覧をドロップダウンに表示する
 * - 30.1, 30.2, 30.3, 30.4: 転記先の選択肢と未保存の新規項目の取り扱い
 * - 35.1, 35.2, 35.3: 業者名と金額の表示、明細行のデフォルト全選択
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferQuotationDialog } from './TransferQuotationDialog';
import * as receivedQuotationsApi from '../../api/received-quotations';
import * as estimatesApi from '../../api/estimates';
import {
  createInitialEstimateEditState,
  estimateEditReducer,
} from '../../domain/estimate/estimateEditReducer';
import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  QuotationTransferPayload,
} from '../../domain/estimate/estimateEditReducer.types';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';

vi.mock('../../api/received-quotations');
vi.mock('../../api/estimates');

/**
 * 見積書APIの関数が一つも呼ばれていないことを確かめる（49.3）
 *
 * かつては撤去対象の `transferFromQuotation` を名指しで検証していたが、
 * 関数そのものが消えた（Task 55.7）ため名指しでは書けない。モジュール全体の
 * 呼び出しゼロで固定することで、将来どの関数が足されても転記経路から
 * 呼ばれれば落ちる。本ダイアログは受領見積書API（別モジュール）しか使わない。
 */
const expectNoEstimateApiCall = (): void => {
  const called = Object.entries(estimatesApi)
    .filter(([, value]) => vi.isMockFunction(value) && value.mock.calls.length > 0)
    .map(([name]) => name);
  expect(called).toEqual([]);
};

const mockReceivedQuotations = [
  {
    id: 'rq-001',
    estimateRequestId: 'er-001',
    name: '見積書A',
    submittedAt: new Date('2024-01-10'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    totalAmount: 500000,
    netAmount: null,
    tradingPartnerName: '業者A',
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
        quantity: 1,
        unitPrice: 100000,
        amount: 100000,
        remarks: '転記対象外の備考',
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
        quantity: 50,
        unitPrice: 8000,
        amount: 400000,
        remarks: null,
      },
    ],
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  },
  {
    id: 'rq-002',
    estimateRequestId: 'er-001',
    name: '見積書B',
    submittedAt: new Date('2024-01-11'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    totalAmount: 450000,
    netAmount: null,
    tradingPartnerName: '業者B',
    lineItems: [
      {
        id: 'rql-003',
        receivedQuotationId: 'rq-002',
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '仮設工事',
        specification: null,
        unit: '式',
        quantity: 1,
        unitPrice: 90000,
        amount: 90000,
        remarks: null,
      },
    ],
    createdAt: new Date('2024-01-11'),
    updatedAt: new Date('2024-01-11'),
  },
] as unknown as receivedQuotationsApi.ReceivedQuotationInfo[];

// ============================================================================
// 編集中の明細ツリー（表示用）とドメイン表現のフィクスチャ
//
// 「ダイアログが転記先として出す選択肢」と「reducer が親として受け付ける項目」の
// 一致を検証するため、同じ構造を表示用（`EstimateItemHierarchyEdit`）と
// ドメイン用（`EditableItem`）の両方で組み立てる。
// ============================================================================

const LINE_TYPES = ['ESTIMATE', 'EXECUTION', 'VENDOR'] as const;

interface Fixture {
  readonly id: string;
  readonly name: string;
  readonly itemType: EstimateEditItemType;
  readonly children: readonly Fixture[];
}

const std = (id: string, name: string, children: readonly Fixture[] = []): Fixture => ({
  id,
  name,
  itemType: 'STANDARD',
  children,
});

/**
 * 編集中の明細（未保存の新規項目 `tmp-*`・値引き行・注記行を含む / 30.4, 41.3）
 */
const FIXTURES: readonly Fixture[] = [
  std('item-1', '外壁塗装', [std('item-1-1', '下地処理')]),
  std('tmp-9', '未保存の新規項目'),
  { id: 'item-d', name: '値引き', itemType: 'DISCOUNT', children: [] },
  { id: 'item-n', name: '注記', itemType: 'NOTE', children: [] },
];

function toViewItems(fixtures: readonly Fixture[]): EstimateItemHierarchyEdit[] {
  return fixtures.map((fixture) => ({
    id: fixture.id,
    estimateId: 'est-001',
    parentId: null,
    displayOrder: 0,
    itemType: fixture.itemType,
    lines: (fixture.itemType === 'STANDARD' ? LINE_TYPES : (['ESTIMATE'] as const)).map(
      (lineType) => ({
        id: `${fixture.id}-${lineType}`,
        estimateItemId: fixture.id,
        lineType,
        name: lineType === 'ESTIMATE' ? fixture.name : null,
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
        sourceReceivedQuotationLineItemId: null,
        sourceVendorName: null,
      })
    ),
    children: toViewItems(fixture.children),
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  }));
}

function toDomainItems(fixtures: readonly Fixture[]): EditableItem[] {
  return fixtures.map((fixture) => {
    const temporary = fixture.id.startsWith('tmp-');
    return {
      id: temporary ? null : fixture.id,
      tempId: temporary ? (fixture.id as EditableItem['tempId']) : null,
      itemType: fixture.itemType,
      lines: (fixture.itemType === 'STANDARD' ? LINE_TYPES : (['ESTIMATE'] as const)).map(
        (lineType): EditableLine => ({
          id: null,
          lineType,
          name: lineType === 'ESTIMATE' ? fixture.name : null,
          specification: null,
          unit: null,
          quantity: null,
          unitPrice: null,
          amount: null,
          remarks: null,
          sourceVendorName: null,
        })
      ),
      children: toDomainItems(fixture.children),
    };
  });
}

const mockEstimateItems = toViewItems(FIXTURES);

describe('TransferQuotationDialog', () => {
  const onApply = vi.fn<(payload: QuotationTransferPayload) => void>();
  const onClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    projectId: 'proj-001',
    items: mockEstimateItems,
    onClose,
    onApply,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(receivedQuotationsApi.getReceivedQuotationsByProject).mockResolvedValue(
      mockReceivedQuotations
    );
  });

  const waitForLoaded = async (): Promise<void> => {
    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  };

  const selectQuotation = async (
    user: ReturnType<typeof userEvent.setup>,
    quotationId: string
  ): Promise<void> => {
    await user.selectOptions(screen.getByLabelText('受領見積書を選択'), quotationId);
  };

  const lastPayload = (): QuotationTransferPayload => {
    const call = onApply.mock.calls[onApply.mock.calls.length - 1];
    if (call === undefined) {
      throw new Error('onApply が呼ばれていません');
    }
    return call[0];
  };

  it('isOpen=false の場合、ダイアログが表示されない', () => {
    render(<TransferQuotationDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-17.1 */
  /**
   * @requirement estimate-creation/REQ-4.5 見積依頼機能で登録された受領見積書のみを転記元として選択可能とする
   */
  it('プロジェクトに紐付く受領見積書一覧をサーバーから取得して表示する (4.5, 17.1, 17.2)', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    expect(receivedQuotationsApi.getReceivedQuotationsByProject).toHaveBeenCalledWith('proj-001');
    const options = within(screen.getByLabelText('受領見積書を選択')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      '選択してください',
      '業者A - 500,000円',
      '業者B - 450,000円',
    ]);
  });

  /** @requirement estimate-creation/REQ-35.3 */
  it('受領見積書を選ぶと明細行がすべてチェック済みで表示される (35.3)', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-001');

    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    expect(screen.getByTestId('line-checkbox-rql-002')).toBeChecked();
  });

  // ==========================================================================
  // 転記先の選択肢（30.1, 30.2, 30.4, 41.3）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-30.4 */
  it('転記先の選択肢を編集中の明細から構成し未保存の新規項目も含める (30.1, 30.2, 30.4)', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    const options = within(screen.getByLabelText('転記先見積項目')).getAllByRole('option');

    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual([
      '',
      'item-1',
      'item-1-1',
      'tmp-9',
    ]);
    expect(options[0]).toHaveTextContent('新規項目として作成');
    expect(options[1]).toHaveTextContent('外壁塗装 の子項目として作成');
    // 未保存の新規項目は一時識別子で選べる（30.4）
    expect(options[3]).toHaveTextContent('未保存の新規項目 の子項目として作成');
  });

  it('子項目はインデントで階層を区別する (30.2)', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    const options = within(screen.getByLabelText('転記先見積項目')).getAllByRole('option');
    const leading = (option: HTMLElement): number => {
      const text = option.textContent ?? '';
      return text.length - text.trimStart().length;
    };

    expect(leading(options[2]!)).toBeGreaterThan(leading(options[1]!));
  });

  /**
   * 55.5 の決定的な不変条件。
   *
   * ダイアログが出す転記先の選択肢は、reducer の `applyQuotationTransfer` が
   * **親として受け付ける項目と完全に一致**しなければならない。一致しないと、
   * ユーザーが選べる転記先を選んだのに転記が反映されない（選択した明細行が
   * 黙って消える）。値引き行・注記行は子を持てない（41.3）ため親になれない。
   *
   * 選択肢を1つずつ実物の reducer へ通し、転記が反映されることで一致を示す。
   * 「反映されること」を先に確かめてから選択肢の集合を確かめる順序にしてある。
   * 逆順にすると、選択肢の集合の不一致が先に落ちて
   * 「選べるのに転記が消える」という要件違反そのものが報告されない。
   */
  /** @requirement estimate-creation/REQ-30.3 */
  it('転記先の選択肢はすべて reducer が親として受け付ける項目であること (30.3, 41.3)', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    const values = within(screen.getByLabelText('転記先見積項目'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    const initial = createInitialEstimateEditState(toDomainItems(FIXTURES));
    for (const value of values) {
      const after = estimateEditReducer(initial, {
        type: 'applyQuotationTransfer',
        payload: {
          parentKey: value === '' ? null : value,
          vendorName: '業者A',
          lines: [
            { name: '仮設工事', specification: null, unit: '式', quantity: '1', unitPrice: '100' },
          ],
        },
      });
      expect({ value, applied: after.isDirty, error: after.lastError }).toEqual({
        value,
        applied: true,
        error: null,
      });
    }

    // 逆向き: 親になれない項目は選択肢に出さない
    expect(values).not.toContain('item-d');
    expect(values).not.toContain('item-n');
  });

  // ==========================================================================
  // 転記の実行（4.1〜4.4, 4.6, 49.3）
  // ==========================================================================

  /** @requirement estimate-creation/REQ-4.3 */
  it('転記先未指定で選択した明細行を編集状態への反映として渡す (4.2, 4.3, 4.4, 4.6)', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });

    await user.click(screen.getByRole('button', { name: '転記' }));

    expect(lastPayload()).toEqual({
      parentKey: null,
      vendorName: '業者A',
      lines: [
        {
          name: '仮設工事',
          specification: 'A規格',
          unit: '式',
          quantity: '1',
          unitPrice: '100000',
        },
        {
          name: '土工事',
          specification: 'B規格',
          unit: 'm3',
          quantity: '50',
          unitPrice: '8000',
        },
      ],
    });
    expect(onClose).toHaveBeenCalled();
  });

  /** @requirement estimate-creation/REQ-30.3 */
  it('転記先を選ぶとその項目キーを親として渡す (4.1, 30.3, 30.4)', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-002');
    await user.selectOptions(screen.getByLabelText('転記先見積項目'), 'tmp-9');
    await user.click(screen.getByRole('button', { name: '転記' }));

    expect(lastPayload().parentKey).toBe('tmp-9');
    expect(lastPayload().vendorName).toBe('業者B');
  });

  it('チェックを外した明細行は転記しない (4.4)', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    await user.click(screen.getByTestId('line-checkbox-rql-001'));

    await user.click(screen.getByRole('button', { name: '転記' }));

    expect(lastPayload().lines.map((entry) => entry.name)).toEqual(['土工事']);
  });

  /**
   * 選択の順序ではなく受領見積書の並び順で渡す。
   * 並び順が入れ替わると、作られる見積項目の並びが受領見積書と食い違う。
   */
  it('明細行を受領見積書の並び順で渡す (4.4)', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    // 先頭行を外してから付け直す（選択順は 土工事 → 仮設工事 になる）
    await user.click(screen.getByTestId('line-checkbox-rql-001'));
    await user.click(screen.getByTestId('line-checkbox-rql-001'));

    await user.click(screen.getByRole('button', { name: '転記' }));

    expect(lastPayload().lines.map((entry) => entry.name)).toEqual(['仮設工事', '土工事']);
  });

  /** @requirement estimate-creation/REQ-49.3 */
  it('転記の実行でサーバーへ書き込まない (4.6, 49.1, 49.3)', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-001');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-001')).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: '転記' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expectNoEstimateApiCall();
  });

  it('受領見積書が未選択の場合は転記ボタンが無効', async () => {
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    expect(screen.getByRole('button', { name: '転記' })).toBeDisabled();
  });

  it('明細行のチェックをすべて外すと転記ボタンが無効', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await selectQuotation(user, 'rq-002');
    await waitFor(() => {
      expect(screen.getByTestId('line-checkbox-rql-003')).toBeChecked();
    });
    await user.click(screen.getByTestId('line-checkbox-rql-003'));

    expect(screen.getByRole('button', { name: '転記' })).toBeDisabled();
  });

  it('キャンセルボタンでダイアログを閉じる', async () => {
    const user = userEvent.setup();
    render(<TransferQuotationDialog {...defaultProps} />);
    await waitForLoaded();

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('受領見積書取得中はローディングを表示する', () => {
    vi.mocked(receivedQuotationsApi.getReceivedQuotationsByProject).mockImplementation(
      () => new Promise(() => {})
    );

    render(<TransferQuotationDialog {...defaultProps} />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });
});
