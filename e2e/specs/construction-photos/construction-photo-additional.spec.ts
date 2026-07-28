/**
 * @fileoverview 工事写真（construction-photo）追加機能フローのE2Eテスト
 *
 * Task 13.3: E2E テスト（追加機能, Playwright）
 *
 * 設計（design.md「Testing Strategy > E2E/UI Tests」の追加機能項目、System Flows
 * ビューア・ZIP、Traceability 14〜19）で定義された追加機能の主要ユーザーフローを、
 * 実際のUI・API・DB（テスト環境: frontend 5174 / backend 3100 / postgres 5433）を通じて
 * エンドツーエンドで検証する。基本フロー（アルバムCRUD・アップロード・並替・PDF・看板配置）は
 * 既存の `construction-photo-workflow.spec.ts`（Task 9.3）が担うため、本スペックは
 * 追加機能（要件14〜19）に対象を絞る。
 *
 * 検証する主要フロー（要件対応）:
 *  1. 画像ビューア: フルスクリーン表示・ズーム・90度回転・拡大時パン・閉じる
 *     （R14.1, R14.2, R14.3, R14.4, R14.5）＋原本を必要時にのみ取得（R14.6）
 *  2. 非合成原本エンドポイント: 看板配置済み写真でもビューアが原本（/original）を返す
 *     （合成印字画像 /print-image は使わない）（R14.6, 併せて R14.1）
 *  3. ZIP一括エクスポート（全件）: 形式(PNG)・解像度(高)・看板モード(plain)選択→開始→
 *     進捗ダイアログ→ZIPダウンロード（R15.1, R15.2, R15.3, R15.4, R15.5, R15.8）
 *  4. ZIP一括エクスポート（選択）: 未選択時は選択エクスポート無効化、選択後に有効化→
 *     ダウンロード（R15.6, R15.7）
 *  5. ZIP中断: エクスポート進行中に中断→中断通知・ダウンロードなし（R15.9）
 *  6. ZIP対象0件: 空アルバムで全件エクスポートは非実行で通知（R15.11）
 *  7. アルバム編集・削除導線: 詳細画面の編集導線→編集画面遷移、削除導線→確認→削除→一覧遷移
 *     （R16.1, R16.2, R16.3, R16.4, R16.5）＋一覧の行アクション導線（R16.6）
 *  8. 権限出し分け: user は削除導線（アルバム削除・写真項目削除）が非表示、編集導線は表示
 *     （R17.2、対比として R17.1 の編集系表示も確認）
 *  9. 未保存離脱警告（アプリ内遷移）: 未保存状態でのアプリ内遷移で確認ダイアログ→とどまる／
 *     保存後は警告なし（R18.2, R18.3）
 * 10. 未保存離脱警告（ブラウザ reload/タブ閉じ = beforeunload）: 未保存状態で beforeunload の
 *     既定動作が抑止（confirm 相当の離脱警告が発火）され、保存後は解除されることを、synthetic
 *     `beforeunload` イベント dispatch＋`event.defaultPrevented` で非フレークに検証する（R18.1）。
 *     ConstructionPhotoDetailPage は task 12.5 で `useUnsavedChanges`（dirty 時に
 *     `window.addEventListener('beforeunload', e => e.preventDefault())`）へ移行済みで、
 *     site-survey の site-survey-responsive.spec.ts の確立済みパターンを流用する。
 * 11. モバイル縦積み: 狭幅で横スクロールなし・写真項目が縦積み（R19.1, R19.2, R19.4）
 *
 * 縮退した要素（理由明記）:
 *  - パンの座標厳密検証: 拡大時に画像 transform の translate 成分が変化することまでを確認し、
 *    ピクセル単位の移動量は検証しない（ビューアの算術は site-survey 基盤の単体テスト責務）。
 *  - ZIP画像の画素検証: ダウンロード発火＋ .zip 非空までを確認し、ZIP内の画像バイト比較は
 *    行わない（再エンコード・重畳はサービス単体テストの責務）。
 *  - beforeunload（R18.1）: 未保存状態で beforeunload の既定動作が抑止されること自体は、synthetic
 *    `beforeunload` イベント dispatch＋`event.defaultPrevented` の検証で担保する（フック
 *    `useUnsavedChanges` が dirty 時に `event.preventDefault()` する挙動を非フレークに観測）。
 *    縮退させるのは「OS ネイティブの離脱確認ダイアログ（Chromium が描画するモーダル）そのものの
 *    表示・ボタン操作」の検証のみで、これは Playwright での自動化が不安定なため対象外とする。
 */

