/**
 * @fileoverview TradingPartnerEditPage単体テスト
 *
 * Task 12.5: TradingPartnerEditPageの実装テスト
 *
 * TDD: RED Phase - テスト作成
 *
 * Requirements:
 * - 4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.5: 変更を保存時に取引先レコードを更新
 * - 4.6: 更新成功時に成功メッセージを表示し詳細ページに遷移
 * - 12.12: 取引先編集ページを /trading-partners/:id/edit のURLで提供する
 * - 12.17: パンくず: ダッシュボード > 取引先 > [取引先名] > 編集
 * - 12.22: 更新成功時は詳細ページへ遷移
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TradingPartnerEditPage from '../../pages/TradingPartnerEditPage';
import { ToastProvider } from '../../components/ToastProvider';
import type { TradingPartnerDetail } from '../../types/trading-partner.types';

// ============================================================================
// モック
// ============================================================================

// APIモック
const mockGetTradingPartner = vi.fn();
const mockUpdateTradingPartner = vi.fn();

vi.mock('../../api/trading-partners', () => ({
  getTradingPartner: (...args: unknown[]) => mockGetTradingPartner(...args),
  updateTradingPartner: (...args: unknown[]) => mockUpdateTradingPartner(...args),
}));

// ナビゲーションモック
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// TradingPartnerFormContainerのモック
vi.mock('../../components/trading-partners/TradingPartnerFormContainer', () => ({
  default: ({ mode, tradingPartnerId }: { mode: string; tradingPartnerId?: string }) => (
    <div data-testid="trading-partner-form-container">
      <span data-testid="form-mode">{mode}</span>
      <span data-testid="form-partner-id">{tradingPartnerId}</span>
    </div>
  ),
}));

// ============================================================================
// テストデータ
// ============================================================================

const mockPartner: TradingPartnerDetail = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'テスト株式会社',
  nameKana: 'テストカブシキガイシャ',
  branchName: '東京支店',
  branchNameKana: 'トウキョウシテン',
  representativeName: '山田太郎',
  representativeNameKana: 'ヤマダタロウ',
  types: ['CUSTOMER'],
  address: '東京都渋谷区1-1-1',
  phoneNumber: '03-1234-5678',
  faxNumber: '03-1234-5679',
  email: 'test@example.com',
  billingClosingDay: 31,
  paymentMonthOffset: 1,
  paymentDay: 15,
  notes: 'テスト備考',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * TradingPartnerEditPageをレンダリング
 */
