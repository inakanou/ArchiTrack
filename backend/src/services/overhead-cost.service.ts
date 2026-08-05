/**
 * @fileoverview 諸経費サービス
 *
 * 国土交通省の公共建築工事共通費積算基準に準じた諸経費（共通仮設費・現場管理費・一般管理費）
 * の自動計算を提供します。
 *
 * プリセット値（名称・規格・単位・数量）の権威は
 * `frontend/src/domain/estimate/estimateEditReducer.ts` の `OVERHEAD_PRESETS` に一本化した。
 * 諸経費行の生成が `POST /:id/overhead-items` の撤去（Task 55.7、REQ-49.3）により
 * クライアント側の編集状態への反映へ移り、サーバー側の複製は呼び出し元を失ったため。
 * 本サービスは書き込みを伴わない率・金額の算定のみを担う。
 *
 * Requirements (estimate-creation):
 * - REQ-7.3: 国土交通省の公共建築工事共通費積算基準の共通仮設費計算式に準じて単価を自動計算する
 * - REQ-7.5: 自動計算結果を手入力で上書き可能とする
 * - REQ-8.3: 国土交通省の公共建築工事共通費積算基準の現場管理費計算式に準じて単価を自動計算する
 * - REQ-9.3: 国土交通省の公共建築工事共通費積算基準の一般管理費計算式に準じて単価を自動計算する
 *
 * Task 3.4: OverheadCostServiceの実装（諸経費自動計算）
 * Task 55.7: プリセット値の複製を撤去（`getPresetValues`）
 *
 * 計算式（令和7年改定）:
 * - 共通仮設費率: Kr = Exp(a - b * loge(P) + c * loge(T))
 *   - 新営建築: a=3.346, b=0.282, c=0.625
 *   - 改修建築: a=3.962, b=0.315, c=0.531
 * - 現場管理費率: Jo = Exp(a - b * loge(Np))
 *   - 新営建築: a=4.0206, b=0.2174
 *   - 改修建築: a=4.5169, b=0.2524
 * - 一般管理費等率: Gp = Exp(a - b * loge(Cp))
 *   - 新営建築: a=2.3998, b=0.0891
 *   - 改修建築: a=2.5169, b=0.0969
 *
 * 注意:
 * - 各率は小数点以下第3位を四捨五入
 * - 金額は1,000円未満を切捨て
 *
 * @module services/overhead-cost
 */

import Decimal from 'decimal.js';

/**
 * 諸経費種別
 */
export enum OverheadCostType {
  /** 共通仮設費 */
  COMMON_TEMPORARY = 'COMMON_TEMPORARY',
  /** 現場管理費 */
  SITE_MANAGEMENT = 'SITE_MANAGEMENT',
  /** 一般管理費 */
  GENERAL_ADMIN = 'GENERAL_ADMIN',
}

/**
 * 共通仮設費計算パラメータ
 */
export interface CommonTemporaryCostParams {
  /** 直接工事費（千円単位） */
  directCost: Decimal;
  /** 工期（月） */
  constructionPeriod: number;
  /** 改修工事フラグ */
  isRenovation: boolean;
}

/**
 * 現場管理費計算パラメータ
 */
export interface SiteManagementCostParams {
  /** 純工事費（千円単位）= 直接工事費 + 共通仮設費 */
  pureConstructionCost: Decimal;
  /** 改修工事フラグ */
  isRenovation: boolean;
}

/**
 * 一般管理費計算パラメータ
 */
export interface GeneralAdminCostParams {
  /** 工事原価（千円単位）= 純工事費 + 現場管理費 */
  constructionCost: Decimal;
  /** 改修工事フラグ */
  isRenovation: boolean;
}

/**
 * 諸経費計算結果
 */
export interface OverheadCostResult {
  costType: OverheadCostType;
  /** 算定率（%） */
  rate: Decimal;
  /** 計算金額（千円単位） */
  amount: Decimal;
  /** 計算式（トレーサビリティ用） */
  formula: string;
}

/**
 * 一括計算パラメータ
 */
export interface AllOverheadCostsParams {
  /** 直接工事費（千円単位） */
  directCost: Decimal;
  /** 工期（月） */
  constructionPeriod: number;
  /** 改修工事フラグ */
  isRenovation: boolean;
}

/**
 * 一括計算結果
 */
