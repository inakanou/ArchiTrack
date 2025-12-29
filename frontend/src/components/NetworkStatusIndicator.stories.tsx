import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { NetworkStatusIndicator } from './NetworkStatusIndicator';

/**
 * NetworkStatusIndicator コンポーネントのストーリー
 *
 * ネットワーク状態を表示するコンポーネント。
 * - オフライン時の警告バナー表示
 * - オンライン復帰時の通知表示
 * - オンライン状態のインジケーター表示（オプション）
 *
 * 注意: このコンポーネントは useNetworkStatus フックを使用するため、
 * 実際の動作はブラウザのネットワーク状態に依存します。
 */
const meta = {
  title: 'Components/NetworkStatusIndicator',
  component: NetworkStatusIndicator,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onOnline: fn(),
    onOffline: fn(),
  },
} satisfies Meta<typeof NetworkStatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（オンライン）
 * オンライン時はデフォルトで何も表示されない
 */
export const Default: Story = {
  args: {},
};

/**
 * オンライン表示
 * オンライン状態を表示するオプションを有効にした場合
 */
export const ShowOnline: Story = {
  args: {
    showOnline: true,
  },
};

/**
 * カスタムオフラインメッセージ
 * カスタムのオフラインメッセージを設定
 */
export const CustomOfflineMessage: Story = {
  args: {
    offlineMessage: 'インターネット接続がありません。Wi-Fiまたはモバイルデータを確認してください。',
  },
};

/**
 * 復帰通知有効
 * オンライン復帰時に通知を表示する設定
 */
export const ShowReconnected: Story = {
  args: {
    showReconnected: true,
    reconnectedDuration: 5000,
  },
};

/**
 * カスタムクラス名
 * 追加のCSSクラスを適用
 */
export const WithCustomClass: Story = {
  args: {
    showOnline: true,
    className: 'custom-network-indicator',
  },
};

/**
 * コールバック付き
 * オンライン/オフライン時のコールバック関数を設定
 */
export const WithCallbacks: Story = {
  args: {
    showOnline: true,
    onOnline: fn(() => console.log('オンラインになりました')),
    onOffline: fn(() => console.log('オフラインになりました')),
  },
};

/**
 * 全オプション有効
 * 全てのオプションを有効にした状態
 */
export const AllOptionsEnabled: Story = {
  args: {
    showOnline: true,
    showReconnected: true,
    reconnectedDuration: 3000,
    offlineMessage: 'ネットワーク接続が切断されました。',
    onOnline: fn(),
    onOffline: fn(),
  },
};
