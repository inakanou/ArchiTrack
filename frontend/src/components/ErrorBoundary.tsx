import { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '../utils/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((props: { error: Error; resetError: () => void }) => ReactNode);
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Reactエラーバウンダリ
 * コンポーネントツリー内のJavaScriptエラーをキャッチし、
 * エラーログを記録して、フォールバックUIを表示する
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 次回のレンダリングでフォールバックUIを表示するように状態を更新
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // エラーログをコンソールに出力
    console.error('Uncaught error:', error, errorInfo);

    // Sentryにエラーを送信
    captureException(error, {
      errorInfo,
      componentStack: errorInfo.componentStack,
    });

    // エラー情報を状態に保存
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  override render() {
    if (this.state.hasError) {
      // カスタムフォールバックUIが提供されている場合はそれを使用
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error!,
            resetError: this.handleReset,
          });
        }
        return this.props.fallback;
      }

      // デフォルトのフォールバックUI
      return (
        <div
          style={{
            padding: '2rem',
            maxWidth: '600px',
            margin: '2rem auto',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h1 style={{ color: '#d32f2f', marginBottom: '1rem' }}>エラーが発生しました</h1>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            アプリケーションで予期しないエラーが発生しました。
            <br />
            ページを再読み込みするか、しばらく時間をおいて再度お試しください。
          </p>

          <button
            onClick={this.handleReset}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              marginRight: '0.5rem',
            }}
          >
            再試行
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#fff',
              color: '#1976d2',
              border: '1px solid #1976d2',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            ページを再読み込み
          </button>

          {/* 開発環境でのみエラー詳細を表示 */}
          {import.meta.env.DEV && this.state.error && (
            <details
              style={{
                marginTop: '2rem',
                textAlign: 'left',
                backgroundColor: '#f5f5f5',
                padding: '1rem',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                エラー詳細（開発モードのみ）
              </summary>
              <pre
                style={{
                  overflow: 'auto',
                  fontSize: '0.875rem',
                  backgroundColor: '#fff',
                  padding: '1rem',
                  borderRadius: '4px',
                  border: '1px solid #e0e0e0',
                }}
              >
                <strong>Error:</strong> {this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo && (
                  <>
                    <strong>Component Stack:</strong>
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
