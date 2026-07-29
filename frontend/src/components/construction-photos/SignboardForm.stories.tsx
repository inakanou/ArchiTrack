/**
 * @fileoverview SignboardForm のストーリー
 *
 * 工事看板の作成・編集フォーム。
 * 標準項目（工事件名・工事場所）＋自由項目行＋記入欄テキストを入力する。
 * 新規作成・編集（初期値あり）・送信中の各状態を確認する。
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { SignboardForm } from './SignboardForm';
import type { ConstructionSignboard } from '../../types/construction-photo.types';

const sampleSignboard: ConstructionSignboard = {
  id: 'signboard-1',
  projectId: 'project-1',
  workName: '〇〇ビル新築工事',
  workLocation: '東京都千代田区〇〇1-2-3',
  freeItems: [
    { label: '施工者', value: '〇〇建設株式会社' },
    { label: '工期', value: '2026年4月～2026年12月' },
  ],
  footerText: '安全第一で作業を行うこと。',
  inUseCount: 3,
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
};

const meta = {
  title: 'ConstructionPhotos/SignboardForm',
  component: SignboardForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SignboardForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 新規作成状態
 * 初期値なしの空フォーム
 */
export const Create: Story = {
  args: {
    submitLabel: '登録',
  },
};

/**
 * 編集状態
 * 既存看板の値を初期表示した状態
 */
export const Edit: Story = {
  args: {
    initialValue: sampleSignboard,
    submitLabel: '更新',
  },
};

/**
 * 送信中状態
 * 二重送信防止のため入力・ボタンが非活性
 */
export const Submitting: Story = {
  args: {
    initialValue: sampleSignboard,
    submitLabel: '更新',
    isSubmitting: true,
  },
};
