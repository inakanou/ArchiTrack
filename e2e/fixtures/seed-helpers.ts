/**
 * @fileoverview E2Eテスト用Seedヘルパー関数
 *
 * backend/src/utils/seed-helpers.ts から複製したE2E専用実装。
 * E2Eテスト環境のPrismaClientと完全な型互換性を持ちます。
 *
 * Note: backendのseed-helpersと機能的に同一ですが、型安全性のため独立して管理します。
 * マスターデータ定義を変更する場合は、両方のファイルを更新してください。
 */

// Prisma 7: Use root's generated client
import { PrismaClient } from '../../src/generated/prisma/client.js';

/** Type alias for PrismaClient instance */
type PrismaClientInstance = InstanceType<typeof PrismaClient>;

/**
 * 事前定義ロールのシーディング
 *
 * 要件17: 事前定義ロール
 * - システム管理者（admin）: 全ての権限を持つ最高権限ロール
 * - 一般ユーザー（user）: 自分が作成したリソースのみアクセス可能な基本ロール
 */
export async function seedRoles(prisma: PrismaClientInstance): Promise<void> {
  console.log('  - Seeding roles...');

  // システム管理者ロール
  await prisma.role.upsert({
    where: { name: 'admin' },
    update: {
      description: 'システム全体を管理する最高権限ロール',
      priority: 100,
      isSystem: true,
    },
    create: {
      name: 'admin',
      description: 'システム全体を管理する最高権限ロール',
      priority: 100,
      isSystem: true,
    },
  });

  // 一般ユーザーロール
  await prisma.role.upsert({
    where: { name: 'user' },
    update: {
      description: '自分が作成したリソースのみアクセス可能な基本ロール',
      priority: 0,
      isSystem: true,
    },
    create: {
      name: 'user',
      description: '自分が作成したリソースのみアクセス可能な基本ロール',
      priority: 0,
      isSystem: true,
    },
  });

  console.log('    ✓ Roles seeded successfully');
}

/**
 * 事前定義権限のシーディング
 *
 * 要件18: 権限管理
 * - resource:action形式で権限を定義
 * - システム管理者用: *:* (全権限)
 * - 一般ユーザー用: adr:read, adr:create, adr:update, user:read, settings:read
 */
export async function seedPermissions(prisma: PrismaClientInstance): Promise<void> {
  console.log('  - Seeding permissions...');

  const permissions = [
    // システム管理者用: 全権限
    {
      resource: '*',
      action: '*',
      description: '全てのリソースへの全てのアクション',
    },

    // ADR関連権限
    {
      resource: 'adr',
      action: 'create',
      description: 'ADRの作成',
    },
    {
      resource: 'adr',
      action: 'read',
      description: 'ADRの閲覧',
    },
    {
      resource: 'adr',
      action: 'update',
      description: 'ADRの更新',
    },
    {
      resource: 'adr',
      action: 'delete',
      description: 'ADRの削除',
    },
    {
      resource: 'adr',
      action: 'manage',
      description: 'ADRの完全管理',
    },

    // ユーザー関連権限
    {
      resource: 'user',
      action: 'create',
      description: 'ユーザーの作成（招待）',
    },
    {
      resource: 'user',
      action: 'read',
      description: 'ユーザー情報の閲覧',
    },
    {
      resource: 'user',
      action: 'update',
      description: 'ユーザー情報の更新',
    },
    {
      resource: 'user',
      action: 'delete',
      description: 'ユーザーの削除',
    },
    {
      resource: 'user',
      action: 'manage',
      description: 'ユーザーの完全管理',
    },

    // ロール関連権限
    {
      resource: 'role',
      action: 'create',
      description: 'ロールの作成',
    },
    {
      resource: 'role',
      action: 'read',
      description: 'ロール情報の閲覧',
    },
    {
      resource: 'role',
      action: 'update',
      description: 'ロール情報の更新',
    },
    {
      resource: 'role',
      action: 'delete',
      description: 'ロールの削除',
    },
    {
      resource: 'role',
      action: 'manage',
      description: 'ロールの完全管理',
    },

    // 権限関連権限
    {
      resource: 'permission',
      action: 'create',
      description: '権限の作成',
    },
    {
      resource: 'permission',
      action: 'read',
      description: '権限情報の閲覧',
    },
    {
      resource: 'permission',
      action: 'update',
      description: '権限情報の更新',
    },
    {
      resource: 'permission',
      action: 'delete',
      description: '権限の削除',
    },
    {
      resource: 'permission',
      action: 'manage',
      description: '権限の完全管理',
    },

    // 設定関連権限
    {
      resource: 'settings',
      action: 'read',
      description: 'システム設定の閲覧',
    },
    {
      resource: 'settings',
      action: 'update',
      description: 'システム設定の更新',
    },
    {
      resource: 'settings',
      action: 'manage',
      description: 'システム設定の完全管理',
    },

    // プロジェクト関連権限
    {
      resource: 'project',
      action: 'create',
      description: 'プロジェクトの作成',
    },
    {
      resource: 'project',
      action: 'read',
      description: 'プロジェクトの閲覧',
    },
    {
      resource: 'project',
      action: 'update',
      description: 'プロジェクトの更新',
    },
    {
      resource: 'project',
      action: 'delete',
      description: 'プロジェクトの削除',
    },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {},
      create: permission,
    });
  }

  console.log(`    ✓ ${permissions.length} permissions seeded successfully`);
}

/**
 * ロールと権限の紐付け
 *
 * - システム管理者ロール: *:* 権限
 * - 一般ユーザーロール: adr:read, adr:create, adr:update, user:read, settings:read
 */
export async function seedRolePermissions(prisma: PrismaClientInstance): Promise<void> {
  console.log('  - Seeding role-permission assignments...');

  // システム管理者ロール取得
  const adminRole = await prisma.role.findUnique({
    where: { name: 'admin' },
  });

  if (!adminRole) {
    throw new Error('Admin role not found. Run seedRoles() first.');
  }

  // 一般ユーザーロール取得
  const userRole = await prisma.role.findUnique({
    where: { name: 'user' },
  });

  if (!userRole) {
    throw new Error('User role not found. Run seedRoles() first.');
  }

  // システム管理者ロールに *:* 権限を割り当て
  const allPermission = await prisma.permission.findFirst({
    where: { resource: '*', action: '*' },
  });

  if (allPermission) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: allPermission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: allPermission.id,
      },
    });
  }

  // 一般ユーザーロールに基本権限を割り当て
  const basicPermissions = [
    { resource: 'adr', action: 'read' },
    { resource: 'adr', action: 'create' },
    { resource: 'adr', action: 'update' },
    { resource: 'user', action: 'read' },
    { resource: 'settings', action: 'read' },
    // プロジェクト関連権限（削除以外）
    { resource: 'project', action: 'create' },
    { resource: 'project', action: 'read' },
    { resource: 'project', action: 'update' },
  ];

  for (const { resource, action } of basicPermissions) {
    const permission = await prisma.permission.findFirst({
      where: { resource, action },
    });

    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: userRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: userRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  console.log('    ✓ Role-permission assignments seeded successfully');
}
