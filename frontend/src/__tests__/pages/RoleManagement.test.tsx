/**
 * @fileoverview ロール管理ページのテスト
 *
 * Requirements:
 * - REQ-17: 動的ロール管理
 * - REQ-28.38: ロール管理リンククリック → ロール管理画面遷移
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RoleManagement } from '../../pages/RoleManagement';

describe('RoleManagement', () => {
  describe('表示', () => {
    it('ロール管理ページが表示されること', () => {
      render(<RoleManagement />);

      expect(screen.getByTestId('role-management')).toBeInTheDocument();
    });

    it('ページタイトルが表示されること', () => {
      render(<RoleManagement />);

      expect(screen.getByRole('heading', { name: 'ロール管理' })).toBeInTheDocument();
    });

    it('説明文が表示されること', () => {
      render(<RoleManagement />);

      expect(screen.getByText('システムのロールを管理します。')).toBeInTheDocument();
    });

    it('プレースホルダーメッセージが表示されること', () => {
      render(<RoleManagement />);

      expect(screen.getByText('ロール管理機能は今後実装予定です。')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('見出しレベルが適切であること', () => {
      render(<RoleManagement />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('ロール管理');
    });
  });
});
