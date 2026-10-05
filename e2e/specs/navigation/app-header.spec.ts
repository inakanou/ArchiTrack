import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { TEST_USERS } from '../../helpers/test-users';
import {
  cleanDatabase,
  cleanDatabaseAndRestoreTestData,
  getPrismaClient,
} from '../../fixtures/database';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';

/**
 * 管理者としてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'ADMIN_USER');
}

/**
 * 一般ユーザーとしてログイン
 * loginAsUserのラッパー関数
 */
async function loginAsRegularUser(page: import('@playwright/test').Page): Promise<void> {
  await loginAsUser(page, 'REGULAR_USER');
}

/**
 * モバイル幅の検証（Task 39.1）で測る画面幅
 *
 * 要件15.1 が定めるモバイル幅（320px-767px）の下限 320 と、
 * 機能レベル検証が水平のはみ出しを実測した 375 の二つ。
 */
const MOBILE_WIDTHS = [320, 375] as const;

/**
 * モバイル幅の検証で使うロール
 *
 * 管理者は「管理メニュー」が一つ多く、ヘッダーに並ぶ項目の数が違うため、双方を測る。
 */
const MOBILE_HEADER_ROLES = [
  { label: '管理者', userKey: 'ADMIN_USER', isAdmin: true },
  { label: '一般ユーザー', userKey: 'REGULAR_USER', isAdmin: false },
] as const;

/**
 * モバイル幅の検証で使う表示名と、測る保護画面
 *
 * displayName が null のものはテストユーザーの既定の表示名のまま、既存の検証と同じ /dashboard で測る。
 * 長い表示名は、区切りの無い英数字一語（折り返す位置が無い）と長い和文の二通りで、/profile で測る。
 *
 * 長い表示名を /dashboard で測らない理由: ダッシュボード画面の本文は見出しに表示名を出し
 * （frontend/src/pages/Dashboard.tsx の「ようこそ、…さん」）、区切りの無い英数字一語の長い表示名では
 * その見出しの文字が画面幅を超える（是正後のヘッダーで実測。375 幅で documentElement の
 * scrollWidth 983 / clientWidth 375。はみ出すのは <main> 側の h1 の文字で、ヘッダーは内側にある）。
 * 文書全体の幅は本文のはみ出しも拾うため、/dashboard で測るとヘッダーの検証にならない。
 * /profile の本文は表示名を入力欄の値としてしか出さず、長い表示名でも本文がはみ出さない。
 * ダッシュボードの見出しのはみ出しは共通ヘッダーの境界の外であり、本検証は判定しない。
 * （上の値は Task 39.1 の時点の実測。見出しのはみ出しは Task 40.3 で是正し、
 * e2e/specs/auth/dashboard-responsive.spec.ts が判定する）
 */
const MOBILE_DISPLAY_NAME_CASES = [
  { label: '既定の表示名', displayName: null, path: '/dashboard' },
  {
    label: '区切りの無い英数字一語の長い表示名',
    displayName: 'Abcdefghij0123456789'.repeat(3),
    path: '/profile',
  },
  {
    label: '長い和文の表示名',
    displayName: '共通ヘッダの表示を確かめるためのとても長い表示名を持つ利用者'.repeat(2),
    path: '/profile',
  },
] as const;

/** 水平方向の許容誤差（px）。小数のレイアウトの丸めを吸収する */
const HORIZONTAL_TOLERANCE_PX = 1;

/**
 * 文書全体（documentElement）の水平方向の寸法を測る
 */
