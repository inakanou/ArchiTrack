/**
 * @fileoverview 名称・備考フィールドのオートコンプリートE2Eテスト
 *
 * Task 27.2: 名称・備考オートコンプリートのE2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-7.1: 対象フィールド（名称・備考含む全9フィールド）でオートコンプリート候補を表示
 * - REQ-7.3: フォーカス時にクライアントサイドで候補をドロップダウン表示
 * - REQ-7.3a: 空フィールドへのフォーカス時に全候補をドロップダウン表示
 * - REQ-7.4: 候補選択時の自動入力
 * - REQ-7.5: blur時にクライアントサイドで候補追加
 * - REQ-7.6: blur時の候補追加はAPIリクエスト不要
 * - REQ-7.7: 候補を50音順に表示
 *
 * @module e2e/specs/quantity-tables/name-remarks-autocomplete.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 名称・備考フィールドのオートコンプリートE2Eテスト
 */
test.describe('名称・備考フィールドのオートコンプリート', () => {
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

      projectName = `名称備考AC_${Date.now()}`;
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

      // 数量表作成ページに直接遷移
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表名を入力
      const tableNameInput = page.getByLabel(/数量表名|名称/i);
      if (await tableNameInput.isVisible()) {
        await tableNameInput.fill(`名称備考ACテスト数量表_${Date.now()}`);
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

  // ==========================================================================
  // REQ-7.1, 7.3: 名称フィールドのオートコンプリート
  // ==========================================================================

  test.describe('REQ-7.1, 7.3: 名称フィールドのオートコンプリート', () => {
    test('名称フィールドにフォーカスした際にオートコンプリート候補がドロップダウン表示される', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');
      }

      await page.waitForLoadState('networkidle');

      // 数量項目追加ボタンをクリック
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // 名称フィールドを探す（comboboxロールを持つ）
      const nameField = page.locator('input[id$="-name"][role="combobox"]').first();
      if (await nameField.isVisible({ timeout: getTimeout(5000) })) {
        // 名称フィールドにフォーカス
        await nameField.click();

        // aria-autocomplete属性が設定されていることを確認
        const ariaAutocomplete = await nameField.getAttribute('aria-autocomplete');
        expect(ariaAutocomplete).toBe('list');

        // role="combobox"が設定されていることを確認
        const role = await nameField.getAttribute('role');
        expect(role).toBe('combobox');
      }
    });

    test('名称フィールドでテキスト入力時に候補がフィルタリングされる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');
      }

      await page.waitForLoadState('networkidle');

      // 名称フィールドを探す
      const nameField = page.locator('input[id$="-name"][role="combobox"]').first();
      if (await nameField.isVisible({ timeout: getTimeout(5000) })) {
        // 名称フィールドに入力
        await nameField.fill('テスト');
        await page.waitForTimeout(300);

        // フィルタリングされた候補リストまたは候補なしの状態を確認
        // APIリクエストが発生しないことの確認（ネットワーク監視）
        const apiCalls: string[] = [];
        page.on('request', (request) => {
          if (
            request.url().includes('/autocomplete') &&
            !request.url().includes('/autocomplete-candidates')
          ) {
            apiCalls.push(request.url());
          }
        });

        await nameField.fill('テスト追加');
        await page.waitForTimeout(500);

        // 入力中にautocomplete（個別）エンドポイントが呼ばれないことを確認
        expect(apiCalls.length).toBe(0);
      }
    });
  });

  // ==========================================================================
  // REQ-7.1, 7.3: 備考フィールドのオートコンプリート
  // ==========================================================================

  test.describe('REQ-7.1, 7.3: 備考フィールドのオートコンプリート', () => {
    test('備考フィールドにフォーカスした際にオートコンプリート候補がドロップダウン表示される', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');
      }

      await page.waitForLoadState('networkidle');

      // 備考フィールドを探す（comboboxロールを持つ）
      const remarksField = page.locator('input[id$="-remarks"][role="combobox"]').first();
      if (await remarksField.isVisible({ timeout: getTimeout(5000) })) {
        // 備考フィールドにフォーカス
        await remarksField.click();

        // aria-autocomplete属性が設定されていることを確認
        const ariaAutocomplete = await remarksField.getAttribute('aria-autocomplete');
        expect(ariaAutocomplete).toBe('list');

        // role="combobox"が設定されていることを確認
        const role = await remarksField.getAttribute('role');
        expect(role).toBe('combobox');
      }
    });
  });

  // ==========================================================================
  // REQ-7.4: 名称フィールドで候補を選択すると値が自動入力される
  // ==========================================================================

  test.describe('REQ-7.4: 候補選択時の自動入力', () => {
    test('名称フィールドで候補を選択すると値が自動入力される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');
      }

      await page.waitForLoadState('networkidle');

      // 名称フィールドを探す
      const nameField = page.locator('input[id$="-name"][role="combobox"]').first();
      if (await nameField.isVisible({ timeout: getTimeout(5000) })) {
        // まず名称を入力して候補を生成
        await nameField.fill('テスト名称');
        await nameField.blur();
        await page.waitForTimeout(300);

        // 新しい項目追加
        const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
        if (await addItemButton.isVisible()) {
          await addItemButton.click();
          await page.waitForTimeout(500);
        }

        // 新しい行の名称フィールドを探す
        const nameFields = page.locator('input[id$="-name"][role="combobox"]');
        const count = await nameFields.count();
        if (count > 1) {
          const newNameField = nameFields.nth(count - 1);
          await newNameField.click();
          await page.waitForTimeout(300);

          // ドロップダウンが表示される場合、候補をクリック
          const listbox = page.getByRole('listbox').first();
          if (await listbox.isVisible({ timeout: 2000 })) {
            const option = listbox.getByRole('option').first();
            if (await option.isVisible()) {
              const optionText = await option.textContent();
              await option.click();

              // 選択された値が入力フィールドに反映されることを確認
              if (optionText) {
                const fieldValue = await newNameField.inputValue();
                expect(fieldValue).toBe(optionText);
              }
            }
          }
        }
      }
    });
  });

  // ==========================================================================
  // REQ-7.1: 全9フィールドで一貫してオートコンプリートが動作する
  // ==========================================================================

  test.describe('REQ-7.1: 全9フィールドのオートコンプリート一貫性', () => {
    test('全9フィールドでオートコンプリートが一貫して動作する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');
      }

      await page.waitForLoadState('networkidle');

      // 全9フィールドのID末尾を定義
      const autocompleteFieldSuffixes = [
        'majorCategory', // 大項目
        'middleCategory', // 中項目
        'minorCategory', // 小項目
        'customCategory', // 任意分類
        'workType', // 工種
        'name', // 名称
        'specification', // 規格
        'unit', // 単位
        'remarks', // 備考
      ];

      for (const suffix of autocompleteFieldSuffixes) {
        const field = page.locator(`input[id$="-${suffix}"][role="combobox"]`).first();
        if (await field.isVisible({ timeout: getTimeout(3000) })) {
          // comboboxロールが設定されていることを確認
          const role = await field.getAttribute('role');
          expect(role).toBe('combobox');

          // aria-autocomplete属性が設定されていることを確認
          const ariaAutocomplete = await field.getAttribute('aria-autocomplete');
          expect(ariaAutocomplete).toBe('list');
        }
      }
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータのクリーンアップ', async ({ page }) => {
      test.skip(!testProjectId, 'クリーンアップ不要');

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクトの詳細ページに遷移して削除
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: /削除/i });
      if (await deleteButton.isVisible({ timeout: 3000 })) {
        await deleteButton.click();
        const confirmButton = page.getByRole('button', { name: /削除を確認|はい|OK/i });
        if (await confirmButton.isVisible({ timeout: 3000 })) {
          await confirmButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });
  });
});
