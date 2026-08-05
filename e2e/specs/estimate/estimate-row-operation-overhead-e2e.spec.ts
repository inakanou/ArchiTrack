/**
 * @fileoverview 行操作のローカル完結・未保存編集の保持・競合時の編集内容保持のE2Eテスト
 *
 * Task 53.14: 段階1（見積明細の一括保存への集約）の受入検証。
 *
 * 既存E2Eとの分担:
 * - `estimate-hierarchy-move-e2e.spec.ts` は「階層の上げ下げ」単独のローカル完結を検証する
 * - `estimate-reorder-overhead-e2e.spec.ts` は「↑/↓ボタン」単独のローカル完結を検証する
 * - `estimate-hierarchy-reload-save-e2e.spec.ts` は「再読み込み→保存」での階層維持を検証する
 *
 * 本 spec はそれらが触れていない次の4点を埋める。
 * 1. 挿入・削除・複写・並び替え・ドラッグ&ドロップ・階層の上げ下げという
 *    **行操作6種すべて**を各3回、同一セッションで連続実行しても書き込みが0件であること
 * 2. セルを編集したあとに階層移動・並び替えを行っても**未保存の編集内容が消えない**こと
 * 3. 他クライアントの更新で競合（409）が起きても**編集中の内容が保持される**こと
 * 4. **ドラッグ&ドロップ**で並び替えて保存したあと、**画面を再読み込み**しても
 *    並び順が画面上で維持されること（保存直後のDB確認だけでは、再読み込みで初めて
 *    現れる退行を検知できない）
 *
 * 書き込み回数は画面の「未保存」表示のような代理シグナルではなく、
 * ブラウザが実際に送出したリクエスト（`page.on('request')`）で数える。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-12.8: ドラッグ&ドロップで順序を変更して保存した場合、画面再読み込み後も変更後の順序で表示する
 * - REQ-27.3: 保存ボタンのクリックで変更内容を1回の保存操作でまとめて反映する
 * - REQ-34.5: 並び順・階層を変更して保存した場合、画面再読み込み後も変更後の構造で表示する
 * - REQ-42.5: 保存開始後に他ユーザーが更新していた場合、保存を中止して競合を表示し、
 *   編集中の内容を失わせない
 * - REQ-43.1: 行の挿入・削除・複写・並び替え・ドラッグ&ドロップ・階層の上げ下げを
 *   サーバーへの保存を伴わずに反映する
 * - REQ-43.2: これらの操作を連続して行っても操作回数に関わらず保存を発生させない
 * - REQ-43.3: 階層の上げ下げまたは並び替えを行っても、それまでの未保存の編集内容を保持する
 *
 * @module e2e/specs/estimate/estimate-row-operation-overhead-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { observeApiRequests } from '../../helpers/api-request-observer';
import {
  buildNewEstimateItemNode,
  findEstimateItemByName,
  flattenEstimateItems,
  getEstimateItemTree,
  getEstimateUpdatedAt,
  saveEstimateDraft,
  toSaveNodes,
  type EstimateItemNode,
} from '../../helpers/estimate-draft';

/** 明細の初期状態（ルート4項目）の名称 */
const ITEM_NAMES = ['行操作項目1', '行操作項目2', '行操作項目3', '行操作項目4'] as const;

/**
 * 見積項目テーブル内の項目ラッパーを指すセレクタ
 *
 * 3行1セットの内側要素は `data-testid="estimate-item-row"` を持つため、前方一致だけでは
 * 項目ラッパー（`estimate-item-<id>`）と混ざる。明示的に除外する。
 */
const ROW_SELECTOR =
  '[aria-label="見積項目テーブル"] [data-testid^="estimate-item-"]:not([data-testid="estimate-item-row"])';

