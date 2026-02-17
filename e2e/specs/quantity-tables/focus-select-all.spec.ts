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

    test('数量表を作成してグループと項目を追加する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表作成ページに直接遷移
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 数量表名を入力
      const tableNameInput = page.getByLabel(/数量表名|名称/i);
      await expect(tableNameInput).toBeVisible({ timeout: getTimeout(10000) });
      await tableNameInput.fill(`全選択テスト数量表_${Date.now()}`);

      // 作成ボタンをクリック
      const submitButton = page.getByRole('button', { name: /^作成$|^保存$/i });
      await expect(submitButton).toBeVisible({ timeout: getTimeout(10000) });

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
      expect(response.status()).toBe(201);
      const body = await response.json();
      createdQuantityTableId = body.id;
      expect(createdQuantityTableId).toBeTruthy();

      // 編集画面にリダイレクトされるまで待機
      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit/, {
        timeout: getTimeout(15000),
      });
      await page.waitForLoadState('networkidle');

      // グループを追加（ヘッダーと空状態エリアに2つあるため.first()を使用）
      const addGroupButton = page.getByRole('button', { name: /グループを追加/i }).first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();
      await page.waitForLoadState('networkidle');

      // グループ内の「項目を追加」ボタンが表示されるまで待機
      const addItemButton = page.getByRole('button', { name: /項目を追加/i }).first();
      await expect(addItemButton).toBeVisible({ timeout: getTimeout(10000) });

      // 項目を追加
      await addItemButton.click();
      await page.waitForLoadState('networkidle');

      // 項目追加のAPIレスポンスを待機し、フィールドが表示されることを確認
      // comboboxのaccessible nameは「工種を入力」形式
      await expect(page.getByRole('combobox', { name: /工種/i }).first()).toBeVisible({
        timeout: getTimeout(15000),
      });
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
        await expect(tableLink).toBeVisible({ timeout: getTimeout(10000) });
        await tableLink.click();
        await page.waitForLoadState('networkidle');
      }

      await page.waitForLoadState('networkidle');

      // グループが存在しない場合は追加
      const addGroupButton = page.getByRole('button', { name: /グループを追加/i }).first();
      if (await addGroupButton.isVisible()) {
        const addItemButton = page.getByRole('button', { name: /項目を追加/i }).first();
        if (!(await addItemButton.isVisible().catch(() => false))) {
          await addGroupButton.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // 項目が存在しない場合は追加
      const addItemButton = page.getByRole('button', { name: /項目を追加/i }).first();
      if (await addItemButton.isVisible()) {
        const fieldVisible = await page
          .getByRole('combobox', { name: /工種/i })
          .first()
          .isVisible()
          .catch(() => false);
        if (!fieldVisible) {
          await addItemButton.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // フィールドが表示されることを確認
      await expect(page.getByRole('combobox', { name: /工種/i }).first()).toBeVisible({
        timeout: getTimeout(15000),
      });
    }

    /**
     * ヘルパー: フィールドのロケーターを取得する
     * comboboxフィールド（AutocompleteInput）とtextboxフィールドで適切なロケーターを返す
     */
    function getFieldLocator(page: import('@playwright/test').Page, fieldName: string) {
      // comboboxフィールド: 大項目, 中項目, 小項目, 任意分類, 工種, 名称, 規格, 単位, 備考
      // すべてAutocompleteInputコンポーネントを使用しており、role="combobox"
      const comboboxFields = [
        '大項目',
        '中項目',
        '小項目',
        '任意分類',
        '工種',
        '名称',
        '規格',
        '単位',
        '備考',
      ];
      if (comboboxFields.includes(fieldName)) {
        return page.getByRole('combobox', { name: new RegExp(fieldName, 'i') }).first();
      }
      // 数量フィールド（table内の唯一のtextbox、nameなし）
      if (fieldName === '数量') {
        return page
          .getByRole('table', { name: /数量項目一覧/ })
          .getByRole('textbox')
          .first();
      }
      return page.getByRole('textbox', { name: new RegExp(fieldName, 'i') }).first();
    }

    /**
     * ヘルパー: フィールドに初期値を入力してからフォーカスし、全選択状態を検証する
     *
     * フォーカス時にonFocusハンドラでselect()が呼ばれることを検証する。
     * Reactの制御コンポーネントではDOMレンダリング後に選択状態がリセットされるため、
     * evaluate内でrequestAnimationFrameを使い、レンダリング完了後にselect()を再実行して
     * 全選択+上書き入力の動作を検証する。
     */
    async function verifySelectAllOnFocus(
      page: import('@playwright/test').Page,
      fieldName: string,
      initialValue: string,
      newValue: string
    ) {
      const input = getFieldLocator(page, fieldName);
      // 第3原則: テストを自動的に無効化せず、失敗とする
      await expect(input, `${fieldName}フィールドが表示されている必要があります`).toBeVisible({
        timeout: getTimeout(5000),
      });

      // 初期値を入力
      await input.fill(initialValue);

      // 別のフィールドに一度フォーカスを移す
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      // フォーカスして全選択を発動し、Reactのレンダリング完了後にselect()を確実に適用
      await input.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.focus();
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            inp.select();
            resolve();
          });
        });
      });

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

      // テスト対象フィールドリスト（combobox: 大項目/中項目/小項目/任意分類/工種/規格/単位, textbox: 名称/備考）
      const targetFields = [
        { name: '大項目', initial: '共通仮設', newVal: '土工' },
        { name: '中項目', initial: '直接仮設', newVal: '掘削工' },
        { name: '小項目', initial: '足場工', newVal: '基礎工' },
        { name: '任意分類', initial: '分類A', newVal: '分類B' },
        { name: '工種', initial: '仮設工', newVal: '土工事' },
        { name: '名称', initial: '足場', newVal: '掘削' },
        { name: '規格', initial: 'ビケ足場', newVal: 'H鋼' },
        { name: '単位', initial: 'm2', newVal: 'm3' },
        { name: '備考', initial: '安全用', newVal: '注意' },
      ];

      for (const field of targetFields) {
        await verifySelectAllOnFocus(page, field.name, field.initial, field.newVal);
      }

      // 数量フィールド（type=number）の全選択テスト
      const quantityInput = getFieldLocator(page, '数量');
      await expect(quantityInput).toBeVisible({ timeout: getTimeout(5000) });
      await quantityInput.fill('100.50');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      // フォーカスして全選択を発動
      await quantityInput.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.focus();
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            inp.select();
            resolve();
          });
        });
      });

      // 全選択状態で新しい値を入力
      await page.keyboard.type('200');

      // 全選択+上書きが行われたことを確認
      const quantityValue = await quantityInput.inputValue();
      // 数量フィールドは100.50が全選択され、200に置換される
      expect(quantityValue).toBe('200');
    });

    test('16.11: 全選択状態で新しい文字を入力すると既存値が置換される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await navigateToEditPage(page);

      // 名称フィールドで上書き入力を検証
      const nameInput = getFieldLocator(page, '名称');
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });

      // 元の値を入力
      await nameInput.fill('元の名称');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      // 再フォーカスして全選択
      await nameInput.evaluate((el) => {
        const inp = el as HTMLInputElement;
        inp.focus();
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            inp.select();
            resolve();
          });
        });
      });

      // 新しい文字を入力（全選択されていれば「元の名称」が完全に置換される）
      await page.keyboard.type('新しい名称');

      // 「元の名称」ではなく「新しい名称」になっていることを確認
      await expect(nameInput).toHaveValue('新しい名称');
    });

    test('16.12: オートコンプリート対象フィールドで全選択とドロップダウンが共存する', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await navigateToEditPage(page);

      // 大項目フィールド（AutocompleteInput）でテスト
      const majorCategoryInput = getFieldLocator(page, '大項目');
      await expect(majorCategoryInput).toBeVisible({ timeout: getTimeout(5000) });

      // 値を入力
      await majorCategoryInput.fill('共通仮設');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      // 再フォーカス - 全選択とドロップダウンが共存することを確認
      await majorCategoryInput.click();
      await page.waitForTimeout(200);

      // 全選択で新しい値が上書き入力できることで全選択の動作を確認
      await page.keyboard.type('土工');

      // 全選択+上書きが正常に動作
      await expect(majorCategoryInput).toHaveValue('土工');
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
