import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import TradingPartnerFormContainer from './TradingPartnerFormContainer';

/**
 * TradingPartnerFormContainer コンポーネントのストーリー
 *
 * 取引先フォームコンテナコンポーネント。
 * API呼び出し、成功時のトースト表示と画面遷移、
 * エラーハンドリングを管理します。
 *
 * 注意: このコンポーネントはAPIモックが必要なため、
 * Storybook上での完全な動作確認は制限されます。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerFormContainer',
  component: TradingPartnerFormContainer,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '取引先フォームのコンテナコンポーネント。API呼び出し、成功時のトースト表示と画面遷移、エラーハンドリングを管理します。実際のAPIと連携するため、Storybook上での動作は制限されます。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TradingPartnerFormContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 作成モード
 * 新規取引先作成時のコンテナ
 */
export const CreateMode: Story = {
  args: {
    mode: 'create',
  },
};

/**
 * 編集モード
 * 既存取引先編集時のコンテナ
 *
 * 注意: 実際のAPIからデータを取得するため、
 * モックされていない環境ではローディング状態が継続します。
 */
export const EditMode: Story = {
  args: {
    mode: 'edit',
    tradingPartnerId: '1',
  },
};
