import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerDetailView from './TradingPartnerDetailView';
import type { TradingPartnerDetail } from '../../types/trading-partner.types';

/**
 * モックデータ: 完全な取引先データ
 */
const fullPartnerData: TradingPartnerDetail = {
  id: '1',
  name: 'テスト株式会社',
  nameKana: 'テストカブシキガイシャ',
  branchName: '東京支店',
  branchNameKana: 'トウキョウシテン',
  representativeName: '山田太郎',
  representativeNameKana: 'ヤマダタロウ',
  types: ['CUSTOMER', 'SUBCONTRACTOR'],
  address: '東京都渋谷区道玄坂1-2-3 テストビル10F',
  phoneNumber: '03-1234-5678',
  faxNumber: '03-1234-5679',
  email: 'info@test.co.jp',
  billingClosingDay: 99,
  paymentMonthOffset: 1,
  paymentDay: 15,
  notes: 'テスト用の備考データです。\n複数行のメモを記載できます。',
  createdAt: '2024-01-15T09:30:00.000Z',
  updatedAt: '2024-06-20T14:45:00.000Z',
};

/**
 * モックデータ: 最小限の取引先データ
 */
const minimalPartnerData: TradingPartnerDetail = {
  id: '2',
  name: '最小データ株式会社',
  nameKana: 'サイショウデータカブシキガイシャ',
  branchName: null,
  branchNameKana: null,
  representativeName: null,
  representativeNameKana: null,
  types: ['CUSTOMER'],
  address: '大阪府大阪市中央区心斎橋1-1-1',
  phoneNumber: null,
  faxNumber: null,
  email: null,
  billingClosingDay: null,
  paymentMonthOffset: null,
  paymentDay: null,
  notes: null,
  createdAt: '2024-03-01T10:00:00.000Z',
  updatedAt: '2024-03-01T10:00:00.000Z',
};

/**
 * TradingPartnerDetailView コンポーネントのストーリー
 *
 * 取引先詳細表示コンポーネント。
 * 取引先の全フィールドを表示し、編集・削除ボタンを提供します。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerDetailView',
  component: TradingPartnerDetailView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '取引先の詳細情報を表示するコンポーネント。全フィールドの表示、請求締日・支払日の日本語表記変換、編集・削除ボタンの配置を提供します。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onEdit: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof TradingPartnerDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 完全なデータ
 * 全フィールドが入力された取引先の詳細表示
 */
export const FullData: Story = {
  args: {
    partner: fullPartnerData,
  },
};

/**
 * 最小限のデータ
 * 必須フィールドのみの取引先の詳細表示
 */
export const MinimalData: Story = {
  args: {
    partner: minimalPartnerData,
  },
};

/**
 * 顧客のみ
 * 種別が「顧客」のみの取引先
 */
export const CustomerOnly: Story = {
  args: {
    partner: {
      ...fullPartnerData,
      types: ['CUSTOMER'],
    },
  },
};

/**
 * 協力業者のみ
 * 種別が「協力業者」のみの取引先
 */
export const SubcontractorOnly: Story = {
  args: {
    partner: {
      ...fullPartnerData,
      types: ['SUBCONTRACTOR'],
    },
  },
};

/**
 * 日付選択の各パターン（10日締め）
 * 請求締日が10日の場合
 */
export const BillingDay10: Story = {
  args: {
    partner: {
      ...fullPartnerData,
      billingClosingDay: 10,
    },
  },
};

/**
 * 支払日（翌々月末日）
 * 翌々月末日の支払日設定
 */
export const PaymentSecondMonthLast: Story = {
  args: {
    partner: {
      ...fullPartnerData,
      paymentMonthOffset: 2,
      paymentDay: 99,
    },
  },
};

/**
 * 長い備考
 * 長文の備考が表示される場合
 */
export const LongNotes: Story = {
  args: {
    partner: {
      ...fullPartnerData,
      notes:
        'この取引先は重要なクライアントです。\n\n以下の点に注意してください：\n1. 請求書は必ず月末までに送付すること\n2. 支払いは翌月15日を厳守\n3. 担当者変更時は事前に連絡すること\n\n過去の取引履歴：\n- 2023年度: 総額1,000万円\n- 2024年度: 総額1,500万円（見込み）',
    },
  },
};

/**
 * 長い取引先名
 * 長い取引先名が表示される場合
 */
export const LongPartnerName: Story = {
  args: {
    partner: {
      ...fullPartnerData,
      name: '株式会社アーキテクチャデザインアンドコンサルティングサービス東京本社',
      nameKana:
        'カブシキガイシャアーキテクチャデザインアンドコンサルティングサービストウキョウホンシャ',
    },
  },
};
