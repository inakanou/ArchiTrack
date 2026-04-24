/**
 * @fileoverview AnnotationContextMenuコンポーネントのテスト
 *
 * Task 68.1: AnnotationContextMenu.tsx 新規作成（RED-first TDD）
 *
 * Requirements:
 * - 27.2: 長押しで選択状態に遷移し、編集・複製・削除を含むコンテキストメニューを表示する
 * - 27.3: コンテキストメニュー各項目のタップで対応する操作を実行する
 * - 27.4: メニュー表示中は背景画像への新規描画操作を受け付けない（UI層では透明オーバーレイで担保）
 * - 27.5: メニュー外タップでコンテキストメニューを閉じる
 *
 * テスト対象:
 * - visible / position / targetObject の条件に応じた表示制御
 * - 編集（テキストのみ有効）、複製、削除 の3アクション
 * - タップ領域（最小 44x44 論理ピクセル）
 * - 透明オーバーレイ（メニュー外タップで onClose）
 * - position による絶対配置
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FabricObject } from 'fabric';
import {
  AnnotationContextMenu,
  type AnnotationContextMenuProps,
  type ContextMenuAction,
} from '../../../components/site-surveys/AnnotationContextMenu';

// ============================================================================
// テストヘルパー
// ============================================================================

/**
 * FabricObject のモック（テストに必要な type プロパティのみ実装）
 */
function makeFabricObjectMock(type: string): FabricObject {
  return { type } as unknown as FabricObject;
}

function renderMenu(overrides: Partial<AnnotationContextMenuProps> = {}): {
  onAction: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  target: FabricObject;
  rerender: (next: Partial<AnnotationContextMenuProps>) => void;
} {
  const onAction = vi.fn();
  const onClose = vi.fn();
  const target = overrides.targetObject ?? makeFabricObjectMock('rect');

  const baseProps: AnnotationContextMenuProps = {
    visible: true,
    position: { x: 100, y: 200 },
    targetObject: target,
    onAction,
    onClose,
  };

  const props: AnnotationContextMenuProps = { ...baseProps, ...overrides };
  const view = render(<AnnotationContextMenu {...props} />);

  return {
    onAction,
    onClose,
    target: target as FabricObject,
    rerender: (next) => view.rerender(<AnnotationContextMenu {...props} {...next} />),
  };
}

// ============================================================================
// テストスイート
// ============================================================================

describe('AnnotationContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 表示制御（Req 27.2）
  // --------------------------------------------------------------------------
  describe('表示制御', () => {
    it('visible=false のときは何もレンダリングしない', () => {
      renderMenu({ visible: false });

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '複製' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    });

    it('visible=true でも position=null のときは何もレンダリングしない', () => {
      renderMenu({ position: null });

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '複製' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    });

    it('visible=true でも targetObject=null のときは何もレンダリングしない', () => {
      renderMenu({ targetObject: null });

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '複製' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    });

    it('visible=true かつ position と targetObject が設定されている場合は 編集/複製/削除 の3ボタンを表示する', () => {
      renderMenu();

      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '複製' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 編集ボタンの有効/無効制御（テキスト注釈のみ有効）
  // --------------------------------------------------------------------------
  describe('編集ボタンの有効/無効', () => {
    it('targetObject.type がテキスト系でない場合は 編集 ボタンが disabled になる', () => {
      renderMenu({ targetObject: makeFabricObjectMock('rect') });

      const editButton = screen.getByRole('button', { name: '編集' });
      expect(editButton).toBeDisabled();
    });

    it('targetObject.type === "text" の場合は 編集 ボタンが enabled になる', () => {
      renderMenu({ targetObject: makeFabricObjectMock('text') });

      const editButton = screen.getByRole('button', { name: '編集' });
      expect(editButton).toBeEnabled();
    });

    it('targetObject.type === "textAnnotation" の場合は 編集 ボタンが enabled になる', () => {
      renderMenu({ targetObject: makeFabricObjectMock('textAnnotation') });

      const editButton = screen.getByRole('button', { name: '編集' });
      expect(editButton).toBeEnabled();
    });
  });

  // --------------------------------------------------------------------------
  // 各アクションの onAction 呼び出し（Req 27.3）
  // --------------------------------------------------------------------------
  describe('onAction 呼び出し', () => {
    it('編集 ボタン押下で onAction("edit", targetObject) と onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const { onAction, onClose, target } = renderMenu({
        targetObject: makeFabricObjectMock('text'),
      });

      await user.click(screen.getByRole('button', { name: '編集' }));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('edit' satisfies ContextMenuAction, target);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('複製 ボタン押下で onAction("duplicate", targetObject) と onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const { onAction, onClose, target } = renderMenu();

      await user.click(screen.getByRole('button', { name: '複製' }));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('duplicate' satisfies ContextMenuAction, target);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('削除 ボタン押下で onAction("delete", targetObject) と onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const { onAction, onClose, target } = renderMenu();

      await user.click(screen.getByRole('button', { name: '削除' }));

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('delete' satisfies ContextMenuAction, target);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // メニュー外タップで onClose（Req 27.5）
  // --------------------------------------------------------------------------
  describe('メニュー外タップで onClose', () => {
    it('透明オーバーレイをクリックすると onClose が呼ばれる', async () => {
      const user = userEvent.setup();
      const { onClose, onAction } = renderMenu();

      const overlay = screen.getByTestId('annotation-context-menu-overlay');
      await user.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onAction).not.toHaveBeenCalled();
    });

    it('メニューパネル自体のクリックは onClose を呼ばない（アクションボタン以外の余白）', async () => {
      const user = userEvent.setup();
      const { onClose } = renderMenu();

      const panel = screen.getByTestId('annotation-context-menu-panel');
      await user.click(panel);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // タップ領域（最小 44x44 論理ピクセル）
  // --------------------------------------------------------------------------
  describe('タップ領域', () => {
    it.each(['編集', '複製', '削除'] as const)(
      '%s ボタンは minWidth/minHeight が 44px 以上',
      (label) => {
        renderMenu({ targetObject: makeFabricObjectMock('text') });

        const button = screen.getByRole('button', { name: label });
        const style = button.style;

        const minWidthPx = parseFloat(style.minWidth);
        const minHeightPx = parseFloat(style.minHeight);

        expect(minWidthPx).toBeGreaterThanOrEqual(44);
        expect(minHeightPx).toBeGreaterThanOrEqual(44);
      }
    );
  });

  // --------------------------------------------------------------------------
  // position によるメニューパネルの配置
  // --------------------------------------------------------------------------
  describe('position による配置', () => {
    it('メニューパネルが position.x/y の位置に配置される', () => {
      renderMenu({ position: { x: 123, y: 456 } });

      const panel = screen.getByTestId('annotation-context-menu-panel');
      expect(panel.style.left).toBe('123px');
      expect(panel.style.top).toBe('456px');
    });
  });
});
