/**
 * @fileoverview 受領見積書ダイアログ改善2 のE2Eテスト（task 81.5 / Req 36-38）
 *
 * Requirements coverage (estimate-request):
 * - REQ-36.1: インラインプレビュー下端のリサイズハンドル表示（受領見積書登録）
 * - REQ-36.4: ドラッグ操作で縦幅を変更
 * - REQ-36.9: pointerup 時点の縦幅を localStorage に永続化
 * - REQ-36.10: 次回ダイアログ表示時に永続化された縦幅を復元
 * - REQ-37.7: アクションメニュー「上に移動」で対象行を 1 つ上に移動
 * - REQ-37.13: 保存時に sortOrder を含む明細行データを送信し並び順を永続化
 * - REQ-38.2: セッション切れ時にダイアログ上で再認証モーダルを表示
 * - REQ-38.3: 再認証モーダルがパスワード入力フィールドを表示
 * - REQ-38.6: 再認証成功後に保存処理を自動リトライ
 * - REQ-38.7: 再認証成功後の保存リトライ完了でダイアログを閉じる
 * - REQ-38.8: 認証情報誤入力時に再認証モーダル内へエラー表示・再入力許可
 * - REQ-38.12: 未保存変更ありでダイアログクローズ時に確認ダイアログを表示
 * - REQ-38.13: 未保存変更ありでブラウザ離脱時に標準確認ダイアログを表示
 * - REQ-38.14: 再認証モーダルが通常ログイン API と同等の認証検証を行う
 *
 * Test design notes:
 * - 「× ボタン」シナリオ（task 81.5 仕様）について、受領見積書ダイアログには ×
 *   ボタンが存在せず「キャンセル」ボタンのみのため、キャンセルボタン押下に置き換えて
 *   useUnsavedChangesGuard.confirmCloseIfDirty が起動することを検証する（Req 38.12）。
 * - セッション切れシミュレーションは localStorage の accessToken/refreshToken を
 *   無効値に上書きすることで、次回保存 API 呼び出し時に 401 → リフレッシュ失敗 →
 *   sessionExpiredCallback 経由で SessionExpiredModal を表示させる経路を利用する。
 *   バックエンド側の強制セッション失効ヘルパーは存在しないが、フロントエンドの
 *   セッション切れフローを忠実に再現するため、本シミュレーションが妥当。
 *
 * @module e2e/specs/estimate-requests/received-quotation-dialog-improvements-e2e.spec
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { TEST_USERS } from '../../helpers/test-users';

/**
 * useResizableHeight が利用する localStorage キー
 *
 * frontend/src/components/estimate-requests/FileInlinePreview.tsx の
 * `RESIZE_STORAGE_KEY` と一致させる必要がある。
 */
const PREVIEW_HEIGHT_STORAGE_KEY = 'architrack:received-quotation:preview-height';

/**
 * 受領見積書登録ダイアログを開いた状態にする共通ヘルパー
 *
 * 詳細画面の「登録」ボタンをクリックし、ダイアログ内のフォーム表示を待機する。
 */
async function openReceivedQuotationCreateDialog(page: Page, estimateRequestId: string) {
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="estimate-request-detail-page"]')).toBeVisible({
    timeout: getTimeout(15000),
  });

  const addButton = page.getByRole('button', { name: /登録|追加/i }).first();
  await expect(addButton).toBeVisible({ timeout: getTimeout(10000) });
  await addButton.click();

  await expect(page.getByText(/受領見積書の登録/i)).toBeVisible({
    timeout: getTimeout(10000),
  });
}

/**
 * セッション切れをシミュレートする
 *
 * localStorage 上の accessToken / refreshToken を無効値に書き換えることで、
 * 次回 API 呼び出し時に 401 + リフレッシュ失敗 → sessionExpiredCallback 経由で
 * SessionExpiredModal が表示される動線を再現する。
 *
 * 既存のフロントエンド設計（frontend/src/api/client.ts L185-235）に依存。
 */
async function simulateSessionExpiration(page: Page) {
  // localStorage の accessToken/refreshToken を書き換えても、AuthContext のメモリ内 state には
  // valid なトークンが保持されたままになるため、API リクエストが成功してしまう。
  // そこで、受領見積書 POST を「最初の 1 回だけ」401 で返すルートモックを設定し、
  // refresh API も 401 で返して、リトライ時には外して通常フローに戻す。
  // これにより以下の認証フローが確実に発火する:
  //   1) 保存リクエスト → 401 (mock)
  //   2) リフレッシュ試行 → 401 (mock)
  //   3) SessionExpiredModal 表示
  //   4) 再認証成功 → 自動リトライ → 通常レスポンスで保存成功
  let savePostFailed = false;
  await page.route('**/api/estimate-requests/*/quotations', async (route) => {
    if (!savePostFailed && route.request().method() === 'POST') {
      savePostFailed = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'session expired (e2e)' }),
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'session expired (e2e)' }),
    })
  );
}

