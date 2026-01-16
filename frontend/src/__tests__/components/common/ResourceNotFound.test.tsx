/**
 * @fileoverview ResourceNotFoundコンポーネントのテスト
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResourceNotFound } from '../../../components/common/ResourceNotFound';

describe('ResourceNotFound', () => {
  const renderWithRouter = (props: {
    resourceType: string;
    returnPath: string;
    returnLabel: string;
  }) => {
    return render(
      <MemoryRouter>
        <ResourceNotFound {...props} />
      </MemoryRouter>
    );
  };

  describe('レンダリング', () => {
    it('リソースタイプを含むタイトルが表示される', () => {
      renderWithRouter({
        resourceType: '取引先',
        returnPath: '/trading-partners',
        returnLabel: '取引先一覧に戻る',
      });

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('取引先が見つかりません');
    });

    it('リソースタイプを含む説明文が表示される', () => {
      renderWithRouter({
        resourceType: 'プロジェクト',
        returnPath: '/projects',
        returnLabel: 'プロジェクト一覧に戻る',
      });

      expect(screen.getByText(/指定されたプロジェクトは存在しないか/)).toBeInTheDocument();
    });

    it('戻るリンクが正しいパスを持つ', () => {
      renderWithRouter({
        resourceType: '現場調査',
        returnPath: '/site-surveys',
        returnLabel: '現場調査一覧に戻る',
      });

      const link = screen.getByRole('link', { name: '現場調査一覧に戻る' });
      expect(link).toHaveAttribute('href', '/site-surveys');
    });

    it('戻るリンクのラベルが正しく表示される', () => {
      renderWithRouter({
        resourceType: '数量表',
        returnPath: '/quantity-tables',
        returnLabel: '数量表一覧に戻る',
      });

      expect(screen.getByRole('link')).toHaveTextContent('数量表一覧に戻る');
    });
  });

  describe('様々なリソースタイプ', () => {
    it.each([
      ['取引先', '/trading-partners', '取引先一覧に戻る'],
      ['プロジェクト', '/projects', 'プロジェクト一覧に戻る'],
      ['現場調査', '/site-surveys', '現場調査一覧に戻る'],
      ['ユーザー', '/users', 'ユーザー一覧に戻る'],
    ])('%s が見つからない場合の表示', (resourceType, returnPath, returnLabel) => {
      renderWithRouter({ resourceType, returnPath, returnLabel });

      expect(screen.getByText(`${resourceType}が見つかりません`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: returnLabel })).toHaveAttribute('href', returnPath);
    });
  });
});
