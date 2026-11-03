/**
 * @fileoverview データ出力の記録の要求の検証スキーマ
 *
 * `POST /api/v1/audit-logs/exports` の本文（design.md の ExportRecordInput）を検証する
 * （user-authentication タスク53.3、要件40.9）。
 * - 種別は ExportKind の一覧に限る
 * - 案件に属する種別は案件の ID（UUID）を必須とし、案件に属さない種別（監査ログの JSON 出力）は null に限る
 * - 件数は 0 以上の整数。対象のデータの ID は文字列の配列（監査に書く数と長さはサービスが切り詰める）
 */

import { z } from 'zod';
import { EXPORT_KINDS, PROJECTLESS_EXPORT_KINDS } from '../services/export-audit.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 一度の要求で受け取る対象のデータの ID の数の上限 */
export const EXPORT_RECORD_MAX_TARGET_IDS = 10000;
/** 受け取る対象のデータの ID 一つの長さの上限 */
export const EXPORT_RECORD_TARGET_ID_MAX_LENGTH = 256;

export const exportRecordSchema = z
  .object({
    kind: z.enum(EXPORT_KINDS),
    projectId: z.string().regex(UUID_REGEX, '案件IDの形式が不正です').nullable(),
    targetIds: z
      .array(z.string().min(1).max(EXPORT_RECORD_TARGET_ID_MAX_LENGTH))
      .max(EXPORT_RECORD_MAX_TARGET_IDS),
    itemCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .superRefine((value, ctx) => {
    const projectless = PROJECTLESS_EXPORT_KINDS.includes(value.kind);
    if (projectless && value.projectId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'この出力の種別は案件を指定できません',
      });
    }
    if (!projectless && value.projectId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'この出力の種別は案件の指定が必要です',
      });
    }
  });

export type ExportRecordRequest = z.infer<typeof exportRecordSchema>;