import { test, expect, type Request } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

// ESモジュールでの __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');
const FIXTURE_PNG = path.join(__dirname, '../../fixtures/test-image.png');

// ============================================================================
// 共通ヘルパー（site-survey / construction-photo-workflow 規約踏襲）
// ============================================================================

/** UIでテスト用プロジェクトを作成し projectId を返す。 */
async function createProject(
  page: import('@playwright/test').Page,
  label: string
): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  const projectName = `工事写真追加E2E_${label}_${Date.now()}`;
  await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

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

  const createProjectPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/projects') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: /^作成$/i }).click();
  await createProjectPromise;

  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
  const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
  const projectId = match?.[1];
  expect(projectId).toBeTruthy();
  return projectId!;
}

/** アルバム作成画面から工事写真アルバムを作成し albumId を返す。 */
async function createAlbum(
  page: import('@playwright/test').Page,
  projectId: string,
  name: string
): Promise<string> {
  await page.goto(`/projects/${projectId}/construction-photos/new`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('アルバム名').fill(name);

  const createAlbumPromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/projects\/[0-9a-f-]+\/construction-photos$/.test(response.url()) &&
      (response.status() === 201 || response.status() === 200),
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: '作成' }).click();
  const resp = await createAlbumPromise;
  const body = (await resp.json()) as { id: string };
  expect(body.id).toBeTruthy();
  return body.id;
}

/** 詳細画面でローカル画像を1枚アップロードし、写真項目総数が expectedCount になるのを待つ。 */
async function uploadPhoto(
  page: import('@playwright/test').Page,
  file: string,
  expectedCount: number
): Promise<void> {
  const upload = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
    { timeout: getTimeout(30000) }
  );
  await page.getByTestId('file-input').setInputFiles(file);
  await upload;
  await expect(page.getByTestId('construction-photo-item')).toHaveCount(expectedCount, {
    timeout: getTimeout(20000),
  });
}

// ============================================================================
// テスト本体
// ============================================================================

