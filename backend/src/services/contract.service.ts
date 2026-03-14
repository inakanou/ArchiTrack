/**
 * @fileoverview 契約書サービス
 *
 * 契約書のCRUD操作、ステータス遷移、関連データ取得のビジネスロジックを担当します。
 *
 * Requirements:
 * - 1.1, 1.2: 契約書リスト表示
 * - 7.1: 契約書作成
 * - 8.1: 契約書詳細表示
 * - 8.2, 8.3: ステータス双方向遷移
 * - 9.2: 契約書更新（楽観的排他制御）
 *
 * Design Reference: design.md - ContractService セクション
 *
 * @module services/contract
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  CreateContractInput,
  UpdateContractInput,
  ContractListQuery,
} from '../schemas/contract.schema.js';
import {
  ContractNotFoundError,
  ContractConflictError,
  ContractValidationError,
} from '../errors/contractError.js';

/**
 * ContractService依存関係
 */
export interface ContractServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 契約書一覧アイテム
 */
export interface ContractListItem {
  id: string;
  contractType: string;
  contractDate: string;
  status: string;
  contractAmount: number;
  estimateName: string | null;
  parentContractId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 契約書詳細
 */
export interface ContractDetail {
  id: string;
  projectId: string;
  contractType: string;
  status: string;
  parentContractId: string | null;
  estimateId: string;
  contractDate: string;
  constructionStartDate: string;
  constructionEndDate: string;
  deliveryDate: string;
  taxRate: number;
  paymentTerms: string;
  separateConstruction: string;
  otherNotes: string;
  supervisorTradingPartnerId: string | null;
  contractAmount: number;
  constructionPrice: number;
  taxAmount: number;
  estimate: { id: string; name: string } | null;
  parentContract: { id: string; contractType: string; contractDate: string } | null;
  supervisorTradingPartner: { id: string; name: string } | null;
  project: {
    id: string;
    name: string;
    siteAddress: string | null;
    tradingPartner: { id: string; name: string } | null;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * リレーション展開のinclude定義
 */
const DETAIL_INCLUDE = {
  estimate: {
    select: { id: true, name: true },
  },
  parentContract: {
    select: { id: true, contractType: true, contractDate: true },
  },
  supervisorTradingPartner: {
    select: { id: true, name: true },
  },
  project: {
    select: {
      id: true,
      name: true,
      siteAddress: true,
      tradingPartner: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

/**
 * Prismaレコードから数値型を安全に変換するヘルパー
 */
function toNumber(val: unknown): number {
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

/**
 * Prismaレコードを ContractDetail に変換
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toContractDetail(record: any): ContractDetail {
  return {
    id: record.id,
    projectId: record.projectId,
    contractType: record.contractType,
    status: record.status,
    parentContractId: record.parentContractId,
    estimateId: record.estimateId,
    contractDate:
      record.contractDate instanceof Date
        ? record.contractDate.toISOString().split('T')[0]
        : String(record.contractDate),
    constructionStartDate:
      record.constructionStartDate instanceof Date
        ? record.constructionStartDate.toISOString().split('T')[0]
        : String(record.constructionStartDate),
    constructionEndDate:
      record.constructionEndDate instanceof Date
        ? record.constructionEndDate.toISOString().split('T')[0]
        : String(record.constructionEndDate),
    deliveryDate:
      record.deliveryDate instanceof Date
        ? record.deliveryDate.toISOString().split('T')[0]
        : String(record.deliveryDate),
    taxRate: toNumber(record.taxRate),
    paymentTerms: record.paymentTerms,
    separateConstruction: record.separateConstruction,
    otherNotes: record.otherNotes,
    supervisorTradingPartnerId: record.supervisorTradingPartnerId,
    contractAmount: toNumber(record.contractAmount),
    constructionPrice: toNumber(record.constructionPrice),
    taxAmount: toNumber(record.taxAmount),
    estimate: record.estimate ? { id: record.estimate.id, name: record.estimate.name } : null,
    parentContract: record.parentContract
      ? {
          id: record.parentContract.id,
          contractType: record.parentContract.contractType,
          contractDate:
            record.parentContract.contractDate instanceof Date
              ? record.parentContract.contractDate.toISOString().split('T')[0]
              : String(record.parentContract.contractDate),
        }
      : null,
    supervisorTradingPartner: record.supervisorTradingPartner
      ? {
          id: record.supervisorTradingPartner.id,
          name: record.supervisorTradingPartner.name,
        }
      : null,
    project: {
      id: record.project.id,
      name: record.project.name,
      siteAddress: record.project.siteAddress,
      tradingPartner: record.project.tradingPartner
        ? {
            id: record.project.tradingPartner.id,
            name: record.project.tradingPartner.name,
          }
        : null,
    },
    version: record.version,
    createdAt:
      record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    updatedAt:
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : String(record.updatedAt),
  };
}

/**
 * Prismaレコードを ContractListItem に変換
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toContractListItem(record: any): ContractListItem {
  return {
    id: record.id,
    contractType: record.contractType,
    contractDate:
      record.contractDate instanceof Date
        ? record.contractDate.toISOString().split('T')[0]
        : String(record.contractDate),
    status: record.status,
    contractAmount: toNumber(record.contractAmount),
    estimateName: record.estimate?.name ?? null,
    parentContractId: record.parentContractId,
    createdAt:
      record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt),
    updatedAt:
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : String(record.updatedAt),
  };
}

/**
 * 契約書サービス
 *
 * 契約書のCRUD操作とステータス遷移を担当します。
 */
export class ContractService {
  private readonly prisma: PrismaClient;

  constructor(deps: ContractServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * プロジェクトスコープの契約書一覧取得
   *
   * Requirements:
   * - 1.1: 契約書リスト表示
   * - 1.2: 契約種類・契約日・ステータス表示
   */
  async findByProject(
    projectId: string,
    query: ContractListQuery
  ): Promise<{ contracts: ContractListItem[]; total: number }> {
    const { page, limit, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = {
      projectId,
      deletedAt: null,
    };

    const [contracts, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          estimate: {
            select: { id: true, name: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      contracts: contracts.map(toContractListItem),
      total,
    };
  }

  /**
   * 契約書詳細取得
   *
   * Requirements:
   * - 8.1: 詳細画面全項目表示
   */
  async findById(id: string): Promise<ContractDetail | null> {
    const record = await this.prisma.contract.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!record || record.deletedAt) {
      return null;
    }

    return toContractDetail(record);
  }

  /**
   * 契約書作成
   *
   * Requirements:
   * - 7.1: 契約書作成
   * - 8.1: ステータスBEFORE_CONTRACTで初期化
   */
  async create(projectId: string, data: CreateContractInput): Promise<ContractDetail> {
    // 変更契約の場合、parentContractIdが同プロジェクトであることを検証
    if (data.contractType === 'AMENDMENT' && data.parentContractId) {
      const parentContract = await this.prisma.contract.findUnique({
        where: { id: data.parentContractId },
      });

      if (!parentContract || parentContract.projectId !== projectId) {
        throw new ContractValidationError(
          '基となる契約書は同じプロジェクトの契約書である必要があります'
        );
      }
    }

    const record = await this.prisma.contract.create({
      data: {
        projectId,
        contractType: data.contractType,
        status: 'BEFORE_CONTRACT',
        parentContractId: data.parentContractId ?? null,
        estimateId: data.estimateId,
        contractDate: new Date(data.contractDate),
        constructionStartDate: new Date(data.constructionStartDate),
        constructionEndDate: new Date(data.constructionEndDate),
        deliveryDate: new Date(data.deliveryDate),
        taxRate: data.taxRate,
        paymentTerms: data.paymentTerms,
        separateConstruction: data.separateConstruction,
        otherNotes: data.otherNotes,
        supervisorTradingPartnerId: data.supervisorTradingPartnerId ?? null,
        contractAmount: data.contractAmount,
        constructionPrice: data.constructionPrice,
        taxAmount: data.taxAmount,
      },
      include: DETAIL_INCLUDE,
    });

    return toContractDetail(record);
  }

  /**
   * 契約書更新
   *
   * Requirements:
   * - 9.2: 楽観的排他制御（version検証）
   */
  async update(id: string, data: UpdateContractInput): Promise<ContractDetail> {
    // 既存レコードの取得と検証
    const existing = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new ContractNotFoundError();
    }

    // 楽観的排他制御: version検証
    if (existing.version !== data.version) {
      throw new ContractConflictError();
    }

    const record = await this.prisma.contract.update({
      where: { id },
      data: {
        estimateId: data.estimateId,
        contractDate: new Date(data.contractDate),
        constructionStartDate: new Date(data.constructionStartDate),
        constructionEndDate: new Date(data.constructionEndDate),
        deliveryDate: new Date(data.deliveryDate),
        taxRate: data.taxRate,
        paymentTerms: data.paymentTerms,
        separateConstruction: data.separateConstruction,
        otherNotes: data.otherNotes,
        supervisorTradingPartnerId: data.supervisorTradingPartnerId ?? null,
        contractAmount: data.contractAmount,
        constructionPrice: data.constructionPrice,
        taxAmount: data.taxAmount,
        version: { increment: 1 },
      },
      include: DETAIL_INCLUDE,
    });

    return toContractDetail(record);
  }

  /**
   * 契約書ステータス遷移
   *
   * Requirements:
   * - 8.2, 8.3: BEFORE_CONTRACT <-> CONTRACTED の双方向遷移
   */
  async updateStatus(
    id: string,
    status: 'BEFORE_CONTRACT' | 'CONTRACTED'
  ): Promise<ContractDetail> {
    // 既存レコードの取得と検証
    const existing = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new ContractNotFoundError();
    }

    // ステータス更新
    await this.prisma.contract.update({
      where: { id },
      data: { status },
    });

    // 更新後の詳細を取得して返却
    const updated = await this.prisma.contract.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    return toContractDetail(updated);
  }

  /**
   * プロジェクトの直近の契約書と総数を取得する
   *
   * detail-summary APIでの一括取得用メソッド。
   * EstimateService.findLatestByProjectId と同じパターンを使用。
   *
   * Requirements (project-management):
   * - 37.1: detail-summary APIのレスポンスに契約書セクションデータ（contracts）を含める
   * - 37.2: 契約書セクションデータに総数（totalCount）と直近の契約書（latestContracts）を含める
   * - 37.3: 直近の契約書データに契約ID、契約種類、契約日、ステータス、請負代金額、作成日時を含める
   *
   * @param projectId - プロジェクトID
   * @param limit - 取得件数（デフォルト: 3）
   * @returns 契約書サマリー（totalCount, latestContracts）
   */
  async findLatestByProjectId(
    projectId: string,
    limit: number = 3
  ): Promise<{
    totalCount: number;
    latestContracts: Array<{
      id: string;
      contractType: string;
      contractDate: string;
      status: string;
      contractAmount: number;
      createdAt: string;
    }>;
  }> {
    const where = {
      projectId,
      deletedAt: null,
    };

    const [contracts, totalCount] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          contractType: true,
          contractDate: true,
          status: true,
          contractAmount: true,
          createdAt: true,
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      totalCount,
      latestContracts: contracts.map((c) => {
        const dateStr =
          c.contractDate instanceof Date
            ? c.contractDate.toISOString().split('T')[0]
            : String(c.contractDate);
        return {
          id: c.id,
          contractType: c.contractType,
          contractDate: dateStr ?? String(c.contractDate),
          status: c.status,
          contractAmount: toNumber(c.contractAmount),
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
        };
      }),
    };
  }

  /**
   * 契約書論理削除
   */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new ContractNotFoundError();
    }

    await this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
