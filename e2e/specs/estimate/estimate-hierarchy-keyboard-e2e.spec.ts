/**
 * @fileoverview 階層ナビゲーション（表示モード・俯瞰パネル）とキーボード操作のE2Eテスト
 *
 * Task 54.11: 54.1〜54.10 で実装した「見え方の切り替え」と「キーボードだけの明細操作」を
 * 実ブラウザで検証する。
 *
 * 既存E2Eとの分担（本 spec を新設した理由）:
 * - `estimate-row-operation-overhead-e2e.spec.ts`（53.14）はツールバー経由の行操作6種と
 *   保存の書き込み回数を扱う。階層表示モード・俯瞰パネル・キー操作には触れていない
 * - `estimate-hierarchy-move-e2e.spec.ts`（53.13）は「上の階層へ／下の階層へ」ボタン単体の
 *   階層移動を扱い、**深さ1のルート項目のみ**を対象にしている
 * - `estimate-navigation-e2e.spec.ts` は画面間の遷移（見積書一覧⇄詳細）で、明細内部の
 *   階層移動とは別物
 *
 * 本 spec が埋めるのは、既存のどれも触れていない次の6点である。
 * 1. ツリー表示の折りたたみで**子孫が画面から消える**こと（45.4, 45.5）
 * 2. ドリルダウン表示で階層を下げ、**経路（パンくず）から戻れる**こと（45.7, 45.8）
 * 3. 表示モードを切り替えても**未保存の編集内容が消えない**こと（45.10）
 * 4. 俯瞰パネルで項目を選ぶと明細の**表示位置が当該項目まで動く**こと（46.5）
 * 5. セル入力中はキー操作で行操作が発火せず（47.5）、行選択中は範囲選択と
 *    範囲全体の階層上げ下げが効くこと（44.1, 44.3, 47.6）
 * 6. 行削除を取り消せ（48.1）、保存が成功すると取り消し履歴が破棄されること（48.7）
 *
 * さらに 1〜6 を一続きに行う間、サーバーへの書き込みが**0件**であることを
 * ブラウザが実際に送出したリクエストで検証する（45.10, 47.8, 48.5）。
 *
 * ## フィクスチャを root→level1→level2 の3階層にしている理由
 *
 * Task 54.9 の監査で「`useEstimateKeyboard.parentLevelKeyOf` が親ではなく祖父を返すよう
 * 変異させても既存テストが1件も落ちない」穴が見つかっている。原因は既存のフィクスチャが
 * 深さ1しか持たず、**親・祖父・ルートが区別できなかった**こと。本 spec の階層上げは
 * 「孫 → 子の兄弟（＝親の直下）」を通すため、祖父やルートへ落ちる実装では失敗する。
 *
 * ## 書き込み0件の観測窓が空振りしないための作り
 *
 * 「0件であること」は、観測窓が早く閉じても・リスナーが外れていても真になってしまう。
 * そこで窓は**一連の操作の前に開き、最後の保存まで開けたまま**にして、
 * 最終的に `PUT /:id/save` が**ちょうど1件記録されている**ことを確認する。
 * リスナーが死んでいれば保存の1件も記録されず、この検証が落ちる。
 * 窓を閉じる契機は 53.14 の是正と同じく `estimate-unsaved-indicator` の消滅
 * （`useEstimateEditor.save` が `await onSave(...)` の解決後に `isDirty` を下げる）。
 *
 * Requirements coverage (estimate-creation):
 * - 44.1: 連続する複数の明細行を範囲として選択可能とする
 * - 44.2: 範囲選択を解除した場合、選択状態を単一項目の選択なしの状態に戻す
 * - 44.3: 複数行が選択されている場合、削除・複写・階層の上げ下げを選択範囲全体に適用する
 * - 44.4: 範囲の階層下げは先頭行を親とし、先頭行を除く選択行をその子として配置する
 * - 44.5: 範囲の階層上げは選択行を現在の親項目の兄弟レベルへ移動する
 * - 44.8: 複数行が選択されている場合、選択中の行数を画面上に表示する
 * - 45.4: ツリー表示では子項目を持つ項目に展開/折りたたみの操作を提供する
 * - 45.5: 項目を折りたたんだ場合、その子孫項目を非表示にする
 * - 45.7: ドリルダウン表示で現在階層の位置を経路として表示し、各階層へ戻る操作を提供する
 * - 45.8: ドリルダウン表示で階層を下げた場合、その項目の子項目の一覧へ切り替える
 * - 45.9: ドリルダウン表示で階層を上げた場合、親項目が属する階層の一覧へ切り替える
 * - 45.10: 階層表示モードを切り替えた場合、未保存の編集内容を保持する
 * - 46.5: 階層構造パネルの項目を選択した場合、明細の表示を当該項目へ移動し選択状態にする
 * - 47.5: セルの文字入力中のキーボード操作では文字編集を優先し、行操作を実行しない
 * - 47.6: 範囲選択中に固有のキーボード操作（範囲に対する階層の上げ下げ等）を有効にする
 * - 47.7: 範囲選択解除の操作で範囲選択を解除する
 * - 47.8: キーボード操作による行操作はサーバーへの保存を伴わずに画面上の明細を更新する
 * - 48.1: 明細に対する編集操作の取り消し（元に戻す）を提供する
 * - 48.4: 取り消し可能な履歴が存在しない場合、取り消し操作を無効状態で表示する
 * - 48.5: 取り消し・やり直しはサーバーへの保存を伴わずに画面上の明細を更新する
 * - 48.7: 保存操作が成功した場合、取り消し履歴を破棄する
 *
 * @module e2e/specs/estimate/estimate-hierarchy-keyboard-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  buildNewEstimateItemNode,
  findEstimateItemByName,
  getEstimateItemTree,
  saveEstimateDraft,
  type EstimateItemNode,
  type SaveNodePayload,
} from '../../helpers/estimate-draft';

// ============================================================================
// フィクスチャ定義
// ============================================================================

/**
 * 明細フィクスチャの項目名
 *
 * 親A の配下だけを3階層（親A → 子A1 → 孫A1a/孫A1b）にしてある。
 * 「孫の階層上げが親A の直下へ着地する」ことを見るには、親（子A1）・祖父（親A）・
 * ルートの3者が別々のキーとして存在している必要がある（54.9 の申し送り）。
 *
 * 親D〜親H は俯瞰パネルからの移動（46.5）を検証するための嵩上げで、明細テーブルの
 * スクロール領域（`maxHeight: 600px`）を確実に溢れさせる。
 */