async function measureDocumentWidth(page: Page): Promise<{
  viewportWidth: number;
  scrollWidth: number;
  clientWidth: number;
}> {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/**
 * 文書全体が水平にはみ出していないことを主張する
 *
 * clientWidth が設定した画面幅と一致することを先に主張する。
 * 画面幅の設定が効いていなければ、はみ出しの主張は別の幅を測ったことになるためである。
 */
async function expectNoDocumentHorizontalOverflow(
  page: Page,
  width: number,
  situation: string
): Promise<void> {
  const m = await measureDocumentWidth(page);
  const report = `${situation}: documentElement の scrollWidth=${m.scrollWidth} / clientWidth=${m.clientWidth}（画面幅 ${m.viewportWidth}）`;
  expect(m.viewportWidth, report).toBe(width);
  expect(m.clientWidth, report).toBe(width);
  expect(m.scrollWidth - m.clientWidth, report).toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
}

/**
 * 要素が画面幅の内側にあり、その中心を指して届くことを主張する
 *
 * 位置は文書の座標（表示領域の座標 + 水平スクロール量）で測る。
 * Playwright の click は対象が表示領域の外にあると水平にスクロールして届かせるため、
 * 表示領域の座標のままでは「はみ出していたのでスクロールして届いた」状態を内側と読み違える。
 * 要素の箱だけでなく中身（文字とアイコン）の右端も DOM Range で測る。
 * flex の項目は中身に合わせて伸びるので、要素自身の scrollWidth では中身のはみ出しを捉えられない。
 * 中心の点で elementFromPoint が当の要素（またはその子孫）を返すことも主張する。
 * 他の要素の下に隠れている、または表示領域の外にある要素は、位置が内側でも届かないためである。
 */
async function expectReachableWithinViewport(target: Locator, description: string): Promise<void> {
  const m = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const content = range.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      viewportWidth: document.documentElement.clientWidth,
      left: rect.left + window.scrollX,
      right: rect.right + window.scrollX,
      width: rect.width,
      height: rect.height,
      contentRight: content.right + window.scrollX,
      hitsItself: hit !== null && (hit === el || el.contains(hit)),
    };
  });
  const report = `${description}: ${JSON.stringify(m)}`;
  expect(m.width, report).toBeGreaterThan(0);
  expect(m.height, report).toBeGreaterThan(0);
  expect(m.left, report).toBeGreaterThanOrEqual(-HORIZONTAL_TOLERANCE_PX);
  expect(m.right, report).toBeLessThanOrEqual(m.viewportWidth + HORIZONTAL_TOLERANCE_PX);
  expect(m.contentRight, report).toBeLessThanOrEqual(m.viewportWidth + HORIZONTAL_TOLERANCE_PX);
  expect(m.hitsItself, report).toBe(true);
}

/**
 * AppHeader ナビゲーションのE2Eテスト
 *
 * 共通ヘッダーナビゲーション（AppHeader）の機能を検証します。
 * 対象は user-authentication の要件28「画面遷移とナビゲーション」のうち、
 * 共通ヘッダーと管理メニューに関わる受入基準である。
 *
 * ヘッダーでの被覆主張は行わない（Task 115.177）。
 * 従来このヘッダーは REQ-28 および REQ-28.21〜28.25 を機能名なしの記法で列挙していたが、
 * 機能名を欠く記法は被覆検査（scripts/check-requirement-coverage.ts）のいずれのパターンにも合致せず、
 * 本ファイルからの抽出件数は零だった。すなわち「掲げているが数えられていない」状態にあった。
 * 被覆の主張は実際に判定している検証の直上にのみ `@requirement 機能名/REQ-N.M` 形式で置き、
 * 判定していない基準は主張せずその理由をその場に記す。
 */
