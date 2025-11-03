import type { Meta, StoryObj } from '@storybook/react';
import ErrorBoundary from './ErrorBoundary';

/**
 * 意図的にエラーを発生させるコンポーネント
 * これはストーリーのデモンストレーション用です
 */
const IntentionalError: React.FC = () => {
  // このコンポーネントがレンダリングされるとき、エラーを発生させる
  throw new Error(
    'デモンストレーション用の意図的なエラー: コンポーネントレンダリング中に何か問題が発生しました。'
  );
};

/**
 * ErrorBoundary コンポーネントのストーリー
 *
 * Reactエラーバウンダリで、コンポーネントツリー内のJavaScriptエラーをキャッチし、
 * エラーログを記録してフォールバックUIを表示します。
 */
const meta = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 正常に動作するコンポーネント
 * エラーが発生していない場合、通常のコンテンツが表示されます
 */
export const Healthy: Story = {
  args: {
    children: (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>健全なコンテンツ</h2>
        <p>エラーバウンダリに保護されたコンポーネントが正常に動作しています。</p>
      </div>
    ),
  },
};

/**
 * エラー状態を表示
 * intentional-error コンポーネントでエラーを発生させるデモ
 */
export const WithError: Story = {
  args: {
    children: <IntentionalError />,
  },
};

/**
 * カスタムフォールバックUI
 * エラー発生時にカスタムUIを表示します
 */
export const WithCustomFallback: Story = {
  args: {
    children: <IntentionalError />,
    fallback: ({ error, resetError }) => (
      <div
        style={{
          padding: '2rem',
          maxWidth: '500px',
          margin: '2rem auto',
          backgroundColor: '#fff3cd',
          border: '2px solid #ffc107',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#856404', marginBottom: '1rem' }}>カスタムエラーUI</h2>
        <p style={{ color: '#856404', marginBottom: '1rem' }}>
          エラーが発生しました: {error.message}
        </p>
        <button
          onClick={resetError}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#ffc107',
            color: '#333',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          リセット
        </button>
      </div>
    ),
  },
};

/**
 * カスタムフォールバック（JSX）
 * JSXで定義されたフォールバックUIを表示
 */
export const WithCustomFallbackJSX: Story = {
  args: {
    children: <IntentionalError />,
    fallback: (
      <div
        style={{
          padding: '2rem',
          maxWidth: '500px',
          margin: '2rem auto',
          backgroundColor: '#f8d7da',
          border: '2px solid #f5c6cb',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#721c24', marginBottom: '1rem' }}>エラーが発生しました</h2>
        <p style={{ color: '#721c24' }}>申し訳ございません。問題が発生しました。</p>
      </div>
    ),
  },
};

/**
 * ネストされたコンテンツ
 * 複数のコンポーネントがエラーバウンダリで保護されている場合
 */
export const WithNestedContent: Story = {
  args: {
    children: (
      <div style={{ padding: '2rem' }}>
        <h2>エラーバウンダリで保護されたセクション</h2>
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#e7f3ff',
            borderRadius: '4px',
          }}
        >
          <p>このコンポーネントツリーは ErrorBoundary で保護されています。</p>
          <p>内部で JavaScript エラーが発生しても、UI全体がクラッシュしません。</p>
        </div>
      </div>
    ),
  },
};
