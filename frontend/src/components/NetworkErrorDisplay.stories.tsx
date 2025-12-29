import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import NetworkErrorDisplay from './NetworkErrorDisplay';
import type { NetworkErrorState } from '../hooks/useNetworkError';

/**
 * NetworkErrorDisplay コンポーネントのストーリー
 *
 * ネットワークエラー表示コンポーネント。
 * - ネットワークエラー時のエラーメッセージ表示
 * - 再試行ボタンの表示と機能
 * - サーバーエラー（5xx）時のメッセージ表示
 * - セッション期限切れ時のリダイレクト
 */
const meta = {
  title: 'Components/NetworkErrorDisplay',
  component: NetworkErrorDisplay,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onRetry: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof NetworkErrorDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ネットワークエラー
 * ネットワーク接続エラーの表示（再試行可能）
 */
export const NetworkError: Story = {
  args: {
    error: {
      type: 'network',
      message: 'ネットワーク接続に問題があります。インターネット接続を確認してください。',
      statusCode: 0,
      canRetry: true,
      shouldRedirect: false,
    } as NetworkErrorState,
    isRetrying: false,
  },
};

/**
 * サーバーエラー
 * サーバー側エラー（5xx）の表示
 */
export const ServerError: Story = {
  args: {
    error: {
      type: 'server',
      message: 'サーバーでエラーが発生しました。しばらくしてから再試行してください。',
      statusCode: 500,
      canRetry: true,
      shouldRedirect: false,
    } as NetworkErrorState,
    isRetrying: false,
  },
};

/**
 * セッション期限切れ
 * セッション期限切れエラー（ログインページへリダイレクト）
 */
export const SessionExpired: Story = {
  args: {
    error: {
      type: 'session',
      message: 'セッションの有効期限が切れました。再度ログインしてください。',
      statusCode: 401,
      canRetry: false,
      shouldRedirect: true,
    } as NetworkErrorState,
    isRetrying: false,
  },
};

/**
 * クライアントエラー
 * クライアント側エラー（4xx）の表示
 */
export const ClientError: Story = {
  args: {
    error: {
      type: 'client',
      message: 'リクエストに問題があります。入力内容を確認してください。',
      statusCode: 400,
      canRetry: false,
      shouldRedirect: false,
    } as NetworkErrorState,
    isRetrying: false,
  },
};

/**
 * 不明なエラー
 * 予期しないエラーの表示
 */
export const UnknownError: Story = {
  args: {
    error: {
      type: 'unknown',
      message: '予期しないエラーが発生しました。',
      statusCode: 0,
      canRetry: true,
      shouldRedirect: false,
    } as NetworkErrorState,
    isRetrying: false,
  },
};

/**
 * 再試行中
 * 再試行処理中の表示
 */
export const Retrying: Story = {
  args: {
    error: {
      type: 'network',
      message: 'ネットワーク接続に問題があります。インターネット接続を確認してください。',
      statusCode: 0,
      canRetry: true,
      shouldRedirect: false,
    } as NetworkErrorState,
    isRetrying: true,
  },
};

/**
 * エラーなし
 * エラーがない場合は何も表示されない
 */
export const NoError: Story = {
  args: {
    error: null,
    isRetrying: false,
  },
};

/**
 * 再試行不可のネットワークエラー
 * 再試行ボタンが表示されないケース
 */
export const NoRetryOption: Story = {
  args: {
    error: {
      type: 'network',
      message: 'ネットワーク接続に問題があります。',
      statusCode: 0,
      canRetry: false,
      shouldRedirect: false,
    } as NetworkErrorState,
    isRetrying: false,
  },
};
