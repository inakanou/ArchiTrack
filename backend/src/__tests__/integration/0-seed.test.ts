/**
 * @fileoverview Seedスクリプトの統合テスト
 *
 * Requirements:
 * - 3.1-3.5: 初期管理者アカウントのセットアップ
 * - 17: 動的ロール管理（事前定義ロール）
 * - 18: 権限管理（事前定義権限）
 *
 * Task 25.1: prisma/seed.tsの実装確認と検証
 * - 初期管理者アカウント作成ロジックの確認（ADMIN_EMAIL, ADMIN_PASSWORD環境変数）
 * - システムロール（admin, user）の初期データ挿入確認
 * - デフォルト権限（user:read, user:create, user:update, user:delete, user:invite等）の定義確認
 * - パスワードがArgon2idでハッシュ化されていることの確認
 * - 重複実行時の冪等性の確認
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { hash, verify } from '@node-rs/argon2';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

describe('Seed Script Integration Tests', () => {
  // テスト環境変数を設定
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      ADMIN_EMAIL: 'admin@test.example.com',
      ADMIN_PASSWORD: 'AdminTest123!@#',
      ADMIN_DISPLAY_NAME: 'Test Admin',
    };
    // .envからのINITIAL_ADMIN_*を削除してテスト用の値が使われるようにする
    delete process.env.INITIAL_ADMIN_EMAIL;
    delete process.env.INITIAL_ADMIN_PASSWORD;
    delete process.env.INITIAL_ADMIN_DISPLAY_NAME;
  });

  afterAll(async () => {
    // クリーンアップ: テスト用ユーザーのみ削除、ロールと権限は他のテストで使用するため残す
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'admin@test.example.com',
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: 'admin@test.example.com',
      },
    });

    process.env = originalEnv;
    await prisma.$disconnect();
  });

  it('事前定義ロールが正しく作成される', async () => {
    // Arrange & Act
    const { seedRoles } = await import('../../utils/seed-helpers.js');
    await seedRoles(prisma);

    // Assert: システム管理者ロール
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });
    expect(adminRole).toBeDefined();
    expect(adminRole?.description).toBe('システム全体を管理する最高権限ロール');
    expect(adminRole?.isSystem).toBe(true);
    expect(adminRole?.priority).toBe(100);

    // Assert: 一般ユーザーロール
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
    });
    expect(userRole).toBeDefined();
    expect(userRole?.description).toBe('自分が作成したリソースのみアクセス可能な基本ロール');
    expect(userRole?.isSystem).toBe(true);
    expect(userRole?.priority).toBe(0);
  });

  it('事前定義権限が正しく作成される', async () => {
    // Arrange & Act
    const { seedPermissions } = await import('../../utils/seed-helpers.js');
    await seedPermissions(prisma);

    // Assert: 全権限（*:*）
    const allPermission = await prisma.permission.findFirst({
      where: { resource: '*', action: '*' },
    });
    expect(allPermission).toBeDefined();
    expect(allPermission?.description).toBe('全てのリソースへの全てのアクション');

    // Assert: ADR関連権限
    const adrReadPermission = await prisma.permission.findFirst({
      where: { resource: 'adr', action: 'read' },
    });
    expect(adrReadPermission).toBeDefined();
    expect(adrReadPermission?.description).toContain('ADR');

    // Assert: ユーザー関連権限
    const userReadPermission = await prisma.permission.findFirst({
      where: { resource: 'user', action: 'read' },
    });
    expect(userReadPermission).toBeDefined();

    // Assert: user:invite権限（要件25.1: デフォルト権限の定義確認）
    const userInvitePermission = await prisma.permission.findFirst({
      where: { resource: 'user', action: 'invite' },
    });
    expect(userInvitePermission).toBeDefined();
    expect(userInvitePermission?.description).toContain('招待');
  });

  it('ロールと権限が正しく紐付けられる', async () => {
    // Arrange
    const { seedRoles, seedPermissions, seedRolePermissions } = await import(
      '../../utils/seed-helpers.js'
    );
    await seedRoles(prisma);
    await seedPermissions(prisma);

    // Act
    await seedRolePermissions(prisma);

    // Assert: システム管理者ロールが *:* 権限を持つ
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
    expect(adminRole).toBeDefined();
    const hasAllPermission = adminRole?.rolePermissions.some(
      (rp) => rp.permission.resource === '*' && rp.permission.action === '*'
    );
    expect(hasAllPermission).toBe(true);

    // Assert: 一般ユーザーロールが基本権限を持つ
    const userRole = await prisma.role.findUnique({
      where: { name: 'user' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
    expect(userRole).toBeDefined();
    const permissions = userRole?.rolePermissions.map(
      (rp) => `${rp.permission.resource}:${rp.permission.action}`
    );
    expect(permissions).toContain('adr:read');
    expect(permissions).toContain('adr:create');
    expect(permissions).toContain('user:read');
  });

  it('初期管理者アカウントが正しく作成される', async () => {
    // Arrange
    const { seedRoles, seedPermissions, seedRolePermissions, seedAdminUser } = await import(
      '../../utils/seed-helpers.js'
    );
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // Act
    await seedAdminUser(prisma);

    // Assert: 管理者ユーザーが作成されている
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@test.example.com' },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });
    expect(adminUser).toBeDefined();
    expect(adminUser?.displayName).toBe('Test Admin');
    expect(adminUser?.email).toBe('admin@test.example.com');

    // Assert: パスワードがハッシュ化されている
    expect(adminUser?.passwordHash).toBeDefined();
    expect(adminUser?.passwordHash).not.toBe('AdminTest123!@#');

    // Assert: システム管理者ロールが割り当てられている
    const hasAdminRole = adminUser?.userRoles.some((ur) => ur.role.name === 'admin');
    expect(hasAdminRole).toBe(true);
  });

  it('Seedスクリプトが冪等性を持つ（2回実行しても問題ない）', async () => {
    // テスト独立性を保証するため、開始時にテスト用データのみをクリーンアップ
    // 他のテストファイルが作成したデータを削除しないよう、admin@test.example.comのみを対象にする
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'admin@test.example.com',
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: 'admin@test.example.com',
      },
    });
    // ロール、権限、ロール権限は他のテストと共有するため、完全削除はしない
    // 代わりに、seed関数の冪等性（既存データがあっても重複作成しない）に依存する

    // Arrange & Act: 1回目の実行
    const { seedRoles, seedPermissions, seedRolePermissions, seedAdminUser } = await import(
      '../../utils/seed-helpers.js'
    );
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await seedAdminUser(prisma);

    const rolesCount1 = await prisma.role.count();
    const permissionsCount1 = await prisma.permission.count();
    const adminUsersCount1 = await prisma.user.count({
      where: { email: 'admin@test.example.com' },
    });

    // Act: 2回目の実行
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await seedAdminUser(prisma);

    const rolesCount2 = await prisma.role.count();
    const permissionsCount2 = await prisma.permission.count();
    const adminUsersCount2 = await prisma.user.count({
      where: { email: 'admin@test.example.com' },
    });

    // Assert: レコード数が変わらない（重複作成されない）
    expect(rolesCount2).toBe(rolesCount1);
    expect(permissionsCount2).toBe(permissionsCount1);
    expect(adminUsersCount2).toBe(adminUsersCount1);
  });

  it('初期管理者が既に存在する場合はスキップする', async () => {
    // Arrange: 既存のテストデータをクリーンアップ（テスト用ユーザーのみ）
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'admin@test.example.com',
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: 'admin@test.example.com',
      },
    });

    // Arrange: 手動で管理者を作成
    const existingAdminPassword = await hash('ExistingAdmin123!@#', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await prisma.user.create({
      data: {
        email: 'admin@test.example.com',
        displayName: 'Existing Admin',
        passwordHash: existingAdminPassword,
      },
    });

    // Act: Seedスクリプト実行
    const { seedAdminUser } = await import('../../utils/seed-helpers.js');
    await seedAdminUser(prisma);

    // Assert: 既存の管理者が変更されていない
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@test.example.com' },
    });
    expect(adminUser).toBeDefined();
    expect(adminUser?.displayName).toBe('Existing Admin'); // 変更されていない
  });

  it('初期管理者のパスワードがArgon2idでハッシュ化されている', async () => {
    // Arrange: テストデータをクリーンアップ
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'admin@test.example.com',
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: 'admin@test.example.com',
      },
    });

    const { seedRoles, seedPermissions, seedRolePermissions, seedAdminUser } = await import(
      '../../utils/seed-helpers.js'
    );
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // Act
    await seedAdminUser(prisma);

    // Assert: 管理者ユーザーが作成されている
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@test.example.com' },
    });
    expect(adminUser).toBeDefined();
    expect(adminUser?.passwordHash).toBeDefined();

    // Assert: パスワードがArgon2idでハッシュ化されている（Argon2idハッシュは$argon2id$で始まる）
    expect(adminUser?.passwordHash).toMatch(/^\$argon2id\$/);

    // Assert: ハッシュが正しいパスワードで検証できる（Argon2idのパラメータが正しい）
    const isValid = await verify(adminUser!.passwordHash, 'AdminTest123!@#');
    expect(isValid).toBe(true);

    // Assert: 異なるパスワードでは検証に失敗する
    const isInvalid = await verify(adminUser!.passwordHash, 'WrongPassword123!@#');
    expect(isInvalid).toBe(false);
  });

  it('INITIAL_ADMIN_*環境変数が優先される', async () => {
    // Arrange: テストデータをクリーンアップ
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: {
            in: ['admin@test.example.com', 'initial-admin@test.example.com'],
          },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['admin@test.example.com', 'initial-admin@test.example.com'],
        },
      },
    });

    // Arrange: INITIAL_ADMIN_*環境変数を設定（ADMIN_*より優先される）
    const originalInitialEmail = process.env.INITIAL_ADMIN_EMAIL;
    const originalInitialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    const originalInitialDisplayName = process.env.INITIAL_ADMIN_DISPLAY_NAME;

    process.env.INITIAL_ADMIN_EMAIL = 'initial-admin@test.example.com';
    process.env.INITIAL_ADMIN_PASSWORD = 'InitialAdmin123!@#';
    process.env.INITIAL_ADMIN_DISPLAY_NAME = 'Initial Test Admin';

    const { seedRoles, seedPermissions, seedRolePermissions, seedAdminUser } = await import(
      '../../utils/seed-helpers.js'
    );
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);

    // Act
    await seedAdminUser(prisma);

    // Assert: INITIAL_ADMIN_*の値でユーザーが作成される
    const adminUser = await prisma.user.findUnique({
      where: { email: 'initial-admin@test.example.com' },
    });
    expect(adminUser).toBeDefined();
    expect(adminUser?.displayName).toBe('Initial Test Admin');

    // Assert: ADMIN_*の値ではユーザーが作成されていない
    const fallbackUser = await prisma.user.findUnique({
      where: { email: 'admin@test.example.com' },
    });
    expect(fallbackUser).toBeNull();

    // Cleanup
    await prisma.userRole.deleteMany({
      where: {
        user: {
          email: 'initial-admin@test.example.com',
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: 'initial-admin@test.example.com',
      },
    });

    // 環境変数を元に戻す
    if (originalInitialEmail !== undefined) {
      process.env.INITIAL_ADMIN_EMAIL = originalInitialEmail;
    } else {
      delete process.env.INITIAL_ADMIN_EMAIL;
    }
    if (originalInitialPassword !== undefined) {
      process.env.INITIAL_ADMIN_PASSWORD = originalInitialPassword;
    } else {
      delete process.env.INITIAL_ADMIN_PASSWORD;
    }
    if (originalInitialDisplayName !== undefined) {
      process.env.INITIAL_ADMIN_DISPLAY_NAME = originalInitialDisplayName;
    } else {
      delete process.env.INITIAL_ADMIN_DISPLAY_NAME;
    }
  });
});
