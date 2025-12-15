/**
 * @fileoverview プロジェクト名一意性チェックのE2Eテスト
 *
 * Task 25.1: プロジェクト名一意性チェックE2Eテスト
 *
 * プロジェクト名の一意性制約のE2Eテストを実施します。
 * 同一名のプロジェクトを作成しようとした場合はエラーが表示され、
 * 別の名前であれば正常に作成できることをテストします。
 *
 * Requirements:
 * - 1.15: 既に同じプロジェクト名が登録されている場合のエラー表示
 * - 1.16: プロジェクト名の一意性チェックを作成時に実行
 * - 1.17: プロジェクト名の一意性チェックを作成時に実行する
 * - 8.7: プロジェクト名を変更して既に同じプロジェクト名が登録されている場合のエラー表示
 * - 8.8: プロジェクト名の一意性チェックを更新時に実行（自身のプロジェクトは除外）
 * - 8.11: プロジェクト名を変更して既に同じプロジェクト名が登録されている場合のエラー表示
 * - 8.12: プロジェクト名の一意性チェックを更新時に実行（自身のプロジェクトは除外）
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * プロジェクト名一意性制約のE2Eテスト
 */
test.describe('プロジェクト名一意性チェック（Task 25.1）', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context, page }) => {
    // テスト間の状態をクリア
    await context.clearCookies();

    // localStorageもクリア（テスト間の認証状態の干渉を防ぐ）
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  /**
   * 作成画面でのプロジェクト名重複エラーテスト
   */
  test.describe('作成画面での重複エラー', () => {
    /**
     * @requirement project-management/REQ-1.15
     * @requirement project-management/REQ-1.16
     * @requirement project-management/REQ-1.17
     * 既存のプロジェクトと同一のプロジェクト名で作成を試みた際のエラーメッセージ表示を検証
     */
    test('同一のプロジェクト名で作成するとエラーが表示される (project-management/REQ-1.15, REQ-1.16, REQ-1.17)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 各テスト固有のタイムスタンプを使用（テスト間の干渉を防ぐ）
      const timestamp = Date.now();

      // 1つ目のプロジェクトを作成
      const projectName = `一意性テストプロジェクト_${timestamp}`;

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // フォームの読み込み完了を待機
      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise1;

      // 詳細ページに遷移したことを確認
      await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
      await page.waitForLoadState('networkidle');

      // 2つ目を同じ名前で作成しようとする
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者を確認・選択
      const salesPersonValue2 = await salesPersonSelect.inputValue();
      if (!salesPersonValue2) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      // APIレスポンスを待機（409 Conflictが返るはず）
      const response = await createPromise2;
      expect(response.status()).toBe(409);

      // ネットワーク遅延とReactのレンダリングを考慮
      await page.waitForLoadState('networkidle');

      // 重複エラーメッセージが表示されることを確認
      // エラーメッセージはフォームフィールドとトーストに表示されるため.first()を使用
      await expect(page.getByText(/このプロジェクト名は既に使用されています/i).first()).toBeVisible(
        {
          timeout: getTimeout(10000),
        }
      );

      // 作成ページに留まっていることを確認（エラー時は遷移しない）
      await expect(page).toHaveURL(/\/projects\/new/);
    });

    /**
     * @requirement project-management/REQ-1.15
     * 重複エラー後にプロジェクト名を変更して正常に保存できることを検証
     */
    test('重複エラー後にプロジェクト名を変更して正常に作成できる (project-management/REQ-1.15)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();

      // 1つ目のプロジェクトを作成
      const projectName1 = `重複回復テスト_${timestamp}`;
      const projectName2 = `重複回復テスト_別名_${timestamp}`;

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      // 営業担当者を確認・選択
      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(projectName1);

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise1;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 2つ目を同じ名前で作成しようとする（エラーが発生する）
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const salesPersonValue2 = await salesPersonSelect.inputValue();
      if (!salesPersonValue2) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(projectName1);

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();

      const errorResponse = await createPromise2;
      expect(errorResponse.status()).toBe(409);

      // エラーメッセージが表示されることを確認（複数要素にマッチするため.first()を使用）
      await expect(page.getByText(/このプロジェクト名は既に使用されています/i).first()).toBeVisible(
        {
          timeout: getTimeout(10000),
        }
      );

      // プロジェクト名を変更して再度送信
      // トーストの閉じるボタンにも「プロジェクト名」が含まれるため、textboxを明示的に指定
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName2);

      const createPromise3 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise3;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを作成しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細画面に遷移することを確認
      await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });

      // 新しいプロジェクト名が表示されることを確認
      await expect(page.getByRole('heading', { name: projectName2 })).toBeVisible();
    });
  });

  /**
   * 編集画面でのプロジェクト名重複エラーテスト
   */
  test.describe('編集画面での重複エラー', () => {
    /**
     * @requirement project-management/REQ-8.7
     * @requirement project-management/REQ-8.8
     * @requirement project-management/REQ-8.11
     * @requirement project-management/REQ-8.12
     * 他のプロジェクトと同一のプロジェクト名に変更しようとした際のエラーメッセージ表示を検証
     */
    test('他のプロジェクトと同一のプロジェクト名に変更するとエラーが表示される (project-management/REQ-8.7, REQ-8.8, REQ-8.11, REQ-8.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();

      // 1つ目のプロジェクトを作成
      const project1Name = `編集重複テストA_${timestamp}`;

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(project1Name);

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise1;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

      // 2つ目のプロジェクトを作成（異なる名前）
      const project2Name = `編集重複テストB_${timestamp}`;

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const salesPersonValue2 = await salesPersonSelect.inputValue();
      if (!salesPersonValue2) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(project2Name);

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse2 = await createPromise2;
      const project2Data = await createResponse2.json();
      const project2Id = project2Data.id;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

      // 2つ目のプロジェクトを編集して、1つ目と同じ名前に変更しようとする
      await page.goto(`/projects/${project2Id}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toHaveValue(project2Name, {
        timeout: getTimeout(10000),
      });

      // 1つ目と同じ名前に変更
      await page.getByLabel(/プロジェクト名/i).fill(project1Name);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${project2Id}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      const response = await updatePromise;

      // 409エラーが返されることを確認
      expect(response.status()).toBe(409);

      // ネットワーク遅延とReactのレンダリングを考慮
      await page.waitForLoadState('networkidle');

      // 重複エラーメッセージがフォームに表示されることを確認（複数要素にマッチするため.first()を使用）
      await expect(page.getByText(/このプロジェクト名は既に使用されています/i).first()).toBeVisible(
        {
          timeout: getTimeout(10000),
        }
      );

      // 編集ページに留まっていることを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${project2Id}/edit`));
    });

    /**
     * @requirement project-management/REQ-8.8
     * @requirement project-management/REQ-8.12
     * 自分自身のプロジェクト名を変更しない場合はエラーにならないことを検証
     */
    test('自分自身のプロジェクト名を変更しない場合はエラーにならない (project-management/REQ-8.8, REQ-8.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();
      const projectName = `自己編集テスト_${timestamp}`;

      // プロジェクトを作成
      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(projectName);

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse = await createPromise;
      const projectData = await createResponse.json();
      const projectId = projectData.id;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

      // 同じプロジェクトを編集（名前は変更せず、概要のみ変更）
      await page.goto(`/projects/${projectId}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toHaveValue(projectName, {
        timeout: getTimeout(10000),
      });

      // 概要だけ変更（名前は変更しない）
      const updatedDescription = `概要更新_${Date.now()}`;
      await page.getByLabel(/概要/i).fill(updatedDescription);

      const updatePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${projectId}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`), {
        timeout: getTimeout(10000),
      });

      // 更新した概要が表示されることを確認
      await expect(page.getByText(updatedDescription)).toBeVisible();
    });

    /**
     * @requirement project-management/REQ-8.7
     * 重複エラー後にプロジェクト名を変更して正常に保存できることを検証
     */
    test('編集画面で重複エラー後にプロジェクト名を変更して正常に保存できる (project-management/REQ-8.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const timestamp = Date.now();

      // 1つ目のプロジェクトを作成
      const project1Name = `編集回復テストA_${timestamp}`;

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(project1Name);

      const createPromise1 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createPromise1;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

      // 2つ目のプロジェクトを作成
      const project2Name = `編集回復テストB_${timestamp}`;
      const project2NewName = `編集回復テストB_変更後_${timestamp}`;

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({
        timeout: getTimeout(10000),
      });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const salesPersonValue2 = await salesPersonSelect.inputValue();
      if (!salesPersonValue2) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      await page.getByLabel(/プロジェクト名/i).fill(project2Name);

      const createPromise2 = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const createResponse2 = await createPromise2;
      const project2Data = await createResponse2.json();
      const project2Id = project2Data.id;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);

      // 2つ目のプロジェクトを編集して、1つ目と同じ名前に変更（エラーになる）
      await page.goto(`/projects/${project2Id}/edit`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toHaveValue(project2Name, {
        timeout: getTimeout(10000),
      });

      await page.getByLabel(/プロジェクト名/i).fill(project1Name);

      const updatePromise1 = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${project2Id}`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();

      const errorResponse = await updatePromise1;
      expect(errorResponse.status()).toBe(409);

      // エラーメッセージが表示されることを確認（複数要素にマッチするため.first()を使用）
      await expect(page.getByText(/このプロジェクト名は既に使用されています/i).first()).toBeVisible(
        {
          timeout: getTimeout(10000),
        }
      );

      // 別の名前に変更して再度保存
      // トーストの閉じるボタンにも「プロジェクト名」が含まれるため、textboxを明示的に指定
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(project2NewName);

      const updatePromise2 = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/projects/${project2Id}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /保存/i }).click();
      await updatePromise2;

      // 成功メッセージが表示されることを確認
      await expect(page.getByText(/プロジェクトを更新しました/i)).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 詳細ページに遷移することを確認
      await expect(page).toHaveURL(new RegExp(`/projects/${project2Id}$`), {
        timeout: getTimeout(10000),
      });

      // 新しいプロジェクト名が表示されることを確認
      await expect(page.getByRole('heading', { name: project2NewName })).toBeVisible();
    });
  });
});
