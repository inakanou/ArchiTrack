/**
 * @fileoverview 計算用フィールドコンポーネント
 *
 * Task 6.2: 計算用フィールドコンポーネントを実装する
 *
 * Requirements:
 * - 8.5: 「面積・体積」モードで計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.6: 「面積・体積」モードで計算用列に1つ以上の値が入力される場合、入力された項目のみを掛け算して計算結果を数量として自動設定する
 * - 8.8: 「ピッチ」モードで計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.9: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）に値が入力される場合、ピッチ計算式に基づいて本数を算出する
 * - 8.11: 計算用列の値変更時に数量を自動再計算する
 * - 8.13: 「箇所数」モードで計算用列として「箇所数」「長さ」「重量」「調整係数」「丸め設定」をこの順序で表示する
 * - 37.13: 「箇所数」モードの計算用フィールドをメイン行の操作列の右側に水平配置する
 * - 47.2 / 47.12-47.14: 計算方法「箇所数」のフィールド群を表示し、ピッチ固有フィールドを非表示にする
 * - 9.1 / 10.1: 標準以外の計算方法で調整係数・丸め設定を計算用フィールドの末尾に表示する
 *
 * - 14.6 / 14.7: 「箇所数」フィールドは小数桁を付与せず整数表示し、空白時は空白のまま表示する
 * - 47.8 / 47.10 / 47.11: 「箇所数」は 1〜9999999 の整数のみ受け付け、小数・数値以外・範囲外は入力を拒否する
 *
 * Task 68.1: 計算用フィールド定義を計算方法ごとの Record（FIELDS_BY_METHOD）へ置換する。
 * 二値の三項演算子（`method === 'AREA_VOLUME' ? AREA_VOLUME_FIELDS : PITCH_FIELDS`）は、
 * 第4の計算方法（COUNT）を無言でピッチのフィールド群にフォールバックさせるため廃止した。
 *
 * Task 68.2: NumberInputField の表示整形（useState 初期値・props 同期・blur の計3経路）を
 * 整数分岐に対応させる。3経路すべてを `formatFieldValue` に集約したため、blur だけ整数化して
 * 保存・再読み込み（props 同期）で「5.00」に戻る不整合が構造的に起こらない。
 * 整数・範囲の判定は `utils/numeric-range-validation.ts` に委譲する（二重管理の防止）。
 *
 * Task 80.2: 範囲判定を描画される全ての数値欄へ結線する。
 * - 9.3: 調整係数の入力可能範囲（-9.99〜9.99）外はエラーを表示する
 * - 10.3: 丸め設定の入力可能範囲（0.01〜99.99）外はエラーを表示する（0と空白を除く）
 * - 10.4: 丸め設定の 0 と空白は既定値へ差し替える。本項は 10.3 に優先する
 * - 15.3: 寸法・ピッチ計算・箇所数計算の各欄の入力可能範囲（0.01〜9999999.99）外はエラーを表示する
 * 範囲も既定値差し替えの規則も `utils/numeric-range-validation.ts` の正典から得る。
 *
 * Task 80.3: 数値以外の入力の拒否を調整係数・丸め設定へ結線する。
 * - 9.5 / 10.5: 数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する
 *
 * **拒否は焦点喪失の時点だけで行う。** 打鍵ごとに値を検査して弾く形は採らなかった——
 * 日本語入力の変換中に値へ手を入れると変換が壊れ、その欠陥は Playwright の `fill()` でも
 * `fireEvent.change` でも変換を経由しないため構造的に検出できない。焦点喪失は変換確定より
 * 後に起きるため、この作法には変換中の面が一切無い。
 */

import { useCallback, useId, useState } from 'react';
import type { CalculationMethod, CalculationParams } from '../../types/quantity-edit.types';
import type { AreaVolumeParams, PitchParams, CountParams } from '../../utils/calculation-engine';
import {
  validateNumericRange,
  resolveFieldInput,
  type NumericRangeFieldType,
  type DefaultSubstitutedFieldType,
} from '../../utils/numeric-range-validation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * CalculationFieldsコンポーネントのProps
 */
