/**
 * AuditLogViewer 単体テスト
 *
 * 監査ログ閲覧コンポーネントのテストを提供します。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogViewer from '../../components/AuditLogViewer';
import type { AuditLog } from '../../types/audit-log.types';

// モックデータ
const mockLogs: AuditLog[] = [
  {
    id: '1',
    actorId: 'user1',
    actorEmail: 'admin@example.com',
    action: 'ROLE_CREATED',
    targetType: 'Role',
    targetId: 'role1',
    targetName: '新規ロール',
    ipAddress: '192.168.1.1',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    actorId: 'user2',
    actorEmail: 'user@example.com',
    action: 'LOGIN_SUCCESS',
    ipAddress: '192.168.1.2',
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    actorId: 'user3',
    actorEmail: 'guest@example.com',
    action: 'PERMISSION_CHECK_FAILED',
    targetType: 'Permission',
    targetId: 'perm1',
    ipAddress: '192.168.1.3',
    createdAt: new Date().toISOString(),
  },
];

describe('AuditLogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('監査ログ一覧を表示する', () => {
    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('guest@example.com')).toBeInTheDocument();
  });

  it('アクション種別が日本語で表示される', () => {
    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    expect(screen.getByText('ロール作成')).toBeInTheDocument();
    expect(screen.getByText('ログイン成功')).toBeInTheDocument();
    expect(screen.getByText('権限チェック失敗')).toBeInTheDocument();
  });

  it('フィルター入力フィールドが表示される', () => {
    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    expect(screen.getByLabelText(/実行者IDフィルター/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/開始日時フィルター/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/終了日時フィルター/i)).toBeInTheDocument();
  });

  it('実行者IDフィルターに入力できる', async () => {
    const user = userEvent.setup();

    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    const actorFilter = screen.getByLabelText(/実行者IDフィルター/i);
    await user.type(actorFilter, 'user1');

    expect(actorFilter).toHaveValue('user1');
  });

  it('JSONエクスポートボタンをクリックするとコールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const mockOnExport = vi.fn().mockResolvedValue(undefined);

    render(<AuditLogViewer logs={mockLogs} loading={false} onExport={mockOnExport} />);

    const exportButton = screen.getByRole('button', { name: /JSONエクスポート/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalled();
    });
  });

  it('ローディング中にスピナーを表示する', () => {
    render(<AuditLogViewer logs={[]} loading={true} />);

    expect(screen.getByLabelText(/読み込み中/i)).toBeInTheDocument();
  });

  it('エラー時にエラーメッセージを表示する', () => {
    render(<AuditLogViewer logs={[]} loading={false} error="監査ログの取得に失敗しました" />);

    expect(screen.getByText(/監査ログの取得に失敗しました/i)).toBeInTheDocument();
  });

  it('監査ログが0件の場合にメッセージを表示する', () => {
    render(<AuditLogViewer logs={[]} loading={false} />);

    expect(screen.getByText(/監査ログがありません/i)).toBeInTheDocument();
  });

  it('アクセシビリティ属性が設定されている', () => {
    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
