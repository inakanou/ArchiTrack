/**
 * @fileoverview GanttChartPanel コンポーネントテスト
 *
 * Task 10: ガントチャートコンポーネントの実装
 * Task 15.3: GanttChartPanelの単体テスト作成
 * Task 21.1: 200 項目の描画の性能（本体の行のセルの削減・日付ごとの区分の一度だけの計算）
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
 * @module components/schedule/GanttChartPanel.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GanttChartPanel } from './GanttChartPanel';
import type { ScheduleItem } from '../../hooks/useScheduleState';
import type { HolidayMap } from '../../hooks/useHolidayCalendar';

// ============================================================================
// テストデータ
// ============================================================================

/** 土曜: 2026-04-04, 日曜: 2026-04-05, 祝日（昭和の日）: 2026-04-29 */

const mockHolidayMap: HolidayMap = {
  isHoliday(date: Date): boolean {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return key === '2026-04-29'; // 昭和の日
  },
  isSaturday(date: Date): boolean {
    return date.getDay() === 6;
  },
  isSunday(date: Date): boolean {
    return date.getDay() === 0;
  },
  getHolidayName(date: Date): string | null {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return key === '2026-04-29' ? '昭和の日' : null;
  },
};

/** 着工日・日数が設定された項目 */
const itemWithDates: ScheduleItem = {
  id: 'item-1',
  sourceType: 'QUANTITY_TABLE',
  sourceQuantityItemId: 'qi-1',
  itemName: '基礎工事',
  labelText: '基礎',
  detailText: 'コンクリート打設',
  startDate: '2026-04-01',
  duration: 5,
  endDate: '2026-04-05',
  displayOrder: 0,
  isExportTarget: true,
};

/** 着工日・日数が設定された2番目の項目 */
const itemWithDates2: ScheduleItem = {
  id: 'item-2',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '鉄骨工事',
  labelText: '鉄骨',
  detailText: '鉄骨組立',
  startDate: '2026-04-03',
  duration: 7,
  endDate: '2026-04-09',
  displayOrder: 1,
  isExportTarget: true,
};

/** 着工日・日数なしの項目（バー非表示） */
const itemWithoutDates: ScheduleItem = {
  id: 'item-3',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '仮設工事',
  labelText: '',
  detailText: '',
  startDate: null,
  duration: null,
  endDate: null,
  displayOrder: 2,
  isExportTarget: true,
};

/** 出力対象OFFの項目（ガントチャートには表示される） */
const itemExportOff: ScheduleItem = {
  id: 'item-4',
  sourceType: 'MANUAL',
  sourceQuantityItemId: null,
  itemName: '清掃工事',
  labelText: '清掃',
  detailText: '仕上げ清掃',
  startDate: '2026-04-02',
  duration: 3,
  endDate: '2026-04-04',
  displayOrder: 3,
  isExportTarget: false,
};

// ============================================================================
// タイムラインの背景の読み取り（Task 21.1）
// ============================================================================

/** 日種別の色（jsdom は style の色を rgb() へ正規化して返す） */
const COLOR = {
  weekday: 'rgb(255, 255, 255)',
  saturday: 'rgb(224, 242, 254)',
  sunday: 'rgb(254, 226, 226)',
  holiday: 'rgb(254, 249, 195)',
} as const;

const DAY_WIDTH = 32;

/** 括弧の外のカンマで分ける */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** gradient の層の位置 x（層の原点から）の色。透明なら null */
function layerColorAt(image: string, x: number): string | null {
  const solid = /^linear-gradient\((rgb\([^)]*\)), (rgb\([^)]*\))\)$/.exec(image);
  if (solid) return solid[1] === solid[2] ? (solid[1] ?? null) : null;
  const repeating = /^repeating-linear-gradient\(to right, (.*)\)$/.exec(image);
  if (!repeating?.[1]) throw new Error(`想定外の背景の層: ${image}`);
  const stops = splitTopLevel(repeating[1]).map((stop) => {
    const m = /^(.*) (-?[\d.]+)px (-?[\d.]+)px$/.exec(stop);
    if (!m?.[1] || m[2] === undefined || m[3] === undefined) {
      throw new Error(`想定外の色の区間: ${stop}`);
    }
    return { color: m[1], from: Number(m[2]), to: Number(m[3]) };
  });
  const period = stops[stops.length - 1]?.to ?? 0;
  const local = ((x % period) + period) % period;
  const hit = stops.find((stop) => stop.from <= local && local < stop.to);
  return hit && hit.color !== 'transparent' ? hit.color : null;
}

