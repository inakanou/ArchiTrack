/**
 * @fileoverview useHolidayCalendar フック - 祝日カレンダー管理
 *
 * Task 6.3: useHolidayCalendar フックを実装する
 *
 * 指定期間の祝日データを取得し、ガントチャートの色分け判定に使用する。
 * @holiday-jp/holiday_jpライブラリを使用して日本の祝日データを取得する。
 *
 * Requirements (construction-schedule):
 * - REQ-6.2: 土曜日色分け
 * - REQ-6.3: 日曜日色分け
 * - REQ-6.4: 祝日色分け
 *
 * @module hooks/useHolidayCalendar
 */

import { useMemo } from 'react';
import holiday_jp from '@holiday-jp/holiday_jp';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 祝日マップインターフェース
 * ガントチャートの色分け判定に使用する
 */
export interface HolidayMap {
  /** 指定日が祝日かどうかを判定する */
  isHoliday(date: Date): boolean;
  /** 指定日が土曜日かどうかを判定する */
  isSaturday(date: Date): boolean;
  /** 指定日が日曜日かどうかを判定する */
  isSunday(date: Date): boolean;
  /** 指定日の祝日名を取得する（祝日でない場合はnull） */
  getHolidayName(date: Date): string | null;
}

/**
 * useHolidayCalendar フックの返り値
 */
export interface UseHolidayCalendarReturn {
  holidays: HolidayMap;
  isLoading: boolean;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * DateをYYYY-MM-DD形式の文字列に変換する
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// フック実装
// ============================================================================

/**
 * 祝日カレンダー管理フック
 *
 * 指定期間の祝日データを取得し、HolidayMapを生成する。
 * useMemoで祝日データをメモ化し、表示期間変更時のみ再計算する。
 *
 * @param startDate - 表示期間の開始日
 * @param endDate - 表示期間の終了日
 * @returns 祝日マップとローディング状態
 */
export function useHolidayCalendar(startDate: Date, endDate: Date): UseHolidayCalendarReturn {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const holidays: HolidayMap = useMemo(() => {
    // @holiday-jp/holiday_jpのbetween関数で指定期間の祝日を取得
    const holidayList = holiday_jp.between(new Date(startTime), new Date(endTime));

    // 祝日をMapに変換（高速な日付ベースのルックアップ用）
    const holidayDateMap = new Map<string, string>();
    for (const h of holidayList) {
      const dateKey = formatDateKey(h.date instanceof Date ? h.date : new Date(h.date));
      holidayDateMap.set(dateKey, h.name);
    }

    return {
      isHoliday(date: Date): boolean {
        const key = formatDateKey(date);
        return holidayDateMap.has(key);
      },

      isSaturday(date: Date): boolean {
        return date.getDay() === 6;
      },

      isSunday(date: Date): boolean {
        return date.getDay() === 0;
      },

      getHolidayName(date: Date): string | null {
        const key = formatDateKey(date);
        return holidayDateMap.get(key) ?? null;
      },
    };
  }, [startTime, endTime]);

  return {
    holidays,
    isLoading: false,
  };
}
