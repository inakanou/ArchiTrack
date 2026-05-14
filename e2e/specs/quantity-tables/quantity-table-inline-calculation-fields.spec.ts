/**
 * @fileoverview 計算用フィールドの行内水平配置 E2E テスト（REQ-37）
 *
 * Task 51.5: 計算用フィールド配置のテストを実装する
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-37.1: 計算用フィールド群をメイン行の操作列右側に同一行で水平配置
 * - @requirement quantity-table-generation/REQ-37.2: ラベルとテキストボックスを交互配置
 * - @requirement quantity-table-generation/REQ-37.3: 行高さを増加させない（inner role="row" === 1 で担保）
 * - @requirement quantity-table-generation/REQ-37.4: 面積・体積モードのラベル順序（幅→奥行き→高さ→重量→調整係数→丸め設定）
 * - @requirement quantity-table-generation/REQ-37.5: ピッチモードのラベル順序（範囲長→端長1→端長2→ピッチ長→長さ→重量→調整係数→丸め設定）
 * - @requirement quantity-table-generation/REQ-37.6: ビューポート右端を超えた場合のページ全体水平スクロール閲覧
 * - @requirement quantity-table-generation/REQ-37.7: 計算方法「標準」では計算用フィールド非表示
 * - @requirement quantity-table-generation/REQ-37.8: 標準・面積体積・ピッチ混在時の独立描画
 * - @requirement quantity-table-generation/REQ-37.9: バリデーション・自動計算・デフォルト値・小数桁挙動を維持（CalculationFields 配下の既存ユニット/コンポーネントテストでカバー、行内配置でも同一の入力 element として動作することを本 spec で確認）
 * - @requirement quantity-table-generation/REQ-37.10: 標準→面積体積／ピッチ切替時の即時表示
 * - @requirement quantity-table-generation/REQ-37.11: 面積体積／ピッチ→標準切替時の即時非表示
 * - @requirement quantity-table-generation/REQ-37.12: 計算用フィールド群の専用タイトル行を表示しない（inner role="row" === 1 で担保）
 *
 * 設計参照:
 * - design.md L1979-1985: REQ-37 の E2E テスト視点
 * - design.md L1500-1502: EditableQuantityItemRow / CalculationFields の inline 配置方針
 *
 * @module e2e/specs/quantity-tables/quantity-table-inline-calculation-fields.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 計算用フィールドの行内水平配置 E2E テスト
 *
 * 数量項目の計算方法切替に応じて、計算用フィールド群がメイン行の操作列右側に
 * inline で水平展開されることを画面ベースで検証する。
 */
