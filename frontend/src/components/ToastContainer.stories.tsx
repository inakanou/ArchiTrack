import type { Meta, StoryObj } from '@storybook/react';
import { ToastProvider } from './ToastProvider';
import ToastContainer from './ToastContainer';
import { useToast } from '../hooks/useToast';

/**
 * ToastContainer コンポーネントのストーリー
 *
 * ToastProviderと連携してトースト通知を表示するコンテナコンポーネント。
 * ToastContextからトーストリストを取得し、ToastNotificationコンポーネントに渡します。
 *
 * 注意: ToastContainerはToastProvider配下でのみ使用可能です。
 */
const meta = {
  title: 'Components/ToastContainer',
  component: ToastContainer,
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ToastContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * トースト追加ボタン付きデモ
 */
const ToastDemo = () => {
  const { addToast } = useToast();

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>トースト通知デモ</h2>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() =>
            addToast({
              type: 'success',
              message: '操作が正常に完了しました！',
            })
          }
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          成功トースト
        </button>
        <button
          type="button"
          onClick={() =>
            addToast({
              type: 'error',
              message: 'エラーが発生しました。再試行してください。',
            })
          }
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          エラートースト
        </button>
        <button
          type="button"
          onClick={() =>
            addToast({
              type: 'warning',
              message: '注意: この操作は取り消せません。',
            })
          }
          style={{
            padding: '10px 20px',
            backgroundColor: '#ffc107',
            color: '#212529',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          警告トースト
        </button>
        <button
          type="button"
          onClick={() =>
            addToast({
              type: 'info',
              message: '新しいアップデートが利用可能です。',
            })
          }
          style={{
            padding: '10px 20px',
            backgroundColor: '#17a2b8',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          情報トースト
        </button>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button
          type="button"
          onClick={() =>
            addToast({
              type: 'info',
              message: 'このトーストは10秒後に消えます。',
              duration: 10000,
            })
          }
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '8px',
          }}
        >
          長い表示時間（10秒）
        </button>
        <button
          type="button"
          onClick={() =>
            addToast({
              type: 'info',
              message: 'このトーストは自動で消えません。手動で閉じてください。',
              dismissible: true,
              duration: 999999999,
            })
          }
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          手動で閉じる
        </button>
      </div>

      <ToastContainer />
    </div>
  );
};

/**
 * デフォルト状態
 * ボタンをクリックしてトーストを表示
 */
export const Default: Story = {
  render: () => <ToastDemo />,
};

/**
 * 複数トースト表示
 */
const MultipleToastsDemo = () => {
  const { addToast } = useToast();

  const showMultipleToasts = () => {
    addToast({ type: 'success', message: '1つ目のトースト' });
    setTimeout(() => {
      addToast({ type: 'info', message: '2つ目のトースト' });
    }, 300);
    setTimeout(() => {
      addToast({ type: 'warning', message: '3つ目のトースト' });
    }, 600);
    setTimeout(() => {
      addToast({ type: 'error', message: '4つ目のトースト' });
    }, 900);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>複数トースト表示デモ</h2>
      <button
        type="button"
        onClick={showMultipleToasts}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        4つのトーストを表示
      </button>
      <ToastContainer />
    </div>
  );
};

export const MultipleToasts: Story = {
  render: () => <MultipleToastsDemo />,
};
