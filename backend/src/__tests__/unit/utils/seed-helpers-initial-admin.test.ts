/**
 * @fileoverview 初期管理者の seed のパスワード検証と初回変更の要否の単体テスト
 *
 * user-authentication タスク47.7（InitialAdminSeeder）
 *
 * Requirements (user-authentication):
 * - 37.6: 初期管理者の作成に要件2.5〜2.8のパスワードポリシーを適用し、満たさなければ作成を中止する
 * - 37.7: 初期管理者を初回のパスワード変更を要する状態で作る
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { seedAdminUser } from '../../../utils/seed-helpers.js';

const ADMIN_EMAIL = 'seed-admin@example.com';
const ADMIN_DISPLAY_NAME = 'Seed Administrator';
const STRONG_PASSWORD = 'Kq7!vR2#mZp9xW';

interface SeedPrismaMock {
  prisma: PrismaClient;
  userCreate: ReturnType<typeof vi.fn>;
  userRoleCreate: ReturnType<typeof vi.fn>;
  auditLogCreate: ReturnType<typeof vi.fn>;
}

function createSeedPrismaMock(existingUser: { id: string } | null): SeedPrismaMock {
  const userCreate = vi.fn().mockImplementation(async ({ data }) => ({
    id: 'created-admin-id',
    email: data.email,
    displayName: data.displayName,
  }));
  const userRoleCreate = vi.fn().mockResolvedValue({});
  const auditLogCreate = vi.fn().mockResolvedValue({});
  const prisma = {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          existingUser
            ? { ...existingUser, email: ADMIN_EMAIL, displayName: 'Existing Admin' }
            : null
        ),
      create: userCreate,
    },
    role: {
      findUnique: vi.fn().mockResolvedValue({ id: 'admin-role-id', name: 'admin' }),
    },
    userRole: { create: userRoleCreate },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue({ id: 'existing-audit-log' }),
      create: auditLogCreate,
    },
  } as unknown as PrismaClient;
  return { prisma, userCreate, userRoleCreate, auditLogCreate };
}

describe('seedAdminUser - 初期管理者のパスワード検証と初回変更（要件37.6・37.7）', () => {
  const originalEnv = process.env;

  function setAdminEnv(password: string): void {
    process.env = {
      ...originalEnv,
      INITIAL_ADMIN_EMAIL: ADMIN_EMAIL,
      INITIAL_ADMIN_PASSWORD: password,
      INITIAL_ADMIN_DISPLAY_NAME: ADMIN_DISPLAY_NAME,
    };
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_DISPLAY_NAME;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    ['12文字未満（要件2.6）', 'Ab1!short'],
    ['文字種が3種類未満（要件2.6）', 'alllowercaseletters'],
    ['よく使われるパスワード（要件2.7）', 'password123'],
    ['メールアドレスを含む（要件2.8）', 'X1!seed-admin@example.com'],
    ['表示名を含む（要件2.8）', 'X1!SeedAdministrator'],
  ])(
    'ポリシーを満たさないパスワード（%s）では例外で止まり、利用者を作らない',
    async (_, password) => {
      setAdminEnv(password);
      const { prisma, userCreate, userRoleCreate, auditLogCreate } = createSeedPrismaMock(null);

      await expect(seedAdminUser(prisma)).rejects.toThrow(/INITIAL_ADMIN_PASSWORD/);

      expect(userCreate).not.toHaveBeenCalled();
      expect(userRoleCreate).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    }
  );

  it('ポリシーを満たすパスワードで作成した初期管理者は初回のパスワード変更を要する', async () => {
    setAdminEnv(STRONG_PASSWORD);
    const { prisma, userCreate, userRoleCreate } = createSeedPrismaMock(null);

    await seedAdminUser(prisma);

    expect(userCreate).toHaveBeenCalledTimes(1);
    const createdData = userCreate.mock.calls[0]![0].data;
    expect(createdData.email).toBe(ADMIN_EMAIL);
    expect(createdData.displayName).toBe(ADMIN_DISPLAY_NAME);
    expect(createdData.mustChangePassword).toBe(true);
    expect(createdData.passwordHash).toMatch(/^\$argon2id\$/);
    expect(userRoleCreate).toHaveBeenCalledWith({
      data: { userId: 'created-admin-id', roleId: 'admin-role-id' },
    });
  });

  it('管理者が既に存在する再デプロイでは、ポリシーを満たさない値でも止まらず何も作らない', async () => {
    setAdminEnv('weak');
    const { prisma, userCreate, userRoleCreate } = createSeedPrismaMock({ id: 'existing-id' });

    await expect(seedAdminUser(prisma)).resolves.toBeUndefined();

    expect(userCreate).not.toHaveBeenCalled();
    expect(userRoleCreate).not.toHaveBeenCalled();
  });
});
