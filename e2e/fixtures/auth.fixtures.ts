/**
 * @fileoverview 認証関連のE2Eテストフィクスチャ
 *
 * テストユーザー、招待、トークンなどの認証関連テストデータを
 * データベースに作成するヘルパー関数を提供します。
 *
 * 利用者の作成は全て共通の補助 `createCustomUser` を通し、既定で 2FA 登録済み・有効・初回の変更を
 * 要しない状態で作る（user-authentication タスク47.4）。状態を変える検証は専用の利用者
 * （DEDICATED_USERS）を `resetDedicatedUser` で初期化して使う。
 *
 * 利用者を DB へ直接書く補助は、書いた後に backend の利用者の状態のキャッシュを無効化する
 * （`invalidateUserStateCache`、タスク47.5）。
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
// Prisma 7: Use root's generated client
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { getPrismaClient } from './database';
import {
  DEDICATED_USERS,
  TEST_USERS,
  hashPassword,
  type DedicatedUserKey,
  type TestUser,
} from '../helpers/test-users';
import { E2E_TOTP_SECRET, encryptTotpSecret } from '../helpers/two-factor-totp';
import { invalidateUserStateCache } from '../helpers/user-state-cache';
import { hashInvitationToken } from '../../src/utils/invitation-token.js';
import { hashPasswordResetToken } from '../../src/utils/password-reset-token.js';

/** Type alias for PrismaClient instance */
type PrismaClientInstance = InstanceType<typeof PrismaClient>;

/**
 * 作成する利用者の状態
 *
 * E2E が作る利用者は、既定で 2FA 登録済み（既知の秘密鍵 E2E_TOTP_SECRET）・有効・初回の変更を
 * 要しない状態で作る（user-authentication タスク47.4、要件34.2）。既定と異なる状態は、この引数で
 * 明示する。状態の項目は `CustomUserData` に書けない（型で分ける）。
 */
export interface TestUserState {
  /**
   * 2FA の登録（既定 true）。true は既知の秘密鍵 E2E_TOTP_SECRET、`{ secret }` はその秘密鍵、
   * false は未登録
   */
  twoFactor?: boolean | { secret: string };
  /** 有効か（既定 true） */
  isActive?: boolean;
  /** 初回のパスワード変更を要するか（既定 false） */
  mustChangePassword?: boolean;
}

/** 作成する利用者の資格と属性（状態の項目は `TestUserState` で渡す） */
export interface CustomUserData {
  email: string;
  password: string;
  displayName: string;
  /** 割り当てるロールの名前（存在しないロールは前提の誤りとして失敗する） */
  roles: readonly string[];
}

/** 作成した利用者（ログインの補助にそのまま渡せる資格と、状態と ID） */
export interface CreatedUser extends TestUser {
  id: string;
}

/** 状態の引数を既定で補い、DB の列の値にする */
function resolveUserState(state: TestUserState): {
  twoFactorEnabled: boolean;
  totpSecret: string | undefined;
  isActive: boolean;
  mustChangePassword: boolean;
} {
  const twoFactor = state.twoFactor ?? true;
  const totpSecret =
    twoFactor === false ? undefined : twoFactor === true ? E2E_TOTP_SECRET : twoFactor.secret;
  return {
    twoFactorEnabled: totpSecret !== undefined,
    totpSecret,
    isActive: state.isActive ?? true,
    mustChangePassword: state.mustChangePassword ?? false,
  };
}

/** ロールの名前から ID を引く（無ければ失敗する） */
async function resolveRoleIds(
  client: PrismaClientInstance,
  roleNames: readonly string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const roleName of roleNames) {
    const role = await client.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`ロール ${roleName} が見つかりません（利用者の作成の前提の誤り）`);
    }
    ids.push(role.id);
  }
  return ids;
}