test.describe('AppHeader ナビゲーション', () => {
  /**
   * テスト開始前にデータベースをクリーンアップし、テストユーザーを再作成
   * 前のテスト（例: profile.spec.tsのパスワード変更テスト）による
   * パスワード変更の影響を防止
   */
  test.beforeAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await createAllTestUsers(prisma);
  });

  /**
   * @requirement user-authentication/REQ-28.21: 認証済みユーザーが保護された画面にアクセスしたとき共通ヘッダーナビゲーションを表示する
   * WHEN 認証済みユーザーが保護された画面にアクセスする
   * THEN Frontend UIは共通ヘッダーナビゲーションを表示する
   *
   * 判定根拠: 保護画面 /dashboard で header[role="banner"] と nav[role="navigation"] の
   * 可視を主張しており、共通ヘッダーが表示されなくなれば赤になる。
   */
  test('認証済みユーザーにはヘッダーナビゲーションが表示される', async ({ page }) => {
    await loginAsRegularUser(page);

    // ダッシュボードに移動
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ヘッダーが表示されていることを確認
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeVisible();

    // ナビゲーションが表示されていることを確認
    const nav = page.locator('nav[role="navigation"]');
    await expect(nav).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.22: 共通ヘッダーナビゲーションはダッシュボード・プロフィール・ログアウトを含む
   * WHEN 共通ヘッダーナビゲーションが表示される
   * THEN Frontend UIはダッシュボードへのリンク、プロフィールへのリンク、ログアウトボタンを含む
   *
   * 判定根拠: ダッシュボードリンクと、ユーザーメニュー展開後の user-menu-profile /
   * user-menu-logout の可視をそれぞれ主張しており、いずれかが欠ければ赤になる。
   */
  test('ヘッダーにダッシュボード/プロフィール/ログアウトリンクが表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ダッシュボードリンクが表示されていることを確認
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();

    // ユーザーメニューを開く
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();

    // プロフィールリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-profile')).toBeVisible();

    // ログアウトリンクが表示されていることを確認
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.23（ログイン中のユーザー表示名を表示する）を
   * 掲げていたが、この検証はその規範を判定できない。
   * 実測根拠: ユーザーメニューボタンの中身は
   * frontend/src/components/Navigation/AppHeader.tsx:436-437 で
   * イニシャル用アバター（displayName未設定時は 'U' を返す getInitials）と
   * `{user?.displayName || 'ユーザー'}` の二要素から成る。
   * したがって表示名の取得が壊れてもボタンのテキストは 'Uユーザー' となり空にならず、
   * 下の not.toHaveText('') は緑のままである。「壊れたら赤になるか」を満たさないため主張しない。
   * なお本基準はログインユーザー名を実際に突き合わせる e2e/specs/auth/navigation.spec.ts 側で判定している。
   */
  test('ヘッダーにユーザー表示名が表示される', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューボタンにユーザー名が表示されていることを確認
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await expect(userMenuButton).toBeVisible();
    // ボタンにユーザー名が含まれていることを確認（空でないこと）
    await expect(userMenuButton).not.toHaveText('');
  });

  /**
   * @requirement user-authentication/REQ-28.24: 管理者ユーザーのナビゲーションに「管理メニュー」ドロップダウンを追加表示する
   * WHEN 管理者ユーザーがナビゲーションを表示する
   * THEN Frontend UIは「管理メニュー」ドロップダウンを追加表示する
   *
   * 判定根拠: 管理者でログインした状態で「管理メニュー」ボタンの可視を主張しており、
   * 管理者に追加表示されなくなれば赤になる。
   */
  test('管理者には管理メニューが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていることを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).toBeVisible();
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.24 を掲げていたが、
   * REQ-28.24 の規範は「管理者ユーザーがナビゲーションを表示したとき管理メニューを追加する」であり、
   * 非管理者に表示しないことは規範が述べていない。
   * よって管理メニューが全ユーザーに出るようになってもREQ-28.24自体は破れず、
   * 逆にこの検証が赤になってもREQ-28.24違反を意味しない。規範との対応が成立しないため主張しない。
   * この検証は管理機能の可視性が権限で分岐することを守る回帰検証として残す。
   */
  test('一般ユーザーには管理メニューが表示されない', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューボタンが表示されていないことを確認
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await expect(adminMenuButton).not.toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.25: 管理メニュー展開時にユーザー管理・招待管理・ロール管理・権限管理・監査ログへのリンクを表示する
   * WHEN 管理メニューが展開される
   * THEN Frontend UIはユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンクを表示する
   *
   * 判定根拠: 展開後に五つの項目すべての可視を個別に主張しており、
   * いずれか一つでも欠ければ赤になる。
   */
  test('管理メニューにはユーザー管理/招待管理/ロール管理/権限管理/監査ログリンクが表示される', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開く
    const adminMenuButton = page.getByRole('button', { name: '管理メニュー' });
    await adminMenuButton.click();

    // 各リンクが表示されていることを確認
    await expect(page.getByTestId('admin-menu-users')).toBeVisible();
    await expect(page.getByTestId('admin-menu-invitations')).toBeVisible();
    await expect(page.getByTestId('admin-menu-roles')).toBeVisible();
    await expect(page.getByTestId('admin-menu-permissions')).toBeVisible();
    await expect(page.getByTestId('admin-menu-audit-logs')).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-28.36: 招待管理リンククリックで招待管理画面へ遷移する
   *
   * 判定根拠: 管理メニューの admin-menu-invitations を実際にクリックし、
   * 遷移後URLが /admin/invitations であることを主張しており、遷移が壊れれば赤になる。
   */
  test('管理メニューから招待管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて招待管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-invitations').click();

    // 招待管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/invitations/);
  });

  /**
   * @requirement user-authentication/REQ-28.37: ユーザー管理リンククリックでユーザー管理画面へ遷移する
   *
   * 判定根拠: admin-menu-users を実際にクリックし、遷移後URLが /admin/users であることを主張している。
   */
  test('管理メニューからユーザー管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてユーザー管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-users').click();

    // ユーザー管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  /**
   * @requirement user-authentication/REQ-28.38: ロール管理リンククリックでロール管理画面へ遷移する
   *
   * 判定根拠: admin-menu-roles を実際にクリックし、遷移後URLが /admin/roles であることを主張している。
   */
  test('管理メニューからロール管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いてロール管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-roles').click();

    // ロール管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/roles/);
  });

  /**
   * @requirement user-authentication/REQ-28.39: 権限管理リンククリックで権限管理画面へ遷移する
   *
   * 判定根拠: admin-menu-permissions を実際にクリックし、遷移後URLが /admin/permissions であることを主張している。
   */
  test('管理メニューから権限管理画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて権限管理をクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-permissions').click();

    // 権限管理画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/permissions/);
  });

  /**
   * @requirement user-authentication/REQ-28.40: 監査ログリンククリックで監査ログ画面へ遷移する
   *
   * 判定根拠: admin-menu-audit-logs を実際にクリックし、遷移後URLが /admin/audit-logs であることを主張している。
   */
  test('管理メニューから監査ログ画面に遷移できる', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // 管理メニューを開いて監査ログをクリック
    await page.getByRole('button', { name: '管理メニュー' }).click();
    await page.getByTestId('admin-menu-audit-logs').click();

    // 監査ログ画面に遷移することを確認
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
  });

  /**
   * @requirement user-authentication/REQ-28.41: ログアウトボタンクリックでログアウトしログイン画面へ遷移する
   *
   * 判定根拠: ユーザーメニューの user-menu-logout を実際にクリックし、
   * 遷移後URLが /login であることを主張している。ログイン画面へ戻らなくなれば赤になる。
   */
  test('ユーザーメニューからログアウトできる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてログアウトをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-logout').click();

    // ログイン画面に遷移することを確認
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * 無タグとする（Task 115.177）。従来ここは REQ-28.27 を掲げていたが、
   * REQ-28.27 の契機は「ダッシュボードのプロフィールリンクがクリックされる」であり、
   * 見出し「ダッシュボードからの遷移」の下でREQ-28.26のクイックアクセスリンクと対を成す。
   * 一方この検証が押すのは共通ヘッダーのユーザーメニュー項目 user-menu-profile であり、
   * ダッシュボード本体のクイックアクセスリンク quick-link-profile を一度も通らない。
   * quick-link-profile の遷移が壊れてもこの検証は緑のままであるため主張しない。
   * 本基準はダッシュボードのリンクを押す e2e/specs/auth/navigation.spec.ts 側で判定している。
   * なおヘッダーのユーザーメニューにプロフィール項目が含まれること自体はREQ-28.22で判定済みである。
   */
  test('ユーザーメニューからプロフィール画面に遷移できる', async ({ page }) => {
    await loginAsRegularUser(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // ユーザーメニューを開いてプロフィールをクリック
    const userMenuButton = page
      .locator('nav[role="navigation"] button[aria-haspopup="menu"]')
      .first();
    await userMenuButton.click();
    await page.getByTestId('user-menu-profile').click();

    // プロフィール画面に遷移することを確認
    await expect(page).toHaveURL(/\/profile/);
  });

  /**
   * @requirement user-authentication/REQ-28.26: ダッシュボード画面に主要機能へのクイックアクセスリンクを提供する
   *
   * 判定根拠: ダッシュボード上で quick-link-profile / quick-link-sessions / quick-link-2fa と
   * 管理者向けリンクの可視を個別に主張しており、クイックアクセスが失われれば赤になる。
   */
  test('ダッシュボード画面にクイックアクセスリンクが表示される', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/);

    // クイックアクセスリンクが表示されていることを確認
    await expect(page.getByTestId('quick-link-profile')).toBeVisible();
    await expect(page.getByTestId('quick-link-sessions')).toBeVisible();
    await expect(page.getByTestId('quick-link-2fa')).toBeVisible();

    // 管理者には管理機能リンクも表示される
    await expect(page.getByTestId('quick-link-admin-users')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-invitations')).toBeVisible();
    await expect(page.getByTestId('quick-link-admin-audit')).toBeVisible();
  });

  /**
   * 共通ヘッダーのモバイル幅の表示（Task 39.1）
   *
   * 経緯: 是正前は、ヘッダーに並ぶ項目（ロゴ・四つのリンク・管理メニュー・ユーザーメニュー）の
   * 幅の合計が画面幅を超え、文書全体が水平にスクロールしていた（test 環境の実ブラウザで実測。
   * 管理者は 320 幅で documentElement の scrollWidth 400 / clientWidth 320、375 幅で 400 / 375、
   * 一般ユーザーは 320 幅で 350 / 320）。右へはみ出していたのはユーザーメニューである。
   *
   * ヘッダーのリンクと管理メニューのボタンは、名前でなく href と構造で指す。
   * モバイル幅（768px 以下）ではリンクと管理メニューの文言が display: none になり、
   * アクセシブルネームを持たない（375 幅の実測で getByRole('link', { name: 'ダッシュボード' }) と
   * getByRole('button', { name: '管理メニュー' }) はともに 0 件）ため、名前では指せない。
   * 開いたメニューの項目は文言が表示されるので名前で指す。
   */
  test.describe('モバイル幅の表示', () => {
    /**
     * 表示名を書き換えたテストの後に、テストユーザーの表示名を既定へ戻す
     * 後続のテスト（表示名を突き合わせる検証）への影響を防ぐため、無条件に戻す
     */
    test.afterEach(async () => {
      const prisma = getPrismaClient();
      for (const role of MOBILE_HEADER_ROLES) {
        const user = TEST_USERS[role.userKey];
        await prisma.user.update({
          where: { email: user.email },
          data: { displayName: user.displayName },
        });
      }
    });

    for (const role of MOBILE_HEADER_ROLES) {
      for (const nameCase of MOBILE_DISPLAY_NAME_CASES) {
        for (const width of MOBILE_WIDTHS) {
          /**
           * @requirement user-authentication/REQ-15.1: 全ての画面はレスポンシブデザイン（モバイル: 320px-767px）を実装する
           * @requirement user-authentication/REQ-28.21: 認証済みユーザーが保護された画面にアクセスしたとき共通ヘッダーナビゲーションを表示する
           * @requirement user-authentication/REQ-28.22: 共通ヘッダーナビゲーションはダッシュボード・プロフィール・ログアウトを含む
           *
           * 判定根拠:
           * - REQ-15.1: モバイル幅で、文書全体（documentElement）の scrollWidth と clientWidth の差が
           *   許容誤差 1px 以内であることを、メニューを開いた状態と閉じた状態の双方で主張している。
           *   共通ヘッダーは保護された全画面に出るため、ヘッダーがはみ出せば全画面が水平にスクロールする。
           *   是正前は赤になる（上の経緯の実測値）。本検証が測るのは /dashboard と /profile の文書全体であり、
           *   他の画面の本文のはみ出しは各機能の検証が判定する。
           * - REQ-28.21: 保護画面（/dashboard・/profile）で header[role="banner"] の可視をモバイル幅で主張している。
           * - REQ-28.22: ダッシュボードへのリンクと、ユーザーメニュー展開後の「プロフィール」「ログアウト」が
           *   可視で、画面幅の内側にあり、中心を指して届くことをモバイル幅で主張している。
           *   項目が画面の外へ押し出されるか他の要素に隠れれば赤になる。
           */
          test(`モバイル幅 ${width}px・${role.label}・${nameCase.label}: 共通ヘッダーが文書全体を水平にはみ出させず、リンクとメニューの項目が画面幅の内側にある`, async ({
            page,
          }) => {
            const testUser = TEST_USERS[role.userKey];
            const displayName = nameCase.displayName ?? testUser.displayName;
            if (nameCase.displayName !== null) {
              await getPrismaClient().user.update({
                where: { email: testUser.email },
                data: { displayName: nameCase.displayName },
              });
            }

            await loginAsUser(page, role.userKey);
            await page.setViewportSize({ width, height: 812 });
            await page.goto(nameCase.path);
            await expect(page).toHaveURL(new RegExp(`${nameCase.path}$`));

            // 前提: 共通ヘッダーが表示されている
            const header = page.locator('header[role="banner"]');
            await expect(header).toBeVisible();
            const nav = header.locator('nav[role="navigation"]');
            await expect(nav).toBeVisible();

            // 前提: 測る対象の表示名がヘッダーへ届いている（モバイル幅では非表示だが DOM に在る）
            await expect(header.locator('.app-header-user-name')).toHaveText(displayName);

            // 前提: ヘッダーのリンク（ロゴ・ダッシュボード・プロジェクト・取引先・自社情報）が揃っている
            const logoLink = header.locator('a.app-header-logo[href="/"]');
            const headerLinks = [
              { name: 'ロゴ', locator: logoLink },
              { name: 'ダッシュボード', locator: nav.locator('a[href="/"]') },
              { name: 'プロジェクト', locator: nav.locator('a[href="/projects"]') },
              { name: '取引先', locator: nav.locator('a[href="/trading-partners"]') },
              { name: '自社情報', locator: nav.locator('a[href="/company-info"]') },
            ];
            for (const link of headerLinks) {
              await expect(link.locator, `${link.name}のリンク`).toBeVisible();
            }

            // 前提: ユーザーメニューを開ける
            const menuTriggers = nav.locator('button[aria-haspopup="menu"]');
            await expect(menuTriggers).toHaveCount(role.isAdmin ? 2 : 1);
            const userMenuButton = menuTriggers.last();
            await expect(userMenuButton).toBeVisible();
            await userMenuButton.click();
            const userMenu = header.getByRole('menu');
            await expect(userMenu).toBeVisible();
            const profileItem = userMenu.getByRole('menuitem', { name: 'プロフィール' });
            const logoutItem = userMenu.getByRole('menuitem', { name: 'ログアウト' });
            await expect(profileItem).toBeVisible();
            await expect(logoutItem).toBeVisible();

            // ユーザーメニューを開いた状態で、文書全体が水平にはみ出さず、各項目が画面幅の内側にある
            await expectNoDocumentHorizontalOverflow(page, width, 'ユーザーメニューを開いた状態');
            await expectReachableWithinViewport(userMenu, 'ユーザーメニューのパネル');
            await expectReachableWithinViewport(profileItem, 'ユーザーメニューの「プロフィール」');
            await expectReachableWithinViewport(logoutItem, 'ユーザーメニューの「ログアウト」');

            // メニューを閉じた状態で、文書全体が水平にはみ出さず、リンクとメニューのボタンが画面幅の内側にある
            await page.keyboard.press('Escape');
            await expect(userMenu).toBeHidden();
            await expectNoDocumentHorizontalOverflow(page, width, 'メニューを閉じた状態');
            await expectReachableWithinViewport(header, '共通ヘッダー');
            for (const link of headerLinks) {
              await expectReachableWithinViewport(link.locator, `${link.name}のリンク`);
            }
            await expectReachableWithinViewport(userMenuButton, 'ユーザーメニューのボタン');

            // 管理メニュー: ロールで主張を分岐させず、ユーザーメニューより前に並ぶトリガー（管理メニューの
            // ボタン）を実際の画面から集め、その件数をロールごとの期待値（管理者 1・一般ユーザー 0）で
            // 無条件に主張してから、集めたボタンのそれぞれに無条件に主張する。件数の主張があるため、
            // 管理者でボタンが 1 件も集まらずに以下の主張が空振りすることは無い。
            const adminMenuButtons = (await menuTriggers.all()).slice(0, -1);
            expect(adminMenuButtons, `${role.label}の管理メニューのボタンの数`).toHaveLength(
              role.isAdmin ? 1 : 0
            );
            for (const adminMenuButton of adminMenuButtons) {
              // 管理者: 管理メニューのボタンが画面幅の内側にあり、開いた各項目も内側にある
              await expect(adminMenuButton).toBeVisible();
              await expectReachableWithinViewport(adminMenuButton, '管理メニューのボタン');
              await adminMenuButton.click();
              const adminMenu = header.getByRole('menu');
              await expect(adminMenu).toBeVisible();
              const adminItems = [
                {
                  name: 'ユーザー管理',
                  locator: adminMenu.getByRole('menuitem', { name: 'ユーザー管理' }),
                },
                {
                  name: '招待管理',
                  locator: adminMenu.getByRole('menuitem', { name: '招待管理' }),
                },
                {
                  name: 'ロール管理',
                  locator: adminMenu.getByRole('menuitem', { name: 'ロール管理' }),
                },
                {
                  name: '権限管理',
                  locator: adminMenu.getByRole('menuitem', { name: '権限管理' }),
                },
                {
                  name: '監査ログ',
                  locator: adminMenu.getByRole('menuitem', { name: '監査ログ' }),
                },
              ];
              for (const item of adminItems) {
                await expect(item.locator, `管理メニューの「${item.name}」`).toBeVisible();
              }
              await expectNoDocumentHorizontalOverflow(page, width, '管理メニューを開いた状態');
              await expectReachableWithinViewport(adminMenu, '管理メニューのパネル');
              for (const item of adminItems) {
                await expectReachableWithinViewport(item.locator, `管理メニューの「${item.name}」`);
              }
              await page.keyboard.press('Escape');
              await expect(adminMenu).toBeHidden();
            }
          });
        }
      }
    }
  });

  /**
   * テスト終了後にテストデータを復元
   * 他のテストファイルへの影響を防ぐため
   */
  test.afterAll(async () => {
    console.log('  - Restoring test data after app-header tests...');
    await cleanDatabaseAndRestoreTestData();
    console.log('  ✓ Test data restored successfully');
  });
});
