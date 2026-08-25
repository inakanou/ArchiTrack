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
 *
 * Task 115.70 (Req 26.4, 26.6): 本コンポーネントは本番の描画経路から一度も参照されていない
 * （実際に描かれるのは `AnnotationToolbar.tsx` が内包する同名の関数コンポーネント）。
 * セッション内のスタイル引継ぎ（要件26.4 / 26.6）の主張は、未結線の本部品ではなく
 * 実際に状態を保持する `AnnotationEditor`（`styleOptionsRef`）側へ移した。
 * 検証は `frontend/src/__tests__/components/site-surveys/AnnotationEditor.style-session.test.tsx`。
 *
 * Task 115.99 (Req 26.5): 色・線幅・フォントサイズの各プリセット配列に、資材
 * `annotation-style-tokens.ts` が定める既定値が含まれていなかった（線幅の既定 3 と
 * 本体色の既定 `#e53935` がいずれも並びに無く、既定状態ではどのプリセットも選択状態に
 * ならなかった）。既定値を literal で並べ直すと第二の供給元になるため、汎用パレットへ
 * 資材の既定値を合成する形でプリセットを構成する。
 * 検証は `frontend/src/__tests__/components/site-surveys/StylePanel.default-presets.test.tsx`。
 *
 * Task 115.151 (Req 26.5): 上の合成は重複判定を `toLowerCase()` で行い大小を無視する一方、
 * 選択状態の判定は素の等価比較で大小を区別していた。二系統の正規化が併存していたため、
 * 資材の既定色の**表記**が変わるだけで（例: `#FF0000` / `#f00`）既定状態の選択が消えるか、
 * 見分けのつかない色が二枚並ぶ。色の比較は `normalizeColorValue` 一本へ寄せた。
 * 検証は `frontend/src/__tests__/components/site-surveys/StylePanel.color-normalization.test.tsx`。
 *
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-26.3
 * @requirement site-survey/REQ-26.5
 * @requirement site-survey/REQ-28.7
 * @requirement site-survey/REQ-28.8
 * @requirement site-survey/REQ-29.1
 */

import React, { useCallback, useEffect, useState } from 'react';
import { type StyleOptions, DEFAULT_STYLE_OPTIONS } from './style-panel.constants';
import { ANNOTATION_DEFAULTS } from './annotation-style-tokens';
import type { ToolType } from './annotation-toolbar.constants';

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
  /**
   * 現在アクティブなツール (Req 24.5, 25.2, 28.8)
   *
   * 指定時、以下のツール別トグルを表示する:
   * - 'arrow': 「白縁取り」ON/OFF トグル (Req 24.5)
   * - 'text': 「白アウトライン」ON/OFF トグル (Req 25.2)
   *
   * 未指定時はツール別トグルを表示しない（後方互換）。
   */
  activeTool?: ToolType;
}

/**
 * (max-width: 768px) 判定のメディアクエリ文字列
 *
 * Req 28.8: モバイル幅では StylePanel を初期折りたたみ、デスクトップ幅では初期展開。
 */
const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

/**
 * モバイル幅かどうかを matchMedia で判定する
 *
 * SSR/テスト環境で `window.matchMedia` が存在しない場合は false を返す。
 */
const isMobileWidth = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
};

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 汎用パレット（線色・塗りつぶし色用）
 *
 * Task 115.99: 既定本体色そのものはここに持たない。既定値は
 * `ANNOTATION_DEFAULTS`（要件26.5 の設定資材）が単一の供給元であり、
 * ここへ literal を並べ直すと第二の供給元になるため。
 * `#ff0000` は純赤であって既定本体色 `#e53935` とは別の色である。
 */
