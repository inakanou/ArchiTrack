/**
 * @fileoverview 取引先サービス
 *
 * 取引先のCRUD操作とビジネスロジックを担当します。
 *
 * Requirements (一覧取得):
 * - 1.1: 登録済みの取引先をテーブル形式で表示する
 * - 1.2: 取引先名、フリガナ、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日を表示
 * - 1.3: 取引先名またはフリガナによる部分一致検索
 * - 1.4: 取引先種別でのフィルタリング
 * - 1.5: ページネーション
 * - 1.6: 指定された列でソート
 * - 1.7: 取引先データが存在しない場合のメッセージ（空配列返却）
 * - 1.8: デフォルトソート順をフリガナの昇順
 *
 * Requirements (作成):
 * - 2.7: ユーザーが有効なデータを入力して保存ボタンをクリック時、新しい取引先レコードをデータベースに作成
 * - 2.8: 取引先作成成功時、成功メッセージを表示し取引先一覧ページに遷移
 * - 2.11: 同一の取引先名が既に存在する場合、エラーを表示
 *
 * @module services/trading-partner
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type {
  CreateTradingPartnerInput,
  TradingPartnerType,
  TradingPartnerSortableField,
  SortOrder,
} from '../schemas/trading-partner.schema.js';
import { TRADING_PARTNER_TARGET_TYPE } from '../types/audit-log.types.js';
import {
  DuplicatePartnerNameError,
  TradingPartnerNotFoundError,
} from '../errors/tradingPartnerError.js';

/**
 * TradingPartnerService依存関係
 */
export interface TradingPartnerServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 取引先フィルター条件
 *
 * Requirements:
 * - 1.3: 取引先名またはフリガナによる部分一致検索
 * - 1.4: 取引先種別でのフィルタリング
 */
export interface TradingPartnerFilter {
  search?: string;
  type?: TradingPartnerType;
}

/**
 * ページネーション入力
 *
 * Requirements:
 * - 1.5: ページネーション提供
 */
export interface PaginationInput {
  page: number;
  limit: number;
}

/**
 * ソート入力
 *
 * Requirements:
 * - 1.6: 指定された列でソート
 * - 1.8: デフォルトソート順をフリガナの昇順
 */
export interface SortInput {
  sort: TradingPartnerSortableField;
  order: SortOrder;
}

/**
 * ページネーション情報
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付き取引先一覧
 *
 * Requirements:
 * - 1.1: 登録済みの取引先をテーブル形式で表示
 * - 1.5: ページネーション提供
 */
export interface PaginatedPartners {
  data: TradingPartnerInfo[];
  pagination: PaginationInfo;
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
 * プロジェクトサマリー（将来の連携用）
 *
 * Requirements:
 * - 3.4: プロジェクト管理機能が有効なとき、当該取引先に紐付くプロジェクト一覧を表示する
 */
export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
}

/**
 * 取引先詳細情報（詳細取得レスポンス用）
 *
 * Requirements:
 * - 3.1: 取引先詳細ページを表示する
 * - 3.2: 全フィールドを詳細ページに表示する
 * - 3.4: 当該取引先に紐付くプロジェクト一覧を表示する（将来対応）
 */
export interface TradingPartnerDetail extends TradingPartnerInfo {
  projects?: ProjectSummary[];
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
   * 取引先一覧取得
   *
   * ページネーション、検索、フィルタリング、ソートに対応。
   * 論理削除されたレコードは除外される。
   *
   * @param filter - フィルター条件
   * @param pagination - ページネーション入力
   * @param sort - ソート入力
   * @returns ページネーション付き取引先一覧
   *
   * Requirements:
   * - 1.1: 登録済みの取引先をテーブル形式で表示する
   * - 1.2: 取引先名、フリガナ、部課/支店/支社名、代表者名、取引先種別、住所、電話番号、登録日を表示
   * - 1.3: 取引先名またはフリガナによる部分一致検索
   * - 1.4: 取引先種別でのフィルタリング
   * - 1.5: ページネーション
   * - 1.6: 指定された列でソート
   * - 1.7: 取引先データが存在しない場合の空結果返却
   * - 1.8: デフォルトソート順をフリガナの昇順
   */
  async getPartners(
    filter: TradingPartnerFilter,
    pagination: PaginationInput,
    sort: SortInput
  ): Promise<PaginatedPartners> {
    // WHERE条件の構築
    const where: Prisma.TradingPartnerWhereInput = {
      deletedAt: null,
    };

    // 検索キーワード（取引先名またはフリガナの部分一致）
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' as const } },
        { nameKana: { contains: filter.search, mode: 'insensitive' as const } },
      ];
    }

    // 種別フィルター（リレーション経由）
    if (filter.type) {
      where.types = {
        some: {
          type: filter.type,
        },
      };
    }

    // 総件数取得
    const total = await this.prisma.tradingPartner.count({ where });

    // 取引先一覧取得
    const partners = await this.prisma.tradingPartner.findMany({
      where,
      include: {
        types: true,
      },
      orderBy: { [sort.sort]: sort.order },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });

    return {
      data: partners.map((p) => this.toTradingPartnerInfo(p)),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * 取引先詳細取得
   *
   * IDによる単一取引先の詳細情報を取得します。
   * 論理削除されたレコードは取得対象外です。
   *
   * @param id - 取引先ID
   * @returns 取引先詳細情報
   * @throws TradingPartnerNotFoundError 取引先が見つからない場合
   *
   * Requirements:
   * - 3.1: ユーザーが一覧から取引先を選択したとき、取引先詳細ページを表示する
   * - 3.2: 全フィールド情報を詳細ページに表示する
   * - 3.4: プロジェクト管理機能が有効なとき、当該取引先に紐付くプロジェクト一覧を表示する（将来対応）
   */
  async getPartner(id: string): Promise<TradingPartnerDetail> {
    const partner = await this.prisma.tradingPartner.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        types: true,
      },
    });

    if (!partner) {
      throw new TradingPartnerNotFoundError(id);
    }

    // 将来的にプロジェクト連携を追加する際は、ここでプロジェクト情報を取得
    // const projects = await this.getRelatedProjects(id);

    return this.toTradingPartnerInfo(partner);
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
