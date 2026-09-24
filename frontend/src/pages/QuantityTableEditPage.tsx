/**
 * @fileoverview 数量表編集画面
 *
 * Task 5.1: 数量表編集画面のレイアウトを実装する
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */

import { useState, useEffect, useCallback, useReducer, useMemo, useRef } from 'react';
import { useParams, Link, useBlocker } from 'react-router-dom';
import { getQuantityTableDetail, saveQuantityTableDraft } from '../api/quantity-tables';
import { ApiError } from '../api/client';
import { getSiteSurveys, getSiteSurvey, getProjectSurveyImages } from '../api/site-surveys';
import { getAnnotation } from '../api/survey-annotations';
import { Canvas as FabricCanvas, FabricImage, util } from 'fabric';
import type {
  QuantityTableDetail,
  QuantityGroupDetail,
  QuantityItemDetail,
  SurveyImageSummary,
} from '../types/quantity-table.types';
import type { ProjectSurveyImage } from '../types/site-survey.types';
import {
  quantityTableEditReducer,
  initialQuantityTableEditState,
  buildSaveQuantityTableDraftInput,
  type DraftGroup,
  type DraftItem,
} from './quantityTableEditReducer';
import { Breadcrumb } from '../components/common';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import QuantityGroupCard from '../components/quantity-table/QuantityGroupCard';
import ItemCopyMoveDialog from '../components/quantity-table/ItemCopyMoveDialog';
import UnsavedChangesBadge from '../components/quantity-table/UnsavedChangesBadge';
import { AnnotatedImageThumbnail } from '../components/site-surveys/AnnotatedImageThumbnail';
// 集合体へ複写された線幅は実描画から導出し直す（詳細は annotation-restore-scale.ts）。
import { resolveRestoredStrokeWidth } from '../components/site-surveys/annotation-restore-scale';
import { useAutocompleteCandidateStore } from '../hooks/useAutocompleteCandidateStore';
// PDF出力サービスは日本語フォント資産（約3MB）へ静的に到達するため、
// 値としては静的 import せず出力実行時に動的読み込みする（初期チャンクからの分離）
import { loadQuantityTablePdfExportService } from '../services/export/loadQuantityTablePdfExportService';
import { CALCULATION_METHOD_LABELS } from '../utils/calculation-method';
import { validateCalculationParams } from '../utils/calculation-params-validation';
import {
  FIELD_DEFAULT_SUBSTITUTION,
  getFieldRangeConfig,
  validateNumericRange,
  type DefaultSubstitutedFieldType,
} from '../utils/numeric-range-validation';
import {
  describeDroppedSurveyImageLinks,
  describeSurveyImageLinkSaveFailure,
} from '../utils/survey-image-link-feedback';
import { loadPdfExportService } from '../services/export/loadPdfExportService';
import { ImportDialog } from '../components/quantity-table-import/ImportDialog';
import type { ImportQuantityItem } from '../types/quantity-import.types';
import SurveySelectDialog, {
  type SiteSurveySummary,
} from '../components/quantity-table/SurveySelectDialog';

// ============================================================================
// 範囲外の既存値の救済（Task 90.1）
// ============================================================================

/** 保存前の範囲判定で名指し、既定値へ戻す操作の対象になりうる計算設定の欄 */
type RescuableSettingField = Extract<
  DefaultSubstitutedFieldType,
  'roundingUnit' | 'adjustmentFactor'
>;

/**
 * 描画されない欄の範囲外の既存値を既定値へ戻す操作の対象
 *
 * ## なぜ在るか
 *
 * 正典の範囲（`FIELD_RANGE_CONFIG`）より広い範囲で永続化された既存値——たとえば旧保存経路
 * （タスク 85.1 より前）の上限 `999.99` の内側にある丸め設定 `500`——は、保存前の整合性チェック
 * （REQ-11.2）で保存を中断させる。計算方法「標準」の項目では調整係数・丸め設定の欄が描画されない
 * （REQ-9 の表示条件 / REQ-10.8）ため、告知が欄を名指しても利用者には直す手段が無く、
 * 当該の数量表は二度と保存できなくなる。
 *
 * ## 採った形と採らなかった形
 *
 * **採った形**: 告知が項目・欄・現在の値・範囲を名指す。欄が描画される計算方法では欄から直させ、
 * 描画されない「標準」に限り、告知に既定値へ戻す操作を添える。書き換えは利用者の操作を契機とし、
 * ドラフトを変えるだけで保存はしない（永続化は保存操作時のみ。REQ-42.7）。
 *
 * *採らなかった形*:
 * - 「標準」でも欄を開いて直させる——REQ-10.8 は「標準」で丸め設定の欄を表示しないと定める
 * - 範囲外の既存値を読み込み時・保存時に黙って既定値へ寄せる——`250` のような丸め単位は利用者が
 *   意図して置いた値でありうる。計算方法の切替は調整係数・丸め設定を引き継ぐ（`EditableQuantityItemRow`
 *   の `handleCalculationMethodChange`）ため、「標準」で見えない値も切替後の計算に効く。
 *   黙って書き換えると、利用者の知らないところで数量が変わる
 * - 「標準」の項目では範囲判定を省く——保存経路（バックエンドの `validateItemFieldSpecs`）は計算方法に
 *   よらず範囲を課すので、画面だけ省いても 400 で止まる。バックエンドまで緩めると、タスク 85.1 が
 *   閉じた「範囲外の値が新たに永続化される」経路を開き直す
 *
 * 判断の全文は design.md の `### 数値フィールド仕様（計算パラメータ）` に置いた。
 */
interface HiddenFieldRescue {
  /** 操作を名指した告知の全文。この告知が表示されている間だけ操作を出す */
  message: string;
  groupKey: string;
  itemKey: string;
  field: RescuableSettingField;
}

/**
 * 保存前の範囲判定で名指す数値欄
 *
 * 数量は計算方法によらず欄が描画されるため、既定値へ戻す操作の対象にはしない。
 */
type OutOfRangeCheckedField = RescuableSettingField | 'quantity';

/**
 * 範囲外の数値欄を名指す告知の文言を組み立てる（REQ-10.3 / REQ-11.2）
 *
 * 範囲と欄の名は正典（`FIELD_RANGE_CONFIG`）から引き、ここへ書き写さない。
 */
function describeOutOfRangeSetting(
  groupLabel: string,
  itemLabel: string,
  field: OutOfRangeCheckedField,
  rawValue: string,
  isHidden: boolean
): string {
  const { min, max, label } = getFieldRangeConfig(field);
  const numeric = Number(rawValue);
  // 調整係数・丸め設定・数量は小数2桁で常時表示する（REQ-10.7 / REQ-14）ため、告知もその書式で示す
  const shownValue = Number.isFinite(numeric) ? numeric.toFixed(2) : rawValue;
  const head = `グループ「${groupLabel}」の項目「${itemLabel}」の${label}が無効です（現在の値: ${shownValue}）。`;
  return isHidden
    ? `${head}${min}〜${max}の範囲外ですが、計算方法「標準」ではこの欄は表示されません。既定値に戻してから保存してください`
    : `${head}${min}〜${max}の範囲で入力してください`;
}

