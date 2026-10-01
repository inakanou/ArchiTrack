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
 *  8b. 権限出し分け（編集権限なし）: construction_photo:update を持たないロールでは、写真項目の
 *     追加・コメント編集・並び替え・印刷対象変更・看板配置・保存・写真項目削除の操作手段が
 *     表示されず、閲覧の要素は表示される。対照として admin では同じ操作手段が表示される（R17.1）
 *  9. 未保存離脱警告（アプリ内遷移）: 未保存状態でのアプリ内遷移で確認ダイアログ→とどまる／
 *     保存後は警告なし（R18.2, R18.3）
 * 10. 未保存離脱警告（ブラウザ reload/タブ閉じ = beforeunload）: 未保存状態で beforeunload の
 *     既定動作が抑止（confirm 相当の離脱警告が発火）され、保存後は解除されることを、synthetic
 *     `beforeunload` イベント dispatch＋`event.defaultPrevented` で非フレークに検証する（R18.1）。
 *     ConstructionPhotoDetailPage は task 12.5 で `useUnsavedChanges`（dirty 時に
 *     `window.addEventListener('beforeunload', e => e.preventDefault())`）へ移行済みで、
 *     site-survey の site-survey-responsive.spec.ts の確立済みパターンを流用する。
 * 11. モバイル縦積み: 狭幅で横スクロールなし・写真項目が縦積み（R19.1, R19.2, R19.4）
 * 12. モバイル幅のブレッドクラム: 長いプロジェクト名・アルバム名でもブレッドクラムが水平に
 *     はみ出さない（折り返して収まる／折り返せない語は自身の領域内に収まる）（R19.4）
 * 13. モバイル幅の見出し: 区切りの無い英数字の長いアルバム名・メモでも、詳細画面の見出し領域が
 *     水平にはみ出さない（R19.1）
 * 14. モバイル幅のファイル名: 区切りの無い現実的な長さのファイル名でも、写真項目の見出しと削除確認
 *     ダイアログの本文が水平にはみ出さない（R19.1）
 * 15. モバイル幅の看板配置ダイアログ: 区切りの無い英数字の長い工事件名でも、操作列の「保存」が
 *     画面外へ押し出されず、案内文が潰れず、件名のバッジが画面内に収まる（R19.1）
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
import { loginAsUser, loginWithCredentials } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { hashPassword } from '../../helpers/test-users';
import { getPrismaClient } from '../../fixtures/database';

// ESモジュールでの __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');
const FIXTURE_PNG = path.join(__dirname, '../../fixtures/test-image.png');

// ============================================================================
// 共通ヘルパー（site-survey / construction-photo-workflow 規約踏襲）
// ============================================================================

