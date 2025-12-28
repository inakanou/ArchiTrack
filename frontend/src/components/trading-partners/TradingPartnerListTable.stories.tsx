import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import TradingPartnerListTable from './TradingPartnerListTable';
import type { TradingPartnerInfo } from '../../types/trading-partner.types';

/**
 * モックデータ: 取引先一覧
 */
const mockPartners: TradingPartnerInfo[] = [
  {
    id: '1',
    name: 'テスト株式会社',
    nameKana: 'テストカブシキガイシャ',
    branchName: '東京支店',
    branchNameKana: 'トウキョウシテン',
    representativeName: '山田太郎',
    representativeNameKana: 'ヤマダタロウ',
    types: ['CUSTOMER', 'SUBCONTRACTOR'],
    address: '東京都渋谷区道玄坂1-2-3 テストビル10F',
    phoneNumber: '03-1234-5678',
    faxNumber: '03-1234-5679',
    email: 'info@test.co.jp',
    billingClosingDay: 99,
    paymentMonthOffset: 1,
    paymentDay: 15,
    notes: 'テスト用データ',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-06-20T14:45:00.000Z',
  },
  {
    id: '2',
    name: 'サンプル建設株式会社',
    nameKana: 'サンプルケンセツカブシキガイシャ',
    branchName: null,
    branchNameKana: null,
    representativeName: '佐藤花子',
    representativeNameKana: 'サトウハナコ',
    types: ['SUBCONTRACTOR'],
    address: '大阪府大阪市中央区心斎橋1-1-1',
    phoneNumber: '06-1234-5678',
    faxNumber: null,
    email: 'info@sample-kensetsu.co.jp',
    billingClosingDay: 20,
    paymentMonthOffset: 2,
    paymentDay: 10,
    notes: null,
    createdAt: '2024-02-10T10:00:00.000Z',
    updatedAt: '2024-02-10T10:00:00.000Z',
  },
  {
    id: '3',
    name: 'ABC商事',
    nameKana: 'エービーシーショウジ',
    branchName: '横浜営業所',
    branchNameKana: 'ヨコハマエイギョウショ',
    representativeName: null,
    representativeNameKana: null,
    types: ['CUSTOMER'],
    address: '神奈川県横浜市西区みなとみらい2-2-2',
    phoneNumber: '045-123-4567',
    faxNumber: '045-123-4568',
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-03-05T15:30:00.000Z',
    updatedAt: '2024-05-12T09:00:00.000Z',
  },
];

/**
 * TradingPartnerListTable コンポーネントのストーリー
 *
 * 取引先一覧テーブルコンポーネント。
 * テーブル形式で取引先一覧を表示し、ソートと行クリック機能を提供します。
 */
const meta = {
  title: 'TradingPartners/TradingPartnerListTable',
  component: TradingPartnerListTable,
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
          '取引先一覧をテーブル形式で表示するコンポーネント。ソート機能と行クリック機能を提供します。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onSort: fn(),
    onRowClick: fn(),
    sortField: 'nameKana',
    sortOrder: 'asc',
  },
} satisfies Meta<typeof TradingPartnerListTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 取引先一覧の初期表示
 */
export const Default: Story = {
  args: {
    partners: mockPartners,
  },
};

/**
 * 空の状態
 * 取引先が登録されていない場合のメッセージ表示
 */
export const Empty: Story = {
  args: {
    partners: [],
  },
};

/**
 * 取引先名でソート（昇順）
 * 取引先名で昇順ソートされている状態
 */
export const SortedByNameAsc: Story = {
  args: {
    partners: mockPartners,
    sortField: 'name',
    sortOrder: 'asc',
  },
};

/**
 * 取引先名でソート（降順）
 * 取引先名で降順ソートされている状態
 */
export const SortedByNameDesc: Story = {
  args: {
    partners: mockPartners,
    sortField: 'name',
    sortOrder: 'desc',
  },
};

/**
 * 登録日でソート（昇順）
 * 登録日で昇順ソートされている状態
 */
export const SortedByCreatedAtAsc: Story = {
  args: {
    partners: mockPartners,
    sortField: 'createdAt',
    sortOrder: 'asc',
  },
};

/**
 * 登録日でソート（降順）
 * 登録日で降順ソートされている状態
 */
export const SortedByCreatedAtDesc: Story = {
  args: {
    partners: mockPartners,
    sortField: 'createdAt',
    sortOrder: 'desc',
  },
};

/**
 * 1件のみ
 * 取引先が1件のみの場合
 */
export const SingleItem: Story = {
  args: {
    partners: [mockPartners[0]!],
  },
};

/**
 * 多数の取引先
 * 多数の取引先がある場合（スクロール確認用）
 */
export const ManyItems: Story = {
  args: {
    partners: [
      ...mockPartners,
      ...mockPartners.map((p, i) => ({
        ...p,
        id: `${Number(p.id) + 10 + i}`,
        name: `${p.name} ${i + 1}`,
      })),
      ...mockPartners.map((p, i) => ({
        ...p,
        id: `${Number(p.id) + 20 + i}`,
        name: `${p.name} ${i + 4}`,
      })),
    ],
  },
};
