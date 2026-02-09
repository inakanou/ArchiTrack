import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import AutocompleteInput from './AutocompleteInput';
import type { AutocompleteFieldName } from '../../hooks/useAutocompleteCandidateStore';

/**
 * AutocompleteInput コンポーネントのストーリー
 *
 * 入力時に過去の入力履歴から候補を表示し、
 * キーボード操作やクリックで選択できるオートコンプリート入力フィールド。
 *
 * Task 18.1: 新モード専用（getSuggestions/onBlurAddCandidate方式）
 */

// サンプル候補データ
const sampleSuggestions: Record<string, string[]> = {
  majorCategory: ['建築工事', '土木工事', '電気設備工事', '機械設備工事', '外構工事'],
  middleCategory: ['躯体工事', '仕上工事', '内装工事'],
  minorCategory: [],
  customCategory: [],
  workType: ['コンクリート工', '型枠工', '鉄筋工', '足場工'],
  specification: ['21-8-25', '24-8-25', 'H=10m'],
  unit: ['m2', 'm3', 'm', 'kg', '本', '箇所'],
};

// サンプルのgetSuggestions関数
const mockGetSuggestions = (field: AutocompleteFieldName, inputText: string): string[] => {
  const candidates = sampleSuggestions[field] || [];
  if (!inputText) return candidates;
  return candidates.filter((c) => c.includes(inputText));
};

const meta = {
  title: 'Components/QuantityTable/AutocompleteInput',
  component: AutocompleteInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
    field: 'majorCategory',
    getSuggestions: mockGetSuggestions,
    onBlurAddCandidate: fn(),
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
    field: 'workType',
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
    field: 'workType',
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
 * ラベルなし
 * コンパクト表示
 */
export const NoLabel: Story = {
  args: {
    value: '',
    placeholder: '入力してください',
  },
};
