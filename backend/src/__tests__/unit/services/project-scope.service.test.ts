/**
 * @fileoverview 案件の閲覧範囲（ProjectScopeService）の単体テスト（user-authentication タスク52.1）
 *
 * Requirements (user-authentication):
 * - REQ-39.1: 営業担当者・工事担当者・作成者のいずれか、または全案件閲覧の権限を持つときに限り許可する
 * - REQ-39.4: ファイルの取得用URLの発行が呼ぶ判定の関数（canAccessProject）が受入基準1と同じ判定をする
 * - REQ-39.6: 担当者の変更の後は変更後の担当者で判定する
 *
 * 案件の行は Prisma の偽物で、全案件閲覧の権限は RBACService の偽物で与える。
 * 一覧の絞り込み条件（buildProjectScopeWhere）の適用は 52.3 で案件の API に置いて確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { RBACService } from '../../../services/rbac.service.js';
import {
  ProjectScopeService,
  PROJECT_READ_ALL_PERMISSION,
} from '../../../services/project-scope.service.js';

interface ProjectRow {
  salesPersonId: string;
  constructionPersonId: string | null;
  createdById: string;
  deletedAt: Date | null;
}

const PROJECT_ID = 'project-1';
const SALES = 'user-sales';
const CONSTRUCTION = 'user-construction';
const CREATOR = 'user-creator';
const STRANGER = 'user-stranger';

const LIVE_PROJECT: ProjectRow = {
  salesPersonId: SALES,
  constructionPersonId: CONSTRUCTION,
  createdById: CREATOR,
  deletedAt: null,
};

/** 呼び出しの順に案件の行を返す Prisma の偽物（最後の値をその後も返す） */
function fakeDb(...rows: Array<ProjectRow | null>) {
  const findUnique = vi.fn();
  rows.forEach((row) => findUnique.mockResolvedValueOnce(row));
  findUnique.mockResolvedValue(rows[rows.length - 1] ?? null);
  return { project: { findUnique } };
}

/** 全案件閲覧の権限を持つ利用者の集合で答える RBACService の偽物 */
function fakeRbac(readAllUsers: string[] = []) {
  return {
    hasPermission: vi.fn(async (userId: string, permission: string) => {
      return permission === PROJECT_READ_ALL_PERMISSION && readAllUsers.includes(userId);
    }),
  };
}

function serviceWith(db: ReturnType<typeof fakeDb>, rbac: ReturnType<typeof fakeRbac>) {
  return new ProjectScopeService(db as unknown as PrismaClient, rbac as unknown as RBACService);
}

