/**
 * @fileoverview 許可する外部アプリの設定の読み込みと起動時の検証（user-authentication タスク 71.2）
 *
 * 値は環境変数 `OAUTH_*` から読む。client secret と鍵を含むため `config/env.ts` のスキーマには
 * 載せず（デバッグのログの対象にしない）、エラーの文にも値を含めない。
 *
 * @requirement user-authentication/REQ-46.4
 * @requirement user-authentication/REQ-46.5
 */

import { createHash, createPrivateKey, createPublicKey, type JsonWebKey } from 'crypto';
import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;
const MIN_RSA_MODULUS_BITS = 2048;
const TOKEN_HMAC_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const ASYMMETRIC_KEY_TYPES: readonly unknown[] = ['RSA', 'EC', 'OKP'];

/** HTTP と試験用の値を許す環境。未設定や未知の値は本番と同じく閉じる側に倒す */
const NON_PRODUCTION_ENVS: readonly unknown[] = ['development', 'test'];

/**
 * リポジトリの compose と ci.yml に載せた試験用の値の SHA-256 の指紋。
 * 公開済みの鍵を本番で使えないようにする。値そのものは本番のコードに持たない
 */
const TEST_ONLY_SIGNING_KEYS: ReadonlySet<string> = new Set([
  '7e5f253b1f6b959b0b1c1178aba7bd4f6348015ba75c445ff40bb57f6fa5b1e4',
]);
const TEST_ONLY_SECRETS: ReadonlySet<string> = new Set([
  '89a9756711b54df8308501b20d52e28a7cbd13de41248d3f57c5daffd2d9ad90',
  '8588cdfcd6d2b0d521bcf0bf5e7017c06a3f4a10a172d9af1436205e3af205ad',
  'b6319854a844c0b1d6e5b2ab987e97d302fc0095fc8d00b4b494ee2c289ac355',
]);

export interface AllowedExternalApp {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly displayName: string;
  readonly redirectUris: readonly string[];
  readonly tokenEndpointAuthMethod: 'client_secret_post';
}

export interface ExternalAppOAuthConfig {
  readonly issuer: string;
  readonly resourceUrl: string;
  readonly jwks: { readonly keys: readonly JsonWebKey[] };
  readonly cookieKeys: readonly string[];
  readonly tokenHmacKey: string;
  readonly clients: readonly AllowedExternalApp[];
}

export interface ExternalAppClientRegistry {
  loadAllowedClients(): readonly AllowedExternalApp[];
  isAllowed(clientId: string): boolean;
}

/** 設定の不正。`issues` は欄の名前と理由だけを持ち、値を含めない */
export class ExternalAppConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('Invalid external app OAuth configuration');
    this.name = 'ExternalAppConfigError';
    this.issues = issues;
  }
}

function hasNoSurroundingSpace(value: string): boolean {
  return value.trim() === value;
}

const allowedClientSchema = z.strictObject({
  clientId: z.string().min(1).refine(hasNoSurroundingSpace),
  clientSecret: z.string().min(MIN_SECRET_LENGTH).refine(hasNoSurroundingSpace),
  displayName: z.string().min(1).refine(hasNoSurroundingSpace),
  redirectUris: z.array(z.string()).min(1),
  tokenEndpointAuthMethod: z.literal('client_secret_post').default('client_secret_post'),
});

/** JSON として読む。読めなければ undefined（解析エラーの文は値の断片を含むため捨てる） */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 試験用の値か。大文字にしただけの値も公開済みの値から導けるので、正規化して照合する */
function isTestOnlySecret(value: string): boolean {
  return TEST_ONLY_SECRETS.has(sha256(value.toLowerCase()));
}

function parseUrl(value: string, requireHttps: boolean): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const allowedProtocol = url.protocol === 'https:' || (!requireHttps && url.protocol === 'http:');
  if (!allowedProtocol || url.username || url.password || value.includes('#')) {
    return null;
  }
  return url;
}

