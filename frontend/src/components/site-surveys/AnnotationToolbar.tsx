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
 *
 * @requirement site-survey/REQ-28.1
 * @requirement site-survey/REQ-28.2
 * @requirement site-survey/REQ-28.3
 * @requirement site-survey/REQ-28.4
 * @requirement site-survey/REQ-28.5
 * @requirement site-survey/REQ-28.6
 * @requirement site-survey/REQ-36.3
 * @requirement site-survey/REQ-36.5
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-32.5
 * @requirement site-survey/REQ-8.5
 * @requirement site-survey/REQ-8.6
 * @requirement site-survey/REQ-28.8
 * @requirement site-survey/REQ-29.6
 * @requirement site-survey/REQ-15.2
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useMediaQuery from '../../hooks/useMediaQuery';
// 長押しの判定時間は本番の一元管理された閾値を参照する（Req 27.6 と同一値）。
import { LONG_PRESS_MS } from './gestures/gesture-thresholds';
import { MEDIA_QUERIES } from '../../utils/responsive';
import {
  type ToolType,
  type ToolDefinition,
  type StyleOptions,
  type OutlineCapableTool,
  type BalloonStyleType,
  TOOL_DEFINITIONS,
  TOOL_ORDER,
  DEFAULT_STYLE_OPTIONS,
} from './annotation-toolbar.constants';
import { TAP_TARGET_MIN_PX } from './tap-target.constants';

// 型の再エクスポート（後方互換性のため）
export type { ToolType, ToolDefinition, StyleOptions, OutlineCapableTool, BalloonStyleType };

/**
 * 吹き出し形式の選択肢 (Req 8.6)
 *
 * 値は `BalloonStyleType` の全要素をちょうど網羅する。
 */
const BALLOON_STYLE_CHOICES: ReadonlyArray<{ value: BalloonStyleType; label: string }> = [
  { value: 'none', label: 'なし' },
  { value: 'rectangle', label: '四角' },
  { value: 'rounded', label: '角丸' },
  { value: 'ellipse', label: '楕円' },
  { value: 'cloud', label: '雲' },
];

/**
 * 背景色を「あり」に切替えた際に用いる初期色 (Req 8.5)
 *
 * 背景の既定は透明であり、色そのものを持たない。切替で色が必要になるため、
 * 最初の 1 回だけこの値を用いる（以降はユーザーが選んだ色を覚える）。
 */
const TEXT_BACKGROUND_FALLBACK_COLOR = '#ffffff';

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
  /**
   * 保存だけを抑止するフラグ（Task 115.105 / Req 15.6）
   *
   * 通信断のようにサーバー保存だけが成立しない状況で用いる。
   * `disabled` と異なり描画ツールやエクスポートは操作可能なまま保つ。
   * また `disabled` 属性ではなく `aria-disabled` で表すため押下自体は成立し、
   * 押下時には呼び出し側（AnnotationEditor.handleSave）が理由を提示して抑止する。
   */
  saveDisabled?: boolean;
  /** 保存が抑止されているときにボタンへ添える理由（title 用） */
  saveDisabledReason?: string;
  /** エクスポート操作のコールバック */
  onExport?: () => void;
  /** Undoが可能かどうか */
  canUndo?: boolean;
  /** Redoが可能かどうか */
  canRedo?: boolean;
  /** 回転操作のコールバック (Req 22.1) */
  onRotate?: () => void;
  /**
   * 選択中ツールを再タップした際のコールバック (Req 28.8)
   *
   * 現在の `activeTool` と同じツールボタンがクリックされた場合のみ発火する。
   * 親（AnnotationEditor）はこのコールバックを使って StylePanel の開閉をトグルする。
   * 省略時は発火しない（後方互換: 再タップは従来通り `onToolChange` のみ発火）。
   */
  onActiveToolReTap?: () => void;
  /**
   * 詳細属性パネル（StylePanel）を表示するか (Req 28.8)
   *
   * 親（AnnotationEditor）が `onActiveToolReTap` と対で与える開閉状態。
   * 省略時は従来どおり常に表示する（後方互換）。
   */
  stylePanelVisible?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

