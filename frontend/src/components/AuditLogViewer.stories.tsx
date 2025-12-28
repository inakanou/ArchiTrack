import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AuditLogViewer from './AuditLogViewer';
import type { AuditLog } from '../types/audit-log.types';

/**
 * AuditLogViewer コンポーネントのストーリー
 *
 * 監査ログ閲覧機能を提供するコンポーネント。
 * - 監査ログ一覧表示
 * - フィルタリング機能
 * - JSONエクスポート機能
 */
const meta = {
  title: 'Components/AuditLogViewer',
  component: AuditLogViewer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onExport: fn(),
  },
} satisfies Meta<typeof AuditLogViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルの監査ログデータ
 */
const sampleLogs: AuditLog[] = [
  {
    id: '1',
    actorId: 'user-1',
    actorEmail: 'admin@example.com',
    action: 'LOGIN_SUCCESS',
    ipAddress: '192.168.1.1',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    actorId: 'user-2',
    actorEmail: 'user@example.com',
    action: 'ROLE_CREATED',
    targetType: 'Role',
    targetId: 'role-1',
    targetName: '編集者',
    ipAddress: '192.168.1.2',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '3',
    actorId: 'user-1',
    actorEmail: 'admin@example.com',
    action: 'USER_ROLE_ASSIGNED',
    targetType: 'User',
    targetId: 'user-3',
    targetName: 'test@example.com',
    ipAddress: '192.168.1.1',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: '4',
    actorId: 'user-4',
    actorEmail: 'hacker@example.com',
    action: 'LOGIN_FAILED',
    ipAddress: '10.0.0.1',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: '5',
    actorId: 'user-2',
    actorEmail: 'user@example.com',
    action: 'PASSWORD_CHANGED',
    ipAddress: '192.168.1.2',
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: '6',
    actorId: 'user-1',
    actorEmail: 'admin@example.com',
    action: 'TWO_FACTOR_ENABLED',
    ipAddress: '192.168.1.1',
    createdAt: new Date(Date.now() - 18000000).toISOString(),
  },
];

/**
 * デフォルト状態
 * 監査ログ一覧の初期表示状態
 */
export const Default: Story = {
  args: {
    logs: sampleLogs,
    loading: false,
  },
};

/**
 * ローディング状態
 * データ読み込み中の表示
 */
export const Loading: Story = {
  args: {
    logs: [],
    loading: true,
  },
};

/**
 * 空の状態
 * 監査ログがない場合の表示
 */
export const Empty: Story = {
  args: {
    logs: [],
    loading: false,
  },
};

/**
 * エラー状態
 * エラーメッセージ表示
 */
export const WithError: Story = {
  args: {
    logs: [],
    loading: false,
    error: '監査ログの取得に失敗しました。ネットワーク接続を確認してください。',
  },
};

/**
 * エクスポート成功
 * JSONエクスポートが成功するケース
 */
export const ExportSuccess: Story = {
  args: {
    logs: sampleLogs,
    loading: false,
    onExport: fn().mockResolvedValue(undefined),
  },
};

/**
 * エクスポート失敗
 * JSONエクスポートが失敗するケース
 */
export const ExportError: Story = {
  args: {
    logs: sampleLogs,
    loading: false,
    onExport: fn().mockRejectedValue(new Error('エクスポートに失敗しました')),
  },
};

/**
 * 大量データ
 * 多数のログエントリがある場合の表示
 */
export const ManyLogs: Story = {
  args: {
    logs: Array.from({ length: 50 }, (_, i) => ({
      id: `log-${i}`,
      actorId: `user-${i % 5}`,
      actorEmail: `user${i % 5}@example.com`,
      action: ['LOGIN_SUCCESS', 'LOGOUT', 'ROLE_CREATED', 'PASSWORD_CHANGED'][
        i % 4
      ] as AuditLog['action'],
      ipAddress: `192.168.1.${i % 255}`,
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    })),
    loading: false,
  },
};
