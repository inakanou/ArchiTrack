import { describe, it, expect } from 'vitest';
import { formatDate, translateApiStatus, isValidVersion } from '../utils/formatters';

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
});
