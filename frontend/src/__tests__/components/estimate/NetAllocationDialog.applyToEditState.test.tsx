/**
 * @fileoverview NetAllocationDialog と編集状態の結線テスト（実物のフックで検証）
 *
 * Task 55.3: 案分ダイアログの入力元を編集中の明細へ変更
 *
 * ダイアログ単体テストは `onApply` に渡るペイロードまでしか見ない。本ファイルは
 * 実物の `useEstimateEditor`（＝ 55.2 の `applyNetAllocation` 遷移）へ繋ぎ、
 * **一時識別子しか持たない未保存の新規行**がプレビューどおりに実行金額行へ
 * 反映されることを固定する。項目キーが一時識別子を含まないとこの経路は成立しない。
 *
 * Requirements (estimate-creation):
 * - 5.3: 除外行以外の業者金額行を実行金額行に転記する
 * - 5.8: プレビューに表示した案分後金額と実際に反映される金額を一致させる
 * - 5.9: 未保存の新規行が案分対象に含まれる場合、その行も案分対象として扱う
 * - 18.10: 編集中の業者金額行（未保存の追加・編集を含む）を案分対象の一覧に表示する
 * - 49.6, 49.7: 計算対象を編集中の明細とし、未保存の新規項目を含める
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { NetAllocationDialog } from '../../../components/estimate/NetAllocationDialog';
import {
  useEstimateEditor,
  type EstimateItemHierarchyEdit,
} from '../../../hooks/useEstimateEditor';

vi.mock('../../../api/received-quotations', () => ({
  getReceivedQuotationsByProject: vi.fn().mockResolvedValue([]),
}));

const buildLine = (
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string,
  unitPrice: string | null,
  vendorName: string | null
) => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice,
  amount: unitPrice,
  remarks: null,
  sourceVendorName: vendorName,
});

const buildItem = (
  id: string,
  name: string,
  vendorUnitPrice: string,
  displayOrder: number
): EstimateItemHierarchyEdit => ({
  id,
  estimateId: 'est-1',
  parentId: null,
  displayOrder,
  lines: [
    buildLine(id, 'ESTIMATE', name, null, null),
    buildLine(id, 'EXECUTION', name, null, null),
    buildLine(id, 'VENDOR', name, vendorUnitPrice, '業者A'),
  ],
  children: [],
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
});

/**
 * 保存済みの1行と、一時識別子しか持たない未保存の1行を持つ編集状態のハーネス
 */
function Harness({ initialItems }: { initialItems: EstimateItemHierarchyEdit[] }) {
  const editor = useEstimateEditor({ estimateId: 'est-1', initialItems });
  const [isOpen, setIsOpen] = useState(true);

  const flatten = (items: EstimateItemHierarchyEdit[]): EstimateItemHierarchyEdit[] =>
    items.flatMap((item) => [item, ...flatten(item.children)]);

  return (
    <div>
      {flatten(editor.items).map((item) => (
        <div key={item.id} data-testid={`edit-item-${item.id}`}>
          {item.lines.map((line) => (
            <span key={line.lineType} data-testid={`edit-${item.id}-${line.lineType}-amount`}>
              {line.amount ?? ''}
            </span>
          ))}
        </div>
      ))}
      <NetAllocationDialog
        isOpen={isOpen}
        projectId="proj-1"
        items={editor.items}
        onClose={() => setIsOpen(false)}
        onApply={editor.applyNetAllocation}
      />
    </div>
  );
}

const previewAllocated = (key: string): string => {
  const row = screen
    .getAllByTestId('allocation-preview-row')
    .find((element) => element.getAttribute('data-allocation-key') === key);
  if (row === undefined) {
    throw new Error(`プレビュー行が見つかりません: ${key}`);
  }
  return (within(row).getByTestId('preview-allocated').textContent ?? '').replace(/[,円]/g, '');
};

describe('NetAllocationDialog → 編集状態への反映（実物のフック）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** @requirement estimate-creation/REQ-5.9 */
  it('一時識別子の未保存行がプレビューどおりに実行金額行へ反映されること (5.3, 5.8, 5.9, 49.7)', async () => {
    const items = [
      buildItem('item-1', '保存済み工事', '70000', 0),
      // 転記などで作られた未保存の新規行（サーバーの id を持たない）
      buildItem('tmp-9', '未保存の追加工事', '100000', 1),
    ];

    render(<Harness initialItems={items} />);

    fireEvent.change(screen.getByLabelText('対象業者を選択'), { target: { value: '業者A' } });

    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('allocation-target')
          .map((row) => row.getAttribute('data-allocation-key'))
      ).toEqual(['item-1', 'tmp-9']);
    });

    fireEvent.change(screen.getByLabelText('NET金額'), { target: { value: '130000' } });
    await waitFor(() => {
      expect(screen.getByText('案分プレビュー')).toBeInTheDocument();
    });

    // 70,000 : 100,000 の案分（合計 170,000）
    expect(previewAllocated('item-1')).toBe('53529');
    expect(previewAllocated('tmp-9')).toBe('76471');

    fireEvent.click(screen.getByRole('button', { name: '案分実行' }));

    await waitFor(() => {
      expect(screen.getByTestId('edit-item-1-EXECUTION-amount')).toHaveTextContent('53529');
    });
    // 一時識別子の行にも反映される（項目キーが一時識別子を含まないとここが空のまま）
    expect(screen.getByTestId('edit-tmp-9-EXECUTION-amount')).toHaveTextContent('76471');

    // 業者金額行は変わらない
    expect(screen.getByTestId('edit-item-1-VENDOR-amount')).toHaveTextContent('70000');
    expect(screen.getByTestId('edit-tmp-9-VENDOR-amount')).toHaveTextContent('100000');
  });
});