// タップ領域の下限（要件28.3 の 44）は `./tap-target.constants` が唯一の宣言元である。
// 道具のボタン（`button.base`）とモバイル幅の各項目（`mobileTapTarget`）が同じ値を参照する。
// 検証側が同じ値を自前で持つ理由も当該モジュールに書いてある。
const STYLES = {
  toolbar: {
    display: 'flex',
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    overflowX: 'auto' as const,
    // Req 28.6: ツールバー領域内のタップ/クリックが背景 canvas への描画として
    // 誤発火しないよう、明示的なポインタ境界を確立する
    pointerEvents: 'auto' as const,
  },
  // Req 36.3 / 36.5: モバイル幅ではツールバーを単段化し、縦方向の占有を抑えて
  // 画像作業領域の縦高を確保する。折返し（wrap）による多段化を止め、
  // 既存の overflowX: 'auto' による横スクロールで全項目へ到達させる。
  toolbarMobile: {
    flexWrap: 'nowrap' as const,
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
  // Req 36.5: 単段（nowrap）では flex アイテムが既定で縮む（flex-shrink:1）。
  // スタイルパネルは最小幅の floor を持たないため潰れてしまう。潰さずに
  // 横スクロールへあふれさせるため flexShrink: 0 を付与する。
  stylePanelMobile: {
    flexShrink: 0,
  },
  styleItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '2px',
  },
  // Req 36.5: モバイル幅では見出しを操作要素の「上」ではなく「横」へ置く。
  //
  // 各項目を 44 へ広げる（`mobileTapTarget`）と、見出しを積んだ縦並びのままでは
  // 1 項目の高さが「見出し + 間隔 + 44」になり、道具のボタン（44）より高くなる。
  // 単段のツールバーの高さは最も高い項目で決まるため、そのままではツールバーの縦占有が
  // 増え、要件36.5（ツールバーが縦方向の表示領域を過度に占有しない）と衝突する。
  // 横並びにすると項目の高さは 44 に収まり、道具のボタンの実高（アイコン + 見出し + padding。
  // 375x667 の実測で 55）を超えないため、ツールバーの高さは変わらない。増えるのは横幅だけ
  // であり、単段の横スクロール（Req 28.2）が吸収する。
  //
  // 実測（375x667。Task 115.170 が E2E で計測）: 本定義を外すとツールバーの高さは
  // 71 から 85 へ増える。本定義を効かせている限り、属性パネルを開いても 71 のまま変わらない。
  styleItemMobile: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '6px',
  },
  // Req 28.3: モバイル幅ツールバーの「各項目」のタップ領域の下限。
  //
  // 適用範囲は Task 115.170 で決着させた。条文の「各項目」を文字どおり読み、道具のボタン
  // だけでなく属性パネルの操作要素（切替・色・線幅・文字サイズ・吹き出し）とアクション
  // ボタンにも課す。従前は `button.base` だけが 44 を持ち、色 32x24・線幅 60x24・
  // 吹き出し 高さ24・アクションボタン 高さ32（実測）と、道具のボタン以外は 44 に届いていな
  // かった。
  //
  // タップ領域を「見た目の寸法そのもの」で確保する（擬似要素や重ね合わせで当たり判定だけを
  // 広げない）。対象の多くが `input[type=color|number|checkbox]` と `select` という置換要素で
  // あり、置換要素では `::before` / `::after` が描かれないため当たり判定だけを広げる手が
  // 使えない。負のマージンで重ねる手は隣の項目と当たり判定が重なり、要件28.7（誤選択しにくい
  // 間隔）を損なう。見た目＝当たり判定にしておくと、検証が測る矩形（getBoundingClientRect）が
  // そのまま指の当たる領域になり、「実際には押せない領域を測って緑になる」ことも起きない。
  //
  // `width` / `height` を持つ定義（色 32x24 等）と併用する。CSS では `min-width` /
  // `min-height` が `width` / `height` に優先するため、上書きの順序に依らず 44 が下限になる。
  // 44 を超える寸法（線幅の入力の幅 60）はそのまま残る。
  //
  // デスクトップ幅へは課さない。要件28.3 が対象を「モバイル幅ツールバー」と限っているため。
  mobileTapTarget: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
  },
  // 属性パネルの見出しの体裁。
  //
  // Task 115.202: **見出しは必ず `htmlFor` で対応する操作要素へ結び付けること**（項目を足す
  // ときの規約）。従前は 9 つのうち 3 つしか `htmlFor` を持たず、残る 6 つ（色・線幅・
  // 塗りつぶし・文字色・サイズ・背景色）は押しても何も起きない不活性な文字だった。
  // モバイル幅では見出しが操作要素と同じ 44px の行に横並びで置かれる（`styleItemMobile`）
  // ため、行の左半分に触れた指が無反応になる（要件28.3 のタップ領域を実質的に削る）。
  // 操作要素側の `aria-label` は accname 仕様上 `<label for>` に優先するため、結び付けても
  // 読み上げ名は変わらない。検証は
  // `AnnotationToolbar.style-label-association.test.tsx` と
  // `site-survey-outline-toggle.spec.ts` の (g)。
  styleLabel: {
    fontSize: '10px',
    color: '#525b6a', // WCAG 2.1 AA準拠: 5.5:1 contrast ratio on #f9fafb
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
  // 切替の寸法（デスクトップ幅）。Task 115.148 が 18x18 から隣接要素と同じ 32x24 へ広げた。
  // 従前は隣接する色の選択（32x24）・線幅の入力（60x24）・吹き出しの選択（高さ 24）の
  // いずれよりも小さく、隣より小さい操作要素は押し間違いを招いていた。
  //
  // モバイル幅ではこの値の上に `mobileTapTarget` が重なり、44x44 まで広がる（Req 28.3）。
  //
  // 本定義は白縁取り（白アウトライン）の切替と文字の背景の切替が共有する。片方だけ広げると
  // 隣り合う切替どうしで同じ欠陥が再発するため、両方へ効かせる。
  outlineToggleCheckbox: {
    width: '32px',
    height: '24px',
    margin: 0,
    cursor: 'pointer',
  },
  balloonStyleSelect: {
    height: '24px',
    padding: '0 4px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
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
    backgroundColor: '#2563eb', // WCAG 2.1 AA準拠: 5.2:1 contrast ratio with #fff
    borderColor: '#1d4ed8',
    color: '#ffffff',
  },
  actionButtonDisabled: {
    backgroundColor: '#6b7280',
    borderColor: '#6b7280',
    color: '#ffffff',
    cursor: 'not-allowed',
  },
  actionButtonsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: 'auto',
    paddingLeft: '16px',
  },
  // Req 36.5: 単段（nowrap）横スクロール前提では、末尾要素の marginLeft:'auto' は
  // 余白の押し出しが不定になり、かつ最小幅の floor を持たないため潰れる。
  // marginLeft を解除しつつ flexShrink: 0 で潰さず横スクロールへあふれさせる。
  actionButtonsContainerMobile: {
    flexShrink: 0,
    marginLeft: 0,
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
      // Req 28.3 / design.md AnnotationToolbar (ext): 44x44 論理ピクセルに統一
      minWidth: `${TAP_TARGET_MIN_PX}px`,
      minHeight: `${TAP_TARGET_MIN_PX}px`,
      padding: '8px',
      border: '1px solid transparent',
      borderRadius: '6px',
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      outline: 'none',
    },
    active: {
      backgroundColor: '#2563eb', // WCAG 2.1 AA準拠: 5.2:1 contrast ratio with #fff
      borderColor: '#1d4ed8',
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
      backgroundColor: '#e5e7eb',
      color: '#525b6a', // WCAG 2.1 AA準拠: 5.0:1 contrast ratio on #e5e7eb
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
  // ツールヒント (Req 29.6)。ツールバーは `overflowX: 'auto'` を持つため、
  // 内側に絶対配置するとはみ出した分が切り取られる。body 直下へ Portal で描き、
  // `position: 'fixed'` でボタンの位置に合わせる。
  tooltip: {
    position: 'fixed' as const,
    zIndex: 2000,
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    maxWidth: '220px',
    padding: '6px 10px',
    borderRadius: '6px',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
    pointerEvents: 'none' as const,
  },
  tooltipTitle: {
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  tooltipDescription: {
    fontSize: '11px',
    lineHeight: 1.4,
  },
};

/** ツールヒントをボタンの下に置くときの間隔（ピクセル, Req 29.6） */
const TOOLTIP_GAP_PX = 8;

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

  // ------------------------------------------------------------------
  // 長押しによるツールヒント表示 (Task 115.104 / Req 29.6)
  //
  // `title` 属性はマウスホバーでしか現れず、指で操作する現場端末では説明に到達できない。
  // 押し当てたまま `LONG_PRESS_MS` 経過したらヒントを出し、指を離す・外れる・
  // ブラウザが操作を打ち切った時点で消す。判定時間はタッチ操作の一元管理された閾値を使う。
  // ------------------------------------------------------------------
  const buttonRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(
    null
  );
  const tooltipId = `annotation-tool-tooltip-${tool.id}`;

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      const rect = buttonRef.current?.getBoundingClientRect();
      setTooltipPosition({
        left: rect ? rect.left + rect.width / 2 : 0,
        top: rect ? rect.bottom + TOOLTIP_GAP_PX : 0,
      });
    }, LONG_PRESS_MS);
  }, [cancelLongPress]);

  const hideTooltip = useCallback(() => {
    cancelLongPress();
    setTooltipPosition(null);
  }, [cancelLongPress]);

  // アンマウント時にタイマーを残さない
  useEffect(() => cancelLongPress, [cancelLongPress]);

  return (
    <button
      type="button"
      ref={buttonRef}
      style={buttonStyle}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={hideTooltip}
      onPointerCancel={hideTooltip}
      onPointerLeave={hideTooltip}
      disabled={disabled}
      title={tool.description}
      aria-label={tool.label}
      aria-pressed={isActive}
      aria-describedby={tooltipPosition !== null ? tooltipId : undefined}
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
      {tooltipPosition !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            id={tooltipId}
            data-testid={`tool-tooltip-${tool.id}`}
            style={{
              ...STYLES.tooltip,
              left: `${tooltipPosition.left}px`,
              top: `${tooltipPosition.top}px`,
            }}
          >
            <span style={STYLES.tooltipTitle}>{tool.label}</span>
            <span style={STYLES.tooltipDescription}>{tool.description}</span>
          </div>,
          document.body
        )}
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
  /** モバイル幅か（単段化時の flexShrink 抑止に使用, Req 36.5） */
  isMobile: boolean;
  /** 開閉状態 (Req 28.8)。false のとき描画しない */
  visible: boolean;
}

