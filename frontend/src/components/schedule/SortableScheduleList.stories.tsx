/**
 * @fileoverview SortableScheduleListコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { SortableScheduleList } from './SortableScheduleList';
import type { ScheduleItem } from '../../hooks/useScheduleState';

const mockItems: ScheduleItem[] = [
  {
    id: 'item-1',
    sourceType: 'QUANTITY_TABLE',
    sourceQuantityItemId: 'qi-1',
    itemName: '基礎工事',
    labelText: '基礎',
    detailText: 'コンクリート打設',
    startDate: '2025-02-03',
    duration: 10,
    endDate: '2025-02-12',
    displayOrder: 0,
    isExportTarget: true,
  },
  {
    id: 'item-2',
    sourceType: 'MANUAL',
    sourceQuantityItemId: null,
    itemName: '鉄骨組立',
    labelText: '鉄骨',
    detailText: '1F〜3F',
    startDate: '2025-02-14',
    duration: 14,
    endDate: '2025-02-27',
    displayOrder: 1,
    isExportTarget: true,
  },
  {
    id: 'item-3',
    sourceType: 'MANUAL',
    sourceQuantityItemId: null,
    itemName: '外壁工事',
    labelText: '外壁',
    detailText: '',
    startDate: null,
    duration: null,
    endDate: null,
    displayOrder: 2,
    isExportTarget: false,
  },
];

const meta = {
  title: 'Schedule/SortableScheduleList',
  component: SortableScheduleList,
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
          'ドラッグ&ドロップ対応の工程表項目リスト。HTML5 Drag and Drop APIで並び替え可能。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SortableScheduleList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 複数項目
 */
export const WithItems: Story = {
  args: {
    items: mockItems,
    onUpdate: () => {},
    onRemove: () => {},
    onReorder: () => {},
  },
};

/**
 * 1件のみ
 */
export const SingleItem: Story = {
  args: {
    items: [mockItems[0]!],
    onUpdate: () => {},
    onRemove: () => {},
    onReorder: () => {},
  },
};

/**
 * 項目なし
 */
export const Empty: Story = {
  args: {
    items: [],
    onUpdate: () => {},
    onRemove: () => {},
    onReorder: () => {},
  },
};
