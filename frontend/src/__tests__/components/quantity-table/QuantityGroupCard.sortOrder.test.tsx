/**
 * @fileoverview 数量グループカードの並び順管理テスト
 *
 * Task 37.2: 数量グループの並び順管理の単体テストを実装する
 *
 * Requirements:
 * - 23.1: 数量グループの並び順データ保持
 * - 23.2: 並び順通りの数量グループ表示
 * - 23.3: 数量グループ「上へ移動」ボタン
 * - 23.4: 数量グループ「下へ移動」ボタン
 * - 23.7: 並び順変更の保存
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

// AnnotatedImageThumbnailをモックして、Fabric.jsの依存関係を回避する
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
  default: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
}));

const createMockGroup = (overrides?: Partial<QuantityGroupDetail>): QuantityGroupDetail => ({
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 0,
  items: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('QuantityGroupCard 並び順管理', () => {
  it('isEditable時にSortOrderButtonsが表示される（REQ-23.3, 23.4）', () => {
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={1}
        groupTotalCount={3}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={vi.fn()}
      />
    );

    expect(screen.getByTestId('sort-order-buttons')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeInTheDocument();
  });

  it('isEditable=false時にSortOrderButtonsが表示されない', () => {
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={false}
        groupIndex={1}
        groupTotalCount={3}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={vi.fn()}
      />
    );

    expect(screen.queryByTestId('sort-order-buttons')).not.toBeInTheDocument();
  });

  it('onMoveGroupUpコールバックなしの場合にSortOrderButtonsが表示されない', () => {
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={1}
        groupTotalCount={3}
      />
    );

    expect(screen.queryByTestId('sort-order-buttons')).not.toBeInTheDocument();
  });

  it('「上へ移動」クリックでonMoveGroupUpが正しいgroupIdで呼ばれる（REQ-23.3, 23.7）', async () => {
    const user = userEvent.setup();
    const onMoveGroupUp = vi.fn();
    render(
      <QuantityGroupCard
        group={createMockGroup({ id: 'group-abc' })}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={1}
        groupTotalCount={3}
        onMoveGroupUp={onMoveGroupUp}
        onMoveGroupDown={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /上へ移動/i }));
    expect(onMoveGroupUp).toHaveBeenCalledWith('group-abc');
  });

  it('「下へ移動」クリックでonMoveGroupDownが正しいgroupIdで呼ばれる（REQ-23.4, 23.7）', async () => {
    const user = userEvent.setup();
    const onMoveGroupDown = vi.fn();
    render(
      <QuantityGroupCard
        group={createMockGroup({ id: 'group-xyz' })}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={1}
        groupTotalCount={3}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={onMoveGroupDown}
      />
    );

    await user.click(screen.getByRole('button', { name: /下へ移動/i }));
    expect(onMoveGroupDown).toHaveBeenCalledWith('group-xyz');
  });

  it('最上位グループ（index=0）では「上へ移動」がdisabled（REQ-23.5）', () => {
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={0}
        groupTotalCount={3}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).not.toBeDisabled();
  });

  it('最下位グループ（index=totalCount-1）では「下へ移動」がdisabled（REQ-23.6）', () => {
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={2}
        groupTotalCount={3}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });

  it('グループが1つの場合は両ボタンがdisabled（REQ-23.8）', () => {
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        groupIndex={0}
        groupTotalCount={1}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });
});
