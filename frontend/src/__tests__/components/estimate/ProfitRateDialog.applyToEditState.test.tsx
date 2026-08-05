/**
 * @fileoverview ProfitRateDialog と編集状態の結線テスト（実物のフックで検証）
 *
 * Task 55.4: 利益率ダイアログの入力元を編集中の明細へ変更
 *
 * ダイアログ単体テストは `onApply` に渡るペイロードまでしか見ない。本ファイルは
 * 実物の `useEstimateEditor`（＝ 55.2 の `applyProfitRate` 遷移）へ繋ぎ、
 * **プレビューが「反映する」と示した行は必ずその単価になり、「反映しない」と
 * 示した行は変わらない**ことを固定する（6.8）。
 *
 * この一致は「ダイアログの対象選定条件が適用側と同一である」ことに依存する。
 * 適用側（`estimateEditReducer.applyProfitRateAction`）は実行金額行と見積金額行の
 * 双方を持つ項目だけを対象にし、値引き行・注記行を除外する。ダイアログ側で
 * どれか一つでも条件を落とすと、反映されない行に新しい単価が出て 6.8 が破れる。
 *
 * Requirements (estimate-creation):
 * - 6.2, 6.3, 6.7: 上書きオプションの3分岐を編集中の値に対して判定する
 * - 6.5: 金額を自動計算して反映する
 * - 6.8: プレビューに表示した新しい単価と実際に反映される単価を一致させる
 * - 6.9, 49.7: 未保存の新規行（一時識別子）も適用対象として扱う
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { ProfitRateDialog } from '../../../components/estimate/ProfitRateDialog';
import {
  useEstimateEditor,
  type EstimateItemHierarchyEdit,
  type EstimateItemLineEdit,
} from '../../../hooks/useEstimateEditor';

type LineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

const buildLine = (
  itemId: string,
  lineType: LineType,
  overrides: Partial<EstimateItemLineEdit> = {}
): EstimateItemLineEdit => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name: null,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: null,
  remarks: null,
  ...overrides,
});

const buildItem = (
  id: string,
  lines: EstimateItemLineEdit[],
  overrides: Partial<EstimateItemHierarchyEdit> = {}
): EstimateItemHierarchyEdit => ({
  id,
  estimateId: 'est-1',
  parentId: null,
  displayOrder: 0,
  lines,
  children: [],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const standardItem = (
  id: string,
  name: string,
  executionUnitPrice: string | null,
  estimateUnitPrice: string | null
): EstimateItemHierarchyEdit =>
  buildItem(id, [
    buildLine(id, 'ESTIMATE', {
      name: `旧${name}`,
      specification: '旧仕様',
      unit: '個',
      quantity: '3',
      unitPrice: estimateUnitPrice,
      amount: estimateUnitPrice,
    }),
    buildLine(id, 'EXECUTION', {
      name,
      specification: '仕様A',
      unit: '式',
      quantity: '2',
      unitPrice: executionUnitPrice,
      amount: executionUnitPrice,
    }),
    buildLine(id, 'VENDOR', { name }),
  ]);

/** 編集状態の見積金額行を可視化するハーネス */
function Harness({ initialItems }: { initialItems: EstimateItemHierarchyEdit[] }) {
  const editor = useEstimateEditor({ estimateId: 'est-1', initialItems });
  const [isOpen, setIsOpen] = useState(true);

  const flatten = (items: EstimateItemHierarchyEdit[]): EstimateItemHierarchyEdit[] =>
    items.flatMap((item) => [item, ...flatten(item.children)]);

  return (
    <div>
      {flatten(editor.items).map((item) => (
        <div key={item.id}>
          {item.lines.map((line) => (
            <span key={line.lineType}>
              <span data-testid={`edit-${item.id}-${line.lineType}-unitPrice`}>
                {line.unitPrice ?? ''}
              </span>
              <span data-testid={`edit-${item.id}-${line.lineType}-amount`}>
                {line.amount ?? ''}
              </span>
              <span data-testid={`edit-${item.id}-${line.lineType}-name`}>{line.name ?? ''}</span>
              <span data-testid={`edit-${item.id}-${line.lineType}-quantity`}>
                {line.quantity ?? ''}
              </span>
            </span>
          ))}
        </div>
      ))}
      <button
        type="button"
        data-testid="edit-execution-unit-price"
        onClick={() => editor.updateLine('item-1', 'item-1-EXECUTION', 'unitPrice', '75000')}
      >
        実行単価を未保存で変更
      </button>
      <ProfitRateDialog
        isOpen={isOpen}
        items={editor.items}
        onClose={() => setIsOpen(false)}
        onApply={editor.applyProfitRate}
      />
    </div>
  );
}

