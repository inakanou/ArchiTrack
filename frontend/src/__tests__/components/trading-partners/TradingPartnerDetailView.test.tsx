/**
 * @fileoverview TradingPartnerDetailView コンポーネントのテスト
 *
 * Task 10.1: 取引先詳細表示コンポーネントの実装
 *
 * Requirements:
 * - 3.1: ユーザーが一覧から取引先を選択したとき、取引先詳細ページを表示する
 * - 3.2: 以下の情報を詳細ページに表示する: 名前、フリガナ、部課/支店/支社名、部課/支店/支社フリガナ、
 *        代表者名、代表者フリガナ、種別、住所、電話番号、FAX番号、メールアドレス、請求締日、支払日、
 *        備考、登録日、更新日
 * - 3.3: 編集ボタンと削除ボタンを詳細ページに表示する
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradingPartnerDetailView from '../../../components/trading-partners/TradingPartnerDetailView';
import type { TradingPartnerDetail } from '../../../types/trading-partner.types';

// ============================================================================
// テストデータ
// ============================================================================

const mockTradingPartner: TradingPartnerDetail = {
  id: 'partner-1',
  name: 'テスト株式会社',
  nameKana: 'テストカブシキガイシャ',
  branchName: '東京支店',
  branchNameKana: 'トウキョウシテン',
  representativeName: '山田太郎',
  representativeNameKana: 'ヤマダタロウ',
  types: ['CUSTOMER', 'SUBCONTRACTOR'],
  address: '東京都渋谷区1-2-3',
  phoneNumber: '03-1234-5678',
  faxNumber: '03-1234-5679',
  email: 'test@example.com',
  billingClosingDay: 25,
  paymentMonthOffset: 1,
  paymentDay: 10,
  notes: 'テスト用の備考です。\n複数行の備考も対応しています。',
  createdAt: '2025-01-15T10:30:00.000Z',
  updatedAt: '2025-12-10T14:45:00.000Z',
};

const mockTradingPartnerMinimal: TradingPartnerDetail = {
  id: 'partner-2',
  name: '最小限株式会社',
  nameKana: 'サイショウゲンカブシキガイシャ',
  branchName: null,
  branchNameKana: null,
  representativeName: null,
  representativeNameKana: null,
  types: ['CUSTOMER'],
  address: '大阪府大阪市1-1-1',
  phoneNumber: null,
  faxNumber: null,
  email: null,
  billingClosingDay: null,
  paymentMonthOffset: null,
  paymentDay: null,
  notes: null,
  createdAt: '2025-06-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
};

const mockTradingPartnerWithLastDay: TradingPartnerDetail = {
  ...mockTradingPartner,
  id: 'partner-3',
  billingClosingDay: 99,
  paymentMonthOffset: 2,
  paymentDay: 99,
};

// ============================================================================
// テスト
// ============================================================================

describe('TradingPartnerDetailView', () => {
  // ==========================================================================
  // 3.2: 全フィールドの表示
  // ==========================================================================

  describe('全フィールドの表示（Requirements 3.2）', () => {
    it('取引先名を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // ヘッダーと基本情報セクションの両方に表示されるため複数ある
      const nameElements = screen.getAllByText('テスト株式会社');
      expect(nameElements.length).toBeGreaterThanOrEqual(1);
    });

    it('フリガナを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // ヘッダーと基本情報セクションの両方に表示される可能性がある
      const kanaElements = screen.getAllByText('テストカブシキガイシャ');
      expect(kanaElements.length).toBeGreaterThanOrEqual(1);
    });

    it('部課/支店/支社名を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('東京支店')).toBeInTheDocument();
    });

    it('部課/支店/支社フリガナを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('トウキョウシテン')).toBeInTheDocument();
    });

    it('代表者名を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('山田太郎')).toBeInTheDocument();
    });

    it('代表者フリガナを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('ヤマダタロウ')).toBeInTheDocument();
    });

    it('取引先種別（複数）を日本語ラベルで表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('顧客')).toBeInTheDocument();
      expect(screen.getByText('協力業者')).toBeInTheDocument();
    });

    it('住所を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('東京都渋谷区1-2-3')).toBeInTheDocument();
    });

    it('電話番号を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('03-1234-5678')).toBeInTheDocument();
    });

    it('FAX番号を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('03-1234-5679')).toBeInTheDocument();
    });

    it('メールアドレスを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('備考を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText(/テスト用の備考です/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 請求締日と支払日の日本語表記変換
  // ==========================================================================

  describe('請求締日と支払日の日本語表記変換', () => {
    it('請求締日を「○日」の形式で表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('25日')).toBeInTheDocument();
    });

    it('請求締日が99の場合「末日」と表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerWithLastDay}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // 請求締日の値として末日が表示される
      expect(screen.getByText('末日')).toBeInTheDocument();
    });

    it('支払日を「翌月○日」の形式で表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('翌月10日')).toBeInTheDocument();
    });

    it('支払日が翌々月の場合「翌々月○日」と表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={{ ...mockTradingPartner, paymentMonthOffset: 2 }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('翌々月10日')).toBeInTheDocument();
    });

    it('支払日が3ヶ月後の場合「3ヶ月後○日」と表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={{ ...mockTradingPartner, paymentMonthOffset: 3 }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('3ヶ月後10日')).toBeInTheDocument();
    });

    it('支払日が末日の場合「翌々月末日」と表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerWithLastDay}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('翌々月末日')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 登録日・更新日の表示
  // ==========================================================================

  describe('登録日・更新日の表示', () => {
    it('登録日を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('登録日')).toBeInTheDocument();
      // 日本語ロケールで表示されることを確認（フォーマットは2025/01/15のような形式）
      expect(screen.getByText(/2025.*01.*15/)).toBeInTheDocument();
    });

    it('更新日を表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('更新日')).toBeInTheDocument();
      // 日本語ロケールで表示されることを確認
      expect(screen.getByText(/2025.*12.*10/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 3.3: 編集ボタンと削除ボタンの配置
  // ==========================================================================

  describe('編集ボタンと削除ボタンの配置（Requirements 3.3）', () => {
    it('編集ボタンを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    });

    it('削除ボタンを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('編集ボタンクリック時にonEditコールバックが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleEdit = vi.fn();

      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={handleEdit}
          onDelete={() => {}}
        />
      );

      const editButton = screen.getByRole('button', { name: '編集' });
      await user.click(editButton);

      expect(handleEdit).toHaveBeenCalledTimes(1);
    });

    it('削除ボタンクリック時にonDeleteコールバックが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleDelete = vi.fn();

      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={handleDelete}
        />
      );

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(handleDelete).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 任意項目が未設定の場合の表示
  // ==========================================================================

  describe('任意項目が未設定の場合の表示', () => {
    it('部課/支店/支社名が未設定の場合はハイフンを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerMinimal}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // 部課/支店/支社名のラベルがあるフィールド内にハイフンが表示される
      // ラベルの親要素（field）を取得
      const branchNameLabel = screen.getByText('部課/支店/支社名');
      const fieldContainer = branchNameLabel.parentElement;
      expect(fieldContainer).toHaveTextContent('-');
    });

    it('電話番号が未設定の場合はハイフンを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerMinimal}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      const phoneLabel = screen.getByText('電話番号');
      const fieldContainer = phoneLabel.parentElement;
      expect(fieldContainer).toHaveTextContent('-');
    });

    it('請求締日が未設定の場合はハイフンを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerMinimal}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      const billingLabel = screen.getByText('請求締日');
      const fieldContainer = billingLabel.parentElement;
      expect(fieldContainer).toHaveTextContent('-');
    });

    it('支払日が未設定の場合はハイフンを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerMinimal}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      const paymentLabel = screen.getByText('支払日');
      const fieldContainer = paymentLabel.parentElement;
      expect(fieldContainer).toHaveTextContent('-');
    });

    it('備考が未設定の場合は備考セクションを表示しない', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartnerMinimal}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // 備考のセクション見出しが表示されないことを確認
      expect(screen.queryByRole('heading', { name: '備考' })).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('見出しレベルが正しく設定される', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // 基本情報セクションの見出し
      expect(screen.getByRole('heading', { name: '基本情報' })).toBeInTheDocument();
    });

    it('ボタンにアクセシブルな名前が設定される', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 取引先種別の表示
  // ==========================================================================

  describe('取引先種別の表示', () => {
    it('顧客のみの場合「顧客」と表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={{ ...mockTradingPartner, types: ['CUSTOMER'] }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('顧客')).toBeInTheDocument();
      expect(screen.queryByText('協力業者')).not.toBeInTheDocument();
    });

    it('協力業者のみの場合「協力業者」と表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={{ ...mockTradingPartner, types: ['SUBCONTRACTOR'] }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(screen.getByText('協力業者')).toBeInTheDocument();
      expect(screen.queryByText('顧客')).not.toBeInTheDocument();
    });

    it('両方の場合は両方のバッジを表示する', () => {
      render(
        <TradingPartnerDetailView
          partner={mockTradingPartner}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      // 両方のラベルが表示されていることを確認
      expect(screen.getByText('顧客')).toBeInTheDocument();
      expect(screen.getByText('協力業者')).toBeInTheDocument();
    });
  });
});
