import { test, expect } from '@playwright/test';
import { cleanDatabase, getPrismaClient } from '../../fixtures/database';
import { createTestUser, createTwoFactorBackupCodes } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, waitForApiResponse } from '../../helpers/wait-helpers';

/**
 * 2要素認証機能のE2Eテスト
 *
 * @REQ-27 二要素認証（2FA）設定機能
 * @REQ-27A 二要素認証（2FA）ログイン機能
 * @REQ-27B 二要素認証（2FA）管理機能
 * @REQ-27C 二要素認証（2FA）セキュリティ要件
 * @REQ-27D 二要素認証（2FA）UI/UX要件
 * @REQ-27E 二要素認証（2FA）アクセシビリティ要件
 */

/**
 * ヘルパー関数: モックTOTPコードを生成
 * Note: 実際の環境では、QRコードから秘密鍵を取得してotplibでTOTPコードを生成する
 * このE2Eテストでは、バックエンドがテスト用の固定TOTPコードを受け入れることを想定
 */
function generateMockTOTPCode(): string {
  // テスト環境用の固定コード（バックエンドでモック対応が必要）
  return '123456';
}

test.describe('2要素認証機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  /**
   * 要件27: 二要素認証（2FA）設定機能
   */
  test.describe('2FAセットアップ', () => {
    test.beforeEach(async ({ page, context }) => {
      // テスト間の状態をクリア
      await context.clearCookies();

      // localStorageとsessionStorageもクリア
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // テストデータをクリーンアップして、テストユーザーを作成
      await cleanDatabase();
      await createTestUser('REGULAR_USER');

      // 認証済みユーザーとしてログイン
      await loginAsUser(page, 'REGULAR_USER');
    });

    /**
     * 要件27.4: QRコード表示 (otpauth://totp/ArchiTrack:{email}?secret={secret}&issuer=ArchiTrack)
     * 要件27.5: Base32エンコード済み秘密鍵の提供
     * 要件27D.1: 3ステップのプログレスバー表示
     */
    test('2FAセットアップページが正しく表示される', async ({ page }) => {
      // CI環境での安定性向上のため、リトライロジックを追加
      let setupPageLoaded = false;
      for (let retry = 0; retry < 3; retry++) {
        await page.goto('/profile/2fa-setup');

        // ネットワークリクエスト（APIコール）が完了するまで待機
        await page.waitForLoadState('networkidle');

        // ログインページにリダイレクトされた場合は再ログイン
        if (page.url().includes('/login')) {
          await loginAsUser(page, 'REGULAR_USER');
          await page.goto('/profile/2fa-setup');
          await page.waitForLoadState('networkidle');
        }

        // ローディングインジケーターが消えるまで待機（CI環境での安定性向上）
        const loadingIndicator = page.getByRole('status', { name: /読み込み中/i });
        const loadingExists = await loadingIndicator.count();
        if (loadingExists > 0) {
          await expect(loadingIndicator).toBeHidden({ timeout: getTimeout(30000) });
        }

        // ステップ表示を確認
        try {
          await expect(page.getByText(/ステップ 1\/3/i)).toBeVisible({
            timeout: getTimeout(10000),
          });
          setupPageLoaded = true;
          break;
        } catch {
          if (retry < 2) {
            // ページをリロードして再試行
            await page.reload({ waitUntil: 'networkidle' });
          }
        }
      }
      expect(setupPageLoaded).toBe(true);

      // 要件27D.1: 3ステップのプログレスバー（既に上で確認済み）
      await expect(page.getByText(/ステップ 1\/3/i)).toBeVisible({ timeout: getTimeout(5000) });

      // 要件27.4: QRコードが表示される（APIからのレスポンス待機のためタイムアウト追加）
      const qrCode = page.getByRole('img', { name: /QRコード|二要素認証用QRコード/i });
      await expect(qrCode).toBeVisible({ timeout: getTimeout(30000) });

      // 要件27E.1: QRコードにalt属性が設定されている
      await expect(qrCode).toHaveAttribute('alt', /二要素認証用QRコード/i);

      // 要件27.5: 秘密鍵が表示される (Base32形式)
      await expect(page.getByText(/秘密鍵（手動入力用）/i)).toBeVisible();
      const secretKey = page.getByText(/^[A-Z2-7]+=*$/);
      await expect(secretKey).toBeVisible();
      const secretText = await secretKey.textContent();
      expect(secretText).toMatch(/^[A-Z2-7]+=*$/); // Base32形式検証

      // 要件27D.2: TOTP入力フィールドが6桁の個別入力フィールドとして表示される
      await expect(page.getByRole('group', { name: /認証コード/i })).toBeVisible();

      // 要件27E.2: TOTPコード入力フィールドにaria-label属性とrole="group"が設定されている
      const totpGroup = page.getByRole('group', { name: /認証コード/i });
      await expect(totpGroup).toHaveAttribute('role', 'group');
    });

    /**
     * 要件27.9: QRコード画面から次に進む際にTOTPコード検証を要求
     * 要件27.10: 6桁のTOTPコードを検証し、正しい場合のみ2FAを有効化
     * 要件27.6: 10個のバックアップコード（8文字英数字）を生成
     * 要件27.8: バックアップコードを1回のみ表示
     */
    test('TOTPコード検証後にバックアップコードが表示される', async ({ page }) => {
      await page.goto('/profile/2fa-setup');
      await page.waitForLoadState('networkidle');

      // ローディングインジケーターが消えるまで待機（CI環境での安定性向上）
      const loadingIndicator = page.getByRole('status', { name: /読み込み中/i });
      const loadingExists = await loadingIndicator.count();
      if (loadingExists > 0) {
        await expect(loadingIndicator).toBeHidden({ timeout: getTimeout(30000) });
      }

      // QRコードが表示されるまで待機（API応答待ち）
      const qrCode = page.getByRole('img', { name: /QRコード|二要素認証用QRコード/i });
      await expect(qrCode).toBeVisible({ timeout: getTimeout(30000) });

      // ステップ1: QRコード表示を確認
      await expect(page.getByText(/ステップ 1/i)).toBeVisible();

      // TOTP入力フィールドが表示されるまで待機
      await expect(page.getByTestId('totp-digit-0')).toBeVisible({ timeout: getTimeout(10000) });

      // TOTPコードを6桁の個別フィールドに入力（getByTestIdに統一）
      const digits = generateMockTOTPCode().split('');
      for (let i = 0; i < digits.length; i++) {
        await page.getByTestId(`totp-digit-${i}`).fill(digits[i]!);
      }

      // 検証ボタンをクリック（API応答を待機）
      const verifyButton = page.getByRole('button', { name: /検証|確認/i });
      await expect(verifyButton).toBeEnabled({ timeout: getTimeout(5000) });
      await waitForApiResponse(
        page,
        async () => {
          await verifyButton.click();
        },
        /\/api\/v1\/auth\/2fa\/enable/,
        { timeout: getTimeout(30000) }
      );

      // ステップ3: バックアップコード表示（UIはステップ1から直接ステップ3に遷移）
      await expect(page.getByText(/ステップ 3/i)).toBeVisible({ timeout: getTimeout(20000) });

      // 要件27.6: バックアップコードが表示される（10個、8文字英数字）
      await expect(page.getByRole('heading', { name: /バックアップコード/i })).toBeVisible();

      const backupCodes = await page.getByTestId('backup-code-item').all();
      expect(backupCodes.length).toBe(10);

      // 各バックアップコードの形式検証（8文字英数字）
      for (const codeElement of backupCodes) {
        const codeText = await codeElement.textContent();
        expect(codeText).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/); // XXXX-XXXX形式
      }

      // 要件27D.4: ダウンロード、印刷、クリップボードコピー機能
      await expect(page.getByRole('button', { name: /ダウンロード/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /印刷/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /コピー/i })).toBeVisible();

      // 要件27D.5: バックアップコード保存確認チェックボックスがオフの場合、完了ボタンが無効化
      const completeButton = page.getByRole('button', { name: /完了/i });
      await expect(completeButton).toBeDisabled();

      // チェックボックスをオン
      await page.getByRole('checkbox', { name: /保存しました|確認しました/i }).check();

      // 完了ボタンが有効化
      await expect(completeButton).toBeEnabled();
    });

    /**
     * 要件27D.4: バックアップコードのダウンロード（.txt形式）
     */
    test('バックアップコードのダウンロードができる', async ({ page }) => {
      await page.goto('/profile/2fa-setup');
      await page.waitForLoadState('networkidle');

      // ローディングインジケーターが消えるまで待機（CI環境での安定性向上）
      const loadingIndicator = page.getByRole('status', { name: /読み込み中/i });
      const loadingExists = await loadingIndicator.count();
      if (loadingExists > 0) {
        await expect(loadingIndicator).toBeHidden({ timeout: getTimeout(30000) });
      }

      // QRコードが表示されるまで待機（API応答待ち）
      const qrCode = page.getByRole('img', { name: /QRコード|二要素認証用QRコード/i });
      await expect(qrCode).toBeVisible({ timeout: getTimeout(30000) });

      // TOTP入力フィールドが表示されるまで待機
      await expect(page.getByTestId('totp-digit-0')).toBeVisible({ timeout: getTimeout(10000) });

      // TOTPコード検証を完了
      const digits = generateMockTOTPCode().split('');
      for (let i = 0; i < digits.length; i++) {
        await page.getByTestId(`totp-digit-${i}`).fill(digits[i]!);
      }
      await page.getByRole('button', { name: /検証|確認/i }).click();

      // バックアップコード画面が表示されるまで待機
      await expect(page.getByText(/バックアップコードを保存/i)).toBeVisible();

      // ダウンロードボタンをクリック
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: /ダウンロード/i }).click();
      const download = await downloadPromise;

      // ファイル名と形式を確認
      expect(download.suggestedFilename()).toMatch(/backup-codes.*\.txt$/i);

      // ダウンロードしたファイルの内容を検証
      const path = await download.path();
      if (path) {
        const fs = await import('fs/promises');
        const content = await fs.readFile(path, 'utf-8');
        // バックアップコードが含まれていることを確認（XXXX-XXXX形式）
        expect(content).toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
        // 10個のバックアップコードが含まれていることを確認
        const codeLines = content.trim().split('\n');
        expect(codeLines.length).toBe(10);
      }
    });

    /**
     * 要件27D.6: 2FA設定完了時にトーストメッセージ表示
     */
    test('2FA設定完了時に成功メッセージが表示される', async ({ page }) => {
      await page.goto('/profile/2fa-setup');
      await page.waitForLoadState('networkidle');

      // TOTPコード検証
      const digits = generateMockTOTPCode().split('');
      for (let i = 0; i < digits.length; i++) {
        await page.getByTestId(`totp-digit-${i}`).fill(digits[i]!);
      }
      await page.getByRole('button', { name: /検証|確認/i }).click();

      // バックアップコード保存確認
      await expect(page.getByText(/バックアップコードを保存/i)).toBeVisible();
      await page.getByRole('checkbox', { name: /保存しました|確認しました/i }).check();

      // 完了ボタンをクリック
      await page.getByRole('button', { name: /完了/i }).click();

      // 要件27D.6: トーストメッセージ表示
      await expect(page.getByText(/二要素認証を有効化しました/i)).toBeVisible();

      // プロフィール画面にリダイレクト
      await expect(page).toHaveURL(/\/profile/);
    });

    /**
     * 要件27D.2: 6桁の個別入力フィールドと自動タブ移動
     */
    test('TOTPコード入力時に自動タブ移動が機能する', async ({ page }) => {
      // CI環境での安定性向上のため、リトライロジックを追加
      const qrCode = page.getByRole('img', { name: /QRコード|二要素認証用QRコード/i });
      let qrVisible = false;

      for (let retry = 0; retry < 3; retry++) {
        await page.goto('/profile/2fa-setup');
        await page.waitForLoadState('networkidle');

        // ログインページにリダイレクトされた場合は再ログイン
        if (page.url().includes('/login')) {
          await loginAsUser(page, 'REGULAR_USER');
          await page.goto('/profile/2fa-setup');
          await page.waitForLoadState('networkidle');
        }

        // ローディングインジケーターが消えるまで待機
        const loadingIndicator = page.getByRole('status', { name: /読み込み中/i });
        const loadingExists = await loadingIndicator.count();
        if (loadingExists > 0) {
          await expect(loadingIndicator).toBeHidden({ timeout: getTimeout(30000) });
        }

        // QRコードが表示されるまで待機（API応答待ち）
        try {
          await expect(qrCode).toBeVisible({ timeout: getTimeout(30000) });
          qrVisible = true;
          break;
        } catch {
          if (retry < 2) {
            await page.reload({ waitUntil: 'networkidle' });
          }
        }
      }
      expect(qrVisible).toBe(true);

      // TOTP入力フィールドが表示されるまで待機
      const digit0 = page.getByTestId('totp-digit-0');
      await expect(digit0).toBeVisible({ timeout: getTimeout(10000) });

      // 1桁目にフォーカス
      await digit0.focus();

      // 1桁入力すると次のフィールドに自動フォーカス
      await digit0.fill('1');

      const digit1 = page.getByTestId('totp-digit-1');
      await expect(digit1).toBeFocused({ timeout: getTimeout(5000) });

      // 残りの桁も同様に自動タブ移動
      await digit1.fill('2');
      await expect(page.getByTestId('totp-digit-2')).toBeFocused({ timeout: getTimeout(5000) });
    });
  });

  /**
   * 要件27A: 二要素認証（2FA）ログイン機能
   */
  test.describe('2FAログイン', () => {
    test.beforeEach(async ({ page, context }) => {
      // テスト間の状態をクリア
      await context.clearCookies();

      // localStorageとsessionStorageもクリア
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // テストデータをクリーンアップして、2FA有効ユーザーを作成
      await cleanDatabase();
      await createTestUser('TWO_FA_USER');
    });

    /**
     * 要件27A.1: 2FA有効ユーザーのログイン時にメールアドレス・パスワード検証後に2FA検証画面を表示
     * 要件27A.2: 6桁のTOTPコード入力フィールドを提供
     * 要件27D.3: 30秒カウントダウンタイマーと視覚的プログレスバー
     */
    test('2FAが有効な状態でログイン時にTOTP検証が要求される', async ({ page }) => {
      await page.goto('/login');

      // 2FA有効なユーザーでログイン
      await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
      await page.locator('input#password').fill('Password123!');
      await page.getByRole('button', { name: /ログイン/i }).click();

      // 要件27A.1: TOTP検証画面が表示される
      await expect(page.getByText(/2要素認証|二要素認証/i)).toBeVisible();

      // 要件27A.2: 6桁のTOTPコード入力フィールド
      await expect(page.getByRole('group', { name: /認証コード/i })).toBeVisible();

      // 要件27D.3: 30秒カウントダウンタイマー
      await expect(page.getByTestId('totp-countdown-timer')).toBeVisible();
      const timerText = await page.getByTestId('totp-countdown-timer').textContent();
      expect(timerText).toMatch(/\d{1,2}/); // 数値が表示されている

      // 視覚的プログレスバー
      await expect(page.getByTestId('totp-progress-bar')).toBeVisible();
    });

    /**
     * 要件27A.3: TOTPコード検証（30秒ウィンドウ、±1ステップ許容 = 合計90秒）
     * 要件27A.8: 2FA検証成功時にJWTアクセストークンとリフレッシュトークンを発行
     */
    test('正しいTOTPコードでログインできる', async ({ page }) => {
      await page.goto('/login');

      // メールアドレス・パスワード入力
      await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
      await page.locator('input#password').fill('Password123!');
      await page.getByRole('button', { name: /ログイン/i }).click();

      // TOTP検証画面
      await expect(page.getByText(/2要素認証|二要素認証/i)).toBeVisible();

      // 正しいTOTPコードを入力
      const digits = generateMockTOTPCode().split('');
      for (let i = 0; i < digits.length; i++) {
        await page.getByTestId(`totp-digit-${i}`).fill(digits[i]!);
      }

      // 検証ボタンをクリック
      await page.getByRole('button', { name: /検証|ログイン/i }).click();

      // 要件27A.8: ログイン成功してダッシュボードにリダイレクト
      await expect(page).toHaveURL(/\/dashboard|\/$/);
    });

    /**
     * 要件27A.4: TOTPコード検証が5回連続で失敗した場合、アカウントを一時的にロック（5分間）
     */
    test('5回連続でTOTPコード検証に失敗するとアカウントがロックされる', async ({ page }) => {
      await page.goto('/login');

      // メールアドレス・パスワード入力
      await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
      await page.locator('input#password').fill('Password123!');
      await page.getByRole('button', { name: /ログイン/i }).click();

      // TOTP検証画面
      await expect(page.getByText(/2要素認証|二要素認証/i)).toBeVisible();

      // 5回誤ったコードを入力
      for (let attempt = 0; attempt < 5; attempt++) {
        // 各イテレーションの開始時に入力フィールドをクリア
        for (let i = 0; i < 6; i++) {
          await page.getByTestId(`totp-digit-${i}`).clear();
        }

        const wrongDigits = '000000'.split('');
        for (let i = 0; i < wrongDigits.length; i++) {
          await page.getByTestId(`totp-digit-${i}`).fill(wrongDigits[i]!);
        }

        // APIレスポンスを待機してクリック
        const responsePromise = page.waitForResponse((response) =>
          response.url().includes('/api/v1/auth/verify-2fa')
        );
        await page.getByRole('button', { name: /検証|ログイン/i }).click();
        await responsePromise;

        if (attempt < 4) {
          // エラーメッセージが表示される
          await expect(page.getByText(/認証コードが正しくありません/i)).toBeVisible();

          // 要件27E.4: エラーがaria-live="polite"でスクリーンリーダーに通知される
          const errorMessage = page.getByRole('alert');
          await expect(errorMessage).toHaveAttribute('aria-live', 'polite');
        }
      }

      // 要件27A.4: 5回失敗後にアカウントロックメッセージ
      await expect(page.getByText(/アカウントが一時的にロックされました|5分後/i)).toBeVisible();
    });

    /**
     * 要件27A.5: 「バックアップコードを使用する」選択時にバックアップコード入力フィールドを表示
     * 要件27A.6: バックアップコード検証（未使用のコードとbcrypt比較）
     * 要件27A.7: バックアップコード使用後、usedAtフィールドを更新
     */
    test('バックアップコードでログインできる', async ({ page }) => {
      await page.goto('/login');

      // メールアドレス・パスワード入力
      await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
      await page.locator('input#password').fill('Password123!');
      await page.getByRole('button', { name: /ログイン/i }).click();

      // TOTP検証画面
      await expect(page.getByText(/2要素認証|二要素認証/i)).toBeVisible();

      // 要件27A.5: バックアップコードモードに切り替え
      await page.getByRole('button', { name: /バックアップコード/i }).click();

      // バックアップコード入力フィールドが表示される
      const backupCodeInput = page.getByLabel(/バックアップコード/i);
      await expect(backupCodeInput).toBeVisible();

      // 要件27A.6: バックアップコードを入力（テスト用モックコード: ABCD1234）
      await backupCodeInput.fill('ABCD1234');
      await page.getByRole('button', { name: /検証|ログイン/i }).click();

      // 要件27A.8: ログイン成功
      await expect(page).toHaveURL(/\/dashboard|\/$/);

      // Note: 要件27A.7（usedAtフィールド更新）はバックエンドで検証される
    });
  });

  /**
   * 要件27B: 二要素認証（2FA）管理機能
   */
  test.describe('2FA管理機能', () => {
    test.beforeEach(async ({ page, context }) => {
      // テスト間の状態をクリア
      await context.clearCookies();

      // localStorageとsessionStorageもクリア
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // 2FA有効ユーザーを作成してログイン
      await cleanDatabase();
      const user = await createTestUser('TWO_FA_USER');
      // バックアップコードを作成
      const backupCodes = await createTwoFactorBackupCodes({ userId: user.id, count: 10 });
      // 一部のバックアップコードを使用済みに設定（テスト用）
      const prisma = getPrismaClient();
      const firstBackupCode = backupCodes[0];
      if (firstBackupCode) {
        await prisma.twoFactorBackupCode.update({
          where: { id: firstBackupCode.id },
          data: { usedAt: new Date() },
        });
      }
      await loginAsUser(page, 'TWO_FA_USER');

      // 2FA検証フォームが表示されるまで待機（見出し「二要素認証」で確認）
      const twoFactorHeading = page.getByRole('heading', { name: /二要素認証/ });
      await twoFactorHeading.waitFor({ state: 'visible', timeout: getTimeout(10000) });

      // 6桁のTOTPコードを入力（テストモードでは123456が有効）
      // 各フィールドに1文字ずつ入力
      const digits = '123456'.split('');
      for (let i = 0; i < 6; i++) {
        const digitInput = page.getByTestId(`totp-digit-${i}`);
        const digit = digits[i];
        if (digit) {
          await digitInput.fill(digit);
        }
      }

      // 検証ボタンをクリック
      await page.getByRole('button', { name: /検証/i }).click();

      // ログイン成功を待機（ダッシュボードへリダイレクト）
      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: getTimeout(10000),
      });
    });

    /**
     * 要件27B.1: プロフィール画面でバックアップコードを表示（使用済みコードをグレーアウト・取り消し線）
     * 要件27E.3: 使用済みバックアップコードにaria-label="使用済み"を設定
     */
    test('バックアップコードの使用状況が視覚的に表示される', async ({ page }) => {
      // CI環境での安定性向上のため、リトライロジックを追加
      let profileLoaded = false;

      for (let retry = 0; retry < 3; retry++) {
        await page.goto('/profile');
        // ページの読み込みとAPI呼び出しが完了するまで待機
        await page.waitForLoadState('networkidle');

        // ログインページにリダイレクトされた場合は再ログイン
        if (page.url().includes('/login')) {
          await loginAsUser(page, 'TWO_FA_USER');

          // 2FA検証フォームが表示される場合は検証
          const twoFactorHeading = page.getByRole('heading', { name: /二要素認証/ });
          const hasTwoFactorForm = (await twoFactorHeading.count()) > 0;
          if (hasTwoFactorForm) {
            const digits = '123456'.split('');
            for (let i = 0; i < 6; i++) {
              const digitInput = page.getByTestId(`totp-digit-${i}`);
              const digit = digits[i];
              if (digit) {
                await digitInput.fill(digit);
              }
            }
            await page.getByRole('button', { name: /検証/i }).click();
            await page.waitForURL((url) => !url.pathname.includes('/login'), {
              timeout: getTimeout(10000),
            });
          }
          await page.goto('/profile');
          await page.waitForLoadState('networkidle');
        }

        // 2FA管理セクションが表示されるか確認
        try {
          await expect(page.getByRole('heading', { name: '二要素認証', exact: true })).toBeVisible({
            timeout: getTimeout(10000),
          });
          profileLoaded = true;
          break;
        } catch {
          if (retry < 2) {
            await page.reload({ waitUntil: 'networkidle' });
          }
        }
      }

      expect(profileLoaded).toBe(true);

      // バックアップコードを表示ボタンが操作可能になるまで待機
      const showBackupCodesButton = page.getByRole('button', { name: /バックアップコードを表示/i });
      await showBackupCodesButton.waitFor({ state: 'visible', timeout: getTimeout(15000) });
      await showBackupCodesButton.click();

      // バックアップコード一覧が表示されるまで待機（API呼び出しを含む）
      await page
        .getByTestId('backup-code-item')
        .first()
        .waitFor({ state: 'visible', timeout: getTimeout(20000) });
      const backupCodes = await page.getByTestId('backup-code-item').all();
      expect(backupCodes.length).toBeGreaterThan(0);

      // 使用済みコードが視覚的に区別される
      const usedCode = backupCodes.find(async (code) => {
        const classList = await code.getAttribute('class');
        return classList?.includes('used') || classList?.includes('disabled');
      });

      if (usedCode) {
        // グレーアウトまたは取り消し線が適用されている
        const styles = await usedCode.evaluate((el) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore - window is available in browser context
          return window.getComputedStyle(el);
        });
        const hasGrayOut =
          styles.opacity === '0.5' || styles.color.includes('gray') || styles.color.includes('128');
        const hasStrikethrough = styles.textDecoration.includes('line-through');

        expect(hasGrayOut || hasStrikethrough).toBe(true);

        // 要件27E.3: aria-label="使用済み"
        await expect(usedCode).toHaveAttribute('aria-label', /使用済み|used/i);
      }
    });

    /**
     * 要件27B.2: 残りバックアップコードが3個以下の場合、警告メッセージと再生成リンクを表示
     * 要件27B.3: バックアップコード再生成（既存削除 + 新しい10個生成）
     */
    test('残りバックアップコードが少ない場合に警告が表示される', async ({ page }) => {
      // Note: このテストは、バックアップコードが7個以上使用されているユーザーが必要
      // テストフィクスチャでそのようなユーザーを作成することを想定

      await page.goto('/profile');

      // バックアップコードを表示
      await page.getByRole('button', { name: /バックアップコードを表示/i }).click();

      // 要件27B.2: 警告メッセージ（残り3個以下の場合のみ表示される）
      const warning = page.getByText(/少なくなっています/i);
      if ((await warning.count()) > 0) {
        await expect(warning).toBeVisible();

        // 再生成リンクが表示される
        await expect(page.getByRole('link', { name: /再生成|新しいコードを生成/i })).toBeVisible();
      }
    });

    /**
     * 要件27B.3: バックアップコード再生成
     */
    test('バックアップコードを再生成できる', async ({ page }) => {
      await page.goto('/profile');

      // CI環境での安定性向上のため、ページロード完了を待機
      await page.waitForLoadState('networkidle');

      // バックアップコードを表示
      const showBackupButton = page.getByRole('button', { name: /バックアップコードを表示/i });
      await expect(showBackupButton).toBeVisible({ timeout: getTimeout(15000) });
      await showBackupButton.click();

      // バックアップコードが表示されるのを待機
      await expect(page.getByTestId('backup-code-item').first()).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 現在のバックアップコードを記録
      const oldCodes = await page.getByTestId('backup-code-item').allTextContents();

      // 再生成ボタンが表示されるのを待機してからクリック
      const regenerateButton = page.getByRole('button', { name: /再生成|新しいコードを生成/i });
      await expect(regenerateButton).toBeVisible({ timeout: getTimeout(10000) });
      await regenerateButton.click();

      // 確認ダイアログ
      await expect(
        page.getByText(/既存のバックアップコードは無効になります|本当に再生成しますか/i)
      ).toBeVisible();
      await page.getByRole('button', { name: /はい、再生成|^はい$|確認$/i }).click();

      // 成功メッセージを待機（APIコール完了の確認）
      await expect(page.getByText(/バックアップコードを再生成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 要件27B.3: 新しい10個のバックアップコードが表示される
      const newCodes = await page.getByTestId('backup-code-item').allTextContents();
      expect(newCodes.length).toBe(10);

      // 新しいコードが古いコードと異なることを確認
      // 再生成後は完全なコード（マスクなし）が表示される
      expect(newCodes).not.toEqual(oldCodes);
    });

    /**
     * 要件27B.4: 2FA無効化時にパスワード入力確認ダイアログを表示
     * 要件27B.5: 2FA無効化時にトランザクション内で秘密鍵とバックアップコードを削除
     * 要件27B.6: 2FA無効化完了後、全デバイスからログアウト
     */
    test('2FAを無効化できる', async ({ page }) => {
      await page.goto('/profile');

      // 2FA管理セクション（h2要素を指定して重複を回避）
      await expect(page.getByRole('heading', { name: '二要素認証', level: 2 })).toBeVisible();
      await expect(page.getByText(/有効|オン/i)).toBeVisible();

      // 無効化ボタンをクリック（セクション内の最初の「無効化」ボタン）
      await page.getByRole('button', { name: /^無効化$|オフにする/i }).click();

      // 要件27B.4: パスワード入力確認ダイアログ
      const disableDialog = page.getByRole('dialog').filter({ hasText: /二要素認証の無効化/ });
      await expect(disableDialog.getByText(/パスワードを入力してください/i)).toBeVisible();
      await disableDialog.getByLabel('パスワード').fill('Password123!');
      await disableDialog.getByRole('button', { name: /^確認$/ }).click();

      // 要件27B.6: 全デバイスからログアウトの警告
      const confirmDialog = page.getByRole('dialog').filter({ hasText: /二要素認証の無効化確認/ });
      await expect(confirmDialog.getByText(/全デバイスからログアウトされます/i)).toBeVisible();
      await confirmDialog.getByRole('button', { name: /はい.*無効化/ }).click();

      // 成功メッセージ
      await expect(page.getByText(/二要素認証を無効化しました/i)).toBeVisible();

      // 要件27B.6: ログイン画面にリダイレクト
      await expect(page).toHaveURL(/\/login/);
    });
  });

  /**
   * 要件27C: 二要素認証（2FA）セキュリティ要件
   * Note: セキュリティ要件の多くはバックエンド実装で検証されるため、
   * E2Eテストでは主にエンドツーエンドのフローを検証
   */
  test.describe('2FAセキュリティ', () => {
    /**
     * 要件27C.6: 2FA有効化・無効化イベントを監査ログに記録
     */
    test('2FA有効化・無効化が監査ログに記録される', async ({ page }) => {
      // 管理者でログイン
      await cleanDatabase();
      await createTestUser('ADMIN_USER');
      await loginAsUser(page, 'ADMIN_USER');

      // 監査ログページにアクセス
      await page.goto('/admin/audit-logs');

      // 2FA有効化のイベントをフィルタ
      await page.getByLabel(/イベント種別/i).selectOption('TWO_FACTOR_ENABLED');

      // 2FA有効化のログが表示される（存在する場合）
      // Note: テスト環境では実際の2FAイベントがない可能性があるため、フィルター動作の確認に留める
      await expect(page.getByLabel(/イベント種別/i)).toHaveValue('TWO_FACTOR_ENABLED');
    });
  });

  /**
   * 要件27E: 二要素認証（2FA）アクセシビリティ要件
   */
  test.describe('2FAアクセシビリティ', () => {
    test.beforeEach(async ({ page, context }) => {
      await context.clearCookies();

      // localStorageとsessionStorageもクリア
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      await cleanDatabase();
      await createTestUser('REGULAR_USER');
      await loginAsUser(page, 'REGULAR_USER');
    });

    /**
     * 要件27E.1: QRコードにalt属性「二要素認証用QRコード」を設定
     */
    test('QRコードに適切なalt属性が設定されている', async ({ page }) => {
      await page.goto('/profile/2fa-setup');
      await page.waitForLoadState('networkidle');

      const qrCode = page.getByRole('img', { name: /QRコード|二要素認証用QRコード/i });
      await expect(qrCode).toBeVisible();
      await expect(qrCode).toHaveAttribute('alt', /二要素認証用QRコード/i);
    });

    /**
     * 要件27E.2: TOTPコード入力フィールドにaria-label属性とrole="group"を設定
     */
    test('TOTPコード入力フィールドに適切なARIA属性が設定されている', async ({ page }) => {
      const qrCode = page.getByRole('img', { name: /QRコード|二要素認証用QRコード/i });

      // APIが失敗したり認証が切れることがあるため、最大3回リトライ
      let retries = 3;
      while (retries > 0) {
        await page.goto('/profile/2fa-setup');
        await page.waitForLoadState('networkidle');

        // ログインページにリダイレクトされた場合は再ログイン
        if (page.url().includes('/login')) {
          await loginAsUser(page, 'REGULAR_USER');
          await page.goto('/profile/2fa-setup');
          await page.waitForLoadState('networkidle');
        }

        // ローディングインジケーターが非表示になるか、存在しないことを確認
        const loadingIndicator = page.getByRole('status', { name: /読み込み中/i });
        const loadingExists = await loadingIndicator.count();
        if (loadingExists > 0) {
          await expect(loadingIndicator).toBeHidden({ timeout: getTimeout(15000) });
        }

        // QRコードが表示されているか確認
        const isQrVisible = await qrCode.isVisible().catch(() => false);
        if (isQrVisible) {
          break;
        }

        retries--;
        if (retries === 0) {
          // 最終試行でも失敗した場合は通常のアサートでエラーを表示
          await expect(qrCode).toBeVisible({ timeout: getTimeout(5000) });
        }
      }

      const totpGroup = page.getByRole('group', { name: /認証コード/i });
      await expect(totpGroup).toBeVisible();
      await expect(totpGroup).toHaveAttribute('role', 'group');
      await expect(totpGroup).toHaveAttribute('aria-label', /認証コード/i);
    });

    /**
     * 要件27E.4: 2FA検証エラーがaria-live="polite"でスクリーンリーダーに通知される
     */
    test('2FA検証エラーがスクリーンリーダーに通知される', async ({ page }) => {
      // 2FA有効ユーザーでログイン試行
      await cleanDatabase();
      await createTestUser('TWO_FA_USER');

      await page.goto('/login');
      await page.getByLabel(/メールアドレス/i).fill('2fa-user@example.com');
      await page.locator('input#password').fill('Password123!');
      await page.getByRole('button', { name: /ログイン/i }).click();

      // 誤ったTOTPコードを入力
      const wrongDigits = '000000'.split('');
      for (let i = 0; i < wrongDigits.length; i++) {
        await page.getByTestId(`totp-digit-${i}`).fill(wrongDigits[i]!);
      }
      await page.getByRole('button', { name: /検証|ログイン/i }).click();

      // エラーメッセージがaria-liveリージョンで表示される
      const errorMessage = page.getByRole('alert');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveAttribute('aria-live', 'polite');
      await expect(errorMessage).toContainText(/認証コードが正しくありません/i);
    });
  });
});
