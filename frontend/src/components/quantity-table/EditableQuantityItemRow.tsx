/**
 * @fileoverview 編集可能な数量項目行コンポーネント
 *
 * Task 7.2: 各フィールドにオートコンプリートを適用する
 *
 * Requirements:
 * - 7.1: 大項目フィールドで入力するとオートコンプリート候補を表示
 * - 7.2: 中項目フィールドで大項目に紐づく候補を表示
 * - 7.3: 小項目フィールドで大項目・中項目に紐づく候補を表示
 * - 7.4: 候補選択時の自動入力
 *
 * Task 80.2: 数量欄へ範囲判定を結線する。
 * - 15.1: 数量の入力可能範囲（-999999.99〜9999999.99）外はエラーを表示し、範囲内の値の入力を求める
 * - 15.2: 空白は既定値「0」へ差し替え「0.00」と表示する（範囲判定より前の層）
 * - 8.3: 負の値は有効域の内側であり、範囲エラーではなく警告として提示する（従来どおり）
 * 範囲も既定値差し替えの規則も `utils/numeric-range-validation.ts` の正典から得る。
 *
 * Task 80.3: 数値以外の入力の拒否を数量欄へ結線する。
 * - 8.4: 数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する
 *
 * **拒否は焦点喪失の時点だけで行う。** 打鍵ごとに値を検査して弾く形は採らなかった——
 * 日本語入力の変換中（compositionstart 〜 compositionend）に値へ手を入れると変換が壊れ、
 * しかも Playwright の `fill()` も `fireEvent.change` も変換を経由しないため、
 * その欠陥は E2E でも単体でも構造的に検出できない（本スペックの
 * `## Implementation Notes（越境して実行された是正）` が単位欄で踏んだ事故である）。
 * 焦点喪失は変換確定より後に起きるため、この作法には変換中の面が一切無い。
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { QuantityItemDetail, CalculationMethod } from '../../types/quantity-table.types';
import type { CalculationParams } from '../../types/quantity-edit.types';
import AutocompleteInput from './AutocompleteInput';
import type { AutocompleteFieldName } from '../../hooks/useAutocompleteCandidateStore';
import CalculationMethodSelect from './CalculationMethodSelect';
import CalculationFields from './CalculationFields';
import QuantityItemActionMenu from './QuantityItemActionMenu';
import FieldValidationTooltip from './FieldValidationTooltip';
import { calculate } from '../../utils/calculation-engine';
import { validateNumericRange, resolveFieldInput } from '../../utils/numeric-range-validation';
import { resetParamsForMethod } from '../../utils/calculation-method';
import { QUANTITY_ITEM_GRID_COLUMNS } from './gridConstants';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EditableQuantityItemRowコンポーネントのProps
 */