describe('ProjectScopeService', () => {
  describe('canAccessProject / evaluateProjectAccess', () => {
    /**
     * @requirement user-authentication/REQ-39.1
     * @requirement user-authentication/REQ-39.4
     */
    it('営業担当者・工事担当者・作成者のそれぞれが一致すると範囲内になる', async () => {
      for (const userId of [SALES, CONSTRUCTION, CREATOR]) {
        const db = fakeDb(LIVE_PROJECT);
        const rbac = fakeRbac();
        const service = serviceWith(db, rbac);

        await expect(service.canAccessProject(userId, PROJECT_ID)).resolves.toBe(true);
        await expect(service.evaluateProjectAccess(userId, PROJECT_ID)).resolves.toBe('allowed');
        // 関係者の一致で決まるときは全案件の権限を引かない
        expect(rbac.hasPermission).not.toHaveBeenCalled();
      }
    });

    /**
     * @requirement user-authentication/REQ-39.1
     * @requirement user-authentication/REQ-39.4
     */
    it('関係者でなく全案件閲覧の権限も持たない利用者は範囲外になる', async () => {
      const db = fakeDb(LIVE_PROJECT);
      const rbac = fakeRbac();
      const service = serviceWith(db, rbac);

      await expect(service.canAccessProject(STRANGER, PROJECT_ID)).resolves.toBe(false);
      await expect(service.evaluateProjectAccess(STRANGER, PROJECT_ID)).resolves.toBe(
        'out_of_scope'
      );
      // 全案件の判定はロール名でなく権限 project:read_all で行う
      expect(rbac.hasPermission).toHaveBeenCalledWith(STRANGER, 'project:read_all');
    });

    /**
     * @requirement user-authentication/REQ-39.1
     * @requirement user-authentication/REQ-39.4
     */
    it('全案件閲覧の権限（project:read_all）を持つ利用者は関係者でなくても範囲内になる', async () => {
      const db = fakeDb(LIVE_PROJECT);
      const rbac = fakeRbac([STRANGER]);
      const service = serviceWith(db, rbac);

      await expect(service.canAccessProject(STRANGER, PROJECT_ID)).resolves.toBe(true);
      await expect(service.evaluateProjectAccess(STRANGER, PROJECT_ID)).resolves.toBe('allowed');
    });

    /**
     * @requirement user-authentication/REQ-39.1
     * @requirement user-authentication/REQ-39.4
     */
    it('論理削除された案件は関係者にも全案件閲覧の権限にも不在として扱う', async () => {
      const deleted: ProjectRow = { ...LIVE_PROJECT, deletedAt: new Date('2026-10-01T00:00:00Z') };

      for (const [userId, readAll] of [
        [SALES, []],
        [CREATOR, []],
        [STRANGER, [STRANGER]],
      ] as const) {
        const service = serviceWith(fakeDb(deleted), fakeRbac([...readAll]));
        await expect(service.canAccessProject(userId, PROJECT_ID)).resolves.toBe(false);
        await expect(service.evaluateProjectAccess(userId, PROJECT_ID)).resolves.toBe('not_found');
      }
    });

    /**
     * @requirement user-authentication/REQ-39.1
     */
    it('存在しない案件は全案件閲覧の権限があっても不在になる', async () => {
      const service = serviceWith(fakeDb(null), fakeRbac([STRANGER]));

      await expect(service.canAccessProject(STRANGER, PROJECT_ID)).resolves.toBe(false);
      await expect(service.evaluateProjectAccess(STRANGER, PROJECT_ID)).resolves.toBe('not_found');
    });

    /**
     * @requirement user-authentication/REQ-39.6
     */
    it('担当者の変更の後は、判定のたびに案件を読み直して変更後の担当者で判定する', async () => {
      const before: ProjectRow = { ...LIVE_PROJECT, constructionPersonId: CONSTRUCTION };
      const after: ProjectRow = { ...LIVE_PROJECT, constructionPersonId: STRANGER };
      const db = fakeDb(before, after);
      const service = serviceWith(db, fakeRbac());

      await expect(service.canAccessProject(CONSTRUCTION, PROJECT_ID)).resolves.toBe(true);
      // 担当から外れた利用者は次の判定から範囲外、新しい担当者は範囲内
      await expect(service.canAccessProject(CONSTRUCTION, PROJECT_ID)).resolves.toBe(false);
      await expect(service.canAccessProject(STRANGER, PROJECT_ID)).resolves.toBe(true);

      // 判定の結果をキャッシュせず、要求のたびに案件の行を読む
      expect(db.project.findUnique).toHaveBeenCalledTimes(3);
      expect(db.project.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PROJECT_ID } })
      );
    });
  });

  describe('hasAllProjectsAccess', () => {
    /**
     * @requirement user-authentication/REQ-39.1
     */
    it('project:read_all の有無を RBACService に問い合わせる', async () => {
      const rbac = fakeRbac([STRANGER]);
      const service = serviceWith(fakeDb(null), rbac);

      await expect(service.hasAllProjectsAccess(STRANGER)).resolves.toBe(true);
      await expect(service.hasAllProjectsAccess(SALES)).resolves.toBe(false);
      expect(rbac.hasPermission).toHaveBeenCalledWith(SALES, 'project:read_all');
    });
  });

  describe('buildProjectScopeWhere', () => {
    it('全案件閲覧の権限を持たない利用者には関係者のいずれかに一致する条件を返す', async () => {
      const service = serviceWith(fakeDb(null), fakeRbac());

      await expect(service.buildProjectScopeWhere(SALES)).resolves.toEqual({
        OR: [{ salesPersonId: SALES }, { constructionPersonId: SALES }, { createdById: SALES }],
      });
    });

    it('全案件閲覧の権限を持つ利用者には絞り込みなし（null）を返す', async () => {
      const service = serviceWith(fakeDb(null), fakeRbac([STRANGER]));

      await expect(service.buildProjectScopeWhere(STRANGER)).resolves.toBeNull();
    });
  });
});
