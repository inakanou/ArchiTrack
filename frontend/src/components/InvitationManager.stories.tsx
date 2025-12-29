import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import InvitationManager from './InvitationManager';
import type { Invitation } from '../types/invitation.types';

/**
 * InvitationManager コンポーネントのストーリー
 *
 * ユーザー招待管理機能を提供するコンポーネント。
 * - 招待フォーム
 * - 招待一覧表示
 * - ステータスフィルタリング
 * - 招待URLコピー機能
 * - 招待取り消し・再送信機能
 */
const meta = {
  title: 'Components/InvitationManager',
  component: InvitationManager,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onCreateInvitation: fn().mockResolvedValue({
      success: true,
      invitationUrl: 'https://example.com/register?token=abc123',
    }),
    onCancelInvitation: fn().mockResolvedValue({ success: true }),
    onResendInvitation: fn().mockResolvedValue({
      success: true,
      invitationUrl: 'https://example.com/register?token=xyz789',
    }),
  },
} satisfies Meta<typeof InvitationManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルの招待データ
 */
const sampleInvitations: Invitation[] = [
  {
    id: '1',
    email: 'pending@example.com',
    token: 'token-1',
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: 'admin-1',
    inviterEmail: 'admin@example.com',
  },
  {
    id: '2',
    email: 'accepted@example.com',
    token: 'token-2',
    status: 'accepted',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: 'admin-1',
    inviterEmail: 'admin@example.com',
  },
  {
    id: '3',
    email: 'expired@example.com',
    token: 'token-3',
    status: 'expired',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: 'admin-1',
    inviterEmail: 'admin@example.com',
  },
  {
    id: '4',
    email: 'cancelled@example.com',
    token: 'token-4',
    status: 'cancelled',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: 'admin-1',
    inviterEmail: 'admin@example.com',
  },
  {
    id: '5',
    email: 'another-pending@example.com',
    token: 'token-5',
    status: 'pending',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: 'admin-2',
    inviterEmail: 'admin2@example.com',
  },
];

/**
 * デフォルト状態
 * 招待一覧の初期表示状態
 */
export const Default: Story = {
  args: {
    invitations: sampleInvitations,
    loading: false,
  },
};

/**
 * ローディング状態
 * データ読み込み中の表示
 */
export const Loading: Story = {
  args: {
    invitations: [],
    loading: true,
  },
};

/**
 * 空の状態
 * 招待がない場合の表示
 */
export const Empty: Story = {
  args: {
    invitations: [],
    loading: false,
  },
};

/**
 * エラー状態
 * エラーメッセージ表示
 */
export const WithError: Story = {
  args: {
    invitations: sampleInvitations,
    loading: false,
    error: '招待データの取得に失敗しました。',
  },
};

/**
 * 招待作成成功
 * 招待作成が成功するケース
 */
export const CreateSuccess: Story = {
  args: {
    invitations: sampleInvitations,
    loading: false,
    onCreateInvitation: fn().mockResolvedValue({
      success: true,
      invitationUrl: 'https://example.com/register?token=new-token-123',
    }),
  },
};

/**
 * 招待作成失敗
 * 招待作成が失敗するケース（重複メールアドレス）
 */
export const CreateError: Story = {
  args: {
    invitations: sampleInvitations,
    loading: false,
    onCreateInvitation: fn().mockResolvedValue({
      success: false,
      error: 'このメールアドレスは既に招待済みです。',
    }),
  },
};

/**
 * 未使用のみ
 * 未使用ステータスの招待のみ
 */
export const OnlyPending: Story = {
  args: {
    invitations: sampleInvitations.filter((inv) => inv.status === 'pending'),
    loading: false,
  },
};

/**
 * ページネーション
 * 多数の招待がある場合のページネーション表示
 */
export const WithPagination: Story = {
  args: {
    invitations: Array.from({ length: 25 }, (_, i) => ({
      id: `inv-${i}`,
      email: `user${i}@example.com`,
      token: `token-${i}`,
      status: ['pending', 'accepted', 'expired', 'cancelled'][i % 4] as Invitation['status'],
      createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + (7 - i) * 24 * 60 * 60 * 1000).toISOString(),
      invitedBy: 'admin-1',
      inviterEmail: 'admin@example.com',
    })),
    loading: false,
  },
};
