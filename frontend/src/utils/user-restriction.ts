/**
 * @fileoverview 利用者の状態による画面の遷移の制限（user-authentication タスク47.6）
 *
 * design.md「利用者の状態の照合」「AuthContext・ProtectedRoute（変更）」に従う。
 * - 初回のパスワード変更を要する利用者（`mustChangePassword`）は `/setup/password` だけを開ける（要件37.7）
 * - 2FA 未登録の利用者（`twoFactorEnabled` が false）は 2FA 設定の画面だけを開ける（要件34.1・34.3・34.5・34.8）
 * - 優先順位は初回のパスワード変更 → 2FA 未登録（backend の照合と同じ。初期管理者は先にパスワードを変える）
 *
 * backend は制限中の利用者の API を 403（`PASSWORD_CHANGE_REQUIRED`・`TWO_FACTOR_SETUP_REQUIRED`）で拒否する。
 * 画面はそのコードを受けたら利用者の状態を更新し、同じ制限へ委ねる。
 */

import { toSafeInternalPath } from './safe-redirect';

/** 初回のパスワード変更の画面 */
export const PASSWORD_SETUP_PATH = '/setup/password';

/** 2FA 設定の画面 */
export const TWO_FACTOR_SETUP_PATH = '/profile/2fa-setup';

/**
 * 2FA 設定の画面に一度だけ表示する案内の sessionStorage のキー（招待経由の登録の直後など。要件34.5）
 *
 * 登録の直後は認証済みになった登録の画面と ProtectedRoute の置き換えが続けて遷移するため、遷移の state では
 * 案内が途中で失われる。ログアウトの案内（`logoutMessage`）と同じく、表示の時点で読んで消す
 */
export const TWO_FACTOR_SETUP_NOTICE_KEY = 'twoFactorSetupNotice';

/** 制限の種類（backend の 403 のエラーコードと同じ値） */
export type UserRestriction = 'PASSWORD_CHANGE_REQUIRED' | 'TWO_FACTOR_SETUP_REQUIRED';

/** 状態による 403 のエラーコード */
export const USER_STATE_RESTRICTION_CODES: readonly UserRestriction[] = [
  'PASSWORD_CHANGE_REQUIRED',
  'TWO_FACTOR_SETUP_REQUIRED',
];

/** 制限の判定に使う利用者の状態 */
export interface UserStateFlags {
  twoFactorEnabled?: boolean;
  mustChangePassword?: boolean;
}

/**
 * 利用者の状態から制限を決める
 *
 * 状態の項目が無い（undefined）ときは制限しない。backend の応答は常に真偽値を載せる。
 *
 * @returns 制限、または制限が無ければ null
 */
export function getUserRestriction(
  user: UserStateFlags | null | undefined
): UserRestriction | null {
  if (!user) {
    return null;
  }
  if (user.mustChangePassword === true) {
    return 'PASSWORD_CHANGE_REQUIRED';
  }
  if (user.twoFactorEnabled === false) {
    return 'TWO_FACTOR_SETUP_REQUIRED';
  }
  return null;
}

/**
 * 制限中に開ける唯一の画面のパス
 */
export function restrictedPathFor(restriction: UserRestriction): string {
  return restriction === 'PASSWORD_CHANGE_REQUIRED' ? PASSWORD_SETUP_PATH : TWO_FACTOR_SETUP_PATH;
}

/**
 * 値が状態による 403 のエラーコードか
 */
export function isUserRestrictionCode(code: unknown): code is UserRestriction {
  return (
    typeof code === 'string' && (USER_STATE_RESTRICTION_CODES as readonly string[]).includes(code)
  );
}

/**
 * エラーコードが示す制限を利用者の状態へ反映する（403 を受けたときの更新）
 *
 * @returns 更新後の利用者（変化が無ければ同じ参照）
 */
export function applyUserRestriction<T extends UserStateFlags>(user: T, code: UserRestriction): T {
  if (code === 'PASSWORD_CHANGE_REQUIRED') {
    return user.mustChangePassword === true ? user : { ...user, mustChangePassword: true };
  }
  return user.twoFactorEnabled === false ? user : { ...user, twoFactorEnabled: false };
}

/**
 * 制限の解除の後に戻る遷移先として使えるか（制限の画面そのものや外部の URL は使わない）
 */
export function isReturnablePath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    toSafeInternalPath(path) !== null &&
    !path.startsWith(PASSWORD_SETUP_PATH) &&
    !path.startsWith(TWO_FACTOR_SETUP_PATH) &&
    !path.startsWith('/login')
  );
}
