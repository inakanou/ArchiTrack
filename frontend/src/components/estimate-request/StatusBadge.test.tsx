/**
 * @fileoverview StatusBadgeコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 15.1: StatusBadgeコンポーネントを実装する
 *
 * Requirements:
 * - 12.1: ステータス表示エリアを表示する
 * - 12.4: 現在のステータスを視覚的に区別可能な形式で表示する
 * - 12.12: 見積依頼一覧画面に各見積依頼のステータスを表示する
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, type EstimateRequestStatus } from './StatusBadge';

describe('StatusBadge', () => {
  describe('基本レンダリング', () => {
    it('依頼前ステータスを表示する（Requirements: 12.4）', () => {
      render(<StatusBadge status="BEFORE_REQUEST" />);

      expect(screen.getByText('依頼前')).toBeInTheDocument();
    });

    it('依頼済ステータスを表示する（Requirements: 12.4）', () => {
      render(<StatusBadge status="REQUESTED" />);

      expect(screen.getByText('依頼済')).toBeInTheDocument();
    });

    it('見積受領済ステータスを表示する（Requirements: 12.4）', () => {
      render(<StatusBadge status="QUOTATION_RECEIVED" />);

      expect(screen.getByText('見積受領済')).toBeInTheDocument();
    });
  });

  describe('色分け表示（Requirements: 12.4）', () => {
    it('依頼前ステータスはグレー系の背景色を持つ', () => {
      render(<StatusBadge status="BEFORE_REQUEST" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('bg-gray-100');
      expect(badge).toHaveClass('text-gray-800');
    });

    it('依頼済ステータスはブルー系の背景色を持つ', () => {
      render(<StatusBadge status="REQUESTED" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('bg-blue-100');
      expect(badge).toHaveClass('text-blue-800');
    });

    it('見積受領済ステータスはグリーン系の背景色を持つ', () => {
      render(<StatusBadge status="QUOTATION_RECEIVED" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('bg-green-100');
      expect(badge).toHaveClass('text-green-800');
    });
  });

  describe('サイズバリエーション', () => {
    it('デフォルトでmdサイズを使用する', () => {
      render(<StatusBadge status="BEFORE_REQUEST" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('text-sm');
      expect(badge).toHaveClass('px-2.5');
      expect(badge).toHaveClass('py-0.5');
    });

    it('smサイズを指定できる', () => {
      render(<StatusBadge status="BEFORE_REQUEST" size="sm" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
    });

    it('lgサイズを指定できる', () => {
      render(<StatusBadge status="BEFORE_REQUEST" size="lg" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('text-base');
      expect(badge).toHaveClass('px-3');
      expect(badge).toHaveClass('py-1');
    });
  });

  describe('アクセシビリティ（Requirements: 12.4）', () => {
    it('aria-live属性でスクリーンリーダーに通知する', () => {
      render(<StatusBadge status="BEFORE_REQUEST" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('aria-live', 'polite');
    });

    it('role属性としてstatusを持つ', () => {
      render(<StatusBadge status="REQUESTED" />);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
    });

    it('aria-label属性に適切なラベルを持つ', () => {
      render(<StatusBadge status="QUOTATION_RECEIVED" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveAttribute('aria-label', 'ステータス: 見積受領済');
    });
  });

  describe('スタイリング', () => {
    it('バッジ形式（丸み帯びた形状）で表示される', () => {
      render(<StatusBadge status="BEFORE_REQUEST" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('rounded-full');
    });

    it('フォントウェイトがmediumである', () => {
      render(<StatusBadge status="BEFORE_REQUEST" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('font-medium');
    });
  });

  describe('追加のクラス名', () => {
    it('className propで追加のクラスを指定できる', () => {
      render(<StatusBadge status="BEFORE_REQUEST" className="custom-class" />);

      const badge = screen.getByTestId('status-badge');
      expect(badge).toHaveClass('custom-class');
    });
  });

  describe('型安全性', () => {
    it.each([
      ['BEFORE_REQUEST', '依頼前'],
      ['REQUESTED', '依頼済'],
      ['QUOTATION_RECEIVED', '見積受領済'],
    ] as const)('ステータス "%s" を正しくレンダリングする', (status, expectedLabel) => {
      render(<StatusBadge status={status as EstimateRequestStatus} />);

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });
});
