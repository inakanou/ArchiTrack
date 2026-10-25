/**
 * @fileoverview 招待トークンの保存の形と招待 URL（invitation-token）の単体テスト
 *
 * 保存する値が原文の SHA-256 の 16 進であることと、招待 URL がトークンをフラグメントに置き、
 * 画面のオリジンを引数・FRONTEND_URL・既定の順で決めることを確かめる。
 */

import { createHash } from 'crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { buildInvitationUrl, hashInvitationToken } from '../../../utils/invitation-token.js';

describe('hashInvitationToken', () => {
  it('原文の SHA-256 の 16 進を返し、原文を含まない', () => {
    const token = 'invitation-token-原文';
    const hashed = hashInvitationToken(token);

    expect(hashed).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain('invitation-token');
  });
});

describe('buildInvitationUrl', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it('引数のオリジンの登録画面のフラグメントにトークンを置く', () => {
    expect(buildInvitationUrl('tok-1', 'https://app.example.com')).toBe(
      'https://app.example.com/register#token=tok-1'
    );
  });

  it('引数が無いときは FRONTEND_URL を使う', () => {
    process.env.FRONTEND_URL = 'https://frontend.example.com';

    expect(buildInvitationUrl('tok-2')).toBe('https://frontend.example.com/register#token=tok-2');
  });

  it('引数も FRONTEND_URL も無いときは開発の既定のオリジンを使う', () => {
    delete process.env.FRONTEND_URL;

    expect(buildInvitationUrl('tok-3')).toBe('http://localhost:5173/register#token=tok-3');
  });
});
