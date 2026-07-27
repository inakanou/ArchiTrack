/**
 * @fileoverview 工事写真（construction-photo）主要ユーザーフローのE2Eテスト
 *
 * Task 9.3: E2E テスト（Playwright）
 *
 * 設計（design.md「Testing Strategy > E2E/UI Tests」）で定義された主要ユーザーフローを、
 * 実際のUI・API・DB（テスト環境: frontend 5174 / backend 3100 / postgres 5433）を通じて
 * エンドツーエンドで検証する。既存の site-survey / project 系スペックのログイン・プロジェクト
 * 作成・アップロード規約（loginAsUser / data-testid セレクタ / setInputFiles）を踏襲する。
 *
 * 検証する主要フロー（要件対応）:
 *  1. プロジェクト詳細の工事写真パネル（工程表パネル直下, R2.1）→一覧/詳細への遷移（R2.2, R2.4）
 *  2. アルバム作成（R1.1）と一覧反映（R3.1相当, 6.1導線）
 *  3. 3系統アップローダのローカルアップロードで写真項目追加（R4.1）＋カメラ入力/現調導線の存在（R5.1, R6.1）
 *  4. 並び替え（R7.3, R7.4）＋印刷対象チェック（R7.5）＋保存で最大2リクエスト確定（R7.1, R7.6）と永続化
 *  5. 印刷対象ありでPDF出力（ダウンロード発火, R10.1）
 *  6. 印刷対象0件でPDF出力は非実行・通知（R10.13）
 *  7. 工事看板マスタの登録/編集/削除（R8.1）
 *  8. 看板配置: 看板登録→写真項目の「看板を配置」導線→ダイアログで看板選択→プレビュー上で配置
 *     →保存→再読込で看板割当インジケータが保持される（R9.1, R9.2, R9.5, R9.6）
 *  9. 看板割当ありの印刷対象でPDF出力（ダウンロード発火＋PDF非空, R10.1, R10.3）
 *
 * 縮退した要素（理由明記）:
 *  - 現調写真コピー（R6.1 の実データ複製）: 同一プロジェクト配下に画像付き現場調査を用意する
 *    前準備が重く、本フローの主眼（工事写真の追加→整列→出力）から外れるため、導線ボタンの
 *    存在確認に留める（アップロード自体はローカルで検証済み）。
 *  - 看板重畳PDFの画素検証（R10.3 の重畳結果の見た目）: 看板の印字・重畳はサーバ側の印字画像
 *    生成に委譲されるため、E2E ではダウンロード発火＋取得ファイルが .pdf かつ非空であることまで
 *    を検証し、重畳画像そのものの画素比較は行わない（サーバ側単体/統合テストの責務）。
 */

import { test, expect } from '@playwright/test';
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

