import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ToastNotification from './ToastNotification';
import type { Toast } from '../types/toast.types';

/**
 * ToastNotification コンポーネントのストーリー
 *
 * トースト通知コンポーネント。
 * - 4種類のトースト（success/error/warning/info）
 * - 自動非表示機能（デフォルト5秒）
 * - 4つの表示位置（top-right/top-left/bottom-right/bottom-left）
 * - WCAG 2.1 AA準拠のアクセシビリティ属性
 */
const meta = {
  title: 'Components/ToastNotification',
  component: ToastNotification,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onDismiss: fn(),
  },
} satisfies Meta<typeof ToastNotification>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * サンプルトーストデータ生成
 */
const createToast = (
  id: string,
  type: Toast['type'],
  message: string,
  options?: Partial<Toast>
): Toast => ({
  id,
  type,
  message,
  createdAt: Date.now(),
  ...options,
});

/**
 * 成功トースト
 * 操作が正常に完了した場合の表示
 */
export const Success: Story = {
  args: {
    toasts: [createToast('1', 'success', '操作が正常に完了しました！')],
  },
};

/**
 * エラートースト
 * エラーが発生した場合の表示
 */
export const Error: Story = {
  args: {
    toasts: [createToast('1', 'error', 'エラーが発生しました。再試行してください。')],
  },
};

/**
 * 警告トースト
 * 注意が必要な場合の表示
 */
export const Warning: Story = {
  args: {
    toasts: [createToast('1', 'warning', '注意: この操作は取り消せません。')],
  },
};

/**
 * 情報トースト
 * 情報を通知する場合の表示
 */
export const Info: Story = {
  args: {
    toasts: [createToast('1', 'info', '新しいアップデートが利用可能です。')],
  },
};

/**
 * 複数トースト
 * 複数のトーストが同時に表示される場合
 */
export const Multiple: Story = {
  args: {
    toasts: [
      createToast('1', 'success', '保存しました'),
      createToast('2', 'info', '3件の新着通知があります'),
      createToast('3', 'warning', 'セッションがまもなく期限切れになります'),
      createToast('4', 'error', 'ネットワーク接続に問題があります'),
    ],
  },
};

/**
 * 左上に表示
 * position: top-left の場合
 */
export const TopLeft: Story = {
  args: {
    toasts: [createToast('1', 'info', 'トーストは左上に表示されます')],
    position: 'top-left',
  },
};

/**
 * 右下に表示
 * position: bottom-right の場合
 */
export const BottomRight: Story = {
  args: {
    toasts: [createToast('1', 'info', 'トーストは右下に表示されます')],
    position: 'bottom-right',
  },
};

/**
 * 左下に表示
 * position: bottom-left の場合
 */
export const BottomLeft: Story = {
  args: {
    toasts: [createToast('1', 'info', 'トーストは左下に表示されます')],
    position: 'bottom-left',
  },
};

/**
 * 閉じるボタン無効
 * dismissible: false の場合
 */
export const NotDismissible: Story = {
  args: {
    toasts: [
      createToast('1', 'info', 'このトーストは手動で閉じられません', {
        dismissible: false,
      }),
    ],
  },
};

/**
 * 長いメッセージ
 * 長いメッセージの表示
 */
export const LongMessage: Story = {
  args: {
    toasts: [
      createToast(
        '1',
        'warning',
        'これは非常に長いメッセージです。トーストのレイアウトが適切に処理されるかどうかをテストしています。メッセージが長い場合でも、ユーザーが読みやすい形で表示される必要があります。'
      ),
    ],
  },
};

/**
 * 空の状態
 * トーストがない場合は何も表示されない
 */
export const Empty: Story = {
  args: {
    toasts: [],
  },
};

/**
 * カスタム表示時間
 * duration を指定した場合（ストーリーでは効果を確認できませんが、設定例として）
 */
export const CustomDuration: Story = {
  args: {
    toasts: [
      createToast('1', 'info', 'このトーストは10秒後に消えます', {
        duration: 10000,
      }),
    ],
  },
};

/**
 * 全タイプ表示
 * 4種類すべてのトーストタイプを同時に表示
 */
export const AllTypes: Story = {
  args: {
    toasts: [
      createToast('1', 'success', '成功メッセージ'),
      createToast('2', 'error', 'エラーメッセージ'),
      createToast('3', 'warning', '警告メッセージ'),
      createToast('4', 'info', '情報メッセージ'),
    ],
  },
};
