/**
 * @fileoverview データ出力の記録（ExportAuditService）の単体テスト（user-authentication タスク53.3）
 *
 * Requirements (user-authentication):
 * - REQ-40.9: 実行者・出力の種別・対象の案件とデータ・件数を監査ログに記録し、案件を指定した記録は閲覧範囲で判定する
 *
 * 監査ログの記録は AuditLogService の偽物で、閲覧範囲の判定は ProjectScopeService の偽物で与える。
 * 日時は監査ログの行の作成日時（createdAt）が持つ。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ExportAuditService,
  EXPORT_AUDIT_MAX_TARGET_IDS,
  EXPORT_AUDIT_TARGET_ID_MAX_LENGTH,
  type ExportRecordInput,
} from '../../../services/export-audit.service.js';
import type { CreateAuditLogInput } from '../../../types/audit-log.types.js';
import type { ProjectAccessDecision } from '../../../services/project-scope.service.js';

const ACTOR = 'user-actor';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const CTX = { ipAddress: '203.0.113.5', userAgent: 'vitest-agent' };

function fakeAudit(fail: (input: CreateAuditLogInput) => boolean = () => false) {
  return {
    createLog: vi.fn(async (input: CreateAuditLogInput) => {
      if (fail(input)) {
        throw new Error('audit write failed');
      }
      return { id: `log-${input.action}` } as never;
    }),
  };
}

function fakeScope(decision: ProjectAccessDecision) {
  return { evaluateProjectAccess: vi.fn(async () => decision) };
}

const PROJECT_INPUT: ExportRecordInput = {
  kind: 'site_survey_report_pdf',
  projectId: PROJECT_ID,
  targetIds: ['survey-1', 'survey-2'],
  itemCount: 2,
};

describe('ExportAuditService.record', () => {
  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('範囲内の案件の出力を DATA_EXPORTED として実行者・種別・案件・対象・件数とともに記録する', async () => {
    const audit = fakeAudit();
    const scope = fakeScope('allowed');
    const service = new ExportAuditService({ auditLogService: audit, scopeService: scope });

    const result = await service.record(ACTOR, PROJECT_INPUT, CTX);

    expect(result).toEqual({ ok: true, value: { recordId: 'log-DATA_EXPORTED' } });
    expect(scope.evaluateProjectAccess).toHaveBeenCalledWith(ACTOR, PROJECT_ID);
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledWith({
      action: 'DATA_EXPORTED',
      actorId: ACTOR,
      targetType: 'Project',
      targetId: PROJECT_ID,
      metadata: {
        kind: 'site_survey_report_pdf',
        projectId: PROJECT_ID,
        targetIds: ['survey-1', 'survey-2'],
        targetIdCount: 2,
        itemCount: 2,
        ipAddress: '203.0.113.5',
        userAgent: 'vitest-agent',
      },
    });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('案件を指定しない出力は範囲の判定をせず、種別を対象として記録する', async () => {
    const audit = fakeAudit();
    const scope = fakeScope('out_of_scope');
    const service = new ExportAuditService({ auditLogService: audit, scopeService: scope });

    const result = await service.record(
      ACTOR,
      { kind: 'audit_log_json', projectId: null, targetIds: ['log-a'], itemCount: 1 },
      {}
    );

    expect(result.ok).toBe(true);
    expect(scope.evaluateProjectAccess).not.toHaveBeenCalled();
    expect(audit.createLog).toHaveBeenCalledWith({
      action: 'DATA_EXPORTED',
      actorId: ACTOR,
      targetType: 'DataExport',
      targetId: 'audit_log_json',
      metadata: {
        kind: 'audit_log_json',
        projectId: null,
        targetIds: ['log-a'],
        targetIdCount: 1,
        itemCount: 1,
      },
    });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('範囲外の案件は PROJECT_OUT_OF_SCOPE を返し、出力を記録せず範囲外のアクセスを記録する', async () => {
    const audit = fakeAudit();
    const service = new ExportAuditService({
      auditLogService: audit,
      scopeService: fakeScope('out_of_scope'),
    });

    const result = await service.record(ACTOR, PROJECT_INPUT, CTX);

    expect(result).toEqual({ ok: false, error: { type: 'PROJECT_OUT_OF_SCOPE' } });
    const actions = audit.createLog.mock.calls.map(([input]) => input.action);
    expect(actions).toEqual(['PROJECT_SCOPE_DENIED']);
    expect(audit.createLog.mock.calls[0]![0]).toMatchObject({
      actorId: ACTOR,
      targetType: 'Project',
      targetId: PROJECT_ID,
      metadata: { exportKind: 'site_survey_report_pdf', ipAddress: '203.0.113.5' },
    });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('存在しない・削除済みの案件は範囲外と同じ PROJECT_OUT_OF_SCOPE を返し、何も記録しない', async () => {
    const audit = fakeAudit();
    const service = new ExportAuditService({
      auditLogService: audit,
      scopeService: fakeScope('not_found'),
    });

    const result = await service.record(ACTOR, PROJECT_INPUT, CTX);

    expect(result).toEqual({ ok: false, error: { type: 'PROJECT_OUT_OF_SCOPE' } });
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('範囲外のアクセスの記録の失敗は PROJECT_OUT_OF_SCOPE を変えない', async () => {
    const audit = fakeAudit(() => true);
    const service = new ExportAuditService({
      auditLogService: audit,
      scopeService: fakeScope('out_of_scope'),
    });

    const result = await service.record(ACTOR, PROJECT_INPUT, CTX);

    expect(result).toEqual({ ok: false, error: { type: 'PROJECT_OUT_OF_SCOPE' } });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('出力の記録の失敗は RECORD_FAILED を返す', async () => {
    const service = new ExportAuditService({
      auditLogService: fakeAudit((input) => input.action === 'DATA_EXPORTED'),
      scopeService: fakeScope('allowed'),
    });

    const result = await service.record(ACTOR, PROJECT_INPUT, CTX);

    expect(result).toEqual({ ok: false, error: { type: 'RECORD_FAILED' } });
  });

  /**
   * @requirement user-authentication/REQ-40.9
   */
  it('対象の ID の数と長さ、ユーザーエージェントを上限までに切り詰め、元の数を残す', async () => {
    const audit = fakeAudit();
    const service = new ExportAuditService({
      auditLogService: audit,
      scopeService: fakeScope('allowed'),
    });
    const many = Array.from({ length: EXPORT_AUDIT_MAX_TARGET_IDS + 5 }, (_, i) => `id-${i}`);
    const long = 'x'.repeat(EXPORT_AUDIT_TARGET_ID_MAX_LENGTH + 50);

    await service.record(
      ACTOR,
      { ...PROJECT_INPUT, targetIds: [long, ...many], itemCount: many.length + 1 },
      { userAgent: 'u'.repeat(2000) }
    );

    const metadata = audit.createLog.mock.calls[0]![0].metadata as Record<string, unknown>;
    const stored = metadata.targetIds as string[];
    expect(stored).toHaveLength(EXPORT_AUDIT_MAX_TARGET_IDS);
    expect(stored[0]).toHaveLength(EXPORT_AUDIT_TARGET_ID_MAX_LENGTH);
    expect(metadata.targetIdCount).toBe(many.length + 1);
    expect(metadata.targetIdsTruncated).toBe(true);
    expect((metadata.userAgent as string).length).toBe(512);
    expect(metadata.userAgentTruncated).toBe(true);
  });
});
