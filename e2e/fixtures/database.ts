/**
 * @fileoverview E2Eテスト用のデータベースフィクスチャ
 *
 * Prismaクライアントの管理、データベースのクリーンアップ、
 * トランザクション管理などのユーティリティを提供します。
 */

import { PrismaPg } from '@prisma/adapter-pg';
// Prisma 7: Use root's generated client with driver adapter pattern
import { PrismaClient } from '../../src/generated/prisma/client.js';

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
    // Docker Compose環境では architrack_dev を使用（バックエンドと同じDB）
    //
    // 重要: E2EテストはDocker Composeで起動したバックエンドと通信するため、
    // バックエンドと同じデータベースを使用する必要があります。
    // Docker Composeのデフォルトは architrack_dev です。
    //
    // Prisma 7: Driver adapter pattern required for instantiation
    const connectionString = process.env.DATABASE_URL!;
    const adapter = new PrismaPg({ connectionString });

    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/**
 * データベースの全テストデータをクリーンアップ
 *
 * 外部キー制約の順序を考慮して、依存関係の逆順でテーブルをクリアします。
 * トランザクションを使用してACID特性を保証し、並列実行時の競合を防止します。
 * マスターデータ（Role, Permission）は削除しません。
 *
 * 削除順序:
 * 1. AuditLog（Userに依存）
 * 2. RefreshToken（Userに依存）
 * 3. TwoFactorBackupCode（Userに依存）
 * 4. PasswordHistory（Userに依存）
 * 5. PasswordResetToken（Userに依存）
 * 6. Invitation（Userに依存、オプショナル）
 * 7. UserRole（User, Roleに依存）
 * 8. User
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await cleanDatabase();
 * });
 * ```
 */
export async function cleanDatabase(): Promise<void> {
  const client = getPrismaClient();

  // トランザクションで確実にクリーンアップ
  // 外部キー制約の順序を考慮して削除（依存される側を先に削除）
  await client.$transaction([
    client.auditLog.deleteMany(),
    client.refreshToken.deleteMany(),
    client.twoFactorBackupCode.deleteMany(),
    client.passwordHistory.deleteMany(),
    client.passwordResetToken.deleteMany(),
    client.invitation.deleteMany(),
    client.userRole.deleteMany(), // UserとRoleに依存するため、User削除前に実行
    client.user.deleteMany(),
    // テストで作成されたロールの関連権限を削除
    client.rolePermission.deleteMany({
      where: {
        role: {
          isSystem: false,
        },
      },
    }),
    // テストで作成されたロールを削除（isSystem=false）
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
  };
}
