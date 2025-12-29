import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SessionManager from './SessionManager';
import type { Session } from '../types/session.types';

/**
 * SessionManager コンポーネントのストーリー
 *
 * セッション管理コンポーネント。
 * - アクティブセッション一覧表示
 * - 個別セッションのログアウト
 * - 全デバイスからのログアウト
 * - 現在のセッション表示
 */
const meta = {
  title: 'Components/SessionManager',
  component: SessionManager,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onDeleteSession: fn().mockResolvedValue({
      success: true,
      message: 'セッションを削除しました',
    }),
    onDeleteAllSessions: fn().mockResolvedValue({
      success: true,
      message: '全てのセッションを削除しました',
    }),
  },
} satisfies Meta<typeof SessionManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルのセッションデータ
 */
const sampleSessions: Session[] = [
  {
    id: 'session-1',
    deviceInfo: 'Chrome on Windows',
    ipAddress: '192.168.1.1',
    isCurrent: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date().toISOString(),
  },
  {
    id: 'session-2',
    deviceInfo: 'Safari on macOS',
    ipAddress: '192.168.1.2',
    isCurrent: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'session-3',
    deviceInfo: 'Firefox on Ubuntu',
    ipAddress: '10.0.0.1',
    isCurrent: false,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 17 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'session-4',
    deviceInfo: 'Mobile Safari on iPhone',
    ipAddress: '172.16.0.1',
    isCurrent: false,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 21 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
];

/**
 * デフォルト状態
 * セッション一覧の初期表示状態
 */
export const Default: Story = {
  args: {
    sessions: sampleSessions,
    isLoading: false,
  },
};

/**
 * ローディング状態
 * データ読み込み中の表示
 */
export const Loading: Story = {
  args: {
    sessions: [],
    isLoading: true,
  },
};

/**
 * 空の状態
 * アクティブなセッションがない場合
 */
export const Empty: Story = {
  args: {
    sessions: [],
    isLoading: false,
  },
};

/**
 * 現在のセッションのみ
 * 現在のセッションのみが存在する場合
 */
export const OnlyCurrentSession: Story = {
  args: {
    sessions: sampleSessions.slice(0, 1),
    isLoading: false,
  },
};

/**
 * 多数のセッション
 * 多数のアクティブセッションがある場合
 */
export const ManySessions: Story = {
  args: {
    sessions: Array.from({ length: 10 }, (_, i) => ({
      id: `session-${i}`,
      deviceInfo: [
        'Chrome on Windows',
        'Safari on macOS',
        'Firefox on Ubuntu',
        'Mobile Safari on iPhone',
        'Chrome on Android',
      ][i % 5] as string,
      ipAddress: `192.168.1.${i + 1}`,
      isCurrent: i === 0,
      createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + (24 - i) * 60 * 60 * 1000).toISOString(),
      lastActivityAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
    })),
    isLoading: false,
  },
};

/**
 * セッション削除成功
 * 個別セッション削除が成功するケース
 */
export const DeleteSuccess: Story = {
  args: {
    sessions: sampleSessions,
    isLoading: false,
    onDeleteSession: fn().mockResolvedValue({
      success: true,
      message: 'セッションを削除しました',
    }),
  },
};

/**
 * セッション削除失敗
 * 個別セッション削除が失敗するケース
 */
export const DeleteError: Story = {
  args: {
    sessions: sampleSessions,
    isLoading: false,
    onDeleteSession: fn().mockRejectedValue(new Error('セッション削除に失敗しました')),
  },
};

/**
 * 全セッション削除成功
 * 全デバイスログアウトが成功するケース
 */
export const DeleteAllSuccess: Story = {
  args: {
    sessions: sampleSessions,
    isLoading: false,
    onDeleteAllSessions: fn().mockResolvedValue({
      success: true,
      message: '全てのセッションを削除しました',
    }),
  },
};

/**
 * 全セッション削除失敗
 * 全デバイスログアウトが失敗するケース
 */
export const DeleteAllError: Story = {
  args: {
    sessions: sampleSessions,
    isLoading: false,
    onDeleteAllSessions: fn().mockRejectedValue(new Error('セッション削除に失敗しました')),
  },
};

/**
 * IP不明
 * IPアドレスが不明なセッション
 */
export const UnknownIP: Story = {
  args: {
    sessions: [
      {
        id: 'session-unknown-ip',
        deviceInfo: 'Chrome on Windows',
        isCurrent: true,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        ipAddress: undefined,
      },
      ...sampleSessions.slice(1),
    ],
    isLoading: false,
  },
};
