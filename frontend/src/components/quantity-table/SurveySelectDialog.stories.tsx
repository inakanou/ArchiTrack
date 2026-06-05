/**
 * @fileoverview SurveySelectDialogコンポーネントのStorybook
 *
 * Task 57.2: 現場調査選択ダイアログ
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SurveySelectDialog from './SurveySelectDialog';

const meta = {
  title: 'Components/QuantityTable/SurveySelectDialog',
  component: SurveySelectDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '現場調査選択ダイアログ。当該プロジェクトの現場調査一覧（名前・写真件数）から1件を選択し、実行を確定すると現場調査IDをコールバックで通知する。生成中はボタンを disabled にしインジケーターを表示して重複実行を防止する。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof SurveySelectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleSurveys = [
  { id: 'survey-1', name: '北棟外壁 現場調査', photoCount: 12 },
  { id: 'survey-2', name: '南棟基礎 現場調査', photoCount: 5 },
  { id: 'survey-3', name: '屋上防水 現場調査', photoCount: 0 },
];

/**
 * 通常表示（現場調査一覧・写真件数付き）
 */
export const Default: Story = {
  args: {
    isOpen: true,
    siteSurveys: sampleSurveys,
    isCreating: false,
  },
};

/**
 * 生成中（ボタン disabled・インジケーター表示・重複実行防止）
 */
export const Creating: Story = {
  args: {
    isOpen: true,
    siteSurveys: sampleSurveys,
    isCreating: true,
  },
};

/**
 * 空一覧（選択可能な現場調査がない）
 */
export const Empty: Story = {
  args: {
    isOpen: true,
    siteSurveys: [],
    isCreating: false,
  },
};

/**
 * 多数の現場調査（スクロール確認）
 */
export const ManySurveys: Story = {
  args: {
    isOpen: true,
    siteSurveys: Array.from({ length: 20 }, (_, i) => ({
      id: `survey-${i + 1}`,
      name: `現場調査 ${i + 1}`,
      photoCount: (i * 3) % 25,
    })),
    isCreating: false,
  },
};

/**
 * 閉じた状態（非表示）
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    siteSurveys: sampleSurveys,
    isCreating: false,
  },
};
