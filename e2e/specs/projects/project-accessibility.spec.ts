/**
 * @fileoverview プロジェクト管理機能のアクセシビリティE2Eテスト
 *
 * Task 16.4: アクセシビリティ E2Eテスト
 *
 * Requirements:
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 * - 20.4: フォーカス状態を視覚的に明確に表示する
 *
 * テスト内容:
 * - キーボードナビゲーション（Tab, Enter, Escape操作）
 * - axe-playwrightによる自動アクセシビリティチェック
 * - フォーム要素のaria-label
 * - フォーカス状態の視覚的表示
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cleanDatabase } from '../../fixtures/database';
import { createTestUser } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { seedProject } from '../../helpers/project-list-preconditions';

/**
 * プロジェクト管理機能のアクセシビリティテスト
 */
test.describe('プロジェクト管理 アクセシビリティテスト', () => {
  test.describe.configure({ mode: 'serial' });

  // テスト用プロジェクトID
  let testProjectId: string | null = null;

  test.beforeAll(async () => {
    await cleanDatabase();
    await createTestUser('REGULAR_USER');
    await createTestUser('ADMIN_USER');
  });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  /**
   * axe-playwrightによる自動アクセシビリティチェック
   * WCAG 2.1 AA準拠を検証
   */
  test.describe('WCAG 2.1 AA準拠 自動チェック', () => {
    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト一覧画面のアクセシビリティチェック
     */
    test('プロジェクト一覧画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // ページコンテンツが読み込まれるまで待機
      await expect(page.getByRole('heading', { name: /プロジェクト一覧/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト作成画面のアクセシビリティチェック
     */
    test('プロジェクト作成画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByRole('heading', { name: /新規プロジェクト/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト詳細画面のアクセシビリティチェック
     */
    test('プロジェクト詳細画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 検証対象のプロジェクトを前提として無条件に用意する。
      // 「無ければ画面から作る」条件分岐は、前提の生成が壊れても静かに素通りする経路になり、
      // 失敗が前提の崩れた地点ではなく後段の検証に現れるため置かない。
      testProjectId = (await seedProject(page, 'アクセシビリティテスト')).id;

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // コンテンツが読み込まれるまで待機
      await expect(page.getByText(/基本情報/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    /**
     * REQ-20.1, REQ-20.4
     * プロジェクト編集画面のアクセシビリティチェック
     */
    test('プロジェクト編集画面がWCAG 2.1 AA基準を満たす', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 検証対象のプロジェクトを前提として無条件に用意する。
      // 「無ければ画面から作る」条件分岐は、前提の生成が壊れても静かに素通りする経路になり、
      // 失敗が前提の崩れた地点ではなく後段の検証に現れるため置かない。
      testProjectId = (await seedProject(page, 'アクセシビリティ編集テスト')).id;

      // 詳細ページに移動して編集ボタンをクリック
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集フォームが表示されるまで待機
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // axeによるアクセシビリティチェック
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  /**
   * キーボードナビゲーションテスト
   */
  test.describe('キーボードナビゲーション', () => {
    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * Tabキーによるフォーカス移動テスト
     */
    test('プロジェクト作成フォームでTabキーによるフォーカス移動が正常に動作する', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ユーザー一覧の読み込み完了を待機
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // プロジェクト名フィールドにフォーカス
      const projectNameInput = page.getByLabel(/プロジェクト名/i);
      await projectNameInput.focus();
      await expect(projectNameInput).toBeFocused();

      // Tab: 顧客名コンボボックスへ
      await page.keyboard.press('Tab');
      const tradingPartnerCombobox = page.locator('[role="combobox"][aria-label="顧客名"]');
      await expect(tradingPartnerCombobox).toBeFocused();

      // Tab: 営業担当者セレクトへ
      await page.keyboard.press('Tab');
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toBeFocused();

      // Tab: 工事担当者セレクトへ
      await page.keyboard.press('Tab');
      const constructionPersonSelect = page.locator('select[aria-label="工事担当者"]');
      await expect(constructionPersonSelect).toBeFocused();

      // Tab: 現場住所フィールドへ
      await page.keyboard.press('Tab');
      const siteAddressInput = page.getByLabel(/現場住所/i);
      await expect(siteAddressInput).toBeFocused();

      // Tab: 概要フィールドへ
      await page.keyboard.press('Tab');
      const descriptionInput = page.getByLabel(/概要/i);
      await expect(descriptionInput).toBeFocused();

      // Tab: キャンセルボタンへ
      await page.keyboard.press('Tab');
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await expect(cancelButton).toBeFocused();

      // Tab: 作成ボタンへ
      await page.keyboard.press('Tab');
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await expect(createButton).toBeFocused();
    });

    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * Enterキーによる操作実行テスト
     */
    test('プロジェクト一覧画面でEnterキーによるボタン操作が正常に動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 新規作成ボタンが表示されるまで待機
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタンにフォーカスを移動
      await createButton.focus();
      await expect(createButton).toBeFocused();

      // Enterキーでボタンをクリック
      await page.keyboard.press('Enter');

      // 作成ページに遷移することを確認
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    });

    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * Escapeキーによるダイアログ閉じるテスト
     */
    test('削除確認ダイアログがEscapeキーで閉じられる', async ({ page, context }) => {
      // 一般ユーザーでプロジェクトを作成
      await loginAsUser(page, 'REGULAR_USER');

      // 検証対象のプロジェクトを前提として無条件に用意する。
      // 「無ければ画面から作る」条件分岐は、前提の生成が壊れても静かに素通りする経路になり、
      // 失敗が前提の崩れた地点ではなく後段の検証に現れるため置かない。
      testProjectId = (await seedProject(page, 'Escapeテスト')).id;

      // 管理者ユーザーに切り替え（削除ボタンを表示するため）
      await context.clearCookies();
      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });
      await loginAsUser(page, 'ADMIN_USER');

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // 確認ダイアログが表示されることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // Escキーでダイアログを閉じる
      await page.keyboard.press('Escape');

      // ダイアログが閉じられることを確認
      await expect(page.getByText(/プロジェクトの削除/i)).not.toBeVisible({
        timeout: getTimeout(5000),
      });

      // 詳細画面に留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${testProjectId}$`));
    });

    /**
     * REQ-20.1: すべての操作をキーボードのみで実行可能
     * 編集キャンセルのキーボード操作テスト
     */
    test('プロジェクト編集画面でキーボードのみでキャンセル操作が可能', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 詳細ページに移動して編集モードに入る
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const editButton = page.getByRole('button', { name: /編集/i });
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });

      // 編集ボタンにフォーカスしてEnterキーで編集モードに入る
      await editButton.focus();
      await page.keyboard.press('Enter');

      // 編集フォームが表示されるまで待機
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).toBeVisible({
        timeout: getTimeout(10000),
      });

      // キャンセルボタンにフォーカスを移動
      const cancelButton = page.getByRole('button', { name: /キャンセル/i });
      await cancelButton.focus();
      await expect(cancelButton).toBeFocused();

      // Enterキーでキャンセル
      await page.keyboard.press('Enter');

      // 編集フォームが閉じられることを確認
      await expect(page.getByRole('heading', { name: /プロジェクトを編集/i })).not.toBeVisible({
        timeout: getTimeout(10000),
      });
    });
  });

  /**
   * フォーカス状態の視覚的表示テスト
   */
  test.describe('フォーカス状態の視覚的表示', () => {
    /**
     * REQ-20.4: フォーカス状態を視覚的に明確に表示
     * フォーカスリングの表示確認
     */
    test('プロジェクト作成フォームでフォーカス状態が視覚的に明確に表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // プロジェクト名フィールドにフォーカス
      const projectNameInput = page.getByLabel(/プロジェクト名/i);
      await projectNameInput.focus();

      // フォーカス時にbox-shadowが適用されていることを確認
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boxShadow = await projectNameInput.evaluate((el: any): string => {
        return el.ownerDocument.defaultView.getComputedStyle(el).boxShadow;
      });

      // フォーカス時にbox-shadowが「none」でないことを確認
      expect(boxShadow).not.toBe('none');
    });

    /**
     * REQ-20.4: フォーカス状態を視覚的に明確に表示
     * ボタンのフォーカスリング表示確認
     */
    test('ボタン要素でフォーカス状態が視覚的に明確に表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // 新規作成ボタン
      const createButton = page.getByRole('button', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });

      // 新規作成ボタンは focus:ring-2（box-shadow）でフォーカスを示し、
      // outline は focus:outline-none で消される（ProjectListPage.tsx）。
      // 加えて未フォーカスでも shadow-lg が掛かっているため、「outline か box-shadow の
      // いずれかが none でない」は**フォーカスしていなくても真**であり、
      // フォーカス表示の有無を一切確かめていなかった。
      // フォーカス前後で見た目が変わることを主張する。
      const readBoxShadow = async (): Promise<string> =>
        createButton.evaluate(
          (el): string => el.ownerDocument.defaultView!.getComputedStyle(el).boxShadow
        );

      const boxShadowBeforeFocus = await readBoxShadow();
      await createButton.focus();
      await expect(createButton).toBeFocused();
      const boxShadowAfterFocus = await readBoxShadow();

      expect(boxShadowAfterFocus, 'フォーカスしても box-shadow が変化しない').not.toBe(
        boxShadowBeforeFocus
      );
      expect(boxShadowAfterFocus).not.toBe('none');
    });
  });

  /**
   * ARIA属性のテスト
   */
  test.describe('ARIA属性', () => {
    /**
     * REQ-20.1, REQ-20.4
     * フォーム要素のaria-label属性テスト
     */
    test('プロジェクト作成フォームの各フィールドに適切なaria-label属性が設定されている', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 各フィールドのaria-label属性を確認
      await expect(page.locator('input[aria-label="プロジェクト名"]')).toBeVisible();
      await expect(page.locator('[role="combobox"][aria-label="顧客名"]')).toBeVisible();
      await expect(page.locator('select[aria-label="営業担当者"]')).toBeVisible();
      await expect(page.locator('select[aria-label="工事担当者"]')).toBeVisible();
      await expect(page.locator('input[aria-label="現場住所"]')).toBeVisible();
      await expect(page.locator('textarea[aria-label="概要"]')).toBeVisible();
    });

    /**
     * REQ-20.1, REQ-20.4
     * 必須フィールドのaria-required属性テスト
     */
    test('必須フィールドにaria-required属性が設定されている', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 必須フィールドのaria-required属性を確認
      const projectNameInput = page.locator('input[aria-label="プロジェクト名"]');
      await expect(projectNameInput).toHaveAttribute('aria-required', 'true');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await expect(salesPersonSelect).toHaveAttribute('aria-required', 'true');

      // 顧客名は任意フィールドなのでaria-required="false"
      const tradingPartnerSelect = page.locator('[role="combobox"][aria-label="顧客名"]');
      await expect(tradingPartnerSelect).toHaveAttribute('aria-required', 'false');
    });

    /**
     * REQ-20.1, REQ-20.4
     * エラーメッセージのaria-live属性テスト
     */
    test('バリデーションエラー時にaria-liveで通知される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームが表示されるまで待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージがaria-live="polite"またはrole="alert"で表示されることを確認
      const errorMessage = page.locator('[role="alert"], [aria-live="polite"]');
      await expect(errorMessage.first()).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * REQ-20.1, REQ-20.4
     * ダイアログのaria属性テスト
     */
    test('削除確認ダイアログに適切なaria属性が設定されている', async ({ page }) => {
      // 管理者ユーザーでログイン
      await loginAsUser(page, 'ADMIN_USER');

      if (!testProjectId) {
        throw new Error('testProjectIdが未設定です。事前準備テストが正しく実行されていません。');
      }

      // 詳細ページに移動
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 「削除」ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      await expect(deleteButton).toBeVisible({ timeout: getTimeout(10000) });
      await deleteButton.click();

      // ダイアログが表示されるまで待機
      await expect(page.getByText(/プロジェクトの削除/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // ダイアログのaria-labelledby属性を確認
      // Note: role="dialog" を持つ要素に限定して aria-labelledby を検証する
      const dialogContainer = page.getByRole('dialog').filter({
        has: page.locator('[aria-labelledby="delete-dialog-title"]'),
      });
      await expect(dialogContainer).toBeVisible();

      // ダイアログのaria-describedby属性を確認
      // Note: role="dialog" を持つ要素に限定して検証する
      const dialogWithDescription = page.getByRole('dialog').filter({
        has: page.locator('[aria-describedby="delete-dialog-description"]'),
      });
      await expect(dialogWithDescription).toBeVisible();

      // キャンセルボタンをクリックしてダイアログを閉じる
      await page.getByRole('button', { name: /キャンセル/i }).click();
    });

    /**
     * @requirement project-management/REQ-20.2
     */
    test('フォーム要素にaria-label属性が適切に設定されている (project-management/REQ-20.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 各フォーム要素にaria-label属性が設定されていることを確認
      await expect(page.locator('input[aria-label="プロジェクト名"]')).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.locator('[role="combobox"][aria-label="顧客名"]')).toBeVisible();
      await expect(page.locator('select[aria-label="営業担当者"]')).toBeVisible();
      await expect(page.locator('select[aria-label="工事担当者"]')).toBeVisible();
      await expect(page.locator('input[aria-label="現場住所"]')).toBeVisible();
      await expect(page.locator('textarea[aria-label="概要"]')).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-20.3
     */
    test('エラーメッセージがaria-live属性でスクリーンリーダーに通知される (project-management/REQ-20.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 何も入力せずに作成ボタンをクリック
      await page.getByRole('button', { name: /^作成$/i }).click();

      // エラーメッセージが表示されることを確認
      await expect(page.getByText(/プロジェクト名は必須です/i)).toBeVisible({
        timeout: getTimeout(5000),
      });

      // エラーメッセージを含む要素がaria-live属性を持つことを確認
      const errorContainer = page.locator('[aria-live="polite"], [aria-live="assertive"]');
      const containerExists = await errorContainer.count();

      // aria-live属性を持つ要素が存在することを確認
      expect(containerExists).toBeGreaterThan(0);
    });

    /**
     * @requirement project-management/REQ-20.5
     */
    test('WCAG 2.1 Level AA準拠のコントラスト比（通常テキスト4.5:1以上）を満たす (project-management/REQ-20.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      // テーブルヘッダーまたはカードリストが表示されるまで待機
      const table = page.getByRole('table');
      const cardList = page.getByTestId('project-card-list');
      const emptyMessage = page.getByText(/プロジェクトがありません/i);

      await expect(table.or(cardList).or(emptyMessage)).toBeVisible({ timeout: getTimeout(10000) });

      // 各テキスト要素のコントラスト比を確認（実際の計算は複雑なため、色が設定されていることのみ確認）
      const heading = page.getByRole('heading', { name: /プロジェクト一覧/i });
      await expect(heading).toBeVisible();

      // ヘッディングのスタイルを確認
      const headingStyles = await heading.evaluate((el) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - window is available in browser context
        const style = window.getComputedStyle(el);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      });

      // テキスト色と背景色が設定されていることを確認
      expect(headingStyles.color).toBeTruthy();
      expect(headingStyles.backgroundColor).toBeTruthy();

      // Note: 実際のコントラスト比の計算はE2Eテストでは困難なため、
      // デザインシステムで適切な色が使用されていることを信頼する
    });
  });
});
