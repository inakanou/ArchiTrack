import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import { ResourceNotFound } from './ResourceNotFound';

const meta: Meta<typeof ResourceNotFound> = {
  title: 'Common/ResourceNotFound',
  component: ResourceNotFound,
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
          'リソース未検出コンポーネント。リソースが見つからない場合に統一されたエラー表示を提供する。他の機能でも再利用可能な汎用コンポーネント。',
      },
    },
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ResourceNotFound>;

/**
 * 取引先が見つからない場合
 */
export const TradingPartnerNotFound: Story = {
  args: {
    resourceType: '取引先',
    returnPath: '/trading-partners',
    returnLabel: '取引先一覧に戻る',
  },
};

/**
 * プロジェクトが見つからない場合
 */
export const ProjectNotFound: Story = {
  args: {
    resourceType: 'プロジェクト',
    returnPath: '/projects',
    returnLabel: 'プロジェクト一覧に戻る',
  },
};

/**
 * ユーザーが見つからない場合
 */
export const UserNotFound: Story = {
  args: {
    resourceType: 'ユーザー',
    returnPath: '/users',
    returnLabel: 'ユーザー一覧に戻る',
  },
};

/**
 * カスタムリソースタイプの場合
 */
export const CustomResource: Story = {
  args: {
    resourceType: '契約書',
    returnPath: '/contracts',
    returnLabel: '契約書一覧に戻る',
  },
};
