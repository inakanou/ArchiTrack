import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { EstimateRequestSectionCard } from './EstimateRequestSectionCard';
import type { EstimateRequestInfo } from '../../types/estimate-request.types';

/**
 * EstimateRequestSectionCard コンポーネントのストーリー
 *
 * プロジェクト詳細画面に表示する見積依頼セクション。
 * 直近の見積依頼一覧と総数を表示し、一覧・詳細画面への遷移リンクを提供。
 */

// サンプル見積依頼データ
const sampleRequests: EstimateRequestInfo[] = [
  {
    id: 'er-1',
    projectId: 'project-123',
    name: '外構工事見積依頼',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '株式会社サンプル建設',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '外構工事内訳書',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2024-01-20T10:30:00Z',
    updatedAt: '2024-01-20T15:45:00Z',
  },
  {
    id: 'er-2',
    projectId: 'project-123',
    name: '内装工事見積依頼',
    tradingPartnerId: 'tp-2',
    tradingPartnerName: '株式会社ABC工業',
    itemizedStatementId: 'is-2',
    itemizedStatementName: '内装工事内訳書',
    method: 'FAX',
    includeBreakdownInBody: true,
    createdAt: '2024-01-18T09:00:00Z',
    updatedAt: '2024-01-18T14:20:00Z',
  },
  {
    id: 'er-3',
    projectId: 'project-123',
    name: '電気設備見積依頼',
    tradingPartnerId: 'tp-3',
    tradingPartnerName: '電気工事株式会社',
    itemizedStatementId: 'is-3',
    itemizedStatementName: '電気設備内訳書',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2024-01-15T11:15:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
];

const meta = {
  title: 'Components/Projects/EstimateRequestSectionCard',
  component: EstimateRequestSectionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: '600px' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof EstimateRequestSectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 複数の見積依頼がある場合
 */
export const Default: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 5,
    latestRequests: sampleRequests,
    isLoading: false,
  },
};

/**
 * 単一見積依頼
 * 1件のみの表示
 */
export const SingleRequest: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestRequests: [sampleRequests[0]!],
    isLoading: false,
  },
};

/**
 * 空状態
 * 見積依頼がない場合
 */
export const Empty: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestRequests: [],
    isLoading: false,
  },
};

/**
 * ローディング状態
 * データ取得中
 */
export const Loading: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 0,
    latestRequests: [],
    isLoading: true,
  },
};

/**
 * 長い見積依頼名
 * 名前が長い場合のレイアウト確認
 */
export const LongRequestName: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestRequests: [
      {
        ...sampleRequests[0]!,
        name: 'これは非常に長い見積依頼名で、カード内でのテキスト折り返しを確認するためのサンプル見積依頼です',
      },
    ],
    isLoading: false,
  },
};

/**
 * 多数の見積依頼
 * 総数が多い場合
 */
export const ManyRequests: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 50,
    latestRequests: sampleRequests,
    isLoading: false,
  },
};

/**
 * FAXとメール混在
 * 見積依頼方法が混在している場合
 */
export const MixedMethods: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 3,
    latestRequests: [
      { ...sampleRequests[0]!, method: 'EMAIL' },
      { ...sampleRequests[1]!, method: 'FAX' },
      { ...sampleRequests[2]!, method: 'EMAIL' },
    ],
    isLoading: false,
  },
};

/**
 * 長い取引先名
 * 取引先名が長い場合
 */
export const LongPartnerName: Story = {
  args: {
    projectId: 'project-123',
    totalCount: 1,
    latestRequests: [
      {
        ...sampleRequests[0]!,
        tradingPartnerName: '非常に長い名前の株式会社サンプル総合建設工業グループホールディングス',
      },
    ],
    isLoading: false,
  },
};