/** 既定値へ戻す操作の表示名（既定値は正典の `FIELD_DEFAULT_SUBSTITUTION` から引く） */
function describeHiddenFieldRescueAction(field: RescuableSettingField): string {
  const { label } = getFieldRangeConfig(field);
  return `${label}を既定値（${FIELD_DEFAULT_SUBSTITUTION[field].defaultValue.toFixed(2)}）に戻す`;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    gap: '16px',
    // Task 62.3: ヘッダー操作ボタン群を垂直スクロール時も固定表示する（REQ-45.1, 45.2）。
    // 祖先に overflow スクロールコンテナを持たない（main は padding のみ）前提で sticky を成立させ、
    // 既存 EstimateDetailPage/SiteSurveyDetailPage の固定ヘッダーパターンに準拠する。
    // 背景色は下層コンテンツが透けないよう付与し、zIndex で前面に固定する。
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
    backgroundColor: '#ffffff',
    // Task 115.46: 狭い幅では見出し部と操作ボタン群が一列に収まらず、右へはみ出して
    // ページ全体に水平方向のスクロールを生じさせていた。固定は垂直方向のみ（sticky/top）
    // であるため、横へスクロールすると固定した操作ボタン群も画面外へ出てしまい
    // REQ-45.1（常に画面内に表示）が成立しない。折り返しで画面幅に収める。
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    flex: 1,
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  titleInput: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
    padding: '4px 8px',
    border: '1px solid transparent',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    width: '100%',
    maxWidth: '500px',
    transition: 'border-color 0.2s, background-color 0.2s',
  } as React.CSSProperties,
  titleInputFocused: {
    border: '1px solid #2563eb',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    // Task 115.46: 操作ボタン群自体も画面幅に収まらない場合は折り返す。
    // 併せて flexShrink: 0 を外した。ヘッダーが折り返しても操作ボタン群が
    // 縮まないままだと、行の幅を超えて右へはみ出し続けるためである。
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  addGroupButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  saveButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  groupList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  emptyIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 16px',
    color: '#9ca3af',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 選択した数量項目に対する一括操作バー（REQ-6.5）
  //
  // Task 115.38: 通常の流れ（数量グループ一覧の直前）に置くと、下方の行を選択した際に
  // 操作面が画面外へ出て上方向へスクロールしないと操作できなかった。
  // ヘッダー操作ボタン群の固定表示（REQ-45.2）と同じ position: sticky を用い、
  // 数量グループ一覧の「後ろ」に置いてビューポート下端へ貼り付ける。
  // 末尾に置くことで sticky が流れの中で自身の領域を確保し、
  // 最下部までスクロールした際に最終行を恒久的に覆い隠さない（REQ-45.3 と同じ考え方）。
  // z-index はアクションメニュー / 補完候補一覧（いずれも Portal・z-index 1000）より
  // 背面となる値にし、それらを覆い隠さない（REQ-46.7 と整合）。
  //
  // 狭幅環境での収まりを担うのは flexWrap である。操作面は main（padding のみのブロック）
  // 直下の自動幅ブロックであり、外枠の幅は常に親の内容領域に収まる。はみ出しうるのは
  // 中の操作群だけで、それを防ぐのは折り返しの指定である。
  // Task 115.44: 併記していた boxSizing / maxWidth は自動幅のブロックでは効かず
  // （max-width は親の内容幅と等しいため決して拘束しない）、収まりに寄与しないため外した。
  bulkActionBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '10px 16px',
    marginTop: '16px',
    position: 'sticky' as const,
    bottom: 0,
    zIndex: 50,
    boxShadow: '0 -2px 6px -1px rgba(0, 0, 0, 0.12)',
  } as React.CSSProperties,
  bulkActionCount: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d4ed8',
    marginRight: '4px',
  } as React.CSSProperties,
  bulkActionButton: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#1d4ed8',
    cursor: 'pointer',
  } as React.CSSProperties,
  bulkActionDeleteButton: {
    borderColor: '#fecaca',
    color: '#dc2626',
  } as React.CSSProperties,
  bulkActionClearButton: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 操作エラー表示スタイル（インライン）
  operationErrorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  operationErrorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
    flex: 1,
  } as React.CSSProperties,
  // 描画されない欄の範囲外の既存値を既定値へ戻す操作（Task 90.1）
  operationErrorAction: {
    backgroundColor: '#ffffff',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '6px 12px',
    marginLeft: '12px',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  operationErrorDismiss: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    marginLeft: '12px',
  } as React.CSSProperties,
  // 取得時に落とした現調画像の紐付けの告知（Task 86.5）。失敗ではないため注意色で示す
  surveyImageLinkNotice: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    color: '#92400e',
    fontSize: '14px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  // 確認ダイアログスタイル
  dialogOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 写真選択ダイアログスタイル（REQ-4.3）
  photoDialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '800px',
    width: '90%',
    maxHeight: '80vh',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  photoDialogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    // REQ-39: 行高を固定（150px）し、各アイテムにも同じ definite height を与えることで
    // 行トラックとアイテム高さを一致させ重なりを解消する。
    // aspect-ratio による高さは列幅（1fr で 150px 超に伸びる）に追従して行トラックを
    // 超過するうえ、auto 行トラックは aspect-ratio 由来の高さを最小値（150px）でしか
    // 解決しないため重なりが残る（実機 E2E で確認）。definite height で確定させる。
    gridAutoRows: '150px',
    gap: '12px',
    overflowY: 'auto' as const,
    flex: 1,
    padding: '4px',
  } as React.CSSProperties,
  photoItem: {
    // REQ-39: 行トラック（gridAutoRows:150px）と一致する definite height を与え、
    // aspect-ratio 由来の不定高による行超過・重なりを防ぐ。
    height: '150px',
    minHeight: '150px',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.2s, transform 0.2s',
  } as React.CSSProperties,
  photoItemSelected: {
    border: '2px solid #2563eb',
    transform: 'scale(1.02)',
  } as React.CSSProperties,
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  } as React.CSSProperties,
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px',
    lineHeight: 1,
  } as React.CSSProperties,
  // 写真一覧の取得に失敗した旨の提示（Requirement 49.9）
  photoListError: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#b91c1c',
  } as React.CSSProperties,
  // 一覧に全件が含まれない旨の提示（Requirement 49.9）
  photoListNotice: {
    margin: '0 0 12px 0',
    padding: '8px 12px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: '6px',
    color: '#92400e',
    fontSize: '12px',
  } as React.CSSProperties,
  emptyPhotos: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
  } as React.CSSProperties,
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  pdfExportButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * プラスアイコン
 */
function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * 空状態アイコン（テーブル）
 */
function EmptyTableIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 9v12M15 9v12" />
    </svg>
  );
}

/**
 * 空状態表示
 */
