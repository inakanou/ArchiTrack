import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ConflictDialog from './ConflictDialog';

/**
 * ConflictDialog コンポーネントのストーリー
 *
 * 楽観的排他制御の競合ダイアログ。
 * 同時編集による競合が検出された場合に表示されるモーダルダイアログで、
 * ユーザーに競合の発生を通知し、再読み込みを促します。
 */
const meta = {
  title: 'Common/ConflictDialog',
  component: ConflictDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '楽観的排他制御の競合ダイアログ。同時編集による競合が検出された場合に表示され、ユーザーにデータの再読み込みを促します。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onReload: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ConflictDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * ダイアログが開いている初期状態
 */
export const Default: Story = {
  args: {
    isOpen: true,
    resourceName: '現場調査',
  },
};

/**
 * 閉じた状態
 * ダイアログが閉じている状態（何も表示されない）
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    resourceName: '現場調査',
  },
};

/**
 * プロジェクトリソースの競合
 * プロジェクトデータの競合が発生した場合
 */
export const ProjectConflict: Story = {
  args: {
    isOpen: true,
    resourceName: 'プロジェクト',
  },
};

/**
 * 取引先リソースの競合
 * 取引先データの競合が発生した場合
 */
export const TradingPartnerConflict: Story = {
  args: {
    isOpen: true,
    resourceName: '取引先',
  },
};

/**
 * 再読み込み中状態
 * 再読み込みボタンがクリックされ、処理中の状態
 */
export const Reloading: Story = {
  args: {
    isOpen: true,
    resourceName: '現場調査',
    isReloading: true,
  },
};

/**
 * ユーザー情報の競合
 * ユーザー情報データの競合が発生した場合
 */
export const UserConflict: Story = {
  args: {
    isOpen: true,
    resourceName: 'ユーザー情報',
  },
};
