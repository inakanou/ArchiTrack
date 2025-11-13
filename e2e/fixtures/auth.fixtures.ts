/**
 * @fileoverview 認証関連のE2Eテストフィクスチャ
 *
 * テストユーザー、招待、トークンなどの認証関連テストデータを
 * データベースに作成するヘルパー関数を提供します。
 */

import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from './database';
import { TEST_USERS, hashPassword, type TestUser } from '../helpers/test-users';

/**
 * テストユーザーをデータベースに作成
 *
 * TEST_USERSからユーザー情報を取得し、パスワードをハッシュ化してデータベースに保存します。
 * デフォルトでロール割り当ても自動的に行います。
 *
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたユーザー情報（パスワードハッシュを含む）
 *
 * @example
 * ```typescript
 * const user = await createTestUser('REGULAR_USER');
 * console.log(user.id); // UUID
 * console.log(user.email); // user@example.com
 * ```
 */
export async function createTestUser(userKey: keyof typeof TEST_USERS, prisma?: PrismaClient) {
  const client = prisma || getPrismaClient();
  const userData = TEST_USERS[userKey];

  // パスワードハッシュ化
  const passwordHash = await hashPassword(userData.password);

  // ユーザー作成
  const user = await client.user.create({
    data: {
      email: userData.email,
      displayName: userData.displayName,
      passwordHash,
      twoFactorEnabled: userData.twoFactorEnabled || false,
    },
  });

  // ロール割り当て
  for (const roleName of userData.roles) {
    const role = await client.role.findUnique({
      where: { name: roleName },
    });

    if (role) {
      await client.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });
    }
  }

  return user;
}

/**
 * 複数のテストユーザーをまとめて作成
 *
 * @param userKeys - TEST_USERSのキーの配列
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたユーザー情報の配列
 *
 * @example
 * ```typescript
 * const users = await createTestUsers(['REGULAR_USER', 'ADMIN_USER']);
 * ```
 */
export async function createTestUsers(
  userKeys: Array<keyof typeof TEST_USERS>,
  prisma?: PrismaClient
) {
  const users = [];
  for (const key of userKeys) {
    const user = await createTestUser(key, prisma);
    users.push(user);
  }
  return users;
}

/**
 * 全てのテストユーザーを作成
 *
 * TEST_USERSに定義されている全てのテストユーザーを作成します。
 *
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたユーザー情報の配列
 *
 * @example
 * ```typescript
 * const users = await createAllTestUsers();
 * ```
 */
export async function createAllTestUsers(prisma?: PrismaClient) {
  const userKeys = Object.keys(TEST_USERS) as Array<keyof typeof TEST_USERS>;
  return await createTestUsers(userKeys, prisma);
}

/**
 * カスタムユーザーを作成
 *
 * TEST_USERSに定義されていないカスタムユーザーを作成する場合に使用します。
 *
 * @param userData - ユーザーデータ
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたユーザー情報
 *
 * @example
 * ```typescript
 * const user = await createCustomUser({
 *   email: 'custom@example.com',
 *   password: 'CustomPass123!',
 *   displayName: 'Custom User',
 *   roles: ['user'],
 * });
 * ```
 */
export async function createCustomUser(userData: TestUser, prisma?: PrismaClient) {
  const client = prisma || getPrismaClient();

  // パスワードハッシュ化
  const passwordHash = await hashPassword(userData.password);

  // ユーザー作成
  const user = await client.user.create({
    data: {
      email: userData.email,
      displayName: userData.displayName,
      passwordHash,
      twoFactorEnabled: userData.twoFactorEnabled || false,
    },
  });

  // ロール割り当て
  for (const roleName of userData.roles) {
    const role = await client.role.findUnique({
      where: { name: roleName },
    });

    if (role) {
      await client.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });
    }
  }

  return user;
}

/**
 * 招待トークンを作成
 *
 * ユーザー登録テストで使用する招待トークンを作成します。
 *
 * @param options - 招待オプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成された招待情報（トークンを含む）
 *
 * @example
 * ```typescript
 * const admin = await createTestUser('ADMIN_USER');
 * const invitation = await createInvitation({
 *   email: 'newuser@example.com',
 *   inviterId: admin.id,
 * });
 * console.log(invitation.token); // 招待トークン
 * ```
 */
