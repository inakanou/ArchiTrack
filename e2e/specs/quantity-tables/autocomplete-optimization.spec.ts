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
 * Task 115.127 段1: 前提の生成を共通の補助（`quantity-table-preconditions`）へ寄せ、
 * `test.skip(!testProjectId, …)` 12 件を `assertPrepared(createdQuantityTableId, …)` へ改めた。
 * 併せて「数量表IDがあれば編集画面、無ければプロジェクト詳細」の分岐を除いた（前提は必ず在る）。
 *
 * @module e2e/specs/quantity-tables/autocomplete-optimization.spec
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { assertPrepared, assertPresent } from '../../helpers/preconditions';
import {
  createTestProject,
  createTestQuantityTable,
  openEditPageWithSingleItemRow,
} from '../../helpers/quantity-table-preconditions';

/**
 * 補完対象フィールドへ確定値を入力し、blur で候補値リストへ登録させる（REQ-7.5）。
 *
 * 「表示されていれば入力する」形では、フィールドが描画されない限り登録も後段の判定も
 * 揃って飛ぶ。入力が保持されたことと焦点が外れたことを主張し、前提が崩れた地点で失敗させる。
 *
 * @param field 対象フィールド（`role="combobox"`）
 * @param value 登録する確定値（欄ごとの入力上限に収まること）
 */
async function registerCandidate(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await expect(field, `補完対象フィールドへ「${value}」が入力される`).toHaveValue(value);
  await field.blur();
  await expect(field, 'blur で補完対象フィールドから焦点が外れる').not.toBeFocused();
}

/**
 * 再試行のたびに入力値の変化を確実に起こすための中継値。
 *
 * 半角1文字であり、対象9フィールドのうち最も狭い単位欄（全角3文字/半角6文字）の
 * 上限にも収まる。`readSuggestions` に渡すどの入力値とも一致しない値を選ぶこと。
 */
const REOPEN_SENTINEL = 'z';

/**
 * 補完対象フィールドへ入力し、表示された候補の文字列を取り出す。
 *
 * 候補一覧は `document.body` 直下へ Portal で描画されるため、行ではなくページ配下で参照する。
 *
 * ## なぜ Locator ではなく文字列を返すのか（遅延クローズが後から着弾する）
 *
 * `AutocompleteInput` が一覧を開く経路は二つしかない。焦点獲得（`handleFocus`。ただし
 * その時点の値に対する候補が1件以上ある場合のみ）と、入力の変化（`handleInputChange`）である。
 * 一方 `handleBlur` は 150ms 後に一覧を閉じる遅延処理を**無条件に**仕掛け、その後の
 * 再フォーカスや再入力でも取り消さない。したがって `registerCandidate` が仕掛けた遅延は、
 * その後に開いた一覧を**開いた直後に**閉じ得る。
 *
 * 開いた一覧の Locator を呼び出し側へ返すと、返した後に遅延クローズが着弾した時点で
 * 後段の主張が壊れる。実測（Task 115.127 段6 の実ブラウザ実行）でこの形に落ちた。
 * 一覧の可視は満たしたのに、直後の `getByRole('option')` が 5 秒間 0 件のままとなり、
 * 失敗時の画面は「欄は focused・listbox は DOM に不在」だった。
 *
 * そこで**一覧に依存する読み取りまでを一つの再試行単位に閉じ込め**、呼び出し側へは
 * 素の文字列を渡す。閉じられても次の周回で開き直せるため、後段の主張は時間に左右されない。
 *
 * ## 中継値を挟む理由（同じ値を入れ直しても一覧は開かない）
 *
 * React の入力値追跡は DOM の値が実際に変わらない限り `onChange` を発火させない。
 * 既に同じ値が入っている欄へ同じ値を `fill` しても `handleInputChange` は呼ばれず、
 * 欄は焦点を持ったままなので `handleFocus` も再発火せず、一覧は閉じたまま固定される。
 * 中継値を経由して目的の値へ入れ直し、再試行のたびに**必ず値の変化を起こす**。
 *
 * ## 取り出した結果そのものを再試行単位の中で主張する
 *
 * 遅延クローズは「一覧が出ている」ことを確かめた**直後**にも着弾し得る。
 * 件数の主張と `allTextContents()` の間に着弾すると、取り出しは空配列を返すが
 * 再試行単位は例外を出さずに完了してしまい、**空のまま呼び出し側へ渡る**。
 * 実測（Task 115.127 段6 の実ブラウザ実行）でこの形に落ちた。受領値は `Array []` で、
 * 中継値の混入ではなく取り出しが空だったことがログから確かめられる。
 * そこで取り出した結果が空でないことと、取り出し後も一覧の件数が一致していることを
 * **再試行単位の中で**主張する。破れていれば次の周回で開き直す。
 *
 * 本補助は「候補が1件以上あるはず」の場面専用である。呼び出し側はいずれも直前に
 * `registerCandidate` で候補を登録しており、候補0件を期待する呼び出しは無い。
 *
 * 期限内に一覧が開かなければ失敗させる（沈黙して抜ける経路を持たせない）。
 *
 * @param page Playwright のページ
 * @param field 対象フィールド（`role="combobox"`）
 * @param inputText 入力する文字列（空文字なら全候補が対象になる）
 * @returns 表示された候補の文字列（表示順）
 */
