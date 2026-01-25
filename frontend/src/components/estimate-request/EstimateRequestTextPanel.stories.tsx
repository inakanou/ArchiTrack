import type { Meta, StoryObj } from '@storybook/react';
import { EstimateRequestTextPanel } from './EstimateRequestTextPanel';
import type { EstimateRequestText } from '../../types/estimate-request.types';

/**
 * EstimateRequestTextPanel コンポーネントのストーリー
 *
 * 見積依頼文（宛先、表題、本文）を表示し、
 * 各項目をクリップボードにコピーする機能を提供。
 */

// サンプル見積依頼文データ
const sampleText: EstimateRequestText = {
  recipient: 'sample@example.com',
  recipientError: undefined,
  subject: '【見積依頼】外構工事見積依頼について',
  body: `株式会社サンプル建設 御中

拝啓 時下ますますご清栄のこととお喜び申し上げます。
平素は格別のお引き立てを賜り、厚く御礼申し上げます。

下記の通り見積をお願いいたします。

【工事名】サンプルプロジェクト - 外構工事
【工事場所】東京都千代田区丸の内1-1-1
【回答期限】2024年2月15日

■ 見積項目
1. コンクリート工事 - 100m³
2. 鉄筋工事 - 5,000kg
3. 型枠工事 - 500m²

ご多忙のところ恐縮ですが、ご検討のほどよろしくお願い申し上げます。

敬具`,
};

const meta = {
  title: 'Components/EstimateRequest/EstimateRequestTextPanel',
  component: EstimateRequestTextPanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EstimateRequestTextPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示（メール）
 * メールアドレスへの見積依頼文
 */
export const Default: Story = {
  args: {
    text: sampleText,
    loading: false,
  },
};

/**
 * FAX宛先
 * FAX番号への見積依頼文
 */
export const FaxRecipient: Story = {
  args: {
    text: {
      ...sampleText,
      recipient: '03-1234-5678',
    },
    loading: false,
  },
};

/**
 * メールアドレス未登録エラー
 * メールアドレスが登録されていない場合
 */
export const EmailNotRegistered: Story = {
  args: {
    text: {
      ...sampleText,
      recipient: '',
      recipientError: 'メールアドレスが登録されていません',
    },
    loading: false,
  },
};

/**
 * FAX番号未登録エラー
 * FAX番号が登録されていない場合
 */
export const FaxNotRegistered: Story = {
  args: {
    text: {
      ...sampleText,
      recipient: '',
      recipientError: 'FAX番号が登録されていません',
    },
    loading: false,
  },
};

/**
 * ローディング状態
 * データ取得中
 */
export const Loading: Story = {
  args: {
    text: null,
    loading: true,
  },
};

/**
 * エラー状態（データなし）
 * 見積依頼文を取得できなかった場合
 */
export const Error: Story = {
  args: {
    text: null,
    loading: false,
  },
};

/**
 * 短い本文
 * 本文が短い場合
 */
export const ShortBody: Story = {
  args: {
    text: {
      recipient: 'sample@example.com',
      recipientError: undefined,
      subject: '【見積依頼】簡易工事',
      body: `株式会社サンプル 御中

見積をお願いします。

以上`,
    },
    loading: false,
  },
};

/**
 * 内訳書を含む本文
 * 内訳書が本文に含まれている場合
 */
export const WithBreakdown: Story = {
  args: {
    text: {
      recipient: 'sample@example.com',
      recipientError: undefined,
      subject: '【見積依頼】外構工事見積依頼',
      body: `株式会社サンプル建設 御中

下記の通り見積をお願いいたします。

■ 内訳書
┌─────────────────────────────────────────────────────────────┐
│ カテゴリ    │ 工種        │ 名称      │ 規格   │ 単位 │ 数量 │
├─────────────────────────────────────────────────────────────┤
│ 土工事      │ 掘削工      │ 掘削      │ -      │ m³   │ 100  │
│ 土工事      │ 埋戻工      │ 埋戻      │ -      │ m³   │ 80   │
│ コンクリート│ 打設工      │ 打設      │ 21N    │ m³   │ 50   │
└─────────────────────────────────────────────────────────────┘

よろしくお願いいたします。`,
    },
    loading: false,
  },
};