test.describe('工事写真 主要ユーザーフロー', () => {
  // DB状態を跨いで共有するためシリアル実行
  test.describe.configure({ mode: 'serial' });

  // テスト間で共有する識別子（シリアル実行・DBは global-setup で一度だけ初期化）
  let projectId: string | null = null;
  let albumId: string | null = null;
  const albumName = `工事写真E2E_${Date.now()}`;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクトをUIで作成する（site-survey 規約踏襲）
   */
  test('事前準備: テスト用プロジェクトを作成する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /新規作成/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `工事写真E2E用プロジェクト_${Date.now()}`;
    await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

    // 営業担当者の選択（未選択なら先頭のユーザーを選ぶ）
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
    projectId = match?.[1] ?? null;
    expect(projectId).toBeTruthy();
  });

  /**
   * R2.1: プロジェクト詳細に工事写真パネルが「工程表パネルの直下」に表示される。
   * R1.1 / 6.1導線: パネルの空状態からアルバムを新規作成して一覧に反映される。
   */
  test('工事写真パネルが工程表直下に表示され、空状態からアルバムを作成できる', async ({ page }) => {
    expect(projectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const scheduleSection = page.getByTestId('schedule-section');
    const photoSection = page.getByTestId('construction-photo-section');
    await expect(scheduleSection).toBeVisible({ timeout: getTimeout(15000) });
    await expect(photoSection).toBeVisible();

    // R2.1: 工程表パネルの「直下」＝縦位置が工程表より下にあることを検証する
    const scheduleBox = await scheduleSection.boundingBox();
    const photoBox = await photoSection.boundingBox();
    expect(scheduleBox).not.toBeNull();
    expect(photoBox).not.toBeNull();
    expect(photoBox!.y).toBeGreaterThan(scheduleBox!.y);

    // 空状態（アルバム未作成）: 新規作成リンクから作成画面へ
    await expect(photoSection.getByText('工事写真はまだありません')).toBeVisible();
    await photoSection.getByRole('link', { name: '新規作成' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-photos/new$`), {
      timeout: getTimeout(10000),
    });

    // アルバム作成（R1.1）
    await page.getByLabel('アルバム名').fill(albumName);
    const createAlbumPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/construction-photos') &&
        response.request().method() === 'POST' &&
        (response.status() === 201 || response.status() === 200),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '作成' }).click();
    await createAlbumPromise;

    // 一覧へ遷移し、作成したアルバムが反映される（6.1導線）
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-photos$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByText(albumName).first()).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * R2.2: 工事写真パネル操作で一覧へ遷移する。
   * R2.4: 一覧項目選択で詳細画面へ遷移する。
   */
  test('パネル→一覧（すべて見る）→詳細（アルバム選択）へ遷移できる', async ({ page }) => {
    expect(projectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const photoSection = page.getByTestId('construction-photo-section');
    await expect(photoSection).toBeVisible({ timeout: getTimeout(15000) });

    // アルバムが1件以上あるため「すべて見る」リンクが表示される（R2.2）
    await photoSection.getByRole('link', { name: 'すべて見る' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-photos$`), {
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('heading', { name: '工事写真一覧' })).toBeVisible();

    // 一覧行の選択で詳細へ遷移し、albumId を取得（R2.4）
    await page.getByText(albumName).first().click();
    await page.waitForURL(/\/construction-photos\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
    const match = page.url().match(/\/construction-photos\/([0-9a-f-]+)$/);
    albumId = match?.[1] ?? null;
    expect(albumId).toBeTruthy();

    await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * R4.1: ローカルアップロードで写真項目を追加できる。
   * R5.1 / R6.1: カメラ入力・現調写真参照の導線が存在する（3系統アップローダ）。
   */
  test('3系統アップローダ: ローカルアップロードで写真項目を追加でき、カメラ/現調導線が存在する', async ({
    page,
  }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // R5.1: カメラ入力（capture=environment）が存在する
    const cameraInput = page.getByTestId('camera-input');
    await expect(cameraInput).toHaveCount(1);
    await expect(cameraInput).toHaveAttribute('capture', 'environment');

    // R6.1: 現調写真参照の導線が存在する（実複製は前準備が重いため導線確認に留める）
    await expect(page.getByRole('button', { name: /現場調査写真から選択/ })).toBeVisible();

    const items = page.getByTestId('construction-photo-item');

    // 1枚目のローカルアップロード（R4.1）
    const upload1 = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles(FIXTURE_JPG);
    await upload1;
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    // 2枚目のローカルアップロード
    const upload2 = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles(FIXTURE_PNG);
    await upload2;
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
  });

  /**
   * R10.13: 印刷対象が0件のときPDF出力は非実行で、その旨を通知する（ダウンロードは発生しない）。
   *
   * 直前のアップロード時点では印刷対象を未チェックのため0件。並び替え・印刷対象チェックの
   * テストより前に検証する。
   */
  test('印刷対象0件でPDF出力すると非実行で通知される', async ({ page }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });

    let downloadHappened = false;
    page.on('download', () => {
      downloadHappened = true;
    });

    await page.getByRole('button', { name: 'PDF出力' }).click();

    // 非実行通知（R10.13）
    await expect(
      page.getByRole('alert').filter({ hasText: '印刷対象の写真がありません' })
    ).toBeVisible({
      timeout: getTimeout(15000),
    });
    expect(downloadHappened).toBe(false);
  });

  /**
   * R7.3, R7.4: 並び替え（上へ移動）。
   * R7.5: 印刷対象チェック。
   * R7.1, R7.6, R11.4: 保存でメタ一括更新＋順序更新の最大2リクエストに束ねて確定し、永続化される。
   */
  test('並び替え＋印刷対象を1保存操作（最大2リクエスト）で確定でき、永続化される', async ({
    page,
  }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');

    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 画像はアップロード時に同名へ圧縮され得るため、fileNameではなく photo-id で識別する
    const idSecondBefore = await items.nth(1).getAttribute('data-photo-id');
    expect(idSecondBefore).toBeTruthy();

    // R7.3/R7.4: 2番目の項目を「上へ移動」して先頭へ
    await items.nth(1).getByRole('button', { name: '上へ移動' }).click();
    await expect(items.nth(0)).toHaveAttribute('data-photo-id', idSecondBefore!);

    // R7.5: 先頭（移動した項目）の印刷対象をチェック
    await items.nth(0).getByLabel('印刷対象に含める').check();

    // 未保存インジケータが表示される（R7.6）
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    await expect(saveButton).toBeEnabled();

    // R7.1/R7.6/R11.4: 保存はメタ一括(PATCH batch)＋順序(PUT order)の最大2リクエスト
    let batchCount = 0;
    let orderCount = 0;
    const onRequest = (req: import('@playwright/test').Request) => {
      const url = req.url();
      if (req.method() === 'PATCH' && url.includes('/api/construction-photos/images/batch')) {
        batchCount += 1;
      }
      if (req.method() === 'PUT' && /\/construction-photos\/.+\/images\/order$/.test(url)) {
        orderCount += 1;
      }
    };
    page.on('request', onRequest);

    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    const orderResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' && /\/construction-photos\/.+\/images\/order$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );

    await saveButton.click();
    await Promise.all([batchResp, orderResp]);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });
    page.off('request', onRequest);

    expect(batchCount).toBe(1);
    expect(orderCount).toBe(1);

    // 永続化検証: 再読み込みで順序と印刷対象が保持される
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(items.nth(0)).toHaveAttribute('data-photo-id', idSecondBefore!);
    await expect(items.nth(0).getByLabel('印刷対象に含める')).toBeChecked();
  });

  /**
   * R10.1: 印刷対象ありでPDF出力するとPDFがダウンロードされる。
   *
   * 前テストで先頭項目を印刷対象にしているため、ここでは印刷対象が1件以上ある。
   */
  test('印刷対象ありでPDF出力するとPDFがダウンロードされる', async ({ page }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });
    // 印刷対象が保持されていることを前提確認
    await expect(
      page.getByTestId('construction-photo-item').nth(0).getByLabel('印刷対象に含める')
    ).toBeChecked({ timeout: getTimeout(15000) });

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(45000) });
    await page.getByRole('button', { name: 'PDF出力' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  /**
   * R8.1: 工事看板マスタの登録／編集／削除ができる。
   */
  test('工事看板マスタを登録・編集・削除できる', async ({ page }) => {
    expect(projectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const workName = `E2E看板_${Date.now()}`;
    const workNameEdited = `${workName}_改`;

    // 新規登録（R8.1）
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(workName);
    await page.getByLabel('工事場所').fill('E2E工事現場');

    const createResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createResp;

    const createdRow = page.getByRole('row').filter({ hasText: workName });
    await expect(createdRow).toBeVisible({ timeout: getTimeout(15000) });
    await expect(createdRow).toContainText('未使用');

    // 編集（R8.1）
    await createdRow.getByRole('button', { name: '編集' }).click();
    await page.getByLabel('工事件名').fill(workNameEdited);
    const updateResp = page.waitForResponse(
      (r) =>
        (r.request().method() === 'PATCH' || r.request().method() === 'PUT') &&
        /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '更新' }).click();
    await updateResp;
    await expect(page.getByRole('row').filter({ hasText: workNameEdited })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 削除（R8.1）: 確認ダイアログで実行
    const editedRow = page.getByRole('row').filter({ hasText: workNameEdited });
    await editedRow.getByRole('button', { name: '削除' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const deleteResp = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '削除する' }).click();
    await deleteResp;
    await expect(page.getByRole('row').filter({ hasText: workNameEdited })).toHaveCount(0, {
      timeout: getTimeout(15000),
    });
  });

  // 看板配置フロー（R9.1）で選択・割当する工事看板の件名。
  // このテスト内で登録し、以降の配置/PDFテストで再利用するため削除しない。
  const assignSignboardName = `E2E配置看板_${Date.now()}`;

  /**
   * R9.1 / R9.2 / R9.5 / R9.6: 工事看板を登録し、詳細画面の写真項目へ「看板を配置」導線から
   * 看板を選択・プレビュー上で配置して保存。既存の最大2リクエスト（メタバッチ）で確定し、
   * 再読込後も看板割当インジケータが保持されることを検証する。
   *
   * 直前の「並び替え＋印刷対象」テストで先頭（data-photo-id=idSecondBefore）が印刷対象。
   * ここでは先頭項目へ看板を配置し、続くPDFテストで「看板割当ありの印刷対象」を成立させる。
   */
  test('看板を登録し、写真項目へ看板を配置して保存・永続化できる', async ({ page }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    // 1) 配置用の工事看板を登録（このテストでは削除しない=永続）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(assignSignboardName);
    await page.getByLabel('工事場所').fill('E2E看板配置現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: assignSignboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 2) 詳細画面へ遷移。先頭項目（印刷対象）へ看板を配置する
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    const targetItem = items.nth(0);
    // 配置前は看板割当インジケータが無い
    await expect(targetItem.getByTestId('signboard-indicator')).toHaveCount(0);

    // 「看板を配置」導線でダイアログを開く（R9.1）
    await targetItem.getByRole('button', { name: /看板を(配置|変更)/ }).click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });

    // 3) 看板を選択（R9.2）。選択で配置エディタに緑ボードRectが現れる
    await assignDialog
      .locator('#signboard-assign-select')
      .selectOption({ label: assignSignboardName });

    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    // エディタ側インジケータに選択看板名が反映される（選択が反映された確証）
    await expect(editor.getByTestId('signboard-indicator')).toContainText(assignSignboardName, {
      timeout: getTimeout(10000),
    });

    // 4) プレビュー上で配置（Rectをドラッグして移動＝配置操作, R9.1/R9.3）。
    //    座標の厳密検証は行わない（重畳はサーバ側委譲）。ドラッグはベストエフォート。
    const canvas = editor.locator('canvas').first();
    const canvasBox = await canvas.boundingBox();
    if (canvasBox) {
      const cx = canvasBox.x + canvasBox.width / 2;
      const cy = canvasBox.y + canvasBox.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + Math.min(40, canvasBox.width / 6), cy + 10, { steps: 8 });
      await page.mouse.up();
    }

    // 5) エディタの「保存」で配置を確定→親へ看板ID/配置を返しダイアログが閉じる（R9.5）
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });

    // 未保存インジケータが立つ（R7.6）
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // 6) 既存の保存フロー（メタバッチ）で確定（R9.5）
    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 7) 再読込で看板割当インジケータ（看板あり）が保持される（R9.6 永続化）
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(items.nth(0).getByTestId('signboard-indicator')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(items.nth(0).getByTestId('signboard-indicator')).toContainText('看板あり');
  });

  /**
   * R10.1 / R10.3: 看板割当ありの印刷対象を含むアルバムでPDF出力すると、
   * PDFがダウンロードされ、取得ファイルが .pdf かつ非空である。
   * （看板重畳の画素検証はサーバ側の印字画像生成に委譲されるため本E2Eでは行わない）
   *
   * 直前テストで先頭項目に看板を割当済み。かつ先頭項目は印刷対象のため、
   * 「看板割当あり かつ 印刷対象」の写真を含む状態でのPDF出力を検証する。
   */
  test('看板割当ありの印刷対象でPDF出力が発火し、PDFが非空である', async ({ page }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 前提: 先頭項目は「看板割当あり」かつ「印刷対象」
    await expect(items.nth(0).getByTestId('signboard-indicator')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(items.nth(0).getByLabel('印刷対象に含める')).toBeChecked();

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await page.getByRole('button', { name: 'PDF出力' }).click();
    const download = await downloadPromise;

    // .pdf であること（R10.1）
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    // PDF が非空であること（サーバ側で看板重畳込みの印字画像を含む台帳）
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    const size = fs.statSync(savedPath).size;
    expect(size).toBeGreaterThan(0);
  });
});
