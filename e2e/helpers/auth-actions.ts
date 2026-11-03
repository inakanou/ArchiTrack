/**
 * @fileoverview E2Eテスト用の認証アクション
 *
 * テストで使用するログイン、ログアウトなどの認証アクションを提供します。
 * Playwrightベストプラクティスに従い、実際のUIを通じて認証を行います。
 *
 * CI環境での安定性を向上させるため、リトライロジックと適切な待機を実装しています。
 *
 * 利用者は既定で 2FA 登録済みである（user-authentication タスク47.4、要件34.2）。画面のフォームで
 * ログインする補助は、2FA 登録済みの利用者（`twoFactorEnabled` が false でない）のログインの応答が
 * 2FA の検証を求めることを確かめ、既知の秘密鍵から計算した TOTP のコードを 2FA の検証の画面へ
 * 入れて検証する（`completeTwoFactorVerification`）。2FA 未登録の利用者は `twoFactorEnabled: false`
 * を持ち、応答が 2FA の検証を求めないことを確かめる。コードを計算する前に最後に使った時間ステップを
 * 戻すので、同じ利用者の同じ 30 秒の中の続けてのログインも再使用として拒否されない。
 */

import type { Locator, Page, Response } from '@playwright/test';
import { TEST_USERS, type TestUser } from './test-users';
import { getTimeout, waitForAuthState } from './wait-helpers';
import { waitForAuthenticatedSession } from './auth-api';
import { E2E_TOTP_SECRET, fillTotpCode, prepareTotpCode } from './two-factor-totp';
import {
  attachSharedSession,
  holdSharedSessionRole,
  isSharedSessionRole,
  isSharedSessionRoleHeldElsewhere,
  trackSharedSessionCookies,
} from './shared-sessions';

/**
 * ログインの資格と 2FA の登録の状態
 *
 * `twoFactorEnabled` が false でない利用者（既定）は 2FA 登録済みとして扱い、ログインの応答が
 * 2FA の検証を求めることを前提とする。秘密鍵は `totpSecret`（省略時は E2E_TOTP_SECRET）。
 */
export type LoginCredentials = Pick<
  TestUser,
  'email' | 'password' | 'totpSecret' | 'twoFactorEnabled'
>;

const LOGIN_API_PATH = '/api/v1/auth/login';
const VERIFY_TOTP_API_PATH = '/api/v1/auth/verify-2fa';

function isPostTo(response: Response, pathname: string): boolean {
  return new URL(response.url()).pathname === pathname && response.request().method() === 'POST';
}

/**
 * 2FA の検証の画面で、既知の秘密鍵から計算した TOTP のコードを入れて検証する
 *
 * ログインの応答が 2FA の検証を求め、画面が 2FA の検証の画面を表示した後に呼ぶ。
 * 検証の応答が 200 でなければ失敗する。
 *
 * @returns 2FA の検証の応答（アクセストークンと利用者を載せる）
 * @param page - Playwrightのページオブジェクト
 * @param user - ログインした利用者（メールアドレスと秘密鍵）
 *
 * @example
 * ```typescript
 * await page.getByRole('button', { name: /ログイン/i }).click();
 * await completeTwoFactorVerification(page, TEST_USERS.REGULAR_USER);
 * ```
 */
export async function completeTwoFactorVerification(
  page: Page,
  user: Pick<LoginCredentials, 'email' | 'totpSecret'>
): Promise<Response> {
  await page.getByTestId('totp-digit-0').waitFor({ state: 'visible', timeout: getTimeout(15000) });
  const code = await prepareTotpCode(user.email, user.totpSecret ?? E2E_TOTP_SECRET);
  await fillTotpCode(page, code);
  const verifyResponsePromise = page.waitForResponse(
    (response) => isPostTo(response, VERIFY_TOTP_API_PATH),
    { timeout: getTimeout(20000) }
  );
  await page.getByRole('button', { name: '検証', exact: true }).click();
  const verifyResponse = await verifyResponsePromise;
  if (!verifyResponse.ok()) {
    const errorBody = await verifyResponse.text().catch(() => 'Unknown error');
    throw new Error(
      `2FA verification API failed with status ${verifyResponse.status()}: ${errorBody}`
    );
  }
  return verifyResponse;
}

