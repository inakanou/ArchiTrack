/**
 * @fileoverview BillingClosingDaySelectコンポーネントのユニットテスト
 *
 * Task 7.2: 請求締日・支払日選択コンポーネントの実装
 *
 * Requirements:
 * - 2.4: 請求締日として1日〜31日および「末日」の計32オプションをドロップダウンで提供する
 * - 4.3: 編集時も同様に請求締日の選択肢を提供する
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingClosingDaySelect from '../../../components/trading-partners/BillingClosingDaySelect';

// onChangeハンドラの型定義
type OnChangeHandler = (value: number | null) => void;

describe('BillingClosingDaySelect', () => {
  let onChange: Mock<OnChangeHandler>;

  beforeEach(() => {
    onChange = vi.fn<OnChangeHandler>();
  });

  describe('基本レンダリング', () => {
    it('ラベルとドロップダウンが表示される', () => {
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      // ラベルが表示される
      expect(screen.getByText('請求締日')).toBeInTheDocument();

      // ドロップダウンが存在する
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('required=trueの場合、必須マーカーが表示される', () => {
      render(
        <BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" required />
      );

      // 必須マーカー（*）が表示される
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('カスタムラベルが使用される', () => {
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="締め日" />);

      expect(screen.getByText('締め日')).toBeInTheDocument();
    });
  });

  describe('32オプションの表示 (2.4)', () => {
    it('1日〜31日と「末日」の計32オプションがドロップダウンに含まれる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.click(select);

      // 32オプション + 未選択オプションを確認
      // 1日〜31日をチェック
      for (let day = 1; day <= 31; day++) {
        expect(screen.getByRole('option', { name: `${day}日` })).toBeInTheDocument();
      }

      // 末日をチェック
      expect(screen.getByRole('option', { name: '末日' })).toBeInTheDocument();
    });

    it('未選択オプションが存在する', () => {
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      const defaultOption = within(select).getByRole('option', { name: '選択してください' });
      expect(defaultOption).toBeInTheDocument();
    });
  });

  describe('値の表示', () => {
    it('value=1の場合、「1日」が選択されている', () => {
      render(<BillingClosingDaySelect value={1} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('1');
    });

    it('value=15の場合、「15日」が選択されている', () => {
      render(<BillingClosingDaySelect value={15} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('15');
    });

    it('value=31の場合、「31日」が選択されている', () => {
      render(<BillingClosingDaySelect value={31} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('31');
    });

    it('value=99の場合、「末日」が選択されている', () => {
      render(<BillingClosingDaySelect value={99} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('99');
    });

    it('value=nullの場合、未選択状態である', () => {
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  describe('選択操作', () => {
    it('1日を選択すると、onChange(1)が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '1');

      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('15日を選択すると、onChange(15)が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '15');

      expect(onChange).toHaveBeenCalledWith(15);
    });

    it('31日を選択すると、onChange(31)が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '31');

      expect(onChange).toHaveBeenCalledWith(31);
    });

    it('末日を選択すると、onChange(99)が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '99');

      expect(onChange).toHaveBeenCalledWith(99);
    });

    it('未選択オプションを選択すると、onChange(null)が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={15} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '');

      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('無効化状態', () => {
    it('disabled=trueの場合、ドロップダウンが無効化される', () => {
      render(
        <BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" disabled />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('disabled=trueの場合、選択を変更できない', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={15} onChange={onChange} label="請求締日" disabled />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '20');

      // disabledの場合、onChangeは呼ばれない
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('エラー表示', () => {
    it('error propが設定されている場合、エラーメッセージを表示する', () => {
      render(
        <BillingClosingDaySelect
          value={null}
          onChange={onChange}
          label="請求締日"
          error="請求締日を選択してください"
        />
      );

      expect(screen.getByText('請求締日を選択してください')).toBeInTheDocument();
    });

    it('エラーがない場合、エラーメッセージを表示しない', () => {
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('selectにaria-labelが設定されている', () => {
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      expect(select).toHaveAccessibleName(/請求締日/);
    });

    it('required=trueの場合、aria-required属性が設定されている', () => {
      render(
        <BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" required />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-required', 'true');
    });

    it('エラー時はaria-invalid属性が設定されている', () => {
      render(
        <BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" error="エラー" />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-invalid', 'true');
    });

    it('エラーメッセージはaria-describedbyで関連付けられている', () => {
      render(
        <BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" error="エラー" />
      );

      const select = screen.getByRole('combobox');
      const describedBy = select.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      const errorElement = document.getElementById(describedBy!);
      expect(errorElement).toHaveTextContent('エラー');
    });
  });

  describe('フォーカス管理', () => {
    it('Tabキーでフォーカスできる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={null} onChange={onChange} label="請求締日" />);

      await user.tab();

      const select = screen.getByRole('combobox');
      expect(select).toHaveFocus();
    });
  });

  describe('編集時の動作 (4.3)', () => {
    it('既存の値を保持したまま表示できる', () => {
      render(<BillingClosingDaySelect value={20} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('20');
    });

    it('既存の値から別の値に変更できる', async () => {
      const user = userEvent.setup();
      render(<BillingClosingDaySelect value={20} onChange={onChange} label="請求締日" />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '25');

      expect(onChange).toHaveBeenCalledWith(25);
    });
  });
});
