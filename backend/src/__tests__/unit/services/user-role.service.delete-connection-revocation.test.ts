/**
 * @fileoverview 利用者の削除による外部アプリの接続の失効の単体テスト（user-authentication タスク76.2）
 *
 * Requirements (user-authentication):
 * - REQ-50.3: 利用者のアカウントが削除されると、全ての接続を直ちに失効させる
 * - REQ-51.7: 失効の監査に実行者・対象の利用者・送信元 IP を残す
 *
 * Design: Requirements 46-51 > Modified Files（user-role.service.ts: 利用者を消す処理のトランザクションで接続を
 * 失効させる）、Data Models（利用者の削除の前に `revokeAllForUser` を呼び、監査を残す）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import { UserRoleService } from '../../../services/user-role.service.js';
import type { UserConnectionRevoker } from '../../../services/external-app-connection.service.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const USER_ID = 'user-762';
const ACTOR_ID = 'admin-762';
const SOURCE = { ipAddress: '198.51.100.76', userAgent: 'vitest-762-delete' };

describe('UserRoleService.deleteUser の接続の失効（タスク76.2）', () => {
  const calls: string[] = [];
  let tx: Record<string, unknown>;
  let prisma: PrismaClient;
  let revokeAllForUser: ReturnType<typeof vi.fn<UserConnectionRevoker['revokeAllForUser']>>;
  let invalidate: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  let service: UserRoleService;

  beforeEach(() => {
    calls.length = 0;
    tx = {
      role: { findUnique: vi.fn().mockResolvedValue(null) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: USER_ID,
          email: 'deleted@example.com',
          displayName: '削除 対象',
          isActive: true,
          userRoles: [],
        }),
        delete: vi.fn(async () => {
          calls.push('user.delete');
          return {};
        }),
      },
      userRole: { count: vi.fn() },
      invitation: { deleteMany: vi.fn(), updateMany: vi.fn() },
      $executeRaw: vi.fn(async () => {
        calls.push('refresh-token-lock');
        return 1;
      }),
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        if (strings.join('?').includes('FOR UPDATE')) {
          calls.push('users-row-lock');
        }
        return [];
      }),
    };
    prisma = {
      ...tx,
      $transaction: vi.fn(async (callback: (t: unknown) => Promise<unknown>) => {
        calls.push('begin');
        const value = await callback(tx);
        calls.push('commit');
        return value;
      }),
    } as unknown as PrismaClient;
    const auditLogService = {
      createLog: vi.fn(async () => {
        calls.push('audit:USER_DELETED');
        return {};
      }),
    } as unknown as IAuditLogService;
    revokeAllForUser = vi.fn<UserConnectionRevoker['revokeAllForUser']>(async () => {
      calls.push('revokeAllForUser');
      return 1;
    });
    invalidate = vi.fn<(userId: string) => Promise<void>>(async () => {
      calls.push('invalidate');
    });
    service = new UserRoleService(
      prisma,
      undefined,
      auditLogService,
      undefined,
      { invalidate },
      undefined,
      { revokeAllForUser }
    );
  });

  /**
   * @requirement user-authentication/REQ-50.3
   * @requirement user-authentication/REQ-51.7
   */
  it('同じ取引の中で、利用者の行を消す前に、理由 ACCOUNT_DELETED・実行者・送信元を渡して全ての接続を失効させる', async () => {
    const result = await service.deleteUser(USER_ID, ACTOR_ID, SOURCE);

    expect(result.ok).toBe(true);
    expect(revokeAllForUser).toHaveBeenCalledTimes(1);
    expect(revokeAllForUser).toHaveBeenCalledWith(
      USER_ID,
      'ACCOUNT_DELETED',
      { userId: ACTOR_ID, source: SOURCE },
      tx
    );
    const revoke = calls.indexOf('revokeAllForUser');
    // ロックの順序: リフレッシュトークンの取引ロック → users の行 → 失効（失効の取引ロック以降）→ 行の消去
    expect(calls.indexOf('refresh-token-lock')).toBeGreaterThan(calls.indexOf('begin'));
    expect(calls.indexOf('users-row-lock')).toBeGreaterThan(calls.indexOf('refresh-token-lock'));
    expect(revoke).toBeGreaterThan(calls.indexOf('users-row-lock'));
    expect(revoke).toBeLessThan(calls.indexOf('user.delete'));
    expect(calls.indexOf('user.delete')).toBeLessThan(calls.indexOf('commit'));
  });

  it('失効が失敗すると利用者を消さずに例外を投げ、キャッシュも無効化しない', async () => {
    revokeAllForUser.mockRejectedValueOnce(new Error('revocation failed'));

    await expect(service.deleteUser(USER_ID, ACTOR_ID, SOURCE)).rejects.toThrow(
      'revocation failed'
    );
    expect(calls).not.toContain('user.delete');
    expect(calls).not.toContain('commit');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('送信元を渡さない呼び出しでは偽の送信元を作らない', async () => {
    await service.deleteUser(USER_ID, ACTOR_ID);

    expect(revokeAllForUser).toHaveBeenCalledWith(
      USER_ID,
      'ACCOUNT_DELETED',
      { userId: ACTOR_ID, source: {} },
      tx
    );
  });

  it('存在しない利用者では失効させない', async () => {
    (tx.user as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValueOnce(null);

    const result = await service.deleteUser(USER_ID, ACTOR_ID, SOURCE);

    expect(result).toEqual({ ok: false, error: { type: 'USER_NOT_FOUND' } });
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });
});
