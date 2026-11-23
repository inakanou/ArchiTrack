/**
 * 記録・エラー監視へ渡す URL のクエリと文の伏せ字（要件37.3、42.3、42.4、48.8）
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
    // 外部アプリの認可の値（要件48.8）。認可コードは上の `code` で伏せる
    'state',
    'code_verifier',
    'refresh_token',
    'access_token',
    'client_secret',
  ].map((key) => key.toLowerCase())
);

const REDACTED = '[REDACTED]';

/** 入れ子の値を復号して調べる回数の上限 */
const MAX_NESTED_DECODE = 3;

/** クエリのキーを比較用に正規化する（%エンコード・`+` を外し、`a[b]`・`a.b` の各部分に分ける） */
function queryKeySegments(rawKey: string): string[] {
  let decoded = rawKey.replace(/\+/g, ' ');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // 不正な %エンコードは元の綴りのまま比べる
  }
  return decoded
    .split(/[[\].]/)
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment !== '');
}

function isSensitiveQueryKey(rawKey: string): boolean {
  return queryKeySegments(rawKey).some((segment) => SENSITIVE_QUERY_KEYS.has(segment));
}

/** 値に入れ子の URL やフォームとして機密が含まれるか（%エンコードを上限の回数まで外して調べる） */
function valueCarriesSecret(rawValue: string): boolean {
  let current = rawValue;
  for (let level = 0; level <= MAX_NESTED_DECODE; level++) {
    if (redactSensitiveText(current) !== current) return true;
    const queryAt = current.indexOf('?');
    if (queryAt !== -1) {
      const nested = current.slice(queryAt + 1).split(/[&;]/);
      if (nested.some((pair) => isSensitiveQueryKey(pair.split('=', 1)[0] ?? ''))) return true;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(current.replace(/\+/g, ' '));
    } catch {
      return false;
    }
    if (decoded === current) return false;
    current = decoded;
  }
  return false;
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
      const carriesSecret =
        isSensitiveQueryKey(rawKey) || (eq !== -1 && valueCarriesSecret(pair.slice(eq + 1)));
      return carriesSecret ? `${rawKey}=${REDACTED}` : pair;
    })
    .join('&');
  // 断片はサーバーへ届かない前提だが、届いた場合も記録しない
  const fragment = hashStart === -1 ? '' : `#${REDACTED}`;
  return `${url.slice(0, queryStart)}?${redacted}${fragment}`;
}

/** 自由な文を走査する長さの上限。超えた文は全体を伏せ字にする（要件48.8） */
export const MAX_SCANNED_TEXT_LENGTH = 64 * 1024;

/** 名前だけで機密と分かるキー（`_`・`-`・大文字小文字を除いた綴り） */
const CREDENTIAL_TEXT_KEYS: ReadonlySet<string> = new Set([
  'codeverifier',
  'refreshtoken',
  'accesstoken',
  'clientsecret',
  'authorization',
  'proxyauthorization',
]);

/** 値に認証方式の語が先に来るキー */
const AUTHORIZATION_TEXT_KEYS: ReadonlySet<string> = new Set([
  'authorization',
  'proxyauthorization',
]);

/**
 * 状態を表す語（`state=` の値として残す非秘密の語）
 *
 * OAuth の `state` は不規則な値であり、一覧に無い値は伏せる（漏らさない側に倒す）。
 */
const DIAGNOSTIC_STATES: ReadonlySet<string> = new Set([
  'open',
  'closed',
  'half-open',
  'ready',
  'connecting',
  'connected',
  'reconnecting',
  'disconnected',
  'disconnecting',
  'end',
  'wait',
  'waiting',
  'active',
  'inactive',
  'delayed',
  'completed',
  'failed',
  'paused',
  'pending',
  'idle',
  'running',
  'stopped',
  'error',
  'unknown',
]);

