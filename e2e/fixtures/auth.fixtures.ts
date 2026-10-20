/**
 * @fileoverview 認証関連のE2Eテストフィクスチャ
 *
 * テストユーザー、招待、トークンなどの認証関連テストデータを
 * データベースに作成するヘルパー関数を提供します。
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
// Prisma 7: Use root's generated client
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { getPrismaClient } from './database';
import { TEST_USERS, hashPassword, type TestUser } from '../helpers/test-users';
import { encryptTotpSecret } from '../helpers/two-factor-totp';

/** Type alias for PrismaClient instance */
type PrismaClientInstance = InstanceType<typeof PrismaClient>;

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
export async function createTestUser(
  userKey: keyof typeof TEST_USERS,
  prisma?: PrismaClientInstance
) {
  const client = prisma || getPrismaClient();
  const userData = TEST_USERS[userKey];

  // パスワードハッシュ化
  const passwordHash = await hashPassword(userData.password);

  // ユーザー作成
  // 2FA有効ユーザーには既知の秘密鍵（E2E_TOTP_SECRET）を backend と同じ形式で暗号化して設定する。
  // E2E の補助（two-factor-totp.ts）がその秘密鍵から TOTP コードを計算する
  const user = await client.user.create({
    data: {
      email: userData.email,
      displayName: userData.displayName,
      passwordHash,
      twoFactorEnabled: userData.twoFactorEnabled || false,
      twoFactorSecret: userData.twoFactorEnabled ? encryptTotpSecret() : null,
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

  // REQ-3.5: 管理者ユーザー作成時は監査ログを記録
  // 初期管理者セットアップのシミュレーション
  if ((userData.roles as readonly string[]).includes('admin')) {
    await client.auditLog.create({
      data: {
        action: 'USER_CREATED',
        actorId: user.id,
        // 要件40.7: 本物の seed（seed-helpers.ts）と同じく実行者の写しを書く
        actorEmail: userData.email,
        actorDisplayName: userData.displayName,
        targetType: 'User',
        targetId: user.id,
        after: {
          email: userData.email,
          displayName: userData.displayName,
          role: 'admin',
        },
        metadata: {
          source: 'seed',
          isInitialAdmin: true,
        },
      },
    });
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
  prisma?: PrismaClientInstance
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
export async function createAllTestUsers(prisma?: PrismaClientInstance) {
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
export async function createCustomUser(userData: TestUser, prisma?: PrismaClientInstance) {
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
 * テストの中で作る利用者のメールアドレスの接頭辞
 *
 * 共有の役割の利用者（多くの spec が使う REGULAR_USER・ADMIN_USER）でログアウト・全デバイスの
 * ログアウト・パスワードの変更やリセットを行うと、その利用者のほかのセッションの系列まで失効する。
 * 同じセッションを二つのコンテキストや複数のタブでリフレッシュする検証も、リフレッシュトークンの
 * 再利用の検知の下では系列ごと失効させうる。これらの検証は、テストの中で作るこの接頭辞の利用者の
 * セッションで行い、共有の役割の利用者の系列を失効させない（user-authentication 要件33.6）。
 */
export const SESSION_USER_EMAIL_PREFIX = 'e2e-session-';

/** テストの中で作る利用者（ログインに要る資格と ID） */
export interface SessionUser extends TestUser {
  id: string;
}

/**
 * 共有の役割の利用者と同じ役割・表示名・パスワードの利用者を、一意のメールアドレスで作成
 *
 * 表示名とパスワードを共有の役割の利用者に揃えるのは、移した検証の画面上の観測（表示名で
 * ユーザーメニューを開く等）と入力値を変えないためである。後始末は `deleteSessionUsers` で行う。
 *
 * @param roleKey - 役割を写す共有の役割の利用者（'REGULAR_USER' または 'ADMIN_USER'）
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成した利用者の資格と ID（`loginAsUser` にそのまま渡せる）
 *
 * @example
 * ```typescript
 * const sessionUser = await createSessionUser('REGULAR_USER');
 * await loginAsUser(page, sessionUser);
 * ```
 */
export async function createSessionUser(
  roleKey: 'REGULAR_USER' | 'ADMIN_USER',
  prisma?: PrismaClientInstance
): Promise<SessionUser> {
  const base = TEST_USERS[roleKey];
  const userData: TestUser = {
    email: `${SESSION_USER_EMAIL_PREFIX}${Date.now()}-${randomBytes(4).toString('hex')}@example.com`,
    password: base.password,
    displayName: base.displayName,
    roles: [...base.roles],
    twoFactorEnabled: false,
  };
  const user = await createCustomUser(userData, prisma);
  return { ...userData, id: user.id };
}

/**
 * `createSessionUser` で作った利用者をすべて削除
 *
 * セッション・パスワードの履歴・リセットのトークン・ロールの割り当ては利用者の削除に連なって消える。
 *
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 */
export async function deleteSessionUsers(prisma?: PrismaClientInstance): Promise<void> {
  const client = prisma || getPrismaClient();
  await client.user.deleteMany({
    where: { email: { startsWith: SESSION_USER_EMAIL_PREFIX } },
  });
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
  prisma?: PrismaClientInstance
) {
  const client = prisma || getPrismaClient();

  // 暗号学的に安全なトークンを生成
  const token = randomBytes(32).toString('hex');

  // デフォルトで24時間後に期限切れ
  const expiresAt = options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  const invitation = await client.invitation.create({
    data: {
      email: options.email,
      token,
      inviterId: options.inviterId,
      expiresAt,
      status: options.status || 'pending',
    },
  });
  // 列は定期処理の消去のために空を許すが、作成直後の招待は常にトークンを持つ
  return { ...invitation, token };
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
  prisma?: PrismaClientInstance
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
 * 保存の形式は backend の SessionService と同じで、DB には原文の SHA-256 の 16 進だけを書き、
 * 原文は戻り値で返します（原文は保存しない。要件33.7）。
 *
 * @param options - リフレッシュトークンオプション（familyId 省略時は新しい系列）
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 原文（rawToken）と作成された行（row）
 *
 * @example
 * ```typescript
 * const user = await createTestUser('REGULAR_USER');
 * const { rawToken, row } = await createRefreshToken({
 *   userId: user.id,
 *   deviceInfo: 'Chrome on Windows',
 * });
 * ```
 */
export async function createRefreshToken(
  options: {
    userId: string;
    familyId?: string;
    replacedAt?: Date | null;
    expiresAt?: Date;
    deviceInfo?: string;
  },
  prisma?: PrismaClientInstance
) {
  const client = prisma || getPrismaClient();

  const rawToken = randomBytes(32).toString('hex');

  // デフォルトで30日後に期限切れ
  const expiresAt = options.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const row = await client.refreshToken.create({
    data: {
      userId: options.userId,
      tokenHash: createHash('sha256').update(rawToken, 'utf8').digest('hex'),
      familyId: options.familyId ?? randomUUID(),
      replacedAt: options.replacedAt ?? null,
      expiresAt,
      deviceInfo: options.deviceInfo || 'Test Device',
    },
  });

  return { rawToken, row };
}

/**
 * 2FAバックアップコードを作成
 *
 * 2要素認証テストで使用するバックアップコードを作成します。
 *
 * @param options - バックアップコードオプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたバックアップコード情報の配列（`code` に平文のコードを XXXX-XXXX 形式で添える）
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
  prisma?: PrismaClientInstance
) {
  const client = prisma || getPrismaClient();
  const count = options.count || 10;
  const backupCodes = [];

  for (let i = 0; i < count; i++) {
    // バックアップコード生成（8桁の英数字）
    const code = randomBytes(4).toString('hex').toUpperCase();
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;

    // backend と同じく、正規化した 8 文字（ハイフンなしの大文字）をハッシュ化する
    const codeHash = options.codeHash || (await hashPassword(code));

    const backupCode = await client.twoFactorBackupCode.create({
      data: {
        userId: options.userId,
        codeHash,
        usedAt: null,
      },
    });

    // 平文のコード（画面の表示形式 XXXX-XXXX）を添えて返す
    backupCodes.push({ ...backupCode, code: formattedCode });
  }

  return backupCodes;
}
