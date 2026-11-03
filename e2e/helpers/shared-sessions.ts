/**
 * @fileoverview E2E の共有の役割のセッション（リフレッシュの Cookie）の受け渡し
 *
 * user-authentication タスク45.4・design.md「E2E の認証基盤の移行」の補助。
 *
 * - 全体の準備（global-setup）で共有の役割（管理者・一般ユーザー）ごとにログイン API を呼び、
 *   応答のリフレッシュの Cookie を保持する（`establishSharedSessions`）
 * - `loginAsUser` が共有の役割を求めたとき、保持した Cookie をテストのコンテキストへ渡し、
 *   画面を開いて Cookie によるリフレッシュで認証させる（`attachSharedSession`）。ログイン画面を経ない
 * - コンテキストの応答を見張り、ローテーション後の Cookie（リフレッシュ・ログインの Set-Cookie）を
 *   回収して次のテストへ渡す。ログアウトや拒否で失効した Cookie は捨てる
 * - 持ち越した Cookie が拒否されたとき（前のテストの異常終了・データベースの初期化など）は
 *   `attachSharedSession` が false を返し、呼び出し側が新たにログインし直す（その Cookie も回収する）
 * - 同じ役割の Cookie を、開いている二つのコンテキストへ同時に渡さない。別のコンテキストは
 *   Web Locks を共有せず、同じ Cookie の同時のリフレッシュが再利用の検知で系列ごと失効させるため
 *   （要件33.6）。使用中なら false を返し、呼び出し側は別の系列で新たにログインする
 *
 * 保持する Cookie はワーカーの再起動（失敗の後の再起動）を越えて引き継ぐため、
 * `test-results/` の下のファイルに置く（試験環境だけのトークン）。
 *
 * @module e2e/helpers/shared-sessions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as playwrightRequest } from '@playwright/test';
import type { BrowserContext, Page, Response } from '@playwright/test';
import { FRONTEND_BASE_URL, SAME_ORIGIN_API_BASE_URL } from '../config';
import { TEST_USERS } from './test-users';
import { completeApiLogin } from './auth-api';

/** Cookie を共有する役割（多くの spec が使う、状態を変えない利用者） */
export const SHARED_SESSION_ROLES = ['REGULAR_USER', 'ADMIN_USER'] as const;

export type SharedSessionRole = (typeof SHARED_SESSION_ROLES)[number];

/** リフレッシュトークンの Cookie の名前と Path（backend の `setRefreshTokenCookie`） */
const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** 保持する Cookie のファイル（全体の準備が作り、各ワーカーが読み書きする） */
const SHARED_SESSIONS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test-results',
  'e2e-shared-sessions.json'
);

type SharedSessionStore = Partial<Record<SharedSessionRole, string>>;

export function isSharedSessionRole(value: unknown): value is SharedSessionRole {
  return typeof value === 'string' && (SHARED_SESSION_ROLES as readonly string[]).includes(value);
}

function readStore(): SharedSessionStore {
  try {
    return JSON.parse(fs.readFileSync(SHARED_SESSIONS_FILE, 'utf8')) as SharedSessionStore;
  } catch {
    return {};
  }
}

