/**
 * @fileoverview 計算パラメータ検証ユーティリティ（保存前チェックの単一情報源）
 *
 * 計算方法ごとの必須パラメータ検証を1箇所に集約する。数量表編集画面の保存処理
 * （QuantityTableEditPage.handleSave）と useQuantityTableSave の整合性チェックは、
 * いずれも本モジュールを参照する（検証ロジックを二重に持たない）。
 *
 * バックエンドとの整合（重要）:
 * バックエンドは保存時（PUT /:id/save）に zod スキーマ（quantity-table.schema.ts の
 * PARAMS_SCHEMA_BY_METHOD）と QuantityValidationService（validateAreaVolumeMode /
 * validatePitchMode / validateCountMode）で同じ必須条件を検証し 400 を返す。
 * 本モジュールはその**部分集合**（必須・整数・範囲）だけを検証し、バックエンドより
 * 厳しくしない（フロントだけが弾く状態を作らない）。メッセージ文言もバックエンドと一致させる。
 *
 * 整数判定・範囲判定は `numeric-range-validation`（しきい値は calculation-engine が単一情報源）へ
 * 委譲し、本モジュールに再実装しない。計算方法のラベルは `calculation-method` を参照する。
 *
 * Task 68.6: 保存前の整合性チェックに箇所数を追加する（useQuantityTableSave から移設）
 * Task 68.7: 保存前の計算パラメータ検証を編集画面の保存処理へ配線する
 *
 * Requirements:
 * - 8.7: 「面積・体積」モードで計算用列に値が1つも入力されていない状態で保存を試行する場合、エラーを表示する
 * - 8.10: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）のいずれかが未入力で保存を試行する場合、エラーを表示する
 * - 8.15 / 47.9: 「箇所数」モードで箇所数が未入力で保存を試行する場合、エラーを表示し箇所数の入力を求める
 * - 47.10: 「箇所数」に小数を含む値が入力される場合、エラーを表示する
 * - 47.11: 「箇所数」に入力可能範囲外の値が入力される場合、エラーを表示する
 * - 11.2: 整合性チェックでエラーが検出される場合、保存を中断し問題箇所の修正を求める
 *
 * @module utils/calculation-params-validation
 */

import type { CalculationMethod, CalculationParams } from '../types/quantity-edit.types';
import { CALCULATION_METHOD_LABELS } from './calculation-method';
import { validateNumericRange } from './numeric-range-validation';

/**
 * 整合性問題の重大度
 *
 * - `warning`: 必須項目の欠落（値が入っていない）
 * - `error`: 値はあるが不正（小数・範囲外・未知の計算方法）
 */
export type CalculationParamsIssueSeverity = 'warning' | 'error';

/**
 * 計算パラメータの整合性問題（数量項目のパスを付与する前の本体）
 */
export interface CalculationParamsIssue {
  /** 数量項目のパス（basePath）からの相対パス */
  pathSuffix: string;
  /** 問題メッセージ（バックエンドの文言と一致させる） */
  message: string;
  /** 重大度 */
  severity: CalculationParamsIssueSeverity;
}

/**
 * 計算方法ごとの計算パラメータ整合性チェック
 */
type CalculationParamsIntegrityCheck = (params: CalculationParams) => CalculationParamsIssue[];

/**
 * 計算パラメータを保持する最小形状（数量項目の検証入力）
 *
 * 編集画面のドラフト項目（DraftItem）と編集用数量項目（QuantityItemEdit）の
 * 双方を受け取れるよう、必要なフィールドのみを構造的に要求する。
 */
export interface CalculationParamsCarrier {
  calculationMethod: CalculationMethod;
  calculationParams: CalculationParams | null;
}

