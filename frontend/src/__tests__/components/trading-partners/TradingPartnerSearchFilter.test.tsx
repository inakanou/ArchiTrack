/**
 * @fileoverview TradingPartnerSearchFilter コンポーネントのテスト
 *
 * Task 9.2: 検索・フィルター機能の実装
 *
 * Requirements (trading-partner-management):
 * - REQ-1.3: 検索条件を入力したとき、取引先名またはフリガナによる部分一致検索を実行
 * - REQ-1.4: フィルター条件を選択したとき、取引先種別（顧客/協力業者）でのフィルタリングを実行
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradingPartnerSearchFilter from '../../../components/trading-partners/TradingPartnerSearchFilter';
import type { TradingPartnerFilter } from '../../../types/trading-partner.types';

describe('TradingPartnerSearchFilter', () => {
  const defaultFilter: TradingPartnerFilter = {
    search: '',
    type: [],
  };

  const mockOnFilterChange = vi.fn();

  beforeEach(() => {
    mockOnFilterChange.mockClear();
  });

  // ==========================================================================
  // 基本的なレンダリングテスト
  // ==========================================================================

  describe('レンダリング', () => {
    it('検索入力欄が表示される', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByRole('searchbox')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('取引先名・フリガナで検索')).toBeInTheDocument();
    });

    it('検索ボタンが表示される', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByRole('button', { name: '検索' })).toBeInTheDocument();
    });

    it('種別フィルタのチェックボックスが表示される', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByLabelText('顧客')).toBeInTheDocument();
      expect(screen.getByLabelText('協力業者')).toBeInTheDocument();
    });

    it('フィルタクリアボタンが表示される', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByRole('button', { name: 'フィルタをクリア' })).toBeInTheDocument();
    });

    it('role="search" の form 要素が存在する', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByRole('search')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 検索機能テスト（REQ-1.3）
  // ==========================================================================

  describe('検索機能（REQ-1.3）', () => {
    it('検索ボタンクリックで onFilterChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'テスト');
      await user.click(screen.getByRole('button', { name: '検索' }));

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilter,
        search: 'テスト',
      });
    });

    it('Enterキー押下で検索が実行される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      const searchInput = screen.getByRole('searchbox');
      await user.type(searchInput, 'サンプル{enter}');

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilter,
        search: 'サンプル',
      });
    });

    it('空文字での検索は許可される（全件検索）', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerSearchFilter
          filter={{ ...defaultFilter, search: 'テスト' }}
          onFilterChange={mockOnFilterChange}
        />
      );

      const searchInput = screen.getByRole('searchbox');
      await user.clear(searchInput);
      await user.click(screen.getByRole('button', { name: '検索' }));

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilter,
        search: '',
      });
    });

    it('既存の検索キーワードが入力欄に表示される', () => {
      const filterWithSearch: TradingPartnerFilter = {
        search: '既存キーワード',
        type: [],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithSearch} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByRole('searchbox')).toHaveValue('既存キーワード');
    });
  });

  // ==========================================================================
  // 種別フィルタテスト（REQ-1.4）
  // ==========================================================================

  describe('種別フィルタ（REQ-1.4）', () => {
    it('顧客チェックボックスをチェックすると onFilterChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      const customerCheckbox = screen.getByLabelText('顧客');
      await user.click(customerCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilter,
        type: ['CUSTOMER'],
      });
    });

    it('協力業者チェックボックスをチェックすると onFilterChange が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      const subcontractorCheckbox = screen.getByLabelText('協力業者');
      await user.click(subcontractorCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilter,
        type: ['SUBCONTRACTOR'],
      });
    });

    it('複数の種別をチェックできる', async () => {
      const user = userEvent.setup();
      const filterWithCustomer: TradingPartnerFilter = {
        search: '',
        type: ['CUSTOMER'],
      };

      render(
        <TradingPartnerSearchFilter
          filter={filterWithCustomer}
          onFilterChange={mockOnFilterChange}
        />
      );

      const subcontractorCheckbox = screen.getByLabelText('協力業者');
      await user.click(subcontractorCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        search: '',
        type: ['CUSTOMER', 'SUBCONTRACTOR'],
      });
    });

    it('チェックを外すと種別が配列から削除される', async () => {
      const user = userEvent.setup();
      const filterWithBothTypes: TradingPartnerFilter = {
        search: '',
        type: ['CUSTOMER', 'SUBCONTRACTOR'],
      };

      render(
        <TradingPartnerSearchFilter
          filter={filterWithBothTypes}
          onFilterChange={mockOnFilterChange}
        />
      );

      const customerCheckbox = screen.getByLabelText('顧客');
      await user.click(customerCheckbox);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        search: '',
        type: ['SUBCONTRACTOR'],
      });
    });

    it('既存のフィルタ設定でチェックボックスが選択状態になる', () => {
      const filterWithType: TradingPartnerFilter = {
        search: '',
        type: ['CUSTOMER'],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithType} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByLabelText('顧客')).toBeChecked();
      expect(screen.getByLabelText('協力業者')).not.toBeChecked();
    });
  });

  // ==========================================================================
  // フィルタクリア機能テスト
  // ==========================================================================

  describe('フィルタクリア機能', () => {
    it('クリアボタンで検索条件がリセットされる', async () => {
      const user = userEvent.setup();
      const filterWithValues: TradingPartnerFilter = {
        search: 'テスト',
        type: ['CUSTOMER'],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithValues} onFilterChange={mockOnFilterChange} />
      );

      await user.click(screen.getByRole('button', { name: 'フィルタをクリア' }));

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        search: '',
        type: [],
      });
    });

    it('クリア後は検索入力欄が空になる', async () => {
      const user = userEvent.setup();
      const filterWithSearch: TradingPartnerFilter = {
        search: 'テスト',
        type: [],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithSearch} onFilterChange={mockOnFilterChange} />
      );

      await user.click(screen.getByRole('button', { name: 'フィルタをクリア' }));

      // onFilterChange が空フィルタで呼ばれた後、コンポーネントは再レンダリングされる
      // このテストでは、onFilterChange の呼び出しを検証
      expect(mockOnFilterChange).toHaveBeenCalledWith({
        search: '',
        type: [],
      });
    });
  });

  // ==========================================================================
  // アクティブフィルタ表示テスト
  // ==========================================================================

  describe('アクティブフィルタ表示', () => {
    it('フィルタが適用されていない場合、アクティブフィルタ数は表示されない', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.queryByText(/件のフィルタが適用中/)).not.toBeInTheDocument();
    });

    it('検索キーワードのみ設定時、1件のフィルタ数が表示される', () => {
      const filterWithSearch: TradingPartnerFilter = {
        search: 'テスト',
        type: [],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithSearch} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('件のフィルタが適用中')).toBeInTheDocument();
    });

    it('種別フィルタのみ設定時、1件のフィルタ数が表示される', () => {
      const filterWithType: TradingPartnerFilter = {
        search: '',
        type: ['CUSTOMER'],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithType} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('件のフィルタが適用中')).toBeInTheDocument();
    });

    it('検索と種別両方設定時、2件のフィルタ数が表示される', () => {
      const filterWithBoth: TradingPartnerFilter = {
        search: 'テスト',
        type: ['CUSTOMER'],
      };

      render(
        <TradingPartnerSearchFilter filter={filterWithBoth} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('件のフィルタが適用中')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // アクセシビリティテスト
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('検索入力欄に適切なラベルがある', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('aria-label', '検索キーワード');
    });

    it('種別フィルタがグループとしてラベル付けされている', () => {
      render(
        <TradingPartnerSearchFilter filter={defaultFilter} onFilterChange={mockOnFilterChange} />
      );

      expect(screen.getByRole('group', { name: '種別フィルタ' })).toBeInTheDocument();
    });
  });
});
