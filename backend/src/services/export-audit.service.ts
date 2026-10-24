/**
 * @fileoverview データ出力の記録（ExportAuditService）
 *
 * データの出力・一括ダウンロードを監査ログ `DATA_EXPORTED` に記録する共通の手段
 * （user-authentication タスク53.3、要件40.9。design.md「監査」の ExportAuditService の節）。
 * - 実行者・出力の種別・対象の案件・対象のデータの ID・件数を記録し、日時は監査ログの行の作成日時が持つ
 * - 案件を指定した記録は ProjectScopeService で判定し、範囲外と不在・論理削除を区別せず PROJECT_OUT_OF_SCOPE
 *   （API では存在しない案件と同じ 404）とする。範囲外のときだけ監査 PROJECT_SCOPE_DENIED を記録し、
 *   その記録の失敗は結果を変えない
 * - 記録の失敗は RECORD_FAILED を返す。呼び出し側は出力を中止する
 * - サーバー側で生成する出力は各業務機能のハンドラーから record を直接呼び、ブラウザで生成する出力は
 *   `POST /api/v1/audit-logs/exports` を出力の開始前に呼ぶ
 * - 利用者ごとの出力の急増の観測（SecurityAnomalyMonitor.observe('data_export')）はタスク55.4 で配線する
 */

import type { IAuditLogService } from '../types/audit-log.types.js';
import type { RequestContext } from '../types/auth.types.js';
import type { ProjectScopeService } from './project-scope.service.js';
import { Ok, Err, type Result } from '../types/result.js';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../utils/audit-text.js';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';

/** 出力の種別（design.md の ExportKind） */
export const EXPORT_KINDS = [
  'site_survey_report_pdf',
  'site_survey_images_zip',
  'quantity_table_pdf',
  'itemized_statement_xlsx',
  'estimate_request_xlsx',
  'estimate_pdf',
  'estimate_xlsx',
  'schedule_export',
  'order_export',
  'progress_export',
  'construction_photo_ledger_pdf',
  'construction_photos_zip',
  'annotated_image',
  'audit_log_json',
] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

/** 案件に属さない出力の種別。これ以外の種別は案件の指定を必須とする */
export const PROJECTLESS_EXPORT_KINDS: readonly ExportKind[] = ['audit_log_json'];

/** 監査に書く対象のデータの ID の数の上限（元の数は targetIdCount に残す） */
export const EXPORT_AUDIT_MAX_TARGET_IDS = 1000;
/** 監査に書く対象のデータの ID 一つの長さの上限 */
export const EXPORT_AUDIT_TARGET_ID_MAX_LENGTH = 128;

/** 記録の入力（design.md の ExportRecordInput） */
export interface ExportRecordInput {
  kind: ExportKind;
  /** 案件に属する出力は必須。属さない出力は null */
  projectId: string | null;
  /** 出力の対象のデータの ID */
  targetIds: string[];
  /** 出力した件数 */
  itemCount: number;
}

export type ExportAuditError = { type: 'PROJECT_OUT_OF_SCOPE' } | { type: 'RECORD_FAILED' };

export interface ExportAuditServiceDependencies {
  auditLogService: Pick<IAuditLogService, 'createLog'>;
  scopeService: Pick<ProjectScopeService, 'evaluateProjectAccess'>;
}

/** 案件に属さない出力の監査の対象の種別（対象の ID には出力の種別を書く） */
const PROJECTLESS_TARGET_TYPE = 'DataExport';

/** 要求の送信元を監査に書ける長さで metadata の形にする */
function requestMetadata(ctx: RequestContext): Record<string, string | boolean> {
  const metadata: Record<string, string | boolean> = {};
  if (ctx.ipAddress !== undefined) {
    metadata.ipAddress = boundAuditText(ctx.ipAddress, AUDIT_IP_ADDRESS_MAX_LENGTH).value;
  }
  if (ctx.userAgent !== undefined) {
    const userAgent = boundAuditText(ctx.userAgent, AUDIT_USER_AGENT_MAX_LENGTH);
    metadata.userAgent = userAgent.value;
    if (userAgent.truncated) {
      metadata.userAgentTruncated = true;
    }
  }
  return metadata;
}

export class ExportAuditService {
  constructor(private readonly deps: ExportAuditServiceDependencies) {}

  /**
   * データの出力を監査に記録する
   *
   * @param actorId - 出力した利用者
   * @param input - 種別・案件・対象・件数
   * @param ctx - 要求の送信元
   * @returns 記録した監査ログの ID。範囲外・不在の案件は PROJECT_OUT_OF_SCOPE、記録の失敗は RECORD_FAILED
   */
  async record(
    actorId: string,
    input: ExportRecordInput,
    ctx: RequestContext
  ): Promise<Result<{ recordId: string }, ExportAuditError>> {
    if (input.projectId !== null) {
      // 判定は要求のたびに案件を読む。DB の障害は呼び出し側のエラー処理へ渡す
      const decision = await this.deps.scopeService.evaluateProjectAccess(actorId, input.projectId);
      if (decision !== 'allowed') {
        if (decision === 'out_of_scope') {
          await this.recordScopeDenied(actorId, input, ctx);
        }
        return Err({ type: 'PROJECT_OUT_OF_SCOPE' });
      }
    }

    const boundedIds = input.targetIds
      .slice(0, EXPORT_AUDIT_MAX_TARGET_IDS)
      .map((id) => boundAuditText(id, EXPORT_AUDIT_TARGET_ID_MAX_LENGTH));
    const targetIdsTruncated =
      input.targetIds.length > EXPORT_AUDIT_MAX_TARGET_IDS || boundedIds.some((id) => id.truncated);

    try {
      const log = await this.deps.auditLogService.createLog({
        action: 'DATA_EXPORTED',
        actorId,
        targetType: input.projectId !== null ? 'Project' : PROJECTLESS_TARGET_TYPE,
        targetId: input.projectId ?? input.kind,
        metadata: {
          kind: input.kind,
          projectId: input.projectId,
          targetIds: boundedIds.map((id) => id.value),
          targetIdCount: input.targetIds.length,
          ...(targetIdsTruncated && { targetIdsTruncated: true }),
          itemCount: input.itemCount,
          ...requestMetadata(ctx),
        },
      });
      return Ok({ recordId: log.id });
    } catch (error) {
      logger.error(
        { err: error, actorId, kind: input.kind, projectId: input.projectId },
        'Failed to record data export'
      );
      captureException(error instanceof Error ? error : new Error(String(error)), {
        operation: 'export_audit_record',
        kind: input.kind,
      });
      return Err({ type: 'RECORD_FAILED' });
    }
  }

  /** 範囲外の案件の出力の記録の要求を監査に残す。記録の失敗は結果を変えない（要件39.7） */
  private async recordScopeDenied(
    actorId: string,
    input: ExportRecordInput,
    ctx: RequestContext
  ): Promise<void> {
    logger.warn(
      { userId: actorId, projectId: input.projectId, kind: input.kind },
      'Project scope denied for export record'
    );
    try {
      await this.deps.auditLogService.createLog({
        action: 'PROJECT_SCOPE_DENIED',
        actorId,
        targetType: 'Project',
        targetId: input.projectId as string,
        metadata: { exportKind: input.kind, ...requestMetadata(ctx) },
      });
    } catch (error) {
      logger.error(
        { err: error, userId: actorId, projectId: input.projectId },
        'Failed to record project scope denial'
      );
    }
  }
}
