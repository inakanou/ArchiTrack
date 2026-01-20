/**
 * @fileoverview 内訳書作成フォームのStorybookストーリー
 *
 * Task 5.1: 内訳書作成フォームコンポーネントの実装
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { CreateItemizedStatementForm } from './CreateItemizedStatementForm';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

// ============================================================================
// モックデータ
// ============================================================================

const mockQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-1',
    name: '第1回数量表',
    groupCount: 3,
    itemCount: 15,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-1',
    name: '第2回数量表',
    groupCount: 2,
    itemCount: 8,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
  {
    id: 'qt-3',
    projectId: 'project-1',
    name: '見積用数量表（詳細）',
    groupCount: 5,
    itemCount: 42,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
  },
];

const emptyQuantityTables: QuantityTableInfo[] = [];

const quantityTablesWithEmptyTable: QuantityTableInfo[] = [
  ...mockQuantityTables,
  {
    id: 'qt-empty',
    projectId: 'project-1',
    name: '空の数量表',
    groupCount: 0,
    itemCount: 0,
    createdAt: '2025-01-04T00:00:00.000Z',
    updatedAt: '2025-01-04T00:00:00.000Z',
  },
];

// ============================================================================
// メタデータ
// ============================================================================

const meta = {
  title: 'Components/ItemizedStatement/CreateItemizedStatementForm',
  component: CreateItemizedStatementForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
内訳書作成フォームコンポーネント。

## 機能
- 数量表選択ドロップダウン（1つのみ選択可能）
- 内訳書名入力（最大200文字）
- 選択した数量表の項目数表示
- バリデーションエラー表示
- ローディング状態の管理

## 要件
- Req 1.1: 新規作成ボタンでフォーム表示
- Req 1.2: 数量表選択時に項目数表示
- Req 1.4: 数量表未選択時エラー
- Req 1.5: 数量表は1つのみ選択可能
- Req 1.6: 内訳書名未入力時エラー
- Req 1.7: 内訳書名最大200文字
- Req 1.8: 数量表なしで作成ボタン無効化
- Req 1.9: 項目数0件でエラー
- Req 1.10: 同名重複でエラー
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    projectId: {
      description: 'プロジェクトID',
      control: 'text',
    },
    quantityTables: {
      description: '利用可能な数量表一覧',
      control: 'object',
    },
    onSuccess: {
      description: '作成成功時のコールバック',
    },
    onCancel: {
      description: 'キャンセル時のコールバック',
    },
  },
  args: {
    onSuccess: fn(),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '480px', padding: '24px', backgroundColor: '#f3f4f6' }}>
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#1f2937' }}>内訳書の作成</h2>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof CreateItemizedStatementForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// ストーリー
// ============================================================================

/**
 * デフォルト状態
 *
 * 数量表が複数ある場合の基本表示
 */
export const Default: Story = {
  args: {
    projectId: 'project-1',
    quantityTables: mockQuantityTables,
  },
};

/**
 * 数量表なし
 *
 * 数量表が存在しない場合、作成ボタンが無効化され、
 * 案内メッセージが表示される（Req 1.8）
 */
export const NoQuantityTables: Story = {
  args: {
    projectId: 'project-1',
    quantityTables: emptyQuantityTables,
  },
  parameters: {
    docs: {
      description: {
        story: '数量表が存在しない場合の表示。作成ボタンが無効化され、案内メッセージが表示される。',
      },
    },
  },
};

/**
 * 空の数量表を含む
 *
 * 項目数が0件の数量表を選択した場合のテスト用
 */
export const WithEmptyTable: Story = {
  args: {
    projectId: 'project-1',
    quantityTables: quantityTablesWithEmptyTable,
  },
  parameters: {
    docs: {
      description: {
        story:
          '項目数0件の数量表を含む一覧。選択して作成しようとするとエラーが表示される（Req 1.9）。',
      },
    },
  },
};

/**
 * ローディング状態
 *
 * 送信中はローディングインジケーターが表示され、
 * ボタンが無効化される（Req 12.1, 12.4）
 */
export const Loading: Story = {
  args: {
    projectId: 'project-1',
    quantityTables: mockQuantityTables,
    onSubmit: async () => {
      // 長時間待機してローディング状態を維持
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return {} as never;
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          '送信中のローディング状態。ボタンが無効化され、スピナーが表示される。フォームに値を入力して作成ボタンをクリックすると確認できる。',
      },
    },
  },
};

/**
 * 重複エラー
 *
 * 同名の内訳書が既に存在する場合のエラー表示（Req 1.10）
 */
export const DuplicateNameError: Story = {
  args: {
    projectId: 'project-1',
    quantityTables: mockQuantityTables,
    onSubmit: async () => {
      throw {
        status: 409,
        code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
        detail: '同名の内訳書が既に存在します',
      };
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          '同名の内訳書が存在する場合のエラー表示。フォームに値を入力して作成ボタンをクリックすると確認できる。',
      },
    },
  },
};

/**
 * オーバーフローエラー
 *
 * 数量の合計が許容範囲を超えた場合のエラー表示（Req 2.5）
 */
export const OverflowError: Story = {
  args: {
    projectId: 'project-1',
    quantityTables: mockQuantityTables,
    onSubmit: async () => {
      throw {
        status: 422,
        code: 'QUANTITY_OVERFLOW',
        detail: '数量の合計が許容範囲を超えています',
      };
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          '数量の合計が許容範囲を超えた場合のエラー表示。フォームに値を入力して作成ボタンをクリックすると確認できる。',
      },
    },
  },
};
