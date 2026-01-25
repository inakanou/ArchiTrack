import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EstimateRequestForm } from './EstimateRequestForm';
import type { EstimateRequestInfo } from '../../types/estimate-request.types';

/**
 * EstimateRequestForm コンポーネントのストーリー
 *
 * 見積依頼の作成・編集を行うフォームコンポーネント。
 * 名前、宛先（取引先）、参照内訳書の入力を受け付ける。
 */

// モックの見積依頼データ
const mockEstimateRequest: EstimateRequestInfo = {
  id: 'er-1',
  projectId: 'project-123',
  name: 'テスト見積依頼',
  tradingPartnerId: 'tp-1',
  tradingPartnerName: '株式会社サンプル建設',
  itemizedStatementId: 'is-1',
  itemizedStatementName: '外構工事内訳書',
  method: 'EMAIL',
  includeBreakdownInBody: false,
  createdAt: '2024-01-20T10:30:00Z',
  updatedAt: '2024-01-20T15:45:00Z',
};

const meta = {
  title: 'Components/EstimateRequest/EstimateRequestForm',
  component: EstimateRequestForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSuccess: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof EstimateRequestForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示（新規作成）
 * APIからデータを取得する通常のフォーム
 */
export const Default: Story = {
  args: {
    projectId: 'project-123',
  },
};

/**
 * 初期値あり（編集モード相当）
 * 初期値が設定された状態
 */
export const WithInitialData: Story = {
  args: {
    projectId: 'project-123',
    initialData: {
      name: '外構工事見積依頼',
      tradingPartnerId: 'tp-1',
      itemizedStatementId: 'is-1',
    },
  },
};

/**
 * モック送信成功
 * 送信処理をモックして成功を返す
 */
export const WithMockSubmitSuccess: Story = {
  args: {
    projectId: 'project-123',
    onSubmit: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return mockEstimateRequest;
    },
  },
};

/**
 * モック送信エラー
 * 送信処理をモックしてエラーを返す
 */
export const WithMockSubmitError: Story = {
  args: {
    projectId: 'project-123',
    onSubmit: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      throw {
        statusCode: 400,
        message: 'Validation error',
        response: {
          code: 'TRADING_PARTNER_NOT_SUBCONTRACTOR',
          detail: '選択された取引先は協力業者ではありません',
        },
      };
    },
  },
};

/**
 * 内訳書項目なしエラー
 * 内訳書に項目がない場合のエラー
 */
export const EmptyItemizedStatementError: Story = {
  args: {
    projectId: 'project-123',
    onSubmit: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      throw {
        statusCode: 400,
        message: 'Validation error',
        response: {
          code: 'EMPTY_ITEMIZED_STATEMENT_ITEMS',
          detail: '選択された内訳書に項目がありません',
        },
      };
    },
  },
};
