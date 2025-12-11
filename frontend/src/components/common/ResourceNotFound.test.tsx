import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResourceNotFound } from './ResourceNotFound';

// ResourceNotFoundコンポーネントはReact Routerのコンテキストが必要
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('ResourceNotFound', () => {
  describe('取引先リソースの場合', () => {
    it('取引先が見つからないメッセージを表示する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      );

      expect(screen.getByText('取引先が見つかりません')).toBeInTheDocument();
    });

    it('説明メッセージを表示する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      );

      expect(
        screen.getByText('指定された取引先は存在しないか、削除されています。')
      ).toBeInTheDocument();
    });

    it('戻るリンクを表示する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      );

      const link = screen.getByRole('link', { name: '取引先一覧に戻る' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/trading-partners');
    });
  });

  describe('プロジェクトリソースの場合', () => {
    it('プロジェクトが見つからないメッセージを表示する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="プロジェクト"
          returnPath="/projects"
          returnLabel="プロジェクト一覧に戻る"
        />
      );

      expect(screen.getByText('プロジェクトが見つかりません')).toBeInTheDocument();
    });

    it('説明メッセージを表示する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="プロジェクト"
          returnPath="/projects"
          returnLabel="プロジェクト一覧に戻る"
        />
      );

      expect(
        screen.getByText('指定されたプロジェクトは存在しないか、削除されています。')
      ).toBeInTheDocument();
    });

    it('戻るリンクを表示する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="プロジェクト"
          returnPath="/projects"
          returnLabel="プロジェクト一覧に戻る"
        />
      );

      const link = screen.getByRole('link', { name: 'プロジェクト一覧に戻る' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/projects');
    });
  });

  describe('任意のリソースタイプの場合', () => {
    it('カスタムリソースタイプに対応する', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="ユーザー"
          returnPath="/users"
          returnLabel="ユーザー一覧に戻る"
        />
      );

      expect(screen.getByText('ユーザーが見つかりません')).toBeInTheDocument();
      expect(
        screen.getByText('指定されたユーザーは存在しないか、削除されています。')
      ).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('見出し要素を持つ', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      );

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('取引先が見つかりません');
    });

    it('リンクが適切なアクセシブルな名前を持つ', () => {
      renderWithRouter(
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAccessibleName('取引先一覧に戻る');
    });
  });

  describe('スタイリング', () => {
    it('中央揃えのレイアウトを持つ', () => {
      const { container } = renderWithRouter(
        <ResourceNotFound
          resourceType="取引先"
          returnPath="/trading-partners"
          returnLabel="取引先一覧に戻る"
        />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('text-center');
    });
  });
});