function writeStore(store: SharedSessionStore): void {
  fs.mkdirSync(path.dirname(SHARED_SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SHARED_SESSIONS_FILE, JSON.stringify(store), 'utf8');
}

function setStoredCookie(role: SharedSessionRole, value: string | null): void {
  const store = readStore();
  if (value) {
    store[role] = value;
  } else {
    delete store[role];
  }
  writeStore(store);
}

function roleOfEmail(email: unknown): SharedSessionRole | null {
  if (typeof email !== 'string') {
    return null;
  }
  const lower = email.toLowerCase();
  return SHARED_SESSION_ROLES.find((role) => TEST_USERS[role].email === lower) ?? null;
}

/** リフレッシュトークンの Set-Cookie の行（値と、消去の行かどうか・Path） */
interface RefreshCookieLine {
  value: string;
  isClearing: boolean;
  isAuthPath: boolean;
}

function parseRefreshCookieLine(line: string): RefreshCookieLine[] {
  const match = /^\s*refreshToken=([^;]*)/.exec(line);
  return match
    ? [
        {
          value: match[1] ?? '',
          isClearing: (match[1] ?? '') === '' || /expires=thu, 01 jan 1970/i.test(line),
          isAuthPath: /;\s*path=\/api\/v1\/auth\b/i.test(line),
        },
      ]
    : [];
}

/**
 * Set-Cookie の行から、発行されたリフレッシュトークンの値と、Cookie の消去の有無を取り出す
 */
function refreshCookieValueFromHeaders(headers: Array<{ name: string; value: string }>): {
  issued: string | null;
  cleared: boolean;
} {
  const lines = headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .flatMap((header) => header.value.split('\n'))
    .flatMap(parseRefreshCookieLine);
  const issued = lines.filter((line) => !line.isClearing).map((line) => line.value);
  return {
    issued: issued[issued.length - 1] ?? null,
    cleared: lines.some((line) => line.isClearing && line.isAuthPath),
  };
}

/** 要求に載っていたリフレッシュトークンの Cookie の値 */
async function requestRefreshCookie(response: Response): Promise<string | null> {
  const cookieHeader = (await response.request().headerValue('cookie')) ?? '';
  const match = /(?:^|;\s*)refreshToken=([^;]*)/.exec(cookieHeader);
  return match?.[1] ? match[1] : null;
}

const AUTH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/verify-2fa',
  '/api/v1/auth/verify-2fa/backup',
]);

/** Cookie の回収と破棄の対象の応答か（認証の POST） */
function isAuthCookieResponse(response: Response): boolean {
  return AUTH_PATHS.has(new URL(response.url()).pathname) && response.request().method() === 'POST';
}

/** 見張りの処理中のもの（回収が終わる前に次の受け渡しで読まないよう待つ） */
const pendingObservations = new Set<Promise<void>>();

const LOGIN_PATH = '/api/v1/auth/login';

/** 要求本文の 2FA 待ちの資格で利用者を決める認証の要求（2FA の検証） */
const CHALLENGE_IN_BODY_PATHS = new Set([
  '/api/v1/auth/verify-2fa',
  '/api/v1/auth/verify-2fa/backup',
]);

/**
 * ログインの応答の 2FA 待ちの資格と、ログインした共有の役割の対応
 *
 * 2FA の検証の要求はメールアドレスを送らず、ログインの応答の資格だけを送る（user-authentication 要件32）。
 * 検証の応答で発行された Cookie を役割へ回収するため、ログインの応答で資格と役割を覚える。
 */
const challengeRoles = new Map<string, SharedSessionRole>();

