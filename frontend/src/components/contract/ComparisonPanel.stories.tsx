/**
 * @fileoverview ComparisonPanelコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import ComparisonPanel from './ComparisonPanel';
import type { ComparisonValues } from './ComparisonPanel';
import type { EstimateInfo } from '../../api/estimates';

const mockEstimates: EstimateInfo[] = [
  {
    id: 'est-1',
    projectId: 'project-1',
    name: '〇〇ビル新築工事見積書',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-15T10:30:00Z',
    totalAmount: '12500000',
  },
  {
    id: 'est-2',
    projectId: 'project-1',
    name: '△△マンション改修工事見積書',
    sourceItemizedStatementId: 'is-1',
    sourceItemizedStatementName: '内訳書A',
    createdAt: '2025-01-20T14:00:00Z',
    updatedAt: '2025-01-20T14:00:00Z',
    totalAmount: '8750000',
  },
];

const previousValues: ComparisonValues = {
  estimateId: 'est-1',
  estimateName: '〇〇ビル新築工事見積書',
  contractDate: '2025-01-20',
  constructionStartDate: '2025-02-01',
  constructionEndDate: '2025-08-31',
  deliveryDate: '2025-09-15',
  taxRate: '10',
  paymentTerms: '着手金30%、中間金30%、完成時40%',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: 'tp-1',
  contractAmount: 13750000,
  constructionPrice: 12500000,
  taxAmount: 1250000,
};

const currentValuesChanged: ComparisonValues = {
  estimateId: 'est-2',
  estimateName: '△△マンション改修工事見積書',
  contractDate: '2025-03-01',
  constructionStartDate: '2025-04-01',
  constructionEndDate: '2025-10-31',
  deliveryDate: '2025-11-15',
  taxRate: '10',
  paymentTerms: '着手金30%、中間金30%、完成時40%',
  separateConstruction: '電気設備工事、空調設備工事',
  otherNotes: '工期延長に伴う追加条件あり',
  supervisorTradingPartnerId: 'tp-1',
  contractAmount: 9625000,
  constructionPrice: 8750000,
  taxAmount: 875000,
};

const meta = {
  title: 'Contract/ComparisonPanel',
  component: ComparisonPanel,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '800px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '変更契約の変更前後比較表示パネル',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ComparisonPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 変更あり - 複数フィールドが変更された状態
 */
export const WithChanges: Story = {
  args: {
    previousValues,
    currentValues: currentValuesChanged,
    estimates: mockEstimates,
  },
};

/**
 * 変更なし - すべてのフィールドが同一
 */
export const NoChanges: Story = {
  args: {
    previousValues,
    currentValues: { ...previousValues },
    estimates: mockEstimates,
  },
};

/**
 * 金額のみ変更
 */
export const AmountOnly: Story = {
  args: {
    previousValues,
    currentValues: {
      ...previousValues,
      contractAmount: 15000000,
      constructionPrice: 13636364,
      taxAmount: 1363636,
    },
    estimates: mockEstimates,
  },
};
