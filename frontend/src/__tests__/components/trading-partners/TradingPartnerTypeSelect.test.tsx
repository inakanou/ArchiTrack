/**
 * @fileoverview TradingPartnerTypeSelectコンポーネントのユニットテスト
 *
 * Task 7.1: 取引先種別選択コンポーネントの実装
 *
 * Requirements:
 * - 2.6: 種別選択肢として「顧客」と「協力業者」をチェックボックスで提供し、複数選択を可能とする
 * - 6.4: ユーザーが取引先を登録または編集するとき、取引先種別をチェックボックスで選択させる
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradingPartnerTypeSelect from '../../../components/trading-partners/TradingPartnerTypeSelect';
import type { TradingPartnerType } from '../../../types/trading-partner.types';

// onChangeハンドラの型定義
type OnChangeHandler = (types: TradingPartnerType[]) => void;

describe('TradingPartnerTypeSelect', () => {
  // Vitest MockとReact propsの型互換性のために as unknown as パターンを使用
  let onChange: Mock<OnChangeHandler>;

  beforeEach(() => {
    onChange = vi.fn<OnChangeHandler>();
  });

  describe('基本レンダリング', () => {
    it('ラベルと2つのチェックボックスが表示される', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      // ラベルが表示される
      expect(screen.getByText('取引先種別')).toBeInTheDocument();

      // 顧客チェックボックスが存在する
      expect(screen.getByRole('checkbox', { name: /顧客/ })).toBeInTheDocument();

      // 協力業者チェックボックスが存在する
      expect(screen.getByRole('checkbox', { name: /協力業者/ })).toBeInTheDocument();
    });

    it('required=trueの場合、必須マーカーが表示される', () => {
      render(
        <TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" required />
      );

      // 必須マーカー（*）が表示される
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('カスタムラベルが使用される', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="種別選択" />);

      expect(screen.getByText('種別選択')).toBeInTheDocument();
    });
  });

  describe('チェックボックス表示 (2.6)', () => {
    it('顧客と協力業者のチェックボックスが提供される', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).toBeInTheDocument();
      expect(subcontractorCheckbox).toBeInTheDocument();
    });

    it('チェックボックスに適切なラベルが表示される', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      expect(screen.getByText('顧客')).toBeInTheDocument();
      expect(screen.getByText('協力業者')).toBeInTheDocument();
    });
  });

  describe('複数選択対応 (2.6)', () => {
    it('顧客のみが選択されている場合、顧客チェックボックスのみがチェックされる', () => {
      render(
        <TradingPartnerTypeSelect value={['CUSTOMER']} onChange={onChange} label="取引先種別" />
      );

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).toBeChecked();
      expect(subcontractorCheckbox).not.toBeChecked();
    });

    it('協力業者のみが選択されている場合、協力業者チェックボックスのみがチェックされる', () => {
      render(
        <TradingPartnerTypeSelect
          value={['SUBCONTRACTOR']}
          onChange={onChange}
          label="取引先種別"
        />
      );

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).not.toBeChecked();
      expect(subcontractorCheckbox).toBeChecked();
    });

    it('両方が選択されている場合、両方のチェックボックスがチェックされる', () => {
      render(
        <TradingPartnerTypeSelect
          value={['CUSTOMER', 'SUBCONTRACTOR']}
          onChange={onChange}
          label="取引先種別"
        />
      );

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).toBeChecked();
      expect(subcontractorCheckbox).toBeChecked();
    });

    it('何も選択されていない場合、両方のチェックボックスがチェックされていない', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).not.toBeChecked();
      expect(subcontractorCheckbox).not.toBeChecked();
    });
  });

  describe('選択操作 (6.4)', () => {
    it('顧客チェックボックスをクリックすると、CUSTOMERが追加される', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      await user.click(customerCheckbox);

      expect(onChange).toHaveBeenCalledWith(['CUSTOMER']);
    });

    it('協力業者チェックボックスをクリックすると、SUBCONTRACTORが追加される', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });
      await user.click(subcontractorCheckbox);

      expect(onChange).toHaveBeenCalledWith(['SUBCONTRACTOR']);
    });

    it('既に選択されている顧客をクリックすると、CUSTOMERが削除される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerTypeSelect
          value={['CUSTOMER', 'SUBCONTRACTOR']}
          onChange={onChange}
          label="取引先種別"
        />
      );

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      await user.click(customerCheckbox);

      expect(onChange).toHaveBeenCalledWith(['SUBCONTRACTOR']);
    });

    it('既に選択されている協力業者をクリックすると、SUBCONTRACTORが削除される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerTypeSelect
          value={['CUSTOMER', 'SUBCONTRACTOR']}
          onChange={onChange}
          label="取引先種別"
        />
      );

      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });
      await user.click(subcontractorCheckbox);

      expect(onChange).toHaveBeenCalledWith(['CUSTOMER']);
    });

    it('顧客のみ選択されている状態で協力業者を追加できる', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerTypeSelect value={['CUSTOMER']} onChange={onChange} label="取引先種別" />
      );

      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });
      await user.click(subcontractorCheckbox);

      expect(onChange).toHaveBeenCalledWith(['CUSTOMER', 'SUBCONTRACTOR']);
    });
  });

  describe('無効化状態', () => {
    it('disabled=trueの場合、全てのチェックボックスが無効化される', () => {
      render(
        <TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" disabled />
      );

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).toBeDisabled();
      expect(subcontractorCheckbox).toBeDisabled();
    });

    it('disabled=trueの場合、クリックしてもonChangeは呼ばれない', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" disabled />
      );

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      await user.click(customerCheckbox);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('エラー表示', () => {
    it('error propが設定されている場合、エラーメッセージを表示する', () => {
      render(
        <TradingPartnerTypeSelect
          value={[]}
          onChange={onChange}
          label="取引先種別"
          error="種別は1つ以上選択してください"
        />
      );

      expect(screen.getByText('種別は1つ以上選択してください')).toBeInTheDocument();
    });

    it('エラーがない場合、エラーメッセージを表示しない', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('グループにrole="group"とaria-labelが設定されている', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      const group = screen.getByRole('group', { name: /取引先種別/ });
      expect(group).toBeInTheDocument();
    });

    it('required=trueの場合、aria-required属性が設定されている', () => {
      render(
        <TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" required />
      );

      const group = screen.getByRole('group');
      expect(group).toHaveAttribute('aria-required', 'true');
    });

    it('エラー時はaria-invalid属性が設定されている', () => {
      render(
        <TradingPartnerTypeSelect
          value={[]}
          onChange={onChange}
          label="取引先種別"
          error="エラー"
        />
      );

      const group = screen.getByRole('group');
      expect(group).toHaveAttribute('aria-invalid', 'true');
    });

    it('エラーメッセージはaria-describedbyで関連付けられている', () => {
      render(
        <TradingPartnerTypeSelect
          value={[]}
          onChange={onChange}
          label="取引先種別"
          error="エラー"
        />
      );

      const group = screen.getByRole('group');
      const describedBy = group.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      const errorElement = document.getElementById(describedBy!);
      expect(errorElement).toHaveTextContent('エラー');
    });

    it('各チェックボックスにラベルがフォーカス可能なラベルとして関連付けられている', () => {
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      // ラベルをクリックするとチェックボックスがフォーカスされる
      const customerLabel = screen.getByText('顧客');
      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });

      expect(customerLabel).toBeInTheDocument();
      expect(customerCheckbox).toBeInTheDocument();
    });
  });

  describe('フォーカス管理', () => {
    it('最初のチェックボックスにTabキーでフォーカスできる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      await user.tab();

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      expect(customerCheckbox).toHaveFocus();
    });

    it('Tabキーで次のチェックボックスにフォーカスを移動できる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      await user.tab();
      await user.tab();

      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });
      expect(subcontractorCheckbox).toHaveFocus();
    });

    it('Spaceキーでチェックボックスを切り替えられる', async () => {
      const user = userEvent.setup();
      render(<TradingPartnerTypeSelect value={[]} onChange={onChange} label="取引先種別" />);

      await user.tab();
      await user.keyboard(' ');

      expect(onChange).toHaveBeenCalledWith(['CUSTOMER']);
    });
  });

  describe('型定義の確認', () => {
    it('valueはTradingPartnerType[]型を受け取る', () => {
      const types: TradingPartnerType[] = ['CUSTOMER', 'SUBCONTRACTOR'];

      render(<TradingPartnerTypeSelect value={types} onChange={onChange} label="取引先種別" />);

      const customerCheckbox = screen.getByRole('checkbox', { name: /顧客/ });
      const subcontractorCheckbox = screen.getByRole('checkbox', { name: /協力業者/ });

      expect(customerCheckbox).toBeChecked();
      expect(subcontractorCheckbox).toBeChecked();
    });
  });
});
