/**
 * @fileoverview TradingPartnerDetailPage単体テスト
 *
 * Task 12.3: TradingPartnerDetailPageの実装テスト
 *
 * TDD: GREEN Phase - テスト修正
 *
 * Requirements:
 * - 3.1: ユーザーが一覧から取引先を選択したとき、取引先詳細ページを表示する
 * - 3.2: 全フィールドを詳細ページに表示する
 * - 3.3: 編集ボタンと削除ボタンを詳細ページに表示する
 * - 12.11: 取引先詳細ページを /trading-partners/:id のURLで提供する
 * - 12.13: 存在しない取引先IDにアクセス時に「取引先が見つかりません」を表示
 * - 12.15: 取引先詳細ページに「ダッシュボード > 取引先 > [取引先名]」のパンくずを表示
 * - 12.20: ユーザーが取引先詳細ページで「編集」ボタンをクリックしたとき、編集画面を表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TradingPartnerDetailPage from '../../pages/TradingPartnerDetailPage';
import { ToastProvider } from '../../components/ToastProvider';
import type { TradingPartnerDetail } from '../../types/trading-partner.types';

// ============================================================================
// モック
// ============================================================================

// APIモック
const mockGetTradingPartner = vi.fn();
const mockDeleteTradingPartner = vi.fn();
const mockGetProjects = vi.fn();

vi.mock('../../api/trading-partners', () => ({
  getTradingPartner: (...args: unknown[]) => mockGetTradingPartner(...args),
  deleteTradingPartner: (...args: unknown[]) => mockDeleteTradingPartner(...args),
}));

vi.mock('../../api/projects', () => ({
  getProjects: (...args: unknown[]) => mockGetProjects(...args),
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

const mockRelatedProjects = [
  {
    id: 'project-1',
    name: 'プロジェクトA',
    status: 'IN_PROGRESS',
    salesPerson: { displayName: '田中一郎' },
  },
  {
    id: 'project-2',
    name: 'プロジェクトB',
    status: 'COMPLETED',
    salesPerson: { displayName: '佐藤二郎' },
  },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * TradingPartnerDetailPageをレンダリング
 */
