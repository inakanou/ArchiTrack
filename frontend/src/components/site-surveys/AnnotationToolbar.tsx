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
import {
  type ToolType,
  type ToolDefinition,
  type StyleOptions,
  TOOL_DEFINITIONS,
  TOOL_ORDER,
  DEFAULT_STYLE_OPTIONS,
} from './annotation-toolbar.constants';

// 型の再エクスポート（後方互換性のため）
export type { ToolType, ToolDefinition, StyleOptions };

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
  /** スタイルオプション */
  styleOptions?: StyleOptions;
  /** スタイル変更時のコールバック */
  onStyleChange?: (options: Partial<StyleOptions>) => void;
  /** Undo操作のコールバック */
  onUndo?: () => void;
  /** Redo操作のコールバック */
  onRedo?: () => void;
  /** 保存操作のコールバック */
  onSave?: () => void;
  /** エクスポート操作のコールバック */
  onExport?: () => void;
  /** Undoが可能かどうか */
  canUndo?: boolean;
  /** Redoが可能かどうか */
  canRedo?: boolean;
}

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
  separator: {
    width: '1px',
    height: '32px',
    backgroundColor: '#e5e7eb',
    margin: '0 8px',
  },
  stylePanel: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '12px',
    padding: '4px 8px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    marginLeft: '8px',
  },
  styleItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '2px',
  },
  styleLabel: {
    fontSize: '10px',
    color: '#6b7280',
    fontWeight: 500,
  },
  colorPicker: {
    width: '32px',
    height: '24px',
    padding: 0,
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  lineWidthInput: {
    width: '60px',
    height: '24px',
    padding: '0 4px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '6px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  actionButtonPrimary: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
    color: '#ffffff',
  },
  actionButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  actionButtonsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: 'auto',
    paddingLeft: '16px',
  },
  actionIcon: {
    width: '16px',
    height: '16px',
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
 * 描画ツールかどうかを判定
 */
const isDrawingTool = (tool: ToolType): boolean => {
  return tool !== 'select';
};

/**
 * スタイルパネルコンポーネント
 */
interface StylePanelProps {
  activeTool: ToolType;
  styleOptions: StyleOptions;
  onStyleChange: (options: Partial<StyleOptions>) => void;
  disabled: boolean;
}

function StylePanel({
  activeTool,
  styleOptions,
  onStyleChange,
  disabled,
}: StylePanelProps): React.JSX.Element | null {
  // スタイル変更ハンドラ（Hooksは条件分岐の前に呼び出す必要がある）
  const handleStrokeColorChange = useCallback(
    /* v8 ignore next */
    (e: React.ChangeEvent<HTMLInputElement>) => onStyleChange({ strokeColor: e.target.value }),
    [onStyleChange]
  );

  const handleStrokeWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onStyleChange({ strokeWidth: Number(e.target.value) }),
    [onStyleChange]
  );

  const handleFillColorChange = useCallback(
    /* v8 ignore next */
    (e: React.ChangeEvent<HTMLInputElement>) => onStyleChange({ fillColor: e.target.value }),
    [onStyleChange]
  );

  const handleFontSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onStyleChange({ fontSize: Number(e.target.value) }),
    [onStyleChange]
  );

  // 選択ツールの場合はスタイルパネルを表示しない
  if (!isDrawingTool(activeTool)) {
    return null;
  }

  const showLineOptions = activeTool !== 'text';
  const showFontOptions = activeTool === 'text';
  const showFillOptions = ['circle', 'rectangle', 'polygon'].includes(activeTool);

  return (
    <>
      {/* 区切り線 */}
      <div style={STYLES.separator} />

      {/* スタイルパネル */}
      <div style={STYLES.stylePanel} data-testid="style-options">
        {/* 線の色 */}
        {showLineOptions && (
          <div style={STYLES.styleItem}>
            <label style={STYLES.styleLabel}>色</label>
            <input
              type="color"
              value={styleOptions.strokeColor}
              onChange={handleStrokeColorChange}
              disabled={disabled}
              style={STYLES.colorPicker}
              data-testid="color-picker"
              aria-label="線の色"
            />
          </div>
        )}

        {/* 線の太さ */}
        {showLineOptions && (
          <div style={STYLES.styleItem}>
            <label style={STYLES.styleLabel}>線幅</label>
            <input
              type="number"
              value={styleOptions.strokeWidth}
              onChange={handleStrokeWidthChange}
              disabled={disabled}
              min={1}
              max={20}
              style={STYLES.lineWidthInput}
              data-testid="line-width"
              name="strokeWidth"
              aria-label="線の太さ"
            />
          </div>
        )}

        {/* 塗りつぶし色 */}
        {showFillOptions && (
          <div style={STYLES.styleItem}>
            <label style={STYLES.styleLabel}>塗りつぶし</label>
            <input
              type="color"
              value={styleOptions.fillColor || '#ffffff'}
              onChange={handleFillColorChange}
              disabled={disabled}
              style={STYLES.colorPicker}
              data-testid="fill-color-picker"
              aria-label="塗りつぶしの色"
            />
          </div>
        )}

        {/* フォントサイズ（テキスト用） */}
        {showFontOptions && (
          <>
            <div style={STYLES.styleItem}>
              <label style={STYLES.styleLabel}>文字色</label>
              <input
                type="color"
                value={styleOptions.strokeColor}
                onChange={handleStrokeColorChange}
                disabled={disabled}
                style={STYLES.colorPicker}
                data-testid="color-picker"
                aria-label="文字色"
              />
            </div>
            <div style={STYLES.styleItem}>
              <label style={STYLES.styleLabel}>サイズ</label>
              <input
                type="number"
                value={styleOptions.fontSize}
                onChange={handleFontSizeChange}
                disabled={disabled}
                min={8}
                max={72}
                style={STYLES.lineWidthInput}
                data-testid="font-size"
                name="fontSize"
                aria-label="フォントサイズ"
              />
            </div>
          </>
        )}
      </div>
    </>
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
  styleOptions = DEFAULT_STYLE_OPTIONS,
  onStyleChange,
  onUndo,
  onRedo,
  onSave,
  onExport,
  canUndo = true,
  canRedo = true,
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

  /**
   * スタイル変更ハンドラ
   */
  const handleStyleChange = useCallback(
    (options: Partial<StyleOptions>) => {
      if (onStyleChange) {
        onStyleChange(options);
      }
    },
    [onStyleChange]
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

      {/* スタイルオプションパネル */}
      <StylePanel
        activeTool={activeTool}
        styleOptions={styleOptions}
        onStyleChange={handleStyleChange}
        disabled={disabled}
      />

      {/* アクションボタン */}
      <div style={STYLES.actionButtonsContainer}>
        {/* Undoボタン */}
        <button
          type="button"
          style={{
            ...STYLES.actionButton,
            ...(disabled || !canUndo ? STYLES.actionButtonDisabled : {}),
          }}
          onClick={onUndo}
          disabled={disabled || !canUndo}
          aria-label="元に戻す"
          title="元に戻す (Ctrl+Z)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={STYLES.actionIcon}
            aria-hidden="true"
          >
            <path d="M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          元に戻す
        </button>

        {/* Redoボタン */}
        <button
          type="button"
          style={{
            ...STYLES.actionButton,
            ...(disabled || !canRedo ? STYLES.actionButtonDisabled : {}),
          }}
          onClick={onRedo}
          disabled={disabled || !canRedo}
          aria-label="やり直し"
          title="やり直し (Ctrl+Shift+Z)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={STYLES.actionIcon}
            aria-hidden="true"
          >
            <path d="M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
          やり直し
        </button>

        {/* 区切り線 */}
        <div style={STYLES.separator} />

        {/* 保存ボタン */}
        <button
          type="button"
          style={{
            ...STYLES.actionButton,
            ...STYLES.actionButtonPrimary,
            ...(disabled ? STYLES.actionButtonDisabled : {}),
          }}
          onClick={onSave}
          disabled={disabled}
          aria-label="保存"
          title="保存"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={STYLES.actionIcon}
            aria-hidden="true"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          保存
        </button>

        {/* エクスポートボタン */}
        <button
          type="button"
          style={{
            ...STYLES.actionButton,
            ...(disabled ? STYLES.actionButtonDisabled : {}),
          }}
          onClick={onExport}
          disabled={disabled}
          aria-label="エクスポート"
          title="画像をエクスポート"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={STYLES.actionIcon}
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          エクスポート
        </button>
      </div>
    </div>
  );
}

export default AnnotationToolbar;
