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
  return apiClient.get<UserProfile>('/api/v1/users/me');
}

/**
 * プロフィール更新
 * @param data 更新データ
 * @returns 更新後のユーザープロフィール
 */
export async function updateProfile(data: UpdateProfileData): Promise<UserProfile> {
  return apiClient.patch<UserProfile>('/api/v1/users/me', data);
}