/**
 * 利用者を作成する（E2E の利用者の作成の共通の補助）
 *
 * E2E の spec と補助が利用者を作るときは、全てこの補助（またはこれを使う `createTestUser`・
 * `createSessionUser`・`resetDedicatedUser`）を通す。Prisma で利用者を直接作らない
 * （招待経由の登録を除く）。既定は 2FA 登録済み・有効・初回の変更を要しない状態で、
 * 2FA の秘密鍵は backend と同じ形式で暗号化して保存する。
 *
 * @param userData - 資格・表示名・ロールの名前
 * @param state - 既定と異なる状態（省略時は既定）
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成した利用者（`loginAsUser`・`getAccessToken` にそのまま渡せる）
 *
 * @example
 * ```typescript
 * const user = await createCustomUser({
 *   email: 'custom@example.com',
 *   password: 'CustomPass123!',
 *   displayName: 'Custom User',
 *   roles: ['user'],
 * });
 * const notEnrolled = await createCustomUser(data, { twoFactor: false });
 * ```
 */
export async function createCustomUser(
  userData: CustomUserData,
  state: TestUserState = {},
  prisma?: PrismaClientInstance
): Promise<CreatedUser> {
  const client = prisma || getPrismaClient();
  const resolved = resolveUserState(state);
  const roleIds = await resolveRoleIds(client, userData.roles);

  const user = await client.user.create({
    data: {
      email: userData.email,
      displayName: userData.displayName,
      passwordHash: await hashPassword(userData.password),
      twoFactorEnabled: resolved.twoFactorEnabled,
      twoFactorSecret: resolved.totpSecret ? encryptTotpSecret(resolved.totpSecret) : null,
      isActive: resolved.isActive,
      mustChangePassword: resolved.mustChangePassword,
    },
  });

  for (const roleId of roleIds) {
    await client.userRole.create({ data: { userId: user.id, roleId } });
  }
  await invalidateUserStateCache([user.id]);

  return {
    id: user.id,
    email: userData.email,
    password: userData.password,
    displayName: userData.displayName,
    roles: [...userData.roles],
    twoFactorEnabled: resolved.twoFactorEnabled,
    totpSecret: resolved.totpSecret,
    mustChangePassword: resolved.mustChangePassword,
  };
}

/**
 * テストユーザーをデータベースに作成
 *
 * TEST_USERSからユーザー情報を取得し、共通の補助（`createCustomUser`）で作成します
 * （2FA 登録済み・有効・初回の変更を要しない状態）。ロール割り当ても行います。
 *
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成された利用者
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
): Promise<CreatedUser> {
  const client = prisma || getPrismaClient();
  const userData = TEST_USERS[userKey];

  const user = await createCustomUser(userData, { twoFactor: userData.twoFactorEnabled }, client);

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
): Promise<CreatedUser[]> {
  const users: CreatedUser[] = [];
  for (const key of userKeys) {
    users.push(await createTestUser(key, prisma));
  }
  return users;
}

/**
 * 全てのテストユーザーを作成
 *
 * TEST_USERSに定義されている全てのテストユーザーを作成します。
 * 専用の利用者（DEDICATED_USERS）は作らない（使うテストが `resetDedicatedUser` で作る）。
 *
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたユーザー情報の配列
 *
 * @example
 * ```typescript
 * const users = await createAllTestUsers();
 * ```
 */
export async function createAllTestUsers(prisma?: PrismaClientInstance): Promise<CreatedUser[]> {
  const userKeys = Object.keys(TEST_USERS) as Array<keyof typeof TEST_USERS>;
  return await createTestUsers(userKeys, prisma);
}

/**
 * 専用の利用者を既定の状態へ初期化する（無ければ作成する）
 *
 * 状態を変える検証の各テストの開始時に呼ぶ（user-authentication タスク47.4、design.md
 * 「E2E の認証基盤の移行」）。次を DEDICATED_USERS の定義どおりに戻す。
 * - パスワード（ハッシュを作り直し、パスワードの履歴とリセットのトークンを消す）
 * - 初回のパスワード変更の要否
 * - 2FA（登録の有無・秘密鍵・最後に使った時間ステップ・再登録中の秘密鍵・バックアップコード・
 *   検証の失敗回数とロック）
 * - 有効状態（無効化の日時と理由を含む）
 * - ログインのロック（失敗回数とロックの期限）
 * - ロールの割り当て
 * あわせて、その利用者のリフレッシュトークン（セッション）を消す。
 *
 * 削除された利用者は作り直す（ID は変わる）。戻り値の ID を使う。
 *
 * @param key - DEDICATED_USERS のキー
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 初期化した利用者（`loginAsUser` にそのまま渡せる）
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   stateUser = await resetDedicatedUser('STATE_CHANGE_USER');
 * });
 * ```
 */
