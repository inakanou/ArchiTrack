import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import ProjectForm from './ProjectForm';

/**
 * ProjectForm コンポーネントのストーリー
 *
 * プロジェクト作成・編集フォーム。
 * 取引先選択、担当者選択、バリデーションをサポート。
 */
const meta = {
  title: 'Components/Projects/ProjectForm',
  component: ProjectForm,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: '600px', padding: '24px' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: false,
  },
} satisfies Meta<typeof ProjectForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 新規作成モード
 * 空のフォームで新規プロジェクト作成
 */
export const CreateMode: Story = {
  args: {
    mode: 'create',
  },
};

/**
 * 編集モード
 * 既存データを編集するフォーム
 */
export const EditMode: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: 'サンプルプロジェクト',
      tradingPartnerId: 'partner-123',
      salesPersonId: 'user-456',
      constructionPersonId: 'user-789',
      siteAddress: '東京都渋谷区渋谷1-1-1',
      description: 'これはサンプルプロジェクトの説明です。',
    },
  },
};

/**
 * 送信中状態
 * フォーム送信処理中でボタンが無効化
 */
export const Submitting: Story = {
  args: {
    mode: 'create',
    isSubmitting: true,
  },
};

/**
 * 編集モードで送信中
 * 保存処理中の状態
 */
export const EditModeSubmitting: Story = {
  args: {
    mode: 'edit',
    isSubmitting: true,
    initialData: {
      name: 'サンプルプロジェクト',
      salesPersonId: 'user-456',
    },
  },
};

/**
 * プロジェクト名重複エラー
 * サーバーから409エラーが返された状態
 */
export const DuplicateNameError: Story = {
  args: {
    mode: 'create',
    submitError: {
      status: 409,
      message: 'Project name already exists',
      errorCode: 'PROJECT_NAME_DUPLICATE',
    },
  },
};

/**
 * 初期データ（名前のみ）
 * 最小限の初期データでの編集モード
 */
export const EditModeMinimalData: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: 'シンプルプロジェクト',
      salesPersonId: 'user-123',
    },
  },
};

/**
 * 初期データ（完全）
 * すべてのフィールドが入力された状態
 */
export const EditModeFullData: Story = {
  args: {
    mode: 'edit',
    initialData: {
      name: '完全なプロジェクト',
      tradingPartnerId: 'partner-001',
      salesPersonId: 'user-001',
      constructionPersonId: 'user-002',
      siteAddress: '大阪府大阪市北区梅田1-1-1 グランフロント大阪',
      description:
        'これは完全に入力されたプロジェクトの説明です。\n複数行にわたる説明文もサポートしています。\n現場調査から施工完了まで一貫して管理します。',
    },
  },
};
