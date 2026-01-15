/**
 * @fileoverview TextFieldInput コンポーネントのStorybook ストーリー
 *
 * Task 12.1: テキストフィールド入力制御コンポーネントを実装する
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import TextFieldInput from './TextFieldInput';

const meta: Meta<typeof TextFieldInput> = {
  title: 'QuantityTable/TextFieldInput',
  component: TextFieldInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'テキストフィールド入力コンポーネント。入力中にリアルタイムで文字数をチェックし、最大文字数に近づくと視覚的フィードバックを表示。',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    fieldName: {
      control: 'select',
      options: [
        'majorCategory',
        'middleCategory',
        'minorCategory',
        'customCategory',
        'workType',
        'name',
        'specification',
        'unit',
        'calculationMethod',
        'remarks',
      ],
      description: 'フィールドタイプ（文字数制限を決定）',
    },
    showCharacterCount: {
      control: 'boolean',
      description: '残り文字数表示の有無',
    },
    required: {
      control: 'boolean',
      description: '必須フィールドマーク',
    },
    disabled: {
      control: 'boolean',
      description: '無効化状態',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TextFieldInput>;

// インタラクティブなストーリー用ラッパー
function TextFieldInputWrapper({
  fieldName,
  label,
  ...props
}: Omit<React.ComponentProps<typeof TextFieldInput>, 'value' | 'onChange'>) {
  const [value, setValue] = useState('');
  return (
    <TextFieldInput
      value={value}
      onChange={setValue}
      fieldName={fieldName}
      label={label}
      {...props}
    />
  );
}

/**
 * デフォルト状態
 */
export const Default: Story = {
  render: () => (
    <TextFieldInputWrapper
      fieldName="majorCategory"
      label="大項目"
      placeholder="入力してください"
      showCharacterCount
    />
  ),
};

/**
 * 文字数制限の異なるフィールド
 */
export const DifferentFieldTypes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '300px' }}>
      <TextFieldInputWrapper
        fieldName="majorCategory"
        label="大項目"
        placeholder="全角25/半角50文字"
        showCharacterCount
      />
      <TextFieldInputWrapper
        fieldName="workType"
        label="工種"
        placeholder="全角8/半角16文字"
        showCharacterCount
      />
      <TextFieldInputWrapper
        fieldName="unit"
        label="単位"
        placeholder="全角3/半角6文字"
        showCharacterCount
      />
    </div>
  ),
};

/**
 * 文字数カウントの状態変化
 */
export const CharacterCountStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '300px' }}>
      <TextFieldInput
        value=""
        onChange={() => {}}
        fieldName="majorCategory"
        label="空（残り50）"
        showCharacterCount
      />
      <TextFieldInput
        value={'a'.repeat(40)}
        onChange={() => {}}
        fieldName="majorCategory"
        label="通常（残り10）"
        showCharacterCount
      />
      <TextFieldInput
        value={'a'.repeat(44)}
        onChange={() => {}}
        fieldName="majorCategory"
        label="警告（残り6）"
        showCharacterCount
      />
      <TextFieldInput
        value={'a'.repeat(50)}
        onChange={() => {}}
        fieldName="majorCategory"
        label="最大（残り0）"
        showCharacterCount
      />
      <TextFieldInput
        value={'a'.repeat(54)}
        onChange={() => {}}
        fieldName="majorCategory"
        label="超過（-4超過）"
        showCharacterCount
        error="大項目は全角25文字/半角50文字以内で入力してください"
      />
    </div>
  ),
};

/**
 * 全角・半角の混在
 */
export const MixedCharacters: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '300px' }}>
      <TextFieldInput
        value="共通仮設"
        onChange={() => {}}
        fieldName="majorCategory"
        label="全角のみ（幅8）"
        showCharacterCount
      />
      <TextFieldInput
        value="abc123"
        onChange={() => {}}
        fieldName="majorCategory"
        label="半角のみ（幅6）"
        showCharacterCount
      />
      <TextFieldInput
        value="足場100m2"
        onChange={() => {}}
        fieldName="majorCategory"
        label="混在（幅12）"
        showCharacterCount
      />
    </div>
  ),
};

/**
 * 必須フィールド
 */
export const Required: Story = {
  render: () => (
    <TextFieldInputWrapper
      fieldName="name"
      label="名称"
      required
      placeholder="必須項目です"
      showCharacterCount
    />
  ),
};

/**
 * 無効化状態
 */
export const Disabled: Story = {
  render: () => (
    <TextFieldInput
      value="編集不可"
      onChange={() => {}}
      fieldName="majorCategory"
      label="大項目"
      disabled
      showCharacterCount
    />
  ),
};

/**
 * エラー状態
 */
export const WithError: Story = {
  render: () => (
    <TextFieldInput
      value={'a'.repeat(54)}
      onChange={() => {}}
      fieldName="majorCategory"
      label="大項目"
      showCharacterCount
      error="大項目は全角25文字/半角50文字以内で入力してください"
    />
  ),
};

/**
 * 文字数カウント非表示
 */
export const WithoutCharacterCount: Story = {
  render: () => (
    <TextFieldInputWrapper
      fieldName="majorCategory"
      label="大項目"
      placeholder="文字数カウントなし"
    />
  ),
};

/**
 * 単位フィールド（短い制限）
 */
export const UnitField: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '150px' }}>
      <TextFieldInput
        value=""
        onChange={() => {}}
        fieldName="unit"
        label="単位"
        placeholder="m2"
        showCharacterCount
      />
      <TextFieldInput
        value="m2"
        onChange={() => {}}
        fieldName="unit"
        label="単位（入力済み）"
        showCharacterCount
      />
      <TextFieldInput
        value="pieces"
        onChange={() => {}}
        fieldName="unit"
        label="単位（最大）"
        showCharacterCount
      />
    </div>
  ),
};

/**
 * 複数フィールドのフォーム例
 */
export const FormExample: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        maxWidth: '600px',
      }}
    >
      <TextFieldInputWrapper fieldName="majorCategory" label="大項目" showCharacterCount />
      <TextFieldInputWrapper fieldName="middleCategory" label="中項目" showCharacterCount />
      <TextFieldInputWrapper fieldName="minorCategory" label="小項目" showCharacterCount />
      <TextFieldInputWrapper fieldName="workType" label="工種" required showCharacterCount />
      <TextFieldInputWrapper fieldName="name" label="名称" required showCharacterCount />
      <TextFieldInputWrapper fieldName="specification" label="規格" showCharacterCount />
      <TextFieldInputWrapper fieldName="unit" label="単位" required showCharacterCount />
      <div style={{ gridColumn: 'span 2' }}>
        <TextFieldInputWrapper fieldName="remarks" label="備考" showCharacterCount />
      </div>
    </div>
  ),
};
