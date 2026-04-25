/**
 * @fileoverview 注釈コンテキストメニューコンポーネント
 *
 * Task 68.1: AnnotationContextMenu.tsx 新規作成
 *
 * 長押しまたは右クリック時に選択オブジェクトのアクションを提示するメニュー。
 * メニュー外タップ検知のため透明オーバーレイを背景に配置する。
 *
 * Requirements:
 * - 27.2: 長押しで選択状態に遷移し、編集・複製・削除を含むコンテキストメニューを表示する
 * - 27.3: コンテキストメニュー各項目のタップで対応する操作を実行する
 * - 27.4: メニュー表示中は背景画像への新規描画操作を受け付けない（UI 層では透明オーバーレイで担保）
 * - 27.5: メニュー外タップでコンテキストメニューを閉じる
 * - 28.3: タップ領域は最小 44x44 論理ピクセル以上
 *
 * Design: design.md "AnnotationContextMenu" セクション参照
 *
 * @requirement site-survey/REQ-27.2
 * @requirement site-survey/REQ-27.3
 * @requirement site-survey/REQ-27.4
 * @requirement site-survey/REQ-27.5
 */

import React, { useCallback } from 'react';
import type { FabricObject } from 'fabric';

// ============================================================================
// 型定義
// ============================================================================

/**
 * コンテキストメニュー上で実行可能なアクションの種別
 */
export type ContextMenuAction = 'edit' | 'duplicate' | 'delete';

/**
 * 注釈オーバーレイ系コンポーネントの共通 Props
 *
 * 今後 AnnotationGuide など類似のオーバーレイ UI が追加された際に再利用する。
 */
export interface BaseAnnotationOverlayProps {
  /** オーバーレイを表示するか */
  visible: boolean;
  /** オーバーレイを表示する画面上の位置（親要素基準の論理ピクセル） */
  position: { x: number; y: number } | null;
  /** オーバーレイを閉じるコールバック */
  onClose(): void;
}

/**
 * AnnotationContextMenu の Props
 */
export interface AnnotationContextMenuProps extends BaseAnnotationOverlayProps {
  /** メニューの対象となる FabricObject（編集可否の判定や onAction 引数に用いる） */
  targetObject: FabricObject | null;
  /** アクションが選択されたときに呼ばれるコールバック */
  onAction(action: ContextMenuAction, target: FabricObject): void;
}

// ============================================================================
// スタイル定義
// ============================================================================

/**
 * メニュー各アクションボタンの最小タップ領域（論理ピクセル）。
 * Req 28.3: タップ領域は最小 44x44 論理ピクセル以上。
 */
const MIN_TAP_TARGET_PX = 44;

const STYLES = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'transparent',
    zIndex: 1000,
  } satisfies React.CSSProperties,
  panel: {
    position: 'absolute' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: '4px',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 1001,
  } satisfies React.CSSProperties,
  button: {
    minWidth: `${MIN_TAP_TARGET_PX}px`,
    minHeight: `${MIN_TAP_TARGET_PX}px`,
    padding: '8px 16px',
    border: '1px solid transparent',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#111827',
    fontSize: '14px',
    fontWeight: 500,
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  } satisfies React.CSSProperties,
  buttonDisabled: {
    color: '#9ca3af',
    cursor: 'not-allowed',
  } satisfies React.CSSProperties,
  buttonDestructive: {
    color: '#b91c1c',
  } satisfies React.CSSProperties,
};

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * targetObject が編集可能（テキスト系）かどうかを判定する。
 *
 * Fabric 標準の IText は `type === 'text'` / 'i-text' を返す。
 * 本プロジェクトのテキスト注釈ツール（TextTool）で作成されるカスタム型は
 * `textAnnotation` を想定する（design.md 参照）。
 */
function isTextAnnotationTarget(target: FabricObject): boolean {
  const type = (target as { type?: string }).type;
  return type === 'text' || type === 'i-text' || type === 'textAnnotation';
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 注釈コンテキストメニュー
 *
 * @remarks
 * - `visible`, `position`, `targetObject` のいずれかが未確定の場合は何もレンダリングしない。
 * - メニュー外タップ用の透明オーバーレイを最前面に配置し、
 *   その内側にメニューパネルを `position.x / position.y` に絶対配置する。
 * - アクションボタン押下時は `onAction(action, targetObject)` のあと `onClose()` を呼ぶ。
 * - 編集アクションはテキスト系オブジェクト (`type === 'text' | 'i-text' | 'textAnnotation'`) の場合のみ有効。
 */
export function AnnotationContextMenu({
  visible,
  position,
  targetObject,
  onAction,
  onClose,
}: AnnotationContextMenuProps): React.JSX.Element | null {
  // パネル内クリックがオーバーレイに伝播して onClose が呼ばれてしまうのを防ぐ
  const stopPropagation = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const handleAction = useCallback(
    (action: ContextMenuAction) => {
      if (!targetObject) {
        return;
      }
      onAction(action, targetObject);
      onClose();
    },
    [onAction, onClose, targetObject]
  );

  const handleEdit = useCallback(() => handleAction('edit'), [handleAction]);
  const handleDuplicate = useCallback(() => handleAction('duplicate'), [handleAction]);
  const handleDelete = useCallback(() => handleAction('delete'), [handleAction]);

  if (!visible || !position || !targetObject) {
    return null;
  }

  const editEnabled = isTextAnnotationTarget(targetObject);

  const panelStyle: React.CSSProperties = {
    ...STYLES.panel,
    left: `${position.x}px`,
    top: `${position.y}px`,
  };

  const editButtonStyle: React.CSSProperties = {
    ...STYLES.button,
    ...(editEnabled ? {} : STYLES.buttonDisabled),
  };

  const deleteButtonStyle: React.CSSProperties = {
    ...STYLES.button,
    ...STYLES.buttonDestructive,
  };

  return (
    <>
      {/* 透明オーバーレイ: メニュー外タップで onClose（Req 27.5） */}
      {/* role="presentation" の要素には aria-label を付与できない（axe: aria-prohibited-attr）ため、
          視覚的・意味的にも非表示の透明レイヤーとして属性を最小化する */}
      <div
        data-testid="annotation-context-menu-overlay"
        role="presentation"
        style={STYLES.overlay}
        onClick={onClose}
      />
      {/* メニューパネル */}
      <div
        data-testid="annotation-context-menu-panel"
        aria-label="注釈コンテキストメニュー"
        style={panelStyle}
        onClick={stopPropagation}
      >
        <button
          type="button"
          aria-label="編集"
          style={editButtonStyle}
          disabled={!editEnabled}
          onClick={handleEdit}
        >
          編集
        </button>
        <button type="button" aria-label="複製" style={STYLES.button} onClick={handleDuplicate}>
          複製
        </button>
        <button type="button" aria-label="削除" style={deleteButtonStyle} onClick={handleDelete}>
          削除
        </button>
      </div>
    </>
  );
}

export default AnnotationContextMenu;
