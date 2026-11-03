/**
 * @fileoverview 記録・エラー監視へ渡す URL のクエリの伏せ字（redactUrlQuery）の単体テスト
 *
 * アクセスログ側の主な規則（%エンコード・添字・前方一致しないこと）は
 * middleware/http-logger.access-log.test.ts で確かめる。ここでは URL の形の分岐を確かめる。
 */

import { describe, it, expect } from 'vitest';
import { redactUrlQuery, SENSITIVE_QUERY_KEYS } from '../../../utils/url-query-redaction.js';

describe('redactUrlQuery', () => {
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

  it('伏せるキーの集合は小文字で持つ', () => {
    for (const key of SENSITIVE_QUERY_KEYS) {
      expect(key).toBe(key.toLowerCase());
    }
    expect(SENSITIVE_QUERY_KEYS.has('x-amz-credential')).toBe(true);
  });
});
