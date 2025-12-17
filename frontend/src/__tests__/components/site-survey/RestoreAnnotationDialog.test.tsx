/**
 * RestoreAnnotationDialog Component Tests
 *
 * 未保存データ復元確認ダイアログのテスト
 *
 * @see tasks.md - Task 18.3
 * @see requirements.md - Requirement 13.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestoreAnnotationDialog } from '../../../components/site-survey/RestoreAnnotationDialog';

describe('RestoreAnnotationDialog', () => {
  const defaultProps = {
    isOpen: true,
    localSavedAt: '2025/01/01 12:00:00',
    serverUpdatedAt: '2025/01/01 11:00:00',
    isLocalNewer: true,
    hasServerConflict: false,
    localObjectCount: 5,
    serverObjectCount: 3,
    onRestore: vi.fn(),
    onDiscard: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<RestoreAnnotationDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render dialog when isOpen is true', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should display dialog title', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByText(/未保存のデータがあります/)).toBeInTheDocument();
    });

    it('should display local save timestamp', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByText(/2025\/01\/01 12:00:00/)).toBeInTheDocument();
    });

    it('should display server update timestamp', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByText(/2025\/01\/01 11:00:00/)).toBeInTheDocument();
    });

    it('should display object counts', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByText(/注釈数: 5個/)).toBeInTheDocument();
      expect(screen.getByText(/注釈数: 3個/)).toBeInTheDocument();
    });
  });

  describe('conflict warning', () => {
    it('should show conflict warning when hasServerConflict is true', () => {
      render(<RestoreAnnotationDialog {...defaultProps} hasServerConflict={true} />);

      expect(
        screen.getByText(/サーバー側のデータが更新されています/)
      ).toBeInTheDocument();
    });

    it('should not show conflict warning when hasServerConflict is false', () => {
      render(<RestoreAnnotationDialog {...defaultProps} hasServerConflict={false} />);

      expect(
        screen.queryByText(/サーバー側のデータが更新されています/)
      ).not.toBeInTheDocument();
    });
  });

  describe('local newer indication', () => {
    it('should indicate when local data is newer', () => {
      render(<RestoreAnnotationDialog {...defaultProps} isLocalNewer={true} />);

      expect(screen.getByText(/ローカル.*新しい/i)).toBeInTheDocument();
    });

    it('should indicate when server data is newer', () => {
      render(<RestoreAnnotationDialog {...defaultProps} isLocalNewer={false} />);

      expect(screen.getByText(/サーバー.*新しい/i)).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should call onRestore when restore button is clicked', () => {
      const onRestore = vi.fn();
      render(<RestoreAnnotationDialog {...defaultProps} onRestore={onRestore} />);

      fireEvent.click(screen.getByRole('button', { name: /復元/ }));

      expect(onRestore).toHaveBeenCalledTimes(1);
    });

    it('should call onDiscard when discard button is clicked', () => {
      const onDiscard = vi.fn();
      render(<RestoreAnnotationDialog {...defaultProps} onDiscard={onDiscard} />);

      fireEvent.click(screen.getByRole('button', { name: /破棄/ }));

      expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it('should call onDismiss when dismiss/close button is clicked', () => {
      const onDismiss = vi.fn();
      render(<RestoreAnnotationDialog {...defaultProps} onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /閉じる|後で/ }));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('button labels', () => {
    it('should have restore button with appropriate label', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /復元/ })).toBeInTheDocument();
    });

    it('should have discard button with appropriate label', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /破棄/ })).toBeInTheDocument();
    });

    it('should have dismiss button with appropriate label', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /閉じる|後で/ })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper aria attributes on dialog', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('should have focus trap within dialog', () => {
      render(<RestoreAnnotationDialog {...defaultProps} />);

      // Dialog should be focusable
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('null values handling', () => {
    it('should handle null localSavedAt gracefully', () => {
      render(<RestoreAnnotationDialog {...defaultProps} localSavedAt={null} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should handle null serverUpdatedAt gracefully', () => {
      render(<RestoreAnnotationDialog {...defaultProps} serverUpdatedAt={null} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/新規/)).toBeInTheDocument(); // Indicates no server data
    });
  });
});
