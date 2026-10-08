/**
 * @fileoverview 登録・パスワードリセット・2FA の設定と確認のフォームのフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たないことで規則に乗る（タスク 43.1）。
 * ここでは、ユーザー登録のフォーム（RegisterForm）・パスワードリセットのフォーム（PasswordResetForm、
 * 要求と再設定の両方のモード）・2FA の設定のフォーム（TwoFactorSetupForm、QR コードとバックアップコードの
 * 両方の段階）・2FA の確認のフォーム（TwoFactorVerificationForm、認証コードとバックアップコードの両方の
 * 入力方式）の、キーボードで止まる部品のどれもがインラインで outline を打ち消していないことを、
 * エラーの表示中を含む状態ごとに確かめる。
 * 2FA の設定の画面に載る共通ヘッダー（AppHeader）は、ユーザーメニューと管理メニューの釦の白い輪を
 * 詳細度の高い `.app-header-dropdown > button:focus-visible { outline: none }` が打ち消し、
 * ロゴのリンクは共通の青い outline（#2563eb）がヘッダーの紫のグラデーションに対して 3:1 に届かなかったため、
 * 打ち消しの規則が無いことと、ロゴと釦の輪が白でヘッダーのグラデーションの両端の色に対して 3:1 以上で
 * あることを、本番が読み込む原本の CSS で確かめる。
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/auth/auth-forms-focus-visible.spec.ts が主張する
 * （jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (user-authentication):
 * 対象の部品の受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 43.1 は、要件 2・7・27・27A の画面の上で steering の方針の下限へ揃える。
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RegisterForm from '../../components/RegisterForm';
import PasswordResetForm from '../../components/PasswordResetForm';
import TwoFactorSetupForm from '../../components/TwoFactorSetupForm';
import TwoFactorVerificationForm from '../../components/TwoFactorVerificationForm';

/** キーボードで止まる部品（無効化されていないもの） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** 押せない状態の釦も含めた部品（状態によって押せるようになる釦の指定も確かめるため） */
const CONTROL_SELECTOR = 'a[href], button, input, select, textarea';

function getFocusableControls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function getAllControls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CONTROL_SELECTOR));
}

/** 部品の名前（aria-label、無ければ結び付いた label の文言、無ければ文言） */
function controlName(control: HTMLElement): string {
  const labels = control instanceof HTMLInputElement ? control.labels : null;
  const labelText = (labels?.[0]?.textContent ?? '').trim();
  const text = (control.textContent ?? '').replace(/\s+/g, ' ').trim();
  return `${control.tagName.toLowerCase()} "${control.getAttribute('aria-label') ?? (labelText || text)}"`;
}

function isOutlineSuppressed(control: HTMLElement): boolean {
  return control.style.outlineStyle === 'none' || control.style.outline === 'none';
}

/** インラインで outline を打ち消している部品の名前の一覧（空なら満たす） */
function suppressedControls(controls: HTMLElement[]): string[] {
  return controls.filter(isOutlineSuppressed).map(controlName);
}

const TOTP_DIGIT_LABELS = [1, 2, 3, 4, 5, 6].map((digit) => `認証コード ${digit}桁目`);

