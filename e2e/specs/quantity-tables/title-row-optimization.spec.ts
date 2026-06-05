/**
 * @fileoverview タイトル行表示最適化のE2Eテスト
 *
 * Task 24.3: タイトル行表示最適化のE2Eテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-18.1: メインのタイトル行を数量グループの一番上にのみ表示する
 * - REQ-18.2: 数量グループ内の2行目以降の数量項目にはメインのタイトル行を繰り返し表示しない
 * - REQ-18.3: 面積・体積計算用フィールドのタイトル行は該当する計算用フィールド群とセットで表示する
 * - REQ-18.4: ピッチ計算用フィールドのタイトル行は該当する計算用フィールド群とセットで表示する
 * - REQ-18.5: 折りたたみ/再展開後にタイトル行の表示ルールが維持される
 *
 * @module e2e/specs/quantity-tables/title-row-optimization.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';

/**
 * タイトル行表示最適化のE2Eテスト
 */
test.describe('タイトル行表示最適化', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テスト用の状態
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

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

      const projectName = `タイトル行テスト_${Date.now()}`;
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

    test('テスト用数量表を作成して複数の項目を追加する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表新規作成ページに遷移
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      // 名前を入力
      const nameInput = page.getByLabel(/数量表名/i);
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.fill('タイトル行テスト用数量表');

      // 作成ボタンをクリック
      const createButton = page.getByRole('button', { name: /^作成$/i });
      await createButton.click();

      // 編集画面に遷移
      await page.waitForURL(/\/quantity-tables\/[^/]+\/edit/, { timeout: getTimeout(15000) });
      const editUrl = page.url();
      const match = editUrl.match(/\/quantity-tables\/([a-f0-9-]+)\/edit/);
      createdQuantityTableId = match?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループを追加する（デフォルトではグループが存在しない）。
      // REQ-42 移行: グループ/項目追加はクライアントドラフトのみを更新するため、
      // 永続化 API（POST /groups, POST /items）は発火しない。後続テストは編集画面へ
      // 再ナビゲートして 2 項目の存在を前提とするため、追加後に明示保存して永続化する。
      const addGroupButton = page.getByRole('button', { name: /グループを追加/ }).first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(5000) });
      await addGroupButton.click();

      // グループが追加されたことを確認
      await expect(page.getByTestId('quantity-group')).toHaveCount(1, {
        timeout: getTimeout(10000),
      });

      // 項目を2つ追加する（2行目以降のタイトル行非表示を検証するため）
      const addItemButton = page.getByRole('button', { name: /項目を追加/ }).first();
      await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });

      // 1つ目の項目を追加
      await addItemButton.click();
      await expect(page.getByTestId('quantity-item-row')).toHaveCount(1, {
        timeout: getTimeout(5000),
      });

      // 2つ目の項目を追加
      await addItemButton.click();
      await expect(page.getByTestId('quantity-item-row')).toHaveCount(2, {
        timeout: getTimeout(5000),
      });

      // 保存時の整合性チェック（項目名必須）を満たすため、各項目に名称を付与する。
      const itemRows = page.getByTestId('quantity-item-row');
      const itemCount = await itemRows.count();
      for (let i = 0; i < itemCount; i++) {
        const nameInput = itemRows.nth(i).locator('input[id$="-name"]').first();
        await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
        await nameInput.fill(`タイトル行テスト項目${i + 1}`);
        await nameInput.blur();
      }

      // REQ-42.5: 後続テストが再ナビゲートで参照できるよう明示保存して永続化する。
      await saveQuantityTableDraft(page);
    });
  });

  // ==========================================================================
  // REQ-18.1: メインタイトル行がグループ先頭に1つだけ表示される
  // ==========================================================================
  test.describe('REQ-18.1: メインタイトル行の表示', () => {
    test('数量表編集画面で各グループの先頭にメインタイトル行が1つだけ表示されている', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // タイトル行が表示されることを確認
      const titleRows = page.getByTestId('quantity-group-title-row');
      const titleRowCount = await titleRows.count();

      // 数量グループが1つなので、タイトル行も1つだけ
      expect(titleRowCount).toBe(1);

      // タイトル行に必須列テキストが含まれている
      const titleRow = titleRows.first();
      await expect(titleRow.getByText('大項目')).toBeVisible();
      await expect(titleRow.getByText('工種')).toBeVisible();
      await expect(titleRow.getByText('名称')).toBeVisible();
      await expect(titleRow.getByText('数量')).toBeVisible();
      await expect(titleRow.getByText('単位')).toBeVisible();
      await expect(titleRow.getByText('備考')).toBeVisible();
      await expect(titleRow.getByText('計算方法')).toBeVisible();
    });
  });

  // ==========================================================================
  // REQ-18.2: 2行目以降にメインタイトル行が繰り返し表示されない
  // ==========================================================================
  test.describe('REQ-18.2: 2行目以降のタイトル行非表示', () => {
    test('2行目以降の数量項目にメインタイトル行が繰り返し表示されない', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 数量項目行が2つあることを確認
      const itemRows = page.getByTestId('quantity-item-row');
      const itemRowCount = await itemRows.count();
      expect(itemRowCount).toBeGreaterThanOrEqual(2);

      // タイトル行は1つだけ（グループ先頭のみ）
      const titleRows = page.getByTestId('quantity-group-title-row');
      expect(await titleRows.count()).toBe(1);

      // 各項目行内にメインフィールドラベル（label要素としての「大項目」等）がないことを確認
      // 項目行内のlabel要素をチェック
      for (let i = 0; i < itemRowCount; i++) {
        const row = itemRows.nth(i);
        // label要素のテキストを取得してメインフィールドラベルが含まれていないことを確認
        const labels = row.locator('label');
        const labelCount = await labels.count();
        for (let j = 0; j < labelCount; j++) {
          const labelText = await labels.nth(j).textContent();
          // メインフィールドのラベルが表示されていないことを確認
          expect(labelText).not.toContain('大項目');
          expect(labelText).not.toContain('中項目');
          expect(labelText).not.toContain('小項目');
          expect(labelText).not.toContain('任意分類');
        }
      }
    });
  });

  // ==========================================================================
  // REQ-18.3, REQ-18.4: 計算用フィールドのタイトル行は各項目に表示される
  // ==========================================================================
  test.describe('REQ-18.3/18.4: 計算用フィールドのタイトル行表示', () => {
    test('面積・体積/ピッチ計算用フィールドのタイトル行が各項目に表示される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 1つ目の項目の計算方法を「面積・体積」に変更
      const itemRows = page.getByTestId('quantity-item-row');
      const itemRowCount = await itemRows.count();

      if (itemRowCount === 0) {
        throw new Error(
          'REQ-18.3: 数量項目が存在しません。事前準備テストが正しく実行されていません。'
        );
      }

      // 計算方法セレクトボックスを取得して「面積・体積」に変更
      const calcMethodSelect = page.getByLabel(/計算方法/).first();
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 面積・体積計算用フィールドのラベルが表示されることを確認（REQ-18.3）
      // CalculationFieldsコンポーネントが表示する
      await expect(page.getByText('幅（W）')).toBeVisible({ timeout: getTimeout(5000) });
      await expect(page.getByText('奥行き（D）')).toBeVisible();
      await expect(page.getByText('高さ（H）')).toBeVisible();

      // メインタイトル行は変わらず1つだけ
      expect(await page.getByTestId('quantity-group-title-row').count()).toBe(1);

      // 2つ目の項目がある場合、そちらも「ピッチ」に変更してテスト
      if (itemRowCount >= 2) {
        const secondCalcMethodSelect = page.getByLabel(/計算方法/).nth(1);
        await expect(secondCalcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
        await secondCalcMethodSelect.selectOption({ value: 'PITCH' });

        // ピッチ計算用フィールドのラベルが表示されることを確認（REQ-18.4）
        await expect(page.getByText('範囲長')).toBeVisible({ timeout: getTimeout(5000) });
        await expect(page.getByText('端長1')).toBeVisible();
        await expect(page.getByText('端長2')).toBeVisible();
        await expect(page.getByText('ピッチ長')).toBeVisible();
      }

      // メインタイトル行は依然として1つだけ
      expect(await page.getByTestId('quantity-group-title-row').count()).toBe(1);
    });
  });

  // ==========================================================================
  // REQ-18.5: 折りたたみ・再展開後のタイトル行表示ルール維持
  // ==========================================================================
  test.describe('REQ-18.5: 折りたたみ・再展開後のタイトル行', () => {
    test('グループ折りたたみ・再展開後にタイトル行の表示ルールが維持される', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。数量表作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 初期状態: タイトル行が1つ表示されている
      const titleRows = page.getByTestId('quantity-group-title-row');
      expect(await titleRows.count()).toBe(1);

      // グループを折りたたむ
      const toggleButton = page.getByRole('button', { name: /グループを折りたたむ/ }).first();
      const isToggleVisible = await toggleButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (!isToggleVisible) {
        throw new Error(
          'REQ-18.5: 折りたたみボタンが見つかりません。グループの折りたたみ機能が正しく実装されていません。'
        );
      }

      await toggleButton.click();

      // 折りたたみ後: タイトル行が見えなくなっている
      const expandButton = page.getByRole('button', { name: /グループを展開/ }).first();
      await expect(expandButton).toBeVisible({ timeout: getTimeout(3000) });

      // 再展開
      await expandButton.click();

      // 再展開後: タイトル行が復帰していることを確認
      await expect(titleRows.first()).toBeVisible({ timeout: getTimeout(5000) });
      expect(await titleRows.count()).toBe(1);

      // 再展開後も項目行のメインフィールドラベルは非表示
      const itemRows = page.getByTestId('quantity-item-row');
      const itemRowCount = await itemRows.count();

      for (let i = 0; i < itemRowCount; i++) {
        const row = itemRows.nth(i);
        const labels = row.locator('label');
        const labelCount = await labels.count();
        for (let j = 0; j < labelCount; j++) {
          const labelText = await labels.nth(j).textContent();
          expect(labelText).not.toContain('大項目');
          expect(labelText).not.toContain('中項目');
        }
      }

      // タイトル行の列テキストも正しく表示されている
      const titleRow = titleRows.first();
      await expect(titleRow.getByText('大項目')).toBeVisible();
      await expect(titleRow.getByText('工種')).toBeVisible();
      await expect(titleRow.getByText('名称')).toBeVisible();
      await expect(titleRow.getByText('数量')).toBeVisible();
    });
  });

  // ==========================================================================
  // クリーンアップ: テスト用データを削除
  // ==========================================================================
  test.describe('クリーンアップ', () => {
    test('テスト用数量表とプロジェクトを削除する', async ({ page }) => {
      if (!testProjectId) {
        // テスト用プロジェクトが作成されなかった場合はスキップ
        return;
      }

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクト詳細画面からプロジェクトを削除
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      // 削除ボタンがある場合は削除（テストデータのクリーンアップ）
      const deleteButton = page.getByRole('button', { name: /削除/i });
      const isDeleteVisible = await deleteButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (isDeleteVisible) {
        await deleteButton.click();

        // 確認ダイアログが表示される場合
        const confirmButton = page.getByRole('button', { name: /確認|はい|削除する/i });
        const isConfirmVisible = await confirmButton
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        if (isConfirmVisible) {
          await confirmButton.click();
        }
      }
    });
  });
});
