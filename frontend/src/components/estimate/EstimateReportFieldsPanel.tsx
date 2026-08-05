/**
 * @fileoverview EstimateReportFieldsPanel - 帳票用入力項目のパネル
 *
 * Task 56.8: 帳票用入力項目のパネル
 *
 * 見積書画面から提出日・有効期限・別途工事を入力・編集するためのパネルです。
 * 入力した値は表紙（`EstimateCoverRenderer`）の提出日欄・有効期限欄・
 * 別途工事欄へそのまま出力されます。
 *
 * **状態を一切持ちません**。編集内容の所有者は `estimateEditReducer` の
 * `reportFields` であり、本コンポーネントは受け取った値を描画し、
 * 変更後の値**全体**を通知するだけです。これにより 54.8「編集を未保存の変更として
 * 扱い保存操作で確定する」がパネル固有の仕組みを持たず、明細の編集と
 * まったく同じ `isDirty` の経路に載ります。
 *
 * Requirements (estimate-creation):
 * - 54.1: 別途工事の記載を5件まで入力可能とする
 * - 54.2: 見積の有効期限を入力可能とする
 * - 54.3: 提出日を入力可能とする
 * - 54.6: 別途工事・有効期限・提出日を見積書画面から編集可能とする
 * - 54.7: 未入力の項目は空欄として扱う（帳票側で見出しを残して値のみ空にする）
 *
 * 新規作成時の既定値（54.4 の提出日＝当日、54.5 の有効期限＝「提出日より1ヶ月間」）は
 * **本コンポーネントの責務ではありません**。作成時にサーバー
 * （`EstimateService.create`）が確定させます。画面側で「未入力なら当日を表示する」
 * 形にすると、既存の見積書を開いた瞬間にも既定値が入り、
 * 未入力（54.7）と区別できないまま未保存の変更になってしまうためです。
 *
 * Design: design.md `#### File Structure Plan`
 * `EstimateReportFieldsPanel.tsx  # 新規: 提出日・有効期限・別途工事の入力`、
 * `| 54.1〜54.8 | 帳票用追加入力項目 | EstimateReportFieldsPanel, Estimate モデル |`
 *
 * @module components/estimate/EstimateReportFieldsPanel
 */

import { useCallback, useId } from 'react';
import type { CSSProperties } from 'react';
import type { EstimateReportFields } from '../../domain/estimate/estimateEditReducer.types';

// ============================================================================
// 定数
// ============================================================================

/**
 * 別途工事の入力件数の上限（54.1）
 *
 * 帳票の別途工事欄が5行（51.12）であること、保存スキーマ
 * （backend `estimate.schema.ts` の `SEPARATE_WORKS_MAX_COUNT`）が5件を上限と
 * していることの双方に対応する。
 */
export const SEPARATE_WORKS_MAX_COUNT = 5;

/**
 * 別途工事1件あたりの文字数上限
 *
 * 保存スキーマの `SEPARATE_WORKS_MAX_LENGTH` と同値。画面から超過する値を
 * 作れると保存が 400 で弾かれ、入力内容ごと確定できなくなる。
 */
export const SEPARATE_WORK_MAX_LENGTH = 200;

/**
 * 有効期限の文字数上限
 *
 * `Estimate.validityPeriod` が `VARCHAR(100)`、保存スキーマの
 * `VALIDITY_PERIOD_MAX_LENGTH` も100。
 */
export const VALIDITY_PERIOD_MAX_LENGTH = 100;

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateReportFieldsPanel コンポーネントの Props
 *
 * すべて必須。省略できる形にすると画面側の結線漏れが型検査もテストも
 * すり抜ける（53.14 / 54.10 で死んだ props を繰り返した経緯）。
 */
