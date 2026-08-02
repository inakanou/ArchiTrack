/**
 * @fileoverview ProfitRateDialog - 実行金額→見積金額転記ダイアログ（利益率適用）
 *
 * Task 55.4: 利益率ダイアログの入力元を編集中の明細へ変更
 *
 * 適用対象は**編集中の明細ツリー**（未保存の追加・編集を含む）から構成し、対象の識別には
 * 項目キー（`NodeKey` = サーバーの項目ID または未保存行の一時識別子 `tmp-*`）を用いる。
 * プレビューと適用は同一の計算関数 `estimateCalculations.applyProfitRate` を通り、適用は
 * `onApply` で編集状態への遷移（`estimateEditReducer` の `applyProfitRate`）へ渡す。
 * サーバーへの書き込みは行わない（49.3）。
 *
 * Requirements (estimate-creation):
 * - 6.2: 「すべて上書き」は名称・規格・単位・数量・単価を見積金額行に上書きする
 * - 6.3: 「空の場合のみ上書き」は見積金額行が空の項目のみ上書きする
 * - 6.4: 「単価のみ上書き」は単価のみを上書きする
 * - 6.5: 反映が実行された場合、金額を自動計算して表示する
 * - 6.6: 利益率を百分率で入力可能とする
 * - 6.7: 「空の場合のみ上書き」の判定を編集中の見積金額行の単価に対して行う
 * - 6.8: プレビューに表示した新しい単価と実際に反映される単価を一致させる
 * - 6.9: 未保存の新規行が適用対象に含まれる場合、その行も適用対象として扱う
 * - 13.3: 利益率に 0.00〜500.00 の範囲外の値が入力された場合はエラーメッセージを表示する
 * - 19.1〜19.6: 利益率適用ダイアログの各機能
 * - 19.8: 編集中の実行金額行（未保存の追加・編集を含む）を適用対象の一覧に表示する
 * - 22.6: 利益率適用後の単価を小数第1位で四捨五入した整数で表示する
 * - 37.1, 37.2: 利益率のデフォルト値12.27%と手動変更
 * - 41.9, 55.4: 値引き行・注記行を利益率の対象外とする
 * - 49.1, 49.3, 49.6, 49.7: 結果を未保存の変更として反映し、サーバーへ書き込まない
 *
 * 19.7 の「処理中の表示」は、適用がクライアント内で同期的に完結するようになったため
 * 成立する処理中の期間が存在しない（49.3 でサーバーへの往復が無くなった）。
 *
 * Design: design.md `#### Frontend Domain` > `##### estimateCalculations`
 *         （`applyProfitRate` を ProfitRateDialog が用いる）
 *
 * @module components/estimate/ProfitRateDialog
 */

import { useState, useCallback, useMemo } from 'react';
import Decimal from 'decimal.js';

import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import { applyProfitRate } from '../../domain/estimate/estimateCalculations';
import type { ProfitRateRow } from '../../domain/estimate/estimateCalculations';
import type {
  EstimateEditItemType,
  NodeKey,
  OverwriteOption,
  ProfitRatePayload,
} from '../../domain/estimate/estimateEditReducer.types';

export interface ProfitRateDialogProps {
  isOpen: boolean;
  /** 編集中の明細ツリー（未保存の追加・編集を含む / 19.8, 49.6） */
  items: EstimateItemHierarchyEdit[];
  onClose: () => void;
  /** 利益率の適用結果を編集状態へ反映する（49.1, 49.3） */
  onApply: (payload: ProfitRatePayload) => void;
}

const DEFAULT_PROFIT_RATE = '12.27';

/** 利益率の下限（13.3, 19.3） */
const MIN_PROFIT_RATE = new Decimal('0');

/** 利益率の上限（13.3, 19.3） */
const MAX_PROFIT_RATE = new Decimal('500');

/** 範囲外の利益率に対して表示するエラーメッセージ（13.3） */
const PROFIT_RATE_RANGE_MESSAGE = '利益率は0〜500の範囲で入力してください';

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '780px',
    width: '95%',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '24px',
  } as React.CSSProperties,
  section: { marginBottom: '24px' } as React.CSSProperties,
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,
  previewHeader: {
    backgroundColor: '#f9fafb',
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  previewCell: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  arrow: {
    padding: '8px 4px',
    borderBottom: '1px solid #f3f4f6',
    textAlign: 'center' as const,
    color: '#6b7280',
  } as React.CSSProperties,
  skippedRow: { color: '#9ca3af' } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  disabledButton: { backgroundColor: '#93c5fd', cursor: 'not-allowed' } as React.CSSProperties,
  errorMessage: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#b91c1c',
  } as React.CSSProperties,
};

function formatAmount(amount: Decimal | null): string {
  if (amount === null) return '-';
  return amount.toNumber().toLocaleString('ja-JP') + '円';
}

