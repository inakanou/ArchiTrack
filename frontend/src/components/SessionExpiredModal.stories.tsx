import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { SessionExpiredModal } from './SessionExpiredModal';

/**
 * SessionExpiredModal コンポーネントのストーリー
 *
 * 操作中にセッションが切れた場合にインプレース再認証を行うモーダルダイアログ。
 * フォーム入力データの損失を防ぎ、ユーザーは再認証後にシームレスに作業を続行できる。
 *
 * @requirement user-authentication/REQ-30: セッション切れ時のモーダル再認証
 */
const meta = {
  title: 'Components/SessionExpiredModal',
  component: SessionExpiredModal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    isOpen: true,
    userEmail: 'user@example.com',
    onReauthSuccess: fn(),
    onNavigateToLogin: fn(),
  },
} satisfies Meta<typeof SessionExpiredModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * セッション切れ再認証モーダルの初期表示状態
 * 要件30.4: メールアドレス自動入力
 */
export const Default: Story = {
  args: {},
};

/**
 * モーダル非表示状態
 * isOpen=falseの場合、モーダルは表示されない
 * 要件30.2: isOpen制御
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/**
 * 2FAユーザー向け状態
 * パスワード認証後に2FAコード入力が求められる状態のプレビュー
 * 要件30.12: 2FA対応
 * (注: 実際の2FA表示にはAPIレスポンスが必要。デフォルト画面のみ表示)
 */
export const With2FA: Story = {
  args: {
    userEmail: '2fa-user@example.com',
  },
};

/**
 * ネットワークエラー状態のプレビュー
 * 要件30.17: ネットワークエラー時のメッセージとリトライボタン
 * (注: 実際のエラー表示にはAPI呼び出しが必要。デフォルト画面のみ表示)
 */
export const NetworkError: Story = {
  args: {
    userEmail: 'network-error@example.com',
  },
};

/**
 * 長いメールアドレスの場合
 * レスポンシブ対応の検証用
 * 要件30.21: レスポンシブ対応
 */
export const LongEmail: Story = {
  args: {
    userEmail: 'very.long.email.address.for.testing.responsive.layout@example-company.co.jp',
  },
};

/**
 * モバイルビューポート
 * モバイルでのフルスクリーンに近いレイアウト検証用
 * 要件30.21: レスポンシブ対応
 */
export const Mobile: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
