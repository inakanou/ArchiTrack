/**
 * @fileoverview QuantityGroupTitleRowコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import QuantityGroupTitleRow from './QuantityGroupTitleRow';

const meta = {
  title: 'Components/QuantityTable/QuantityGroupTitleRow',
  component: QuantityGroupTitleRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '数量グループのメインタイトル行。大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考・操作の列ヘッダーを表示する。',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div
        role="grid"
        aria-label="数量グループ"
        style={{ width: '1200px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuantityGroupTitleRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 */
export const Default: Story = {
  args: {},
};

/**
 * 編集モード
 */
export const Editable: Story = {
  args: {
    isEditable: true,
  },
};

/**
 * 読み取り専用モード
 */
export const ReadOnly: Story = {
  args: {
    isEditable: false,
  },
};
