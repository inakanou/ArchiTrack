import { describe, it, expect } from 'vitest';
import {
  formatDate,
  translateApiStatus,
  isValidVersion,
  formatBillingClosingDay,
  formatPaymentDate,
  formatDateTime,
} from '../utils/formatters';

describe('formatters utility', () => {
  describe('formatDate', () => {
    it('日付をYYYY-MM-DD形式でフォーマットする', () => {
      const date = new Date('2025-01-15T10:30:00');
      expect(formatDate(date)).toBe('2025-01-15');
    });

    it('月と日が1桁の場合、0埋めする', () => {
      const date = new Date('2025-03-05T00:00:00');
      expect(formatDate(date)).toBe('2025-03-05');
    });

    it('年末の日付を正しくフォーマットする', () => {
      const date = new Date('2024-12-31T23:59:59');
      expect(formatDate(date)).toBe('2024-12-31');
    });
  });

  describe('translateApiStatus', () => {
    it('checkingを日本語に変換する', () => {
      expect(translateApiStatus('checking')).toBe('確認中...');
    });

    it('connectedを日本語に変換する', () => {
      expect(translateApiStatus('connected')).toBe('接続済み');
    });

    it('disconnectedを日本語に変換する', () => {
      expect(translateApiStatus('disconnected')).toBe('未接続');
    });

    it('未定義のステータスはそのまま返す', () => {
      expect(translateApiStatus('unknown')).toBe('unknown');
    });
  });

  describe('isValidVersion', () => {
    it('正しいバージョン形式を認識する', () => {
      expect(isValidVersion('1.0.0')).toBe(true);
      expect(isValidVersion('2.3.4')).toBe(true);
      expect(isValidVersion('10.20.30')).toBe(true);
    });

    it('不正なバージョン形式を拒否する', () => {
      expect(isValidVersion('1.0')).toBe(false);
      expect(isValidVersion('1.0.0.0')).toBe(false);
      expect(isValidVersion('v1.0.0')).toBe(false);
      expect(isValidVersion('1.0.0-beta')).toBe(false);
      expect(isValidVersion('abc')).toBe(false);
    });
  });

  // ==========================================================================
  // 取引先関連フォーマット関数（Task 10.1）
  // ==========================================================================

  describe('formatBillingClosingDay', () => {
    it('nullの場合はnullを返す', () => {
      expect(formatBillingClosingDay(null)).toBe(null);
    });

    it('通常の日付を「○日」の形式で返す', () => {
      expect(formatBillingClosingDay(1)).toBe('1日');
      expect(formatBillingClosingDay(15)).toBe('15日');
      expect(formatBillingClosingDay(25)).toBe('25日');
      expect(formatBillingClosingDay(31)).toBe('31日');
    });

    it('99の場合は「末日」を返す', () => {
      expect(formatBillingClosingDay(99)).toBe('末日');
    });
  });

  describe('formatPaymentDate', () => {
    it('monthOffsetがnullの場合はnullを返す', () => {
      expect(formatPaymentDate(null, 10)).toBe(null);
    });

    it('dayがnullの場合はnullを返す', () => {
      expect(formatPaymentDate(1, null)).toBe(null);
    });

    it('両方nullの場合はnullを返す', () => {
      expect(formatPaymentDate(null, null)).toBe(null);
    });

    it('翌月の日付を「翌月○日」の形式で返す', () => {
      expect(formatPaymentDate(1, 10)).toBe('翌月10日');
      expect(formatPaymentDate(1, 25)).toBe('翌月25日');
    });

    it('翌々月の日付を「翌々月○日」の形式で返す', () => {
      expect(formatPaymentDate(2, 10)).toBe('翌々月10日');
      expect(formatPaymentDate(2, 15)).toBe('翌々月15日');
    });

    it('3ヶ月後の日付を「3ヶ月後○日」の形式で返す', () => {
      expect(formatPaymentDate(3, 10)).toBe('3ヶ月後10日');
      expect(formatPaymentDate(3, 31)).toBe('3ヶ月後31日');
    });

    it('末日の場合は「翌月末日」の形式で返す', () => {
      expect(formatPaymentDate(1, 99)).toBe('翌月末日');
      expect(formatPaymentDate(2, 99)).toBe('翌々月末日');
      expect(formatPaymentDate(3, 99)).toBe('3ヶ月後末日');
    });

    it('4ヶ月以上のオフセットも対応する', () => {
      expect(formatPaymentDate(4, 10)).toBe('4ヶ月後10日');
      expect(formatPaymentDate(5, 99)).toBe('5ヶ月後末日');
    });
  });

  describe('formatDateTime', () => {
    it('ISO8601形式の日時を日本語ロケールでフォーマットする', () => {
      const result = formatDateTime('2025-01-15T10:30:00.000Z');
      // タイムゾーンによって時刻が変わるため、日付部分のみ確認
      expect(result).toMatch(/2025.*01.*15/);
    });

    it('正しい日時形式を返す', () => {
      // タイムゾーンに依存しない日付を使用
      const result = formatDateTime('2025-06-15T12:00:00.000Z');
      expect(result).toMatch(/2025.*06.*15/);
    });
  });
});
