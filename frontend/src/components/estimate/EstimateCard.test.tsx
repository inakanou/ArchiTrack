/**
 * @fileoverview EstimateCard コンポーネントテスト
 *
 * Task 17.2: EstimateCardコンポーネントの実装
 *
 * Requirements (estimate-creation):
 * - REQ-14.3: 見積書名、作成日時、合計金額を表示する
 * - REQ-14.4: 見積書カードクリックで詳細画面へ遷移する
 *
 * @module components/estimate/EstimateCard.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstimateCard } from './EstimateCard';

describe('EstimateCard', () => {
  const defaultProps = {
    id: 'est-001',
    name: 'テスト見積書',
    createdAt: '2024-01-15T10:00:00.000Z',
    totalAmount: '1500000',
  };

  /**
   * REQ-14.3: 見積書名を表示する
   */
  it('見積書名を表示する', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByText('テスト見積書')).toBeInTheDocument();
  });

  /**
   * REQ-14.3: 作成日時を表示する
   */
  it('作成日時を日本語形式で表示する', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    // 日本語日付形式で表示される
    expect(screen.getByText(/2024年1月15日/)).toBeInTheDocument();
  });

  /**
   * REQ-14.3: 合計金額を表示する
   */
  it('合計金額をフォーマットして表示する', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    // 金額は「1,500,000円」としてフォーマットされる
    expect(screen.getByText(/1,500,000円/)).toBeInTheDocument();
  });

  /**
   * REQ-14.3: 合計金額がnullの場合はハイフンを表示する
   */
  it('合計金額がnullの場合は金額を表示しない', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} totalAmount={null} />
      </MemoryRouter>
    );

    // 金額が表示されないことを確認（日付のみ表示）
    expect(screen.queryByText(/円/)).not.toBeInTheDocument();
  });

  /**
   * REQ-14.4: 見積書カードクリックで詳細画面へ遷移する
   */
  it('見積書詳細画面へのリンクを持つ', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: /テスト見積書の見積書詳細を見る/ });
    expect(link).toHaveAttribute('href', '/estimates/est-001');
  });

  /**
   * アクセシビリティ: aria-labelを持つ
   */
  it('アクセシビリティのためaria-labelを持つ', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', 'テスト見積書の見積書詳細を見る');
  });

  /**
   * data-testidを持つ
   */
  it('data-testidを持つ', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('estimate-card-est-001')).toBeInTheDocument();
  });

  /**
   * ドキュメントアイコンを表示する
   */
  it('ドキュメントアイコンを表示する', () => {
    render(
      <MemoryRouter>
        <EstimateCard {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('estimate-icon')).toBeInTheDocument();
  });
});
