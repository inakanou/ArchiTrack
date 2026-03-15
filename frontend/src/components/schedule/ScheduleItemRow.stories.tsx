/**
 * @fileoverview ScheduleItemRowコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { ScheduleItemRow } from './ScheduleItemRow';
import type { ScheduleItem } from '../../hooks/useScheduleState';

const mockManualItem: ScheduleItem = {
  id: 'item-1',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '基礎工事',
  labelText: '基礎',
  detailText: 'コンクリート打設',
  startDate: '2025-02-03',
  duration: 10,
  endDate: '2025-02-12',
  displayOrder: 0,
  isExportTarget: true,
};

const mockQuantityItem: ScheduleItem = {
  id: 'item-2',
  sourceType: 'QUANTITY_TABLE',
  sourceQuantityItemId: 'qi-1',
  itemName: '鉄骨組立',
  labelText: '鉄骨',
  detailText: '1F〜3F',
  startDate: '2025-02-14',
  duration: 14,
  endDate: '2025-02-27',
  displayOrder: 1,
  isExportTarget: true,
};

const meta = {
  title: 'Schedule/ScheduleItemRow',
  component: ScheduleItemRow,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1000px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '工程表の1項目の入力行。項目名、ラベル、詳細、着工日、日数、出力対象を入力できる。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ScheduleItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 任意項目（削除ボタンあり）
 */
export const ManualItem: Story = {
  args: {
    item: mockManualItem,
    onUpdate: () => {},
    onRemove: () => {},
  },
};

/**
 * 数量表項目（バッジ表示、削除ボタンなし）
 */
export const QuantityTableItem: Story = {
  args: {
    item: mockQuantityItem,
    onUpdate: () => {},
    onRemove: () => {},
  },
};

/**
 * 未入力状態
 */
export const EmptyItem: Story = {
  args: {
    item: {
      id: 'item-3',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '',
      labelText: '',
      detailText: '',
      startDate: null,
      duration: null,
      endDate: null,
      displayOrder: 0,
      isExportTarget: true,
    },
    onUpdate: () => {},
    onRemove: () => {},
  },
};

/**
 * バリデーションエラー（着工日未入力で日数あり）
 */
export const ValidationError: Story = {
  args: {
    item: {
      id: 'item-4',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '外壁工事',
      labelText: '外壁',
      detailText: '',
      startDate: null,
      duration: 5,
      endDate: null,
      displayOrder: 0,
      isExportTarget: true,
    },
    onUpdate: () => {},
    onRemove: () => {},
  },
};
