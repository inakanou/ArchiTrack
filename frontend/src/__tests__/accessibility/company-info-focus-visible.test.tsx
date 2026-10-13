/**
 * @fileoverview 自社情報の画面の部品のフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）も重ねないことで規則に乗る
 * （タスク 9.1）。ここでは次を確かめる。
 *   (1) 自社情報のフォームの入力欄 7 つと操作の釦 2 つが、未登録の空のフォーム・登録済みのプリセット・
 *       検証エラーの表示中のいずれでも、インラインで outline を打ち消していないこと
 *   (2) フォーカス中の入力欄が影の輪を描かず、枠線の色の変化と共通の outline で示すこと
 *   (3) 自社情報の取得に失敗したときの「再試行」の釦が outline を打ち消していないこと
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/company-info/company-info-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (company-info):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 9.1 は、要件 1〜3 の自社情報の画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CompanyInfoForm from '../../components/company-info/CompanyInfoForm';
import CompanyInfoPage from '../../pages/CompanyInfoPage';
import * as companyInfoApi from '../../api/company-info';
import type { CompanyInfoFormData } from '../../types/company-info.types';

vi.mock('../../api/company-info');
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));
// useBlocker はデータルーターを要するため、ブロックしない形に差し替える
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
  };
});

/** 登録済みの自社情報（プリセットの状態） */
const PRESET_DATA: CompanyInfoFormData = {
  companyName: '株式会社フォーカス',
  address: '東京都渋谷区1-2-3',
  representative: '代表 太郎',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'focus@example.com',
  invoiceRegistrationNumber: 'T1234567890123',
  version: 1,
};

/** 入力欄の名前（画面の並び順） */
const FIELD_NAMES = [
  '会社名',
  '住所',
  '代表者',
  '電話番号',
  'FAX番号',
  'メールアドレス',
  '適格請求書発行事業者登録番号',
];

/** フォームのキーボードで止まる部品（画面の並び順。入力欄 7 つと操作の釦 2 つ） */
function getFormControls(): HTMLElement[] {
  return [
    ...FIELD_NAMES.map((name) => screen.getByRole('textbox', { name })),
    screen.getByRole('button', { name: 'リセット' }),
    screen.getByRole('button', { name: '保存' }),
  ];
}

function controlName(control: HTMLElement): string {
  return control.getAttribute('aria-label') ?? (control.textContent ?? '').trim();
}

function isOutlineSuppressed(control: HTMLElement): boolean {
  return control.style.outlineStyle === 'none' || control.style.outline === 'none';
}

function renderForm(initialData?: CompanyInfoFormData): void {
  render(
    <CompanyInfoForm
      initialData={initialData}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onReset={vi.fn()}
      onDirtyChange={vi.fn()}
      isSubmitting={false}
    />
  );
}

describe('自社情報のフォームの部品が共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it.each([
    ['未登録の空のフォーム', undefined],
    ['登録済みのプリセット', PRESET_DATA],
  ] as const)('%s の9つの部品がインラインで outline を消していない', (_label, initialData) => {
    renderForm(initialData);

    const controls = getFormControls();
    expect(controls).toHaveLength(9);

    const suppressed = controls.filter(isOutlineSuppressed).map(controlName);
    expect(suppressed).toEqual([]);
  });

  it('必須の3欄が検証エラーを表示している間も、9つの部品がインラインで outline を消していない', async () => {
    renderForm();

    // 空のまま必須の欄を離れると、その欄の検証エラーが出る
    for (const name of ['会社名', '住所', '代表者']) {
      const field = screen.getByRole('textbox', { name });
      fireEvent.focus(field);
      fireEvent.blur(field);
    }
    await waitFor(() => {
      expect(
        ['会社名', '住所', '代表者'].map((name) =>
          screen.getByRole('textbox', { name }).getAttribute('aria-invalid')
        )
      ).toEqual(['true', 'true', 'true']);
    });

    const suppressed = getFormControls().filter(isOutlineSuppressed).map(controlName);
    expect(suppressed).toEqual([]);
  });
});

describe('フォーカス中の自社情報の入力欄は共通の outline だけで示す', () => {
  /**
   * 入力欄が自前の影の輪（不透明度 0.1 の青・赤）を描いても、白の背景に対して 3:1 に届かず
   * フォーカス表示にならない。影は描かず、枠線の色の変化と共通の outline で示す。
   */
  it('フォーカス中の7つの入力欄が影の輪を描かず、枠線を青に変え、outline を打ち消していない', () => {
    renderForm(PRESET_DATA);

    const fields = FIELD_NAMES.map((name) => screen.getByRole('textbox', { name }));

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
      FIELD_NAMES.map((name) => ({
        name,
        boxShadow: expect.stringMatching(/^(none)?$/),
        focusBorder: true,
        outlineSuppressed: false,
      }))
    );
  });

  it('検証エラーを表示中の会社名にフォーカスしても影の輪を描かず、outline を打ち消していない', async () => {
    renderForm();

    const companyName = screen.getByRole('textbox', { name: '会社名' });
    fireEvent.focus(companyName);
    fireEvent.blur(companyName);
    await waitFor(() => {
      expect(companyName).toHaveAttribute('aria-invalid', 'true');
    });

    fireEvent.focus(companyName);
    expect({
      boxShadow: companyName.style.boxShadow,
      outlineSuppressed: isOutlineSuppressed(companyName),
    }).toEqual({ boxShadow: expect.stringMatching(/^(none)?$/), outlineSuppressed: false });
  });
});

describe('自社情報の取得に失敗したときの「再試行」の釦', () => {
  it('インラインで outline を消さず、色の無い輪も描かない', async () => {
    vi.mocked(companyInfoApi.getCompanyInfo).mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <MemoryRouter>
        <CompanyInfoPage />
      </MemoryRouter>
    );

    const retry = await screen.findByRole('button', { name: '再試行' });
    expect({
      outlineSuppressed: isOutlineSuppressed(retry),
      boxShadow: retry.style.boxShadow,
    }).toEqual({ outlineSuppressed: false, boxShadow: '' });
  });
});
