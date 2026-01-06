import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import CalculationFields from './CalculationFields';

/**
 * CalculationFields コンポーネントのストーリー
 *
 * 計算方法に応じた入力フィールドを表示。
 * - 標準モード: メッセージのみ表示
 * - 面積・体積モード: 幅、奥行き、高さ、重量の4フィールド
 * - ピッチモード: 範囲長、端長1、端長2、ピッチ長、長さ、重量の6フィールド
 */

const meta = {
  title: 'Components/QuantityTable/CalculationFields',
  component: CalculationFields,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '600px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalculationFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 標準モード
 * 直接数量を入力するメッセージのみ表示
 */
export const Standard: Story = {
  args: {
    method: 'STANDARD',
    params: {},
  },
};

/**
 * 面積・体積モード（空）
 * 全フィールドが空の状態
 */
export const AreaVolumeEmpty: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {},
  },
};

/**
 * 面積・体積モード（値入力済み）
 * 幅、奥行き、高さに値が入力された状態
 */
export const AreaVolumeWithValues: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {
      width: 10.5,
      depth: 5.0,
      height: 3.0,
    },
  },
};

/**
 * 面積・体積モード（重量あり）
 * 重量も含めた入力
 */
export const AreaVolumeWithWeight: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {
      width: 10.5,
      depth: 5.0,
      height: 3.0,
      weight: 2.5,
    },
  },
};

/**
 * ピッチモード（空）
 * 全フィールドが空の状態
 */
export const PitchEmpty: Story = {
  args: {
    method: 'PITCH',
    params: {},
  },
};

/**
 * ピッチモード（必須項目のみ）
 * 範囲長、端長1、端長2、ピッチ長のみ入力
 */
export const PitchRequiredOnly: Story = {
  args: {
    method: 'PITCH',
    params: {
      rangeLength: 100.0,
      endLength1: 5.0,
      endLength2: 5.0,
      pitchLength: 10.0,
    },
  },
};

/**
 * ピッチモード（全項目入力）
 * 全フィールドに値が入力された状態
 */
export const PitchFull: Story = {
  args: {
    method: 'PITCH',
    params: {
      rangeLength: 100.0,
      endLength1: 5.0,
      endLength2: 5.0,
      pitchLength: 10.0,
      length: 2.0,
      weight: 1.5,
    },
  },
};

/**
 * 無効化状態
 * 全フィールドが編集不可
 */
export const Disabled: Story = {
  args: {
    method: 'AREA_VOLUME',
    params: {
      width: 10.5,
      depth: 5.0,
    },
    disabled: true,
  },
};
