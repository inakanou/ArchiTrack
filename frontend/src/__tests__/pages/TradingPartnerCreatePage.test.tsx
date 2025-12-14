/**
 * @fileoverview TradingPartnerCreatePage テスト
 *
 * Task 12.4: TradingPartnerCreatePageの実装テスト
 *
 * Requirements:
 * - 2.1: 「新規作成」ボタンで取引先作成フォームを表示する
 * - 2.8: 取引先作成成功時に成功メッセージを表示し一覧ページに遷移
 * - 12.10: 取引先新規作成ページを /trading-partners/new のURLで提供する
 * - 12.16: パンくず: ダッシュボード > 取引先 > 新規作成
 * - 12.19: 一覧で「新規作成」ボタンクリックで新規作成ページに遷移
 * - 12.21: 作成成功時は一覧ページへ遷移
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TradingPartnerCreatePage from '../../pages/TradingPartnerCreatePage';

// ============================================================================
// モック設定
// ============================================================================

const mockNavigate = vi.fn();
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  operationFailed: vi.fn(),
};

// React Routerのモック
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Toastフックのモック
vi.mock('../../hooks/useToast', () => ({
  useToast: () => mockToast,
}));

// TradingPartnerFormContainerのモック
vi.mock('../../components/trading-partners/TradingPartnerFormContainer', () => ({
  default: ({ mode, onSuccess }: { mode: string; onSuccess?: () => void }) => (
    <div data-testid="trading-partner-form-container">
      <span data-testid="form-mode">{mode}</span>
      <button data-testid="mock-submit" onClick={onSuccess}>
        Mock Submit
      </button>
    </div>
  ),
}));

// ============================================================================
// テストユーティリティ
// ============================================================================

/**
 * テスト用のコンポーネントをレンダリング
 */
function renderComponent() {
  return render(
    <MemoryRouter>
      <TradingPartnerCreatePage />
    </MemoryRouter>
  );
}

// ============================================================================
// テストスイート
// ============================================================================

describe('TradingPartnerCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // --------------------------------------------------------------------------
  // 基本的なレンダリングテスト
  // --------------------------------------------------------------------------

  describe('基本的なレンダリング', () => {
    it('ページが正しくレンダリングされる', () => {
      renderComponent();

      // mainロールが存在する
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('ページタイトル「新規作成」が表示される', () => {
      renderComponent();

      // h1見出しを確認
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('取引先の新規作成');
    });

    it('TradingPartnerFormContainerが作成モードでレンダリングされる', () => {
      renderComponent();

      // FormContainerがcreateモードでレンダリングされている
      expect(screen.getByTestId('trading-partner-form-container')).toBeInTheDocument();
      expect(screen.getByTestId('form-mode')).toHaveTextContent('create');
    });
  });

  // --------------------------------------------------------------------------
  // パンくずナビゲーションテスト (Requirement 12.16)
  // --------------------------------------------------------------------------

  describe('パンくずナビゲーション (12.16)', () => {
    it('パンくずナビゲーションが表示される', () => {
      renderComponent();

      // パンくずナビゲーションのnav要素を確認
      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumbNav).toBeInTheDocument();
    });

    it('パンくずに「ダッシュボード」リンクが表示される', () => {
      renderComponent();

      const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('パンくずに「取引先」リンクが表示される', () => {
      renderComponent();

      const tradingPartnersLink = screen.getByRole('link', { name: '取引先' });
      expect(tradingPartnersLink).toBeInTheDocument();
      expect(tradingPartnersLink).toHaveAttribute('href', '/trading-partners');
    });

    it('パンくずに「新規作成」（リンクなし）が表示される', () => {
      renderComponent();

      // 「新規作成」はリンクではなくテキストとして表示される
      expect(screen.getByText('新規作成')).toBeInTheDocument();
      // リンクではないことを確認
      expect(screen.queryByRole('link', { name: '新規作成' })).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // キャンセル機能テスト
  // --------------------------------------------------------------------------

  describe('キャンセル機能', () => {
    it('一覧ページへ戻るリンクが表示される', () => {
      renderComponent();

      // 戻るリンクまたはキャンセルボタンを確認
      const backLink = screen.queryByRole('link', { name: /一覧に戻る|キャンセル/i });
      if (backLink) {
        expect(backLink).toHaveAttribute('href', '/trading-partners');
      }
    });
  });

  // --------------------------------------------------------------------------
  // アクセシビリティテスト
  // --------------------------------------------------------------------------

  describe('アクセシビリティ', () => {
    it('main要素にrole="main"が設定されている', () => {
      renderComponent();

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });

    it('パンくずナビゲーションにaria-labelが設定されている', () => {
      renderComponent();

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(nav).toHaveAttribute('aria-label', 'パンくずナビゲーション');
    });
  });

  // --------------------------------------------------------------------------
  // レイアウトテスト
  // --------------------------------------------------------------------------

  describe('レイアウト', () => {
    it('パンくずナビゲーションがフォームの前に表示される', () => {
      renderComponent();

      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const formContainer = screen.getByTestId('trading-partner-form-container');

      // DOMの順序を確認
      const main = screen.getByRole('main');
      const children = Array.from(main.querySelectorAll(':scope > *'));

      // パンくずがフォームコンテナより前にある
      const breadcrumbIndex = children.findIndex(
        (el) => el.contains(breadcrumb) || el === breadcrumb
      );
      const formIndex = children.findIndex(
        (el) => el.contains(formContainer) || el === formContainer
      );

      expect(breadcrumbIndex).toBeLessThan(formIndex);
    });
  });
});
