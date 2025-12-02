/**
 * @fileoverview E2Eテスト用のテストユーザー定義とヘルパー関数
 *
 * テストユーザーの一貫性を保ち、テスト間で共通の認証情報を使用できるようにします。
 */

import { hash } from '@node-rs/argon2';

/**
 * Argon2idハッシュ化パラメータ
 * backend/src/services/password.service.tsと同じパラメータを使用
 */
const ARGON2_MEMORY_COST = 65536; // 64MB in KB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;

/**
 * テストユーザーの型定義
 */
export interface TestUser {
  email: string;
  password: string;
  displayName: string;
  roles: string[];
  twoFactorEnabled?: boolean;
}

/**
 * テストユーザー定数
 *
 * 各テストで使用する一貫したテストユーザー情報を定義します。
 * パスワードは全てパスワード強度要件を満たしています:
 * - 12文字以上
 * - 大文字、小文字、数字、特殊文字のうち3種類以上
 */
export const TEST_USERS = {
  /**
   * 通常ユーザー（2FAなし）
   * ログインテストなどの基本的な認証テストで使用
   */
  REGULAR_USER: {
    email: 'user@example.com',
    password: 'Password123!',
    displayName: 'Test User',
    roles: ['user'],
    twoFactorEnabled: false,
  } as const,

  /**
   * 管理者ユーザー
   * 管理者権限が必要なテストで使用
   */
  ADMIN_USER: {
    email: 'admin@example.com',
    password: 'AdminPass123!',
    displayName: 'Admin User',
    roles: ['admin', 'user'],
    twoFactorEnabled: false,
  } as const,

  /**
   * 2FA有効ユーザー
   * 2要素認証フローのテストで使用
   */
  TWO_FA_USER: {
    email: '2fa-user@example.com',
    password: 'Password123!',
    displayName: '2FA Test User',
    roles: ['user'],
    twoFactorEnabled: true,
  } as const,

  /**
   * 追加の通常ユーザー（セッション管理テストなどで複数ユーザーが必要な場合）
   */
  REGULAR_USER_2: {
    email: 'user2@example.com',
    password: 'SecurePass456!',
    displayName: 'Test User 2',
    roles: ['user'],
    twoFactorEnabled: false,
  } as const,
} as const;

/**
 * パスワードをArgon2idアルゴリズムでハッシュ化する
 *
 * backend/src/services/password.service.tsと同じパラメータを使用して、
 * テストデータベースに保存するためのパスワードハッシュを生成します。
 *
 * @param password - ハッシュ化するプレーンテキストパスワード
 * @returns Argon2idハッシュ文字列
 *
 * @example
 * ```typescript
 * const passwordHash = await hashPassword('Password123!');
 * // $argon2id$v=19$m=65536,t=3,p=4$...
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, {
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    outputLen: 32, // 32バイト（256ビット）の出力
  });
}

/**
 * テストユーザーのパスワードハッシュをまとめて生成
 *
 * グローバルセットアップやフィクスチャで使用するため、
 * 全テストユーザーのパスワードハッシュを事前に生成します。
 *
 * @returns テストユーザーのメールアドレスをキーとしたパスワードハッシュのマップ
 *
 * @example
 * ```typescript
 * const passwordHashes = await generateTestUserPasswordHashes();
 * const userPasswordHash = passwordHashes['user@example.com'];
 * ```
 */
export async function generateTestUserPasswordHashes(): Promise<Record<string, string>> {
  const users = Object.values(TEST_USERS);
  const hashes: Record<string, string> = {};

  for (const user of users) {
    hashes[user.email] = await hashPassword(user.password);
  }

  return hashes;
}

/**
 * 特定のテストユーザーのパスワードハッシュを取得
 *
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）
 * @returns パスワードハッシュ
 *
 * @example
 * ```typescript
 * const hash = await getPasswordHashForUser('REGULAR_USER');
 * ```
 */
export async function getPasswordHashForUser(userKey: keyof typeof TEST_USERS): Promise<string> {
  const user = TEST_USERS[userKey];
  return await hashPassword(user.password);
}