export interface EditableQuantityItemRowProps {
  /** 項目データ */
  item: QuantityItemDetail;
  /** 項目更新コールバック */
  onUpdate?: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
  /** 項目削除コールバック */
  onDelete?: (itemId: string) => void;
  /** 項目コピーコールバック */
  onCopy?: (itemId: string) => void;
  /** 項目を上に移動するコールバック（REQ-6.3） */
  onMoveUp?: (itemId: string) => void;
  /** 項目を下に移動するコールバック（REQ-6.3） */
  onMoveDown?: (itemId: string) => void;
  /** 上に移動可能かどうか */
  canMoveUp?: boolean;
  /** 下に移動可能かどうか */
  canMoveDown?: boolean;
  /** 一括操作の対象として選択されているか（REQ-6.5） */
  isSelected?: boolean;
  /** 一括操作の選択状態変更コールバック（REQ-6.5） */
  onSelectionChange?: (itemId: string, selected: boolean) => void;
  /**
   * 別の数量グループへ移動するコールバック（REQ-6.2, 6.4）。
   * 未指定のときアクションメニューに移動の導線を表示しない。
   */
  onMoveToGroup?: (itemId: string) => void;
  /** バリデーション表示フラグ */
  showValidation?: boolean;
  /** オートコンプリート候補取得関数（Task 18.1: 必須） */
  getSuggestions: (field: AutocompleteFieldName, inputText: string) => string[];
  /** オートコンプリートblur時候補追加関数（Task 18.1: 必須） */
  onBlurAddCandidate: (field: AutocompleteFieldName, value: string) => void;
  /**
   * メインフィールドのラベル表示フラグ（Task 23.2: REQ-18.2, 18.3, 18.4）
   * false の場合、大項目〜備考のフィールドラベルを非表示にする。
   * 計算用フィールド（面積・体積/ピッチ）のタイトル行は影響を受けない。
   * @default true（後方互換性のため）
   */
  showFieldLabels?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  wrapper: {
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  row: {
    display: 'grid',
    // 要件順: 大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考・アクション
    // ※調整係数・丸め設定は面積・体積/ピッチ選択時のみ計算用フィールドエリアに表示
    // フィールド幅: 大項目5.5全角(76px)・中項目5.5全角(76px)・小項目5.5全角(76px)・任意分類5.5全角(76px)・工種6.5全角(88px)・
    // 名称15.5全角(202px)・規格15.5全角(202px)・計算方法(90px)・数量10半角(80px)・単位3全角(46px)・備考5.5全角(76px)・アクション(80px)
    gridTemplateColumns: QUANTITY_ITEM_GRID_COLUMNS,
    gap: '2px',
    // Task 51.1 Spike: 既存と同じ 'start' を維持（既存セルのラベル＋入力の縦配置を壊さないため）。
    // 操作列セル内の inline 配置は actionCellInlineWrapper の flex-direction: row + align-items: center で行う
    alignItems: 'start',
    padding: '2px 4px',
  } as React.CSSProperties,
  // Task 51.1 Spike / Task 51.2: 採用案（操作列セル wrapper 拡張）
  // 操作列セル内に flex wrapper を新設し、アクションメニュー + CalculationFields を横並び配置する。
  // Task 51.2: whiteSpace: nowrap で計算用フィールド群が行内幅不足で折り返さないようにし、
  // 行高さ 37px を維持する（REQ-37.1 同一行水平配置 / REQ-37.3 行高さ不変）。
  // overflow は指定しない（visible 既定を維持）。表領域 overflow はページ全体スクロールに委ねる
  // （REQ-37.6 / design.md「計算用フィールドの行内水平配置（REQ-37）」の
  // 「表領域は `overflow-x: visible` を維持し、ページ全体（REQ-25）の水平スクロールで閲覧する」）。
  actionCellInlineWrapper: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
    // Grid の操作列セル幅(80px)を超えて右側に展開できるように flex-shrink を抑止
    flexShrink: 0,
    // 計算用フィールド群が折り返さないこと（REQ-37.1 同一行配置）を構造で保証
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  // Task 51.1 Spike / Task 51.2: 操作列セル内に inline 配置した CalculationFields は折り返さない
  inlineCalculationFields: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    // フィールド間（label + input ペアの並び）でも折り返さない
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  fieldGroup: {
    // グリッドセルとしてのラッパー（内部レイアウトは各コンポーネントが担当）
  } as React.CSSProperties,
  directInputContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    width: '100%',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    height: '22px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    height: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: '22px',
    padding: '2px 4px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    fontSize: '12px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
    // 入力欄右端のエラーアイコンと入力文字が重ならないよう余白を確保
    paddingRight: '22px',
  } as React.CSSProperties,
  inputWarning: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    // 入力欄右端の警告アイコンと入力文字が重ならないよう余白を確保
    paddingRight: '22px',
  } as React.CSSProperties,
  quantityInput: {
    textAlign: 'right' as const,
  } as React.CSSProperties,
  numberInput: {
    // スピナー（上下ボタン）を非表示にする
    MozAppearance: 'textfield' as const,
    WebkitAppearance: 'textfield',
  } as React.CSSProperties,
  actionsCell: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'flex-start',
    alignItems: 'center',
    height: '22px',
  } as React.CSSProperties,
  actionsCellWithLabel: {
    marginTop: '15px',
  } as React.CSSProperties,
  // 一括操作の対象選択チェックボックス（REQ-6.5）。
  // 行高さ 37px（REQ-37.3）を維持するため 14px に抑え、縮小も抑止する。
  selectionCheckbox: {
    width: '14px',
    height: '14px',
    margin: 0,
    flexShrink: 0,
    cursor: 'pointer',
    accentColor: '#2563eb',
  } as React.CSSProperties,
};

