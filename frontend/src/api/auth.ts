import { apiClient } from './client';
import type {
  RegisterData,
  LoginResponse,
  AuthResponse,
  UserProfile,
  UpdateProfileData,
} from '../types/auth.types';

/**
 * ユーザー登録（招待経由）
 * @param invitationToken 招待トークン
 * @param data 登録データ（表示名、パスワード）
 * @returns 認証レスポンス（アクセストークン、ユーザー情報）
 */
export async function register(invitationToken: string, data: RegisterData): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/api/v1/auth/register', {
    invitationToken,
    ...data,
  });
}

/**
 * ログイン
 * @param email メールアドレス
 * @param password パスワード
 * @returns ログインレスポンス（SUCCESS または 2FA_REQUIRED）
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/api/v1/auth/login', {
    email,
    password,
  });
}

/**
 * 2FA検証（ログイン時）
 * @param userId ユーザーID
 * @param totpCode TOTPコード（6桁）
 * @returns 認証レスポンス（アクセストークン、ユーザー情報）
 */
export async function verify2FA(userId: string, totpCode: string): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/api/v1/auth/verify-2fa', {
    userId,
    totpCode,
  });
}

/**
 * ログアウト（現在のデバイス）
 */
export async function logout(): Promise<void> {
  await apiClient.post<void>('/api/v1/auth/logout');
}

/**
 * 全デバイスからログアウト
 */
export async function logoutAll(): Promise<void> {
  await apiClient.post<void>('/api/v1/auth/logout-all');
}

/**
 * トークンリフレッシュ
 * @returns 認証レスポンス（新しいアクセストークン、ユーザー情報）
 */
export async function refreshToken(): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/api/v1/auth/refresh');
}

/**
 * 現在のユーザー情報取得
 * @returns ユーザープロフィール
 */
export async function getCurrentUser(): Promise<UserProfile> {
  return apiClient.get<UserProfile>('/api/v1/auth/me');
}

/**
 * プロフィール更新の要求
 *
 * 要件25.8: `expectedUpdatedAt` に取得時の `updatedAt`（版）を渡すと、サーバーは版が
 * 一致するときだけ更新し、一致しなければ 409 `PROFILE_CONFLICT` を返す（楽観的ロック）。
 * 省略したときは版を比べずに更新する。
 */
export interface UpdateProfileRequest extends UpdateProfileData {
  /** 楽観的ロックの版（GET / PATCH /api/v1/auth/me の応答の updatedAt） */
  expectedUpdatedAt?: string;
}

/**
 * プロフィール更新
 * @param data 更新データ（任意で楽観的ロックの版 `expectedUpdatedAt` を含む）
 * @returns 更新後のユーザープロフィール（新しい updatedAt を含む）
 */
export async function updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
  return apiClient.patch<UserProfile>('/api/v1/auth/me', data);
}

/**
 * プロフィール更新の楽観的ロックの競合（409 `PROFILE_CONFLICT`）かを判定する
 *
 * 要件25.8: サーバーは版の不一致を 409 の Problem Details（`code: 'PROFILE_CONFLICT'`）で返す。
 * 同じ 409 でも `code` が異なるものは競合として扱わない。
 * @param error updateProfile が投げたエラー
 */
export function isProfileConflictError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { statusCode, response } = error as { statusCode?: unknown; response?: unknown };
  if (statusCode !== 409 || typeof response !== 'object' || response === null) {
    return false;
  }
  return (response as { code?: unknown }).code === 'PROFILE_CONFLICT';
}
