/**
 * @fileoverview フィールドバリデーション吹き出しコンポーネントのテスト
 *
 * 警告アイコンの表示、ホバー時の吹き出し表示、severity による色の出し分け、
 * スクリーンリーダー用 alert 要素の出力を検証する。
 *
 * @module components/quantity-table/FieldValidationTooltip.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FieldValidationTooltip from './FieldValidationTooltip';

describe('FieldValidationTooltip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本レンダリング', () => {
    it('警告アイコンが message を aria-label として表示する', () => {
      render(<FieldValidationTooltip message="入力エラー" />);
      const icon = screen.getByRole('img', { name: '入力エラー' });
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('title', '入力エラー');
    });

    it('初期状態では吹き出し（tooltip）は表示されない', () => {
      render(<FieldValidationTooltip message="入力エラー" />);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('ホバー時の吹き出し', () => {
    it('マウスホバーで吹き出しが表示される', () => {
      render(<FieldValidationTooltip message="入力エラー" />);
      const icon = screen.getByRole('img', { name: '入力エラー' });

      fireEvent.mouseEnter(icon);

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('入力エラー');
    });

    it('マウスが離れると吹き出しが非表示になる', () => {
      render(<FieldValidationTooltip message="入力エラー" />);
      const icon = screen.getByRole('img', { name: '入力エラー' });

      fireEvent.mouseEnter(icon);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      fireEvent.mouseLeave(icon);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('severity による色の出し分け', () => {
    it('デフォルト（error）では赤色のアイコンを描画する', () => {
      const { container } = render(<FieldValidationTooltip message="エラー" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('stroke', '#dc2626');
    });

    it('severity="warning" では橙色のアイコンを描画する', () => {
      const { container } = render(<FieldValidationTooltip message="警告" severity="warning" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('stroke', '#b45309');
    });
  });

  describe('スクリーンリーダー用 alert 要素', () => {
    it('id を渡すと指定 id の alert 要素を出力する', () => {
      render(<FieldValidationTooltip message="入力エラー" id="field-error-1" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('id', 'field-error-1');
      expect(alert).toHaveTextContent('入力エラー');
    });

    it('id を渡さない場合は alert 要素を出力しない', () => {
      render(<FieldValidationTooltip message="入力エラー" />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