/** 要求本文を JSON として読む（読めなければ null） */
function requestBodyJson(response: Response): Record<string, unknown> | null {
  try {
    const body = response.request().postDataJSON() as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 応答した認証の要求が、どの共有の役割のものかを、要求だけから決める（応答本文を読まない）
 *
 * - ログイン: 要求本文のメールアドレス
 * - 2FA の検証: 要求本文の 2FA 待ちの資格（ログインの応答で覚えた対応）
 * - リフレッシュ・ログアウトなど: 要求に載っていた Cookie の値が、保持中のどの役割の値と一致するか
 *
 * 応答本文はコンテキストが閉じる直前の応答では読めないことがあるため、使わない。
 */
function roleOfAuthRequest(response: Response, presented: string | null): SharedSessionRole | null {
  const pathname = new URL(response.url()).pathname;
  if (pathname === LOGIN_PATH) {
    return roleOfEmail(requestBodyJson(response)?.email);
  }
  if (CHALLENGE_IN_BODY_PATHS.has(pathname)) {
    const challengeToken = requestBodyJson(response)?.challengeToken;
    return typeof challengeToken === 'string' ? (challengeRoles.get(challengeToken) ?? null) : null;
  }
  const store = readStore();
  return (
    SHARED_SESSION_ROLES.find((role) => presented !== null && store[role] === presented) ?? null
  );
}

/**
 * 共有の役割のログインが 2FA の検証を求めたとき、応答の資格と役割の対応を覚える
 *
 * 2FA の検証の画面へ進んだ直後の応答なので、本文を読める（読めなければ覚えず、
 * 検証の応答の Cookie は回収されない。次の受け渡しでログインし直す）。
 */
async function rememberChallengeRole(response: Response, role: SharedSessionRole): Promise<void> {
  const body = (await response.json().catch(() => null)) as {
    requires2FA?: unknown;
    challengeToken?: unknown;
  } | null;
  if (body?.requires2FA === true && typeof body.challengeToken === 'string') {
    challengeRoles.set(body.challengeToken, role);
  }
}

/**
 * 認証の応答から、共有の役割の Cookie の回収と破棄を行う
 *
 * 応答のヘッダー（Set-Cookie）と要求の Cookie だけを読む。
 * - 200 で新しい Cookie が発行された: その役割の Cookie として回収する（ローテーション後の Cookie）
 * - Cookie の消去・401: 要求に載っていた Cookie が保持中のものなら捨てる（失効した Cookie）
 */
async function observeAuthResponse(response: Response): Promise<void> {
  const status = response.status();
  const [headers, presented] = await Promise.all([
    response.headersArray(),
    requestRefreshCookie(response),
  ]);
  const { issued, cleared } = refreshCookieValueFromHeaders(headers);
  const role = roleOfAuthRequest(response, presented);

  if (status === 200 && !issued && role && new URL(response.url()).pathname === LOGIN_PATH) {
    await rememberChallengeRole(response, role);
  } else if (status === 200 && issued && role) {
    setStoredCookie(role, issued);
  } else if ((cleared || status === 401) && role && presented !== null) {
    setStoredCookie(role, null);
  }
}

/** 見張りを付けたコンテキストと、そのコンテキストが持つ共有の役割 */
const trackedContexts = new WeakSet<BrowserContext>();
const roleHolders = new Map<SharedSessionRole, BrowserContext>();
const closedContexts = new WeakSet<BrowserContext>();

/**
 * コンテキストの認証の応答を見張り、共有の役割の Cookie を回収する
 *
 * `loginAsUser` が共有の役割でログインするコンテキストに付ける（Cookie を渡したときも、
 * 新たにログインし直したときも）。
 */
export function trackSharedSessionCookies(context: BrowserContext): void {
  if (!trackedContexts.has(context)) {
    trackedContexts.add(context);
    startTracking(context);
  }
}

function startTracking(context: BrowserContext): void {
  context.on('response', (response) => {
    const observation = (
      isAuthCookieResponse(response) ? observeAuthResponse(response) : Promise.resolve()
    )
      .catch(() => {
        // コンテキストが閉じた後の読み出しの失敗は無視する（次の受け渡しで拒否されればログインし直す）
      })
      .finally(() => {
        pendingObservations.delete(observation);
      });
    pendingObservations.add(observation);
  });
  context.once('close', () => {
    closedContexts.add(context);
    for (const [role, holder] of roleHolders) {
      if (holder === context) {
        roleHolders.delete(role);
      }
    }
  });
}

async function flushObservations(): Promise<void> {
  while (pendingObservations.size > 0) {
    await Promise.allSettled([...pendingObservations]);
  }
}

/**
 * 共有の役割を、このコンテキストが持つものとして記録する（他の役割の記録は外す）
 */
export function holdSharedSessionRole(role: SharedSessionRole, context: BrowserContext): void {
  for (const [heldRole, holder] of roleHolders) {
    if (holder === context && heldRole !== role) {
      roleHolders.delete(heldRole);
    }
  }
  roleHolders.set(role, context);
}

/**
 * 共有の役割の Cookie を、開いている別のコンテキストが持っているか
 */
export function isSharedSessionRoleHeldElsewhere(
  role: SharedSessionRole,
  context: BrowserContext
): boolean {
  const holder = roleHolders.get(role);
  return holder !== undefined && holder !== context && !closedContexts.has(holder);
}

/**
 * 保持した Cookie をコンテキストへ渡し、画面を開いて Cookie によるリフレッシュで認証させる
 *
 * @returns 認証できたら true。Cookie が無い・拒否された・別のコンテキストが使用中なら false
 *   （呼び出し側が新たにログインする）
 */
export async function attachSharedSession(
  page: Page,
  role: SharedSessionRole,
  options: { timeout: number }
): Promise<boolean> {
  const context = page.context();
  if (isSharedSessionRoleHeldElsewhere(role, context)) {
    return false;
  }

  await flushObservations();
  const cookie = readStore()[role];
  if (!cookie) {
    return false;
  }

  // 前の画面の活動（初期化のリフレッシュ・予定のリフレッシュ・飛んでいる応答）を止めてから Cookie を
  // 差し替える。止めないと、前の画面の応答が差し替えた Cookie を上書き・消去し、応答の待機も取り違える
  await page.goto('about:blank');
  trackSharedSessionCookies(context);
  await context.clearCookies({ name: REFRESH_COOKIE_NAME });
  await context.addCookies([
    {
      name: REFRESH_COOKIE_NAME,
      value: cookie,
      domain: new URL(FRONTEND_BASE_URL).hostname,
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    },
  ]);
  holdSharedSessionRole(role, context);

  // 今回の遷移で、渡した Cookie を載せて送られたリフレッシュの応答だけを待つ
  const refreshResponse = page.waitForResponse(
    async (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/refresh' &&
      response.request().method() === 'POST' &&
      (await requestRefreshCookie(response)) === cookie,
    { timeout: options.timeout }
  );
  await page.goto('/dashboard');
  const response = await refreshResponse;
  const body = (await response.json().catch(() => null)) as { user?: { email?: unknown } } | null;
  const accepted = response.status() === 200 && roleOfEmail(body?.user?.email) === role;

  if (!accepted) {
    // 拒否された（または別の利用者の）Cookie は捨て、呼び出し側が新たにログインする。
    // 画面を離れてから Cookie を消す（画面が 502・503 で送り直すと、後から Cookie が戻るため）
    await page.goto('about:blank');
    await flushObservations();
    if (readStore()[role] === cookie) {
      setStoredCookie(role, null);
    }
    await context.clearCookies({ name: REFRESH_COOKIE_NAME });
    return false;
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: options.timeout,
  });
  await page.waitForLoadState('networkidle', { timeout: options.timeout });
  return true;
}

/**
 * 全体の準備: 共有の役割ごとにログインし、リフレッシュの Cookie を保持する
 *
 * 画面と同じオリジン（nginx の中継）を通し、ブラウザと同じ Cookie を得る。共有の役割の利用者は
 * 2FA 登録済みなので、ログインの補助（`completeApiLogin`）が TOTP のコードで 2FA の検証まで行い、
 * その応答の Cookie を保持する（user-authentication タスク47.4）。
 * ログインできないときは準備の失敗として例外を投げる。
 */
export async function establishSharedSessions(): Promise<void> {
  const store: SharedSessionStore = {};
  for (const role of SHARED_SESSION_ROLES) {
    const context = await playwrightRequest.newContext();
    try {
      const response = await completeApiLogin(context, role, SAME_ORIGIN_API_BASE_URL);
      const { issued } = refreshCookieValueFromHeaders(response.headersArray());
      if (!issued) {
        throw new Error(`共有の役割のログインの応答にリフレッシュの Cookie が無い（${role}）`);
      }
      store[role] = issued;
    } finally {
      await context.dispose();
    }
  }
  writeStore(store);
}
