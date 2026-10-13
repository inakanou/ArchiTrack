/**
 * @fileoverview 取引先のフォームの入力部品のフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、自前の影の輪（box-shadow）も重ねないことで規則に乗る（タスク 33.1）。
 * ここでは (1) 取引先の作成・編集フォームの入力部品がインラインで outline を打ち消していないこと、
 * (2) フォーカス中の入力欄が影の輪を描かず、枠線の色の変化と共通の outline で示すこと、を確かめる。
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (trading-partner-management):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 33.1 は機能レベル検証の指摘の是正として、要件 12 の画面の上で steering の方針へ揃える。
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TradingPartnerForm from '../../components/trading-partners/TradingPartnerForm';
import TradingPartnerSearchFilter from '../../components/trading-partners/TradingPartnerSearchFilter';

/** 作成・編集フォームのキーボードで止まる入力部品（画面の並び順） */
function getFormControls(): HTMLElement[] {
  return [
    screen.getByRole('textbox', { name: '取引先名' }),
    screen.getByRole('textbox', { name: 'フリガナ' }),
    screen.getByRole('checkbox', { name: '顧客' }),
    screen.getByRole('checkbox', { name: '協力業者' }),
    screen.getByRole('textbox', { name: '住所' }),
    screen.getByRole('textbox', { name: '部課/支店/支社名' }),
    screen.getByRole('textbox', { name: '代表者名' }),
    screen.getByRole('textbox', { name: '電話番号' }),
    screen.getByRole('textbox', { name: 'FAX番号' }),
    screen.getByRole('textbox', { name: 'メールアドレス' }),
    screen.getByRole('combobox', { name: '請求締日' }),
    screen.getByRole('combobox', { name: '支払日 - 月' }),
    screen.getByRole('combobox', { name: '支払日 - 日' }),
    screen.getByRole('textbox', { name: '備考' }),
  ];
}

/** 影の輪を描く文字列入力の欄（取引先名〜メールアドレス・備考） */
function getTextFields(): HTMLElement[] {
  return getFormControls().filter((control) =>
    control.matches('input:not([type="checkbox"]), textarea')
  );
}

/** 部品の名前（aria-label か、aria-labelledby の指す要素の文言） */
function controlName(control: HTMLElement): string {
  const labelledBy = control.getAttribute('aria-labelledby');
  const labelText = labelledBy
    ? (document.getElementById(labelledBy)?.textContent ?? '').replace('*', '').trim()
    : '';
  return control.getAttribute('aria-label') ?? labelText;
}

function isOutlineSuppressed(control: HTMLElement): boolean {
  return control.style.outlineStyle === 'none' || control.style.outline === 'none';
}

function renderForm(mode: 'create' | 'edit'): void {
  render(
    <TradingPartnerForm
      mode={mode}
      initialData={
        mode === 'edit'
          ? {
              name: '株式会社フォーカス',
              nameKana: 'カブシキガイシャフォーカス',
              types: ['CUSTOMER'],
              address: '東京都渋谷区1-2-3',
              billingClosingDay: 31,
              paymentMonthOffset: 1,
              paymentDay: 10,
            }
          : undefined
      }
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onCancel={vi.fn()}
      isSubmitting={false}
    />
  );
}

describe('取引先のフォームの入力部品が共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it.each(['create', 'edit'] as const)(
    '%s のフォームの14の入力部品がインラインで outline を消していない',
    (mode) => {
      renderForm(mode);

      const controls = getFormControls();
      expect(controls).toHaveLength(14);

      const suppressed = controls.filter(isOutlineSuppressed).map(controlName);
      expect(suppressed).toEqual([]);
    }
  );
});

describe('フォーカス中の取引先のフォームの入力欄は共通の outline だけで示す', () => {
  /**
   * 入力欄が自前の影の輪（box-shadow）を描くと、共通の :focus-visible の outline と重なって
   * フォーカス表示が二重になる。影は描かず、枠線の色の変化と共通の outline で示す。
   */
  it('フォーカス中の9つの文字入力の欄が影の輪を描かず、枠線を青に変え、outline を打ち消していない', () => {
    renderForm('create');

    const fields = getTextFields();
    expect(fields).toHaveLength(9);

    const observed = fields.map((field) => {
      fireEvent.focus(field);
      const result = {
        name: controlName(field),
        boxShadow: field.style.boxShadow,
        focusBorder: /#2563eb|rgb\(37, 99, 235\)/i.test(field.style.border),
        outlineSuppressed: isOutlineSuppressed(field),
      };
      fireEvent.blur(field);
      return result;
    });

    expect(observed).toEqual(
      fields.map((field) => ({
        name: controlName(field),
        boxShadow: expect.stringMatching(/^(none)?$/),
        focusBorder: true,
        outlineSuppressed: false,
      }))
    );
  });

  it('エラー表示中の取引先名にフォーカスしても影の輪を描かず、outline を打ち消していない', async () => {
    renderForm('create');

    const nameInput = screen.getByRole('textbox', { name: '取引先名' });
    fireEvent.focus(nameInput);
    fireEvent.blur(nameInput);
    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    fireEvent.focus(nameInput);
    expect(nameInput.style.boxShadow).toMatch(/^(none)?$/);
    expect(isOutlineSuppressed(nameInput)).toBe(false);
  });
});

describe('取引先の一覧の検索フィルタの「フィルタをクリア」のフォーカスの輪', () => {
  /**
   * クリアボタンは共通の outline を `focus:outline-none` で消し、自前の輪（Tailwind の ring）で示す。
   * steering の下限（2px 以上・隣接色に対して 3:1 以上）を満たすよう、輪は一覧画面の他の部品
   * （検索ボタン・ソートの見出し・ページネーション）と同じ blue-500 で描く（タスク 33.4）。
   * gray-400 の輪は白の背景に対して 3:1 に届かない。実際の太さとコントラスト比は
   * e2e/specs/trading-partners/trading-partner-focus-visible.spec.ts が確かめる。
   */
  it('2px の blue-500 の輪で示し、3:1 に届かない gray-400 の輪を描かない', () => {
    render(<TradingPartnerSearchFilter filter={{}} onFilterChange={vi.fn()} />);

    const clearButton = screen.getByRole('button', { name: 'フィルタをクリア' });
    const classes = clearButton.className.split(/\s+/);

    expect({
      outlineNone: classes.includes('focus:outline-none'),
      ringWidth: classes.includes('focus:ring-2'),
      ringBlue500: classes.includes('focus:ring-blue-500'),
      ringGray400: classes.includes('focus:ring-gray-400'),
    }).toEqual({ outlineNone: true, ringWidth: true, ringBlue500: true, ringGray400: false });
  });
});