test.describe('工事写真 追加機能フロー', () => {
  // DB状態を跨いで共有するためシリアル実行（global-setup で一度だけ初期化）
  test.describe.configure({ mode: 'serial' });

  // ADMIN が所有する共有プロジェクト/アルバム（ビューア・ZIP・未保存・モバイルで再利用）
  let adminProjectId: string | null = null;
  let adminAlbumId: string | null = null;
  const adminAlbumName = `追加機能_共有_${Date.now()}`;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 事前準備: ADMIN で共有プロジェクト＋アルバムを作成し、写真項目を2枚アップロードする。
   */
  test('事前準備: 共有プロジェクト/アルバムを作成し写真を2枚追加する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    adminProjectId = await createProject(page, 'admin');
    adminAlbumId = await createAlbum(page, adminProjectId, adminAlbumName);

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: adminAlbumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await uploadPhoto(page, FIXTURE_JPG, 1);
    await uploadPhoto(page, FIXTURE_PNG, 2);
  });

  /**
   * R14.1/R14.2/R14.3/R14.4/R14.5/R14.6:
   * 詳細画面のサムネクリックでフルスクリーンビューアを開き（原本を必要時に取得）、
   * ズームイン・90度回転・拡大時パン・閉じる操作を検証する。
   */
  test('ビューアでズームイン・回転・パン・クローズできる（原本は必要時に取得）', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // R14.6: サムネクリックでビューアへ遷移した「後」にのみ原本（/original）が取得される
    const originalResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        /\/api\/construction-photos\/images\/[0-9a-f-]+\/original$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await items.nth(0).getByTestId('construction-photo-image-button').click();

    // R14.1: フルスクリーンビューア（オーバーレイ）が表示される
    const overlay = page.getByTestId('construction-photo-viewer-overlay');
    await expect(overlay).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page).toHaveURL(/\/construction-photos\/[0-9a-f-]+\/photos\/[0-9a-f-]+$/);

    const resp = await originalResp;
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type'] ?? '').toMatch(/^image\//);

    // 画像が表示される
    const image = overlay.locator('img').first();
    await expect(image).toBeVisible({ timeout: getTimeout(15000) });

    // R14.2: ズームイン → 倍率バッジが 100% から増加する
    const zoomBadge = page.getByTestId('zoom-badge');
    await expect(zoomBadge).toHaveText('100%');
    await page.getByRole('button', { name: 'ズームイン' }).click();
    await page.getByRole('button', { name: 'ズームイン' }).click();
    await expect(zoomBadge).not.toHaveText('100%', { timeout: getTimeout(10000) });

    // R14.4: 拡大状態でステージをドラッグ → 画像 transform の translate 成分が変化する（パン）
    const stage = page.getByTestId('construction-photo-viewer-stage');
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    const transformBefore = await image.evaluate((el) => (el as HTMLElement).style.transform);
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy - 60, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => image.evaluate((el) => (el as HTMLElement).style.transform), {
        timeout: getTimeout(10000),
      })
      .not.toBe(transformBefore);

    // R14.3: 右回転 → 回転表示が 0° から 90° になる
    const rotation = page.getByTestId('rotation-display');
    await expect(rotation).toHaveText('0°');
    await page.getByRole('button', { name: '右に回転' }).click();
    await expect(rotation).toHaveText('90°', { timeout: getTimeout(10000) });

    // R14.5: 閉じる → ビューア終了・詳細画面へ戻る
    await page.getByRole('button', { name: '閉じる' }).click();
    await expect(overlay).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${adminAlbumId}$`), {
      timeout: getTimeout(10000),
    });
  });

  /**
   * R14.6（＋R14.1）非合成原本エンドポイントの確認:
   * 写真項目に工事看板を配置・保存した「後」でも、ビューアが取得する原本エンドポイント
   * （/original）が 200 で画像を返し、合成印字画像（/print-image）は要求しないことを検証する。
   * （ビューアは常に非合成原本を表示するため、看板配置の有無で取得元は変わらない）
   */
  test('看板配置済みの写真項目でもビューアは原本(/original)を返す（/print-image は使わない）', async ({
    page,
  }) => {
    expect(adminProjectId).toBeTruthy();
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    // 1) 配置用の工事看板を登録
    const signboardName = `追加E2E看板_${Date.now()}`;
    await page.goto(`/projects/${adminProjectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('追加E2E看板現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: signboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 2) 詳細画面で先頭写真項目に看板を配置して保存
    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    await items
      .nth(0)
      .getByRole('button', { name: /看板を(配置|変更)/ })
      .click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await assignDialog.locator('#signboard-assign-select').selectOption({ label: signboardName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });

    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 3) 看板割当が保持され、ビューアを開くと /original が返り /print-image は要求されない
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items.nth(0).getByTestId('signboard-indicator')).toContainText('看板あり', {
      timeout: getTimeout(15000),
    });

    let printImageRequested = false;
    const onReq = (req: Request) => {
      if (/\/api\/construction-photos\/images\/[0-9a-f-]+\/print-image$/.test(req.url())) {
        printImageRequested = true;
      }
    };
    page.on('request', onReq);

    const originalResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        /\/api\/construction-photos\/images\/[0-9a-f-]+\/original$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await items.nth(0).getByTestId('construction-photo-image-button').click();
    const overlay = page.getByTestId('construction-photo-viewer-overlay');
    await expect(overlay).toBeVisible({ timeout: getTimeout(15000) });

    const resp = await originalResp;
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type'] ?? '').toMatch(/^image\//);
    await expect(overlay.locator('img').first()).toBeVisible({ timeout: getTimeout(15000) });

    // 非合成原本の確認: ビューアは合成印字画像を取得しない
    expect(printImageRequested).toBe(false);
    page.off('request', onReq);
  });

  /**
   * R15.1/R15.2/R15.3/R15.4/R15.5/R15.8:
   * 全件エクスポートで形式(PNG)・解像度(高)・看板モード(plain)を選択→開始→進捗ダイアログ→
   * ZIPダウンロードを検証する。
   */
  test('ZIP全件エクスポート: 形式/解像度/看板モードを選択して進捗表示のうえダウンロードされる', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });

    await page.getByRole('button', { name: '全件エクスポート' }).click();
    const dialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    // R15.2/R15.3/R15.4: 形式・解像度・看板モードを選択
    await dialog.getByRole('radio', { name: 'PNG' }).check();
    await dialog.getByRole('radio', { name: '高' }).check();
    await dialog.getByRole('radio', { name: '看板を重畳しない加工画像' }).check();
    await expect(dialog.getByRole('radio', { name: 'PNG' })).toBeChecked();

    // R15.1/R15.5/R15.8: 開始→進捗ダイアログ→ZIPダウンロード
    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await dialog.getByRole('button', { name: '開始' }).click();

    const progress = page.getByRole('dialog', { name: /一括エクスポート/ });
    await expect(progress).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.getByRole('progressbar', { name: '一括エクスポート進捗' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    expect(fs.statSync(savedPath).size).toBeGreaterThan(0);
  });

  /**
   * R15.6/R15.7:
   * 選択エクスポートは未選択時に無効化され、写真項目を選択すると有効化されてダウンロードできる。
   */
  test('ZIP選択エクスポート: 未選択で無効、選択後に有効化されてダウンロードされる', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // R15.7: 未選択時は選択エクスポートが無効
    const selectedExportButton = page.getByRole('button', { name: /選択エクスポート/ });
    await expect(selectedExportButton).toBeDisabled();

    // 1件選択 → 有効化（R15.6）
    await items.nth(0).getByLabel('エクスポート対象に含める').check();
    await expect(selectedExportButton).toBeEnabled({ timeout: getTimeout(10000) });

    await selectedExportButton.click();
    const dialog = page.getByRole('dialog', { name: /選択画像エクスポート/ });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await dialog.getByRole('button', { name: '開始' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  /**
   * R15.9:
   * エクスポート進行中に中断すると、処理が中断され中断通知が表示されダウンロードは発生しない。
   * 原本取得（/original）をネットワーク遅延させ、中断操作の時間窓を決定的に確保する。
   */
  test('ZIPエクスポートを中断すると中断通知が表示されダウンロードされない', async ({ page }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });

    // 原本取得を遅延させ、中断ボタン押下の時間窓を確保する（plain モードは /original を取得）
    await page.route('**/api/construction-photos/images/*/original', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });

    let downloadHappened = false;
    page.on('download', () => {
      downloadHappened = true;
    });

    await page.getByRole('button', { name: '全件エクスポート' }).click();
    const dialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('radio', { name: '看板を重畳しない加工画像' }).check();
    await dialog.getByRole('button', { name: '開始' }).click();

    // 進行中に中断
    const cancelButton = page.getByRole('button', { name: '中断' });
    await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
    await cancelButton.click();

    // 中断通知（ダウンロードは発生しない）
    await expect(
      page.getByRole('alert').filter({ hasText: 'エクスポートを中断しました' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(downloadHappened).toBe(false);

    await page.unroute('**/api/construction-photos/images/*/original');
  });

  /**
   * R15.11:
   * 写真項目が0件のアルバムで全件エクスポートを実行すると、非実行で対象が無い旨を通知する。
   */
  test('ZIP対象0件のアルバムではエクスポートが非実行で通知される', async ({ page }) => {
    expect(adminProjectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    const emptyAlbumId = await createAlbum(page, adminProjectId!, `追加機能_空_${Date.now()}`);
    await page.goto(`/construction-photos/${emptyAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('写真項目がありません')).toBeVisible({
      timeout: getTimeout(15000),
    });

    let downloadHappened = false;
    page.on('download', () => {
      downloadHappened = true;
    });

    await page.getByRole('button', { name: '全件エクスポート' }).click();

    // 対象0件の通知（親のnotice）と、ダイアログの開始ボタン非活性
    await expect(
      page.getByRole('alert').filter({ hasText: 'エクスポート対象の写真項目がありません' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    const dialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(dialog.getByRole('button', { name: '開始' })).toBeDisabled();
    expect(downloadHappened).toBe(false);
  });

  /**
   * R16.1/R16.2/R16.3/R16.4/R16.5（＋R16.6）:
   * 詳細画面のアルバム編集導線→編集画面遷移、削除導線→確認→削除→一覧遷移を検証する。
   * 一覧の行アクション（編集/削除導線）の存在も併せて確認する。
   */
  test('アルバム編集・削除導線: 編集画面遷移／削除確認→削除→一覧遷移、一覧に行アクション導線', async ({
    page,
  }) => {
    expect(adminProjectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    const disposableName = `追加機能_削除対象_${Date.now()}`;
    const disposableAlbumId = await createAlbum(page, adminProjectId!, disposableName);

    await page.goto(`/construction-photos/${disposableAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: disposableName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // R16.1/R16.2: 編集導線→編集画面へ遷移
    await page.getByRole('button', { name: '編集' }).click();
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${disposableAlbumId}/edit$`), {
      timeout: getTimeout(10000),
    });

    // 詳細へ戻る
    await page.goto(`/construction-photos/${disposableAlbumId}`);
    await page.waitForLoadState('networkidle');

    // R16.3/R16.4: 削除導線→確認ダイアログ
    await page.getByRole('button', { name: '削除' }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(deleteDialog.getByText('アルバムの削除')).toBeVisible();

    // R16.5: 承認→削除→一覧へ遷移
    const deleteResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        /\/api\/construction-photos\/[0-9a-f-]+$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await deleteDialog.getByRole('button', { name: '削除', exact: true }).click();
    await deleteResp;
    await expect(page).toHaveURL(new RegExp(`/projects/${adminProjectId}/construction-photos$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByText(disposableName)).toHaveCount(0, { timeout: getTimeout(15000) });

    // R16.6: 一覧の行アクション導線（共有アルバムの行に編集/削除ボタンが存在する）
    const sharedRow = page.getByRole('row').filter({ hasText: adminAlbumName });
    await expect(sharedRow).toBeVisible({ timeout: getTimeout(15000) });
    await expect(sharedRow.getByRole('button', { name: `${adminAlbumName}を編集` })).toBeVisible();
    await expect(sharedRow.getByRole('button', { name: `${adminAlbumName}を削除` })).toBeVisible();
  });

  /**
   * R17.2（＋R17.1）権限出し分け:
   * user は削除導線（アルバム削除・写真項目削除）が非表示、編集導線（アルバム編集・アップローダ）は表示。
   * user 自身が所有するプロジェクト/アルバムで検証する（プロジェクトアクセスは所有者/管理者に限定）。
   */
  test('権限出し分け: user は削除導線が非表示・編集導線は表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const userProjectId = await createProject(page, 'user');
    const userAlbumName = `追加機能_user_${Date.now()}`;
    const userAlbumId = await createAlbum(page, userProjectId, userAlbumName);

    // 写真項目を1枚追加（写真項目削除導線の非表示を確認するため）
    await page.goto(`/construction-photos/${userAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: userAlbumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await uploadPhoto(page, FIXTURE_JPG, 1);

    // R17.1: 編集導線（アルバム編集ボタン・アップローダ）は表示される
    await expect(page.getByRole('button', { name: '編集' })).toBeVisible();
    await expect(page.getByTestId('photo-uploader')).toBeVisible();

    // R17.2: 削除導線（アルバム削除ボタン・写真項目削除ボタン）は非表示
    await expect(page.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /写真項目を削除/ })).toHaveCount(0);

    // R17.2（一覧側）: 行の削除導線は非表示、編集導線は表示
    await page.goto(`/projects/${userProjectId}/construction-photos`);
    await page.waitForLoadState('networkidle');
    const userRow = page.getByRole('row').filter({ hasText: userAlbumName });
    await expect(userRow).toBeVisible({ timeout: getTimeout(15000) });
    await expect(userRow.getByRole('button', { name: `${userAlbumName}を編集` })).toBeVisible();
    await expect(userRow.getByRole('button', { name: `${userAlbumName}を削除` })).toHaveCount(0);
  });

  /**
   * R18.2/R18.3 未保存離脱警告:
   * 未保存状態でアプリ内遷移を試みると確認ダイアログが表示され「とどまる」で残留する。
   * 保存後は未保存状態が解消され、以降の遷移では警告が出ない。
   * （R18.1 のブラウザreload/close は beforeunload 実装済みだが Playwright での検証はフレークのため
   *  同一の未保存状態を in-app 遷移ガードで観測する）
   */
  test('未保存離脱警告: 変更ありのアプリ内遷移で確認→とどまる、保存後は警告なし', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 未保存の変更を発生させる（印刷対象チェック）
    await items.nth(1).getByLabel('印刷対象に含める').check();
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // R18.2: ブレッドクラムの一覧リンクでアプリ内遷移 → 確認ダイアログ（遷移はブロックされる）
    await page.getByRole('link', { name: '工事写真一覧' }).click();
    const unsavedDialog = page.getByRole('dialog');
    await expect(unsavedDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(
      unsavedDialog.getByText('変更が保存されていません。ページを離れますか？')
    ).toBeVisible();

    // とどまる → 詳細画面に残留
    await unsavedDialog.getByRole('button', { name: 'このページにとどまる' }).click();
    await expect(unsavedDialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${adminAlbumId}$`));

    // R18.3: 保存で未保存状態を解消
    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 保存後は警告なしでアプリ内遷移できる
    await page.getByRole('link', { name: '工事写真一覧' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${adminProjectId}/construction-photos$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('heading', { name: '工事写真一覧' })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * R18.1 未保存離脱警告（ブラウザ reload/タブ閉じ = beforeunload）:
   * 未保存状態のときに beforeunload の既定動作が抑止（＝離脱警告が発火）され、保存で解除される
   * ことを検証する。ConstructionPhotoDetailPage は task 12.5 で `useUnsavedChanges` に移行済みで、
   * 同フックは dirty のとき `window` の `beforeunload` で `event.preventDefault()` を呼ぶ。
   * ネイティブ離脱ダイアログの自動化はフレークのため、site-survey-responsive.spec.ts の確立済み
   * パターンに倣い、synthetic な `beforeunload` イベントを dispatch して `event.defaultPrevented`
   * を観測する（非フレーク）。OS ネイティブモーダルの描画・操作自体は対象外（縮退の趣旨を限定）。
   */
  test('未保存離脱警告(beforeunload): 変更ありで離脱警告が発火し、保存後は解除される', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 編集前（未保存変更なし）: beforeunload の既定動作は抑止されない（離脱警告なし）
    const warnBeforeEdit = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnBeforeEdit).toBe(false);

    // 未保存変更を発生させる（コメント入力＋blurで即時に未保存状態を確定）。
    // 直前のシリアルテストの状態に依存しないよう一意のコメントで確実に変更を生じさせる。
    const uniqueComment = `beforeunload検証_${Date.now()}`;
    const textarea = items.nth(0).getByPlaceholder('コメントを入力...');
    await textarea.click();
    await textarea.fill(uniqueComment);
    await textarea.blur();
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // R18.1: 未保存変更がある間は beforeunload の既定動作が抑止される（＝離脱警告が発火）
    const warnWhileDirty = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnWhileDirty).toBe(true);

    // 一括保存（PATCH /api/construction-photos/images/batch）で未保存状態を解消
    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // R18.1: 保存後は beforeunload の既定動作抑止が解除される（離脱警告なし）
    const warnAfterSave = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnAfterSave).toBe(false);
  });

  /**
   * R19.1/R19.2（＋R19.4）モバイル縦積み:
   * 狭幅（375px）で詳細画面を表示し、横スクロールが発生せず、写真項目が縦積み（column）で
   * 配置されることを検証する。
   */
  test('モバイル狭幅で横スクロールなし・写真項目が縦積みで表示される', async ({ page }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items.first()).toBeVisible({ timeout: getTimeout(20000) });

    // 測定ゲート（フレーク是正）: `useMediaQuery` は初期レンダリングで isMobile=false（デスクトップ、
    // 写真列 320px 固定）になり得て、effect 後に true（モバイル、縦積み・可変幅）へ確定する。
    // `networkidle` 到達時に稀にこの一過性デスクトップフラッシュを測ると overflow≈25px（デスクトップ
    // 幅相当の一過性はみ出し）を拾ってフレークする。そのため overflow を測る「前」に、写真項目が
    // 縦積み（flex-direction: column = isMobile 分岐＝containerMobile/imageSectionMobile を含む
    // モバイルスタイル一式が適用済み）に確定するまで決定的に待機し、レイアウト確定後の steady-state を
    // 測定する（順序: 「column適用待ち」→「overflow測定」）。閾値（≤1）は据え置き。
    await expect
      .poll(
        async () =>
          items.first().evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
        { timeout: getTimeout(15000) }
      )
      .toBe('column');

    // R19.1/R19.4: 工事写真詳細画面のレイアウトで横スクロールが発生しない（許容誤差1px）。
    // 判定対象は工事写真機能が描画する詳細コンテナ（写真項目を含む <main>）に限定する。
    // ページ全体（document）はアプリ共通ヘッダ（app-header-nav 等の全画面共通クロム。狭幅で
    // 水平にはみ出すが工事写真機能=Req14〜19 の範囲外）の影響を受けるため、詳細画面の
    // レイアウト要件（R19.1）は当該機能のコンテナ基準で検証する。
    const detailOverflow = await page.evaluate(() => {
      const item = document.querySelector('[data-testid="construction-photo-item"]');
      const main = item ? item.closest('main') : document.querySelector('main');
      return main ? main.scrollWidth - main.clientWidth : -1;
    });
    expect(detailOverflow).toBeGreaterThanOrEqual(0);
    expect(detailOverflow).toBeLessThanOrEqual(1);

    // R19.2: 写真項目が縦積み（flex-direction: column）— 上の測定ゲートで確定済みを明示的に再確認
    const flexDirection = await items
      .first()
      .evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection);
    expect(flexDirection).toBe('column');
  });
});
