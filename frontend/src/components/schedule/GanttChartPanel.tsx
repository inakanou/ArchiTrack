/**
 * @fileoverview GanttChartPanel コンポーネント - ガントチャート表示
 *
 * Task 10: ガントチャートコンポーネントの実装
 *
 * カスタムReactコンポーネントとして、HTML/CSSベースでガントチャートを描画する。
 * 外部ライブラリを使用せず、フロントエンド処理のみでリアルタイム更新を実現する。
 *
 * Requirements (construction-schedule):
 * - REQ-6.1: ガントチャートリアルタイム更新
 * - REQ-6.2: 土曜日色分け
 * - REQ-6.3: 日曜日色分け
 * - REQ-6.4: 祝日色分け
 * - REQ-6.5: 表示期間自動調整
 * - REQ-6.6: サーバー通信なしの更新
 * - REQ-9.6: チェックOFF項目のガントチャート表示
 * - REQ-10.2: ラベル文字の左列表示
 * - REQ-10.3: ラベル文字リアルタイム更新
 * - REQ-11.2: 詳細文字のバー上表示
 * - REQ-11.3: 詳細文字リアルタイム更新
 *
 * @module components/schedule/GanttChartPanel
 */

import { useMemo } from 'react';
import type { ScheduleItem } from '../../hooks/useScheduleState';
import type { HolidayMap } from '../../hooks/useHolidayCalendar';

// ============================================================================
// 型定義
// ============================================================================

export interface GanttChartPanelProps {
  /** 工程表項目リスト */
  items: ScheduleItem[];
  /** 祝日マップ */
  holidays: HolidayMap;
}

/** 年月グループ */
interface MonthGroup {
  label: string;
  colSpan: number;
}

// ============================================================================
// 定数
// ============================================================================

/** 1日あたりのセル幅(px) */
const DAY_CELL_WIDTH = 32;

/** ラベル列の幅(px) */
const LABEL_COLUMN_WIDTH = 100;

/** 行の高さ(px) */
const ROW_HEIGHT = 36;

/** バーの高さ(px) */
const BAR_HEIGHT = 20;

/** バーの上マージン(px) */
const BAR_TOP_MARGIN = 4;

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    overflowX: 'auto' as const,
    overflowY: 'auto' as const,
    position: 'relative' as const,
  } as React.CSSProperties,
  emptyMessage: {
    color: '#6b7280',
    fontSize: '14px',
    textAlign: 'center' as const,
    padding: '48px',
  } as React.CSSProperties,
  table: {
    borderCollapse: 'collapse' as const,
    tableLayout: 'fixed' as const,
    minWidth: 'max-content',
  } as React.CSSProperties,
  labelHeaderCell: {
    width: `${LABEL_COLUMN_WIDTH}px`,
    minWidth: `${LABEL_COLUMN_WIDTH}px`,
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    borderBottom: '1px solid #d1d5db',
    borderRight: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    position: 'sticky' as const,
    left: 0,
    zIndex: 2,
  } as React.CSSProperties,
  monthHeaderCell: {
    padding: '2px 4px',
    fontSize: '11px',
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    borderBottom: '1px solid #d1d5db',
    borderRight: '1px solid #e5e7eb',
    backgroundColor: '#f3f4f6',
  } as React.CSSProperties,
  dayHeaderCell: {
    width: `${DAY_CELL_WIDTH}px`,
    minWidth: `${DAY_CELL_WIDTH}px`,
    padding: '2px',
    fontSize: '10px',
    textAlign: 'center' as const,
    borderBottom: '1px solid #d1d5db',
    borderRight: '1px solid #e5e7eb',
  } as React.CSSProperties,
  labelCell: {
    width: `${LABEL_COLUMN_WIDTH}px`,
    minWidth: `${LABEL_COLUMN_WIDTH}px`,
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 500,
    borderBottom: '1px solid #e5e7eb',
    borderRight: '1px solid #d1d5db',
    backgroundColor: '#fff',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    position: 'sticky' as const,
    left: 0,
    zIndex: 1,
    height: `${ROW_HEIGHT}px`,
  } as React.CSSProperties,
  barCell: {
    padding: 0,
    borderBottom: '1px solid #e5e7eb',
    borderRight: '1px solid #f3f4f6',
    height: `${ROW_HEIGHT}px`,
    position: 'relative' as const,
  } as React.CSSProperties,
  bar: {
    position: 'absolute' as const,
    height: `${BAR_HEIGHT}px`,
    top: `${BAR_TOP_MARGIN}px`,
    backgroundColor: '#3b82f6',
    borderRadius: '3px',
    zIndex: 1,
  } as React.CSSProperties,
  detailText: {
    position: 'absolute' as const,
    top: `-${BAR_HEIGHT - 4}px`,
    left: '2px',
    fontSize: '10px',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    overflow: 'visible' as const,
    zIndex: 2,
  } as React.CSSProperties,
} as const;