/** 戻り先は完全一致で照合するため、正規形の完全な URL に限る */
function isValidRedirectUri(value: string, requireHttps: boolean): boolean {
  const url = parseUrl(value, requireHttps);
  return url !== null && !url.hostname.includes('*') && url.href === value;
}

/** 問い合わせの無い正規形の URL か（パスが無い場合は末尾の / の有無を問わない） */
function isCanonicalUrlWithoutQuery(value: string, requireHttps: boolean): boolean {
  const url = parseUrl(value, requireHttps);
  if (url === null || value.includes('?')) {
    return false;
  }
  return url.href === value || (url.pathname === '/' && url.href === `${value}/`);
}

function isValidIssuer(value: string, requireHttps: boolean): boolean {
  return isCanonicalUrlWithoutQuery(value, requireHttps) && !value.endsWith('/');
}

function readRequired(
  source: NodeJS.ProcessEnv,
  name: string,
  issues: string[]
): string | undefined {
  const value = source[name];
  if (value === undefined || value.trim() === '') {
    issues.push(`${name}: 必須です`);
    return undefined;
  }
  return value;
}

/** 秘密鍵から導いた公開鍵の指紋。JWK の表記の違いに左右されない。読めなければ undefined */
function signingKeyFingerprint(jwk: JsonWebKey): string | undefined {
  try {
    const publicKey = createPublicKey(createPrivateKey({ key: jwk, format: 'jwk' }));
    return sha256(publicKey.export({ type: 'spki', format: 'der' }));
  } catch {
    return undefined;
  }
}

function readJwtPrivateJwk(source: NodeJS.ProcessEnv): JsonWebKey | undefined {
  if (!source.JWT_PRIVATE_KEY) {
    return undefined;
  }
  const jwk = parseJson(Buffer.from(source.JWT_PRIVATE_KEY, 'base64').toString());
  return typeof jwk === 'object' && jwk !== null ? (jwk as JsonWebKey) : undefined;
}

function isUsablePrivateJwk(key: unknown): key is JsonWebKey {
  if (typeof key !== 'object' || key === null) {
    return false;
  }
  const jwk = key as JsonWebKey;
  if (!ASYMMETRIC_KEY_TYPES.includes(jwk.kty) || typeof jwk.d !== 'string') {
    return false;
  }
  if (jwk.use !== undefined && jwk.use !== 'sig') {
    return false;
  }
  try {
    const details = createPrivateKey({ key: jwk, format: 'jwk' }).asymmetricKeyDetails;
    return jwk.kty !== 'RSA' || (details?.modulusLength ?? 0) >= MIN_RSA_MODULUS_BITS;
  } catch {
    return false;
  }
}

function parseJwks(
  source: NodeJS.ProcessEnv,
  rejectTestValues: boolean,
  issues: string[]
): ExternalAppOAuthConfig['jwks'] | undefined {
  const raw = readRequired(source, 'OAUTH_JWKS', issues);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = parseJson(raw) as { keys?: unknown } | null | undefined;
  const keys = parsed?.keys;
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every(isUsablePrivateJwk)) {
    issues.push(
      `OAUTH_JWKS: 署名用の秘密鍵の JWK Set（非対称鍵、RSA は ${MIN_RSA_MODULUS_BITS} bit 以上）にしてください`
    );
    return undefined;
  }
  const kids = keys.flatMap((key: JsonWebKey) => (key.kid === undefined ? [] : [key.kid]));
  if (new Set(kids).size !== kids.length) {
    issues.push('OAUTH_JWKS: kid が重複しています');
    return undefined;
  }
  const fingerprints = keys.map(signingKeyFingerprint);
  const jwtJwk = readJwtPrivateJwk(source);
  const jwtFingerprint = jwtJwk ? signingKeyFingerprint(jwtJwk) : undefined;
  if (jwtFingerprint !== undefined && fingerprints.includes(jwtFingerprint)) {
    issues.push('OAUTH_JWKS: 画面用の JWT の鍵と別の鍵にしてください');
    return undefined;
  }
  if (
    rejectTestValues &&
    fingerprints.some((print) => print !== undefined && TEST_ONLY_SIGNING_KEYS.has(print))
  ) {
    issues.push('OAUTH_JWKS: 試験専用の鍵は本番で使えません');
    return undefined;
  }
  return { keys };
}