/** UIでテスト用プロジェクトを作成し projectId を返す。name を渡すとその名前で作成する。 */
async function createProject(
  page: import('@playwright/test').Page,
  label: string,
  name?: string
): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  const projectName = name ?? `工事写真追加E2E_${label}_${Date.now()}`;
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
   *
   * @requirement construction-photo/REQ-14.1
   * @requirement construction-photo/REQ-14.2
   * @requirement construction-photo/REQ-14.3
   * @requirement construction-photo/REQ-14.4
   * @requirement construction-photo/REQ-14.5
   * @requirement construction-photo/REQ-14.6
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
   *
   * @requirement construction-photo/REQ-15.1
   * @requirement construction-photo/REQ-15.2
   * @requirement construction-photo/REQ-15.3
   * @requirement construction-photo/REQ-15.4
   * @requirement construction-photo/REQ-15.5
   * @requirement construction-photo/REQ-15.8
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
   *
   * @requirement construction-photo/REQ-15.6
   * @requirement construction-photo/REQ-15.7
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
   *
   * @requirement construction-photo/REQ-15.9
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
   *
   * @requirement construction-photo/REQ-15.11
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
   *
   * @requirement construction-photo/REQ-16.1
   * @requirement construction-photo/REQ-16.2
   * @requirement construction-photo/REQ-16.3
   * @requirement construction-photo/REQ-16.4
   * @requirement construction-photo/REQ-16.5
   * @requirement construction-photo/REQ-16.6
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
   * R17.2 権限出し分け:
   * user は削除導線（アルバム削除・写真項目削除）が非表示、編集導線（アルバム編集・アップローダ）は表示。
   * user 自身が所有するプロジェクト/アルバムで検証する（プロジェクトアクセスは所有者/管理者に限定）。
   *
   * @requirement construction-photo/REQ-17.2
   *
   * タスク 115.188 の是正: construction-photo の受入基準17.1 を名乗る被覆印を取り下げた。
   * 原文17.1 は「ユーザーが**編集権限を持たない**間、編集の操作手段を**表示しない**」だが、
   * 本検証は編集権限を持つ `REGULAR_USER` でログインし、編集導線が**表示される**ことを
   * 主張している。原文の前件（編集権限を持たない）に一度も入らず、結論も逆である。
   * 要件17 に「編集権限を持つとき編集導線を表示する」を述べる条文は無いため付け替え先も無い。
   * 17.1 は本区間が唯一の被覆源だったため、未被覆として露出する。
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
   * R17.1 権限出し分け（編集権限なし）:
   * `construction_photo:update` を持たないロールで工事写真の詳細画面を開くと、要件17.1 が列挙する
   * 操作手段（写真項目の追加・コメント編集・並び替え・印刷対象変更・看板配置・保存・写真項目削除）が
   * 表示されない。閲覧の要素（アルバム名・写真項目・ファイル名・拡大表示の入口）は表示される。
   *
   * @requirement construction-photo/REQ-17.1
   *
   * 前件「編集権限を持たない」に入るロールは既存のシードに無い（admin は `*:*`、user は
   * `construction_photo:update` を持つ）。そこで本テスト専用の非システムロールを作り、閲覧に
   * 要る権限に `construction_photo:delete` を加え、`construction_photo:update` だけを与えない。
   * 削除権限を与えるのは、写真項目削除の不在を R17.2（削除権限なしで削除ハンドラを渡さない）では
   * なく R17.1（編集権限なしの読み取り専用）に帰属させるためである。削除権限を欠くロールでは
   * 削除ハンドラが渡らないため、読み取り専用の抑止が壊れても削除ボタンは出ず、主張が検出力を
   * 持たない。削除権限で現れるアルバム削除の導線は 17.1 の列挙に無いため主張しない。
   * user ロールの権限を書き換えないのは、永続テストDBに権限が固着した
   * 前例（seedRolePermissions の notIn による是正で解消）を再び作らないためである。非システム
   * ロールは cleanDatabase が消すうえ、本テストの finally でも消す。
   * 前件が実際の権限で成り立つことは、詳細画面の読み込みで画面自身が受け取った
   * GET /api/v1/auth/me の permissions を集合として照合して主張する。
   *
   * 偽の緑（画面が描かれていないだけ）を排すため、同じアルバムを admin で開いた対照で、同じ
   * 操作手段がすべて表示される（または操作可能である）ことを先に主張する。
   * コメント欄と印刷対象のチェックは、設計（R17.3 の読み取り専用表示）に従い欄そのものは
   * 表示したまま操作を抑止する実装のため、「操作手段が無い」を編集不能・無効として主張する。
   *
   * 検出力の実測（2026-10-01、タスク 19.1）: `ConstructionPhotoDetailPage.tsx` の `canEdit` を
   * true 固定に変異させた本番ビルドで本テストを実行すると、`photo-uploader` の toHaveCount(0) で
   * 落ちた（Expected 0 / Received 1、1 failed）。変異を戻して作り直すと 1 passed に戻った。
   * この実測は閲覧ロールへ `construction_photo:delete` を加える前の版で行った。
   * 追記（2026-10-01、タスク 19.1 のレビュー差し戻し）: 削除権限を欠く版では、`PhotoItemPanel.tsx` で
   * readOnly でも削除ハンドラがあれば削除の行を出す変異（看板配置は readOnly で隠したまま）を当てた
   * 本番ビルドでも本テストは 1 passed で生き残った（レビュアーの実測）。閲覧ロールへ削除権限を加えた
   * 現行の版で同じ変異を当てて実行すると、`写真項目を削除:` の toHaveCount(0) で落ちた
   * （Expected 0 / Received 1、1 failed）。変異を戻して作り直すと 1 passed に戻った。
   */
  test('権限出し分け: 編集権限の無いロールでは編集系の操作手段が表示されない', async ({ page }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `追加機能_閲覧のみ_${stamp}`;
    const viewerEmail = `cp-viewer-${stamp}@example.com`;
    const viewerPassword = 'ViewerPass123!';
    const viewerRoleName = `e2e_construction_photo_viewer_${stamp}`;
    const viewerPermissionKeys = [
      'construction_photo:read',
      'construction_photo:delete',
      'construction_signboard:read',
      'project:read',
    ];

    /** 詳細画面の読み込みで画面が受け取る /api/v1/auth/me の permissions を得る。 */
    const openDetailAndReadPermissions = async (albumId: string): Promise<string[]> => {
      const meResponse = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname === '/api/v1/auth/me' &&
          r.status() === 200,
        { timeout: getTimeout(30000) }
      );
      await page.goto(`/construction-photos/${albumId}`);
      const body = (await (await meResponse).json()) as { permissions?: string[] };
      await page.waitForLoadState('networkidle');
      expect(Array.isArray(body.permissions)).toBe(true);
      return body.permissions ?? [];
    };

    // 17.1 が列挙する操作手段（詳細画面）
    const photoItems = page.getByTestId('construction-photo-item');
    const uploader = page.getByTestId('photo-uploader');
    const fileInput = page.getByTestId('file-input');
    const commentBox = photoItems.first().getByRole('textbox', { name: 'コメント' });
    const dragHandle = page.getByTestId('construction-photo-drag-handle');
    const orderButtons = page.getByTestId('order-buttons');
    const includeInReport = photoItems.first().getByRole('checkbox', { name: '印刷対象に含める' });
    const assignSignboard = page.getByRole('button', { name: /^看板を(配置|変更): / });
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    const deletePhotoItem = page.getByRole('button', { name: /^写真項目を削除: / });

    const cleanupErrors: string[] = [];
    const runCleanup = async (step: () => Promise<unknown>): Promise<void> => {
      try {
        await step();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    };

    let viewerUserId: string | null = null;
    let viewerRoleId: string | null = null;
    let projectId: string | null = null;
    try {
      // 準備: admin でプロジェクト・アルバムを作り、写真項目を1枚追加する
      await loginAsUser(page, 'ADMIN_USER');
      projectId = await createProject(page, 'viewer');
      const albumId = await createAlbum(page, projectId, albumName);

      // 対照: admin（編集権限あり）では同じ操作手段が表示される
      const adminPermissions = await openDetailAndReadPermissions(albumId);
      expect(adminPermissions).toContain('*:*');
      await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await uploadPhoto(page, FIXTURE_JPG, 1);
      await expect(uploader).toBeVisible();
      await expect(fileInput.first()).toBeAttached();
      await expect(commentBox).toBeEditable();
      await expect(dragHandle).toBeVisible();
      await expect(orderButtons).toBeVisible();
      await expect(includeInReport).toBeEnabled();
      await expect(assignSignboard).toBeVisible();
      await expect(saveButton).toBeVisible();
      await expect(deletePhotoItem).toBeVisible();

      // 編集権限を持たない閲覧専用ロールと利用者を用意し、プロジェクトの工事担当者に据える
      // （プロジェクトへのアクセスは作成者・営業担当・工事担当・admin に限られる）
      const permissions = await prisma.permission.findMany({
        where: {
          OR: viewerPermissionKeys.map((key) => {
            const [resource, action] = key.split(':');
            return { resource, action };
          }),
        },
      });
      expect(permissions.map((p) => `${p.resource}:${p.action}`).sort()).toEqual(
        [...viewerPermissionKeys].sort()
      );
      const viewerRole = await prisma.role.create({
        data: {
          name: viewerRoleName,
          description: 'E2E: 工事写真の閲覧と削除、編集なし（construction-photo/REQ-17.1）',
          isSystem: false,
        },
      });
      viewerRoleId = viewerRole.id;
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: viewerRole.id, permissionId: p.id })),
      });
      const viewer = await prisma.user.create({
        data: {
          email: viewerEmail,
          displayName: 'E2E 閲覧専用',
          passwordHash: await hashPassword(viewerPassword),
        },
      });
      viewerUserId = viewer.id;
      await prisma.userRole.create({ data: { userId: viewer.id, roleId: viewerRole.id } });
      await prisma.project.update({
        where: { id: projectId },
        data: { constructionPersonId: viewer.id },
      });

      // 閲覧専用の利用者へ切り替える
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await loginWithCredentials(page, viewerEmail, viewerPassword);

      // 前件: 画面が受け取った権限は閲覧に要る権限そのもので、編集権限を含まない
      const viewerPermissions = await openDetailAndReadPermissions(albumId);
      expect([...viewerPermissions].sort()).toEqual([...viewerPermissionKeys].sort());

      // 閲覧の要素は表示される（画面が描かれていることの確認）
      await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(photoItems).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(
        photoItems.first().getByRole('button', { name: /^画像を拡大表示: / })
      ).toBeVisible();
      await expect(photoItems.first().getByRole('heading', { level: 3 })).toBeVisible();
      await expect(commentBox).toBeVisible();

      // R17.1: 操作手段は表示されない（欄を残す2つは操作できない）
      await expect(uploader).toHaveCount(0);
      await expect(fileInput).toHaveCount(0);
      await expect(commentBox).not.toBeEditable();
      await expect(dragHandle).toHaveCount(0);
      await expect(orderButtons).toHaveCount(0);
      await expect(includeInReport).toBeDisabled();
      await expect(assignSignboard).toHaveCount(0);
      await expect(saveButton).toHaveCount(0);
      await expect(deletePhotoItem).toHaveCount(0);
    } finally {
      // 後始末の失敗が本体の失敗を上書きしないよう、各段を個別に捕まえて記録する
      if (projectId && viewerUserId) {
        const id = projectId;
        await runCleanup(() =>
          prisma.project.update({ where: { id }, data: { constructionPersonId: null } })
        );
      }
      if (viewerUserId) {
        const id = viewerUserId;
        await runCleanup(() => prisma.user.delete({ where: { id } }));
      }
      if (viewerRoleId) {
        const roleId = viewerRoleId;
        await runCleanup(() => prisma.rolePermission.deleteMany({ where: { roleId } }));
        await runCleanup(() => prisma.role.delete({ where: { id: roleId } }));
      }
    }
    // 本体が成功したときだけ到達する。後始末の失敗はここで失敗として表に出す
    expect(cleanupErrors).toEqual([]);
  });

  /**
   * R18.2/R18.3 未保存離脱警告:
   * 未保存状態でアプリ内遷移を試みると確認ダイアログが表示され「とどまる」で残留する。
   * 保存後は未保存状態が解消され、以降の遷移では警告が出ない。
   * （R18.1 のブラウザreload/close は beforeunload 実装済みだが Playwright での検証はフレークのため
   *  同一の未保存状態を in-app 遷移ガードで観測する）
   *
   * @requirement construction-photo/REQ-18.2
   * @requirement construction-photo/REQ-18.3
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
   *
   * R7.1: コメント入力→blurで当該写真項目のコメントが未保存状態として保持される（dirty表示）。
   *
   * @requirement construction-photo/REQ-18.1
   * @requirement construction-photo/REQ-7.1
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
   *
   * @requirement construction-photo/REQ-19.1
   * @requirement construction-photo/REQ-19.2
   * @requirement construction-photo/REQ-19.1
   *
   * タスク 115.188 の是正: 従前は REQ-19.4 を名乗っていたが、受入基準19.4 の原文は「The 工事写真機能
   * shall ブレッドクラムをモバイルで水平オーバーフローさせず表示する」である。本区間の表題・本文が述べる内容に対応するのは受入基準19.1（「While
   * 画面幅がモバイル相当である, the 工事写真機能 shall 工事写真詳細画面を横スクロールが発生しないレイアウトで表示する」
   * ）である。
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

  /**
   * R19.4 モバイル幅のブレッドクラム:
   * 375 幅で工事写真の詳細画面を開き、長いプロジェクト名・アルバム名を載せたブレッドクラムが
   * 水平にはみ出さないことを検証する。対象画面は Requirement 19（工事写真詳細画面の
   * レスポンシブ対応）の所管である詳細画面とする。
   *
   * @requirement construction-photo/REQ-19.4
   *
   * はみ出しうる条件を二つ測り、どちらでも同じ主張を課す。主張は、ブレッドクラム（nav）・
   * そのリスト（ol）・詳細画面がブレッドクラムを包む領域のいずれも scrollWidth が clientWidth を
   * 超えないこと（許容誤差1px）、ブレッドクラムが画面幅の内側にあること、詳細画面のコンテナ
   * （<main>）に水平のはみ出しが生じないことである。
   *  (1) 日本語の長い名前（区切りの無い数字の語を末尾に含む）: 前提として、最長の項目名の一行の
   *      自然幅がブレッドクラムの幅を超えること（折り返しが要る長さであること）と、ブレッドクラムが
   *      実際に複数行へ折り返されていることを主張する。
   *  (2) 区切りの無い英数字の長い一語のプロジェクト名（プロジェクト名は詳細画面ではブレッドクラムに
   *      しか現れないため、見出し等の他要素のはみ出しが混ざらない）: 前提として、その語の一行の
   *      自然幅がブレッドクラムの領域の幅を超えることを主張する。
   * 自然幅は画面の計算済みフォントで canvas の measureText により測る（折り返しの有無に依らない）。
   *
   * 是正の経緯（2026-10-01、タスク 19.2）: 本テストを書いた時点の実装（ブレッドクラムを包む領域に
   * overflow-x:auto だけを与える形）では (1) が赤だった。共通 Breadcrumb の項目は折り返さない flex
   * 行に並び、各項目の最小幅は区切りの無い語（末尾の「_」＋13桁の数字）の幅になる。その和が
   * 狭幅を超え、ブレッドクラム自身が水平にはみ出していた（nav の scrollWidth 389 / clientWidth 319）。
   * はみ出しは包む領域の水平スクロールへ収まり <main> へは及ばないが、ブレッドクラム自体は
   * 水平にはみ出していた。是正は `ConstructionPhotoDetailPage.tsx` の `breadcrumbWrapper` に
   * overflowWrap:anywhere を足し、項目へ継承させて語の中にも折り返し位置を与えたことである。
   *
   * 文書全体（documentElement）の scrollWidth は測らない。アプリ共通ヘッダ（全画面共通の
   * クロムで工事写真機能の範囲外）が 375 幅で水平にはみ出すため、本機能の判定に使えない
   * （上の「モバイル狭幅で横スクロールなし」の注記と同じ理由。2026-10-01 の実測で
   * documentElement は scrollWidth 400 / clientWidth 375）。
   *
   * 測定の前に、詳細画面のモバイル分岐（`containerMobile` の maxWidth:100%）が適用されるまで
   * 待つ。`useMediaQuery` は初期描画でデスクトップ側になり得るためである。
   */
  test('モバイル幅で長いプロジェクト名・アルバム名のブレッドクラムが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const japaneseProjectName = `東京都千代田区丸の内二丁目再開発計画に伴う超高層複合ビル新築工事および周辺道路整備工事_${stamp}`;
    const albumName = `外構工事における基礎配筋検査および型枠設置状況の記録写真アルバム第三工区_${stamp}`;
    const unbreakableProjectName = `MarunouchiRedevelopmentSkyscraperConstructionProject${stamp}`;
    const prisma = getPrismaClient();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'breadcrumb', japaneseProjectName);
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    const breadcrumb = page.getByRole('navigation', { name: 'パンくずナビゲーション' });

    /** 詳細画面を開き、モバイル分岐の適用を待ってからブレッドクラムを測る。 */
    const openAndMeasure = async (projectName: string) => {
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(breadcrumb).toBeVisible();
      await expect(breadcrumb).toContainText(projectName);
      await expect(breadcrumb).toContainText(albumName);
      await expect
        .poll(
          async () =>
            breadcrumb.evaluate((nav) => {
              const main = nav.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { timeout: getTimeout(15000) }
        )
        .toBe('100%');

      return breadcrumb.evaluate((nav) => {
        const area = nav.parentElement as HTMLElement;
        const list = nav.querySelector('ol') as HTMLElement;
        const main = nav.closest('main') as HTMLElement;
        const context = document.createElement('canvas').getContext('2d');
        const labels = Array.from(nav.querySelectorAll('li > a, li > span:not([aria-hidden])'));
        const naturalWidths = labels.map((label) => {
          const style = getComputedStyle(label);
          if (!context) return -1;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          return context.measureText(label.textContent ?? '').width;
        });
        const navRect = nav.getBoundingClientRect();
        const areaRect = area.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          labels: labels.map((label) => label.textContent ?? ''),
          naturalWidths,
          lineHeight: parseFloat(getComputedStyle(list).lineHeight),
          nav: {
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            height: navRect.height,
            left: navRect.left,
            right: navRect.right,
          },
          list: { scrollWidth: list.scrollWidth, clientWidth: list.clientWidth },
          area: {
            scrollWidth: area.scrollWidth,
            clientWidth: area.clientWidth,
            left: areaRect.left,
            right: areaRect.right,
          },
          main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        };
      });
    };

    /** R19.4 の主張: ブレッドクラムとその周囲に水平のはみ出しが無い（許容誤差1px）。 */
    const expectNoHorizontalOverflow = (
      m: Awaited<ReturnType<typeof openAndMeasure>>,
      report: string
    ): void => {
      expect(m.nav.clientWidth).toBeGreaterThan(0);
      expect(m.nav.scrollWidth - m.nav.clientWidth, report).toBeLessThanOrEqual(1);
      expect(m.list.scrollWidth - m.list.clientWidth, report).toBeLessThanOrEqual(1);
      expect(m.area.scrollWidth - m.area.clientWidth, report).toBeLessThanOrEqual(1);
      expect(m.nav.left, report).toBeGreaterThanOrEqual(0);
      expect(m.nav.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
      expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
    };

    // (1) 日本語の長い名前
    const wrapped = await openAndMeasure(japaneseProjectName);
    const wrappedReport = JSON.stringify(wrapped);
    expect(wrapped.viewportWidth).toBe(375);
    expect(wrapped.labels).toEqual([
      'ダッシュボード',
      'プロジェクト一覧',
      japaneseProjectName,
      '工事写真一覧',
      albumName,
    ]);
    // 前提: 名前は一行に収まらない長さであり、ブレッドクラムは実際に複数行へ折り返されている
    expect(Math.min(...wrapped.naturalWidths)).toBeGreaterThan(0);
    expect(Math.max(...wrapped.naturalWidths), wrappedReport).toBeGreaterThan(
      wrapped.nav.clientWidth
    );
    expect(wrapped.lineHeight).toBeGreaterThan(0);
    expect(wrapped.nav.height, wrappedReport).toBeGreaterThanOrEqual(wrapped.lineHeight * 2);
    expectNoHorizontalOverflow(wrapped, wrappedReport);

    // (2) 区切りの無い英数字の長い一語のプロジェクト名
    await prisma.project.update({
      where: { id: projectId },
      data: { name: unbreakableProjectName },
    });
    const unbreakable = await openAndMeasure(unbreakableProjectName);
    const unbreakableReport = JSON.stringify(unbreakable);
    expect(unbreakable.labels[2]).toBe(unbreakableProjectName);
    // 前提: プロジェクト名の一語の自然幅がブレッドクラムの領域の幅を超える
    expect(unbreakable.area.clientWidth).toBeGreaterThan(0);
    expect(unbreakable.naturalWidths[2], unbreakableReport).toBeGreaterThan(
      unbreakable.area.clientWidth
    );
    expectNoHorizontalOverflow(unbreakable, unbreakableReport);
  });

  /**
   * R19.1 モバイル幅の見出し領域:
   * 375 幅で工事写真の詳細画面を開き、区切りの無い英数字の長い一語のアルバム名とメモを載せた
   * 見出し領域（h1 のアルバム名・p のメモ）が、詳細画面に横スクロールを生じさせないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 前提として、アルバム名とメモの一行の自然幅がいずれも詳細画面のコンテナ（<main>）の幅を
   * 超えること（折り返さなければはみ出す長さであること）を主張する。自然幅は画面の計算済み
   * フォントで canvas の measureText により測る（折り返しの有無に依らない。タスク 19.2 と同じ手法）。
   * そのうえで、<main> に水平のはみ出しが無いこと（許容誤差1px）、メモの段落の scrollWidth が
   * clientWidth を超えないこと、h1 とメモの右端が画面幅の内側にあることを主張する。
   *
   * 是正の経緯（2026-10-01、タスク 20.1）: 本テストを書いた時点の実装（`styles.title` /
   * `styles.memo` に折り返しの指定が無い形）では赤だった。アルバム名は最大 200 文字まで入力でき、
   * 区切りの無い一語は折り返されず、見出しが <main> を押し広げていた。是正は
   * `ConstructionPhotoDetailPage.tsx` の `styles.title` と `styles.memo` に overflowWrap:anywhere を
   * 足し、語の中にも折り返し位置を与えたことである。
   *
   * 文書全体（documentElement）の scrollWidth は測らない。アプリ共通ヘッダ（全画面共通の
   * クロムで工事写真機能の範囲外）が 375 幅で水平にはみ出すためである（上の二つのテストの注記と
   * 同じ理由）。測定の前に、詳細画面のモバイル分岐（`containerMobile` の maxWidth:100%）が
   * 適用されるまで待つ。
   */
  test('モバイル幅で区切りの無い長いアルバム名・メモの見出しが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const albumName = `FoundationRebarInspectionAndFormworkInstallationRecordAlbumForThirdZone${stamp}`;
    const memo = `ExteriorWorksFoundationRebarInspectionMemorandumConcerningFormworkInstallationAndConcretePlacementSchedule${stamp}`;
    const prisma = getPrismaClient();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'heading');
    const albumId = await createAlbum(page, projectId, albumName);
    await prisma.constructionPhotoAlbum.update({ where: { id: albumId }, data: { memo } });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { level: 1, name: albumName });
    await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText(memo, { exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          heading.evaluate((h1) => {
            const main = h1.closest('main');
            return main ? getComputedStyle(main).maxWidth : null;
          }),
        { timeout: getTimeout(15000) }
      )
      .toBe('100%');

    const m = await heading.evaluate((h1, memoText) => {
      const main = h1.closest('main') as HTMLElement;
      const memoEl = Array.from(main.querySelectorAll('p')).find(
        (p) => p.textContent === memoText
      ) as HTMLElement | undefined;
      const context = document.createElement('canvas').getContext('2d');
      const naturalWidth = (el: Element | undefined): number => {
        if (!el || !context) return -1;
        const style = getComputedStyle(el);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(el.textContent ?? '').width;
      };
      const box = (el: HTMLElement | undefined) =>
        el
          ? {
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              right: el.getBoundingClientRect().right,
            }
          : null;
      return {
        viewportWidth: window.innerWidth,
        titleNaturalWidth: naturalWidth(h1),
        memoNaturalWidth: naturalWidth(memoEl),
        title: box(h1 as HTMLElement),
        memo: box(memoEl),
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
      };
    }, memo);
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.title, report).not.toBeNull();
    expect(m.memo, report).not.toBeNull();
    expect(m.main.clientWidth, report).toBeGreaterThan(0);
    // 前提: アルバム名とメモの一語の自然幅が、いずれも詳細画面のコンテナの幅を超える
    expect(m.titleNaturalWidth, report).toBeGreaterThan(m.main.clientWidth);
    expect(m.memoNaturalWidth, report).toBeGreaterThan(m.main.clientWidth);

    // R19.1: 詳細画面のコンテナに水平のはみ出しが無い（許容誤差1px）
    expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
    // 見出し・メモ自身も画面幅の内側に収まる。h1 は flex item として箱ごと広がる
    // （是正前も scrollWidth=clientWidth=1083 だった）ため、h1 のはみ出しは右端と <main> の主張で
    // 捉える。h1 の scrollWidth の主張に検出力は無い（タスク 20.1 のレビューで実測）
    expect(m.title!.clientWidth, report).toBeGreaterThan(0);
    expect(m.title!.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    expect(m.memo!.clientWidth, report).toBeGreaterThan(0);
    expect(m.memo!.scrollWidth, report).toBeLessThanOrEqual(m.memo!.clientWidth);
    expect(m.memo!.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
  });

  /**
   * R19.1 モバイル幅の写真項目のファイル名:
   * 375 幅で工事写真の詳細画面を開き、カメラ由来の現実的な長さの区切りの無いファイル名の画像を
   * 写真項目として追加したとき、写真項目のファイル名の見出し（h3）と、削除確認ダイアログの本文が
   * 詳細画面に横スクロールを生じさせないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * アンダースコアは折り返し位置にならないため、`IMG_20261001_143052_..._<stamp>.jpg` は一語として
   * 扱われる。前提として、ファイル名の一行の自然幅が見出しの幅（clientWidth）を超えること（折り返さ
   * なければはみ出す長さであること）を主張する。自然幅は画面の計算済みフォントで canvas の
   * measureText により測る（タスク 19.2・20.1 と同じ手法）。そのうえで、<main> に水平のはみ出しが
   * 無いこと（許容誤差1px）、見出しの scrollWidth が clientWidth を超えないこと、見出しの文字列の
   * 右端が画面幅の内側にあることを主張する。削除確認ダイアログでは、本文の段落の scrollWidth が
   * clientWidth を超えないことと、本文の文字列の右端が画面幅の内側にあることを主張する。見出しも
   * 段落も箱は親の幅に固定され、はみ出すのは中の文字列であるため、右端は箱ではなく文字列（Range の
   * 外接矩形）で測る（20.1 の h1 は flex item として箱ごと広がったが、ここでは逆に箱が広がらない）。
   *
   * 是正の経緯（2026-10-01、タスク 20.3）: 本テストを書いた時点の実装（`PhotoItemPanel.tsx` の
   * `styles.fileName` と `styles.deleteDialogMessage` に折り返しの指定が無い形）では赤だった。
   * 実測は、<main> の scrollWidth 473 / clientWidth 343、見出しの scrollWidth 403 / clientWidth 203・
   * 文字列の右端 488.6（箱の右端は 289）、ダイアログ本文の scrollWidth 427 / clientWidth 290・
   * 文字列の右端 470.1（箱の右端は 332.3）である。是正は両者に overflowWrap:anywhere を足し、
   * 語の中にも折り返し位置を与えたことである。
   *
   * 文書全体（documentElement）の scrollWidth は測らない。アプリ共通ヘッダ（全画面共通の
   * クロムで工事写真機能の範囲外）が 375 幅で水平にはみ出すためである（上のテストの注記と
   * 同じ理由）。測定の前に、写真項目が縦積みのモバイル分岐に確定するまで待つ。
   */
  test('モバイル幅で区切りの無い長いファイル名の写真項目が水平にはみ出さない', async ({ page }) => {
    const stamp = Date.now();
    const fileName = `IMG_20261001_143052_foundation_rebar_${stamp}.jpg`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'filename');
    const albumId = await createAlbum(page, projectId, `ファイル名_${stamp}`);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    await upload;
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });
    const heading = items.getByRole('heading', { level: 3, name: fileName });
    await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
    await expect
      .poll(
        async () =>
          items.first().evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
        { timeout: getTimeout(15000) }
      )
      .toBe('column');

    const m = await heading.evaluate((h3) => {
      const main = h3.closest('main') as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(h3);
      let naturalWidth = -1;
      if (context) {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        naturalWidth = context.measureText(h3.textContent ?? '').width;
      }
      const range = document.createRange();
      range.selectNodeContents(h3);
      return {
        viewportWidth: window.innerWidth,
        naturalWidth,
        title: {
          scrollWidth: h3.scrollWidth,
          clientWidth: h3.clientWidth,
          boxRight: h3.getBoundingClientRect().right,
          textRight: range.getBoundingClientRect().right,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
      };
    });
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.title.clientWidth, report).toBeGreaterThan(0);
    expect(m.main.clientWidth, report).toBeGreaterThan(0);
    // 前提: ファイル名の一語の自然幅が見出しの幅を超える（折り返さなければはみ出す長さ）
    expect(m.naturalWidth, report).toBeGreaterThan(m.title.clientWidth);
    // R19.1: 詳細画面のコンテナに水平のはみ出しが無い（許容誤差1px）
    expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
    // 見出しのファイル名が見出しの箱からはみ出さず、その右端が画面幅の内側にある。見出しの箱は
    // 縦積みの写真項目の幅に固定され（是正前も clientWidth 203・箱の右端 289 で画面の内側）、
    // はみ出すのは中の文字列であるため、箱の右端ではなく文字列の右端（Range の外接矩形）を測る。
    // 箱の右端の主張に検出力は無い（タスク 20.3 で実測）
    expect(m.title.scrollWidth, report).toBeLessThanOrEqual(m.title.clientWidth);
    expect(m.title.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);

    // 削除確認ダイアログの本文もファイル名を載せる
    await items.getByRole('button', { name: `写真項目を削除: ${fileName}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const message = dialog.locator('p').filter({ hasText: fileName });
    await expect(message).toHaveCount(1);
    const d = await message.evaluate((p) => {
      const range = document.createRange();
      range.selectNodeContents(p);
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: p.scrollWidth,
        clientWidth: p.clientWidth,
        boxRight: p.getBoundingClientRect().right,
        textRight: range.getBoundingClientRect().right,
      };
    });
    const dialogReport = JSON.stringify(d);
    expect(d.clientWidth, dialogReport).toBeGreaterThan(0);
    expect(d.scrollWidth, dialogReport).toBeLessThanOrEqual(d.clientWidth);
    expect(d.textRight, dialogReport).toBeLessThanOrEqual(d.viewportWidth + 1);

    // 後始末: 削除せずにダイアログを閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
    await expect(items).toHaveCount(1);
  });

  /**
   * R19.1 モバイル幅の看板配置ダイアログの操作列:
   * 375 幅で工事写真の詳細画面から看板配置ダイアログを開き、区切りの無い英数字の長い工事件名の
   * 看板を選んだとき、配置エディタの操作列（看板バッジ・案内文・「保存」）が画面幅に収まることを
   * 検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 前提として、バッジの文字列の一行の自然幅が操作列の幅（clientWidth）を超えること（折り返さ
   * なければ操作列に収まらない長さであること）を主張する。自然幅は画面の計算済みフォントで canvas
   * の measureText により測る（タスク 19.2・20.1・20.3 と同じ手法）。そのうえで次を主張する。
   *  - 「保存」ボタンの箱の右端が画面幅の内側にある（許容誤差1px）。
   *  - 案内文の幅が、案内文の一行の自然幅と操作列の幅の小さい方を下回らない（許容誤差1px）。
   *    案内文は和文で文字ごとに折り返せるため、押し縮められても箱の外へははみ出さず、右端の主張
   *    では潰れを検出できない。操作列が折り返せるなら、案内文は一行に収まる幅か、収まらなければ
   *    操作列の全幅を得られる。これを下回るのは、同じ行の他の要素に幅を奪われて縦長に潰れている
   *    ことを意味する。
   *  - バッジの文字列の右端（Range の外接矩形）が画面幅の内側にある（許容誤差1px）。
   *
   * 是正の経緯（2026-10-01、タスク 20.4）: 本テストを書いた時点の実装（`SignboardPlacementEditor.tsx`
   * の `styles.toolbar` に flexWrap が無く、`styles.badge` に折り返しの指定が無い形）では赤だった。
   * 実測は、操作列の scrollWidth 572 / clientWidth 295、バッジの幅 477.5・文字列の右端 509.5、
   * 案内文の幅 24（自然幅 276）・高さ 216、「保存」の右端 611.5 である。是正は操作列に
   * flexWrap:wrap、バッジに overflowWrap:anywhere を足したことである。是正後は、バッジ・案内文・
   * 「保存」が別の行に並び、それぞれ幅 295・276・60 になる。
   * 検出力（変異で実測）: 操作列の flexWrap だけを外すと、案内文が幅 75.2 に潰れて案内文の主張が
   * 赤になる（バッジは自身の箱の中で折り返し、「保存」は右端 335 で画面内に残る）。バッジの
   * overflowWrap だけを外すと、バッジの文字列の右端が 509.5 になってバッジの主張が赤になる（操作列が
   * 折り返すため「保存」と案内文は次の行で画面内に収まる）。「保存」の主張は両方を欠く是正前の形で
   * 赤になる。
   *
   * 文書全体（documentElement）の scrollWidth は測らない。アプリ共通ヘッダ（全画面共通の
   * クロムで工事写真機能の範囲外）が 375 幅で水平にはみ出すためである（上のテストの注記と
   * 同じ理由）。
   */
  test('モバイル幅で区切りの無い長い工事件名でも看板配置ダイアログの操作列が画面内に収まる', async ({
    page,
  }) => {
    const stamp = Date.now();
    const workName = `SignboardWorkName${stamp}WithoutAnyBreakOpportunityForMobileToolbar`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'signboard-toolbar');
    const albumId = await createAlbum(page, projectId, `看板操作列_${stamp}`);

    // 配置用の工事看板を登録する（上の看板配置のテストと同じ手順）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(workName);
    await page.getByLabel('工事場所').fill('看板操作列E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: workName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await uploadPhoto(page, FIXTURE_JPG, 1);

    await page
      .getByTestId('construction-photo-item')
      .first()
      .getByRole('button', { name: /看板を(配置|変更)/ })
      .click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await assignDialog.locator('#signboard-assign-select').selectOption({ label: workName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    const badge = editor.getByTestId('signboard-indicator');
    await expect(badge).toContainText(workName);
    const saveButton = editor.getByRole('button', { name: '保存' });
    await expect(saveButton).toBeVisible();
    const hint = editor.getByText('ドラッグで移動、ハンドルで大きさを調整できます');
    await expect(hint).toBeVisible();

    const m = await editor.evaluate((root) => {
      const badgeEl = root.querySelector('[data-testid="signboard-indicator"]') as HTMLElement;
      const toolbar = badgeEl.parentElement as HTMLElement;
      const hintEl = Array.from(toolbar.querySelectorAll('span')).find((el) =>
        (el.textContent ?? '').startsWith('ドラッグで移動')
      ) as HTMLElement;
      const button = Array.from(toolbar.querySelectorAll('button')).find(
        (el) => (el.textContent ?? '').trim() === '保存'
      ) as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const natural = (el: HTMLElement): number => {
        if (!context) return -1;
        const style = getComputedStyle(el);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(el.textContent ?? '').width;
      };
      const range = document.createRange();
      range.selectNodeContents(badgeEl);
      const rect = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      };
      return {
        viewportWidth: window.innerWidth,
        toolbar: { clientWidth: toolbar.clientWidth, scrollWidth: toolbar.scrollWidth },
        badge: {
          natural: natural(badgeEl),
          box: rect(badgeEl),
          textRight: range.getBoundingClientRect().right,
        },
        hint: { natural: natural(hintEl), box: rect(hintEl) },
        button: rect(button),
      };
    });
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.toolbar.clientWidth, report).toBeGreaterThan(0);
    // 前提: 件名の一語の自然幅が操作列の幅を超える（折り返さなければ操作列に収まらない長さ）
    expect(m.badge.natural, report).toBeGreaterThan(m.toolbar.clientWidth);
    // R19.1: 「保存」が画面外へ押し出されない
    expect(m.button.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    // 案内文が縦長に潰れない（一行の自然幅か操作列の全幅の小さい方を確保する）
    expect(m.hint.natural, report).toBeGreaterThan(0);
    expect(m.hint.box.width, report).toBeGreaterThanOrEqual(
      Math.min(m.hint.natural, m.toolbar.clientWidth) - 1
    );
    // 件名のバッジの文字列が画面幅の内側に収まる
    expect(m.badge.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);
  });
});