/**
 * セッション切れのモーダルの再認証で 2FA の検証を求められたとき、モーダルの認証コードの欄へ
 * 既知の秘密鍵から計算した TOTP のコードを入れて再ログインする
 *
 * モーダルでパスワードを送り、ログインの応答が 2FA の検証を求めた後に呼ぶ。
 * 2FA の検証の応答が 200 でなければ失敗する。
 *
 * @param page - Playwrightのページオブジェクト
 * @param user - 再認証する利用者（メールアドレスと秘密鍵）
 * @returns 2FA の検証の応答
 */
export async function submitSessionExpiredTwoFactorCode(
  page: Page,
  user: Pick<LoginCredentials, 'email' | 'totpSecret'>
): Promise<Response> {
  const dialog = page.getByRole('dialog', { name: /セッション/ });
  const totpInput = dialog.locator('input#session-expired-totp');
  await totpInput.waitFor({ state: 'visible', timeout: getTimeout(15000) });
  await totpInput.fill(await prepareTotpCode(user.email, user.totpSecret ?? E2E_TOTP_SECRET));
  const verifyResponsePromise = page.waitForResponse(
    (response) => isPostTo(response, VERIFY_TOTP_API_PATH),
    { timeout: getTimeout(20000) }
  );
  await dialog.getByRole('button', { name: '再ログイン', exact: true }).click();
  const verifyResponse = await verifyResponsePromise;
  if (!verifyResponse.ok()) {
    const errorBody = await verifyResponse.text().catch(() => 'Unknown error');
    throw new Error(
      `2FA verification API failed with status ${verifyResponse.status()}: ${errorBody}`
    );
  }
  return verifyResponse;
}

/**
 * ログインの応答を利用者の 2FA の登録の状態と照らし、2FA 登録済みなら 2FA の検証を行う
 *
 * 2FA 登録済み（`twoFactorEnabled` が false でない）の利用者はログインの応答が 2FA の検証を
 * 求めることを、未登録の利用者は求めないことを前提とし、食い違えば失敗する（観測で黙って
 * 経路を切り替えない）。
 */
async function completeLoginResponse(
  page: Page,
  user: Pick<LoginCredentials, 'email' | 'totpSecret' | 'twoFactorEnabled'>,
  loginResponse: Response
): Promise<void> {
  const body = (await loginResponse.json()) as { requires2FA?: unknown };
  const expectsTwoFactor = user.twoFactorEnabled !== false;
  if ((body.requires2FA === true) !== expectsTwoFactor) {
    throw new Error(
      `ログインの応答の 2FA の要求（requires2FA: ${String(body.requires2FA)}）が` +
        `利用者 ${user.email} の 2FA の登録の状態（${expectsTwoFactor ? '登録済み' : '未登録'}）と食い違う`
    );
  }
  if (expectsTwoFactor) {
    await completeTwoFactorVerification(page, user);
  }
}

/**
 * 入力済みのログイン画面でログインボタンを押し、ログインを完了させる
 *
 * ログインの応答が 200 でなければ失敗する。2FA 登録済みの利用者は 2FA の検証の画面で TOTP の
 * コードを入れて検証する。ログイン画面を離れ、画面のセッションで認証済みの API が成功するまで待つ
 * （トークンは画面のメモリと HttpOnly Cookie だけにあり、永続ストレージに無い）。
 */
async function clickLoginAndComplete(
  page: Page,
  loginButton: Locator,
  user: Pick<LoginCredentials, 'email' | 'totpSecret' | 'twoFactorEnabled'>
): Promise<void> {
  const loginResponsePromise = page.waitForResponse(
    (response) => isPostTo(response, LOGIN_API_PATH),
    { timeout: getTimeout(20000) }
  );
  await loginButton.click();
  const loginResponse = await loginResponsePromise;
  if (!loginResponse.ok()) {
    const errorBody = await loginResponse.text().catch(() => 'Unknown error');
    throw new Error(`Login API failed with status ${loginResponse.status()}: ${errorBody}`);
  }

  // 2FA 登録済みの利用者は、2FA の検証の画面で TOTP のコードを入れて検証する
  await completeLoginResponse(page, user, loginResponse);

  // ログインページから離れることを待機（/dashboard、/、またはリダイレクト元の画面）
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: getTimeout(15000),
  });
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
  await waitForAuthenticatedSession(page, { timeout: getTimeout(10000), polling: 500 });
}

