/**
 * 監査ログ画面のテスト
 *
 * 要件22: 監査ログとコンプライアンス
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogs } from '../../pages/AuditLogs';
import type { AuditLog, AuditLogAction } from '../../types/audit-log.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

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

// document.createElementの元の参照を保存
const _originalCreateElement = document.createElement.bind(document);

describe('AuditLogs Component', () => {
  // 基本的なモックログ（3件）
  const basicMockLogs: AuditLog[] = [
    {
      id: 'log-1',
      actorId: 'user-1',
      actorEmail: 'admin@example.com',
      action: 'LOGIN_SUCCESS',
      targetType: 'user',
      targetId: 'user-1',
      targetName: 'Admin User',
      ipAddress: '192.168.1.1',
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'log-2',
      actorId: 'user-2',
      actorEmail: 'user@example.com',
      action: 'TWO_FACTOR_ENABLED',
      targetType: 'user',
      targetId: 'user-2',
      targetName: 'Test User',
      ipAddress: '192.168.1.2',
      before: { twoFactorEnabled: false },
      after: { twoFactorEnabled: true },
      createdAt: '2025-01-02T00:00:00Z',
    },
    {
      id: 'log-3',
      actorId: 'user-1',
      actorEmail: 'admin@example.com',
      action: 'ROLE_CREATED',
      targetType: 'role',
      targetId: 'role-1',
      targetName: 'Manager',
      ipAddress: '192.168.1.1',
      createdAt: '2025-01-03T00:00:00Z',
    },
  ];

  // ページネーション用（20件以上）
  const paginationMockLogs: AuditLog[] = Array.from({ length: 25 }, (_, i) => ({
    id: `log-${i + 1}`,
    actorId: 'user-1',
    actorEmail: 'admin@example.com',
    action: 'LOGIN_SUCCESS',
    targetType: 'user',
    targetId: 'user-1',
    targetName: 'Admin User',
    ipAddress: '192.168.1.1',
    createdAt: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));

  const mockLogs = basicMockLogs;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('監査ログ一覧表示', () => {
    it('初期ロード時に監査ログ一覧を表示する（要件22.1）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      // ローディング表示
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();

      // ログ一覧が表示される
      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      expect(screen.getByText('user@example.com')).toBeInTheDocument();
      expect(screen.getAllByText(/IP: 192\.168\.1\.1/).length).toBeGreaterThan(0);
    });

    it('ログ情報（日時、イベント種別、実行者、対象、詳細）を表示する（要件22.2）', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // イベント種別（日本語ラベル）
      expect(screen.getAllByText('ログイン成功').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2FA有効化').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ロール作成').length).toBeGreaterThan(0);

      // 実行者
      expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      expect(screen.getByText('user@example.com')).toBeInTheDocument();

      // 対象
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('Manager')).toBeInTheDocument();

      // 詳細（IPアドレス、変更前後）
      expect(screen.getAllByText(/IP: 192\.168\.1\.1/).length).toBeGreaterThan(0);
      expect(screen.getByText(/変更前: .*twoFactorEnabled.*false/)).toBeInTheDocument();
      expect(screen.getByText(/変更後: .*twoFactorEnabled.*true/)).toBeInTheDocument();
    });

    it('ログがない場合は空状態を表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([]);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getByText('監査ログがありません')).toBeInTheDocument();
      });
    });

    it('ログ取得失敗時にエラーメッセージを表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockRejectedValue({
        statusCode: 500,
        message: 'サーバーエラー',
      });

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getByText('監査ログを取得できませんでした')).toBeInTheDocument();
      });
    });
  });

  describe('フィルター機能', () => {
    it('イベント種別フィルターを変更するとログを再取得する（要件22.3）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // イベント種別フィルターを変更
      const actionFilter = screen.getByLabelText('イベント種別');
      await user.selectOptions(actionFilter, 'TWO_FACTOR_ENABLED');

      // APIが再度呼ばれる（フィルター付き）
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('action=TWO_FACTOR_ENABLED')
        );
      });
    });

    it('開始日時フィルターを変更するとログを再取得する（要件22.3）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // 開始日時フィルターを変更
      const startDateInput = screen.getByLabelText('開始日時');
      await user.type(startDateInput, '2025-01-01T00:00');

      // APIが再度呼ばれる（フィルター付き）
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('startDate='));
      });
    });

    it('終了日時フィルターを変更するとログを再取得する（要件22.3）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // 終了日時フィルターを変更
      const endDateInput = screen.getByLabelText('終了日時');
      await user.type(endDateInput, '2025-01-31T23:59');

      // APIが再度呼ばれる（フィルター付き）
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('endDate='));
      });
    });

    it('フィルター変更時にページ番号を0にリセットする', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // 次のページへ移動
      const nextButton = screen.getByText('次へ');
      await user.click(nextButton);

      // フィルターを変更
      const actionFilter = screen.getByLabelText('イベント種別');
      await user.selectOptions(actionFilter, 'LOGIN_SUCCESS');

      // ページ番号が1（ページ1として表示）にリセットされる
      await waitFor(() => {
        expect(screen.getByText('ページ 1')).toBeInTheDocument();
      });
    });
  });

  describe('ページネーション', () => {
    it('次へボタンをクリックすると次のページを表示する（要件22.4）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(paginationMockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // 次へボタンをクリック
      const nextButton = screen.getByText('次へ');
      await user.click(nextButton);

      // ページ番号が2になる
      await waitFor(() => {
        expect(screen.getByText('ページ 2')).toBeInTheDocument();
      });

      // APIが呼ばれる（skip=20）
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('skip=20'));
    });

    it('前へボタンをクリックすると前のページを表示する（要件22.4）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(paginationMockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // 次へボタンをクリックしてページ2へ
      const nextButton = screen.getByText('次へ');
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('ページ 2')).toBeInTheDocument();
      });

      // 前へボタンをクリック
      const prevButton = screen.getByText('前へ');
      await user.click(prevButton);

      // ページ番号が1に戻る
      await waitFor(() => {
        expect(screen.getByText('ページ 1')).toBeInTheDocument();
      });
    });

    it('最初のページで前へボタンが無効化される', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      const prevButton = screen.getByText('前へ');
      expect(prevButton).toBeDisabled();
    });

    it('ログ数がページサイズ未満の場合、次へボタンが無効化される', async () => {
      const { apiClient } = await import('../../api/client');
      // 3件（20件未満）のログを返す
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      const nextButton = screen.getByText('次へ');
      expect(nextButton).toBeDisabled();
    });
  });

  describe('JSONエクスポート', () => {
    it('JSONエクスポートボタンをクリックするとダウンロードが開始される（要件22.5）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      // Blob, URL.createObjectURL, URL.revokeObjectURL をモック
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      globalThis.URL.revokeObjectURL = vi.fn();

      // document.createElement('a').click() をモック
      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
        style: {},
      } as unknown as HTMLAnchorElement;

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return mockAnchor;
        }
        return _originalCreateElement(tagName);
      });

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // エクスポートボタンをクリック
      const exportButton = screen.getByLabelText('JSONエクスポート');
      await user.click(exportButton);

      // エクスポートAPIが呼ばれる
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/audit-logs/export'),
          { disableRetry: true }
        );
      });

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('エクスポートが完了しました')).toBeInTheDocument();
      });

      // クリーンアップ
      vi.mocked(document.createElement).mockRestore();
    });

    it('JSONエクスポート失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // 初回取得は成功
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockLogs);

      // エクスポートは失敗
      vi.mocked(apiClient.get).mockRejectedValueOnce({
        statusCode: 500,
        message: 'エクスポート失敗',
      });

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // エクスポートボタンをクリック
      const exportButton = screen.getByLabelText('JSONエクスポート');
      await user.click(exportButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('エクスポートに失敗しました')).toBeInTheDocument();
      });
    });

    it('フィルター適用時にエクスポートもフィルターが適用される（要件22.6）', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // 初回取得は成功
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
        style: {},
      } as unknown as HTMLAnchorElement;

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return mockAnchor;
        }
        return _originalCreateElement(tagName);
      });

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // フィルターを設定
      const actionFilter = screen.getByLabelText('イベント種別');
      await user.selectOptions(actionFilter, 'LOGIN_SUCCESS');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('action=LOGIN_SUCCESS'));
      });

      // エクスポートボタンをクリック
      const exportButton = screen.getByLabelText('JSONエクスポート');
      await user.click(exportButton);

      // エクスポートAPIにもフィルターが適用される
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringMatching(/\/api\/v1\/audit-logs\/export.*action=LOGIN_SUCCESS/),
          { disableRetry: true }
        );
      });

      vi.mocked(document.createElement).mockRestore();
    });
  });

  describe('レスポンシブデザイン', () => {
    it('モバイルビューポートでモバイル最適化クラスを適用する', async () => {
      // モバイルビューポートをシミュレート（768px未満）
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      render(<AuditLogs />);

      const container = screen.getByTestId('audit-logs-container');
      expect(container).toHaveClass('mobile-optimized');
    });
  });

  describe('アクセシビリティ', () => {
    it('エラーメッセージにaria-live属性が設定されている', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockRejectedValue({
        statusCode: 500,
        message: 'サーバーエラー',
      });

      render(<AuditLogs />);

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toHaveAttribute('aria-live', 'polite');
        expect(errorMessage).toHaveTextContent('監査ログを取得できませんでした');
      });
    });

    it('成功メッセージにaria-live属性が設定されている', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // 初回取得は成功
      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
        style: {},
      } as unknown as HTMLAnchorElement;

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return mockAnchor;
        }
        return _originalCreateElement(tagName);
      });

      render(<AuditLogs />);

      await waitFor(() => {
        expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0);
      });

      // エクスポートボタンをクリック
      const exportButton = screen.getByLabelText('JSONエクスポート');
      await user.click(exportButton);

      // 成功メッセージが表示される
      await waitFor(() => {
        const successMessage = screen.getByRole('alert');
        expect(successMessage).toHaveAttribute('aria-live', 'polite');
        expect(successMessage).toHaveTextContent('エクスポートが完了しました');
      });

      vi.mocked(document.createElement).mockRestore();
    });
  });

  describe('セキュリティ是正の監査の種別と実行者の無い記録（要件40.1）', () => {
    const securityLogs: AuditLog[] = securityRemediationActions.map((action, i) => ({
      id: `sec-${i}`,
      actorId: 'admin-1',
      actorEmail: 'admin@example.com',
      action,
      targetType: 'user',
      targetId: `target-${i}`,
      createdAt: '2026-10-17T00:00:00Z',
    }));

    it('新しい種別を一覧で表示名により表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(securityLogs);

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      for (const action of securityRemediationActions) {
        const row = within(table)
          .getByText(`target-${securityRemediationActions.indexOf(action)}`)
          .closest('tr') as HTMLElement;
        expect(within(row).getByText(securityRemediationActionLabels[action])).toBeInTheDocument();
        expect(within(row).queryByText(action)).not.toBeInTheDocument();
      }
    });

    it('イベント種別の絞り込みの一覧に新しい種別を表示名で並べる', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([]);

      render(<AuditLogs />);

      const actionFilter = screen.getByLabelText('イベント種別');
      for (const action of securityRemediationActions) {
        const option = within(actionFilter).getByRole('option', {
          name: securityRemediationActionLabels[action],
        });
        expect(option).toHaveValue(action);
      }
    });

    it.each(securityRemediationActions)(
      'イベント種別 %s で絞り込むと、その種別で再取得する',
      async (action) => {
        const user = userEvent.setup();
        const { apiClient } = await import('../../api/client');
        vi.mocked(apiClient.get).mockResolvedValue([]);

        render(<AuditLogs />);
        await screen.findByText('監査ログがありません');

        await user.selectOptions(screen.getByLabelText('イベント種別'), action);

        await waitFor(() => {
          expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining(`action=${action}`));
        });
      }
    );

    it('実行者の無い記録の実行者を「システム」と表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([
        {
          id: 'auto-1',
          actorId: null,
          action: 'USER_AUTO_DEACTIVATED',
          targetType: 'user',
          targetId: 'inactive-user',
          metadata: { trigger: 'inactivity' },
          createdAt: '2026-10-17T00:00:00Z',
        },
        {
          id: 'login-failed-1',
          actorId: null,
          action: 'LOGIN_FAILED',
          targetType: 'user',
          targetId: 'unknown-email',
          metadata: { email: 'nobody@example.com' },
          createdAt: '2026-10-17T00:00:00Z',
        },
        ...basicMockLogs,
      ] satisfies AuditLog[]);

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      const autoRow = within(table).getByText('inactive-user').closest('tr') as HTMLElement;
      const failedRow = within(table).getByText('unknown-email').closest('tr') as HTMLElement;
      expect(within(autoRow).getAllByRole('cell')[2]).toHaveTextContent(/^システム$/);
      expect(within(failedRow).getAllByRole('cell')[2]).toHaveTextContent(/^システム$/);
      // 実行者のある記録は従来どおりメールアドレスを表示する
      const actorRow = within(table).getByText('Manager').closest('tr') as HTMLElement;
      expect(within(actorRow).getAllByRole('cell')[2]).toHaveTextContent('admin@example.com');
    });
  });

  describe('招待の作成と取り消しの監査の種別（要件40.5）', () => {
    const invitationActionLabels = {
      INVITATION_CREATED: '招待作成',
      INVITATION_REVOKED: '招待取り消し',
    } as const satisfies Partial<Record<AuditLogAction, string>>;
    const invitationActions = Object.keys(
      invitationActionLabels
    ) as (keyof typeof invitationActionLabels)[];

    it('招待の作成と取り消しを一覧で表示名により表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue(
        invitationActions.map((action, i) => ({
          id: `inv-${i}`,
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          action,
          targetType: 'Invitation',
          targetId: `invitation-${i}`,
          createdAt: '2026-10-24T00:00:00Z',
        })) satisfies AuditLog[]
      );

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      invitationActions.forEach((action, i) => {
        const row = within(table).getByText(`invitation-${i}`).closest('tr') as HTMLElement;
        expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(
          new RegExp(`^${invitationActionLabels[action]}$`)
        );
      });
    });

    it.each(invitationActions)(
      'イベント種別の絞り込みに %s を表示名で並べ、選ぶとその種別で再取得する',
      async (action) => {
        const user = userEvent.setup();
        const { apiClient } = await import('../../api/client');
        vi.mocked(apiClient.get).mockResolvedValue([]);

        render(<AuditLogs />);
        await screen.findByText('監査ログがありません');

        const actionFilter = screen.getByLabelText('イベント種別');
        const option = within(actionFilter).getByRole('option', {
          name: invitationActionLabels[action],
        });
        expect(option).toHaveValue(action);

        await user.selectOptions(actionFilter, invitationActionLabels[action]);

        await waitFor(() => {
          expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining(`action=${action}`));
        });
      }
    );
  });

  describe('招待の記録の対象の表示（要件40.12）', () => {
    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('招待の作成・取り消し・再送信の記録の対象の欄に招待先のメールアドレスを表示し、招待の ID を出さない', async () => {
      const { apiClient } = await import('../../api/client');
      const actions = ['INVITATION_CREATED', 'INVITATION_REVOKED', 'INVITATION_RESENT'] as const;
      vi.mocked(apiClient.get).mockResolvedValue(
        actions.map((action, i) => ({
          id: `inv-${i}`,
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          action,
          targetType: 'Invitation',
          targetId: `invitation-id-${i}`,
          metadata: { email: `invitee-${i}@example.com`, inviterId: 'admin-1' },
          createdAt: '2026-10-26T00:00:00Z',
        })) satisfies AuditLog[]
      );

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      actions.forEach((_, i) => {
        const row = within(table)
          .getByText(`invitee-${i}@example.com`)
          .closest('tr') as HTMLElement;
        expect(within(row).getAllByRole('cell')[3]).toHaveTextContent(
          new RegExp(`^invitee-${i}@example\\.com$`)
        );
      });
      expect(within(table).queryByText(/invitation-id-/)).not.toBeInTheDocument();
    });

    /**
     * @requirement user-authentication/REQ-40.12
     */
    it('メールアドレスの無い招待の記録と他の種別の記録は従来どおり対象の名前または ID を表示する', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([
        {
          id: 'inv-no-email',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          action: 'INVITATION_CREATED',
          targetType: 'Invitation',
          targetId: 'invitation-without-email',
          createdAt: '2026-10-26T00:00:00Z',
        },
        {
          id: 'login-failed-1',
          actorId: null,
          action: 'LOGIN_FAILED',
          targetType: 'user',
          targetId: 'unknown-email',
          metadata: { email: 'nobody@example.com' },
          createdAt: '2026-10-26T00:00:00Z',
        },
        ...basicMockLogs,
      ] satisfies AuditLog[]);

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      const cells = (text: string) =>
        within(within(table).getByText(text).closest('tr') as HTMLElement).getAllByRole('cell');
      expect(cells('invitation-without-email')[3]).toHaveTextContent(/^invitation-without-email$/);
      expect(cells('unknown-email')[3]).toHaveTextContent(/^unknown-email$/);
      expect(cells('Manager')[3]).toHaveTextContent(/^Manager$/);
      expect(within(table).queryByText('nobody@example.com')).not.toBeInTheDocument();
    });
  });

  describe('ユーザーの削除の監査の種別（要件40.6）', () => {
    it('ユーザーの削除を一覧で表示名により表示し、種別のコードを出さない', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([
        {
          id: 'deleted-1',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          action: 'USER_DELETED',
          targetType: 'User',
          targetId: 'deleted-user-1',
          createdAt: '2026-10-25T00:00:00Z',
        },
      ] satisfies AuditLog[]);

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      const row = within(table).getByText('deleted-user-1').closest('tr') as HTMLElement;
      expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(/^ユーザー削除$/);
      expect(within(table).queryByText('USER_DELETED')).not.toBeInTheDocument();
    });

    it('イベント種別の絞り込みにユーザーの削除を表示名で並べ、選ぶとその種別で再取得する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([]);

      render(<AuditLogs />);
      await screen.findByText('監査ログがありません');

      const actionFilter = screen.getByLabelText('イベント種別');
      const option = within(actionFilter).getByRole('option', { name: 'ユーザー削除' });
      expect(option).toHaveValue('USER_DELETED');

      await user.selectOptions(actionFilter, 'ユーザー削除');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('action=USER_DELETED'));
      });
    });
  });

  describe('プロジェクトの完全削除の監査の種別（project-management 要件46.6）', () => {
    it('完全削除の記録を一覧で表示名により表示し、種別のコードを出さない', async () => {
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([
        {
          id: 'purged-1',
          actorId: null,
          action: 'PROJECT_PURGED',
          targetType: 'Project',
          targetId: 'purged-project-1',
          metadata: { counts: { files: 2 } },
          createdAt: '2026-11-10T00:00:00Z',
        },
      ] satisfies AuditLog[]);

      render(<AuditLogs />);

      const table = await screen.findByRole('table');
      const row = within(table).getByText('purged-project-1').closest('tr') as HTMLElement;
      expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(/^プロジェクトの完全削除$/);
      expect(within(table).queryByText('PROJECT_PURGED')).not.toBeInTheDocument();
    });

    it('イベント種別の絞り込みに完全削除を表示名で並べ、選ぶとその種別で再取得する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');
      vi.mocked(apiClient.get).mockResolvedValue([]);

      render(<AuditLogs />);
      await screen.findByText('監査ログがありません');

      const actionFilter = screen.getByLabelText('イベント種別');
      const option = within(actionFilter).getByRole('option', { name: 'プロジェクトの完全削除' });
      expect(option).toHaveValue('PROJECT_PURGED');

      await user.selectOptions(actionFilter, 'プロジェクトの完全削除');

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining('action=PROJECT_PURGED')
        );
      });
    });
  });
});
