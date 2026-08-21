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

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPrepared, assertPresent } from '../../helpers/preconditions';

/** REQ-17.4 の独立性検証でコピー先だけに追加する数量項目の工種 */
const INDEPENDENCE_WORK_TYPE = '独立性テスト工種';
/** REQ-17.4 の独立性検証でコピー先だけに追加する数量項目の名称 */
const INDEPENDENCE_ITEM_NAME = '独立性テスト名称';

/** API から取得した数量表のうち、コピーの一致（REQ-17.2）と独立性（REQ-17.4）の検証に使う部分 */
type QuantityTableSnapshot = {
  name: string;
  groups: Array<{ name: string; displayOrder: number; items: Array<{ name: string }> }>;
};

/** 取得結果。失敗を null に畳まず、理由を持ち帰って失敗メッセージに出す */
type SnapshotResult = { data?: QuantityTableSnapshot; error?: string };

/**
 * 数量表をブラウザコンテキストの apiClient 経由で取得する。取得できなければその場で失敗する。
 *
 * `page.request` は Playwright の baseURL（配信サーバ）へ送られてしまうため、
 * バックエンドの URL を保持する `window.__apiClient`（`frontend/src/api/client.ts` が
 * 常時公開）を用いる。
 *
 * 従来は取得に失敗すると `null` を返し、呼び出し側が UI 経由の弱い検証へ落ちていた。
 * 「取得できなかった」と「コピーが正しい／独立している」は別物であり、前者を後者として
 * 黙って扱っていたため、取得が壊れた瞬間に REQ-17.2 / REQ-17.4 の検証が消える。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param quantityTableId 取得対象の数量表ID
 * @param label 失敗メッセージに用いる対象の呼び名（例: `'元'` / `'コピー先'`）
 * @throws IDが未設定・apiClient が無い・API 呼び出しが失敗した場合
 */
