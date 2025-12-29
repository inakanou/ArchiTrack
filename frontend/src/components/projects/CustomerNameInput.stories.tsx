import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import CustomerNameInput from './CustomerNameInput';

/**
 * CustomerNameInput コンポーネントのストーリー
 *
 * 顧客名入力フィールド。取引先オートコンプリート機能をサポート。
 * 1-255文字のバリデーションとアクセシビリティ対応。
 */
const meta = {
  title: 'Components/Projects/CustomerNameInput',
  component: CustomerNameInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    value: '',
    onChange: fn(),
    onBlur: fn(),
  },
} satisfies Meta<typeof CustomerNameInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 基本的な顧客名入力フィールド
 */
export const Default: Story = {
  args: {
    value: '',
    placeholder: '顧客名を入力してください',
  },
};

/**
 * 必須フィールド
 * 必須マーク付きの入力フィールド
 */
export const Required: Story = {
  args: {
    value: '',
    required: true,
    placeholder: '顧客名を入力してください（必須）',
  },
};

/**
 * 値が入力された状態
 * 顧客名が入力されている状態
 */
export const WithValue: Story = {
  args: {
    value: '株式会社テスト',
    required: true,
  },
};

/**
 * エラー状態
 * バリデーションエラーが発生した状態
 */
export const WithError: Story = {
  args: {
    value: '',
    required: true,
    error: '顧客名は必須です',
  },
};

/**
 * 文字数超過エラー
 * 255文字を超えた場合のエラー表示
 */
export const MaxLengthError: Story = {
  args: {
    value: 'あ'.repeat(256),
    error: '顧客名は255文字以内で入力してください',
  },
};

/**
 * 無効化状態
 * 入力が無効化された状態
 */
export const Disabled: Story = {
  args: {
    value: '株式会社テスト',
    disabled: true,
  },
};

/**
 * カスタムラベル
 * ラベルをカスタマイズした状態
 */
export const CustomLabel: Story = {
  args: {
    value: '',
    label: '発注元会社名',
    placeholder: '発注元会社名を入力してください',
  },
};

/**
 * オートコンプリート有効
 * 取引先オートコンプリート機能が有効な状態
 */
export const WithAutocomplete: Story = {
  args: {
    value: '',
    enableAutocomplete: true,
    placeholder: '取引先名を入力して検索',
    onSuggestionSelect: fn(),
  },
};
