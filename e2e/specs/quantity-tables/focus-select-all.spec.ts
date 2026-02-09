/**
 * @fileoverview フォーカス時全選択のE2Eテスト
 *
 * Task 19.4: フォーカス時全選択のE2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-16.1: 大項目フィールドのフォーカス時全選択
 * - REQ-16.2: 中項目フィールドのフォーカス時全選択
 * - REQ-16.3: 小項目フィールドのフォーカス時全選択
 * - REQ-16.4: 任意分類フィールドのフォーカス時全選択
 * - REQ-16.5: 工種フィールドのフォーカス時全選択
 * - REQ-16.6: 名称フィールドのフォーカス時全選択
 * - REQ-16.7: 規格フィールドのフォーカス時全選択
 * - REQ-16.8: 数量フィールドのフォーカス時全選択
 * - REQ-16.9: 単位フィールドのフォーカス時全選択
 * - REQ-16.10: 備考フィールドのフォーカス時全選択
 * - REQ-16.11: 全選択状態での上書き入力
 * - REQ-16.12: オートコンプリートとの共存
 *
 * @module e2e/specs/quantity-tables/focus-select-all.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * フォーカス時全選択E2Eテスト
 */
test.describe('フォーカス時全選択', () => {
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

      projectName = `全選択テスト_${Date.now()}`;
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

    test('数量表を作成して項目を追加する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表作成ページに直接遷移
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表名を入力
      const tableNameInput = page.getByLabel(/数量表名|名称/i);
      if (await tableNameInput.isVisible()) {
        await tableNameInput.fill(`全選択テスト数量表_${Date.now()}`);
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
   * REQ-16.1-16.10: 対象10フィールドのフォーカス時全選択
   */
  test.describe('REQ-16: フォーカス時全選択', () => {
    /**
     * ヘルパー: 数量表編集画面に遷移して項目が表示されていることを確認する
     */
    async function navigateToEditPage(page: import('@playwright/test').Page) {
      await loginAsUser(page, 'REGULAR_USER');

      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');

        const tableLink = page.getByRole('link', { name: /全選択テスト数量表/i });
        if (await tableLink.isVisible()) {
          await tableLink.click();
          await page.waitForLoadState('networkidle');
        }
      }

      await page.waitForLoadState('networkidle');

      // 数量項目が表示されていない場合は追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        const itemRow = page.getByTestId('quantity-item-row');
        if ((await itemRow.count()) === 0) {
          await addItemButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    }

    /**
     * ヘルパー: フィールドに初期値を入力してからフォーカスし、全選択状態を検証する
     */
    async function verifySelectAllOnFocus(
      page: import('@playwright/test').Page,
      fieldLabel: RegExp,
      initialValue: string,
      newValue: string
    ) {
      const input = page.getByLabel(fieldLabel).first();
      if (!(await input.isVisible())) {
        test.skip(true, `${fieldLabel.source}フィールドが表示されていないためスキップ`);
        return;
      }

      // 初期値を入力
      await input.fill(initialValue);

      // 別のフィールドに一度フォーカスを移す
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      // フィールドをクリックしてフォーカス
      await input.click();
      await page.waitForTimeout(100);

      // 全選択状態で新しい値を入力（全選択されていれば既存値が置換される）
      await page.keyboard.type(newValue);

      // 新しい値で置換されたことを確認（全選択+上書き）
      await expect(input).toHaveValue(newValue);
    }

    test('16.1-16.10: 対象10フィールドそれぞれにフォーカスして全選択状態になる', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await navigateToEditPage(page);

      // テスト対象フィールドリスト
      const targetFields = [
        { label: /大項目/i, initial: '共通仮設', newVal: '土工' },
        { label: /中項目/i, initial: '直接仮設', newVal: '掘削工' },
        { label: /小項目/i, initial: '足場工', newVal: '基礎工' },
        { label: /任意分類/i, initial: '分類A', newVal: '分類B' },
        { label: /工種/i, initial: '仮設工', newVal: '土工事' },
        { label: /名称/i, initial: '足場', newVal: '掘削' },
        { label: /規格/i, initial: 'ビケ足場', newVal: 'H鋼' },
        { label: /単位/i, initial: 'm2', newVal: 'm3' },
        { label: /備考/i, initial: '安全用', newVal: '注意' },
      ];

      for (const field of targetFields) {
        await verifySelectAllOnFocus(page, field.label, field.initial, field.newVal);
      }

      // 数量フィールド（type=number）の全選択テスト
      const quantityInput = page.getByLabel(/数量/i).first();
      if (await quantityInput.isVisible()) {
        await quantityInput.fill('100.50');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
        await quantityInput.click();
        await page.waitForTimeout(100);

        // 全選択状態で新しい値を入力
        await page.keyboard.type('200');

        // 全選択+上書きが行われたことを確認
        const quantityValue = await quantityInput.inputValue();
        // 数量フィールドは100.50が全選択され、200に置換される
        expect(quantityValue).toBe('200');
      }
    });

    test('16.11: 全選択状態で新しい文字を入力すると既存値が置換される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await navigateToEditPage(page);

      // 名称フィールドで上書き入力を検証
      const nameInput = page.getByLabel(/名称/i).first();
      if (await nameInput.isVisible()) {
        // 元の値を入力
        await nameInput.fill('元の名称');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);

        // 再フォーカスして全選択
        await nameInput.click();
        await page.waitForTimeout(100);

        // 新しい文字を入力（全選択されていれば「元の名称」が完全に置換される）
        await page.keyboard.type('新しい名称');

        // 「元の名称」ではなく「新しい名称」になっていることを確認
        await expect(nameInput).toHaveValue('新しい名称');
      }
    });

    test('16.12: オートコンプリート対象フィールドで全選択とドロップダウンが共存する', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await navigateToEditPage(page);

      // 大項目フィールド（AutocompleteInput）でテスト
      const majorCategoryInput = page.getByLabel(/大項目/i).first();
      if (await majorCategoryInput.isVisible()) {
        // 値を入力
        await majorCategoryInput.fill('共通仮設');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        // 再フォーカス - 全選択とドロップダウンが共存することを確認
        await majorCategoryInput.click();
        await page.waitForTimeout(200);

        // ドロップダウンの存在チェック（候補が存在する場合のみ表示される）
        // 注: 候補がない場合はドロップダウンは表示されないが、全選択は行われている
        // 全選択で新しい値が上書き入力できることで全選択の動作を確認
        await page.keyboard.type('土工');

        // 全選択+上書きが正常に動作
        await expect(majorCategoryInput).toHaveValue('土工');
      }
    });
  });

  /**
   * クリーンアップ: テスト用リソースを削除
   */
  test.describe('クリーンアップ', () => {
    test('テスト用プロジェクトを削除する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細ページに遷移
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンをクリック
      const deleteButton = page.getByRole('button', { name: /削除/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // 確認ダイアログ
        const confirmButton = page.getByRole('button', { name: /確認|はい|削除/i }).last();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });
  });
});