const NAME = {
  rootA: '階層キー親A',
  childA1: '階層キー子A1',
  grandA1a: '階層キー孫A1a',
  grandA1b: '階層キー孫A1b',
  childA2: '階層キー子A2',
  rootB: '階層キー親B',
  childB1: '階層キー子B1',
  rootC: '階層キー親C',
} as const;

/** スクロールを発生させるための追加ルート項目 */
const FILLER_NAMES = [
  '階層キー親D',
  '階層キー親E',
  '階層キー親F',
  '階層キー親G',
  '階層キー親H',
] as const;

/** フィクスチャの全項目数（ツリー表示で描画される行数と一致する） */
const TOTAL_ITEM_COUNT = 8 + FILLER_NAMES.length;

/** 3行1セットの項目を組み立てる（金額を持たせて集計の再計算も動く状態にする） */
const node = (name: string, children: SaveNodePayload[] = []): SaveNodePayload =>
  buildNewEstimateItemNode({
    name,
    unit: '式',
    quantity: 1,
    estimateUnitPrice: 1000,
    executionUnitPrice: 900,
    vendorUnitPrice: 800,
    children,
  });

/**
 * 見積項目テーブル内の項目ラッパーを指すセレクタ
 *
 * 3行1セットの内側要素は `data-testid="estimate-item-row"` を持つため、前方一致だけでは
 * 項目ラッパー（`estimate-item-<id>`）と混ざる。明示的に除外する。
 */
const ROW_SELECTOR =
  '[aria-label="見積項目テーブル"] [data-testid^="estimate-item-"]:not([data-testid="estimate-item-row"])';

/** ツリー表示の1階層あたりのインデント幅（`EstimateItemTreeView.INDENT_WIDTH_PX`） */
const INDENT_WIDTH_PX = 16;

