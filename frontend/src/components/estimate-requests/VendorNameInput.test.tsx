/**
 * @fileoverview VendorNameInput（受領見積書の業者名の入力）の単体テスト
 *
 * estimate-request のタスク117.3。業者名は自由に入力でき、入力に応じて協力業者の取引先の候補を出し、
 * 選ぶと取引先の ID と名前を返すことを確かめる（要件 44.4・44.5。design の D4）。
 */

import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/trading-partners', () => ({
  searchTradingPartners: vi.fn(),
}));

import { searchTradingPartners } from '../../api/trading-partners';
import { ApiError } from '../../api/client';
import {
  VendorNameInput,
  VENDOR_NAME_SEARCH_DEBOUNCE_MS,
  type VendorNameInputProps,
  type VendorNameValue,
} from './VendorNameInput';

const mockSearch = searchTradingPartners as ReturnType<typeof vi.fn>;

const PARTNERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '山田工業株式会社',
    nameKana: 'ヤマダコウギョウ',
    types: ['SUBCONTRACTOR'],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: '山田設備',
    nameKana: 'ヤマダセツビ',
    types: ['CUSTOMER', 'SUBCONTRACTOR'],
  },
];

function Harness({
  initial = { vendorName: '', tradingPartnerId: null },
  onChangeSpy,
  ...rest
}: Partial<Omit<VendorNameInputProps, 'value' | 'onChange'>> & {
  initial?: VendorNameValue;
  onChangeSpy?: (next: VendorNameValue) => void;
}) {
  const [value, setValue] = useState<VendorNameValue>(initial);
  return (
    <VendorNameInput
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

const getInput = () => screen.getByRole('combobox', { name: '業者名' });

describe('VendorNameInput', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setupUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it('候補の一覧を指す combobox として表示し、文字の上限は 200', () => {
    render(<Harness />);
    const input = getInput();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('maxLength', '200');
  });

  it('入力は止めてから一定の時間の後に一度だけ協力業者を 10 件まで検索する', async () => {
    mockSearch.mockResolvedValue(PARTNERS);
    const user = setupUser();
    render(<Harness />);

    await user.type(getInput(), '山田');
    expect(mockSearch).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch).toHaveBeenCalledWith('山田', ['SUBCONTRACTOR'], 10);
    const listbox = await screen.findByRole('listbox');
    expect(getInput()).toHaveAttribute('aria-expanded', 'true');
    expect(getInput()).toHaveAttribute('aria-controls', listbox.id);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('選ばずに入力した文字はそのまま業者名として保たれ、取引先の ID は持たない', async () => {
    mockSearch.mockResolvedValue([]);
    const onChangeSpy = vi.fn();
    const user = setupUser();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(getInput(), '未登録の業者');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await user.tab();

    expect(getInput()).toHaveValue('未登録の業者');
    expect(lastCall(onChangeSpy)).toEqual({
      vendorName: '未登録の業者',
      tradingPartnerId: null,
    });
  });

  it('候補を押して選ぶと取引先の ID と名前を返し、一覧を閉じる', async () => {
    mockSearch.mockResolvedValue(PARTNERS);
    const onChangeSpy = vi.fn();
    const user = setupUser();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(getInput(), '山田');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await user.click(await screen.findByRole('option', { name: /山田設備/ }));

    expect(lastCall(onChangeSpy)).toEqual({
      vendorName: '山田設備',
      tradingPartnerId: PARTNERS[1]!.id,
    });
    expect(getInput()).toHaveValue('山田設備');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('vendor-name-linked')).toBeInTheDocument();

    // 選んだ名前で検索し直して一覧を開き直さない
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS * 2);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('矢印キーと Enter で候補を選べる', async () => {
    mockSearch.mockResolvedValue(PARTNERS);
    const onChangeSpy = vi.fn();
    const user = setupUser();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(getInput(), '山田');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}');
    const first = screen.getAllByRole('option')[0]!;
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(getInput()).toHaveAttribute('aria-activedescendant', first.id);
    await user.keyboard('{Enter}');

    expect(lastCall(onChangeSpy)).toEqual({
      vendorName: '山田工業株式会社',
      tradingPartnerId: PARTNERS[0]!.id,
    });
  });

  it('Escape で候補の一覧を閉じ、入力した文字は残る', async () => {
    mockSearch.mockResolvedValue(PARTNERS);
    const user = setupUser();
    render(<Harness />);

    await user.type(getInput(), '山田');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(getInput()).toHaveValue('山田');
  });

  it('選んだ後に文字を打ち直すと取引先の ID を外す', async () => {
    const onChangeSpy = vi.fn();
    mockSearch.mockResolvedValue([]);
    const user = setupUser();
    render(
      <Harness
        initial={{ vendorName: '山田設備', tradingPartnerId: PARTNERS[1]!.id }}
        onChangeSpy={onChangeSpy}
      />
    );
    expect(screen.getByTestId('vendor-name-linked')).toBeInTheDocument();

    await user.type(getInput(), '株式会社');

    expect(lastCall(onChangeSpy)).toEqual({
      vendorName: '山田設備株式会社',
      tradingPartnerId: null,
    });
    expect(screen.queryByTestId('vendor-name-linked')).not.toBeInTheDocument();
  });

  it('文字を変えずにフォーカスを出入りしても取引先の ID を保つ', async () => {
    const onChangeSpy = vi.fn();
    const user = setupUser();
    render(
      <Harness
        initial={{ vendorName: '山田設備', tradingPartnerId: PARTNERS[1]!.id }}
        onChangeSpy={onChangeSpy}
      />
    );

    await user.click(getInput());
    await user.tab();
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
    expect(screen.getByTestId('vendor-name-linked')).toBeInTheDocument();
  });

  it('検索が権限の不足などで失敗しても、候補を出さずに自由な入力を続けられる', async () => {
    mockSearch.mockRejectedValue(new ApiError(403, 'Forbidden'));
    const onChangeSpy = vi.fn();
    const user = setupUser();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(getInput(), '山田');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(getInput(), '組');
    expect(getInput()).toHaveValue('山田組');
    expect(lastCall(onChangeSpy)).toEqual({
      vendorName: '山田組',
      tradingPartnerId: null,
    });
  });

  it('遅れて届いた古い検索の結果で一覧を上書きしない', async () => {
    let resolveFirst: (v: typeof PARTNERS) => void = () => {};
    mockSearch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce([PARTNERS[1]!]);
    const user = setupUser();
    render(<Harness />);

    await user.type(getInput(), '山');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await user.type(getInput(), '田設');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));

    await act(async () => {
      resolveFirst(PARTNERS);
    });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /山田設備/ })).toBeInTheDocument();
  });

  it('該当が無いときはその旨を出す', async () => {
    mockSearch.mockResolvedValue([]);
    const user = setupUser();
    render(<Harness />);

    await user.type(getInput(), 'ZZZ');
    await act(async () => {
      vi.advanceTimersByTime(VENDOR_NAME_SEARCH_DEBOUNCE_MS);
    });

    expect(await screen.findByText('該当する協力業者がありません')).toBeInTheDocument();
  });

  it('必須のときに空のまま離れると誤りを出す', async () => {
    const user = setupUser();
    render(<Harness required />);

    await user.click(getInput());
    await user.tab();

    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('業者名を入力してください');
  });

  it('外から渡した誤りを出す', () => {
    render(<Harness error="選んだ取引先が見つかりません" />);
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('選んだ取引先が見つかりません');
  });

  it('操作できない状態では入力も検索もしない', async () => {
    const user = setupUser();
    render(<Harness disabled />);
    expect(getInput()).toBeDisabled();
    await user.type(getInput(), 'abc');
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
