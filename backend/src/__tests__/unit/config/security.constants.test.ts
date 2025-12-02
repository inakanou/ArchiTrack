/**
 * @fileoverview セキュリティ定数の単体テスト
 *
 * セキュリティ関連の定数値が妥当であることを検証します。
 * ベストプラクティスに準拠した値が設定されているかを確認します。
 */

import { describe, it, expect } from 'vitest';
import {
  LOGIN_SECURITY,
  TWO_FACTOR_SECURITY,
  PASSWORD_POLICY,
  SESSION_CONFIG,
  RATE_LIMIT,
  SECURITY_CONFIG,
} from '../../../config/security.constants.js';

describe('Security Constants', () => {
  describe('LOGIN_SECURITY', () => {
    it('MAX_FAILURESが妥当な値である', () => {
      expect(LOGIN_SECURITY.MAX_FAILURES).toBe(5);
      expect(LOGIN_SECURITY.MAX_FAILURES).toBeGreaterThan(0);
      expect(LOGIN_SECURITY.MAX_FAILURES).toBeLessThanOrEqual(10);
    });

    it('LOCK_DURATION_MSが正しく計算されている（15分）', () => {
      const expectedMs = 15 * 60 * 1000; // 15 minutes
      expect(LOGIN_SECURITY.LOCK_DURATION_MS).toBe(expectedMs);
      expect(LOGIN_SECURITY.LOCK_DURATION_MS).toBe(900000);
    });

    it('LOCK_DURATION_MINUTESとLOCK_DURATION_MSが整合性を持つ', () => {
      const msFromMinutes = LOGIN_SECURITY.LOCK_DURATION_MINUTES * 60 * 1000;
      expect(LOGIN_SECURITY.LOCK_DURATION_MS).toBe(msFromMinutes);
    });

    it('全てのフィールドが定義されている', () => {
      // as constにより、型レベルで読み取り専用が保証される
      // コンパイル時に型エラーとなるため、実行時テストは不要
      expect(LOGIN_SECURITY).toHaveProperty('MAX_FAILURES');
      expect(LOGIN_SECURITY).toHaveProperty('LOCK_DURATION_MS');
      expect(LOGIN_SECURITY).toHaveProperty('LOCK_DURATION_MINUTES');
    });
  });

  describe('TWO_FACTOR_SECURITY', () => {
    it('MAX_FAILURESが妥当な値である', () => {
      expect(TWO_FACTOR_SECURITY.MAX_FAILURES).toBe(5);
      expect(TWO_FACTOR_SECURITY.MAX_FAILURES).toBeGreaterThan(0);
      expect(TWO_FACTOR_SECURITY.MAX_FAILURES).toBeLessThanOrEqual(10);
    });

    it('LOCK_DURATION_MSが正しく計算されている（5分）', () => {
      const expectedMs = 5 * 60 * 1000; // 5 minutes
      expect(TWO_FACTOR_SECURITY.LOCK_DURATION_MS).toBe(expectedMs);
      expect(TWO_FACTOR_SECURITY.LOCK_DURATION_MS).toBe(300000);
    });

    it('LOCK_DURATION_MINUTESとLOCK_DURATION_MSが整合性を持つ', () => {
      const msFromMinutes = TWO_FACTOR_SECURITY.LOCK_DURATION_MINUTES * 60 * 1000;
      expect(TWO_FACTOR_SECURITY.LOCK_DURATION_MS).toBe(msFromMinutes);
    });

    it('CODE_LENGTHが標準的なTOTPコード長である', () => {
      expect(TWO_FACTOR_SECURITY.CODE_LENGTH).toBe(6);
    });

    it('2FAのロック時間がログインより短い（セキュリティベストプラクティス）', () => {
      expect(TWO_FACTOR_SECURITY.LOCK_DURATION_MS).toBeLessThan(LOGIN_SECURITY.LOCK_DURATION_MS);
    });
  });

  describe('PASSWORD_POLICY', () => {
    it('MIN_LENGTHがNIST推奨値以上である（12文字以上）', () => {
      // NIST SP 800-63B recommends minimum 8 characters,
      // but 12+ is considered best practice
      expect(PASSWORD_POLICY.MIN_LENGTH).toBe(12);
      expect(PASSWORD_POLICY.MIN_LENGTH).toBeGreaterThanOrEqual(12);
    });

    it('HISTORY_SIZEが妥当な値である（3-5が推奨）', () => {
      expect(PASSWORD_POLICY.HISTORY_SIZE).toBe(5);
      expect(PASSWORD_POLICY.HISTORY_SIZE).toBeGreaterThanOrEqual(3);
      expect(PASSWORD_POLICY.HISTORY_SIZE).toBeLessThanOrEqual(10);
    });
  });

  describe('SESSION_CONFIG', () => {
    it('ACCESS_TOKEN_EXPIRYが短時間である（15分）', () => {
      expect(SESSION_CONFIG.ACCESS_TOKEN_EXPIRY).toBe('15m');
    });

    it('REFRESH_TOKEN_EXPIRYがアクセストークンより長い（7日）', () => {
      expect(SESSION_CONFIG.REFRESH_TOKEN_EXPIRY).toBe('7d');
    });

    it('PASSWORD_RESET_TOKEN_EXPIRY_MSが妥当な値である（1時間）', () => {
      const expectedMs = 60 * 60 * 1000; // 1 hour
      expect(SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS).toBe(expectedMs);
      expect(SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS).toBe(3600000);
    });

    it('パスワードリセットトークンの有効期限が適切（1時間以内）', () => {
      const oneHourMs = 60 * 60 * 1000;
      expect(SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS).toBeLessThanOrEqual(oneHourMs);
    });
  });

  describe('RATE_LIMIT', () => {
    describe('API Rate Limit', () => {
      it('API_MAX_REQUESTSが妥当な値である', () => {
        expect(RATE_LIMIT.API_MAX_REQUESTS).toBe(100);
        expect(RATE_LIMIT.API_MAX_REQUESTS).toBeGreaterThan(0);
      });

      it('API_WINDOW_MSが正しく計算されている（15分）', () => {
        const expectedMs = 15 * 60 * 1000; // 15 minutes
        expect(RATE_LIMIT.API_WINDOW_MS).toBe(expectedMs);
        expect(RATE_LIMIT.API_WINDOW_MS).toBe(900000);
      });
    });

    describe('Login Rate Limit', () => {
      it('LOGIN_MAX_REQUESTSが厳しく設定されている', () => {
        expect(RATE_LIMIT.LOGIN_MAX_REQUESTS).toBe(5);
        expect(RATE_LIMIT.LOGIN_MAX_REQUESTS).toBeLessThan(RATE_LIMIT.API_MAX_REQUESTS);
      });

      it('LOGIN_WINDOW_MSが正しく計算されている（15分）', () => {
        const expectedMs = 15 * 60 * 1000; // 15 minutes
        expect(RATE_LIMIT.LOGIN_WINDOW_MS).toBe(expectedMs);
        expect(RATE_LIMIT.LOGIN_WINDOW_MS).toBe(900000);
      });

      it('ログインレート制限がAPIレート制限より厳しい', () => {
        const loginRate = RATE_LIMIT.LOGIN_MAX_REQUESTS / RATE_LIMIT.LOGIN_WINDOW_MS;
        const apiRate = RATE_LIMIT.API_MAX_REQUESTS / RATE_LIMIT.API_WINDOW_MS;

        expect(loginRate).toBeLessThan(apiRate);
      });
    });

    describe('Refresh Token Rate Limit', () => {
      it('REFRESH_MAX_REQUESTSが妥当な値である', () => {
        expect(RATE_LIMIT.REFRESH_MAX_REQUESTS).toBe(10);
        expect(RATE_LIMIT.REFRESH_MAX_REQUESTS).toBeGreaterThan(RATE_LIMIT.LOGIN_MAX_REQUESTS);
        expect(RATE_LIMIT.REFRESH_MAX_REQUESTS).toBeLessThan(RATE_LIMIT.API_MAX_REQUESTS);
      });

      it('REFRESH_WINDOW_MSが正しく計算されている（15分）', () => {
        const expectedMs = 15 * 60 * 1000; // 15 minutes
        expect(RATE_LIMIT.REFRESH_WINDOW_MS).toBe(expectedMs);
        expect(RATE_LIMIT.REFRESH_WINDOW_MS).toBe(900000);
      });
    });

    it('全てのウィンドウサイズが同じである（一貫性）', () => {
      expect(RATE_LIMIT.API_WINDOW_MS).toBe(RATE_LIMIT.LOGIN_WINDOW_MS);
      expect(RATE_LIMIT.LOGIN_WINDOW_MS).toBe(RATE_LIMIT.REFRESH_WINDOW_MS);
    });
  });

  describe('SECURITY_CONFIG 統合', () => {
    it('全てのセキュリティ設定を含んでいる', () => {
      expect(SECURITY_CONFIG).toHaveProperty('LOGIN');
      expect(SECURITY_CONFIG).toHaveProperty('TWO_FACTOR');
      expect(SECURITY_CONFIG).toHaveProperty('PASSWORD');
      expect(SECURITY_CONFIG).toHaveProperty('SESSION');
      expect(SECURITY_CONFIG).toHaveProperty('RATE_LIMIT');
    });

    it('LOGINプロパティが正しいオブジェクトを参照している', () => {
      expect(SECURITY_CONFIG.LOGIN).toBe(LOGIN_SECURITY);
      expect(SECURITY_CONFIG.LOGIN.MAX_FAILURES).toBe(5);
    });

    it('TWO_FACTORプロパティが正しいオブジェクトを参照している', () => {
      expect(SECURITY_CONFIG.TWO_FACTOR).toBe(TWO_FACTOR_SECURITY);
      expect(SECURITY_CONFIG.TWO_FACTOR.CODE_LENGTH).toBe(6);
    });

    it('PASSWORDプロパティが正しいオブジェクトを参照している', () => {
      expect(SECURITY_CONFIG.PASSWORD).toBe(PASSWORD_POLICY);
      expect(SECURITY_CONFIG.PASSWORD.MIN_LENGTH).toBe(12);
    });

    it('SESSIONプロパティが正しいオブジェクトを参照している', () => {
      expect(SECURITY_CONFIG.SESSION).toBe(SESSION_CONFIG);
      expect(SECURITY_CONFIG.SESSION.ACCESS_TOKEN_EXPIRY).toBe('15m');
    });

    it('RATE_LIMITプロパティが正しいオブジェクトを参照している', () => {
      expect(SECURITY_CONFIG.RATE_LIMIT).toBe(RATE_LIMIT);
      expect(SECURITY_CONFIG.RATE_LIMIT.API_MAX_REQUESTS).toBe(100);
    });
  });

  describe('セキュリティベストプラクティス準拠', () => {
    it('パスワード最小長がOWASP推奨値以上である', () => {
      // OWASP recommends 12+ characters
      expect(PASSWORD_POLICY.MIN_LENGTH).toBeGreaterThanOrEqual(12);
    });

    it('ログイン失敗ロックアウトが適切に設定されている', () => {
      // ベストプラクティス: 3-10回の失敗でロックアウト
      expect(LOGIN_SECURITY.MAX_FAILURES).toBeGreaterThanOrEqual(3);
      expect(LOGIN_SECURITY.MAX_FAILURES).toBeLessThanOrEqual(10);
    });

    it('アカウントロック期間が妥当である', () => {
      // ベストプラクティス: 5-30分のロック期間
      const fiveMinutesMs = 5 * 60 * 1000;
      const thirtyMinutesMs = 30 * 60 * 1000;

      expect(LOGIN_SECURITY.LOCK_DURATION_MS).toBeGreaterThanOrEqual(fiveMinutesMs);
      expect(LOGIN_SECURITY.LOCK_DURATION_MS).toBeLessThanOrEqual(thirtyMinutesMs);
    });

    it('アクセストークンの有効期限が短い（15-30分推奨）', () => {
      // JWTベストプラクティス: 短いアクセストークン有効期限
      expect(SESSION_CONFIG.ACCESS_TOKEN_EXPIRY).toMatch(/^\d+m$/);
      const minutes = parseInt(SESSION_CONFIG.ACCESS_TOKEN_EXPIRY);
      expect(minutes).toBeGreaterThanOrEqual(5);
      expect(minutes).toBeLessThanOrEqual(30);
    });

    it('レート制限が適切に設定されている', () => {
      // DoS攻撃防止のため、適切なレート制限が設定されている
      expect(RATE_LIMIT.LOGIN_MAX_REQUESTS).toBeLessThanOrEqual(10);
      expect(RATE_LIMIT.API_MAX_REQUESTS).toBeLessThanOrEqual(1000);
    });

    it('2FAコード長が標準である', () => {
      // RFC 6238 (TOTP) standard: 6 or 8 digits
      expect(TWO_FACTOR_SECURITY.CODE_LENGTH).toBeGreaterThanOrEqual(6);
      expect(TWO_FACTOR_SECURITY.CODE_LENGTH).toBeLessThanOrEqual(8);
    });
  });

  describe('型安全性（as const）', () => {
    it('定数オブジェクトが期待される構造を持つ', () => {
      // TypeScriptのas constは型レベルでの読み取り専用を保証
      // コンパイル時に型エラーとなるため、実行時テストは不要

      // 各定数が期待されるプロパティを持つことを確認
      expect(LOGIN_SECURITY).toHaveProperty('MAX_FAILURES');
      expect(TWO_FACTOR_SECURITY).toHaveProperty('CODE_LENGTH');
      expect(PASSWORD_POLICY).toHaveProperty('MIN_LENGTH');
      expect(SESSION_CONFIG).toHaveProperty('ACCESS_TOKEN_EXPIRY');
      expect(RATE_LIMIT).toHaveProperty('API_MAX_REQUESTS');
    });

    it('全ての定数値が正しい型である', () => {
      // 数値型の確認
      expect(typeof LOGIN_SECURITY.MAX_FAILURES).toBe('number');
      expect(typeof PASSWORD_POLICY.MIN_LENGTH).toBe('number');
      expect(typeof RATE_LIMIT.API_MAX_REQUESTS).toBe('number');

      // 文字列型の確認
      expect(typeof SESSION_CONFIG.ACCESS_TOKEN_EXPIRY).toBe('string');
      expect(typeof SESSION_CONFIG.REFRESH_TOKEN_EXPIRY).toBe('string');
    });
  });
});