describe('ユーザー登録のフォームが共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  async function renderRegisterForm() {
    const result = render(
      <RegisterForm
        invitationToken="invitation-token"
        onRegister={vi.fn().mockResolvedValue(undefined)}
        onVerifyInvitation={vi
          .fn()
          .mockResolvedValue({ valid: true, email: 'invited@example.com' })}
      />
    );
    await waitFor(() => {
      expect(screen.getByLabelText('表示名')).toBeInTheDocument();
    });
    return result;
  }

  it('表示名・パスワード・パスワード (確認)・同意・登録がインラインで outline を消していない', async () => {
    const { container } = await renderRegisterForm();

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByLabelText('表示名'),
        screen.getByLabelText('パスワード'),
        screen.getByLabelText('パスワード (確認)'),
        screen.getByRole('checkbox'),
        screen.getByRole('button', { name: '登録' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('入力のエラーを表示した後も、どの部品もインラインで outline を消していない', async () => {
    const { container } = await renderRegisterForm();

    fireEvent.click(screen.getByRole('button', { name: '登録' }));
    await waitFor(() => {
      expect(screen.getByText('表示名は必須です')).toBeInTheDocument();
    });

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByLabelText('表示名'),
        screen.getByLabelText('パスワード'),
        screen.getByLabelText('パスワード (確認)'),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });
});

describe('パスワードリセットのフォームが共通のフォーカス表示を打ち消さない', () => {
  it('要求のモードのメールアドレスとリセットリンクを送信がインラインで outline を消していない', () => {
    const { container } = render(
      <PasswordResetForm onRequestReset={vi.fn().mockResolvedValue(undefined)} />
    );

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByLabelText('メールアドレス'),
        screen.getByRole('button', { name: 'リセットリンクを送信' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('要求のモードでメールアドレスのエラーを表示した後もインラインで outline を消していない', async () => {
    const { container } = render(
      <PasswordResetForm onRequestReset={vi.fn().mockResolvedValue(undefined)} />
    );

    const emailInput = screen.getByLabelText('メールアドレス');
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.blur(emailInput);
    await waitFor(() => {
      expect(screen.getByText('有効なメールアドレスを入力してください')).toBeInTheDocument();
    });

    expect(suppressedControls(getFocusableControls(container))).toEqual([]);
  });

  it('再設定のモードの新しいパスワード・パスワード (確認)・リセットがインラインで outline を消していない', () => {
    const { container } = render(
      <PasswordResetForm
        resetToken="reset-token"
        onResetPassword={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByLabelText('新しいパスワード'),
        screen.getByLabelText('パスワード (確認)'),
        screen.getByRole('button', { name: 'パスワードをリセット' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('再設定のモードで入力のエラーを表示した後もインラインで outline を消していない', async () => {
    const { container } = render(
      <PasswordResetForm
        resetToken="reset-token"
        onResetPassword={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'パスワードをリセット' }));
    await waitFor(() => {
      expect(screen.getByText('パスワードは必須です')).toBeInTheDocument();
    });

    expect(suppressedControls(getFocusableControls(container))).toEqual([]);
  });
});

describe('2FA の設定のフォームが共通のフォーカス表示を打ち消さない', () => {
  function renderSetupForm() {
    return render(
      <TwoFactorSetupForm
        onSetupStart={vi.fn().mockResolvedValue({
          success: true,
          data: { secret: 'JBSWY3DPEHPK3PXP', qrCodeDataUrl: 'data:image/png;base64,AAAA' },
        })}
        onEnable={vi.fn().mockResolvedValue({
          success: true,
          data: { backupCodes: ['AAAA1111', 'BBBB2222'] },
        })}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
  }

  it('QR コードの段階の 6 桁の入力欄・キャンセル・検証がインラインで outline を消していない', async () => {
    const { container } = renderSetupForm();
    await waitFor(() => {
      expect(screen.getByLabelText('認証コード 1桁目')).toBeInTheDocument();
    });

    const controls = getAllControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        ...TOTP_DIGIT_LABELS.map((label) => screen.getByLabelText(label)),
        screen.getByRole('button', { name: 'キャンセル' }),
        screen.getByRole('button', { name: '検証' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('バックアップコードの段階の釦と同意の欄がインラインで outline を消していない', async () => {
    const { container } = renderSetupForm();
    await waitFor(() => {
      expect(screen.getByLabelText('認証コード 1桁目')).toBeInTheDocument();
    });
    TOTP_DIGIT_LABELS.forEach((label, index) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value: String(index + 1) } });
    });
    fireEvent.click(screen.getByRole('button', { name: '検証' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ダウンロード' })).toBeInTheDocument();
    });

    const controls = getAllControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByRole('button', { name: 'ダウンロード' }),
        screen.getByRole('button', { name: '印刷' }),
        screen.getByRole('button', { name: 'コピー' }),
        screen.getByRole('checkbox'),
        screen.getByRole('button', { name: '完了' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });
});

describe('2FA の確認のフォームが共通のフォーカス表示を打ち消さない', () => {
  function renderVerificationForm() {
    return render(
      <TwoFactorVerificationForm
        onVerifyTOTP={vi.fn().mockResolvedValue({ success: true })}
        onVerifyBackupCode={vi.fn().mockResolvedValue({ success: true })}
        onCancel={vi.fn()}
        disableTimer
      />
    );
  }

  it('認証コードの入力方式の 6 桁の入力欄と釦がインラインで outline を消していない', () => {
    const { container } = renderVerificationForm();

    const controls = getAllControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        ...TOTP_DIGIT_LABELS.map((label) => screen.getByLabelText(label)),
        screen.getByRole('button', { name: 'バックアップコードを使用する' }),
        screen.getByRole('button', { name: 'キャンセル' }),
        screen.getByRole('button', { name: '検証' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('バックアップコードの入力方式の入力欄と釦がインラインで outline を消していない', async () => {
    const { container } = renderVerificationForm();
    fireEvent.click(screen.getByRole('button', { name: 'バックアップコードを使用する' }));
    await waitFor(() => {
      expect(screen.getByLabelText('バックアップコード')).toBeInTheDocument();
    });

    const controls = getAllControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByLabelText('バックアップコード'),
        screen.getByRole('button', { name: '認証コードを使用する' }),
        screen.getByRole('button', { name: 'キャンセル' }),
        screen.getByRole('button', { name: '検証' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });
});

// 単体テストでは CSS が読み込まれない（vitest の css 無効）ため、本番が読み込む原本を直接読む
const appHeaderCss = readFileSync(
  join(__dirname, '../../components/Navigation/AppHeader.css'),
  'utf-8'
);

/** CSS の規則を「セレクタ」と「宣言」の組へ分ける（コメントを除き、入れ子は持たない前提） */
function parseCssRules(css: string): { selector: string; declarations: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return Array.from(withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((match) => ({
    selector: (match[1] ?? '').trim(),
    declarations: match[2] ?? '',
  }));
}

/** #rrggbb を相対輝度へ */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('共通ヘッダーのロゴとメニューの釦のフォーカス表示（AppHeader.css）', () => {
  it(':focus-visible の規則のどれも outline を打ち消していない', () => {
    const suppressing = parseCssRules(appHeaderCss)
      .filter((rule) => rule.selector.includes(':focus-visible'))
      .filter((rule) => /outline\s*:\s*none\b/.test(rule.declarations))
      .map((rule) => rule.selector);

    expect(suppressing).toEqual([]);
  });

  it.each([
    '.app-header-logo',
    '.app-header-user-trigger',
    '.app-header-admin-trigger',
    '.app-header-dropdown-trigger',
  ])(
    '%s はフォーカス中に 2px の白い実線の輪を、ヘッダーのグラデーションの両端に 3:1 以上で描く',
    (triggerClass: string) => {
      const rules = parseCssRules(appHeaderCss);
      const focusRule = rules.find((rule) => rule.selector === `${triggerClass}:focus-visible`);
      const outline = /outline\s*:\s*(\d+(?:\.\d+)?)px\s+solid\s+white\s*;/.exec(
        focusRule?.declarations ?? ''
      );
      expect(
        outline,
        `${triggerClass}:focus-visible に「幅px solid white」の outline が無い`
      ).not.toBeNull();
      expect(parseFloat(outline?.[1] ?? '0')).toBeGreaterThanOrEqual(2);

      const header = rules.find((rule) => rule.selector === '.app-header');
      const stops = Array.from(
        (header?.declarations ?? '').matchAll(/#[0-9a-fA-F]{6}/g),
        (match) => match[0]
      );
      expect(stops.length, '.app-header の背景のグラデーションの色').toBeGreaterThanOrEqual(2);
      for (const stop of stops) {
        expect(contrastRatio('#ffffff', stop)).toBeGreaterThanOrEqual(3);
      }
    }
  );
});
