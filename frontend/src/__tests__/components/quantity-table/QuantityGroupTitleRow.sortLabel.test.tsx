/**
 * @fileoverview QuantityGroupTitleRowの「並替」ラベル表示テスト
 *
 * Task 38.2: 数量項目の並び順管理の単体テストを実装する
 *
 * Requirements:
 * - 24.1: 数量項目の並び順データ保持
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuantityGroupTitleRow from '../../../components/quantity-table/QuantityGroupTitleRow';

describe('QuantityGroupTitleRow 並替ラベル', () => {
  it('操作列に「並替」ラベルが表示される', () => {
    render(<QuantityGroupTitleRow isEditable={true} />);

    // 操作列に「並替」テキストが含まれることを確認
    const titleRow = screen.getByTestId('quantity-group-title-row');
    expect(titleRow).toHaveTextContent('並替');
  });

  it('操作列に従来の「操作」ラベルも表示される', () => {
    render(<QuantityGroupTitleRow isEditable={true} />);

    const titleRow = screen.getByTestId('quantity-group-title-row');
    expect(titleRow).toHaveTextContent('操作');
  });
});
