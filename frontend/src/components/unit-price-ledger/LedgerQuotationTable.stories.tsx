import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import type { LedgerQuotationSummary } from '../../api/unit-price-ledger';
import LedgerQuotationTable from './LedgerQuotationTable';

function summary(overrides: Partial<LedgerQuotationSummary>): LedgerQuotationSummary {
  return {
    id: 'q-1',
    name: '山田設備_2026-04-01',
    vendorName: '山田設備',
    submittedAt: new Date(2026, 3, 1),
    projectId: 'p-1',
    estimateRequestId: 'er-1',
    projectName: '庁舎改修工事',
    projectDeleted: false,
    constructionKind: 'RENOVATION',
    totalAmount: 1234000,
    adoption: 'ADOPTED',
    readingStatus: 'CONFIRMED',
    hasReferenceLines: false,
    ledgerCardId: null,
    createdAt: new Date(2026, 3, 2),
    updatedAt: new Date(2026, 3, 2),
    ...overrides,
  };
}

/**
 * LedgerQuotationTable のストーリー
 *
 * 単価台帳の一覧の表（unit-price-ledger 4.1）。業者名から見積の詳細の画面へ移る。
 */
const meta = {
  title: 'UnitPriceLedger/LedgerQuotationTable',
  component: LedgerQuotationTable,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '業者名・見積日・案件名・合計・採否・読取の確認・参考の行の有無を出す、台帳の見積の一覧の表。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof LedgerQuotationTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 案件の見積と案件の無い見積が混ざった一覧 */
export const Default: Story = {
  args: {
    quotations: [
      summary({ id: 'q-1', hasReferenceLines: true }),
      summary({
        id: 'q-2',
        vendorName: '鈴木電気',
        submittedAt: new Date(2026, 2, 15),
        projectId: null,
        estimateRequestId: null,
        projectName: null,
        constructionKind: null,
        totalAmount: null,
        adoption: 'REJECTED',
        readingStatus: 'UNCONFIRMED',
        ledgerCardId: 'card-2',
      }),
      summary({
        id: 'q-3',
        vendorName: '佐藤塗装',
        submittedAt: new Date(2026, 1, 10),
        projectName: '倉庫新築',
        constructionKind: 'NEW_CONSTRUCTION',
        totalAmount: 580000,
        adoption: 'UNKNOWN',
      }),
    ],
  },
};

/** 1 件だけの一覧 */
export const SingleRow: Story = {
  args: {
    quotations: [summary({ id: 'q-1' })],
  },
};

/** 論理削除された案件の見積（案件名の隣に「削除済みの案件」の印を出す。unit-price-ledger 4.8） */
export const DeletedProject: Story = {
  args: {
    quotations: [
      summary({ id: 'q-1', projectName: '旧庁舎改修工事', projectDeleted: true }),
      summary({ id: 'q-2', vendorName: '佐藤塗装', projectName: '倉庫新築' }),
    ],
  },
};
