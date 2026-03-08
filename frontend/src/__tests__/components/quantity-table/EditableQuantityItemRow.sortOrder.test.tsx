/**
 * @fileoverview 数量項目行の並び順管理テスト
 *
 * Task 38.2: 数量項目の並び順管理の単体テストを実装する
 *
 * Requirements:
 * - 24.1: 数量項目の並び順データ保持
 * - 24.2: 並び順通りの数量項目表示
 * - 24.3: 数量項目「上へ移動」ボタン
 * - 24.4: 数量項目「下へ移動」ボタン
 * - 24.7: 項目並び順変更の保存
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditableQuantityItemRow from '../../../components/quantity-table/EditableQuantityItemRow';
import type { QuantityItemDetail } from '../../../types/quantity-table.types';

const createMockItem = (overrides?: Partial<QuantityItemDetail>): QuantityItemDetail => ({
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '建築',
  middleCategory: null,
  minorCategory: null,
  customCategory: null,
  workType: '仮設',
  name: 'テスト項目',
  specification: null,
  unit: '式',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 1.0,
  remarks: null,
  displayOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const defaultGetSuggestions = () => [] as string[];
const defaultOnBlurAddCandidate = () => {};

describe('EditableQuantityItemRow 並び順管理', () => {
  it('SortOrderButtonsが操作列に表示される（REQ-24.3, 24.4）', () => {
    render(
      <EditableQuantityItemRow
        item={createMockItem()}
        getSuggestions={defaultGetSuggestions}
        onBlurAddCandidate={defaultOnBlurAddCandidate}
        canMoveUp={true}
        canMoveDown={true}
        itemIndex={1}
        itemTotalCount={3}
      />
    );

    expect(screen.getByTestId('sort-order-buttons')).toBeInTheDocument();
  });

  it('「上へ移動」クリックでonMoveUpが正しいitemIdで呼ばれる（REQ-24.3, 24.7）', async () => {
    const user = userEvent.setup();
    const onMoveUp = vi.fn();
    render(
      <EditableQuantityItemRow
        item={createMockItem({ id: 'item-abc' })}
        getSuggestions={defaultGetSuggestions}
        onBlurAddCandidate={defaultOnBlurAddCandidate}
        onMoveUp={onMoveUp}
        canMoveUp={true}
        canMoveDown={true}
        itemIndex={1}
        itemTotalCount={3}
      />
    );

    await user.click(screen.getByRole('button', { name: /上へ移動/i }));
    expect(onMoveUp).toHaveBeenCalledWith('item-abc');
  });

  it('「下へ移動」クリックでonMoveDownが正しいitemIdで呼ばれる（REQ-24.4, 24.7）', async () => {
    const user = userEvent.setup();
    const onMoveDown = vi.fn();
    render(
      <EditableQuantityItemRow
        item={createMockItem({ id: 'item-xyz' })}
        getSuggestions={defaultGetSuggestions}
        onBlurAddCandidate={defaultOnBlurAddCandidate}
        onMoveDown={onMoveDown}
        canMoveUp={true}
        canMoveDown={true}
        itemIndex={1}
        itemTotalCount={3}
      />
    );

    await user.click(screen.getByRole('button', { name: /下へ移動/i }));
    expect(onMoveDown).toHaveBeenCalledWith('item-xyz');
  });

  it('最上位項目（index=0）では「上へ移動」がdisabled（REQ-24.5）', () => {
    render(
      <EditableQuantityItemRow
        item={createMockItem()}
        getSuggestions={defaultGetSuggestions}
        onBlurAddCandidate={defaultOnBlurAddCandidate}
        canMoveUp={false}
        canMoveDown={true}
        itemIndex={0}
        itemTotalCount={3}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).not.toBeDisabled();
  });

  it('最下位項目（index=totalCount-1）では「下へ移動」がdisabled（REQ-24.6）', () => {
    render(
      <EditableQuantityItemRow
        item={createMockItem()}
        getSuggestions={defaultGetSuggestions}
        onBlurAddCandidate={defaultOnBlurAddCandidate}
        canMoveUp={true}
        canMoveDown={false}
        itemIndex={2}
        itemTotalCount={3}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });

  it('項目が1つの場合は両ボタンがdisabled（REQ-24.8）', () => {
    render(
      <EditableQuantityItemRow
        item={createMockItem()}
        getSuggestions={defaultGetSuggestions}
        onBlurAddCandidate={defaultOnBlurAddCandidate}
        canMoveUp={false}
        canMoveDown={false}
        itemIndex={0}
        itemTotalCount={1}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });
});