/** エラーコードの形（E で始まる大文字、ERR_、Prisma の P0000、5 桁までの数字） */
const DIAGNOSTIC_CODE = /^(?:E[A-Z0-9_]{2,31}|ERR_[A-Z0-9_]{1,48}|P\d{4}|\d{1,5})$/;

/**
 * キーの候補。区切りのパーセントエンコード（`%3F`・`%3D`・`%26` など）は別の一致として読み飛ばし、
 * 英字と `_` のエンコード（`%63`・`%5F`）だけをキーの一部にする
 */
const KEY_TOKEN = /(?:[a-z0-9_-]|%(?:4[1-9a-f]|5[0-9af]|6[1-9a-f]|7[0-9a]))+|%(?:25)*[0-9a-f]{2}/gi;
/** キーの後の閉じ引用符・添字（`[]`・`[0]`・`]` とそのエンコード）と区切り（`=>`・`=`・`:` とそのエンコード） */
const KEY_TAIL =
  /(?:\\*["'])?(?:\[[^\]\s]{0,32}\]|%5b[^\s&=%]{0,32}%5d|\]|%5d){0,4}(?:\\*["'])?\s{0,8}(?:=>|=|:|%(?:25)*3d|%(?:25)*3a)\s{0,8}/iy;
const ENCODED_AMPERSAND = /%(?:25)*26/iy;
const FORM_PREFIX = /(?:[?&]|%(?:25)*(?:3f|26))$/i;
const BARE_VALUE_STOP = /[\s&,;}\])#"']/;

/** 文の中の Bearer の値（語と区別するため、数字を含む 6 字以上に限る） */
const BEARER_VALUE = /\b(bearer[ \t]+)(?=[A-Za-z._~+/=-]*\d)[A-Za-z0-9._~+/=-]{6,}/gi;

function normalizeTextKey(token: string): string {
  return token
    .replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/[_-]/g, '')
    .toLowerCase();
}

/** 引用符の値の終わり（閉じの引用符の前のバックスラッシュの位置）。無ければ文の終わり */
function findQuotedEnd(text: string, from: number, quote: string, openSlashes: number): number {
  let slashes = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      slashes++;
      continue;
    }
    if (ch === quote) {
      const closes = openSlashes === 0 ? slashes % 2 === 0 : slashes <= openSlashes;
      if (closes) return i - slashes;
    }
    slashes = 0;
  }
  return text.length;
}

/** 括弧の値の終わり（閉じの次の位置）。釣り合わなければ文の終わり */
function findBracketEnd(text: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function findBareEnd(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (BARE_VALUE_STOP.test(ch)) return i;
    if (ch === '%') {
      ENCODED_AMPERSAND.lastIndex = i;
      if (ENCODED_AMPERSAND.test(text)) return i;
    }
  }
  return text.length;
}

/** 行の終わり */
function findLineEnd(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\n' || text[i] === '\r') return i;
  }
  return text.length;
}

/** 引用符の値の後に、同じ行で値の続きがあるか（区切りと閉じの記号だけなら続きは無い） */
function hasTrailingValue(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\n' || ch === '\r') return false;
    if (ch === ' ' || ch === '\t') continue;
    return !',;}])'.includes(ch);
  }
  return false;
}

/** 値の範囲 [start, end) を読む */
function readValueRange(
  text: string,
  position: number,
  key: string
): { start: number; end: number } {
  const authorization = AUTHORIZATION_TEXT_KEYS.has(key);
  let cursor = position;
  while (text[cursor] === '\\') cursor++;
  const opener = text[cursor];
  if (opener === '"' || opener === "'") {
    const start = cursor + 1;
    const openSlashes = cursor - position;
    const end = findQuotedEnd(text, start, opener, openSlashes);
    // `Authorization: "Token" 値` の形は、引用符の後の値も行末まで伏せる
    if (authorization && hasTrailingValue(text, end + openSlashes + 1)) {
      return { start: position, end: findLineEnd(text, end) };
    }
    return { start, end };
  }
  // Authorization 系は方式を問わず行末まで伏せる
  if (authorization) {
    return { start: position, end: findLineEnd(text, position) };
  }
  if (text[position] === '[' || text[position] === '{') {
    return { start: position, end: findBracketEnd(text, position) };
  }
  return { start: position, end: findBareEnd(text, position) };
}

