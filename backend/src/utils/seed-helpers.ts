/**
 * @fileoverview Seedスクリプトのヘルパー関数
 *
 * Requirements:
 * - 3.1-3.5: 初期管理者アカウントのセットアップ
 * - 17: 動的ロール管理（事前定義ロール）
 * - 18: 権限管理（事前定義権限）
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { hash } from '@node-rs/argon2';
import logger from './logger.js';

/**
 * 事前定義ロールのシーディング
 *
 * 要件17: 事前定義ロール
 * - システム管理者（admin）: 全ての権限を持つ最高権限ロール
 * - 一般ユーザー（user）: 自分が作成したリソースのみアクセス可能な基本ロール
 */
export async function seedRoles(prisma: PrismaClient): Promise<void> {
  logger.info('Seeding roles...');

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

  logger.info('Roles seeded successfully');
}

/**
 * 事前定義権限のシーディング
 *
 * 要件18: 権限管理
 * - resource:action形式で権限を定義
 * - システム管理者用: *:* (全権限)
 * - 一般ユーザー用: adr:read, adr:create, adr:update, user:read, settings:read
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  logger.info('Seeding permissions...');

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

  logger.info(`${permissions.length} permissions seeded successfully`);
}

/**
 * ロールと権限の紐付け
 *
 * - システム管理者ロール: *:* 権限
 * - 一般ユーザーロール: adr:read, adr:create, adr:update, user:read, settings:read
 */
export async function seedRolePermissions(prisma: PrismaClient): Promise<void> {
  logger.info('Seeding role-permission assignments...');

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

  logger.info('Role-permission assignments seeded successfully');
}

/**
 * 初期管理者アカウントの作成
 *
 * 要件3: 初期管理者アカウントのセットアップ
 * - 環境変数から管理者情報を取得
 * - 既に存在する場合はスキップ（冪等性）
 * - システム管理者ロールを割り当て
 */
export async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  logger.info('Seeding admin user...');

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const adminDisplayName =
    process.env.INITIAL_ADMIN_DISPLAY_NAME ||
    process.env.ADMIN_DISPLAY_NAME ||
    'System Administrator';

  if (!adminEmail || !adminPassword) {
    logger.warn(
      'INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD not set. Skipping admin user creation.'
    );
    return;
  }

  // 既に存在する場合はスキップ（冪等性）
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    logger.info(`Admin user already exists: ${adminEmail}. Skipping.`);
    return;
  }

  // パスワードをArgon2idでハッシュ化
  const passwordHash = await hash(adminPassword, {
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 4,
  });

  // システム管理者ロール取得
  const adminRole = await prisma.role.findUnique({
    where: { name: 'admin' },
  });

  if (!adminRole) {
    throw new Error('Admin role not found. Run seedRoles() first.');
  }

  // 管理者ユーザー作成
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      displayName: adminDisplayName,
      passwordHash,
    },
  });

  // システム管理者ロールを割り当て
  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  logger.info(`Admin user created successfully: ${adminEmail}`);
}
