/**
 * @fileoverview UnsavedChangesBadge コンポーネントのテスト
 *
 * Task 62.2: 未保存変更インジケーターを実装する
 *
 * Requirements:
 * - 44.1: 未保存の変更が存在する間、未保存状態を示す視覚インジケーターを表示する
 * - 44.2: 未保存の変更が存在しない間、インジケーターを表示しない
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UnsavedChangesBadge from './UnsavedChangesBadge';

describe('UnsavedChangesBadge', () => {
  describe('REQ 44.1: 未保存時にインジケーターを表示する', () => {
    it('isUnsaved が true のとき未保存インジケーターを表示する', () => {
      render(<UnsavedChangesBadge isUnsaved={true} />);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('未保存の変更があります');
    });
  });

  describe('REQ 44.2: 未保存でないときインジケーターを表示しない', () => {
    it('isUnsaved が false のとき何も描画しない', () => {
      render(<UnsavedChangesBadge isUnsaved={false} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument();
    });
  });
});
