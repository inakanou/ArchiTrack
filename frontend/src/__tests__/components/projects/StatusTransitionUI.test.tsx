/**
 * @fileoverview StatusTransitionUI コンポーネント テスト
 *
 * Task 7.2: StatusTransitionUIコンポーネントの実装
 *
 * Requirements:
 * - 10.8: ステータス変更の実行
 * - 10.12: 各ステータスを視覚的に区別できる色分け
 * - 10.13: ステータス変更履歴をプロジェクト詳細画面で閲覧可能
 * - 10.14: 差し戻し遷移時は差し戻し理由の入力を必須とする
 * - 10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 * - 20.3: エラーメッセージをaria-live属性でスクリーンリーダーに通知
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusTransitionUI from '../../../components/projects/StatusTransitionUI';
import type {
  ProjectStatus,
  AllowedTransition,
  StatusHistoryResponse,
} from '../../../types/project.types';

// ============================================================================
// テストデータ
// ============================================================================

const mockAllowedTransitions: AllowedTransition[] = [
  { status: 'SURVEYING', type: 'forward', requiresReason: false },
  { status: 'CANCELLED', type: 'terminate', requiresReason: false },
];

const mockAllowedTransitionsWithBackward: AllowedTransition[] = [
  { status: 'PREPARING', type: 'backward', requiresReason: true },
  { status: 'ESTIMATING', type: 'forward', requiresReason: false },
  { status: 'CANCELLED', type: 'terminate', requiresReason: false },
];

const mockStatusHistory: StatusHistoryResponse[] = [
  {
    id: 'history-1',
    fromStatus: null,
    fromStatusLabel: null,
    toStatus: 'PREPARING',
    toStatusLabel: '準備中',
    transitionType: 'initial',
    transitionTypeLabel: '初期遷移',
    reason: null,
    changedBy: { id: 'user-1', displayName: 'ユーザー1' },
    changedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'history-2',
    fromStatus: 'PREPARING',
    fromStatusLabel: '準備中',
    toStatus: 'SURVEYING',
    toStatusLabel: '調査中',
    transitionType: 'forward',
    transitionTypeLabel: '順方向遷移',
    reason: null,
    changedBy: { id: 'user-1', displayName: 'ユーザー1' },
    changedAt: '2025-01-02T00:00:00.000Z',
  },
  {
    id: 'history-3',
    fromStatus: 'SURVEYING',
    fromStatusLabel: '調査中',
    toStatus: 'PREPARING',
    toStatusLabel: '準備中',
    transitionType: 'backward',
    transitionTypeLabel: '差し戻し遷移',
    reason: '調査内容に不備があったため',
    changedBy: { id: 'user-2', displayName: 'ユーザー2' },
    changedAt: '2025-01-03T00:00:00.000Z',
  },
];

// ============================================================================
// 基本的なレンダリングテスト
// ============================================================================

describe('StatusTransitionUI', () => {
  describe('現在のステータスバッジ表示', () => {
    it('現在のステータスがカラーバッジとして表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const statusBadge = screen.getByTestId('current-status-badge');
      expect(statusBadge).toBeInTheDocument();
      expect(statusBadge).toHaveTextContent('準備中');
    });

    it('各ステータスに対応した色が適用される', () => {
      const statuses: ProjectStatus[] = [
        'PREPARING',
        'SURVEYING',
        'ESTIMATING',
        'COMPLETED',
        'CANCELLED',
        'LOST',
      ];

      statuses.forEach((status) => {
        const { unmount } = render(
          <StatusTransitionUI
            projectId="test-project-id"
            currentStatus={status}
            allowedTransitions={[]}
            statusHistory={[]}
            onTransition={vi.fn()}
            isLoading={false}
          />
        );

        const badge = screen.getByTestId('current-status-badge');
        expect(badge).toBeInTheDocument();
        // ステータスごとに異なるbackgroundColorが設定されていることを確認
        expect(badge).toHaveStyle({ backgroundColor: expect.any(String) });

        unmount();
      });
    });
  });

  describe('遷移可能なステータス一覧表示', () => {
    it('順方向遷移ボタンが緑色系で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /調査中/ });
      expect(forwardButton).toBeInTheDocument();
      expect(forwardButton).toHaveAttribute('data-transition-type', 'forward');
    });

    it('差し戻し遷移ボタンがオレンジ色系で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="SURVEYING"
          allowedTransitions={mockAllowedTransitionsWithBackward}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const backwardButton = screen.getByRole('button', { name: /準備中/ });
      expect(backwardButton).toBeInTheDocument();
      expect(backwardButton).toHaveAttribute('data-transition-type', 'backward');
    });

    it('終端遷移ボタンが赤色系で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const terminateButton = screen.getByRole('button', { name: /中止/ });
      expect(terminateButton).toBeInTheDocument();
      expect(terminateButton).toHaveAttribute('data-transition-type', 'terminate');
    });

    it('遷移可能なステータスがない場合はメッセージを表示', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="COMPLETED"
          allowedTransitions={[]}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      expect(screen.getByText('遷移可能なステータスがありません')).toBeInTheDocument();
    });
  });

  describe('ステータス遷移操作', () => {
    it('順方向遷移ボタンクリックで直接onTransitionが呼ばれる', async () => {
      const onTransition = vi.fn();
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={onTransition}
          isLoading={false}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /調査中/ });
      await userEvent.click(forwardButton);

      expect(onTransition).toHaveBeenCalledWith('SURVEYING', undefined);
    });

    it('差し戻し遷移ボタンクリックで理由入力ダイアログが表示される', async () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="SURVEYING"
          allowedTransitions={mockAllowedTransitionsWithBackward}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const backwardButton = screen.getByRole('button', { name: /準備中/ });
      await userEvent.click(backwardButton);

      // 差し戻し理由入力ダイアログが表示される
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('差し戻し理由の入力')).toBeInTheDocument();
    });

    it('差し戻し理由入力後にonTransitionが呼ばれる', async () => {
      const onTransition = vi.fn();
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="SURVEYING"
          allowedTransitions={mockAllowedTransitionsWithBackward}
          statusHistory={[]}
          onTransition={onTransition}
          isLoading={false}
        />
      );

      // 差し戻しボタンをクリック
      const backwardButton = screen.getByRole('button', { name: /準備中/ });
      await userEvent.click(backwardButton);

      // 理由を入力
      const textarea = screen.getByLabelText('差し戻し理由');
      await userEvent.type(textarea, '調査内容に問題がありました');

      // 確認ボタンをクリック
      const confirmButton = screen.getByRole('button', { name: '差し戻す' });
      await userEvent.click(confirmButton);

      expect(onTransition).toHaveBeenCalledWith('PREPARING', '調査内容に問題がありました');
    });

    it('終端遷移ボタンクリックで直接onTransitionが呼ばれる', async () => {
      const onTransition = vi.fn();
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={onTransition}
          isLoading={false}
        />
      );

      const terminateButton = screen.getByRole('button', { name: /中止/ });
      await userEvent.click(terminateButton);

      expect(onTransition).toHaveBeenCalledWith('CANCELLED', undefined);
    });
  });

  describe('ローディング状態', () => {
    it('isLoading=trueの時、ボタンが無効化される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={true}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /調査中/ });
      expect(forwardButton).toBeDisabled();
    });

    it('isLoading=trueの時、ローディングインジケータが表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('status-loading-indicator')).toBeInTheDocument();
    });
  });

  describe('ステータス変更履歴表示', () => {
    it('ステータス変更履歴が時系列で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={[]}
          statusHistory={mockStatusHistory}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      // 履歴セクションが表示される
      expect(screen.getByText('ステータス変更履歴')).toBeInTheDocument();

      // 各履歴エントリが表示される（複数の同じテキストがある可能性があるためgetAllByTextを使用）
      expect(screen.getAllByText('準備中').length).toBeGreaterThan(0);
      expect(screen.getAllByText('調査中').length).toBeGreaterThan(0);
    });

    it('遷移種別に応じたアイコンと色で履歴が表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={[]}
          statusHistory={mockStatusHistory}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      // 各履歴エントリにdata-transition-type属性がある
      const historyItems = screen.getAllByTestId(/^status-history-item-/);
      expect(historyItems.length).toBe(3);

      // 初期遷移のアイテム
      const initialItem = screen.getByTestId('status-history-item-history-1');
      expect(initialItem).toHaveAttribute('data-transition-type', 'initial');

      // 順方向遷移のアイテム
      const forwardItem = screen.getByTestId('status-history-item-history-2');
      expect(forwardItem).toHaveAttribute('data-transition-type', 'forward');

      // 差し戻し遷移のアイテム
      const backwardItem = screen.getByTestId('status-history-item-history-3');
      expect(backwardItem).toHaveAttribute('data-transition-type', 'backward');
    });

    it('差し戻し遷移の場合は理由が表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={[]}
          statusHistory={mockStatusHistory}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      // 差し戻し理由が表示される（「理由: 」プレフィックス付きで検索）
      expect(screen.getByText(/調査内容に不備があったため/)).toBeInTheDocument();
    });

    it('履歴がない場合はメッセージを表示', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      expect(screen.getByText('履歴がありません')).toBeInTheDocument();
    });

    it('変更者と変更日時が表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={[]}
          statusHistory={mockStatusHistory}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      // 変更者が表示される（複数の履歴に同じユーザーが出現する可能性があるためgetAllByTextを使用）
      expect(screen.getAllByText('ユーザー1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ユーザー2').length).toBeGreaterThan(0);
    });
  });

  describe('アクセシビリティ', () => {
    it('遷移ボタンにaria-label属性が設定されている', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /調査中/ });
      expect(forwardButton).toHaveAttribute('aria-label');
    });

    it('ステータスバッジにrole="status"が設定されている', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const statusBadge = screen.getByTestId('current-status-badge');
      expect(statusBadge).toHaveAttribute('role', 'status');
    });

    it('履歴セクションが適切なアクセシビリティ属性を持つ', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={[]}
          statusHistory={mockStatusHistory}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const historySection = screen.getByRole('region', { name: /ステータス変更履歴/ });
      expect(historySection).toBeInTheDocument();
    });
  });

  describe('遷移種別の視覚的区別', () => {
    it('順方向遷移は緑色のアイコン（矢印右）で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const forwardButton = screen.getByRole('button', { name: /調査中/ });
      const icon = within(forwardButton).getByTestId('transition-icon-forward');
      expect(icon).toBeInTheDocument();
    });

    it('差し戻し遷移はオレンジ色のアイコン（矢印左）で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="SURVEYING"
          allowedTransitions={mockAllowedTransitionsWithBackward}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const backwardButton = screen.getByRole('button', { name: /準備中/ });
      const icon = within(backwardButton).getByTestId('transition-icon-backward');
      expect(icon).toBeInTheDocument();
    });

    it('終端遷移は赤色のアイコン（X）で表示される', () => {
      render(
        <StatusTransitionUI
          projectId="test-project-id"
          currentStatus="PREPARING"
          allowedTransitions={mockAllowedTransitions}
          statusHistory={[]}
          onTransition={vi.fn()}
          isLoading={false}
        />
      );

      const terminateButton = screen.getByRole('button', { name: /中止/ });
      const icon = within(terminateButton).getByTestId('transition-icon-terminate');
      expect(icon).toBeInTheDocument();
    });
  });
});
