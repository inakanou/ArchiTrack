/**
 * @fileoverview ScheduleFormコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import ScheduleForm from './ScheduleForm';

const meta = {
  title: 'Schedule/ScheduleForm',
  component: ScheduleForm,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '600px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '工程表作成フォーム。工程表名称の入力と数量表の選択を提供する。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ScheduleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 */
export const Default: Story = {
  args: {
    projectId: 'project-1',
    onSubmit: () => {},
    onCancel: () => {},
    isSubmitting: false,
    error: null,
  },
};

/**
 * 送信中
 */
export const Submitting: Story = {
  args: {
    projectId: 'project-1',
    onSubmit: () => {},
    onCancel: () => {},
    isSubmitting: true,
    error: null,
  },
};

/**
 * エラーあり
 */
export const WithError: Story = {
  args: {
    projectId: 'project-1',
    onSubmit: () => {},
    onCancel: () => {},
    isSubmitting: false,
    error: '工程表の作成に失敗しました。もう一度お試しください。',
  },
};