export async function resetDedicatedUser(
  key: DedicatedUserKey,
  prisma?: PrismaClientInstance
): Promise<CreatedUser> {
  const client = prisma || getPrismaClient();
  const definition = DEDICATED_USERS[key];
  const resolved = resolveUserState({
    twoFactor: definition.twoFactorEnabled,
    mustChangePassword: definition.mustChangePassword,
  });
  const roleIds = await resolveRoleIds(client, definition.roles);
  const passwordHash = await hashPassword(definition.password);
  const twoFactorSecret = resolved.totpSecret ? encryptTotpSecret(resolved.totpSecret) : null;

  const user = await client.$transaction(async (tx) => {
    const state = {
      displayName: definition.displayName,
      passwordHash,
      mustChangePassword: resolved.mustChangePassword,
      twoFactorEnabled: resolved.twoFactorEnabled,
      twoFactorSecret,
      twoFactorLastUsedStep: null,
      twoFactorPendingSecret: null,
      twoFactorFailures: 0,
      twoFactorLockedUntil: null,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
      isLocked: false,
      lockedUntil: null,
      loginFailures: 0,
    };
    const row = await tx.user.upsert({
      where: { email: definition.email },
      create: { email: definition.email, ...state },
      update: state,
    });
    await tx.twoFactorBackupCode.deleteMany({ where: { userId: row.id } });
    await tx.passwordHistory.deleteMany({ where: { userId: row.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.id } });
    await tx.refreshToken.deleteMany({ where: { userId: row.id } });
    await tx.userRole.deleteMany({ where: { userId: row.id } });
    await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: row.id, roleId })) });
    return row;
  });
  // コミットの後に状態のキャッシュを無効化する（初期化の直後の状態の取得が戻した値を返す。タスク47.5）
  await invalidateUserStateCache([user.id]);

  return {
    id: user.id,
    email: definition.email,
    password: definition.password,
    displayName: definition.displayName,
    roles: [...definition.roles],
    twoFactorEnabled: resolved.twoFactorEnabled,
    totpSecret: resolved.totpSecret,
    mustChangePassword: resolved.mustChangePassword,
  };
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
export type SessionUser = CreatedUser;

/**
 * 共有の役割の利用者と同じ役割・表示名・パスワードの利用者を、一意のメールアドレスで作成
 *
 * 表示名とパスワードを共有の役割の利用者に揃えるのは、移した検証の画面上の観測（表示名で
 * ユーザーメニューを開く等）と入力値を変えないためである。状態は共通の補助の既定
 * （2FA 登録済み・有効・初回の変更を要しない）で、`state` で変えられる。
 * 後始末は `deleteSessionUsers` で行う。
 *
 * @param roleKey - 役割を写す共有の役割の利用者（'REGULAR_USER' または 'ADMIN_USER'）
 * @param state - 既定と異なる状態（省略時は既定）
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
  state: TestUserState = {},
  prisma?: PrismaClientInstance
): Promise<SessionUser> {
  const base = TEST_USERS[roleKey];
  return createCustomUser(
    {
      email: `${SESSION_USER_EMAIL_PREFIX}${Date.now()}-${randomBytes(4).toString('hex')}@example.com`,
      password: base.password,
      displayName: base.displayName,
      roles: base.roles,
    },
    state,
    prisma
  );
}

/**
 * `createSessionUser` で作った利用者をすべて削除
 *
 * セッション・パスワードの履歴・リセットのトークン・ロールの割り当ては利用者の削除に連なって消える。
 * 案件の閲覧範囲（user-authentication 要件39）のために工事担当者に据えた案件は、削除の前に参照を外す。
 *
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 */
export async function deleteSessionUsers(prisma?: PrismaClientInstance): Promise<void> {
  const client = prisma || getPrismaClient();
  const where = { email: { startsWith: SESSION_USER_EMAIL_PREFIX } };
  const users = await client.user.findMany({ where, select: { id: true } });
  await client.project.updateMany({
    where: { constructionPersonId: { in: users.map((u) => u.id) } },
    data: { constructionPersonId: null },
  });
  await client.user.deleteMany({ where });
  await invalidateUserStateCache(users.map((u) => u.id));
}

