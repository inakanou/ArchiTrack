import { test, expect } from '@playwright/test';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getPrismaClient } from '../../fixtures/database';

/**
 * 管理者招待機能のE2Eテスト
 *
 * 要件1: 管理者によるユーザー招待
 * 要件13: 管理者ユーザー招待画面のUI/UX
 *
 * このテストスイートは、管理者によるユーザー招待機能をEnd-to-Endで検証します。
 */
test.describe('管理者招待機能', () => {
  // 並列実行を無効化（データベースクリーンアップの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // 管理者でログイン（グローバルセットアップで作成済み）
    await loginAsUser(page, 'ADMIN_USER');

    // 招待画面に移動
    await page.goto('/admin/invitations');
  });

  /**
   * 要件13.1: 招待画面のUI要素表示
   * WHEN 招待画面が表示される
   * THEN 招待フォームと招待一覧テーブルを表示する
   */
  test('招待画面が正しく表示される', async ({ page }) => {
    // 招待フォームが表示される
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /招待を送信|招待する/i })).toBeVisible();

    // 招待一覧テーブルが表示される
    await expect(page.getByRole('table')).toBeVisible();

    // テーブルヘッダーが表示される
    await expect(page.getByRole('columnheader', { name: /メールアドレス/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /招待日時/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /ステータス/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /有効期限/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /アクション/i })).toBeVisible();
  });

  /**
   * 要件1.1-1.3: 有効なメールアドレスで招待を送信
   * WHEN 管理者が有効なメールアドレスを提供する
   * THEN Authentication Serviceは一意の招待トークンを生成し、招待メールを送信する
   */
  test('有効なメールアドレスで招待を送信できる', async ({ page }) => {
    const newUserEmail = 'newuser@example.com';

    // メールアドレスを入力して招待ボタンをクリック
    await page.getByLabel(/メールアドレス/i).fill(newUserEmail);
    await page.getByRole('button', { name: /招待を送信|招待する/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/招待を送信しました/i)).toBeVisible();

    // 招待一覧に新しい招待が表示される
    const invitationRow = page.locator('tr', { has: page.locator(`text="${newUserEmail}"`) });
    await expect(invitationRow).toBeVisible();

    // ステータスが「未使用」であることを確認
    await expect(invitationRow.locator('text=/未使用|Pending/i')).toBeVisible();

    // データベースに招待が保存されていることを確認
    const prisma = getPrismaClient();
    const invitation = await prisma.invitation.findFirst({
      where: { email: newUserEmail },
      orderBy: { createdAt: 'desc' },
    });

    expect(invitation).toBeTruthy();
    expect(invitation!.token).toBeTruthy();
    expect(invitation!.expiresAt).toBeTruthy();

    // 有効期限が7日後であることを確認
    const expiresAt = new Date(invitation!.expiresAt);
    const now = new Date();
    const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9); // 約7日間
    expect(diffDays).toBeLessThan(7.1);
  });

  /**
   * 要件13.3-13.5: 招待URLのコピー機能
   * WHEN 招待が成功する
   * THEN 招待URLのコピーボタンが表示され、クリップボードにコピーできる
   */
  test('招待URLをクリップボードにコピーできる', async ({ page, context }) => {
    const newUserEmail = 'copytest@example.com';

    // クリップボードの書き込み権限を付与
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.getByLabel(/メールアドレス/i).fill(newUserEmail);
    await page.getByRole('button', { name: /招待を送信|招待する/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/招待を送信しました/i)).toBeVisible();

    // URLコピーボタンが表示される
    const copyButton = page.getByRole('button', { name: /URLをコピー|コピー/i }).first();
    await expect(copyButton).toBeVisible();

    // コピーボタンをクリック
    await copyButton.click();

    // トーストメッセージが表示される
    await expect(page.getByText(/コピーしました|クリップボードにコピーしました/i)).toBeVisible();

    // クリップボードの内容を確認
    const clipboardText = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      return await nav.clipboard.readText();
    });
    expect(clipboardText).toContain('/register?token=');
  });

  /**
   * 要件1.4: 既に登録済みのメールアドレスでエラー
   * IF 招待メールアドレスが既に登録済みである
   * THEN Authentication Serviceはエラーメッセージを返す
   */
  test('既に登録済みのメールアドレスではエラーが表示される', async ({ page }) => {
    // 既に登録済みのadmin@example.comで招待を試みる
    await page.getByLabel(/メールアドレス/i).fill('admin@example.com');
    await page.getByRole('button', { name: /招待を送信|招待する/i }).click();

    // エラーメッセージが表示される
    await expect(page.getByText(/このメールアドレスは既に登録されています/i)).toBeVisible();
  });

  /**
   * 要件1.5: 一般ユーザーは招待画面にアクセスできない
   * IF リクエスト送信者が管理者ロールを持たない
   * THEN Authentication Serviceは403 Forbiddenエラーを返す
   */
  test('一般ユーザーは招待画面にアクセスできない', async ({ page }) => {
    // 一般ユーザーを作成してログイン
    await cleanDatabase();
    await createTestUser('ADMIN_USER'); // 後続テストのbeforeEach用に再作成
    await createTestUser('REGULAR_USER');
    await loginAsUser(page, 'REGULAR_USER');

    // 招待画面にアクセスを試みる
    await page.goto('/admin/invitations');

    // 403エラーメッセージまたはアクセス拒否メッセージが表示される
    await expect(page.getByText(/アクセス権限がありません|403|Forbidden/i)).toBeVisible();
  });

  /**
   * 要件1.7: 招待一覧の取得とステータス表示
   * WHEN 管理者が招待一覧を取得する
   * THEN 招待ステータス（未使用、使用済み、期限切れ）を返す
   */
  test('招待一覧に各ステータスが正しく表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    // 未使用の招待を作成
    await prisma.invitation.create({
      data: {
        email: 'unused@example.com',
        token: 'unused-token-123',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
        usedAt: null,
      },
    });

    // 使用済みの招待を作成
    await prisma.invitation.create({
      data: {
        email: 'used@example.com',
        token: 'used-token-123',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: new Date(), // 使用済み
      },
    });

    // 期限切れの招待を作成
    await prisma.invitation.create({
      data: {
        email: 'expired@example.com',
        token: 'expired-token-123',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() - 1000), // 1秒前に期限切れ
        usedAt: null,
      },
    });

    // ページをリロードして招待一覧を更新
    await page.reload();

    // 未使用の招待
    const unusedRow = page.locator('tr', { has: page.locator('text="unused@example.com"') });
    await expect(unusedRow).toBeVisible();
    await expect(unusedRow.locator('text=/未使用|Pending/i')).toBeVisible();

    // 使用済みの招待
    const usedRow = page.locator('tr', { has: page.locator('text="used@example.com"') });
    await expect(usedRow).toBeVisible();
    await expect(usedRow.locator('text=/使用済み|Used/i')).toBeVisible();

    // 期限切れの招待
    const expiredRow = page.locator('tr', { has: page.locator('text="expired@example.com"') });
    await expect(expiredRow).toBeVisible();
    await expect(expiredRow.locator('text=/期限切れ|Expired/i')).toBeVisible();
  });

  /**
   * 要件13.6-13.7: ステータスに応じたアクションボタンの表示
   * WHEN 招待ステータスが「未使用」である
   * THEN 「取り消し」ボタンを有効化する
   */
  test('未使用の招待には取り消しボタンが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    await prisma.invitation.create({
      data: {
        email: 'cancel-test@example.com',
        token: 'cancel-token-123',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: null,
      },
    });

    await page.reload();

    const invitationRow = page.locator('tr', {
      has: page.locator('text="cancel-test@example.com"'),
    });

    // 取り消しボタンが有効である
    const cancelButton = invitationRow.getByRole('button', { name: /取り消し|キャンセル/i });
    await expect(cancelButton).toBeVisible();
    await expect(cancelButton).toBeEnabled();
  });

  test('期限切れの招待には再送信ボタンが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    await prisma.invitation.create({
      data: {
        email: 'resend-test@example.com',
        token: 'resend-token-123',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() - 1000), // 期限切れ
        usedAt: null,
      },
    });

    await page.reload();

    const invitationRow = page.locator('tr', {
      has: page.locator('text="resend-test@example.com"'),
    });

    // 再送信ボタンが有効である
    const resendButton = invitationRow.getByRole('button', { name: /再送信|再送/i });
    await expect(resendButton).toBeVisible();
    await expect(resendButton).toBeEnabled();
  });

  /**
   * 要件1.8: 未使用の招待を取り消す
   * WHEN 管理者が未使用の招待を取り消す
   * THEN Authentication Serviceは招待を無効化する
   */
  test('未使用の招待を取り消せる', async ({ page }) => {
    const newUserEmail = 'cancel-me@example.com';

    // 招待を作成
    await page.getByLabel(/メールアドレス/i).fill(newUserEmail);
    await page.getByRole('button', { name: /招待を送信|招待する/i }).click();

    await expect(page.getByText(/招待を送信しました/i)).toBeVisible();

    const invitationRow = page.locator('tr', { has: page.locator(`text="${newUserEmail}"`) });

    // 取り消しボタンをクリック
    const cancelButton = invitationRow.getByRole('button', { name: /取り消し|キャンセル/i });
    await cancelButton.click();

    // 確認ダイアログが表示される
    await expect(
      page.getByText(/本当に取り消しますか|招待を取り消してもよろしいですか/i)
    ).toBeVisible();

    // 確認ボタンをクリック
    await page.getByRole('button', { name: /はい|確認|取り消す/i }).click();

    // 成功メッセージが表示される
    await expect(page.getByText(/招待を取り消しました/i)).toBeVisible();

    // 招待一覧から削除されているまたはステータスが「取り消し済み」になっている
    // (実装によって異なる場合があるため、両方をチェック)
    const isDeleted = (await invitationRow.count()) === 0;
    const isCancelled = isDeleted
      ? true
      : await invitationRow.locator('text=/取り消し済み|Cancelled/i').isVisible();

    expect(isDeleted || isCancelled).toBe(true);
  });

  /**
   * 要件13.9: 招待一覧が10件以上ある場合のページネーション
   * WHEN 招待一覧が10件以上ある
   * THEN ページネーションまたは無限スクロールを提供する
   */
  test('招待が10件以上ある場合、ページネーションが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    // 15件の招待を作成
    for (let i = 0; i < 15; i++) {
      await prisma.invitation.create({
        data: {
          email: `testuser${i}@example.com`,
          token: `token-${i}`,
          inviterId: admin!.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await page.reload();

    // ページネーションコントロールが表示される
    const pagination = page.locator(
      '[data-testid="pagination"], nav[aria-label="ページネーション"], .pagination'
    );
    await expect(pagination).toBeVisible();

    // ページ番号が表示される
    await expect(page.getByText(/1.*2|次へ|Next/i)).toBeVisible();
  });

  /**
   * 要件13.10: ステータスに応じた視覚的区別
   * WHEN 招待一覧が読み込まれる
   * THEN 招待ステータスに応じた視覚的な区別（色、アイコン）を提供する
   */
  test('ステータスに応じた視覚的な区別が提供される', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    // 各ステータスの招待を作成
    await prisma.invitation.create({
      data: {
        email: 'visual-unused@example.com',
        token: 'visual-unused-token',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: null,
      },
    });

    await prisma.invitation.create({
      data: {
        email: 'visual-used@example.com',
        token: 'visual-used-token',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        usedAt: new Date(),
      },
    });

    await prisma.invitation.create({
      data: {
        email: 'visual-expired@example.com',
        token: 'visual-expired-token',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
    });

    await page.reload();

    // 各ステータスのバッジまたはアイコンが表示される
    const unusedRow = page.locator('tr', { has: page.locator('text="visual-unused@example.com"') });
    const unusedBadge = unusedRow.locator('[data-testid="status-badge"], .badge, .status');
    await expect(unusedBadge).toBeVisible();

    const usedRow = page.locator('tr', { has: page.locator('text="visual-used@example.com"') });
    const usedBadge = usedRow.locator('[data-testid="status-badge"], .badge, .status');
    await expect(usedBadge).toBeVisible();

    const expiredRow = page.locator('tr', {
      has: page.locator('text="visual-expired@example.com"'),
    });
    const expiredBadge = expiredRow.locator('[data-testid="status-badge"], .badge, .status');
    await expect(expiredBadge).toBeVisible();
  });

  /**
   * 要件13.11: モバイルレスポンシブ対応
   * WHEN デバイス画面幅が768px未満である
   * THEN テーブルをカード形式のレイアウトに変換する
   */
  test('モバイル画面でカード形式のレイアウトが表示される', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    await prisma.invitation.create({
      data: {
        email: 'mobile-test@example.com',
        token: 'mobile-token',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // カード形式のレイアウトが表示される（実装依存）
    const mobileCard = page.locator('[data-testid="invitation-card"], .invitation-card, .card');
    await expect(mobileCard.first()).toBeVisible();
  });

  /**
   * 要件15.4: アクセシビリティ属性の検証
   * WHEN 招待画面が表示される
   * THEN 適切なARIA属性が設定されている
   */
  test('招待画面がアクセシビリティ要件を満たす', async ({ page }) => {
    // テーブルのrole属性
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // フォームのrole属性
    const form = page.locator('form');
    await expect(form).toHaveAttribute('role', 'form');

    // メールアドレスフィールドのラベル関連付け
    const emailInput = page.getByLabel(/メールアドレス/i);
    const emailInputId = await emailInput.getAttribute('id');
    expect(emailInputId).toBeTruthy();
  });

  /**
   * 要件15.11: モーダルダイアログのフォーカストラップ
   * WHEN 確認ダイアログが開かれる
   * THEN フォーカストラップを実装し、Escキーで閉じられる
   */
  test('確認ダイアログがEscキーで閉じられる', async ({ page }) => {
    const prisma = getPrismaClient();
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    await prisma.invitation.create({
      data: {
        email: 'dialog-test@example.com',
        token: 'dialog-token',
        inviterId: admin!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await page.reload();

    const invitationRow = page.locator('tr', {
      has: page.locator('text="dialog-test@example.com"'),
    });
    const cancelButton = invitationRow.getByRole('button', { name: /取り消し|キャンセル/i });
    await cancelButton.click();

    // 確認ダイアログが表示される
    const dialog = page.getByRole('dialog', { name: /確認|招待の取り消し/i });
    await expect(dialog).toBeVisible();

    // Escキーを押してダイアログを閉じる
    await page.keyboard.press('Escape');

    // ダイアログが閉じられる
    await expect(dialog).not.toBeVisible();
  });

  /**
   * 要件15.12: autocomplete属性の適切な設定
   * WHEN 招待フォームが表示される
   * THEN 適切なautocomplete属性が設定されている
   */
  test('メールアドレスフィールドに適切なautocomplete属性が設定されている', async ({ page }) => {
    const emailInput = page.getByLabel(/メールアドレス/i);
    await expect(emailInput).toHaveAttribute('autocomplete', 'email');
  });

  /**
   * 要件11.11: キーボードナビゲーション
   * WHEN 招待画面が読み込まれる
   * THEN Tab キーで論理的な順序でフォーカスが移動する
   */
  test('Tab キーで論理的な順序でフォーカスが移動する', async ({ page }) => {
    // メールアドレスフィールドにフォーカスを移動
    await page.getByLabel(/メールアドレス/i).focus();
    await expect(page.getByLabel(/メールアドレス/i)).toBeFocused();

    // Tab キーを押して招待ボタンに移動
    await page.keyboard.press('Tab');
    const inviteButton = page.getByRole('button', { name: /招待を送信|招待する/i });
    await expect(inviteButton).toBeFocused();
  });
});
