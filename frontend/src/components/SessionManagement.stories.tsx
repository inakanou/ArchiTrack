import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import SessionManagement from './SessionManagement';
import type { SessionInfo } from '../types/auth.types';

/**
 * SessionManagement コンポーネントのストーリー
 *
 * アクティブなセッション（デバイス）の一覧表示、個別ログアウト、
 * 全デバイスログアウト機能を提供します。
 */
const meta = {
  title: 'Components/SessionManagement',
  component: SessionManagement,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onFetchSessions: fn(),
    onDeleteSession: fn(),
    onDeleteAllSessions: fn(),
  },
} satisfies Meta<typeof SessionManagement>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockSessions: SessionInfo[] = [
  {
    id: 'session-1',
    userId: 'user-1',
    deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    expiresAt: '2025-12-31T23:59:59Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'session-2',
    userId: 'user-1',
    deviceInfo: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
    expiresAt: '2025-12-31T23:59:59Z',
    createdAt: '2025-01-02T00:00:00Z',
  },
  {
    id: 'session-3',
    userId: 'user-1',
    deviceInfo: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    expiresAt: '2025-12-31T23:59:59Z',
    createdAt: '2025-01-03T00:00:00Z',
  },
];

/**
 * デフォルト状態
 * 複数のアクティブセッションを表示
 */
export const Default: Story = {
  args: {
    onFetchSessions: fn().mockResolvedValue(mockSessions),
  },
};

/**
 * セッションなし
 * アクティブなセッションがない状態
 */
export const NoSessions: Story = {
  args: {
    onFetchSessions: fn().mockResolvedValue([]),
  },
};

/**
 * ローディング状態
 * セッション一覧取得中の状態
 */
export const Loading: Story = {
  args: {
    onFetchSessions: fn().mockReturnValue(new Promise(() => {})), // 永続的なPromise
  },
};

/**
 * エラー状態
 * セッション取得失敗時のエラー表示
 */
export const WithError: Story = {
  args: {
    onFetchSessions: fn().mockRejectedValue(new Error('ネットワークエラー')),
  },
};
