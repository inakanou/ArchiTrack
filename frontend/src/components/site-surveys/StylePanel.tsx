/**
 * @fileoverview スタイル設定パネルコンポーネント
 *
 * Task 13.4: スタイル設定パネルを実装する
 *
 * 色選択（線色、塗りつぶし色）、線の太さ設定、フォントサイズ設定（テキスト用）
 * を提供するコンポーネントです。
 *
 * Requirements:
 * - 6.7: 寸法線の色・線の太さをカスタマイズ可能にする
 * - 7.10: 図形の色・線の太さ・塗りつぶしをカスタマイズ可能にする
 * - 8.5: テキストのフォントサイズ・色・背景色をカスタマイズ可能にする
 */

import React, { useCallback } from 'react';
import { type StyleOptions, DEFAULT_STYLE_OPTIONS } from './style-panel.constants';

// 型と定数の再エクスポート（後方互換性のため）
export type { StyleOptions };

export { DEFAULT_STYLE_OPTIONS };

/**
 * StylePanelのProps
 */
export interface StylePanelProps {
  /** 現在のスタイル設定 */
  styleOptions: StyleOptions;
  /** スタイル変更時のコールバック */
  onStyleChange: (options: StyleOptions) => void;
  /** 無効化フラグ */
  disabled?: boolean;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * プリセットカラー（線色・塗りつぶし色用）
 */
const PRESET_COLORS = [
  '#000000', // 黒
  '#ffffff', // 白
  '#ff0000', // 赤
  '#00ff00', // 緑
  '#0000ff', // 青
  '#ffff00', // 黄
  '#ff00ff', // マゼンタ
  '#00ffff', // シアン
  '#ff6600', // オレンジ
  '#9900ff', // 紫
];

/**
 * プリセット線の太さ
 */
const PRESET_STROKE_WIDTHS = [1, 2, 4, 6, 8];

/**
 * プリセットフォントサイズ
 */
const PRESET_FONT_SIZES = [12, 14, 16, 18, 24, 32];

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    padding: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    minWidth: '240px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },
  colorInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  colorInput: {
    width: '40px',
    height: '32px',
    padding: '2px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
  },
  colorValue: {
    fontSize: '12px',
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  presetContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  presetButton: {
    width: '24px',
    height: '24px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
    transition: 'transform 0.1s ease',
  },
  presetButtonActive: {
    border: '2px solid #2563eb', // WCAG 2.1 AA準拠: 5.2:1 contrast ratio with #fff
    transform: 'scale(1.1)',
  },
  noFillButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
    backgroundColor: '#ffffff',
    fontSize: '10px',
    color: '#6b7280',
    transition: 'transform 0.1s ease',
  },
  sliderWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  slider: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    outline: 'none',
    cursor: 'pointer',
  },
  valueDisplay: {
    minWidth: '32px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    textAlign: 'right' as const,
  },
  presetWidthButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    height: '28px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '4px 8px',
    backgroundColor: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    color: '#374151',
    transition: 'all 0.15s ease',
  },
  presetWidthButtonActive: {
    backgroundColor: '#2563eb', // WCAG 2.1 AA準拠: 5.2:1 contrast ratio with #fff
    borderColor: '#1d4ed8',
    color: '#ffffff',
  },
  numberInput: {
    width: '60px',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  disabledStyle: {
    backgroundColor: '#e5e7eb',
    color: '#525b6a', // WCAG 2.1 AA準拠: 5.0:1 contrast ratio on #e5e7eb
    cursor: 'not-allowed',
  },
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * スタイル設定パネルコンポーネント
 *
 * 注釈エディタで使用するスタイル設定（色、線の太さ、フォントサイズ）を
 * ユーザーが調整するためのUIを提供します。
 *
 * Task 13.4: スタイル設定パネル
 * - 色選択（線色、塗りつぶし色）
 * - 線の太さ設定
 * - フォントサイズ設定（テキスト用）
 */
function StylePanel({
  styleOptions,
  onStyleChange,
  disabled = false,
}: StylePanelProps): React.JSX.Element {
  /**
   * HEX色コードを正規化（3桁を6桁に変換）
   */
  const normalizeHexColor = useCallback((color: string): string => {
    // 'transparent'の場合はそのまま返す
    if (color === 'transparent') return color;

    // #で始まる場合
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      // 3桁の場合、6桁に変換
      if (hex.length === 3) {
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
      }
      return color;
    }
    return color;
  }, []);

  /**
   * 線色変更ハンドラ
   */
  const handleStrokeColorChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onStyleChange({
        ...styleOptions,
        strokeColor: event.target.value,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * 塗りつぶし色変更ハンドラ
   */
  const handleFillColorChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onStyleChange({
        ...styleOptions,
        fillColor: event.target.value,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * 塗りつぶしなし設定ハンドラ
   */
  const handleNoFill = useCallback(() => {
    onStyleChange({
      ...styleOptions,
      fillColor: 'transparent',
    });
  }, [styleOptions, onStyleChange]);

  /**
   * 線の太さ変更ハンドラ
   */
  const handleStrokeWidthChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(event.target.value, 10);
      if (!isNaN(value)) {
        onStyleChange({
          ...styleOptions,
          strokeWidth: Math.max(1, Math.min(20, value)),
        });
      }
    },
    [styleOptions, onStyleChange]
  );

  /**
   * フォントサイズ変更ハンドラ
   */
  const handleFontSizeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(event.target.value, 10);
      if (!isNaN(value)) {
        onStyleChange({
          ...styleOptions,
          fontSize: Math.max(8, Math.min(72, value)),
        });
      }
    },
    [styleOptions, onStyleChange]
  );

  /**
   * 文字色変更ハンドラ
   */
  const handleFontColorChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onStyleChange({
        ...styleOptions,
        fontColor: event.target.value,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * プリセット線色クリックハンドラ
   */
  const handleStrokePresetClick = useCallback(
    (color: string) => {
      onStyleChange({
        ...styleOptions,
        strokeColor: color,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * プリセット塗りつぶし色クリックハンドラ
   */
  const handleFillPresetClick = useCallback(
    (color: string) => {
      onStyleChange({
        ...styleOptions,
        fillColor: color,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * プリセット線の太さクリックハンドラ
   */
  const handleStrokeWidthPresetClick = useCallback(
    (width: number) => {
      onStyleChange({
        ...styleOptions,
        strokeWidth: width,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * プリセットフォントサイズクリックハンドラ
   */
  const handleFontSizePresetClick = useCallback(
    (size: number) => {
      onStyleChange({
        ...styleOptions,
        fontSize: size,
      });
    },
    [styleOptions, onStyleChange]
  );

  // 正規化された色の値
  const normalizedStrokeColor = normalizeHexColor(styleOptions.strokeColor);
  const normalizedFillColor = normalizeHexColor(styleOptions.fillColor);
  const normalizedFontColor = normalizeHexColor(styleOptions.fontColor);

  return (
    <div data-testid="style-panel" role="group" aria-label="スタイル設定" style={STYLES.panel}>
      {/* 色設定セクション */}
      <div data-testid="color-settings-section" style={STYLES.section}>
        <span style={STYLES.sectionTitle}>色設定</span>

        {/* 線色 */}
        <div style={STYLES.fieldGroup}>
          <label htmlFor="stroke-color" style={STYLES.label}>
            線色
          </label>
          <div style={STYLES.colorInputWrapper}>
            <input
              id="stroke-color"
              type="color"
              value={normalizedStrokeColor}
              onChange={handleStrokeColorChange}
              disabled={disabled}
              style={{
                ...STYLES.colorInput,
                ...(disabled ? STYLES.disabledStyle : {}),
              }}
            />
            <span style={STYLES.colorValue}>{normalizedStrokeColor}</span>
          </div>
          <div data-testid="stroke-color-presets" style={STYLES.presetContainer}>
            {PRESET_COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                data-testid={`stroke-preset-${index}`}
                onClick={() => handleStrokePresetClick(color)}
                disabled={disabled}
                title={color}
                style={{
                  ...STYLES.presetButton,
                  backgroundColor: color,
                  ...(normalizedStrokeColor === color ? STYLES.presetButtonActive : {}),
                  ...(disabled ? STYLES.disabledStyle : {}),
                }}
                aria-label={`線色プリセット ${color}`}
              />
            ))}
          </div>
        </div>

        {/* 塗りつぶし色 */}
        <div style={STYLES.fieldGroup}>
          <label htmlFor="fill-color" style={STYLES.label}>
            塗りつぶし
          </label>
          <div style={STYLES.colorInputWrapper}>
            <input
              id="fill-color"
              type="color"
              value={normalizedFillColor === 'transparent' ? '#ffffff' : normalizedFillColor}
              onChange={handleFillColorChange}
              disabled={disabled}
              style={{
                ...STYLES.colorInput,
                ...(disabled ? STYLES.disabledStyle : {}),
              }}
            />
            <span style={STYLES.colorValue}>
              {normalizedFillColor === 'transparent' ? 'なし' : normalizedFillColor}
            </span>
          </div>
          <div data-testid="fill-color-presets" style={STYLES.presetContainer}>
            <button
              type="button"
              onClick={handleNoFill}
              disabled={disabled}
              title="塗りつぶしなし"
              style={{
                ...STYLES.noFillButton,
                ...(normalizedFillColor === 'transparent' ? STYLES.presetButtonActive : {}),
                ...(disabled ? STYLES.disabledStyle : {}),
              }}
              aria-label="塗りつぶしなし"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="1" y1="11" x2="11" y2="1" stroke="#dc2626" strokeWidth="1.5" />
              </svg>
            </button>
            {PRESET_COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                data-testid={`fill-preset-${index}`}
                onClick={() => handleFillPresetClick(color)}
                disabled={disabled}
                title={color}
                style={{
                  ...STYLES.presetButton,
                  backgroundColor: color,
                  ...(normalizedFillColor === color ? STYLES.presetButtonActive : {}),
                  ...(disabled ? STYLES.disabledStyle : {}),
                }}
                aria-label={`塗りつぶしプリセット ${color}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 線設定セクション */}
      <div data-testid="stroke-settings-section" style={STYLES.section}>
        <span style={STYLES.sectionTitle}>線設定</span>

        {/* 線の太さ */}
        <div style={STYLES.fieldGroup}>
          <label htmlFor="stroke-width" style={STYLES.label}>
            線の太さ
          </label>
          <div style={STYLES.sliderWrapper}>
            <input
              id="stroke-width"
              type="range"
              min="1"
              max="20"
              step="1"
              value={styleOptions.strokeWidth}
              onChange={handleStrokeWidthChange}
              disabled={disabled}
              style={{
                ...STYLES.slider,
                ...(disabled ? STYLES.disabledStyle : {}),
              }}
              aria-valuemin={1}
              aria-valuemax={20}
              aria-valuenow={styleOptions.strokeWidth}
            />
            <span data-testid="stroke-width-value" style={STYLES.valueDisplay}>
              {styleOptions.strokeWidth}
            </span>
          </div>
          <div style={STYLES.presetContainer}>
            {PRESET_STROKE_WIDTHS.map((width) => (
              <button
                key={width}
                type="button"
                data-testid={`stroke-width-preset-${width}`}
                onClick={() => handleStrokeWidthPresetClick(width)}
                disabled={disabled}
                title={`太さ: ${width}px`}
                style={{
                  ...STYLES.presetWidthButton,
                  ...(styleOptions.strokeWidth === width ? STYLES.presetWidthButtonActive : {}),
                  ...(disabled ? STYLES.disabledStyle : {}),
                }}
                aria-label={`線の太さ ${width}px`}
              >
                {width}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* テキスト設定セクション */}
      <div data-testid="text-settings-section" style={STYLES.section}>
        <span style={STYLES.sectionTitle}>テキスト設定</span>

        {/* フォントサイズ */}
        <div style={STYLES.fieldGroup}>
          <label htmlFor="font-size" style={STYLES.label}>
            フォントサイズ
          </label>
          <div style={STYLES.sliderWrapper}>
            <input
              id="font-size"
              type="number"
              min="8"
              max="72"
              value={styleOptions.fontSize}
              onChange={handleFontSizeChange}
              disabled={disabled}
              style={{
                ...STYLES.numberInput,
                ...(disabled ? STYLES.disabledStyle : {}),
              }}
            />
            <span style={{ ...STYLES.label, marginLeft: '4px' }}>px</span>
          </div>
          <div style={STYLES.presetContainer}>
            {PRESET_FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                data-testid={`font-size-preset-${size}`}
                onClick={() => handleFontSizePresetClick(size)}
                disabled={disabled}
                title={`${size}px`}
                style={{
                  ...STYLES.presetWidthButton,
                  ...(styleOptions.fontSize === size ? STYLES.presetWidthButtonActive : {}),
                  ...(disabled ? STYLES.disabledStyle : {}),
                }}
                aria-label={`フォントサイズ ${size}px`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* 文字色 */}
        <div style={STYLES.fieldGroup}>
          <label htmlFor="font-color" style={STYLES.label}>
            文字色
          </label>
          <div style={STYLES.colorInputWrapper}>
            <input
              id="font-color"
              type="color"
              value={normalizedFontColor}
              onChange={handleFontColorChange}
              disabled={disabled}
              style={{
                ...STYLES.colorInput,
                ...(disabled ? STYLES.disabledStyle : {}),
              }}
            />
            <span style={STYLES.colorValue}>{normalizedFontColor}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StylePanel;