export interface EstimateReportFieldsPanelProps {
  /**
   * 編集中の帳票用入力項目（54.6）
   *
   * 所有者は `estimateEditReducer` の `reportFields`。
   */
  value: EstimateReportFields;
  /**
   * 変更の通知（54.6, 54.8）
   *
   * 変更後の値**全体**を渡す。差分ではなく全体を渡すのは、受け手
   * （`updateReportFields`）が前後の同値判定で未保存フラグを立てるかどうかを
   * 決めるため。
   */
  onChange: (fields: EstimateReportFields) => void;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 帳票用入力項目のパネル（54.1, 54.2, 54.3, 54.6）
 */
export function EstimateReportFieldsPanel({
  value,
  onChange,
}: EstimateReportFieldsPanelProps): React.ReactElement {
  const fieldIdPrefix = useId();
  const submissionDateId = `${fieldIdPrefix}-submission-date`;
  const validityPeriodId = `${fieldIdPrefix}-validity-period`;

  const { submissionDate, validityPeriod, separateWorks } = value;

  /**
   * 上限に達しているか（54.1）
   *
   * 追加ボタンの活性判定の唯一の根拠。ここを緩めると6件目を作れてしまい、
   * 保存スキーマの上限に触れて保存自体が通らなくなる。
   */
  const isSeparateWorksFull = separateWorks.length >= SEPARATE_WORKS_MAX_COUNT;

  const handleSubmissionDateChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      // 空欄は「未入力」（54.7）。空文字のまま保存すると日付形式の検証で弾かれる。
      const next = event.target.value === '' ? null : event.target.value;
      onChange({ submissionDate: next, validityPeriod, separateWorks });
    },
    [onChange, validityPeriod, separateWorks]
  );

  const handleValidityPeriodChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      // 空欄は「未入力」（54.7）。空文字と null を混在させると帳票側の
      // 空欄判定が2通りになる。
      const next = event.target.value === '' ? null : event.target.value;
      onChange({ submissionDate, validityPeriod: next, separateWorks });
    },
    [onChange, submissionDate, separateWorks]
  );

  const handleSeparateWorkChange = useCallback(
    (index: number, text: string): void => {
      const next = separateWorks.map((entry, at) => (at === index ? text : entry));
      onChange({ submissionDate, validityPeriod, separateWorks: next });
    },
    [onChange, submissionDate, validityPeriod, separateWorks]
  );

  const handleAddSeparateWork = useCallback((): void => {
    onChange({
      submissionDate,
      validityPeriod,
      separateWorks: [...separateWorks, ''],
    });
  }, [onChange, submissionDate, validityPeriod, separateWorks]);

  const handleRemoveSeparateWork = useCallback(
    (index: number): void => {
      const next = separateWorks.filter((_entry, at) => at !== index);
      onChange({ submissionDate, validityPeriod, separateWorks: next });
    },
    [onChange, submissionDate, validityPeriod, separateWorks]
  );

  return (
    <section
      data-testid="estimate-report-fields-panel"
      aria-label="帳票用入力項目"
      style={styles.panel}
    >
      <h2 style={styles.title}>帳票用入力項目</h2>

      <div style={styles.row}>
        {/* 提出日（54.3） */}
        <div style={styles.field}>
          <label htmlFor={submissionDateId} style={styles.label}>
            提出日
          </label>
          <input
            id={submissionDateId}
            data-testid="report-submission-date"
            type="date"
            value={submissionDate ?? ''}
            onChange={handleSubmissionDateChange}
            style={styles.input}
          />
        </div>

        {/* 有効期限（54.2） */}
        <div style={{ ...styles.field, flex: 2 }}>
          <label htmlFor={validityPeriodId} style={styles.label}>
            見積有効期限
          </label>
          <input
            id={validityPeriodId}
            data-testid="report-validity-period"
            type="text"
            value={validityPeriod ?? ''}
            maxLength={VALIDITY_PERIOD_MAX_LENGTH}
            placeholder="提出日より1ヶ月間"
            onChange={handleValidityPeriodChange}
            style={styles.input}
          />
        </div>
      </div>

      {/* 別途工事（54.1） */}
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>別途工事</legend>
        <ul style={styles.list}>
          {separateWorks.map((entry, index) => {
            const inputId = `${fieldIdPrefix}-separate-work-${index}`;
            const label = `別途工事${index + 1}`;
            return (
              // 別途工事は順序そのものが帳票の行番号になるため、キーは位置で与える。
              <li key={inputId} style={styles.listItem}>
                <label htmlFor={inputId} style={styles.separateWorkLabel}>
                  {label}
                </label>
                <input
                  id={inputId}
                  data-testid={`report-separate-work-${index}`}
                  type="text"
                  value={entry}
                  maxLength={SEPARATE_WORK_MAX_LENGTH}
                  onChange={(event) => handleSeparateWorkChange(index, event.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button
                  type="button"
                  aria-label={`${label}を削除`}
                  onClick={() => handleRemoveSeparateWork(index)}
                  style={styles.removeButton}
                >
                  削除
                </button>
              </li>
            );
          })}
        </ul>
        <div style={styles.addRow}>
          <button
            type="button"
            data-testid="add-separate-work"
            onClick={handleAddSeparateWork}
            disabled={isSeparateWorksFull}
            style={{
              ...styles.addButton,
              ...(isSeparateWorksFull ? styles.addButtonDisabled : {}),
            }}
          >
            別途工事を追加
          </button>
          <span data-testid="separate-works-count" style={styles.count}>
            {separateWorks.length} / {SEPARATE_WORKS_MAX_COUNT} 件
          </span>
        </div>
      </fieldset>
    </section>
  );
}

// ============================================================================
// スタイル
// ============================================================================

const styles: Record<string, CSSProperties> = {
  panel: {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    padding: '12px 16px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    margin: '0 0 8px 0',
  },
  row: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: '160px',
  },
  label: {
    fontSize: '12px',
    color: '#6b7280',
  },
  input: {
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
  },
  fieldset: {
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    margin: '12px 0 0 0',
    padding: '8px 12px 12px',
  },
  legend: {
    fontSize: '12px',
    color: '#6b7280',
    padding: '0 4px',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  separateWorkLabel: {
    fontSize: '12px',
    color: '#6b7280',
    minWidth: '72px',
  },
  addRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  addButton: {
    padding: '4px 12px',
    fontSize: '12px',
    border: '1px solid #2563eb',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#2563eb',
    cursor: 'pointer',
  },
  addButtonDisabled: {
    borderColor: '#d1d5db',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  removeButton: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#4b5563',
    cursor: 'pointer',
  },
  count: {
    fontSize: '12px',
    color: '#6b7280',
  },
};
