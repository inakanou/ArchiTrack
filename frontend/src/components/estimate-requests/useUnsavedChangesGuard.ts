/**
 * @fileoverview 未保存変更ガード（dirty 判定 + beforeunload + 確認ダイアログ）
 *
 * Task 79.2: isFormDirty 純粋関数と useUnsavedChangesGuard カスタムフックの実装
 *
 * Requirements:
 * - 38.12: 未保存変更がある状態でダイアログクローズ要求があった場合、
 *          確認ダイアログを表示し、ユーザーが「はい」を選択した場合のみクローズする
 * - 38.13: 未保存変更がある状態でページ離脱が検知された場合、
 *          ブラウザ標準の beforeunload 確認ダイアログを表示する
 *
 * Design Reference:
 * - design.md「カスタムフック: 未保存変更ガード」(4812-4835)
 * - design.md「ReceivedQuotationForm - 改訂4 Implementation Notes - isDirty 判定」(4905-4911)
 *
 * Notes:
 * - 本モジュールは ReceivedQuotationForm の dirty 判定とダイアログ離脱ガードを
 *   提供する純粋関数（`isFormDirty`）とカスタムフック（`useUnsavedChangesGuard`）を集約する。
 * - ReceivedQuotationForm への接続は task 79.3 のスコープ。
 *   本タスク（79.2）では Form 本体には接続せず、関数とフックの追加のみ行う。
 * - ユニットテストは task 81.3 で追加する。
 */

import { useCallback, useEffect } from 'react';
import type { LineItemFormData } from './LineItemEditor';

// ============================================================================
// 型定義
// ============================================================================

/**
 * フォームの dirty 判定に用いるスナップショット型
 *
 * ReceivedQuotationForm 内部の form state のうち、ユーザー入力で変化しうる
 * フィールドのみを切り出した形状。`amount`（数量×単価の自動計算結果）と
 * クライアントサイド一時 ID（`id`）は dirty 判定の対象外のため、
 * lineItems は LineItemFormData[] のまま保持し、`isFormDirty` 内で除外する。
 *
 * - `submittedAt`: ReceivedQuotationForm では `string`（YYYY-MM-DD）として保持されるが、
 *   将来 Date 化された場合にも対応するため `string | Date | null` を許容する。
 * - `netAmount`: ReceivedQuotationForm では `string`（formatUnitPrice 済み）として保持されるが、
 *   将来 number 化された場合にも対応するため `string | number | null` を許容する。
 *
 * Requirements: 38.12
 */
export interface FormSnapshot {
  /** 受領見積書名 */
  name: string;
  /** 提出日（string=YYYY-MM-DD / Date / null を許容） */
  submittedAt: string | Date | null;
  /** NET 金額（string / number / null を許容） */
  netAmount: string | number | null;
  /** 添付ファイル（参照同一性で比較） */
  selectedFile: File | null;
  /** 明細行 */
  lineItems: LineItemFormData[];
}

/**
 * useUnsavedChangesGuard の戻り値
 */
export interface UseUnsavedChangesGuardResult {
  /**
   * ダイアログクローズ要求時の確認用コールバック。
   *
   * - `isDirty=false` の場合: 何もせず `true` を返す（クローズ可）
   * - `isDirty=true` の場合: `window.confirm` を表示し、ユーザーの選択結果を返す
   *   - 「OK」選択 → `true` を返す（クローズ可）
   *   - 「キャンセル」選択 → `false` を返す（クローズ不可）
   *
   * Requirements: 38.12
   */
  confirmCloseIfDirty: () => boolean;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * ダイアログクローズ要求時の確認メッセージ
 *
 * Requirements: 38.12
 */
export const UNSAVED_CHANGES_CONFIRM_MESSAGE = '変更が保存されていません。閉じてもよろしいですか？';

/**
 * `isFormDirty` の lineItems 比較対象フィールド
 *
 * `amount`（数量×単価の自動計算結果）と `id`（クライアントサイド一時 ID）は
 * 判定対象から除外する。
 *
 * Requirements: 38.12
 * Design: 4908
 */
const LINE_ITEM_COMPARE_FIELDS: ReadonlyArray<keyof LineItemFormData> = [
  'customCategory',
  'workType',
  'name',
  'specification',
  'unit',
  'quantity',
  'unitPrice',
  'remarks',
  'sortOrder',
];

// ============================================================================
// 内部ユーティリティ
// ============================================================================

/**
 * scalar フィールド値を文字列に正規化する。
 *
 * - `null`/`undefined`/`''` は空文字列として扱い、空入力同士を等価とする。
 * - `Date` は `toISOString()` で文字列化する。
 * - その他（string / number / boolean 等）は `String(value)` で文字列化する。
 *
 * Design: 4906
 */
function normalizeScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * lineItem の各フィールド値を文字列に正規化する。
 *
 * `null`/`undefined` を空文字列として扱う。それ以外は `String(value)` で文字列化する。
 *
 * Design: 4908
 */
function normalizeLineItemValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * 2 つの lineItems 配列が dirty 判定上等価かどうかを返す。
 *
 * 比較規則:
 * - 配列長が異なる場合は不一致
 * - 各行について、`LINE_ITEM_COMPARE_FIELDS` のいずれかが文字列等価で異なる場合に不一致
 * - `amount` と `id` は判定対象から除外
 *
 * Design: 4908
 */
function lineItemsAreEqual(a: LineItemFormData[], b: LineItemFormData[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    // 長さ一致を上で確認しているため `other` は常に存在するが、TS の noUncheckedIndexedAccess
    // を考慮して明示的にガードする。
    if (!other) return false;
    return LINE_ITEM_COMPARE_FIELDS.every(
      (field) => normalizeLineItemValue(row[field]) === normalizeLineItemValue(other[field])
    );
  });
}

