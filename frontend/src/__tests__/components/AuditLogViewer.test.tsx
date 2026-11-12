/**
 * AuditLogViewer 単体テスト
 *
 * 監査ログ閲覧コンポーネントのテストを提供します。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogViewer from '../../components/AuditLogViewer';
import type { AuditLog, AuditLogAction } from '../../types/audit-log.types';

// セキュリティ是正で加えた監査の種別とその表示名（要件40.1）
const securityRemediationActionLabels = {
  LOGIN_LOCKED: 'アカウントロック',
  TWO_FACTOR_VERIFIED: '2FA検証成功',
  TWO_FACTOR_FAILED: '2FA検証失敗',
  LOGOUT_ALL: '全デバイスからログアウト',
  REFRESH_TOKEN_REUSE_DETECTED: 'リフレッシュトークン再利用検知',
  INVITATION_RESENT: '招待再送信',
  INVITATION_ACCEPTED: '招待経由の登録',
  USER_DEACTIVATED: 'ユーザー無効化',
  USER_REACTIVATED: 'ユーザー再有効化',
  USER_AUTO_DEACTIVATED: 'ユーザー自動無効化',
  TWO_FACTOR_RESET_BY_ADMIN: '2FA再設定（管理者）',
  TWO_FACTOR_REENROLLED: '2FA再登録',
  PROJECT_SCOPE_DENIED: '案件範囲外のアクセス',
  DATA_EXPORTED: 'データ出力',
  OPERATIONAL_SETTING_CHANGED: '運用設定変更',
  AUDIT_ARCHIVE_CREATED: '監査ログのアーカイブ',
  AUDIT_ARCHIVE_FAILED: '監査ログのアーカイブ失敗',
  AUDIT_ARCHIVE_RESTORED: '監査ログの復元',
} as const satisfies Partial<Record<AuditLogAction, string>>;

const securityRemediationActions = Object.keys(
  securityRemediationActionLabels
) as (keyof typeof securityRemediationActionLabels)[];

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

  it('開始日時フィルターに入力できる', async () => {
    const user = userEvent.setup();

    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    const startDateFilter = screen.getByLabelText(/開始日時フィルター/i);
    await user.clear(startDateFilter);
    await user.type(startDateFilter, '2025-01-01');

    expect(startDateFilter).toHaveValue('2025-01-01');
  });

  it('終了日時フィルターに入力できる', async () => {
    const user = userEvent.setup();

    render(<AuditLogViewer logs={mockLogs} loading={false} />);

    const endDateFilter = screen.getByLabelText(/終了日時フィルター/i);
    await user.clear(endDateFilter);
    await user.type(endDateFilter, '2025-12-31');

    expect(endDateFilter).toHaveValue('2025-12-31');
  });

  it('エクスポートが失敗した場合にエラーをログに出力する', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockOnExport = vi.fn().mockRejectedValue(new Error('Export failed'));

    render(<AuditLogViewer logs={mockLogs} loading={false} onExport={mockOnExport} />);

    const exportButton = screen.getByRole('button', { name: /JSONエクスポート/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('エクスポートに失敗しました', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  it('フィルターを設定してエクスポートするとフィルター値が渡される', async () => {
    const user = userEvent.setup();
    const mockOnExport = vi.fn().mockResolvedValue(undefined);

    render(<AuditLogViewer logs={mockLogs} loading={false} onExport={mockOnExport} />);

    // フィルター値を設定
    const actorFilter = screen.getByLabelText(/実行者IDフィルター/i);
    await user.type(actorFilter, 'test-user');

    const startDateFilter = screen.getByLabelText(/開始日時フィルター/i);
    await user.clear(startDateFilter);
    await user.type(startDateFilter, '2025-01-01');

    const endDateFilter = screen.getByLabelText(/終了日時フィルター/i);
    await user.clear(endDateFilter);
    await user.type(endDateFilter, '2025-12-31');

    // エクスポート
    const exportButton = screen.getByRole('button', { name: /JSONエクスポート/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(mockOnExport).toHaveBeenCalledWith({
        actorId: 'test-user',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });
    });
  });

  describe('セキュリティ是正の監査の種別と実行者の無い記録（要件40.1）', () => {
    it('新しい種別を表示名で表示する', () => {
      const logs: AuditLog[] = securityRemediationActions.map((action, i) => ({
        id: `sec-${i}`,
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        action,
        createdAt: new Date().toISOString(),
      }));

      render(<AuditLogViewer logs={logs} loading={false} />);

      for (const action of securityRemediationActions) {
        expect(screen.getByText(securityRemediationActionLabels[action])).toBeInTheDocument();
        expect(screen.queryByText(action)).not.toBeInTheDocument();
      }
    });

    it('実行者の無い記録の実行者を「システム」と表示する', () => {
      const logs: AuditLog[] = [
        {
          id: 'archive-1',
          actorId: null,
          action: 'AUDIT_ARCHIVE_CREATED',
          createdAt: new Date().toISOString(),
        },
      ];

      render(<AuditLogViewer logs={logs} loading={false} />);

      const row = screen.getByText('監査ログのアーカイブ').closest('tr') as HTMLElement;
      expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(/^システム$/);
    });
  });

  it('招待の作成と取り消しの記録を表示名で表示する（要件40.5）', () => {
    const logs: AuditLog[] = [
      {
        id: 'inv-created',
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        action: 'INVITATION_CREATED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'inv-revoked',
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        action: 'INVITATION_REVOKED',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<AuditLogViewer logs={logs} loading={false} />);

    expect(screen.getByText('招待作成')).toBeInTheDocument();
    expect(screen.getByText('招待取り消し')).toBeInTheDocument();
    expect(screen.queryByText('INVITATION_CREATED')).not.toBeInTheDocument();
    expect(screen.queryByText('INVITATION_REVOKED')).not.toBeInTheDocument();
  });

  describe('招待の記録の対象の表示（要件40.12）', () => {
    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('招待の作成・取り消し・再送信の記録の対象に招待先のメールアドレスを表示し、招待の ID を出さない', () => {
      const actions = ['INVITATION_CREATED', 'INVITATION_REVOKED', 'INVITATION_RESENT'] as const;
      const logs: AuditLog[] = actions.map((action, i) => ({
        id: `inv-${i}`,
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        action,
        targetType: 'Invitation',
        targetId: `invitation-id-${i}`,
        metadata: { email: `invitee-${i}@example.com` },
        createdAt: new Date().toISOString(),
      }));

      render(<AuditLogViewer logs={logs} loading={false} />);

      actions.forEach((_, i) => {
        const email = screen.getByText(`invitee-${i}@example.com`);
        // 1行目の対象の種別は変えない
        expect(email.previousElementSibling).toHaveTextContent(/^Invitation$/);
      });
      expect(screen.queryByText(/invitation-id-/)).not.toBeInTheDocument();
    });

    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('メールアドレスの無い招待の記録と他の種別の記録は従来どおり対象の名前または ID を表示する', () => {
      const logs: AuditLog[] = [
        {
          id: 'inv-no-email',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          action: 'INVITATION_CREATED',
          targetType: 'Invitation',
          targetId: 'invitation-without-email',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'user-row',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          action: 'USER_DEACTIVATED',
          targetType: 'user',
          targetId: 'user-1',
          targetName: '山田太郎',
          metadata: { email: 'other@example.com' },
          createdAt: new Date().toISOString(),
        },
      ];

      render(<AuditLogViewer logs={logs} loading={false} />);

      expect(screen.getByText('invitation-without-email')).toBeInTheDocument();
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
      expect(screen.queryByText('other@example.com')).not.toBeInTheDocument();
    });
  });

  it('ユーザーの削除の記録を表示名で表示する（要件40.6）', () => {
    const logs: AuditLog[] = [
      {
        id: 'user-deleted',
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        action: 'USER_DELETED',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<AuditLogViewer logs={logs} loading={false} />);

    expect(screen.getByText('ユーザー削除')).toBeInTheDocument();
    expect(screen.queryByText('USER_DELETED')).not.toBeInTheDocument();
  });

  it('プロジェクトの完全削除の記録を表示名で表示する（project-management 要件46.6）', () => {
    const logs: AuditLog[] = [
      {
        id: 'project-purged',
        actorId: null,
        action: 'PROJECT_PURGED',
        targetType: 'Project',
        targetId: 'purged-project-1',
        metadata: { counts: { files: 2 } },
        createdAt: new Date().toISOString(),
      },
    ];

    render(<AuditLogViewer logs={logs} loading={false} />);

    expect(screen.getByText('プロジェクトの完全削除')).toBeInTheDocument();
    expect(screen.queryByText('PROJECT_PURGED')).not.toBeInTheDocument();
  });

  it.each([
    ['PROJECT_PURGE_EXCLUDED', 'プロジェクトの完全削除の対象外化', 'Project'],
    ['PROJECT_PURGE_REQUEUED', 'プロジェクトの完全削除の対象への復帰', 'Project'],
    ['PROJECT_PURGE_RUN_COMPLETED', 'プロジェクトの完全削除の定期処理の結果', 'ProjectPurgeRun'],
  ] as const)(
    '%s の記録を「%s」と表示する（project-management 要件46.11・46.14・46.15）',
    (action, label, targetType) => {
      const logs: AuditLog[] = [
        {
          id: `log-${action}`,
          actorId: null,
          action,
          targetType,
          targetId: 'target-1',
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ];

      render(<AuditLogViewer logs={logs} loading={false} />);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByText(action)).not.toBeInTheDocument();
    }
  );
});
