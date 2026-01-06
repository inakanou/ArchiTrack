import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ItemCopyMoveDialog from './ItemCopyMoveDialog';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

/**
 * ItemCopyMoveDialog コンポーネントのストーリー
 *
 * 選択された項目を別のグループへコピーまたは移動するためのモーダルダイアログ。
 */

// サンプルグループデータ
const sampleGroups: QuantityGroupDetail[] = [
  {
    id: 'group-1',
    quantityTableId: 'table-1',
    name: '基礎工事グループ',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 1,
    itemCount: 5,
    items: [],
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-20T15:45:00Z',
  },
  {
    id: 'group-2',
    quantityTableId: 'table-1',
    name: '躯体工事グループ',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 2,
    itemCount: 8,
    items: [],
    createdAt: '2024-01-16T09:00:00Z',
    updatedAt: '2024-01-21T14:20:00Z',
  },
  {
    id: 'group-3',
    quantityTableId: 'table-1',
    name: '仕上工事グループ',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 3,
    itemCount: 12,
    items: [],
    createdAt: '2024-01-17T11:15:00Z',
    updatedAt: '2024-01-22T10:30:00Z',
  },
  {
    id: 'group-4',
    quantityTableId: 'table-1',
    name: null,
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 4,
    itemCount: 3,
    items: [],
    createdAt: '2024-01-18T08:00:00Z',
    updatedAt: '2024-01-23T16:45:00Z',
  },
];

const meta = {
  title: 'Components/QuantityTable/ItemCopyMoveDialog',
  component: ItemCopyMoveDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ItemCopyMoveDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * コピーモード
 * 選択した項目を別のグループへコピー
 */
export const CopyMode: Story = {
  args: {
    isOpen: true,
    mode: 'copy',
    selectedItemIds: ['item-1', 'item-2'],
    groups: sampleGroups,
    currentGroupId: 'group-1',
  },
};

/**
 * 移動モード
 * 選択した項目を別のグループへ移動（現在のグループは選択不可）
 */
export const MoveMode: Story = {
  args: {
    isOpen: true,
    mode: 'move',
    selectedItemIds: ['item-1'],
    groups: sampleGroups,
    currentGroupId: 'group-1',
  },
};

/**
 * 単一項目
 * 1件の項目を操作
 */
export const SingleItem: Story = {
  args: {
    isOpen: true,
    mode: 'copy',
    selectedItemIds: ['item-1'],
    groups: sampleGroups,
    currentGroupId: 'group-2',
  },
};

/**
 * 複数項目
 * 複数件の項目を一括操作
 */
export const MultipleItems: Story = {
  args: {
    isOpen: true,
    mode: 'move',
    selectedItemIds: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
    groups: sampleGroups,
    currentGroupId: 'group-3',
  },
};

/**
 * 名前なしグループ
 * グループ名が設定されていない場合の表示
 */
export const GroupWithoutName: Story = {
  args: {
    isOpen: true,
    mode: 'copy',
    selectedItemIds: ['item-1'],
    groups: sampleGroups,
    currentGroupId: 'group-4',
  },
};

/**
 * 非表示状態
 * ダイアログが閉じている状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    mode: 'copy',
    selectedItemIds: ['item-1'],
    groups: sampleGroups,
    currentGroupId: 'group-1',
  },
};