function renderDetailPage(partnerId: string = '550e8400-e29b-41d4-a716-446655440000') {
  const user = userEvent.setup();

  const result = render(
    <MemoryRouter initialEntries={[`/trading-partners/${partnerId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/trading-partners/:id" element={<TradingPartnerDetailPage />} />
          <Route path="/trading-partners" element={<div data-testid="list-page">一覧ページ</div>} />
          <Route
            path="/trading-partners/:id/edit"
            element={<div data-testid="edit-page">編集ページ</div>}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );

  return { user, ...result };
}

/**
 * データ読み込み完了を待つ
 * 複数のテスト株式会社テキストが存在する可能性があるため、編集ボタンの存在で判定
 */
async function waitForDataLoaded() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
  });
}

// ============================================================================
// テスト
// ============================================================================

describe('TradingPartnerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTradingPartner.mockResolvedValue(mockPartner);
    mockDeleteTradingPartner.mockResolvedValue(undefined);
    mockGetProjects.mockResolvedValue({ data: mockRelatedProjects, total: 2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // パンくずナビゲーション（REQ-12.15）
  // --------------------------------------------------------------------------

  describe('パンくずナビゲーション', () => {
    it('「ダッシュボード > 取引先 > [取引先名]」のパンくずを表示する', async () => {
      renderDetailPage();

      // データ読み込み完了を待つ
      await waitForDataLoaded();

      // パンくずナビゲーションの存在確認
      const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      expect(breadcrumb).toBeInTheDocument();

      // 各パンくず項目の確認
      const breadcrumbList = within(breadcrumb).getByRole('list');
      const items = within(breadcrumbList).getAllByRole('listitem');
      expect(items).toHaveLength(3);

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

      // 取引先名（リンクなし、現在のページ）
      const thirdItem = items[2];
      expect(thirdItem).toBeDefined();
      expect(within(thirdItem as HTMLElement).getByText('テスト株式会社')).toBeInTheDocument();
      expect(within(thirdItem as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 詳細表示（REQ-3.1, 3.2）
  // --------------------------------------------------------------------------

  describe('詳細表示', () => {
    it('取引先の基本情報を表示する', async () => {
      renderDetailPage();

      await waitForDataLoaded();

      // 基本情報の確認（複数要素が存在する場合はgetAllByTextを使用）
      // フリガナはサブタイトルとフィールドの両方に表示されるため複数存在
      const kanaElements = screen.getAllByText('テストカブシキガイシャ');
      expect(kanaElements.length).toBeGreaterThanOrEqual(1);

      expect(screen.getByText('東京支店')).toBeInTheDocument();
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
      expect(screen.getByText('顧客')).toBeInTheDocument();
    });

    it('取引先の連絡先情報を表示する', async () => {
      renderDetailPage();

      await waitForDataLoaded();

      // 連絡先情報の確認
      expect(screen.getByText('東京都渋谷区1-1-1')).toBeInTheDocument();
      expect(screen.getByText('03-1234-5678')).toBeInTheDocument();
      expect(screen.getByText('03-1234-5679')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('ローディング中はローディング表示を出す', async () => {
      // APIの解決を遅延させる
      mockGetTradingPartner.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPartner), 100))
      );

      renderDetailPage();

      // ローディング表示の確認
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();

      // データ読み込み完了後
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 編集・削除ボタン（REQ-3.3, 12.20）
  // --------------------------------------------------------------------------

  describe('編集・削除ボタン', () => {
    it('編集ボタンと削除ボタンを表示する', async () => {
      renderDetailPage();

      await waitForDataLoaded();

      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('編集ボタンクリックで編集ページに遷移する', async () => {
      const { user } = renderDetailPage();

      await waitForDataLoaded();

      await user.click(screen.getByRole('button', { name: '編集' }));

      expect(mockNavigate).toHaveBeenCalledWith(`/trading-partners/${mockPartner.id}/edit`);
    });

    it('削除ボタンクリックで削除確認ダイアログを表示する', async () => {
      const { user } = renderDetailPage();

      await waitForDataLoaded();

      await user.click(screen.getByRole('button', { name: '削除' }));

      // 削除確認ダイアログの表示確認
      expect(screen.getByText('取引先の削除')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 削除処理
  // --------------------------------------------------------------------------

  describe('削除処理', () => {
    it('削除成功時に一覧ページに遷移する', async () => {
      const { user } = renderDetailPage();

      await waitForDataLoaded();

      // 削除ボタンをクリック
      await user.click(screen.getByRole('button', { name: '削除' }));

      // 削除確認ダイアログで削除ボタンをクリック
      // ダイアログ内の削除ボタンはクラス名「取引先の削除」の近くにある
      const dialogTitle = screen.getByText('取引先の削除');
      const dialogContainer = dialogTitle.closest('div[aria-labelledby]') as HTMLElement | null;
      expect(dialogContainer).not.toBeNull();
      const confirmDeleteButton = within(dialogContainer!).getByRole('button', { name: '削除' });
      await user.click(confirmDeleteButton);

      await waitFor(() => {
        expect(mockDeleteTradingPartner).toHaveBeenCalledWith(mockPartner.id);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/trading-partners');
      });
    });

    it('削除キャンセルでダイアログを閉じる', async () => {
      const { user } = renderDetailPage();

      await waitForDataLoaded();

      // 削除ボタンをクリック
      await user.click(screen.getByRole('button', { name: '削除' }));

      // ダイアログが表示されていることを確認
      expect(screen.getByText('取引先の削除')).toBeInTheDocument();

      // キャンセルボタンをクリック
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      // ダイアログが閉じていることを確認
      await waitFor(() => {
        expect(screen.queryByText('取引先の削除')).not.toBeInTheDocument();
      });

      // 削除APIは呼ばれていない
      expect(mockDeleteTradingPartner).not.toHaveBeenCalled();
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

      renderDetailPage('non-existent-id');

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

      const { user } = renderDetailPage();

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

    it('削除エラー時にエラーメッセージを表示する', async () => {
      mockDeleteTradingPartner.mockRejectedValue({
        statusCode: 409,
        message: 'この取引先は現在プロジェクトに使用されているため削除できません',
      });

      const { user } = renderDetailPage();

      await waitForDataLoaded();

      // 削除ボタンをクリック
      await user.click(screen.getByRole('button', { name: '削除' }));

      // 削除確認ダイアログで削除ボタンをクリック
      const dialogTitle = screen.getByText('取引先の削除');
      const dialogContainer = dialogTitle.closest('div[aria-labelledby]') as HTMLElement | null;
      expect(dialogContainer).not.toBeNull();
      const confirmDeleteButton = within(dialogContainer!).getByRole('button', { name: '削除' });
      await user.click(confirmDeleteButton);

      // エラーメッセージの表示確認
      await waitFor(() => {
        expect(
          screen.getByText('この取引先は現在プロジェクトに使用されているため削除できません')
        ).toBeInTheDocument();
      });
    });

    it('削除エラー時にメッセージがない場合はデフォルトエラーメッセージを表示する', async () => {
      mockDeleteTradingPartner.mockRejectedValue({
        statusCode: 500,
      });

      const { user } = renderDetailPage();

      await waitForDataLoaded();

      // 削除ボタンをクリック
      await user.click(screen.getByRole('button', { name: '削除' }));

      // 削除確認ダイアログで削除ボタンをクリック
      const dialogTitle = screen.getByText('取引先の削除');
      const dialogContainer = dialogTitle.closest('div[aria-labelledby]') as HTMLElement | null;
      expect(dialogContainer).not.toBeNull();
      const confirmDeleteButton = within(dialogContainer!).getByRole('button', { name: '削除' });
      await user.click(confirmDeleteButton);

      // デフォルトエラーメッセージの表示確認
      await waitFor(() => {
        expect(screen.getByText('削除中にエラーが発生しました')).toBeInTheDocument();
      });
    });

    it('削除エラー時にisApiErrorでない場合もデフォルトエラーメッセージを表示する', async () => {
      // isApiErrorがfalseになるケース（オブジェクトではない）
      mockDeleteTradingPartner.mockRejectedValue('string error');

      const { user } = renderDetailPage();

      await waitForDataLoaded();

      // 削除ボタンをクリック
      await user.click(screen.getByRole('button', { name: '削除' }));

      // 削除確認ダイアログで削除ボタンをクリック
      const dialogTitle = screen.getByText('取引先の削除');
      const dialogContainer = dialogTitle.closest('div[aria-labelledby]') as HTMLElement | null;
      expect(dialogContainer).not.toBeNull();
      const confirmDeleteButton = within(dialogContainer!).getByRole('button', { name: '削除' });
      await user.click(confirmDeleteButton);

      // デフォルトエラーメッセージの表示確認
      await waitFor(() => {
        expect(screen.getByText('削除中にエラーが発生しました')).toBeInTheDocument();
      });
    });

    it('APIエラーにmessageプロパティがある場合はそのメッセージを表示する', async () => {
      mockGetTradingPartner.mockRejectedValue({
        statusCode: 500,
        message: 'サーバーエラーが発生しました',
      });

      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 関連プロジェクト（REQ-3.4）
  // --------------------------------------------------------------------------

  describe('関連プロジェクト', () => {
    it('関連プロジェクト一覧を表示する', async () => {
      renderDetailPage();

      await waitForDataLoaded();

      // 関連プロジェクトセクションの存在確認
      expect(screen.getByText('関連プロジェクト')).toBeInTheDocument();

      // プロジェクト名の確認
      await waitFor(() => {
        expect(screen.getByText('プロジェクトA')).toBeInTheDocument();
      });
      expect(screen.getByText('プロジェクトB')).toBeInTheDocument();

      // 営業担当者名の確認
      expect(screen.getByText('田中一郎')).toBeInTheDocument();
      expect(screen.getByText('佐藤二郎')).toBeInTheDocument();
    });

    it('関連プロジェクトがない場合はメッセージを表示する', async () => {
      mockGetProjects.mockResolvedValue({ data: [], total: 0 });

      renderDetailPage();

      await waitForDataLoaded();

      await waitFor(() => {
        expect(screen.getByText('関連するプロジェクトはありません')).toBeInTheDocument();
      });
    });

    it('プロジェクト名のリンクが正しいパスを持つ', async () => {
      renderDetailPage();

      await waitForDataLoaded();

      await waitFor(() => {
        expect(screen.getByText('プロジェクトA')).toBeInTheDocument();
      });

      const projectLink = screen.getByRole('link', { name: 'プロジェクトA' });
      expect(projectLink).toHaveAttribute('href', '/projects/project-1');
    });

    it('関連プロジェクト読み込み中はローディングを表示する', async () => {
      // プロジェクトAPIの解決を遅延させる
      mockGetProjects.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: mockRelatedProjects, total: 2 }), 200)
          )
      );

      renderDetailPage();

      await waitForDataLoaded();

      // プロジェクト読み込み中の表示確認
      const projectSection = screen.getByText('関連プロジェクト').closest('section');
      expect(projectSection).toBeDefined();
      expect(within(projectSection!).getByText('読み込み中...')).toBeInTheDocument();
    });
  });
});
