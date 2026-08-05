/**
 * @fileoverview EstimateReportFieldsPanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateReportFieldsPanel, SEPARATE_WORKS_MAX_COUNT } from './EstimateReportFieldsPanel';

const meta = {
  title: 'Estimate/EstimateReportFieldsPanel',
  component: EstimateReportFieldsPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '帳票用入力項目のパネル（54.1〜54.3, 54.6）。提出日・見積有効期限・別途工事を入力し、変更後の値全体を通知する制御コンポーネント。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof EstimateReportFieldsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * すべて未入力（54.7）
 * 有効期限はプレースホルダのみを表示し、既定値は入れない
 */
export const Empty: Story = {
  args: {
    value: {
      submissionDate: null,
      validityPeriod: null,
      separateWorks: [],
    },
  },
};

/**
 * 入力済み（別途工事1件）
 */
export const Filled: Story = {
  args: {
    value: {
      submissionDate: '2025-04-01',
      validityPeriod: '提出日より1ヶ月間',
      separateWorks: ['外構工事'],
    },
  },
};

/**
 * 別途工事が上限（54.1）
 * 5件に達すると「別途工事を追加」が押せなくなる
 */
export const SeparateWorksAtLimit: Story = {
  args: {
    value: {
      submissionDate: '2025-04-01',
      validityPeriod: '提出日より3ヶ月間',
      separateWorks: Array.from(
        { length: SEPARATE_WORKS_MAX_COUNT },
        (_entry, index) => `別途工事${index + 1}の内容`
      ),
    },
  },
};

/**
 * 提出日のみ入力
 * 未入力の項目は空欄のまま扱う（54.7）
 */
export const SubmissionDateOnly: Story = {
  args: {
    value: {
      submissionDate: '2025-04-01',
      validityPeriod: null,
      separateWorks: [],
    },
  },
};
