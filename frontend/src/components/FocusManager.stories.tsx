import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { useRef, useState } from 'react';
import FocusManager from './FocusManager';

/**
 * FocusManager コンポーネントのストーリー
 *
 * モーダル表示時のフォーカストラップとフォーカス復帰を管理します。
 * - フォーカストラップ（Tab/Shift+Tab）
 * - Escapeキーでクローズ
 * - オーバーレイクリックでクローズ（オプション）
 * - 閉じた後のフォーカス復帰
 */
const meta = {
  title: 'Components/FocusManager',
  component: FocusManager,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
  },
} satisfies Meta<typeof FocusManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（開いている）
 * モーダルが開いている状態
 */
export const Open: Story = {
  args: {
    isOpen: true,
    children: (
      <div style={{ minWidth: '300px' }}>
        <h2 style={{ marginBottom: '16px' }}>モーダルタイトル</h2>
        <p style={{ marginBottom: '16px' }}>Tab/Shift+Tabでフォーカスがトラップされます。</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button">ボタン1</button>
          <button type="button">ボタン2</button>
          <button type="button">ボタン3</button>
        </div>
      </div>
    ),
  },
};

/**
 * 閉じた状態
 * モーダルが閉じている状態（何も表示されない）
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    children: <div>このコンテンツは表示されません</div>,
  },
};

/**
 * Escapeキー無効
 * Escapeキーでモーダルを閉じない設定
 */
export const NoEscapeClose: Story = {
  args: {
    isOpen: true,
    closeOnEscape: false,
    children: (
      <div style={{ minWidth: '300px' }}>
        <h2 style={{ marginBottom: '16px' }}>Escapeキー無効</h2>
        <p style={{ marginBottom: '16px' }}>Escapeキーではこのモーダルを閉じられません。</p>
        <button type="button">閉じる</button>
      </div>
    ),
  },
};

/**
 * オーバーレイクリックで閉じる
 * モーダル外クリックで閉じる設定
 */
export const CloseOnOutsideClick: Story = {
  args: {
    isOpen: true,
    closeOnOutsideClick: true,
    children: (
      <div style={{ minWidth: '300px' }}>
        <h2 style={{ marginBottom: '16px' }}>オーバーレイクリック</h2>
        <p style={{ marginBottom: '16px' }}>モーダル外をクリックすると閉じます。</p>
        <button type="button">ボタン</button>
      </div>
    ),
  },
};

/**
 * フォーム付きモーダル
 * フォーム要素を含むモーダルの例
 */
export const WithForm: Story = {
  args: {
    isOpen: true,
    children: (
      <div style={{ minWidth: '350px' }}>
        <h2 style={{ marginBottom: '16px' }}>ログイン</h2>
        <form onSubmit={(e) => e.preventDefault()}>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '4px' }}>
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '4px' }}>
              パスワード
            </label>
            <input
              id="password"
              type="password"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button">キャンセル</button>
            <button
              type="submit"
              style={{
                backgroundColor: '#1976d2',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
              }}
            >
              ログイン
            </button>
          </div>
        </form>
      </div>
    ),
  },
};

/**
 * インタラクティブデモ
 * ボタンでモーダルを開閉できるデモ
 */
const InteractiveTemplate = () => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          padding: '12px 24px',
          backgroundColor: '#1976d2',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        モーダルを開く
      </button>

      <FocusManager
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        closeOnEscape
        closeOnOutsideClick
        returnFocusRef={buttonRef as React.RefObject<HTMLElement>}
      >
        <div style={{ minWidth: '300px' }}>
          <h2 style={{ marginBottom: '16px' }}>インタラクティブモーダル</h2>
          <p style={{ marginBottom: '16px' }}>
            Escapeキーまたはオーバーレイクリックで閉じます。
            閉じた後、フォーカスは「モーダルを開く」ボタンに戻ります。
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                padding: '8px 16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      </FocusManager>
    </div>
  );
};

export const Interactive: Story = {
  render: () => <InteractiveTemplate />,
  args: {
    isOpen: false,
    children: null,
  },
};
