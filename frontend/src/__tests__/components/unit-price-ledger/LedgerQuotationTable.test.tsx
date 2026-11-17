/**
 * @fileoverview 台帳の一覧の表の単体テスト（unit-price-ledger タスク4.2）
 *
 * @requirement unit-price-ledger/REQ-4.1 業者名・見積日・案件名・合計・採否・読取の確認・参考の行の有無
 * @requirement unit-price-ledger/REQ-4.8 論理削除された案件の見積は、案件名の隣に「削除済みの案件」と出す
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LedgerQuotationSummary } from '../../../api/unit-price-ledger';
import LedgerQuotationTable from '../../../components/unit-price-ledger/LedgerQuotationTable';

function summary(overrides: Partial<LedgerQuotationSummary> = {}): LedgerQuotationSummary {
  return {
    id: 'q-1',
    name: '山田設備_2026-04-01',
    vendorName: '山田設備',
    submittedAt: new Date(2026, 3, 1),
    projectId: null,
    estimateRequestId: null,
    projectName: '倉庫新築',
    projectDeleted: false,
    constructionKind: 'NEW_CONSTRUCTION',
    totalAmount: 0,
    adoption: 'UNKNOWN',
    readingStatus: 'UNCONFIRMED',
    hasReferenceLines: false,
    ledgerCardId: 'card-1',
    createdAt: new Date(2026, 3, 2),
    updatedAt: new Date(2026, 3, 2),
    ...overrides,
  };
}

function renderTable(quotations: LedgerQuotationSummary[]): void {
  render(
    <MemoryRouter>
      <LedgerQuotationTable quotations={quotations} />
    </MemoryRouter>
  );
}

describe('LedgerQuotationTable', () => {
  it('7 つの欄の見出しを列の見出しとして出す', () => {
    renderTable([summary()]);

    const table = screen.getByRole('table', { name: '台帳の見積の一覧' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      '業者名',
      '見積日',
      '案件名',
      '合計',
      '採否',
      '読取の確認',
      '参考の行',
    ]);
    for (const th of headers) {
      expect(th).toHaveAttribute('scope', 'col');
    }
  });

  it('合計 0 円・不明・未確認・参考の行なしを出す', () => {
    renderTable([summary()]);

    const row = screen.getAllByRole('row')[1]!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((td) => td.textContent)
    ).toEqual(['山田設備', '2026-04-01', '倉庫新築', '0円', '不明', '未確認', 'なし']);
  });

  it('業者名を見積の詳細の画面への導線にする', () => {
    renderTable([summary({ id: 'abc-123', vendorName: '佐藤塗装' })]);

    expect(screen.getByRole('link', { name: '佐藤塗装' })).toHaveAttribute(
      'href',
      '/unit-price-ledger/quotations/abc-123'
    );
  });

  it('渡された順のまま行を出す', () => {
    renderTable([
      summary({ id: 'a', vendorName: 'A社' }),
      summary({ id: 'b', vendorName: 'B社' }),
      summary({ id: 'c', vendorName: 'C社' }),
    ]);

    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['A社', 'B社', 'C社']);
  });

  it('論理削除された案件の見積は、案件名の隣に「削除済みの案件」と出し、ほかの見積には出さない', () => {
    renderTable([
      summary({ id: 'a', vendorName: 'A社', projectName: '旧事務所改修', projectDeleted: true }),
      summary({ id: 'b', vendorName: 'B社', projectName: '倉庫新築', projectDeleted: false }),
    ]);

    const [deletedRow, liveRow] = screen.getAllByRole('row').slice(1);
    const deletedCell = within(deletedRow!).getAllByRole('cell')[2]!;
    expect(deletedCell).toHaveTextContent('旧事務所改修');
    expect(within(deletedCell).getByText('削除済みの案件')).toBeInTheDocument();
    expect(within(liveRow!).getAllByRole('cell')[2]).toHaveTextContent(/^倉庫新築$/);
  });
});