/**
 * 箇所数が未入力である場合のメッセージ
 *
 * バックエンド（`quantity-table.schema.ts` の `COUNT_REQUIRED` /
 * `quantity-validation.service.ts` の箇所数モード検証）と同一文言にそろえる。
 * 整数・範囲の各メッセージは `validateNumericRange` が返すものをそのまま用いるため、
 * 3種すべてがバックエンドの検証結果と一致する。
 */
const COUNT_REQUIRED_MESSAGE = '箇所数は必須です';

/**
 * 面積・体積モードで計算用列が1つも入力されていない場合のメッセージ
 *
 * バックエンド `QuantityValidationService.validateAreaVolumeMode` と同一文言。
 */
const AREA_VOLUME_NO_VALUE_MESSAGE =
  '面積・体積モードでは少なくとも1つの計算用列に値を入力してください';

/**
 * 面積・体積モードで「いずれか1つ」の入力が求められるキー
 *
 * バックエンドの `validateAreaVolumeMode` が参照するキーと一致させる。
 */
const AREA_VOLUME_ANY_KEYS = ['width', 'depth', 'height', 'weight'] as const;

/**
 * ピッチモードの必須キーとメッセージ
 *
 * バックエンド `QuantityValidationService.validatePitchMode` /
 * `quantity-table.schema.ts` の `pitchParamsSchema` の必須項目と一致させる。
 * 正負のチェックはバックエンドに委ね、ここでは必須（未入力）のみを検証する
 * （バックエンドより厳しくしないため）。
 */
const PITCH_REQUIRED_KEYS: readonly { key: string; message: string }[] = [
  { key: 'rangeLength', message: '範囲長は必須です' },
  { key: 'endLength1', message: '端長1は必須です' },
  { key: 'endLength2', message: '端長2は必須です' },
  { key: 'pitchLength', message: 'ピッチ長は必須です' },
] as const;

/**
 * 計算パラメータから数値を安全に読み出す
 *
 * 計算方法の切替直後などに想定外の形状が残っていても壊れないよう、
 * キーの有無と数値性（NaN / Infinity を除く）を確認する。
 *
 * @param params 計算パラメータ
 * @param key 読み出すキー
 * @returns 有限な数値。未入力・数値以外の場合は undefined
 */
