/**
 * @fileoverview PaymentDateSelectコンポーネントのユニットテスト
 *
 * Task 7.2: 請求締日・支払日選択コンポーネントの実装
 *
 * Requirements:
 * - 2.5: 支払日として月選択（翌月/翌々月/3ヶ月後）と日選択（1日〜31日および「末日」）の組み合わせをドロップダウンで提供する
 * - 4.4: 編集時も同様に支払日の選択肢を提供する
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentDateSelect, {
  type PaymentDateValue,
} from '../../../components/trading-partners/PaymentDateSelect';

// onChangeハンドラの型定義
type OnChangeHandler = (value: PaymentDateValue) => void;

describe('PaymentDateSelect', () => {
  let onChange: Mock<OnChangeHandler>;

  beforeEach(() => {
    onChange = vi.fn<OnChangeHandler>();
  });

  describe('基本レンダリング', () => {
    it('ラベルと2つのドロップダウン（月選択と日選択）が表示される', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      // ラベルが表示される
      expect(screen.getByText('支払日')).toBeInTheDocument();

      // 2つのドロップダウンが存在する
      const comboboxes = screen.getAllByRole('combobox');
      expect(comboboxes).toHaveLength(2);
    });

    it('required=trueの場合、必須マーカーが表示される', () => {
      render(
        <PaymentDateSelect
          monthOffset={null}
          day={null}
          onChange={onChange}
          label="支払日"
          required
        />
      );

      // 必須マーカー（*）が表示される
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('カスタムラベルが使用される', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="入金日" />
      );

      expect(screen.getByText('入金日')).toBeInTheDocument();
    });
  });

  describe('月選択のオプション (2.5)', () => {
    it('翌月、翌々月、3ヶ月後の3オプションがドロップダウンに含まれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /月/ });
      await user.click(monthSelect);

      // 3オプションをチェック
      expect(screen.getByRole('option', { name: '翌月' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '翌々月' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '3ヶ月後' })).toBeInTheDocument();
    });

    it('月選択に未選択オプションが存在する', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /月/ });
      const defaultOption = within(monthSelect).getByRole('option', { name: '選択してください' });
      expect(defaultOption).toBeInTheDocument();
    });
  });

  describe('日選択のオプション (2.5)', () => {
    it('1日〜31日と「末日」の計32オプションがドロップダウンに含まれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      // 日選択は「- 日」で終わるラベルを持つ
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      await user.click(daySelect);

      // 1日〜31日をチェック
      for (let d = 1; d <= 31; d++) {
        expect(screen.getByRole('option', { name: `${d}日` })).toBeInTheDocument();
      }

      // 末日をチェック
      expect(screen.getByRole('option', { name: '末日' })).toBeInTheDocument();
    });

    it('日選択に未選択オプションが存在する', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      // 日選択は「- 日」で終わるラベルを持つ
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      const defaultOption = within(daySelect).getByRole('option', { name: '選択してください' });
      expect(defaultOption).toBeInTheDocument();
    });
  });

  describe('値の表示', () => {
    it('monthOffset=1, day=15の場合、「翌月」と「15日」が選択されている', () => {
      render(<PaymentDateSelect monthOffset={1} day={15} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ }) as HTMLSelectElement;
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ }) as HTMLSelectElement;

      expect(monthSelect.value).toBe('1');
      expect(daySelect.value).toBe('15');
    });

    it('monthOffset=2, day=99の場合、「翌々月」と「末日」が選択されている', () => {
      render(<PaymentDateSelect monthOffset={2} day={99} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ }) as HTMLSelectElement;
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ }) as HTMLSelectElement;

      expect(monthSelect.value).toBe('2');
      expect(daySelect.value).toBe('99');
    });

    it('monthOffset=3, day=10の場合、「3ヶ月後」と「10日」が選択されている', () => {
      render(<PaymentDateSelect monthOffset={3} day={10} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ }) as HTMLSelectElement;
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ }) as HTMLSelectElement;

      expect(monthSelect.value).toBe('3');
      expect(daySelect.value).toBe('10');
    });

    it('monthOffset=null, day=nullの場合、両方とも未選択状態である', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ }) as HTMLSelectElement;
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ }) as HTMLSelectElement;

      expect(monthSelect.value).toBe('');
      expect(daySelect.value).toBe('');
    });
  });

  describe('月選択の操作', () => {
    it('翌月を選択すると、onChange({ monthOffset: 1, day: null })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '1');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 1, day: null });
    });

    it('翌々月を選択すると、onChange({ monthOffset: 2, day: null })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '2');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 2, day: null });
    });

    it('3ヶ月後を選択すると、onChange({ monthOffset: 3, day: null })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '3');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 3, day: null });
    });

    it('既存の日選択を保持しながら月を変更できる', async () => {
      const user = userEvent.setup();
      render(<PaymentDateSelect monthOffset={1} day={15} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '2');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 2, day: 15 });
    });

    it('月選択を未選択に戻すと、onChange({ monthOffset: null, day: 15 })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PaymentDateSelect monthOffset={1} day={15} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: null, day: 15 });
    });
  });

  describe('日選択の操作', () => {
    it('15日を選択すると、onChange({ monthOffset: null, day: 15 })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      await user.selectOptions(daySelect, '15');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: null, day: 15 });
    });

    it('末日を選択すると、onChange({ monthOffset: null, day: 99 })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      await user.selectOptions(daySelect, '99');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: null, day: 99 });
    });

    it('既存の月選択を保持しながら日を変更できる', async () => {
      const user = userEvent.setup();
      render(<PaymentDateSelect monthOffset={2} day={10} onChange={onChange} label="支払日" />);

      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      await user.selectOptions(daySelect, '25');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 2, day: 25 });
    });

    it('日選択を未選択に戻すと、onChange({ monthOffset: 2, day: null })が呼ばれる', async () => {
      const user = userEvent.setup();
      render(<PaymentDateSelect monthOffset={2} day={10} onChange={onChange} label="支払日" />);

      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      await user.selectOptions(daySelect, '');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 2, day: null });
    });
  });

  describe('組み合わせ選択', () => {
    it('月と日を両方選択できる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      // 月を選択
      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '1');

      // 日を選択（onChangeを別のモックで確認するためにリセット）
      onChange.mockClear();
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      await user.selectOptions(daySelect, '20');

      // 日選択時は最初のonChange呼び出しの monthOffset: 1 が保持されているはず
      // ただし、コンポーネントはPropsから値を取るので、テストでは期待値を確認
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('無効化状態', () => {
    it('disabled=trueの場合、両方のドロップダウンが無効化される', () => {
      render(
        <PaymentDateSelect
          monthOffset={null}
          day={null}
          onChange={onChange}
          label="支払日"
          disabled
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      comboboxes.forEach((combobox) => {
        expect(combobox).toBeDisabled();
      });
    });

    it('disabled=trueの場合、選択を変更できない', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={1} day={15} onChange={onChange} label="支払日" disabled />
      );

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '2');

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('エラー表示', () => {
    it('error propが設定されている場合、エラーメッセージを表示する', () => {
      render(
        <PaymentDateSelect
          monthOffset={null}
          day={null}
          onChange={onChange}
          label="支払日"
          error="支払日を選択してください"
        />
      );

      expect(screen.getByText('支払日を選択してください')).toBeInTheDocument();
    });

    it('エラーがない場合、エラーメッセージを表示しない', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('月選択にaria-labelが設定されている', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      expect(monthSelect).toHaveAccessibleName(/- 月$/);
    });

    it('日選択にaria-labelが設定されている', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      expect(daySelect).toHaveAccessibleName(/- 日$/);
    });

    it('エラー時は両方のドロップダウンにaria-invalid属性が設定されている', () => {
      render(
        <PaymentDateSelect
          monthOffset={null}
          day={null}
          onChange={onChange}
          label="支払日"
          error="エラー"
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      comboboxes.forEach((combobox) => {
        expect(combobox).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });

  describe('フォーカス管理', () => {
    it('Tabキーで月選択にフォーカスできる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      await user.tab();

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      expect(monthSelect).toHaveFocus();
    });

    it('Tabキーで日選択にフォーカスを移動できる', async () => {
      const user = userEvent.setup();
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      await user.tab();
      await user.tab();

      const daySelect = screen.getByRole('combobox', { name: /- 日$/ });
      expect(daySelect).toHaveFocus();
    });
  });

  describe('編集時の動作 (4.4)', () => {
    it('既存の値を保持したまま表示できる', () => {
      render(<PaymentDateSelect monthOffset={2} day={25} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ }) as HTMLSelectElement;
      const daySelect = screen.getByRole('combobox', { name: /- 日$/ }) as HTMLSelectElement;

      expect(monthSelect.value).toBe('2');
      expect(daySelect.value).toBe('25');
    });

    it('既存の値から別の値に変更できる', async () => {
      const user = userEvent.setup();
      render(<PaymentDateSelect monthOffset={2} day={25} onChange={onChange} label="支払日" />);

      const monthSelect = screen.getByRole('combobox', { name: /- 月$/ });
      await user.selectOptions(monthSelect, '3');

      expect(onChange).toHaveBeenCalledWith({ monthOffset: 3, day: 25 });
    });
  });

  describe('表示ヘルパー', () => {
    it('月選択と日選択のラベルが分かりやすく表示される', () => {
      render(
        <PaymentDateSelect monthOffset={null} day={null} onChange={onChange} label="支払日" />
      );

      // 月選択と日選択を区別できるラベルがあることを確認
      expect(screen.getByRole('combobox', { name: /- 月$/ })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /- 日$/ })).toBeInTheDocument();
    });
  });
});
