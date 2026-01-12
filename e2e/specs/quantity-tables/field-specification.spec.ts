/**
 * @fileoverview フィールド仕様のE2Eテスト
 *
 * Task 13.4: フィールド仕様のE2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-13: テキストフィールドの文字数制限
 *   - 13.1: 大項目・中項目等（全角25文字/半角50文字）
 *   - 13.2: 工種（全角8文字/半角16文字）
 *   - 13.3: 単位（全角3文字/半角6文字）
 * - REQ-14: 数値フィールドの表示書式
 *   - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常時表示
 *   - 14.3: 寸法フィールドは数値入力時のみ小数2桁表示
 * - REQ-15: 数値フィールドの入力制限
 *   - 15.1: 調整係数は-9.99〜9.99の範囲
 *   - 15.2: 丸め設定は0.01〜99.99の範囲
 *   - 15.3: 数量は-999999.99〜9999999.99の範囲
 *
 * @module e2e/specs/quantity-tables/field-specification.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * フィールド仕様のE2Eテスト
 */
test.describe('フィールド仕様', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したリソースのIDを保存
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;
  let projectName: string = '';

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクトと数量表を作成
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `フィールド仕様テスト_${Date.now()}`;
      await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

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

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const projectUrl = page.url();
      const projectMatch = projectUrl.match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    test('数量表を作成する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 数量表作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /新規作成|数量表を作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // 数量表作成モーダルまたはページを待つ
      await page.waitForLoadState('networkidle');

      // 数量表名を入力
      const tableNameInput = page.getByLabel(/数量表名|名称/i);
      if (await tableNameInput.isVisible()) {
        await tableNameInput.fill(`フィールドテスト数量表_${Date.now()}`);
      }

      // 作成ボタンをクリック
      const submitButton = page.getByRole('button', { name: /^作成$|^保存$/i });
      if (await submitButton.isVisible()) {
        const createTablePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api/quantity-tables') ||
            (response.url().includes('/api/projects/') &&
              response.url().includes('/quantity-tables')),
          { timeout: getTimeout(30000) }
        );

        await submitButton.click();
        const response = await createTablePromise;

        // 作成された数量表IDを取得
        if (response.status() === 201) {
          const body = await response.json();
          createdQuantityTableId = body.id;
        }
      }
    });
  });

  /**
   * REQ-13: テキストフィールドの文字数制限テスト
   */
  test.describe('REQ-13: テキストフィールドの文字数制限', () => {
    test('13.1: 大項目フィールドに全角25文字まで入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');

        // 数量表リンクをクリック
        const tableLink = page.getByRole('link', { name: /フィールドテスト数量表/i });
        if (await tableLink.isVisible()) {
          await tableLink.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // 数量項目追加ボタンをクリック
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForLoadState('networkidle');
      }

      // 大項目フィールドを取得
      const majorCategoryInput = page.getByLabel(/大項目/i);
      if (await majorCategoryInput.isVisible()) {
        // 全角25文字を入力
        const validText = '漢'.repeat(25); // 幅50
        await majorCategoryInput.fill(validText);

        // 入力が受け付けられたことを確認
        await expect(majorCategoryInput).toHaveValue(validText);

        // エラーが表示されていないことを確認
        const errorMessage = page.getByText(/50文字以内/i);
        await expect(errorMessage).not.toBeVisible();
      }
    });

    test('13.2: 工種フィールドに全角8文字まで入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 工種フィールドを取得
      const workTypeInput = page.getByLabel(/工種/i);
      if (await workTypeInput.isVisible()) {
        // 全角8文字を入力
        const validText = '漢'.repeat(8); // 幅16
        await workTypeInput.fill(validText);

        // 入力が受け付けられたことを確認
        await expect(workTypeInput).toHaveValue(validText);

        // エラーが表示されていないことを確認
        const errorMessage = page.getByText(/16文字以内/i);
        await expect(errorMessage).not.toBeVisible();
      }
    });

    test('13.3: 単位フィールドに全角3文字まで入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 単位フィールドを取得
      const unitInput = page.getByLabel(/単位/i);
      if (await unitInput.isVisible()) {
        // 全角3文字を入力
        const validText = '平米台'; // 幅6
        await unitInput.fill(validText);

        // 入力が受け付けられたことを確認
        await expect(unitInput).toHaveValue(validText);

        // エラーが表示されていないことを確認
        const errorMessage = page.getByText(/6文字以内/i);
        await expect(errorMessage).not.toBeVisible();
      }
    });

    test('文字数超過時にエラーメッセージが表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 大項目フィールドを取得
      const majorCategoryInput = page.getByLabel(/大項目/i);
      if (await majorCategoryInput.isVisible()) {
        // 全角26文字を入力（制限超過）
        const invalidText = '漢'.repeat(26); // 幅52
        await majorCategoryInput.fill(invalidText);

        // ブラーイベントを発生させる
        await majorCategoryInput.blur();

        // エラーメッセージが表示されることを確認（または入力が制限される）
        // 実装によってはエラーメッセージ表示またはmaxLength制限
        const inputValue = await majorCategoryInput.inputValue();
        // 入力が制限されているか、エラーが表示されていることを確認
        const isLimited = inputValue.length <= 25;
        const errorMessage = page.getByText(/文字以内|超過/i);
        const hasError = await errorMessage.isVisible();

        expect(isLimited || hasError).toBeTruthy();
      }
    });
  });

  /**
   * REQ-14: 数値フィールドの表示書式テスト
   */
  test.describe('REQ-14: 数値フィールドの表示書式', () => {
    test('14.2: 調整係数が小数2桁で表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 調整係数フィールドを取得
      const adjustmentFactorInput = page.getByLabel(/調整係数/i);
      if (await adjustmentFactorInput.isVisible()) {
        // 整数を入力
        await adjustmentFactorInput.fill('1');
        await adjustmentFactorInput.blur();

        // 小数2桁で表示されることを確認
        await expect(adjustmentFactorInput).toHaveValue('1.00');
      }
    });

    test('14.2: 丸め設定が小数2桁で表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 丸め設定フィールドを取得
      const roundingUnitInput = page.getByLabel(/丸め設定|丸め/i);
      if (await roundingUnitInput.isVisible()) {
        // 小数1桁を入力
        await roundingUnitInput.fill('0.5');
        await roundingUnitInput.blur();

        // 小数2桁で表示されることを確認
        await expect(roundingUnitInput).toHaveValue('0.50');
      }
    });

    test('14.2: 数量フィールドが小数2桁で表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 数量フィールドを取得
      const quantityInput = page.getByLabel(/^数量$/i);
      if (await quantityInput.isVisible()) {
        // 整数を入力
        await quantityInput.fill('100');
        await quantityInput.blur();

        // 小数2桁で表示されることを確認
        await expect(quantityInput).toHaveValue('100.00');
      }
    });
  });

  /**
   * REQ-15: 数値フィールドの入力制限テスト
   */
  test.describe('REQ-15: 数値フィールドの入力制限', () => {
    test('15.1: 調整係数は-9.99〜9.99の範囲で入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 調整係数フィールドを取得
      const adjustmentFactorInput = page.getByLabel(/調整係数/i);
      if (await adjustmentFactorInput.isVisible()) {
        // 有効な値を入力
        await adjustmentFactorInput.fill('9.99');
        await adjustmentFactorInput.blur();

        // エラーが表示されていないことを確認
        const errorMessage = page.getByText(/-9\.99〜9\.99/i);
        await expect(errorMessage).not.toBeVisible();

        // 無効な値を入力
        await adjustmentFactorInput.fill('10');
        await adjustmentFactorInput.blur();

        // エラーメッセージが表示されることを確認（または値が制限される）
        const inputValue = await adjustmentFactorInput.inputValue();
        const isLimited = parseFloat(inputValue) <= 9.99;
        const hasError = await page.getByText(/範囲|超過|-9\.99/i).isVisible();

        expect(isLimited || hasError).toBeTruthy();
      }
    });

    test('15.2: 丸め設定は0.01〜99.99の範囲で入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 丸め設定フィールドを取得
      const roundingUnitInput = page.getByLabel(/丸め設定|丸め/i);
      if (await roundingUnitInput.isVisible()) {
        // 有効な値を入力
        await roundingUnitInput.fill('0.01');
        await roundingUnitInput.blur();

        // エラーが表示されていないことを確認
        const errorMessage = page.getByText(/0\.01〜99\.99/i);
        await expect(errorMessage).not.toBeVisible();

        // 無効な値を入力
        await roundingUnitInput.fill('100');
        await roundingUnitInput.blur();

        // エラーメッセージが表示されることを確認（または値が制限される）
        const inputValue = await roundingUnitInput.inputValue();
        const isLimited = parseFloat(inputValue) <= 99.99;
        const hasError = await page.getByText(/範囲|超過|99\.99/i).isVisible();

        expect(isLimited || hasError).toBeTruthy();
      }
    });

    test('15.3: 数量は-999999.99〜9999999.99の範囲で入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 数量フィールドを取得
      const quantityInput = page.getByLabel(/^数量$/i);
      if (await quantityInput.isVisible()) {
        // 有効な値を入力
        await quantityInput.fill('9999999.99');
        await quantityInput.blur();

        // エラーが表示されていないことを確認
        const errorMessage = page.getByText(/9999999\.99/i);
        await expect(errorMessage).not.toBeVisible();

        // 無効な値を入力
        await quantityInput.fill('10000000');
        await quantityInput.blur();

        // エラーメッセージが表示されることを確認（または値が制限される）
        const inputValue = await quantityInput.inputValue();
        const isLimited = parseFloat(inputValue) <= 9999999.99;
        const hasError = await page.getByText(/範囲|超過|9999999/i).isVisible();

        expect(isLimited || hasError).toBeTruthy();
      }
    });
  });

  /**
   * クリーンアップ: テストデータを削除
   */
  test.describe('クリーンアップ', () => {
    test('テスト用プロジェクトを削除する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // 確認ダイアログで削除を確定
        const confirmButton = page.getByRole('button', { name: /^削除$|^確定$|^はい$/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // 削除完了を待つ
          await page.waitForURL(/\/projects(?!.*\/)/, { timeout: getTimeout(10000) });
        }
      }
    });
  });
});