/**
 * タイムラインのセルの、表示期間の先頭から index 日目の中央の色を computed style から読む
 */
function timelineColorAt(cell: HTMLElement, index: number): string {
  const style = getComputedStyle(cell);
  const images = splitTopLevel(style.backgroundImage);
  const positions = splitTopLevel(style.backgroundPosition);
  const sizes = splitTopLevel(style.backgroundSize);
  const repeats = splitTopLevel(style.backgroundRepeat);
  const x = index * DAY_WIDTH + DAY_WIDTH / 2;
  for (let i = 0; i < images.length; i++) {
    const image = images[i] ?? '';
    const originX = parseFloat(positions[i] ?? '0');
    const width = parseFloat(sizes[i] ?? 'auto');
    const local = x - originX;
    if (repeats[i] === 'no-repeat' && (local < 0 || local >= width)) continue;
    const color = layerColorAt(image, local);
    if (color) return color;
  }
  return style.backgroundColor;
}

/**
 * 行の本体で、表示期間の先頭から index 日目の色を読む。タイムラインは colspan の上限（1000）を
 * 超えないよう複数のセルに分かれるため、index を含むセルを data-gantt-segment-start と colSpan で探す
 */
function rowColorAt(row: HTMLElement, index: number): string {
  const cells = Array.from(
    row.querySelectorAll<HTMLTableCellElement>('td[data-gantt-segment-start]')
  );
  const cell = cells.find((td) => {
    const start = Number(td.getAttribute('data-gantt-segment-start'));
    return start <= index && index < start + td.colSpan;
  });
  if (!cell) throw new Error(`${index} 日目を含むタイムラインのセルがありません`);
  return timelineColorAt(cell, index - Number(cell.getAttribute('data-gantt-segment-start')));
}

// ============================================================================
// テスト
// ============================================================================