export interface AllOverheadCostsResult {
  /** 直接工事費 */
  directCost: Decimal;
  /** 共通仮設費 */
  commonTemporaryCost: OverheadCostResult;
  /** 純工事費（直接工事費 + 共通仮設費） */
  pureConstructionCost: Decimal;
  /** 現場管理費 */
  siteManagementCost: OverheadCostResult;
  /** 工事原価（純工事費 + 現場管理費） */
  constructionCost: Decimal;
  /** 一般管理費 */
  generalAdminCost: OverheadCostResult;
}

/**
 * 諸経費サービス
 *
 * 国土交通省の公共建築工事共通費積算基準に準じた諸経費の自動計算を提供します。
 */
export class OverheadCostService {
  /**
   * 共通仮設費係数（新営建築）
   */
  private readonly COMMON_TEMP_COEF_NEW = {
    a: new Decimal('3.346'),
    b: new Decimal('0.282'),
    c: new Decimal('0.625'),
  };

  /**
   * 共通仮設費係数（改修建築）
   */
  private readonly COMMON_TEMP_COEF_RENOVATION = {
    a: new Decimal('3.962'),
    b: new Decimal('0.315'),
    c: new Decimal('0.531'),
  };

  /**
   * 現場管理費係数（新営建築）
   */
  private readonly SITE_MGMT_COEF_NEW = {
    a: new Decimal('4.0206'),
    b: new Decimal('0.2174'),
  };

  /**
   * 現場管理費係数（改修建築）
   */
  private readonly SITE_MGMT_COEF_RENOVATION = {
    a: new Decimal('4.5169'),
    b: new Decimal('0.2524'),
  };

  /**
   * 一般管理費係数（新営建築）
   */
  private readonly GENERAL_ADMIN_COEF_NEW = {
    a: new Decimal('2.3998'),
    b: new Decimal('0.0891'),
  };

  /**
   * 一般管理費係数（改修建築）
   */
  private readonly GENERAL_ADMIN_COEF_RENOVATION = {
    a: new Decimal('2.5169'),
    b: new Decimal('0.0969'),
  };

  /**
   * 共通仮設費を計算する
   *
   * 計算式: Kr = Exp(a - b * loge(P) + c * loge(T))
   *
   * Requirements: REQ-7.3
   *
   * @param params - 計算パラメータ
   * @returns 計算結果
   * @throws Error 直接工事費または工期が0以下の場合
   */
  calculateCommonTemporaryCost(params: CommonTemporaryCostParams): OverheadCostResult {
    const { directCost, constructionPeriod, isRenovation } = params;

    // 入力値検証
    if (directCost.lte(0)) {
      throw new Error('直接工事費は0より大きい値を指定してください');
    }
    if (constructionPeriod <= 0) {
      throw new Error('工期は0より大きい値を指定してください');
    }

    // 係数を選択
    const coef = isRenovation ? this.COMMON_TEMP_COEF_RENOVATION : this.COMMON_TEMP_COEF_NEW;
    const typeLabel = isRenovation ? '改修' : '新営';

    // P（直接工事費）、T（工期）の自然対数
    const logP = Decimal.ln(directCost);
    const logT = Decimal.ln(new Decimal(constructionPeriod));

    // 率の計算: Kr = Exp(a - b * loge(P) + c * loge(T))
    const exponent = coef.a.sub(coef.b.mul(logP)).add(coef.c.mul(logT));
    const rate = Decimal.exp(exponent).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 金額の計算（千円単位）、1,000円未満切捨て
    const amountRaw = directCost.mul(rate).div(100);
    const amount = amountRaw.div(1000).floor().mul(1000);

    // 計算式（トレーサビリティ用）
    const formula = `[${typeLabel}] Kr = Exp(${coef.a} - ${coef.b} * loge(${directCost}) + ${coef.c} * loge(${constructionPeriod})) = ${rate}%`;

    return {
      costType: OverheadCostType.COMMON_TEMPORARY,
      rate,
      amount,
      formula,
    };
  }