export interface CalculationFieldsProps {
  /** 計算方法 */
  method: CalculationMethod;
  /** 計算パラメータ */
  params: CalculationParams;
  /** パラメータ変更時のコールバック */
  onChange: (params: CalculationParams) => void;
  /** 無効化状態 */
  disabled?: boolean;
  /** 調整係数（REQ-9: 面積・体積/ピッチ選択時のみ表示） */
  adjustmentFactor?: number;
  /** 調整係数変更時のコールバック */
  onAdjustmentFactorChange?: (value: number) => void;
  /** 丸め設定（REQ-10: 面積・体積/ピッチ選択時のみ表示） */
  roundingUnit?: number;
  /** 丸め設定変更時のコールバック */
  onRoundingUnitChange?: (value: number) => void;
}

/**
 * フィールド定義
 */
export interface FieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  step?: number;
  /**
   * 真の場合、整数のみを受け付け、小数桁を付与せずに表示する（REQ-47 AC8, REQ-14 AC6）
   *
   * Task 68.2: `NumberInputField` の表示整形（初期表示・props 同期・blur の3経路）で消費する。
   * 未指定（既存の面積・体積／ピッチのフィールド）は従来どおり小数2桁で表示する。
   */
  integer?: boolean;
  /**
   * 入力値の検証に用いる数値範囲設定のキー（REQ-47 AC10, AC11）
   *
   * 指定した場合のみ blur 時に `validateNumericRange` で検証し、拒否とエラー表示を行う。
   * Task 80.2 で寸法・ピッチ計算・箇所数計算の各欄へ `'dimension'` を宣言し、REQ-15.3 を結線した。
   * 整数判定・範囲判定は `utils/numeric-range-validation.ts` の単一定義に委譲し、
   * 本コンポーネント側では条件を再実装しない（二重管理の防止）。
   */
  rangeFieldType?: NumericRangeFieldType;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * 面積・体積モードのフィールド定義
 */
const AREA_VOLUME_FIELDS: FieldDefinition[] = [
  { key: 'width', label: '幅（W）', step: 0.01, rangeFieldType: 'dimension' },
  { key: 'depth', label: '奥行き（D）', step: 0.01, rangeFieldType: 'dimension' },
  { key: 'height', label: '高さ（H）', step: 0.01, rangeFieldType: 'dimension' },
  { key: 'weight', label: '重量', step: 0.01, rangeFieldType: 'dimension' },
];

/**
 * ピッチモードのフィールド定義
 */
const PITCH_FIELDS: FieldDefinition[] = [
  { key: 'rangeLength', label: '範囲長', required: true, step: 0.01, rangeFieldType: 'dimension' },
  { key: 'endLength1', label: '端長1', required: true, step: 0.01, rangeFieldType: 'dimension' },
  { key: 'endLength2', label: '端長2', required: true, step: 0.01, rangeFieldType: 'dimension' },
  {
    key: 'pitchLength',
    label: 'ピッチ長',
    required: true,
    step: 0.01,
    rangeFieldType: 'dimension',
  },
  { key: 'length', label: '長さ', step: 0.01, rangeFieldType: 'dimension' },
  { key: 'weight', label: '重量', step: 0.01, rangeFieldType: 'dimension' },
];

/**
 * 箇所数モードのフィールド定義（REQ-47 AC2, AC8）
 *
 * 表示順序: 箇所数 → 長さ → 重量（この後に調整係数 → 丸め設定が続く）
 */
const COUNT_FIELDS: FieldDefinition[] = [
  { key: 'count', label: '箇所数', required: true, integer: true, rangeFieldType: 'count' },
  { key: 'length', label: '長さ', step: 0.01, rangeFieldType: 'dimension' },
  { key: 'weight', label: '重量', step: 0.01, rangeFieldType: 'dimension' },
];

