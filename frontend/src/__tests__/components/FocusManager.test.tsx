import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import FocusManager from '../../components/FocusManager';

describe('FocusManager', () => {
  const mockOnClose = vi.fn<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('isOpen=trueの場合、コンテンツが表示される', () => {
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>モーダルコンテンツ</div>
        </FocusManager>
      );

      expect(screen.getByText('モーダルコンテンツ')).toBeInTheDocument();
    });

    it('isOpen=falseの場合、コンテンツが表示されない', () => {
      render(
        <FocusManager isOpen={false} onClose={mockOnClose}>
          <div>モーダルコンテンツ</div>
        </FocusManager>
      );

      expect(screen.queryByText('モーダルコンテンツ')).not.toBeInTheDocument();
    });
  });

  describe('フォーカストラップ', () => {
    it('モーダルが開いたとき、最初のフォーカス可能要素にフォーカスが当たる', async () => {
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>
            <button>ボタン1</button>
            <button>ボタン2</button>
          </div>
        </FocusManager>
      );

      await waitFor(() => {
        const firstButton = screen.getByText('ボタン1');
        expect(firstButton).toHaveFocus();
      });
    });

    it('Tabキーでフォーカスが次の要素に移動する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>
            <button>ボタン1</button>
            <button>ボタン2</button>
            <button>ボタン3</button>
          </div>
        </FocusManager>
      );

      await waitFor(() => {
        expect(screen.getByText('ボタン1')).toHaveFocus();
      });

      await user.tab();
      expect(screen.getByText('ボタン2')).toHaveFocus();

      await user.tab();
      expect(screen.getByText('ボタン3')).toHaveFocus();
    });

    it('最後の要素でTabキーを押すと最初の要素に戻る', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>
            <button>ボタン1</button>
            <button>ボタン2</button>
          </div>
        </FocusManager>
      );

      await waitFor(() => {
        expect(screen.getByText('ボタン1')).toHaveFocus();
      });

      // 最後の要素まで移動
      await user.tab();
      expect(screen.getByText('ボタン2')).toHaveFocus();

      // もう一度Tabを押すと最初の要素に戻る
      await user.tab();
      expect(screen.getByText('ボタン1')).toHaveFocus();
    });

    it('Shift+Tabキーでフォーカスが前の要素に移動する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>
            <button>ボタン1</button>
            <button>ボタン2</button>
            <button>ボタン3</button>
          </div>
        </FocusManager>
      );

      await waitFor(() => {
        expect(screen.getByText('ボタン1')).toHaveFocus();
      });

      // ボタン2に移動
      await user.tab();
      expect(screen.getByText('ボタン2')).toHaveFocus();

      // Shift+Tabでボタン1に戻る
      await user.tab({ shift: true });
      expect(screen.getByText('ボタン1')).toHaveFocus();
    });

    it('最初の要素でShift+Tabキーを押すと最後の要素に移動する', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>
            <button>ボタン1</button>
            <button>ボタン2</button>
          </div>
        </FocusManager>
      );

      await waitFor(() => {
        expect(screen.getByText('ボタン1')).toHaveFocus();
      });

      // Shift+Tabで最後の要素に移動
      await user.tab({ shift: true });
      expect(screen.getByText('ボタン2')).toHaveFocus();
    });
  });

  describe('Escapeキー', () => {
    it('Escapeキーを押すとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>
            <button>ボタン</button>
          </div>
        </FocusManager>
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('closeOnEscape=falseの場合、Escapeキーを押してもonCloseが呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <FocusManager isOpen={true} onClose={mockOnClose} closeOnEscape={false}>
          <div>
            <button>ボタン</button>
          </div>
        </FocusManager>
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('外側クリック', () => {
    it('closeOnOutsideClick=trueの場合、モーダル外をクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <FocusManager isOpen={true} onClose={mockOnClose} closeOnOutsideClick={true}>
          <div>
            <button>ボタン</button>
          </div>
        </FocusManager>
      );

      // オーバーレイ（モーダル外）をクリック
      const overlay = container.querySelector('[data-testid="focus-manager-overlay"]');
      if (overlay) {
        await user.click(overlay as HTMLElement);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('closeOnOutsideClick=falseの場合、モーダル外をクリックしてもonCloseが呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <FocusManager isOpen={true} onClose={mockOnClose} closeOnOutsideClick={false}>
          <div>
            <button>ボタン</button>
          </div>
        </FocusManager>
      );

      // オーバーレイ（モーダル外）をクリック
      const overlay = container.querySelector('[data-testid="focus-manager-overlay"]');
      if (overlay) {
        await user.click(overlay as HTMLElement);
      }

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('フォーカス復帰', () => {
    it('モーダルを閉じると、元のフォーカス位置に戻る', async () => {
      const TestComponent = () => {
        const [isOpen, setIsOpen] = useState(false);
        return (
          <div>
            <button onClick={() => setIsOpen(true)}>モーダルを開く</button>
            <FocusManager isOpen={isOpen} onClose={() => setIsOpen(false)}>
              <div>
                <button>モーダル内ボタン</button>
              </div>
            </FocusManager>
          </div>
        );
      };

      const user = userEvent.setup({ delay: null });
      render(<TestComponent />);

      const openButton = screen.getByText('モーダルを開く');
      await user.click(openButton);

      // モーダルが開いている
      expect(screen.getByText('モーダル内ボタン')).toBeInTheDocument();

      // Escapeでモーダルを閉じる
      await user.keyboard('{Escape}');

      // 元のボタンにフォーカスが戻る
      await waitFor(() => {
        expect(openButton).toHaveFocus();
      });
    });

    it('returnFocusRefが指定されている場合、そこにフォーカスが戻る', async () => {
      const TestComponent = () => {
        const returnRef = useRef<HTMLElement>(null);
        const [isOpen, setIsOpen] = useState(true);

        return (
          <div>
            <button ref={returnRef as React.RefObject<HTMLButtonElement>}>
              カスタムフォーカス先
            </button>
            <button>別のボタン</button>
            <FocusManager
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
              returnFocusRef={returnRef as unknown as React.RefObject<HTMLElement>}
            >
              <div>
                <button>モーダル内ボタン</button>
              </div>
            </FocusManager>
          </div>
        );
      };

      const user = userEvent.setup({ delay: null });
      render(<TestComponent />);

      // Escapeでモーダルを閉じる
      await user.keyboard('{Escape}');

      // カスタムフォーカス先にフォーカスが戻る
      await waitFor(() => {
        expect(screen.getByText('カスタムフォーカス先')).toHaveFocus();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('role="dialog"が設定されている', () => {
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>コンテンツ</div>
        </FocusManager>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('aria-modal="true"が設定されている', () => {
      render(
        <FocusManager isOpen={true} onClose={mockOnClose}>
          <div>コンテンツ</div>
        </FocusManager>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });
});
