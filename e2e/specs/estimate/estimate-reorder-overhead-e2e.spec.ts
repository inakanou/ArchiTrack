/**
 * @fileoverview 見積項目の並び替え（↑/↓ボタン）と諸経費自動計算・追加のE2Eテスト
 *
 * 見積書画面の機能追加（feat/quotation-screen-enhancement）で結線したフロント機能を、
 * 実際のブラウザ操作で要件レベルに検証する。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-12.2: ユーザーが見積項目の表示順序を変更した場合、順序を変更可能とする（↑/↓ボタン）
 * - REQ-12.7: 並び替えを編集セッション中にサーバーへ問い合わせずに行う
 * - REQ-12.8: 順序を変更して保存した場合、画面再読み込み後も変更後の順序で表示する
 * - REQ-42.1: 並び順の変更を1回の保存操作でまとめて確定する
 * - REQ-43.1: 並び替えをサーバーへの保存を伴わずに画面上の明細へ反映する
 * - REQ-7.1: 共通仮設費行の追加を選択した場合、プリセット値を設定する
 * - REQ-7.3: 自動計算機能が有効な場合、国土交通省基準の共通仮設費計算式に準じて単価を自動計算する
 * - REQ-8.3: 自動計算機能が有効な場合、国土交通省基準の現場管理費計算式に準じて単価を自動計算する
 * - REQ-9.3: 自動計算機能が有効な場合、国土交通省基準の一般管理費計算式に準じて単価を自動計算する
 * - REQ-49.3: 諸経費行追加は実行の時点でデータベースへの書き込みを行わない
 * - REQ-49.5: 諸経費行追加の後に保存操作を行っても競合エラーを発生させない
 *
 * @module e2e/specs/estimate/estimate-reorder-overhead-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { observeApiRequests } from '../../helpers/api-request-observer';
import {
  buildNewEstimateItemNode,
  getEstimateUpdatedAt,
  saveEstimateDraft,
} from '../../helpers/estimate-draft';

interface ApiLine {
  lineType: string;
  name: string | null;
}
interface ApiItem {
  id: string;
  displayOrder: number;
  parentId: string | null;
  lines: ApiLine[];
}

test.describe('見積項目の並び替えと諸経費の自動計算・追加', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';
  const rootItemIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /** 見積項目をルートレベルの表示順序で取得する */
  const fetchRootItemsOrdered = async (
    request: import('@playwright/test').APIRequestContext
  ): Promise<ApiItem[]> => {
    const res = await request.get(`${API_BASE_URL}/api/estimates/${createdEstimateId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const items = (await res.json()) as ApiItem[];
    return items.filter((i) => i.parentId === null).sort((a, b) => a.displayOrder - b.displayOrder);
  };

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E並替諸経費テスト_${Date.now()}`;
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
      const url = page.url();
      const match = url.match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2: テスト用見積書を作成し項目を3つ追加する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
      expect(accessToken).toBeTruthy();

      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '並替・諸経費テスト用見積書' },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      createdEstimateId = (await estimateResponse.json()).id;
      expect(createdEstimateId).toBeTruthy();

      // ルートレベルに項目を3つ追加（並び替え検証用）。
      // 撤去済みの `POST /:id/items` ではなく一括保存（`PUT /:id/save`）で作成する（REQ-42.1）
      const savedItems = await saveEstimateDraft(
        page.request,
        accessToken,
        createdEstimateId!,
        [1, 2, 3].map((n) =>
          buildNewEstimateItemNode({
            name: `並び替え項目${n}`,
            unit: '式',
            quantity: 1,
            estimateUnitPrice: 1000,
            executionUnitPrice: 1000,
            vendorUnitPrice: 1000,
          })
        )
      );
      rootItemIds.push(...savedItems.map((item) => item.id));
      expect(rootItemIds.length).toBe(3);
    });
  });

  // ============================================================================
  // REQ-12.2: 見積項目の並び替え（↑/↓ボタン）
  // ============================================================================

  test.describe('見積項目の並び替え（↑/↓ボタン）', () => {
    /**
     * @requirement estimate-creation/REQ-12.2
     */
    test('項目未選択時は↑/↓ボタンがdisabledである (estimate-creation/REQ-12.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      await expect(page.getByTestId('reorder-up-button')).toBeDisabled();
      await expect(page.getByTestId('reorder-down-button')).toBeDisabled();
    });

    /**
     * @requirement estimate-creation/REQ-12.2
     */
    test('↑ボタンで選択項目が同一階層内で1つ上に移動する (estimate-creation/REQ-12.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      // 現在の表示順を取得し、2番目の項目を対象にする
      const before = await fetchRootItemsOrdered(page.request);
      expect(before.length).toBeGreaterThanOrEqual(2);
      const targetId = before[1]!.id;
      const formerFirstId = before[0]!.id;

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 対象項目の行を選択（端をクリックして入力欄を避ける）
      const targetRow = page.getByTestId(`estimate-item-${targetId}`);
      await targetRow.click({ position: { x: 5, y: 5 } });
      await expect(targetRow).toHaveAttribute('data-selected', 'true');

      // ↑ボタンが有効になっていること（直前に兄弟が存在する）
      await expect(page.getByTestId('reorder-up-button')).toBeEnabled();

      // ↑ボタンはサーバーへ問い合わせず画面上の並びだけを変える（REQ-12.7, 43.1）
      const { writes: writeRequests, stop: stopObserving } = observeApiRequests(page);

      await page.getByTestId('reorder-up-button').click();
      expect(writeRequests).toEqual([]);

      // 保存で並び順が1回の保存操作で確定する（REQ-12.8, 42.1）
      const savePromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          r.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/i }).click();
      const saveRes = await savePromise;
      expect(saveRes.status()).toBe(200);
      stopObserving();
      expect(writeRequests).toEqual([`PUT /api/estimates/${createdEstimateId}/save`]);

      await page.waitForLoadState('networkidle');

      // API上で順序が入れ替わっていることを検証（対象が先頭、元の先頭が2番目）
      const after = await fetchRootItemsOrdered(page.request);
      expect(after[0]!.id).toBe(targetId);
      expect(after[1]!.id).toBe(formerFirstId);

      // 画面上のDOM順でも対象項目が先頭に来ていることを検証
      // 見積項目テーブル内に限定する（ツールバー等のtestidを拾わないため）
      const table = page.locator('[aria-label="見積項目テーブル"]');
      const domIds = await table
        .locator('[data-testid^="estimate-item-"]')
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-testid')?.replace('estimate-item-', ''))
        );
      expect(domIds[0]).toBe(targetId);
    });

    /**
     * @requirement estimate-creation/REQ-12.2
     */
    test('↓ボタンで選択項目が同一階層内で1つ下に移動する (estimate-creation/REQ-12.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      const before = await fetchRootItemsOrdered(page.request);
      expect(before.length).toBeGreaterThanOrEqual(2);
      const targetId = before[0]!.id;
      const formerSecondId = before[1]!.id;

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      const targetRow = page.getByTestId(`estimate-item-${targetId}`);
      await targetRow.click({ position: { x: 5, y: 5 } });
      await expect(targetRow).toHaveAttribute('data-selected', 'true');

      await expect(page.getByTestId('reorder-down-button')).toBeEnabled();

      await page.getByTestId('reorder-down-button').click();

      // 保存で並び順が確定する（REQ-12.8, 42.1）
      const savePromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          r.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/i }).click();
      const saveRes = await savePromise;
      expect(saveRes.status()).toBe(200);

      await page.waitForLoadState('networkidle');

      const after = await fetchRootItemsOrdered(page.request);
      expect(after[0]!.id).toBe(formerSecondId);
      expect(after[1]!.id).toBe(targetId);
    });
  });

  // ============================================================================
  // REQ-7/8/9: 諸経費の自動計算と項目追加
  // ============================================================================

  test.describe('諸経費の自動計算と項目追加', () => {
    /**
     * 諸経費行の追加は編集状態への反映のみで完結し、保存で確定する（REQ-49.3, 49.5）
     *
     * かつては「項目追加」が `POST /:id/overhead-items` を発行して 201 を返し、
     * その場でデータベースに書き込んでいた。この経路は Task 55.7 で撤去され、
     * 追加は `estimateEditReducer` の遷移になった。ここでは
     * 「追加の時点で書き込みが1件も出ない」「見積書の更新時刻が進まない」
     * 「続く保存が競合しない」までを通しで固定する。
     *
     * @requirement estimate-creation/REQ-7.1
     * @requirement estimate-creation/REQ-7.3
     * @requirement estimate-creation/REQ-49.3
     * @requirement estimate-creation/REQ-49.5
     */
    test('共通仮設費を自動計算して追加し、保存で確定できる（建築新営） (estimate-creation/REQ-7.1, estimate-creation/REQ-7.3, estimate-creation/REQ-49.3, estimate-creation/REQ-49.5)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');

      const before = await fetchRootItemsOrdered(page.request);
      const beforeCount = before.length;
      // 画面を開く前の基準時刻。追加操作でこれが進めば 49.5 が破れる
      const updatedAtBefore = await getEstimateUpdatedAt(
        page.request,
        accessToken,
        createdEstimateId!
      );

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 追加の時点で書き込みが発生しないことを、実際に送出されたリクエストで数える
      const { writes, stop: stopObserving } = observeApiRequests(page);
      // 諸経費の率・金額の算定（書き込みなし）は対象外
      const writeRequestsOf = (): string[] =>
        writes.filter((write) => !write.includes('/calculate-overhead'));

      // ダイアログを開く
      await page.getByRole('button', { name: '諸経費を計算して追加' }).click();
      const dialog = page.getByTestId('overhead-cost-dialog');
      await expect(dialog).toBeVisible();

      // 諸経費種別=共通仮設費（デフォルト）、直接工事費・工期を入力（新営: 改修工事チェックなし）
      await dialog.getByLabel('諸経費種別').selectOption('COMMON_TEMPORARY');
      await dialog.getByLabel('直接工事費').fill('100000');
      await dialog.getByLabel('工期').fill('12');

      // 計算実行（書き込みを伴わない `POST /:id/calculate-overhead` は維持対象）
      const calcPromise = page.waitForResponse(
        (r) => r.url().includes('/calculate-overhead') && r.request().method() === 'POST',
        { timeout: getTimeout(15000) }
      );
      await dialog.getByRole('button', { name: '計算' }).click();
      const calcRes = await calcPromise;
      expect(calcRes.status()).toBe(200);

      // 計算結果（率・金額）が表示される
      await expect(dialog.getByTestId('calculated-rate')).toBeVisible();
      const amountText = (await dialog.getByTestId('calculated-amount').textContent()) ?? '';
      expect(amountText).toMatch(/[0-9]/);

      // 項目追加（サーバーへは書き込まない）
      await dialog.getByRole('button', { name: '項目追加' }).click();

      // ダイアログが閉じる
      await expect(dialog).toBeHidden();

      // 追加された行が画面に現れる。保存前の行はサーバーIDを持たないので行キー
      // （一時識別子 `tmp-*`）で引く。名称は入力欄の**値**なので `hasText` では拾えない
      const table = page.locator('[aria-label="見積項目テーブル"]');
      const addedRow = table.locator('[data-estimate-row-key^="tmp-"]');
      await expect(addedRow).toHaveCount(1, { timeout: getTimeout(10000) });
      // プリセット値のまま追加されている（7.1）
      const addedEstimateLine = addedRow.getByTestId('line-type-ESTIMATE');
      await expect(addedEstimateLine.getByLabel('名称')).toHaveValue('共通仮設費');
      await expect(addedEstimateLine.getByLabel('単位')).toHaveValue('式');
      await expect(addedEstimateLine.getByLabel('数量')).toHaveValue('1');

      // 49.3 の要求そのもの（書き込みが発生していないこと）を先に確かめる。
      // 明細の件数を先に見ると、経路が復活したときの失敗が「件数が増えている」という
      // 二次的な形で出て、書き込みが起きたことが失敗として報告されない
      expect(writeRequestsOf()).toEqual([]);
      expect(await getEstimateUpdatedAt(page.request, accessToken, createdEstimateId!)).toBe(
        updatedAtBefore
      );
      // データベース側はまだ増えていない（未保存の変更）
      expect((await fetchRootItemsOrdered(page.request)).length).toBe(beforeCount);

      // 保存で確定する。基準時刻が進んでいないので競合しない（49.5）
      const savePromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
          r.request().method() === 'PUT',
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^保存$/i }).click();
      const saveRes = await savePromise;
      expect(saveRes.status()).toBe(200);

      stopObserving();
      await page.waitForLoadState('networkidle');

      // API上で「共通仮設費」項目がプリセット値のまま確定していることを検証（7.1）
      const after = await fetchRootItemsOrdered(page.request);
      expect(after.length).toBe(beforeCount + 1);
      const overheadItem = after.find((i) =>
        i.lines.some((l) => l.lineType === 'ESTIMATE' && l.name === '共通仮設費')
      );
      expect(overheadItem).toBeTruthy();

      // 画面の見積項目テーブルに、確定後の共通仮設費の行が表示されていることを検証
      await expect(table.getByTestId(`estimate-item-${overheadItem!.id}`)).toBeVisible();
    });

    /**
     * @requirement estimate-creation/REQ-8.3
     * @requirement estimate-creation/REQ-9.3
     */
    test('建築改修パターンは新営と異なる算定率になる（現場管理費・一般管理費） (estimate-creation/REQ-8.3, estimate-creation/REQ-9.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto(`/estimates/${createdEstimateId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
        timeout: getTimeout(15000),
      });

      await page.getByRole('button', { name: '諸経費を計算して追加' }).click();
      const dialog = page.getByTestId('overhead-cost-dialog');
      await expect(dialog).toBeVisible();

      // 現場管理費を選択（直接工事費は全費目共通の必須入力、純工事費を追加入力）
      await dialog.getByLabel('諸経費種別').selectOption('SITE_MANAGEMENT');
      await dialog.getByLabel('直接工事費').fill('100000');
      await dialog.getByLabel('純工事費').fill('120000');

      // 改修工事チェックボックスが全費目で表示される（新営/改修パターン対応）
      const renovationCheckbox = dialog.getByLabel('改修工事');
      await expect(renovationCheckbox).toBeVisible();

      // 新営で計算して率を取得
      const newCalcPromise = page.waitForResponse(
        (r) => r.url().includes('/calculate-overhead') && r.request().method() === 'POST',
        { timeout: getTimeout(15000) }
      );
      await dialog.getByRole('button', { name: '計算' }).click();
      expect((await newCalcPromise).status()).toBe(200);
      const newRate = (await dialog.getByTestId('calculated-rate').textContent()) ?? '';
      expect(newRate).toMatch(/[0-9]/);

      // 改修にチェックして再計算し率を取得
      await renovationCheckbox.check();
      const renoCalcPromise = page.waitForResponse(
        (r) => r.url().includes('/calculate-overhead') && r.request().method() === 'POST',
        { timeout: getTimeout(15000) }
      );
      await dialog.getByRole('button', { name: '計算' }).click();
      expect((await renoCalcPromise).status()).toBe(200);
      const renoRate = (await dialog.getByTestId('calculated-rate').textContent()) ?? '';

      // 国土交通省基準では新営と改修で係数が異なるため、算定率も異なる
      expect(renoRate).not.toBe(newRate);
    });
  });
});
