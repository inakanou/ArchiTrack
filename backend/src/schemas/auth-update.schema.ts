/**
 * @fileoverview 認証領域の更新 API のバリデーションスキーマ
 *
 * ロールの更新（PATCH /api/v1/roles/:id）とプロフィールの更新（PATCH /api/v1/auth/me）の本文を検証する。
 * どちらも楽観的ロックの版として任意の expectedUpdatedAt（ISO 8601 の日時）を受け付ける。
 * 送られないときは版を比べずに更新する（送らない既存のクライアントの振る舞いを変えない）。
 *
 * @module schemas/auth-update
 */

import { z } from 'zod';

export const AUTH_UPDATE_VALIDATION_MESSAGES = {
  EXPECTED_UPDATED_AT_INVALID: 'expectedUpdatedAt は ISO 8601 形式の日時である必要があります',
} as const;

/**
 * 楽観的ロックの版（任意）。取得時の updatedAt をそのまま送り返す
 */
export const optionalExpectedUpdatedAtSchema = z
  .string()
  .datetime({ offset: true, message: AUTH_UPDATE_VALIDATION_MESSAGES.EXPECTED_UPDATED_AT_INVALID })
  .optional();

/**
 * ロール更新の本文
 */
export const updateRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  description: z.string().optional(),
  priority: z.number().int().optional(),
  expectedUpdatedAt: optionalExpectedUpdatedAtSchema,
});

/**
 * プロフィール更新の本文
 */
export const updateProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100).optional(),
  expectedUpdatedAt: optionalExpectedUpdatedAtSchema,
});
