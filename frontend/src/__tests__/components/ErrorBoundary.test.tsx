import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../../components/ErrorBoundary';

// コンソールエラーをモック（エラーバウンダリのテスト時にエラーログが出るため）
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

// エラーをスローするテストコンポーネント
const ThrowError = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// カスタムエラーをスローするコンポーネント
const ThrowCustomError = ({ message }: { message: string }) => {
  throw new Error(message);
};

describe('ErrorBoundary', () => {
  describe('正常動作', () => {
    it('エラーがない場合、子要素を表示すること', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('複数の子要素を表示できること', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
    });
  });

  describe('エラーキャッチ', () => {
    it('エラーをキャッチしてフォールバックUIを表示すること', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
      expect(
        screen.getByText(/アプリケーションで予期しないエラーが発生しました/)
      ).toBeInTheDocument();
    });

    it('エラーをコンソールに出力すること', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });

    it('カスタムエラーメッセージを処理できること', () => {
      render(
        <ErrorBoundary>
          <ThrowCustomError message="Custom error message" />
        </ErrorBoundary>
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });
  });

  describe('カスタムフォールバック', () => {
    it('カスタムフォールバックUIを表示できること', () => {
      const customFallback = <div>Custom error UI</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error UI')).toBeInTheDocument();
      expect(screen.queryByText('エラーが発生しました')).not.toBeInTheDocument();
    });
  });

  describe('デフォルトフォールバックUI', () => {
    it('再試行ボタンを表示すること', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('再試行')).toBeInTheDocument();
    });

    it('ページ再読み込みボタンを表示すること', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('ページを再読み込み')).toBeInTheDocument();
    });

    it('再試行ボタンクリックでエラー状態をリセットすること', async () => {
      const user = userEvent.setup();
      let shouldThrow = true;

      const TestComponent = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div>No error</div>;
      };

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();

      // エラーを解消
      shouldThrow = false;

      // 再試行ボタンをクリック
      const retryButton = screen.getByText('再試行');
      await user.click(retryButton);

      // エラー状態がリセットされ、正常なコンテンツが表示される
      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('ページ再読み込みボタンでwindow.location.reloadが呼ばれること', async () => {
      const user = userEvent.setup();
      const reloadMock = vi.fn();

      // window.location.reloadをモック
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByText('ページを再読み込み');
      await user.click(reloadButton);

      expect(reloadMock).toHaveBeenCalled();
    });
  });

  describe('開発環境での動作', () => {
    let originalEnv: boolean;

    beforeEach(() => {
      originalEnv = import.meta.env.DEV;
      // 開発環境モード
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta.env as any).DEV = true;
    });

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta.env as any).DEV = originalEnv;
    });

    it('開発環境でエラー詳細を表示すること', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('エラー詳細（開発モードのみ）')).toBeInTheDocument();
    });

    it('エラーメッセージを表示すること', () => {
      render(
        <ErrorBoundary>
          <ThrowCustomError message="Detailed error message" />
        </ErrorBoundary>
      );

      // detailsを展開する必要があるが、テキストが含まれることを確認
      expect(screen.getByText(/Detailed error message/)).toBeInTheDocument();
    });
  });

  describe('本番環境での動作', () => {
    let originalEnv: boolean;

    beforeEach(() => {
      originalEnv = import.meta.env.DEV;
      // 本番環境モード
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta.env as any).DEV = false;
    });

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta.env as any).DEV = originalEnv;
    });

    it('本番環境でエラー詳細を隠すこと', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.queryByText('エラー詳細（開発モードのみ）')).not.toBeInTheDocument();
    });
  });

  describe('ライフサイクル', () => {
    it('getDerivedStateFromErrorが正しく動作すること', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // エラー状態になったことを確認
      expect(container).toHaveTextContent('エラーが発生しました');
    });

    it('componentDidCatchが呼ばれること', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // componentDidCatchでconsole.errorが呼ばれることを確認
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('エラーリカバリー', () => {
    it('再試行ボタンでエラー状態をリセットできること', async () => {
      const user = userEvent.setup();
      let shouldThrow = true;

      const TestComponent = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div>Recovered content</div>;
      };

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      // エラー状態
      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();

      // エラーを解消
      shouldThrow = false;

      // 再試行ボタンをクリック（状態をリセット）
      await user.click(screen.getByText('再試行'));

      // エラー状態がリセットされ、正常なコンテンツが表示される
      expect(screen.getByText('Recovered content')).toBeInTheDocument();
      expect(screen.queryByText('エラーが発生しました')).not.toBeInTheDocument();
    });
  });

  describe('複数のエラーバウンダリ', () => {
    it('ネストされたエラーバウンダリが独立して動作すること', () => {
      render(
        <ErrorBoundary fallback={<div>Outer error</div>}>
          <div>Outer content</div>
          <ErrorBoundary fallback={<div>Inner error</div>}>
            <ThrowError />
          </ErrorBoundary>
        </ErrorBoundary>
      );

      // 内側のエラーバウンダリがエラーをキャッチ
      expect(screen.getByText('Inner error')).toBeInTheDocument();
      expect(screen.queryByText('Outer error')).not.toBeInTheDocument();
      // 外側のコンテンツは正常表示
      expect(screen.getByText('Outer content')).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('適切なスタイルが適用されること', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const errorContainer = container.firstChild as HTMLElement;
      expect(errorContainer).toHaveStyle({ padding: '2rem' });
    });
  });

  describe('エッジケース', () => {
    it('nullエラーを処理できること', () => {
      const ThrowNull = () => {
        throw null;
      };

      render(
        <ErrorBoundary>
          <ThrowNull />
        </ErrorBoundary>
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });

    it('文字列エラーを処理できること', () => {
      const ThrowString = () => {
        throw 'String error';
      };

      render(
        <ErrorBoundary>
          <ThrowString />
        </ErrorBoundary>
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });
  });
});