/** 他の用途の秘密（大文字小文字を区別しない）。同じ値を別の用途に流用させない */
function reservedSecrets(source: NodeJS.ProcessEnv): Set<string> {
  const reserved = new Set<string>();
  if (source.JWT_PRIVATE_KEY) {
    reserved.add(source.JWT_PRIVATE_KEY.toLowerCase());
  }
  const jwtKey = readJwtPrivateJwk(source)?.d;
  if (typeof jwtKey === 'string') {
    reserved.add(jwtKey.toLowerCase());
  }
  return reserved;
}

function parseCookieKeys(
  source: NodeJS.ProcessEnv,
  tokenHmacKey: string | undefined,
  rejectTestValues: boolean,
  issues: string[]
): string[] | undefined {
  const raw = readRequired(source, 'OAUTH_COOKIE_KEYS', issues);
  if (raw === undefined) {
    return undefined;
  }
  const keys = parseJson(raw);
  const valid =
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.every(
      (key) =>
        typeof key === 'string' && key.length >= MIN_SECRET_LENGTH && hasNoSurroundingSpace(key)
    ) &&
    new Set(keys).size === keys.length;
  if (!valid) {
    issues.push(
      `OAUTH_COOKIE_KEYS: ${MIN_SECRET_LENGTH} 文字以上の重複しない鍵の配列にしてください`
    );
    return undefined;
  }
  const cookieKeys = keys as string[];
  const reserved = reservedSecrets(source);
  if (tokenHmacKey !== undefined) {
    reserved.add(tokenHmacKey.toLowerCase());
  }
  if (cookieKeys.some((key) => reserved.has(key.toLowerCase()))) {
    issues.push('OAUTH_COOKIE_KEYS: JWT の鍵や OAUTH_TOKEN_HMAC_KEY と別の鍵にしてください');
    return undefined;
  }
  if (rejectTestValues && cookieKeys.some(isTestOnlySecret)) {
    issues.push('OAUTH_COOKIE_KEYS: 試験専用の鍵は本番で使えません');
    return undefined;
  }
  return cookieKeys;
}

function parseClients(
  parsed: unknown,
  requireHttps: boolean,
  issues: string[]
): AllowedExternalApp[] | undefined {
  const result = z.array(allowedClientSchema).safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.');
      issues.push(`OAUTH_ALLOWED_CLIENTS${path ? `.${path}` : ''}: 形が不正です`);
    }
    return undefined;
  }
  const before = issues.length;
  result.data.forEach((client, clientIndex) => {
    client.redirectUris.forEach((uri, uriIndex) => {
      if (!isValidRedirectUri(uri, requireHttps)) {
        issues.push(
          `OAUTH_ALLOWED_CLIENTS.${clientIndex}.redirectUris.${uriIndex}: ` +
            (requireHttps ? 'HTTPS の完全な URL にしてください' : '完全な URL にしてください')
        );
      }
    });
  });
  if (new Set(result.data.map((client) => client.clientId)).size !== result.data.length) {
    issues.push('OAUTH_ALLOWED_CLIENTS: clientId が重複しています');
  }
  return issues.length === before ? result.data : undefined;
}

