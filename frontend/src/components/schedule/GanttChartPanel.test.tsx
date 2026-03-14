/**
 * @fileoverview GanttChartPanel コンポーネントテスト
 *
 * Task 10: ガントチャートコンポーネントの実装
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
});
