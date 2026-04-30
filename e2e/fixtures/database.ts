/**
 * @fileoverview E2Eテスト用のデータベースフィクスチャ
 *
 * Prismaクライアントの管理、データベースのクリーンアップ、
 * トランザクション管理などのユーティリティを提供します。
 */

import { PrismaPg } from '@prisma/adapter-pg';
// Prisma 7: Use root's generated client with driver adapter pattern
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedRoles, seedPermissions, seedRolePermissions } from './seed-helpers';
import { createAllTestUsers } from './auth.fixtures';

/**
 * Prismaクライアントのシングルトンインスタンス
 * テスト実行中に複数回接続を作成しないようにキャッシュします。
 */
let prisma: InstanceType<typeof PrismaClient> | null = null;

/**
 * Prismaクライアントのインスタンスを取得
 *
 * シングルトンパターンで、同じインスタンスを再利用します。
 * DATABASE_URL環境変数を使用してデータベースに接続します。
 *
 * @returns PrismaClientインスタンス
 *
 * @example
 * ```typescript
 * const prisma = getPrismaClient();
 * const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
 * ```
 */
export function getPrismaClient(): InstanceType<typeof PrismaClient> {
  if (!prisma) {
    // E2Eテスト用のデータベース接続URL
    //
    // E2Eテストはホストマシンから実行されるため、Docker内部ホスト名(postgres)ではなく
    // localhost経由でテスト環境のPostgreSQLに接続する必要があります。
    // テスト環境のポート: 5433 (開発環境5432とは異なる)
    //
    // DATABASE_URLが設定されていない場合、テスト環境のデフォルト値を使用します。
    //
    // Prisma 7: Driver adapter pattern required for instantiation
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://postgres:test@localhost:5433/architrack_test';
    const adapter = new PrismaPg({ connectionString });

    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/**
 * データベースの全テストデータをクリーンアップ
 *
 * 全データテーブルを TRUNCATE ... RESTART IDENTITY CASCADE で初期化します。
 * deleteMany を順次実行する方式は、Project → ExecutionBudget → ExecutionBudgetItem の
 * cascade 削除時に `order_items_executionBudgetItemId_fkey` (ON DELETE RESTRICT) が
 * 残存行で衝突し失敗することがあったため、順序依存のない TRUNCATE を採用します。
 * 保持するマスターデータは以下の通り:
 * - permissions（権限マスター）
 * - roles（isSystem=true のシステムロール）
 * - role_permissions（システムロールに紐づくもの）
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await cleanDatabase();
 * });
 * ```
 */
const TRUNCATE_TARGET_TABLES = [
  'amendment_apply_histories',
  'audit_logs',
  'company_info',
  'construction_schedules',
  'contracts',
  'estimate_item_lines',
  'estimate_items',
  'estimate_request_items',
  'estimate_request_status_histories',
  'estimate_requests',
  'estimates',
  'execution_budget_items',
  'execution_budgets',
  'image_annotations',
  'invitations',
  'itemized_statement_items',
  'itemized_statements',
  'monthly_close_histories',
  'order_items',
  'orders',
  'password_histories',
  'password_reset_tokens',
  'progress_record_items',
  'progress_records',
  'project_status_histories',
  'projects',
  'quantity_groups',
  'quantity_items',
  'quantity_tables',
  'received_quotation_line_items',
  'received_quotations',
  'refresh_tokens',
  'schedule_items',
  'site_surveys',
  'survey_images',
  'trading_partner_type_mappings',
  'trading_partners',
  'two_factor_backup_codes',
  'user_roles',
  'users',
] as const;

export async function cleanDatabase(): Promise<void> {
  const client = getPrismaClient();

  // 単一の TRUNCATE 文で対象テーブル全体を初期化する。
  // RESTART IDENTITY で連番列をリセット、CASCADE で未列挙の依存テーブルも安全に処理する。
  const tableList = TRUNCATE_TARGET_TABLES.map((t) => `"${t}"`).join(', ');
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);

  // テストで作成された非システムロール（isSystem=false）と、その role_permissions を削除する。
  // permissions / システムロールはマスターとして保持する。
  await client.$transaction([
    client.rolePermission.deleteMany({
      where: {
        role: {
          isSystem: false,
        },
      },
    }),
    client.role.deleteMany({
      where: {
        isSystem: false,
      },
    }),
  ]);

  // Note: システムロール（isSystem=true）とPermissionテーブルはマスターデータなので削除しない
  // これらはglobal-setupで初期化され、テスト全体で共有されます
}

/**
 * データベースをクリーンアップし、テストデータを復元
 *
 * cleanDatabase()を実行した後、マスターデータとテストユーザーを再作成します。
 * テストファイルのafterAllで使用することで、他のテストファイルへの影響を防ぎます。
 *
 * @example
 * ```typescript
 * test.afterAll(async () => {
 *   await cleanDatabaseAndRestoreTestData();
 * });
 * ```
 */
export async function cleanDatabaseAndRestoreTestData(): Promise<void> {
  const client = getPrismaClient();

  // データベースをクリーンアップ
  await cleanDatabase();

  // マスターデータを再作成
  await seedRoles(client);
  await seedPermissions(client);
  await seedRolePermissions(client);

  // 全テストユーザーを再作成
  await createAllTestUsers(client);
}

/**
 * 特定のテーブルのみをクリーンアップ
 *
 * 個別のテーブルだけをクリアしたい場合に使用します。
 * 外部キー制約に注意が必要です。
 *
 * @param tables - クリーンアップするテーブル名の配列
 *
 * @example
 * ```typescript
 * await cleanSpecificTables(['refreshToken', 'user']);
 * ```
 */
export async function cleanSpecificTables(
  tables: Array<
    | 'user'
    | 'invitation'
    | 'refreshToken'
    | 'passwordResetToken'
    | 'passwordHistory'
    | 'twoFactorBackupCode'
    | 'userRole'
    | 'auditLog'
    | 'companyInfo'
  >
): Promise<void> {
  const client = getPrismaClient();

  for (const table of tables) {
    switch (table) {
      case 'auditLog':
        await client.auditLog.deleteMany();
        break;
      case 'refreshToken':
        await client.refreshToken.deleteMany();
        break;
      case 'twoFactorBackupCode':
        await client.twoFactorBackupCode.deleteMany();
        break;
      case 'passwordHistory':
        await client.passwordHistory.deleteMany();
        break;
      case 'passwordResetToken':
        await client.passwordResetToken.deleteMany();
        break;
      case 'invitation':
        await client.invitation.deleteMany();
        break;
      case 'userRole':
        await client.userRole.deleteMany();
        break;
      case 'user':
        await client.user.deleteMany();
        break;
      case 'companyInfo':
        await client.companyInfo.deleteMany();
        break;
    }
  }
}

/**
 * データベース接続を切断
 *
 * テストスイート終了時に呼び出してリソースを解放します。
 * Playwrightのglobal teardownで使用することを推奨します。
 *
 * @example
 * ```typescript
 * test.afterAll(async () => {
 *   await disconnectDatabase();
 * });
 * ```
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

/**
 * データベースの状態を確認（デバッグ用）
 *
 * 各テーブルのレコード数を返します。
 * テストのデバッグ時に使用します。
 *
 * @returns 各テーブルのレコード数
 *
 * @example
 * ```typescript
 * const stats = await getDatabaseStats();
 * console.log(stats); // { users: 2, refreshTokens: 4, ... }
 * ```
 */
export async function getDatabaseStats(): Promise<Record<string, number>> {
  const client = getPrismaClient();

  return {
    users: await client.user.count(),
    invitations: await client.invitation.count(),
    refreshTokens: await client.refreshToken.count(),
    passwordResetTokens: await client.passwordResetToken.count(),
    passwordHistories: await client.passwordHistory.count(),
    twoFactorBackupCodes: await client.twoFactorBackupCode.count(),
    userRoles: await client.userRole.count(),
    roles: await client.role.count(),
    permissions: await client.permission.count(),
    rolePermissions: await client.rolePermission.count(),
    auditLogs: await client.auditLog.count(),
    companyInfo: await client.companyInfo.count(),
  };
}