function renderEditPage(partnerId: string = '550e8400-e29b-41d4-a716-446655440000') {
  const user = userEvent.setup();

  const result = render(
    <MemoryRouter initialEntries={[`/trading-partners/${partnerId}/edit`]}>
      <ToastProvider>
        <Routes>
          <Route path="/trading-partners/:id/edit" element={<TradingPartnerEditPage />} />
          <Route
            path="/trading-partners/:id"
            element={<div data-testid="detail-page">詳細ページ</div>}
          />
          <Route path="/trading-partners" element={<div data-testid="list-page">一覧ページ</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );

  return { user, ...result };
}

/**
 * データ読み込み完了を待つ
 */
async function waitForDataLoaded() {
  await waitFor(() => {
    expect(screen.getByTestId('trading-partner-form-container')).toBeInTheDocument();
  });
}

// ============================================================================
// テスト
// ============================================================================

describe('TradingPartnerEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTradingPartner.mockResolvedValue(mockPartner);
    mockUpdateTradingPartner.mockResolvedValue(mockPartner);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 基本的なレンダリング（REQ-4.1, 12.12）
  // --------------------------------------------------------------------------

  describe('基本的なレンダリング', () => {
    it('ページが正しくレンダリングされる', async () => {
      renderEditPage();

      await waitForDataLoaded();

      // mainロールが存在する
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('ページタイトル「取引先の編集」が表示される', async () => {
      renderEditPage();

      await waitForDataLoaded();

      // h1見出しを確認
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('取引先の編集');
    });

    it('TradingPartnerFormContainerが編集モードでレンダリングされる (REQ-4.1)', async () => {
      renderEditPage();

      await waitForDataLoaded();

      // FormContainerがeditモードでレンダリングされている
      expect(screen.getByTestId('trading-partner-form-container')).toBeInTheDocument();
      expect(screen.getByTestId('form-mode')).toHaveTextContent('edit');
    });

    it('取引先IDがFormContainerに渡される', async () => {
      const partnerId = '550e8400-e29b-41d4-a716-446655440000';
      renderEditPage(partnerId);

      await waitForDataLoaded();

      expect(screen.getByTestId('form-partner-id')).toHaveTextContent(partnerId);
    });
  });

  // --------------------------------------------------------------------------
  // パンくずナビゲーション（REQ-12.17）
  // --------------------------------------------------------------------------

  describe('パンくずナビゲーション', () => {
    it('「ダッシュボード > 取引先 > [取引先名] > 編集」のパンくずを表示する', async () => {
      renderEditPage();

      await waitForDataLoaded();

      // パンくずナビゲーションの存在確認
      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();

      // 各パンくず項目の確認
      const breadcrumbList = within(breadcrumb).getByRole('list');
      const items = within(breadcrumbList).getAllByRole('listitem');
      expect(items).toHaveLength(4);

      // ダッシュボード（リンク）
      const firstItem = items[0];
      expect(firstItem).toBeDefined();
      expect(
        within(firstItem as HTMLElement).getByRole('link', { name: 'ダッシュボード' })
      ).toHaveAttribute('href', '/');

      // 取引先（リンク）
      const secondItem = items[1];
      expect(secondItem).toBeDefined();
      expect(
        within(secondItem as HTMLElement).getByRole('link', { name: '取引先' })
      ).toHaveAttribute('href', '/trading-partners');

      // 取引先名（リンク）
      const thirdItem = items[2];
      expect(thirdItem).toBeDefined();
      expect(
        within(thirdItem as HTMLElement).getByRole('link', { name: 'テスト株式会社' })
      ).toHaveAttribute('href', `/trading-partners/${mockPartner.id}`);

      // 編集（リンクなし、現在のページ）
      const fourthItem = items[3];
      expect(fourthItem).toBeDefined();
      expect(within(fourthItem as HTMLElement).getByText('編集')).toBeInTheDocument();
      expect(within(fourthItem as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
    });

    it('パンくずに「ダッシュボード」リンクが表示される', async () => {
      renderEditPage();

      await waitForDataLoaded();

      const dashboardLink = screen.getByRole('link', { name: 'ダッシュボード' });
      expect(dashboardLink).toBeInTheDocument();
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('パンくずに「取引先」リンクが表示される', async () => {
      renderEditPage();

      await waitForDataLoaded();

      const tradingPartnersLink = screen.getByRole('link', { name: '取引先' });
      expect(tradingPartnersLink).toBeInTheDocument();
      expect(tradingPartnersLink).toHaveAttribute('href', '/trading-partners');
    });

    it('パンくずに取引先名リンクが表示される', async () => {
      renderEditPage();

      await waitForDataLoaded();

      const partnerNameLink = screen.getByRole('link', { name: 'テスト株式会社' });
      expect(partnerNameLink).toBeInTheDocument();
      expect(partnerNameLink).toHaveAttribute('href', `/trading-partners/${mockPartner.id}`);
    });

    it('パンくずに「編集」（リンクなし）が表示される', async () => {
      renderEditPage();

      await waitForDataLoaded();

      // 「編集」はリンクではなくテキストとして表示される
      expect(screen.getByText('編集')).toBeInTheDocument();
      // リンクではないことを確認
      expect(screen.queryByRole('link', { name: '編集' })).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // ローディング状態
  // --------------------------------------------------------------------------

  describe('ローディング状態', () => {
    it('データ取得中はローディング表示を出す', async () => {
      // APIの解決を遅延させる
      mockGetTradingPartner.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPartner), 100))
      );

      renderEditPage();

      // ローディング表示の確認
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();

      // データ読み込み完了後
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 存在しない取引先（REQ-12.13）
  // --------------------------------------------------------------------------

  describe('存在しない取引先', () => {
    it('404エラー時にResourceNotFoundを表示する', async () => {
      // 404エラーを返すモック
      mockGetTradingPartner.mockRejectedValue({
        statusCode: 404,
        message: '取引先が見つかりません',
      });

      renderEditPage('non-existent-id');

      await waitFor(() => {
        expect(screen.getByText('取引先が見つかりません')).toBeInTheDocument();
      });

      // 一覧に戻るリンクの確認
      expect(screen.getByRole('link', { name: '取引先一覧に戻る' })).toHaveAttribute(
        'href',
        '/trading-partners'
      );
    });
  });

  // --------------------------------------------------------------------------
  // エラーハンドリング
  // --------------------------------------------------------------------------

  describe('エラーハンドリング', () => {
    it('ネットワークエラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      mockGetTradingPartner.mockRejectedValue(new Error('ネットワークエラー'));

      const { user } = renderEditPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // 再試行ボタンの確認
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();

      // 再試行ボタンクリック
      mockGetTradingPartner.mockResolvedValue(mockPartner);
      await user.click(screen.getByRole('button', { name: '再試行' }));

      await waitForDataLoaded();
    });
  });

  // --------------------------------------------------------------------------
  // アクセシビリティ
  // --------------------------------------------------------------------------

  describe('アクセシビリティ', () => {
    it('main要素にrole="main"が設定されている', async () => {
      renderEditPage();

      await waitForDataLoaded();

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });

    it('パンくずナビゲーションにaria-labelが設定されている', async () => {
      renderEditPage();

      await waitForDataLoaded();

      const nav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(nav).toHaveAttribute('aria-label', 'パンくずナビゲーション');
    });
  });

  // --------------------------------------------------------------------------
  // レイアウト
  // --------------------------------------------------------------------------

  describe('レイアウト', () => {
    it('パンくずナビゲーションがフォームの前に表示される', async () => {
      renderEditPage();

      await waitForDataLoaded();

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
