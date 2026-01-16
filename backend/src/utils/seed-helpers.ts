/**
 * @fileoverview Seedスクリプトのヘルパー関数
 *
 * Requirements (user-authentication):
 * - REQ-3.1-3.5: 初期管理者アカウントのセットアップ
 * - REQ-17: 動的ロール管理（事前定義ロール）
 * - REQ-18: 権限管理（事前定義権限）
 *
 * Requirements (project-management):
 * - REQ-12.5: プロジェクト権限の定義
 *
 * Requirements (trading-partner-management):
 * - REQ-7.5: 取引先管理権限の定義
 *   - trading-partner:create, trading-partner:read, trading-partner:update, trading-partner:delete
 *
 * Requirements (site-survey):
 * - REQ-12.1, 12.2, 12.3: 現場調査管理権限の定義
 *   - site_survey:create, site_survey:read, site_survey:update, site_survey:delete
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import { hash } from '@node-rs/argon2';
import logger from './logger.js';

/**
 * 事前定義ロールのシーディング
 *
 * @requirement user-authentication/REQ-17: 事前定義ロール
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
 * @requirement user-authentication/REQ-18: 権限管理
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
      description: 'ユーザーの作成',
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
      action: 'invite',
      description: 'ユーザーの招待',
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

    // プロジェクト関連権限（Requirements 12.5）
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

    // 取引先関連権限（trading-partner-management/REQ-7.5）
    {
      resource: 'trading-partner',
      action: 'create',
      description: '取引先の作成',
    },
    {
      resource: 'trading-partner',
      action: 'read',
      description: '取引先の閲覧',
    },
    {
      resource: 'trading-partner',
      action: 'update',
      description: '取引先の更新',
    },
    {
      resource: 'trading-partner',
      action: 'delete',
      description: '取引先の削除',
    },

    // 現場調査関連権限（site-survey/REQ-12.1, 12.2, 12.3）
    {
      resource: 'site_survey',
      action: 'create',
      description: '現場調査の作成',
    },
    {
      resource: 'site_survey',
      action: 'read',
      description: '現場調査の閲覧',
    },
    {
      resource: 'site_survey',
      action: 'update',
      description: '現場調査の更新',
    },
    {
      resource: 'site_survey',
      action: 'delete',
      description: '現場調査の削除',
    },

    // 数量表関連権限（quantity-table-generation）
    {
      resource: 'quantity_table',
      action: 'create',
      description: '数量表の作成',
    },
    {
      resource: 'quantity_table',
      action: 'read',
      description: '数量表の閲覧',
    },
    {
      resource: 'quantity_table',
      action: 'update',
      description: '数量表の更新',
    },
    {
      resource: 'quantity_table',
      action: 'delete',
      description: '数量表の削除',
    },
  ];

  // createManyでskipDuplicatesを使用し、並列テスト実行時のレースコンディションを回避
  // PostgreSQLのON CONFLICT DO NOTHINGを使用するため、重複時はスキップされる
  const result = await prisma.permission.createMany({
    data: permissions,
    skipDuplicates: true,
  });

  logger.info(
    `${result.count} permissions seeded successfully (${permissions.length - result.count} already existed)`
  );
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
    // createManyでskipDuplicatesを使用し、並列テスト実行時のレースコンディションを回避
    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: adminRole.id,
          permissionId: allPermission.id,
        },
      ],
      skipDuplicates: true,
    });
  }

  // 一般ユーザーロールに基本権限を割り当て
  const basicPermissions = [
    { resource: 'adr', action: 'read' },
    { resource: 'adr', action: 'create' },
    { resource: 'adr', action: 'update' },
    { resource: 'user', action: 'read' },
    { resource: 'settings', action: 'read' },
    // プロジェクト関連権限（Requirements 12.5）
    // 一般ユーザーはプロジェクトの作成・閲覧・更新が可能（削除は管理者のみ）
    { resource: 'project', action: 'create' },
    { resource: 'project', action: 'read' },
    { resource: 'project', action: 'update' },
    // 取引先関連権限（trading-partner-management/REQ-7.5）
    // 一般ユーザーは取引先の作成・閲覧・更新が可能（削除は管理者のみ）
    { resource: 'trading-partner', action: 'create' },
    { resource: 'trading-partner', action: 'read' },
    { resource: 'trading-partner', action: 'update' },
    // 現場調査関連権限（site-survey/REQ-12.1, 12.2, 12.3）
    // 一般ユーザーは現場調査の作成・閲覧・更新が可能（削除は管理者のみ）
    { resource: 'site_survey', action: 'create' },
    { resource: 'site_survey', action: 'read' },
    { resource: 'site_survey', action: 'update' },
    // 数量表関連権限（quantity-table-generation）
    // 一般ユーザーは数量表の作成・閲覧・更新・削除が可能
    { resource: 'quantity_table', action: 'create' },
    { resource: 'quantity_table', action: 'read' },
    { resource: 'quantity_table', action: 'update' },
    { resource: 'quantity_table', action: 'delete' },
  ];

  // 権限IDを一括取得
  const permissions = await prisma.permission.findMany({
    where: {
      OR: basicPermissions,
    },
  });

  // createManyでskipDuplicatesを使用し、並列テスト実行時のレースコンディションを回避
  if (permissions.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: userRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  logger.info('Role-permission assignments seeded successfully');
}

/**
 * 初期管理者アカウントの作成
 *
 * @requirement user-authentication/REQ-3: 初期管理者アカウントのセットアップ
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

  // 既に存在する場合は監査ログのみ確認・作成（冪等性）
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    // REQ-3.5: 既存の管理者に対しても監査ログが存在しない場合は作成
    const existingAuditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'USER_CREATED',
        targetType: 'User',
        targetId: existingAdmin.id,
      },
    });

    if (!existingAuditLog) {
      await prisma.auditLog.create({
        data: {
          action: 'USER_CREATED',
          actorId: existingAdmin.id,
          targetType: 'User',
          targetId: existingAdmin.id,
          after: {
            email: adminEmail,
            displayName: existingAdmin.displayName,
            role: 'admin',
          },
          metadata: {
            source: 'seed',
            isInitialAdmin: true,
            migratedFromExisting: true,
          },
        },
      });
      logger.info(`Admin user audit log created for existing user: ${adminEmail}`);
    }

    logger.info(`Admin user already exists: ${adminEmail}. Skipping user creation.`);
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

  // REQ-3.5: 初期管理者作成を監査ログに記録
  await prisma.auditLog.create({
    data: {
      action: 'USER_CREATED',
      actorId: adminUser.id, // 初期管理者は自身を作成者として記録
      targetType: 'User',
      targetId: adminUser.id,
      after: {
        email: adminEmail,
        displayName: adminDisplayName,
        role: 'admin',
      },
      metadata: {
        source: 'seed',
        isInitialAdmin: true,
      },
    },
  });

  logger.info(`Admin user created successfully: ${adminEmail}`);
}
