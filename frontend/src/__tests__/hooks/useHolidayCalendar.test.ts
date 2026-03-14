/**
 * @vitest-environment jsdom
 */

/**
 * @fileoverview useHolidayCalendar フックのユニットテスト
 *
 * Task 6.3: useHolidayCalendar フックを実装する
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
});