const PALETTE_COLORS = [
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
 * 汎用の線の太さ候補
 */
const PALETTE_STROKE_WIDTHS = [1, 2, 4, 6, 8];

/**
 * 汎用のフォントサイズ候補
 */
const PALETTE_FONT_SIZES = [12, 14, 16, 18, 24, 32];

/**
 * 色の値を比較のための正準形へ正規化する（Req 26.5）
 *
 * Task 115.151: 従来はプリセットの合成側が `toLowerCase()` による大小無視の判定を、
 * 選択状態の判定側が素の等価比較（大小を区別）を、それぞれ別々に行っていた。
 * 資材 `annotation-style-tokens.ts` の既定色の表記が変わると、合成側が「既に含まれる」
 * と判断した色を選択判定側が別物と見なし、既定状態でどのプリセットも選択されなくなる。
 * 色の比較は本関数一本に寄せ、合成・重複排除・選択判定・表示のすべてが同じ正準形を見る。
 *
 * 正準形は「3桁記法を6桁へ展開し、小文字へ寄せた形」。`'transparent'` のような
 * `#` で始まらない値は小文字化のみ行う（`'transparent'` はそのまま `'transparent'`）。
 *
 * @param color 正規化前の色（HEX または `'transparent'`）
 * @returns 比較・表示に用いる正準形
 */
function normalizeColorValue(color: string): string {
  const lowered = color.toLowerCase();
  if (!lowered.startsWith('#')) return lowered;

  const hex = lowered.slice(1);
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return lowered;
}

/**
 * 二つの色が同じ色かを判定する（Req 26.5）
 *
 * Task 115.151: 色の等価判定を素の `===` で書くと、比較する両辺の表記が揃っている
 * という暗黙の前提が実装のあちこちへ散る。判定は必ず本関数を経由させる。
 */
function isSameColor(left: string, right: string): boolean {
  return normalizeColorValue(left) === normalizeColorValue(right);
}

/**
 * 既定の色を汎用パレットへ合成する（Req 26.5）
 *
 * Task 115.99: 既定本体色がプリセットの並びに無いと、パネルを既定状態で開いたとき
 * どのプリセットも選択状態にならない（選択判定は `isSameColor(normalizedStrokeColor, color)`）。
 * 既定値は資材から引き、パレットに無い場合のみ先頭へ加える。既に含まれる場合は
 * パレットの並びをそのまま保つ。
 *
 * Task 115.151: 並び全体を `normalizeColorValue` の正準形で持つ。合成した既定色を
 * 元の表記のまま置くと、選択判定側の正準形と一致せず選択状態が消える。
 * 正準形が重なる要素は取り除く（見分けのつかない色が二枚並ぶのを防ぐ。React の
 * `key` もこの並びの値である）。
 *
 * @param palette 汎用パレット
 * @param defaultColor 資材が定める既定色
 * @returns 既定色を必ず含む、正準形で重複の無いプリセット配列
 */
function withDefaultColor(palette: readonly string[], defaultColor: string): string[] {
  const normalizedDefault = normalizeColorValue(defaultColor);
  const normalizedPalette = palette.map((color) => normalizeColorValue(color));
  const merged = normalizedPalette.includes(normalizedDefault)
    ? normalizedPalette
    : [normalizedDefault, ...normalizedPalette];
  return [...new Set(merged)];
}

/**
 * 既定の数値を汎用候補へ合成する（Req 26.5）
 *
 * Task 115.99: 線幅・フォントサイズも色と同じ理由で既定値を含める必要がある。
 * 数値は大小の並びに意味があるため、加えたうえで昇順に整列する。
 *
 * @param palette 汎用候補
 * @param defaultValue 資材が定める既定値
 * @returns 既定値を必ず含む昇順のプリセット配列
 */
function withDefaultSize(palette: readonly number[], defaultValue: number): number[] {
  const merged = palette.includes(defaultValue) ? [...palette] : [...palette, defaultValue];
  return merged.sort((a, b) => a - b);
}

/**
 * プリセットカラー（線色・塗りつぶし色用）
 *
 * 既定本体色（`ANNOTATION_DEFAULTS.stroke`）を必ず含む。
 * 塗りつぶしの既定は透明であり、その選択状態は「塗りつぶしなし」ボタンが示す。
 */
const PRESET_COLORS = withDefaultColor(PALETTE_COLORS, ANNOTATION_DEFAULTS.stroke);

/**
 * プリセット線の太さ
 *
 * 既定線幅（`ANNOTATION_DEFAULTS.strokeWidth`）を必ず含む。
 */
const PRESET_STROKE_WIDTHS = withDefaultSize(
  PALETTE_STROKE_WIDTHS,
  ANNOTATION_DEFAULTS.strokeWidth
);

/**
 * プリセットフォントサイズ
 *
 * 既定フォントサイズ（`ANNOTATION_DEFAULTS.fontSize`）を必ず含む。
 */
const PRESET_FONT_SIZES = withDefaultSize(PALETTE_FONT_SIZES, ANNOTATION_DEFAULTS.fontSize);

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
  /**
   * Task 70.3 (Req 28.7): モバイル幅ではタップ誤選択抑止のため
   * プリセットコンテナ (色/線幅/フォントサイズ) の gap を 8px 以上に拡張する。
   * デスクトップ幅では従来の密な 4px レイアウトを維持する。
   */
  presetContainerMobile: {
    gap: '8px',
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
  // Task 70.2 (Req 28.8): 開閉トグル用スタイル
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  },
  collapseButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    minHeight: '32px',
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  // Task 70.2 (Req 24.5, 25.2): 白縁取り/白アウトライントグルセクション
  outlineSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  outlineToggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
  },
  outlineToggleCheckbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
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
  activeTool,
}: StylePanelProps): React.JSX.Element {
  /**
   * 開閉状態 (Req 28.8)
   *
   * 初期値はマウント時の `matchMedia('(max-width: 768px)')` で決まる:
   * - モバイル幅 (matches=true): 初期折りたたみ (collapsed=true)
   * - デスクトップ幅 (matches=false): 初期展開 (collapsed=false)
   *
   * ツール再タップによるトグル等、親側からの制御は 70.2 スコープ外のため
   * 本コンポーネント内部 state として保持する（親側からのリセット不要）。
   */
  const [collapsed, setCollapsed] = useState<boolean>(() => isMobileWidth());

  /**
   * モバイル幅かどうかのフラグ (Req 28.7)
   *
   * プリセットコンテナのタップ領域間 gap をモバイル幅で 8px 以上に拡張するために使う。
   * 端末回転やブラウザ幅変更に追従できるよう、resize イベントで再評価する。
   */
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileWidth());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = (): void => {
      setIsMobile(isMobileWidth());
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  /**
   * 折りたたみ/展開トグル (Req 28.8)
   */
  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  /**
   * 矢印白縁取りトグル変更ハンドラ (Req 24.5)
   */
  const handleArrowOutlineToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onStyleChange({
        ...styleOptions,
        arrowOutlineEnabled: event.target.checked,
      });
    },
    [styleOptions, onStyleChange]
  );

  /**
   * テキスト白アウトライントグル変更ハンドラ (Req 25.2)
   */
  const handleTextOutlineToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onStyleChange({
        ...styleOptions,
        textOutlineEnabled: event.target.checked,
      });
    },
    [styleOptions, onStyleChange]
  );
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
  // Task 115.151: 表示も選択判定も `normalizeColorValue` の正準形だけを見る
  const normalizedStrokeColor = normalizeColorValue(styleOptions.strokeColor);
  const normalizedFillColor = normalizeColorValue(styleOptions.fillColor);
  const normalizedFontColor = normalizeColorValue(styleOptions.fontColor);
  const fillIsTransparent = isSameColor(normalizedFillColor, 'transparent');

  // 白縁取り / 白アウトラインの現在値（未指定時は既定を採用）
  const arrowOutlineEnabled =
    styleOptions.arrowOutlineEnabled ?? ANNOTATION_DEFAULTS.arrowOutline.enabled;
  const textOutlineEnabled =
    styleOptions.textOutlineEnabled ?? ANNOTATION_DEFAULTS.textOutline.enabled;

  const showArrowOutlineToggle = activeTool === 'arrow';
  const showTextOutlineToggle = activeTool === 'text';

  return (
    <div data-testid="style-panel" role="group" aria-label="スタイル設定" style={STYLES.panel}>
      {/* ヘッダー: タイトル + 折りたたみ/展開トグル (Req 28.8) */}
      <div style={STYLES.headerRow}>
        <span style={STYLES.headerTitle}>スタイル</span>
        <button
          type="button"
          onClick={handleToggleCollapse}
          disabled={disabled}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'スタイルパネルを展開' : 'スタイルパネルを折りたたむ'}
          title={collapsed ? 'スタイルパネルを展開' : 'スタイルパネルを折りたたむ'}
          data-testid="style-panel-collapse-toggle"
          style={{
            ...STYLES.collapseButton,
            ...(disabled ? STYLES.disabledStyle : {}),
          }}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {/* 白縁取り / 白アウトライントグル (Req 24.5, 25.2) */}
      {!collapsed && (showArrowOutlineToggle || showTextOutlineToggle) && (
        <div data-testid="outline-toggle-section" style={STYLES.outlineSection}>
          <span style={STYLES.sectionTitle}>アウトライン設定</span>
          {showArrowOutlineToggle && (
            <label style={STYLES.outlineToggleLabel} htmlFor="arrow-outline-toggle">
              <input
                id="arrow-outline-toggle"
                type="checkbox"
                checked={arrowOutlineEnabled}
                onChange={handleArrowOutlineToggle}
                disabled={disabled}
                style={STYLES.outlineToggleCheckbox}
                data-testid="arrow-outline-toggle"
                aria-label="白縁取り"
              />
              白縁取り
            </label>
          )}
          {showTextOutlineToggle && (
            <label style={STYLES.outlineToggleLabel} htmlFor="text-outline-toggle">
              <input
                id="text-outline-toggle"
                type="checkbox"
                checked={textOutlineEnabled}
                onChange={handleTextOutlineToggle}
                disabled={disabled}
                style={STYLES.outlineToggleCheckbox}
                data-testid="text-outline-toggle"
                aria-label="白アウトライン"
              />
              白アウトライン
            </label>
          )}
        </div>
      )}

      {!collapsed && (
        <>
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
              <div
                data-testid="stroke-color-presets"
                style={{
                  ...STYLES.presetContainer,
                  ...(isMobile ? STYLES.presetContainerMobile : {}),
                }}
              >
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
                      ...(isSameColor(normalizedStrokeColor, color)
                        ? STYLES.presetButtonActive
                        : {}),
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
                  value={fillIsTransparent ? '#ffffff' : normalizedFillColor}
                  onChange={handleFillColorChange}
                  disabled={disabled}
                  style={{
                    ...STYLES.colorInput,
                    ...(disabled ? STYLES.disabledStyle : {}),
                  }}
                />
                <span style={STYLES.colorValue}>
                  {fillIsTransparent ? 'なし' : normalizedFillColor}
                </span>
              </div>
              <div
                data-testid="fill-color-presets"
                style={{
                  ...STYLES.presetContainer,
                  ...(isMobile ? STYLES.presetContainerMobile : {}),
                }}
              >
                <button
                  type="button"
                  onClick={handleNoFill}
                  disabled={disabled}
                  title="塗りつぶしなし"
                  style={{
                    ...STYLES.noFillButton,
                    ...(fillIsTransparent ? STYLES.presetButtonActive : {}),
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
                      ...(isSameColor(normalizedFillColor, color) ? STYLES.presetButtonActive : {}),
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
              <div
                data-testid="stroke-width-preset-container"
                style={{
                  ...STYLES.presetContainer,
                  ...(isMobile ? STYLES.presetContainerMobile : {}),
                }}
              >
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
              <div
                data-testid="font-size-preset-container"
                style={{
                  ...STYLES.presetContainer,
                  ...(isMobile ? STYLES.presetContainerMobile : {}),
                }}
              >
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
        </>
      )}
    </div>
  );
}

export default StylePanel;
