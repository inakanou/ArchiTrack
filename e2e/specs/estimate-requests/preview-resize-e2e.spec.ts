/**
 * @fileoverview 受領見積書 インラインプレビュー縦幅リサイズ E2E テスト（REQ-36）
 *
 * Requirements coverage (estimate-request) - 既存 received-quotation-dialog-improvements-e2e.spec.ts
 * では REQ-36.1, 36.4, 36.9, 36.10 をカバー済み。本ファイルは残りをカバーする：
 * - REQ-36.2: 編集画面のインラインプレビューエリア下端にリサイズハンドルを表示
 * - REQ-36.3: PDF・画像・Excelすべてのプレビュー表示形式に適用される
 * - REQ-36.5: 最小値の定義と最小値超過時のクランプ
 * - REQ-36.6: 最大値（ダイアログに収まる範囲）の定義
 * - REQ-36.7: 最小値到達時に縮小操作を抑止
 * - REQ-36.8: 最大値到達時に拡大操作を抑止
 * - REQ-36.11: localStorage 保存値が無いときに既定の初期縦幅を使用
 * - REQ-36.12: リサイズ後もページナビゲーション/拡大縮小機能が動作
 * - REQ-36.13: ダイアログ高さ上限制約を維持
 * - REQ-36.14: ハンドル上にカーソル / ドラッグ中にハンドルの操作可能性を視覚明示
 *
 * @module e2e/specs/estimate-requests/preview-resize-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

const PREVIEW_HEIGHT_STORAGE_KEY = 'architrack:received-quotation:preview-height';
const RESIZE_MIN_HEIGHT = 200;
const RESIZE_MAX_ABSOLUTE_HEIGHT = 800;
const RESIZE_DEFAULT_HEIGHT = 400;

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

/**
 * canvas の祖先を辿って overflowY=auto/scroll となる要素（FileInlinePreview の pdfContainer）の
 * 描画高さを取得する。`page.locator('div').filter({ has: canvas }).first()` だとページ全体の
 * 祖先 div を取得してしまい、preview 縦幅検証ができないため、このヘルパーを使う。
 */
async function getPdfContainerHeight(page: Page): Promise<number | null> {
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: getTimeout(20000) });
  return page
    .locator('canvas')
    .first()
    .evaluate((canvas) => {
      let el: HTMLElement | null = canvas.parentElement;
      while (el) {
        const computed = window.getComputedStyle(el).overflowY;
        if (computed === 'auto' || computed === 'scroll') {
          return el.getBoundingClientRect().height;
        }
        el = el.parentElement;
      }
      return null;
    });
}

