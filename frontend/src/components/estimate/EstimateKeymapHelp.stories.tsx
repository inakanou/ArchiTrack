/**
 * @fileoverview EstimateKeymapHelpコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { EstimateKeymapHelp } from './EstimateKeymapHelp';

const meta = {
  title: 'Estimate/EstimateKeymapHelp',
  component: EstimateKeymapHelp,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'キー割当一覧（47.3）。入口のボタンと一覧本体をひとまとめに持ち、一覧の内容は `ESTIMATE_KEYMAP.entries` から生成するためProps を持たない。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EstimateKeymapHelp>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 閉じた状態（入口のボタンのみ）
 */
export const Closed: Story = {};

/**
 * 一覧を開いた状態
 * キー・操作・使える場面の3列で割当を一覧表示する
 */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = canvasElement as HTMLElement;
    const trigger = canvas.querySelector<HTMLButtonElement>('[data-testid="open-keymap-help"]');
    trigger?.click();
  },
};