/**
 * 招待トークンを作成
 *
 * ユーザー登録テストと招待画面のテストで使用する招待を作成します。保存の形式は本番の InvitationService と
 * 同じ（原文の SHA-256 の 16 進。user-authentication 要件37.1）で、DB にはハッシュだけを書き、原文を返します。
 *
 * @param options - 招待オプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成された招待情報（原文のトークンを含む）
 *
 * @example
 * ```typescript
 * const admin = await createTestUser('ADMIN_USER');
 * const invitation = await createInvitation({
 *   email: 'newuser@example.com',
 *   inviterId: admin.id,
 * });
 * console.log(invitation.token); // 招待トークン（原文）
 * ```
 */
export async function createInvitation(
  options: {
    email: string;
    inviterId: string;
    expiresAt?: Date;
    status?: 'pending' | 'used' | 'expired' | 'revoked';
    usedAt?: Date | null;
    /** 原文（省略時は暗号学的に安全な無作為の値） */
    token?: string;
  },
  prisma?: PrismaClientInstance
) {
  const client = prisma || getPrismaClient();

  // 暗号学的に安全なトークンを生成
  const token = options.token ?? randomBytes(32).toString('hex');

  // デフォルトで24時間後に期限切れ
  const expiresAt = options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  const invitation = await client.invitation.create({
    data: {
      email: options.email,
      tokenHash: hashInvitationToken(token),
      inviterId: options.inviterId,
      expiresAt,
      status: options.status || 'pending',
      ...(options.usedAt !== undefined && { usedAt: options.usedAt }),
    },
  });
  // 原文は DB に無いため、作成した側だけが持つ値を返す
  return { ...invitation, token };
}

/**
 * パスワードリセットトークンを作成
 *
 * パスワードリセットテストで使用するトークンを作成します。保存の形式は本番の PasswordService と
 * 同じ（原文の SHA-256 の 16 進。user-authentication 要件37.1）で、DB にはハッシュだけを書き、原文を返します。
 *
 * @param options - リセットトークンオプション
 * @param prisma - Prismaクライアント（省略時はデフォルトクライアントを使用）
 * @returns 作成されたリセットトークン情報（原文のトークンを含む）
 *
 * @example
 * ```typescript
 * const user = await createTestUser('REGULAR_USER');
 * const resetToken = await createPasswordResetToken({
 *   userId: user.id,
 * });
 * console.log(resetToken.token); // リセットトークン（原文）
 * ```
 */
export async function createPasswordResetToken(
  options: {
    userId: string;
    expiresAt?: Date;
    createdAt?: Date;
    usedAt?: Date | null;
    /** 原文（省略時は暗号学的に安全な無作為の値） */
    token?: string;
  },
  prisma?: PrismaClientInstance
) {
  const client = prisma || getPrismaClient();

  // 暗号学的に安全なトークンを生成
  const token = options.token ?? randomBytes(32).toString('hex');

  // デフォルトで1時間後に期限切れ（要件7.3）
  const expiresAt = options.expiresAt || new Date(Date.now() + 60 * 60 * 1000);

  const resetToken = await client.passwordResetToken.create({
    data: {
      userId: options.userId,
      tokenHash: hashPasswordResetToken(token),
      expiresAt,
      ...(options.createdAt !== undefined && { createdAt: options.createdAt }),
      usedAt: options.usedAt,
    },
  });
  // 原文は DB に無いため、作成した側だけが持つ値を返す
  return { ...resetToken, token };
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
