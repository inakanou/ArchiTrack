/**
 * @fileoverview 権限管理ページのテスト
 *
 * Requirements:
 * - REQ-18: 権限管理
 * - REQ-28.39: 権限管理リンククリック → 権限管理画面遷移
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PermissionManagement } from '../../pages/PermissionManagement';

describe('PermissionManagement', () => {
  describe('表示', () => {
    it('権限管理ページが表示されること', () => {
      render(<PermissionManagement />);

      expect(screen.getByTestId('permission-management')).toBeInTheDocument();
    });

    it('ページタイトルが表示されること', () => {
      render(<PermissionManagement />);

      expect(screen.getByRole('heading', { name: '権限管理' })).toBeInTheDocument();
    });

    it('説明文が表示されること', () => {
      render(<PermissionManagement />);

      expect(screen.getByText('システムの権限を管理します。')).toBeInTheDocument();
    });

    it('プレースホルダーメッセージが表示されること', () => {
      render(<PermissionManagement />);

      expect(screen.getByText('権限管理機能は今後実装予定です。')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('見出しレベルが適切であること', () => {
      render(<PermissionManagement />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('権限管理');
    });
  });
});
