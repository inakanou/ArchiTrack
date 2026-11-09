/**
 * @fileoverview ReceivedQuotationLedgerIndicatorsコンポーネントのStorybook
 *
 * 受領見積書の一覧に出す台帳の表示（参考の印・読取の確認）を、
 * 参考の印の有無 × 読取の確認の状態の組み合わせで示す。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { ReceivedQuotationLedgerIndicators } from './ReceivedQuotationLedgerIndicators';

const meta = {
  title: 'EstimateRequests/ReceivedQuotationLedgerIndicators',
  component: ReceivedQuotationLedgerIndicators,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '受領見積書の参考の印と読取の確認の状態を文字の札で表示するコンポーネント（色だけに頼らない）',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    lineItems: [{ isReference: false }],
    readingStatus: 'UNCONFIRMED',
  },
} satisfies Meta<typeof ReceivedQuotationLedgerIndicators>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 参考の印なし・読取が未確認
 */
export const NoReferenceUnconfirmed: Story = {
  args: {
    lineItems: [{ isReference: false }, { isReference: false }],
    readingStatus: 'UNCONFIRMED',
  },
};

/**
 * 参考の印なし・読取が確認済み
 */
export const NoReferenceConfirmed: Story = {
  args: {
    lineItems: [{ isReference: false }, { isReference: false }],
    readingStatus: 'CONFIRMED',
  },
};

/**
 * 参考の印あり・読取が未確認
 */
export const WithReferenceUnconfirmed: Story = {
  args: {
    lineItems: [{ isReference: false }, { isReference: true }],
    readingStatus: 'UNCONFIRMED',
  },
};

/**
 * 参考の印あり・読取が確認済み
 */
export const WithReferenceConfirmed: Story = {
  args: {
    lineItems: [{ isReference: true }, { isReference: false }],
    readingStatus: 'CONFIRMED',
  },
};

/**
 * 明細行なし（参考の印は出ない）
 */
export const NoLineItems: Story = {
  args: {
    lineItems: [],
    readingStatus: 'UNCONFIRMED',
  },
};