/** client secret が他の用途の鍵や試験用の値でないことを確かめる */
function checkClientSecrets(
  clients: readonly AllowedExternalApp[],
  otherSecrets: ReadonlySet<string>,
  rejectTestValues: boolean,
  issues: string[]
): void {
  clients.forEach((client, index) => {
    if (otherSecrets.has(client.clientSecret.toLowerCase())) {
      issues.push(`OAUTH_ALLOWED_CLIENTS.${index}.clientSecret: 他の鍵と別の値にしてください`);
    }
    if (rejectTestValues && isTestOnlySecret(client.clientSecret)) {
      issues.push(`OAUTH_ALLOWED_CLIENTS.${index}.clientSecret: 試験専用の値は本番で使えません`);
    }
  });
}

/**
 * 環境変数から設定を読む
 *
 * @returns 許可するアプリが無い環境では null（認可の窓口を載せない）
 * @throws ExternalAppConfigError 許可するアプリがあり、形が不正または必須の値が欠けるとき
 */
export function parseExternalAppOAuthConfig(
  source: NodeJS.ProcessEnv = process.env
): ExternalAppOAuthConfig | null {
  const rawClients = source.OAUTH_ALLOWED_CLIENTS;
  if (rawClients === undefined || rawClients.trim() === '') {
    return null;
  }
  const parsedClients = parseJson(rawClients);
  if (Array.isArray(parsedClients) && parsedClients.length === 0) {
    return null;
  }

  const strict = !NON_PRODUCTION_ENVS.includes(source.NODE_ENV);
  const issues: string[] = [];

  let clients: AllowedExternalApp[] | undefined;
  if (Array.isArray(parsedClients)) {
    clients = parseClients(parsedClients, strict, issues);
  } else {
    issues.push('OAUTH_ALLOWED_CLIENTS: アプリの JSON 配列にしてください');
  }

  const issuer = readRequired(source, 'OAUTH_ISSUER', issues);
  if (issuer !== undefined && !isValidIssuer(issuer, strict)) {
    issues.push('OAUTH_ISSUER: 末尾の / と問い合わせの無い正規形の URL にしてください');
  }
  const resourceUrl = readRequired(source, 'OAUTH_RESOURCE_URL', issues);
  if (resourceUrl !== undefined && !isCanonicalUrlWithoutQuery(resourceUrl, strict)) {
    issues.push('OAUTH_RESOURCE_URL: 問い合わせとフラグメントの無い正規形の URL にしてください');
  }
  const jwks = parseJwks(source, strict, issues);
  const tokenHmacKey = readRequired(source, 'OAUTH_TOKEN_HMAC_KEY', issues);
  if (tokenHmacKey !== undefined) {
    if (!TOKEN_HMAC_KEY_PATTERN.test(tokenHmacKey)) {
      issues.push('OAUTH_TOKEN_HMAC_KEY: 64 桁の 16 進にしてください');
    } else if (strict && isTestOnlySecret(tokenHmacKey)) {
      issues.push('OAUTH_TOKEN_HMAC_KEY: 試験専用の鍵は本番で使えません');
    }
  }
  const cookieKeys = parseCookieKeys(source, tokenHmacKey, strict, issues);

  if (clients !== undefined) {
    const otherSecrets = reservedSecrets(source);
    for (const key of [...(cookieKeys ?? []), ...(tokenHmacKey ? [tokenHmacKey] : [])]) {
      otherSecrets.add(key.toLowerCase());
    }
    checkClientSecrets(clients, otherSecrets, strict, issues);
  }

  if (
    issues.length > 0 ||
    clients === undefined ||
    issuer === undefined ||
    resourceUrl === undefined ||
    jwks === undefined ||
    cookieKeys === undefined ||
    tokenHmacKey === undefined
  ) {
    throw new ExternalAppConfigError(issues);
  }
  return { issuer, resourceUrl, jwks, cookieKeys, tokenHmacKey, clients };
}

export function createExternalAppClientRegistry(
  config: ExternalAppOAuthConfig | null
): ExternalAppClientRegistry {
  const clients = config?.clients ?? [];
  const allowedIds = new Set(clients.map((client) => client.clientId));
  return {
    loadAllowedClients: () => clients,
    isAllowed: (clientId) => allowedIds.has(clientId),
  };
}
