/**
 * @fileoverview StorageWarningBanner コンポーネントのテスト
 *
 * Task 35.4: QuotaExceededError時のユーザー警告UIを実装する
 * Task 35.5: プライベートブラウジングモード時の警告UIを実装する
 *
 * Requirements:
 * - 15.8: QuotaExceededError時のユーザー警告
 * - 15.9: プライベートブラウジングモード対応
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StorageWarningBanner, {
  type StorageWarningType,
} from '../../../components/site-surveys/StorageWarningBanner';

describe('StorageWarningBanner', () => {
  const mockOnDismiss = vi.fn();
  const mockOnSaveNow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('QuotaExceeded warning (Task 35.4)', () => {
    it('should render quota exceeded warning message', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      expect(screen.getByText(/自動保存に失敗しました/)).toBeInTheDocument();
    });

    it('should show "Save Now" button for quota exceeded', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      const saveButton = screen.getByRole('button', { name: /今すぐ保存/ });
      expect(saveButton).toBeInTheDocument();
    });

    it('should call onSaveNow when "Save Now" button is clicked', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      const saveButton = screen.getByRole('button', { name: /今すぐ保存/ });
      fireEvent.click(saveButton);

      expect(mockOnSaveNow).toHaveBeenCalledTimes(1);
    });

    it('should show dismiss button for quota exceeded', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      const dismissButton = screen.getByRole('button', { name: /閉じる/ });
      expect(dismissButton).toBeInTheDocument();
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      const dismissButton = screen.getByRole('button', { name: /閉じる/ });
      fireEvent.click(dismissButton);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Private browsing warning (Task 35.5)', () => {
    it('should render private browsing warning message', () => {
      render(
        <StorageWarningBanner
          type="private-browsing"
          onDismiss={mockOnDismiss}
        />
      );

      expect(screen.getByText(/自動保存が無効です/)).toBeInTheDocument();
    });

    it('should explain that private browsing disables auto-save', () => {
      render(
        <StorageWarningBanner
          type="private-browsing"
          onDismiss={mockOnDismiss}
        />
      );

      expect(
        screen.getByText(/プライベートブラウジングモード/)
      ).toBeInTheDocument();
    });

    it('should show "Do not show again" checkbox for private browsing', () => {
      render(
        <StorageWarningBanner
          type="private-browsing"
          onDismiss={mockOnDismiss}
          showDoNotShowAgain
        />
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /今後表示しない/,
      });
      expect(checkbox).toBeInTheDocument();
    });

    it('should call onDismiss with doNotShowAgain flag when checked and dismissed', () => {
      render(
        <StorageWarningBanner
          type="private-browsing"
          onDismiss={mockOnDismiss}
          showDoNotShowAgain
        />
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /今後表示しない/,
      });
      fireEvent.click(checkbox);

      const dismissButton = screen.getByRole('button', { name: /閉じる/ });
      fireEvent.click(dismissButton);

      expect(mockOnDismiss).toHaveBeenCalledWith(true);
    });

    it('should not show "Save Now" button for private browsing mode', () => {
      render(
        <StorageWarningBanner
          type="private-browsing"
          onDismiss={mockOnDismiss}
        />
      );

      expect(
        screen.queryByRole('button', { name: /今すぐ保存/ })
      ).not.toBeInTheDocument();
    });
  });

  describe('Styling and accessibility', () => {
    it('should have role="alert" for accessibility', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should use warning colors for quota exceeded', () => {
      const { container } = render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      const banner = container.firstChild as HTMLElement;
      expect(banner).toHaveAttribute('data-warning-type', 'quota-exceeded');
    });

    it('should use info colors for private browsing', () => {
      const { container } = render(
        <StorageWarningBanner
          type="private-browsing"
          onDismiss={mockOnDismiss}
        />
      );

      const banner = container.firstChild as HTMLElement;
      expect(banner).toHaveAttribute('data-warning-type', 'private-browsing');
    });
  });

  describe('Type guard', () => {
    it('should accept valid warning types', () => {
      const types: StorageWarningType[] = ['quota-exceeded', 'private-browsing'];

      types.forEach((type) => {
        const { unmount } = render(
          <StorageWarningBanner
            type={type}
            onDismiss={mockOnDismiss}
          />
        );
        unmount();
      });
    });
  });

  describe('Hidden state', () => {
    it('should not render when isVisible is false', () => {
      const { container } = render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
          isVisible={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when isVisible is true', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
          isVisible={true}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should render by default when isVisible is not provided', () => {
      render(
        <StorageWarningBanner
          type="quota-exceeded"
          onDismiss={mockOnDismiss}
          onSaveNow={mockOnSaveNow}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
