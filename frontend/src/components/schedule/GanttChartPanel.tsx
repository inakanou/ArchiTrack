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
 * - REQ-6.7: 入力変更から200ms以内の表示更新
 * - REQ-12.2: 200項目でのスムーズな描画
 *
 * Task 21.1（描画の性能）: 本体の行は日付ごとのセルを持たず、ラベルのセルと、全日付にまたがる
 * 1つのタイムラインのセル（colSpan）だけで描く。土日祝の色分けと日付の区切り線はタイムラインの
 * セルの背景（区間の少ない gradient の層の重ね合わせ）で描き、背景の値は表示期間と祝日から一度だけ
 * 作り、パネルごとの1つのスタイル規則（<style>）として全行で共有する（行ごとのインラインスタイルに
 * 長い値を持たせない）。
 * 行は React.memo で包み、入力で変わった項目の行だけを描き直す。
 *
 * @module components/schedule/GanttChartPanel
 */

import { memo, useId, useMemo } from 'react';
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

/** 日種別 */
type DayType = 'weekday' | 'saturday' | 'sunday' | 'holiday';

/** 表示期間の1日（日付キーと日種別を一度だけ求めて共有する） */
interface DisplayDay {
  date: Date;
  key: string;
  /** 祝日を優先した日種別（表示の色） */
  dayType: DayType;
  /** 曜日だけによる日種別（祝日かどうかは問わない） */
  weekType: Exclude<DayType, 'holiday'>;
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
  timelineCell: {
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

/** 日付の区切り線の色（日付ごとのセルだったときの右罫線と同じ色） */
const DAY_DIVIDER_COLOR = '#f3f4f6';

/** 日種別ごとの背景色 */
const dayTypeColors: Record<DayType, string> = {
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
 * 表示期間の1日の日種別を判定する（祝日を優先した日種別と、曜日だけによる日種別）
 */
function toDisplayDay(date: Date, holidays: HolidayMap): DisplayDay {
  const weekType = holidays.isSunday(date)
    ? 'sunday'
    : holidays.isSaturday(date)
      ? 'saturday'
      : 'weekday';
  return {
    date,
    key: formatDateKey(date),
    dayType: holidays.isHoliday(date) ? 'holiday' : weekType,
    weekType,
  };
}

/** 曜日の周期（日） */
const DAYS_PER_WEEK = 7;

/**
 * タイムラインの1セルがまたぐ日数の上限
 *
 * HTML の colspan の上限は 1000 で、超える値は 1000 に切り詰められる。表示期間が 1000 日を
 * 超えるときはタイムラインをこの日数ごとのセルに分ける（分けないと 1000 日目より後の本体が
 * 背景・区切り線・下罫線を持たない）。
 */
const MAX_TIMELINE_COLSPAN = 1000;

/** タイムラインのセル1つが受け持つ日付の区間 */
interface TimelineSegment {
  /** 表示期間の先頭からの日数 */
  start: number;
  /** 日数（colSpan） */
  length: number;
}

/** 表示期間を MAX_TIMELINE_COLSPAN 日以下の区間に分ける */
function splitTimelineSegments(dayCount: number): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  for (let start = 0; start < dayCount; start += MAX_TIMELINE_COLSPAN) {
    segments.push({ start, length: Math.min(MAX_TIMELINE_COLSPAN, dayCount - start) });
  }
  return segments;
}

/** 塗りつぶし1色の背景の層 */
function solidLayer(color: string): string {
  return `linear-gradient(${color}, ${color})`;
}

/** 表示期間の先頭から index 日目の、曜日だけによる背景の色（平日は透明） */
function weekColorAt(days: readonly DisplayDay[], index: number): string {
  const weekType = days[index]?.weekType ?? 'weekday';
  return weekType === 'weekday' ? 'transparent' : dayTypeColors[weekType];
}

/**
 * タイムラインのセルの背景（土日祝の色分けと日付の区切り線）の宣言を作る
 *
 * 色の区間が多い1本の gradient は描画（ラスタライズ）が重いため、区間の少ない層を重ねる。
 * 上から順に、
 * - 日付の区切り線: 各日付の右端の 1px（repeating-linear-gradient、2 区間）
 * - 祝日: 連続する祝日ごとに1色の層を、その日付の位置と幅に置く（年に十数層）
 * - 土日: 曜日は 7 日で繰り返すため、表示期間の先頭の 7 日の並びを 7 日周期の
 *   repeating-linear-gradient で描く（祝日の層が上に重なるため、祝日の土日は祝日の色になる）
 * - 平日: 背景色
 */
function buildTimelineBackgroundDeclarations(days: readonly DisplayDay[]): string {
  const period = DAYS_PER_WEEK * DAY_CELL_WIDTH;

  // 土日の 7 日周期の並び（祝日かどうかは問わない）。連続する同じ色は1つの区間にまとめる
  const weekStops: string[] = [];
  let weekRunStart = 0;
  for (let k = 1; k <= DAYS_PER_WEEK; k++) {
    const runColor = weekColorAt(days, weekRunStart);
    if (k < DAYS_PER_WEEK && weekColorAt(days, k) === runColor) continue;
    weekStops.push(`${runColor} ${weekRunStart * DAY_CELL_WIDTH}px ${k * DAY_CELL_WIDTH}px`);
    weekRunStart = k;
  }
  const weekLayer = `repeating-linear-gradient(to right, ${weekStops.join(', ')})`;

  // 連続する祝日ごとの層
  const holidayLayers: { x: number; width: number }[] = [];
  let runStart: number | null = null;
  for (let i = 0; i <= days.length; i++) {
    const isHoliday = days[i]?.dayType === 'holiday';
    if (isHoliday && runStart === null) runStart = i;
    if (!isHoliday && runStart !== null) {
      holidayLayers.push({ x: runStart * DAY_CELL_WIDTH, width: (i - runStart) * DAY_CELL_WIDTH });
      runStart = null;
    }
  }

  const dividerLayer = `repeating-linear-gradient(to right, transparent 0px ${DAY_CELL_WIDTH - 1}px, ${DAY_DIVIDER_COLOR} ${DAY_CELL_WIDTH - 1}px ${DAY_CELL_WIDTH}px)`;
  const images = [
    dividerLayer,
    ...holidayLayers.map(() => solidLayer(dayTypeColors.holiday)),
    weekLayer,
  ];
  const positions = ['0px 0px', ...holidayLayers.map((h) => `${h.x}px 0px`), '0px 0px'];
  const sizes = ['auto', ...holidayLayers.map((h) => `${h.width}px 100%`), `${period}px 100%`];
  const repeats = ['repeat', ...holidayLayers.map(() => 'no-repeat'), 'repeat'];

  return [
    `background-color: ${dayTypeColors.weekday};`,
    `background-image: ${images.join(', ')};`,
    `background-position: ${positions.join(', ')};`,
    `background-size: ${sizes.join(', ')};`,
    `background-repeat: ${repeats.join(', ')};`,
  ].join(' ');
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

interface GanttRowProps {
  item: ScheduleItem;
  /** タイムラインのセルの区間（表示期間が 1000 日以下なら1つ） */
  segments: readonly TimelineSegment[];
  /** バーの開始位置（表示期間の先頭からの日数）。バーが無い場合は null */
  barStartIndex: number | null;
  /** バーの日数。バーが無い場合は null */
  barDays: number | null;
  /** タイムラインのセルの背景の規則を当てる識別子（パネルごと） */
  timelineId: string;
}

/**
 * ガントチャートの1行
 *
 * props が変わらない行は描き直さない（入力で変わった項目の行だけを描き直す）。
 */
const GanttRow = memo(function GanttRow({
  item,
  segments,
  barStartIndex,
  barDays,
  timelineId,
}: GanttRowProps) {
  return (
    <tr data-testid={`gantt-row-${item.id}`}>
      {/* ラベル列 */}
      <td data-testid={`gantt-label-${item.id}`} style={styles.labelCell} title={item.labelText}>
        {item.labelText}
      </td>

      {/* タイムライン（日付の区間ごとのセル。土日祝の色分けは背景で描く） */}
      {segments.map((segment, index) => {
        const hasBar =
          barStartIndex !== null &&
          barDays !== null &&
          segment.start <= barStartIndex &&
          barStartIndex < segment.start + segment.length;
        return (
          <td
            key={segment.start}
            data-testid={
              index === 0 ? `gantt-timeline-${item.id}` : `gantt-timeline-${item.id}-${index}`
            }
            data-gantt-timeline={timelineId}
            data-gantt-segment-start={segment.start}
            colSpan={segment.length}
            style={styles.timelineCell}
          >
            {/* バーは開始日を含むセルに置き、後ろの区間のセルへは重ねて伸ばす */}
            {hasBar && (
              <div
                data-testid={`gantt-bar-${item.id}`}
                style={{
                  ...styles.bar,
                  left: `${(barStartIndex - segment.start) * DAY_CELL_WIDTH}px`,
                  width: `${barDays * DAY_CELL_WIDTH - 2}px`,
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
});

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
  const rangeStart = dateRange?.start.getTime() ?? null;
  const rangeEnd = dateRange?.end.getTime() ?? null;

  // 日付配列を生成（表示期間が変わったときだけ作り直す）
  const dates = useMemo(() => {
    if (rangeStart === null || rangeEnd === null) return [];
    return generateDateRange(new Date(rangeStart), new Date(rangeEnd));
  }, [rangeStart, rangeEnd]);

  // 日付ごとの区分（日付ごとに一度だけ判定し、ヘッダーと全行で共有する）
  const days = useMemo(() => dates.map((date) => toDisplayDay(date, holidays)), [dates, holidays]);

  // 年月グループを生成
  const monthGroups = useMemo(() => generateMonthGroups(dates), [dates]);

  // 日付キー → インデックスマップ
  const dateIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((day, index) => {
      map.set(day.key, index);
    });
    return map;
  }, [days]);

  // 全行で共有するタイムラインのセルの背景の規則（表示期間と祝日が変わったときだけ作り直す）
  // 区間ごとの規則は、その区間の日付だけから背景を作る（区間の先頭を原点に、土日の 7 日周期の
  // 並びと祝日の層の位置を区間の先頭からの日数で置く）
  const timelineId = useId();
  const segments = useMemo(() => splitTimelineSegments(days.length), [days.length]);
  const timelineRule = useMemo(
    () =>
      segments
        .map(
          (segment) =>
            `[data-gantt-timeline="${timelineId}"][data-gantt-segment-start="${segment.start}"] { ${buildTimelineBackgroundDeclarations(
              days.slice(segment.start, segment.start + segment.length)
            )} }`
        )
        .join('\n'),
    [timelineId, days, segments]
  );

  // ヘッダー（表示期間と祝日が変わったときだけ作り直す）
  const header = useMemo(
    () => (
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
          {days.map(({ date, key, dayType }) => (
            <th
              key={key}
              data-testid={`gantt-date-${key}`}
              data-day-type={dayType}
              style={{
                ...styles.dayHeaderCell,
                backgroundColor: dayTypeColors[dayType],
              }}
            >
              {date.getDate()}
            </th>
          ))}
        </tr>
      </thead>
    ),
    [days, monthGroups]
  );

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
    <>
      {/* 背景の規則はパネルの外に置く（パネルの文字列に規則の文字が混ざらないように） */}
      <style>{timelineRule}</style>
      <div data-testid="gantt-chart-panel" style={styles.container}>
        <table style={styles.table}>
          {header}

          <tbody>
            {items.map((item) => {
              // バー位置の計算
              let barStartIndex: number | null = null;
              let barDays: number | null = null;

              if (item.startDate && item.endDate) {
                const startIdx = dateIndexMap.get(item.startDate);
                const endIdx = dateIndexMap.get(item.endDate);
                if (startIdx !== undefined && endIdx !== undefined) {
                  barStartIndex = startIdx;
                  barDays = endIdx - startIdx + 1;
                }
              }

              return (
                <GanttRow
                  key={item.id}
                  item={item}
                  segments={segments}
                  barStartIndex={barStartIndex}
                  barDays={barDays}
                  timelineId={timelineId}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