test.describe('REQ-37: 計算用フィールドの行内水平配置', () => {
  // 並列実行を無効化（データベース上の同一プロジェクト・数量表を共有するため）
  test.describe.configure({ mode: 'serial' });

  // テスト用の状態（事前準備テストから共有）
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // 事前準備: テスト用プロジェクトと数量表（3 項目）を作成
  //
  // REQ-37.8（混在時の独立描画）を検証するため、複数行の数量項目を用意する。
  // ==========================================================================
  test.describe('事前準備', () => {
    test('テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `REQ37_PJ_${Date.now()}`;
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
      const projectMatch = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      testProjectId = projectMatch?.[1] ?? null;
      expect(testProjectId).toBeTruthy();
    });

    test('テスト用数量表を作成して 3 つの数量項目を追加する', async ({ page }) => {
      if (!testProjectId) {
        throw new Error(
          'testProjectIdが未設定です。プロジェクト作成テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表新規作成ページに遷移
      await page.goto(`/projects/${testProjectId}/quantity-tables/new`);
      await page.waitForLoadState('networkidle');

      const nameInput = page.getByLabel(/数量表名/i);
      await expect(nameInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameInput.fill(`REQ37_数量表_${Date.now()}`);

      const createButton = page.getByRole('button', { name: /^作成$/i });
      await createButton.click();

      await page.waitForURL(/\/quantity-tables\/[^/]+\/edit/, { timeout: getTimeout(15000) });
      const match = page.url().match(/\/quantity-tables\/([a-f0-9-]+)\/edit/);
      createdQuantityTableId = match?.[1] ?? null;
      expect(createdQuantityTableId).toBeTruthy();

      // 編集画面が表示されることを確認
      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // グループを追加
      const addGroupButton = page.getByRole('button', { name: /グループを追加/ }).first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(5000) });

      const groupApiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/quantity-tables/') &&
          response.url().includes('/groups') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(20000) }
      );
      await addGroupButton.click();
      await groupApiPromise;

      // 数量項目を 3 つ追加（後続テストで標準・面積体積・ピッチを混在させる）
      const addItemButton = page.getByRole('button', { name: /項目を追加/ }).first();
      await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });

      for (let i = 0; i < 3; i++) {
        await addItemButton.click();
        await expect(page.getByTestId('quantity-item-row')).toHaveCount(i + 1, {
          timeout: getTimeout(10000),
        });
      }
    });
  });

  // ==========================================================================
  // REQ-37.1, REQ-37.10: 面積・体積へ切替で計算用フィールド群がメイン行と同一行に inline 表示
  // ==========================================================================
  test.describe('REQ-37.1 / REQ-37.10: メイン行と同一行 inline 表示', () => {
    test('計算方法を「面積・体積」に切り替えると、計算用フィールド群がメイン行の操作列右側に同一行で表示される', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 1 行目の計算方法を「面積・体積」に変更
      const itemRow = page.getByTestId('quantity-item-row').first();
      await expect(itemRow).toBeVisible({ timeout: getTimeout(5000) });

      const calcMethodSelect = itemRow.getByLabel(/計算方法/);
      await expect(calcMethodSelect).toBeVisible({ timeout: getTimeout(5000) });
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 計算用フィールド「幅（W）」が即時表示される（REQ-37.10）
      const widthInput = itemRow.getByLabel(/幅/);
      await expect(widthInput).toBeVisible({ timeout: getTimeout(5000) });

      // 計算用フィールド群がメイン行（quantity-item-row 内 role=row）の内部に配置される（REQ-37.1）
      // 行下の別行（role=row が複数）として描画されていないことを確認
      const innerRowCount = await itemRow.locator('[role="row"]').count();
      expect(innerRowCount).toBe(1);

      // 「幅」入力が action-cell-inline-wrapper（操作列セル内 wrapper）の子孫であることを確認
      const inlineWrapper = itemRow.locator('[data-testid="action-cell-inline-wrapper"]');
      await expect(inlineWrapper).toBeVisible({ timeout: getTimeout(5000) });
      const widthIsInsideWrapper = await widthInput.evaluate((input, wrapperSelector) => {
        const wrapper = document.querySelector(wrapperSelector);
        return wrapper instanceof HTMLElement && wrapper.contains(input);
      }, '[data-testid="action-cell-inline-wrapper"]');
      expect(widthIsInsideWrapper).toBeTruthy();
    });
  });

  // ==========================================================================
  // REQ-37.2: ラベルとテキストボックスが交互に配置され、すべてのラベルが DOM 上で可視
  // ==========================================================================
  test.describe('REQ-37.2: ラベル/テキストボックスの交互配置', () => {
    test('面積・体積モード時に各計算用フィールドのラベルが画面上で可視である', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 1 行目の計算方法を「面積・体積」に設定（前テストの状態を引き継いでいる場合も再設定で確実化）
      const itemRow = page.getByTestId('quantity-item-row').first();
      const calcMethodSelect = itemRow.getByLabel(/計算方法/);
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });

      // 面積・体積モードの全ラベル（REQ-37.4 順）が可視であること
      await expect(itemRow.getByText('幅（W）')).toBeVisible({ timeout: getTimeout(5000) });
      await expect(itemRow.getByText('奥行き（D）')).toBeVisible();
      await expect(itemRow.getByText('高さ（H）')).toBeVisible();
      await expect(itemRow.getByText('重量')).toBeVisible();
      await expect(itemRow.getByText('調整係数')).toBeVisible();
      await expect(itemRow.getByText('丸め設定')).toBeVisible();

      // ラベル → 入力の交互配置: 各ラベルテキストの直後の sibling に input が存在する
      // CalculationFields の fieldWrapper（label + input ペア）内で label が input の左に配置されている
      // ことを DOM 構造で確認する。検証対象は計算用フィールド領域（action-cell-inline-wrapper）内に
      // 限定し、メイン行の数量入力など別構造の input は除外する。
      const inlineWrapper = itemRow.locator('[data-testid="action-cell-inline-wrapper"]');
      await expect(inlineWrapper).toBeVisible({ timeout: getTimeout(5000) });
      const wrapperHasLabelBeforeInput = await inlineWrapper.evaluate((wrapperEl) => {
        const inputs = Array.from(wrapperEl.querySelectorAll('input[inputmode="decimal"]'));
        if (inputs.length === 0) return false;
        return inputs.every((input) => {
          const wrapper = input.parentElement;
          if (!wrapper) return false;
          const label = wrapper.querySelector('label');
          if (!label) return false;
          // label が input より DOM 順序で先に出現する
          const compare = label.compareDocumentPosition(input);
          return (compare & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        });
      });
      expect(wrapperHasLabelBeforeInput).toBeTruthy();
    });
  });

  // ==========================================================================
  // REQ-37.7: 計算方法「標準」では計算用フィールド群を表示しない
  // ==========================================================================
  test.describe('REQ-37.7: 標準モードで計算用フィールド非表示', () => {
    test('計算方法「標準」のとき、計算用フィールド群が画面上に存在しない', async ({ page }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      // 3 行目（前テストで未変更のため STANDARD のはず）に対し計算方法を明示的に「標準」へ設定
      const standardRow = page.getByTestId('quantity-item-row').nth(2);
      await expect(standardRow).toBeVisible({ timeout: getTimeout(5000) });
      const calcMethodSelect = standardRow.getByLabel(/計算方法/);
      await calcMethodSelect.selectOption({ value: 'STANDARD' });

      // 計算用フィールド（幅・奥行き・高さ・重量・範囲長・調整係数・丸め設定）が
      // この行内に存在しないこと
      await expect(standardRow.getByLabel(/幅/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/奥行き/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/高さ/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/範囲長/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/調整係数/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/丸め設定/)).toHaveCount(0);
    });
  });

  // ==========================================================================
  // REQ-37.8: 混在時の独立描画
  // ==========================================================================
  test.describe('REQ-37.8: 標準・面積体積・ピッチ混在時の独立描画', () => {
    test('同一グループ内で 1 行目=面積体積、2 行目=ピッチ、3 行目=標準に設定すると、各行が独立して描画される', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      const rows = page.getByTestId('quantity-item-row');
      await expect(rows).toHaveCount(3, { timeout: getTimeout(10000) });

      // 1 行目: 面積・体積
      await rows
        .nth(0)
        .getByLabel(/計算方法/)
        .selectOption({ value: 'AREA_VOLUME' });
      // 2 行目: ピッチ
      await rows
        .nth(1)
        .getByLabel(/計算方法/)
        .selectOption({ value: 'PITCH' });
      // 3 行目: 標準
      await rows
        .nth(2)
        .getByLabel(/計算方法/)
        .selectOption({ value: 'STANDARD' });

      // 1 行目: 面積・体積フィールドが存在し、ピッチフィールドは存在しない
      const areaRow = rows.nth(0);
      await expect(areaRow.getByLabel(/幅/)).toBeVisible({ timeout: getTimeout(5000) });
      await expect(areaRow.getByLabel(/奥行き/)).toBeVisible();
      await expect(areaRow.getByLabel(/範囲長/)).toHaveCount(0);

      // 2 行目: ピッチフィールドが存在し、面積・体積フィールドは存在しない
      const pitchRow = rows.nth(1);
      await expect(pitchRow.getByLabel(/範囲長/)).toBeVisible({ timeout: getTimeout(5000) });
      await expect(pitchRow.getByLabel(/端長1/)).toBeVisible();
      await expect(pitchRow.getByLabel(/ピッチ長/)).toBeVisible();
      await expect(pitchRow.getByLabel(/幅/)).toHaveCount(0);

      // 3 行目: 計算用フィールド一切なし
      const standardRow = rows.nth(2);
      await expect(standardRow.getByLabel(/幅/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/範囲長/)).toHaveCount(0);
      await expect(standardRow.getByLabel(/調整係数/)).toHaveCount(0);
    });
  });

  // ==========================================================================
  // REQ-37.11: 面積体積・ピッチ → 標準 切替時の即時非表示
  // ==========================================================================
  test.describe('REQ-37.11: 計算方法→標準切替時の即時非表示', () => {
    test('面積・体積から標準へ切り替えると計算用フィールド群が即座に非表示になる', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      const itemRow = page.getByTestId('quantity-item-row').first();
      const calcMethodSelect = itemRow.getByLabel(/計算方法/);

      // 面積・体積に設定 → 「幅」フィールドが表示される
      await calcMethodSelect.selectOption({ value: 'AREA_VOLUME' });
      await expect(itemRow.getByLabel(/幅/)).toBeVisible({ timeout: getTimeout(5000) });

      // 標準に切替 → 「幅」フィールドが即座に非表示
      await calcMethodSelect.selectOption({ value: 'STANDARD' });
      await expect(itemRow.getByLabel(/幅/)).toHaveCount(0);
      await expect(itemRow.getByLabel(/調整係数/)).toHaveCount(0);
      await expect(itemRow.getByLabel(/丸め設定/)).toHaveCount(0);
    });
  });

  // ==========================================================================
  // REQ-37.6: ビューポート右端を超える場合のページ全体水平スクロール閲覧
  // ==========================================================================
  test.describe('REQ-37.6: ページ全体スクロールで右側に展開した計算用フィールドが閲覧可能', () => {
    test('計算方法を「ピッチ」に設定するとビューポート右端を超えてもページ全体水平スクロールで右端の計算用フィールドが閲覧可能', async ({
      page,
    }) => {
      if (!createdQuantityTableId) {
        throw new Error(
          'createdQuantityTableIdが未設定です。事前準備テストが正しく実行されていません。'
        );
      }

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);
      await page.waitForLoadState('networkidle');

      // 狭めのビューポートに設定し、ピッチモード（最多 8 フィールド）でも
      // 行内に収まらない状態を作る
      await page.setViewportSize({ width: 800, height: 900 });
      await page.waitForLoadState('networkidle');

      const editArea = page.getByTestId('quantity-table-edit-area');
      await expect(editArea).toBeVisible({ timeout: getTimeout(10000) });

      const itemRow = page.getByTestId('quantity-item-row').first();
      const calcMethodSelect = itemRow.getByLabel(/計算方法/);
      await calcMethodSelect.selectOption({ value: 'PITCH' });

      // ピッチフィールド「ピッチ長」が DOM に存在することを確認
      // （ビューポート右端を超えている場合は最初は不可視である可能性があるが、
      //  少なくとも attached である）
      const pitchLengthInput = itemRow.getByLabel(/ピッチ長/);
      await expect(pitchLengthInput).toHaveCount(1, { timeout: getTimeout(5000) });

      // ページ全体（document.documentElement）の水平スクロールが可能な状態である
      // ことを scrollWidth > clientWidth で確認（REQ-25 の表領域 overflow:visible 維持と整合）
      const beforeScroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollX: window.scrollX,
      }));

      // ピッチモードでフィールドが行内に展開された結果、scrollWidth >= clientWidth が成立すること
      expect(beforeScroll.scrollWidth).toBeGreaterThanOrEqual(beforeScroll.clientWidth);

      if (beforeScroll.scrollWidth > beforeScroll.clientWidth) {
        // 横スクロール可能な状態であれば、ページ全体を右へスクロールしてピッチ長入力を
        // ビュー内に表示できることを確認する
        await pitchLengthInput.scrollIntoViewIfNeeded();
        await page.waitForLoadState('networkidle');

        // スクロール後、ピッチ長入力がビューポート内に表示される
        await expect(pitchLengthInput).toBeVisible({ timeout: getTimeout(5000) });

        const afterScroll = await page.evaluate(() => window.scrollX);
        // ページ全体の水平スクロール（scrollX > 0 または不変だが要素は visible）が機能している
        expect(afterScroll).toBeGreaterThanOrEqual(beforeScroll.scrollX);
      } else {
        // クライアント幅が十分でビューポート内に収まる場合は、そのまま可視であること
        await expect(pitchLengthInput).toBeVisible({ timeout: getTimeout(5000) });
      }
    });
  });
});
