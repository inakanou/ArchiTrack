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
 * バックエンドAPIの準備完了を待機
 *
 * バックエンドコンテナがヘルスチェックに応答するまで待機します。
 * これにより、マイグレーションの完了も保証されます。
 * 最大60秒間、2秒間隔でリトライします。
 *
 * @param maxRetries - 最大リトライ回数（デフォルト: 30）
 * @param delayMs - リトライ間隔（ミリ秒、デフォルト: 2000）
 */
async function waitForBackend(maxRetries = 30, delayMs = 2000): Promise<void> {
  const healthUrl = 'http://localhost:3100/health';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log(`  - Backend API ready (attempt ${attempt}/${maxRetries})`);
        return;
      }
    } catch {
      // Connection refused or other network error
    }

    if (attempt === maxRetries) {
      throw new Error(`Backend API not ready after ${maxRetries} attempts`);
    }
    console.log(`  - Waiting for backend API... (attempt ${attempt}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/**
 * データベース接続が確立されるまでリトライ
 *
 * PostgreSQLコンテナが完全に起動するまで待機します。
 * 最大30秒間、1秒間隔でリトライします。
 *
 * @param prisma - Prismaクライアントインスタンス
 * @param maxRetries - 最大リトライ回数（デフォルト: 30）
 * @param delayMs - リトライ間隔（ミリ秒、デフォルト: 1000）
 */
async function waitForDatabase(
  prisma: ReturnType<typeof getPrismaClient>,
  maxRetries = 30,
  delayMs = 1000
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 簡単なクエリを実行して接続を確認
      await prisma.$queryRaw`SELECT 1`;
      console.log(`  - Database connection established (attempt ${attempt}/${maxRetries})`);
      return;
    } catch {
      if (attempt === maxRetries) {
        throw new Error(`Database connection failed after ${maxRetries} attempts`);
      }
      console.log(`  - Waiting for database... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

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
    // 0. バックエンドAPIの準備完了を待機（マイグレーション完了を保証）
    await waitForBackend();

    // 0.5. データベース接続を確立
    await waitForDatabase(prisma);

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
