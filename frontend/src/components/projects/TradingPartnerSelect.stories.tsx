import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerSelect from './TradingPartnerSelect';

/**
 * TradingPartnerSelect コンポーネントのストーリー
 *
 * 取引先選択ドロップダウン（オートコンプリート対応）。
 * 顧客種別を持つ取引先のみを選択肢として表示。
 * ひらがな・カタカナ両対応の検索機能。
 */
const meta = {
  title: 'Components/Projects/TradingPartnerSelect',
  component: TradingPartnerSelect,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    onBlur: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '400px', padding: '24px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TradingPartnerSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 取引先未選択の初期状態
 */
export const Default: Story = {
  args: {
    value: '',
  },
};

/**
 * 取引先選択済み
 * 特定の取引先が選択された状態
 * （実際にはAPIから取得した取引先IDを指定）
 */
export const WithValue: Story = {
  args: {
    value: 'partner-123',
  },
};

/**
 * エラー状態
 * バリデーションエラーが発生した状態
 */
export const WithError: Story = {
  args: {
    value: '',
    error: '取引先の選択に問題があります',
  },
};

/**
 * 無効化状態
 * 入力が無効化された状態
 */
export const Disabled: Story = {
  args: {
    value: '',
    disabled: true,
  },
};

/**
 * 選択済みで無効化
 * 取引先選択済みかつ無効化された状態
 */
export const DisabledWithValue: Story = {
  args: {
    value: 'partner-456',
    disabled: true,
  },
};