async function readSuggestions(page: Page, field: Locator, inputText: string): Promise<string[]> {
  expect(inputText, '中継値と同じ入力値では値の変化を起こせない').not.toBe(REOPEN_SENTINEL);

  const listbox = page.getByRole('listbox');
  let suggestions: string[] = [];
  await expect(async () => {
    await field.fill(REOPEN_SENTINEL);
    await field.fill(inputText);
    await expect(listbox).toBeVisible({ timeout: getTimeout(1000) });

    const options = listbox.getByRole('option');
    await expect(options).not.toHaveCount(0, { timeout: getTimeout(1000) });

    const captured = await options.allTextContents();
    // 取り出しの最中に遅延クローズが着弾すると空になる。空を返すと呼び出し側の
    // 集合比較が「候補が無い」ことを見逃すため、取り出した結果そのものを主張する。
    expect(captured, '候補一覧から候補を取り出せる').not.toHaveLength(0);
    // 取り出した後も一覧が保たれていること（途中で閉じていない）を確かめる。
    await expect(options, '取り出した件数と一覧の件数が一致する').toHaveCount(captured.length, {
      timeout: getTimeout(1000),
    });

    suggestions = captured;
  }, 'REQ-7.3: 入力に対応する候補一覧が表示される').toPass({ timeout: getTimeout(15000) });
  return suggestions;
}

/**
 * オートコンプリート最適化E2Eテスト
 */