test.describe('階層ナビゲーションとキーボード操作', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

  // ==========================================================================
  // 共通ヘルパー
  // ==========================================================================

  /** 明細ツリーをフィクスチャの初期状態へ戻す */
  const resetItemTree = async (page: Page): Promise<void> => {
    await saveEstimateDraft(page.request, accessToken, createdEstimateId!, [
      node(NAME.rootA, [
        node(NAME.childA1, [node(NAME.grandA1a), node(NAME.grandA1b)]),
        node(NAME.childA2),
      ]),
      node(NAME.rootB, [node(NAME.childB1)]),
      node(NAME.rootC),
      ...FILLER_NAMES.map((name) => node(name)),
    ]);
  };

  const fetchTree = async (page: Page): Promise<EstimateItemNode[]> =>
    await getEstimateItemTree(page.request, accessToken, createdEstimateId!);

  /** フィクスチャの項目名 → 項目ID の対応表を作る */
  const fetchItemIds = async (page: Page): Promise<Record<string, string>> => {
    const tree = await fetchTree(page);
    const ids: Record<string, string> = {};
    for (const name of [...Object.values(NAME), ...FILLER_NAMES]) {
      const found = findEstimateItemByName(tree, name);
      expect(found, `フィクスチャに ${name} が見つからない`).toBeTruthy();
      ids[name] = found!.id;
    }
    return ids;
  };

  /** 明細テーブルが描画されるまで待つ */
  const waitForItemTable = async (page: Page): Promise<void> => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.locator('[aria-label="見積項目テーブル"]')).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 俯瞰パネルは既定で表示される（46.1, 46.7）
    await expect(page.getByTestId('estimate-hierarchy-panel')).toBeVisible({
      timeout: getTimeout(15000),
    });
  };

  /** 見積書画面を開いて明細が描画されるまで待つ */
  const openEstimatePage = async (page: Page): Promise<void> => {
    await page.goto(`/estimates/${createdEstimateId}`);
    await waitForItemTable(page);
  };

  /**
   * 階層表示モードを明示的に設定する（45.1）
   *
   * モードは端末単位で `localStorage` に永続化される（45.11 / 54.4）ため、
   * 初期モードは前のテストの操作に依存しうる。各テストは前提とするモードを
   * 必ず自分で確定させる。同じモードの再選択も現在階層をルートへ戻すだけで
   * 副作用がないため、条件分岐なしに常に押してよい。
   */
  const setViewMode = async (page: Page, mode: 'tree' | 'drilldown'): Promise<void> => {
    const radio = page.getByTestId(`view-mode-${mode}`);
    await expect(radio).toBeVisible({ timeout: getTimeout(10000) });
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true', { timeout: getTimeout(10000) });
  };

  /** 明細操作ツールバーのボタンを取る（「削除」は見積書ヘッダーにもあるため限定する） */
  const toolbarButton = (page: Page, name: string): Locator =>
    page.getByTestId('estimate-item-toolbar').getByRole('button', { name, exact: true });

  /** 明細行のラッパー要素 */
  const itemRow = (page: Page, itemId: string): Locator =>
    page.getByTestId(`estimate-item-${itemId}`);

  /** 見積金額行（3行1セットの先頭）の入力欄を取る */
  const estimateLineInput = (page: Page, itemId: string, label: string): Locator =>
    page.getByTestId(`estimate-item-${itemId}`).locator(`input[aria-label="${label}"]`).first();

  /**
   * 明細行を選択し、キー操作が届く状態（行そのものにフォーカスがある状態）にする
   *
   * `useEstimateKeyboard` は明細領域の `onKeyDown` として配線されており、
   * グローバルリスナーではない。フォーカスが行の中に無いとキー操作は届かないため、
   * フォーカス位置も検証しておく（ここが崩れると以降のキー操作の検証が
   * 「何も起きない」ことを見ているだけになる）。
   */
  const selectRow = async (page: Page, itemId: string): Promise<void> => {
    const row = itemRow(page, itemId);
    await expect(row).toBeVisible({ timeout: getTimeout(10000) });
    await row.click({ position: { x: 5, y: 5 } });
    await expect(row).toHaveAttribute('data-selected', 'true');
    await expect(row).toBeFocused();
  };

  /**
   * ツリー表示の行のインデント段数を読む（`paddingLeft = depth * 16px`）
   *
   * 階層の深さは画面上ではインデントとして現れる。DOM から深さを読むことで
   * 「親の直下へ戻ったのか、ルートまで飛んだのか」を区別できる。
   */
  const rowDepth = async (page: Page, itemId: string): Promise<number> => {
    const paddingLeft = await itemRow(page, itemId).evaluate(
      (element) => (element as HTMLElement).style.paddingLeft
    );
    const px = Number.parseFloat(paddingLeft.replace('px', ''));
    expect(Number.isNaN(px), `インデント値を読めない: ${paddingLeft}`).toBe(false);
    return px / INDENT_WIDTH_PX;
  };

  /** 俯瞰パネルの項目（`treeitem`）を取る */
  const panelNode = (page: Page, itemId: string): Locator =>
    page.getByTestId(`hierarchy-node-${itemId}`);

  /**
   * APIへの書き込みリクエストを**実際のネットワーク通信として**収集する
   *
   * 53.14（`estimate-row-operation-overhead-e2e.spec.ts`）で確立した数え方をそのまま用いる。
   * 明細の読み込みは GET のみなので、GET / OPTIONS 以外をすべて書き込みとして数え、
   * 明細操作と無関係に起こりうる認証系（`/api/auth/*`）だけを除外する。
   */
  const collectWriteRequests = (page: Page): { requests: string[]; stop: () => void } => {
    const requests: string[] = [];
    const record = (request: { url: () => string; method: () => string }): void => {
      const url = request.url();
      const method = request.method();
      if (!url.startsWith(API_BASE_URL) || url.includes('/api/auth/')) {
        return;
      }
      if (method === 'GET' || method === 'OPTIONS') {
        return;
      }
      requests.push(`${method} ${url}`);
    };
    page.on('request', record);
    return { requests, stop: () => page.off('request', record) };
  };

  /**
   * 保存ボタンを押し、保存ハンドラが完全に解決するまで待つ
   *
   * 観測窓を閉じる契機は 53.14 の是正と同じ「未保存インジケーターの消滅」。
   * `waitForLoadState('networkidle')` はナビゲーションが無い局面では即座に返るため、
   * 保存ハンドラ内の追加の書き込みを取りこぼす。
   */
  const saveAndWaitForSettled = async (page: Page): Promise<void> => {
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

    await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0, {
      timeout: getTimeout(10000),
    });
  };

  /** ログインしてアクセストークンを取得する */
  const loginAndCaptureToken = async (page: Page): Promise<void> => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).toBeTruthy();
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

      const projectName = `E2E階層キー操作テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト2-2-2');

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

    test('準備2: 3階層の明細を持つ見積書を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAndCaptureToken(page);

      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '階層ナビゲーションテスト用見積書' },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      createdEstimateId = (await estimateResponse.json()).id;
      expect(createdEstimateId).toBeTruthy();

      await resetItemTree(page);

      // フィクスチャが root→level1→level2 の3階層になっていること（54.9 の申し送り）
      const tree = await fetchTree(page);
      const rootA = findEstimateItemByName(tree, NAME.rootA);
      const childA1 = findEstimateItemByName(tree, NAME.childA1);
      const grandA1a = findEstimateItemByName(tree, NAME.grandA1a);
      expect(rootA?.parentId).toBeNull();
      expect(childA1?.parentId).toBe(rootA!.id);
      expect(grandA1a?.parentId).toBe(childA1!.id);
    });
  });

  // ==========================================================================
  // ツリー表示の折りたたみ（45.4, 45.5）
  // ==========================================================================

  test.describe('ツリー表示の折りたたみ', () => {
    /**
     * @requirement estimate-creation/REQ-45.4
     * @requirement estimate-creation/REQ-45.5
     */
    test('子を持つ項目を折りたたむと子孫が画面から消え、展開すると戻る (estimate-creation/REQ-45.4, estimate-creation/REQ-45.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');

      // 全階層が一覧されている（45.3）
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);

      // 葉には折りたたみ操作を出さない（45.4 は「子項目を持つ項目に」提供する）
      await expect(
        itemRow(page, ids[NAME.grandA1a]!).getByRole('button', { name: '折りたたむ' })
      ).toHaveCount(0);

      // --- 親A を折りたたむ（45.5）---
      const collapseRootA = itemRow(page, ids[NAME.rootA]!).getByRole('button', {
        name: '折りたたむ',
      });
      await expect(collapseRootA).toHaveAttribute('aria-expanded', 'true');
      await collapseRootA.click();

      // 直接の子だけでなく孫まで消える
      for (const name of [NAME.childA1, NAME.grandA1a, NAME.grandA1b, NAME.childA2]) {
        await expect(itemRow(page, ids[name]!)).toHaveCount(0);
      }
      // 折りたたんだ項目自身と他の枝は残る
      await expect(itemRow(page, ids[NAME.rootA]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.childB1]!)).toBeVisible();
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT - 4);

      // --- 展開して戻す（45.4）---
      const expandRootA = itemRow(page, ids[NAME.rootA]!).getByRole('button', { name: '展開する' });
      await expect(expandRootA).toHaveAttribute('aria-expanded', 'false');
      await expandRootA.click();

      for (const name of [NAME.childA1, NAME.grandA1a, NAME.grandA1b, NAME.childA2]) {
        await expect(itemRow(page, ids[name]!)).toBeVisible();
      }
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);
    });
  });

  // ==========================================================================
  // ドリルダウン表示の階層下げと経路からの復帰（45.7, 45.8）
  // ==========================================================================

  test.describe('ドリルダウン表示の階層移動', () => {
    /**
     * @requirement estimate-creation/REQ-45.8
     * @requirement estimate-creation/REQ-45.7
     * @requirement estimate-creation/REQ-45.9
     */
    test('階層を下げると子の一覧へ切り替わり、経路から上位の階層へ戻れる (estimate-creation/REQ-45.8, estimate-creation/REQ-45.7)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'drilldown');

      const path = page.getByRole('navigation', { name: '明細の階層経路' });

      // --- ルート階層: ルート項目のみが並ぶ（45.6）---
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(3 + FILLER_NAMES.length);
      await expect(itemRow(page, ids[NAME.childA1]!)).toHaveCount(0);
      await expect(path.getByText('全体', { exact: true })).toHaveAttribute('aria-current', 'true');
      // ルート階層ではこれ以上上げられない
      await expect(page.getByRole('button', { name: '一つ上の階層へ戻る' })).toHaveCount(0);

      // --- 親A の子階層へ下げる（45.8）---
      await page.getByRole('button', { name: `${NAME.rootA} の子階層を表示`, exact: true }).click();
      await expect(itemRow(page, ids[NAME.childA1]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.childA2]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.rootA]!)).toHaveCount(0);
      await expect(itemRow(page, ids[NAME.grandA1a]!)).toHaveCount(0);
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(2);
      await expect(path.getByText(NAME.rootA, { exact: true })).toHaveAttribute(
        'aria-current',
        'true'
      );

      // --- さらに子A1 の子階層へ下げる（45.8 / 深さ2）---
      await page
        .getByRole('button', { name: `${NAME.childA1} の子階層を表示`, exact: true })
        .click();
      await expect(itemRow(page, ids[NAME.grandA1a]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.grandA1b]!)).toBeVisible();
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(2);

      // 経路はルートから現在階層まで積み上がる（45.7）
      await expect(path.getByRole('button', { name: '全体', exact: true })).toBeVisible();
      await expect(path.getByRole('button', { name: NAME.rootA, exact: true })).toBeVisible();
      await expect(path.getByText(NAME.childA1, { exact: true })).toHaveAttribute(
        'aria-current',
        'true'
      );

      // --- 経路の「親A」をクリックして1段戻る（45.7）---
      await path.getByRole('button', { name: NAME.rootA, exact: true }).click();
      await expect(itemRow(page, ids[NAME.childA1]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.childA2]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.grandA1a]!)).toHaveCount(0);
      await expect(path.getByText(NAME.rootA, { exact: true })).toHaveAttribute(
        'aria-current',
        'true'
      );

      // --- キー操作（Alt+↑）でも一つ上の階層へ戻る（45.9）---
      //
      // 深さ2の階層（子A1）から上げた着地点が**親A** であることを見る。
      // 祖父やルートを親と取り違える実装は、深さ1のフィクスチャでは
      // いずれも `null`（ルート）に潰れて検出できない（54.9 の申し送り）。
      await page
        .getByRole('button', { name: `${NAME.childA1} の子階層を表示`, exact: true })
        .click();
      await expect(itemRow(page, ids[NAME.grandA1a]!)).toBeVisible();
      await selectRow(page, ids[NAME.grandA1a]!);
      await page.keyboard.press('Alt+ArrowUp');
      await expect(itemRow(page, ids[NAME.childA1]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.childA2]!)).toBeVisible();
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(2);
      await expect(path.getByText(NAME.rootA, { exact: true })).toHaveAttribute(
        'aria-current',
        'true'
      );

      // --- 経路の「全体」でルート階層まで戻る（45.7）---
      await path.getByRole('button', { name: '全体', exact: true }).click();
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(3 + FILLER_NAMES.length);
      await expect(itemRow(page, ids[NAME.rootA]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.childA1]!)).toHaveCount(0);
    });
  });

  // ==========================================================================
  // 表示モード切替と未保存の編集内容（45.10）
  // ==========================================================================

  test.describe('表示モード切替と未保存の編集内容', () => {
    /**
     * @requirement estimate-creation/REQ-45.10
     */
    test('表示モードを切り替えても未保存の編集内容が保持され、サーバーへも書き込まれない (estimate-creation/REQ-45.10)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');

      // 深い階層（level2）の項目を編集する
      const editedName = '編集後_45_10';
      const editedRemarks = '備考_45_10';
      await estimateLineInput(page, ids[NAME.grandA1a]!, '名称').fill(editedName);
      await estimateLineInput(page, ids[NAME.grandA1a]!, '備考').fill(editedRemarks);
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      // --- ツリー表示 → ドリルダウン表示 ---
      await setViewMode(page, 'drilldown');
      // 切替でルート階層へ戻るので、編集した行まで階層を下げて確認する
      await page.getByRole('button', { name: `${NAME.rootA} の子階層を表示`, exact: true }).click();
      await page
        .getByRole('button', { name: `${NAME.childA1} の子階層を表示`, exact: true })
        .click();
      await expect(estimateLineInput(page, ids[NAME.grandA1a]!, '名称')).toHaveValue(editedName);
      await expect(estimateLineInput(page, ids[NAME.grandA1a]!, '備考')).toHaveValue(editedRemarks);

      // ドリルダウン表示中にさらに編集を足す
      const drilldownEdit = '編集後_45_10_ドリルダウン';
      await estimateLineInput(page, ids[NAME.grandA1b]!, '名称').fill(drilldownEdit);

      // --- ドリルダウン表示 → ツリー表示 ---
      await setViewMode(page, 'tree');
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);
      await expect(estimateLineInput(page, ids[NAME.grandA1a]!, '名称')).toHaveValue(editedName);
      await expect(estimateLineInput(page, ids[NAME.grandA1a]!, '備考')).toHaveValue(editedRemarks);
      await expect(estimateLineInput(page, ids[NAME.grandA1b]!, '名称')).toHaveValue(drilldownEdit);

      // 未保存のままである（＝切替が保存を誘発していない）
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      // サーバー側は初期状態のまま
      const tree = await fetchTree(page);
      expect(findEstimateItemByName(tree, NAME.grandA1a)).toBeTruthy();
      expect(findEstimateItemByName(tree, editedName)).toBeUndefined();
      expect(findEstimateItemByName(tree, drilldownEdit)).toBeUndefined();
    });
  });

  // ==========================================================================
  // 俯瞰パネルからの移動（46.5）
  // ==========================================================================

  test.describe('俯瞰パネルからの移動', () => {
    /**
     * 46.5 の「明細の表示を当該項目へ移動」は、選択状態が変わるだけでは満たせない。
     * 行数の多い見積書では対象が一覧に含まれていても画面外にあるためで、
     * 54.5 のレビューはこの点で一度 REJECTED になっている。
     *
     * そこで**明細のスクロール位置そのもの**を検証する。
     * 1. スクロール領域を末尾まで送り、対象行が可視範囲の外にあることを確かめる
     * 2. 俯瞰パネルで対象を選ぶ
     * 3. 対象行が可視範囲の内側へ入ったことを確かめる
     *
     * 手順1で「そもそもスクロールしていない」場合は手順3が自動的に真になってしまうため、
     * スクロール量が0でないことを明示的に確かめる。
     *
     * @requirement estimate-creation/REQ-46.5
     */
    test('俯瞰パネルで項目を選ぶと明細の表示位置が当該項目まで移動し選択状態になる (estimate-creation/REQ-46.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);

      /** 明細のスクロール領域と対象行の位置関係を読む */
      const measure = async (
        itemId: string
      ): Promise<{
        scrollTop: number;
        scrollable: number;
        rowTop: number;
        rowBottom: number;
        bodyTop: number;
        bodyBottom: number;
      }> =>
        await page.evaluate((targetTestId) => {
          const table = document.querySelector('[aria-label="見積項目テーブル"]');
          if (table === null) {
            throw new Error('見積項目テーブルが見つからない');
          }
          const body = Array.from(table.querySelectorAll<HTMLElement>('div')).find(
            (element) =>
              getComputedStyle(element).overflowY === 'auto' &&
              element.querySelector(`[data-testid="${targetTestId}"]`) !== null
          );
          if (body === undefined) {
            throw new Error('明細のスクロール領域が見つからない');
          }
          const row = body.querySelector<HTMLElement>(`[data-testid="${targetTestId}"]`);
          if (row === null) {
            throw new Error(`対象行が見つからない: ${targetTestId}`);
          }
          const bodyRect = body.getBoundingClientRect();
          const rowRect = row.getBoundingClientRect();
          return {
            scrollTop: body.scrollTop,
            scrollable: body.scrollHeight - body.clientHeight,
            rowTop: rowRect.top,
            rowBottom: rowRect.bottom,
            bodyTop: bodyRect.top,
            bodyBottom: bodyRect.bottom,
          };
        }, `estimate-item-${itemId}`);

      const targetId = ids[NAME.rootA]!;

      // 明細が1画面に収まっていると「移動した」ことを観測できない
      const initial = await measure(targetId);
      expect(
        initial.scrollable,
        '明細のスクロール領域が溢れていないため 46.5 の移動を観測できない'
      ).toBeGreaterThan(0);

      // --- 手順1: 末尾までスクロールし、対象行を可視範囲の外へ追いやる ---
      await page.evaluate((targetTestId) => {
        const table = document.querySelector('[aria-label="見積項目テーブル"]')!;
        const body = Array.from(table.querySelectorAll<HTMLElement>('div')).find(
          (element) =>
            getComputedStyle(element).overflowY === 'auto' &&
            element.querySelector(`[data-testid="${targetTestId}"]`) !== null
        )!;
        body.scrollTop = body.scrollHeight;
      }, `estimate-item-${targetId}`);

      const scrolled = await measure(targetId);
      expect(scrolled.scrollTop, 'スクロールできていない').toBeGreaterThan(0);
      expect(
        scrolled.rowBottom,
        '対象行がまだ可視範囲に残っており、移動の有無を判定できない'
      ).toBeLessThanOrEqual(scrolled.bodyTop);

      // --- 手順2: 俯瞰パネルから対象を選ぶ ---
      await panelNode(page, targetId)
        .getByRole('button', { name: NAME.rootA, exact: true })
        .click();

      // --- 手順3: 対象行が可視範囲へ入る ---
      await expect
        .poll(
          async () => {
            const after = await measure(targetId);
            return after.rowTop >= after.bodyTop - 1 && after.rowTop <= after.bodyBottom;
          },
          {
            timeout: getTimeout(10000),
            message: '俯瞰パネルで選んだ項目まで明細の表示が移動していない（46.5）',
          }
        )
        .toBe(true);

      const revealed = await measure(targetId);
      expect(revealed.scrollTop).toBeLessThan(scrolled.scrollTop);

      // 当該項目が選択状態になる（46.5 後段）
      await expect(itemRow(page, targetId)).toHaveAttribute('data-selected', 'true');
      await expect(panelNode(page, targetId)).toHaveAttribute('aria-selected', 'true');
    });
  });

  // ==========================================================================
  // セル入力中のキー操作（47.5）
  // ==========================================================================

  test.describe('セル入力中のキー操作', () => {
    /**
     * @requirement estimate-creation/REQ-47.5
     */
    test('セルの文字入力中は行操作のキーが発火せず、入力内容も維持される (estimate-creation/REQ-47.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);

      const targetId = ids[NAME.grandA1a]!;
      const depthBefore = await rowDepth(page, targetId);
      expect(depthBefore).toBe(2);

      // セルへ文字を入力し、キャレットを末尾に置いたまま行操作のキーを押す
      const editing = '入力中_47_5';
      const nameInput = estimateLineInput(page, targetId, '名称');
      await nameInput.fill(editing);
      await expect(nameInput).toBeFocused();

      // 47.1 が列挙する行操作の割当（54.6 で確定）を、入力中に一通り押す
      for (const key of [
        'Alt+Delete', // 削除
        'Alt+Insert', // 挿入
        'Alt+c', // 複写
        'Alt+Shift+ArrowRight', // 階層を下げる
        'Alt+Shift+ArrowLeft', // 階層を上げる
        'Alt+Shift+ArrowDown', // 同一階層で並び替え
        'Alt+a', // 項目追加
      ]) {
        await nameInput.press(key);
        // 押すたびにフォーカスがセルへ留まっていること（文字編集が優先されている）
        await expect(nameInput).toBeFocused();
      }

      // 行は1件も増減せず、階層も変わらない
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);
      await expect(itemRow(page, targetId)).toBeVisible();
      expect(await rowDepth(page, targetId)).toBe(depthBefore);
      await expect(itemRow(page, ids[NAME.grandA1b]!)).toBeVisible();
      expect(await rowDepth(page, ids[NAME.grandA1b]!)).toBe(2);

      // 入力した文字も失われていない
      await expect(nameInput).toHaveValue(editing);

      // 参考: 入力そのものは編集として反映されている（＝キーが届く状態だった証拠）
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();
    });
  });

  // ==========================================================================
  // 行選択中の範囲選択と階層の上げ下げ（44.1, 44.3, 47.6, 47.7）
  // ==========================================================================

  test.describe('行選択中のキー操作', () => {
    /**
     * 階層上げは **孫（level2）→ 子A1 の兄弟（＝親A の直下）** を通す。
     * 深さ1のフィクスチャでは親・祖父・ルートがいずれも区別できず、
     * 誤って祖父やルートへ移す実装を検出できない（54.9 の申し送り）。
     *
     * @requirement estimate-creation/REQ-44.1
     * @requirement estimate-creation/REQ-44.3
     * @requirement estimate-creation/REQ-44.4
     * @requirement estimate-creation/REQ-44.5
     * @requirement estimate-creation/REQ-44.8
     * @requirement estimate-creation/REQ-47.6
     * @requirement estimate-creation/REQ-47.7
     */
    test('行選択中はキーで範囲選択でき、範囲全体の階層上げ下げと解除が効く (estimate-creation/REQ-44.1, estimate-creation/REQ-44.3, estimate-creation/REQ-47.6)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');

      const firstId = ids[NAME.grandA1a]!;
      const secondId = ids[NAME.grandA1b]!;
      expect(await rowDepth(page, firstId)).toBe(2);
      expect(await rowDepth(page, secondId)).toBe(2);

      // --- 範囲選択（44.1, 47.6）---
      await selectRow(page, firstId);
      await expect(page.getByTestId('selected-row-count')).toHaveCount(0);

      await page.keyboard.press('Shift+ArrowDown');
      await expect(itemRow(page, firstId)).toHaveAttribute('data-selected', 'true');
      await expect(itemRow(page, secondId)).toHaveAttribute('data-selected', 'true');
      // 選択中の行数を提示する（44.8）
      await expect(page.getByTestId('selected-row-count')).toHaveText('2行を選択中');

      // --- 範囲全体の階層上げ（44.3, 44.5, 47.6）---
      //
      // 親（子A1）の兄弟レベル＝親A の直下へ着地する。祖父やルートへ移す実装なら
      // インデントが 0 段になるため区別できる。
      await page.keyboard.press('Alt+Shift+ArrowLeft');
      await expect
        .poll(async () => await rowDepth(page, firstId), {
          timeout: getTimeout(10000),
          message: '階層上げで先頭行が親項目の兄弟レベルへ移動していない（44.5）',
        })
        .toBe(1);
      expect(await rowDepth(page, secondId), '選択範囲の2行目が一緒に移動していない（44.3）').toBe(
        1
      );
      // 子A1 は子を失ったため折りたたみ操作が消える（＝2行とも本当に抜けた）
      await expect(
        itemRow(page, ids[NAME.childA1]!).getByRole('button', { name: '折りたたむ' })
      ).toHaveCount(0);
      // 親A は健在（ルートまで飛んでいない）
      await expect(itemRow(page, ids[NAME.rootA]!)).toBeVisible();
      expect(await rowDepth(page, ids[NAME.childA1]!)).toBe(1);

      // 範囲選択は維持されている（47.6）
      await expect(page.getByTestId('selected-row-count')).toHaveText('2行を選択中');

      // --- 範囲全体の階層下げ（44.3, 44.4, 47.6）---
      //
      // 先頭行が親になり、残りの選択行がその子になる。
      await page.keyboard.press('Alt+Shift+ArrowRight');
      await expect
        .poll(async () => await rowDepth(page, secondId), {
          timeout: getTimeout(10000),
          message: '階層下げで2行目が先頭行の子になっていない（44.4）',
        })
        .toBe(2);
      expect(await rowDepth(page, firstId), '先頭行は親として同じ階層に留まる（44.4）').toBe(1);
      await expect(itemRow(page, firstId).getByRole('button', { name: '折りたたむ' })).toHaveCount(
        1
      );

      // --- 範囲選択の解除（44.2, 47.7）---
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('selected-row-count')).toHaveCount(0);
      await expect(page.locator(`${ROW_SELECTOR}[data-selected="true"]`)).toHaveCount(0);

      // ここまで一切保存していない
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();
      const tree = await fetchTree(page);
      expect(findEstimateItemByName(tree, NAME.grandA1a)!.parentId).toBe(ids[NAME.childA1]);
    });
  });

  // ==========================================================================
  // 取り消しと保存後の履歴破棄（48.1, 48.4, 48.7）
  // ==========================================================================

  test.describe('取り消しと履歴の破棄', () => {
    /**
     * @requirement estimate-creation/REQ-48.1
     * @requirement estimate-creation/REQ-48.4
     * @requirement estimate-creation/REQ-48.7
     */
    test('削除した行を取り消しで復元でき、保存が成功すると取り消し履歴が破棄される (estimate-creation/REQ-48.1, estimate-creation/REQ-48.7)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');

      const undoButton = page.getByTestId('undo-button');
      const redoButton = page.getByTestId('redo-button');

      // 履歴が無い間は無効表示（48.4）
      await expect(undoButton).toBeDisabled();
      await expect(redoButton).toBeDisabled();

      // --- 子を持つ行（親B）を削除する ---
      await selectRow(page, ids[NAME.rootB]!);
      await toolbarButton(page, '削除').click();
      await expect(itemRow(page, ids[NAME.rootB]!)).toHaveCount(0);
      // 子孫も一緒に消える
      await expect(itemRow(page, ids[NAME.childB1]!)).toHaveCount(0);
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT - 2);
      await expect(undoButton).toBeEnabled();

      // --- 取り消しで復元する（48.1）---
      await undoButton.click();
      await expect(itemRow(page, ids[NAME.rootB]!)).toBeVisible();
      await expect(itemRow(page, ids[NAME.childB1]!)).toBeVisible();
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);
      // 行の中身も戻っている
      await expect(estimateLineInput(page, ids[NAME.rootB]!, '名称')).toHaveValue(NAME.rootB);
      await expect(estimateLineInput(page, ids[NAME.childB1]!, '名称')).toHaveValue(NAME.childB1);
      // 取り消した操作はやり直せる（48.2）
      await expect(redoButton).toBeEnabled();

      // --- 保存対象の変更を作ってから保存する ---
      const editedName = '保存後_48_7';
      await estimateLineInput(page, ids[NAME.rootC]!, '名称').fill(editedName);
      await expect(undoButton).toBeEnabled();
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      await saveAndWaitForSettled(page);

      // --- 保存成功で取り消し履歴が破棄される（48.7）---
      await expect(undoButton).toBeDisabled();
      await expect(redoButton).toBeDisabled();

      // 保存内容そのものは反映されている（履歴破棄が保存の失敗によるものでない証明）
      const tree = await fetchTree(page);
      expect(findEstimateItemByName(tree, editedName)).toBeTruthy();
      expect(findEstimateItemByName(tree, NAME.rootB)).toBeTruthy();
    });
  });

  // ==========================================================================
  // 一連の操作中の書き込み0件（45.10, 47.8, 48.5）
  // ==========================================================================

  test.describe('階層操作とキー操作のローカル完結', () => {
    /**
     * 観測窓は一連の操作の前に開き、**最後の保存まで開けたまま**にする。
     * 「0件」は窓が早く閉じても真になるため、窓の終端で保存の1件が
     * 記録されていることをもってリスナーが生きていたことを示す。
     *
     * @requirement estimate-creation/REQ-45.10
     * @requirement estimate-creation/REQ-47.8
     * @requirement estimate-creation/REQ-48.5
     */
    test('折りたたみ・モード切替・パネル選択・キー操作・取り消しを通して書き込みは0件で、保存で1件だけ発生する (estimate-creation/REQ-45.10, estimate-creation/REQ-47.8, estimate-creation/REQ-48.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);
      const ids = await fetchItemIds(page);

      await openEstimatePage(page);
      await setViewMode(page, 'tree');
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);

      // 画面表示後の書き込みリクエストだけを数える
      const { requests: writeRequests, stop } = collectWriteRequests(page);

      // --- 1. ツリー表示の折りたたみ／展開（45.4, 45.5）---
      await itemRow(page, ids[NAME.rootA]!).getByRole('button', { name: '折りたたむ' }).click();
      await expect(itemRow(page, ids[NAME.grandA1a]!)).toHaveCount(0);
      await itemRow(page, ids[NAME.rootA]!).getByRole('button', { name: '展開する' }).click();
      await expect(itemRow(page, ids[NAME.grandA1a]!)).toBeVisible();

      // --- 2. モード切替と階層移動（45.8, 45.10）---
      await setViewMode(page, 'drilldown');
      await page.getByRole('button', { name: `${NAME.rootA} の子階層を表示`, exact: true }).click();
      await expect(itemRow(page, ids[NAME.childA1]!)).toBeVisible();
      await page
        .getByRole('navigation', { name: '明細の階層経路' })
        .getByRole('button', { name: '全体', exact: true })
        .click();
      await expect(itemRow(page, ids[NAME.rootA]!)).toBeVisible();
      await setViewMode(page, 'tree');
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(TOTAL_ITEM_COUNT);

      // --- 3. 俯瞰パネルからの移動と選択（46.5）---
      await panelNode(page, ids[NAME.childA2]!)
        .getByRole('button', { name: NAME.childA2, exact: true })
        .click();
      await expect(itemRow(page, ids[NAME.childA2]!)).toHaveAttribute('data-selected', 'true');

      // --- 4. キー操作による範囲選択と階層の上げ下げ（47.6, 47.8）---
      await selectRow(page, ids[NAME.grandA1a]!);
      await page.keyboard.press('Shift+ArrowDown');
      await expect(page.getByTestId('selected-row-count')).toHaveText('2行を選択中');
      await page.keyboard.press('Alt+Shift+ArrowLeft');
      await expect
        .poll(async () => await rowDepth(page, ids[NAME.grandA1a]!), {
          timeout: getTimeout(10000),
        })
        .toBe(1);
      await page.keyboard.press('Alt+Shift+ArrowRight');
      await expect
        .poll(async () => await rowDepth(page, ids[NAME.grandA1b]!), {
          timeout: getTimeout(10000),
        })
        .toBe(2);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('selected-row-count')).toHaveCount(0);

      // --- 5. 行削除の取り消しとやり直し（48.5）---
      await selectRow(page, ids[NAME.rootC]!);
      await toolbarButton(page, '削除').click();
      await expect(itemRow(page, ids[NAME.rootC]!)).toHaveCount(0);
      await page.getByTestId('undo-button').click();
      await expect(itemRow(page, ids[NAME.rootC]!)).toBeVisible();
      await page.getByTestId('redo-button').click();
      await expect(itemRow(page, ids[NAME.rootC]!)).toHaveCount(0);

      // --- ここまでサーバーへの書き込みは1件も起きていない ---
      expect(writeRequests).toEqual([]);
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      // DB は操作前のまま
      const untouched = await fetchTree(page);
      expect(findEstimateItemByName(untouched, NAME.rootC)).toBeTruthy();
      expect(findEstimateItemByName(untouched, NAME.grandA1a)!.parentId).toBe(ids[NAME.childA1]);

      // --- 保存で書き込みはちょうど1件（窓を開けたまま行う）---
      await saveAndWaitForSettled(page);
      stop();

      expect(writeRequests).toEqual([
        `PUT ${API_BASE_URL}/api/estimates/${createdEstimateId}/save`,
      ]);

      // 保存後は画面の状態がそのまま確定している
      const saved = await fetchTree(page);
      expect(findEstimateItemByName(saved, NAME.rootC)).toBeUndefined();
      expect(findEstimateItemByName(saved, NAME.grandA1b)!.parentId).toBe(ids[NAME.grandA1a]);
      expect(findEstimateItemByName(saved, NAME.grandA1a)!.parentId).toBe(ids[NAME.rootA]);
    });
  });
});
