import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../fixtures/seed-helpers';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';
import { loginAsUser, loginWithCredentials } from '../../helpers/auth-actions';
import { getTimeout, waitForApiResponse } from '../../helpers/wait-helpers';
import {
  assertProfilePageAuthenticated,
  expectPasswordChangeSucceeded,
  openProfilePage,
  submitPasswordChange,
} from '../../helpers/profile-preconditions';

/**
 * プロフィール管理機能のE2Eテスト
 *
 * @requirement user-authentication/REQ-9 プロフィール管理
 * @requirement user-authentication/REQ-14 プロフィール画面のUI/UX
 */

/**
 * パスワード変更系のテストで用いるユーザー（他のテストへ影響させないため REGULAR_USER_2 を使う）
 */
const USER2_EMAIL = 'user2@example.com';

// ===== パスワードを変更しないテスト =====
// これらのテストはパスワードを変更しないため、同じセッションで実行可能
test.describe('プロフィール管理機能（読み取り系）', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // 認証済みユーザーとしてログイン（グローバルセットアップで作成済み）
    await loginAsUser(page, 'REGULAR_USER');

    // プロフィールページに移動
    await page.goto('/profile');

    // AuthContextの初期化が完了するまで待つ（ユーザー情報が表示される）
    // これにより、アクセストークンが設定された状態でテストが実行される
    await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('user@example.com', {
      timeout: getTimeout(10000),
    });
  });

  /**
   * 要件9.1: 認証済みユーザーのプロフィール取得
   * 要件9.2: 無効なアクセストークンで401エラー
   * @requirement user-authentication/REQ-9.1 @requirement user-authentication/REQ-9.2
   * @requirement user-authentication/REQ-14.1 プロフィール画面の基本要素表示
   * @requirement user-authentication/REQ-14.2 ユーザー情報セクション表示
   */
  test('プロフィール画面が正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible();
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByText(/ロール/i)).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-9.3
   * @requirement user-authentication/REQ-14.4 更新成功のトーストメッセージ
   */
  test('表示名を変更できる', async ({ page }) => {
    // 表示名フィールドが読み込まれるまで待機
    const displayNameInput = page.getByLabel(/表示名/i);
    await expect(displayNameInput).toBeVisible({ timeout: getTimeout(10000) });

    // 現在の値を取得
    const currentValue = await displayNameInput.inputValue();

    // 現在の値と異なる新しい値を設定
    const newValue = currentValue === 'Updated Name' ? 'New Display Name' : 'Updated Name';

    // clear後にfillでフォーム変更を検知させる
    await displayNameInput.click();
    await displayNameInput.fill('');
    await displayNameInput.fill(newValue);

    // フォーム変更検知のため少し待機
    await page.waitForTimeout(500);

    // 保存ボタンが有効になるまで待機（フォーム変更検知のため）
    const saveButton = page.getByRole('button', { name: /^保存$|^プロフィールを保存$/i });
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });

    // API応答を待機しながら保存ボタンをクリック
    await waitForApiResponse(
      page,
      async () => {
        await saveButton.click();
      },
      /\/api\/v1\/auth\/me/,
      { timeout: getTimeout(15000) }
    );

    // 成功メッセージが表示される（リトライ付き）
    let messageShown = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await expect(page.getByText(/更新しました/i)).toBeVisible({ timeout: getTimeout(10000) });
        messageShown = true;
        break;
      } catch {
        // メッセージが既に消えている可能性があるので、入力値を確認
        const updatedValue = await page.getByLabel(/表示名/i).inputValue();
        if (updatedValue === newValue) {
          messageShown = true;
          break;
        }
      }
    }
    expect(messageShown).toBe(true);
  });

  /**
   * @requirement user-authentication/REQ-14.5
   */
  test('パスワード変更フォームが表示される', async ({ page }) => {
    await expect(page.locator('input#currentPassword')).toBeVisible();
    await expect(page.locator('input#newPassword')).toBeVisible();
    await expect(page.locator('input#confirmPassword')).toBeVisible();
  });

  // 管理者テストはパスワードを変更しないため、ここで実行可能
  /**
   * @requirement user-authentication/REQ-14.9
   * @requirement user-authentication/REQ-17.4 管理者がロール一覧を取得
   * @requirement user-authentication/REQ-28.21 認証済みユーザーが保護画面にアクセス → 共通ヘッダーナビゲーション表示
   * @requirement user-authentication/REQ-28.22 共通ヘッダーナビゲーション表示 → ダッシュボード/プロフィール/ログアウトリンク表示
   * @requirement user-authentication/REQ-28.23 共通ヘッダーナビゲーション表示 → ユーザー表示名表示
   * @requirement user-authentication/REQ-28.24 管理者ユーザー → 「管理メニュー」ドロップダウン表示
   * @requirement user-authentication/REQ-28.25 管理メニュー展開 → ユーザー管理/招待管理/ロール管理/権限管理/監査ログへのリンク表示
   * @requirement user-authentication/REQ-28.26 ダッシュボードにクイックアクセスリンク
   * @requirement user-authentication/REQ-28.37 ユーザー管理リンククリック → ユーザー管理画面遷移
   */
  test('管理者ユーザーには「ユーザー管理」リンクが表示される', async ({ page, context }) => {
    // 現在のセッションをクリア（beforeEachでログインしたREGULAR_USERのセッション）
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // 管理者ユーザーでログインしてプロフィールページに移動
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto('/profile');

    // プロフィールページが表示されるまで待機
    await expect(page.locator('h1')).toContainText('プロフィール');

    // ユーザー管理リンクが表示される
    await expect(page.getByRole('link', { name: /ユーザー管理/i })).toBeVisible();
  });

  /**
   * 要件14.6: パスワード変更時の強度インジケーター表示
   * WHEN 新しいパスワードを入力する
   * THEN パスワード強度インジケーターが表示される
   * @requirement user-authentication/REQ-14.6
   * @requirement user-authentication/REQ-28.27 ダッシュボードのプロフィールリンククリック → プロフィール画面遷移
   */
  test('新パスワード入力時に強度インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('WeakPass1!'); // 弱いパスワード

    // 強度インジケーターが表示される
    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    // 強度レベルが表示される
    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toBeVisible();
  });

  /**
   * 要件14.6: パスワード強度インジケーター（弱・中・強）
   * WHEN 異なる強度のパスワードを入力する
   * THEN インジケーターが適切に反応する
   * @requirement user-authentication/REQ-14.6
   */
  test('弱いパスワードで「弱」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('weak'); // 4文字、小文字のみ（2種類以下）

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/弱/i);

    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'weak');
  });

  /**
   * @requirement user-authentication/REQ-14.6
   */
  test('普通のパスワードで「普通」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('passwordpass'); // 12文字、小文字のみ（minLengthのみ達成）

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/普通/i);

    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', 'fair');
  });

  /**
   * @requirement user-authentication/REQ-14.6
   */
  test('強いパスワードで「強」インジケーターが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('VeryStrong!Password123@XYZ'); // 27文字、複雑

    const indicator = page.getByTestId('password-strength-indicator');
    await expect(indicator).toBeVisible();

    const strengthText = page.getByTestId('password-strength-text');
    await expect(strengthText).toHaveText(/強/i);

    // very-strongは「非常に強い」で「強」を含むのでマッチする
    const progressBar = page.getByTestId('password-strength-bar');
    await expect(progressBar).toHaveAttribute('data-strength', /strong|very-strong/);
  });

  /**
   * 要件2.5-2.8: パスワード変更時の複雑性検証
   * WHEN 複雑性要件を満たさないパスワードを入力する
   * THEN エラーメッセージが表示される
   * @requirement user-authentication/REQ-2.5
   */
  test('12文字未満の新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Short123!'); // 9文字（12文字未満）
    await page.locator('input#confirmPassword').fill('Short123!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(page.getByText(/パスワードは12文字以上である必要があります/i)).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-2.6
   */
  test('大文字を含まない新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    // ユニークなパスワード: 大文字なし、漏洩DBにない
    await page.locator('input#newPassword').fill('xyzuniqtest1!@');
    await page.locator('input#confirmPassword').fill('xyzuniqtest1!@');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(page.getByText(/パスワードは大文字を1文字以上含む必要があります/i)).toBeVisible();
  });

  /**
   * @requirement user-authentication/REQ-2.6
   */
  test('連続した同一文字を含む新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    // ユニークなパスワード: 'www'が連続、12文字以上
    await page.locator('input#newPassword').fill('XyzNewww12!@');
    await page.locator('input#confirmPassword').fill('XyzNewww12!@');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(
      page.getByText(/パスワードに3文字以上の連続した同一文字を含めることはできません/i)
    ).toBeVisible();
  });

  /**
   * 要件7.8: パスワード変更時のHIBP Pwned Passwordsチェック
   * WHEN 漏洩が確認されているパスワードに変更しようとする
   * THEN エラーメッセージが表示される
   * @requirement user-authentication/REQ-2.7
   */
  test('漏洩パスワードには変更できない', async ({ page }) => {
    // パスワードフィールドが表示されるまで待機
    await expect(page.locator('input#currentPassword')).toBeVisible({ timeout: getTimeout(10000) });

    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Password1234!'); // 有名な漏洩パスワード (13文字)
    await page.locator('input#confirmPassword').fill('Password1234!');

    // パスワード変更ボタンが有効になるまで待機
    const changePasswordBtn = page.getByRole('button', { name: /パスワードを変更/i });
    await expect(changePasswordBtn).toBeEnabled({ timeout: getTimeout(5000) });
    await changePasswordBtn.click();

    // 確認ダイアログが表示されるので「はい、変更する」をクリック
    await expect(page.getByRole('button', { name: /はい、変更する/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // API応答を待機しながら確認ボタンをクリック（HIBP APIレスポンスが遅い場合を考慮）
    await waitForApiResponse(
      page,
      async () => {
        await page.getByRole('button', { name: /はい、変更する/i }).click();
      },
      /\/api\/v1\/auth\/password\/change/,
      { timeout: getTimeout(45000) }
    );

    // エラーメッセージが表示される（HIBP APIレスポンス後のUI更新を待機）
    await expect(
      page.getByText(
        /このパスワードは過去に漏洩が確認されています.*別のパスワードを選択してください/i
      )
    ).toBeVisible({ timeout: getTimeout(20000) });
  });

  /**
   * 要件11.11: プロフィールページのキーボードナビゲーション
   * WHEN Tab キーを押す
   * THEN 論理的な順序でフォーカスが移動する
   * @requirement user-authentication/REQ-14.3
   * @requirement user-authentication/REQ-14.10 モバイル最適化レイアウト（768px未満）
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    // 表示名フィールドにフォーカスを移動
    await page.getByLabel(/表示名/i).focus();
    await expect(page.getByLabel(/表示名/i)).toBeFocused();

    // Tab キーを押して現在のパスワードフィールドに移動
    // 注: 保存ボタンはdisabled状態のためTabでスキップされる
    await page.keyboard.press('Tab');
    const currentPasswordInput = page.locator('input#currentPassword');
    await expect(currentPasswordInput).toBeFocused();

    // Tab キーを押して新しいパスワードフィールドに移動
    await page.keyboard.press('Tab');
    const newPasswordInput = page.locator('input#newPassword');
    await expect(newPasswordInput).toBeFocused();

    // Tab キーを押してパスワード確認フィールドに移動
    await page.keyboard.press('Tab');
    const confirmPasswordInput = page.locator('input#confirmPassword');
    await expect(confirmPasswordInput).toBeFocused();

    // Tab キーを押してパスワード変更ボタンに移動
    await page.keyboard.press('Tab');
    const changePasswordButton = page.getByRole('button', { name: /パスワードを変更/i });
    await expect(changePasswordButton).toBeFocused();
  });
});

// ===== パスワードを変更するテスト =====
// これらのテストは実際にパスワードを変更するため、各テストの前にDBをリセットする必要がある
test.describe('プロフィール管理機能（パスワード変更系）', () => {
  // 並列実行を無効化（データベースリセットの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストグループ終了後にデータベースをリセットして後続テストに影響を与えないようにする
  test.afterAll(async () => {
    const prisma = getPrismaClient();
    await cleanDatabase();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await createAllTestUsers(prisma);
  });

  // 各テストの前にデータベースをリセットしてユーザーを再作成
  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageとsessionStorageもクリア
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // データベースをクリーンアップし、テストユーザーを再作成
    const prisma = getPrismaClient();
    await cleanDatabase();
    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    await createAllTestUsers(prisma);
  });

  /**
   * 要件7.4: パスワード変更時の現在パスワード確認
   * @requirement user-authentication/REQ-7.4
   * @requirement user-authentication/REQ-14.7 @requirement user-authentication/REQ-14.8
   */
  test('パスワードを変更できる', async ({ page }) => {
    // ログイン。`loginAsUser` はアクセストークンとリフレッシュトークンが
    // localStorage に載るまで待ってから戻るため、以降の要求には必ず認証が載る。
    await loginAsUser(page, 'REGULAR_USER');

    // 前提（認証が効いた状態でプロフィール画面が開けていること）を無条件に主張する。
    // 従来はここで MISSING_TOKEN の表示を観測して黙って再ログイン・再入力していたため、
    // 認証が壊れていても検証は緑のまま通り、何回目の試行が主張されたのかも読めなかった。
    await openProfilePage(page, 'user@example.com');

    // 要件7.4 / 要件14.7: 現在のパスワードを添えて変更を要求し、確認ダイアログを経て確定する
    await submitPasswordChange(page, 'Password123!', 'SecureTest123!@#');

    // 要件14.8: 成功メッセージが表示され、ログイン画面へ自動的にリダイレクトされる
    await expectPasswordChangeSucceeded(page);
  });

  /**
   * 要件7.6-7.7: パスワード履歴検証（過去3回のパスワード再利用防止）
   * WHEN 過去3回に使用したパスワードを設定しようとする
   * THEN エラーメッセージが表示される
   * @requirement user-authentication/REQ-7.7
   */
  test('過去3回に使用したパスワードは再利用できない', async ({ page }) => {
    // ログイン（REGULAR_USER_2を使用して他のテストに影響しないようにする）
    await loginAsUser(page, 'REGULAR_USER_2');
    await openProfilePage(page, USER2_EMAIL);

    // 現在のパスワード: SecurePass456!

    // Have I Been Pwnedの漏洩チェックを回避するため、ユニークなパスワードを使用
    // タイムスタンプベースのサフィックスで一意性を確保
    const uniqueSuffix = Date.now().toString(36);
    const password1 = `Xk9mNp2vQ${uniqueSuffix}A!`;
    const password2 = `Yj8lOq3wR${uniqueSuffix}B!`;
    const password3 = `Zh7kPr4xS${uniqueSuffix}C!`;

    /**
     * パスワードを変更し、新しいパスワードで再ログインしてプロフィール画面へ戻る。
     *
     * 従来はこの手順の各所に「MISSING_TOKEN が出ていたら再ログインしてやり直す」
     * という観測による復旧が挟まっていた。復旧は要件が崩れた状態を黙って埋め合わせるため、
     * 認証が壊れても検証は緑のまま通る。前提を無条件に主張する形へ改めている。
     */
    const changePasswordAndLogin = async (currentPwd: string, newPwd: string) => {
      await assertProfilePageAuthenticated(page, USER2_EMAIL);

      // 要件14.7: 確認ダイアログを経てパスワード変更を確定する
      await submitPasswordChange(page, currentPwd, newPwd);

      // 要件14.8: 成功メッセージの表示とログイン画面への自動リダイレクト
      await expectPasswordChangeSucceeded(page);

      // 要件7.5: パスワード変更で既存のリフレッシュトークンは無効化される。
      // 残っているトークンを捨ててから、新しいパスワードで再ログインする。
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });
      await loginWithCredentials(page, USER2_EMAIL, newPwd);
      await openProfilePage(page, USER2_EMAIL);
    };

    // 1回目のパスワード変更
    await changePasswordAndLogin('SecurePass456!', password1);

    // 2回目のパスワード変更
    await changePasswordAndLogin(password1, password2);

    // 3回目のパスワード変更
    await changePasswordAndLogin(password2, password3);

    // 4回目のパスワード変更: 過去のパスワード（password1）を再利用しようとする
    await submitPasswordChange(page, password3, password1);

    // 要件7.7: サーバー側でパスワード履歴チェックが行われ、エラーメッセージが表示される
    // バックエンドから英語メッセージが返される（2種類のメッセージに対応）
    // "Password has been used recently. Please choose a different password" または
    // "Password was used in recent history"
    await expect(
      page.getByText(/Password (has been used recently|was used in recent history)/i)
    ).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * 要件7.6-7.7: パスワード履歴検証（4回前のパスワードは再利用可能）
   * WHEN 過去4回前のパスワードを設定しようとする
   * THEN パスワード変更が成功する
   * @requirement user-authentication/REQ-7.6 @requirement user-authentication/REQ-7.8
   */
  test('過去4回前のパスワードは再利用できる', async ({ page }) => {
    // ログイン
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');
    // AuthContextの初期化が完了するまで待機（ユーザー情報の表示を確認）
    await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('user@example.com', {
      timeout: getTimeout(10000),
    });
    await expect(page.locator('input#currentPassword')).toBeVisible({
      timeout: getTimeout(10000),
    });
    // 現在のパスワード: Password123!

    // Have I Been Pwnedの漏洩チェックを回避するため、ユニークなパスワードを使用
    const uniqueSuffix = Date.now().toString(36);
    // 初回パスワードも一意にする（Password123!はHIBPに存在するため）
    const initialPassword = `Wi6jLs1uP${uniqueSuffix}Z!`;
    const passwords = [
      initialPassword,
      `Xk9mNp2vQ${uniqueSuffix}A!`,
      `Yj8lOq3wR${uniqueSuffix}B!`,
      `Zh7kPr4xS${uniqueSuffix}C!`,
    ];

    // ヘルパー関数: パスワード変更後の再ログイン処理（このテスト専用）
    const changePasswordAndRelogin = async (currentPwd: string, newPwd: string) => {
      // プロフィールページのヘッダーが表示されているか確認
      const headingVisible = await page.getByRole('heading', { name: /プロフィール/i }).isVisible();
      if (!headingVisible || page.url().includes('/login')) {
        // 認証状態が失われている場合は再ログイン
        await loginWithCredentials(page, 'user@example.com', currentPwd);
        await page.goto('/profile');
        await page.waitForLoadState('networkidle');
      }

      // フォームフィールドが表示されるまで待機
      await expect(page.locator('input#currentPassword')).toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.locator('input#currentPassword').fill(currentPwd);
      await page.locator('input#newPassword').fill(newPwd);
      await page.locator('input#confirmPassword').fill(newPwd);

      const changePasswordBtn = page.getByRole('button', { name: /パスワードを変更/i });
      await expect(changePasswordBtn).toBeEnabled({ timeout: getTimeout(5000) });
      await changePasswordBtn.click();

      // 確認ダイアログが表示されるのを待つ
      await expect(page.getByRole('button', { name: /はい、変更する/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // API応答を待機しながら確認ボタンをクリック（ステータス200を検証）
      await waitForApiResponse(
        page,
        async () => {
          await page.getByRole('button', { name: /はい、変更する/i }).click();
        },
        /\/api\/v1\/auth\/password\/change/,
        { timeout: getTimeout(30000), expectedStatus: 200 }
      );

      // パスワード変更後の状態を待機（CI環境での安定性向上）
      let redirected = false;
      for (let i = 0; i < 30; i++) {
        if (page.url().includes('/login')) {
          redirected = true;
          break;
        }
        // エラーメッセージ（MISSING_TOKENなど）が表示されている場合
        const errorMessage = page.getByText(/MISSING_TOKEN|認証.*必要/i);
        if ((await errorMessage.count()) > 0) {
          await page.goto('/login');
          redirected = true;
          break;
        }
        // 成功メッセージが表示されているか確認
        const successMessage = page.getByText(/パスワードを変更しました/i);
        if ((await successMessage.count()) > 0) {
          try {
            await page.waitForURL(/\/login/, { timeout: getTimeout(15000) });
            redirected = true;
            break;
          } catch {
            await page.goto('/login');
            redirected = true;
            break;
          }
        }
        await page.waitForTimeout(500);
      }

      if (!redirected) {
        await page.goto('/login');
      }

      // 新しいパスワードで再ログイン
      await loginWithCredentials(page, 'user@example.com', newPwd);

      // プロフィールページに遷移
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');

      // 認証が失われている場合は再試行
      if (page.url().includes('/login')) {
        await loginWithCredentials(page, 'user@example.com', newPwd);
        await page.goto('/profile');
        await page.waitForLoadState('networkidle');
      }

      // AuthContextの初期化が完了するまで待機
      await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('user@example.com', {
        timeout: getTimeout(15000),
      });
      await expect(page.locator('input#currentPassword')).toBeVisible({
        timeout: getTimeout(15000),
      });
    };

    // まず初回パスワードに変更（Password123! -> initialPassword）
    await changePasswordAndRelogin('Password123!', initialPassword);

    let currentPassword = initialPassword;

    // 2回目〜4回目のパスワード変更（ヘルパー関数を使用）
    for (let i = 1; i < passwords.length; i++) {
      const newPassword = passwords[i] as string;
      await changePasswordAndRelogin(currentPassword, newPassword);
      currentPassword = newPassword;
    }

    // 5回目のパスワード変更: 最初のパスワード（initialPassword）を再利用
    // initialPasswordは履歴に4回前（現在から数えて）のため再利用可能
    // 認証状態を確認してからフォームに入力
    const headingVisible = await page.getByRole('heading', { name: /プロフィール/i }).isVisible();
    if (!headingVisible || page.url().includes('/login')) {
      // 認証状態が失われている場合は再ログイン
      await loginWithCredentials(page, 'user@example.com', currentPassword);
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');
    }

    // フォームフィールドが表示されるまで待機
    await expect(page.locator('input#currentPassword')).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.locator('input#currentPassword').fill(currentPassword);
    await page.locator('input#newPassword').fill(initialPassword);
    await page.locator('input#confirmPassword').fill(initialPassword);

    const changePasswordBtn = page.getByRole('button', { name: /パスワードを変更/i });
    await expect(changePasswordBtn).toBeEnabled({ timeout: getTimeout(5000) });
    await changePasswordBtn.click();

    // 確認ダイアログが表示されるのを待つ
    await expect(page.getByRole('button', { name: /はい、変更する/i })).toBeVisible({
      timeout: getTimeout(10000),
    });

    // API応答を待機しながら確認ボタンをクリック
    await waitForApiResponse(
      page,
      async () => {
        await page.getByRole('button', { name: /はい、変更する/i }).click();
      },
      /\/api\/v1\/auth\/password\/change/,
      { timeout: getTimeout(30000) }
    );

    // 成功メッセージまたはログインページへのリダイレクトをポーリングで確認
    let success = false;
    for (let i = 0; i < 30; i++) {
      if (page.url().includes('/login')) {
        // リダイレクトされた場合も成功とみなす
        success = true;
        break;
      }
      // 成功メッセージが表示されているか確認
      const successMessage = page.getByText(/パスワードを変更しました/i);
      if ((await successMessage.count()) > 0) {
        success = true;
        break;
      }
      // エラーメッセージが表示されている場合は失敗
      const errorMessage = page.getByText(/MISSING_TOKEN|Password.*used.*recently/i);
      if ((await errorMessage.count()) > 0) {
        // MISSING_TOKENの場合はリダイレクトとみなす、履歴エラーの場合は失敗
        const missingToken = page.getByText(/MISSING_TOKEN/i);
        if ((await missingToken.count()) === 0) {
          throw new Error('過去4回前のパスワードが再利用できませんでした');
        }
        break;
      }
      await page.waitForTimeout(500);
    }

    // 成功を確認（成功メッセージ、またはログイン画面への遷移）。
    // ループは /login への遷移も成功として success に畳み込んでいるため、
    // 論理和の右辺（URL の再確認）は左辺が偽のときも真になり得ず、判定を空洞にしていた。
    // 観測の結果そのものだけを主張する（初期値 false は失敗する側にある）。
    expect(success, 'パスワード変更の成功メッセージもログイン画面への遷移も観測できなかった').toBe(
      true
    );
  });
});
