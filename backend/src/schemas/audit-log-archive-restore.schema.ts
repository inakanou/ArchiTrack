/**
 * @fileoverview 監査ログのアーカイブの復元の要求の検証スキーマ
 *
 * `POST /api/v1/audit-logs/archives/restore` の本文 `{ from, to }`（design.md の AuditLogArchiveService の節）を
 * 検証する（user-authentication タスク54.2、要件41.5）。
 * - from と to は時差を含む ISO 8601 の日時で、両端を含む期間を表す
 * - from は to 以前に限る
 * - 期間に重なる月の数は RESTORE_MAX_MONTHS 以下に限る
 */

import { z } from 'zod';
import { RESTORE_MAX_MONTHS, restoreMonthsOf } from '../services/audit-log-archive.service.js';

const datetime = z.string().datetime({ offset: true, message: '日時の形式が不正です' });

export const archiveRestoreSchema = z
  .object({ from: datetime, to: datetime })
  .strict()
  .superRefine((value, ctx) => {
    const from = new Date(value.from);
    const to = new Date(value.to);
    if (from > to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: '期間の終わりは始まり以降にしてください',
      });
      return;
    }
    try {
      restoreMonthsOf(from, to);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `期間は ${RESTORE_MAX_MONTHS} か月以内にしてください`,
      });
    }
  });

export type ArchiveRestoreRequest = z.infer<typeof archiveRestoreSchema>;
