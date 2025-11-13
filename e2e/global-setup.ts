/**
 * @fileoverview Playwright E2Eテストのグローバルセットアップ
 *
 * テスト実行前に一度だけ実行され、テスト用データベースの初期化を行います。
 * マスターデータ（Role, Permission, RolePermission）を作成し、
 * 各テストで一貫したデータ環境を提供します。
 */

import { seedRoles, seedPermissions, seedRolePermissions } from '../backend/src/utils/seed-helpers';
import { getPrismaClient, cleanDatabase } from './fixtures/database';

/**
 * Playwright グローバルセットアップ
 *
 * テストスイート実行前に以下を実行:
 * 1. データベースクリーンアップ（既存のテストデータを削除）
 * 2. マスターデータ初期化（Role, Permission, RolePermission）
 *
 * 処理フロー:
 * - 全テストデータをクリア（User, Invitation, RefreshTokenなど）
 * - Roleテーブルに admin, user ロールを作成
 * - Permissionテーブルに各種権限を作成（*:*, adr:*, user:*など）
 * - RolePermissionテーブルでロールと権限を紐付け
 *   - adminロール → *:* 権限（全権限）
 *   - userロール → adr:read, adr:create, adr:update, user:read, settings:read
 *
 * Note: 初期管理者アカウントは作成しません。
 *       テストユーザーは各テストケース内でauth.fixturesを使用して作成してください。
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
    // @ts-expect-error - ルートとbackendで異なるPrisma Clientインスタンスだが実行時には互換性がある
    await seedRoles(prisma);

    console.log('  - Seeding permissions...');
    // @ts-expect-error - ルートとbackendで異なるPrisma Clientインスタンスだが実行時には互換性がある
    await seedPermissions(prisma);

    console.log('  - Seeding role-permission assignments...');
    // @ts-expect-error - ルートとbackendで異なるPrisma Clientインスタンスだが実行時には互換性がある
    await seedRolePermissions(prisma);

    console.log('✅ E2E Global Setup: Test database initialized successfully');
    console.log('   - Roles: admin, user');
    console.log('   - Permissions: *:*, adr:*, user:*, role:*, permission:*, settings:*');
    console.log('   - Role-Permission assignments: completed');
  } catch (error) {
    console.error('❌ E2E Global Setup failed:', error);
    throw error;
  } finally {
    // Prisma接続を切断
    await prisma.$disconnect();
  }
}
