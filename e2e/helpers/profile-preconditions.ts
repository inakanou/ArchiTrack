/**
 * @fileoverview プロフィール画面を「認証が効いた状態で開けていること」を前提として主張する補助
 *
 * ## 背景（Task 115.127 段7・F 群）
 *
 * `e2e/specs/auth/profile.spec.ts` と `e2e/specs/auth/security-accessibility.spec.ts` には
 * 次の形が繰り返し置かれていた。
 *
 * ```ts
 * const missingTokenError = page.getByText(/MISSING_TOKEN/i);
 * if ((await missingTokenError.count()) > 0) {
 *   // トークンを捨てて再ログインし、もう一度同じ操作をやり直す
 * }
 * ```
 *
 * `MISSING_TOKEN` は backend の `authenticate.middleware.ts` が
 * **Authorization ヘッダの無い要求**に対して返す 401 の識別子である
 * （`backend/src/middleware/authenticate.middleware.ts` L44 / L55 / L67）。
 * すなわちこの分岐が発火するのは「ログインしたはずなのに要求へトークンが載っていない」
 * ときであり、要件 REQ-9.1（認証済みユーザーはプロフィールを取得できる）が
 * 崩れている状態にほかならない。それを黙って復旧してしまうと、
 * 認証が壊れても検証は緑のまま通る。
 *
 * さらに悪いことに、この分岐は復旧のたびにフォームへ再入力して同じ操作をやり直すため、
 * **検証の本体が何回実行されたのか、そもそも実行されたのかが読めない**。
 *
 * ## 到達点
 *
 * 前提（＝認証が効いた状態でプロフィール画面が開けていること）は
 * `loginAsUser` / `loginWithCredentials` が確立し終えているはずのものであり、
 * 観測して分岐する対象ではない。本補助は前提を**無条件に主張**する。
 * 崩れていれば、後段のパスワード変更ではなく**この地点で失敗する**。
 *
 * @module e2e/helpers/profile-preconditions
 */

import { expect, type Page } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/**
 * 認証が要求へ載っていないことを示す backend のエラー識別子
 *
 * `backend/src/middleware/authenticate.middleware.ts` が Authorization ヘッダの
 * 無い要求へ返す 401 の `error` 値。画面はこれをそのままメッセージ領域へ表示する
 * （`frontend/src/pages/Profile.tsx` の `err.response.error` 経路）。
 */
const MISSING_TOKEN_PATTERN = /MISSING_TOKEN/i;

/**
 * プロフィール画面を開き、認証が効いた状態で描画されていることを無条件に主張する。
 *
 * 次の3点をすべて主張する。いずれかが崩れていればその場で失敗する。
 *
 * 1. プロフィール画面のヘッダーが表示される（REQ-14.1 の基本要素）
 * 2. メールアドレス欄が期待するユーザーの値を持つ（＝ REQ-9.1 の取得が成功している）
 * 3. `MISSING_TOKEN` が表示されていない（＝要求に認証が載っている）
 *
 * @param page Playwright のページ（`loginAsUser` / `loginWithCredentials` 済みであること）
 * @param expectedEmail プロフィール画面に表示されているはずのメールアドレス
 */
export async function openProfilePage(page: Page, expectedEmail: string): Promise<void> {
  await page.goto('/profile', { waitUntil: 'networkidle' });
  await assertProfilePageAuthenticated(page, expectedEmail);
}

/**
 * 現在のページがプロフィール画面であり、認証が効いていることを無条件に主張する。
 *
 * 画面遷移を伴わずに前提だけを確かめたい箇所（ログイン直後の再確認など）で用いる。
 *
 * @param page Playwright のページ
 * @param expectedEmail プロフィール画面に表示されているはずのメールアドレス
 */