/** 日種別ごとの背景色 */
const dayTypeColors: Record<string, string> = {
  weekday: '#ffffff',
  saturday: '#e0f2fe', // 薄い青
  sunday: '#fee2e2', // 薄い赤
  holiday: '#fef9c3', // 薄い黄色
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 日付文字列からDateオブジェクトを生成（ローカルタイムゾーン）
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * DateをYYYY-MM-DD形式の文字列に変換する
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 表示期間の日付配列を生成する
 */
function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * 日種別を判定する
 */
function getDayType(date: Date, holidays: HolidayMap): string {
  if (holidays.isHoliday(date)) return 'holiday';
  if (holidays.isSunday(date)) return 'sunday';
  if (holidays.isSaturday(date)) return 'saturday';
  return 'weekday';
}

/**
 * 年月グループを生成する
 */
function generateMonthGroups(dates: Date[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let currentLabel = '';
  let currentCount = 0;

  for (const date of dates) {
    const label = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    if (label === currentLabel) {
      currentCount++;
    } else {
      if (currentLabel) {
        groups.push({ label: currentLabel, colSpan: currentCount });
      }
      currentLabel = label;
      currentCount = 1;
    }
  }

  if (currentLabel) {
    groups.push({ label: currentLabel, colSpan: currentCount });
  }

  return groups;
}

/**
 * 全項目から表示期間（最早着工日〜最遅完了日）を算出する
 */
function calculateDateRange(items: ScheduleItem[]): { start: Date; end: Date } | null {
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const item of items) {
    if (!item.startDate || !item.endDate) continue;

    const start = parseDate(item.startDate);
    const end = parseDate(item.endDate);

    if (!minDate || start < minDate) {
      minDate = start;
    }
    if (!maxDate || end > maxDate) {
      maxDate = end;
    }
  }

  if (!minDate || !maxDate) return null;

  return { start: minDate, end: maxDate };
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * ガントチャートパネル
 *
 * 工程表データをガントチャート形式で視覚的に表示する。
 * 外部ライブラリを使用せず、HTML/CSSベースで描画。
 * propsの変更に応じてリアルタイムで再描画（サーバー通信なし）。
 */
export function GanttChartPanel({ items, holidays }: GanttChartPanelProps) {
  // 表示期間を自動算出
  const dateRange = useMemo(() => calculateDateRange(items), [items]);

  // 日付配列を生成
  const dates = useMemo(() => {
    if (!dateRange) return [];
    return generateDateRange(dateRange.start, dateRange.end);
  }, [dateRange]);

  // 年月グループを生成
  const monthGroups = useMemo(() => generateMonthGroups(dates), [dates]);

  // 日付キー → インデックスマップ
  const dateIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    dates.forEach((date, index) => {
      map.set(formatDateKey(date), index);
    });
    return map;
  }, [dates]);

  // 項目なし
  if (items.length === 0) {
    return (
      <div data-testid="gantt-chart-panel" style={styles.emptyMessage}>
        表示する項目がありません
      </div>
    );
  }

  // 着工日・日数が設定された項目がない
  if (!dateRange) {
    return (
      <div data-testid="gantt-chart-panel" style={styles.emptyMessage}>
        着工日と日数が設定された項目がありません
      </div>
    );
  }

  return (
    <div data-testid="gantt-chart-panel" style={styles.container}>
      <table style={styles.table}>
        <thead>
          {/* 年月ヘッダー行 */}
          <tr>
            <th style={styles.labelHeaderCell} rowSpan={2}>
              ラベル
            </th>
            {monthGroups.map((group, i) => (
              <th key={`month-${i}`} colSpan={group.colSpan} style={styles.monthHeaderCell}>
                {group.label}
              </th>
            ))}
          </tr>

          {/* 日ヘッダー行 */}
          <tr>
            {dates.map((date) => {
              const key = formatDateKey(date);
              const dayType = getDayType(date, holidays);
              return (
                <th
                  key={key}
                  data-testid={`gantt-date-${key}`}
                  data-day-type={dayType}
                  style={{
                    ...styles.dayHeaderCell,
                    backgroundColor: dayTypeColors[dayType] || '#ffffff',
                  }}
                >
                  {date.getDate()}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            // バー位置の計算
            let barStartIndex: number | null = null;
            let barWidth: number | null = null;

            if (item.startDate && item.endDate) {
              const startIdx = dateIndexMap.get(item.startDate);
              const endIdx = dateIndexMap.get(item.endDate);
              if (startIdx !== undefined && endIdx !== undefined) {
                barStartIndex = startIdx;
                barWidth = endIdx - startIdx + 1;
              }
            }

            return (
              <tr key={item.id} data-testid={`gantt-row-${item.id}`}>
                {/* ラベル列 */}
                <td
                  data-testid={`gantt-label-${item.id}`}
                  style={styles.labelCell}
                  title={item.labelText}
                >
                  {item.labelText}
                </td>

                {/* 日付セル */}
                {dates.map((date, colIndex) => {
                  const key = formatDateKey(date);
                  const dayType = getDayType(date, holidays);
                  const isBarStart = barStartIndex === colIndex;

                  return (
                    <td
                      key={key}
                      style={{
                        ...styles.barCell,
                        backgroundColor: dayTypeColors[dayType] || '#ffffff',
                      }}
                      data-day-type={dayType}
                    >
                      {/* バー描画（バー開始セルに描画） */}
                      {isBarStart && barWidth !== null && (
                        <div
                          data-testid={`gantt-bar-${item.id}`}
                          style={{
                            ...styles.bar,
                            left: 0,
                            width: `${barWidth * DAY_CELL_WIDTH - 2}px`,
                          }}
                        >
                          {/* 詳細文字（バーの上に表示） */}
                          {item.detailText && (
                            <span data-testid={`gantt-detail-${item.id}`} style={styles.detailText}>
                              {item.detailText}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
