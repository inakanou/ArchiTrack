/**
 * @fileoverview ContractFormコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import ContractForm from './ContractForm';
import type { ContractFormProjectInfo } from './ContractForm';

/**
 * モックプロジェクト情報
 */
const mockProjectInfo: ContractFormProjectInfo = {
  id: 'project-1',
  name: '〇〇ビル新築工事',
  siteAddress: '東京都渋谷区渋谷1-1-1',
  tradingPartner: { id: 'tp-1', name: '株式会社サンプル建設' },
};

/**
 * fetch モック用ヘルパー
 * ContractFormは内部でAPIを呼び出すため、fetchをモックする
 */
function createFetchMock() {
  const originalFetch = window.fetch;

  const mockFetch = fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    // 見積書一覧
    if (url.includes('/estimates') && !url.includes('/estimates/')) {
      return new Response(
        JSON.stringify({
          data: [
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
              sourceItemizedStatementId: null,
              sourceItemizedStatementName: null,
              createdAt: '2025-01-20T14:00:00Z',
              updatedAt: '2025-01-20T14:00:00Z',
              totalAmount: '8750000',
            },
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 見積書詳細
    if (url.match(/\/estimates\/est-/)) {
      return new Response(
        JSON.stringify({
          id: 'est-1',
          projectId: 'project-1',
          name: '〇〇ビル新築工事見積書',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: '2025-01-15T10:30:00Z',
          updatedAt: '2025-01-15T10:30:00Z',
          totalAmount: '12500000',
          items: [
            {
              id: 'item-1',
              estimateId: 'est-1',
              parentId: null,
              displayOrder: 1,
              lines: [
                {
                  id: 'line-1',
                  estimateItemId: 'item-1',
                  lineType: 'ESTIMATE',
                  name: '建築主体工事',
                  specification: null,
                  unit: '式',
                  quantity: '1',
                  unitPrice: '12500000',
                  amount: '12500000',
                  remarks: null,
                  sourceReceivedQuotationLineItemId: null,
                  sourceVendorName: null,
                  createdAt: '2025-01-15T10:30:00Z',
                  updatedAt: '2025-01-15T10:30:00Z',
                },
              ],
              children: [],
              createdAt: '2025-01-15T10:30:00Z',
              updatedAt: '2025-01-15T10:30:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 契約書一覧
    if (url.includes('/contracts') && !url.includes('/contracts/')) {
      return new Response(JSON.stringify({ contracts: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 自社情報
    if (url.includes('/company-info')) {
      return new Response(
        JSON.stringify({
          id: 'company-1',
          companyName: '株式会社テスト工務店',
          address: '東京都港区虎ノ門1-1-1',
          representative: '山田太郎',
          phone: '03-1234-5678',
          fax: '03-1234-5679',
          email: 'info@test-koumuten.co.jp',
          invoiceRegistrationNumber: 'T1234567890123',
          version: 1,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 取引先一覧
    if (url.includes('/trading-partners')) {
      return new Response(
        JSON.stringify({
          data: [
            { id: 'tp-1', name: '株式会社サンプル建設' },
            { id: 'tp-2', name: '有限会社テスト設計' },
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // フォールバック
    return originalFetch(input, _init);
  }) as unknown as typeof window.fetch;

  return mockFetch;
}

const meta = {
  title: 'Contract/ContractForm',
  component: ContractForm,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: '800px', padding: '24px' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '契約書作成・編集フォーム（新規契約/変更契約対応）',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: false,
    projectId: 'project-1',
    projectInfo: mockProjectInfo,
  },
  beforeEach: () => {
    const mockFetch = createFetchMock();
    window.fetch = mockFetch;
  },
} satisfies Meta<typeof ContractForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 新規作成モード
 */
export const CreateMode: Story = {
  args: {
    mode: 'create',
  },
};

/**
 * 編集モード
 */
export const EditMode: Story = {
  args: {
    mode: 'edit',
    initialData: {
      id: 'contract-1',
      projectId: 'project-1',
      contractType: 'NEW',
      status: 'BEFORE_CONTRACT',
      parentContractId: null,
      estimateId: 'est-1',
      contractDate: '2025-02-01',
      constructionStartDate: '2025-03-01',
      constructionEndDate: '2025-09-30',
      deliveryDate: '2025-10-15',
      taxRate: 10,
      paymentTerms: '着手金30%、中間金30%、完成時40%',
      separateConstruction: '電気設備工事',
      otherNotes: '',
      supervisorTradingPartnerId: null,
      contractAmount: 13750000,
      constructionPrice: 12500000,
      taxAmount: 1250000,
      estimate: { id: 'est-1', name: '〇〇ビル新築工事見積書' },
      parentContract: null,
      supervisorTradingPartner: null,
      project: {
        id: 'project-1',
        name: '〇〇ビル新築工事',
        siteAddress: '東京都渋谷区渋谷1-1-1',
        tradingPartner: { id: 'tp-1', name: '株式会社サンプル建設' },
      },
      version: 1,
      createdAt: '2025-01-15T10:30:00Z',
      updatedAt: '2025-01-15T10:30:00Z',
    },
  },
};

/**
 * 送信中
 */
export const Submitting: Story = {
  args: {
    mode: 'create',
    isSubmitting: true,
  },
};

/**
 * 取引先なしのプロジェクト
 */
export const WithoutTradingPartner: Story = {
  args: {
    mode: 'create',
    projectInfo: {
      ...mockProjectInfo,
      tradingPartner: null,
    },
  },
};
