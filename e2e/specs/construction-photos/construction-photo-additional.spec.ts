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
 * 16. モバイル幅のアルバムを取り除く確認ダイアログ: 区切りの無い英数字の長いアルバム名でも、
 *     ダイアログとその中のパネルが水平にはみ出さず、名前の文字列が画面内に収まる（R19.1）
 * 17. モバイル幅の現場調査写真の選択ダイアログ: 区切りの無い英数字の長い調査名でも、候補一覧の
 *     本文が水平にはみ出さず、調査名の文字列と右の枚数表示が画面内に収まる（R19.1）
 * 18. モバイル幅の通知とエラー表示: 区切りの無い現実的な長さのファイル名・長い文言でも、アップ
 *     ロード失敗の通知、アップロードできないファイルの表示、アルバムを取得できないときのエラー
 *     表示が水平にはみ出さず、文字列が枠の内側に収まる（R19.1）
 * 19. モバイル幅の文書全体: admin と user のそれぞれで、375 幅と 320 幅の詳細画面が文書全体
 *     （documentElement）を水平にはみ出させない（R19.1）
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

import { test, expect, type Request, type Route } from '@playwright/test';
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

/**
 * 工事写真の画像アップロードのエンドポイントの URL 判定。
 *
 * `page.route` / `page.unroute` は同一の参照でのみ対応付くため、判定と応答の差し替えを
 * モジュールスコープの定数として共有する。オリジンではなくパスで判定するのは、CI とローカルで
 * API のオリジンが異なるためである（construction-photo-upload-retry.spec.ts と同じ規約）。
 */
const UPLOAD_URL_MATCHER = (url: URL): boolean =>
  /\/api\/construction-photos\/[^/]+\/images$/.test(url.pathname);

/**
 * アップロードの POST を、サーバーの処理中の失敗（500）の応答へ差し替える。
 * POST 以外（同じパスの一覧取得）は素通しする。
 */
