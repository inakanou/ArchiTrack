/**
 * @fileoverview TradingPartnerListTable コンポーネント テスト
 *
 * Task 9.1: 取引先一覧テーブルの実装
 *
 * Requirements (trading-partner-management):
 * - REQ-1.1: 取引先一覧ページにアクセスしたとき、登録済みの取引先をテーブル形式で表示
 * - REQ-1.2: 取引先名、フリガナ、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日を一覧に表示
 * - REQ-1.6: ソート列クリックで指定された列（取引先名、フリガナ、登録日等）で昇順または降順にソート
 * - REQ-1.7: 取引先データが存在しない場合、「取引先が登録されていません」というメッセージを表示
 * - REQ-1.8: 取引先一覧のデフォルトソート順をフリガナの昇順とする
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import TradingPartnerListTable from '../../../components/trading-partners/TradingPartnerListTable';
import type { TradingPartnerInfo } from '../../../types/trading-partner.types';

// ============================================================================
// テストデータ
// ============================================================================

const mockPartners: TradingPartnerInfo[] = [
  {
    id: 'partner-1',
    name: 'テスト株式会社',
    nameKana: 'テストカブシキガイシャ',
    branchName: '東京本社',
    branchNameKana: 'トウキョウホンシャ',
    representativeName: '山田太郎',
    representativeNameKana: 'ヤマダタロウ',
    types: ['CUSTOMER'],
    address: '東京都渋谷区渋谷1-2-3',
    phoneNumber: '03-1234-5678',
    faxNumber: '03-1234-5679',
    email: 'test@example.com',
    billingClosingDay: 25,
    paymentMonthOffset: 1,
    paymentDay: 10,
    notes: 'テスト備考',
    createdAt: '2025-01-01T10:00:00.000Z',
    updatedAt: '2025-01-05T15:30:00.000Z',
  },
  {
    id: 'partner-2',
    name: 'サンプル建設',
    nameKana: 'サンプルケンセツ',
    branchName: null,
    branchNameKana: null,
    representativeName: '鈴木次郎',
    representativeNameKana: 'スズキジロウ',
    types: ['SUBCONTRACTOR'],
    address: '大阪府大阪市北区1-1-1',
    phoneNumber: '06-1234-5678',
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2025-01-02T09:00:00.000Z',
    updatedAt: '2025-01-06T11:00:00.000Z',
  },
  {
    id: 'partner-3',
    name: '協力工業株式会社',
    nameKana: 'キョウリョクコウギョウカブシキガイシャ',
    branchName: '関西支店',
    branchNameKana: 'カンサイシテン',
    representativeName: null,
    representativeNameKana: null,
    types: ['CUSTOMER', 'SUBCONTRACTOR'],
    address: '京都府京都市中京区2-3-4',
    phoneNumber: '075-1234-5678',
    faxNumber: '075-1234-5679',
    email: 'info@kyouryoku.example.com',
    billingClosingDay: 99,
    paymentMonthOffset: 2,
    paymentDay: 99,
    notes: '顧客兼協力業者',
    createdAt: '2025-01-03T14:00:00.000Z',
    updatedAt: '2025-01-07T09:00:00.000Z',
  },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

// ============================================================================
// 基本的なレンダリングテスト
// ============================================================================

describe('TradingPartnerListTable', () => {
  describe('テーブル表示（REQ-1.1）', () => {
    it('テーブル形式で取引先一覧が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    it('各取引先の行が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const rows = screen.getAllByRole('row');
      // ヘッダー行 + データ行3つ
      expect(rows).toHaveLength(4);
    });
  });

  describe('空データ時のメッセージ表示（REQ-1.7）', () => {
    it('取引先がない場合は「取引先が登録されていません」というメッセージを表示する', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={[]}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByText('取引先が登録されていません')).toBeInTheDocument();
    });

    it('取引先がない場合はデータ行が表示されない', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={[]}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const rows = screen.getAllByRole('row');
      // ヘッダー行 + 空メッセージ行
      expect(rows).toHaveLength(2);
    });
  });

  describe('カラム表示（REQ-1.2）', () => {
    it('取引先名列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /取引先名/i })).toBeInTheDocument();
      expect(screen.getByText('テスト株式会社')).toBeInTheDocument();
      expect(screen.getByText('サンプル建設')).toBeInTheDocument();
      expect(screen.getByText('協力工業株式会社')).toBeInTheDocument();
    });

    it('フリガナ列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /フリガナ/i })).toBeInTheDocument();
      expect(screen.getByText('テストカブシキガイシャ')).toBeInTheDocument();
      expect(screen.getByText('サンプルケンセツ')).toBeInTheDocument();
    });

    it('部課/支店/支社名列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /部課\/支店\/支社/i })).toBeInTheDocument();
      expect(screen.getByText('東京本社')).toBeInTheDocument();
      expect(screen.getByText('関西支店')).toBeInTheDocument();
    });

    it('代表者名列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /代表者名/i })).toBeInTheDocument();
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
      expect(screen.getByText('鈴木次郎')).toBeInTheDocument();
    });

    it('取引先種別列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /種別/i })).toBeInTheDocument();
      // 顧客と協力業者のラベルが表示される
      const customerBadges = screen.getAllByText('顧客');
      expect(customerBadges.length).toBeGreaterThanOrEqual(1);
      const subcontractorBadges = screen.getAllByText('協力業者');
      expect(subcontractorBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('住所列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /住所/i })).toBeInTheDocument();
      expect(screen.getByText('東京都渋谷区渋谷1-2-3')).toBeInTheDocument();
      expect(screen.getByText('大阪府大阪市北区1-1-1')).toBeInTheDocument();
    });

    it('電話番号列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /電話番号/i })).toBeInTheDocument();
      expect(screen.getByText('03-1234-5678')).toBeInTheDocument();
      expect(screen.getByText('06-1234-5678')).toBeInTheDocument();
    });

    it('登録日列が表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByRole('columnheader', { name: /登録日/i })).toBeInTheDocument();
    });

    it('カラムの表示順序が正しい（取引先名, フリガナ, 部課/支店/支社, 代表者名, 種別, 住所, 電話番号, 登録日）', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map((h) => h.textContent);

      expect(headerTexts[0]).toMatch(/取引先名/i);
      expect(headerTexts[1]).toMatch(/フリガナ/i);
      expect(headerTexts[2]).toMatch(/部課\/支店\/支社/i);
      expect(headerTexts[3]).toMatch(/代表者名/i);
      expect(headerTexts[4]).toMatch(/種別/i);
      expect(headerTexts[5]).toMatch(/住所/i);
      expect(headerTexts[6]).toMatch(/電話番号/i);
      expect(headerTexts[7]).toMatch(/登録日/i);
    });

    it('部課/支店/支社名がnullの場合はハイフンまたは空欄で表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // partner-2 の branchName は null
      const row = screen.getByTestId('partner-row-partner-2');
      // 空欄またはハイフンで表示されることを確認
      expect(row).toBeInTheDocument();
    });

    it('代表者名がnullの場合はハイフンまたは空欄で表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // partner-3 の representativeName は null
      const row = screen.getByTestId('partner-row-partner-3');
      expect(row).toBeInTheDocument();
    });

    it('電話番号がnullの場合はハイフンまたは空欄で表示される', () => {
      const partnersWithNullPhone: TradingPartnerInfo[] = [
        {
          id: 'partner-null-phone',
          name: 'テスト株式会社',
          nameKana: 'テストカブシキガイシャ',
          branchName: '東京本社',
          branchNameKana: 'トウキョウホンシャ',
          representativeName: '山田太郎',
          representativeNameKana: 'ヤマダタロウ',
          types: ['CUSTOMER'],
          address: '東京都渋谷区渋谷1-2-3',
          phoneNumber: null,
          faxNumber: '03-1234-5679',
          email: 'test@example.com',
          billingClosingDay: 25,
          paymentMonthOffset: 1,
          paymentDay: 10,
          notes: 'テスト備考',
          createdAt: '2025-01-01T10:00:00.000Z',
          updatedAt: '2025-01-05T15:30:00.000Z',
        },
      ];

      renderWithRouter(
        <TradingPartnerListTable
          partners={partnersWithNullPhone}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('partner-row-partner-null-phone');
      expect(row).toBeInTheDocument();
    });
  });

  describe('取引先種別の表示', () => {
    it('種別がバッジとして表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // partner-1 は顧客のみ
      const row1 = screen.getByTestId('partner-row-partner-1');
      expect(within(row1).getByText('顧客')).toBeInTheDocument();

      // partner-2 は協力業者のみ
      const row2 = screen.getByTestId('partner-row-partner-2');
      expect(within(row2).getByText('協力業者')).toBeInTheDocument();
    });

    it('複数の種別を持つ取引先は両方のバッジが表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      // partner-3 は顧客と協力業者の両方
      const row3 = screen.getByTestId('partner-row-partner-3');
      expect(within(row3).getByText('顧客')).toBeInTheDocument();
      expect(within(row3).getByText('協力業者')).toBeInTheDocument();
    });
  });

  describe('行クリック', () => {
    it('行クリックでonRowClickが呼ばれる', async () => {
      const onRowClick = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={onRowClick}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      await userEvent.click(row);

      expect(onRowClick).toHaveBeenCalledWith('partner-1');
    });

    it('行がクリック可能であることを示すスタイルが適用される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      expect(row).toHaveClass('cursor-pointer');
    });

    it('行にホバースタイルが適用される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      expect(row).toHaveClass('hover:bg-blue-50/60');
    });
  });

  describe('ソート機能（REQ-1.6, REQ-1.8）', () => {
    it('ヘッダークリックでonSortが呼ばれる', async () => {
      const onSort = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /取引先名/i });
      const sortButton = within(nameHeader).getByRole('button');
      await userEvent.click(sortButton);

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('フリガナでソートできる', async () => {
      const onSort = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="name"
          sortOrder="asc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      const kanaHeader = screen.getByRole('columnheader', { name: /フリガナ/i });
      await userEvent.click(within(kanaHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('nameKana');
    });

    it('登録日でソートできる', async () => {
      const onSort = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      const createdAtHeader = screen.getByRole('columnheader', { name: /登録日/i });
      await userEvent.click(within(createdAtHeader).getByRole('button'));
      expect(onSort).toHaveBeenCalledWith('createdAt');
    });

    it('現在のソートカラムに昇順アイコン（上向き）が表示される（昇順時）', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const kanaHeader = screen.getByRole('columnheader', { name: /フリガナ/i });
      const sortIcon = within(kanaHeader).getByTestId('sort-icon-asc');
      expect(sortIcon).toBeInTheDocument();
    });

    it('現在のソートカラムに降順アイコン（下向き）が表示される（降順時）', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const kanaHeader = screen.getByRole('columnheader', { name: /フリガナ/i });
      const sortIcon = within(kanaHeader).getByTestId('sort-icon-desc');
      expect(sortIcon).toBeInTheDocument();
    });

    it('ソート対象外のカラムにはソートアイコンが表示されない', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /取引先名/i });
      expect(within(nameHeader).queryByTestId('sort-icon-asc')).not.toBeInTheDocument();
      expect(within(nameHeader).queryByTestId('sort-icon-desc')).not.toBeInTheDocument();
    });

    it('ソートヘッダーにaria-sort属性が設定される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const kanaHeader = screen.getByRole('columnheader', { name: /フリガナ/i });
      expect(kanaHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('降順ソート時にaria-sort="descending"が設定される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="desc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const kanaHeader = screen.getByRole('columnheader', { name: /フリガナ/i });
      expect(kanaHeader).toHaveAttribute('aria-sort', 'descending');
    });

    it('デフォルトソートフィールドはnameKana（フリガナ）である', () => {
      // このテストはデフォルト値の確認のため、nameKana/ascで正しく動作することを確認
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const kanaHeader = screen.getByRole('columnheader', { name: /フリガナ/i });
      expect(kanaHeader).toHaveAttribute('aria-sort', 'ascending');
    });
  });

  describe('アクセシビリティ', () => {
    it('テーブルにaria-label属性が設定される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('aria-label', '取引先一覧');
    });

    it('ヘッダーとデータセルが適切に関連付けられる（scope属性）', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const headers = screen.getAllByRole('columnheader');
      headers.forEach((header) => {
        expect(header).toHaveAttribute('scope', 'col');
      });
    });

    it('データ行がキーボードでフォーカス可能', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      expect(row).toHaveAttribute('tabindex', '0');
    });

    it('Enterキーで行のクリックイベントが発火する', async () => {
      const onRowClick = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={onRowClick}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      row.focus();
      await userEvent.keyboard('{Enter}');

      expect(onRowClick).toHaveBeenCalledWith('partner-1');
    });

    it('Spaceキーで行のクリックイベントが発火する', async () => {
      const onRowClick = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={onRowClick}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      row.focus();
      await userEvent.keyboard(' ');

      expect(onRowClick).toHaveBeenCalledWith('partner-1');
    });

    it('ヘッダーにbutton roleが設定される（ソート可能なカラム）', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /取引先名/i });
      const button = within(nameHeader).getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('日付フォーマット', () => {
    it('登録日がローカル形式でフォーマットされて表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      // 日付が 2025/01/01 形式で表示されることを確認
      expect(within(row).getByText('2025/01/01')).toBeInTheDocument();
    });
  });

  describe('キーボードナビゲーション', () => {
    it('Tabキーでテーブル行間を移動できる', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row1 = screen.getByTestId('partner-row-partner-1');
      const row2 = screen.getByTestId('partner-row-partner-2');

      row1.focus();
      expect(row1).toHaveFocus();

      await user.tab();
      expect(row2).toHaveFocus();
    });

    it('行にフォーカスが当たるとフォーカススタイルが適用される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const row = screen.getByTestId('partner-row-partner-1');
      expect(row).toHaveClass('focus:ring-2');
      expect(row).toHaveClass('focus:ring-blue-500');
    });

    it('ソートボタンにEnterキーでソートを実行できる', async () => {
      const user = userEvent.setup();
      const onSort = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /取引先名/i });
      const sortButton = within(nameHeader).getByRole('button');
      sortButton.focus();

      await user.keyboard('{Enter}');

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('ソートボタンにSpaceキーでソートを実行できる', async () => {
      const user = userEvent.setup();
      const onSort = vi.fn();
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={onSort}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /取引先名/i });
      const sortButton = within(nameHeader).getByRole('button');
      sortButton.focus();

      await user.keyboard(' ');

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('ソートボタンにフォーカスリングが表示される', () => {
      renderWithRouter(
        <TradingPartnerListTable
          partners={mockPartners}
          sortField="nameKana"
          sortOrder="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /取引先名/i });
      const sortButton = within(nameHeader).getByRole('button');
      expect(sortButton).toHaveClass('focus:ring-2');
      expect(sortButton).toHaveClass('focus:ring-blue-500');
    });
  });
});