// ============================================================================
// 公開 API: isFormDirty 純粋関数
// ============================================================================

/**
 * 現在の form state が初期スナップショットと差分があるかを判定する純粋関数。
 *
 * 比較規則（design.md 4905-4911）:
 * - **scalar フィールド**（`name`/`submittedAt`/`netAmount`）: 文字列等価で比較。
 *   `null`/`undefined`/`''` の差異は正規化してから比較し、空入力同士は等価。
 *   `submittedAt` が `Date` の場合は ISO 文字列化、`netAmount` が number の場合は `String(...)` で文字列化。
 * - **`selectedFile`**（`File` オブジェクト）: 参照同一性（`===`）で判定。
 *   ユーザーがファイルをドロップ/選択して差し替えた場合のみ参照が変わる。
 * - **`lineItems`**（配列）: 配列長が異なる、または各行で
 *   `customCategory`/`workType`/`name`/`specification`/`unit`/`quantity`/`unitPrice`/`remarks`/`sortOrder`
 *   のいずれかが文字列等価で異なる場合に dirty。
 *   `amount`（自動計算結果）と `id`（クライアントサイド一時 ID）は判定対象から除外。
 *
 * Requirements: 38.12
 * Design: 4905-4911
 *
 * @param current - 現在の form state スナップショット
 * @param snapshot - 初期スナップショット（ダイアログ open 時に確定された値）
 * @returns 差分がある場合 `true`、ない場合 `false`
 */
export function isFormDirty(current: FormSnapshot, snapshot: FormSnapshot): boolean {
  if (normalizeScalar(current.name) !== normalizeScalar(snapshot.name)) return true;
  if (normalizeScalar(current.submittedAt) !== normalizeScalar(snapshot.submittedAt)) return true;
  if (normalizeScalar(current.netAmount) !== normalizeScalar(snapshot.netAmount)) return true;
  if (current.selectedFile !== snapshot.selectedFile) return true;
  if (!lineItemsAreEqual(current.lineItems, snapshot.lineItems)) return true;
  return false;
}

// ============================================================================
// 公開 API: useUnsavedChangesGuard カスタムフック
// ============================================================================

/**
 * 未保存変更ガード用カスタムフック。
 *
 * 動作概要:
 * 1. `isDirty=true` の間 `window.beforeunload` リスナを登録し、
 *    `e.preventDefault()` + `e.returnValue = ''` を設定してブラウザ標準の
 *    確認ダイアログを表示する（Req 38.13）。
 * 2. `confirmCloseIfDirty` コールバックを返却し、`isDirty=true` の場合に
 *    `window.confirm` で確認ダイアログを表示する（Req 38.12）。
 *
 * Requirements: 38.12, 38.13
 * Design: 4812-4835
 *
 * @param isDirty - 未保存変更があるかどうか
 * @returns `confirmCloseIfDirty` を含むオブジェクト
 */
export function useUnsavedChangesGuard(isDirty: boolean): UseUnsavedChangesGuardResult {
  // ページ離脱時のブラウザ標準確認ダイアログ（Req 38.13）
  useEffect(() => {
    if (!isDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      // 仕様上、文字列指定でブラウザ標準ダイアログを表示する。
      // 一部ブラウザでは `event.returnValue = ''` のみで動作するため空文字を設定する。
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isDirty]);

  // ダイアログクローズ要求時の確認（Req 38.12）
  const confirmCloseIfDirty = useCallback((): boolean => {
    if (!isDirty) return true;
    return window.confirm(UNSAVED_CHANGES_CONFIRM_MESSAGE);
  }, [isDirty]);

  return { confirmCloseIfDirty };
}
