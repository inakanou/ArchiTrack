import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import DimensionValueInput from './DimensionValueInput';

/**
 * DimensionValueInput コンポーネントのストーリー
 *
 * 寸法線描画後に表示される寸法値入力ポップアップ。
 * 寸法値と単位（mm/cm/m）を入力可能。
 */
const meta = {
  title: 'SiteSurveys/Tools/DimensionValueInput',
  component: DimensionValueInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onConfirm: fn(),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '400px', height: '300px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DimensionValueInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 初期値なしの状態
 */
export const Default: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '',
    initialUnit: 'mm',
  },
};

/**
 * 初期値あり（mm）
 * ミリメートル単位で初期値が設定
 */
export const WithInitialValueMm: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '1500',
    initialUnit: 'mm',
  },
};

/**
 * 初期値あり（cm）
 * センチメートル単位で初期値が設定
 */
export const WithInitialValueCm: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '150',
    initialUnit: 'cm',
  },
};

/**
 * 初期値あり（m）
 * メートル単位で初期値が設定
 */
export const WithInitialValueM: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '1.5',
    initialUnit: 'm',
  },
};

/**
 * 小数値
 * 小数点を含む値
 */
export const DecimalValue: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '123.45',
    initialUnit: 'cm',
  },
};

/**
 * 大きな値
 * 大きな数値
 */
export const LargeValue: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '12500',
    initialUnit: 'mm',
  },
};

/**
 * 小さな値
 * 小さな数値
 */
export const SmallValue: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '0.5',
    initialUnit: 'm',
  },
};

/**
 * 右寄せ表示
 * 右側に表示される位置
 */
export const RightPosition: Story = {
  args: {
    position: { x: 200, y: 50 },
    initialValue: '100',
    initialUnit: 'mm',
  },
};

/**
 * 下部表示
 * 下部に表示される位置
 */
export const BottomPosition: Story = {
  args: {
    position: { x: 50, y: 150 },
    initialValue: '200',
    initialUnit: 'cm',
  },
};

/**
 * ゼロ値
 * 値が0の場合
 */
export const ZeroValue: Story = {
  args: {
    position: { x: 50, y: 50 },
    initialValue: '0',
    initialUnit: 'mm',
  },
};