/**
 * 計算方法ごとのフィールド定義（REQ-47 AC13, AC14）
 *
 * 「標準」は計算用フィールドを持たないため Record から除外する。
 * `Record<Exclude<CalculationMethod, 'STANDARD'>, ...>` としているため、
 * `CalculationMethod` に計算方法を追加するとキーの定義漏れがコンパイルエラーになる。
 * 三項演算子と異なり、未定義の計算方法が他方式のフィールド群へ無言でフォールバックすることはない。
 *
 * `utils/calculation-method.ts` の `PARAM_KEYS_BY_METHOD` は本定義のキー集合と一致する
 * 必要がある（CalculationFields.test.tsx の整合性テストで担保する）。
 */
export const FIELDS_BY_METHOD: Record<Exclude<CalculationMethod, 'STANDARD'>, FieldDefinition[]> = {
  AREA_VOLUME: AREA_VOLUME_FIELDS,
  PITCH: PITCH_FIELDS,
  COUNT: COUNT_FIELDS,
};

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  /**
   * フィールド群コンテナ：ラベルとテキストボックスを交互に水平配置する。
   * Task 51.3 / REQ-37.2, 37.4, 37.5
   * - 縦ペア grid から水平 flex に変更
   * - ペア単位で `flex-direction: row`（label の右に input）に配置（51.3）
   * - 各ペアは flex-shrink: 0 で潰れず横並びに展開
   */
  fieldsGrid: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'nowrap' as const,
  } as React.CSSProperties,
  /**
   * 1 フィールド分の wrapper（label + input）の内部レイアウト：
   * label を input の左に水平配置する（51.3）
   */
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    whiteSpace: 'nowrap' as const,
    height: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,
  requiredMark: {
    color: '#dc2626',
    fontSize: '11px',
  } as React.CSSProperties,
  input: {
    width: '70px',
    height: '22px',
    padding: '0 4px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
    MozAppearance: 'textfield' as const,
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  inputWarning: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  } as React.CSSProperties,
  warningMessage: {
    color: '#b45309',
    fontSize: '10px',
    marginTop: '1px',
  } as React.CSSProperties,
  standardMessage: {
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '0px',
    fontSize: '12px',
    color: '#4b5563',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 表示値の整形（Task 68.2）
 *
 * NumberInputField は「useState 初期値」「props 同期」「blur 整形」の計3経路で表示値を作る。
 * 3経路すべてが本関数を通ることで、整数フィールド（箇所数）の書式が経路によってぶれない。
 * 例: blur だけ整数化すると、保存・再読み込み（= props 同期）で「5.00」に戻る（REQ-47 AC15 違反）。
 *
 * - REQ-14.6: 整数指定フィールド（箇所数）は小数桁を付与しない
 * - REQ-14.3: それ以外（寸法・ピッチ・長さ・重量）は従来どおり小数2桁
 * - REQ-14.4 / 14.7: 値が未設定の場合は空白
 */
function formatFieldValue(value: number | undefined, integer: boolean | undefined): string {
  if (value === undefined) {
    return '';
  }
  return integer === true ? String(value) : value.toFixed(2);
}

/**
 * 数値入力フィールド
 * REQ-14.3: 数値入力時は小数2桁で表示
 * REQ-14.4: 空白時は空白のまま表示
 * REQ-14.6/14.7: 整数指定フィールド（箇所数）は整数表示・空白時は空白（Task 68.2）
 * REQ-47.10/47.11: 整数指定フィールドは小数・数値以外・範囲外の入力を拒否しエラーを表示（Task 68.2）
 */
interface NumberInputFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled: boolean;
  required?: boolean;
  /** 整数として整形・入力するか（REQ-47 AC8, REQ-14 AC6） */
  integer?: boolean;
  /** 入力値検証に使う数値範囲設定のキー。指定時のみ blur で検証する（REQ-47 AC10, AC11） */
  rangeFieldType?: NumericRangeFieldType;
}

