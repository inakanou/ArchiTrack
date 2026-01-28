/**
 * @fileoverview company-info.types のユニットテスト
 *
 * テスト対象:
 * - isCompanyInfo タイプガード関数
 * - isEmptyCompanyInfoResponse タイプガード関数
 */

import { describe, it, expect } from 'vitest';
import { isCompanyInfo, isEmptyCompanyInfoResponse } from '../../types/company-info.types';
import type { CompanyInfo } from '../../types/company-info.types';

describe('company-info.types', () => {
  describe('isCompanyInfo', () => {
    it('should return true for valid CompanyInfo object', () => {
      const validCompanyInfo: CompanyInfo = {
        id: '1',
        companyName: 'テスト会社',
        address: '東京都渋谷区',
        representative: '代表者',
        phone: '03-1234-5678',
        fax: '03-1234-5679',
        email: 'test@example.com',
        invoiceRegistrationNumber: 'T1234567890123',
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      expect(isCompanyInfo(validCompanyInfo)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isCompanyInfo(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isCompanyInfo(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isCompanyInfo('string')).toBe(false);
      expect(isCompanyInfo(123)).toBe(false);
      expect(isCompanyInfo(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isCompanyInfo({})).toBe(false);
    });

    it('should return false for object with missing required fields', () => {
      const partialObject = {
        id: '1',
        companyName: 'テスト会社',
        // address, representative, version, createdAt, updatedAt が欠落
      };

      expect(isCompanyInfo(partialObject)).toBe(false);
    });

    it('should return false for object with wrong field types', () => {
      const wrongTypes = {
        id: 123, // should be string
        companyName: 'テスト会社',
        address: '東京都渋谷区',
        representative: '代表者',
        version: '1', // should be number
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      expect(isCompanyInfo(wrongTypes)).toBe(false);
    });
  });

  describe('isEmptyCompanyInfoResponse', () => {
    it('should return true for empty object', () => {
      const emptyResponse = {} as Record<string, never>;
      expect(isEmptyCompanyInfoResponse(emptyResponse)).toBe(true);
    });

    it('should return false for valid CompanyInfo', () => {
      const companyInfo: CompanyInfo = {
        id: '1',
        companyName: 'テスト会社',
        address: '東京都渋谷区',
        representative: '代表者',
        phone: '03-1234-5678',
        fax: '03-1234-5679',
        email: 'test@example.com',
        invoiceRegistrationNumber: 'T1234567890123',
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      expect(isEmptyCompanyInfoResponse(companyInfo)).toBe(false);
    });
  });
});
