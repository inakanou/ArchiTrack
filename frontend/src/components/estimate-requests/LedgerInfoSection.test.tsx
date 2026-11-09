/**
 * @fileoverview LedgerInfoSection（受領見積書の台帳の欄）の単体テスト
 *
 * estimate-request のタスク117.3。見積の情報・案件の条件・採否・確定金額・読取の確認・
 * 見積の区別を入力でき、欄が既定で折りたたまれていることを確かめる（要件 46.1〜46.3・46.6・46.7・46.9・48.2）。
 */

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  LedgerInfoSection,
  LEDGER_INFO_SECTION_TITLE,
  type LedgerInfoSectionProps,
} from './LedgerInfoSection';
import {
  createLedgerInfoFormData,
  toLedgerInfoInput,
  validateLedgerInfo,
  type LedgerInfoFormData,
} from './ledger-info-form';
import { RECEIVED_QUOTATION_LEDGER_DEFAULTS } from '../../test-support/received-quotation-fixtures';

/** 親の状態を持つ包み（制御された部品を実際の使い方で動かす） */
function Harness({
  initial = createLedgerInfoFormData(),
  onChangeSpy,
  ...rest
}: Partial<Omit<LedgerInfoSectionProps, 'value' | 'onChange'>> & {
  initial?: LedgerInfoFormData;
  onChangeSpy?: (next: LedgerInfoFormData) => void;
}) {
  const [value, setValue] = useState<LedgerInfoFormData>(initial);
  return (
    <LedgerInfoSection
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

/** 最後の呼び出しの第 1 引数 */
function lastCall(spy: ReturnType<typeof vi.fn>): unknown {
  const calls = spy.mock.calls;
  return calls[calls.length - 1]?.[0];
}

const getHeader = () => screen.getByRole('button', { name: LEDGER_INFO_SECTION_TITLE });

async function renderExpanded(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  const utils = render(<Harness {...props} />);
  await user.click(getHeader());
  return { user, ...utils };
}

describe('LedgerInfoSection', () => {
  describe('折りたたみ', () => {
    it('見出しのボタンは既定で閉じた状態を示し、中身は隠れている', () => {
      render(<Harness />);

      const header = getHeader();
      expect(header).toHaveAttribute('aria-expanded', 'false');
      const bodyId = header.getAttribute('aria-controls');
      expect(bodyId).toBeTruthy();
      const body = document.getElementById(bodyId as string);
      expect(body).not.toBeNull();
      expect(body).toHaveAttribute('hidden');
      expect(screen.queryByRole('textbox', { name: '見積番号' })).not.toBeInTheDocument();
    });

    it('見出しを押すと開き、もう一度押すと閉じる', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(getHeader());
      expect(getHeader()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('textbox', { name: '見積番号' })).toBeVisible();

      await user.click(getHeader());
      expect(getHeader()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('textbox', { name: '見積番号' })).not.toBeInTheDocument();
    });

    it('Enter と Space でも開閉できる', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      getHeader().focus();
      await user.keyboard('{Enter}');
      expect(getHeader()).toHaveAttribute('aria-expanded', 'true');
      await user.keyboard(' ');
      expect(getHeader()).toHaveAttribute('aria-expanded', 'false');
    });

    it('閉じても入力した値は保たれる', async () => {
      const { user } = await renderExpanded();
      await user.type(screen.getByRole('textbox', { name: '見積番号' }), 'Q-1');
      await user.click(getHeader());
      await user.click(getHeader());
      expect(screen.getByRole('textbox', { name: '見積番号' })).toHaveValue('Q-1');
    });
  });

  describe('各欄の入力', () => {
    it('文字の欄の入力が親へ渡る', async () => {
      const onChangeSpy = vi.fn();
      const { user } = await renderExpanded({ onChangeSpy });

      await user.type(screen.getByRole('textbox', { name: '見積番号' }), 'A-01');
      await user.type(screen.getByRole('textbox', { name: '見積全体の条件' }), '夜間別途');
      await user.type(screen.getByRole('textbox', { name: '場所' }), '横浜市');
      await user.type(screen.getByRole('textbox', { name: '用途' }), '事務所');
      await user.type(screen.getByRole('textbox', { name: '作業条件' }), '居ながら');
      await user.type(screen.getByRole('textbox', { name: '見積の区別' }), '別案');

      const last = lastCall(onChangeSpy) as LedgerInfoFormData;
      expect(last).toMatchObject({
        quoteNumber: 'A-01',
        overallConditions: '夜間別途',
        siteLocation: '横浜市',
        useType: '事務所',
        workConditions: '居ながら',
        quoteDiscriminator: '別案',
      });
    });

    it('文字の欄は保存できる長さを入力の上限にする', async () => {
      await renderExpanded();

      expect(screen.getByRole('textbox', { name: '見積番号' })).toHaveAttribute('maxLength', '100');
      expect(screen.getByRole('textbox', { name: '見積全体の条件' })).toHaveAttribute(
        'maxLength',
        '2000'
      );
      expect(screen.getByRole('textbox', { name: '場所' })).toHaveAttribute('maxLength', '100');
      expect(screen.getByRole('textbox', { name: '用途' })).toHaveAttribute('maxLength', '100');
      expect(screen.getByRole('textbox', { name: '作業条件' })).toHaveAttribute('maxLength', '200');
      expect(screen.getByRole('textbox', { name: '見積の区別' })).toHaveAttribute(
        'maxLength',
        '100'
      );
    });

    it('改修／新営は三つの選択肢を持ち、既定は未設定', async () => {
      const onChangeSpy = vi.fn();
      const { user } = await renderExpanded({ onChangeSpy });

      const select = screen.getByRole('combobox', { name: '改修／新営' });
      const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.text);
      expect(labels).toEqual(['未設定', '改修', '新営']);
      expect(select).toHaveDisplayValue('未設定');

      await user.selectOptions(select, '新営');
      expect(lastCall(onChangeSpy)).toMatchObject({
        constructionKind: 'NEW_CONSTRUCTION',
      });
    });

    it('採否は三つの選択肢を持ち、既定は不明', async () => {
      const onChangeSpy = vi.fn();
      const { user } = await renderExpanded({ onChangeSpy });

      const select = screen.getByRole('combobox', { name: '採否' });
      const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.text);
      expect(labels).toEqual(['採用', '不採用', '不明']);
      expect(select).toHaveDisplayValue('不明');

      await user.selectOptions(select, '採用');
      expect(lastCall(onChangeSpy)).toMatchObject({ adoption: 'ADOPTED' });
    });

    it('工事価格と確定金額は 0 以上の整数だけを受け、違えば欄の下に誤りを出す', async () => {
      const { user } = await renderExpanded();

      const price = screen.getByRole('textbox', { name: '工事価格（円）' });
      await user.type(price, '12.5');
      expect(price).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('工事価格は0以上の整数（円）で入力してください')).toBeInTheDocument();
      await user.clear(price);
      await user.type(price, '1200000');
      expect(price).toHaveAttribute('aria-invalid', 'false');

      const amount = screen.getByRole('textbox', { name: '確定金額（円）' });
      await user.type(amount, '-1');
      expect(screen.getByText('確定金額は0以上の整数（円）で入力してください')).toBeInTheDocument();
      await user.clear(amount);
      await user.type(amount, '980000');
      expect(
        screen.queryByText('確定金額は0以上の整数（円）で入力してください')
      ).not.toBeInTheDocument();
    });

    it('距離は 0 以上で小数第 1 位までを受ける', async () => {
      const { user } = await renderExpanded();

      const distance = screen.getByRole('textbox', { name: '距離（km）' });
      await user.type(distance, '12.34');
      expect(
        screen.getByText('距離は0以上の数値を小数第1位までで入力してください')
      ).toBeInTheDocument();
      await user.clear(distance);
      await user.type(distance, '12.3');
      expect(distance).toHaveAttribute('aria-invalid', 'false');
    });

    it('見積の区別の前後の空白を誤りとして示す', async () => {
      const { user } = await renderExpanded();

      const field = screen.getByRole('textbox', { name: '見積の区別' });
      await user.type(field, ' 別案');
      expect(screen.getByText('見積の区別の前後に空白を入れないでください')).toBeInTheDocument();
    });

    it('外から渡した誤りを該当の欄に出す', async () => {
      await renderExpanded({ errors: { quoteNumber: 'サーバーの誤り' } });

      expect(screen.getByRole('textbox', { name: '見積番号' })).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(screen.getByText('サーバーの誤り')).toBeInTheDocument();
    });

    it('操作できない状態では欄を変えられない', async () => {
      await renderExpanded({ disabled: true });
      expect(screen.getByRole('textbox', { name: '見積番号' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: '採否' })).toBeDisabled();
      // 開閉は操作できる（中身を見ることは妨げない）
      expect(getHeader()).not.toBeDisabled();
    });
  });

  describe('読取の確認', () => {
    it('既定は未確認で、確認者と日時を出さない', async () => {
      await renderExpanded();

      const select = screen.getByRole('combobox', { name: '読取の確認' });
      expect(select).toHaveDisplayValue('未確認');
      expect(screen.queryByTestId('ledger-reading-confirmation')).not.toBeInTheDocument();
    });

    it('確認済みの受領見積書は確認者と日時を表示する', async () => {
      await renderExpanded({
        initial: createLedgerInfoFormData({
          ...RECEIVED_QUOTATION_LEDGER_DEFAULTS,
          readingStatus: 'CONFIRMED',
        }),
        readingConfirmedAt: new Date(2026, 10, 8, 10, 30),
        readingConfirmedByName: '山田 太郎',
      });

      expect(screen.getByRole('combobox', { name: '読取の確認' })).toHaveDisplayValue('確認済み');
      const info = screen.getByTestId('ledger-reading-confirmation');
      expect(info).toHaveTextContent('山田 太郎');
      expect(info).toHaveTextContent('2026/11/08 10:30');
    });

    it('確認者の名前が分からないときも日時は表示する', async () => {
      await renderExpanded({
        initial: createLedgerInfoFormData({
          ...RECEIVED_QUOTATION_LEDGER_DEFAULTS,
          readingStatus: 'CONFIRMED',
        }),
        readingConfirmedAt: new Date(2026, 10, 8, 10, 30),
      });

      const info = screen.getByTestId('ledger-reading-confirmation');
      expect(info).toHaveTextContent('2026/11/08 10:30');
      expect(info).toHaveTextContent('確認者: —');
    });

    it('保存前に確認済みへ変えると、保存で確認者と日時を記録することを示す', async () => {
      const onChangeSpy = vi.fn();
      const { user } = await renderExpanded({ onChangeSpy });

      await user.selectOptions(screen.getByRole('combobox', { name: '読取の確認' }), '確認済み');
      expect(lastCall(onChangeSpy)).toMatchObject({ readingStatus: 'CONFIRMED' });
      expect(screen.getByTestId('ledger-reading-confirmation')).toHaveTextContent(
        '保存すると確認者と日時を記録します'
      );
    });

    it('未確認へ戻すと確認者と日時の表示を消す', async () => {
      const { user } = await renderExpanded({
        initial: createLedgerInfoFormData({
          ...RECEIVED_QUOTATION_LEDGER_DEFAULTS,
          readingStatus: 'CONFIRMED',
        }),
        readingConfirmedAt: new Date(2026, 10, 8, 10, 30),
        readingConfirmedByName: '山田 太郎',
      });

      await user.selectOptions(screen.getByRole('combobox', { name: '読取の確認' }), '未確認');
      expect(screen.queryByTestId('ledger-reading-confirmation')).not.toBeInTheDocument();
    });
  });

  describe('値の変換', () => {
    it('受領見積書の値から欄の値を作る', () => {
      const data = createLedgerInfoFormData({
        ...RECEIVED_QUOTATION_LEDGER_DEFAULTS,
        quoteNumber: 'Q-9',
        constructionKind: 'RENOVATION',
        constructionPrice: 1500000,
        distanceKm: 12.5,
        adoption: 'REJECTED',
        confirmedAmount: 0,
        quoteDiscriminator: '本体',
      });
      expect(data).toMatchObject({
        quoteNumber: 'Q-9',
        overallConditions: '',
        constructionKind: 'RENOVATION',
        constructionPrice: '1500000',
        distanceKm: '12.5',
        adoption: 'REJECTED',
        confirmedAmount: '0',
        readingStatus: 'UNCONFIRMED',
        quoteDiscriminator: '本体',
      });
    });

    it('何も無いときの既定は 未設定・不明・未確認・区別なし', () => {
      expect(createLedgerInfoFormData()).toEqual({
        quoteNumber: '',
        overallConditions: '',
        siteLocation: '',
        constructionKind: '',
        useType: '',
        constructionPrice: '',
        workConditions: '',
        distanceKm: '',
        adoption: 'UNKNOWN',
        confirmedAmount: '',
        readingStatus: 'UNCONFIRMED',
        quoteDiscriminator: '',
      });
    });

    it('保存の入力へ変えると、空の欄は null、数の欄は数になる', () => {
      const input = toLedgerInfoInput({
        ...createLedgerInfoFormData(),
        quoteNumber: 'Q-1',
        constructionKind: 'NEW_CONSTRUCTION',
        constructionPrice: '2000000',
        distanceKm: '3.5',
        confirmedAmount: '',
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
      });
      expect(input).toEqual({
        quoteNumber: 'Q-1',
        overallConditions: null,
        siteLocation: null,
        constructionKind: 'NEW_CONSTRUCTION',
        useType: null,
        constructionPrice: 2000000,
        workConditions: null,
        distanceKm: 3.5,
        adoption: 'ADOPTED',
        confirmedAmount: null,
        readingStatus: 'CONFIRMED',
        quoteDiscriminator: '',
      });
    });

    it('検証は誤りのある欄だけを返す', () => {
      expect(validateLedgerInfo(createLedgerInfoFormData())).toEqual({});
      expect(
        validateLedgerInfo({
          ...createLedgerInfoFormData(),
          constructionPrice: 'abc',
          distanceKm: '-1',
          quoteDiscriminator: '案 ',
        })
      ).toEqual({
        constructionPrice: '工事価格は0以上の整数（円）で入力してください',
        distanceKm: '距離は0以上の数値を小数第1位までで入力してください',
        quoteDiscriminator: '見積の区別の前後に空白を入れないでください',
      });
    });
  });
});