// ============================================================================
// バリデーションロジック
// ============================================================================

/**
 * 必須フィールドのバリデーションエラーを生成
 */
function getValidationErrors(item: QuantityItemDetail): Record<string, string | undefined> {
  // 大項目は任意のためバリデーション不要
  return {
    workType: item.workType ? undefined : '工種は必須です',
    name: item.name ? undefined : '名称は必須です',
    unit: item.unit ? undefined : '単位は必須です',
  };
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 編集可能な数量項目行
 *
 * 各フィールドをオートコンプリート対応の入力フィールドとして表示し、
 * 編集・削除・コピー機能を提供する。
 *
 * @param props - コンポーネントProps
 */
export default function EditableQuantityItemRow({
  item,
  onUpdate,
  onDelete,
  onCopy,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  isSelected = false,
  onSelectionChange,
  onMoveToGroup,
  showValidation = true,
  getSuggestions,
  onBlurAddCandidate,
  showFieldLabels = true,
}: EditableQuantityItemRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // REQ-8.3: 数量フィールドのローカル状態（入力時に即座に警告を表示するため）
  // REQ-14.2: 小数2桁で常時表示（文字列として保持）
  const [localQuantity, setLocalQuantity] = useState(item.quantity.toFixed(2));

  // 親の数量値が変更された場合、ローカル状態を同期（REQ-14.2: 小数2桁で表示）
  useEffect(() => {
    setLocalQuantity(item.quantity.toFixed(2));
  }, [item.quantity]);

  // REQ-8.3: 負の値警告状態（ローカル状態から派生計算 - 入力時に即座に警告）
  // 負の値は REQ-15.1 の有効域の内側であり、範囲外エラーではなく確認を求める警告である
  const negativeQuantityWarning = useMemo(
    () => parseFloat(localQuantity) < 0 && item.calculationMethod === 'STANDARD',
    [localQuantity, item.calculationMethod]
  );

  // REQ-15.1: 数量の範囲エラー（ローカル状態から派生計算 - 入力時に即座に提示）。
  // REQ-15.2 の既定値差し替えを先に適用してから範囲判定へ渡す（Task 80.1 が確定させた層の順序）。
  // 数値以外の入力は範囲の層ではなく REQ-8.4 の層が受け持つ（焦点喪失の時点で提示する）。
  const quantityRangeError = useMemo((): string | undefined => {
    const resolution = resolveFieldInput(localQuantity, 'quantity');
    if (!resolution.isNumeric) {
      return undefined;
    }
    const result = validateNumericRange(resolution.value, 'quantity');
    return result.isValid ? undefined : result.error;
  }, [localQuantity]);

  // REQ-8.4: 数値以外の入力を拒否したことの提示（Task 80.3）。
  // **派生ではなく状態である。** 拒否は直前の確定値を欄へ書き戻すため、
  // 入力中の文字列から導く形にすると書き戻した瞬間に提示が消え、
  // 利用者は「値が勝手に戻った」だけを見ることになる。
  const [quantityNonNumericError, setQuantityNonNumericError] = useState<string | undefined>(
    undefined
  );

  // 欄に提示する文言。数値以外の拒否は範囲エラーより手前の層である
  const quantityError = quantityNonNumericError ?? quantityRangeError;

  // バリデーションエラー
  const errors = useMemo((): Record<string, string | undefined> => {
    if (!showValidation) return {};
    const baseErrors = getValidationErrors(item);
    return {
      ...baseErrors,
      name: !item.name?.trim() ? '名称は必須です' : undefined,
    };
  }, [item, showValidation]);

  /**
   * フィールド更新ハンドラを生成
   */
  const createUpdateHandler = useCallback(
    (field: keyof QuantityItemDetail) => (value: string) => {
      onUpdate?.(item.id, { [field]: value });
    },
    [item.id, onUpdate]
  );

  /**
   * 数量フィールド更新ハンドラ（入力中）
   * REQ-8.3: 負の値が入力された場合は警告を表示（ローカル状態で即座に警告）
   */
  const handleQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // 入力中はそのままの値を保持（フォーマットしない）。
    // **値には一切手を入れない。** 変換中（IME）に値を書き換えると変換が壊れる
    setLocalQuantity(e.target.value);
    // REQ-8.4: 利用者が直し始めた時点で拒否の提示を下げる。提示を消すだけで値には触れない
    setQuantityNonNumericError(undefined);
  }, []);

  /**
   * 数量フィールドblurハンドラ
   * REQ-14.2: blur時に小数2桁でフォーマット
   * REQ-15.2: 空入力時は0を設定
   */
  const handleQuantityBlur = useCallback(() => {
    // REQ-15.2: 空白の場合は0を設定（範囲判定より前の層）
    const resolution = resolveFieldInput(localQuantity, 'quantity');

    // REQ-8.4: 数値以外の入力は拒否する。直前の確定値（親が持つ値）を欄へ戻し、
    // エラーを提示し、親へは何も渡さない。**既定値へ倒さない**——倒すと
    // 「拒否された」のか「既定値に戻された」のかを利用者も検証も区別できない
    if (!resolution.isNumeric) {
      setQuantityNonNumericError(resolution.error);
      setLocalQuantity(item.quantity.toFixed(2));
      return;
    }
    setQuantityNonNumericError(undefined);

    const value = resolution.value;
    // REQ-14.2: 小数2桁でフォーマット
    const formattedValue = value.toFixed(2);
    setLocalQuantity(formattedValue);
    // REQ-15.1: 範囲外の値は確定させず、範囲内の値の入力を求める
    if (!validateNumericRange(value, 'quantity').isValid) {
      return;
    }
    // APIを呼び出し
    onUpdate?.(item.id, { quantity: value });
  }, [localQuantity, item.id, item.quantity, onUpdate]);

  /**
   * 数量フィールドフォーカスハンドラ
   * フォーカス時に既存の入力値を全選択し、上書き入力しやすくする
   */
  const handleQuantityFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  /**
   * 計算方法変更ハンドラ
   * REQ-8.1: 計算方法を変更時、既存のパラメータで再計算を実行
   *
   * Task 68.4 / REQ-48: 切替前の計算方法に固有のパラメータは残留させない。
   * レジストリの resetParamsForMethod() で切替後の計算方法が使うキーのみを残し、
   * 共通フィールド（長さ・重量）の入力値は引き継ぐ（REQ-48.1 / REQ-48.2）。
   * 再計算もリセット後のパラメータで行うため、切替後の必須パラメータが未入力の場合は
   * calculate() が例外を送出し、旧パラメータを流用した数量は算出されない（REQ-48.7）。
   * その場合の数量は直前の値のまま据え置かれ、必須パラメータの入力を待つ。
   */
  const handleCalculationMethodChange = useCallback(
    (method: CalculationMethod) => {
      // 切替後の計算方法で使用するキーのみを残す（「標準」は null）
      const params = resetParamsForMethod(item.calculationParams, method);

      const updates: Partial<QuantityItemDetail> = {
        calculationMethod: method,
        calculationParams: params,
      };

      // 標準以外（面積・体積／ピッチ／箇所数）でパラメータが残っている場合は再計算
      if (method !== 'STANDARD' && params) {
        try {
          const result = calculate({
            method,
            params,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: item.roundingUnit,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
          // 例: 切替直後で新方式の必須パラメータ（ピッチ長・箇所数）が未入力（REQ-48.7）
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationParams, item.adjustmentFactor, item.roundingUnit, onUpdate]
  );

  /**
   * 計算パラメータ変更ハンドラ
   * REQ-8.6: 面積・体積モードで計算用列に値が入力されると数量を自動計算
   * REQ-8.9: ピッチモードで必須項目が入力されると本数を自動計算
   * REQ-8.14 / REQ-47.12: 箇所数モードで箇所数・長さ・重量の変更時に数量を自動再計算
   *
   * Task 68.3: 分岐条件は「標準以外」であり計算方法を列挙しないため、箇所数（COUNT）も
   * 追加の分岐なしに本経路を通る。計算方法ごとの差分は calculate() の単一の switch に閉じている。
   */
  const handleCalculationParamsChange = useCallback(
    (params: CalculationParams) => {
      // 計算パラメータを更新
      const updates: Partial<QuantityItemDetail> = { calculationParams: params };

      // 標準以外（面積・体積／ピッチ／箇所数）の場合、計算を実行して数量を自動更新
      if (item.calculationMethod !== 'STANDARD') {
        try {
          const result = calculate({
            method: item.calculationMethod,
            params,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: item.roundingUnit,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
          // 例: ピッチ長が0 / 箇所数が未入力・整数以外・範囲外（calculateCount が送出）
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.adjustmentFactor, item.roundingUnit, onUpdate]
  );

  /**
   * 調整係数更新ハンドラ（CalculationFieldsから呼ばれる）
   * REQ-9.2: 調整係数が変更されると計算結果に乗算した値を数量として設定
   * REQ-47.12: 箇所数モードでも同一（ピッチと同じ後段処理）
   */
  const handleAdjustmentFactorUpdate = useCallback(
    (value: number) => {
      const updates: Partial<QuantityItemDetail> = { adjustmentFactor: value };

      // 面積・体積またはピッチモードの場合、再計算を実行
      if (item.calculationMethod !== 'STANDARD' && item.calculationParams) {
        try {
          const result = calculate({
            method: item.calculationMethod,
            params: item.calculationParams,
            adjustmentFactor: value,
            roundingUnit: item.roundingUnit,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.calculationParams, item.roundingUnit, onUpdate]
  );

  /**
   * 丸め設定更新ハンドラ（CalculationFieldsから呼ばれる）
   * REQ-10.2: 丸め設定が変更されると調整係数適用後の値を切り上げた値を最終数量として設定
   * REQ-47.12: 箇所数モードでも同一（ピッチと同じ後段処理）
   */
  const handleRoundingUnitUpdate = useCallback(
    (value: number) => {
      const updates: Partial<QuantityItemDetail> = { roundingUnit: value };

      // 面積・体積またはピッチモードの場合、正の値でのみ再計算を実行
      if (value > 0 && item.calculationMethod !== 'STANDARD' && item.calculationParams) {
        try {
          const result = calculate({
            method: item.calculationMethod,
            params: item.calculationParams,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: value,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.calculationParams, item.adjustmentFactor, onUpdate]
  );

  /**
   * メニュー開閉を切り替え
   */
  const handleToggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  /**
   * メニューを閉じる
   */
  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  /**
   * 一括操作の選択切り替え（REQ-6.5）
   */
  const handleSelectionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSelectionChange?.(item.id, e.target.checked);
    },
    [item.id, onSelectionChange]
  );

  return (
    // Task 69.2: アクションメニューの閉じ処理をここに二重で張らない。
    // 旧来は行の onBlur でも handleCloseMenu を呼んでいたが、Task 69.1 の Portal 化により
    // ドロップダウンは document.body 直下（= この行の DOM ツリーの外側）へ描画されるため、
    // キーボード Tab でメニュー項目へフォーカスを移すと relatedTarget が行の外側と判定され、
    // メニューが即座に閉じてしまっていた。閉じ判定は QuantityItemActionMenu 側の
    // outside-click（document の mousedown）+ Escape に一本化する（REQ-46.8, 46.9）。
    <div style={styles.wrapper} data-testid="quantity-item-row">
      <div style={styles.row} role="row">
        {/* 大項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-majorCategory`}
            label={showFieldLabels ? '大項目' : undefined}
            ariaLabel={showFieldLabels ? undefined : '大項目'}
            value={item.majorCategory}
            onChange={createUpdateHandler('majorCategory')}
            error={errors.majorCategory}
            placeholder="大項目を入力"
            field="majorCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 中項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-middleCategory`}
            label={showFieldLabels ? '中項目' : undefined}
            ariaLabel={showFieldLabels ? undefined : '中項目'}
            value={item.middleCategory || ''}
            onChange={createUpdateHandler('middleCategory')}
            placeholder="中項目を入力"
            field="middleCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 小項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-minorCategory`}
            label={showFieldLabels ? '小項目' : undefined}
            ariaLabel={showFieldLabels ? undefined : '小項目'}
            value={item.minorCategory || ''}
            onChange={createUpdateHandler('minorCategory')}
            placeholder="小項目を入力"
            field="minorCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 任意分類 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-customCategory`}
            label={showFieldLabels ? '任意分類' : undefined}
            ariaLabel={showFieldLabels ? undefined : '任意分類'}
            value={item.customCategory || ''}
            onChange={createUpdateHandler('customCategory')}
            placeholder="任意分類を入力"
            field="customCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 工種 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-workType`}
            label={showFieldLabels ? '工種' : undefined}
            ariaLabel={showFieldLabels ? undefined : '工種'}
            value={item.workType}
            onChange={createUpdateHandler('workType')}
            error={errors.workType}
            required
            placeholder="工種を入力"
            field="workType"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 名称 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-name`}
            label={showFieldLabels ? '名称' : undefined}
            ariaLabel={showFieldLabels ? undefined : '名称'}
            value={item.name}
            onChange={createUpdateHandler('name')}
            error={errors.name}
            required
            placeholder="名称を入力"
            field="name"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 規格 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-specification`}
            label={showFieldLabels ? '規格' : undefined}
            ariaLabel={showFieldLabels ? undefined : '規格'}
            value={item.specification || ''}
            onChange={createUpdateHandler('specification')}
            placeholder="規格を入力"
            field="specification"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 計算方法 - 要件順序: 規格の次 */}
        <div style={styles.fieldGroup} role="cell">
          <CalculationMethodSelect
            id={`${item.id}-calculationMethod`}
            value={item.calculationMethod}
            onChange={handleCalculationMethodChange}
            showLabel={showFieldLabels}
          />
        </div>

        {/* 数量 - 要件順序: 計算方法の次 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            {showFieldLabels && (
              <label htmlFor={`${item.id}-quantity`} style={styles.fieldLabel}>
                数量<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
              </label>
            )}
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-quantity`}
                type="text"
                inputMode="decimal"
                value={localQuantity}
                onChange={handleQuantityChange}
                onBlur={handleQuantityBlur}
                onFocus={handleQuantityFocus}
                className="hide-spinner"
                style={{
                  ...styles.input,
                  ...styles.quantityInput,
                  ...styles.numberInput,
                  ...(quantityError !== undefined
                    ? styles.inputError
                    : negativeQuantityWarning
                      ? styles.inputWarning
                      : {}),
                }}
                aria-required
                aria-invalid={quantityError !== undefined || negativeQuantityWarning}
                aria-describedby={
                  quantityError !== undefined
                    ? `${item.id}-quantity-error`
                    : negativeQuantityWarning
                      ? `${item.id}-quantity-warning`
                      : undefined
                }
                aria-label={showFieldLabels ? undefined : '数量'}
              />
              {/* REQ-8.4 / REQ-15.1: 数値以外の拒否と範囲外エラー（赤枠＋アイコン＋ホバー吹き出し）。
                  いずれも有効な入力ではなく、REQ-8.3 の負値警告より強い提示とする。 */}
              {quantityError !== undefined ? (
                <FieldValidationTooltip
                  message={quantityError}
                  id={`${item.id}-quantity-error`}
                  severity="error"
                />
              ) : (
                /* REQ-8.3: 負の値警告（黄枠＋アイコン＋ホバー吹き出し）。
                   通常フローにメッセージを挿入しないため行の高さが変わらない。 */
                negativeQuantityWarning && (
                  <FieldValidationTooltip
                    message="負の値が入力されています。確認してください。"
                    id={`${item.id}-quantity-warning`}
                    severity="warning"
                  />
                )
              )}
            </div>
          </div>
        </div>

        {/* 単位 - 要件順序: 数量の次 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-unit`}
            label={showFieldLabels ? '単位' : undefined}
            ariaLabel={showFieldLabels ? undefined : '単位'}
            value={item.unit}
            onChange={createUpdateHandler('unit')}
            error={errors.unit}
            required
            placeholder="単位"
            field="unit"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 備考 - 要件順序: 単位の次 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-remarks`}
            label={showFieldLabels ? '備考' : undefined}
            ariaLabel={showFieldLabels ? undefined : '備考'}
            value={item.remarks || ''}
            onChange={createUpdateHandler('remarks')}
            placeholder="備考"
            field="remarks"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/*
          アクション（REQ-36: アクションメニューに統合）+ 計算用フィールド inline 配置（REQ-37 / Task 51.1 Spike 採用案）
          操作列セル内に wrapper div を新設し、アクションメニューと CalculationFields を横並び配置する。
          計算用フィールド群は flex-shrink: 0 により右側へ inline 展開され、ビューポートを超える場合は
          ページ全体（REQ-25）の水平スクロールで閲覧する。
        */}
        <div
          style={{
            ...styles.actionsCell,
            ...(showFieldLabels ? styles.actionsCellWithLabel : {}),
          }}
          role="cell"
        >
          <div data-testid="action-cell-inline-wrapper" style={styles.actionCellInlineWrapper}>
            {/* 一括操作の対象選択（REQ-6.5）。
                列の追加は行わず操作列セル内に置く。タイトル行（QuantityGroupTitleRow）は
                REQ-18.1/18.4 によりメイン11列＋操作列の計12列で固定されており、選択列を
                新設すると当該要件の列構成を崩すため、行操作の一種として操作列に収める。 */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleSelectionChange}
              aria-label="項目を選択"
              style={styles.selectionCheckbox}
            />
            <QuantityItemActionMenu
              isOpen={isMenuOpen}
              onToggle={handleToggleMenu}
              onClose={handleCloseMenu}
              onMoveUp={() => onMoveUp?.(item.id)}
              onMoveDown={() => onMoveDown?.(item.id)}
              onCopy={() => {
                onCopy?.(item.id);
              }}
              onDelete={() => {
                onDelete?.(item.id);
              }}
              onMoveToGroup={onMoveToGroup ? () => onMoveToGroup(item.id) : undefined}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
            {/* 計算用フィールド（面積・体積またはピッチモード時のみ表示） */}
            {/* REQ-9, REQ-10: 調整係数・丸め設定も計算用フィールドエリアに表示 */}
            {item.calculationMethod !== 'STANDARD' && (
              <div style={styles.inlineCalculationFields}>
                <CalculationFields
                  method={item.calculationMethod}
                  params={item.calculationParams || {}}
                  onChange={handleCalculationParamsChange}
                  adjustmentFactor={item.adjustmentFactor}
                  onAdjustmentFactorChange={handleAdjustmentFactorUpdate}
                  roundingUnit={item.roundingUnit}
                  onRoundingUnitChange={handleRoundingUnitUpdate}
                />
              </div>
            )}
          </div>
        </div>
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