describe('GanttChartPanel', () => {
  describe('基本レンダリング', () => {
    it('コンポーネントが正常にレンダリングされること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-chart-panel')).toBeInTheDocument();
    });

    it('項目がない場合にメッセージを表示すること', () => {
      render(<GanttChartPanel items={[]} holidays={mockHolidayMap} />);
      expect(screen.getByText('表示する項目がありません')).toBeInTheDocument();
    });

    it('着工日・日数が設定された項目がない場合にメッセージを表示すること', () => {
      render(<GanttChartPanel items={[itemWithoutDates]} holidays={mockHolidayMap} />);
      expect(screen.getByText('着工日と日数が設定された項目がありません')).toBeInTheDocument();
    });
  });

  describe('REQ-10.2: ラベル文字の左列表示', () => {
    it('各項目のラベル文字が左列に表示されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-label-item-1')).toHaveTextContent('基礎');
      expect(screen.getByTestId('gantt-label-item-2')).toHaveTextContent('鉄骨');
    });

    it('ラベル文字が空の場合も行が表示されること', () => {
      const itemNoLabel: ScheduleItem = {
        ...itemWithDates,
        id: 'item-no-label',
        labelText: '',
      };
      render(<GanttChartPanel items={[itemNoLabel]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-label-item-no-label')).toBeInTheDocument();
    });
  });

  describe('REQ-11.2: 詳細文字のバー上表示', () => {
    it('着工日・日数が設定された項目のバー上に詳細文字が表示されること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-bar-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-detail-item-1')).toHaveTextContent('コンクリート打設');
    });
  });

  describe('REQ-6.5: 表示期間自動調整', () => {
    it('全項目の着工日〜完了日範囲から表示期間が自動算出されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      // 最早着工日: 2026-04-01、最遅完了日: 2026-04-09
      // 日付ヘッダーセルに4/1と4/9が含まれていること
      expect(screen.getByTestId('gantt-date-2026-04-01')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-09')).toBeInTheDocument();
    });
  });

  describe('REQ-6.2/6.3: 土曜日・日曜日色分け', () => {
    it('土曜日のヘッダーセルに土曜日スタイルが適用されること', () => {
      // 2026-04-04 は土曜日
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      const saturdayCell = screen.getByTestId('gantt-date-2026-04-04');
      expect(saturdayCell).toHaveAttribute('data-day-type', 'saturday');
    });

    it('日曜日のヘッダーセルに日曜日スタイルが適用されること', () => {
      // 2026-04-05 は日曜日
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      const sundayCell = screen.getByTestId('gantt-date-2026-04-05');
      expect(sundayCell).toHaveAttribute('data-day-type', 'sunday');
    });
  });

  describe('REQ-6.4: 祝日色分け', () => {
    it('祝日のヘッダーセルに祝日スタイルが適用されること', () => {
      // 2026-04-29は昭和の日（祝日）
      const longRangeItem: ScheduleItem = {
        ...itemWithDates,
        startDate: '2026-04-01',
        duration: 30,
        endDate: '2026-04-30',
      };
      render(<GanttChartPanel items={[longRangeItem]} holidays={mockHolidayMap} />);
      const holidayCell = screen.getByTestId('gantt-date-2026-04-29');
      expect(holidayCell).toHaveAttribute('data-day-type', 'holiday');
    });
  });

  describe('バー描画', () => {
    it('着工日・日数が設定された項目にバーが描画されること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const bar = screen.getByTestId('gantt-bar-item-1');
      expect(bar).toBeInTheDocument();
    });

    it('着工日・日数が未設定の項目にはバーが描画されないこと', () => {
      render(
        <GanttChartPanel items={[itemWithDates, itemWithoutDates]} holidays={mockHolidayMap} />
      );
      expect(screen.queryByTestId('gantt-bar-item-3')).not.toBeInTheDocument();
    });
  });

  describe('REQ-9.6: チェックOFF項目のガントチャート表示', () => {
    it('出力対象チェックがOFFの項目もガントチャート上に表示されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemExportOff]} holidays={mockHolidayMap} />);
      // 出力対象OFFの項目もラベル・バーが表示される
      expect(screen.getByTestId('gantt-label-item-4')).toHaveTextContent('清掃');
      expect(screen.getByTestId('gantt-bar-item-4')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-detail-item-4')).toHaveTextContent('仕上げ清掃');
    });
  });

  describe('REQ-10.3/REQ-11.3: リアルタイム更新', () => {
    it('propsの変更に応じてラベル文字が更新されること', () => {
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />
      );
      expect(screen.getByTestId('gantt-label-item-1')).toHaveTextContent('基礎');

      // ラベルを変更
      const updatedItem: ScheduleItem = { ...itemWithDates, labelText: '基礎改修' };
      rerender(<GanttChartPanel items={[updatedItem]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-label-item-1')).toHaveTextContent('基礎改修');
    });

    it('propsの変更に応じて詳細文字が更新されること', () => {
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />
      );
      expect(screen.getByTestId('gantt-detail-item-1')).toHaveTextContent('コンクリート打設');

      // 詳細を変更
      const updatedItem: ScheduleItem = { ...itemWithDates, detailText: '鉄筋組立' };
      rerender(<GanttChartPanel items={[updatedItem]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-detail-item-1')).toHaveTextContent('鉄筋組立');
    });
  });

  describe('REQ-6.1/6.6: フロントエンド完結のリアルタイム更新', () => {
    it('着工日変更時にバー位置が更新されること', () => {
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />
      );

      // 着工日を変更
      const updatedItem: ScheduleItem = {
        ...itemWithDates,
        startDate: '2026-04-02',
        endDate: '2026-04-06',
      };
      rerender(<GanttChartPanel items={[updatedItem]} holidays={mockHolidayMap} />);
      // バーが再描画される（test-idで存在確認）
      expect(screen.getByTestId('gantt-bar-item-1')).toBeInTheDocument();
    });

    it('日数変更時にバー幅が更新されること', () => {
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />
      );

      // 日数を変更
      const updatedItem: ScheduleItem = {
        ...itemWithDates,
        duration: 10,
        endDate: '2026-04-10',
      };
      rerender(<GanttChartPanel items={[updatedItem]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-bar-item-1')).toBeInTheDocument();
    });
  });

  describe('日付ヘッダー', () => {
    it('年月ヘッダーが表示されること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      expect(screen.getByText('2026年4月')).toBeInTheDocument();
    });

    it('日ヘッダーに日付が表示されること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      // 5日間分の日付ヘッダー
      expect(screen.getByTestId('gantt-date-2026-04-01')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-02')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-03')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-04')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-05')).toBeInTheDocument();
    });
  });

  describe('複数項目のレイアウト', () => {
    it('複数項目が行として表示されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-row-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-row-item-2')).toBeInTheDocument();
    });
  });

  describe('平日の表示', () => {
    it('平日のヘッダーセルにweekdayのday-typeが適用されること', () => {
      // 2026-04-01 は水曜日
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const weekdayCell = screen.getByTestId('gantt-date-2026-04-01');
      expect(weekdayCell).toHaveAttribute('data-day-type', 'weekday');
    });
  });

  // ==========================================================================
  // Task 15.3: バー位置の描画テスト（追加）
  // ==========================================================================
  describe('Task 15.3: バー位置の描画テスト', () => {
    it('バーの幅が日数に基づいて正しく設定されること', () => {
      // itemWithDates: startDate=2026-04-01, duration=5, endDate=2026-04-05
      // バー幅 = (endIdx - startIdx + 1) * DAY_CELL_WIDTH - 2
      // = (4 - 0 + 1) * 32 - 2 = 158px
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const bar = screen.getByTestId('gantt-bar-item-1');
      expect(bar.style.width).toBe('158px');
    });

    it('複数項目のバーがそれぞれ正しい幅で描画されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);

      // item-1: 5日間 -> (5) * 32 - 2 = 158px
      const bar1 = screen.getByTestId('gantt-bar-item-1');
      expect(bar1.style.width).toBe('158px');

      // item-2: 7日間 -> (7) * 32 - 2 = 222px
      const bar2 = screen.getByTestId('gantt-bar-item-2');
      expect(bar2.style.width).toBe('222px');
    });

    it('バーの左位置が0（セル内の先頭）から開始されること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const bar = screen.getByTestId('gantt-bar-item-1');
      expect(bar.style.left).toBe('0px');
    });

    it('日数が1の項目でもバーが描画されること', () => {
      const singleDayItem: ScheduleItem = {
        ...itemWithDates,
        id: 'item-single',
        duration: 1,
        endDate: '2026-04-01',
      };
      render(<GanttChartPanel items={[singleDayItem]} holidays={mockHolidayMap} />);
      const bar = screen.getByTestId('gantt-bar-item-single');
      // 1日分: (1) * 32 - 2 = 30px
      expect(bar.style.width).toBe('30px');
    });
  });

  // ==========================================================================
  // Task 15.3: 土日祝の色分け表示テスト（追加）
  // ==========================================================================
  describe('Task 15.3: 土日祝の色分け表示テスト（詳細）', () => {
    // Task 21.1 で本体の行は日付ごとのセルを持たず、行ごとに1つのタイムラインのセルの背景
    // （gradient の層の重ね合わせ）で土日祝を色分けする。日付 i の色は、背景の層を上から見て
    // 位置 i × 32px + 16px（日付の中央）で最初に透明でない色、無ければ背景色で決まる。
    // timelineColorAt はその規則で computed style から日付ごとの色を読み取る
    it('ボディセルにも土曜日の色分けが適用されること', () => {
      // 表示期間 2026-04-01〜04-09 の 4/4（先頭から 3 日目）は土曜日
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      for (const id of ['item-1', 'item-2']) {
        const timeline = screen.getByTestId(`gantt-timeline-${id}`);
        expect(timelineColorAt(timeline, 3)).toBe(COLOR.saturday);
      }
    });

    it('ボディセルにも日曜日の色分けが適用されること', () => {
      // 4/5（先頭から 4 日目）は日曜日
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      const timeline = screen.getByTestId('gantt-timeline-item-1');
      expect(timelineColorAt(timeline, 4)).toBe(COLOR.sunday);
    });

    it('祝日がボディセルにも色分けされること', () => {
      const longRangeItem: ScheduleItem = {
        ...itemWithDates,
        startDate: '2026-04-01',
        duration: 30,
        endDate: '2026-04-30',
      };
      render(<GanttChartPanel items={[longRangeItem]} holidays={mockHolidayMap} />);
      // 4/29（先頭から 28 日目）は祝日（昭和の日）。前後の 4/28・4/30 は平日
      const timeline = screen.getByTestId('gantt-timeline-item-1');
      expect(timelineColorAt(timeline, 28)).toBe(COLOR.holiday);
      expect(timelineColorAt(timeline, 27)).toBe(COLOR.weekday);
      expect(timelineColorAt(timeline, 29)).toBe(COLOR.weekday);
    });

    it('平日のセルにはweekdayのday-typeが適用されること', () => {
      // 4/1〜4/3（水〜金）は平日
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const timeline = screen.getByTestId('gantt-timeline-item-1');
      for (const index of [0, 1, 2]) {
        expect(timelineColorAt(timeline, index)).toBe(COLOR.weekday);
      }
    });

    it('土日に重なる祝日は祝日の色で表示されること（Task 21.1）', () => {
      // 4/5（日曜）と 4/11・4/12（土日）を祝日とする祝日マップ
      const weekendHolidays = new Set(['2026-04-05', '2026-04-11', '2026-04-12']);
      const keyOf = (date: Date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const map: HolidayMap = {
        ...mockHolidayMap,
        isHoliday: (date) => weekendHolidays.has(keyOf(date)),
      };
      const item: ScheduleItem = { ...itemWithDates, duration: 14, endDate: '2026-04-14' };
      render(<GanttChartPanel items={[item]} holidays={map} />);
      const timeline = screen.getByTestId('gantt-timeline-item-1');
      expect(screen.getByTestId('gantt-date-2026-04-05')).toHaveAttribute(
        'data-day-type',
        'holiday'
      );
      expect(timelineColorAt(timeline, 3)).toBe(COLOR.saturday); // 4/4
      expect(timelineColorAt(timeline, 4)).toBe(COLOR.holiday); // 4/5
      expect(timelineColorAt(timeline, 10)).toBe(COLOR.holiday); // 4/11
      expect(timelineColorAt(timeline, 11)).toBe(COLOR.holiday); // 4/12
      expect(timelineColorAt(timeline, 12)).toBe(COLOR.weekday); // 4/13
    });

    it('全ての日付でボディの色がヘッダーの日付の色と一致すること（Task 21.1）', () => {
      // 2026-04-01〜2026-06-30（祝日 4/29 を含む 91 日）
      const longRangeItem: ScheduleItem = {
        ...itemWithDates,
        startDate: '2026-04-01',
        duration: 91,
        endDate: '2026-06-30',
      };
      render(<GanttChartPanel items={[longRangeItem, itemWithDates2]} holidays={mockHolidayMap} />);
      const headers = screen.getAllByTestId(/^gantt-date-/);
      expect(headers).toHaveLength(91);
      for (const id of ['item-1', 'item-2']) {
        const timeline = screen.getByTestId(`gantt-timeline-${id}`);
        headers.forEach((header, index) => {
          const dayType = header.getAttribute('data-day-type') as keyof typeof COLOR;
          expect(header.style.backgroundColor).toBe(COLOR[dayType]);
          expect(timelineColorAt(timeline, index), header.getAttribute('data-testid') ?? '').toBe(
            COLOR[dayType]
          );
        });
      }
    });

    it('本体の各行は日付の数によらずラベルとタイムラインの2つのセルだけを持つこと（Task 21.1）', () => {
      const longRangeItem: ScheduleItem = {
        ...itemWithDates,
        startDate: '2026-04-01',
        duration: 30,
        endDate: '2026-04-30',
      };
      render(<GanttChartPanel items={[longRangeItem, itemWithDates2]} holidays={mockHolidayMap} />);
      for (const id of ['item-1', 'item-2']) {
        const row = screen.getByTestId(`gantt-row-${id}`);
        expect(row.querySelectorAll('td')).toHaveLength(2);
        expect(screen.getByTestId(`gantt-timeline-${id}`)).toHaveAttribute('colspan', '30');
      }
    });
  });

  // ==========================================================================
  // Task 21.1（レビュー是正）: colspan の上限（1000）を超える表示期間
  // ==========================================================================
  describe('Task 21.1: 1000 日を超える表示期間', () => {
    const keyOf = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // 1000 日目より後にも祝日を置く（2029-02-12 は月曜、2029-02-23 は金曜）
    const longHolidays = new Set(['2026-04-29', '2029-02-12', '2029-02-23']);
    const longHolidayMap: HolidayMap = {
      ...mockHolidayMap,
      isHoliday: (date) => longHolidays.has(keyOf(date)),
    };
    /** 2026-04-01 から 1100 日（2029-04-04 まで） */
    const longItem: ScheduleItem = {
      ...itemWithDates,
      id: 'long',
      startDate: '2026-04-01',
      duration: 1100,
      endDate: '2029-04-04',
    };
    /** 1050 日目（2029-02-14）から 10 日 */
    const lateItem: ScheduleItem = {
      ...itemWithDates,
      id: 'late',
      startDate: '2029-02-14',
      duration: 10,
      endDate: '2029-02-23',
    };

    it('タイムラインのセルはどれも colSpan が 1000 以下で、合計が表示期間の日数と一致すること', () => {
      render(<GanttChartPanel items={[longItem, lateItem]} holidays={longHolidayMap} />);
      expect(screen.getAllByTestId(/^gantt-date-/)).toHaveLength(1100);
      for (const id of ['long', 'late']) {
        const cells = Array.from(
          screen
            .getByTestId(`gantt-row-${id}`)
            .querySelectorAll<HTMLTableCellElement>('td[data-gantt-segment-start]')
        );
        expect(cells.length).toBeGreaterThan(1);
        for (const cell of cells) expect(cell.colSpan).toBeLessThanOrEqual(1000);
        expect(cells.reduce((sum, cell) => sum + cell.colSpan, 0)).toBe(1100);
      }
    });

    it('1000 日目より後も、全ての日付でボディの色がヘッダーの日付の色と一致すること', () => {
      render(<GanttChartPanel items={[longItem, lateItem]} holidays={longHolidayMap} />);
      const headers = screen.getAllByTestId(/^gantt-date-/);
      expect(screen.getByTestId('gantt-date-2029-02-23')).toHaveAttribute(
        'data-day-type',
        'holiday'
      );
      for (const id of ['long', 'late']) {
        const row = screen.getByTestId(`gantt-row-${id}`);
        headers.forEach((header, index) => {
          const dayType = header.getAttribute('data-day-type') as keyof typeof COLOR;
          expect(rowColorAt(row, index), header.getAttribute('data-testid') ?? '').toBe(
            COLOR[dayType]
          );
        });
      }
    });

    it('1000 日目より後に始まるバーは、その日を含むセルの中の位置から描かれること', () => {
      render(<GanttChartPanel items={[longItem, lateItem]} holidays={longHolidayMap} />);
      const bar = screen.getByTestId('gantt-bar-late');
      const cell = bar.closest('td');
      const start = Number(cell?.getAttribute('data-gantt-segment-start'));
      expect(start).toBeLessThanOrEqual(1050);
      expect(start + (cell?.colSpan ?? 0)).toBeGreaterThan(1050);
      expect(bar.style.left).toBe(`${(1050 - start) * 32}px`);
      expect(bar.style.width).toBe('318px');
      // 全期間のバーは先頭のセルから始まり、幅は日数分
      expect(screen.getByTestId('gantt-bar-long').style.width).toBe(`${1100 * 32 - 2}px`);
      expect(screen.getByTestId('gantt-bar-long').style.left).toBe('0px');
    });
  });

  // ==========================================================================
  // Task 21.1: 描画の性能（日付ごとの区分の一度だけの計算・バーの位置）
  // ==========================================================================
  describe('Task 21.1: 日付ごとの区分の計算とバーの位置', () => {
    function countingHolidayMap(): { map: HolidayMap; calls: () => number } {
      let count = 0;
      return {
        map: {
          ...mockHolidayMap,
          isHoliday(date: Date): boolean {
            count++;
            return mockHolidayMap.isHoliday(date);
          },
        },
        calls: () => count,
      };
    }

    it('日付ごとの区分は行の数によらず日付ごとに一度だけ判定すること', () => {
      const { map, calls } = countingHolidayMap();
      // 表示期間 4/1〜4/9 の 9 日、3 行
      render(
        <GanttChartPanel items={[itemWithDates, itemWithDates2, itemExportOff]} holidays={map} />
      );
      expect(calls()).toBe(9);
    });

    it('表示期間が変わらない入力では日付ごとの区分を判定し直さないこと', () => {
      const { map, calls } = countingHolidayMap();
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={map} />
      );
      const before = calls();
      // item-1 の日数を 5 → 3 に変える（表示期間は item-2 により 4/1〜4/9 のまま）
      const updated: ScheduleItem = { ...itemWithDates, duration: 3, endDate: '2026-04-03' };
      rerender(<GanttChartPanel items={[updated, itemWithDates2]} holidays={map} />);
      expect(calls()).toBe(before);
      expect(screen.getByTestId('gantt-bar-item-1').style.width).toBe('94px');
    });

    it('バーは表示期間の先頭からの日数 × 32px の位置から始まること', () => {
      // item-2 の着工日 4/3 は表示期間の先頭 4/1 から 2 日目
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-bar-item-1').style.left).toBe('0px');
      expect(screen.getByTestId('gantt-bar-item-2').style.left).toBe('64px');
      expect(screen.getByTestId('gantt-bar-item-2').style.width).toBe('222px');
    });

    it('着工日を変えるとバーの位置が移ること', () => {
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />
      );
      const moved: ScheduleItem = {
        ...itemWithDates2,
        startDate: '2026-04-02',
        endDate: '2026-04-08',
      };
      rerender(<GanttChartPanel items={[itemWithDates, moved]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-bar-item-2').style.left).toBe('32px');
    });
  });

  // ==========================================================================
  // Task 15.3: ラベル文字・詳細文字の表示テスト（追加）
  // ==========================================================================
  describe('Task 15.3: ラベル文字・詳細文字の追加テスト', () => {
    it('詳細文字が空の場合、バー上にdetail要素が表示されないこと', () => {
      const itemNoDetail: ScheduleItem = {
        ...itemWithDates,
        id: 'item-no-detail',
        detailText: '',
      };
      render(<GanttChartPanel items={[itemNoDetail]} holidays={mockHolidayMap} />);
      expect(screen.getByTestId('gantt-bar-item-no-detail')).toBeInTheDocument();
      expect(screen.queryByTestId('gantt-detail-item-no-detail')).not.toBeInTheDocument();
    });

    it('長いラベル文字がセル幅に収まること（overflow hidden）', () => {
      const itemLongLabel: ScheduleItem = {
        ...itemWithDates,
        id: 'item-long-label',
        labelText: 'とても長いラベル文字が入力された場合のテスト表示確認用テキスト',
      };
      render(<GanttChartPanel items={[itemLongLabel]} holidays={mockHolidayMap} />);
      const labelCell = screen.getByTestId('gantt-label-item-long-label');
      expect(labelCell).toHaveTextContent(
        'とても長いラベル文字が入力された場合のテスト表示確認用テキスト'
      );
      // title属性にもラベル文字がセットされている
      expect(labelCell).toHaveAttribute(
        'title',
        'とても長いラベル文字が入力された場合のテスト表示確認用テキスト'
      );
    });

    it('ラベル文字のtitle属性にラベル文字が設定されていること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const labelCell = screen.getByTestId('gantt-label-item-1');
      expect(labelCell).toHaveAttribute('title', '基礎');
    });
  });

  // ==========================================================================
  // Task 15.3: 表示期間の自動調整テスト（追加）
  // ==========================================================================
  describe('Task 15.3: 表示期間の自動調整テスト（詳細）', () => {
    it('単一項目の場合、その項目の着工日〜完了日が表示範囲になること', () => {
      // itemWithDates: 2026-04-01 ~ 2026-04-05
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);

      // 表示範囲内の日付が全て存在
      for (let d = 1; d <= 5; d++) {
        const dateStr = `2026-04-${String(d).padStart(2, '0')}`;
        expect(screen.getByTestId(`gantt-date-${dateStr}`)).toBeInTheDocument();
      }

      // 表示範囲外の日付は存在しない
      expect(screen.queryByTestId('gantt-date-2026-03-31')).not.toBeInTheDocument();
      expect(screen.queryByTestId('gantt-date-2026-04-06')).not.toBeInTheDocument();
    });

    it('複数項目の場合、最早着工日〜最遅完了日が表示範囲になること', () => {
      // itemWithDates: 2026-04-01 ~ 2026-04-05
      // itemWithDates2: 2026-04-03 ~ 2026-04-09
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);

      // 最早着工日（4/1）から最遅完了日（4/9）まで表示
      expect(screen.getByTestId('gantt-date-2026-04-01')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-09')).toBeInTheDocument();

      // 範囲外は非表示
      expect(screen.queryByTestId('gantt-date-2026-03-31')).not.toBeInTheDocument();
      expect(screen.queryByTestId('gantt-date-2026-04-10')).not.toBeInTheDocument();
    });

    it('着工日・日数なしの項目は表示期間の算出に影響しないこと', () => {
      // itemWithDates: 2026-04-01 ~ 2026-04-05
      // itemWithoutDates: startDate=null, endDate=null
      render(
        <GanttChartPanel items={[itemWithDates, itemWithoutDates]} holidays={mockHolidayMap} />
      );

      // 表示範囲はitemWithDatesのみに基づく
      expect(screen.getByTestId('gantt-date-2026-04-01')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-date-2026-04-05')).toBeInTheDocument();
      expect(screen.queryByTestId('gantt-date-2026-04-06')).not.toBeInTheDocument();
    });

    it('月をまたぐ表示期間で年月ヘッダーが正しく分割されること', () => {
      const crossMonthItem: ScheduleItem = {
        ...itemWithDates,
        id: 'cross-month',
        startDate: '2026-03-30',
        duration: 5,
        endDate: '2026-04-03',
      };
      render(<GanttChartPanel items={[crossMonthItem]} holidays={mockHolidayMap} />);

      // 3月と4月の両方のヘッダーが表示される
      expect(screen.getByText('2026年3月')).toBeInTheDocument();
      expect(screen.getByText('2026年4月')).toBeInTheDocument();
    });

    it('項目追加により表示期間が拡張されること', () => {
      const { rerender } = render(
        <GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />
      );

      // 初期: 4/1 ~ 4/5
      expect(screen.queryByTestId('gantt-date-2026-04-09')).not.toBeInTheDocument();

      // 項目追加後: 4/1 ~ 4/9
      rerender(
        <GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />
      );
      expect(screen.getByTestId('gantt-date-2026-04-09')).toBeInTheDocument();
    });
  });
});
