/**
 * @fileoverview TradingPartnerSelectコンポーネントのユニットテスト
 *
 * Requirements:
 * - 16.3: フリガナ検索でひらがな・カタカナ両対応
 * - 22.5: ひらがな・カタカナどちらの入力でも顧客を検索
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradingPartnerSelect from '../../../components/projects/TradingPartnerSelect';
import * as tradingPartnersApi from '../../../api/trading-partners';
import type { TradingPartnerInfo } from '../../../types/trading-partner.types';

// APIモック
vi.mock('../../../api/trading-partners', () => ({
  getTradingPartners: vi.fn(),
}));

// scrollIntoViewモック（jsdomでは未実装）
Element.prototype.scrollIntoView = vi.fn();

// テスト用取引先データ
const mockTradingPartners: TradingPartnerInfo[] = [
  {
    id: '1',
    name: '山田建設株式会社',
    nameKana: 'ヤマダケンセツカブシキガイシャ',
    branchName: '東京支店',
    branchNameKana: 'トウキョウシテン',
    representativeName: '山田太郎',
    representativeNameKana: 'ヤマダタロウ',
    types: ['CUSTOMER'],
    address: '東京都千代田区1-1-1',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: '鈴木工業株式会社',
    nameKana: 'スズキコウギョウカブシキガイシャ',
    branchName: null,
    branchNameKana: null,
    representativeName: '鈴木花子',
    representativeNameKana: 'スズキハナコ',
    types: ['CUSTOMER'],
    address: '大阪府大阪市2-2-2',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    name: '佐藤商事株式会社',
    nameKana: 'サトウショウジカブシキガイシャ',
    branchName: '大阪支社',
    branchNameKana: 'オオサカシシャ',
    representativeName: null,
    representativeNameKana: null,
    types: ['CUSTOMER'],
    address: '愛知県名古屋市3-3-3',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
];

describe('TradingPartnerSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトのAPIモック設定
    vi.mocked(tradingPartnersApi.getTradingPartners).mockResolvedValue({
      data: mockTradingPartners,
      pagination: {
        page: 1,
        limit: 100,
        total: mockTradingPartners.length,
        totalPages: 1,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本レンダリング', () => {
    it('顧客名ラベルを表示する', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByLabelText('顧客名')).toBeInTheDocument();
      });
    });

    it('取引先一覧をロードして表示する', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      // ローディング後、入力フィールドが有効になる
      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      // ドロップダウンを開く
      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      // 取引先候補が表示される
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });
  });

  describe('ひらがな・カタカナ両対応検索 (16.3, 22.5)', () => {
    it('ひらがな入力でカタカナフリガナを持つ取引先を検索できる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // ひらがなで検索（フリガナはカタカナで登録されている）
      await user.type(input, 'やまだ');

      // 山田建設株式会社が候補として表示される
      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(within(listbox).getByText('山田建設株式会社')).toBeInTheDocument();
      });
    });

    it('カタカナ入力で取引先を検索できる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // カタカナで検索
      await user.type(input, 'スズキ');

      // 鈴木工業株式会社が候補として表示される
      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(within(listbox).getByText('鈴木工業株式会社')).toBeInTheDocument();
      });
    });

    it('ひらがな入力で部課名（カタカナフリガナ）を検索できる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // ひらがなで部課名フリガナを検索
      await user.type(input, 'とうきょう');

      // 山田建設株式会社（東京支店）が候補として表示される
      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(within(listbox).getByText('山田建設株式会社')).toBeInTheDocument();
      });
    });

    it('ひらがな入力で代表者名（カタカナフリガナ）を検索できる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // ひらがなで代表者名フリガナを検索
      await user.type(input, 'はなこ');

      // 鈴木工業株式会社（代表者: 鈴木花子）が候補として表示される
      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(within(listbox).getByText('鈴木工業株式会社')).toBeInTheDocument();
      });
    });

    it('混合入力（ひらがな+漢字）で検索できる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // 漢字で検索
      await user.type(input, '佐藤');

      // 佐藤商事株式会社が候補として表示される
      await waitFor(() => {
        const listbox = screen.getByRole('listbox');
        expect(within(listbox).getByText('佐藤商事株式会社')).toBeInTheDocument();
      });
    });

    it('検索結果が0件の場合、「該当する取引先がありません」を表示する', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // 存在しない取引先を検索
      await user.type(input, 'xyz存在しない会社');

      // 該当なしメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('該当する取引先がありません')).toBeInTheDocument();
      });
    });
  });

  describe('キーボード操作', () => {
    it('上下キーで候補を選択できる', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      // ドロップダウンが開く
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // 下キーで移動（fireEventを使用）
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // 選択状態が変わる（aria-activedescendantで確認）
      await waitFor(() => {
        expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
      });
    });

    it('Enterキーで候補を選択できる', async () => {
      const handleChange = vi.fn();
      render(<TradingPartnerSelect value="" onChange={handleChange} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // 下キーで最初の取引先を選択してEnter（fireEventを使用）
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      // onChangeが呼ばれる
      expect(handleChange).toHaveBeenCalledWith('1');
    });

    it('Escapeキーでドロップダウンを閉じる', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Escapeキーで閉じる（fireEventを使用）
      fireEvent.keyDown(input, { key: 'Escape' });

      // リストボックスが閉じる
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('選択と値の管理', () => {
    it('取引先を選択するとonChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<TradingPartnerSelect value="" onChange={handleChange} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // 取引先をクリックして選択
      const listbox = screen.getByRole('listbox');
      await user.click(within(listbox).getByText('鈴木工業株式会社'));

      expect(handleChange).toHaveBeenCalledWith('2');
    });

    it('選択済みの取引先をクリアできる', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<TradingPartnerSelect value="1" onChange={handleChange} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      // クリアボタンをクリック
      const clearButton = screen.getByLabelText('選択をクリア');
      await user.click(clearButton);

      expect(handleChange).toHaveBeenCalledWith('');
    });
  });

  describe('エラー表示', () => {
    it('エラーメッセージを表示する', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} error="取引先を選択してください" />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      expect(screen.getByRole('alert')).toHaveTextContent('取引先を選択してください');
    });

    it('API取得エラー時にエラーメッセージを表示する', async () => {
      vi.mocked(tradingPartnersApi.getTradingPartners).mockRejectedValue(new Error('API Error'));

      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('取引先一覧の取得に失敗しました')).toBeInTheDocument();
      });
    });
  });

  describe('無効状態', () => {
    it('disabled時は入力を受け付けない', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} disabled={true} />);

      await waitFor(() => {
        const input = screen.getByRole('combobox');
        expect(input).toBeDisabled();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-label属性が正しく設定される', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-label', '顧客名');
    });

    it('aria-expanded属性がドロップダウン状態を反映する', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');

      // 初期状態はexpanded=false
      expect(input).toHaveAttribute('aria-expanded', 'false');

      // フォーカスでexpanded=true
      fireEvent.focus(input);
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      render(<TradingPartnerSelect value="" onChange={vi.fn()} error="エラー" />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).not.toBeDisabled();
      });

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
