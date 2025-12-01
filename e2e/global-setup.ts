/**
 * @fileoverview Playwright E2Eテストのグローバルセットアップ
 *
 * テスト実行前に一度だけ実行され、テスト用データベースの初期化を行います。
 * マスターデータ（Role, Permission, RolePermission）と共通テストユーザーを作成し、
 * 各テストで一貫したデータ環境を提供します。
 */

import { seedRoles, seedPermissions, seedRolePermissions } from './fixtures/seed-helpers';
import { getPrismaClient, cleanDatabase } from './fixtures/database';
import { createAllTestUsers } from './fixtures/auth.fixtures';

/**
 * Playwright グローバルセットアップ
 *
 * テストスイート実行前に以下を実行:
 * 1. データベースクリーンアップ（既存のテストデータを削除）
 * 2. マスターデータ初期化（Role, Permission, RolePermission）
 * 3. 共通テストユーザー作成（REGULAR_USER, ADMIN_USER等）
 *
 * 処理フロー:
 * - 全テストデータをクリア（User, Invitation, RefreshTokenなど）
 * - Roleテーブルに admin, user ロールを作成
 * - Permissionテーブルに各種権限を作成（*:*, adr:*, user:*など）
 * - RolePermissionテーブルでロールと権限を紐付け
 *   - adminロール → *:* 権限（全権限）
 *   - userロール → adr:read, adr:create, adr:update, user:read, settings:read
 * - 全テストユーザーを作成（user@example.com, admin@example.com等）
 *
 * Note: 共通テストユーザーはグローバルセットアップで作成され、全テストで再利用されます。
 *       個別のテストデータが必要な場合は、各テストケース内でauth.fixturesを使用してください。
 */
export default async function globalSetup() {
  console.log('🧪 E2E Global Setup: Initializing test database...');

  const prisma = getPrismaClient();

  try {
    // 1. データベースをクリーンアップ
    // 全テストデータを削除（マスターデータは後で再作成）
    console.log('  - Cleaning database...');
    await cleanDatabase();

    // 2. マスターデータを初期化
    console.log('  - Seeding roles...');
    await seedRoles(prisma);

    console.log('  - Seeding permissions...');
    await seedPermissions(prisma);

    console.log('  - Seeding role-permission assignments...');
    await seedRolePermissions(prisma);

    // 3. 共通テストユーザーを作成
    console.log('  - Creating test users...');
    await createAllTestUsers(prisma);

    console.log('✅ E2E Global Setup: Test database initialized successfully');
    console.log('   - Roles: admin, user');
    console.log('   - Permissions: *:*, adr:*, user:*, role:*, permission:*, settings:*');
    console.log('   - Role-Permission assignments: completed');
    console.log(
      '   - Test users: user@example.com, admin@example.com, 2fa-user@example.com, user2@example.com'
    );
  } catch (error) {
    console.error('❌ E2E Global Setup failed:', error);
    throw error;
  } finally {
    // Prisma接続を切断
    await prisma.$disconnect();
  }
}
