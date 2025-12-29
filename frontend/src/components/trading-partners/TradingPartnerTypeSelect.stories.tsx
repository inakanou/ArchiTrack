import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerTypeSelect from './TradingPartnerTypeSelect';

/**
 * TradingPartnerTypeSelect コンポーネントのストーリー
 *
 * 取引先種別選択コンポーネント。
 * 顧客・協力業者をチェックボックスで選択でき、複数選択に対応しています。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerTypeSelect',
  component: TradingPartnerTypeSelect,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '取引先種別選択コンポーネント。顧客と協力業者をチェックボックスで選択でき、複数選択に対応しています。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    label: '取引先種別',
  },
} satisfies Meta<typeof TradingPartnerTypeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（未選択）
 * 何も選択されていない初期状態
 */
export const Default: Story = {
  args: {
    value: [],
  },
};

/**
 * 顧客のみ選択
 * 顧客が選択されている状態
 */
export const CustomerSelected: Story = {
  args: {
    value: ['CUSTOMER'],
  },
};

/**
 * 協力業者のみ選択
 * 協力業者が選択されている状態
 */
export const SubcontractorSelected: Story = {
  args: {
    value: ['SUBCONTRACTOR'],
  },
};

/**
 * 両方選択
 * 顧客と協力業者の両方が選択されている状態
 */
export const BothSelected: Story = {
  args: {
    value: ['CUSTOMER', 'SUBCONTRACTOR'],
  },
};

/**
 * 必須フィールド状態
 * 必須マーク（*）が表示される状態
 */
export const Required: Story = {
  args: {
    value: [],
    required: true,
  },
};

/**
 * 必須で選択済み
 * 必須フィールドで種別が選択された状態
 */
export const RequiredWithSelection: Story = {
  args: {
    value: ['CUSTOMER'],
    required: true,
  },
};

/**
 * 無効化状態
 * 選択が無効化された状態
 */
export const Disabled: Story = {
  args: {
    value: ['CUSTOMER'],
    disabled: true,
  },
};

/**
 * 無効化状態（両方選択）
 * 両方選択された状態で無効化
 */
export const DisabledBothSelected: Story = {
  args: {
    value: ['CUSTOMER', 'SUBCONTRACTOR'],
    disabled: true,
  },
};

/**
 * エラー状態
 * エラーメッセージが表示される状態
 */
export const WithError: Story = {
  args: {
    value: [],
    required: true,
    error: '種別を1つ以上選択してください',
  },
};
