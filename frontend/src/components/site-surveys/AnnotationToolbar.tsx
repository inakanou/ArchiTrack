/**
 * @fileoverview 注釈ツールバーコンポーネント
 *
 * Task 13.2: ツール切り替えUIを実装する
 *
 * ツールバーコンポーネント、各種ツールの切り替え、
 * アクティブツールの視覚的フィードバックを提供します。
 *
 * Requirements:
 * - 6.1: 寸法線ツールを選択して2点をクリックすると2点間に寸法線を描画する
 * - 7.1: 矢印ツールを選択してドラッグすると開始点から終了点へ矢印を描画する
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 */

import React, { useCallback } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 注釈ツールの種類
 */
export type ToolType =
  | 'select'
  | 'dimension'
  | 'arrow'
  | 'circle'
  | 'rectangle'
  | 'polygon'
  | 'polyline'
  | 'freehand'
  | 'text';

/**
 * ツール定義
 */
export interface ToolDefinition {
  /** ツールID */
  id: ToolType;
  /** 表示ラベル */
  label: string;
  /** アイコン（SVGパス） */
  icon: string;
  /** ツールチップ説明 */
  description: string;
}

/**
 * AnnotationToolbarのProps
 */
export interface AnnotationToolbarProps {
  /** 現在アクティブなツール */
  activeTool: ToolType;
  /** ツール変更時のコールバック */
  onToolChange: (tool: ToolType) => void;
  /** 無効化フラグ */
  disabled?: boolean;
}

// ============================================================================
// ツール定義
// ============================================================================

/**
 * 全ツールの定義
 */
export const TOOL_DEFINITIONS: Record<ToolType, ToolDefinition> = {
  select: {
    id: 'select',
    label: '選択',
    icon: 'M3 3l18 18M3 3v6M3 3h6',
    description: 'オブジェクトを選択・移動',
  },
  dimension: {
    id: 'dimension',
    label: '寸法線',
    icon: 'M3 12h18M3 8v8M21 8v8',
    description: '2点間の寸法線を描画',
  },
  arrow: {
    id: 'arrow',
    label: '矢印',
    icon: 'M5 19L19 5M19 5h-6M19 5v6',
    description: '矢印を描画',
  },
  circle: {
    id: 'circle',
    label: '円',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    description: '円または楕円を描画',
  },
  rectangle: {
    id: 'rectangle',
    label: '四角形',
    icon: 'M3 3h18v18H3z',
    description: '四角形を描画',
  },
  polygon: {
    id: 'polygon',
    label: '多角形',
    icon: 'M12 2l9 7-3.5 10h-11L3 9z',
    description: '多角形を描画',
  },
  polyline: {
    id: 'polyline',
    label: '折れ線',
    icon: 'M3 17l6-6 4 4 8-10',
    description: '折れ線を描画',
  },
  freehand: {
    id: 'freehand',
    label: 'フリーハンド',
    icon: 'M3 17c3 0 5-2 8-2s5 4 8 4M3 12c3 0 5-2 8-2s5 2 8 2',
    description: 'フリーハンドで描画',
  },
  text: {
    id: 'text',
    label: 'テキスト',
    icon: 'M4 6h16M12 6v14M8 6v2M16 6v2',
    description: 'テキストを追加',
  },
};

/**
 * ツールの表示順序
 */
const TOOL_ORDER: ToolType[] = [
  'select',
  'dimension',
  'arrow',
  'circle',
  'rectangle',
  'polygon',
  'polyline',
  'freehand',
  'text',
];

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  toolbar: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    overflowX: 'auto' as const,
  },
  button: {
    base: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '48px',
      minHeight: '48px',
      padding: '8px',
      border: '1px solid transparent',
      borderRadius: '6px',
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      outline: 'none',
    },
    active: {
      backgroundColor: '#3b82f6',
      borderColor: '#2563eb',
      color: '#ffffff',
    },
    inactive: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      color: '#374151',
    },
    hover: {
      backgroundColor: '#f3f4f6',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  icon: {
    width: '20px',
    height: '20px',
    marginBottom: '2px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * ツールボタンコンポーネント
 */
interface ToolButtonProps {
  tool: ToolDefinition;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ToolButton({ tool, isActive, disabled, onClick }: ToolButtonProps): React.JSX.Element {
  const buttonStyle: React.CSSProperties = {
    ...STYLES.button.base,
    ...(isActive ? STYLES.button.active : STYLES.button.inactive),
    ...(disabled ? STYLES.button.disabled : {}),
  };

  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={onClick}
      disabled={disabled}
      title={tool.description}
      aria-label={tool.label}
      aria-pressed={isActive}
      data-active={isActive ? 'true' : 'false'}
      data-tool={tool.id}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={STYLES.icon}
        aria-hidden="true"
      >
        <path d={tool.icon} />
      </svg>
      <span style={STYLES.label}>{tool.label}</span>
    </button>
  );
}

/**
 * 注釈ツールバーコンポーネント
 *
 * 注釈編集で使用する各種ツールの切り替えUIを提供します。
 *
 * Task 13.2: ツール切り替えUI
 * - ツールバーコンポーネント
 * - 選択ツール、寸法線、矢印、円、四角形、多角形、折れ線、フリーハンド、テキストの切り替え
 * - アクティブツールの視覚的フィードバック
 */
function AnnotationToolbar({
  activeTool,
  onToolChange,
  disabled = false,
}: AnnotationToolbarProps): React.JSX.Element {
  /**
   * ツールボタンクリックハンドラ
   */
  const handleToolClick = useCallback(
    (tool: ToolType) => {
      onToolChange(tool);
    },
    [onToolChange]
  );

  return (
    <div
      data-testid="annotation-toolbar"
      role="toolbar"
      aria-label="注釈ツール"
      style={STYLES.toolbar}
    >
      {TOOL_ORDER.map((toolId) => {
        const tool = TOOL_DEFINITIONS[toolId];
        const isActive = activeTool === toolId;

        return (
          <ToolButton
            key={toolId}
            tool={tool}
            isActive={isActive}
            disabled={disabled}
            onClick={() => handleToolClick(toolId)}
          />
        );
      })}
    </div>
  );
}

export default AnnotationToolbar;