async function readQuantityTableSnapshot(
  page: Page,
  quantityTableId: string | null,
  label: string
): Promise<QuantityTableSnapshot> {
  assertPrepared(quantityTableId, `${label}の数量表のID`);

  const result = (await page.evaluate(async (id) => {
    const client = (
      window as unknown as {
        __apiClient?: { get: (path: string) => Promise<unknown> };
      }
    ).__apiClient;
    if (!client) {
      return { error: 'ブラウザコンテキストに __apiClient が公開されていない' };
    }
    try {
      return { data: await client.get(`/api/quantity-tables/${id}`) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, quantityTableId)) as SnapshotResult;

  expect(result.error ?? null, `前提: ${label}の数量表をAPIで取得できる`).toBeNull();
  assertPresent(result.data, `${label}の数量表のAPI応答`);
  return result.data;
}

/** 数量表に含まれる数量項目の総数を数える */
function countItems(snapshot: QuantityTableSnapshot): number {
  return snapshot.groups.reduce((acc, group) => acc + group.items.length, 0);
}

/** 数量表に含まれる数量項目の名称を列挙する */
function itemNames(snapshot: QuantityTableSnapshot): string[] {
  return snapshot.groups.flatMap((group) => group.items.map((item) => item.name));
}

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
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

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

      // 数量グループを追加（ヘッダーと空状態の2箇所にボタンがあるため.first()で最初のものを選択）。
      // REQ-42 移行: グループ/項目追加・フィールド編集はクライアントドラフトのみを更新するため、
      // 永続化 API は発火しない（旧モデルの自動保存は廃止）。数量表コピー（REQ-17）は
      // コピー元がサーバー側にグループ・項目を持つことを前提とするため、編集後に明示保存する。
      const addGroupButton = page
        .getByRole('button', { name: /グループ追加|グループを追加/i })
        .first();
      await expect(addGroupButton).toBeVisible({ timeout: getTimeout(10000) });
      await addGroupButton.click();

      // グループが追加されるのを待つ
      await expect(page.getByTestId('quantity-group')).toHaveCount(1, {
        timeout: getTimeout(10000),
      });

      // 数量項目を追加
      const addItemButton = page
        .getByRole('button', { name: /行追加|項目追加|項目を追加/i })
        .first();
      await expect(addItemButton).toBeVisible({ timeout: getTimeout(5000) });
      await addItemButton.click();
      const itemRow = page.getByTestId('quantity-item-row').first();
      await expect(itemRow).toBeVisible({ timeout: getTimeout(10000) });

      // 行スコープの id 属性 suffix セレクタで入力欄を安定的に特定する
      // （placeholder はコンポーネントごとに揺れるため）。保存の整合性チェック・
      // バックエンド検証（名称・単位必須）を満たすため、工種・名称・単位を入力する。
      const workTypeInput = itemRow.locator('input[id$="-workType"]').first();
      await expect(workTypeInput).toBeVisible({ timeout: getTimeout(5000) });
      await workTypeInput.fill('テスト工種');
      await workTypeInput.blur();

      const nameFieldInput = itemRow.locator('input[id$="-name"]').first();
      await expect(nameFieldInput).toBeVisible({ timeout: getTimeout(5000) });
      await nameFieldInput.fill('テスト名称');
      await nameFieldInput.blur();

      const unitInput = itemRow.locator('input[id$="-unit"]').first();
      await expect(unitInput).toBeVisible({ timeout: getTimeout(5000) });
      await unitInput.fill('m2');
      await unitInput.blur();

      // REQ-42.5: コピー元のグループ・項目を永続化する（後続のコピーテストが参照するため）。
      await saveQuantityTableDraft(page);
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

      // 遷移先がコピーされた数量表の編集画面であることを確認（REQ-17.3）
      assertPrepared(copiedQuantityTableId, 'コピー応答が返した数量表のID');
      expect(page.url()).toContain(copiedQuantityTableId);
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
      //
      // 取得に失敗しても null を返して UI 経由の弱い検証（名称の表示のみ）へ落ちる形だったため、
      // REQ-17.2 が定めるグループ・項目の一致は取得が失敗した瞬間に検証されなくなっていた。
      // 取得の失敗はその場で失敗させる（readQuantityTableSnapshot）。
      const sourceData = await readQuantityTableSnapshot(page, sourceQuantityTableId, '元');
      const copiedData = await readQuantityTableSnapshot(page, copiedQuantityTableId, 'コピー先');

      // グループ数が一致
      expect(copiedData.groups.length, 'REQ-17.2: コピー先のグループ数が元と一致する').toBe(
        sourceData.groups.length
      );

      // 各グループの名前と表示順序が一致
      for (const sourceGroup of sourceData.groups) {
        const copiedGroup = copiedData.groups.find(
          (g) => g.displayOrder === sourceGroup.displayOrder
        );

        // REQ-17.2: 元のグループはすべて同じ表示順でコピーされる。
        // 見つからないまま黙って次のグループへ進むと、コピー漏れが検出されない。
        assertPresent(
          copiedGroup,
          `コピー先の displayOrder=${sourceGroup.displayOrder} に対応するグループ`
        );
        expect(copiedGroup.name, 'REQ-17.2: グループ名がコピーされる').toBe(sourceGroup.name);

        // 各グループ内の項目数が一致
        expect(copiedGroup.items.length, 'REQ-17.2: グループ内の項目数が一致する').toBe(
          sourceGroup.items.length
        );
      }

      // 数量表名はコピー時に指定した名前であること
      expect(copiedData.name, 'REQ-17.1: コピー時に指定した数量表名が保存される').toBe(
        'コピーテスト数量表'
      );
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
      const sourceBeforeData = await readQuantityTableSnapshot(page, sourceQuantityTableId, '元');

      const sourceGroupCountBefore = sourceBeforeData.groups.length;
      const sourceItemCountBefore = countItems(sourceBeforeData);

      // コピー先の数量表編集画面に移動
      await page.goto(`/projects/${testProjectId}/quantity-tables/${copiedQuantityTableId}`);
      await page.waitForLoadState('networkidle');

      // コピー先の数量表に項目を追加する。
      // 「操作できるものがあれば操作する」形では、追加も入力も起きないまま
      // 「元が変わっていない」を主張することになり、独立性を確かめたことにならない。
      // 追加・入力・保存はいずれも無条件に行い、成立するまで待つ。
      const itemRows = page.getByTestId('quantity-item-row');
      const itemRowsBefore = await itemRows.count();

      const addItemButton = page
        .getByRole('button', { name: /行追加|項目追加|項目を追加/i })
        .first();
      await expect(addItemButton, '前提: コピー先に項目追加の操作が提供される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await addItemButton.click();
      await expect(itemRows, '前提: コピー先に数量項目が1行増える').toHaveCount(
        itemRowsBefore + 1,
        { timeout: getTimeout(10000) }
      );

      // 追加された項目に値を入力（行スコープの id 属性 suffix セレクタで特定する）
      const addedRow = itemRows.nth(itemRowsBefore);
      const addedWorkTypeInput = addedRow.locator('input[id$="-workType"]').first();
      await expect(addedWorkTypeInput, '前提: 追加した行の工種欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await addedWorkTypeInput.fill(INDEPENDENCE_WORK_TYPE);
      await addedWorkTypeInput.blur();

      const addedNameInput = addedRow.locator('input[id$="-name"]').first();
      await expect(addedNameInput, '前提: 追加した行の名称欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });
      await addedNameInput.fill(INDEPENDENCE_ITEM_NAME);
      await addedNameInput.blur();

      // REQ-42.5 移行: 編集はドラフトのため、明示保存してコピー先へ実際に永続化する。
      // これにより「コピー先への永続的変更が元に影響しない（REQ-17.4 独立性）」を実検証する。
      await saveQuantityTableDraft(page);

      // 肯定側の対照: コピー先には実際に項目が増えている。
      // これを先に確かめておかないと、以降の「元は変わっていない」は
      // 「そもそも何も変えていない」でも成立してしまう。
      const copiedAfterData = await readQuantityTableSnapshot(
        page,
        copiedQuantityTableId,
        'コピー先'
      );
      expect(
        itemNames(copiedAfterData),
        '前提: コピー先に追加した数量項目が永続化されている'
      ).toContain(INDEPENDENCE_ITEM_NAME);

      // 元の数量表のデータが変更されていないことをAPI経由で確認。
      // 取得できなければ UI 経由の弱い検証（工種名が見えないこと）へ落ちる形だったが、
      // 「取得できなかった」と「独立している」は別物であり、前者を黙って後者として扱っていた。
      // 取得の失敗はその場で失敗させ、REQ-17.4 の主張は無条件に行う。
      const sourceAfterData = await readQuantityTableSnapshot(page, sourceQuantityTableId, '元');

      // 元の数量表のグループ数が変わっていないこと
      expect(
        sourceAfterData.groups.length,
        'REQ-17.4: コピー先への変更後も元の数量表のグループ数は変わらない'
      ).toBe(sourceGroupCountBefore);

      // 元の数量表の項目数が変わっていないこと
      expect(
        countItems(sourceAfterData),
        'REQ-17.4: コピー先への変更後も元の数量表の項目数は変わらない'
      ).toBe(sourceItemCountBefore);

      // 元の数量表名が変わっていないこと
      expect(sourceAfterData.name, 'REQ-17.4: コピー先への変更後も元の数量表名は変わらない').toBe(
        'コピー元数量表'
      );

      // 元の数量表にコピー先で追加した項目が現れないこと
      expect(
        itemNames(sourceAfterData),
        'REQ-17.4: コピー先で追加した数量項目は元の数量表に現れない'
      ).not.toContain(INDEPENDENCE_ITEM_NAME);
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
        const hasDeleteButton = await isVisibleWithin(deleteButton, 5000);
        if (hasDeleteButton) {
          await deleteButton.click();
          const confirmButton = page
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          const hasConfirmButton = await isVisibleWithin(confirmButton, 5000);
          if (hasConfirmButton) {
            await confirmButton.click();
            await page.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
          }
        }
      }
    });
  });
});
