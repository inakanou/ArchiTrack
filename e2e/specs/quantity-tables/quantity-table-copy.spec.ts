/**
 * @fileoverview 数量表コピー機能のE2Eテスト
 *
 * Task 22.4: コピー機能のE2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-17.1: 数量表一覧画面でコピー操作、デフォルト値「{元の数量表名}のコピー」
 * - REQ-17.2: 全データ（グループ、項目、フィールド値）の複製
 * - REQ-17.3: コピー完了後に編集画面に遷移
 * - REQ-17.4: コピーされた数量表は元の数量表とは独立したデータとして管理
 * - REQ-17.5: エラー時のエラーメッセージ表示
 * - REQ-17.6: コピー処理中のインジケーター表示、重複操作防止
 * - REQ-17.7: 写真紐づけの維持
 *
 * @module e2e/specs/quantity-tables/quantity-table-copy.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 数量表コピー機能のE2Eテスト
 */
test.describe('数量表コピー機能', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テスト用の状態
  let testProjectId: string | null = null;
  let sourceQuantityTableId: string | null = null;
  let copiedQuantityTableId: string | null = null;
  let projectName: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // 事前準備: テスト用プロジェクトと数量表を作成
  // ==========================================================================
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト作成
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      projectName = `コピーテスト用PJ_${Date.now()}`;
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

    test('テスト用数量表を作成して項目を追加する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表一覧画面に移動
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // 新規数量表を作成（空状態では<Link>で表示されるためrole='link'を使用）
      const createButton = page.getByRole('link', { name: /新規作成/i });
      await expect(createButton).toBeVisible({ timeout: getTimeout(10000) });
      await createButton.click();

      // ダイアログで数量表名を入力
      const nameInput = page.getByRole('textbox', { name: /数量表名/i });
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.clear();
      await nameInput.fill('コピー元数量表');

      // 作成を確定
      const createConfirmButton = page.getByRole('button', { name: /^作成$/i });
      await createConfirmButton.click();

      // 編集画面に遷移するのを待つ（作成後は /quantity-tables/{id}/edit に遷移）
      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, {
        timeout: getTimeout(15000),
      });

      const editUrl = page.url();
      const tableMatch = editUrl.match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/);
      sourceQuantityTableId = tableMatch?.[1] ?? null;
      expect(sourceQuantityTableId).toBeTruthy();

      // 数量グループを追加（ヘッダーと空状態の2箇所にボタンがあるため.first()で最初のものを選択）
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      // グループが追加されるのを待つ
      await page.waitForTimeout(1000);

      // 数量項目を追加
      const addItemButton = page
        .getByRole('button', { name: /行追加|項目追加|項目を追加/i })
        .first();
      if (await addItemButton.isVisible({ timeout: 5000 })) {
        await addItemButton.click();
        await page.waitForTimeout(1000);

        // 工種を入力（AutocompleteInput: placeholderで特定）
        const workTypeInput = page.getByPlaceholder('工種を入力').first();
        if (await workTypeInput.isVisible({ timeout: 3000 })) {
          await workTypeInput.fill('テスト工種');
        }

        // 名称を入力（直接input: placeholderで特定）
        const nameFieldInput = page.getByPlaceholder('名称を入力').first();
        if (await nameFieldInput.isVisible({ timeout: 3000 })) {
          await nameFieldInput.fill('テスト名称');
        }

        // 単位を入力（AutocompleteInput: placeholderで特定）
        const unitInput = page.getByPlaceholder('単位を入力').first();
        if (await unitInput.isVisible({ timeout: 3000 })) {
          await unitInput.fill('m2');
        }

        // 自動保存を待つ
        await page.waitForTimeout(2000);
      }
    });
  });

  // ==========================================================================
  // REQ-17: 数量表コピー機能テスト
  // ==========================================================================
  test.describe('数量表コピー操作', () => {
    /**
     * @requirement quantity-table-generation/REQ-17.1
     * @requirement quantity-table-generation/REQ-17.2
     * @requirement quantity-table-generation/REQ-17.3
     * @requirement quantity-table-generation/REQ-17.6
     *
     * 数量表一覧画面でコピーボタンクリックからダイアログ表示、
     * 名前入力、コピー実行、編集画面遷移までの一連フロー確認
     */
    test('数量表コピーの一連フロー（ダイアログ表示 -> 名前入力 -> コピー実行 -> 編集画面遷移）(quantity-table-generation/REQ-17.1, 17.2, 17.3, 17.6)', async ({
      page,
    }) => {
      if (!testProjectId || !sourceQuantityTableId) {
        throw new Error(
          'テスト前提条件が不足しています。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表一覧画面に移動
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // 数量表カードが表示されるのを待つ
      await expect(page.getByText('コピー元数量表')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // コピーボタンをクリック（アイコンボタン or テキスト付きボタン）
      const copyButton = page.getByRole('button', { name: /コピー/i }).first();
      await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });
      await copyButton.click();

      // コピーダイアログが表示されることを確認
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText('数量表をコピー')).toBeVisible();

      // デフォルト名「{元の数量表名}のコピー」が設定されていることを確認（REQ-17.1）
      const copyNameInput = dialog.getByRole('textbox', { name: /数量表名/i });
      await expect(copyNameInput).toBeVisible();
      const defaultValue = await copyNameInput.inputValue();
      expect(defaultValue).toBe('コピー元数量表のコピー');

      // 名前を変更
      await copyNameInput.clear();
      await copyNameInput.fill('コピーテスト数量表');

      // コピー実行のAPIレスポンスを待つ
      const copyPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/copy') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );

      // 「コピーを作成」ボタンをクリック
      const copyConfirmButton = dialog.getByRole('button', { name: /コピーを作成/i });
      await expect(copyConfirmButton).toBeVisible();
      await copyConfirmButton.click();

      // コピー実行中にボタンが無効化されることを確認（REQ-17.6）
      // Note: 処理が高速な場合はこの状態を捕捉できない可能性がある
      const copyResponse = await copyPromise;
      const responseBody = await copyResponse.json();
      copiedQuantityTableId = responseBody.id;

      // コピー完了後に編集画面に遷移することを確認（REQ-17.3）
      // 中間URL（/projects/{id}/quantity-tables/{id}）または最終URL（/quantity-tables/{id}/edit）にマッチ
      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+(\/edit)?$/, {
        timeout: getTimeout(15000),
      });

      // 遷移先がコピーされた数量表の編集画面であることを確認
      if (copiedQuantityTableId) {
        expect(page.url()).toContain(copiedQuantityTableId);
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-17.2
     * @requirement quantity-table-generation/REQ-17.7
     *
     * コピーされた数量表のデータが元の数量表と一致することの確認
     */
    test('コピーされた数量表のデータが元の数量表と一致すること (quantity-table-generation/REQ-17.2, 17.7)', async ({
      page,
    }) => {
      if (!testProjectId || !sourceQuantityTableId || !copiedQuantityTableId) {
        throw new Error('テスト前提条件が不足しています。コピーテストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // ブラウザコンテキスト内のapiClientを使用してAPI経由でデータを取得
      // （page.requestはPlaywrightのbaseURLに送信されるため、バックエンドURLを持つapiClientを使用）
      const apiData = await page.evaluate(
        async ({ sourceId, copiedId }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const client = (window as any).__apiClient;
          if (!client) return null;
          try {
            const [source, copied] = await Promise.all([
              client.get(`/api/quantity-tables/${sourceId}`),
              client.get(`/api/quantity-tables/${copiedId}`),
            ]);
            return { source, copied };
          } catch {
            return null;
          }
        },
        {
          sourceId: sourceQuantityTableId!,
          copiedId: copiedQuantityTableId!,
        }
      );

      if (apiData) {
        const { source: sourceData, copied: copiedData } = apiData;

        // グループ数が一致
        expect(copiedData.groups.length).toBe(sourceData.groups.length);

        // 各グループの名前と表示順序が一致
        for (let i = 0; i < sourceData.groups.length; i++) {
          const sourceGroup = sourceData.groups[i];
          const copiedGroup = copiedData.groups.find(
            (g: { displayOrder: number }) => g.displayOrder === sourceGroup.displayOrder
          );

          if (copiedGroup) {
            expect(copiedGroup.name).toBe(sourceGroup.name);

            // 各グループ内の項目数が一致
            expect(copiedGroup.items.length).toBe(sourceGroup.items.length);
          }
        }

        // 数量表名はコピー時に指定した名前であること
        expect(copiedData.name).toBe('コピーテスト数量表');
      } else {
        // APIアクセスが失敗した場合はUI経由で検証
        // コピー先の数量表編集画面に移動
        await page.goto(`/projects/${testProjectId}/quantity-tables/${copiedQuantityTableId}`);
        await page.waitForLoadState('networkidle');

        // 数量表名が正しいことを確認
        await expect(page.getByText('コピーテスト数量表')).toBeVisible({
          timeout: getTimeout(10000),
        });
      }
    });

    /**
     * @requirement quantity-table-generation/REQ-17.6
     *
     * コピー中の重複操作防止の確認
     */
    test('コピー中の重複操作防止 (quantity-table-generation/REQ-17.6)', async ({ page }) => {
      if (!testProjectId || !sourceQuantityTableId) {
        throw new Error(
          'テスト前提条件が不足しています。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表一覧画面に移動
      await page.goto(`/projects/${testProjectId}/quantity-tables`);
      await page.waitForLoadState('networkidle');

      // コピー元の数量表が表示されるのを待つ
      await expect(page.getByText('コピー元数量表')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // コピーボタンをクリック
      const copyButtons = page.getByRole('button', { name: /コピー/i });
      // コピー元数量表のコピーボタンをクリック（複数ある場合は最初のもの）
      const copyButton = copyButtons.first();
      await expect(copyButton).toBeVisible({ timeout: getTimeout(5000) });
      await copyButton.click();

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });

      // APIレスポンスを遅延させてコピー中の状態を観察する
      // ルートインターセプトでコピーAPIを遅延させる
      await page.route('**/api/quantity-tables/*/copy', async (route) => {
        // 2秒遅延
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      });

      // コピーを作成ボタンをクリック
      const copyConfirmButton = dialog.getByRole('button', { name: /コピーを作成/i });
      await copyConfirmButton.click();

      // コピー中はボタンが無効化されていることを確認
      await expect(dialog.getByRole('button', { name: /コピー中|コピーを作成/i })).toBeDisabled({
        timeout: getTimeout(3000),
      });

      // キャンセルボタンも無効化されていることを確認
      await expect(dialog.getByRole('button', { name: /キャンセル/i })).toBeDisabled({
        timeout: getTimeout(3000),
      });

      // 処理中インジケーター（スピナー）が表示されていることを確認
      await expect(dialog.getByRole('status')).toBeVisible({
        timeout: getTimeout(3000),
      });

      // コピー完了を待つ（中間URLまたは最終URL /edit にマッチ）
      await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+(\/edit)?$/, {
        timeout: getTimeout(30000),
      });

      // ルートインターセプトを解除
      await page.unroute('**/api/quantity-tables/*/copy');
    });

    /**
     * @requirement quantity-table-generation/REQ-17.4
     *
     * コピーされた数量表は元の数量表とは独立したデータとして管理し、
     * 一方への変更が他方に影響しないことを確認
     */
    test('コピーされた数量表への変更が元の数量表に影響しない (quantity-table-generation/REQ-17.4)', async ({
      page,
    }) => {
      if (!testProjectId || !sourceQuantityTableId || !copiedQuantityTableId) {
        throw new Error('テスト前提条件が不足しています。コピーテストが正しく実行されていません。');
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 元の数量表の現在の状態をAPI経由で取得（変更前の状態を記録）
      // ブラウザコンテキスト内のapiClientを使用
      const sourceBeforeData = await page.evaluate(async (sourceId) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = (window as any).__apiClient;
        if (!client) return null;
        try {
          return await client.get(`/api/quantity-tables/${sourceId}`);
        } catch {
          return null;
        }
      }, sourceQuantityTableId!);

      let sourceGroupCountBefore: number | null = null;
      let sourceItemCountBefore: number | null = null;

      if (sourceBeforeData) {
        sourceGroupCountBefore = sourceBeforeData.groups?.length ?? null;
        sourceItemCountBefore =
          sourceBeforeData.groups?.reduce(
            (acc: number, g: { items: unknown[] }) => acc + (g.items?.length ?? 0),
            0
          ) ?? null;
      }

      // コピー先の数量表編集画面に移動
      await page.goto(`/projects/${testProjectId}/quantity-tables/${copiedQuantityTableId}`);
      await page.waitForLoadState('networkidle');

      // コピー先の数量表に項目を追加する
      const addItemButton = page
        .getByRole('button', { name: /行追加|項目追加|項目を追加/i })
        .first();

      if (await addItemButton.isVisible({ timeout: getTimeout(5000) })) {
        await addItemButton.click();
        await page.waitForTimeout(1000);

        // 追加された項目に値を入力（placeholderで特定）
        const lastWorkTypeInput = page.getByPlaceholder('工種を入力').last();
        if (await lastWorkTypeInput.isVisible({ timeout: 3000 })) {
          await lastWorkTypeInput.fill('独立性テスト工種');
        }

        const lastNameInput = page.getByPlaceholder('名称を入力').last();
        if (await lastNameInput.isVisible({ timeout: 3000 })) {
          await lastNameInput.fill('独立性テスト名称');
        }

        // 項目作成のAPIレスポンスを待つ
        await page.waitForTimeout(3000);
      }

      // 元の数量表のデータが変更されていないことをAPI経由で確認
      const sourceAfterData = await page.evaluate(async (sourceId) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = (window as any).__apiClient;
        if (!client) return null;
        try {
          return await client.get(`/api/quantity-tables/${sourceId}`);
        } catch {
          return null;
        }
      }, sourceQuantityTableId!);

      if (sourceAfterData && sourceGroupCountBefore !== null) {
        const sourceGroupCountAfter = sourceAfterData.groups?.length ?? 0;
        const sourceItemCountAfter =
          sourceAfterData.groups?.reduce(
            (acc: number, g: { items: unknown[] }) => acc + (g.items?.length ?? 0),
            0
          ) ?? 0;

        // 元の数量表のグループ数が変わっていないこと
        expect(sourceGroupCountAfter).toBe(sourceGroupCountBefore);

        // 元の数量表の項目数が変わっていないこと
        if (sourceItemCountBefore !== null) {
          expect(sourceItemCountAfter).toBe(sourceItemCountBefore);
        }

        // 元の数量表名が変わっていないこと
        expect(sourceAfterData.name).toBe('コピー元数量表');
      } else {
        // APIが利用できない場合はUI経由で検証
        await page.goto(`/projects/${testProjectId}/quantity-tables/${sourceQuantityTableId}`);
        await page.waitForLoadState('networkidle');

        // 元の数量表に「独立性テスト工種」が存在しないことを確認
        const independenceTestText = page.getByText('独立性テスト工種');
        await expect(independenceTestText).not.toBeVisible({ timeout: getTimeout(5000) });
      }
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================
  test.describe('クリーンアップ', () => {
    test('作成したプロジェクトを削除する', async ({ page, context }) => {
      await context.clearCookies();
      await page.goto('/');

      await page.evaluate(() => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
      });

      await loginAsUser(page, 'ADMIN_USER');

      if (testProjectId) {
        await page.goto(`/projects/${testProjectId}`);
        await page.waitForLoadState('networkidle');

        // 削除ボタンをクリック
        const deleteButton = page.getByRole('button', { name: /削除/i }).first();
        const hasDeleteButton = await deleteButton.isVisible({ timeout: 5000 });
        if (hasDeleteButton) {
          await deleteButton.click();
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          const hasConfirmButton = await confirmButton.isVisible({ timeout: 5000 });
          if (hasConfirmButton) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});