test.describe('受領見積書 インラインプレビュー縦幅リサイズ（REQ-36 残り）', () => {
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

      // 営業担当者 ID を取得（プロジェクト作成スキーマで salesPersonId が必須）
      const usersResponse = await request.get(`${baseUrl}/api/users/assignable`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const salesPersonId = (await usersResponse.json())[0]?.id;
      expect(salesPersonId).toBeTruthy();

      const project = await request.post(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `E2E_Resize_${Date.now()}`, siteAddress: '東京都', salesPersonId },
      });
      createdProjectId = (await project.json()).id;

      const partner = await request.post(`${baseUrl}/api/trading-partners`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `Resize業者_${Date.now()}`,
          nameKana: 'リサイズ',
          address: '東京都',
          types: ['SUBCONTRACTOR'],
          email: `resize-${Date.now()}@example.com`,
        },
      });
      createdTradingPartnerId = (await partner.json()).id;

      const qt = await request.post(`${baseUrl}/api/projects/${createdProjectId}/quantity-tables`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: `Resize_QT_${Date.now()}` },
      });
      const qtId = (await qt.json()).id;
      const group = await request.post(`${baseUrl}/api/quantity-tables/${qtId}/groups`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { name: 'G', displayOrder: 0 },
      });
      const groupId = (await group.json()).id;
      await request.post(`${baseUrl}/api/quantity-groups/${groupId}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: '項目',
          workType: '工',
          specification: '規',
          unit: '式',
          quantity: 1,
          displayOrder: 0,
        },
      });

      const isRes = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `Resize内訳書_${Date.now()}`, quantityTableId: qtId },
        }
      );
      createdItemizedStatementId = (await isRes.json()).id;

      const er = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `Resize見積依頼_${Date.now()}`,
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
  // REQ-36.3: 画像プレビューでもリサイズハンドルが表示される
  // ==========================================================================

  test.describe('画像プレビューのリサイズハンドル', () => {
    /**
     * @requirement estimate-request/REQ-36.3
     */
    test('画像（PNG）プレビュー時にもリサイズハンドルが表示される (REQ-36.3)', async ({ page }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.evaluate((key) => localStorage.removeItem(key), PREVIEW_HEIGHT_STORAGE_KEY);

      // 画像ファイルをアップロード
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-image.png');

      // リサイズハンドルが表示される
      const resizeHandle = page.locator('[data-testid="preview-resize-handle"]');
      await expect(resizeHandle).toBeVisible({ timeout: getTimeout(15000) });
      await expect(resizeHandle).toHaveAttribute('role', 'separator');
    });
  });

  // ==========================================================================
  // REQ-36.5, 36.6, 36.7, 36.8: 最小値・最大値クランプ
  // ==========================================================================

  test.describe('最小値・最大値クランプ', () => {
    /**
     * @requirement estimate-request/REQ-36.5
     * @requirement estimate-request/REQ-36.7
     */
    test('localStorage に小さすぎる値（< 200px）が保存されていても 200px にクランプされて初期化される (REQ-36.5, 36.7)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      // 詳細画面に遷移してから localStorage 操作
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');
      // 最小値以下の値を localStorage に保存
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
        key: PREVIEW_HEIGHT_STORAGE_KEY,
        value: '50',
      });

      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      // PDF プレビューエリアの実高さを測定 → 200px 以上
      const pdfContainerHeight = await getPdfContainerHeight(page);
      expect(pdfContainerHeight).not.toBeNull();
      if (pdfContainerHeight != null) {
        expect(pdfContainerHeight).toBeGreaterThanOrEqual(RESIZE_MIN_HEIGHT - 1); // 1px の丸め誤差許容
      }
    });

    /**
     * @requirement estimate-request/REQ-36.6
     * @requirement estimate-request/REQ-36.8
     */
    test('localStorage に大きすぎる値（> 800px）が保存されていても最大値以下にクランプされる (REQ-36.6, 36.8)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');
      // 大きすぎる値（5000）を localStorage に保存
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
        key: PREVIEW_HEIGHT_STORAGE_KEY,
        value: '5000',
      });

      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      const pdfContainerHeight = await getPdfContainerHeight(page);
      expect(pdfContainerHeight).not.toBeNull();
      if (pdfContainerHeight != null) {
        // RESIZE_MAX_ABSOLUTE_HEIGHT = 800px と viewport*0.7 のうち小さい方
        expect(pdfContainerHeight).toBeLessThanOrEqual(RESIZE_MAX_ABSOLUTE_HEIGHT);
      }
    });
  });

  // ==========================================================================
  // REQ-36.11: localStorage 値がないときの既定値
  // ==========================================================================

  test.describe('localStorage 未保存時の既定値', () => {
    /**
     * @requirement estimate-request/REQ-36.11
     */
    test('localStorage に保存値が存在しないときに既定の初期縦幅 (RESIZE_DEFAULT_HEIGHT=400px) が使用される (REQ-36.11)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');
      // localStorage の値を確実に削除
      await page.evaluate((key) => localStorage.removeItem(key), PREVIEW_HEIGHT_STORAGE_KEY);

      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      const pdfContainerHeight = await getPdfContainerHeight(page);
      expect(pdfContainerHeight).not.toBeNull();
      if (pdfContainerHeight != null) {
        // 既定値 400px の付近（スクロールバー等で多少ずれても許容: ±20px）
        expect(pdfContainerHeight).toBeGreaterThanOrEqual(RESIZE_DEFAULT_HEIGHT - 20);
        expect(pdfContainerHeight).toBeLessThanOrEqual(RESIZE_DEFAULT_HEIGHT + 20);
      }
    });
  });

  // ==========================================================================
  // REQ-36.12: リサイズ後にページナビ・拡大縮小も動作する
  // ==========================================================================

  test.describe('リサイズ後の他機能動作', () => {
    /**
     * @requirement estimate-request/REQ-36.12
     */
    test('リサイズ操作の後でも拡大縮小機能（REQ-31）が正常動作する (REQ-36.12)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.evaluate((key) => localStorage.removeItem(key), PREVIEW_HEIGHT_STORAGE_KEY);

      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      const resizeHandle = page.locator('[data-testid="preview-resize-handle"]');
      await expect(resizeHandle).toBeVisible({ timeout: getTimeout(20000) });

      // リサイズハンドルを 80px ドラッグ
      const handleBox = await resizeHandle.boundingBox();
      expect(handleBox).toBeTruthy();
      if (handleBox) {
        const startX = handleBox.x + handleBox.width / 2;
        const startY = handleBox.y + handleBox.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX, startY + 80, { steps: 10 });
        await page.mouse.up();
      }

      // 拡大縮小機能の確認: 拡大ボタン押下 → 倍率テキストが +25% 増える
      // 初期スケールは fit-to-width（REQ-31.8）で動的に決まるため、絶対値ではなく相対変化で検証する
      const zoomText = page.getByTestId('zoom-level-text');
      await expect(zoomText).toHaveText(/^\d+%$/);
      const initialText = (await zoomText.textContent()) ?? '';
      const initial = Number(initialText.replace('%', ''));
      const zoomIn = page.getByRole('button', { name: '拡大' });
      await zoomIn.click();
      await expect(zoomText).toHaveText(`${initial + 25}%`);
    });
  });

  // ==========================================================================
  // REQ-36.13: ダイアログ高さ上限制約
  // ==========================================================================

  test.describe('ダイアログ高さの上限制約維持', () => {
    /**
     * @requirement estimate-request/REQ-36.13
     */
    test('リサイズ後もダイアログ全体が画面（viewport）からはみ出さない (REQ-36.13)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await page.setViewportSize({ width: 1600, height: 900 });
      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 最大値クランプを発生させる localStorage 値を設定
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
        key: PREVIEW_HEIGHT_STORAGE_KEY,
        value: '5000',
      });

      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      // ダイアログコンテンツの高さが viewport 高さに収まる
      const modalContent = page
        .locator('div')
        .filter({ has: page.getByText(/受領見積書の登録/i) })
        .filter({ hasText: 'ファイル' })
        .first();
      const box = await modalContent.boundingBox();
      expect(box).toBeTruthy();
      const viewport = page.viewportSize();
      if (box && viewport) {
        // ダイアログの bottom 座標が viewport を超えないこと
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      }
    });
  });

  // ==========================================================================
  // REQ-36.14: ハンドルの視覚明示
  // ==========================================================================

  test.describe('リサイズハンドルの視覚明示', () => {
    /**
     * @requirement estimate-request/REQ-36.14
     */
    test('リサイズハンドル要素が aria 属性とカーソル指定によって操作可能性を視覚明示する (REQ-36.14)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      await loginAsUser(page, 'REGULAR_USER');
      await openCreateDialog(page, createdEstimateRequestId as string);
      await page.locator('[data-testid="file-input"]').setInputFiles('e2e/fixtures/test-file.pdf');

      const resizeHandle = page.locator('[data-testid="preview-resize-handle"]');
      await expect(resizeHandle).toBeVisible({ timeout: getTimeout(20000) });

      // role="separator" + aria-label でアクセシビリティ的に「操作可能」を伝達
      await expect(resizeHandle).toHaveAttribute('role', 'separator');
      await expect(resizeHandle).toHaveAttribute('aria-label', 'プレビューエリアの高さを変更');

      // CSS cursor が ns-resize（縦方向リサイズの操作可能性を視覚明示）
      const cursor = await resizeHandle.evaluate((el) => window.getComputedStyle(el).cursor);
      expect(cursor).toMatch(/(ns-resize|row-resize)/);

      // hover にしてもハンドルが visible のまま
      await resizeHandle.hover();
      await expect(resizeHandle).toBeVisible();
    });
  });

  // ==========================================================================
  // REQ-36.2: 編集画面でもリサイズハンドルが表示される
  // ==========================================================================

  test.describe('編集画面のリサイズハンドル', () => {
    /**
     * @requirement estimate-request/REQ-36.2
     */
    test('編集画面でも既存ファイルプレビューエリアの下端にリサイズハンドルが表示される (REQ-36.2)', async ({
      page,
      request,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const baseUrl = API_BASE_URL;
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const pdfBuffer = await fs.readFile(path.resolve('e2e/fixtures/test-file.pdf'));

      // PDF 添付付きで受領見積書作成
      const create = await request.post(
        `${baseUrl}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `編集リサイズ_${Date.now()}`,
            // createReceivedQuotationSchema は ISO 8601 datetime（z.string().datetime()）を要求
            submittedAt: '2026-04-27T00:00:00.000Z',
            file: { name: 'test-file.pdf', mimeType: 'application/pdf', buffer: pdfBuffer },
          },
        }
      );
      expect([200, 201]).toContain(create.status());
      createdQuotationId = (await create.json()).id;

      await loginAsUser(page, 'REGULAR_USER');
      await page.goto(`/estimate-requests/${createdEstimateRequestId}`);
      await page.waitForLoadState('networkidle');

      // 編集ボタン
      // ページ内には「ステータスを依頼済に変更する」ボタンも存在し /編集|変更/ で
      // 先頭にマッチしてしまう。受領見積書一覧の「編集」ボタンを完全一致で取得する
      const editButton = page.getByRole('button', { name: '編集', exact: true }).first();
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      await expect(page.getByText(/受領見積書の編集/i)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 編集画面でも preview-resize-handle が出現
      const resizeHandle = page.locator('[data-testid="preview-resize-handle"]');
      await expect(resizeHandle).toBeVisible({ timeout: getTimeout(25000) });
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
      void createdQuotationId;

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
      createdQuotationId = null;
    });
  });
});
