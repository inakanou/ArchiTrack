/**
 * @fileoverview ScheduleSectionCardコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { ScheduleSectionCard } from './ScheduleSectionCard';
import type { ScheduleSectionItem } from './ScheduleSectionCard';

const mockSchedules: ScheduleSectionItem[] = [
  {
    id: 'schedule-1',
    name: '〇〇ビル新築工事 工程表',
    updatedAt: '2025-01-15T10:30:00Z',
    itemCount: 12,
  },
  {
    id: 'schedule-2',
    name: '△△マンション改修工事 工程表',
    updatedAt: '2025-01-20T14:00:00Z',
    itemCount: 8,
  },
  {
    id: 'schedule-3',
    name: '電気設備工事 工程表',
    updatedAt: '2025-01-25T09:15:00Z',
    itemCount: 5,
  },
];

const meta = {
  title: 'Projects/ScheduleSectionCard',
  component: ScheduleSectionCard,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div style={{ maxWidth: '800px' }}>
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'プロジェクト詳細画面の工程表セクションカードコンポーネント',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ScheduleSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * データあり
 */
export const WithData: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 5,
    latestSchedules: mockSchedules,
    isLoading: false,
  },
};

/**
 * 空の状態
 */
export const Empty: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 0,
    latestSchedules: [],
    isLoading: false,
  },
};

/**
 * ローディング中
 */
export const Loading: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 0,
    latestSchedules: [],
    isLoading: true,
  },
};

/**
 * 1件のみ
 */
export const SingleItem: Story = {
  args: {
    projectId: 'project-1',
    totalCount: 1,
    latestSchedules: [mockSchedules[0]!],
    isLoading: false,
  },
};
