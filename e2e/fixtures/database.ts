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
import { createTestUser, createAllTestUsers } from './auth.fixtures';
import { TEST_USERS, hashPassword } from '../helpers/test-users';

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
 * 外部キー制約の順序を考慮して、依存関係の逆順でテーブルをクリアします。
 * トランザクションを使用してACID特性を保証し、並列実行時の競合を防止します。
 * マスターデータ（Role, Permission）は削除しません。
 *
 * 削除順序:
 * 1. ProjectStatusHistory（Projectに依存）
 * 2. Project（Userに依存）
 * 3. AuditLog（Userに依存）
 * 4. RefreshToken（Userに依存）
 * 5. TwoFactorBackupCode（Userに依存）
 * 6. PasswordHistory（Userに依存）
 * 7. PasswordResetToken（Userに依存）
 * 8. Invitation（Userに依存、オプショナル）
 * 9. UserRole（User, Roleに依存）
 * 10. User
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
    // プロジェクト関連テーブルを先に削除（Userに依存）
    client.projectStatusHistory.deleteMany(),
    client.project.deleteMany(),
    // 取引先関連テーブルを削除
    client.tradingPartner.deleteMany(),
    // 自社情報テーブルを削除
    client.companyInfo.deleteMany(),
    // 認証・ユーザー関連テーブル
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
 * ユーザー以外のビジネスデータをクリーンアップ
 *
 * プロジェクト、取引先、自社情報、監査ログなどのビジネスデータのみを削除し、
 * ユーザー・認証関連テーブルは保持します。
 * 並列テスト実行時にユーザーデータを破壊しないために使用します。
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await cleanNonUserData();
 * });
 * ```
 */
export async function cleanNonUserData(): Promise<void> {
  const client = getPrismaClient();

  await client.$transaction([
    client.projectStatusHistory.deleteMany(),
    client.project.deleteMany(),
    client.tradingPartner.deleteMany(),
    client.companyInfo.deleteMany(),
    client.auditLog.deleteMany(),
  ]);
}

/**
 * テストで作成された非システムロールをクリーンアップ
 *
 * システムロールとユーザーを保持しながら、テストで作成されたカスタムロールと
 * 関連する権限割り当て・ユーザーロール割り当てを削除します。
 * admin系テストのbeforeEachで使用し、前回テストの残留データを除去します。
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await cleanNonSystemRoles();
 * });
 * ```
 */
export async function cleanNonSystemRoles(): Promise<void> {
  const client = getPrismaClient();

  // 非システムロールのIDを取得
  const nonSystemRoles = await client.role.findMany({
    where: { isSystem: false },
    select: { id: true },
  });
  const roleIds = nonSystemRoles.map((r) => r.id);

  if (roleIds.length === 0) return;

  // カスタムロールの関連データを順序付きで削除
  await client.$transaction([
    client.userRole.deleteMany({ where: { roleId: { in: roleIds } } }),
    client.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } }),
    client.role.deleteMany({ where: { isSystem: false } }),
  ]);
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
 * 特定のテストユーザーを初期状態にリセット
 *
 * 並列テスト実行時にcleanDatabase()が他テストのデータを破壊する問題を防ぐため、
 * ユーザーを削除せずにUPDATEで初期状態に復元します。
 * これにより、他の並列テストがユーザーを一時的に参照できなくなる問題を回避します。
 *
 * - 既存ユーザー: パスワード・2FA設定をリセットし、staleなトークン/バックアップコードを削除
 * - 未存在ユーザー: createTestUserで新規作成
 *
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
 * @returns リセットされたユーザー情報
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   const user = await resetTestUser('TWO_FA_USER');
 * });
 * ```
 */
export async function resetTestUser(userKey: keyof typeof TEST_USERS) {
  const client = getPrismaClient();
  const userData = TEST_USERS[userKey];

  const existingUser = await client.user.findUnique({
    where: { email: userData.email },
  });

  if (existingUser) {
    // staleな認証関連レコードをクリーンアップ（セッション、バックアップコード）
    await client.$transaction([
      client.refreshToken.deleteMany({ where: { userId: existingUser.id } }),
      client.twoFactorBackupCode.deleteMany({ where: { userId: existingUser.id } }),
    ]);

    // ユーザーの状態を初期値にリセット（パスワード、2FA設定、ロック状態等）
    const newPasswordHash = await hashPassword(userData.password);
    return await client.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: newPasswordHash,
        displayName: userData.displayName,
        twoFactorEnabled: userData.twoFactorEnabled || false,
        twoFactorSecret: userData.twoFactorEnabled ? 'dummy:secret:for-e2e-test' : null,
        // アカウントロック状態をリセット
        isLocked: false,
        lockedUntil: null,
        loginFailures: 0,
        twoFactorFailures: 0,
        twoFactorLockedUntil: null,
      },
    });
  }

  // ユーザーが存在しない場合は新規作成
  return await createTestUser(userKey);
}

/**
 * テストユーザーの情報を読み取り専用で取得
 *
 * resetTestUserと異なり、データベースを一切変更しません。
 * テスト本文内でユーザーID等の参照が必要な場合に使用します。
 * beforeEach/beforeAllで既にresetTestUserを呼んでいる場合、
 * テスト本文ではこちらを使用することで並列テストへの副作用を防ぎます。
 *
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
 * @returns ユーザー情報
 * @throws ユーザーが見つからない場合はエラー
 *
 * @example
 * ```typescript
 * test('ユーザー情報を確認', async () => {
 *   const user = await getTestUser('REGULAR_USER');
 *   expect(user.id).toBeDefined();
 * });
 * ```
 */
export async function getTestUser(userKey: keyof typeof TEST_USERS) {
  const client = getPrismaClient();
  const userData = TEST_USERS[userKey];

  const user = await client.user.findUnique({
    where: { email: userData.email },
  });

  if (!user) {
    throw new Error(`Test user ${userKey} (${userData.email}) not found in database`);
  }

  return user;
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
