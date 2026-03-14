/**
 * @vitest-environment jsdom
 */

/**
 * @fileoverview useHolidayCalendar フックのユニットテスト
 *
 * Task 6.3: useHolidayCalendar フックを実装する
 * Task 15.2: useHolidayCalendarフックの単体テスト作成
 *
 * Requirements:
 * - REQ-6.2: 土曜日色分け
 * - REQ-6.3: 日曜日色分け
 * - REQ-6.4: 祝日色分け
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHolidayCalendar } from '../../hooks/useHolidayCalendar';

describe('useHolidayCalendar', () => {
  // ==========================================================================
  // 祝日判定 (REQ-6.4)
  // ==========================================================================
  describe('祝日判定', () => {
    it('元日を祝日として判定する', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-01-01'))).toBe(true);
    });

    it('平日を祝日でないと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-06 は月曜日で祝日でもない
      expect(result.current.holidays.isHoliday(new Date('2026-04-06'))).toBe(false);
    });

    it('祝日名を取得できる', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.getHolidayName(new Date('2026-01-01'))).toBe('元日');
    });

    it('祝日でない日はnullを返す', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.getHolidayName(new Date('2026-04-06'))).toBeNull();
    });

    it('成人の日を祝日として判定する', () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026年の成人の日は1月12日（第2月曜日）
      expect(result.current.holidays.isHoliday(new Date('2026-01-12'))).toBe(true);
    });
  });

  // ==========================================================================
  // 土曜日判定 (REQ-6.2)
  // ==========================================================================
  describe('土曜日判定', () => {
    it('土曜日をtrueと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-04 は土曜日
      expect(result.current.holidays.isSaturday(new Date('2026-04-04'))).toBe(true);
    });

    it('土曜日以外をfalseと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-06 は月曜日
      expect(result.current.holidays.isSaturday(new Date('2026-04-06'))).toBe(false);
    });
  });

  // ==========================================================================
  // 日曜日判定 (REQ-6.3)
  // ==========================================================================
  describe('日曜日判定', () => {
    it('日曜日をtrueと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-05 は日曜日
      expect(result.current.holidays.isSunday(new Date('2026-04-05'))).toBe(true);
    });

    it('日曜日以外をfalseと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-04 は土曜日
      expect(result.current.holidays.isSunday(new Date('2026-04-04'))).toBe(false);
    });
  });

  // ==========================================================================
  // メモ化 (useMemo)
  // ==========================================================================
  describe('メモ化', () => {
    it('同じ期間で再レンダリングしてもholdaysオブジェクトが同一参照を返す', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result, rerender } = renderHook(() => useHolidayCalendar(start, end));

      const firstRef = result.current.holidays;
      rerender();
      const secondRef = result.current.holidays;

      expect(firstRef).toBe(secondRef);
    });

    it('期間が変わるとholidaysオブジェクトが新しい参照になる', () => {
      let start = new Date('2026-04-01');
      let end = new Date('2026-04-30');
      const { result, rerender } = renderHook(() => useHolidayCalendar(start, end));

      const firstRef = result.current.holidays;

      start = new Date('2026-05-01');
      end = new Date('2026-05-31');
      rerender();
      const secondRef = result.current.holidays;

      expect(firstRef).not.toBe(secondRef);
    });
  });

  // ==========================================================================
  // isLoading
  // ==========================================================================
  describe('isLoading', () => {
    it('isLoadingがfalseを返す（クライアントサイド計算のため常にfalse）', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.isLoading).toBe(false);
    });
  });

  // ==========================================================================
  // Task 15.2: 祝日判定の正確性テスト（追加）
  // ==========================================================================
  describe('祝日判定の正確性（追加テスト）', () => {
    it('建国記念の日（2月11日）を祝日として判定する', () => {
      const start = new Date('2026-02-01');
      const end = new Date('2026-02-28');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-02-11'))).toBe(true);
      expect(result.current.holidays.getHolidayName(new Date('2026-02-11'))).toBe('建国記念の日');
    });

    it('天皇誕生日（2月23日）を祝日として判定する', () => {
      const start = new Date('2026-02-01');
      const end = new Date('2026-02-28');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-02-23'))).toBe(true);
      expect(result.current.holidays.getHolidayName(new Date('2026-02-23'))).toBe('天皇誕生日');
    });

    it('昭和の日（4月29日）を祝日として判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-04-29'))).toBe(true);
      expect(result.current.holidays.getHolidayName(new Date('2026-04-29'))).toBe('昭和の日');
    });

    it('憲法記念日（5月3日）を祝日として判定する', () => {
      const start = new Date('2026-05-01');
      const end = new Date('2026-05-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-05-03'))).toBe(true);
    });

    it('みどりの日（5月4日）を祝日として判定する', () => {
      const start = new Date('2026-05-01');
      const end = new Date('2026-05-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-05-04'))).toBe(true);
    });

    it('こどもの日（5月5日）を祝日として判定する', () => {
      const start = new Date('2026-05-01');
      const end = new Date('2026-05-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      expect(result.current.holidays.isHoliday(new Date('2026-05-05'))).toBe(true);
    });

    it('振替休日を正しく判定する', () => {
      // 2026年5月6日は5月5日（こどもの日・火曜）の振替ではないが
      // 5月3日が日曜日の年は5月6日が振替休日になる
      // 2025年の場合: 5/3(土), 5/4(日), 5/5(月), 5/6(火・振替)
      const start = new Date('2025-05-01');
      const end = new Date('2025-05-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2025年5月6日は振替休日
      expect(result.current.holidays.isHoliday(new Date('2025-05-06'))).toBe(true);
    });

    it('期間外の日付は祝日判定に影響しない（結果が安定）', () => {
      // 1月の期間のみを指定し、4月の祝日は含まれない
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 4月29日（昭和の日）は期間外なので取得範囲に含まれない
      // ただし関数自体は呼び出し可能（結果はfalse）
      expect(result.current.holidays.isHoliday(new Date('2026-04-29'))).toBe(false);
    });
  });

  // ==========================================================================
  // Task 15.2: 土曜日・日曜日判定の追加テスト
  // ==========================================================================
  describe('曜日判定の追加テスト', () => {
    it('金曜日は土曜日でも日曜日でもないと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-03 は金曜日
      expect(result.current.holidays.isSaturday(new Date('2026-04-03'))).toBe(false);
      expect(result.current.holidays.isSunday(new Date('2026-04-03'))).toBe(false);
    });

    it('水曜日は土曜日でも日曜日でもないと判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-01 は水曜日
      expect(result.current.holidays.isSaturday(new Date('2026-04-01'))).toBe(false);
      expect(result.current.holidays.isSunday(new Date('2026-04-01'))).toBe(false);
    });

    it('連続する土曜日と日曜日を正しく判定する', () => {
      const start = new Date('2026-04-01');
      const end = new Date('2026-04-30');
      const { result } = renderHook(() => useHolidayCalendar(start, end));

      // 2026-04-04 土曜日、2026-04-05 日曜日
      expect(result.current.holidays.isSaturday(new Date('2026-04-04'))).toBe(true);
      expect(result.current.holidays.isSunday(new Date('2026-04-04'))).toBe(false);
      expect(result.current.holidays.isSaturday(new Date('2026-04-05'))).toBe(false);
      expect(result.current.holidays.isSunday(new Date('2026-04-05'))).toBe(true);
    });
  });

  // ==========================================================================
  // Task 15.2: メモ化動作の追加テスト
  // ==========================================================================
  describe('メモ化動作の追加テスト', () => {
    it('同じgetTimeを返す異なるDateオブジェクトでも同一参照を維持する', () => {
      const start1 = new Date('2026-04-01');
      const end1 = new Date('2026-04-30');

      const { result, rerender } = renderHook(({ s, e }) => useHolidayCalendar(s, e), {
        initialProps: { s: start1, e: end1 },
      });

      const firstRef = result.current.holidays;

      // 同じ日時を表す新しいDateオブジェクトを渡す
      const start2 = new Date('2026-04-01');
      const end2 = new Date('2026-04-30');
      rerender({ s: start2, e: end2 });
      const secondRef = result.current.holidays;

      // getTime()が同じなのでメモ化が効いて同一参照
      expect(firstRef).toBe(secondRef);
    });
  });
});