/** `code`・`state` の値を診断の情報として残すか（URL・フォームの形では残さない） */
function isDiagnosticValue(key: string, value: string): boolean {
  if (key === 'code') return DIAGNOSTIC_CODE.test(value);
  return DIAGNOSTIC_STATES.has(value.toLowerCase());
}

function isFormContext(text: string, tokenStart: number, valueEnd: number): boolean {
  if (FORM_PREFIX.test(text.slice(Math.max(0, tokenStart - 9), tokenStart))) return true;
  if (tokenStart !== 0) return false;
  if (text[valueEnd] === '&') return true;
  ENCODED_AMPERSAND.lastIndex = valueEnd;
  return ENCODED_AMPERSAND.test(text);
}

function scanAndRedact(text: string): string {
  const pieces: string[] = [];
  let copied = 0;
  const tokens = new RegExp(KEY_TOKEN.source, KEY_TOKEN.flags);
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text)) !== null) {
    const key = normalizeTextKey(match[0]);
    const contextual = key === 'code' || key === 'state';
    if (!contextual && !CREDENTIAL_TEXT_KEYS.has(key)) continue;

    const tokenEnd = match.index + match[0].length;
    KEY_TAIL.lastIndex = tokenEnd;
    if (!KEY_TAIL.test(text)) continue;
    const { start, end } = readValueRange(text, KEY_TAIL.lastIndex, key);
    tokens.lastIndex = Math.max(end, tokenEnd);
    if (contextual) {
      if (end === start) continue;
      const form = isFormContext(text, match.index, end);
      if (!form && isDiagnosticValue(key, text.slice(start, end))) continue;
    }
    pieces.push(text.slice(copied, start), REDACTED);
    copied = end;
  }
  if (copied === 0) return text;
  pieces.push(text.slice(copied));
  return pieces.join('');
}

/**
 * エラーの文などの自由な文字列から OAuth の値を伏せる（要件48.8）
 *
 * `key=value`（URL・フォーム）、`key: value`、JSON とオブジェクトの表記を線形の走査で扱う。
 * `code`・`state` は URL とフォームの形では常に伏せ、それ以外ではエラーコードや状態の語だけを残す。
 * 上限を超える文と、走査に失敗した文は全体を伏せ字にする。例外を投げない。
 */
export function redactSensitiveText(text: string): string {
  if (text.length > MAX_SCANNED_TEXT_LENGTH) return REDACTED;
  try {
    return scanAndRedact(text).replace(BEARER_VALUE, `$1${REDACTED}`);
  } catch {
    return REDACTED;
  }
}

/** 調べる例外の連鎖の深さの上限 */
const MAX_ERROR_CHAIN_DEPTH = 8;

/**
 * 例外またはその連鎖（cause・errors）に、要求本文の JSON の解析の失敗が含まれるか
 *
 * この例外の文は Node の JSON.parse が本文の断片を引用するため、文ごと記録しない（要件48.8）。
 * 連鎖を読めないときは含むものとして扱う。
 */
export function hasRequestBodyParseError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): boolean => {
    if (typeof value !== 'object' || value === null || depth > MAX_ERROR_CHAIN_DEPTH) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const candidate = value as { type?: unknown; cause?: unknown; errors?: unknown };
    if (candidate.type === 'entity.parse.failed') return true;
    if (visit(candidate.cause, depth + 1)) return true;
    return Array.isArray(candidate.errors)
      ? candidate.errors.slice(0, 32).some((item) => visit(item, depth + 1))
      : false;
  };
  try {
    return visit(error, 0);
  } catch {
    return true;
  }
}
