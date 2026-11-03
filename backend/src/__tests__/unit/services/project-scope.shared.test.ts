/**
 * @fileoverview 案件の閲覧範囲の共有のインスタンス（getSharedProjectScopeService・canAccessProject）の単体テスト
 *
 * 共有の PrismaClient と共有の RBACService で組み立てたインスタンスを使い回し、
 * どちらかが作り直されたときは新しいもので作り直すことを確かめる。
 * 判定の規則そのものは project-scope.service.test.ts で確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getPrismaClient, getSharedRBACService } = vi.hoisted(() => ({
  getPrismaClient: vi.fn(),
  getSharedRBACService: vi.fn(),
}));

vi.mock('../../../db.js', () => ({ default: getPrismaClient }));
vi.mock('../../../services/rbac.service.js', () => ({ getSharedRBACService }));

import {
  canAccessProject,
  getSharedProjectScopeService,
  ProjectScopeService,
} from '../../../services/project-scope.service.js';

/** 案件の行を一つ返す Prisma の偽物 */
function fakePrisma(row: { salesPersonId: string } | null) {
  return {
    project: {
      findUnique: vi.fn().mockResolvedValue(
        row && {
          salesPersonId: row.salesPersonId,
          constructionPersonId: null,
          createdById: 'user-creator',
          deletedAt: null,
        }
      ),
    },
  };
}

function fakeRbac(allowed = false) {
  return { hasPermission: vi.fn().mockResolvedValue(allowed) };
}

describe('getSharedProjectScopeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PrismaClient と RBACService が同じ間は同じインスタンスを返す', () => {
    getPrismaClient.mockReturnValue(fakePrisma(null));
    getSharedRBACService.mockReturnValue(fakeRbac());

    const first = getSharedProjectScopeService();
    const second = getSharedProjectScopeService();

    expect(first).toBeInstanceOf(ProjectScopeService);
    expect(second).toBe(first);
  });

  it('PrismaClient が作り直されたときは新しいインスタンスを作る', () => {
    const rbac = fakeRbac();
    getSharedRBACService.mockReturnValue(rbac);
    getPrismaClient.mockReturnValue(fakePrisma(null));
    const before = getSharedProjectScopeService();

    getPrismaClient.mockReturnValue(fakePrisma(null));
    const after = getSharedProjectScopeService();

    expect(after).not.toBe(before);
    expect(getSharedProjectScopeService()).toBe(after);
  });

  it('RBACService が作り直されたときは新しいインスタンスを作る', () => {
    getPrismaClient.mockReturnValue(fakePrisma(null));
    getSharedRBACService.mockReturnValue(fakeRbac());
    const before = getSharedProjectScopeService();

    getSharedRBACService.mockReturnValue(fakeRbac());
    const after = getSharedProjectScopeService();

    expect(after).not.toBe(before);
  });
});

describe('canAccessProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('共有のインスタンスの判定を返す（担当者は許可、関係の無い利用者は拒否）', async () => {
    const prisma = fakePrisma({ salesPersonId: 'user-sales' });
    const rbac = fakeRbac(false);
    getPrismaClient.mockReturnValue(prisma);
    getSharedRBACService.mockReturnValue(rbac);

    await expect(canAccessProject('user-sales', 'project-1')).resolves.toBe(true);
    await expect(canAccessProject('user-stranger', 'project-1')).resolves.toBe(false);

    expect(prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'project-1' } })
    );
    expect(rbac.hasPermission).toHaveBeenCalledWith('user-stranger', 'project:read_all');
  });
});
