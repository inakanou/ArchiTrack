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
 * 案件の閲覧範囲（contract-management の Requirement 14.5・14.6、タスク19.1）: 契約書の作成・更新の要求が指す
 * 見積書が契約書のプロジェクトに属さなければ、見積書の不在と同じ 404 にして契約書を作成・更新しない。
 * 変更契約の作成の要求が指す基となる契約書が経路のプロジェクトに属さなければ、不在と同じ 422 にする。
 * 参照先の案件が実在し実行者の閲覧範囲外なら、user-authentication の要件39.7 に従い PROJECT_SCOPE_DENIED を
 * 処理の後に記録する。
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
  ContractDeletionConstraintError,
} from '../errors/contractError.js';
import { ProjectNotFoundError } from '../errors/projectError.js';
import { EstimateNotFoundError } from '../errors/estimateError.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { AuditLogService } from './audit-log.service.js';
import { getSharedProjectScopeService, type ProjectScopeService } from './project-scope.service.js';
import {
  withSurveyScopeDenialRecording,
  type ProjectScopeDenialContext,
} from './project-scope-denial.service.js';

/**
 * ContractService依存関係
 */
export interface ContractServiceDependencies {
  prisma: PrismaClient;
  /**
   * 範囲外の拒否（PROJECT_SCOPE_DENIED）の記録に用いる監査ログ（任意。タスク19.1、Requirement 14.5・14.6）。
   * 未指定の場合は `prisma` で組み立てる。
   */
  auditLogService?: Pick<IAuditLogService, 'createLog'>;
  /**
   * 案件の閲覧範囲の判定（任意。タスク19.1、Requirement 14.5・14.6）。
   * 要求が指す他のプロジェクトの見積書・基となる契約書の案件が範囲外かを判定し、範囲外の拒否を記録するために
   * 用いる。未指定の場合は user-authentication の共有のインスタンス（{@link getSharedProjectScopeService}）で
   * 判定する。
   */
  projectScope?: Pick<ProjectScopeService, 'evaluateProjectAccess'>;
}

/**
 * 変更契約の作成の要求が指す基となる契約書が見つからない場合の本文。
 * 経路のプロジェクトに属さない基となる契約書も同じ本文にする（Requirement 14.6）
 */
