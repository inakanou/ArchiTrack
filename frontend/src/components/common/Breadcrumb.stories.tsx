import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb';

const meta: Meta<typeof Breadcrumb> = {
  title: 'Common/Breadcrumb',
  component: Breadcrumb,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'パンくずナビゲーションコンポーネント。階層構造を示し、ユーザーが現在位置を把握できるようにする。WAI-ARIA準拠のアクセシビリティ対応済み。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Breadcrumb>;

/**
 * 取引先一覧ページのパンくずナビゲーション
 */
export const TradingPartnerList: Story = {
  args: {
    items: [{ label: 'ダッシュボード', path: '/' }, { label: '取引先' }],
  },
};

/**
 * 取引先詳細ページのパンくずナビゲーション
 */
export const TradingPartnerDetail: Story = {
  args: {
    items: [
      { label: 'ダッシュボード', path: '/' },
      { label: '取引先', path: '/trading-partners' },
      { label: '株式会社サンプル' },
    ],
  },
};

/**
 * 取引先新規作成ページのパンくずナビゲーション
 */
export const TradingPartnerCreate: Story = {
  args: {
    items: [
      { label: 'ダッシュボード', path: '/' },
      { label: '取引先', path: '/trading-partners' },
      { label: '新規作成' },
    ],
  },
};

/**
 * 取引先編集ページのパンくずナビゲーション
 */
export const TradingPartnerEdit: Story = {
  args: {
    items: [
      { label: 'ダッシュボード', path: '/' },
      { label: '取引先', path: '/trading-partners' },
      { label: '株式会社サンプル', path: '/trading-partners/123' },
      { label: '編集' },
    ],
  },
};

/**
 * 単一項目のパンくずナビゲーション（ホームページなど）
 */
export const SingleItem: Story = {
  args: {
    items: [{ label: 'ダッシュボード' }],
  },
};

/**
 * 長い階層のパンくずナビゲーション
 */
export const DeepHierarchy: Story = {
  args: {
    items: [
      { label: 'ダッシュボード', path: '/' },
      { label: '取引先', path: '/trading-partners' },
      { label: '株式会社サンプル', path: '/trading-partners/123' },
      { label: '契約', path: '/trading-partners/123/contracts' },
      { label: '契約書詳細' },
    ],
  },
};
