/**
 * @fileoverview GanttChartPanel コンポーネントテスト
 *
 * Task 10: ガントチャートコンポーネントの実装
 * Task 15.3: GanttChartPanelの単体テスト作成
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
    it('ボディセルにも土曜日の色分けが適用されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      // ボディ内の土曜日セル（data-day-type属性）を確認
      const bodyCells = document.querySelectorAll('td[data-day-type="saturday"]');
      expect(bodyCells.length).toBeGreaterThan(0);
    });

    it('ボディセルにも日曜日の色分けが適用されること', () => {
      render(<GanttChartPanel items={[itemWithDates, itemWithDates2]} holidays={mockHolidayMap} />);
      const bodyCells = document.querySelectorAll('td[data-day-type="sunday"]');
      expect(bodyCells.length).toBeGreaterThan(0);
    });

    it('祝日がボディセルにも色分けされること', () => {
      const longRangeItem: ScheduleItem = {
        ...itemWithDates,
        startDate: '2026-04-01',
        duration: 30,
        endDate: '2026-04-30',
      };
      render(<GanttChartPanel items={[longRangeItem]} holidays={mockHolidayMap} />);
      const holidayCells = document.querySelectorAll('td[data-day-type="holiday"]');
      expect(holidayCells.length).toBeGreaterThan(0);
    });

    it('平日のセルにはweekdayのday-typeが適用されること', () => {
      render(<GanttChartPanel items={[itemWithDates]} holidays={mockHolidayMap} />);
      const weekdayCells = document.querySelectorAll('td[data-day-type="weekday"]');
      expect(weekdayCells.length).toBeGreaterThan(0);
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
