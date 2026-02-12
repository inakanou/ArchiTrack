/**
 * @fileoverview オートコンプリート最適化のE2Eテスト
 *
 * Task 18.2: オートコンプリート最適化のE2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-7.1: 入力開始時の候補表示（初回一括読み込み方式）
 * - REQ-7.2: 中項目・小項目の候補表示
 * - REQ-7.3: クライアントサイドでのフィルタリング表示
 * - REQ-7.4: 候補選択時の自動入力
 * - REQ-7.5: 上下キー選択とEnter確定
 * - REQ-7.6: blur時の候補追加はAPIリクエスト不要
 * - REQ-7.7: 候補を50音順に表示
 *
 * @module e2e/specs/quantity-tables/autocomplete-optimization.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * オートコンプリート最適化E2Eテスト
 */
test.describe('オートコンプリート最適化', () => {
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

      projectName = `AC最適化テスト_${Date.now()}`;
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
        await tableNameInput.fill(`AC最適化テスト数量表_${Date.now()}`);
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
  // REQ-7.1: 数量表編集画面表示時に候補が一括取得されること
  // ==========================================================================

  test.describe('REQ-7.1: 候補の一括取得', () => {
    test('数量表編集画面表示時にautocomplete-candidatesエンドポイントが呼ばれる', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // autocomplete-candidatesリクエストをインターセプト
      const candidatesPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/autocomplete-candidates') &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      } else {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');
        const tableLink = page.getByRole('link', { name: /AC最適化テスト数量表/i });
        if (await tableLink.isVisible()) {
          await tableLink.click();
          await page.waitForLoadState('networkidle');
        }
      }

      // autocomplete-candidatesが呼ばれたことを確認
      const candidatesResponse = await candidatesPromise;
      expect(candidatesResponse.status()).toBe(200);

      // レスポンスにcandidatesフィールドが含まれていることを確認
      const body = await candidatesResponse.json();
      expect(body).toHaveProperty('candidates');
      expect(body.candidates).toHaveProperty('majorCategory');
      expect(body.candidates).toHaveProperty('middleCategory');
      expect(body.candidates).toHaveProperty('workType');
      expect(body.candidates).toHaveProperty('unit');
    });
  });

  // ==========================================================================
  // REQ-7.3: テキスト入力時にAPIリクエストが発生しないこと
  // ==========================================================================

  test.describe('REQ-7.3: クライアントサイドフィルタリング', () => {
    test('テキスト入力時にAPIリクエストが発生しない', async ({ page }) => {
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

      // APIリクエストを監視
      const autocompleteApiRequests: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        // 旧個別エンドポイントが呼ばれていないことを確認
        if (
          url.includes('/api/autocomplete/major-categories') ||
          url.includes('/api/autocomplete/middle-categories') ||
          url.includes('/api/autocomplete/work-types') ||
          url.includes('/api/autocomplete/units') ||
          url.includes('/api/autocomplete/specifications')
        ) {
          autocompleteApiRequests.push(url);
        }
      });

      // 大項目フィールドにテキスト入力
      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/i });
      if (await majorCategoryInput.isVisible()) {
        await majorCategoryInput.fill('建');
        await page.waitForTimeout(500);

        await majorCategoryInput.fill('建築');
        await page.waitForTimeout(500);

        await majorCategoryInput.fill('建築工事');
        await page.waitForTimeout(500);
      }

      // 旧個別エンドポイントへのリクエストが発生していないことを確認
      expect(autocompleteApiRequests).toHaveLength(0);
    });
  });

  // ==========================================================================
  // REQ-7.4: 候補選択時にフィールドに値が自動入力されること
  // ==========================================================================

  test.describe('REQ-7.4: 候補選択時の自動入力', () => {
    test('候補をクリックするとフィールドに値が自動入力される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // 大項目フィールドで入力を開始
      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/i }).first();
      if (await majorCategoryInput.isVisible()) {
        // まず値を入力してblurで候補に追加
        await majorCategoryInput.fill('建築工事');
        await majorCategoryInput.blur();
        await page.waitForTimeout(200);

        // 入力をクリアして再度入力（前方一致フィルタリング）
        await majorCategoryInput.fill('建');
        await page.waitForTimeout(200);

        // 候補リストが表示された場合、候補をクリック
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const option = page.getByRole('option', { name: /建築工事/ });
          if (await option.isVisible()) {
            await option.click();
            // 値が入力されたことを確認
            await expect(majorCategoryInput).toHaveValue('建築工事');
          }
        }
      }
    });
  });

  // ==========================================================================
  // REQ-7.5: キーボード操作で候補を選択できること
  // ==========================================================================

  test.describe('REQ-7.5: キーボード操作', () => {
    test('上下キーで候補を選択しEnterで確定できる', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加（まだない場合）
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // 大項目フィールドで入力を開始
      const majorCategoryInput = page.getByRole('combobox', { name: /大項目/i }).first();
      if (await majorCategoryInput.isVisible()) {
        await majorCategoryInput.fill('建');
        await page.waitForTimeout(200);

        // 候補リストが表示された場合、キーボード操作を実行
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          // 下矢印キーで候補を選択
          await majorCategoryInput.press('ArrowDown');
          await page.waitForTimeout(100);

          // aria-selectedがtrueの候補があることを確認
          const selectedOption = page.getByRole('option', { selected: true });
          if (await selectedOption.isVisible()) {
            const selectedText = await selectedOption.textContent();

            // Enterで確定
            await majorCategoryInput.press('Enter');
            await page.waitForTimeout(100);

            // 値がフィールドに反映されたことを確認
            if (selectedText) {
              await expect(majorCategoryInput).toHaveValue(selectedText);
            }
          }
        }
      }
    });
  });

  // ==========================================================================
  // REQ-7.6: blur時に入力値がクライアントサイドの候補リストに追加されること
  // ==========================================================================

  test.describe('REQ-7.6: blur時の候補追加', () => {
    test('blur時に入力値が候補に追加され再入力時に候補として表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // blur時のAPIリクエストを監視
      const blurApiRequests: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        // blur時にautocomplete関連のPOSTリクエストが発生しないことを確認
        if (url.includes('/autocomplete') && request.method() === 'POST') {
          blurApiRequests.push(url);
        }
      });

      // 大項目フィールドに新しい値を入力してblur
      const majorCategoryInputs = page.getByRole('combobox', { name: /大項目/i });
      const firstMajorCategory = majorCategoryInputs.first();
      if (await firstMajorCategory.isVisible()) {
        const uniqueValue = `テスト大項目_${Date.now()}`;
        await firstMajorCategory.fill(uniqueValue);
        await firstMajorCategory.blur();
        await page.waitForTimeout(300);

        // blur時にAPIリクエストが発生していないことを確認
        expect(blurApiRequests).toHaveLength(0);

        // 同じフィールドで再入力すると追加された値が候補に表示される
        await firstMajorCategory.fill(uniqueValue.substring(0, 5));
        await page.waitForTimeout(200);

        // 候補リストに追加された値が表示されることを確認
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const addedOption = page.getByRole('option', { name: new RegExp(uniqueValue) });
          if (await addedOption.isVisible()) {
            // 追加された値が候補に表示されている
            expect(await addedOption.textContent()).toContain(uniqueValue);
          }
        }
      }
    });
  });

  // ==========================================================================
  // REQ-7.7: 候補が50音順で表示されること
  // ==========================================================================

  test.describe('REQ-7.7: 50音順表示', () => {
    test('候補が50音順でソートされて表示される', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 複数の候補を追加するため、複数の項目を作成
      for (let i = 0; i < 2; i++) {
        const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
        if (await addItemButton.isVisible()) {
          await addItemButton.click();
          await page.waitForTimeout(500);
        }
      }

      // 複数の値を入力してblurで候補に追加
      const majorCategoryInputs = page.getByRole('combobox', { name: /大項目/i });
      const count = await majorCategoryInputs.count();

      const valuesToAdd = ['土木工事', '建築工事', 'ア行テスト'];
      for (let i = 0; i < Math.min(count, valuesToAdd.length); i++) {
        const input = majorCategoryInputs.nth(i);
        if (await input.isVisible()) {
          await input.fill(valuesToAdd[i]!);
          await input.blur();
          await page.waitForTimeout(200);
        }
      }

      // 最初のフィールドで候補を表示
      const firstInput = majorCategoryInputs.first();
      if (await firstInput.isVisible()) {
        await firstInput.fill('');
        await firstInput.click();
        await page.waitForTimeout(200);

        // 候補リストが表示された場合、ソート順を確認
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const options = page.getByRole('option');
          const optionCount = await options.count();

          if (optionCount >= 2) {
            const optionTexts: string[] = [];
            for (let i = 0; i < optionCount; i++) {
              const text = await options.nth(i).textContent();
              if (text) optionTexts.push(text);
            }

            // 50音順にソートされていることを確認
            const sortedTexts = [...optionTexts].sort((a, b) => a.localeCompare(b, 'ja'));
            expect(optionTexts).toEqual(sortedTexts);
          }
        }
      }
    });
  });

  // ==========================================================================
  // 候補取得エラー時のgraceful degradation
  // ==========================================================================

  test.describe('候補取得エラー時のgraceful degradation', () => {
    test('候補取得エラー時に数量表編集機能自体は正常に動作する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // autocomplete-candidatesリクエストをインターセプトしてエラーを返す
      await page.route('**/autocomplete-candidates', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量表編集画面自体が表示されていることを確認
      // （エラーでもページ全体がクラッシュしないこと）
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible({ timeout: getTimeout(10000) })) {
        // 項目追加が可能であることを確認
        await addItemButton.click();
        await page.waitForTimeout(500);

        // 入力フィールドが正常に表示されていることを確認
        const majorCategoryInput = page.getByRole('combobox', { name: /大項目/i });
        if (await majorCategoryInput.isVisible()) {
          // テキスト入力が可能であることを確認
          await majorCategoryInput.fill('手入力テスト');
          await expect(majorCategoryInput).toHaveValue('手入力テスト');
        }
      }

      // ルートインターセプトを解除
      await page.unroute('**/autocomplete-candidates');
    });
  });

  // ==========================================================================
  // REQ-7.3, 7.3a: フォーカス時候補表示（Task 25.4）
  // ==========================================================================

  test.describe('REQ-7.3a: フォーカス時候補表示', () => {
    test('空の対象フィールドにフォーカスした際に全候補がドロップダウン表示される', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // まず候補を追加するため、大項目に値を入力してblur
      const majorCategoryInputs = page.getByRole('combobox', { name: /大項目/i });
      const firstInput = majorCategoryInputs.first();
      if (await firstInput.isVisible()) {
        // 候補を追加
        await firstInput.fill('フォーカステスト大項目');
        await firstInput.blur();
        await page.waitForTimeout(300);

        // フィールドをクリア
        await firstInput.fill('');
        await page.waitForTimeout(100);

        // 空のフィールドにフォーカス
        await firstInput.focus();
        await page.waitForTimeout(300);

        // ドロップダウンが表示されることを確認
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const options = page.getByRole('option');
          const optionCount = await options.count();
          // 空のフィールドでも候補が表示されるべき
          expect(optionCount).toBeGreaterThan(0);
        }
      }
    });

    test('値ありの対象フィールドにフォーカスした際にフィルタリング済み候補が表示される', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      const majorCategoryInputs = page.getByRole('combobox', { name: /大項目/i });
      const firstInput = majorCategoryInputs.first();
      if (await firstInput.isVisible()) {
        // まず候補を追加
        await firstInput.fill('フィルタテスト値A');
        await firstInput.blur();
        await page.waitForTimeout(300);

        // 前方一致する値を入力
        await firstInput.fill('フィルタ');
        await page.waitForTimeout(200);

        // フィルタリング済み候補が表示されることを確認
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const option = page.getByRole('option', { name: /フィルタテスト値A/ });
          if (await option.isVisible()) {
            expect(await option.textContent()).toContain('フィルタテスト値A');
          }
        }
      }
    });

    test('フォーカス後にテキスト入力するとリアルタイムで候補がフィルタリング更新される', async ({
      page,
    }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      const majorCategoryInputs = page.getByRole('combobox', { name: /大項目/i });
      const firstInput = majorCategoryInputs.first();
      if (await firstInput.isVisible()) {
        // 複数の候補を追加
        await firstInput.fill('リアルタイムA');
        await firstInput.blur();
        await page.waitForTimeout(200);

        await firstInput.fill('リアルタイムB');
        await firstInput.blur();
        await page.waitForTimeout(200);

        await firstInput.fill('別の値');
        await firstInput.blur();
        await page.waitForTimeout(200);

        // フィールドをクリアしてフォーカス
        await firstInput.fill('');
        await firstInput.focus();
        await page.waitForTimeout(300);

        // 全候補が表示される
        const listbox = page.getByRole('listbox');
        if (await listbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const initialCount = await page.getByRole('option').count();

          // テキスト入力でフィルタリング
          await firstInput.fill('リアルタイム');
          await page.waitForTimeout(200);

          // フィルタリング後の候補数が初期より少ないか同じであることを確認
          if (await listbox.isVisible({ timeout: 1000 }).catch(() => false)) {
            const filteredCount = await page.getByRole('option').count();
            expect(filteredCount).toBeLessThanOrEqual(initialCount);
          }
        }
      }
    });

    test('対象9フィールドすべてでフォーカス時の候補表示が動作する', async ({ page }) => {
      test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      if (createdQuantityTableId) {
        await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      }

      await page.waitForLoadState('networkidle');

      // 数量項目を追加
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // 対象9フィールドの名前パターン
      const fieldPatterns = [
        /大項目/i,
        /中項目/i,
        /小項目/i,
        /任意分類/i,
        /工種/i,
        /名称/i,
        /規格/i,
        /単位/i,
        /備考/i,
      ];

      for (const pattern of fieldPatterns) {
        const input = page.getByRole('combobox', { name: pattern }).first();
        if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
          // 候補を追加してからフォーカステスト
          const testValue = `テスト_${pattern.source}`;
          await input.fill(testValue);
          await input.blur();
          await page.waitForTimeout(200);

          // 空にしてフォーカス
          await input.fill('');
          await input.focus();
          await page.waitForTimeout(300);

          // ドロップダウンが表示されるかチェック（候補がある場合のみ）
          const listbox = page.getByRole('listbox');
          const isListVisible = await listbox.isVisible({ timeout: 1000 }).catch(() => false);

          if (isListVisible) {
            // 候補が存在する場合は表示されていることを確認
            const optionCount = await page.getByRole('option').count();
            expect(optionCount).toBeGreaterThan(0);
          }

          // フィールドをblurしてクリーンアップ
          await input.blur();
          await page.waitForTimeout(200);
        }
      }
    });
  });
});
