import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerForm from './TradingPartnerForm';
import type { TradingPartnerFormData } from './TradingPartnerForm';

/**
 * モックデータ: 編集用の初期データ
 */
const editInitialData: Partial<TradingPartnerFormData> = {
  name: 'テスト株式会社',
  nameKana: 'テストカブシキガイシャ',
  types: ['CUSTOMER', 'SUBCONTRACTOR'],
  address: '東京都渋谷区道玄坂1-2-3 テストビル10F',
  branchName: '東京支店',
  representativeName: '山田太郎',
  phoneNumber: '03-1234-5678',
  faxNumber: '03-1234-5679',
  email: 'info@test.co.jp',
  billingClosingDay: 99,
  paymentMonthOffset: 1,
  paymentDay: 15,
  notes: 'テスト用の備考データです。',
};

/**
 * TradingPartnerForm コンポーネントのストーリー
 *
 * 取引先作成・編集フォームコンポーネント。
 * 必須入力欄と任意入力欄を提供し、クライアントサイドバリデーションを実装しています。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerForm',
  component: TradingPartnerForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '取引先の作成および編集に使用するフォームUI。TradingPartnerTypeSelect、BillingClosingDaySelect、PaymentDateSelectコンポーネントを利用し、クライアントサイドバリデーションを実装しています。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn().mockResolvedValue(undefined),
    onCancel: fn(),
    isSubmitting: false,
  },
} satisfies Meta<typeof TradingPartnerForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 作成モード（デフォルト）
 * 新規取引先作成時のフォーム
 */
export const CreateMode: Story = {
  args: {
    mode: 'create',
  },
};

/**
 * 編集モード
 * 既存取引先編集時のフォーム（データプリセット）
 */
export const EditMode: Story = {
  args: {
    mode: 'edit',
    initialData: editInitialData,
  },
};

/**
 * 送信中状態
 * フォーム送信中の状態
 */
export const Submitting: Story = {
  args: {
    mode: 'create',
    isSubmitting: true,
  },
};

/**
 * 編集モード送信中
 * 編集時のフォーム送信中状態
 */
export const EditModeSubmitting: Story = {
  args: {
    mode: 'edit',
    initialData: editInitialData,
    isSubmitting: true,
  },
};

/**
 * 顧客のみの編集
 * 種別が「顧客」のみの取引先編集
 */
export const EditCustomerOnly: Story = {
  args: {
    mode: 'edit',
    initialData: {
      ...editInitialData,
      types: ['CUSTOMER'],
    },
  },
};

/**
 * 最小限のデータで編集
 * 必須項目のみの取引先編集
 */
export const EditMinimalData: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '最小データ株式会社',
      nameKana: 'サイショウデータカブシキガイシャ',
      types: ['SUBCONTRACTOR'],
      address: '大阪府大阪市中央区心斎橋1-1-1',
    },
  },
};
