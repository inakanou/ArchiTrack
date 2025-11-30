import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { seedRoles, seedPermissions, seedRolePermissions } from '../../fixtures/seed-helpers';
import { createAllTestUsers } from '../../fixtures/auth.fixtures';
import { loginAsUser, loginWithCredentials } from '../../helpers/auth-actions';
import { getTimeout, waitForApiResponse } from '../../helpers/wait-helpers';

/**
 * プロフィール管理機能のE2Eテスト
 *
 * @REQ-9 プロフィール管理
 * @REQ-14 プロフィール画面のUI/UX
 */

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

  test('プロフィール画面が正しく表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /プロフィール/i })).toBeVisible();
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByLabel(/表示名/i)).toBeVisible();
    await expect(page.getByText(/ロール/i)).toBeVisible();
  });

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

    // 保存ボタンをクリック
    await saveButton.click();

    // 成功メッセージが表示される
    await expect(page.getByText(/更新しました/i)).toBeVisible({ timeout: getTimeout(15000) });
  });

  test('パスワード変更フォームが表示される', async ({ page }) => {
    await expect(page.locator('input#currentPassword')).toBeVisible();
    await expect(page.locator('input#newPassword')).toBeVisible();
    await expect(page.locator('input#confirmPassword')).toBeVisible();
  });

  // 管理者テストはパスワードを変更しないため、ここで実行可能
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
   */
  test('12文字未満の新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('Short123!'); // 9文字（12文字未満）
    await page.locator('input#confirmPassword').fill('Short123!');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(page.getByText(/パスワードは12文字以上である必要があります/i)).toBeVisible();
  });

  test('大文字を含まない新パスワードではエラーが表示される', async ({ page }) => {
    await page.locator('input#currentPassword').fill('Password123!');
    // ユニークなパスワード: 大文字なし、漏洩DBにない
    await page.locator('input#newPassword').fill('xyzuniqtest1!@');
    await page.locator('input#confirmPassword').fill('xyzuniqtest1!@');
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    await expect(page.getByText(/パスワードは大文字を1文字以上含む必要があります/i)).toBeVisible();
  });

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

  test('パスワードを変更できる', async ({ page }) => {
    // ログイン
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');

    // CI環境での安定性向上のため、ページロード完了を待機
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input#currentPassword')).toBeVisible({ timeout: getTimeout(15000) });

    // パスワードフィールドに入力
    await page.locator('input#currentPassword').fill('Password123!');
    await page.locator('input#newPassword').fill('SecureTest123!@#');
    await page.locator('input#confirmPassword').fill('SecureTest123!@#');

    // パスワード変更ボタンをクリック
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // 確認ダイアログが表示される（タイムアウト追加）
    await expect(page.getByText(/全デバイスからログアウトされます/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // 確認ボタンをクリック
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // 成功メッセージが表示される（タイムアウト追加）
    await expect(page.getByText(/パスワードを変更しました/i)).toBeVisible({
      timeout: getTimeout(15000),
    });

    // Task 22.1: waitForURLでリダイレクト完了を待機（安定性向上）
    // ログインページにリダイレクトされる（UIが自動でリダイレクト）
    await page.waitForURL(/\/login/, { timeout: getTimeout(15000) });
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * 要件7.6-7.7: パスワード履歴検証（過去3回のパスワード再利用防止）
   * WHEN 過去3回に使用したパスワードを設定しようとする
   * THEN エラーメッセージが表示される
   */
  test('過去3回に使用したパスワードは再利用できない', async ({ page }) => {
    // ログイン
    await loginAsUser(page, 'REGULAR_USER');
    await page.goto('/profile');
    // 現在のパスワード: Password123!

    // Have I Been Pwnedの漏洩チェックを回避するため、ユニークなパスワードを使用
    // タイムスタンプベースのサフィックスで一意性を確保
    const uniqueSuffix = Date.now().toString(36);
    const password1 = `Xk9mNp2vQ${uniqueSuffix}A!`;
    const password2 = `Yj8lOq3wR${uniqueSuffix}B!`;
    const password3 = `Zh7kPr4xS${uniqueSuffix}C!`;

    // ヘルパー関数: パスワード変更後の再ログイン処理
    const changePasswordAndLogin = async (currentPwd: string, newPwd: string) => {
      // フォームフィールドが表示されるまで待機
      await expect(page.locator('input#currentPassword')).toBeVisible({
        timeout: getTimeout(10000),
      });

      await page.locator('input#currentPassword').fill(currentPwd);
      await page.locator('input#newPassword').fill(newPwd);
      await page.locator('input#confirmPassword').fill(newPwd);

      // パスワード変更ボタンをクリック
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

      // 成功メッセージまたはログインページへのリダイレクトのいずれかを待つ
      // （成功メッセージは一瞬表示されて消える場合があるため）
      await Promise.race([
        expect(page.getByText(/パスワードを変更しました/i)).toBeVisible({
          timeout: getTimeout(20000),
        }),
        page.waitForURL(/\/login/, { timeout: getTimeout(20000) }),
      ]);

      // ログインページにリダイレクトされるのを待つ（まだリダイレクトされていない場合）
      await page.waitForURL(/\/login/, { timeout: getTimeout(20000) });

      // 新しいパスワードで再ログイン（loginWithCredentialsを使用）
      await loginWithCredentials(page, 'user@example.com', newPwd);

      // プロフィールページに遷移
      await page.goto('/profile');

      // AuthContextの初期化完了を待機
      await page.waitForLoadState('networkidle');

      // プロフィールページが完全にロードされるのを待つ
      await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('user@example.com', {
        timeout: getTimeout(15000),
      });
      await expect(page.locator('input#currentPassword')).toBeVisible({
        timeout: getTimeout(10000),
      });
    };

    // 1回目のパスワード変更
    await changePasswordAndLogin('Password123!', password1);

    // 2回目のパスワード変更
    await changePasswordAndLogin(password1, password2);

    // 3回目のパスワード変更
    await changePasswordAndLogin(password2, password3);

    // 4回目のパスワード変更: 過去のパスワード（password1）を再利用しようとする
    await page.locator('input#currentPassword').fill(password3);
    await page.locator('input#newPassword').fill(password1);
    await page.locator('input#confirmPassword').fill(password1);
    await page.getByRole('button', { name: /パスワードを変更/i }).click();

    // 確認ダイアログが表示されるのを待つ
    await expect(page.getByRole('button', { name: /はい、変更する/i })).toBeVisible({
      timeout: getTimeout(5000),
    });
    await page.getByRole('button', { name: /はい、変更する/i }).click();

    // サーバー側でパスワード履歴チェックが行われ、エラーメッセージが表示される
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
      await expect(page.locator('input#currentPassword')).toBeVisible({
        timeout: getTimeout(10000),
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

      // API応答を待機しながら確認ボタンをクリック
      await waitForApiResponse(
        page,
        async () => {
          await page.getByRole('button', { name: /はい、変更する/i }).click();
        },
        /\/api\/v1\/auth\/password\/change/,
        { timeout: getTimeout(30000) }
      );

      // 成功メッセージまたはログインページへのリダイレクトのいずれかを待つ
      await Promise.race([
        expect(page.getByText(/パスワードを変更しました/i)).toBeVisible({
          timeout: getTimeout(20000),
        }),
        page.waitForURL(/\/login/, { timeout: getTimeout(20000) }),
      ]);

      // ログインページにリダイレクトされるのを待つ
      await page.waitForURL(/\/login/, { timeout: getTimeout(20000) });
      await loginWithCredentials(page, 'user@example.com', newPwd);
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');
      // AuthContextの初期化が完了するまで待機（ユーザー情報の表示を確認）
      await expect(page.getByLabel(/メールアドレス/i)).toHaveValue('user@example.com', {
        timeout: getTimeout(15000),
      });
      await expect(page.locator('input#currentPassword')).toBeVisible({
        timeout: getTimeout(10000),
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
    await expect(page.locator('input#currentPassword')).toBeVisible({
      timeout: getTimeout(10000),
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

    // 成功メッセージまたはログインページへのリダイレクトのいずれかを待つ
    await Promise.race([
      expect(page.getByText(/パスワードを変更しました/i)).toBeVisible({
        timeout: getTimeout(20000),
      }),
      page.waitForURL(/\/login/, { timeout: getTimeout(20000) }),
    ]);
  });
});