export async function createInvitation(
  options: {
    email: string;
    inviterId: string;
    expiresAt?: Date;
    status?: 'pending' | 'used' | 'expired' | 'revoked';
  },
  prisma?: PrismaClient
) {
  const client = prisma || getPrismaClient();

  // 暗号学的に安全なトークンを生成
  const token = randomBytes(32).toString('hex');

  // デフォルトで24時間後に期限切れ
  const expiresAt = options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  return await client.invitation.create({
    data: {
      email: options.email,
      token,
      inviterId: options.inviterId,
      expiresAt,
      status: options.status || 'pending',
    },
  });
}

/**
 * パスワードリセットトークンを作成
 *
 * パスワードリセットテストで使用するトークンを作成します。
 *
 * @param options - リセットトークンオプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたリセットトークン情報
 *
 * @example
 * ```typescript
 * const user = await createTestUser('REGULAR_USER');
 * const resetToken = await createPasswordResetToken({
 *   userId: user.id,
 * });
 * console.log(resetToken.token); // リセットトークン
 * ```
 */
export async function createPasswordResetToken(
  options: {
    userId: string;
    expiresAt?: Date;
    usedAt?: Date | null;
  },
  prisma?: PrismaClient
) {
  const client = prisma || getPrismaClient();

  // 暗号学的に安全なトークンを生成
  const token = randomBytes(32).toString('hex');

  // デフォルトで24時間後に期限切れ
  const expiresAt = options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  return await client.passwordResetToken.create({
    data: {
      userId: options.userId,
      token,
      expiresAt,
      usedAt: options.usedAt,
    },
  });
}

/**
 * リフレッシュトークンを作成
 *
 * セッション管理テストで使用するリフレッシュトークンを作成します。
 *
 * @param options - リフレッシュトークンオプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたリフレッシュトークン情報
 *
 * @example
 * ```typescript
 * const user = await createTestUser('REGULAR_USER');
 * const refreshToken = await createRefreshToken({
 *   userId: user.id,
 *   deviceInfo: 'Chrome on Windows',
 * });
 * ```
 */
export async function createRefreshToken(
  options: {
    userId: string;
    token?: string;
    expiresAt?: Date;
    deviceInfo?: string;
  },
  prisma?: PrismaClient
) {
  const client = prisma || getPrismaClient();

  // トークン生成（指定がない場合）
  const token = options.token || randomBytes(32).toString('hex');

  // デフォルトで30日後に期限切れ
  const expiresAt = options.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return await client.refreshToken.create({
    data: {
      userId: options.userId,
      token,
      expiresAt,
      deviceInfo: options.deviceInfo || 'Test Device',
    },
  });
}

/**
 * 2FAバックアップコードを作成
 *
 * 2要素認証テストで使用するバックアップコードを作成します。
 *
 * @param options - バックアップコードオプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたバックアップコード情報の配列
 *
 * @example
 * ```typescript
 * const user = await createTestUser('TWO_FA_USER');
 * const backupCodes = await createTwoFactorBackupCodes({
 *   userId: user.id,
 *   count: 10,
 * });
 * ```
 */
export async function createTwoFactorBackupCodes(
  options: {
    userId: string;
    count?: number;
    codeHash?: string;
  },
  prisma?: PrismaClient
) {
  const client = prisma || getPrismaClient();
  const count = options.count || 10;
  const backupCodes = [];

  for (let i = 0; i < count; i++) {
    // バックアップコード生成（8桁の英数字）
    const code = randomBytes(4).toString('hex').toUpperCase();
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;

    // ハッシュ化（実際の実装ではArgon2でハッシュ化する）
    const codeHash = options.codeHash || (await hashPassword(formattedCode));

    const backupCode = await client.twoFactorBackupCode.create({
      data: {
        userId: options.userId,
        codeHash,
        usedAt: null,
      },
    });

    backupCodes.push(backupCode);
  }

  return backupCodes;
}
