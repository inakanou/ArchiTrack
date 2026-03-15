/**
 * @fileoverview GanttChartPanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { GanttChartPanel } from './GanttChartPanel';
import type { ScheduleItem } from '../../hooks/useScheduleState';
import type { HolidayMap } from '../../hooks/useHolidayCalendar';

const mockHolidays: HolidayMap = {
  isHoliday: (date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return key === '2025-02-11' || key === '2025-02-23';
  },
  isSaturday: (date: Date) => date.getDay() === 6,
  isSunday: (date: Date) => date.getDay() === 0,
  getHolidayName: (date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (key === '2025-02-11') return '建国記念の日';
    if (key === '2025-02-23') return '天皇誕生日';
    return null;
  },
};

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
    startDate: '2025-02-20',
    duration: 7,
    endDate: '2025-02-26',
    displayOrder: 2,
    isExportTarget: false,
  },
];

const meta = {
  title: 'Schedule/GanttChartPanel',
  component: GanttChartPanel,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '1200px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'ガントチャート表示パネル。工程表項目をタイムライン形式で表示する。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GanttChartPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    items: mockItems,
    holidays: mockHolidays,
  },
};

/**
 * 項目なし
 */
export const Empty: Story = {
  args: {
    items: [],
    holidays: mockHolidays,
  },
};

/**
 * 着工日・日数未設定
 */
export const NoDates: Story = {
  args: {
    items: [
      {
        id: 'item-1',
        sourceType: 'MANUAL',
        sourceQuantityItemId: null,
        itemName: '基礎工事',
        labelText: '基礎',
        detailText: '',
        startDate: null,
        duration: null,
        endDate: null,
        displayOrder: 0,
        isExportTarget: true,
      },
    ],
    holidays: mockHolidays,
  },
};
