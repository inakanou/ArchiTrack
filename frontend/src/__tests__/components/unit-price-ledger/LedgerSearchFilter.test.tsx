/**
 * @fileoverview 台帳の絞り込みの欄の単体テスト（unit-price-ledger タスク4.2）
 *
 * @requirement unit-price-ledger/REQ-4.2 キーワード・見積日の期間・案件の有無・採否・読取の確認・改修／新営の絞り込み
 * @requirement unit-price-ledger/REQ-4.3 「要確認」の絞り込み
 * @requirement unit-price-ledger/REQ-4.4 「分類キーの無い行がある」の絞り込み
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LedgerSearchFilter from '../../../components/unit-price-ledger/LedgerSearchFilter';

describe('LedgerSearchFilter', () => {
  it('すべての欄を入れて検索すると、その条件を渡す', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<LedgerSearchFilter filter={{}} onSearch={onSearch} />);

    await user.type(screen.getByLabelText('キーワード'), '  エアコン ');
    await user.type(screen.getByLabelText('見積日（から）'), '2026-01-01');
    await user.type(screen.getByLabelText('見積日（まで）'), '2026-01-31');
    await user.selectOptions(screen.getByLabelText('案件の有無'), 'あり');
    await user.selectOptions(screen.getByLabelText('採否'), '採用');
    await user.selectOptions(screen.getByLabelText('読取の確認'), '確認済み');
    await user.selectOptions(screen.getByLabelText('改修／新営'), '改修');
    await user.click(screen.getByRole('checkbox', { name: '要確認' }));
    await user.click(screen.getByRole('checkbox', { name: '分類キーの無い行がある' }));
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(onSearch).toHaveBeenCalledWith({
      keyword: 'エアコン',
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-31',
      hasProject: true,
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      constructionKind: 'RENOVATION',
      needsReview: true,
      missingClassificationKey: true,
    });
  });

  it('何も入れずに検索すると、空の条件を渡す', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<LedgerSearchFilter filter={{}} onSearch={onSearch} />);

    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(onSearch).toHaveBeenCalledWith({});
  });

  it('キーワードの欄で Enter を押すと検索する', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<LedgerSearchFilter filter={{}} onSearch={onSearch} />);

    await user.type(screen.getByLabelText('キーワード'), '山田{Enter}');

    expect(onSearch).toHaveBeenCalledWith({ keyword: '山田' });
  });

  it('渡された条件を欄に出す', () => {
    render(
      <LedgerSearchFilter
        filter={{
          keyword: 'abc',
          submittedFrom: '2026-02-01',
          hasProject: false,
          adoption: 'REJECTED',
          readingStatus: 'UNCONFIRMED',
          constructionKind: 'NEW_CONSTRUCTION',
          missingClassificationKey: true,
        }}
        onSearch={vi.fn()}
      />
    );

    expect(screen.getByLabelText('キーワード')).toHaveValue('abc');
    expect(screen.getByLabelText('見積日（から）')).toHaveValue('2026-02-01');
    expect(screen.getByLabelText('見積日（まで）')).toHaveValue('');
    expect(screen.getByLabelText('案件の有無')).toHaveDisplayValue('なし');
    expect(screen.getByLabelText('採否')).toHaveDisplayValue('不採用');
    expect(screen.getByLabelText('読取の確認')).toHaveDisplayValue('未確認');
    expect(screen.getByLabelText('改修／新営')).toHaveDisplayValue('新営');
    expect(screen.getByRole('checkbox', { name: '要確認' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '分類キーの無い行がある' })).toBeChecked();
  });

  it('見積日の始まりが終わりより後なら、検索せずに知らせる', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<LedgerSearchFilter filter={{}} onSearch={onSearch} />);

    await user.type(screen.getByLabelText('見積日（から）'), '2026-02-01');
    await user.type(screen.getByLabelText('見積日（まで）'), '2026-01-01');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '見積日の期間は、始まりを終わり以前にしてください'
    );
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('条件をクリアすると、空の条件を渡す', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(
      <LedgerSearchFilter filter={{ keyword: 'abc', needsReview: true }} onSearch={onSearch} />
    );

    await user.click(screen.getByRole('button', { name: '条件をクリア' }));

    expect(onSearch).toHaveBeenCalledWith({});
  });

  it('disabled のときは検索とクリアを押せない', () => {
    render(<LedgerSearchFilter filter={{}} onSearch={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: '検索' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '条件をクリア' })).toBeDisabled();
  });
});
