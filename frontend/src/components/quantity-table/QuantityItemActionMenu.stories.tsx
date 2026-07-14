/**
 * @fileoverview 数量項目アクションメニューコンポーネントのStorybook
 *
 * Task 50.1: アクションメニューコンポーネントを実装する
 * Task 70.1: ストーリーを Portal 描画へ追随させる
 *
 * 数量項目の行アクション（上へ移動・下へ移動・コピー・削除）を
 * 単一のドロップダウンメニューに統合するアクションメニュー。
 *
 * Requirements:
 * - 36.2, 36.6, 36.7, 36.8: メニュー項目の構成と活性/非活性制御
 * - 46.1: メニューを画面本体（document.body）直下へ Portal 描画し、全項目を表示する
 * - 46.8: メニュー外クリックおよび Escape でメニューを閉じる
 * - 46.9: メニュー項目を選択すると操作を実行したうえでメニューを閉じる
 *
 * 【Portal 描画への追随（Task 69.1 / 70.1）】
 * ドロップダウンは `createPortal` で `document.body` 直下へ fixed 配置される。
 * そのため:
 *   - デコレータ: 実画面の切り取り元である水平スクロールラッパー
 *     （QuantityGroupCard の itemTableWrapper: overflowX:auto / overflowY:hidden = REQ-41）を
 *     再現し、メニューがその内側に閉じ込められないことを示す。
 *   - アサーション: メニューは `canvasElement`（#storybook-root）の**外**に描画されるため、
 *     `within(canvasElement)` では取得できない。`document.body` を起点に検証する。
 *
 * 【検証の限界】
 * メニューが表示領域の境界で「切り取られないこと」の幾何的検証（矩形の重なり判定）は
 * 本ストーリーでは行わない。切り取りは実レイアウトに依存するため、Task 71.1 の E2E
 * （実ブラウザでの矩形取得による検証）に委譲する。ここで検証するのは
 * 「document.body 直下へ描画される」「外側クリック / Escape / 項目選択で閉じる」という
 * 構造・振る舞いの性質に限る。
 *
 * @module components/quantity-table/QuantityItemActionMenu.stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import QuantityItemActionMenu, {
  type QuantityItemActionMenuProps,
} from './QuantityItemActionMenu';

/**
 * 実画面の切り取り元を再現するラッパー。
 *
 * QuantityGroupCard の itemTableWrapper（REQ-41 の水平スクロール領域）と同じ
 * overflow 指定を持つ。Portal 化前のドロップダウンはこの要素にクリップされ、
 * 「クリックしてもメニューが表示されない」という不具合（REQ-46）を起こしていた。
 */
function ScrollableTableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="item-table-wrapper"
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        width: '260px',
        border: '1px dashed #9ca3af',
        borderRadius: '4px',
        background: '#f9fafb',
      }}
    >
      {/* ラッパーより広い内容 = 水平スクロールを発生させる（実画面の数量項目テーブル相当）。
          アクションボタンはラッパーの可視幅（260px）内に収まる位置へ置き、
          残りをスペーサーで埋めて overflow を発生させる。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '420px',
          height: '40px',
          padding: '0 8px',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            flex: '0 0 190px',
            fontSize: '12px',
            color: '#6b7280',
            whiteSpace: 'nowrap',
          }}
        >
          数量項目（水平スクロール領域）
        </span>
        {children}
        {/* ラッパー幅を超える残余領域（水平スクロールを成立させる） */}
        <span aria-hidden="true" style={{ flex: '1 0 auto' }} />
      </div>
    </div>
  );
}

/**
 * 開閉状態を保持する制御ラッパー。
 *
 * 実画面では EditableQuantityItemRow が isMenuOpen を保持し、onToggle / onClose で
 * 開閉する（Task 69.2 で閉じ判定は outside-click + Escape に一本化済み）。
 * ストーリーでも同じ制御構造を再現し、外側クリック・Escape・項目選択で実際に
 * メニューが閉じることを操作可能にする。
 */
function ControlledActionMenu({
  isOpen: initialIsOpen,
  onToggle,
  onClose,
  ...rest
}: QuantityItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen);

  return (
    <QuantityItemActionMenu
      {...rest}
      isOpen={isOpen}
      onToggle={() => {
        setIsOpen((prev) => !prev);
        onToggle();
      }}
      onClose={() => {
        setIsOpen(false);
        onClose();
      }}
    />
  );
}

