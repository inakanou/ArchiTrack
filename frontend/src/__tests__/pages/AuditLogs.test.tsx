/**
 * 監査ログ画面のテスト
 *
 * 要件22: 監査ログとコンプライアンス
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogs } from '../../pages/AuditLogs';
import type { AuditLog } from '../../types/audit-log.types';

// API clientをモック
vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: [] });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: paginationMockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: paginationMockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

      // Blob, URL.createObjectURL, URL.revokeObjectURL をモック
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      globalThis.URL.revokeObjectURL = vi.fn();

      // document.createElement('a').click() をモック
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const mockCreateElement = vi.spyOn(document, 'createElement');
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: mockClick,
          } as unknown as HTMLAnchorElement;
        }
        return originalCreateElement(tagName);
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
          expect.stringContaining('/api/v1/audit-logs/export')
        );
      });

      // 成功メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('エクスポートが完了しました')).toBeInTheDocument();
      });

      // クリーンアップ
      mockCreateElement.mockRestore();
    });

    it('JSONエクスポート失敗時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      const { apiClient } = await import('../../api/client');

      // 初回取得は成功
      vi.mocked(apiClient.get).mockResolvedValueOnce({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const mockCreateElement = vi.spyOn(document, 'createElement');
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: mockClick,
          } as unknown as HTMLAnchorElement;
        }
        return originalCreateElement(tagName);
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
          expect.stringMatching(/\/api\/v1\/audit-logs\/export.*action=LOGIN_SUCCESS/)
        );
      });

      mockCreateElement.mockRestore();
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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

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
      vi.mocked(apiClient.get).mockResolvedValue({ logs: mockLogs });

      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const mockCreateElement = vi.spyOn(document, 'createElement');
      mockCreateElement.mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: mockClick,
          } as unknown as HTMLAnchorElement;
        }
        return originalCreateElement(tagName);
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

      mockCreateElement.mockRestore();
    });
  });
});
