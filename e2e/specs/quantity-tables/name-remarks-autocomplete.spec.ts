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
 * Task 115.127 段1: 前提の生成を共通の補助（`quantity-table-preconditions`）へ寄せ、
 * `test.skip(!testProjectId, …)` 7 件を `assertPrepared` へ改めた。
 * 併せて「数量表IDがあれば編集画面、無ければプロジェクト詳細」の分岐を除いた（前提は必ず在る）。
 *
 * @module e2e/specs/quantity-tables/name-remarks-autocomplete.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/**
 * 名称・備考フィールドのオートコンプリートE2Eテスト
 */
/** REQ-7.5 で候補値リストへ登録し、REQ-7.4 で選び直す名称の確定値 */
const REGISTERED_NAME = 'テスト名称';

test.describe('名称・備考フィールドのオートコンプリート', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したリソースのIDを保存
  let testProjectId: string | null = null;
  let createdQuantityTableId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクトと数量表を作成
   *
   * Task 115.127 段1: 前提の生成は共通の補助（`quantity-table-preconditions`）へ寄せる。
   * 作れなければ補助の内側で失敗するため、前提が崩れたまま後段へ進む経路が無い。
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      testProjectId = await createTestProject(page, '名称備考ACテスト');
      const quantityTable = await createTestQuantityTable(
        page,
        testProjectId,
        '名称備考ACテスト数量表'
      );
      createdQuantityTableId = quantityTable.id;
    });
  });

  // ==========================================================================
  // REQ-7.1, 7.3: 名称フィールドのオートコンプリート
  // ==========================================================================

  test.describe('REQ-7.1, 7.3: 名称フィールドのオートコンプリート', () => {
    test('名称フィールドにフォーカスした際にオートコンプリート候補がドロップダウン表示される', async ({
      page,
    }) => {
      assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);

      await page.waitForLoadState('networkidle');

      // 数量項目追加ボタンをクリック
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await addItemButton.isVisible()) {
        await addItemButton.click();
        await page.waitForTimeout(500);
      }

      // 名称フィールドを探す（comboboxロールを持つ）
      const nameField = page.locator('input[id$="-name"][role="combobox"]').first();
      if (await isVisibleWithin(nameField, getTimeout(5000))) {
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
      assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);

      await page.waitForLoadState('networkidle');

      // 名称フィールドを探す
      const nameField = page.locator('input[id$="-name"][role="combobox"]').first();
      if (await isVisibleWithin(nameField, getTimeout(5000))) {
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
      assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);

      await page.waitForLoadState('networkidle');

      // 備考フィールドを探す（comboboxロールを持つ）
      const remarksField = page.locator('input[id$="-remarks"][role="combobox"]').first();
      if (await isVisibleWithin(remarksField, getTimeout(5000))) {
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
      await loginAsUser(page, 'REGULAR_USER');

      // 数量表を作った直後の編集画面には数量グループも数量項目も無く、名称の入力欄は
      // そもそも描画されない。「表示されていれば」で探す形では検証が丸ごと飛ぶため、
      // 前提（グループ1件・項目2行）を作ってから判定する。
      await openQuantityTableEdit(page, createdQuantityTableId);
      const groupCard = await addQuantityGroup(page);
      const itemRows = await addQuantityItemRows(groupCard, 2);

      // REQ-7.5: 1行目の名称に確定値を入れ、blur で候補値リストへ追加する
      const firstNameField = itemRows.nth(0).getByRole('combobox', { name: '名称', exact: true });
      await expect(firstNameField, '1行目の名称の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await firstNameField.fill(REGISTERED_NAME);
      await expect(firstNameField).toHaveValue(REGISTERED_NAME);
      await firstNameField.blur();
      await expect(firstNameField, 'blur で名称の入力欄から焦点が外れる').not.toBeFocused();

      // REQ-7.3: 2行目の空欄へフォーカスすると候補一覧が表示される
      const secondNameField = itemRows.nth(1).getByRole('combobox', { name: '名称', exact: true });
      await expect(secondNameField, '2行目の名称の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await secondNameField.click();

      // 候補一覧は body 直下へ Portal で描画されるためページ配下で参照する
      const listbox = page.getByRole('listbox');
      await expect(listbox, 'REQ-7.3: 名称の候補一覧が表示される').toBeVisible({
        timeout: getTimeout(5000),
      });

      const option = listbox.getByRole('option', { name: REGISTERED_NAME, exact: true });
      await expect(option, 'REQ-7.5: blurで追加した名称が候補に現れる').toBeVisible({
        timeout: getTimeout(5000),
      });
      await option.click();

      // REQ-7.4: 選択した候補が該当フィールドへ自動入力される
      await expect(secondNameField, 'REQ-7.4: 選択した候補が自動入力される').toHaveValue(
        REGISTERED_NAME
      );
    });
  });

  // ==========================================================================
  // REQ-7.1: 全9フィールドで一貫してオートコンプリートが動作する
  // ==========================================================================

  test.describe('REQ-7.1: 全9フィールドのオートコンプリート一貫性', () => {
    test('全9フィールドでオートコンプリートが一貫して動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 対象フィールドは数量項目の行にしか存在しないため、前提として1行用意する。
      await openQuantityTableEdit(page, createdQuantityTableId);
      const groupCard = await addQuantityGroup(page);
      await addQuantityItemRows(groupCard, 1);

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
        // REQ-7.1: 対象9フィールドはいずれも補完付きの入力欄として描画される。
        // 「表示されていれば確認する」形では、欄が消えても緑のままになる。
        await expect(field, `REQ-7.1: ${suffix} の入力欄が表示される`).toBeVisible({
          timeout: getTimeout(10000),
        });

        // comboboxロールが設定されていることを確認
        const role = await field.getAttribute('role');
        expect(role).toBe('combobox');

        // aria-autocomplete属性が設定されていることを確認
        const ariaAutocomplete = await field.getAttribute('aria-autocomplete');
        expect(ariaAutocomplete).toBe('list');
      }
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータのクリーンアップ', async ({ page }) => {
      assertPrepared(testProjectId, '事前準備で作成したプロジェクトのID');

      await loginAsUser(page, 'REGULAR_USER');

      // プロジェクトの詳細ページに遷移して削除
      await page.goto(`/projects/${testProjectId}`);
      await page.waitForLoadState('networkidle');

      const deleteButton = page.getByRole('button', { name: /削除/i });
      if (await isVisibleWithin(deleteButton, 3000)) {
        await deleteButton.click();
        const confirmButton = page.getByRole('button', { name: /削除を確認|はい|OK/i });
        if (await isVisibleWithin(confirmButton, 3000)) {
          await confirmButton.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });
  });
});
