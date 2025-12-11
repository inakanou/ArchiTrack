import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Breadcrumb } from '../../../components/common/Breadcrumb';

// テストヘルパー: Router付きでレンダリング
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('Breadcrumb', () => {
  describe('基本レンダリング', () => {
    it('単一項目を表示できること', () => {
      renderWithRouter(<Breadcrumb items={[{ label: 'ダッシュボード' }]} />);

      expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
    });

    it('複数項目を表示できること', () => {
      renderWithRouter(
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: '取引先', path: '/trading-partners' },
            { label: '株式会社テスト' },
          ]}
        />
      );

      expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
      expect(screen.getByText('取引先')).toBeInTheDocument();
      expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
    });

    it('空の配列で何も表示しないこと', () => {
      const { container } = renderWithRouter(<Breadcrumb items={[]} />);

      const list = container.querySelector('ol');
      expect(list?.children.length).toBe(0);
    });
  });

  describe('リンク', () => {
    it('pathが指定された項目はリンクとして表示すること', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('pathが指定されていない項目はリンクでないこと', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      expect(screen.queryByRole('link', { name: '取引先' })).not.toBeInTheDocument();
      expect(screen.getByText('取引先')).toBeInTheDocument();
    });

    it('最後の項目がpathを持っていてもリンクなしで表示されること（現在のページ）', () => {
      renderWithRouter(
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: '取引先', path: '/trading-partners' },
          ]}
        />
      );

      // 最後の項目はリンクではない
      expect(screen.queryByRole('link', { name: '取引先' })).not.toBeInTheDocument();
      // ただしテキストは表示される
      expect(screen.getByText('取引先')).toBeInTheDocument();
    });
  });

  describe('区切り文字', () => {
    it('項目間に「>」区切り文字を表示すること', () => {
      renderWithRouter(
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: '取引先', path: '/trading-partners' },
            { label: '株式会社テスト' },
          ]}
        />
      );

      // 2つの区切り文字があるはず（3項目 - 1 = 2）
      const separators = screen.getAllByText('>');
      expect(separators).toHaveLength(2);
    });

    it('単一項目の場合、区切り文字を表示しないこと', () => {
      renderWithRouter(<Breadcrumb items={[{ label: 'ダッシュボード' }]} />);

      expect(screen.queryByText('>')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('nav要素にaria-labelが設定されていること', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'パンくずナビゲーション');
    });

    it('現在のページにaria-currentが設定されていること', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      const currentItem = screen.getByText('取引先');
      expect(currentItem).toHaveAttribute('aria-current', 'page');
    });

    it('最後でない項目にはaria-currentが設定されていないこと', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).not.toHaveAttribute('aria-current');
    });
  });

  describe('スタイリング', () => {
    it('最後の項目が強調スタイルを持つこと', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      const currentItem = screen.getByText('取引先');
      expect(currentItem).toHaveClass('font-medium');
    });
  });

  describe('取引先管理のユースケース', () => {
    it('取引先一覧ページのパンくずを正しく表示すること', () => {
      renderWithRouter(
        <Breadcrumb items={[{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }]} />
      );

      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');
      expect(screen.getByText('取引先')).toBeInTheDocument();
    });

    it('取引先詳細ページのパンくずを正しく表示すること', () => {
      renderWithRouter(
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: '取引先', path: '/trading-partners' },
            { label: '株式会社テスト' },
          ]}
        />
      );

      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: '取引先' })).toHaveAttribute(
        'href',
        '/trading-partners'
      );
      expect(screen.getByText('株式会社テスト')).toBeInTheDocument();
    });

    it('取引先新規作成ページのパンくずを正しく表示すること', () => {
      renderWithRouter(
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: '取引先', path: '/trading-partners' },
            { label: '新規作成' },
          ]}
        />
      );

      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: '取引先' })).toHaveAttribute(
        'href',
        '/trading-partners'
      );
      expect(screen.getByText('新規作成')).toBeInTheDocument();
    });

    it('取引先編集ページのパンくずを正しく表示すること', () => {
      renderWithRouter(
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: '取引先', path: '/trading-partners' },
            { label: '株式会社テスト', path: '/trading-partners/123' },
            { label: '編集' },
          ]}
        />
      );

      expect(screen.getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: '取引先' })).toHaveAttribute(
        'href',
        '/trading-partners'
      );
      expect(screen.getByRole('link', { name: '株式会社テスト' })).toHaveAttribute(
        'href',
        '/trading-partners/123'
      );
      expect(screen.getByText('編集')).toBeInTheDocument();
    });
  });
});