function NumberInputField({
  id,
  label,
  value,
  onChange,
  disabled,
  required,
  integer,
  rangeFieldType,
}: NumberInputFieldProps) {
  // REQ-14.3/14.4/14.6: ローカル状態で表示値を管理（整形経路 1/3: useState 初期値）
  const [localValue, setLocalValue] = useState<string>(() => formatFieldValue(value, integer));
  // 前回のprops値を追跡（公式ドキュメント推奨パターン）
  const [prevValue, setPrevValue] = useState(value);
  // 入力拒否時のエラーメッセージ（REQ-47 AC10, AC11 / REQ-15.3）
  const [error, setError] = useState<string | undefined>(undefined);

  // 親の値が変更された場合、レンダリング中にローカル状態を同期（整形経路 2/3: props 同期）
  // 保存・再読み込み後の復元はこの経路を通る（REQ-47 AC15）
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (value !== prevValue) {
    setPrevValue(value);
    setLocalValue(formatFieldValue(value, integer));
    setError(undefined);
  }

  // 入力中はそのままの値を保持
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  // フォーカス時に既存値を全選択（上書き入力の効率化。他の数量項目フィールドと挙動を統一）
  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  // blur時にフォーマットして親に通知（整形経路 3/3: blur 整形）
  const handleBlur = useCallback(() => {
    const trimmedValue = localValue.trim();
    if (trimmedValue === '') {
      // REQ-14.4/14.7: 空白時は空白のまま
      setError(undefined);
      onChange(undefined);
      return;
    }

    // 検証対象フィールド（箇所数）: 小数・数値以外・範囲外は入力を拒否しエラーを表示する
    // （REQ-47 AC10, AC11 / REQ-15 AC5）。整数・範囲の判定は numeric-range-validation に委譲する
    if (rangeFieldType !== undefined) {
      const numValue = Number(trimmedValue);
      if (!Number.isFinite(numValue)) {
        setError(`${label}は数値で入力してください`);
        return;
      }
      const result = validateNumericRange(numValue, rangeFieldType);
      if (!result.isValid) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setLocalValue(formatFieldValue(numValue, integer));
      onChange(numValue);
      return;
    }

    // 既存の小数フィールド（面積・体積／ピッチ／長さ／重量）: 従来どおりの挙動を維持する
    const numValue = parseFloat(trimmedValue);
    if (!isNaN(numValue)) {
      // REQ-14.3: 数値入力時は小数2桁で表示
      setLocalValue(formatFieldValue(numValue, integer));
      onChange(numValue);
    } else {
      // 無効な値の場合はクリア
      setLocalValue('');
      onChange(undefined);
    }
  }, [localValue, onChange, integer, rangeFieldType, label]);

  return (
    <div style={styles.fieldWrapper}>
      <label htmlFor={id} style={styles.label}>
        {label}
        {required && <span style={styles.requiredMark}>*</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode={integer === true ? 'numeric' : 'decimal'}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        className="hide-spinner"
        style={{
          ...styles.input,
          textAlign: 'right',
          ...(disabled ? styles.inputDisabled : {}),
          ...(error !== undefined ? styles.inputWarning : {}),
        }}
        aria-required={required}
        aria-invalid={error !== undefined}
      />
      {error !== undefined && (
        <span style={styles.warningMessage} role="alert">
          {error}
        </span>
      )}
      <style>
        {`
          .hide-spinner::-webkit-outer-spin-button,
          .hide-spinner::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}
      </style>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 調整係数・丸め設定用の数値入力フィールド
 * REQ-9, REQ-10: 面積・体積/ピッチ選択時のみ表示
 * REQ-14.2: 小数2桁で常時表示
 *
 * Task 80.2: 判定を「既定値差し替え → 範囲判定」の順で `numeric-range-validation` へ委譲する。
 * 改める前は `warningCondition={(v) => v <= 0}` を呼び出し側から渡しており、
 * **REQ-9.3 が有効域と定める `-9.99〜0` に対して警告が出ていた**（調整係数）。
 * また `0` を既定値へ差し替える処理が丸め設定（REQ-10.4）から調整係数へ相乗りしていた。
 * 規則を欄ごとに正典から引く形へ改め、双方を断った。
 */
interface AdjustmentFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  /**
   * 範囲と既定値差し替えの規則を引くキー（Task 80.2）
   *
   * 既定値も許容範囲も `utils/numeric-range-validation.ts` の正典から引く。
   * 呼び出し側が既定値や範囲を書き写さないため、調整係数と丸め設定で
   * 規則が食い違うことが構造的に起きない。
   */
  fieldType: Extract<DefaultSubstitutedFieldType, 'adjustmentFactor' | 'roundingUnit'>;
}

function AdjustmentField({
  id,
  label,
  value,
  onChange,
  disabled,
  fieldType,
}: AdjustmentFieldProps) {
  // REQ-14.2: ローカル状態で表示値を管理（小数2桁）
  const [localValue, setLocalValue] = useState<string>(value.toFixed(2));
  // 前回のprops値を追跡
  const [prevValue, setPrevValue] = useState(value);

  // REQ-9.5 / REQ-10.5: 数値以外の入力を拒否したことの提示（Task 80.3）。
  // **派生ではなく状態である。** 拒否は直前の確定値を欄へ書き戻すため、入力中の文字列から
  // 導く形にすると書き戻した瞬間に提示が消え、値が黙って戻ったようにしか見えない。
  const [nonNumericError, setNonNumericError] = useState<string | undefined>(undefined);

  // 親の値が変更された場合、レンダリング中にローカル状態を同期
  if (value !== prevValue) {
    setPrevValue(value);
    setLocalValue(value.toFixed(2));
    setNonNumericError(undefined);
  }

  // 範囲エラーの判定（REQ-9.3 / REQ-10.3）。
  // **既定値へ差し替えてから範囲判定へ渡す**（REQ-10.4 が REQ-10.3 に優先する。Task 80.1）。
  // 判定は入力中の値から導くため、blur を待たずに提示される（従来の警告と同じ提示の時機）。
  // 数値以外の入力は範囲の層ではなく REQ-9.5 / REQ-10.5 の層が受け持つ。
  const resolution = resolveFieldInput(localValue, fieldType);
  const rangeError = resolution.isNumeric
    ? validateNumericRange(resolution.value, fieldType).error
    : undefined;

  // Task 85.1: 「保存経路が受け付けない領域」の告知（`validateSavePersistability`）は撤去した。
  // バックエンドの範囲が REQ-9.3 の有効域へ揃い、調整係数の `0` と負値がそのまま保存できる
  // ようになったためである。欄が告げる理由は数値以外（REQ-9.5 / 10.5）と範囲外
  // （REQ-9.3 / 10.3）の二つだけになった。

  // 数値以外の拒否は範囲エラーより手前の層である
  const message = nonNumericError ?? rangeError;
  const showWarning = message !== undefined;

  // 入力中はそのままの値を保持。**値には一切手を入れない**（変換中の破壊を避ける）
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    // REQ-9.5 / REQ-10.5: 直し始めた時点で拒否の提示を下げる。提示を消すだけで値には触れない
    setNonNumericError(undefined);
  }, []);

  // フォーカス時に既存値を全選択（上書き入力の効率化。他の数量項目フィールドと挙動を統一）
  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  // blur時に小数2桁でフォーマットして親に通知
  const handleBlur = useCallback(() => {
    // REQ-9.4 / REQ-10.4: 既定値差し替えを先に適用する（範囲判定より前の層）
    const blurResolution = resolveFieldInput(localValue, fieldType);

    // REQ-9.5 / REQ-10.5: 数値以外の入力は拒否する。直前の確定値（親が持つ値）を欄へ戻し、
    // エラーを提示し、親へは何も渡さない。**既定値へ倒さない**——倒すと
    // 「拒否された」のか「既定値に戻された」のかを利用者も検証も区別できない
    if (!blurResolution.isNumeric) {
      setNonNumericError(blurResolution.error);
      setLocalValue(value.toFixed(2));
      return;
    }
    setNonNumericError(undefined);

    const numValue = blurResolution.value;
    // REQ-14.2: 小数2桁でフォーマット
    setLocalValue(numValue.toFixed(2));

    // REQ-9.3 / REQ-10.3: 範囲外の値は確定させず、範囲内の値の入力を求める
    if (!validateNumericRange(numValue, fieldType).isValid) {
      return;
    }
    onChange(numValue);
  }, [localValue, onChange, fieldType, value]);

  return (
    <div style={styles.fieldWrapper}>
      <label htmlFor={id} style={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        className="hide-spinner"
        style={{
          ...styles.input,
          textAlign: 'right',
          ...(disabled ? styles.inputDisabled : {}),
          ...(showWarning ? styles.inputWarning : {}),
        }}
        aria-invalid={showWarning}
      />
      {message !== undefined && (
        <span style={styles.warningMessage} role="alert">
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * 計算用フィールドコンポーネント
 *
 * 計算方法に応じた入力フィールドを表示する。
 * - 標準モード: メッセージのみ表示
 * - 面積・体積モード: 幅、奥行き、高さ、重量、調整係数、丸め設定
 * - ピッチモード: 範囲長、端長1、端長2、ピッチ長、長さ、重量、調整係数、丸め設定
 * - 箇所数モード: 箇所数、長さ、重量、調整係数、丸め設定（REQ-47 AC2）
 */
export default function CalculationFields({
  method,
  params,
  onChange,
  disabled = false,
  adjustmentFactor = 1.0,
  onAdjustmentFactorChange,
  roundingUnit = 0.01,
  onRoundingUnitChange,
}: CalculationFieldsProps) {
  const idPrefix = useId();

  /**
   * フィールド値変更ハンドラ
   */
  const handleFieldChange = useCallback(
    (fieldKey: string, value: number | undefined) => {
      const newParams = { ...params, [fieldKey]: value };
      onChange(newParams);
    },
    [params, onChange]
  );

  /**
   * 調整係数変更ハンドラ
   */
  const handleAdjustmentFactorChange = useCallback(
    (value: number) => {
      onAdjustmentFactorChange?.(value);
    },
    [onAdjustmentFactorChange]
  );

  /**
   * 丸め設定変更ハンドラ
   */
  const handleRoundingUnitChange = useCallback(
    (value: number) => {
      onRoundingUnitChange?.(value);
    },
    [onRoundingUnitChange]
  );

  // 標準モードの場合
  if (method === 'STANDARD') {
    return (
      <div style={styles.container}>
        <div style={styles.standardMessage}>直接数量を入力してください</div>
      </div>
    );
  }

  // 計算方法に応じたフィールド定義を取得（REQ-47 AC13, AC14: フォールバックしない）
  const fields = FIELDS_BY_METHOD[method];

  // パラメータを取得（型アサーション）
  const currentParams = (params ?? {}) as AreaVolumeParams | PitchParams | CountParams;

  return (
    <div style={styles.container}>
      <div style={styles.fieldsGrid}>
        {/* 計算パラメータフィールド */}
        {fields.map((field) => (
          <NumberInputField
            key={field.key}
            id={`${idPrefix}-${field.key}`}
            label={field.label}
            value={(currentParams as Record<string, number | undefined>)[field.key]}
            onChange={(value) => handleFieldChange(field.key, value)}
            disabled={disabled}
            required={field.required}
            integer={field.integer}
            rangeFieldType={field.rangeFieldType}
          />
        ))}
        {/* REQ-9: 調整係数（面積・体積/ピッチ選択時のみ表示） */}
        <AdjustmentField
          id={`${idPrefix}-adjustmentFactor`}
          label="調整係数"
          value={adjustmentFactor}
          onChange={handleAdjustmentFactorChange}
          disabled={disabled}
          fieldType="adjustmentFactor"
        />
        {/* REQ-10: 丸め設定（面積・体積/ピッチ選択時のみ表示） */}
        <AdjustmentField
          id={`${idPrefix}-roundingUnit`}
          label="丸め設定"
          value={roundingUnit}
          onChange={handleRoundingUnitChange}
          disabled={disabled}
          fieldType="roundingUnit"
        />
      </div>
      {/* 数値入力フィールドのスピナーを非表示にするスタイル */}
      <style>
        {`
          .hide-spinner::-webkit-outer-spin-button,
          .hide-spinner::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}
      </style>
    </div>
  );
}