function StylePanel({
  activeTool,
  styleOptions,
  onStyleChange,
  disabled,
  isMobile,
  visible,
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

  /**
   * テキスト注釈の背景色を選ぶ (Req 8.5)
   *
   * 背景の有無は「背景」チェックで切替え、色は色入力で選ぶ。透明は空文字で表すため、
   * 「あり」へ戻したときに復帰させる色を本コンポーネントが覚えておく。
   */
  const [rememberedTextBackgroundColor, setRememberedTextBackgroundColor] = useState<string>(
    () => styleOptions.textBackgroundColor || TEXT_BACKGROUND_FALLBACK_COLOR
  );

  const handleTextBackgroundEnabledChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onStyleChange({
        textBackgroundColor: e.target.checked ? rememberedTextBackgroundColor : '',
      });
    },
    [onStyleChange, rememberedTextBackgroundColor]
  );

  const handleTextBackgroundColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // 色を選んだ操作は「背景を付ける」意図であるため、そのまま有効化まで行う
      setRememberedTextBackgroundColor(e.target.value);
      onStyleChange({ textBackgroundColor: e.target.value });
    },
    [onStyleChange]
  );

  /**
   * テキスト注釈の吹き出し形式を選ぶ (Req 8.6)
   */
  const handleBalloonStyleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onStyleChange({ balloonStyle: e.target.value as BalloonStyleType });
    },
    [onStyleChange]
  );

  /**
   * 白縁取り（テキストは白アウトライン）の有効/無効を切替える (Req 24.5, 25.2, 32.5)
   *
   * 切替は当該ツールの描画設定であり、以降に描かれる注釈へ適用される。
   * 既存の注釈は変更しない（Req 24.9 / 25.10 / 32.9 の後方互換を壊さないため）。
   */
  const handleOutlineEnabledChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // 本パネル自体が選択ツールでは描画されない（下の早期 return）ため、ここへ到達する
      // `activeTool` は必ず描画ツールである。到達しない分岐を足して黙って何もしないより、
      // 到達条件を明示して絞り込む。
      const tool = activeTool as OutlineCapableTool;
      onStyleChange({
        outlineEnabled: {
          ...styleOptions.outlineEnabled,
          [tool]: e.target.checked,
        },
      });
    },
    [activeTool, onStyleChange, styleOptions.outlineEnabled]
  );

  // 選択ツールの場合はスタイルパネルを表示しない
  if (!isDrawingTool(activeTool)) {
    return null;
  }

  // Req 28.8: 選択中ツールの再タップで閉じられている間は描画しない
  if (!visible) {
    return null;
  }

  const outlineTool = activeTool as OutlineCapableTool;
  // テキストは文字の輪郭に沿うため「白アウトライン」、他の形状は線の外側に付くため「白縁取り」。
  // 要件も 25.2 だけが「白アウトライン」の語を使う。
  const outlineLabel = outlineTool === 'text' ? '白アウトライン' : '白縁取り';
  const outlineEnabled = styleOptions.outlineEnabled[outlineTool];

  // Req 28.3: モバイル幅では各項目のタップ領域を 44x44 以上にする（Task 115.170 で決着）。
  // Req 36.5: 44 化でツールバーの段が高くならないよう、見出しを操作要素の横へ置く。
  const tapTarget = isMobile ? STYLES.mobileTapTarget : {};
  const itemStyle: React.CSSProperties = {
    ...STYLES.styleItem,
    ...(isMobile ? STYLES.styleItemMobile : {}),
  };

  const showLineOptions = activeTool !== 'text';
  const showFontOptions = activeTool === 'text';
  const showFillOptions = ['circle', 'rectangle', 'polygon'].includes(activeTool);

  return (
    <>
      {/* 区切り線 */}
      <div style={STYLES.separator} />

      {/* スタイルパネル */}
      <div
        style={{ ...STYLES.stylePanel, ...(isMobile ? STYLES.stylePanelMobile : {}) }}
        data-testid="style-options"
      >
        {/* 白縁取り / 白アウトラインの有効・無効 (Req 24.5, 25.2, 32.5) */}
        <div style={itemStyle}>
          <label style={STYLES.styleLabel} htmlFor="annotation-outline-toggle">
            {outlineLabel}
          </label>
          <input
            id="annotation-outline-toggle"
            type="checkbox"
            checked={outlineEnabled}
            onChange={handleOutlineEnabledChange}
            disabled={disabled}
            style={{ ...STYLES.outlineToggleCheckbox, ...tapTarget }}
            data-testid="outline-toggle"
            name="outlineEnabled"
            aria-label={outlineLabel}
          />
        </div>

        {/* 線の色 */}
        {showLineOptions && (
          <div style={itemStyle}>
            <label style={STYLES.styleLabel} htmlFor="annotation-stroke-color">
              色
            </label>
            <input
              id="annotation-stroke-color"
              type="color"
              value={styleOptions.strokeColor}
              onChange={handleStrokeColorChange}
              disabled={disabled}
              style={{ ...STYLES.colorPicker, ...tapTarget }}
              data-testid="color-picker"
              aria-label="線の色"
            />
          </div>
        )}

        {/* 線の太さ */}
        {showLineOptions && (
          <div style={itemStyle}>
            <label style={STYLES.styleLabel} htmlFor="annotation-stroke-width">
              線幅
            </label>
            <input
              id="annotation-stroke-width"
              type="number"
              value={styleOptions.strokeWidth}
              onChange={handleStrokeWidthChange}
              disabled={disabled}
              min={1}
              max={20}
              style={{ ...STYLES.lineWidthInput, ...tapTarget }}
              data-testid="line-width"
              name="strokeWidth"
              aria-label="線の太さ"
            />
          </div>
        )}

        {/* 塗りつぶし色 */}
        {showFillOptions && (
          <div style={itemStyle}>
            <label style={STYLES.styleLabel} htmlFor="annotation-fill-color">
              塗りつぶし
            </label>
            <input
              id="annotation-fill-color"
              type="color"
              value={styleOptions.fillColor || '#ffffff'}
              onChange={handleFillColorChange}
              disabled={disabled}
              style={{ ...STYLES.colorPicker, ...tapTarget }}
              data-testid="fill-color-picker"
              aria-label="塗りつぶしの色"
            />
          </div>
        )}

        {/* フォントサイズ（テキスト用） */}
        {showFontOptions && (
          <>
            <div style={itemStyle}>
              <label style={STYLES.styleLabel} htmlFor="annotation-text-color">
                文字色
              </label>
              <input
                id="annotation-text-color"
                type="color"
                value={styleOptions.strokeColor}
                onChange={handleStrokeColorChange}
                disabled={disabled}
                style={{ ...STYLES.colorPicker, ...tapTarget }}
                data-testid="color-picker"
                aria-label="文字色"
              />
            </div>
            <div style={itemStyle}>
              <label style={STYLES.styleLabel} htmlFor="annotation-font-size">
                サイズ
              </label>
              <input
                id="annotation-font-size"
                type="number"
                value={styleOptions.fontSize}
                onChange={handleFontSizeChange}
                disabled={disabled}
                min={8}
                max={72}
                style={{ ...STYLES.lineWidthInput, ...tapTarget }}
                data-testid="font-size"
                name="fontSize"
                aria-label="フォントサイズ"
              />
            </div>

            {/* 文字の背景色 (Req 8.5)。透明は空文字で表すため、有無はチェックで切替える */}
            <div style={itemStyle}>
              <label style={STYLES.styleLabel} htmlFor="annotation-text-background-toggle">
                背景
              </label>
              <input
                id="annotation-text-background-toggle"
                type="checkbox"
                checked={styleOptions.textBackgroundColor !== ''}
                onChange={handleTextBackgroundEnabledChange}
                disabled={disabled}
                style={{ ...STYLES.outlineToggleCheckbox, ...tapTarget }}
                data-testid="text-background-toggle"
                name="textBackgroundEnabled"
                aria-label="文字の背景色を付ける"
              />
            </div>
            <div style={itemStyle}>
              <label style={STYLES.styleLabel} htmlFor="annotation-text-background-color">
                背景色
              </label>
              <input
                id="annotation-text-background-color"
                type="color"
                value={styleOptions.textBackgroundColor || rememberedTextBackgroundColor}
                onChange={handleTextBackgroundColorChange}
                disabled={disabled}
                style={{ ...STYLES.colorPicker, ...tapTarget }}
                data-testid="text-background-color-picker"
                aria-label="文字の背景色"
              />
            </div>

            {/* 吹き出し形式 (Req 8.6) */}
            <div style={itemStyle}>
              <label style={STYLES.styleLabel} htmlFor="annotation-balloon-style">
                吹き出し
              </label>
              <select
                id="annotation-balloon-style"
                value={styleOptions.balloonStyle}
                onChange={handleBalloonStyleChange}
                disabled={disabled}
                style={{ ...STYLES.balloonStyleSelect, ...tapTarget }}
                data-testid="balloon-style"
                name="balloonStyle"
                aria-label="吹き出し形式"
              >
                {BALLOON_STYLE_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
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
  saveDisabled = false,
  saveDisabledReason,
  onExport,
  canUndo = true,
  canRedo = true,
  onRotate,
  onActiveToolReTap,
  stylePanelVisible = true,
}: AnnotationToolbarProps): React.JSX.Element {
  /**
   * Req 28.4: 端末回転 (orientation) 時のレイアウト再構成。
   *
   * `window.innerWidth` が変化したときに再レンダリングをトリガし、
   * flexWrap と overflowX による折返し/スクロールの再計算を行わせる。
   * 現時点では幅値自体は分岐に使っておらず、React の再描画契機として
   * 利用する (Req 28.1, 28.2, 28.4)。
   */
  const [, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  /**
   * Req 36.3 / 36.5: モバイル幅判定。
   * モバイル幅ではツールバーを単段（nowrap）横スクロールに切替え、
   * 縦方向の占有を抑えて画像作業領域の縦高を確保する。
   */
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = (): void => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  /**
   * ツールボタンクリックハンドラ
   *
   * Req 28.8: 選択中ツールを再タップした場合、`onActiveToolReTap` を発火する
   * （親が受けとって StylePanel の開閉を切替える）。`onToolChange` は
   * 後方互換のため再タップでも従来どおり発火する。
   */
  const handleToolClick = useCallback(
    (tool: ToolType) => {
      if (tool === activeTool && onActiveToolReTap) {
        onActiveToolReTap();
      }
      onToolChange(tool);
    },
    [activeTool, onActiveToolReTap, onToolChange]
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

  // Req 28.3: モバイル幅ではアクションボタンのタップ領域も 44x44 以上にする
  // （適用範囲は Task 115.170 で決着。道具のボタンだけでなく「各項目」が対象）。
  const actionTapTarget = isMobile ? STYLES.mobileTapTarget : {};

  return (
    <div
      data-testid="annotation-toolbar"
      role="toolbar"
      aria-label="注釈ツール"
      style={{ ...STYLES.toolbar, ...(isMobile ? STYLES.toolbarMobile : {}) }}
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
        isMobile={isMobile}
        visible={stylePanelVisible}
      />

      {/* アクションボタン */}
      <div
        data-testid="action-buttons-container"
        style={{
          ...STYLES.actionButtonsContainer,
          ...(isMobile ? STYLES.actionButtonsContainerMobile : {}),
        }}
      >
        {/* 回転ボタン (Req 22.1, 22.7) */}
        {onRotate && (
          <button
            type="button"
            style={{
              ...STYLES.actionButton,
              ...actionTapTarget,
              ...(disabled ? STYLES.actionButtonDisabled : {}),
            }}
            onClick={onRotate}
            disabled={disabled}
            aria-label="画像を90度回転"
            title="画像を90度回転"
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
              <path d="M21 2v6h-6M21 13a9 9 0 1 1-3-7.7L21 8" />
            </svg>
            回転
          </button>
        )}

        {/* 区切り線（回転ボタンとUndo/Redoの間） */}
        {onRotate && <div style={STYLES.separator} />}

        {/* Undoボタン */}
        <button
          type="button"
          style={{
            ...STYLES.actionButton,
            ...actionTapTarget,
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
            ...actionTapTarget,
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
        {/* Task 115.105 (Req 15.6): 通信が切れている間はサーバー保存だけを抑止する。
            描画やエクスポートは手元で完結するため操作可能なまま残す。
            抑止は `disabled` ではなく `aria-disabled` で表す。押下自体は成立させ、
            押下時に抑止の理由（オフラインである旨）を提示するため。 */}
        <button
          type="button"
          style={{
            ...STYLES.actionButton,
            ...actionTapTarget,
            ...STYLES.actionButtonPrimary,
            ...(disabled || saveDisabled ? STYLES.actionButtonDisabled : {}),
          }}
          onClick={onSave}
          disabled={disabled}
          aria-disabled={disabled || saveDisabled}
          aria-label="保存"
          title={saveDisabled && saveDisabledReason ? saveDisabledReason : '保存'}
          data-testid="annotation-save-button"
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
            ...actionTapTarget,
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
