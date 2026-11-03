/**
 * @fileoverview 利用者の棚卸しの一覧と絞り込みの検証（user-authentication タスク49.5）
 *
 * Requirements (user-authentication):
 * - REQ-36.10: 全利用者の表示名・メールアドレス・ロール・状態・2FA 登録・最終ログイン・作成日時・招待者を返す
 * - REQ-36.11: 状態と最終ログインからの経過日数で絞り込む
 *
 * 絞り込みの条件は実 DB の結果を統合テスト（user-inventory.integration.test.ts）で確かめる。ここでは
 * 条件の組み立て・秘密の値を選ばないこと・行の写し方・ページ情報を確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  UserInventoryService,
  buildUserInventoryWhere,
  USER_INVENTORY_ORDER_BY,
} from '../../../services/user-inventory.service.js';

const NOW = new Date('2026-10-23T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('buildUserInventoryWhere', () => {
  it('絞り込みが無ければ全利用者を対象にする', () => {
    expect(buildUserInventoryWhere({}, NOW)).toEqual({});
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it.each([
    ['active', true],
    ['inactive', false],
  ] as const)('状態 %s を isActive=%s に写す', (status, isActive) => {
    expect(buildUserInventoryWhere({ status }, NOW)).toEqual({ AND: [{ isActive }] });
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it('経過日数は最終ログインから数え、ログインの実績が無ければ作成日時から数える', () => {
    const cutoff = new Date(NOW.getTime() - 90 * DAY_MS);

    expect(buildUserInventoryWhere({ inactiveDaysAtLeast: 90 }, NOW)).toEqual({
      AND: [
        {
          OR: [{ lastLoginAt: { lte: cutoff } }, { lastLoginAt: null, createdAt: { lte: cutoff } }],
        },
      ],
    });
  });

  it('経過日数 0 は基準の日時以前の全員を対象にする', () => {
    expect(buildUserInventoryWhere({ inactiveDaysAtLeast: 0 }, NOW)).toEqual({
      AND: [
        {
          OR: [{ lastLoginAt: { lte: NOW } }, { lastLoginAt: null, createdAt: { lte: NOW } }],
        },
      ],
    });
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it('状態と経過日数を組み合わせる', () => {
    const cutoff = new Date(NOW.getTime() - 30 * DAY_MS);

    expect(buildUserInventoryWhere({ status: 'inactive', inactiveDaysAtLeast: 30 }, NOW)).toEqual({
      AND: [
        { isActive: false },
        {
          OR: [{ lastLoginAt: { lte: cutoff } }, { lastLoginAt: null, createdAt: { lte: cutoff } }],
        },
      ],
    });
  });
});

describe('UserInventoryService.list', () => {
  function createService(rows: unknown[], total: number) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const count = vi.fn().mockResolvedValue(total);
    const service = new UserInventoryService({
      prisma: { user: { findMany, count } } as never,
      now: () => NOW,
    });
    return { service, findMany, count };
  }

  /**
   * @requirement user-authentication/REQ-36.10
   */
  it('各列を写し、ロール名を優先度の高い順に並べ、招待者を返す', async () => {
    const { service } = createService(
      [
        {
          id: 'u-1',
          displayName: '山田',
          email: 'yamada@example.com',
          isActive: false,
          twoFactorEnabled: true,
          lastLoginAt: new Date('2026-07-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          invitedBy: { id: 'admin-1', displayName: '管理者' },
          userRoles: [
            { role: { name: 'user', priority: 0 } },
            { role: { name: 'admin', priority: 100 } },
          ],
        },
        {
          id: 'u-2',
          displayName: '佐藤',
          email: 'sato@example.com',
          isActive: true,
          twoFactorEnabled: false,
          lastLoginAt: null,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          invitedBy: null,
          userRoles: [],
        },
      ],
      2
    );

    const page = await service.list({ page: 1, limit: 20 });

    expect(page.data).toEqual([
      {
        id: 'u-1',
        displayName: '山田',
        email: 'yamada@example.com',
        roles: ['admin', 'user'],
        status: 'inactive',
        twoFactorEnabled: true,
        lastLoginAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        invitedBy: { id: 'admin-1', displayName: '管理者' },
      },
      {
        id: 'u-2',
        displayName: '佐藤',
        email: 'sato@example.com',
        roles: [],
        status: 'active',
        twoFactorEnabled: false,
        lastLoginAt: null,
        createdAt: '2026-02-01T00:00:00.000Z',
        invitedBy: null,
      },
    ]);
  });

  it('同じ優先度のロールは名前の順に並べる', async () => {
    const { service } = createService(
      [
        {
          id: 'u-1',
          displayName: 'a',
          email: 'a@example.com',
          isActive: true,
          twoFactorEnabled: true,
          lastLoginAt: null,
          createdAt: NOW,
          invitedBy: null,
          userRoles: [
            { role: { name: 'zeta', priority: 5 } },
            { role: { name: 'alpha', priority: 5 } },
          ],
        },
      ],
      1
    );

    const page = await service.list({ page: 1, limit: 20 });

    expect(page.data[0]!.roles).toEqual(['alpha', 'zeta']);
  });

  it('秘密の値を選択せず、必要な列だけを読む', async () => {
    const { service, findMany } = createService([], 0);

    await service.list({ page: 1, limit: 20 });

    const select = findMany.mock.calls[0]![0].select as Record<string, unknown>;
    expect(Object.keys(select).sort()).toEqual(
      [
        'createdAt',
        'displayName',
        'email',
        'id',
        'invitedBy',
        'isActive',
        'lastLoginAt',
        'twoFactorEnabled',
        'userRoles',
      ].sort()
    );
    for (const secret of [
      'passwordHash',
      'twoFactorSecret',
      'twoFactorPendingSecret',
      'refreshTokens',
      'twoFactorBackupCodes',
    ]) {
      expect(select).not.toHaveProperty(secret);
    }
    expect(select.invitedBy).toEqual({ select: { id: true, displayName: true } });
  });

  /**
   * @requirement user-authentication/REQ-36.11
   */
  it('絞り込みを一覧と件数の両方に使い、ページと決定的な並び順を渡す', async () => {
    const { service, findMany, count } = createService([], 45);

    const page = await service.list({
      status: 'active',
      inactiveDaysAtLeast: 10,
      page: 3,
      limit: 20,
    });

    const expectedWhere = buildUserInventoryWhere(
      { status: 'active', inactiveDaysAtLeast: 10 },
      NOW
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        orderBy: USER_INVENTORY_ORDER_BY,
        skip: 40,
        take: 20,
      })
    );
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(page.pagination).toEqual({ page: 3, limit: 20, total: 45, totalPages: 3 });
  });

  it('並び順はログインの実績が無い利用者を先に、最終ログイン・作成日時・ID の古い順にする', () => {
    expect(USER_INVENTORY_ORDER_BY).toEqual([
      { lastLoginAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('基準の日時を省略すると現在の日時で数える', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const service = new UserInventoryService({ prisma: { user: { findMany, count } } as never });
    const before = Date.now();

    await service.list({ inactiveDaysAtLeast: 1, page: 1, limit: 20 });

    const where = findMany.mock.calls[0]![0].where as {
      AND: [{ OR: [{ lastLoginAt: { lte: Date } }] }];
    };
    const cutoff = where.AND[0].OR[0].lastLoginAt.lte.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - DAY_MS);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - DAY_MS);
  });
});
