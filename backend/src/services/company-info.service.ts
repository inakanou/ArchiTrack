/**
 * @fileoverview 自社情報サービス
 *
 * 自社情報の取得・作成・更新（upsert）機能を提供します。
 * 自社情報は1件のみ存在するシングルトンパターンで管理されます。
 *
 * Requirements:
 * - 2.1: ユーザーが有効なデータを入力して保存ボタンをクリックしたとき、自社情報をデータベースに保存
 * - 2.2: 自社情報が未登録の場合、新規レコードを作成
 * - 2.3: 自社情報が既に登録されている場合、既存レコードを更新
 * - 2.7: 楽観的排他制御（versionフィールド）を実装し、同時更新による競合を検出
 * - 2.8: 楽観的排他制御で競合が検出された場合、エラーを返却
 * - 6.10: 自社情報の保存操作を監査ログに記録
 * - 9.1-9.10: API設計仕様に準拠
 *
 * Design Reference: design.md - company-info.service.ts セクション
 *
 * @module services/company-info
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { COMPANY_INFO_TARGET_TYPE } from '../types/audit-log.types.js';
import { CompanyInfoConflictError } from '../errors/companyInfoError.js';

/**
 * CompanyInfoService依存関係
 */
export interface CompanyInfoServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 自社情報（レスポンス用）
 *
 * Requirements: 9.7 - APIレスポンスフィールド
 */
export interface CompanyInfoResponse {
  id: string;
  companyName: string;
  address: string;
  representative: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  invoiceRegistrationNumber: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 自社情報upsert入力
 *
 * Requirements: 2.1, 9.4, 9.8 - 自社情報の作成・更新
 */
export interface UpsertCompanyInfoInput {
  companyName: string;
  address: string;
  representative: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  invoiceRegistrationNumber?: string | null;
  version?: number; // 更新時必須
}

/**
 * 自社情報サービス
 *
 * 自社情報の取得・作成・更新を担当します。
 * シングルトンパターンで1件のみ管理します。
 */
export class CompanyInfoService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: CompanyInfoServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 自社情報を取得する
   *
   * Requirements:
   * - 9.1: GET /api/company-info エンドポイントで自社情報取得機能を提供
   * - 9.2: 自社情報が登録されている場合、自社情報オブジェクトを返却
   * - 9.3: 自社情報が未登録の場合、nullを返却（APIレイヤーで空オブジェクトに変換）
   *
   * @returns 自社情報（未登録時はnull）
   */
  async getCompanyInfo(): Promise<CompanyInfoResponse | null> {
    const companyInfo = await this.prisma.companyInfo.findFirst();

    if (!companyInfo) {
      return null;
    }

    return this.toCompanyInfoResponse(companyInfo);
  }

  /**
   * 自社情報を作成または更新する（upsert）
   *
   * トランザクション内で以下を実行:
   * 1. 既存の自社情報を確認
   * 2. 未登録の場合: 新規作成
   * 3. 登録済みの場合: 楽観的排他制御チェック後に更新
   * 4. 監査ログを記録
   *
   * Requirements:
   * - 2.1: 有効なデータで自社情報をデータベースに保存
   * - 2.2: 自社情報が未登録の場合、新規レコードを作成
   * - 2.3: 自社情報が既に登録されている場合、既存レコードを更新
   * - 2.7: 楽観的排他制御（versionフィールド）を実装
   * - 2.8: 楽観的排他制御で競合が検出された場合、エラーを返却
   * - 6.10: 自社情報の保存操作を監査ログに記録
   * - 9.4: PUT /api/company-info エンドポイントで自社情報の作成・更新機能を提供
   * - 9.5: 自社情報が存在しない状態でPUTリクエストを受信したとき、新規レコードを作成
   * - 9.6: 自社情報が存在する状態でPUTリクエストを受信したとき、既存レコードを更新
   * - 9.8: PUTリクエストのボディにversionフィールドを含め、楽観的排他制御を実行
   * - 9.9: versionが一致しない場合、409 Conflictエラーを返却
   *
   * @param input 自社情報データ
   * @param actorId 操作ユーザーID（監査ログ用）
   * @returns 作成/更新された自社情報
   * @throws CompanyInfoConflictError 楽観的排他制御で競合が発生した場合
   */
  async upsertCompanyInfo(
    input: UpsertCompanyInfoInput,
    actorId: string
  ): Promise<CompanyInfoResponse> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 既存の自社情報を確認
      const existing = await tx.companyInfo.findFirst();