/**
 * 表示中のログイン画面で資格を入れて送信し、ログインを完了させる
 *
 * ログイン画面へ改めて遷移しないので、保護された画面からリダイレクトされたログイン画面の
 * 戻り先（`redirectUrl`）を保ったままログインできる。2FA 登録済みの利用者は補助でコードを
 * 入れて検証する。ログイン画面を離れ、画面のセッションで認証済みの API が成功するまで待つ。
 *
 * @param page - Playwrightのページオブジェクト（ログイン画面を表示していること）
 * @param user - ログインする利用者
 */
export async function submitLoginForm(page: Page, user: LoginCredentials): Promise<void> {
  const emailInput = page.getByLabel(/メールアドレス/i);
  await emailInput.waitFor({ state: 'visible', timeout: getTimeout(10000) });
  await emailInput.fill(user.email);
  await page.locator('input#password').fill(user.password);
  await clickLoginAndComplete(page, page.getByRole('button', { name: /ログイン/i }), user);
}

/**
 * CI環境かどうかを判定
 */
const isCI = !!process.env.CI;

/**
 * テストユーザーとしてログインする
 *
 * ログインページに移動し、指定されたユーザー情報でログインします。
 * ログイン後、ダッシュボードへのリダイレクトを待機します。
 *
 * CI環境での安定性を向上させるため、以下の対策を実装:
 * - リトライロジックの追加
 * - 適切なタイムアウト設定
 * - 認証状態の確実な確認
 *
 * @param page - Playwrightのページオブジェクト
 * @param userKey - TEST_USERSのキー（'REGULAR_USER', 'ADMIN_USER'など）、
 *   またはテストの中で作った利用者（`createSessionUser` の戻り値など）
 * @param options - オプション
 *
 * @example
 * ```typescript
 * test('プロフィール画面が表示される', async ({ page }) => {
 *   await loginAsUser(page, 'REGULAR_USER');
 *   await page.goto('/profile');
 *   // ...
 * });
 * ```
 */
export async function loginAsUser(
  page: Page,
  userKey: keyof typeof TEST_USERS | TestUser,
  options?: {
    /** 最大リトライ回数 */
    maxRetries?: number;
  }
): Promise<void> {
  const user = typeof userKey === 'string' ? TEST_USERS[userKey] : userKey;
  const maxRetries = options?.maxRetries ?? (isCI ? 3 : 1);

  // 共有の役割は、全体の準備で保持したリフレッシュの Cookie を渡して認証させる（ログイン画面を経ない）。
  // Cookie が無い・拒否された・別のコンテキストが使用中のときは、ログイン画面からログインする
  // （user-authentication タスク45.4、design.md「E2E の認証基盤の移行」）
  const sharedRole = isSharedSessionRole(userKey) ? userKey : null;
  const attached = sharedRole
    ? await attachSharedSession(page, sharedRole, { timeout: getTimeout(20000) })
    : false;

  if (!attached) {
    if (sharedRole && !isSharedSessionRoleHeldElsewhere(sharedRole, page.context())) {
      // 新たにログインし直した Cookie を回収して、次のテストへ渡す
      trackSharedSessionCookies(page.context());
      holdSharedSessionRole(sharedRole, page.context());
    }
    await loginThroughForm(page, user, maxRetries);
  }
}

/**
 * ログイン画面からログインする（リトライ付き）
 *
 * @param page - Playwrightのページオブジェクト
 * @param user - ユーザー情報
 * @param maxRetries - 最大リトライ回数
 */
async function loginThroughForm(
  page: Page,
  user: LoginCredentials,
  maxRetries: number
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await performLogin(page, user);

      // 認証状態を確認
      const authEstablished = await waitForAuthState(page, {
        maxRetries: isCI ? 3 : 2,
        timeout: getTimeout(10000),
      });

      if (!authEstablished) {
        throw new Error('Authentication state not established');
      }

      // ログイン成功
      return;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        // 認証状態をクリアして再試行（performLogin がログインページへ移動する）
        await clearAuthState(page);
      } else {
        throw error;
      }
    }
  }
}

/**
 * ログイン処理の実行
 *
 * @param page - Playwrightのページオブジェクト
 * @param user - ユーザー情報
 */