function EmptyState({ onAddGroup }: { onAddGroup: () => void }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <EmptyTableIcon />
      </div>
      <p style={styles.emptyText}>グループがありません</p>
      <button type="button" style={styles.addGroupButton} onClick={onAddGroup}>
        <PlusIcon />
        グループを追加
      </button>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量表編集画面
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */
export default function QuantityTableEditPage() {
  const { id } = useParams<{ id: string }>();

  // ==========================================================================
  // Task 61.1: 編集ドラフトを単一の useReducer で一元管理する（REQ-42.1〜42.3, 42.6）
  // すべての編集操作（グループ/項目の追加・削除・コピー・並び替え・名称・写真紐づけ・
  // フィールド編集）は dispatch でドラフトのみを更新し、保存操作まで永続化APIを
  // 呼び出さない（REQ-42.6）。初期ロードや候補取得などの参照系GETは従来どおり
  // オンデマンドで実行する（REQ-42.10）。
  // ==========================================================================
  const [editState, dispatch] = useReducer(quantityTableEditReducer, initialQuantityTableEditState);
  const draft = editState.draft;

  // ==========================================================================
  // Task 62.1: 未保存変更時の離脱ガード（REQ-43.1〜43.6）
  // editState.isDirty が true の間のみガードする（REQ-43.5/43.6）。
  // - アプリ内ナビゲーション: useBlocker(isDirty) でブロックし、blocked のとき
  //   既存の UnsavedChangesDialog を表示。離脱→ proceed()、とどまる→ reset()
  //   （REQ-43.1/43.3/43.4）。
  // - タブクローズ/リロード: 共有フック useUnsavedChanges の beforeunload ハンドラを
  //   isDirty で有効化し標準確認を表示する（REQ-43.2）。
  // 既存 CompanyInfoPage / ItemizedStatementDetailPage / SiteSurveyDetailPage の
  // 確立済みパターンに準拠（design.md「Architecture Pattern & Boundary Map」の
  // 「追加コンポーネント（REQ-43, 44）」、および
  // 「クライアントサイド編集・明示保存・離脱ガード・固定ヘッダー（REQ-42〜45）」配下の
  // 「UnsavedChangesBadge / 離脱ガード / 固定ヘッダー（REQ-43, 44, 45）」）。
  // ==========================================================================
  const isDirty = editState.isDirty;

  // タブクローズ/リロード時の beforeunload 標準確認（REQ-43.2）
  //
  // 未保存判定の正は `quantityTableEditReducer` 側の `editState.isDirty` であり、フックへ
  // 直接渡す（Task 100.24 でフックが自前の dirty 状態を持たない形へ一本化された）。
  useUnsavedChanges({ isDirty });

  // アプリ内ナビゲーションのブロック（REQ-43.1）
  const blocker = useBlocker(isDirty);

  // 数量表メタ情報（projectId / project / updatedAt 等、編集対象外の参照情報）と
  // 写真サマリ（surveyImage）の供給元として、最後にロード/保存したサーバースナップショットを保持する。
  const [snapshot, setSnapshot] = useState<QuantityTableDetail | null>(null);

  // セッション中に紐づけた写真のサマリ（スナップショットに存在しない新規紐づけ写真の
  // サムネイル・コメントを描画へ供給する。REQ-4.3 表示反映用）。surveyImageId -> サマリ。
  const [linkedPhotoSummaries, setLinkedPhotoSummaries] = useState<
    Record<string, SurveyImageSummary>
  >({});

  // オートコンプリート候補ストア（Task 17.2: Req 7.1）
  const { getSuggestions, addCandidateOnBlur } = useAutocompleteCandidateStore({
    projectId: snapshot?.projectId || '',
  });

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null); // 読み込みエラー（全画面表示）
  const [operationError, setOperationError] = useState<string | null>(null); // 操作エラー（インライン表示）
  // 描画されない欄の範囲外の既存値を既定値へ戻す操作（Task 90.1）。
  // 操作は、それを名指した告知（`message`）が表示されている間だけ出す。告知が閉じられたり
  // 別の告知へ置き換わったりした後に、告げていない欄を書き換えさせないためである。
  const [hiddenFieldRescue, setHiddenFieldRescue] = useState<HiddenFieldRescue | null>(null);

  // 取得時に落とした現調画像の紐付けの告知（Task 86.5）。
  // バックエンドの取得は他プロジェクトの写真を指す既存の紐付けを落とし（Task 86.3）、当該グループを
  // `droppedSurveyImageLinkGroupIds` で名指す。名指しは最後にロード/保存したスナップショットから読み、
  // 告げる対象は現在のドラフトで写真を持たないまま残っているグループに限る（選び直した・削除した
  // グループを告げると告知が偽になる）。保存の応答は解除後の状態を名指さないため、保存の成功で消える。
  const droppedSurveyImageLinkNotice = useMemo(
    () =>
      describeDroppedSurveyImageLinks(
        snapshot?.droppedSurveyImageLinkGroupIds,
        editState.draft?.groups ?? []
      ),
    [snapshot, editState.draft]
  );
  // 削除確認ダイアログ用state（REQ-4.5）。対象行キー（id または tempId）を保持する。
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 数量表名編集用state（REQ-2.5）
  const [editingName, setEditingName] = useState<string>('');
  const [isNameFocused, setIsNameFocused] = useState(false);
  // Escキャンセル時に直後の blur によるドラフト反映を抑止するフラグ（REQ-2.5）
  const suppressNameCommitRef = useRef(false);
  // 写真選択ダイアログ用state（REQ-4.3）
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [selectedGroupIdForPhoto, setSelectedGroupIdForPhoto] = useState<string | null>(null);
  // 一括取得した注釈付き写真の一覧（Requirement 49.9）
  const [projectSurveyImages, setProjectSurveyImages] = useState<ProjectSurveyImage[]>([]);
  // 上限に達して切り捨てが発生したか（Requirement 49.9）
  const [isPhotoListTruncated, setIsPhotoListTruncated] = useState(false);
  // 写真一覧の取得に失敗した旨（Requirement 49.9 の Error Handling）。
  // ダイアログは画面全体を覆うため、背後の共通エラー表示では利用者へ届かない。
  // 0件と失敗を取り違えさせないよう、空一覧の案内とは別の状態として持つ。
  const [photoListError, setPhotoListError] = useState<string | null>(null);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  // 注釈ビューアモーダル用state（REQ-4.4）
  const [annotationViewerGroupId, setAnnotationViewerGroupId] = useState<string | null>(null);
  // PDF出力用state（REQ-26.1, 26.9）
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  // インポートダイアログ用state（REQ-27.1）
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  // 現場調査選択ダイアログ用state（Task 57.3: REQ-40.1, 40.2, 40.11, 40.13）
  const [isSurveySelectDialogOpen, setIsSurveySelectDialogOpen] = useState(false);
  const [surveyOptions, setSurveyOptions] = useState<SiteSurveySummary[]>([]);
  const [isCreatingFromSurvey, setIsCreatingFromSurvey] = useState(false);

  // 数量項目の移動先選択ダイアログ用state（REQ-6.2, 6.4, 6.5）
  // itemKeys: 移動対象の項目キー、sourceGroupKey: 移動元グループのキー（移動先候補から除外する）
  const [moveTargetSelection, setMoveTargetSelection] = useState<{
    itemKeys: string[];
    sourceGroupKey: string;
  } | null>(null);

  /** 一括操作の対象として選択中の項目キー（REQ-6.5） */
  const selectedItemKeys = editState.selectedItems;

  /**
   * 数量表詳細を取得（参照系GET。REQ-42.10）。
   * 取得結果でスナップショットを更新し、ドラフトを `load` で再シードする。
   */
  const fetchQuantityTableDetail = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setLoadError(null);
    setOperationError(null); // 操作エラーもクリア

    try {
      const result = await getQuantityTableDetail(id);
      // result が null/undefined の場合は「見つかりません」表示へ（ドラフトは未シードのまま）
      if (!result) {
        setSnapshot(null);
        return;
      }
      setSnapshot(result);
      setLinkedPhotoSummaries({});
      dispatch({ type: 'load', detail: result });
    } catch {
      setLoadError('読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchQuantityTableDetail();
  }, [fetchQuantityTableDetail]);

  // 数量表名を編集用stateに初期化（REQ-2.5）。ドラフト名の変更に追従する。
  useEffect(() => {
    if (draft) {
      setEditingName(draft.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 名前の変更のみに依存
  }, [draft?.name]);

  /**
   * 数量表名変更ハンドラ（REQ-2.5）
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  }, []);

  /**
   * 数量表名確定ハンドラ（REQ-2.5, REQ-42.2）
   * フォーカスを外したときにドラフトへ反映する（永続化APIは呼ばない）。
   */
  const handleNameBlur = useCallback(() => {
    setIsNameFocused(false);

    // Escキャンセル直後の blur はドラフト反映をスキップする（編集破棄）
    if (suppressNameCommitRef.current) {
      suppressNameCommitRef.current = false;
      if (draft) setEditingName(draft.name);
      return;
    }

    if (!draft) return;

    // 変更がない場合は何もしない
    if (editingName === draft.name) return;

    // 空の場合は元に戻す
    if (!editingName.trim()) {
      setEditingName(draft.name);
      return;
    }

    // ドラフトのみ更新（REQ-42.2: クライアント編集状態にのみ反映）
    dispatch({ type: 'renameTable', name: editingName.trim() });
  }, [draft, editingName]);

  /**
   * 数量表名フォーカスハンドラ（REQ-2.5）
   */
  const handleNameFocus = useCallback(() => {
    setIsNameFocused(true);
  }, []);

  /**
   * 数量表名キーダウンハンドラ（REQ-2.5）
   * Enterで確定、Escでキャンセル
   */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur(); // blurでhandleNameBlurが呼ばれる
      } else if (e.key === 'Escape') {
        // 編集破棄: 直後の blur によるドラフト反映を抑止する
        suppressNameCommitRef.current = true;
        if (draft) {
          setEditingName(draft.name);
        }
        e.currentTarget.blur();
      }
    },
    [draft]
  );

  /**
   * グループ追加ハンドラ（REQ-4.1, REQ-42.1）
   * ドラフトに空グループを追加する（永続化APIは呼ばない）。
   */
  const handleAddGroup = useCallback(() => {
    setOperationError(null);
    dispatch({ type: 'addGroup' });
  }, []);

  /**
   * グループ名取得（名前がない場合はデフォルト表示）
   */
  const getGroupDisplayName = (group: QuantityGroupDetail, index: number): string => {
    return group.name || `グループ ${index + 1}`;
  };

  /**
   * グループ削除確認ダイアログを開く
   *
   * Requirements: 4.5
   */
  const handleDeleteGroup = useCallback((groupKey: string) => {
    setGroupToDelete(groupKey);
  }, []);

  /**
   * 削除をキャンセル
   */
  const handleCancelDelete = useCallback(() => {
    setGroupToDelete(null);
  }, []);

  /**
   * グループ削除を実行（REQ-4.5, REQ-42.1）
   * ドラフトから対象グループを削除する（永続化APIは呼ばない）。
   */
  const handleConfirmDeleteGroup = useCallback(() => {
    if (!groupToDelete) return;
    setOperationError(null);
    dispatch({ type: 'removeGroup', groupKey: groupToDelete });
    setGroupToDelete(null);
  }, [groupToDelete]);

  /**
   * グループコピーハンドラ
   *
   * Task 61.2: 数量グループコピーをクライアントサイドドラフト化する
   * Requirements: 42.4, 38.13
   *
   * - コピーはサーバー POST（copyQuantityGroup）ではなく reducer の `copyGroup`
   *   アクションによるクライアントサイドのドラフト複製として行う（REQ-42.4）。
   * - reducer 側で複製先を元グループの直下へ挿入し、後続グループの displayOrder を
   *   シフトし、名前は「{元名}のコピー」（バックエンドと同一の幅切り詰め）として
   *   配下項目を新規 tempId で複製する。surveyImageId は参照のみ引き継ぐ（REQ-38.13）。
   * - 純粋なクライアント操作のため API 呼び出し・再取得・エラー処理は不要。
   *   永続化は保存操作（Task 61.4）で行う。
   * - 複製先グループ名は即座にインライン編集可能（REQ-22, rename ハンドラ対応済み）。
   *
   * @param groupKey - 対象グループの識別子（既存は id、新規は tempId）
   */
  const handleCopyGroup = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'copyGroup', groupKey });
  }, []);

  /**
   * 写真選択ダイアログを開く
   *
   * 選択可能な写真は、プロジェクト写真一覧の取得1回でまとめて取得する。現場調査ごとの
   * 個別リクエストへ分割しない（Requirement 49.9）。応答は注釈エディタで編集済みの写真
   * のみを含む（Requirement 4.3 / 19.2）。
   *
   * Requirements: 4.3
   * Requirements (quantity-table-generation): 49.9, 49.10
   */
  const handleSelectImage = useCallback(
    async (groupId: string) => {
      if (!snapshot) return;

      setSelectedGroupIdForPhoto(groupId);
      setIsPhotoDialogOpen(true);
      setIsLoadingPhotos(true);
      setProjectSurveyImages([]);
      setIsPhotoListTruncated(false);
      setPhotoListError(null);

      try {
        // プロジェクト配下の注釈付き写真を1リクエストでまとめて取得する（Requirement 49.9）。
        // 現場調査一覧→現場調査詳細×N の経路は廃止した。中間の現場調査詳細は写真収集の
        // ためだけに取得しており、他の情報は使われていなかった。
        const result = await getProjectSurveyImages(snapshot.projectId);
        setProjectSurveyImages(result.images);
        // 上限に達して切り捨てが発生したかを保持し、一覧へ提示する（Requirement 49.9）
        setIsPhotoListTruncated(result.hasMore);
      } catch {
        // 失敗はダイアログの中で伝える。既存の写真の紐づけには手を触れない
        // （部分的に取得した一覧で選択させない）。
        setPhotoListError('写真の読み込みに失敗しました');
      } finally {
        setIsLoadingPhotos(false);
      }
    },
    [snapshot]
  );

  /**
   * 写真選択ダイアログを閉じる
   *
   * Requirements: 4.3
   */
  const handleClosePhotoDialog = useCallback(() => {
    setIsPhotoDialogOpen(false);
    setSelectedGroupIdForPhoto(null);
    setProjectSurveyImages([]);
    setIsPhotoListTruncated(false);
    setPhotoListError(null);
  }, []);

  /**
   * 写真を選択して適用（REQ-4.3, REQ-42.3）
   * ドラフトのグループへ surveyImageId を反映する（永続化APIは呼ばない）。
   * 描画用に選択写真のサマリ（サムネイル・コメント等）をセッションマップへ保持する。
   */
  const handlePhotoSelect = useCallback(
    (imageId: string) => {
      if (!selectedGroupIdForPhoto) return;
      setOperationError(null);

      // 選択した写真情報を取得し、描画用サマリとして保持する。
      // 一覧の表示元 `displayUrl` はサーバー側で解決済み（注釈付きサムネイル優先）であり、
      // 呼び出し側で優先順位を再実装しない（Requirement 49.10）。
      const selectedImage = projectSurveyImages.find((p) => p.id === imageId);
      if (selectedImage) {
        // 表示用URLが合成済みサムネイルかどうかはサーバーが伝える。合成済みを
        // 「通常のサムネイル」として渡すと共有表示部品がクライアント側の合成を重ねて
        // 実行し、注釈が二重に描かれる（回転補正済みの画像では重ね位置もずれる）。
        // 合成済みのときだけ注釈付きサムネイルの口へ渡し、部品側の短絡へ乗せる
        // （Requirement 49.5）。そうでないときは渡さず、部品のクライアント側合成に
        // 委ねて Requirement 3.3 の表示を維持する（Requirement 49.6）。
        const isComposited = selectedImage.isDisplayUrlAnnotated;
        const displayUrl = selectedImage.displayUrl ?? '';
        setLinkedPhotoSummaries((prev) => ({
          ...prev,
          [imageId]: {
            id: selectedImage.id,
            // 合成済みのときは合成前のサムネイルが応答に無いため、代替は原本のみ。
            // ただし合成済みの短絡が働くため、この値が実際に読み込まれることはない。
            thumbnailUrl: isComposited
              ? selectedImage.originalUrl || ''
              : displayUrl || selectedImage.originalUrl || '',
            originalUrl: selectedImage.originalUrl || '',
            annotatedThumbnailUrl: isComposited ? displayUrl : null,
            fileName: selectedImage.fileName,
            // 一覧は注釈エディタで編集済みの写真のみを返すため、注釈レコードは必ず存在する
            hasAnnotations: true,
            // 注釈の目印は「描画された注釈の有無」で判定する。注釈レコードの存在
            // （hasAnnotations）も合成済みサムネイルの有無も、回転のみの保存で真に
            // なるため判定源にできない（Requirement 20.2、site-survey Task 115.13）。
            hasDrawnAnnotations: selectedImage.hasDrawnAnnotations,
            comment: selectedImage.comment ?? null,
            // 未読込時に表示領域を確保するための実寸（Requirement 49.8）
            width: selectedImage.width,
            height: selectedImage.height,
          },
        }));
      }

      // ドラフトのみ更新（REQ-42.3: クライアント編集状態にのみ反映）
      dispatch({
        type: 'linkGroupImage',
        groupKey: selectedGroupIdForPhoto,
        surveyImageId: imageId,
      });

      handleClosePhotoDialog();
    },
    [selectedGroupIdForPhoto, projectSurveyImages, handleClosePhotoDialog]
  );

  /**
   * 写真の紐付けを解除（REQ-42.3、Task 90.2）
   *
   * ドラフトのグループから surveyImageId を外す（永続化APIは呼ばない）。確定は保存操作時の
   * 1回の PUT に畳まれる（REQ-42.7）。
   *
   * **これが親の現場調査が論理削除された写真を持つ数量表の唯一の出口である。** 当該写真は
   * 写真選択ダイアログの候補に現れないため「写真を変更」では選び直せず、保存は 410 で止まる。
   * 解除しない限り、無関係な編集も含めて当該数量表の保存が全面的に止まったままになる。
   *
   * `linkedPhotoSummaries` からは消さない。同マップは画像IDを鍵とする描画用のキャッシュであり、
   * 同じ写真を別のグループが指している場合に消すとその描画が壊れる。解除したグループの写真枠は
   * `renderTable` が surveyImageId の有無で解決するため、残しても表示には現れない。
   */
  const handleUnlinkImage = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'linkGroupImage', groupKey, surveyImageId: null });
  }, []);

  /**
   * 注釈ビューアを開く
   *
   * Requirements: 4.4
   */
  const handleOpenAnnotationViewer = useCallback((groupId: string) => {
    setAnnotationViewerGroupId(groupId);
  }, []);

  /**
   * 注釈ビューアを閉じる
   *
   * Requirements: 4.4
   */
  const handleCloseAnnotationViewer = useCallback(() => {
    setAnnotationViewerGroupId(null);
  }, []);

  /**
   * 項目が属するグループのキー（id または tempId）を解決する。
   * 項目編集系の各ハンドラは項目キーのみを受け取るため、ドラフトから親グループを引く。
   */
  const findGroupKeyByItemKey = useCallback(
    (itemKey: string): string | null => {
      if (!draft) return null;
      for (const group of draft.groups) {
        const groupKey = group.id ?? group.tempId ?? '';
        if (group.items.some((item) => (item.id ?? item.tempId ?? '') === itemKey)) {
          return groupKey;
        }
      }
      return null;
    },
    [draft]
  );

  /**
   * 項目追加ハンドラ（REQ-5.1, REQ-42.1）
   * ドラフトの対象グループへ空項目を追加する（永続化APIは呼ばない）。
   */
  const handleAddItem = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'addItem', groupKey });
  }, []);

  /**
   * 項目更新ハンドラ（REQ-5.2, REQ-42.1）
   * ドラフトの項目フィールドを更新する（永続化APIは呼ばない）。
   * 数値フィールド（quantity/adjustmentFactor/roundingUnit）は文字列入力として保持する。
   */
  const handleUpdateItem = useCallback(
    (itemKey: string, updates: Partial<QuantityItemDetail>) => {
      setOperationError(null);

      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;

      // QuantityItemDetail（数値型）→ DraftItem（文字列型）へ変換する
      const draftUpdates: Partial<DraftItem> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'quantity' || key === 'adjustmentFactor' || key === 'roundingUnit') {
          draftUpdates[key as 'quantity' | 'adjustmentFactor' | 'roundingUnit'] = String(value);
        } else {
          // それ以外のフィールドはそのまま反映（型は DraftItem と互換）
          (draftUpdates as Record<string, unknown>)[key] = value;
        }
      }

      dispatch({ type: 'updateItemField', groupKey, itemKey, updates: draftUpdates });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 描画されない欄の範囲外の既存値を既定値へ戻すハンドラ（Task 90.1, REQ-10.3, REQ-11.2）
   *
   * 告知が名指した一項目の一欄だけを、正典の既定値へ戻す。ドラフトを変えるだけで保存はしない
   * （永続化は保存操作時のみ。REQ-42.7）。戻したことは未保存の変更として残り、利用者が保存する。
   */
  const handleRescueHiddenField = useCallback(() => {
    if (hiddenFieldRescue === null) return;
    const { groupKey, itemKey, field } = hiddenFieldRescue;
    dispatch({
      type: 'updateItemField',
      groupKey,
      itemKey,
      updates: { [field]: String(FIELD_DEFAULT_SUBSTITUTION[field].defaultValue) },
    });
    setHiddenFieldRescue(null);
    setOperationError(null);
  }, [hiddenFieldRescue]);

  /**
   * 項目削除ハンドラ（REQ-5.3, REQ-42.1）
   * ドラフトから項目を削除する（永続化APIは呼ばない）。
   */
  const handleDeleteItem = useCallback(
    (itemKey: string) => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      dispatch({ type: 'removeItem', groupKey, itemKey });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 項目コピーハンドラ（REQ-5.4, REQ-42.1）
   * ドラフト内で項目を複製する（永続化APIは呼ばない）。
   */
  const handleCopyItem = useCallback(
    (itemKey: string) => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      dispatch({ type: 'copyItem', groupKey, itemKey });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 項目移動ハンドラ（REQ-6.3, REQ-24.3, REQ-24.4, REQ-42.1）
   * ドラフト内で項目を上下移動する（永続化APIは呼ばない）。
   */
  const handleMoveItem = useCallback(
    (itemKey: string, direction: 'up' | 'down') => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      dispatch({ type: 'reorderItem', groupKey, itemKey, direction });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 一括操作の対象選択切り替えハンドラ（REQ-6.5）
   * 選択状態はドラフトではないため未保存扱いにはしない。
   */
  const handleItemSelectionChange = useCallback((itemKey: string) => {
    dispatch({ type: 'toggleItemSelection', itemKey });
  }, []);

  /**
   * 単一項目の移動先選択ダイアログを開くハンドラ（REQ-6.2, REQ-6.4）
   * アクションメニューの「別グループに移動」から呼ばれる。
   */
  const handleOpenMoveDialogForItem = useCallback(
    (itemKey: string) => {
      setOperationError(null);
      const groupKey = findGroupKeyByItemKey(itemKey);
      if (groupKey === null) return;
      setMoveTargetSelection({ itemKeys: [itemKey], sourceGroupKey: groupKey });
    },
    [findGroupKeyByItemKey]
  );

  /**
   * 選択中の全項目に対する移動先選択ダイアログを開くハンドラ（REQ-6.5）
   * 移動元グループは先頭の選択項目が属するグループとする（移動先候補から除外するため）。
   */
  const handleOpenMoveDialogForSelection = useCallback(() => {
    setOperationError(null);
    const firstKey = selectedItemKeys[0];
    if (firstKey === undefined) return;
    const groupKey = findGroupKeyByItemKey(firstKey);
    if (groupKey === null) return;
    setMoveTargetSelection({ itemKeys: [...selectedItemKeys], sourceGroupKey: groupKey });
  }, [selectedItemKeys, findGroupKeyByItemKey]);

  /** 移動先選択ダイアログを閉じるハンドラ */
  const handleCloseMoveDialog = useCallback(() => {
    setMoveTargetSelection(null);
  }, []);

  /**
   * 移動先グループ確定ハンドラ（REQ-6.4, REQ-6.5, REQ-42.1）
   * ドラフト内で対象項目を移動先グループへ移し、元のグループから取り除く。
   */
  const handleConfirmMoveItems = useCallback((targetGroupKey: string, itemKeys: string[]) => {
    dispatch({ type: 'moveItems', itemKeys, targetGroupKey });
    setMoveTargetSelection(null);
  }, []);

  /**
   * 選択項目の一括コピーハンドラ（REQ-6.5, REQ-42.1）
   * 各対象の直下へ複製する（単一項目のコピーと同一の挙動）。
   */
  const handleBulkCopyItems = useCallback(() => {
    setOperationError(null);
    dispatch({ type: 'copyItems', itemKeys: selectedItemKeys });
  }, [selectedItemKeys]);

  /**
   * 選択項目の一括削除ハンドラ（REQ-6.5, REQ-42.1）
   */
  const handleBulkDeleteItems = useCallback(() => {
    setOperationError(null);
    dispatch({ type: 'removeItems', itemKeys: selectedItemKeys });
  }, [selectedItemKeys]);

  /** 一括操作の選択解除ハンドラ（REQ-6.5） */
  const handleClearItemSelection = useCallback(() => {
    dispatch({ type: 'clearItemSelection' });
  }, []);

  /**
   * グループ名変更ハンドラ（REQ-22.1, REQ-22.2, REQ-42.2）
   * ドラフトのグループ名を更新する（永続化APIは呼ばない）。
   */
  const handleRenameGroup = useCallback((groupKey: string, newName: string) => {
    setOperationError(null);
    dispatch({ type: 'renameGroup', groupKey, name: newName });
  }, []);

  /**
   * グループを上に移動するハンドラ（REQ-23.3, REQ-23.7, REQ-42.1）
   * ドラフト内でグループを上へ移動する（永続化APIは呼ばない）。
   */
  const handleMoveGroupUp = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'reorderGroup', groupKey, direction: 'up' });
  }, []);

  /**
   * グループを下に移動するハンドラ（REQ-23.4, REQ-23.7, REQ-42.1）
   * ドラフト内でグループを下へ移動する（永続化APIは呼ばない）。
   */
  const handleMoveGroupDown = useCallback((groupKey: string) => {
    setOperationError(null);
    dispatch({ type: 'reorderGroup', groupKey, direction: 'down' });
  }, []);

  // ==========================================================================
  // 描画モデル（renderTable）
  // ドラフト（編集の単一の真実）を、子コンポーネント（QuantityGroupCard /
  // EditableQuantityItemRow）が期待する QuantityTableDetail 形状へ変換する。
  // 各行の id には reducer のキー（既存は id、新規は tempId）を割り当て、
  // 子からのコールバックがそのままドラフト操作のキーとして使えるようにする。
  // surveyImage サマリはスナップショット＋セッション中の紐づけ写真から解決する。
  // ==========================================================================
  const renderTable = useMemo<QuantityTableDetail | null>(() => {
    if (!draft || !snapshot) return null;

    // スナップショット側の surveyImage サマリを surveyImageId で索引化
    const snapshotImages: Record<string, SurveyImageSummary> = {};
    for (const g of snapshot.groups) {
      if (g.surveyImageId && g.surveyImage) {
        snapshotImages[g.surveyImageId] = g.surveyImage;
      }
    }

    const draftItemToDetail = (item: DraftItem, groupKey: string): QuantityItemDetail => ({
      // reducer キーを id として供給（既存は id、新規は tempId）
      id: item.id ?? item.tempId ?? '',
      quantityGroupId: groupKey,
      majorCategory: item.majorCategory ?? '',
      middleCategory: item.middleCategory,
      minorCategory: item.minorCategory,
      customCategory: item.customCategory,
      workType: item.workType,
      name: item.name,
      specification: item.specification,
      unit: item.unit,
      calculationMethod: item.calculationMethod,
      calculationParams: item.calculationParams,
      adjustmentFactor: Number(item.adjustmentFactor),
      roundingUnit: Number(item.roundingUnit),
      quantity: Number(item.quantity),
      remarks: item.remarks,
      displayOrder: item.displayOrder,
      createdAt: '',
      updatedAt: '',
    });

    const draftGroupToDetail = (group: DraftGroup): QuantityGroupDetail => {
      const groupKey = group.id ?? group.tempId ?? '';
      const summary =
        group.surveyImageId !== null
          ? (linkedPhotoSummaries[group.surveyImageId] ??
            snapshotImages[group.surveyImageId] ??
            null)
          : null;
      return {
        id: groupKey,
        quantityTableId: draft.id,
        name: group.name,
        surveyImageId: group.surveyImageId,
        surveyImage: summary,
        displayOrder: group.displayOrder,
        itemCount: group.items.length,
        items: group.items.map((item) => draftItemToDetail(item, groupKey)),
        createdAt: '',
        updatedAt: '',
      };
    };

    const groups = draft.groups.map(draftGroupToDetail);
    const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);

    return {
      ...snapshot,
      id: draft.id,
      name: draft.name,
      groupCount: groups.length,
      itemCount,
      groups,
    };
  }, [draft, snapshot, linkedPhotoSummaries]);

  /**
   * PDF出力ハンドラ
   *
   * Requirements: 26.1, 26.9, 26.10
   *
   * 数量表データをQuantityTablePdfInput形式に変換し、PDFを生成・ダウンロードする。
   */
  const handlePdfExport = useCallback(async () => {
    if (isPdfGenerating || !renderTable) return; // 重複操作防止（REQ-26.9）

    setIsPdfGenerating(true);
    setOperationError(null);

    try {
      const groups = renderTable.groups ?? [];

      // 画像を注釈付きでdata URLに変換するヘルパー（REQ-26.5）
      const renderAnnotatedImageToDataUrl = async (
        imageId: string,
        imageUrl: string
      ): Promise<string | null> => {
        let objectUrl: string | null = null;
        try {
          // 画像をロード（REQ-26.5）。
          // 画面表示の <img> は crossOrigin 無しで同じURLを読み込むため、ブラウザが非CORSの
          // レスポンスをキャッシュする。これを crossOrigin='anonymous' で再取得すると、表示済み
          // （＝可視）グループの画像だけCORSキャッシュ不整合でロード失敗し、PDFに写真が欠ける。
          // fetch でバイト列を取得し object URL 経由でロードすることで、表示側キャッシュと独立に
          // CORSクリーンな画像を得て、全グループの写真を確実にレンダリングする。
          const response = await fetch(imageUrl, { mode: 'cors', cache: 'reload' });
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);

          const htmlImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = objectUrl as string;
          });

          // 注釈データを取得
          let annotationData = null;
          try {
            annotationData = await getAnnotation(imageId);
          } catch {
            // 注釈取得失敗時は元画像を使用
          }

          // 注釈がない場合は元画像をdata URLに変換
          if (
            !annotationData ||
            !annotationData.data?.objects ||
            annotationData.data.objects.length === 0
          ) {
            const canvas = document.createElement('canvas');
            canvas.width = htmlImage.width;
            canvas.height = htmlImage.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(htmlImage, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.85);
          }

          // 注釈がある場合はFabric.jsでレンダリング
          const canvas = document.createElement('canvas');
          canvas.width = htmlImage.width;
          canvas.height = htmlImage.height;
          const fabricCanvas = new FabricCanvas(canvas, {
            width: htmlImage.width,
            height: htmlImage.height,
            renderOnAddRemove: false,
          });

          // 背景画像を設定
          const fabricImage = new FabricImage(htmlImage, {
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
          });
          fabricCanvas.backgroundImage = fabricImage;

          // 注釈オブジェクトを復元
          const enlivenedObjects = await util.enlivenObjects(annotationData.data.objects);
          const savedW = annotationData.data.canvasWidth;
          const savedH = annotationData.data.canvasHeight;
          const scaleX = savedW && savedW > 0 ? htmlImage.width / savedW : 1;
          const scaleY = savedH && savedH > 0 ? htmlImage.height / savedH : 1;

          enlivenedObjects.forEach((obj) => {
            if (obj && typeof obj === 'object' && 'set' in obj) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fabricObj = obj as any;
              if (scaleX !== 1 || scaleY !== 1) {
                fabricObj.set({
                  left: (fabricObj.left ?? 0) * scaleX,
                  top: (fabricObj.top ?? 0) * scaleY,
                  scaleX: (fabricObj.scaleX ?? 1) * scaleX,
                  scaleY: (fabricObj.scaleY ?? 1) * scaleY,
                });
                // ストローク幅の解決（Task 115.110, Req 32.2, 32.8）
                // 復元処理（AnnotationEditor）および他の書き出し経路と同じ方式へ揃える。
                // 集合体（Group）の注釈は実描画を子が保持し、表示倍率は上の scaleX / scaleY
                // 経由で子へ伝搬する。集合体自身の strokeWidth は子から複写された後方互換用の
                // 値であり、ここへ重ねて倍率を掛けると複写元（実描画）と座標系が食い違う。
                const avgScale = (scaleX + scaleY) / 2;
                if (fabricObj.strokeWidth) {
                  fabricObj.set({
                    strokeWidth: resolveRestoredStrokeWidth(
                      fabricObj,
                      fabricObj.strokeWidth,
                      avgScale
                    ),
                  });
                }
              }
              fabricCanvas.add(fabricObj);
            }
          });

          fabricCanvas.renderAll();
          const dataUrl = fabricCanvas.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: 1 });
          fabricCanvas.dispose();
          return dataUrl;
        } catch {
          return null;
        } finally {
          // object URL を解放（メモリリーク防止）
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        }
      };

      // 数量表データをPDF入力形式に変換（注釈付き画像をレンダリング）
      const pdfGroups = await Promise.all(
        groups.map(async (group, index) => {
          let photoDataUrl: string | null = null;
          if (group.surveyImage) {
            const imageUrl = group.surveyImage.originalUrl;
            photoDataUrl = await renderAnnotatedImageToDataUrl(group.surveyImage.id, imageUrl);
          }

          return {
            name: getGroupDisplayName(group, index),
            displayOrder: group.displayOrder,
            photoDataUrl,
            photoComment: group.surveyImage?.comment || null,
            items: (group.items ?? []).map((item) => ({
              majorCategory: item.majorCategory || '',
              middleCategory: item.middleCategory || '',
              minorCategory: item.minorCategory || '',
              customCategory: item.customCategory || '',
              workType: item.workType || '',
              name: item.name || '',
              specification: item.specification || '',
              calculationMethod: CALCULATION_METHOD_LABELS[item.calculationMethod],
              quantity: String(item.quantity),
              unit: item.unit || '',
              remarks: item.remarks || '',
            })),
          };
        })
      );

      // PDF生成
      const now = new Date();
      const createdDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
      const { generateQuantityTablePdf } = await loadQuantityTablePdfExportService();
      const blob = await generateQuantityTablePdf({
        quantityTableName: renderTable.name,
        projectName: renderTable.project.name,
        createdDate,
        groups: pdfGroups,
      });

      // ダウンロード
      const { downloadPdf } = await loadPdfExportService();
      downloadPdf(blob, `${renderTable.name}.pdf`);
    } catch {
      // REQ-26.10: エラーメッセージ表示
      setOperationError('PDF生成中にエラーが発生しました。再度お試しください。');
    } finally {
      setIsPdfGenerating(false);
    }
  }, [isPdfGenerating, renderTable]);

  /**
   * インポートハンドラ
   *
   * Requirements: 27.1, 31.3, 31.8, 42.4, 42.6
   *
   * ImportDialogから受け取った数量項目をクライアントサイドの編集状態（ドラフト）の
   * 対象グループ末尾へ一括追加する。永続化を目的とするサーバーAPIは発行せず、
   * 取り込んだ項目は未保存のドラフト項目として保持され、保存操作時にのみ永続化する
   * （REQ-42.4 / REQ-42.6 / REQ-31 注記）。
   *
   * `groupId` は ImportDialog の取り込み先選択UIから渡される描画モデル上のグループ
   * 識別子で、既存グループは実 id、新規グループは tempId に等しい（reducer の groupKey と同一）。
   */
  const handleImport = useCallback(
    async (groupId: string, items: ImportQuantityItem[]) => {
      setOperationError(null);

      try {
        dispatch({ type: 'importItems', groupKey: groupId, items });
      } catch {
        setOperationError('インポートに失敗しました');
        throw new Error('インポートに失敗しました');
      }
    },
    [dispatch]
  );

  /**
   * 「現場調査から一括追加」ボタン押下ハンドラ
   *
   * Task 57.3
   * Requirements: 40.1, 40.2
   *
   * 当該プロジェクトの現場調査一覧を取得し、`imageCount` を `photoCount` に
   * マッピングして現場調査選択ダイアログを開く。
   */
  const handleOpenSurveySelect = useCallback(async () => {
    if (!snapshot || isCreatingFromSurvey) return;

    setOperationError(null);
    setIsSurveySelectDialogOpen(true);
    setSurveyOptions([]);

    try {
      const result = await getSiteSurveys(snapshot.projectId, { limit: 100 });
      const options: SiteSurveySummary[] = result.data.map((survey) => ({
        id: survey.id,
        name: survey.name,
        photoCount: survey.imageCount,
      }));
      setSurveyOptions(options);
    } catch {
      setOperationError('現場調査一覧の読み込みに失敗しました');
      setIsSurveySelectDialogOpen(false);
    }
  }, [snapshot, isCreatingFromSurvey]);

  /**
   * 現場調査選択ダイアログを閉じる
   *
   * Task 57.3
   */
  const handleCloseSurveySelect = useCallback(() => {
    // 生成中はロック（重複実行防止のため閉じない）
    if (isCreatingFromSurvey) return;
    setIsSurveySelectDialogOpen(false);
    setSurveyOptions([]);
  }, [isCreatingFromSurvey]);

  /**
   * 現場調査からの一括生成を確定するハンドラ（クライアントサイドドラフト生成）
   *
   * Task 61.3
   * Requirements: 42.4, 40.3, 40.4, 40.5, 40.7, 40.9, 40.13
   *
   * REQ-42 適用後の動作:
   * - 対象現場調査の写真一覧を参照系GET（getSiteSurvey）で取得する（REQ-42.10 の制約対象外）。
   * - 写真枚数分の数量グループをクライアントサイドのドラフトへ生成する。
   *   採番・連番命名「{現場調査名} {連番}」・写真順 surveyImageId 紐づけ・項目0件・末尾追加は
   *   reducer の `generateGroupsFromSurvey` が担当する（REQ-40.3/40.4/40.5/40.7/40.9）。
   * - 永続化を目的とするサーバーAPI（POST /from-survey）および詳細再取得は本フローで呼ばない（REQ-42.4）。
   * - 写真の表示順は `displayOrder` 昇順を正とし、その順序で surveyImageId を渡す。
   * - 紐づけ写真のコメント・サムネイルを既存の表示経路（renderTable の linkedPhotoSummaries 経由、
   *   REQ-21/35、REQ-40.8）に乗せるため、写真サマリを linkedPhotoSummaries へ登録する。
   * - 実行中インジケーター表示・重複実行防止（REQ-40.11、isCreatingFromSurvey）。
   * - 写真0枚の場合は「写真が存在しません」メッセージを表示しグループを生成しない（REQ-40.10）。
   * - 成功時は生成グループ数を含む完了メッセージを表示する（REQ-40.13）。
   * - 失敗時はエラーメッセージを表示し、不完全な生成データを残さない（REQ-40.12）。
   */
  const handleConfirmCreateFromSurvey = useCallback(
    async (siteSurveyId: string) => {
      if (!id || isCreatingFromSurvey) return;

      setIsCreatingFromSurvey(true);
      setOperationError(null);

      try {
        // 参照系GETで対象現場調査の写真一覧を取得する（REQ-42.10、永続化を伴わない）
        const surveyDetail = await getSiteSurvey(siteSurveyId);
        // 写真順は displayOrder 昇順を正とする（REQ-40.4）
        const orderedImages = [...surveyDetail.images].sort(
          (a, b) => a.displayOrder - b.displayOrder
        );

        if (orderedImages.length === 0) {
          // 写真0枚: グループは生成しない（REQ-40.10）
          setOperationError('写真が存在しません');
          return;
        }

        // 紐づけ写真のサマリ（サムネイル・コメント等）を既存表示経路へ供給する（REQ-40.8）
        setLinkedPhotoSummaries((prev) => {
          const next = { ...prev };
          for (const img of orderedImages) {
            next[img.id] = {
              id: img.id,
              thumbnailUrl: img.thumbnailUrl || img.originalUrl || '',
              originalUrl: img.originalUrl || '',
              fileName: img.fileName,
              // 注釈の目印の判定源は、サーバーが供給する「描画された注釈の有無」
              // （hasDrawnAnnotations）に一本化する。合成済みサムネイル
              // （annotatedThumbnailUrl）は回転のみの保存でも生成され、注釈レコードの存在
              // から導出される hasAnnotations も回転のみの保存で真になるため、どちらを
              // 判定源にしても注釈0件の写真が注釈ありと誤表示される
              // （site-survey Task 115.7 / 115.13、Requirement 20.2）。
              hasAnnotations: img.hasAnnotations ?? false,
              hasDrawnAnnotations: img.hasDrawnAnnotations ?? false,
              annotatedThumbnailUrl: img.annotatedThumbnailUrl ?? null,
              comment: img.comment ?? null,
            };
          }
          return next;
        });

        // クライアントサイドのドラフトへ写真枚数分のグループを生成する（REQ-42.4）
        const surveyImageIds = orderedImages.map((img) => img.id);
        dispatch({
          type: 'generateGroupsFromSurvey',
          surveyName: surveyDetail.name,
          surveyImageIds,
        });

        setIsSurveySelectDialogOpen(false);
        setSurveyOptions([]);

        setSaveMessage(`${surveyImageIds.length}件のグループを生成しました`);
        setTimeout(() => setSaveMessage(null), 3000);
      } catch {
        // 写真一覧取得失敗等。ドラフトは未変更のままで不完全データを残さない（REQ-40.12）
        setOperationError('現場調査からの一括生成に失敗しました');
      } finally {
        setIsCreatingFromSurvey(false);
      }
    },
    [id, isCreatingFromSurvey]
  );

  /**
   * 保存ハンドラ
   *
   * Task 61.4: 保存ハンドラを saveDraft へ移行し保存後同期・失敗時保持を実装する
   * Task 68.7: 保存前の計算パラメータ検証（箇所数・ピッチ・面積体積）を配線する
   * Requirements: 42.5, 42.7, 42.8, 42.9, 11.1, 11.2, 8.7, 8.10, 8.15, 47.9
   *
   * - クライアント検証（必須・丸め設定・計算パラメータ）後、編集ドラフトの全状態を
   *   {@link buildSaveQuantityTableDraftInput} でフル状態同期保存ペイロードへ構築し、
   *   {@link saveQuantityTableDraft}（PUT /:id/save）を1回だけ呼び出す（REQ-42.5）。
   *   楽観ロック用 expectedUpdatedAt はサーバースナップショットの updatedAt を渡す。
   * - 成功時: レスポンスの最新 QuantityTableDetail でスナップショット（参照情報・写真サマリ供給元）と
   *   ドラフト（reducer saveSync → isDirty=false）を同期し、「保存しました」を表示する（REQ-42.8）。
   *   saveDraft レスポンスで同期するため保存後の再取得（GET）は行わない。
   * - 失敗時: 409 は競合専用メッセージ、現調画像の紐付けの失敗（400 他プロジェクト / 404 写真の削除 /
   *   410 現場調査の削除）は {@link describeSurveyImageLinkSaveFailure} が書き分けた文言（Task 86.5）、
   *   それ以外（500等）は一般エラーメッセージを表示し、ドラフト（未保存の変更）を保持したまま
   *   再保存可能とする（REQ-42.9）。
   * - 自動保存は持たず、永続化は本保存操作時にのみ実行する（REQ-42.7）。
   */
  const handleSave = useCallback(async () => {
    const draftToSave = editState.draft;
    if (!draftToSave || !snapshot || !id) return;

    // REQ-11.2: 整合性チェック（ドラフトの最終状態を検証する）
    //
    // Task 90.1: 各誤りは告知の文言に加え、描画されない欄の範囲外の既存値であれば
    // 既定値へ戻す操作の対象（`rescue`）を持つ。先頭の誤りだけを告げるため、操作も先頭の誤りに限る。
    const validationErrors: Array<{
      message: string;
      rescue?: Omit<HiddenFieldRescue, 'message'>;
    }> = [];
    for (const group of draftToSave.groups) {
      const groupLabel = group.name ?? '';
      const groupKey = group.id ?? group.tempId ?? '';
      for (const item of group.items) {
        const itemLabel = item.name || '(名称未設定)';
        const itemKey = item.id ?? item.tempId ?? '';
        // 計算方法「標準」では調整係数・丸め設定の欄を描画しない（REQ-9 の表示条件 / REQ-10.8）
        const isSettingHidden = item.calculationMethod === 'STANDARD';
        const pushOutOfRangeSetting = (field: OutOfRangeCheckedField, rawValue: string) => {
          const isHidden = field !== 'quantity' && isSettingHidden;
          validationErrors.push({
            message: describeOutOfRangeSetting(groupLabel, itemLabel, field, rawValue, isHidden),
            // `isHidden` が真なら `field` は数量ではない（型が別名の条件で絞り込む）
            ...(isHidden ? { rescue: { groupKey, itemKey, field } } : {}),
          });
        };

        // 項目名が空の場合はエラー
        if (!item.name || item.name.trim() === '') {
          validationErrors.push({
            message: `グループ「${groupLabel}」に項目名が空の項目があります`,
          });
        }
        // 丸め設定が範囲外の場合はエラー（REQ-10.3 / REQ-11.2）。
        //
        // Task 80.2: 範囲は `utils/numeric-range-validation.ts` の正典から引く。
        // 改める前は `Number(item.roundingUnit) <= 0` と直書きしており、正典の下限
        // `0.01` とも上限 `99.99` とも一致していなかった（0.005 は通り、1000 も通った）。
        //
        // **本層は `0` を既定値へ差し替えず、拒否する。** 欄の側（`AdjustmentField`）は
        // REQ-10.4 に従い `0` と空白を既定値 `0.01` へ差し替えてから範囲判定へ渡すが、
        // 本層は保存直前の最終状態を検める層であり、REQ-10.4 が働く機会は既に過ぎている。
        // ここまで残った `0` は「利用者が入力した未設定の印」ではなく、
        // どの欄の層にも触れられずに紛れ込んだ値である。`applyRounding()` は単位が
        // `0` 以下で例外を投げるため、これは REQ-11.2 が保存を中断すべき不整合そのものである。
        // すなわち二つの層は**規則が食い違っているのではなく、役割が違う**——
        // 欄は未設定を繕う層、本層は繕われた後を検める層であり、範囲は一つの正典から引く。
        //
        // Task 90.1: 正典より広い範囲で永続化された既存値（例: 旧保存経路の上限 999.99 の内側）も
        // ここで止まる。告知は現在の値と範囲を名指し、範囲内の値の入力を求める（REQ-10.3）。
        // 欄が描画されない「標準」の項目では欄から直せないため、告知に既定値へ戻す操作を添える。
        if (!validateNumericRange(Number(item.roundingUnit), 'roundingUnit').isValid) {
          pushOutOfRangeSetting('roundingUnit', item.roundingUnit);
        }
        // 調整係数が範囲外の場合はエラー（REQ-9.3 / REQ-11.2）。
        //
        // Task 85.1: 改める前は「保存経路が受け付けない領域」という別の層
        // （`validateSavePersistability`）を置き、`0` と負値を保存の手前で止めていた。
        // バックエンドの範囲が REQ-9.3 の有効域 `-9.99〜9.99` へ揃った（保存経路の
        // `z.number().positive()` は撤廃された）ため、その層は役目を終えた。
        // **`0` と負値は有効域の内側であり、いまはそのまま保存される。**
        // ここに残るのは丸め設定と同じ範囲判定だけであり、出所も同じ正典である。
        if (!validateNumericRange(Number(item.adjustmentFactor), 'adjustmentFactor').isValid) {
          pushOutOfRangeSetting('adjustmentFactor', item.adjustmentFactor);
        }
        // 数量が範囲外の場合はエラー（REQ-15.1 / REQ-11.2）。
        //
        // Task 90.1: 改める前の本層は数量の範囲を見ておらず、範囲外の既存値（タスク 85.1 より前の
        // 作成経路は数量に上限を課さなかった）は保存経路の 400 で初めて止まり、画面は一般の
        // 「再度お試しください」を出していた。再試行しても成功せず、問題箇所も名指さない。
        // 範囲は保存経路（`validateItemFieldSpecs`）と同じ正典の値であり、画面だけが弾く状態は作らない。
        if (!validateNumericRange(Number(item.quantity), 'quantity').isValid) {
          pushOutOfRangeSetting('quantity', item.quantity);
        }
        // 計算方法ごとの必須パラメータ（箇所数・ピッチ必須項目・面積体積の1項目以上）を検証する。
        // 検証は utils/calculation-params-validation を単一情報源とし、バックエンドの
        // 保存時検証（400）と同じ必須条件・同じ文言をサーバー送信前に画面へ提示する
        // （REQ-8.7/8.10/8.15, REQ-47.9/47.10/47.11）。
        for (const issue of validateCalculationParams(item)) {
          validationErrors.push({
            message: `グループ「${groupLabel}」の項目「${itemLabel}」: ${issue.message}`,
          });
        }
      }
    }

    // エラーがある場合は保存を中断
    const firstError = validationErrors[0];
    if (firstError !== undefined) {
      const message = '保存できません: ' + firstError.message;
      setOperationError(message);
      setHiddenFieldRescue(firstError.rescue ? { ...firstError.rescue, message } : null);
      return;
    }
    setHiddenFieldRescue(null);

    // フル状態同期保存（REQ-42.5）。1回の PUT で全状態を確定する。
    setSaveMessage('保存中...');
    setOperationError(null);

    try {
      // ドラフトの全状態をペイロードへ構築（displayOrder は配列順、新規行は tempId 保持）
      const input = buildSaveQuantityTableDraftInput(draftToSave, snapshot.updatedAt);

      // 1回のAPIリクエストでフル状態を保存し、採番済みの最新詳細を取得する
      const savedDetail = await saveQuantityTableDraft(id, input);

      // REQ-42.8: サーバー最新データでスナップショット/ドラフトを同期し isDirty=false
      setSnapshot(savedDetail);
      setLinkedPhotoSummaries({});
      dispatch({ type: 'saveSync', detail: savedDetail });

      setSaveMessage('保存しました');
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    } catch (error) {
      // REQ-42.9: 失敗時はエラー表示し、ドラフト（未保存変更）を保持して再保存可能とする
      if (error instanceof ApiError && error.statusCode === 409) {
        // 楽観ロック競合（409）は競合専用メッセージを表示する
        setOperationError(
          '他のユーザーによって更新されました。ページを再読み込みして最新データを確認してください。'
        );
      } else {
        // 現調画像の紐付けの失敗（400 他プロジェクト / 404 写真の削除 / 410 現場調査の削除）は
        // いずれも恒久的で、再試行しても成功しない。利用者が取るべき行動も違うため、一般の文言へ
        // 畳まずに書き分ける（Task 86.5）。原因のグループは保存要求の構築元であるドラフトの
        // 並びから引き当てる。それ以外の失敗は従来どおり一般の文言とする。
        setOperationError(
          describeSurveyImageLinkSaveFailure(error, draftToSave.groups) ??
            '保存に失敗しました。再度お試しください。'
        );
      }
      setSaveMessage(null);
    }
  }, [id, editState.draft, snapshot]);

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
          <p>読み込み中...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    );
  }

  // 読み込みエラー表示（全画面）
  if (loadError) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{loadError}</p>
          <button type="button" onClick={fetchQuantityTableDetail} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // データがない場合
  if (!renderTable) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>数量表が見つかりません</p>
        </div>
      </main>
    );
  }

  const groups = renderTable.groups ?? [];

  return (
    <main role="main" style={styles.container} data-testid="quantity-table-edit-area">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: renderTable.project.name, path: `/projects/${renderTable.projectId}` },
            { label: '数量表一覧', path: `/projects/${renderTable.projectId}/quantity-tables` },
            { label: renderTable.name },
          ]}
        />
      </div>

      {/* ヘッダー（Task 62.3: sticky 固定。REQ-45.1, 45.2, 45.4） */}
      <div style={styles.header} data-testid="quantity-table-edit-header">
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${renderTable.projectId}/quantity-tables`}
            style={styles.backLink}
            aria-label="数量表一覧に戻る"
          >
            ← 数量表一覧に戻る
          </Link>
          <h1 style={{ margin: 0 }}>
            <input
              type="text"
              value={editingName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onFocus={handleNameFocus}
              onKeyDown={handleNameKeyDown}
              style={{
                ...styles.titleInput,
                ...(isNameFocused ? styles.titleInputFocused : {}),
              }}
              aria-label="数量表名"
            />
          </h1>
          <p style={styles.subtitle}>
            {renderTable.groupCount}グループ / {renderTable.itemCount}項目
          </p>
        </div>
        <div style={styles.headerActions} data-testid="quantity-table-edit-header-actions">
          {/* Task 62.2: 未保存変更インジケーター（REQ-44）。isDirty の間のみ保存ボタン付近に表示 */}
          <UnsavedChangesBadge isUnsaved={isDirty} />
          {saveMessage && (
            <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: 500 }}>
              {saveMessage}
            </span>
          )}
          <button
            type="button"
            style={{
              ...styles.pdfExportButton,
              backgroundColor: '#0891b2',
            }}
            onClick={() => setIsImportDialogOpen(true)}
            aria-label="インポート"
          >
            インポート
          </button>
          <button
            type="button"
            style={{
              ...styles.pdfExportButton,
              opacity: isPdfGenerating ? 0.7 : 1,
              cursor: isPdfGenerating ? 'wait' : 'pointer',
            }}
            onClick={handlePdfExport}
            disabled={isPdfGenerating}
            aria-label="PDF出力"
          >
            {isPdfGenerating ? 'PDF生成中...' : 'PDF出力'}
          </button>
          <button type="button" style={styles.saveButton} onClick={handleSave} aria-label="保存">
            保存
          </button>
          <button type="button" style={styles.addGroupButton} onClick={handleAddGroup}>
            <PlusIcon />
            グループを追加
          </button>
          {/* 現場調査から一括追加ボタン (Task 57.3: REQ-40.1) */}
          <button
            type="button"
            style={{
              ...styles.addGroupButton,
              backgroundColor: '#0d9488',
              opacity: isCreatingFromSurvey ? 0.7 : 1,
              cursor: isCreatingFromSurvey ? 'wait' : 'pointer',
            }}
            onClick={handleOpenSurveySelect}
            disabled={isCreatingFromSurvey}
            aria-busy={isCreatingFromSurvey}
            data-testid="bulk-create-from-survey-button"
          >
            <PlusIcon />
            現場調査から一括追加
          </button>
        </div>
      </div>

      {/* 取得時に落とした現調画像の紐付けの告知（Task 86.5） */}
      {droppedSurveyImageLinkNotice && (
        <div
          role="status"
          data-testid="survey-image-link-dropped-notice"
          style={styles.surveyImageLinkNotice}
        >
          {droppedSurveyImageLinkNotice}
        </div>
      )}

      {/* 操作エラー表示（インライン） */}
      {operationError && (
        <div role="alert" style={styles.operationErrorContainer}>
          <p style={styles.operationErrorText}>{operationError}</p>
          {hiddenFieldRescue !== null && hiddenFieldRescue.message === operationError && (
            <button
              type="button"
              style={styles.operationErrorAction}
              onClick={handleRescueHiddenField}
            >
              {describeHiddenFieldRescueAction(hiddenFieldRescue.field)}
            </button>
          )}
          <button
            type="button"
            style={styles.operationErrorDismiss}
            onClick={() => setOperationError(null)}
            aria-label="エラーを閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* 数量項目の移動先グループ選択ダイアログ（REQ-6.2, 6.4, 6.5） */}
      {moveTargetSelection !== null && (
        <ItemCopyMoveDialog
          isOpen
          mode="move"
          selectedItemIds={moveTargetSelection.itemKeys}
          groups={groups}
          currentGroupId={moveTargetSelection.sourceGroupKey}
          onConfirm={handleConfirmMoveItems}
          onClose={handleCloseMoveDialog}
        />
      )}

      {/* グループ一覧 */}
      {groups.length === 0 ? (
        <EmptyState onAddGroup={handleAddGroup} />
      ) : (
        <div style={styles.groupList} data-testid="quantity-group-section">
          {groups.map((group, index) => (
            <div key={group.id} data-testid="quantity-group">
              <QuantityGroupCard
                group={group}
                groupDisplayName={getGroupDisplayName(group, index)}
                isEditable
                onAddItem={handleAddItem}
                onDeleteGroup={handleDeleteGroup}
                onSelectImage={handleSelectImage}
                onUnlinkImage={handleUnlinkImage}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onCopyItem={handleCopyItem}
                onMoveItem={handleMoveItem}
                onMoveItemToGroup={handleOpenMoveDialogForItem}
                selectedItemIds={selectedItemKeys}
                onItemSelectionChange={handleItemSelectionChange}
                onOpenAnnotationViewer={handleOpenAnnotationViewer}
                getSuggestions={getSuggestions}
                onBlurAddCandidate={addCandidateOnBlur}
                onRenameGroup={handleRenameGroup}
                groupIndex={index}
                groupTotalCount={groups.length}
                onMoveGroupUp={handleMoveGroupUp}
                onMoveGroupDown={handleMoveGroupDown}
                onCopyGroup={handleCopyGroup}
              />
            </div>
          ))}
        </div>
      )}

      {/* 選択した数量項目に対する一括操作（REQ-6.5）。
          「現場調査から一括追加」は選択項目に対する操作ではないため名称で明確に区別する。
          Task 115.38: 下方の行を選択しても操作面が画面外へ出ないよう、数量グループ一覧の
          後ろに置いてビューポート下端へ sticky 固定する（styles.bulkActionBar 参照）。 */}
      {selectedItemKeys.length > 0 && (
        <div style={styles.bulkActionBar} data-testid="quantity-item-bulk-action-bar">
          <span style={styles.bulkActionCount}>{selectedItemKeys.length}件の項目を選択中</span>
          <button
            type="button"
            style={styles.bulkActionButton}
            onClick={handleBulkCopyItems}
            aria-label="選択した項目をコピー"
          >
            選択した項目をコピー
          </button>
          <button
            type="button"
            style={styles.bulkActionButton}
            onClick={handleOpenMoveDialogForSelection}
            aria-label="選択した項目を移動"
          >
            選択した項目を移動
          </button>
          <button
            type="button"
            style={{ ...styles.bulkActionButton, ...styles.bulkActionDeleteButton }}
            onClick={handleBulkDeleteItems}
            aria-label="選択した項目を削除"
          >
            選択した項目を削除
          </button>
          <button
            type="button"
            style={styles.bulkActionClearButton}
            onClick={handleClearItemSelection}
            aria-label="選択を解除"
          >
            選択を解除
          </button>
        </div>
      )}

      {/* 削除確認ダイアログ (REQ-4.5) */}
      {groupToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          style={styles.dialogOverlay}
          onClick={handleCancelDelete}
        >
          <div style={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-dialog-title" style={styles.dialogTitle}>
              グループを削除しますか？
            </h2>
            <p style={styles.dialogMessage}>
              このグループとその中のすべての項目が削除されます。この操作は元に戻せません。
            </p>
            <div style={styles.dialogActions}>
              <button type="button" style={styles.cancelButton} onClick={handleCancelDelete}>
                キャンセル
              </button>
              <button type="button" style={styles.deleteButton} onClick={handleConfirmDeleteGroup}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 写真選択ダイアログ (REQ-4.3) */}
      {isPhotoDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-dialog-title"
          style={styles.dialogOverlay}
          onClick={handleClosePhotoDialog}
        >
          <div style={styles.photoDialogContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.photoDialogHeader}>
              <h2 id="photo-dialog-title" style={styles.dialogTitle}>
                写真を選択
              </h2>
              <button
                type="button"
                style={styles.closeButton}
                onClick={handleClosePhotoDialog}
                aria-label="ダイアログを閉じる"
              >
                ×
              </button>
            </div>
            {isLoadingPhotos ? (
              <div style={styles.emptyPhotos}>
                <p>写真を読み込み中...</p>
              </div>
            ) : photoListError !== null ? (
              // 取得に失敗した旨はダイアログの中で伝える。0件の案内を出すと、
              // 取得の失敗を「注釈付きの写真が無い」と取り違えさせる
              // （Requirement 49.9 の Error Handling）。
              <div style={styles.photoListError} data-testid="photo-list-error" role="alert">
                <p>{photoListError}</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>
                  通信の状態を確認して、もう一度お試しください。
                </p>
              </div>
            ) : projectSurveyImages.length === 0 ? (
              // 一覧の対象は注釈エディタで編集済みの写真のみ（Requirement 4.3 / 19.2）。
              // 0件のときは注釈エディタでの編集を促す（Requirement 49.9 の Error Handling）。
              <div style={styles.emptyPhotos} data-testid="photo-list-empty">
                <p>注釈付きの写真がありません</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>
                  現場調査の注釈エディタで写真を編集すると、ここから選択できるようになります
                </p>
              </div>
            ) : (
              <>
                {/* 上限に達して切り捨てが発生した旨を提示する（Requirement 49.9） */}
                {isPhotoListTruncated && (
                  <p data-testid="photo-list-truncated-notice" style={styles.photoListNotice}>
                    写真が多いため、一覧にすべての写真は含まれていません。
                  </p>
                )}
                <div style={styles.photoGrid} data-testid="photo-list">
                  {projectSurveyImages.map((photo) => (
                    <div
                      key={photo.id}
                      style={{ ...styles.photoItem, position: 'relative' as const }}
                      onClick={() => handlePhotoSelect(photo.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${photo.fileName}を選択`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePhotoSelect(photo.id);
                        }
                      }}
                    >
                      {/*
                        表示元はサーバーが解決済みの表示用URL（サムネイル解像度）を用いる。
                        注釈の有無で表示元を分岐しない（Requirement 49.10）。
                      */}
                      <img
                        src={photo.displayUrl ?? ''}
                        alt={photo.fileName}
                        style={styles.photoImage}
                        data-testid={`photo-item-${photo.id}`}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 注釈ビューアモーダル (REQ-4.4) */}
      {annotationViewerGroupId &&
        (() => {
          const viewerGroup = groups.find((g) => g.id === annotationViewerGroupId);
          if (!viewerGroup?.surveyImage) return null;
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="annotation-viewer-title"
              style={styles.dialogOverlay}
              onClick={handleCloseAnnotationViewer}
              data-testid="annotation-viewer-modal"
            >
              <div
                style={{
                  ...styles.photoDialogContent,
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={styles.photoDialogHeader}>
                  <h2 id="annotation-viewer-title" style={styles.dialogTitle}>
                    {getGroupDisplayName(viewerGroup, groups.indexOf(viewerGroup))} - 紐付け画像
                  </h2>
                  <button
                    type="button"
                    style={styles.closeButton}
                    onClick={handleCloseAnnotationViewer}
                    aria-label="ダイアログを閉じる"
                  >
                    ×
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    overflow: 'auto',
                    padding: '16px',
                  }}
                >
                  <AnnotatedImageThumbnail
                    image={{
                      id: viewerGroup.surveyImage.id,
                      originalUrl: viewerGroup.surveyImage.originalUrl,
                    }}
                    alt={viewerGroup.surveyImage.fileName}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                    }}
                    loading="eager"
                  />
                </div>
                <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <button
                    type="button"
                    style={styles.actionButton}
                    onClick={() => {
                      handleCloseAnnotationViewer();
                      handleSelectImage(annotationViewerGroupId);
                    }}
                  >
                    別の写真を選択
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* インポートダイアログ (REQ-27.1) */}
      <ImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImport={handleImport}
        groups={groups}
      />

      {/* 現場調査選択ダイアログ (Task 57.3: REQ-40.1, 40.2, 40.11, 40.13) */}
      <SurveySelectDialog
        isOpen={isSurveySelectDialogOpen}
        siteSurveys={surveyOptions}
        isCreating={isCreatingFromSurvey}
        onConfirm={handleConfirmCreateFromSurvey}
        onClose={handleCloseSurveySelect}
      />

      {/* 未保存変更時の離脱確認ダイアログ (Task 62.1: REQ-43.1, 43.3, 43.4) */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />
    </main>
  );
}
