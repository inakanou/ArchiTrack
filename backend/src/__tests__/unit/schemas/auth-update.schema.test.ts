/**
 * @fileoverview 認証領域の更新 API のスキーマの単体検証（楽観的ロックの版 expectedUpdatedAt）
 */

import { describe, it, expect } from 'vitest';
import {
  AUTH_UPDATE_VALIDATION_MESSAGES,
  updateProfileSchema,
  updateRoleSchema,
} from '../../../schemas/auth-update.schema.js';

const schemas = [
  { label: 'ロールの更新', schema: updateRoleSchema, body: { description: 'x' } },
  { label: 'プロフィールの更新', schema: updateProfileSchema, body: { displayName: 'x' } },
] as const;

describe.each(schemas)('$label の本文スキーマ', ({ schema, body }) => {
  /**
   * @requirement user-authentication/REQ-25.8
   */
  it('expectedUpdatedAt が無い本文は従来どおり通り、版は付かない', () => {
    const result = schema.safeParse(body);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(body);
  });

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it.each(['2026-09-27T01:02:03.456Z', '2026-09-27T10:02:03.456+09:00'])(
    'ISO 8601 の日時の expectedUpdatedAt（%s）を受け付けてそのまま渡す',
    (expectedUpdatedAt) => {
      const result = schema.safeParse({ ...body, expectedUpdatedAt });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ ...body, expectedUpdatedAt });
    }
  );

  /**
   * @requirement user-authentication/REQ-25.8
   */
  it.each([
    ['日時でない文字列', 'not-a-date'],
    ['日付だけ', '2026-09-27'],
    ['空文字列', ''],
    ['数値', 1790000000000],
    ['null', null],
  ])('%s の expectedUpdatedAt は拒否する', (_label, expectedUpdatedAt) => {
    const result = schema.safeParse({ ...body, expectedUpdatedAt });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['expectedUpdatedAt']);
  });

  it('日時の形式の誤りには専用の文言を返す', () => {
    const result = schema.safeParse({ ...body, expectedUpdatedAt: 'not-a-date' });
    expect(result.error?.issues[0]?.message).toBe(
      AUTH_UPDATE_VALIDATION_MESSAGES.EXPECTED_UPDATED_AT_INVALID
    );
  });
});