/**
 * 数値文字列を Decimal へ変換する（変換できない場合は null）
 *
 * `estimateEditReducer` が適用時に用いる変換規則と同一。プレビューと適用で
 * 同じ入力値を得るために規則を揃える必要がある（6.8）。
 */
function toDecimal(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 適用対象の候補行（編集中の明細ツリーから収集する）
 *
 * `key` は項目キー。未保存の新規行は一時識別子（`tmp-*`）がそのまま入るため、
 * サーバーへ保存していない行も適用対象として識別できる（6.9, 19.8, 49.7）。
 */
interface ProfitTargetRow extends ProfitRateRow {
  /** 一覧に表示する名称（実行金額行の名称） */
  readonly name: string | null;
}

/**
 * 編集中の明細ツリーから適用対象の候補を収集する
 *
 * 階層の深さに上限を設けないため明示スタックで走査する（2.5）。
 *
 * **選定条件は適用側（`estimateEditReducer` の `applyProfitRateAction`）と同一**にする。
 * 適用側は実行金額行と見積金額行の双方を持つ項目だけを対象にし、値引き行・注記行は
 * `applyProfitRate` が除外する。どれか一つでも条件を落とすと、反映されない行に
 * 新しい単価を示すことになり 6.8 が破れる。
 */
function collectProfitTargetRows(items: readonly EstimateItemHierarchyEdit[]): ProfitTargetRow[] {
  const result: ProfitTargetRow[] = [];
  const stack: EstimateItemHierarchyEdit[] = [...items].reverse();

  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) {
      break;
    }

    const execution = item.lines.find((line) => line.lineType === 'EXECUTION');
    const estimate = item.lines.find((line) => line.lineType === 'ESTIMATE');
    const itemType: EstimateEditItemType = item.itemType ?? 'STANDARD';

    if (execution !== undefined && estimate !== undefined) {
      result.push({
        key: item.id,
        itemType,
        name: execution.name,
        executionUnitPrice: toDecimal(execution.unitPrice),
        executionQuantity: toDecimal(execution.quantity),
        estimateUnitPrice: toDecimal(estimate.unitPrice),
        estimateQuantity: toDecimal(estimate.quantity),
      });
    }

    for (let index = item.children.length - 1; index >= 0; index -= 1) {
      const child = item.children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  return result;
}

export function ProfitRateDialog({ isOpen, items, onClose, onApply }: ProfitRateDialogProps) {
  const [profitRate, setProfitRate] = useState(DEFAULT_PROFIT_RATE);
  const [overwriteOption, setOverwriteOption] = useState<OverwriteOption>('all');

  const targetRows = useMemo(() => collectProfitTargetRows(items), [items]);

  const nameByKey = useMemo(() => {
    const map = new Map<NodeKey, string | null>();
    for (const row of targetRows) {
      map.set(row.key, row.name);
    }
    return map;
  }, [targetRows]);

  const rateDecimal = useMemo(() => toDecimal(profitRate), [profitRate]);

  /**
   * 利益率の範囲エラー（13.3）
   *
   * かつて範囲検証はサーバーの `applyProfitRateSchema` にしか無く、旧ダイアログは
   * その 400 応答を空の catch で握り潰していたため「エラーメッセージを表示する」は
   * 実際には満たされていなかった。適用がクライアント内で完結した（49.3）いま、
   * 範囲検証はこのダイアログの責務である。
   *
   * `<input type="number" min max>` の制約はキーボード操作でしか効かず、貼り付けや
   * プログラム的な変更を止められないため、値そのものを判定する。
   */
  const rangeError = useMemo(() => {
    if (rateDecimal === null) return null;
    if (rateDecimal.lt(MIN_PROFIT_RATE) || rateDecimal.gt(MAX_PROFIT_RATE)) {
      return PROFIT_RATE_RANGE_MESSAGE;
    }
    return null;
  }, [rateDecimal]);

  /**
   * 適用プレビュー（19.5）
   *
   * 計算は 55.1 の `applyProfitRate` に委ねる。適用側（reducer の `applyProfitRate`）も
   * 同じ関数を通るため、プレビューに出た単価と反映される単価が一致する（6.8）。
   * 値引き行・注記行の除外も同関数が行う（41.9, 55.4）。
   *
   * 範囲外の利益率ではプレビューを出さない（適用できない値の結果を見せない、13.3）。
   */
  const previewResults = useMemo(() => {
    if (rateDecimal === null || rangeError !== null || targetRows.length === 0) {
      return null;
    }
    return applyProfitRate(targetRows, rateDecimal, overwriteOption);
  }, [targetRows, rateDecimal, rangeError, overwriteOption]);

  const isFormValid =
    rateDecimal !== null &&
    rangeError === null &&
    previewResults !== null &&
    previewResults.length > 0;

  /**
   * 利益率の適用（19.6）
   *
   * サーバーへは書き込まず、編集状態への反映として `onApply` へ渡す（49.1, 49.3）。
   * 対象キーはプレビューに並んだ行そのものを渡す（プレビューと適用の対象を一致させる）。
   */
  const handleApply = useCallback(() => {
    if (!isFormValid || previewResults === null) return;
    onApply({
      targetKeys: previewResults.map((result) => result.key),
      rate: profitRate,
      overwriteOption,
    });
    onClose();
  }, [isFormValid, previewResults, onApply, onClose, profitRate, overwriteOption]);

  if (!isOpen) return null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profit-dialog-title"
    >
      <div style={styles.dialog}>
        <h2 id="profit-dialog-title" style={styles.title}>
          実行金額を見積金額に転記（利益率適用）
        </h2>

        {/* 利益率入力 (REQ-19.3, REQ-6.6, REQ-37.1, REQ-37.2) */}
        <div style={styles.section}>
          <label htmlFor="profit-rate" style={styles.sectionTitle}>
            利益率 (%)
          </label>
          <input
            id="profit-rate"
            type="number"
            value={profitRate}
            onChange={(e) => setProfitRate(e.target.value)}
            placeholder="例: 10"
            min="0"
            max="500"
            step="0.01"
            style={styles.input}
            aria-invalid={rangeError !== null}
            aria-errormessage={rangeError !== null ? 'profit-rate-error' : undefined}
          />
          {rangeError !== null && (
            <div id="profit-rate-error" role="alert" style={styles.errorMessage}>
              {rangeError}
            </div>
          )}
        </div>

        {/* 上書きオプション (REQ-19.4, REQ-6.2, REQ-6.3, REQ-6.4) */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>上書きオプション</div>
          <div style={styles.radioGroup}>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="overwrite"
                checked={overwriteOption === 'all'}
                onChange={() => setOverwriteOption('all')}
              />
              すべて上書き（名称・規格・単位・数量・単価）
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="overwrite"
                checked={overwriteOption === 'empty_only'}
                onChange={() => setOverwriteOption('empty_only')}
              />
              空の場合のみ上書き
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="overwrite"
                checked={overwriteOption === 'unit_price_only'}
                onChange={() => setOverwriteOption('unit_price_only')}
              />
              単価のみ上書き
            </label>
          </div>
        </div>

        {/* プレビュー兼・適用対象の一覧 (REQ-19.5, REQ-19.8, REQ-6.5, REQ-6.8) */}
        {previewResults !== null && previewResults.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>適用プレビュー</div>
            <table style={styles.previewTable}>
              <thead>
                <tr>
                  <th style={styles.previewHeader}>名称</th>
                  <th style={styles.previewHeader}>元の単価</th>
                  <th style={{ ...styles.previewHeader, textAlign: 'center', width: '40px' }}></th>
                  <th style={styles.previewHeader}>新しい単価</th>
                  <th style={styles.previewHeader}>新しい金額</th>
                  <th style={styles.previewHeader}>反映</th>
                </tr>
              </thead>
              <tbody>
                {previewResults.map((result) => (
                  <tr
                    key={result.key}
                    data-testid="profit-preview-row"
                    data-profit-key={result.key}
                    style={result.applied ? undefined : styles.skippedRow}
                  >
                    <td style={styles.previewCell}>{nameByKey.get(result.key) || '(名称なし)'}</td>
                    <td
                      style={{ ...styles.previewCell, textAlign: 'right' }}
                      data-testid="preview-original-unit-price"
                    >
                      {formatAmount(result.originalUnitPrice)}
                    </td>
                    <td style={styles.arrow}>→</td>
                    <td
                      style={{ ...styles.previewCell, textAlign: 'right' }}
                      data-testid="preview-new-unit-price"
                    >
                      {formatAmount(result.newUnitPrice)}
                    </td>
                    <td
                      style={{ ...styles.previewCell, textAlign: 'right' }}
                      data-testid="preview-new-amount"
                    >
                      {formatAmount(result.newAmount)}
                    </td>
                    {/*
                      「空の場合のみ上書き」で反映されない行を明示する。
                      反映されない行に新しい単価だけを示すと 6.8 に反する。
                    */}
                    <td style={styles.previewCell} data-testid="preview-applied">
                      {result.applied ? '反映する' : '反映しない'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ボタン (REQ-19.6) */}
        <div style={styles.buttonGroup}>
          <button type="button" onClick={onClose} style={styles.cancelButton}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!isFormValid}
            style={{
              ...styles.submitButton,
              ...(!isFormValid ? styles.disabledButton : {}),
            }}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfitRateDialog;