      if (!existing) {
        // 2. 未登録の場合: 新規作成
        const created = await tx.companyInfo.create({
          data: {
            companyName: input.companyName,
            address: input.address,
            representative: input.representative,
            phone: input.phone ?? null,
            fax: input.fax ?? null,
            email: input.email ?? null,
            invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? null,
            version: 1, // 初期バージョン
          },
        });

        // 監査ログを記録
        await this.auditLogService.createLog({
          action: 'COMPANY_INFO_CREATED',
          actorId,
          targetType: COMPANY_INFO_TARGET_TYPE,
          targetId: created.id,
          before: null,
          after: this.toAuditLogData(created),
        });

        return this.toCompanyInfoResponse(created);
      }

      // 3. 登録済みの場合: 楽観的排他制御チェック
      // versionが指定されていない、または一致しない場合は競合エラー
      if (input.version === undefined || input.version !== existing.version) {
        throw new CompanyInfoConflictError(undefined, {
          expectedVersion: input.version,
          actualVersion: existing.version,
        });
      }

      // 4. 更新実行
      const updated = await tx.companyInfo.update({
        where: { id: existing.id },
        data: {
          companyName: input.companyName,
          address: input.address,
          representative: input.representative,
          phone: input.phone ?? null,
          fax: input.fax ?? null,
          email: input.email ?? null,
          invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? null,
          version: existing.version + 1, // バージョンをインクリメント
        },
      });

      // 監査ログを記録
      await this.auditLogService.createLog({
        action: 'COMPANY_INFO_UPDATED',
        actorId,
        targetType: COMPANY_INFO_TARGET_TYPE,
        targetId: updated.id,
        before: this.toAuditLogData(existing),
        after: this.toAuditLogData(updated),
      });

      return this.toCompanyInfoResponse(updated);
    });
  }

  /**
   * データベースの結果をCompanyInfoResponseに変換
   */
  private toCompanyInfoResponse(companyInfo: {
    id: string;
    companyName: string;
    address: string;
    representative: string;
    phone: string | null;
    fax: string | null;
    email: string | null;
    invoiceRegistrationNumber: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): CompanyInfoResponse {
    return {
      id: companyInfo.id,
      companyName: companyInfo.companyName,
      address: companyInfo.address,
      representative: companyInfo.representative,
      phone: companyInfo.phone,
      fax: companyInfo.fax,
      email: companyInfo.email,
      invoiceRegistrationNumber: companyInfo.invoiceRegistrationNumber,
      version: companyInfo.version,
      createdAt: companyInfo.createdAt,
      updatedAt: companyInfo.updatedAt,
    };
  }

  /**
   * 監査ログ用データに変換
   * Prisma.InputJsonValueの型要件を満たすためにJsonObjectを返却
   */
  private toAuditLogData(companyInfo: {
    companyName: string;
    address: string;
    representative: string;
    phone: string | null;
    fax: string | null;
    email: string | null;
    invoiceRegistrationNumber: string | null;
    version: number;
  }): Prisma.InputJsonValue {
    return {
      companyName: companyInfo.companyName,
      address: companyInfo.address,
      representative: companyInfo.representative,
      phone: companyInfo.phone,
      fax: companyInfo.fax,
      email: companyInfo.email,
      invoiceRegistrationNumber: companyInfo.invoiceRegistrationNumber,
      version: companyInfo.version,
    };
  }
}