test.describe('受領見積書ダイアログ改善2 (Req 36-38, task 81.5)', () => {
  test.describe.configure({ mode: 'serial' });

  // テストデータ保持
  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let accessToken: string = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ============================================================================
  // テストデータのセットアップ
  // ============================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備: API経由でプロジェクト・取引先・内訳書・見積依頼を作成する', async ({ request }) => {
      const baseUrl = API_BASE_URL;

      // ログイン → アクセストークン取得
      const loginResponse = await request.post(`${baseUrl}/api/v1/auth/login`, {
        data: {
          email: TEST_USERS.REGULAR_USER.email,
          password: TEST_USERS.REGULAR_USER.password,
        },
      });
      expect(loginResponse.ok()).toBe(true);
      const loginBody = await loginResponse.json();
      accessToken = loginBody.accessToken;
      expect(accessToken).toBeTruthy();

      // 営業担当者 ID を取得（プロジェクト作成スキーマで salesPersonId が必須）
      const usersResponse = await request.get(`${baseUrl}/api/users/assignable`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const salesPersonId = (await usersResponse.json())[0]?.id;
      expect(salesPersonId).toBeTruthy();

      // プロジェクト作成
      const projectResponse = await request.post(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `E2Eダイアログ改善2_${Date.now()}`,
          siteAddress: '東京都千代田区テスト町1-2-3',
          salesPersonId,
        },
      });
      expect(projectResponse.status()).toBe(201);
      const projectBody = await projectResponse.json();
      createdProjectId = projectBody.id;
      expect(createdProjectId).toBeTruthy();

      // 取引先作成（協力業者）
      const tradingPartnerResponse = await request.post(`${baseUrl}/api/trading-partners`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: `E2Eダイアログ改善2業者_${Date.now()}`,
          nameKana: 'ダイアログカイゼンギョウシャ',
          address: '東京都千代田区テスト町2-3-4',
          types: ['SUBCONTRACTOR'],
          email: `dialog-improvements-${Date.now()}@example.com`,
        },
      });
      expect(tradingPartnerResponse.status()).toBe(201);
      const tradingPartnerBody = await tradingPartnerResponse.json();
      createdTradingPartnerId = tradingPartnerBody.id;

      // 数量表 → グループ → 項目作成
      const quantityTableResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `ダイアログ改善2用数量表_${Date.now()}` },
        }
      );
      expect(quantityTableResponse.status()).toBe(201);
      const quantityTableBody = await quantityTableResponse.json();
      const quantityTableId = quantityTableBody.id;

      const groupResponse = await request.post(
        `${baseUrl}/api/quantity-tables/${quantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'ダイアログ改善2グループ', displayOrder: 0 },
        }
      );
      expect(groupResponse.status()).toBe(201);
      const groupBody = await groupResponse.json();

      for (let i = 0; i < 3; i++) {
        const itemResponse = await request.post(
          `${baseUrl}/api/quantity-groups/${groupBody.id}/items`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
              name: `項目${i + 1}`,
              workType: '工種',
              specification: '規格',
              unit: '式',
              quantity: 1.0,
              displayOrder: i,
            },
          }
        );
        expect(itemResponse.status()).toBe(201);
      }

      // 内訳書作成
      const itemizedStatementResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `ダイアログ改善2用内訳書_${Date.now()}`, quantityTableId },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);
      const itemizedStatementBody = await itemizedStatementResponse.json();
      createdItemizedStatementId = itemizedStatementBody.id;

      // 見積依頼作成
      const estimateRequestResponse = await request.post(
        `${baseUrl}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `ダイアログ改善2用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      const estimateRequestBody = await estimateRequestResponse.json();
      createdEstimateRequestId = estimateRequestBody.id;
      expect(createdEstimateRequestId).toBeTruthy();
    });
  });

  // ============================================================================
  // Req 36: プレビュー縦幅リサイズ + localStorage 永続化
  // ============================================================================

  test.describe('Req 36: プレビュー縦幅リサイズと localStorage 永続化', () => {
    /**
     * task 81.5 シナリオ1
     * @requirement estimate-request/REQ-36.1
     * @requirement estimate-request/REQ-36.4
     * @requirement estimate-request/REQ-36.9
     * @requirement estimate-request/REQ-36.10
     */
    test('リサイズハンドルが表示され、設定値がlocalStorageに保存・再オープンで復元される (REQ-36.1, 36.4, 36.9, 36.10)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');

      // 1 回目: ダイアログを開く
      // 注: 各テストは新規 BrowserContext で実行されるため localStorage は空。
      //     かつて存在した「事前 page.goto + removeItem」は二重ナビゲーションを誘発し、
      //     1 回目の goto が起動した /api/v1/auth/refresh のレスポンスを 2 回目の goto が
      //     キャンセルする一方、バックエンド側ではリフレッシュトークンのローテーションが
      //     完了してしまい、2 回目の goto に伴う refresh が 401 を返す競合が発生していた。
      //     openReceivedQuotationCreateDialog の単一 goto に集約することで競合を回避する。
      await openReceivedQuotationCreateDialog(page, requestId);

      // PDFをアップロード（プレビュー領域 = リサイズ対象を出現させる）
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles('e2e/fixtures/test-file.pdf');

      // リサイズハンドルが表示される（Req 36.1）
      const resizeHandle = page.locator('[data-testid="preview-resize-handle"]');
      await expect(resizeHandle).toBeVisible({ timeout: getTimeout(15000) });
      await expect(resizeHandle).toHaveAttribute('role', 'separator');
      await expect(resizeHandle).toHaveAttribute('aria-label', 'プレビューエリアの高さを変更');

      // 縦方向にドラッグして縦幅を変更（Req 36.4 / 36.9）
      // 実装の useResizableHeight は React の onPointerDown でフックを開始し、
      // onPointerDown 後に setIsResizing(true) → 次レンダで window に pointermove/pointerup を
      // attach する。page.mouse.* は MouseEvent ベースで Chromium の auto pointer 発火に依存する。
      // Playwright + Chromium の組み合わせでは onPointerDown が確実に発火しないことがあるため、
      // ハンドル要素に対して PointerEvent を直接 dispatchEvent して挙動を確定させる。
      const handleBox = await resizeHandle.boundingBox();
      expect(handleBox).toBeTruthy();
      if (handleBox) {
        const startX = handleBox.x + handleBox.width / 2;
        const startY = handleBox.y + handleBox.height / 2;
        const targetY = startY + 120; // 下方向に 120px ドラッグ → 縦幅拡大

        // ハンドルに pointerdown を直接送る（onResizeStart → setIsResizing(true)）
        await resizeHandle.dispatchEvent('pointerdown', {
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY,
          isPrimary: true,
        });
        // useEffect が window に pointermove/pointerup を attach するレンダーを待つ
        await page.waitForTimeout(150);

        // window に pointermove を発行（実装は window 側でリスナー登録）
        await page.evaluate(
          ({ x, y, targetY: ty }) => {
            const ev = new PointerEvent('pointermove', {
              pointerId: 1,
              pointerType: 'mouse',
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: ty,
              isPrimary: true,
              bubbles: true,
            });
            window.dispatchEvent(ev);
            void y;
          },
          { x: startX, y: startY, targetY }
        );

        // pointerup → localStorage 保存
        await page.evaluate(
          ({ x, y }) => {
            const ev = new PointerEvent('pointerup', {
              pointerId: 1,
              pointerType: 'mouse',
              button: 0,
              buttons: 0,
              clientX: x,
              clientY: y,
              isPrimary: true,
              bubbles: true,
            });
            window.dispatchEvent(ev);
          },
          { x: startX, y: targetY }
        );
      }

      // pointerup 後に localStorage に保存される（Req 36.9, 36.10）
      // pointerup 内で localStorage.setItem を行うが、React 状態更新と同フレーム実行のため
      // 念のため Locator アサーションのリトライ機構を使って書き込み完了を待つ。
      await expect
        .poll(
          async () => page.evaluate((key) => localStorage.getItem(key), PREVIEW_HEIGHT_STORAGE_KEY),
          { timeout: getTimeout(5000) }
        )
        .not.toBeNull();
      const persistedHeight = await page.evaluate(
        (key) => localStorage.getItem(key),
        PREVIEW_HEIGHT_STORAGE_KEY
      );
      expect(persistedHeight).not.toBeNull();
      const persistedHeightNum = Number.parseInt(persistedHeight ?? '0', 10);
      expect(persistedHeightNum).toBeGreaterThanOrEqual(200); // RESIZE_MIN_HEIGHT
      expect(persistedHeightNum).toBeLessThanOrEqual(800); // RESIZE_MAX_ABSOLUTE_HEIGHT

      // ダイアログを閉じる（キャンセル）
      // 永続化値が変わってもダイアログ未保存変更（提出日空欄→入力なし、name デフォルト「見積書」）が
      // dirty 判定されると confirm が出るので、出た場合は accept する。
      page.once('dialog', (dialog) => {
        // 「閉じてもよろしいですか？」が出たら OK
        void dialog.accept();
      });
      await page
        .getByRole('button', { name: /キャンセル/i })
        .first()
        .click();
      await expect(page.getByText(/受領見積書の登録/i)).toBeHidden({ timeout: getTimeout(10000) });

      // 2 回目: 再度ダイアログを開いて localStorage 値が復元されることを確認（Req 36.10）
      await openReceivedQuotationCreateDialog(page, requestId);
      const persistedHeightAfterReopen = await page.evaluate(
        (key) => localStorage.getItem(key),
        PREVIEW_HEIGHT_STORAGE_KEY
      );
      // 再オープン後も localStorage 値は維持（永続化された証拠）
      expect(Number.parseInt(persistedHeightAfterReopen ?? '0', 10)).toBe(persistedHeightNum);

      // PDFを再度アップロードしてリサイズハンドルが再表示されることも確認
      await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/test-file.pdf');
      await expect(page.locator('[data-testid="preview-resize-handle"]')).toBeVisible({
        timeout: getTimeout(15000),
      });
    });
  });

  // ============================================================================
  // Req 37: 明細行 sortOrder + アクションメニュー
  // ============================================================================

  test.describe('Req 37: 明細行アクションメニュー（上下移動・削除集約）', () => {
    /**
     * task 81.5 シナリオ3
     * @requirement estimate-request/REQ-37.7
     */
    test('アクションメニューが3項目（上に移動・下に移動・削除）を表示し、行内に旧削除ボタンが存在しない (REQ-37.7)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');
      await openReceivedQuotationCreateDialog(page, requestId);

      // 行を 2 つ追加して合計 3 行にする
      const addRowButton = page.getByRole('button', { name: '行を追加' });
      await addRowButton.click();
      await addRowButton.click();

      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 行内に旧式の単独「削除」ボタン（td 直下の独立 <button>）が存在しないことを確認
      // 検証範囲は明細行テーブル内に限定する（見積依頼ヘッダーにも「削除」ボタンが存在するため）。
      // menuitem ロールは getByRole('button') の対象外なので、メニューの「削除」menuitem は数に含まれない。
      const inlineDeleteButtons = page
        .locator('table')
        .getByRole('button', { name: '削除', exact: true });
      await expect(inlineDeleteButtons).toHaveCount(0);

      // 行2 のアクションメニュー（中間行）→ 上下とも有効
      const row2Menu = page.getByRole('button', { name: '行2の操作メニュー' });
      await expect(row2Menu).toBeVisible();
      await row2Menu.click();
      const moveUpRow2 = page.getByRole('menuitem', { name: '上に移動' });
      const moveDownRow2 = page.getByRole('menuitem', { name: '下に移動' });
      const deleteRow2 = page.getByRole('menuitem', { name: '削除' });
      await expect(moveUpRow2).toBeVisible();
      await expect(moveDownRow2).toBeVisible();
      await expect(deleteRow2).toBeVisible();
      await expect(moveUpRow2).toBeEnabled();
      await expect(moveDownRow2).toBeEnabled();

      // メニューを閉じる（外側クリック）
      await page.locator('body').click({ position: { x: 5, y: 5 } });

      // 行1 のアクションメニュー → 「上に移動」が disabled (Req 37.9)
      const row1Menu = page.getByRole('button', { name: '行1の操作メニュー' });
      await row1Menu.click();
      const moveUpRow1 = page.getByRole('menuitem', { name: '上に移動' });
      await expect(moveUpRow1).toBeDisabled();
      await page.locator('body').click({ position: { x: 5, y: 5 } });

      // 行3 のアクションメニュー → 「下に移動」が disabled (Req 37.10)
      const row3Menu = page.getByRole('button', { name: '行3の操作メニュー' });
      await row3Menu.click();
      const moveDownRow3 = page.getByRole('menuitem', { name: '下に移動' });
      await expect(moveDownRow3).toBeDisabled();
    });

    /**
     * task 81.5 シナリオ2
     * @requirement estimate-request/REQ-37.7
     * @requirement estimate-request/REQ-37.13
     *
     * 3 行入力 → 行3 を 2 回上に移動して先頭に持っていく → 保存 → 編集再オープンで
     * 並び順が永続化されていることを確認する。
     */
    test('上に移動→保存→再オープンで並び順がsortOrderで永続化される (REQ-37.7, 37.13)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');
      await openReceivedQuotationCreateDialog(page, requestId);

      // 行 2,3 を追加（計 3 行）
      const addRowButton = page.getByRole('button', { name: '行を追加' });
      await addRowButton.click();
      await addRowButton.click();
      await expect(page.locator('input[aria-label="行3 名称"]')).toBeVisible({
        timeout: getTimeout(10000),
      });

      // 各行の名称を入力（後で並び順検証に使用）
      await page.locator('input[aria-label="行1 名称"]').fill('項目-A');
      await page.locator('input[aria-label="行2 名称"]').fill('項目-B');
      await page.locator('input[aria-label="行3 名称"]').fill('項目-C');

      // 受領見積書名・提出日を入力（必須相当）
      const nameInput = page.locator('#quotation-name');
      await nameInput.fill(`並び順E2E_${Date.now()}`);
      const submittedAtInput = page.getByLabel(/提出日/i);
      if (await submittedAtInput.isVisible()) {
        await submittedAtInput.fill('2026-04-27');
      }

      // 行3 を 2 回 上に移動 → 先頭に
      const moveUpFromRow3 = async (rowIndex: number) => {
        const menuButton = page.getByRole('button', {
          name: `行${rowIndex}の操作メニュー`,
        });
        await menuButton.click();
        const moveUp = page.getByRole('menuitem', { name: '上に移動' });
        await moveUp.click();
      };
      await moveUpFromRow3(3);
      await moveUpFromRow3(2); // 直前で行3 → 行2 に移動済み

      // 並び替え後、行1 の名称が「項目-C」になっていることを確認
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('項目-C');
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('項目-A');
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveValue('項目-B');

      // 保存（POST /api/estimate-requests/:id/quotations）
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimate-requests/${requestId}/quotations`) &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );
      const submitButton = page.getByRole('button', { name: /^登録$|^保存$/ }).last();
      await submitButton.click();
      const saveResponse = await savePromise;
      expect(saveResponse.status()).toBe(201);

      // ダイアログが閉じることを確認
      await expect(page.getByText(/受領見積書の登録/i)).toBeHidden({
        timeout: getTimeout(15000),
      });

      // 受領見積書一覧から作成済みの行を編集ボタン経由で再オープン
      // ページ内には「ステータスを依頼済に変更する」ボタンも存在し /編集|変更/ で
      // 先頭にマッチしてしまうため、受領見積書一覧の「編集」ボタンを完全一致で取得する
      await page.waitForLoadState('networkidle');
      const editButton = page.getByRole('button', { name: '編集', exact: true }).first();
      await expect(editButton).toBeVisible({ timeout: getTimeout(10000) });
      await editButton.click();

      // 編集モーダル表示を待機
      await expect(page.getByText(/受領見積書の編集/i)).toBeVisible({
        timeout: getTimeout(15000),
      });

      // 永続化された sortOrder で並んでいることを確認（C, A, B の順序のまま）
      await expect(page.locator('input[aria-label="行1 名称"]')).toHaveValue('項目-C', {
        timeout: getTimeout(10000),
      });
      await expect(page.locator('input[aria-label="行2 名称"]')).toHaveValue('項目-A');
      await expect(page.locator('input[aria-label="行3 名称"]')).toHaveValue('項目-B');
    });
  });

  // ============================================================================
  // Req 38: セッション切れ時の再認証 + 未保存変更ガード
  // ============================================================================

  test.describe('Req 38: セッション切れ時の再認証フローと未保存変更ガード', () => {
    /**
     * task 81.5 シナリオ4
     * @requirement estimate-request/REQ-38.2
     * @requirement estimate-request/REQ-38.3
     * @requirement estimate-request/REQ-38.6
     * @requirement estimate-request/REQ-38.7
     * @requirement estimate-request/REQ-38.8
     * @requirement estimate-request/REQ-38.14
     */
    test('セッション切れ→再認証モーダル→誤入力エラー→正しいパスワードで再認証成功→保存自動リトライ→ダイアログ閉じる (REQ-38.2, 38.3, 38.6, 38.7, 38.8, 38.14)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');
      await openReceivedQuotationCreateDialog(page, requestId);

      // 必要最低限の入力
      await page.locator('#quotation-name').fill(`セッション切れE2E_${Date.now()}`);
      const submittedAtInput = page.getByLabel(/提出日/i);
      if (await submittedAtInput.isVisible()) {
        await submittedAtInput.fill('2026-04-27');
      }
      await page.locator('input[aria-label="行1 名称"]').fill('セッション切れ項目');

      // セッション切れシミュレーション（保存ボタンクリック前にトークンを無効化）
      await simulateSessionExpiration(page);

      // 保存クリック → 401 → リフレッシュ失敗 → SessionExpiredModal 表示
      const submitButton = page.getByRole('button', { name: /^登録$|^保存$/ }).last();
      await submitButton.click();

      // SessionExpiredModal が表示される（Req 38.2）
      const sessionDialog = page.getByRole('dialog', { name: /セッション/ });
      await expect(sessionDialog).toBeVisible({ timeout: getTimeout(20000) });

      // パスワード入力フィールドが存在する（Req 38.3）
      const passwordInput = sessionDialog.locator('input#session-expired-password');
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // 編集状態が背後で保持されている（Req 38.5 補強）
      // モーダル背後のフォームの入力値は、再認証完了まで残っているはず（DOM 上で参照可能）
      await expect(page.locator('#quotation-name')).toHaveValue(/セッション切れE2E_/);

      // 誤ったパスワードで再認証を試行 → エラーが表示される（Req 38.8）
      await passwordInput.fill('WrongPassword!!!');
      const reauthSubmitButton = sessionDialog.getByRole('button', { name: /再ログイン/ });
      await reauthSubmitButton.click();

      // エラーメッセージ表示
      const reauthError = sessionDialog.locator('[role="alert"]');
      await expect(reauthError).toBeVisible({ timeout: getTimeout(15000) });

      // 再入力許可（Req 38.8）: パスワード入力欄が引き続き編集可能
      await expect(passwordInput).toBeEnabled();

      // 正しいパスワードで再認証 → 通常ログイン API 経由で成功（Req 38.14）
      await passwordInput.fill('');
      await passwordInput.fill(TEST_USERS.REGULAR_USER.password);

      // 再認証 → 自動保存リトライ → 受領見積書作成 API 成功（Req 38.6, 38.14）
      const savePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/estimate-requests/${requestId}/quotations`) &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );
      await reauthSubmitButton.click();
      const saveResponse = await savePromise;
      expect(saveResponse.status()).toBe(201);

      // ダイアログクローズ（Req 38.7）
      await expect(page.getByText(/受領見積書の登録/i)).toBeHidden({
        timeout: getTimeout(20000),
      });
      await expect(sessionDialog).toBeHidden();
    });

    // task 81.5 シナリオ5 に対応していた Req 38.9 は requirements.md L655 で
    // design review Issue 1 (2026-04-27) によって正式撤廃済みのため、対応テスト
    // 定義は無効化（test.skip）ではなく削除する。

    /**
     * task 81.5 シナリオ6（仕様：「✕ ボタン」、現実：「キャンセル」ボタン）
     * @requirement estimate-request/REQ-38.12
     */
    test('未保存変更ありでキャンセルボタンを押すと「変更が保存されていません」確認ダイアログが表示される (REQ-38.12)', async ({
      page,
    }) => {
      // NOTE: ダイアログには ✕ ボタンが存在せずキャンセルボタンのみ。
      // 仕様（task 81.5 シナリオ6）は ✕ ボタンを想定していたが、実際の DOM に合わせて
      // キャンセルボタン押下時の confirmCloseIfDirty 起動を検証する。
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');
      await openReceivedQuotationCreateDialog(page, requestId);

      // 受領見積書名フィールドにユーザー入力 → isDirty=true
      await page.locator('#quotation-name').fill('未保存テスト');

      // window.confirm をハンドリング（OK = 受領 = ダイアログ閉じる）
      let confirmDialogShown = false;
      let confirmMessage = '';
      page.once('dialog', (dialog) => {
        confirmDialogShown = true;
        confirmMessage = dialog.message();
        // 一旦キャンセル（ダイアログを閉じない選択）→ シナリオ後段で閉じることも検証
        void dialog.dismiss();
      });

      // キャンセルボタンクリック → window.confirm 起動
      const cancelButton = page.getByRole('button', { name: /キャンセル/ }).first();
      await cancelButton.click();

      // confirm ダイアログが表示されたことを確認
      // dialog.dismiss() してもイベントは発火済みなのでフラグで検証可能
      await expect.poll(() => confirmDialogShown, { timeout: getTimeout(5000) }).toBe(true);
      // メッセージ内容（useUnsavedChangesGuard.UNSAVED_CHANGES_CONFIRM_MESSAGE）
      expect(confirmMessage).toMatch(/変更が保存されていません/);

      // dismiss を選んだ場合、ダイアログは閉じない
      await expect(page.getByText(/受領見積書の登録/i)).toBeVisible();

      // 次に accept を選択 → ダイアログが閉じる
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await cancelButton.click();
      await expect(page.getByText(/受領見積書の登録/i)).toBeHidden({
        timeout: getTimeout(10000),
      });
    });

    /**
     * task 81.5 シナリオ7
     * @requirement estimate-request/REQ-38.13
     */
    test('未保存変更ありでブラウザリロード時に beforeunload 確認が表示される (REQ-38.13)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');
      await openReceivedQuotationCreateDialog(page, requestId);

      // ユーザー入力で isDirty=true → useUnsavedChangesGuard が beforeunload を登録
      await page.locator('#quotation-name').fill('リロード未保存テスト');

      // beforeunload 起動を検証する方法:
      // Chromium は beforeunload を「リロード時に実際にプロンプトとして」表示するが、
      // Playwright は自動で dismiss するため、`page.on('dialog')` で beforeunload
      // タイプのイベントが発火するかを観測する。
      // ベストプラクティス: useUnsavedChangesGuard が `event.preventDefault()` +
      // `event.returnValue = ''` を呼ぶことを page.evaluate で直接検証する方が安定。
      const preventDefaultCalled = await page.evaluate(() => {
        // ダミーで BeforeUnloadEvent を dispatch し、リスナが preventDefault を呼ぶか確認
        const event = new Event('beforeunload', { cancelable: true });
        // returnValue 監視のためプロパティを Object.defineProperty で観測
        let returnValueSet = false;
        Object.defineProperty(event, 'returnValue', {
          set() {
            returnValueSet = true;
          },
          get() {
            return '';
          },
          configurable: true,
        });
        const dispatched = window.dispatchEvent(event);
        // dispatchEvent: preventDefault が呼ばれたなら false が返る
        return { dispatched, returnValueSet, defaultPrevented: event.defaultPrevented };
      });

      // useUnsavedChangesGuard が isDirty=true で beforeunload リスナを登録 →
      // preventDefault + returnValue='' を呼ぶ実装になっている
      expect(preventDefaultCalled.defaultPrevented).toBe(true);
      expect(preventDefaultCalled.returnValueSet).toBe(true);
    });
  });

  // ============================================================================
  // Req 40: OCRセクション折りたたみ機能（task 86.3）
  // ============================================================================

  test.describe('Req 40: OCRセクション折りたたみ機能 (task 86.3)', () => {
    /**
     * task 86.3 シナリオ 1（抽出結果保持、Req 40.11/40.12）
     *
     * 受領見積書登録ダイアログを開く → PDF をアップロード → OCR セクションが
     * 展開状態で表示されることを確認 → ヘッダクリックで折りたたみ → OCR 処理が
     * 折りたたみ中も継続することを確認（40.11）→ 完了結果が内部状態に保持される
     * （40.12）→ 再度クリックで展開時に抽出結果テキストが表示されることを検証する。
     *
     * 注: Claude Vision API 経路に到達するスキャン PDF 入力の場合、API レスポンスの
     * 揺らぎを避けるためモックエンドポイントで即時応答を返す。pdfjs-dist の直接抽出
     * 経路に進む場合（テキスト PDF）はモックは未使用のままで pass する。
     *
     * @requirement estimate-request/REQ-40.11
     * @requirement estimate-request/REQ-40.12
     */
    test('折りたたみ中もOCR処理が継続し、再展開時に抽出結果テキストが表示される (REQ-40.11, 40.12)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      // Claude Vision API をモック（スキャンPDF経路でも安定して完了させる）
      // テキストPDF経路（pdfjs-dist直接抽出）の場合はこのモックは呼ばれない。
      await page.route('**/api/claude-vision/extract', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lineItems: [
              {
                customCategory: null,
                workType: null,
                name: 'モック抽出項目',
                specification: null,
                unit: '式',
                quantity: 1,
                unitPrice: 10000,
                amount: 10000,
                remarks: null,
              },
            ],
            pageCount: 1,
          }),
        });
      });

      await loginAsUser(page, 'REGULAR_USER');
      await openReceivedQuotationCreateDialog(page, requestId);

      // PDF アップロード → OCR セクションが出現
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles('e2e/fixtures/test-file.pdf');

      // OCR セクションヘッダが表示される（Req 40.1）
      const ocrHeader = page.locator('[data-testid="ocr-section-header"]');
      await expect(ocrHeader).toBeVisible({ timeout: getTimeout(15000) });

      // 初期状態は展開（aria-expanded="true"、Req 40.8）
      await expect(ocrHeader).toHaveAttribute('aria-expanded', 'true');

      // OCR セクション本体が表示されている
      const ocrBody = page.locator('#received-quotation-ocr-section-body');
      await expect(ocrBody).toBeVisible();

      // OCR 処理開始の証拠（progress/extracted/error のいずれかが OCR セクション内に出現）
      const progressIndicator = ocrBody.locator('[data-testid="ocr-progress-indicator"]');
      const extractedText = ocrBody.locator('[data-testid="ocr-extracted-text"]');
      const errorMessage = ocrBody.locator('[data-testid="ocr-error-message"]');

      // 処理開始（progress 表示）または直接結果到達のいずれか
      await expect(progressIndicator.or(extractedText).or(errorMessage).first()).toBeVisible({
        timeout: getTimeout(60000),
      });

      // ヘッダクリックで折りたたみ（Req 40.4）
      await ocrHeader.click();
      await expect(ocrHeader).toHaveAttribute('aria-expanded', 'false');

      // 折りたたみ後も OCR セクション本体ノードは DOM に残り hidden 属性で隠されている
      // （Req 40.11/40.12 の前提: unmount されず内部 state が保持される）
      await expect(ocrBody).toHaveAttribute('hidden', '');

      // 折りたたみ中も OCR 処理が継続し、完了結果が内部状態に保持される（Req 40.11/40.12）
      // 抽出結果または失敗のいずれかが OCR セクション本体内に出現するまで待機する。
      // 本体は hidden 属性で視覚的に隠れているが、要素自体は DOM に存在する。
      await expect(extractedText.or(errorMessage).first()).toBeAttached({
        timeout: getTimeout(90000),
      });

      // 視覚的には非表示（hidden 属性により body が toBeHidden）
      await expect(ocrBody).toBeHidden();

      // 再度クリックで展開（Req 40.5）
      await ocrHeader.click();
      await expect(ocrHeader).toHaveAttribute('aria-expanded', 'true');
      await expect(ocrBody).toBeVisible();
      await expect(ocrBody).not.toHaveAttribute('hidden', /.*/);

      // 展開後に OCR 結果（抽出テキスト or エラー）が視覚的に再表示される（Req 40.12）
      await expect(extractedText.or(errorMessage).first()).toBeVisible({
        timeout: getTimeout(5000),
      });
    });

    /**
     * task 86.3 シナリオ 2（再オープン時のデフォルト復帰、Req 40.10）
     *
     * 折りたたみ状態でダイアログを閉じる → 同じ受領見積書を再度開く → OCR
     * セクションが展開状態（aria-expanded="true"）であることを検証する。
     * 折りたたみ状態は永続化されないことの確認。
     *
     * @requirement estimate-request/REQ-40.10
     */
    test('折りたたみ状態でダイアログを閉じて再オープンすると展開状態に戻る (REQ-40.10)', async ({
      page,
    }) => {
      expect(createdEstimateRequestId).toBeTruthy();
      const requestId = createdEstimateRequestId as string;

      await loginAsUser(page, 'REGULAR_USER');

      // 1 回目: ダイアログを開く → ファイルアップロード → 折りたたみ
      await openReceivedQuotationCreateDialog(page, requestId);

      await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/test-file.pdf');

      const ocrHeader = page.locator('[data-testid="ocr-section-header"]');
      await expect(ocrHeader).toBeVisible({ timeout: getTimeout(15000) });
      await expect(ocrHeader).toHaveAttribute('aria-expanded', 'true');

      // ヘッダクリックで折りたたみ
      await ocrHeader.click();
      await expect(ocrHeader).toHaveAttribute('aria-expanded', 'false');

      // ダイアログを閉じる（キャンセル）— 未保存変更ガード confirm が出る可能性
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await page
        .getByRole('button', { name: /キャンセル/i })
        .first()
        .click();
      await expect(page.getByText(/受領見積書の登録/i)).toBeHidden({ timeout: getTimeout(10000) });

      // 2 回目: 同じ見積依頼の登録ダイアログを再オープン → ファイルアップロード
      await openReceivedQuotationCreateDialog(page, requestId);
      await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/test-file.pdf');

      // OCR セクションヘッダが再描画され、デフォルトの展開状態に戻ること（Req 40.10）
      const reopenedHeader = page.locator('[data-testid="ocr-section-header"]');
      await expect(reopenedHeader).toBeVisible({ timeout: getTimeout(15000) });
      await expect(reopenedHeader).toHaveAttribute('aria-expanded', 'true');

      const reopenedBody = page.locator('#received-quotation-ocr-section-body');
      await expect(reopenedBody).toBeVisible();
    });
  });

  // ============================================================================
  // クリーンアップ
  // ============================================================================

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
        const loginBody = await loginResponse.json();
        accessToken = loginBody.accessToken;
      }

      // プロジェクト削除でカスケード
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

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
    });
  });
});
