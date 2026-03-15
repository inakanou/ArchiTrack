/**
 * @fileoverview ScheduleItemRow コンポーネント - 工程表項目入力行
 *
 * Task 9.1: ScheduleDetailPageと項目入力行を実装する
 *
 * Requirements (construction-schedule):
 * - REQ-3.1: 着工日入力欄
 * - REQ-3.2: 日数入力欄
 * - REQ-3.4: 着工日未入力バリデーション
 * - REQ-3.5: 日数0以下バリデーション
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-9.1: 出力対象チェックボックス表示
 * - REQ-10.1: ラベル文字入力欄
 * - REQ-11.1: 詳細文字入力欄
 *
 * @module components/schedule/ScheduleItemRow
 */

import type { ScheduleItem } from '../../hooks/useScheduleState';

// ============================================================================
// 型定義
// ============================================================================

export interface ScheduleItemRowProps {
  /** 工程表項目データ */
  item: ScheduleItem;
  /** 項目更新コールバック */
  onUpdate: (itemId: string, updates: Partial<ScheduleItem>) => void;
  /** 項目削除コールバック */
  onRemove: (itemId: string) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#fff',
  } as React.CSSProperties,
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as React.CSSProperties,
  input: {
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
  } as React.CSSProperties,
  inputSmall: {
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100px',
  } as React.CSSProperties,
  inputDate: {
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    width: '150px',
  } as React.CSSProperties,
  inputNumber: {
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    width: '80px',
  } as React.CSSProperties,
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  } as React.CSSProperties,
  badge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold' as const,
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  } as React.CSSProperties,
  removeButton: {
    padding: '4px 8px',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#dc2626',
    fontSize: '12px',
    cursor: 'pointer',
  } as React.CSSProperties,
  validationError: {
    color: '#dc2626',
    fontSize: '12px',
    marginTop: '2px',
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: 500,
  } as React.CSSProperties,
};

// ============================================================================
// バリデーション
// ============================================================================

/**
 * 着工日未入力で日数のみ入力されているかチェック
 */
function hasStartDateValidationError(item: ScheduleItem): boolean {
  return !item.startDate && item.duration !== null && item.duration > 0;
}

/**
 * 日数が0以下かチェック
 */
function hasDurationValidationError(item: ScheduleItem): boolean {
  return item.duration !== null && item.duration <= 0;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工程表の1項目の入力行
 */
export function ScheduleItemRow({ item, onUpdate, onRemove }: ScheduleItemRowProps) {
  const startDateError = hasStartDateValidationError(item);
  const durationError = hasDurationValidationError(item);

  return (
    <div style={styles.row} data-testid={`item-row-${item.id}`}>
      {/* ソースタイプバッジ */}
      {item.sourceType === 'QUANTITY_TABLE' && <span style={styles.badge}>数量表</span>}

      {/* 項目名 */}
      <div style={styles.fieldGroup}>
        <label htmlFor={`item-name-${item.id}`} style={styles.label}>
          項目名
        </label>
        <input
          id={`item-name-${item.id}`}
          type="text"
          data-testid={`item-name-${item.id}`}
          style={styles.input}
          value={item.itemName}
          onChange={(e) => onUpdate(item.id, { itemName: e.target.value })}
          placeholder="項目名"
        />
      </div>

      {/* ラベル文字 */}
      <div style={styles.fieldGroup}>
        <label htmlFor={`label-text-${item.id}`} style={styles.label}>
          ラベル
        </label>
        <input
          id={`label-text-${item.id}`}
          type="text"
          data-testid={`label-text-${item.id}`}
          style={styles.inputSmall}
          value={item.labelText}
          onChange={(e) => onUpdate(item.id, { labelText: e.target.value })}
          placeholder="ラベル"
        />
      </div>

      {/* 詳細文字 */}
      <div style={styles.fieldGroup}>
        <label htmlFor={`detail-text-${item.id}`} style={styles.label}>
          詳細
        </label>
        <input
          id={`detail-text-${item.id}`}
          type="text"
          data-testid={`detail-text-${item.id}`}
          style={styles.input}
          value={item.detailText}
          onChange={(e) => onUpdate(item.id, { detailText: e.target.value })}
          placeholder="詳細"
        />
      </div>

      {/* 着工日 */}
      <div style={styles.fieldGroup}>
        <label htmlFor={`start-date-${item.id}`} style={styles.label}>
          着工日
        </label>
        <input
          id={`start-date-${item.id}`}
          type="date"
          data-testid={`start-date-${item.id}`}
          style={styles.inputDate}
          value={item.startDate ?? ''}
          onChange={(e) => onUpdate(item.id, { startDate: e.target.value || null })}
        />
        {startDateError && <span style={styles.validationError}>着工日を入力してください</span>}
      </div>

      {/* 日数 */}
      <div style={styles.fieldGroup}>
        <label htmlFor={`duration-${item.id}`} style={styles.label}>
          日数
        </label>
        <input
          id={`duration-${item.id}`}
          type="number"
          data-testid={`duration-${item.id}`}
          style={styles.inputNumber}
          value={item.duration ?? ''}
          min={1}
          onChange={(e) => {
            const value = e.target.value;
            onUpdate(item.id, {
              duration: value === '' ? null : parseInt(value, 10),
            });
          }}
          placeholder="日数"
        />
        {durationError && <span style={styles.validationError}>日数は1以上を入力してください</span>}
      </div>

      {/* 出力対象チェックボックス */}
      <div style={{ ...styles.fieldGroup, alignItems: 'center' }}>
        <label htmlFor={`export-target-${item.id}`} style={styles.label}>
          出力
        </label>
        <input
          id={`export-target-${item.id}`}
          type="checkbox"
          data-testid={`export-target-${item.id}`}
          style={styles.checkbox}
          checked={item.isExportTarget}
          onChange={(e) => onUpdate(item.id, { isExportTarget: e.target.checked })}
        />
      </div>

      {/* 削除ボタン（任意項目のみ） */}
      {item.sourceType === 'MANUAL' && (
        <button
          type="button"
          data-testid={`remove-item-${item.id}`}
          style={styles.removeButton}
          onClick={() => onRemove(item.id)}
          aria-label={`${item.itemName || '項目'}を削除`}
        >
          削除
        </button>
      )}
    </div>
  );
}