export async function assertProfilePageAuthenticated(
  page: Page,
  expectedEmail: string
): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /プロフィール/i }),
    'プロフィール画面のヘッダーが表示されない（認証済みで /profile を開けていない）'
  ).toBeVisible({ timeout: getTimeout(20000) });

  await expect(
    page.getByLabel(/メールアドレス/i),
    'プロフィール画面のメールアドレス欄がログイン中のユーザーを示していない'
  ).toHaveValue(expectedEmail, { timeout: getTimeout(20000) });

  await assertNoMissingTokenError(page);
}

/**
 * 画面に `MISSING_TOKEN` が表示されていないことを無条件に主張する。
 *
 * 表示されている場合、直前の API 要求に Authorization ヘッダが載っていない。
 * 復旧して続行すると認証の破綻が検証を素通りするため、ここで失敗させる。
 *
 * @param page Playwright のページ
 */
export async function assertNoMissingTokenError(page: Page): Promise<void> {
  await expect(
    page.getByText(MISSING_TOKEN_PATTERN),
    'MISSING_TOKEN が表示されている（API 要求に認証が載っていない。REQ-9.1 が成立していない）'
  ).toHaveCount(0);
}

/**
 * パスワード変更フォームが操作できる状態にあることを無条件に主張する。
 *
 * REQ-14.5（現在のパスワード・新しいパスワード・パスワード確認の3欄）の表示を前提として確かめる。
 *
 * @param page Playwright のページ
 */
export async function assertPasswordFormReady(page: Page): Promise<void> {
  for (const id of ['currentPassword', 'newPassword', 'confirmPassword']) {
    await expect(
      page.locator(`input#${id}`),
      `パスワード変更フォームの入力欄が表示されない: input#${id}`
    ).toBeVisible({ timeout: getTimeout(20000) });
  }
}

/**
 * パスワード変更フォームへ入力し、確認ダイアログを経て変更を確定する。
 *
 * REQ-14.7（確認ダイアログ「全デバイスからログアウトされます」）を無条件に主張したうえで
 * 確定ボタンを押す。ダイアログが出なければその場で失敗する。
 *
 * @param page Playwright のページ
 * @param currentPassword 現在のパスワード
 * @param newPassword 新しいパスワード
 */
export async function submitPasswordChange(
  page: Page,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await assertPasswordFormReady(page);

  await page.locator('input#currentPassword').fill(currentPassword);
  await page.locator('input#newPassword').fill(newPassword);
  await page.locator('input#confirmPassword').fill(newPassword);

  const changePasswordButton = page.getByRole('button', { name: /パスワードを変更/i });
  await expect(changePasswordButton).toBeEnabled({ timeout: getTimeout(10000) });
  await changePasswordButton.click();

  // 要件14.7: 確認ダイアログ（「全デバイスからログアウトされます」）が表示される
  await expect(
    page.getByText(/全デバイスからログアウトされます/i),
    'パスワード変更の確認ダイアログが表示されない（REQ-14.7）'
  ).toBeVisible({ timeout: getTimeout(20000) });

  await page.getByRole('button', { name: /はい、変更する/i }).click();
}

/**
 * パスワード変更の成功（REQ-14.8）を無条件に主張する。
 *
 * 成功メッセージの表示と、それに続くログイン画面への自動リダイレクトの双方を主張する。
 * 画面は成功メッセージを出してから 2 秒後にログアウトする
 * （`frontend/src/pages/Profile.tsx` の `setTimeout(..., 2000)`）ため、両方が観測できる。
 *
 * @param page Playwright のページ
 */
export async function expectPasswordChangeSucceeded(page: Page): Promise<void> {
  await assertNoMissingTokenError(page);

  await expect(
    page.getByText(/パスワードを変更しました/i),
    'パスワード変更の成功メッセージが表示されない（REQ-14.8）'
  ).toBeVisible({ timeout: getTimeout(30000) });

  await page.waitForURL(/\/login/, { timeout: getTimeout(30000) });
  await expect(page).toHaveURL(/\/login/);
}
