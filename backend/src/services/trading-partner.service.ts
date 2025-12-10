/**
 * @fileoverview 取引先サービス
 *
 * 取引先のCRUD操作とビジネスロジックを担当します。
 *
 * Requirements:
 * - 2.7: ユーザーが有効なデータを入力して保存ボタンをクリック時、新しい取引先レコードをデータベースに作成
 * - 2.8: 取引先作成成功時、成功メッセージを表示し取引先一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合、エラーを表示
 *
 * @module services/trading-partner
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateTradingPartnerInput,
  TradingPartnerType,
} from '../schemas/trading-partner.schema.js';
import { TRADING_PARTNER_TARGET_TYPE } from '../types/audit-log.types.js';
import { DuplicatePartnerNameError } from '../errors/tradingPartnerError.js';

/**
 * TradingPartnerService依存関係
 */
export interface TradingPartnerServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 取引先情報（作成・更新レスポンス用）
 */
export interface TradingPartnerInfo {
  id: string;
  name: string;
  nameKana: string;
  branchName: string | null;
  branchNameKana: string | null;
  representativeName: string | null;
  representativeNameKana: string | null;
  address: string;
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  billingClosingDay: number | null;
  paymentMonthOffset: number | null;
  paymentDay: number | null;
  notes: string | null;
  types: TradingPartnerType[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 取引先サービス
 *
 * 取引先のCRUD操作とビジネスロジックを担当します。
 */
export class TradingPartnerService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: TradingPartnerServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 取引先作成
   *
   * トランザクション内で以下を実行:
   * 1. 取引先名の重複チェック（論理削除されていないもの）
   * 2. 取引先レコードの作成
   * 3. 種別マッピングの作成
   * 4. 監査ログの記録
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された取引先情報
   * @throws DuplicatePartnerNameError 同名の取引先が既に存在する場合
   *
   * Requirements:
   * - 2.7: 有効なデータで新しい取引先レコードをデータベースに作成
   * - 2.8: 作成成功時の処理
   * - 2.11: 同一の取引先名が既に存在する場合のエラー
   */
  async createPartner(
    input: CreateTradingPartnerInput,
    actorId: string
  ): Promise<TradingPartnerInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 取引先名の重複チェック（論理削除されていないもののみ）
      const existingPartner = await tx.tradingPartner.findFirst({
        where: {
          name: input.name,
          deletedAt: null,
        },
      });

      if (existingPartner) {
        throw new DuplicatePartnerNameError(input.name);
      }

      // 2. 取引先レコードの作成
      const partner = await tx.tradingPartner.create({
        data: {
          name: input.name,
          nameKana: input.nameKana,
          branchName: input.branchName || null,
          branchNameKana: input.branchNameKana || null,
          representativeName: input.representativeName || null,
          representativeNameKana: input.representativeNameKana || null,
          address: input.address,
          phoneNumber: input.phoneNumber || null,
          faxNumber: input.faxNumber || null,
          email: input.email || null,
          billingClosingDay: input.billingClosingDay ?? null,
          paymentMonthOffset: input.paymentMonthOffset ?? null,
          paymentDay: input.paymentDay ?? null,
          notes: input.notes || null,
        },
        include: {
          types: true,
        },
      });

      // 3. 種別マッピングの作成
      await tx.tradingPartnerTypeMapping.createMany({
        data: input.types.map((type) => ({
          tradingPartnerId: partner.id,
          type: type,
        })),
      });

      // 種別情報を含む取引先情報を再取得
      const createdPartner = await tx.tradingPartner.findUnique({
        where: { id: partner.id },
        include: { types: true },
      });

      if (!createdPartner) {
        // This should never happen, but TypeScript needs this check
        throw new Error('Failed to retrieve created trading partner');
      }

      // 4. 監査ログの記録
      const typesArray = input.types;
      await this.auditLogService.createLog({
        action: 'TRADING_PARTNER_CREATED',
        actorId,
        targetType: TRADING_PARTNER_TARGET_TYPE,
        targetId: createdPartner.id,
        before: null,
        after: {
          name: createdPartner.name,
          nameKana: createdPartner.nameKana,
          branchName: createdPartner.branchName,
          branchNameKana: createdPartner.branchNameKana,
          representativeName: createdPartner.representativeName,
          representativeNameKana: createdPartner.representativeNameKana,
          address: createdPartner.address,
          phoneNumber: createdPartner.phoneNumber,
          faxNumber: createdPartner.faxNumber,
          email: createdPartner.email,
          billingClosingDay: createdPartner.billingClosingDay,
          paymentMonthOffset: createdPartner.paymentMonthOffset,
          paymentDay: createdPartner.paymentDay,
          notes: createdPartner.notes,
          types: typesArray,
        },
      });

      return this.toTradingPartnerInfo(createdPartner);
    });
  }

  /**
   * データベースの結果をTradingPartnerInfoに変換
   */
  private toTradingPartnerInfo(partner: {
    id: string;
    name: string;
    nameKana: string;
    branchName: string | null;
    branchNameKana: string | null;
    representativeName: string | null;
    representativeNameKana: string | null;
    address: string;
    phoneNumber: string | null;
    faxNumber: string | null;
    email: string | null;
    billingClosingDay: number | null;
    paymentMonthOffset: number | null;
    paymentDay: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    types: Array<{ type: string }>;
  }): TradingPartnerInfo {
    return {
      id: partner.id,
      name: partner.name,
      nameKana: partner.nameKana,
      branchName: partner.branchName,
      branchNameKana: partner.branchNameKana,
      representativeName: partner.representativeName,
      representativeNameKana: partner.representativeNameKana,
      address: partner.address,
      phoneNumber: partner.phoneNumber,
      faxNumber: partner.faxNumber,
      email: partner.email,
      billingClosingDay: partner.billingClosingDay,
      paymentMonthOffset: partner.paymentMonthOffset,
      paymentDay: partner.paymentDay,
      notes: partner.notes,
      types: partner.types.map((t) => t.type as TradingPartnerType),
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    };
  }
}
