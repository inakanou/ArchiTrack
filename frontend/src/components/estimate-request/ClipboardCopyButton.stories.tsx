import type { Meta, StoryObj } from '@storybook/react';
import { ClipboardCopyButton } from './ClipboardCopyButton';

/**
 * ClipboardCopyButton コンポーネントのストーリー
 *
 * テキストをクリップボードにコピーするボタン。
 * コピー成功時には視覚的フィードバックを表示。
 */

const meta = {
  title: 'Components/EstimateRequest/ClipboardCopyButton',
  component: ClipboardCopyButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ClipboardCopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * コピー可能な状態
 */
export const Default: Story = {
  args: {
    text: 'コピーされるテキストです。クリップボードにコピーしてください。',
    disabled: false,
  },
};

/**
 * 長いテキスト
 * 長いテキストをコピーする場合
 */
export const LongText: Story = {
  args: {
    text: `見積依頼書

株式会社サンプル 御中

拝啓 時下ますますご清栄のこととお喜び申し上げます。
平素は格別のお引き立てを賜り、厚く御礼申し上げます。

下記の通り見積をお願いいたします。

【工事名】サンプルプロジェクト
【工事場所】東京都千代田区丸の内1-1-1
【回答期限】2024年2月15日

敬具`,
    disabled: false,
  },
};

/**
 * 無効状態
 * ボタンが無効化されている場合
 */
export const Disabled: Story = {
  args: {
    text: 'コピーできないテキスト',
    disabled: true,
  },
};

/**
 * 空のテキスト
 * テキストが空の場合（自動的に無効化）
 */
export const EmptyText: Story = {
  args: {
    text: '',
    disabled: false,
  },
};

/**
 * 短いテキスト
 * 短いテキストをコピーする場合
 */
export const ShortText: Story = {
  args: {
    text: 'sample@example.com',
    disabled: false,
  },
};

/**
 * マルチライン
 * 複数行のテキスト
 */
export const MultilineText: Story = {
  args: {
    text: `項目1: コンクリート工事
項目2: 鉄筋工事
項目3: 型枠工事
項目4: 左官工事`,
    disabled: false,
  },
};