async function performLogin(page: Page, user: LoginCredentials): Promise<void> {
  // 前の認証状態（リフレッシュの Cookie）をクリアしてから、ログインページに移動する
  // （Cookie が残っていると、ログインページの初期化がその Cookie で認証してしまう）
  await clearAuthState(page);
  await page.goto('/login', { waitUntil: 'networkidle' });

  // フォーム要素が操作可能になるまで待機
  const emailInput = page.getByLabel(/メールアドレス/i);
  const passwordInput = page.locator('input#password');
  const loginButton = page.getByRole('button', { name: /ログイン/i });

  const formTimeout = getTimeout(10000);
  await emailInput.waitFor({ state: 'visible', timeout: formTimeout });
  await passwordInput.waitFor({ state: 'visible', timeout: formTimeout });
  await loginButton.waitFor({ state: 'visible', timeout: formTimeout });

  // メールアドレスとパスワードを入力
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);

  // ログインボタンを押し、2FA の検証を含めてログインを完了させる
  await clickLoginAndComplete(page, loginButton, user);
}

/**
 * 認証状態をクリア
 *
 * @param page - Playwrightのページオブジェクト
 */
async function clearAuthState(page: Page): Promise<void> {
  // 先に画面を離れ、予定のリフレッシュや飛んでいる応答が消した Cookie を戻さないようにする。
  // 画面のメモリのアクセストークンもここで消える
  await page.goto('about:blank');
  // リフレッシュトークンは HttpOnly Cookie にある（スクリプトから消せないためコンテキストから消す）
  await page.context().clearCookies({ name: 'refreshToken' });
}

/**
 * カスタム認証情報でログインする
 *
 * TEST_USERSに定義されていないカスタム認証情報でログインする場合に使用します。
 * 利用者が 2FA 登録済み（既定）なら、既知の秘密鍵（`totpSecret`、省略時は E2E_TOTP_SECRET）から
 * 計算したコードで 2FA の検証まで行う（`waitForRedirect` が true のとき）。2FA 未登録の利用者は
 * `state` に `twoFactorEnabled: false` を渡す。
 *
 * @param page - Playwrightのページオブジェクト
 * @param email - メールアドレス
 * @param password - パスワード
 * @param waitForRedirect - ログイン後のリダイレクトを待機するかどうか（デフォルト: true）
 * @param state - 利用者の 2FA の登録の状態と秘密鍵（省略時は E2E_TOTP_SECRET で登録済み）
 *
 * @example
 * ```typescript
 * await loginWithCredentials(page, sessionUser.email, newPassword);
 * ```
 */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  waitForRedirect = true,
  state: Pick<LoginCredentials, 'totpSecret' | 'twoFactorEnabled'> = {}
): Promise<void> {
  // ログインページに移動し、ページ読み込み完了を待機
  await page.goto('/login', { waitUntil: 'networkidle' });

  // フォーム要素が操作可能になるまで待機
  const emailInput = page.getByLabel(/メールアドレス/i);
  const passwordInput = page.locator('input#password');
  const loginButton = page.getByRole('button', { name: /ログイン/i });

  const formTimeout = getTimeout(10000);
  await emailInput.waitFor({ state: 'visible', timeout: formTimeout });
  await passwordInput.waitFor({ state: 'visible', timeout: formTimeout });
  await loginButton.waitFor({ state: 'visible', timeout: formTimeout });

  // メールアドレスとパスワードを入力
  await emailInput.fill(email);
  await passwordInput.fill(password);

  if (waitForRedirect) {
    // ログインボタンを押し、2FA の検証を含めてログインを完了させる
    await clickLoginAndComplete(page, loginButton, { email, ...state });
  } else {
    await loginButton.click();
  }
}

/**
 * ログアウトする
 *
 * ログアウトボタンをクリックしてログアウトし、ログインページへのリダイレクトを待機します。
 *
 * @param page - Playwrightのページオブジェクト
 *
 * @example
 * ```typescript
 * test('ログアウト後はログインページに遷移', async ({ page }) => {
 *   await loginAsUser(page, 'REGULAR_USER');
 *   await logout(page);
 *   await expect(page).toHaveURL(/\/login/);
 * });
 * ```
 */
export async function logout(page: Page): Promise<void> {
  // ログアウトボタンをクリック
  await page.getByRole('button', { name: /ログアウト/i }).click();

  // ログインページへのリダイレクトを待機
  await page.waitForURL(/\/login/, { timeout: getTimeout(15000) });

  // ネットワークアイドルを待機
  await page.waitForLoadState('networkidle', { timeout: getTimeout(15000) });
}
