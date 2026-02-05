/**
 * @fileoverview 諸経費サービスのユニットテスト
 *
 * Requirements (estimate-creation):
 * - REQ-7.1: 共通仮設費行の追加を選択した場合、名称：共通仮設費、規格：空白、単位：式、数量：1をプリセット値として設定する
 * - REQ-7.2: 共通仮設費の単価を手入力で設定可能とする
 * - REQ-7.3: 国土交通省の公共建築工事共通費積算基準の共通仮設費計算式に準じて単価を自動計算する
 * - REQ-8.1: 現場管理費行の追加を選択した場合、名称：現場管理費、規格：空白、単位：式、数量：1をプリセット値として設定する
 * - REQ-8.3: 国土交通省の公共建築工事共通費積算基準の現場管理費計算式に準じて単価を自動計算する
 * - REQ-9.1: 一般管理費行の追加を選択した場合、名称：一般管理費、規格：空白、単位：式、数量：1をプリセット値として設定する
 * - REQ-9.3: 国土交通省の公共建築工事共通費積算基準の一般管理費計算式に準じて単価を自動計算する
 *
 * Task 3.4: OverheadCostServiceの実装（諸経費自動計算）
 *
 * @module __tests__/unit/services/overhead-cost.service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OverheadCostService, OverheadCostType } from '../../../services/overhead-cost.service.js';
import Decimal from 'decimal.js';

describe('OverheadCostService', () => {
  let service: OverheadCostService;

  beforeEach(() => {
    service = new OverheadCostService();
  });

  describe('getPresetValues', () => {
    it('共通仮設費のプリセット値を返す（Requirements: REQ-7.1）', () => {
      const preset = service.getPresetValues(OverheadCostType.COMMON_TEMPORARY);

      expect(preset.name).toBe('共通仮設費');
      expect(preset.specification).toBe('');
      expect(preset.unit).toBe('式');
      expect(preset.quantity).toBe(1);
    });

    it('現場管理費のプリセット値を返す（Requirements: REQ-8.1）', () => {
      const preset = service.getPresetValues(OverheadCostType.SITE_MANAGEMENT);

      expect(preset.name).toBe('現場管理費');
      expect(preset.specification).toBe('');
      expect(preset.unit).toBe('式');
      expect(preset.quantity).toBe(1);
    });

    it('一般管理費のプリセット値を返す（Requirements: REQ-9.1）', () => {
      const preset = service.getPresetValues(OverheadCostType.GENERAL_ADMIN);

      expect(preset.name).toBe('一般管理費');
      expect(preset.specification).toBe('');
      expect(preset.unit).toBe('式');
      expect(preset.quantity).toBe(1);
    });
  });

  describe('calculateCommonTemporaryCost (共通仮設費計算)', () => {
    it('新営建築の共通仮設費率を計算する（Requirements: REQ-7.3）', () => {
      // 計算式: Kr = Exp(3.346 - 0.282 * loge(P) + 0.625 * loge(T))
      // P = 直接工事費（千円）, T = 工期（月）
      const result = service.calculateCommonTemporaryCost({
        directCost: new Decimal('100000'), // 100,000千円 = 1億円
        constructionPeriod: 12, // 12ヶ月
        isRenovation: false,
      });

      expect(result.costType).toBe(OverheadCostType.COMMON_TEMPORARY);
      expect(result.rate).toBeDefined();
      // 率は小数点以下第3位を四捨五入
      expect(result.rate.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(result.formula).toContain('Exp');
    });

    it('改修建築の共通仮設費率を計算する（Requirements: REQ-7.3）', () => {
      // 計算式: Kr = Exp(3.962 - 0.315 * loge(P) + 0.531 * loge(T))（改修）
      const result = service.calculateCommonTemporaryCost({
        directCost: new Decimal('100000'),
        constructionPeriod: 12,
        isRenovation: true,
      });

      expect(result.costType).toBe(OverheadCostType.COMMON_TEMPORARY);
      expect(result.rate).toBeDefined();
      // 改修の場合は異なる係数が使用される
      expect(result.formula).toContain('改修');
    });

    it('計算された金額は1,000円未満切捨て', () => {
      const result = service.calculateCommonTemporaryCost({
        directCost: new Decimal('50000'),
        constructionPeriod: 6,
        isRenovation: false,
      });

      // 金額 = 直接工事費 × 率
      // 金額は1,000円未満切捨て
      expect(result.amount.mod(1000).toString()).toBe('0');
    });

    it('直接工事費が0の場合エラーを発生させる', () => {
      expect(() =>
        service.calculateCommonTemporaryCost({
          directCost: new Decimal('0'),
          constructionPeriod: 12,
          isRenovation: false,
        })
      ).toThrow();
    });

    it('工期が0の場合エラーを発生させる', () => {
      expect(() =>
        service.calculateCommonTemporaryCost({
          directCost: new Decimal('100000'),
          constructionPeriod: 0,
          isRenovation: false,
        })
      ).toThrow();
    });
  });

  describe('calculateSiteManagementCost (現場管理費計算)', () => {
    it('現場管理費率を計算する（Requirements: REQ-8.3）', () => {
      // 計算式: Jo = Exp(a - b * loge(Np))
      // Np = 純工事費（千円）= 直接工事費 + 共通仮設費
      const result = service.calculateSiteManagementCost({
        pureConstructionCost: new Decimal('110000'), // 純工事費（千円）
        isRenovation: false,
      });

      expect(result.costType).toBe(OverheadCostType.SITE_MANAGEMENT);
      expect(result.rate).toBeDefined();
      expect(result.rate.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(result.formula).toContain('Exp');
    });

    it('改修建築の現場管理費率を計算する', () => {
      const result = service.calculateSiteManagementCost({
        pureConstructionCost: new Decimal('110000'),
        isRenovation: true,
      });

      expect(result.costType).toBe(OverheadCostType.SITE_MANAGEMENT);
      expect(result.formula).toContain('改修');
    });

    it('計算された金額は1,000円未満切捨て', () => {
      const result = service.calculateSiteManagementCost({
        pureConstructionCost: new Decimal('50000'),
        isRenovation: false,
      });

      expect(result.amount.mod(1000).toString()).toBe('0');
    });

    it('純工事費が0の場合エラーを発生させる', () => {
      expect(() =>
        service.calculateSiteManagementCost({
          pureConstructionCost: new Decimal('0'),
          isRenovation: false,
        })
      ).toThrow();
    });
  });

  describe('calculateGeneralAdminCost (一般管理費計算)', () => {
    it('一般管理費等率を計算する（Requirements: REQ-9.3）', () => {
      // 計算式: Gp = Exp(a - b * loge(Cp))
      // Cp = 工事原価（千円）= 純工事費 + 現場管理費
      const result = service.calculateGeneralAdminCost({
        constructionCost: new Decimal('120000'), // 工事原価（千円）
        isRenovation: false,
      });

      expect(result.costType).toBe(OverheadCostType.GENERAL_ADMIN);
      expect(result.rate).toBeDefined();
      expect(result.rate.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(result.formula).toContain('Exp');
    });

    it('改修建築の一般管理費率を計算する', () => {
      const result = service.calculateGeneralAdminCost({
        constructionCost: new Decimal('120000'),
        isRenovation: true,
      });

      expect(result.costType).toBe(OverheadCostType.GENERAL_ADMIN);
      expect(result.formula).toContain('改修');
    });

    it('計算された金額は1,000円未満切捨て', () => {
      const result = service.calculateGeneralAdminCost({
        constructionCost: new Decimal('50000'),
        isRenovation: false,
      });

      expect(result.amount.mod(1000).toString()).toBe('0');
    });

    it('工事原価が0の場合エラーを発生させる', () => {
      expect(() =>
        service.calculateGeneralAdminCost({
          constructionCost: new Decimal('0'),
          isRenovation: false,
        })
      ).toThrow();
    });
  });

  describe('calculateAllOverheadCosts (一括計算)', () => {
    it('共通仮設費・現場管理費・一般管理費を一括計算する', () => {
      const result = service.calculateAllOverheadCosts({
        directCost: new Decimal('100000'), // 直接工事費（千円）
        constructionPeriod: 12, // 工期（月）
        isRenovation: false,
      });

      expect(result.commonTemporaryCost).toBeDefined();
      expect(result.siteManagementCost).toBeDefined();
      expect(result.generalAdminCost).toBeDefined();

      // 各費用は直接工事費をベースに連続して計算される
      // 純工事費 = 直接工事費 + 共通仮設費
      // 工事原価 = 純工事費 + 現場管理費
      expect(result.pureConstructionCost.gt(result.directCost)).toBe(true);
      expect(result.constructionCost.gt(result.pureConstructionCost)).toBe(true);
    });

    it('トレーサビリティ用の計算式を含む', () => {
      const result = service.calculateAllOverheadCosts({
        directCost: new Decimal('100000'),
        constructionPeriod: 12,
        isRenovation: false,
      });

      expect(result.commonTemporaryCost.formula).toBeDefined();
      expect(result.siteManagementCost.formula).toBeDefined();
      expect(result.generalAdminCost.formula).toBeDefined();
    });
  });
});
