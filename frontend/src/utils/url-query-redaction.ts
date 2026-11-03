/**
 * エラー監視へ渡す URL の伏せ字（画面側。user-authentication 要件37.3、42.3、42.4）
 *
 * backend の `backend/src/utils/url-query-redaction.ts`（アクセスログとエラー監視が使う規則）の写し。
 * frontend と backend は別のパッケージで互いを読み込めないため、規則（伏せるキー・伏せ字の表記・
 * キーの正規化）をここへ複製し、`url-query-redaction.test.ts` で backend の単体テストと同じ事例を固定する。
 * 片方を変えるときは、もう片方と両方のテストを揃えて変えること。
 *
 * 画面側だけの規則: 招待・パスワードリセットのリンクはトークンを断片（`#token=…`）に置く（要件37.3）。
 * 断片は画面の URL には残り得るため、クエリが無い URL の断片も伏せる（`redactUrl`）。
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
 * URL のクエリのうち、機密のキーの値を伏せ字にする（backend の redactUrlQuery と同じ規則）
 *
 * パスと機密でないキーの値はそのまま残す。クエリがあるときは断片も伏せる。
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
  const fragment = hashStart === -1 ? '' : `#${REDACTED}`;
  return `${url.slice(0, queryStart)}?${redacted}${fragment}`;
}

/**
 * 画面の URL の機密を伏せる（クエリは redactUrlQuery の規則、断片はクエリの有無によらず伏せる）
 *
 * 断片は招待・パスワードリセットのトークン（`#token=…`）を運ぶため、中身を記録しない（要件37.3）。
 */
export function redactUrl(url: string | undefined): string | undefined {
  if (typeof url !== 'string') return url;
  const hashStart = url.indexOf('#');
  const queryStart = url.indexOf('?');
  // 断片より前にクエリがあるときはクエリの規則で伏せる（断片も伏せられる）
  if (queryStart !== -1 && (hashStart === -1 || queryStart < hashStart)) {
    return redactUrlQuery(url);
  }
  if (hashStart === -1 || hashStart === url.length - 1) return url;
  return `${url.slice(0, hashStart)}#${REDACTED}`;
}
