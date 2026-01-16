import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import StorageWarningBanner from './StorageWarningBanner';

/**
 * StorageWarningBanner コンポーネントのストーリー
 *
 * localStorage関連の警告をユーザーに表示するバナー。
 * - quota-exceeded: 自動保存に失敗した際の警告（「今すぐ保存」ボタン付き）
 * - private-browsing: プライベートモードで自動保存が無効の警告
 */

const meta = {
  title: 'Components/SiteSurveys/StorageWarningBanner',
  component: StorageWarningBanner,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onDismiss: fn(),
    onSaveNow: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '600px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StorageWarningBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * QuotaExceeded警告
 * ストレージ容量不足時の警告
 */
export const QuotaExceeded: Story = {
  args: {
    type: 'quota-exceeded',
    isVisible: true,
  },
};

/**
 * プライベートブラウジング警告
 * プライベートモード時の警告
 */
export const PrivateBrowsing: Story = {
  args: {
    type: 'private-browsing',
    isVisible: true,
  },
};

/**
 * 「今後表示しない」チェックボックス付き
 * プライベートモード警告で表示を抑制可能
 */
export const WithDoNotShowAgain: Story = {
  args: {
    type: 'private-browsing',
    isVisible: true,
    showDoNotShowAgain: true,
  },
};

/**
 * 「今すぐ保存」ボタンなし
 * QuotaExceeded警告でボタンなし
 */
export const QuotaExceededNoSaveButton: Story = {
  args: {
    type: 'quota-exceeded',
    isVisible: true,
    onSaveNow: undefined,
  },
};

/**
 * 非表示状態
 * バナーが非表示
 */
export const Hidden: Story = {
  args: {
    type: 'quota-exceeded',
    isVisible: false,
  },
};
