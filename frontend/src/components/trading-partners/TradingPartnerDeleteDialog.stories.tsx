import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TradingPartnerDeleteDialog from './TradingPartnerDeleteDialog';

/**
 * TradingPartnerDeleteDialog コンポーネントのストーリー
 *
 * 取引先削除確認ダイアログ。
 * 削除操作の確認を求めるモーダルダイアログで、
 * フォーカストラップとアクセシビリティを実装しています。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerDeleteDialog',
  component: TradingPartnerDeleteDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '取引先削除時に確認を求めるモーダルダイアログ。プロジェクトに紐付いている場合はエラーメッセージを表示し、慎重な確認を促します。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    isOpen: true,
    onClose: fn(),
    onConfirm: fn(),
    partnerName: 'テスト株式会社',
  },
} satisfies Meta<typeof TradingPartnerDeleteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 削除確認ダイアログの初期表示状態
 */
export const Default: Story = {
  args: {},
};

/**
 * 削除処理中状態
 * 削除API呼び出し中の状態
 */
export const Deleting: Story = {
  args: {
    isDeleting: true,
  },
};

/**
 * エラー状態（プロジェクト紐付けエラー）
 * 取引先がプロジェクトに紐付いている場合のエラー表示
 */
export const WithProjectError: Story = {
  args: {
    error: 'この取引先は3件のプロジェクトに紐付いているため、削除できません。',
  },
};

/**
 * エラー状態（一般的なエラー）
 * 削除処理で発生した一般的なエラーの表示
 */
export const WithGeneralError: Story = {
  args: {
    error: '削除処理中にエラーが発生しました。しばらくしてから再度お試しください。',
  },
};

/**
 * 長い取引先名
 * 長い取引先名が表示される場合
 */
export const LongPartnerName: Story = {
  args: {
    partnerName: '株式会社アーキテクチャデザインアンドコンサルティングサービス東京本社',
  },
};

/**
 * 閉じた状態
 * ダイアログが閉じている状態（非表示）
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};
