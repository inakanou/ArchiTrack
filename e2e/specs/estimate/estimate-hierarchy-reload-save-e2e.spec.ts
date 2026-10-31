/**
 * @fileoverview 既存見積書の階層が「再読み込み→保存」で失われないことのE2Eテスト
 *
 * Task 53.15: 退行の再現と修正の固定。
 *
 * 退行の機序:
 * `GET /api/estimates/:id` は明細を**平坦な配列**で返し `children` キーを持たない。
 * 画面がこれを編集状態へ流し込むと全項目がルート扱いになり、一括保存
 * （`PUT /api/estimates/:id/save`、フル状態同期）で DB 上の `parentId` が
 * NULL 化され、既存見積書の階層が**無言で**失われる（保存は 200 で成功する）。
 *
 * 既存の階層E2E（`estimate-hierarchy-move-e2e.spec.ts`）は検証を API
 * `GET /:id/items` で行い、かつ「画面を再読み込みしてから再度保存する」経路を
 * 通らないため、原理的にこの退行を検出できない。本 spec は
 * **画面の再読み込み → 画面上での編集 → 保存 → 再度の再読み込み → UI での確認**
 * というサイクルを通し、UI 上で階層が維持されることを検証する。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-2.2: 親項目を持つ見積項目を親項目の子として階層表示する
 * - REQ-2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - REQ-23.9: 「上の階層へ移動」ボタンを提供し、選択中の項目を親の兄弟レベルに移動する
 * - REQ-34.5: 階層を変更して保存した場合、画面再読み込み後も変更後の構造で表示する
 * - REQ-42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - REQ-45.2: 階層表示モードのデフォルトを「ツリー表示」とする
 * - REQ-45.3: ツリー表示では全階層をインデント付きで一覧表示する
 * - REQ-42.10: 本文の見積項目の総数が上限を超えると検証の前に件数の上限の 422 で拒み、書き込まない
 * - REQ-42.12: 本文の見積項目の階層の深さが上限を超えると検証の前に深さの上限の 422 で拒み、書き込まない
 *
 * @module e2e/specs/estimate/estimate-hierarchy-reload-save-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import {
  buildNewEstimateItemNode,
  findEstimateItemByName,
  getEstimateItemTree,
  getEstimateUpdatedAt,
  saveEstimateDraft,
  type EstimateItemNode,
} from '../../helpers/estimate-draft';
import { getAccessToken } from '../../helpers/auth-api';

test.describe('既存見積書の階層が再読み込みと保存で維持される', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdEstimateId: string | null = null;
  let accessToken: string = '';

  const PARENT_NAME = '階層維持テスト親';
  const CHILD_NAME = '階層維持テスト子';
  const SIBLING_NAME = '階層維持テスト兄弟';

  /**
   * 階層を持つ明細へ初期化する（親＞子、および兄弟のルート項目）
   *
   * 画面操作ではなく一括保存APIで作る。「既に階層を持つ見積書を開く」という
   * 前提条件を作るためであり、検証対象は開いた後の挙動である。
   */
  const resetHierarchy = async (page: Page): Promise<void> => {
    await saveEstimateDraft(page.request, accessToken, createdEstimateId!, [
      buildNewEstimateItemNode({
        name: PARENT_NAME,
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 100000,
        executionUnitPrice: 90000,
        vendorUnitPrice: 85000,
        children: [
          buildNewEstimateItemNode({
            name: CHILD_NAME,
            unit: '式',
            quantity: 1,
            estimateUnitPrice: 50000,
            executionUnitPrice: 45000,
            vendorUnitPrice: 40000,
          }),
        ],
      }),
      buildNewEstimateItemNode({
        name: SIBLING_NAME,
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 30000,
        executionUnitPrice: 28000,
        vendorUnitPrice: 26000,
      }),
    ]);
  };

  /** 見積書画面を開いて明細が描画されるまで待つ */
  const openEstimatePage = async (page: Page): Promise<void> => {
    await page.goto(`/estimates/${createdEstimateId}`);
    await waitForItemTable(page);
  };

  /**
   * 明細テーブルが描画されるまで待つ
   *
   * 54.x で階層表示モード（ツリー表示／ドリルダウン表示）が入り、インデントは
   * ツリー表示でしか現れない（ドリルダウン表示の行は一律 `paddingLeft: 0px`）。
   * 本 spec は REQ-45.3「ツリー表示では全階層をインデント付きで一覧表示する」を
   * 主張するので、その前提であるモードを明示的に固定する（45.2）。
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

  const fetchTree = async (page: Page): Promise<EstimateItemNode[]> =>
    await getEstimateItemTree(page.request, accessToken, createdEstimateId!);

  /** 明細行を選択する（入力欄を避けて行の端をクリックする） */
  const selectRow = async (page: Page, itemId: string): Promise<void> => {
    const row = page.getByTestId(`estimate-item-${itemId}`);
    await expect(row).toBeVisible({ timeout: getTimeout(10000) });
    await row.click({ position: { x: 5, y: 5 } });
    await expect(row).toHaveAttribute('data-selected', 'true');
  };

  /**
   * 行のインデント量（px）を読む
   *
   * ツリー表示の描画を担う `EstimateItemTreeView` は行ラッパーに
   * `paddingLeft: depth * 16px` を与えており（54.2 で `EstimateItemTable` から
   * 行描画が分離された）、階層レベルがそのままインデントとして現れる
   * （REQ-2.6, REQ-45.3）。ルートは 0px、1段目の子は 16px になる。
   */
  const indentOf = async (page: Page, itemId: string): Promise<string> =>
    await page
      .getByTestId(`estimate-item-${itemId}`)
      .evaluate((element) => window.getComputedStyle(element).paddingLeft);

  /** 保存ボタンを押し、`PUT /:id/save` が1回だけ成功することを確認する（REQ-42.1） */
  const saveAndExpectSingleRequest = async (page: Page): Promise<void> => {
    const saveRequests: string[] = [];
    const countSave = (request: { url: () => string; method: () => string }): void => {
      if (request.url().includes(`/api/estimates/${createdEstimateId}/save`)) {
        saveRequests.push(request.method());
      }
    };
    page.on('request', countSave);

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
    await page.waitForLoadState('networkidle');
    page.off('request', countSave);

    expect(saveRequests).toEqual(['PUT']);
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

      const projectName = `E2E階層維持テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト1-1-1');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

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

    test('準備2: 階層を持つ見積書を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await getAccessToken(page, 'REGULAR_USER');
      expect(accessToken).toBeTruthy();

      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '階層維持テスト用見積書' },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      const estimateData = await estimateResponse.json();
      createdEstimateId = estimateData.id;
      expect(createdEstimateId).toBeTruthy();

      await resetHierarchy(page);

      // 前提条件（DB上で階層が成立していること）を確認する
      const tree = await fetchTree(page);
      expect(tree).toHaveLength(2);
      const parent = findEstimateItemByName(tree, PARENT_NAME);
      expect(parent).toBeDefined();
      expect(parent!.children).toHaveLength(1);
      expect(parent!.children[0]!.parentId).toBe(parent!.id);
    });
  });

  // ==========================================================================
  // 再読み込み → 編集 → 保存 → 再読み込み
  // ==========================================================================

  test.describe('再読み込みしてから保存する経路', () => {
    /**
     * @requirement estimate-creation/REQ-2.2
     * @requirement estimate-creation/REQ-2.6
     * @requirement estimate-creation/REQ-34.5
     * @requirement estimate-creation/REQ-42.1
     * @requirement estimate-creation/REQ-45.3
     */
    test('画面を再読み込みして編集し保存しても階層がUI上で維持される (estimate-creation/REQ-2.2, estimate-creation/REQ-2.6, estimate-creation/REQ-34.5, estimate-creation/REQ-42.1, estimate-creation/REQ-45.3)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await getAccessToken(page, 'REGULAR_USER');
      await resetHierarchy(page);

      const before = await fetchTree(page);
      const parentId = findEstimateItemByName(before, PARENT_NAME)!.id;
      const childId = findEstimateItemByName(before, CHILD_NAME)!.id;
      const siblingId = findEstimateItemByName(before, SIBLING_NAME)!.id;

      await openEstimatePage(page);

      // 明示的に画面を再読み込みしてから編集する（本タスクの検証対象の経路）
      await page.reload();
      await waitForItemTable(page);

      // 読み込み直後のUI: 子項目はインデントされ、親には折りたたみ操作がある
      expect(await indentOf(page, parentId)).toBe('0px');
      expect(await indentOf(page, childId)).toBe('16px');
      expect(await indentOf(page, siblingId)).toBe('0px');
      await expect(
        page.getByTestId(`estimate-item-${parentId}`).getByRole('button', { name: '折りたたむ' })
      ).toBeVisible();

      // 画面上でセルを編集する（保存対象の変更を作る）
      const childRow = page.getByTestId(`estimate-item-${childId}`);
      const childRemarks = childRow.locator('input[aria-label="備考"]').first();
      await childRemarks.fill('階層維持の確認');

      await saveAndExpectSingleRequest(page);

      // 保存後にもう一度画面を再読み込みし、UI上で階層が維持されていることを確認する
      await page.reload();
      await waitForItemTable(page);

      expect(await indentOf(page, parentId)).toBe('0px');
      expect(await indentOf(page, childId)).toBe('16px');
      expect(await indentOf(page, siblingId)).toBe('0px');
      await expect(
        page.getByTestId(`estimate-item-${parentId}`).getByRole('button', { name: '折りたたむ' })
      ).toBeVisible();
      await expect(
        page.getByTestId(`estimate-item-${childId}`).locator('input[aria-label="備考"]').first()
      ).toHaveValue('階層維持の確認');

      // DB上でも親子関係が保たれている
      const after = await fetchTree(page);
      expect(after).toHaveLength(2);
      const parentAfter = after.find((item) => item.id === parentId);
      expect(parentAfter).toBeDefined();
      expect(parentAfter!.children.map((child) => child.id)).toEqual([childId]);
      expect(after.map((item) => item.id)).not.toContain(childId);
    });

    /**
     * 子項目を選択すると「上の階層へ」が有効になる
     *
     * 活性判定は `selectedItem.parentId !== null` のため、読み込みで親子関係が
     * 失われていると子項目を選んでも無効のままになる（退行の可視症状）。
     *
     * @requirement estimate-creation/REQ-23.9
     * @requirement estimate-creation/REQ-2.2
     */
    test('再読み込み後に子項目を選択すると「上の階層へ」が有効になる (estimate-creation/REQ-23.9, estimate-creation/REQ-2.2)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await getAccessToken(page, 'REGULAR_USER');
      await resetHierarchy(page);

      const before = await fetchTree(page);
      const childId = findEstimateItemByName(before, CHILD_NAME)!.id;
      const siblingId = findEstimateItemByName(before, SIBLING_NAME)!.id;

      await openEstimatePage(page);
      await page.reload();
      await waitForItemTable(page);

      // 子項目は親を持つので「上の階層へ」が有効
      await selectRow(page, childId);
      await expect(page.getByRole('button', { name: /上の階層へ/ })).toBeEnabled();

      // ルート項目は親を持たないので無効のまま（判定が常に有効化していないことの対比）
      await selectRow(page, siblingId);
      await expect(page.getByRole('button', { name: /上の階層へ/ })).toBeDisabled();
    });
  });

  // ==========================================================================
  // 一括保存の本文の総数と階層の深さの上限（タスク67.1）
  //
  // 画面の操作で 2001 件や 101 段の見積項目を作ることは現実的でないため、一括保存の API へ
  // 直接送って確かめる（design.md の「2026-10-31 の追加: 一括保存の本文の件数の前倒しの数え上げと
  // 備考の文字数の上限」の章の Testing Strategy）。深い鎖の本文は JSON.stringify が深さの限界に
  // 達するため、JSON の文字列を反復で組み立てて送る。
  // ==========================================================================

  test.describe('一括保存の本文の総数と階層の深さの上限', () => {
    const LINE_JSON = JSON.stringify({
      lineType: 'ESTIMATE',
      name: '上限検証',
      specification: null,
      unit: null,
      quantity: null,
      unitPrice: null,
      amount: null,
      remarks: null,
      sourceVendorName: null,
    });
    const nodeJson = (tempId: string, childrenJson = ''): string =>
      `{"id":null,"tempId":"${tempId}","itemType":"STANDARD","lines":[${LINE_JSON}],"children":[${childrenJson}]}`;
    /** 各節点が一つの子を持つ深さ `depth` の鎖（再帰も JSON.stringify も使わない） */
    const chainJson = (depth: number): string => {
      const parts: string[] = [];
      for (let level = 1; level <= depth; level += 1) {
        parts.push(
          `{"id":null,"tempId":"deep-${level}","itemType":"STANDARD","lines":[${LINE_JSON}],"children":[`
        );
      }
      for (let level = 1; level <= depth; level += 1) {
        parts.push(']}');
      }
      return parts.join('');
    };

    /** 本文を送り、応答と、見積書の版と明細ツリーが送る前のままであることを返す */
    const saveRawAndExpectUnchanged = async (
      page: Page,
      itemsJson: string,
      reportFieldsJson = '{"submissionDate":null,"validityPeriod":null,"separateWorks":[]}'
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
      const beforeTree = await fetchTree(page);
      const expectedUpdatedAt = await getEstimateUpdatedAt(
        page.request,
        accessToken,
        createdEstimateId!
      );
      const res = await page.request.put(
        `${API_BASE_URL}/api/estimates/${createdEstimateId}/save`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          data: `{"expectedUpdatedAt":${JSON.stringify(expectedUpdatedAt)},"reportFields":${reportFieldsJson},"items":[${itemsJson}]}`,
        }
      );
      const result = { status: res.status(), body: (await res.json()) as Record<string, unknown> };

      expect(await fetchTree(page)).toEqual(beforeTree);
      expect(await getEstimateUpdatedAt(page.request, accessToken, createdEstimateId!)).toBe(
        expectedUpdatedAt
      );
      return result;
    };

    /**
     * @requirement estimate-creation/REQ-42.10
     */
    test('一括保存の API へ総数が上限を 1 件超えた本文を送ると件数の上限の 422 になり、見積書は変わらない (estimate-creation/REQ-42.10)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await getAccessToken(page, 'REGULAR_USER');
      await resetHierarchy(page);

      const itemsJson = Array.from({ length: 2001 }, (_, index) => nodeJson(`over-${index}`)).join(
        ','
      );
      // 形式の正しい本文と、形式の不正（別途工事が上限の 5 件を超える）を併せて含む本文。
      // 後者は各見積項目の内容の検証より前に数えて拒むため、形式の不正の 400 ではなく 422 になる
      for (const [label, reportFieldsJson] of [
        ['形式の正しい本文', undefined],
        [
          '形式の不正を併せて含む本文',
          '{"submissionDate":null,"validityPeriod":null,"separateWorks":["1","2","3","4","5","6"]}',
        ],
      ] as const) {
        const { status, body } = await saveRawAndExpectUnchanged(page, itemsJson, reportFieldsJson);

        expect(status, label).toBe(422);
        expect(body.code, label).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
        expect(body.details, label).toEqual({
          issues: [{ path: 'items', message: '見積明細は合計2000件以内で保存してください' }],
        });
      }
    });

    /**
     * @requirement estimate-creation/REQ-42.12
     */
    test('一括保存の API へ階層の深さが上限を超えた本文（101 段・2000 段）を送ると深さの上限の 422 になり、見積書は変わらない (estimate-creation/REQ-42.12)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      accessToken = await getAccessToken(page, 'REGULAR_USER');
      await resetHierarchy(page);

      for (const depth of [101, 2000]) {
        const { status, body } = await saveRawAndExpectUnchanged(page, chainJson(depth));

        expect(status, `${depth} 段`).toBe(422);
        expect(body.code, `${depth} 段`).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
        expect(body.details, `${depth} 段`).toEqual({
          issues: [{ path: 'items', message: '見積項目の階層は100段以内で保存してください' }],
        });
      }
    });
  });
});
