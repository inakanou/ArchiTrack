import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import LedgerSearchFilter from './LedgerSearchFilter';

/**
 * LedgerSearchFilter のストーリー
 *
 * 単価台帳の一覧の絞り込みの欄（unit-price-ledger 4.2〜4.4）。
 */
const meta = {
  title: 'UnitPriceLedger/LedgerSearchFilter',
  component: LedgerSearchFilter,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'キーワード・見積日の期間・案件の有無・採否・読取の確認・改修／新営・要確認・分類キーの無い行があるで、台帳の一覧を絞り込む欄。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSearch: fn(),
  },
} satisfies Meta<typeof LedgerSearchFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 絞り込みの無い初めの状態 */
export const Default: Story = {
  args: {
    filter: {},
  },
};

/** 条件を入れた状態 */
export const WithFilter: Story = {
  args: {
    filter: {
      keyword: 'エアコン',
      submittedFrom: '2026-01-01',
      submittedTo: '2026-03-31',
      hasProject: false,
      adoption: 'ADOPTED',
      readingStatus: 'UNCONFIRMED',
      constructionKind: 'RENOVATION',
      needsReview: true,
      missingClassificationKey: true,
    },
  },
};

/** 読み込み中で操作できない状態 */
export const Disabled: Story = {
  args: {
    filter: {},
    disabled: true,
  },
};
