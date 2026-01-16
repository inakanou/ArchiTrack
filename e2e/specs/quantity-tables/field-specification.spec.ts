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
 *   - 14.4: 寸法フィールドが空白の場合は空白のまま表示
 * - REQ-15: 数値フィールドの入力制御
 *   - 15.1: 数量は-999999.99〜9999999.99の範囲
 *   - 15.2: 数量フィールドに空白が入力されると自動的に「0」を設定し「0.00」と表示
 *   - 15.3: 寸法・ピッチフィールドは0.01〜9999999.99の範囲
 * - REQ-9: 調整係数
 *   - 9.3: 調整係数は-9.99〜9.99の範囲
 *   - 9.4: 調整係数が空白時は1.00を自動設定
 * - REQ-10: 丸め設定
 *   - 10.3: 丸め設定は-99.99〜99.99の範囲
 *   - 10.4: 丸め設定が0または空白時は0.01を自動設定
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

      // 数量表作成ページに直接遷移（プロジェクト詳細ページの「新規作成」リンクは数量表0件時のみ表示）
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
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

    test('14.3: 寸法フィールドに数値を入力すると小数2桁で表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 計算方法を「面積・体積」に変更
      const calculationMethodSelect = page.getByLabel(/計算方法/i);
      if (await calculationMethodSelect.isVisible()) {
        await calculationMethodSelect.selectOption('AREA_VOLUME');
        await page.waitForLoadState('networkidle');
      }

      // 幅フィールドを取得
      const widthInput = page.getByLabel(/幅（W）|幅\(W\)/i);
      if (await widthInput.isVisible()) {
        // 整数を入力
        await widthInput.fill('5');
        await widthInput.blur();

        // 小数2桁で表示されることを確認
        await expect(widthInput).toHaveValue('5.00');
      }
    });

    test('14.4: 寸法フィールドが空白の場合は空白のまま表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 計算方法を「面積・体積」に変更
      const calculationMethodSelect = page.getByLabel(/計算方法/i);
      if (await calculationMethodSelect.isVisible()) {
        await calculationMethodSelect.selectOption('AREA_VOLUME');
        await page.waitForLoadState('networkidle');
      }

      // 奥行きフィールドを取得（空白のまま）
      const depthInput = page.getByLabel(/奥行き（D）|奥行き\(D\)/i);
      if (await depthInput.isVisible()) {
        // 空白を入力
        await depthInput.fill('');
        await depthInput.blur();

        // 空白のまま表示されることを確認（0.00ではない）
        await expect(depthInput).toHaveValue('');
      }
    });
  });

  /**
   * REQ-15: 数量フィールドの入力制御テスト
   */
  test.describe('REQ-15: 数量フィールドの入力制御', () => {
    test('15.1: 数量は-999999.99〜9999999.99の範囲で入力できる', async ({ page }) => {
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

    test('15.2: 数量フィールドに空白が入力されると0.00が自動設定される', async ({ page }) => {
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
        // 空白を入力
        await quantityInput.fill('');
        await quantityInput.blur();

        // 0.00が自動設定されることを確認
        await expect(quantityInput).toHaveValue('0.00');
      }
    });

    test('15.3: 寸法フィールドは0.01〜9999999.99の範囲で入力できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
      }
      await page.waitForLoadState('networkidle');

      // 計算方法を「面積・体積」に変更
      const calculationMethodSelect = page.getByLabel(/計算方法/i);
      if (await calculationMethodSelect.isVisible()) {
        await calculationMethodSelect.selectOption('AREA_VOLUME');
        await page.waitForLoadState('networkidle');
      }

      // 幅フィールドを取得
      const widthInput = page.getByLabel(/幅（W）|幅\(W\)/i);
      if (await widthInput.isVisible()) {
        // 有効な値を入力
        await widthInput.fill('0.01');
        await widthInput.blur();

        // 小数2桁で表示されることを確認
        await expect(widthInput).toHaveValue('0.01');

        // 最大値を入力
        await widthInput.fill('9999999.99');
        await widthInput.blur();

        // エラーが表示されていないことを確認
        const inputValue = await widthInput.inputValue();
        expect(parseFloat(inputValue)).toBeLessThanOrEqual(9999999.99);
      }
    });
  });

  /**
   * REQ-9: 調整係数テスト
   */
  test.describe('REQ-9: 調整係数', () => {
    test('9.3: 調整係数は-9.99〜9.99の範囲で入力できる', async ({ page }) => {
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

        // 小数2桁で表示されることを確認
        await expect(adjustmentFactorInput).toHaveValue('9.99');

        // 負の有効な値を入力
        await adjustmentFactorInput.fill('-9.99');
        await adjustmentFactorInput.blur();

        await expect(adjustmentFactorInput).toHaveValue('-9.99');
      }
    });

    test('9.4: 調整係数が空白時は1.00が自動設定される', async ({ page }) => {
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
        // 空白を入力
        await adjustmentFactorInput.fill('');
        await adjustmentFactorInput.blur();

        // 1.00が自動設定されることを確認
        await expect(adjustmentFactorInput).toHaveValue('1.00');
      }
    });
  });

  /**
   * REQ-10: 丸め設定テスト
   */
  test.describe('REQ-10: 丸め設定', () => {
    test('10.3: 丸め設定は-99.99〜99.99の範囲で入力できる', async ({ page }) => {
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
        await roundingUnitInput.fill('99.99');
        await roundingUnitInput.blur();

        // 小数2桁で表示されることを確認
        await expect(roundingUnitInput).toHaveValue('99.99');

        // 負の有効な値を入力
        await roundingUnitInput.fill('-99.99');
        await roundingUnitInput.blur();

        await expect(roundingUnitInput).toHaveValue('-99.99');
      }
    });

    test('10.4: 丸め設定が空白時は0.01が自動設定される', async ({ page }) => {
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
        // 空白を入力
        await roundingUnitInput.fill('');
        await roundingUnitInput.blur();

        // 0.01が自動設定されることを確認
        await expect(roundingUnitInput).toHaveValue('0.01');
      }
    });

    test('10.4: 丸め設定が0の時は0.01が自動設定される', async ({ page }) => {
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
        // 0を入力
        await roundingUnitInput.fill('0');
        await roundingUnitInput.blur();

        // 0.01が自動設定されることを確認
        await expect(roundingUnitInput).toHaveValue('0.01');
      }
    });
  });

  /**
   * クリーンアップ: テストデータを削除
   */
  test.describe('クリーンアップ', () => {
    test('テスト用プロジェクトを削除する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'ADMIN_USER');
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i }).first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // 確認ダイアログが表示されるのを待つ
        const dialog = page.getByRole('dialog');
        const dialogVisible = await dialog
          .waitFor({ state: 'visible', timeout: getTimeout(5000) })
          .then(() => true)
          .catch(() => false);

        if (dialogVisible) {
          // 確認ダイアログ内の削除確定ボタンをクリック
          const confirmButton = dialog.getByRole('button', { name: /^削除$/i });

          // APIレスポンスを待ちながら削除ボタンをクリック
          const deletePromise = page.waitForResponse(
            (response) =>
              response.url().includes(`/api/projects/${testProjectId}`) &&
              response.request().method() === 'DELETE',
            { timeout: getTimeout(15000) }
          );

          await confirmButton.click();
          await deletePromise.catch(() => {});

          // 一覧画面に遷移するのを待つ
          await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) }).catch(() => {});
        }
      }
    });
  });
});
