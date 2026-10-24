/**
 * 記録・エラー監視へ渡す URL のクエリの伏せ字（要件37.3、42.3、42.4）
 *
 * アクセスログ（HttpLogger）とエラー監視（SentryScrubber）が同じ規則で伏せるため、ここに置く。
 */

/** 記録の URL で値を伏せるクエリのキー（大文字小文字を区別しない。要件37.3、42.3） */
export const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set(
  [
    'token',
    'password',
    'code',
    'backupCode',
    'refreshToken',
    'secret',
    'key',
    'signature',
    'X-Amz-Signature',
    'X-Amz-Credential',
  ].map((key) => key.toLowerCase())
);

const REDACTED = '[REDACTED]';

/** クエリのキーを比較用に正規化する（%エンコード・`+`・`key[]` の添字を外す） */
function normalizeQueryKey(rawKey: string): string {
  let decoded = rawKey.replace(/\+/g, ' ');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // 不正な %エンコードは元の綴りのまま比べる
  }
  const bracket = decoded.indexOf('[');
  const base = bracket === -1 ? decoded : decoded.slice(0, bracket);
  return base.trim().toLowerCase();
}

/**
 * 記録する URL のクエリのうち、機密のキーの値を伏せ字にする（要件37.3、42.3）
 *
 * パスと機密でないキーの値はそのまま残す。
 */
export function redactUrlQuery(url: string | undefined): string | undefined {
  if (typeof url !== 'string') return url;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const hashStart = url.indexOf('#', queryStart);
  const queryEnd = hashStart === -1 ? url.length : hashStart;
  const query = url.slice(queryStart + 1, queryEnd);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      if (!SENSITIVE_QUERY_KEYS.has(normalizeQueryKey(rawKey))) return pair;
      return `${rawKey}=${REDACTED}`;
    })
    .join('&');
  // 断片はサーバーへ届かない前提だが、届いた場合も記録しない
  const fragment = hashStart === -1 ? '' : `#${REDACTED}`;
  return `${url.slice(0, queryStart)}?${redacted}${fragment}`;
}
