import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { RestoreAnnotationDialog } from './RestoreAnnotationDialog';

/**
 * RestoreAnnotationDialog コンポーネントのストーリー
 *
 * ページリロード時にlocalStorageに未保存の注釈データがある場合に表示されるダイアログ。
 * ユーザーはローカルデータの復元、破棄、または後で決定を選択できる。
 */
const meta = {
  title: 'SiteSurvey/RestoreAnnotationDialog',
  component: RestoreAnnotationDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onRestore: fn(),
    onDiscard: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof RestoreAnnotationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（非表示）
 * isOpenがfalseの場合、ダイアログは表示されない
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    localSavedAt: '2025-12-28 10:30:00',
    serverUpdatedAt: '2025-12-28 09:00:00',
    isLocalNewer: true,
    hasServerConflict: false,
    localObjectCount: 5,
    serverObjectCount: 3,
  },
};

/**
 * ローカルデータが新しい状態
 * ローカルに保存されたデータがサーバーより新しい場合
 */
export const LocalNewer: Story = {
  args: {
    isOpen: true,
    localSavedAt: '2025-12-28 10:30:00',
    serverUpdatedAt: '2025-12-28 09:00:00',
    isLocalNewer: true,
    hasServerConflict: false,
    localObjectCount: 5,
    serverObjectCount: 3,
  },
};

/**
 * サーバーデータが新しい状態
 * サーバーのデータがローカルより新しい場合
 */
export const ServerNewer: Story = {
  args: {
    isOpen: true,
    localSavedAt: '2025-12-28 08:00:00',
    serverUpdatedAt: '2025-12-28 10:00:00',
    isLocalNewer: false,
    hasServerConflict: false,
    localObjectCount: 3,
    serverObjectCount: 5,
  },
};

/**
 * 競合警告表示
 * サーバー側で競合が発生している場合の警告表示
 */
export const WithConflict: Story = {
  args: {
    isOpen: true,
    localSavedAt: '2025-12-28 10:30:00',
    serverUpdatedAt: '2025-12-28 10:15:00',
    isLocalNewer: true,
    hasServerConflict: true,
    localObjectCount: 8,
    serverObjectCount: 6,
  },
};

/**
 * 新規データ（サーバーにデータなし）
 * サーバーにまだデータがない場合
 */
export const NoServerData: Story = {
  args: {
    isOpen: true,
    localSavedAt: '2025-12-28 10:30:00',
    serverUpdatedAt: null,
    isLocalNewer: true,
    hasServerConflict: false,
    localObjectCount: 3,
    serverObjectCount: 0,
  },
};

/**
 * 不明な保存時刻
 * ローカル保存時刻が不明な場合
 */
export const UnknownLocalTime: Story = {
  args: {
    isOpen: true,
    localSavedAt: null,
    serverUpdatedAt: '2025-12-28 09:00:00',
    isLocalNewer: false,
    hasServerConflict: false,
    localObjectCount: 2,
    serverObjectCount: 4,
  },
};