function readNumericParam(params: CalculationParams, key: string): number | undefined {
  if (!params || !(key in params)) return undefined;

  const value: unknown = (params as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 計算パラメータそのものが未設定であることの警告を返す
 *
 * 「標準」以外の計算方法で共通の文言。ラベルは計算方法レジストリを単一情報源とする。
 */
function requireCalculationParams(
  params: CalculationParams,
  method: CalculationMethod
): CalculationParamsIssue[] {
  if (params) return [];

  return [
    {
      pathSuffix: 'calculationParams',
      message: `${CALCULATION_METHOD_LABELS[method]}計算方法が選択されていますが、計算パラメータが設定されていません`,
      severity: 'warning',
    },
  ];
}

/**
 * 「面積・体積」の計算パラメータ整合性チェック（REQ-8 AC7）
 *
 * 個々のキーは任意だが、幅・奥行き・高さ・重量のいずれか1つ以上の入力が必要。
 */
function checkAreaVolumeParams(params: CalculationParams): CalculationParamsIssue[] {
  const missingParams = requireCalculationParams(params, 'AREA_VOLUME');
  if (missingParams.length > 0) return missingParams;

  const hasAnyValue = AREA_VOLUME_ANY_KEYS.some(
    (key) => readNumericParam(params, key) !== undefined
  );
  if (hasAnyValue) return [];

  return [
    {
      pathSuffix: 'calculationParams',
      message: AREA_VOLUME_NO_VALUE_MESSAGE,
      severity: 'warning',
    },
  ];
}

/**
 * 「ピッチ」の計算パラメータ整合性チェック（REQ-8 AC10）
 *
 * 範囲長・端長1・端長2・ピッチ長は必須。長さ・重量は任意。
 */
function checkPitchParams(params: CalculationParams): CalculationParamsIssue[] {
  const missingParams = requireCalculationParams(params, 'PITCH');
  if (missingParams.length > 0) return missingParams;

  return PITCH_REQUIRED_KEYS.filter(
    ({ key }) => readNumericParam(params, key) === undefined
  ).map(({ key, message }) => ({
    pathSuffix: `calculationParams.${key}`,
    message,
    severity: 'warning' as const,
  }));
}

/**
 * 「箇所数」の計算パラメータ整合性チェック（REQ-47 AC9/AC10/AC11）
 *
 * 箇所数は必須項目のため、計算パラメータの有無だけでなく `count` の値まで検証する。
 * 必須・整数・範囲の判定は `validateNumericRange(count, 'count')` へ委譲し、
 * しきい値（1〜9999999）や整数判定をこのモジュールに再実装しない。
 */
function checkCountParams(params: CalculationParams): CalculationParamsIssue[] {
  const missingParams = requireCalculationParams(params, 'COUNT');
  if (missingParams.length > 0) return missingParams;

  const count = readNumericParam(params, 'count');

  // 未入力（キー欠落・数値でない）: 保存前にユーザーへ知らせるための警告
  if (count === undefined) {
    return [
      {
        pathSuffix: 'calculationParams.count',
        message: COUNT_REQUIRED_MESSAGE,
        severity: 'warning',
      },
    ];
  }

  // 値は入っているが不正（小数・範囲外）: データとして明確に不正なため error
  const rangeResult = validateNumericRange(count, 'count');
  if (!rangeResult.isValid) {
    return [
      {
        pathSuffix: 'calculationParams.count',
        message: rangeResult.error ?? '箇所数の値が不正です',
        severity: 'error',
      },
    ];
  }

  return [];
}

/**
 * 計算方法ごとの計算パラメータ整合性チェック対応表
 *
 * `Record<CalculationMethod, ...>` で定義しているため、`CalculationMethod` に
 * 計算方法を追加するとキーの定義漏れがコンパイルエラーになる。
 * if 連鎖・switch・三項演算子は網羅性チェックを持たず、新しい計算方法が
 * 無言でチェック対象外へ落ちるため使用しない（Task 64.3 の申し送り）。
 */
export const CALCULATION_PARAMS_INTEGRITY_CHECKS: Record<
  CalculationMethod,
  CalculationParamsIntegrityCheck
> = {
  // 「標準」は計算パラメータを持たない
  STANDARD: () => [],
  AREA_VOLUME: checkAreaVolumeParams,
  PITCH: checkPitchParams,
  COUNT: checkCountParams,
};

/**
 * 未知の計算方法（型に存在しない値がデータとして届いた場合）の fail-fast
 *
 * バックエンドの `validateQuantityItem` が未知の計算方法を検証エラーにするのと同じ流儀。
 * 無言で検証をすり抜けさせない。
 */
export const UNKNOWN_CALCULATION_METHOD_ISSUE: CalculationParamsIssue = {
  pathSuffix: 'calculationMethod',
  message: '未知の計算方法が設定されています',
  severity: 'error',
};

/**
 * 数量項目の計算パラメータを検証する（保存前チェックの入口）
 *
 * 計算方法（判別子）に対応するチェックを対応表から引いて実行する。
 * 計算パラメータの形状から計算方法を推測しない（バックエンド REQ-48 AC5 と同じ流儀）。
 *
 * @param item 検証対象の数量項目（計算方法と計算パラメータのみ参照する）
 * @returns 検出された整合性問題（問題がなければ空配列）
 */
export function validateCalculationParams(item: CalculationParamsCarrier): CalculationParamsIssue[] {
  const check = CALCULATION_PARAMS_INTEGRITY_CHECKS[item.calculationMethod];
  if (!check) return [UNKNOWN_CALCULATION_METHOD_ISSUE];

  return check(item.calculationParams ?? null);
}