/** プレビュー行の集合（項目キー → 反映有無・新しい単価） */
interface PreviewSnapshot {
  readonly key: string;
  readonly applied: boolean;
  readonly newUnitPrice: string;
}

const snapshotPreview = (): PreviewSnapshot[] =>
  screen.getAllByTestId('profit-preview-row').map((row) => ({
    key: row.getAttribute('data-profit-key') ?? '',
    applied: (within(row).getByTestId('preview-applied').textContent ?? '').trim() === '反映する',
    newUnitPrice: (within(row).getByTestId('preview-new-unit-price').textContent ?? '').replace(
      /[,円\s]/g,
      ''
    ),
  }));

const editStateUnitPrice = (key: string): string | null =>
  screen.queryByTestId(`edit-${key}-ESTIMATE-unitPrice`)?.textContent ?? null;

describe('ProfitRateDialog → 編集状態への反映（実物のフック）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * 55.4 の決定的な検証。
   *
   * フィクスチャには適用側が対象にしない項目（見積金額行なし・実行金額行なし・
   * 値引き行）を混ぜてある。ダイアログの選定条件が適用側と一致していれば、
   * プレビューが「反映する」と示した行はすべてその単価になる。
   * 条件を落とすとプレビューにだけ行が現れ、その行の単価が反映されないため
   * 本アサーションが 6.8 の食い違いとして失敗する。
   */
  /** @requirement estimate-creation/REQ-6.8 */
  it('プレビューが反映すると示した行がすべてその単価になること (6.8, 6.9, 49.7)', async () => {
    render(
      <Harness
        initialItems={[
          standardItem('item-1', '保存済み工事', '90000', null),
          // 未保存の新規行（サーバーの id を持たない）
          standardItem('tmp-9', '未保存の追加工事', '30000', null),
          // 適用側が対象にしない3種
          buildItem('item-no-estimate', [
            buildLine('item-no-estimate', 'EXECUTION', {
              name: '見積金額行なし',
              quantity: '1',
              unitPrice: '70000',
              amount: '70000',
            }),
          ]),
          buildItem('item-no-execution', [
            buildLine('item-no-execution', 'ESTIMATE', {
              name: '実行金額行なし',
              quantity: '1',
              unitPrice: '70000',
              amount: '70000',
            }),
          ]),
          { ...standardItem('item-discount', '値引き', '90000', null), itemType: 'DISCOUNT' },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('適用プレビュー')).toBeInTheDocument();
    });

    const preview = snapshotPreview();

    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(editStateUnitPrice('item-1')).toBe('101043');
    });

    // プレビューの約束が編集状態と一致する（6.8）。
    // 選定条件を落とすと、反映されない行がここで「約束した単価にならない」として落ちる。
    // 行数を先に固定すると本アサーションが実行されないまま終わるため、順序を守ること。
    for (const row of preview.filter((entry) => entry.applied)) {
      expect(editStateUnitPrice(row.key)).toBe(row.newUnitPrice);
    }

    // 反映しない行・対象外の項目は変わらない
    expect(editStateUnitPrice('item-no-execution')).toBe('70000');
    expect(editStateUnitPrice('item-discount')).toBe('');

    // 90,000 × 1.1227 = 101,043 / 30,000 × 1.1227 = 33,681
    // 一覧そのもの（行数・順序・新しい単価）も固定する
    expect(preview).toEqual([
      { key: 'item-1', applied: true, newUnitPrice: '101043' },
      { key: 'tmp-9', applied: true, newUnitPrice: '33681' },
    ]);
  });

  /** @requirement estimate-creation/REQ-6.2 */
  it('「すべて上書き」で名称・規格・単位・数量・単価を見積金額行へ複写すること (6.2, 6.5)', async () => {
    render(<Harness initialItems={[standardItem('item-1', '保存済み工事', '90000', null)]} />);

    await waitFor(() => {
      expect(screen.getByText('適用プレビュー')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(screen.getByTestId('edit-item-1-ESTIMATE-name')).toHaveTextContent('保存済み工事');
    });
    // 実行金額行の数量が複写され、金額は 2 × 101,043
    expect(screen.getByTestId('edit-item-1-ESTIMATE-quantity')).toHaveTextContent('2');
    expect(screen.getByTestId('edit-item-1-ESTIMATE-amount')).toHaveTextContent('202086');
  });

  /** @requirement estimate-creation/REQ-6.4 */
  it('「単価のみ上書き」は見積金額行の数量で金額を求めること (6.4, 6.5)', async () => {
    render(<Harness initialItems={[standardItem('item-1', '保存済み工事', '90000', null)]} />);

    fireEvent.click(screen.getByLabelText(/単価のみ上書き/));
    await waitFor(() => {
      expect(screen.getByText('適用プレビュー')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(editStateUnitPrice('item-1')).toBe('101043');
    });
    // 名称・数量は元のまま。金額は 見積金額行の数量 3 × 101,043
    expect(screen.getByTestId('edit-item-1-ESTIMATE-name')).toHaveTextContent('旧保存済み工事');
    expect(screen.getByTestId('edit-item-1-ESTIMATE-quantity')).toHaveTextContent('3');
    expect(screen.getByTestId('edit-item-1-ESTIMATE-amount')).toHaveTextContent('303129');
  });

  /** @requirement estimate-creation/REQ-6.7 */
  it('「空の場合のみ上書き」が編集中の見積金額行の単価で判定されること (6.3, 6.7)', async () => {
    render(
      <Harness
        initialItems={[
          standardItem('item-1', '見積単価が空', '90000', null),
          standardItem('item-2', '見積単価あり', '90000', '50000'),
        ]}
      />
    );

    fireEvent.click(screen.getByLabelText(/空の場合のみ上書き/));

    await waitFor(() => {
      expect(snapshotPreview()).toEqual([
        { key: 'item-1', applied: true, newUnitPrice: '101043' },
        { key: 'item-2', applied: false, newUnitPrice: '101043' },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(editStateUnitPrice('item-1')).toBe('101043');
    });
    // 単価が入っていた行は変わらない
    expect(editStateUnitPrice('item-2')).toBe('50000');
  });

  /** @requirement estimate-creation/REQ-6.8 */
  it('未保存の実行単価の変更がプレビューと適用の双方に効くこと (6.8, 49.6)', async () => {
    render(<Harness initialItems={[standardItem('item-1', '保存済み工事', '90000', null)]} />);

    fireEvent.click(screen.getByTestId('edit-execution-unit-price'));

    // 75,000 × 1.1227 = 84,202.5 → 84,203（小数第1位で四捨五入）
    await waitFor(() => {
      expect(snapshotPreview()).toEqual([{ key: 'item-1', applied: true, newUnitPrice: '84203' }]);
    });

    fireEvent.click(screen.getByRole('button', { name: '適用' }));

    await waitFor(() => {
      expect(editStateUnitPrice('item-1')).toBe('84203');
    });
  });
});
