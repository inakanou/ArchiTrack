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
  /** 2FA 登録済みか（作成の補助の既定は登録済み。user-authentication 要件34.2） */
  twoFactorEnabled?: boolean;
  /** 2FA の秘密鍵（Base32。省略時は E2E_TOTP_SECRET。ログインの補助がこの値でコードを計算する） */
  totpSecret?: string;
  /** 初回のパスワード変更を要するか（作成の補助の既定は要しない） */
  mustChangePassword?: boolean;
}

/**
 * テストユーザー定数
 *
 * 各テストで使用する一貫したテストユーザー情報を定義します。
 * 全ての役割の利用者は既知の秘密鍵（E2E_TOTP_SECRET）で 2FA 登録済みとして作成し、
 * ログインの補助（auth-actions.ts・auth-api.ts・shared-sessions.ts）が TOTP のコードを計算して
 * 2FA の検証を通す（user-authentication タスク47.4、要件34.2）。
 * パスワードは全てパスワード強度要件を満たしています:
 * - 12文字以上
 * - 大文字、小文字、数字、特殊文字のうち3種類以上
 */
export const TEST_USERS = {
  /**
   * 通常ユーザー
   * ログインテストなどの基本的な認証テストで使用
   */
  REGULAR_USER: {
    email: 'user@example.com',
    password: 'Password123!',
    displayName: 'Test User',
    roles: ['user'],
    twoFactorEnabled: true,
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
    twoFactorEnabled: true,
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
    twoFactorEnabled: true,
  } as const,
} as const;

/**
 * 状態を変える検証や、既定（2FA 登録済み・初回の変更を要しない・有効）と異なる状態を要する検証の
 * 専用の利用者
 *
 * 共有の役割の利用者（TEST_USERS）の状態を変えないため、状態に依存する検証はこれらの利用者で行う
 * （user-authentication タスク47.4、design.md「E2E の認証基盤の移行」）。全体の準備では作らず、
 * 各テストの開始時に `resetDedicatedUser`（e2e/fixtures/auth.fixtures.ts）を呼んで、
 * 作成するか既定の状態（パスワード・初回の変更の要否・2FA と最後に使った時間ステップ・有効状態・
 * ロック）へ戻してから使う。
 */
export const DEDICATED_USERS = {
  /**
   * 2FA 未登録の検証用（2FA の設定・有効化の流れ、2FA の必須化の制限）
   */
  TWO_FA_NOT_ENROLLED_USER: {
    email: 'e2e-dedicated-no-2fa@example.com',
    password: 'NoTwoFactor123!',
    displayName: 'Dedicated NoTwoFactor',
    roles: ['user'],
    twoFactorEnabled: false,
    mustChangePassword: false,
  },

  /**
   * 初回のパスワード変更の検証用（初期管理者と同じく、2FA 未登録で初回の変更を要する）
   */
  PASSWORD_CHANGE_REQUIRED_USER: {
    email: 'e2e-dedicated-initial-password@example.com',
    password: 'InitialPass123!',
    displayName: 'Dedicated InitialPassword',
    roles: ['admin', 'user'],
    twoFactorEnabled: false,
    mustChangePassword: true,
  },

  /**
   * 状態を変える検証用（無効化・ロック・2FA の再設定・削除・パスワードの変更とリセット）
   */
  STATE_CHANGE_USER: {
    email: 'e2e-dedicated-state-change@example.com',
    password: 'StateChange123!',
    displayName: 'Dedicated StateChange',
    roles: ['user'],
    twoFactorEnabled: true,
    mustChangePassword: false,
  },
} as const;

export type DedicatedUserKey = keyof typeof DEDICATED_USERS;

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