const meta = {
  title: 'Components/QuantityTable/QuantityItemActionMenu',
  component: QuantityItemActionMenu,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ScrollableTableWrapper>
        <Story />
      </ScrollableTableWrapper>
    ),
  ],
  args: {
    isOpen: false,
    onToggle: fn(),
    onClose: fn(),
    onMoveUp: fn(),
    onMoveDown: fn(),
    onCopy: fn(),
    onDelete: fn(),
    canMoveUp: true,
    canMoveDown: true,
  },
  render: (args) => <ControlledActionMenu {...args} />,
} satisfies Meta<typeof QuantityItemActionMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Portal 先（document.body 直下）を起点にメニューを取得する */
const menuIn = (body: HTMLElement) => within(body).getByRole('menu');

/**
 * デフォルト（閉じた状態）
 * 三点メニューボタンのみ表示
 */
export const Default: Story = {};

/**
 * メニュー展開状態
 * 全アクションが利用可能
 */
export const Open: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 先頭項目（上へ移動が無効）
 * 最上位の項目では「上へ移動」がdisabled
 */
export const FirstItem: Story = {
  args: {
    isOpen: true,
    canMoveUp: false,
  },
};

/**
 * 末尾項目（下へ移動が無効）
 * 最下位の項目では「下へ移動」がdisabled
 */
export const LastItem: Story = {
  args: {
    isOpen: true,
    canMoveDown: false,
  },
};

/**
 * 単一項目（上下移動どちらも無効）
 * 項目が1つしかない場合は上下移動ともdisabled
 */
export const SingleItem: Story = {
  args: {
    isOpen: true,
    canMoveUp: false,
    canMoveDown: false,
  },
};

// ============================================================================
// Portal 描画（REQ-46）
// ============================================================================

/**
 * Portal 描画（REQ-46.1）
 *
 * 水平スクロールラッパー（itemTableWrapper 相当）の内側にあるボタンから開いても、
 * メニューは document.body 直下へ描画されるためラッパーにクリップされない。
 */
export const PortalRendering: Story = {
  name: 'Portal 描画（body 直下 / REQ-46.1）',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = document.body;

    await userEvent.click(canvas.getByRole('button', { name: 'アクション' }));

    const menu = await waitFor(() => menuIn(body));

    // メニューは canvas（#storybook-root）の外＝切り取り元のラッパーの外に描画される
    await expect(canvasElement.contains(menu)).toBe(false);
    await expect(menu.parentElement).toBe(body);
    // fixed 配置のため祖先の overflow の影響を受けない
    await expect(menu.style.position).toBe('fixed');
    // 固定表示ヘッダー（zIndex: 50）より前面（REQ-46.7）
    await expect(Number(menu.style.zIndex)).toBeGreaterThan(50);

    // 全4項目が表示される（REQ-46.1）
    const menuScope = within(menu);
    await expect(menuScope.getByText('上へ移動')).toBeInTheDocument();
    await expect(menuScope.getByText('下へ移動')).toBeInTheDocument();
    await expect(menuScope.getByText('コピー')).toBeInTheDocument();
    await expect(menuScope.getByText('削除')).toBeInTheDocument();
  },
};

/**
 * 外側クリックで閉じる（REQ-46.8）
 */
export const CloseOnOutsideClick: Story = {
  name: '外側クリックで閉じる（REQ-46.8）',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = document.body;

    await userEvent.click(canvas.getByRole('button', { name: 'アクション' }));
    await waitFor(() => menuIn(body));

    // メニュー外（Portal 先のドロップダウンにもトリガーにも属さない領域）を押下する
    await userEvent.click(canvasElement);

    await waitFor(async () => {
      await expect(within(body).queryByRole('menu')).not.toBeInTheDocument();
    });
  },
};

/**
 * Escape キーで閉じる（REQ-46.8）
 */
export const CloseOnEscape: Story = {
  name: 'Escape キーで閉じる（REQ-46.8）',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = document.body;

    await userEvent.click(canvas.getByRole('button', { name: 'アクション' }));
    await waitFor(() => menuIn(body));

    await userEvent.keyboard('{Escape}');

    await waitFor(async () => {
      await expect(within(body).queryByRole('menu')).not.toBeInTheDocument();
    });
  },
};

/**
 * 項目選択で操作を実行したうえで閉じる（REQ-46.9）
 */
export const CloseOnItemSelect: Story = {
  name: '項目選択で実行して閉じる（REQ-46.9）',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = document.body;

    await userEvent.click(canvas.getByRole('button', { name: 'アクション' }));
    const menu = await waitFor(() => menuIn(body));

    // Portal 先のメニュー項目をクリックする（canvas 側からは取得できない）
    await userEvent.click(within(menu).getByText('コピー'));

    // 操作が実行され、かつメニューが閉じる
    await expect(args.onCopy).toHaveBeenCalled();
    await waitFor(async () => {
      await expect(within(body).queryByRole('menu')).not.toBeInTheDocument();
    });
  },
};
