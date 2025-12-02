import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToastNotification from '../../components/ToastNotification';
import type { Toast } from '../../types/toast.types';

describe('ToastNotification', () => {
  const mockOnDismiss = vi.fn<(id: string) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('基本表示', () => {
    it('トーストが表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '保存しました',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('保存しました')).toBeInTheDocument();
    });

    it('複数のトーストがスタック表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '保存しました',
          createdAt: Date.now(),
        },
        {
          id: '2',
          type: 'error',
          message: 'エラーが発生しました',
          createdAt: Date.now() + 1000,
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('保存しました')).toBeInTheDocument();
      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });

    it('トーストが空の場合、何も表示されない', () => {
      const { container } = render(<ToastNotification toasts={[]} onDismiss={mockOnDismiss} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('トーストの種類', () => {
    it('successトーストが正しいスタイルで表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '成功メッセージ',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast = screen.getByRole('alert');
      expect(toast).toHaveStyle({ backgroundColor: expect.stringContaining('#') });
    });

    it('errorトーストが正しいスタイルで表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'error',
          message: 'エラーメッセージ',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast = screen.getByRole('alert');
      expect(toast).toHaveStyle({ backgroundColor: expect.stringContaining('#') });
    });

    it('warningトーストが正しいスタイルで表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'warning',
          message: '警告メッセージ',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast = screen.getByRole('alert');
      expect(toast).toHaveStyle({ backgroundColor: expect.stringContaining('#') });
    });

    it('infoトーストが正しいスタイルで表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'info',
          message: '情報メッセージ',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast = screen.getByRole('alert');
      expect(toast).toHaveStyle({ backgroundColor: expect.stringContaining('#') });
    });
  });

  describe('自動非表示', () => {
    it('5秒後に自動的に非表示になる（デフォルト）', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '自動非表示テスト',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(mockOnDismiss).not.toHaveBeenCalled();

      // 5秒進める
      vi.advanceTimersByTime(5000);

      expect(mockOnDismiss).toHaveBeenCalledWith('1');
    });

    it('カスタム期間後に自動的に非表示になる', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: 'カスタム期間テスト',
          duration: 3000,
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      // 3秒進める
      vi.advanceTimersByTime(3000);

      expect(mockOnDismiss).toHaveBeenCalledWith('1');
    });
  });

  describe('手動閉じる', () => {
    it('閉じるボタンをクリックするとonDismissが呼ばれる', async () => {
      vi.useRealTimers(); // userEvent用にリアルタイマーを使用
      const user = userEvent.setup({ delay: null });
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '手動閉じるテスト',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button', { name: /閉じる/i });
      await user.click(closeButton);

      expect(mockOnDismiss).toHaveBeenCalledWith('1');
      vi.useFakeTimers(); // テスト終了後にフェイクタイマーに戻す
    });

    it('dismissible=falseの場合、閉じるボタンが表示されない', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '閉じるボタンなし',
          dismissible: false,
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(screen.queryByRole('button', { name: /閉じる/i })).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('トーストにrole="alert"が設定されている', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: 'アクセシビリティテスト',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast = screen.getByRole('alert');
      expect(toast).toBeInTheDocument();
    });

    it('トーストにaria-live="polite"が設定されている', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: 'aria-liveテスト',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast = screen.getByRole('alert');
      expect(toast).toHaveAttribute('aria-live', 'polite');
    });

    it('閉じるボタンにaria-label属性が設定されている', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: 'aria-labelテスト',
          createdAt: Date.now(),
        },
      ];

      render(<ToastNotification toasts={toasts} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button', { name: /閉じる/i });
      expect(closeButton).toHaveAttribute('aria-label');
    });
  });

  describe('表示位置', () => {
    it('position="top-right"の場合、右上に表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '右上表示',
          createdAt: Date.now(),
        },
      ];

      const { container } = render(
        <ToastNotification toasts={toasts} onDismiss={mockOnDismiss} position="top-right" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ top: '20px', right: '20px' });
    });

    it('position="bottom-left"の場合、左下に表示される', () => {
      const toasts: Toast[] = [
        {
          id: '1',
          type: 'success',
          message: '左下表示',
          createdAt: Date.now(),
        },
      ];

      const { container } = render(
        <ToastNotification toasts={toasts} onDismiss={mockOnDismiss} position="bottom-left" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ bottom: '20px', left: '20px' });
    });
  });
});
