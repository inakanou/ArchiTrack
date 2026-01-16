import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AutocompleteInput from './AutocompleteInput';

/**
 * AutocompleteInput コンポーネントのストーリー
 *
 * 入力時に過去の入力履歴から候補を表示し、
 * キーボード操作やクリックで選択できるオートコンプリート入力フィールド。
 */

const meta = {
  title: 'Components/QuantityTable/AutocompleteInput',
  component: AutocompleteInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    endpoint: '/api/autocomplete/major-categories',
  },
  decorators: [
    (Story) => (
      <div style={{ width: '300px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AutocompleteInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 空の状態
 */
export const Default: Story = {
  args: {
    value: '',
    label: '大項目',
    placeholder: '大項目を入力',
  },
};

/**
 * 値が入力された状態
 */
export const WithValue: Story = {
  args: {
    value: '建築工事',
    label: '大項目',
    placeholder: '大項目を入力',
  },
};

/**
 * 必須フィールド
 * ラベルに必須マークを表示
 */
export const Required: Story = {
  args: {
    value: '',
    label: '工種',
    placeholder: '工種を入力',
    required: true,
  },
};

/**
 * エラー状態
 * バリデーションエラーを表示
 */
export const Error: Story = {
  args: {
    value: '',
    label: '工種',
    placeholder: '工種を入力',
    required: true,
    error: '工種は必須です',
  },
};

/**
 * 無効化状態
 * 編集不可
 */
export const Disabled: Story = {
  args: {
    value: '建築工事',
    label: '大項目',
    placeholder: '大項目を入力',
    disabled: true,
  },
};

/**
 * オートコンプリート無効
 * 候補表示なしの通常入力
 */
export const AutocompleteDisabled: Story = {
  args: {
    value: '',
    label: '大項目',
    placeholder: '大項目を入力',
    autocompleteEnabled: false,
  },
};

/**
 * ラベルなし
 * コンパクト表示
 */
export const NoLabel: Story = {
  args: {
    value: '',
    placeholder: '入力してください',
  },
};

/**
 * 未保存値あり
 * 画面上で入力された未保存の値を候補に含める
 */
export const WithUnsavedValues: Story = {
  args: {
    value: '',
    label: '大項目',
    placeholder: '大項目を入力',
    unsavedValues: ['外構工事', '内装工事', '電気設備'],
  },
};
