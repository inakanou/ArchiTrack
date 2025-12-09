/**
 * @fileoverview ステータス表示ユーティリティ
 *
 * プロジェクトステータスと遷移種別の視覚的表示に関するユーティリティを提供します。
 *
 * Requirements:
 * - 10.12: 各ステータスを視覚的に区別できる色分けで表示
 * - 10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示
 */

import type { ProjectStatus, TransitionType } from '../types/project.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ステータスカラー設定
 */
export interface StatusColorConfig {
  /** 背景色（Tailwind CSSクラス） */
  bg: string;
  /** テキスト色（Tailwind CSSクラス） */
  text: string;
}

/**
 * 遷移種別スタイル設定
 */
export interface TransitionTypeStyleConfig {
  /** アイコン名（Heroicons） */
  icon: string;
  /** テキスト色（Tailwind CSSクラス） */
  color: string;
  /** 背景色（Tailwind CSSクラス） */
  bgColor: string;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ステータスカラーマップ（12色）
 *
 * 各ステータスに対応するTailwind CSSカラークラスを定義。
 * WCAG 2.1 Level AA準拠のコントラスト比を確保（通常テキスト4.5:1以上）。
 *
 * @example
 * ```tsx
 * const { bg, text } = STATUS_COLORS['PREPARING'];
 * // bg = 'bg-gray-100', text = 'text-gray-800'
 * ```
 */
export const STATUS_COLORS: Record<ProjectStatus, StatusColorConfig> = {
  PREPARING: { bg: 'bg-gray-100', text: 'text-gray-800' }, // 準備中
  SURVEYING: { bg: 'bg-blue-100', text: 'text-blue-800' }, // 調査中
  ESTIMATING: { bg: 'bg-yellow-100', text: 'text-yellow-800' }, // 見積中
  APPROVING: { bg: 'bg-orange-100', text: 'text-orange-800' }, // 決裁待ち
  CONTRACTING: { bg: 'bg-purple-100', text: 'text-purple-800' }, // 契約中
  CONSTRUCTING: { bg: 'bg-indigo-100', text: 'text-indigo-800' }, // 工事中
  DELIVERING: { bg: 'bg-cyan-100', text: 'text-cyan-800' }, // 引渡中
  BILLING: { bg: 'bg-teal-100', text: 'text-teal-800' }, // 請求中
  AWAITING: { bg: 'bg-lime-100', text: 'text-lime-800' }, // 入金待ち
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-800' }, // 完了
  CANCELLED: { bg: 'bg-red-100', text: 'text-red-800' }, // 中止
  LOST: { bg: 'bg-rose-100', text: 'text-rose-800' }, // 失注
};

/**
 * 遷移種別スタイルマップ（アイコン、色、背景色）
 *
 * 順方向遷移と差し戻し遷移を視覚的に区別するためのスタイル定義。
 * - initial: 青系（新規作成を表す）
 * - forward: 緑系（進行を表す）
 * - backward: オレンジ系（差し戻しを表す）
 * - terminate: 赤系（終了を表す）
 *
 * @example
 * ```tsx
 * const { icon, color, bgColor } = TRANSITION_TYPE_STYLES['forward'];
 * // icon = 'arrow-right', color = 'text-green-700', bgColor = 'bg-green-50'
 * ```
 */
export const TRANSITION_TYPE_STYLES: Record<TransitionType, TransitionTypeStyleConfig> = {
  initial: {
    icon: 'plus-circle', // 初期作成アイコン
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
  },
  forward: {
    icon: 'arrow-right', // 順方向矢印
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  backward: {
    icon: 'arrow-left', // 差し戻し矢印
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
  },
  terminate: {
    icon: 'x-circle', // 終端アイコン
    color: 'text-red-700',
    bgColor: 'bg-red-50',
  },
};

/**
 * デフォルトのステータスカラー設定（無効なステータス用）
 */
const DEFAULT_STATUS_COLOR: StatusColorConfig = {
  bg: 'bg-gray-100',
  text: 'text-gray-800',
};

/**
 * デフォルトの遷移種別スタイル設定（無効な遷移種別用）
 */
const DEFAULT_TRANSITION_STYLE: TransitionTypeStyleConfig = {
  icon: 'question-mark-circle',
  color: 'text-gray-700',
  bgColor: 'bg-gray-50',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * プロジェクトステータスのカラー設定を取得
 *
 * @param status - プロジェクトステータス
 * @returns ステータスカラー設定（bg, text）
 *
 * @example
 * ```tsx
 * const color = getStatusColor('PREPARING');
 * // { bg: 'bg-gray-100', text: 'text-gray-800' }
 *
 * <span className={`${color.bg} ${color.text} px-2 py-1 rounded`}>
 *   {statusLabel}
 * </span>
 * ```
 */
export function getStatusColor(status: ProjectStatus): StatusColorConfig {
  return STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR;
}

/**
 * 遷移種別のスタイル設定を取得
 *
 * @param type - 遷移種別
 * @returns 遷移種別スタイル設定（icon, color, bgColor）
 *
 * @example
 * ```tsx
 * const style = getTransitionTypeStyle('forward');
 * // { icon: 'arrow-right', color: 'text-green-700', bgColor: 'bg-green-50' }
 *
 * <div className={`${style.bgColor} ${style.color} p-2 rounded`}>
 *   <Icon name={style.icon} />
 *   <span>{transitionLabel}</span>
 * </div>
 * ```
 */
export function getTransitionTypeStyle(type: TransitionType): TransitionTypeStyleConfig {
  return TRANSITION_TYPE_STYLES[type] ?? DEFAULT_TRANSITION_STYLE;
}