test.describe('行操作のローカル完結と未保存編集の保持', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

  // ==========================================================================
  // 共通ヘルパー
  // ==========================================================================

  /** 明細ツリーの初期状態（ルート4項目）へ戻す */
  const resetItemTree = async (page: Page): Promise<void> => {
    await saveEstimateDraft(
      page.request,
      accessToken,
      createdEstimateId!,
      ITEM_NAMES.map((name, index) =>
        buildNewEstimateItemNode({
          name,
          unit: '式',
          quantity: 1,
          estimateUnitPrice: 1000 * (index + 1),
          executionUnitPrice: 900 * (index + 1),
          vendorUnitPrice: 800 * (index + 1),
        })
      )
    );
  };

  const fetchTree = async (page: Page): Promise<EstimateItemNode[]> =>
    await getEstimateItemTree(page.request, accessToken, createdEstimateId!);

  /**
   * 明細テーブルが描画されるまで待つ
   *
   * 54.x で「階層表示モード」（ツリー表示／ドリルダウン表示）が入り、モードによって
   * 描画される行の集合が変わる。本 spec は**全階層が一覧される**ツリー表示を前提に
   * 表示順を読むため、モードがツリー表示であることを明示的に固定する。
   */
  const waitForItemTable = async (page: Page): Promise<void> => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.locator('[aria-label="見積項目テーブル"]')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByTestId('view-mode-tree')).toHaveAttribute('aria-checked', 'true', {
      timeout: getTimeout(10000),
    });
  };

  /** 見積書画面を開いて明細が描画されるまで待つ */
  const openEstimatePage = async (page: Page): Promise<void> => {
    await page.goto(`/estimates/${createdEstimateId}`);
    await waitForItemTable(page);
  };

  /** 見積項目テーブルに描画されている行のIDを表示順で読む */
  const domRowIds = async (page: Page): Promise<string[]> =>
    await page
      .locator(ROW_SELECTOR)
      .evaluateAll((elements) =>
        elements.map((element) =>
          (element.getAttribute('data-testid') ?? '').replace('estimate-item-', '')
        )
      );

  /**
   * 明細操作ツールバーのボタンを取る
   *
   * 「削除」は見積書ヘッダーにも存在するため、必ずツールバー配下へ限定する。
   */
  const toolbarButton = (page: Page, name: string): Locator =>
    page.getByTestId('estimate-item-toolbar').getByRole('button', { name, exact: true });

  /** 明細行を選択する（入力欄を避けて行の端をクリックする） */
  const selectRow = async (page: Page, itemId: string): Promise<void> => {
    const row = page.getByTestId(`estimate-item-${itemId}`);
    await expect(row).toBeVisible({ timeout: getTimeout(10000) });
    await row.click({ position: { x: 5, y: 5 } });
    await expect(row).toHaveAttribute('data-selected', 'true');
  };

  /** 見積金額行（3行1セットの先頭）の入力欄を取る */
  const estimateLineInput = (page: Page, itemId: string, label: string): Locator =>
    page.getByTestId(`estimate-item-${itemId}`).locator(`input[aria-label="${label}"]`).first();

  /**
   * 数量セルの値を**数値として**検証する
   *
   * 数量欄はフォーカスアウトで小数2桁へ整形されるため（REQ-22.7）、`7` と入力した直後の
   * 表記は `7.00` になる。一方で再読み込み直後はAPIが返す数値がそのまま入るため `7` に戻る。
   * ここで確かめたいのは「編集した数量が保持されているか」なので、表記の揺れに依存せず
   * 数値として比較する。
   */
  const expectQuantityValue = async (
    page: Page,
    itemId: string,
    expected: number
  ): Promise<void> => {
    await expect
      .poll(async () => Number(await estimateLineInput(page, itemId, '数量').inputValue()), {
        timeout: getTimeout(10000),
      })
      .toBe(expected);
  };

  /**
   * 明細行を HTML5 ドラッグ&ドロップで別の行へ落とす
   *
   * 行は `draggable` 属性を持つため、`dragstart` → `dragover` → `drop` → `dragend` を
   * 同一の `DataTransfer` で発火させる。実ポインタ操作では Chromium の
   * ネイティブD&Dが Playwright の制御外になるため、イベント発火で再現する。
   */
  const dragRowOnto = async (page: Page, sourceId: string, dropTargetId: string): Promise<void> => {
    const sourceRow = page.getByTestId(`estimate-item-${sourceId}`);
    const dropRow = page.getByTestId(`estimate-item-${dropTargetId}`);
    await expect(sourceRow).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dropRow).toBeVisible({ timeout: getTimeout(10000) });
    await expect(sourceRow).toHaveAttribute('draggable', 'true');

    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    try {
      await sourceRow.dispatchEvent('dragstart', { dataTransfer });
      await dropRow.dispatchEvent('dragenter', { dataTransfer });
      await dropRow.dispatchEvent('dragover', { dataTransfer });
      await dropRow.dispatchEvent('drop', { dataTransfer });
      await sourceRow.dispatchEvent('dragend', { dataTransfer });
    } finally {
      await dataTransfer.dispose();
    }
  };

  /** 保存ボタンを押し、`PUT /:id/save` がちょうど1回だけ成功することを確認する */
  const saveAndExpectSingleWrite = async (page: Page): Promise<void> => {
    const { writes: requests, stop } = observeApiRequests(page);

    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const saveButton = page.getByRole('button', { name: /^保存$/i });
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });
    await saveButton.click();

    const saveResponse = await savePromise;
    expect(saveResponse.status()).toBe(200);

    // 観測窓は「保存ハンドラが完全に解決した」ことを示す画面遷移まで開けておく。
    //
    // `waitForLoadState('networkidle')` は直近のナビゲーションが既に networkidle に
    // 達しているため即座に返り、保存ハンドラ内で追加の書き込みが送出される前に
    // リスナーを外してしまう（＝2回目の書き込みを取りこぼす）。
    // 未保存インジケーターは `useEstimateEditor.save` が `await onSave(...)` の解決後に
    // `setItems` で `isDirty` を落として初めて消える（REQ-42.7）。したがって
    // 「消えた」ことは保存ハンドラが最後まで走り切ったことの証明であり、
    // ハンドラ内の重複書き込みは必ずこの時点までに送出されている。
    await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0, {
      timeout: getTimeout(10000),
    });
    stop();

    expect(requests).toEqual([`PUT /api/estimates/${createdEstimateId}/save`]);
  };

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // テストデータのセットアップ
  // ==========================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E行操作テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト1-1-1');

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

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2: テスト用見積書を作成し明細を4項目にする', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(accessToken).toBeTruthy();

      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '行操作テスト用見積書' },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      createdEstimateId = (await estimateResponse.json()).id;
      expect(createdEstimateId).toBeTruthy();

      await resetItemTree(page);

      const tree = await fetchTree(page);
      expect(tree).toHaveLength(ITEM_NAMES.length);
      expect(tree.every((item) => item.parentId === null)).toBe(true);
    });
  });

  // ==========================================================================
  // 行操作のローカル完結（REQ-43.1, 43.2, 27.3）
  // ==========================================================================

  test.describe('行操作のローカル完結と1回の保存', () => {
    /**
     * @requirement estimate-creation/REQ-43.1
     * @requirement estimate-creation/REQ-43.2
     * @requirement estimate-creation/REQ-27.3
     */
    test('挿入・複写・削除・並び替え・ドラッグ・階層の上げ下げを各3回行っても書き込みは0件で、保存操作で1件だけ発生する (estimate-creation/REQ-43.1, estimate-creation/REQ-43.2, estimate-creation/REQ-27.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const targetId = findEstimateItemByName(before, '行操作項目2')!.id;

      await openEstimatePage(page);

      // 画面表示後の書き込みリクエストだけを数える
      const { writes: writeRequests, stop } = observeApiRequests(page);

      const initialRowIds = await domRowIds(page);
      expect(initialRowIds).toHaveLength(ITEM_NAMES.length);

      // --- 挿入 ×3（REQ-43.1）---
      for (let i = 0; i < 3; i++) {
        await toolbarButton(page, '+ 項目追加').click();
        await expect(page.locator(ROW_SELECTOR)).toHaveCount(ITEM_NAMES.length + i + 1);
      }
      const afterInsertIds = await domRowIds(page);
      const insertedIds = afterInsertIds.filter((id) => !initialRowIds.includes(id));
      expect(insertedIds).toHaveLength(3);

      // --- 複写 ×3（REQ-43.1）---
      for (let i = 0; i < 3; i++) {
        await selectRow(page, targetId);
        await toolbarButton(page, '複製').click();
        await expect(page.locator(ROW_SELECTOR)).toHaveCount(ITEM_NAMES.length + 3 + i + 1);
      }

      // --- 削除 ×3（挿入した3行を消す。REQ-43.1）---
      for (const [index, insertedId] of insertedIds.entries()) {
        await selectRow(page, insertedId);
        await toolbarButton(page, '削除').click();
        await expect(page.getByTestId(`estimate-item-${insertedId}`)).toHaveCount(0);
        await expect(page.locator(ROW_SELECTOR)).toHaveCount(ITEM_NAMES.length + 3 + 3 - index - 1);
      }

      // --- 並び替え ×3（↓→↑→↓。REQ-43.1）---
      await selectRow(page, targetId);
      for (const direction of ['down', 'up', 'down'] as const) {
        const button = page.getByTestId(`reorder-${direction}-button`);
        await expect(button).toBeEnabled();
        await button.click();
      }
      // 3回の移動で初期位置（index 1）から index 2 へ動いている
      expect((await domRowIds(page)).indexOf(targetId)).toBe(2);

      // --- 階層の上げ下げ ×3（下→上→下。REQ-43.1）---
      //
      // 各クリック前の `toBeEnabled()` は単なる待機ではなく、直前の操作が成立したことの
      // 検証を兼ねる。「上の階層へ」は `parentId !== null` のときだけ有効なので、
      // 2回目が有効＝1回目の「下の階層へ」が実際に子へ降りたことを意味する。
      await selectRow(page, targetId);
      for (const label of ['下の階層へ', '上の階層へ', '下の階層へ']) {
        const button = toolbarButton(page, label);
        await expect(button).toBeEnabled();
        await button.click();
      }
      // 3回目の「下の階層へ」も成立し、対象は親を持つ状態になっている
      await expect(toolbarButton(page, '上の階層へ')).toBeEnabled();

      // --- ドラッグ&ドロップ ×3（REQ-43.1）---
      //
      // 毎回「表示順の末尾の行」を「先頭の行」へ落とす。表示順は先行順なので末尾行が
      // 先頭行の祖先になることはなく（＝循環にならない）、ドラッグ元が対象より後ろの
      // 場合は対象の直前へ入る（`useEstimateEditor.reorderByItemIds`）。
      // したがって落とした行は必ず表示順の先頭へ来る。
      for (let attempt = 0; attempt < 3; attempt++) {
        const currentIds = await domRowIds(page);
        expect(currentIds.length).toBeGreaterThan(1);
        const draggedId = currentIds[currentIds.length - 1]!;
        const dropTargetId = currentIds[0]!;

        await dragRowOnto(page, draggedId, dropTargetId);
        await expect
          .poll(async () => (await domRowIds(page)).indexOf(draggedId), {
            timeout: getTimeout(10000),
            message: `ドラッグ${attempt + 1}回目で表示順が変わっていない`,
          })
          .toBe(0);
      }

      // ここまでサーバーへの書き込みは1件も起きていない（REQ-43.2）
      expect(writeRequests).toEqual([]);
      stop();

      // 未保存の変更として保持されている
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      // DB は操作前のまま
      const untouched = await fetchTree(page);
      expect(untouched.map((item) => item.id)).toEqual(before.map((item) => item.id));

      // --- 保存操作で書き込みは1件だけ（REQ-27.3）---
      await saveAndExpectSingleWrite(page);

      // 保存後は未保存状態が解消し、DBには挿入3件・削除3件・複写3件の結果が残る
      await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0);
      const saved = await fetchTree(page);
      expect(flattenEstimateItems(saved)).toHaveLength(ITEM_NAMES.length + 3);
    });
  });

  // ==========================================================================
  // 未保存編集の保持（REQ-43.3, 34.5, 27.3）
  // ==========================================================================

  test.describe('未保存の編集内容の保持', () => {
    /**
     * @requirement estimate-creation/REQ-43.3
     * @requirement estimate-creation/REQ-34.5
     * @requirement estimate-creation/REQ-27.3
     */
    test('セル編集後に階層移動・並び替えを行っても編集内容が消えず、保存して再読み込みしても残る (estimate-creation/REQ-43.3, estimate-creation/REQ-34.5, estimate-creation/REQ-27.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const targetId = findEstimateItemByName(before, '行操作項目2')!.id;

      await openEstimatePage(page);

      // セルを編集する（名称・備考・数量）
      const editedName = '編集後の名称_43_3';
      const editedRemarks = '編集後の備考_43_3';
      await estimateLineInput(page, targetId, '名称').fill(editedName);
      await estimateLineInput(page, targetId, '備考').fill(editedRemarks);
      await estimateLineInput(page, targetId, '数量').fill('7');

      // 並び替え（↓→↑）を挟む（REQ-43.3）
      await selectRow(page, targetId);
      await page.getByTestId('reorder-down-button').click();
      await page.getByTestId('reorder-up-button').click();

      // 階層の上げ下げを挟む（REQ-43.3）
      await selectRow(page, targetId);
      await toolbarButton(page, '下の階層へ').click();
      await toolbarButton(page, '上の階層へ').click();

      // 編集内容は消えていない
      await expect(estimateLineInput(page, targetId, '名称')).toHaveValue(editedName);
      await expect(estimateLineInput(page, targetId, '備考')).toHaveValue(editedRemarks);
      await expectQuantityValue(page, targetId, 7);

      // 直前の兄弟の子へ移した状態で保存し、階層と編集内容を同時に確定する
      const rowIdsBeforeIndent = await domRowIds(page);
      const targetIndex = rowIdsBeforeIndent.indexOf(targetId);
      expect(targetIndex).toBeGreaterThan(0);
      const expectedParentId = rowIdsBeforeIndent[targetIndex - 1]!;

      await selectRow(page, targetId);
      await toolbarButton(page, '下の階層へ').click();
      await expect(estimateLineInput(page, targetId, '名称')).toHaveValue(editedName);

      await saveAndExpectSingleWrite(page);

      // 再読み込みしても編集内容と階層が維持される（REQ-34.5）
      await page.reload();
      await waitForItemTable(page);

      await expect(estimateLineInput(page, targetId, '名称')).toHaveValue(editedName);
      await expect(estimateLineInput(page, targetId, '備考')).toHaveValue(editedRemarks);
      await expectQuantityValue(page, targetId, 7);

      const after = await fetchTree(page);
      const savedTarget = flattenEstimateItems(after).find((item) => item.id === targetId);
      expect(savedTarget).toBeDefined();
      expect(savedTarget!.parentId).toBe(expectedParentId);
      expect(savedTarget!.lines.find((line) => line.lineType === 'ESTIMATE')!.name).toBe(
        editedName
      );
      expect(savedTarget!.lines.find((line) => line.lineType === 'ESTIMATE')!.remarks).toBe(
        editedRemarks
      );
      expect(
        Number(savedTarget!.lines.find((line) => line.lineType === 'ESTIMATE')!.quantity)
      ).toBe(7);
    });
  });

  // ==========================================================================
  // 競合時の編集内容の保持（REQ-42.5）
  // ==========================================================================

  test.describe('競合発生時の編集内容の保持', () => {
    /**
     * 別クライアントが先に保存して `updatedAt` を進め、画面が保持している
     * `expectedUpdatedAt` を陳腐化させることで 409 を起こす。
     *
     * @requirement estimate-creation/REQ-42.5
     */
    test('他クライアントの更新で競合が起きても編集中の内容が保持される (estimate-creation/REQ-42.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const targetId = findEstimateItemByName(before, '行操作項目1')!.id;

      await openEstimatePage(page);

      // 画面上でセルを編集する（競合後も残っていることを確認する対象）
      const editedRemarks = '競合しても残る備考_42_5';
      await estimateLineInput(page, targetId, '備考').fill(editedRemarks);
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      // 別クライアントとして先に保存し、`updatedAt` を進める
      const updatedAtBefore = await getEstimateUpdatedAt(
        page.request,
        accessToken,
        createdEstimateId!
      );
      await saveEstimateDraft(page.request, accessToken, createdEstimateId!, toSaveNodes(before));
      const updatedAtAfter = await getEstimateUpdatedAt(
        page.request,
        accessToken,
        createdEstimateId!
      );
      expect(updatedAtAfter).not.toBe(updatedAtBefore);

      // 画面から保存すると競合（409）になる
      const conflictPromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          response.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/i }).click();
      const conflictResponse = await conflictPromise;
      expect(conflictResponse.status()).toBe(409);

      // 競合はインラインバナーで提示される（画面は差し替わらない）
      const banner = page.getByTestId('estimate-save-error');
      await expect(banner).toBeVisible({ timeout: getTimeout(10000) });
      await expect(banner).toHaveAttribute('role', 'alert');
      await expect(banner).toContainText('他のユーザーによって更新されました');

      // 編集中の内容は失われていない（REQ-42.5）
      await expect(estimateLineInput(page, targetId, '備考')).toHaveValue(editedRemarks);
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();
      await expect(page.getByRole('button', { name: /^保存$/i })).toBeEnabled();

      // 保存は中止されているのでDBには反映されていない
      const after = await fetchTree(page);
      const targetAfter = flattenEstimateItems(after).find((item) => item.id === targetId);
      expect(targetAfter).toBeDefined();
      expect(targetAfter!.lines.every((line) => line.remarks !== editedRemarks)).toBe(true);
    });
  });

  // ==========================================================================
  // ドラッグ&ドロップによる並び替え（REQ-12.8, 43.1, 34.5）
  // ==========================================================================

  test.describe('ドラッグ&ドロップによる並び替え', () => {
    /**
     * ドラッグ&ドロップはツールバーの↑/↓とは別経路（`EstimateItemTable` の
     * `onDragStart` / `onDrop` → `useEstimateEditor.reorderItems`）である。
     *
     * @requirement estimate-creation/REQ-12.8
     * @requirement estimate-creation/REQ-43.1
     * @requirement estimate-creation/REQ-34.5
     */
    test('ドラッグで並び替えると書き込みを伴わず画面順が変わり、保存して再読み込みしても順序が維持される (estimate-creation/REQ-12.8, estimate-creation/REQ-43.1, estimate-creation/REQ-34.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      await resetItemTree(page);

      const before = await fetchTree(page);
      const sourceId = findEstimateItemByName(before, '行操作項目4')!.id;
      const targetId = findEstimateItemByName(before, '行操作項目1')!.id;

      await openEstimatePage(page);

      const initialIds = await domRowIds(page);
      expect(initialIds).toHaveLength(ITEM_NAMES.length);
      expect(initialIds.indexOf(sourceId)).toBe(3);

      const { writes: writeRequests, stop } = observeApiRequests(page);

      // --- ドラッグ ×3（REQ-43.1, REQ-43.2）---
      //
      // 挿入位置は表示順での前後関係で決まる（`useEstimateEditor` の `reorderByItemIds`:
      // ドラッグ元が対象より後ろなら対象の直前、前なら対象の直後）。
      // 初期並び [1,2,3,4] に対し次の3回で [4,1,2,3] へ落ち着く。
      //   1回目: 4 を 1 へ（後ろ→前なので直前）→ [4,1,2,3]
      //   2回目: 4 を 3 へ（前→後ろなので直後）→ [1,2,3,4]
      //   3回目: 4 を 1 へ → [4,1,2,3]
      const thirdId = findEstimateItemByName(before, '行操作項目3')!.id;
      const dragPlan: Array<{ dropTargetId: string; expectedSourceIndex: number }> = [
        { dropTargetId: targetId, expectedSourceIndex: 0 },
        { dropTargetId: thirdId, expectedSourceIndex: 3 },
        { dropTargetId: targetId, expectedSourceIndex: 0 },
      ];

      for (const [attempt, step] of dragPlan.entries()) {
        await dragRowOnto(page, sourceId, step.dropTargetId);
        await expect
          .poll(async () => (await domRowIds(page)).indexOf(sourceId), {
            timeout: getTimeout(10000),
            message: `ドラッグ${attempt + 1}回目で表示順が変わっていない`,
          })
          .toBe(step.expectedSourceIndex);
      }

      // ドラッグを3回繰り返してもサーバーへの書き込みは発生しない（REQ-43.1, REQ-43.2）
      expect(writeRequests).toEqual([]);
      stop();

      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      const reorderedIds = await domRowIds(page);
      expect(reorderedIds.indexOf(sourceId)).toBe(0);

      // 保存で表示順どおりに確定する（REQ-12.8）
      await saveAndExpectSingleWrite(page);

      // 再読み込み後も順序が維持される（REQ-12.8, REQ-34.5）
      await page.reload();
      await waitForItemTable(page);
      expect(await domRowIds(page)).toEqual(reorderedIds);

      const after = await fetchTree(page);
      expect(after.map((item) => item.id)).toEqual(reorderedIds);
    });
  });
});
