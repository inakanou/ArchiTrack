/**
 * @fileoverview RoleService.updateRole の楽観的ロック（任意の expectedUpdatedAt）の単体検証
 *
 * 版を与えたときは条件付きの更新（updateMany の where に updatedAt）で競合を検出し、
 * 0 件のときは読み直して不在（ROLE_NOT_FOUND）と競合（ROLE_CONFLICT）を区別する。
 * 実データベースでの並行の検証は role-profile-optimistic-lock の統合テストが担う。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, Role } from '../../../generated/prisma/client.js';
import { RoleService } from '../../../services/role.service.js';
import { Err, Ok } from '../../../types/result.js';

const roleId = 'role-123';
const expected = new Date('2026-09-27T01:00:00.000Z');
const actual = new Date('2026-09-27T01:00:05.000Z');
const role: Role = {
  id: roleId,
  name: 'developer',
  description: '開発者ロール',
  priority: 50,
  isSystem: false,
  createdAt: expected,
  updatedAt: expected,
};

describe('RoleService.updateRole の楽観的ロック', () => {
  let prismaMock: PrismaClient;
  let tx: {
    role: {
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let service: RoleService;

  beforeEach(() => {
    tx = {
      role: {
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([role]),
    };
    prismaMock = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ id: roleId, name: role.name }),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaClient;
    service = new RoleService(prismaMock);
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版が一致すれば、updatedAt を条件に含めた更新を行い、更新後のロールを返す', async () => {
    tx.role.updateMany.mockResolvedValue({ count: 1 });
    tx.role.findUniqueOrThrow.mockResolvedValue({ ...role, description: 'new', updatedAt: actual });

    const result = await service.updateRole(roleId, {
      description: 'new',
      expectedUpdatedAt: expected,
    });

    expect(result).toEqual(Ok({ ...role, description: 'new', updatedAt: actual }));
    expect(tx.role.updateMany).toHaveBeenCalledWith({
      where: { id: roleId, updatedAt: expected },
      data: { description: 'new' },
    });
    expect(prismaMock.role.update).not.toHaveBeenCalled();
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('条件に合う行が無く、ロールが残っていれば ROLE_CONFLICT（期待と実際の版）を返す', async () => {
    tx.role.updateMany.mockResolvedValue({ count: 0 });
    tx.role.findUnique.mockResolvedValue({ updatedAt: actual });

    const result = await service.updateRole(roleId, {
      description: 'new',
      expectedUpdatedAt: expected,
    });

    expect(result).toEqual(
      Err({ type: 'ROLE_CONFLICT', expectedUpdatedAt: expected, actualUpdatedAt: actual })
    );
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('条件に合う行が無く、ロールも無ければ（存在確認の後に削除された）ROLE_NOT_FOUND を返す', async () => {
    tx.role.updateMany.mockResolvedValue({ count: 0 });
    tx.role.findUnique.mockResolvedValue(null);

    const result = await service.updateRole(roleId, {
      description: 'new',
      expectedUpdatedAt: expected,
    });

    expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('版を与えなければ従来どおり版を比べずに id だけで更新する', async () => {
    tx.role.update.mockResolvedValue({ ...role, description: 'new' });

    const result = await service.updateRole(roleId, { description: 'new' });

    expect(result.ok).toBe(true);
    // 監査ログと同じトランザクションで更新する（タスク36.4）。版は条件に含めない
    expect(tx.role.update).toHaveBeenCalledWith({
      where: { id: roleId },
      data: { description: 'new' },
    });
    expect(tx.role.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.role.update).not.toHaveBeenCalled();
  });
});
