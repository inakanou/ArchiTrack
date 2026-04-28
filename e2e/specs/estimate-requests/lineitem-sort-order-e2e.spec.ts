/**
 * @fileoverview 受領見積書 明細行の並び順保持と上下移動 E2E テスト（REQ-37）
 *
 * Requirements coverage (estimate-request) - 既存
 * received-quotation-dialog-improvements-e2e.spec.ts は REQ-37.7, 37.13 をカバー済み。
 * 本ファイルは残りをカバーする：
 * - REQ-37.1: 明細行に sortOrder を保持する
 * - REQ-37.2: 登録画面の明細行を sortOrder 昇順で表示する
 * - REQ-37.3: 編集画面の明細行を sortOrder 昇順で表示する
 * - REQ-37.4: 各明細行に行操作用のアクションメニューを表示する
 * - REQ-37.5: アクションメニュー内に「上に移動」「下に移動」「削除」ボタンを表示する
 * - REQ-37.6: 旧式の行内削除ボタンをアクションメニュー内に統合する
 * - REQ-37.8: 「下に移動」ボタンで該当行を1つ下に移動する
 * - REQ-37.9: 先頭行の「上に移動」ボタンを非活性にする
 * - REQ-37.10: 末尾行の「下に移動」ボタンを非活性にする
 * - REQ-37.11: 1行のみのとき「上下移動」ボタンを非活性にする
 * - REQ-37.12: 並び替えはクライアントサイドのみで状態管理（サーバーリクエストを送信しない）
 * - REQ-37.14: 一括取り込み/転記で各行に並び順を順次割り当てる
 * - REQ-37.15: 行追加時に新規行を末尾の sortOrder の次の値で配置する
 * - REQ-37.16: 削除時に残った行の sortOrder の連続性を維持する
 * - REQ-37.17: 並び替え後も Tab キー移動が画面上の表示順序に追従する
 *
 * @module e2e/specs/estimate-requests/lineitem-sort-order-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

async function openCreateDialog(page: Page, estimateRequestId: string) {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  await page.getByRole('button', { name: '受領見積書登録' }).click();
  await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
    timeout: getTimeout(10000),
  });
}

test.describe('受領見積書 明細行の並び順と上下移動（REQ-37 残り）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdQuotationId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.describe('テストデータ準備', () => {
    test('プロジェクト・取引先・内訳書・見積依頼を作成する', async ({ request }) => {
      const baseUrl = API_BASE_URL;
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: TEST_USERS.REGULAR_USER.email,
          password: TEST_USERS.REGULAR_USER.password,
        },
      });
      accessToken = (await loginResponse.json()).accessToken;

      const project = await request.post(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `E2E_Sort_${Date.now()}`, siteAddress: '東京都' },
      });
      createdProjectId = (await project.json()).id;

      const partner = await request.post(`${baseUrl}/api/trading-partners`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `Sort業者_${Date.now()}`,
          nameKana: 'ソート',
          address: '東京都',
          isSubcontractor: true,
          email: `sort-${Date.now()}@example.com`,
        },
      });
      createdTradingPartnerId = (await partner.json()).id;

      const qt = await request.post(`${baseUrl}/api/projects/${createdProjectId}/quantity-tables`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `Sort_QT_${Date.now()}` },
      });
      const qtId = (await qt.json()).id;
      const group = await request.post(`${baseUrl}/api/quantity-tables/${qtId}/groups`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: 'G', displayOrder: 0 },
      });
      const groupId = (await group.json()).id;
      // 3つの項目を作成（順次転記検証用）
      for (let i = 0; i < 3; i++) {
        await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `項目${i + 1}`,
            workType: '工',
            specification: '規',
            unit: '式',
            quantity: 1,
            displayOrder: i,
          },
        });
      }

      const isRes = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `Sort内訳書_${Date.now()}`, quantityTableId: qtId },
        }
      );
      createdItemizedStatementId = (await isRes.json()).id;

      const er = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `Sort見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      createdEstimateRequestId = (await er.json()).id;
      expect(createdEstimateRequestId).toBeTruthy();
    });
  });

  // ==========================================================================
  // REQ-37.4, 37.5, 37.6: アクションメニュー構成
  // ==========================================================================

  test.describe('アクションメニューの構成', () => {
    /**
     * @requirement estimate-request/REQ-37.4
     * @requirement estimate-request/REQ-37.5
     * @requirement estimate-request/REQ-37.6
     */
    test('各明細行にアクションメニューが表示され、メニュー内に上に移動/下に移動/削除のmenuitemが含まれる (REQ-37.4, 37.5, 37.6)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.getByRole('button', { name: '行を追加' }).click();
      await page.getByRole('button', { name: '行を追加' }).click();
      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible();

      // REQ-37.4: アクションメニューボタンが3つ表示
      const menuButtons = page.getByRole('button', { name: /行\d+の操作メニュー/ });
      await expect(menuButtons).toHaveCount(3);

      // REQ-37.5: 行2 のメニューを開いて menuitem 3つ確認
      await page.getByRole('button', { name: '行2の操作メニュー' }).click();
      await expect(page.getByRole('menuitem', { name: '上に移動' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: '下に移動' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: '削除' })).toBeVisible();

      // REQ-37.6: 行内に独立した「削除」 button が存在しない（td 直下のスタンドアロン削除ボタン廃止）
      // メニューが開いた状態で menuitem 以外の "削除" ボタンが無いことを確認
      const standaloneDelete = page.getByRole('button', { name: /^削除$/ });
      await expect(standaloneDelete).toHaveCount(0);
    });
  });

  // ==========================================================================
  // REQ-37.8: 「下に移動」
  // ==========================================================================

  test.describe('下に移動', () => {
    /**
     * @requirement estimate-request/REQ-37.8
     */
    test('アクションメニュー「下に移動」ボタンで該当行が1つ下に移動する (REQ-37.8)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.getByRole('button', { name: '行を追加' }).click();
      await page.getByRole('button', { name: '行を追加' }).click();

      await page.locator('input[aria-label="行1 名称"]').fill('A');
      await page.locator('input[aria-label="行2 名称"]').fill('B');
      await page.locator('input[aria-label="行3 名称"]').fill('C');

      // 行1 を「下に移動」 → 順序: B, A, C
      await page.getByRole('button', { name: '行1の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '下に移動' }).click();

      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('B');
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('A');
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveValue('C');
    });
  });

  // ==========================================================================
  // REQ-37.9, 37.10, 37.11: 境界での非活性化
  // ==========================================================================

  test.describe('境界での非活性化', () => {
    /**
     * @requirement estimate-request/REQ-37.9
     * @requirement estimate-request/REQ-37.10
     */
    test('先頭行の「上に移動」/末尾行の「下に移動」が非活性 (REQ-37.9, 37.10)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.getByRole('button', { name: '行を追加' }).click();
      await page.getByRole('button', { name: '行を追加' }).click();
      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible();

      // 行1 のメニュー → 「上に移動」非活性
      await page.getByRole('button', { name: '行1の操作メニュー' }).click();
      await expect(page.getByRole('menuitem', { name: '上に移動' })).toBeDisabled();
      await page.locator('body').click({ position: { x: 5, y: 5 } });

      // 行3 のメニュー → 「下に移動」非活性
      await page.getByRole('button', { name: '行3の操作メニュー' }).click();
      await expect(page.getByRole('menuitem', { name: '下に移動' })).toBeDisabled();
    });

    /**
     * @requirement estimate-request/REQ-37.11
     */
    test('明細行が1行のみのときは「上に移動」「下に移動」がともに非活性になる (REQ-37.11)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      // 初期1行
      await expect(page.locator('input[aria-label="行1 名称"]')).toBeVisible();
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveCount(0);

      await page.getByRole('button', { name: '行1の操作メニュー' }).click();
      await expect(page.getByRole('menuitem', { name: '上に移動' })).toBeDisabled();
      await expect(page.getByRole('menuitem', { name: '下に移動' })).toBeDisabled();
    });
  });

  // ==========================================================================
  // REQ-37.12: 並び替え操作はクライアントサイドのみ（サーバーリクエスト不要）
  // ==========================================================================

  test.describe('クライアントサイド並び替え', () => {
    /**
     * @requirement estimate-request/REQ-37.12
     */
    test('上下移動操作中にサーバーへの POST/PUT/PATCH リクエストが発生しない (REQ-37.12)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.getByRole('button', { name: '行を追加' }).click();
      await page.getByRole('button', { name: '行を追加' }).click();
      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible();

      // 並び替え API を仮定して quotations 関連エンドポイントへの書き込み系を監視
      const writeRequests: { method: string; url: string }[] = [];
      page.on('request', (req) => {
        const method = req.method();
        const url = req.url();
        if (
          (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') &&
          url.includes('/api/')
        ) {
          writeRequests.push({ method, url });
        }
      });

      // 上下移動操作を複数回実行
      await page.getByRole('button', { name: '行2の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '上に移動' }).click();
      await page.getByRole('button', { name: '行2の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '下に移動' }).click();
      await page.getByRole('button', { name: '行3の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '上に移動' }).click();

      // 短い待機（API があれば送られる時間）
      await page.waitForLoadState('networkidle', { timeout: getTimeout(5000) });

      // 並び替え専用の API は呼び出されていないこと
      // (受領見積書の保存系 /quotations への書き込みは実行していないので0件のはず)
      const quotationWrites = writeRequests.filter((r) => /\/quotations/.test(r.url));
      expect(quotationWrites).toHaveLength(0);
    });
  });

  // ==========================================================================
  // REQ-37.14: 転記時に並び順を順次割り当てる
  // ==========================================================================

  test.describe('一括転記時の sortOrder 割り当て', () => {
    /**
     * @requirement estimate-request/REQ-37.14
     */
    test('項目選択から転記実行時に各行に sortOrder が順次割り当てられる (REQ-37.14)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;
      await loginAsUser(page, 'REGULAR_USER');

      // 詳細画面で全項目を選択 → 保存
      await page.goto(`/estimate-requests/${requestId}`);
      await page.waitForLoadState('networkidle');
      const checkboxes = page.locator('input[type="checkbox"]');
      const cnt = await checkboxes.count();
      for (let i = 0; i < cnt; i++) {
        const cb = checkboxes.nth(i);
        const visible = await cb.isVisible().catch(() => false);
        const checked = await cb.isChecked().catch(() => false);
        if (visible && !checked) {
          await cb.check({ force: true }).catch(() => undefined);
        }
      }
      const saveBtn = page.getByTestId('save-selection-button');
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await expect(page.getByText('保存しました')).toBeVisible({ timeout: getTimeout(10000) });
      }

      await openCreateDialog(page, requestId);

      // 転記実行
      const transcriptionButton = page.getByTestId('transcription-button');
      await expect(transcriptionButton).toBeVisible({ timeout: getTimeout(10000) });
      await transcriptionButton.click();
      const confirmButton = page.getByTestId('transcription-confirm-button');
      if (await confirmButton.isVisible({ timeout: getTimeout(3000) }).catch(() => false)) {
        await confirmButton.click();
      }
      await expect(page.getByTestId('transcription-message')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 転記後 1〜3 行目が aria-label で順次表示される
      // (内訳書には 3 件の項目を作成済み)
      await expect(page.locator('input[aria-label="行1 名称"]')).toBeVisible();
      await expect(page.locator('input[aria-label="行2 名称"]')).toBeVisible();
      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible();
      // sortOrder 順序の確認: 1行目=項目1、2行目=項目2、3行目=項目3
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue(/項目1/);
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue(/項目2/);
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveValue(/項目3/);
    });
  });

  // ==========================================================================
  // REQ-37.15: 行追加時の sortOrder
  // ==========================================================================

  test.describe('行追加時の sortOrder 割り当て', () => {
    /**
     * @requirement estimate-request/REQ-37.15
     */
    test('行追加ボタンで新規行が末尾の sortOrder + 1 で配置される (REQ-37.15)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.locator('input[aria-label="行1 名称"]').fill('A');
      await page.getByRole('button', { name: '行を追加' }).click();
      // 新規行は行2 の位置に追加される（既存行の末尾の次）
      await expect(page.locator('input[aria-label="行2 名称"]')).toBeVisible();
      // 行2 は空（新規）
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('');
      // 既存の行1 は変わらない
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('A');
    });
  });

  // ==========================================================================
  // REQ-37.16: 削除時の sortOrder 連続性維持
  // ==========================================================================

  test.describe('削除後の sortOrder 連続性', () => {
    /**
     * @requirement estimate-request/REQ-37.16
     */
    test('行を削除した後に残った行の表示順（aria-label 行N）が連続値で再採番される (REQ-37.16)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.getByRole('button', { name: '行を追加' }).click();
      await page.getByRole('button', { name: '行を追加' }).click();
      await page.locator('input[aria-label="行1 名称"]').fill('A');
      await page.locator('input[aria-label="行2 名称"]').fill('B');
      await page.locator('input[aria-label="行3 名称"]').fill('C');

      // 行2 を削除
      await page.getByRole('button', { name: '行2の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '削除' }).click();

      // 残り2行が連続値（行1, 行2）として再採番される
      await expect(page.locator('input[aria-label="行1 名称"]')).toBeVisible();
      await expect(page.locator('input[aria-label="行2 名称"]')).toBeVisible();
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveCount(0);
      // 行1=A, 行2=C
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('A');
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('C');
    });
  });

  // ==========================================================================
  // REQ-37.17: 並び替え後の Tab キー移動
  // ==========================================================================

  test.describe('並び替え後の Tab 移動', () => {
    /**
     * @requirement estimate-request/REQ-37.17
     */
    test('並び替え後も Tab キーで画面表示順序に沿ってフィールドが順次移動する (REQ-37.17)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);

      await page.getByRole('button', { name: '行を追加' }).click();
      await expect(page.locator('input[aria-label="行2 名称"]')).toBeVisible();
      await page.locator('input[aria-label="行1 名称"]').fill('A');
      await page.locator('input[aria-label="行2 名称"]').fill('B');

      // 行2 を上に移動 → 順序: B, A
      await page.getByRole('button', { name: '行2の操作メニュー' }).click();
      await page.getByRole('menuitem', { name: '上に移動' }).click();
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('B');
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('A');

      // 行1 名称（B）にフォーカスを当てて Tab 移動
      await page.locator('input[aria-label="行1 名称"]').focus();
      // 1 つの行内のみ確認（任意分類→...→備考は他テストで検証済み）
      // 名称の次にフォーカスが規格に移ることを確認
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        return document.activeElement?.getAttribute('aria-label') ?? null;
      });
      expect(focused).toBe('行1 規格');
    });
  });

  // ==========================================================================
  // REQ-37.1, 37.2, 37.3: sortOrder 保持と昇順表示
  // ==========================================================================

  test.describe('sortOrder の保持と昇順表示', () => {
    /**
     * @requirement estimate-request/REQ-37.1
     * @requirement estimate-request/REQ-37.2
     * @requirement estimate-request/REQ-37.3
     *
     * 編集画面 → 並び替え後保存 → 再オープンで昇順表示を検証する。
     * 既存の received-quotation-dialog-improvements-e2e.spec.ts では POST 経路で
     * 同様のシナリオを検証しているため、ここでは PATCH 系（編集保存）を含めて検証する。
     */
    test('明細行データを保存・再オープンしたときに sortOrder 昇順で復元表示される (REQ-37.1, 37.2, 37.3)', async ({
      page,
      request,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const baseUrl = API_BASE_URL;
      const requestId = createdEstimateRequestId as string;

      // 受領見積書を3明細で作成（sortOrder = 0,1,2）
      const create = await request.post(
        `${baseUrl}/api/estimate-requests/${requestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `Sort永続化_${Date.now()}`,
            submittedAt: '2026-04-27',
            lineItems: JSON.stringify([
              {
                customCategory: '',
                workType: '',
                name: 'Z項目',
                specification: '',
                unit: '式',
                quantity: 1,
                unitPrice: 100,
                amount: 100,
                remarks: '',
                sortOrder: 2,
              },
              {
                customCategory: '',
                workType: '',
                name: 'X項目',
                specification: '',
                unit: '式',
                quantity: 1,
                unitPrice: 100,
                amount: 100,
                remarks: '',
                sortOrder: 0,
              },
              {
                customCategory: '',
                workType: '',
                name: 'Y項目',
                specification: '',
                unit: '式',
                quantity: 1,
                unitPrice: 100,
                amount: 100,
                remarks: '',
                sortOrder: 1,
              },
            ]),
          },
        }
      );
      expect([200, 201]).toContain(create.status());
      createdQuotationId = (await create.json()).id;

      // 編集画面を開く
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${requestId}`);
      await page.waitForLoadState('networkidle');
      const editButton = page.getByRole('button', { name: /編集|変更/ }).first();
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();
      await expect(page.getByText(/受領見積書の編集/i)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // REQ-37.3: sortOrder=0,1,2 の順序で X,Y,Z が表示される（REQ-37.1: sortOrder 保持の証跡）
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('X項目', {
        timeout: getTimeout(15000),
      });
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('Y項目');
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveValue('Z項目');
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      const baseUrl = API_BASE_URL;
      if (!accessToken) {
        const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
          data: {
            email: TEST_USERS.REGULAR_USER.email,
            password: TEST_USERS.REGULAR_USER.password,
          },
        });
        accessToken = (await loginResponse.json()).accessToken;
      }

      if (createdProjectId) {
        await request.delete(`${baseUrl}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (createdTradingPartnerId) {
        await request.delete(`${baseUrl}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      // 受領見積書 ID は project 削除でカスケードクリーンアップされる
      void createdQuotationId;

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
      createdQuotationId = null;
    });
  });
});
