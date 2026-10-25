/**
 * @fileoverview エラー監視へ渡す URL の伏せ字（画面側）の単体テスト
 *
 * backend の `backend/src/utils/url-query-redaction.ts` と同じ規則であることを、
 * backend の `src/__tests__/unit/utils/url-query-redaction.test.ts` と同じ事例で固定する。
 * 画面側だけの規則（クエリの無い URL の断片も伏せる）は別の節で確かめる。
 */

import { describe, it, expect } from 'vitest';
import { redactUrlQuery, redactUrl, SENSITIVE_QUERY_KEYS } from './url-query-redaction';

describe('redactUrlQuery（backend と同じ事例）', () => {
  it('文字列でない値（undefined）はそのまま返す', () => {
    expect(redactUrlQuery(undefined)).toBeUndefined();
  });

  it('クエリの無い URL はそのまま返す', () => {
    expect(redactUrlQuery('/api/v1/auth/login')).toBe('/api/v1/auth/login');
  });

  it('機密のキーの値だけを伏せ、他のキーとパスはそのまま残す', () => {
    expect(redactUrlQuery('/a?Token=abc&page=2&X-Amz-Signature=sig')).toBe(
      '/a?Token=[REDACTED]&page=2&X-Amz-Signature=[REDACTED]'
    );
  });

  it('値の無い機密のキー（= を持たない組）も伏せ字の形にする', () => {
    expect(redactUrlQuery('/a?password&page')).toBe('/a?password=[REDACTED]&page');
  });

  it('断片はクエリの終わりとして扱い、断片の中身を記録しない', () => {
    expect(redactUrlQuery('/a?code=123456&page=1#token=secret-in-fragment')).toBe(
      '/a?code=[REDACTED]&page=1#[REDACTED]'
    );
  });

  it('不正な %エンコードのキーは元の綴りのまま比べる（例外にしない）', () => {
    expect(redactUrlQuery('/a?%E0%A4%A=1&token=x')).toBe('/a?%E0%A4%A=1&token=[REDACTED]');
  });

  it('%エンコード・添字・+ のキーも機密のキーとして伏せる', () => {
    expect(redactUrlQuery('/a?%74oken=x&refreshToken[]=y&back+upCode=z&backupCode=w')).toBe(
      '/a?%74oken=[REDACTED]&refreshToken[]=[REDACTED]&back+upCode=z&backupCode=[REDACTED]'
    );
  });

  it('伏せるキーの集合は backend と同じ（小文字で持つ）', () => {
    expect([...SENSITIVE_QUERY_KEYS].sort()).toEqual(
      [
        'token',
        'password',
        'code',
        'backupcode',
        'refreshtoken',
        'secret',
        'key',
        'signature',
        'x-amz-signature',
        'x-amz-credential',
      ].sort()
    );
  });
});

describe('redactUrl（画面側: 断片のトークンも伏せる）', () => {
  it('クエリの無い URL の断片（#token=…）も伏せる', () => {
    expect(redactUrl('https://app.example.com/reset-password#token=reset-secret')).toBe(
      'https://app.example.com/reset-password#[REDACTED]'
    );
  });

  it('クエリのトークンと断片を両方伏せる', () => {
    expect(redactUrl('/invitations/accept?token=invite-secret&x=1#token=frag-secret')).toBe(
      '/invitations/accept?token=[REDACTED]&x=1#[REDACTED]'
    );
  });

  it('&token=… のトークンも伏せる', () => {
    expect(redactUrl('/register?lang=ja&token=invite-secret')).toBe(
      '/register?lang=ja&token=[REDACTED]'
    );
  });

  it('断片の中の ? はクエリとして扱わず、断片ごと伏せる', () => {
    expect(redactUrl('/reset-password#token=frag-secret?x=1')).toBe('/reset-password#[REDACTED]');
  });

  it('クエリも断片も無い URL・空の断片はそのまま返す', () => {
    expect(redactUrl('/dashboard')).toBe('/dashboard');
    expect(redactUrl('/dashboard#')).toBe('/dashboard#');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
