/**
 * @fileoverview 監査ログの消去の許可の設定（audit-log-archive-permission）の単体テスト
 *
 * 許可の設定（`architrack.audit_archive` を `'on'`、取引に閉じる）を置いてから処理を行い、
 * 処理の例外は取引ごと外へ伝わることを、Prisma の偽物で確かめる。
 * トリガーとの組み合わせは統合検証（integration/audit-log-immutable.integration.test.ts など）で確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  AUDIT_ARCHIVE_SETTING,
  deleteAuditLogsWithArchivePermission,
  withAuditArchivePermission,
} from '../../../utils/audit-log-archive-permission.js';

/** 呼び出しの順を記録する取引の偽物 */
function fakePrisma(deletedCount = 0) {
  const calls: string[] = [];
  const queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(`set_config:${strings.join('?')}:${values.join(',')}`);
    return [];
  });
  const deleteMany = vi.fn(async () => {
    calls.push('deleteMany');
    return { count: deletedCount };
  });
  const tx = { $queryRaw: queryRaw, auditLog: { deleteMany } };
  const $transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  return {
    prisma: { $transaction } as unknown as PrismaClient,
    $transaction,
    queryRaw,
    deleteMany,
    tx,
    calls,
  };
}

describe('withAuditArchivePermission', () => {
  it('取引の中で許可の設定を取引に閉じた形で置いてから処理を行い、その結果を返す', async () => {
    const { prisma, $transaction, queryRaw, tx, calls } = fakePrisma();
    const fn = vi.fn(async (client: unknown) => {
      calls.push('fn');
      expect(client).toBe(tx);
      return 'done';
    });

    await expect(withAuditArchivePermission(prisma, fn)).resolves.toBe('done');

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0]!;
    expect(strings.join('?')).toBe("SELECT set_config(?, 'on', true)");
    expect(values).toEqual([AUDIT_ARCHIVE_SETTING]);
    expect(AUDIT_ARCHIVE_SETTING).toBe('architrack.audit_archive');
    expect(calls).toEqual([
      "set_config:SELECT set_config(?, 'on', true):architrack.audit_archive",
      'fn',
    ]);
  });

  it('処理が例外を投げると取引の外へ伝える（取引ごと取り消される）', async () => {
    const { prisma } = fakePrisma();

    await expect(
      withAuditArchivePermission(prisma, async () => {
        throw new Error('write failed');
      })
    ).rejects.toThrow('write failed');
  });
});

describe('deleteAuditLogsWithArchivePermission', () => {
  it('許可の設定の後に条件に合う監査ログを消し、消した行の数を返す', async () => {
    const { prisma, deleteMany, calls } = fakePrisma(3);
    const where = { createdAt: { lt: new Date('2025-01-01T00:00:00.000Z') } };

    await expect(deleteAuditLogsWithArchivePermission(prisma, where)).resolves.toBe(3);

    expect(deleteMany).toHaveBeenCalledWith({ where });
    expect(calls).toEqual([
      "set_config:SELECT set_config(?, 'on', true):architrack.audit_archive",
      'deleteMany',
    ]);
  });
});