  /**
   * 現場管理費を計算する
   *
   * 計算式: Jo = Exp(a - b * loge(Np))
   *
   * Requirements: REQ-8.3
   *
   * @param params - 計算パラメータ
   * @returns 計算結果
   * @throws Error 純工事費が0以下の場合
   */
  calculateSiteManagementCost(params: SiteManagementCostParams): OverheadCostResult {
    const { pureConstructionCost, isRenovation } = params;

    // 入力値検証
    if (pureConstructionCost.lte(0)) {
      throw new Error('純工事費は0より大きい値を指定してください');
    }

    // 係数を選択
    const coef = isRenovation ? this.SITE_MGMT_COEF_RENOVATION : this.SITE_MGMT_COEF_NEW;
    const typeLabel = isRenovation ? '改修' : '新営';

    // Np（純工事費）の自然対数
    const logNp = Decimal.ln(pureConstructionCost);

    // 率の計算: Jo = Exp(a - b * loge(Np))
    const exponent = coef.a.sub(coef.b.mul(logNp));
    const rate = Decimal.exp(exponent).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 金額の計算（千円単位）、1,000円未満切捨て
    const amountRaw = pureConstructionCost.mul(rate).div(100);
    const amount = amountRaw.div(1000).floor().mul(1000);

    // 計算式（トレーサビリティ用）
    const formula = `[${typeLabel}] Jo = Exp(${coef.a} - ${coef.b} * loge(${pureConstructionCost})) = ${rate}%`;

    return {
      costType: OverheadCostType.SITE_MANAGEMENT,
      rate,
      amount,
      formula,
    };
  }

  /**
   * 一般管理費を計算する
   *
   * 計算式: Gp = Exp(a - b * loge(Cp))
   *
   * Requirements: REQ-9.3
   *
   * @param params - 計算パラメータ
   * @returns 計算結果
   * @throws Error 工事原価が0以下の場合
   */
  calculateGeneralAdminCost(params: GeneralAdminCostParams): OverheadCostResult {
    const { constructionCost, isRenovation } = params;

    // 入力値検証
    if (constructionCost.lte(0)) {
      throw new Error('工事原価は0より大きい値を指定してください');
    }

    // 係数を選択
    const coef = isRenovation ? this.GENERAL_ADMIN_COEF_RENOVATION : this.GENERAL_ADMIN_COEF_NEW;
    const typeLabel = isRenovation ? '改修' : '新営';

    // Cp（工事原価）の自然対数
    const logCp = Decimal.ln(constructionCost);

    // 率の計算: Gp = Exp(a - b * loge(Cp))
    const exponent = coef.a.sub(coef.b.mul(logCp));
    const rate = Decimal.exp(exponent).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 金額の計算（千円単位）、1,000円未満切捨て
    const amountRaw = constructionCost.mul(rate).div(100);
    const amount = amountRaw.div(1000).floor().mul(1000);

    // 計算式（トレーサビリティ用）
    const formula = `[${typeLabel}] Gp = Exp(${coef.a} - ${coef.b} * loge(${constructionCost})) = ${rate}%`;

    return {
      costType: OverheadCostType.GENERAL_ADMIN,
      rate,
      amount,
      formula,
    };
  }

  /**
   * 共通仮設費・現場管理費・一般管理費を一括計算する
   *
   * 計算順序:
   * 1. 共通仮設費 = f(直接工事費, 工期)
   * 2. 純工事費 = 直接工事費 + 共通仮設費
   * 3. 現場管理費 = f(純工事費)
   * 4. 工事原価 = 純工事費 + 現場管理費
   * 5. 一般管理費 = f(工事原価)
   *
   * @param params - 計算パラメータ
   * @returns 一括計算結果
   */
  calculateAllOverheadCosts(params: AllOverheadCostsParams): AllOverheadCostsResult {
    const { directCost, constructionPeriod, isRenovation } = params;

    // 1. 共通仮設費
    const commonTemporaryCost = this.calculateCommonTemporaryCost({
      directCost,
      constructionPeriod,
      isRenovation,
    });

    // 2. 純工事費 = 直接工事費 + 共通仮設費
    const pureConstructionCost = directCost.add(commonTemporaryCost.amount);

    // 3. 現場管理費
    const siteManagementCost = this.calculateSiteManagementCost({
      pureConstructionCost,
      isRenovation,
    });

    // 4. 工事原価 = 純工事費 + 現場管理費
    const constructionCost = pureConstructionCost.add(siteManagementCost.amount);

    // 5. 一般管理費
    const generalAdminCost = this.calculateGeneralAdminCost({
      constructionCost,
      isRenovation,
    });

    return {
      directCost,
      commonTemporaryCost,
      pureConstructionCost,
      siteManagementCost,
      constructionCost,
      generalAdminCost,
    };
  }
}