test.describe('オートコンプリート最適化', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したリソースのIDを保存
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

      const projectId = await createTestProject(page, 'AC最適化テスト');
      const quantityTable = await createTestQuantityTable(page, projectId, 'AC最適化テスト数量表');
      createdQuantityTableId = quantityTable.id;
    });
  });

  // ==========================================================================
  // REQ-7.1: 数量表編集画面表示時に候補が一括取得されること
  // ==========================================================================

  test.describe('REQ-7.1: 候補の一括取得', () => {
    test('数量表編集画面表示時にautocomplete-candidatesエンドポイントが呼ばれる', async ({
      page,
    }) => {
      assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

      await loginAsUser(page, 'REGULAR_USER');

      // autocomplete-candidatesリクエストをインターセプト
      const candidatesPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/autocomplete-candidates') &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      // 数量表編集画面に遷移
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);

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
      assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

      await loginAsUser(page, 'REGULAR_USER');

      // 数量表編集画面に遷移
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);

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
        if (await isVisibleWithin(listbox, 2000)) {
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
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, 'REQ-7.3: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.5: blur で確定値を候補値リストへ追加する
      await registerCandidate(majorCategoryInput, '建築工事');

      // 一覧を開いてから確定するまでを一つの再試行単位に閉じ込める。
      // `handleBlur` の遅延クローズは再フォーカスでも取り消されないため、途中で一覧が
      // 閉じるとキー操作が届かなくなる（Enter は一覧が閉じていると確定を行わない）。
      // 期限内に一連の操作が成立しなければ失敗する（沈黙して抜ける経路は無い）。
      const listbox = page.getByRole('listbox');
      await expect(async () => {
        // REQ-7.3: 前方一致する候補がドロップダウン表示される
        await majorCategoryInput.fill(REOPEN_SENTINEL);
        await majorCategoryInput.fill('建');
        await expect(listbox).toBeVisible({ timeout: getTimeout(1000) });

        // 下矢印キーで候補が選択状態になる（REQ-7.5）
        await majorCategoryInput.press('ArrowDown');
        const selectedOption = listbox.getByRole('option', { selected: true });
        await expect(selectedOption, '上下キーで候補が選択状態になる').toBeVisible({
          timeout: getTimeout(1000),
        });
        const selectedText = await selectedOption.textContent();
        assertPresent(selectedText, '選択状態になった補完候補の文字列');

        // REQ-7.4: Enter で確定すると選択した候補がフィールドへ自動入力される
        await majorCategoryInput.press('Enter');
        await expect(majorCategoryInput, 'REQ-7.4: 選択した候補が入力される').toHaveValue(
          selectedText,
          { timeout: getTimeout(1000) }
        );
      }, 'REQ-7.5/7.4: 上下キーで候補を選択し Enter で確定できる').toPass({
        timeout: getTimeout(15000),
      });

      // 確定した値は候補として登録した値そのものである
      await expect(majorCategoryInput, 'REQ-7.4: 確定後の値が候補と一致する').toHaveValue(
        '建築工事'
      );
    });
  });

  // ==========================================================================
  // REQ-7.6: blur時に入力値がクライアントサイドの候補リストに追加されること
  // ==========================================================================

  test.describe('REQ-7.6: blur時の候補追加', () => {
    test('blur時に入力値が候補に追加され再入力時に候補として表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // blur時のAPIリクエストを監視
      const blurApiRequests: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        // blur時にautocomplete関連のPOSTリクエストが発生しないことを確認
        if (url.includes('/autocomplete') && request.method() === 'POST') {
          blurApiRequests.push(url);
        }
      });

      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, 'REQ-7.3: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const uniqueValue = `テスト大項目_${Date.now()}`;
      await registerCandidate(majorCategoryInput, uniqueValue);

      // REQ-7.6: blur時の候補値リスト更新はクライアントサイドのみで行う
      expect(blurApiRequests, 'REQ-7.6: blur時にAPIリクエストを発行しない').toHaveLength(0);

      // REQ-7.5: blur で追加した値が、再入力時に候補として現れる
      const suggestions = await readSuggestions(
        page,
        majorCategoryInput,
        uniqueValue.substring(0, 5)
      );
      expect(suggestions, 'REQ-7.5: blurで追加した値が候補に現れる').toContain(uniqueValue);
    });
  });

  // ==========================================================================
  // REQ-7.7: 候補が50音順で表示されること
  // ==========================================================================

  test.describe('REQ-7.7: 50音順表示', () => {
    test('候補が50音順でソートされて表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, 'REQ-7.3: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 50音順の判定に意味を持たせるため、意図的に逆順で候補を登録する（REQ-7.5）
      const registeredValues = ['ウ工事', 'イ工事', 'ア工事'];
      for (const value of registeredValues) {
        await registerCandidate(majorCategoryInput, value);
      }

      // REQ-7.3: 空欄へ戻すと全候補が表示される
      const optionTexts = await readSuggestions(page, majorCategoryInput, '');

      // 登録した候補がすべて、それだけが並ぶ。
      // 母集団は二つの供給しか持たない。(1) サーバーの入力履歴
      // （`backend/src/routes/autocomplete.routes.ts:157-181` の groupBy。**永続化された**
      // 数量項目をプロジェクト単位で集計する）と、(2) blur 時のクライアント追加
      // （`useAutocompleteCandidateStore.ts:214-226`）である。本ファイルは数量表を
      // 保存しないため (1) は空、(2) はページ読み込みごとに初期化される。
      // したがって集合はこのテストが登録した3件に一意に定まる。
      expect(
        [...optionTexts].sort((a, b) => a.localeCompare(b, 'ja')),
        'REQ-7.7 の並びを判定するため登録した候補が揃っている'
      ).toEqual([...registeredValues].sort((a, b) => a.localeCompare(b, 'ja')));

      // REQ-7.7: 候補は50音順に並ぶ
      expect(optionTexts, 'REQ-7.7: 候補が50音順に並ぶ').toEqual(
        [...optionTexts].sort((a, b) => a.localeCompare(b, 'ja'))
      );
    });
  });

  // ==========================================================================
  // 候補取得エラー時のgraceful degradation
  // ==========================================================================

  test.describe('候補取得エラー時のgraceful degradation', () => {
    test('候補取得エラー時に数量表編集機能自体は正常に動作する', async ({ page }) => {
      assertPrepared(createdQuantityTableId, '事前準備で作成した数量表のID');

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
      await page.goto(`/quantity-tables/${createdQuantityTableId}/edit`);

      await page.waitForLoadState('networkidle');

      // 数量表編集画面自体が表示されていることを確認
      // （エラーでもページ全体がクラッシュしないこと）
      const addItemButton = page.getByRole('button', { name: /項目を追加|新規項目/i });
      if (await isVisibleWithin(addItemButton, getTimeout(10000))) {
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
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, 'REQ-7.3: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      await registerCandidate(majorCategoryInput, 'フォーカステスト大項目');

      // REQ-7.3a: 空欄では全候補がドロップダウン表示される
      const suggestions = await readSuggestions(page, majorCategoryInput, '');
      expect(suggestions, 'REQ-7.3a: 空欄へのフォーカスで候補が表示される').toEqual([
        'フォーカステスト大項目',
      ]);
    });

    test('値ありの対象フィールドにフォーカスした際にフィルタリング済み候補が表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, 'REQ-7.3: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      await registerCandidate(majorCategoryInput, 'フィルタテスト値A');

      // REQ-7.3: 値がある場合は前方一致する候補だけが表示される
      const suggestions = await readSuggestions(page, majorCategoryInput, 'フィルタ');
      expect(suggestions, 'REQ-7.3: 前方一致する候補が表示される').toEqual(['フィルタテスト値A']);
    });

    test('フォーカス後にテキスト入力するとリアルタイムで候補がフィルタリング更新される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, 'REQ-7.3: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const registeredValues = ['リアルタイムA', 'リアルタイムB', '別の値'];
      for (const value of registeredValues) {
        await registerCandidate(majorCategoryInput, value);
      }

      // REQ-7.3: 空欄では登録した全候補が表示される
      const allSuggestions = await readSuggestions(page, majorCategoryInput, '');
      expect(
        [...allSuggestions].sort((a, b) => a.localeCompare(b, 'ja')),
        '空欄では登録した全候補が表示される'
      ).toEqual([...registeredValues].sort((a, b) => a.localeCompare(b, 'ja')));

      // REQ-7.3a: 入力に応じて前方一致する候補へリアルタイムに絞り込まれる
      const filteredSuggestions = await readSuggestions(page, majorCategoryInput, 'リアルタイム');
      expect(filteredSuggestions, 'REQ-7.3a: 残るのは前方一致する候補だけである').toEqual([
        'リアルタイムA',
        'リアルタイムB',
      ]);
    });

    test('対象9フィールドすべてでフォーカス時の候補表示が動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 対象9フィールドと、各欄の入力上限（FIELD_CONSTRAINTS）に収まる登録値。
      // 単位は全角3文字/半角6文字が上限であり、他の欄と同じ長さの値は入力そのものが
      // 弾かれて候補が登録されない（REQ-13.3）。欄ごとに上限内の値を用いる。
      const targetFields: Array<{ label: string; value: string }> = [
        { label: '大項目', value: 'テスト大項目' },
        { label: '中項目', value: 'テスト中項目' },
        { label: '小項目', value: 'テスト小項目' },
        { label: '任意分類', value: 'テスト任意分類' },
        { label: '工種', value: 'テスト工種' },
        { label: '名称', value: 'テスト名称' },
        { label: '規格', value: 'テスト規格' },
        { label: '単位', value: '式' },
        { label: '備考', value: 'テスト備考' },
      ];

      for (const { label, value } of targetFields) {
        const input = row.getByRole('combobox', { name: label, exact: true });
        await expect(input, `REQ-7.3: ${label}の入力欄が表示される`).toBeVisible({
          timeout: getTimeout(10000),
        });

        await registerCandidate(input, value);

        // REQ-7.3a: 空欄へ戻すと当該フィールドの候補がドロップダウン表示される
        const suggestions = await readSuggestions(page, input, '');
        expect(suggestions, `REQ-7.3a: ${label}の候補が表示される`).toEqual([value]);

        await input.blur();
      }
    });
  });
});
