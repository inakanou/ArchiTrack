/**
 * @fileoverview FieldValidationTooltip コンポーネントのStorybook ストーリー
 *
 * 入力フィールド内の右端に警告アイコンを重ね、ホバー時にメッセージを
 * 吹き出しで表示するコンポーネント。position: absolute オーバーレイのため、
 * position: relative の入力ラッパー内に配置して確認する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import FieldValidationTooltip from './FieldValidationTooltip';

const meta: Meta<typeof FieldValidationTooltip> = {
  title: 'QuantityTable/FieldValidationTooltip',
  component: FieldValidationTooltip,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'フィールドバリデーション吹き出し。入力フィールド右端に警告アイコンを重ね、ホバー時にメッセージを吹き出し表示する。メッセージを通常フローに挿入しないためレイアウト崩れを防ぐ。',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    message: {
      control: 'text',
      description: '表示するメッセージ',
    },
    severity: {
      control: 'select',
      options: ['error', 'warning'],
      description: '重要度（色の出し分け）',
    },
    id: {
      control: 'text',
      description: 'スクリーンリーダー用 alert 要素の id',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FieldValidationTooltip>;

// 入力フィールドを模した relative ラッパー（アイコン分の右パディングを確保）
function FieldWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', maxWidth: '240px' }}>
      <input
        type="text"
        aria-label="サンプル入力"
        defaultValue="入力値"
        style={{
          width: '100%',
          padding: '6px 24px 6px 8px',
          boxSizing: 'border-box',
          border: '1px solid #dc2626',
          borderRadius: '4px',
        }}
      />
      {children}
    </div>
  );
}

/**
 * デフォルト（error）
 */
export const Default: Story = {
  render: () => (
    <FieldWrapper>
      <FieldValidationTooltip message="必須項目です" />
    </FieldWrapper>
  ),
};

/**
 * 警告（warning）
 */
export const Warning: Story = {
  render: () => (
    <FieldWrapper>
      <FieldValidationTooltip message="入力値を確認してください" severity="warning" />
    </FieldWrapper>
  ),
};

/**
 * 長いメッセージ
 */
export const LongMessage: Story = {
  render: () => (
    <FieldWrapper>
      <FieldValidationTooltip message="大項目は全角25文字/半角50文字以内で入力してください" />
    </FieldWrapper>
  ),
};

/**
 * スクリーンリーダー用 alert 要素付き（id 指定）
 */
export const WithAlertId: Story = {
  render: () => (
    <FieldWrapper>
      <FieldValidationTooltip message="必須項目です" id="field-error-example" />
    </FieldWrapper>
  ),
};

/**
 * error / warning の比較
 */
export const SeverityComparison: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <FieldWrapper>
        <FieldValidationTooltip message="エラー: 必須項目です" severity="error" />
      </FieldWrapper>
      <FieldWrapper>
        <FieldValidationTooltip message="警告: 値を確認してください" severity="warning" />
      </FieldWrapper>
    </div>
  ),
};