const failUploadPost = async (route: Route): Promise<void> => {
  if (route.request().method() !== 'POST') {
    await route.fallback();
    return;
  }
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'https://architrack.example.com/problems/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'サーバー内部エラーが発生しました',
      code: 'INTERNAL_SERVER_ERROR',
    }),
  });
};

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
    // 本テストを書いた時点では、ページ全体（document）がアプリ共通ヘッダ（app-header-nav 等の
    // 全画面共通クロム。工事写真機能=Req14〜19 の範囲外）によって狭幅で水平にはみ出していたため、
    // 当該機能のコンテナ基準で検証した。共通ヘッダは user-authentication の Task 39.1 で是正済みで
    // あり、文書全体（documentElement）の主張は末尾の「文書全体を水平にはみ出させない」のテストが
    // 担う（タスク 21.1）。
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
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない。本テストを書いた時点では、
   * アプリ共通ヘッダ（全画面共通のクロムで工事写真機能の範囲外）が 375 幅で水平にはみ出し、
   * 本機能の判定に使えなかった（2026-10-01 の実測で documentElement は scrollWidth 400 /
   * clientWidth 375）。共通ヘッダは user-authentication の Task 39.1 で是正済みであり
   * （2026-10-02 の実測で 375 / 375）、文書全体の主張は末尾の「文書全体を水平にはみ出させない」の
   * テストが担う（タスク 21.1）。
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
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダの是正後の文書全体の主張は、末尾の「文書全体を水平にはみ出させない」の
   * テストが、区切りの無い長いアルバム名の状態を含めて担う）。測定の前に、詳細画面のモバイル分岐
   * （`containerMobile` の maxWidth:100%）が適用されるまで待つ。
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
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダは是正済みで、文書全体の主張は末尾のテストが担う）。測定の前に、
   * 写真項目が縦積みのモバイル分岐に確定するまで待つ。
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
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダは是正済みで、文書全体の主張は末尾のテストが担う）。
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

  /**
   * R19.1 モバイル幅のアルバムを取り除く確認ダイアログ:
   * 375 幅で工事写真の詳細画面を開き、区切りの無い英数字の長い一語（100 文字超）のアルバム名で
   * アルバムを取り除く確認ダイアログを開いたとき、ダイアログが水平にはみ出さないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 前提として、アルバム名の一行の自然幅がダイアログの幅（clientWidth）を超えること（折り返さ
   * なければダイアログに収まらない長さであること）を主張する。自然幅は画面の計算済みフォントで
   * canvas の measureText により測る（タスク 19.2・20.1・20.3・20.4 と同じ手法）。そのうえで次を
   * 主張する。
   *  - ダイアログ（role=dialog）の scrollWidth が clientWidth を超えない。
   *  - ダイアログの中のパネル（ダイアログ直下の内容の箱）の scrollWidth が clientWidth を超えない。
   *  - アルバム名の文字列の右端（Range の外接矩形）が画面幅の内側にある（許容誤差1px）。
   *    ダイアログの箱は画面幅の 90% に固定され、はみ出すのは中の文字列であるため、右端は箱ではなく
   *    文字列で測る（タスク 20.3 と同じ理由）。
   *
   * 是正の経緯（2026-10-01、タスク 20.5）: 本テストを書いた時点の実装（`AlbumDeleteDialog.tsx` の
   * `styles.albumName` に折り返しの指定が無い形）では赤だった。是正は `styles.albumName` に
   * overflowWrap:anywhere を足し、語の中にも折り返し位置を与えたことである。
   * 是正前の実測は、名前の自然幅 821.8、ダイアログの scrollWidth 866 / clientWidth 338、パネルの
   * scrollWidth 846 / clientWidth 298、文字列の右端 884.5（ダイアログの箱の右端は 356.3）である。
   * 是正後は、ダイアログ 338 / 338、パネル 298 / 298、文字列の右端 309.6 になる。
   * 検出力（変異で実測）: 是正の指定だけを外し、三つの主張を一時的に soft にして流すと、三つとも
   * それぞれ赤になる（ダイアログ 866 > 338、パネル 846 > 298、右端 884.5 > 376）。
   *
   * ダイアログは「キャンセル」で閉じ、アルバムは取り除かない。文書全体（documentElement）の
   * scrollWidth は本テストでは測らない（上のブレッドクラムのテストの注記と同じ経緯。共通ヘッダは
   * 是正済みで、文書全体の主張は末尾のテストが担う）。
   */
  test('モバイル幅で区切りの無い長いアルバム名でもアルバムを取り除く確認ダイアログが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const albumName = `FoundationRebarInspectionAndFormworkInstallationRecordAlbumForThirdZoneConcretePlacementSchedule${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'album-dialog');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { level: 1, name: albumName });
    await expect(heading).toBeVisible({ timeout: getTimeout(15000) });

    await page.getByRole('button', { name: '削除', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'アルバムの削除' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    const nameEl = dialog.locator('span').filter({ hasText: albumName });
    await expect(nameEl).toHaveCount(1);

    const m = await nameEl.evaluate((span) => {
      const dialogEl = span.closest('[role="dialog"]') as HTMLElement;
      const panel = dialogEl.firstElementChild as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(span);
      let naturalWidth = -1;
      if (context) {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        naturalWidth = context.measureText(span.textContent ?? '').width;
      }
      const range = document.createRange();
      range.selectNodeContents(span);
      const box = (el: HTMLElement) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        right: el.getBoundingClientRect().right,
      });
      return {
        viewportWidth: window.innerWidth,
        naturalWidth,
        dialog: box(dialogEl),
        panel: box(panel),
        textRight: range.getBoundingClientRect().right,
      };
    });
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.dialog.clientWidth, report).toBeGreaterThan(0);
    expect(m.panel.clientWidth, report).toBeGreaterThan(0);
    // 前提: アルバム名の一語の自然幅がダイアログの幅を超える（折り返さなければはみ出す長さ）
    expect(m.naturalWidth, report).toBeGreaterThan(m.dialog.clientWidth);
    // R19.1: ダイアログとその中のパネルに水平のはみ出しが無い
    expect(m.dialog.scrollWidth, report).toBeLessThanOrEqual(m.dialog.clientWidth);
    expect(m.panel.scrollWidth, report).toBeLessThanOrEqual(m.panel.clientWidth);
    // アルバム名の文字列が画面幅の内側に収まる
    expect(m.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);

    // 後始末: 取り除かずにダイアログを閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
    await expect(heading).toBeVisible();
  });

  /**
   * R19.1 モバイル幅の現場調査写真の選択ダイアログ:
   * 375 幅で工事写真の詳細画面から「現場調査写真から選択」のダイアログを開き、区切りの無い英数字の
   * 長い一語（100 文字超）の調査名を持つ現場調査が候補に出たとき、候補一覧が水平にはみ出さず、
   * 調査名の右の枚数表示が見えない位置へ押し出されないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 現場調査は同じプロジェクトに UI で作成し、画像を1枚アップロードする（site-survey の
   * site-survey-responsive.spec.ts と同じ手順）。調査名は 200 文字まで入力できる。
   *
   * 前提として、調査名の一行の自然幅がダイアログの本文（候補一覧を包む縦スクロールの箱）の
   * clientWidth を超えること（折り返さなければ本文に収まらない長さであること）を主張する。
   * 自然幅は画面の計算済みフォントで canvas の measureText により測る（タスク 20.5 と同じ手法）。
   * そのうえで次を主張する。
   *  - 本文の scrollWidth が clientWidth を超えない（ダイアログ内に横スクロールが出ない）。
   *  - 調査名の文字列の右端（Range の外接矩形）が画面幅の内側にある（許容誤差1px）。
   *  - 枚数表示の右端が画面幅の内側にある（許容誤差1px。押し出されていない）。
   *  - 枚数表示の文字列の幅が一行の自然幅を下回らない（許容誤差1px。縮められて「1」と「枚」が
   *    縦に割れていない）。
   * ダイアログの箱は画面幅の 90% に固定され、広がるのは中の本文であるため、ダイアログの箱ではなく
   * 本文と文字列で測る。
   *
   * 是正の経緯（2026-10-02、タスク 20.7）: 本テストを書いた時点の実装（`SurveyImagePicker.tsx` の
   * 調査名の span に折り返しの指定が無い形）では赤だった。是正は二つである。調査名に
   * overflowWrap:anywhere を足して語の中にも折り返し位置を与えたことと、枚数表示に flexShrink:0 を
   * 足して長い調査名と同じ行で縮められないようにしたことである。調査名の側に minWidth:0 は要らない
   * （overflowWrap:anywhere で最小内容幅そのものが小さくなるため、本文は 290 / 290 に収まる）。
   * 是正前の実測は、名前の自然幅 769.3、本文の scrollWidth 800 / clientWidth 290、調査名の右端
   * 829.1、枚数表示の右端 843.1（幅 14・高さ 37 の二行に割れていた）である。是正後は、本文
   * 290 / 290、調査名の右端 289.0、枚数表示の右端 315.3（幅 25.1 で自然幅 25.1 と一致）になる。
   * 検出力（変異で実測）: 主張を一時的に soft にして流すと、overflowWrap だけを外した変異では
   * 本文（811 > 290）・調査名の右端（829.1 > 376）・枚数表示の右端（854.2 > 376）の三つが赤になり、
   * flexShrink だけを外した変異では枚数表示の幅（14 < 24.1）が赤になる。
   *
   * ダイアログは「キャンセル」で閉じ、写真は追加しない。文書全体（documentElement）の scrollWidth は
   * 本テストでは測らない（上のブレッドクラムのテストの注記と同じ経緯）。
   */
  test('モバイル幅で区切りの無い長い調査名でも現場調査写真の選択ダイアログが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const surveyName = `FoundationRebarInspectionAndFormworkInstallationSiteSurveyForThirdZoneConcretePlacementSchedule${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'survey-picker');

    // 同じプロジェクトに長い調査名の現場調査を作り、画像を1枚登録する
    await page.goto(`/projects/${projectId}/site-surveys/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });
    await page.getByLabel(/調査名/i).fill(surveyName);
    await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);
    const createSurvey = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/projects\/[0-9a-f-]+\/site-surveys$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: /^作成$/i }).click();
    expect((await createSurvey).ok()).toBe(true);
    await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');
    const surveyUpload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/site-surveys\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(60000) }
    );
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_JPG);
    expect((await surveyUpload).ok()).toBe(true);

    const albumId = await createAlbum(page, projectId, `調査選択_${stamp}`);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: `調査選択_${stamp}` })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.getByRole('button', { name: /現場調査写真から選択/ }).click();
    const dialog = page.getByRole('dialog', { name: '現場調査写真から選択' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    const candidate = dialog.getByRole('button', { name: new RegExp(surveyName) });
    await expect(candidate).toBeVisible({ timeout: getTimeout(15000) });
    await expect(candidate).toContainText('1 枚');

    const m = await candidate.evaluate((button, name) => {
      const spans = Array.from(button.querySelectorAll(':scope > span')) as HTMLElement[];
      const nameEl = spans.find((el) => el.textContent === name) as HTMLElement;
      const countEl = spans.find((el) => /枚$/.test(el.textContent ?? '')) as HTMLElement;
      const body = button.parentElement!.parentElement as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const measure = (el: HTMLElement) => {
        if (!context) return -1;
        const style = getComputedStyle(el);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(el.textContent ?? '').width;
      };
      const textRect = (el: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      };
      return {
        viewportWidth: window.innerWidth,
        naturalWidth: measure(nameEl),
        countNaturalWidth: measure(countEl),
        body: { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth },
        name: textRect(nameEl),
        count: textRect(countEl),
      };
    }, surveyName);
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.body.clientWidth, report).toBeGreaterThan(0);
    // 前提: 調査名の一語の自然幅が本文の幅を超える（折り返さなければはみ出す長さ）
    expect(m.naturalWidth, report).toBeGreaterThan(m.body.clientWidth);
    // R19.1: 本文に水平のはみ出しが無い（ダイアログ内に横スクロールが出ない）
    expect(m.body.scrollWidth, report).toBeLessThanOrEqual(m.body.clientWidth);
    // 調査名の文字列が画面幅の内側に収まる
    expect(m.name.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    // 枚数表示が見えない位置へ押し出されず、画面幅の内側に収まる
    expect(m.count.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    // 枚数表示が縮められず、一行の自然幅を保つ（「1」と「枚」が縦に割れない）
    expect(m.countNaturalWidth, report).toBeGreaterThan(0);
    expect(m.count.width, report).toBeGreaterThanOrEqual(m.countNaturalWidth - 1);

    // 後始末: 写真を追加せずにダイアログを閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
  });

  /**
   * R19.1 モバイル幅の通知とエラー表示:
   * 375 幅で工事写真の詳細画面を開き、区切りの無い長い文字列を載せた通知とエラー表示が、詳細画面に
   * 横スクロールを生じさせず、文字列が枠の外へ描かれないことを検証する。対象は次の三つである。
   *  (1) アップロード失敗の通知（role=alert）: カメラ由来の現実的な長さの区切りの無いファイル名の
   *      画像のアップロードを失敗させる。通知の本文は「全1件の追加に失敗しました。」の次の行に
   *      ファイル名を置く（`PhotoUploader.tsx` の `buildNotice`）。
   *  (2) アップロードできないファイルの表示（共有のアップロード部品が出す role=alert）: 同じ形の
   *      ファイル名で、サイズ上限（50MB）を超えるファイルを選ぶ。表示は「<ファイル名>: ファイル
   *      サイズが50MBを超えています。」となる。
   *  (3) アルバムを取得できないときのエラー表示（role=alert）: アルバムの取得を、区切りの無い長い
   *      一語を理由に持つ応答へ差し替える。画面は応答の理由をそのまま表示する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * アンダースコアは折り返し位置にならないため、ファイル名は一語として扱われる。(1) のアップロードの
   * POST は `page.route` で 500 の応答へ差し替える。サーバーの処理中の失敗は自動再試行の対象外で
   * あるため、差し替えた1回の応答で失敗が確定し、通知と未送信画像の表示が出る。(2) は送信前の検査で
   * 拒まれるため、POST は発生しない。ファイルは中身の無い 50MB+1 バイトの疎なファイルをテストの
   * 出力先に作り、終わりに消す。
   *
   * 三つとも同じ主張を課す。前提として、文字列の一行の自然幅が、それを載せる箱の幅（clientWidth）を
   * 超えること（折り返さなければ箱に収まらない長さであること）を主張する。自然幅は画面の計算済み
   * フォントで canvas の measureText により測る（タスク 20.3・20.5・20.7 と同じ手法）。そのうえで
   * 次を主張する。
   *  - <main> に水平のはみ出しが無い（許容誤差1px）。
   *  - 文字列を載せる箱と、それを包む枠（role=alert）の scrollWidth が clientWidth を超えない。
   *  - 文字列の右端（Range の外接矩形）が、箱の右端と画面幅の内側にある（許容誤差1px）。箱は
   *    写真項目の区画の幅に固定され、はみ出すのは中の文字列であるため、右端は箱ではなく文字列で
   *    測る（タスク 20.3 と同じ理由）。
   *
   * 是正の経緯（2026-10-02、タスク 20.8）: 本テストを書いた時点の実装（`ConstructionPhotoDetailPage.tsx`
   * の `styles.notice`・`styles.errorText` に折り返しの指定が無く、アップロード部品を包む
   * `styles.uploaderWrapper` にも無い形）では、三つとも赤だった。是正は三つのスタイルに
   * overflowWrap:anywhere を足したことである。(2) の表示は共有の部品が描くため、包む側に指定して
   * 継承させた（タスク 19.2 のブレッドクラムと同じ手法）。
   * 是正前の実測（主張を一時的に soft にして流し、三つの表示のすべての主張が赤になることを確認）:
   *  (1) 自然幅 399.4、<main> 453 / 343、通知 415 / 267、文字列の右端 469.4（箱の右端 322）。
   *  (2) 自然幅 425.1、<main> 498 / 343、項目 428 / 223、枠 460 / 267、文字列の右端 511.1（箱の右端 309）。
   *  (3) 自然幅 636.0、<main> 673 / 343、段落 636 / 269、枠 660 / 317、文字列の右端 689.0（箱の右端 322）。
   * 是正後は、<main> がいずれも 343 / 343、箱と枠の scrollWidth が clientWidth に一致し、文字列の
   * 右端は (1) 303.0、(2) 307.3、(3) 321.9 になる。
   *
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダは是正済みで、文書全体の主張は末尾のテストが担う）。測定の前に、
   * 詳細画面のモバイル分岐（`containerMobile` の maxWidth:100%）が適用されるまで待つ。
   */
  test('モバイル幅で区切りの無い長いファイル名・文言でも通知とエラー表示が水平にはみ出さない', async ({
    page,
  }, testInfo) => {
    const stamp = Date.now();
    const fileName = `IMG_20261001_143052_foundation_rebar_${stamp}.jpg`;
    const oversizeFileName = `IMG_20261001_143052_foundation_rebar_oversize_${stamp}.jpg`;
    const albumName = `失敗通知_${stamp}`;
    const fetchErrorDetail = `AlbumFetchFailureReasonWithoutAnyBreakOpportunityForMobileWidthErrorDisplay${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'upload-notice');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });

    /** 詳細画面を開き、モバイル分岐の適用を待つ。 */
    const openDetail = async (): Promise<void> => {
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      const heading = page.getByRole('heading', { level: 1, name: albumName });
      await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
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
    };

    /**
     * 文字列 text を直に載せる箱 box について、文字列の自然幅・右端と、箱・枠（role=alert）・
     * <main> の幅を測る。
     */
    const measureText = (box: import('@playwright/test').Locator, text: string) =>
      box.evaluate((el, target) => {
        const main = el.closest('main') as HTMLElement;
        const frame = el.closest('[role="alert"]') as HTMLElement;
        const context = document.createElement('canvas').getContext('2d');
        const style = getComputedStyle(el);
        let naturalWidth = -1;
        if (context) {
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          naturalWidth = context.measureText(target).width;
        }
        // 箱の本文のうち、対象の文字列の部分だけを Range で囲む
        let textRight = -1;
        const textNode = Array.from(el.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes(target)
        );
        if (textNode) {
          const start = (textNode.textContent ?? '').indexOf(target);
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + target.length);
          textRight = range.getBoundingClientRect().right;
        }
        return {
          viewportWidth: window.innerWidth,
          naturalWidth,
          box: {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            right: el.getBoundingClientRect().right,
          },
          frame: { scrollWidth: frame.scrollWidth, clientWidth: frame.clientWidth },
          textRight,
          main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        };
      }, text);

    /** 前提と R19.1 の主張（三つの表示に共通）。 */
    const expectTextFits = (m: Awaited<ReturnType<typeof measureText>>, label: string): void => {
      const report = `${label} ${JSON.stringify(m)}`;
      expect(m.viewportWidth, report).toBe(375);
      expect(m.box.clientWidth, report).toBeGreaterThan(0);
      expect(m.frame.clientWidth, report).toBeGreaterThan(0);
      expect(m.main.clientWidth, report).toBeGreaterThan(0);
      // 前提: 文字列の一語の自然幅が箱の幅を超える（折り返さなければはみ出す長さ）
      expect(m.naturalWidth, report).toBeGreaterThan(m.box.clientWidth);
      // 前提: 文字列を箱の本文の中に見つけ、その位置を測れている
      expect(m.textRight, report).toBeGreaterThan(0);
      // R19.1: 詳細画面のコンテナに水平のはみ出しが無い（許容誤差1px）
      expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
      // 箱と枠に水平のはみ出しが無い
      expect(m.box.scrollWidth, report).toBeLessThanOrEqual(m.box.clientWidth);
      expect(m.frame.scrollWidth, report).toBeLessThanOrEqual(m.frame.clientWidth);
      // 文字列が箱と画面幅の内側に収まる
      expect(m.textRight, report).toBeLessThanOrEqual(m.box.right + 1);
      expect(m.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    };

    // (1) アップロード失敗の通知。アップロードの POST だけを失敗させる（同じパスの GET は素通しする）
    await openDetail();
    await page.route(UPLOAD_URL_MATCHER, failUploadPost);
    try {
      const failed = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          UPLOAD_URL_MATCHER(new URL(r.url())) &&
          r.status() === 500,
        { timeout: getTimeout(60000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name: fileName,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await failed;

      const notice = page.getByRole('alert').filter({ hasText: '全1件の追加に失敗しました。' });
      await expect(notice).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(notice).toContainText(fileName);
      // 未送信画像の表示が出そろってから測る（通知の下の配置が確定した状態で測る）
      await expect(page.getByTestId('pending-upload-panel')).toBeVisible({
        timeout: getTimeout(20000),
      });
      await expect(page.getByTestId('construction-photo-item')).toHaveCount(0);

      expectTextFits(await measureText(notice, fileName), '(1) アップロード失敗の通知');
    } finally {
      await page.unroute(UPLOAD_URL_MATCHER, failUploadPost);
    }

    // (2) アップロードできないファイルの表示。サイズ上限（50MB）を1バイト超える疎なファイルを選ぶ
    await openDetail();
    const oversizePath = testInfo.outputPath(oversizeFileName);
    fs.mkdirSync(path.dirname(oversizePath), { recursive: true });
    fs.writeFileSync(oversizePath, '');
    fs.truncateSync(oversizePath, 50 * 1024 * 1024 + 1);
    try {
      await page.getByTestId('file-input').setInputFiles(oversizePath);
      const validation = page.getByTestId('validation-errors');
      await expect(validation).toBeVisible({ timeout: getTimeout(20000) });
      const rejected = validation.getByRole('listitem').filter({ hasText: oversizeFileName });
      await expect(rejected).toHaveCount(1);
      await expect(rejected).toContainText('ファイルサイズが50MBを超えています');

      expectTextFits(
        await measureText(rejected, oversizeFileName),
        '(2) アップロードできないファイルの表示'
      );
    } finally {
      fs.rmSync(oversizePath, { force: true });
    }

    // (3) アルバムを取得できないときのエラー表示。アルバムの取得だけを失敗させる
    const albumUrlMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/${albumId}`);
    const failAlbumFetch = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: fetchErrorDetail,
          code: 'NOT_FOUND',
        }),
      });
    };
    await page.route(albumUrlMatcher, failAlbumFetch);
    try {
      await page.goto(`/construction-photos/${albumId}`);
      const errorDisplay = page.getByRole('alert').filter({ hasText: fetchErrorDetail });
      await expect(errorDisplay).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(errorDisplay.getByRole('button', { name: '再試行' })).toBeVisible();
      await expect
        .poll(
          async () =>
            errorDisplay.evaluate((el) => {
              const main = el.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { timeout: getTimeout(15000) }
        )
        .toBe('100%');
      const errorText = errorDisplay.locator('p').filter({ hasText: fetchErrorDetail });
      await expect(errorText).toHaveCount(1);

      expectTextFits(
        await measureText(errorText, fetchErrorDetail),
        '(3) アルバムを取得できないときのエラー表示'
      );
    } finally {
      await page.unroute(albumUrlMatcher, failAlbumFetch);
    }
  });

  /**
   * R19.1 モバイル幅の文書全体:
   * admin と user（一般の利用者ロール）のそれぞれで、375 幅と 320 幅の工事写真の詳細画面を開き、
   * 文書全体（`document.documentElement`）に水平のはみ出しが無いこと（scrollWidth と clientWidth の
   * 差が許容誤差 1px 以内）を検証する。詳細画面のコンテナ（<main>）についても同じ主張を課す。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 経緯（2026-10-02、タスク 21.1）: 受入基準 19.1 は「工事写真詳細画面を横スクロールが発生しない
   * レイアウトで表示する」であり、利用者が実際に横へ動かせるのは文書全体である。上の 19.1 の
   * テストはいずれも <main> で測っており、文書全体は主張の外にあった。アプリ共通ヘッダ
   * （`frontend/src/components/Navigation/AppHeader.css`。所有は user-authentication）がモバイル幅で
   * 文書全体を押し広げていたためである。共通ヘッダは user-authentication の Task 39.1（コミット
   * `d7701b08`）で是正されたので、本テストが文書全体の主張を足す。
   *
   * 測る状態は五つである。名前は、四つが普通の長さ、一つが区切りの無い英数字の長い一語である。
   *  - admin・375 幅、admin・320 幅（管理メニューを持ち、ヘッダの項目が最も多い）
   *  - user・375 幅、user・320 幅（user 自身が所有するプロジェクトのアルバム。プロジェクトへの
   *    アクセスは所有者と admin に限られるため、R17.2 のテストと同じく user 自身に作らせる）
   *  - admin・375 幅・区切りの無い長いアルバム名（<main> の水準では上の見出しのテストが扱う。
   *    ここでは、ヘッダの是正後に文書全体を押し広げるものが他に無いことを主張する）
   * どのアルバムにも写真項目を 1 枚置き、写真項目が描かれた状態で測る。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 画面幅（window.innerWidth）が設定した幅に一致する。
   *  - 共通ヘッダ（header[role="banner"]）が表示されている。admin では管理メニューのトリガーが在り、
   *    user では無い（ログインした利用者のロールがヘッダへ届いていることの確認）。
   *  - 詳細画面の見出し（h1 のアルバム名）と写真項目が表示されている。
   *  - 見出しを含む <main> が在り、モバイル分岐（`containerMobile` の maxWidth:100%）が適用済みで、
   *    写真項目が縦積みに確定している（`useMediaQuery` は初期描画でデスクトップ側になり得る）。
   *  - 長い名前の状態では、名前の一行の自然幅が <main> の幅を超える（canvas の measureText）。
   *
   * 五つの状態をすべて測ってから主張する。赤になるときに、どの状態が何 px だったかを一度の
   * 失敗で読めるようにするためである。
   *
   * 検出力の実測（2026-10-02、タスク 21.1）: `AppHeader.css` だけを Task 39.1 の是正前
   * （コミット `116b4ddb` 時点）の内容へ戻した本番ビルドで本テストを実行すると、文書全体の主張が
   * 赤になった。documentElement の scrollWidth / clientWidth は、admin・375 幅が 400 / 375、
   * admin・320 幅が 400 / 320、user・320 幅が 350 / 320、admin・375 幅・長い名前が 400 / 375 である。
   * user・375 幅は是正前も 375 / 375 で赤にならない（是正前から収まっていた状態であり、本テストの
   * この状態の主張は是正への依存を示さない。退行の検出のために残す）。<main> は五つとも是正前から
   * scrollWidth と clientWidth が一致していた（375 幅は 343 / 343、320 幅は 288 / 288）。
   * ファイルを戻して作り直すと、五つとも文書全体の scrollWidth と clientWidth が一致し、緑に戻った。
   */
  test('モバイル幅（375・320）で admin と user のどちらでも詳細画面が文書全体を水平にはみ出させない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const adminAlbum = `文書全体_admin_${stamp}`;
    const userAlbum = `文書全体_user_${stamp}`;
    const longAlbum = `FoundationRebarInspectionAndFormworkInstallationRecordAlbumForThirdZone${stamp}`;
    const HORIZONTAL_TOLERANCE_PX = 1;

    const desktopViewport = page.viewportSize();
    expect(desktopViewport).not.toBeNull();

    interface Box {
      scrollWidth: number;
      clientWidth: number;
    }
    const measurements: Array<{ label: string; document: Box; main: Box }> = [];

    /** アルバムを作り、詳細画面で写真項目を 1 枚追加する。 */
    const createAlbumWithPhoto = async (projectId: string, albumName: string): Promise<string> => {
      const albumId = await createAlbum(page, projectId, albumName);
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await uploadPhoto(page, FIXTURE_JPG, 1);
      return albumId;
    };

    /** 指定の幅で詳細画面を開き、前提を確かめてから文書全体と <main> の幅を測って記録する。 */
    const measure = async (
      role: 'admin' | 'user',
      width: number,
      albumId: string,
      albumName: string,
      nameKind: '普通の名前' | '区切りの無い長い名前'
    ): Promise<void> => {
      const label = `${role}・${width} 幅・${nameKind}`;
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');

      // 前提: 共通ヘッダと詳細画面の見出し・写真項目が表示されている
      const header = page.locator('header[role="banner"]');
      await expect(header, label).toBeVisible();
      const heading = page.getByRole('heading', { level: 1, name: albumName });
      await expect(heading, label).toBeVisible({ timeout: getTimeout(15000) });
      const items = page.getByTestId('construction-photo-item');
      await expect(items, label).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(items.first(), label).toBeVisible();
      // 前提: ログインした利用者のロールがヘッダへ届いている（管理メニューは admin だけが持つ）
      await expect(header.locator('.app-header-admin-trigger'), label).toHaveCount(
        role === 'admin' ? 1 : 0
      );

      // 前提: 見出しを含む <main> が在り、モバイル分岐が適用済みで、写真項目が縦積みに確定している
      await expect
        .poll(
          async () =>
            heading.evaluate((h1) => {
              const main = h1.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { message: label, timeout: getTimeout(15000) }
        )
        .toBe('100%');
      await expect
        .poll(
          async () =>
            items.first().evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
          { message: label, timeout: getTimeout(15000) }
        )
        .toBe('column');

      const m = await heading.evaluate((h1) => {
        const main = h1.closest('main');
        const root = document.documentElement;
        const context = document.createElement('canvas').getContext('2d');
        let titleNaturalWidth = -1;
        if (context) {
          const style = getComputedStyle(h1);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          titleNaturalWidth = context.measureText(h1.textContent ?? '').width;
        }
        return {
          viewportWidth: window.innerWidth,
          titleNaturalWidth,
          document: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
          main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth } : null,
        };
      });
      const report = `${label} ${JSON.stringify(m)}`;

      // 前提: 画面幅が設定した幅であり、文書全体と <main> を測れている
      expect(m.viewportWidth, report).toBe(width);
      expect(m.document.clientWidth, report).toBeGreaterThan(0);
      expect(m.document.clientWidth, report).toBeLessThanOrEqual(width);
      expect(m.main, report).not.toBeNull();
      expect(m.main!.clientWidth, report).toBeGreaterThan(0);
      if (nameKind === '区切りの無い長い名前') {
        // 前提: 名前の一語の自然幅が <main> の幅を超える（折り返さなければはみ出す長さ）
        expect(m.titleNaturalWidth, report).toBeGreaterThan(m.main!.clientWidth);
      }

      measurements.push({ label, document: m.document, main: m.main! });
    };

    // admin: 自身のプロジェクトに、普通の名前と区切りの無い長い名前のアルバムを作る
    await loginAsUser(page, 'ADMIN_USER');
    const adminProject = await createProject(page, 'document-admin');
    const adminAlbumIdForDocument = await createAlbumWithPhoto(adminProject, adminAlbum);
    const longAlbumId = await createAlbumWithPhoto(adminProject, longAlbum);

    await measure('admin', 375, adminAlbumIdForDocument, adminAlbum, '普通の名前');
    await measure('admin', 320, adminAlbumIdForDocument, adminAlbum, '普通の名前');
    await measure('admin', 375, longAlbumId, longAlbum, '区切りの無い長い名前');

    // user へ切り替える（プロジェクトの作成はデスクトップ幅で行う）
    await page.setViewportSize(desktopViewport!);
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, 'REGULAR_USER');
    const userProject = await createProject(page, 'document-user');
    const userAlbumId = await createAlbumWithPhoto(userProject, userAlbum);

    await measure('user', 375, userAlbumId, userAlbum, '普通の名前');
    await measure('user', 320, userAlbumId, userAlbum, '普通の名前');

    // 五つの状態をすべて測れている（測り漏らした状態を緑に数えない）
    expect(measurements.map((m) => m.label)).toEqual([
      'admin・375 幅・普通の名前',
      'admin・320 幅・普通の名前',
      'admin・375 幅・区切りの無い長い名前',
      'user・375 幅・普通の名前',
      'user・320 幅・普通の名前',
    ]);

    const report = measurements
      .map(
        (m) =>
          `${m.label}: documentElement ${m.document.scrollWidth}/${m.document.clientWidth}、` +
          `<main> ${m.main.scrollWidth}/${m.main.clientWidth}`
      )
      .join(' ｜ ');
    const overflowing = (pick: (m: (typeof measurements)[number]) => Box): string[] =>
      measurements
        .filter((m) => pick(m).scrollWidth - pick(m).clientWidth > HORIZONTAL_TOLERANCE_PX)
        .map((m) => `${m.label}: ${pick(m).scrollWidth}/${pick(m).clientWidth}`);

    // R19.1: 詳細画面のコンテナ（<main>）に水平のはみ出しが無い（許容誤差1px）
    expect(
      overflowing((m) => m.main),
      report
    ).toEqual([]);
    // R19.1: 文書全体（documentElement）に水平のはみ出しが無い（許容誤差1px）
    expect(
      overflowing((m) => m.document),
      report
    ).toEqual([]);
  });
});