const PARENT_CONTRACT_NOT_REFERABLE_MESSAGE =
  '基となる契約書は同じプロジェクトの契約書である必要があります';

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
  private readonly auditLogService: Pick<IAuditLogService, 'createLog'>;
  private readonly projectScope: Pick<ProjectScopeService, 'evaluateProjectAccess'>;

  constructor(deps: ContractServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService ?? new AuditLogService({ prisma: deps.prisma });
    // 共有のインスタンスは判定の時に引く（構築時に読まない）
    this.projectScope = deps.projectScope ?? {
      evaluateProjectAccess: (userId, projectId) =>
        getSharedProjectScopeService().evaluateProjectAccess(userId, projectId),
    };
  }

  /**
   * 参照先（見積書・基となる契約書）の案件が作成先・更新先のプロジェクトと食い違うとき、その案件が実行者の
   * 閲覧範囲外（案件は実在する）なら `deniedProjectIds` へ入れる（user-authentication の要件39.7）。
   * 範囲内の他のプロジェクトと案件の不在・論理削除は記録しない
   */
  private async noteOutOfScopeReference(
    actorId: string | undefined,
    referencedProjectId: string,
    deniedProjectIds: Set<string>
  ): Promise<void> {
    if (actorId === undefined) {
      return;
    }
    const decision = await this.projectScope.evaluateProjectAccess(actorId, referencedProjectId);
    if (decision === 'out_of_scope') {
      deniedProjectIds.add(referencedProjectId);
    }
  }

  /**
   * 参照先の照合で範囲外とした案件を、処理の後に PROJECT_SCOPE_DENIED として記録する
   * （user-authentication の要件39.7）。実行者が分からない（経路の外から呼ばれた）ときは記録しない
   */
  private withReferenceScopeRecording<T>(
    actorId: string | undefined,
    scopeDenialContext: ProjectScopeDenialContext | undefined,
    run: (deniedProjectIds: Set<string>) => Promise<T>
  ): Promise<T> {
    if (actorId === undefined) {
      return run(new Set<string>());
    }
    return withSurveyScopeDenialRecording(actorId, scopeDenialContext, this.auditLogService, run);
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
  async create(
    projectId: string,
    data: CreateContractInput,
    actorId?: string,
    scopeDenialContext?: ProjectScopeDenialContext
  ): Promise<ContractDetail> {
    // 見積書・基となる契約書の所属の照合（14.5・14.6）で範囲外とした案件は、処理の後に
    // PROJECT_SCOPE_DENIED として記録する（user-authentication の要件39.7）
    return this.withReferenceScopeRecording(actorId, scopeDenialContext, (deniedProjectIds) =>
      this.createWithin(projectId, data, actorId, deniedProjectIds)
    );
  }

  /** {@link create} の本体。参照先の案件を範囲外と判定したら `deniedProjectIds` へ入れる */
  private async createWithin(
    projectId: string,
    data: CreateContractInput,
    actorId: string | undefined,
    deniedProjectIds: Set<string>
  ): Promise<ContractDetail> {
    // 参照先の検証（design.md の Preconditions・Error Handling）
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, deletedAt: true },
    });
    if (!project || project.deletedAt) {
      throw new ProjectNotFoundError(projectId);
    }
    await this.assertEstimateReferable(projectId, data.estimateId, actorId, deniedProjectIds);

    // 変更契約の場合、parentContractIdが同プロジェクトであることを検証
    if (data.contractType === 'AMENDMENT' && data.parentContractId) {
      const parentContract = await this.prisma.contract.findUnique({
        where: { id: data.parentContractId },
      });

      // 論理削除済みの基となる契約書は、所属の不一致より先に、不在と同じ 422 と同じ本文で拒否する（14.8）。
      // 属する案件が範囲外でも範囲外の拒否として記録しない（解決関数が論理削除済みを不在として扱うのに揃える）
      if (parentContract?.deletedAt) {
        throw new ContractValidationError(PARENT_CONTRACT_NOT_REFERABLE_MESSAGE);
      }
      // 存在しない基となる契約書と経路のプロジェクトに属さない基となる契約書は、同じ 422 と同じ本文にする
      // （14.6）。範囲外（案件は実在する）のときだけ、範囲外の拒否として記録する（要件39.7）
      if (!parentContract || parentContract.projectId !== projectId) {
        if (parentContract) {
          await this.noteOutOfScopeReference(actorId, parentContract.projectId, deniedProjectIds);
        }
        throw new ContractValidationError(PARENT_CONTRACT_NOT_REFERABLE_MESSAGE);
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
  async update(
    id: string,
    data: UpdateContractInput,
    actorId?: string,
    scopeDenialContext?: ProjectScopeDenialContext
  ): Promise<ContractDetail> {
    // 見積書の所属の照合（14.5）で範囲外とした案件は、処理の後に PROJECT_SCOPE_DENIED として記録する
    // （user-authentication の要件39.7）
    return this.withReferenceScopeRecording(actorId, scopeDenialContext, (deniedProjectIds) =>
      this.updateWithin(id, data, actorId, deniedProjectIds)
    );
  }

  /** {@link update} の本体。見積書の案件を範囲外と判定したら `deniedProjectIds` へ入れる */
  private async updateWithin(
    id: string,
    data: UpdateContractInput,
    actorId: string | undefined,
    deniedProjectIds: Set<string>
  ): Promise<ContractDetail> {
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

    // 見積書を付け替える場合だけ参照先を検証する。付け替えない場合は、作成後に
    // 見積書が論理削除されていても他の項目の編集を妨げない
    if (data.estimateId !== existing.estimateId) {
      await this.assertEstimateReferable(
        existing.projectId,
        data.estimateId,
        actorId,
        deniedProjectIds
      );
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
   * 契約の基として見積書を参照できることを確かめる
   *
   * design.md の ContractService の Preconditions（見積書は同じプロジェクトのもの）と
   * Error Handling（見積書が見つからなければ 404、論理削除済みの見積書の参照は 422）に従う。
   * 契約書のプロジェクトに属さない見積書は、範囲の内外と論理削除の有無を問わず見積書の不在と同じ 404 にする
   * （Requirement 14.5。他のプロジェクトの見積書の実在を推測させない）。
   *
   * @param actorId - 実行者ID（属さない見積書の案件が範囲外かの判定に用いる）
   * @param deniedProjectIds - 範囲外と判定した案件を入れる集合（処理の後に記録する）
   * @throws EstimateNotFoundError 見積書が存在しない、または契約書のプロジェクトに属さない場合（404）
   * @throws ContractValidationError 同じプロジェクトの論理削除済みの見積書の場合（422）
   */
  private async assertEstimateReferable(
    projectId: string,
    estimateId: string,
    actorId: string | undefined,
    deniedProjectIds: Set<string>
  ): Promise<void> {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { id: true, projectId: true, deletedAt: true },
    });

    if (!estimate) {
      throw new EstimateNotFoundError(estimateId);
    }
    if (estimate.projectId !== projectId) {
      // 範囲の内外で応答を変えると他のプロジェクトの見積書の実在を推測させるため、不在と同じ応答にする。
      // 範囲外（案件は実在する）のときだけ、範囲外の拒否として記録する（要件39.7）
      await this.noteOutOfScopeReference(actorId, estimate.projectId, deniedProjectIds);
      throw new EstimateNotFoundError(estimateId);
    }
    if (estimate.deletedAt) {
      throw new ContractValidationError('削除された見積書は契約の基として選択できません');
    }
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
   * 契約書論理削除（制約チェック付き）
   *
   * Requirements:
   * - 8.11: 契約書論理削除
   * - 12.1: 子契約が存在する場合の削除拒否
   * - 12.2: ステータスが契約済の場合の削除拒否
   *
   * @throws ContractNotFoundError 契約書が見つからない場合
   * @throws ContractDeletionConstraintError 子契約が存在する場合
   * @throws ContractDeletionConstraintError ステータスがCONTRACTEDの場合
   */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new ContractNotFoundError();
    }

    // 削除制約チェック: 子契約（deletedAtがnullの変更契約）の存在確認
    const activeChildContracts = await this.prisma.contract.findMany({
      where: {
        parentContractId: id,
        deletedAt: null,
      },
    });

    if (activeChildContracts.length > 0) {
      throw new ContractDeletionConstraintError(
        'この契約書は変更契約の基となっているため削除できません'
      );
    }

    // 削除制約チェック: ステータスがCONTRACTEDの場合
    if (existing.status === 'CONTRACTED') {
      throw new ContractDeletionConstraintError(
        '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください'
      );
    }

    await this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
