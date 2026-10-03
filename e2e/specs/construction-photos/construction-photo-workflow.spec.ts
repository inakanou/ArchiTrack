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
 * 10. 使用中の看板を看板マスタで削除→詳細画面の写真項目が看板なしへ戻り、再読込でも保たれる（R9.7, R8.8）
 * 11. 看板マスタへの導線（タスク 23.2）: 看板が0件の「看板を配置」のダイアログの案内とリンク、
 *     未保存の変更があるときの離脱の確認、モバイル幅のはみ出しとタップ領域、プロジェクト詳細から
 *     クリックだけで看板マスタへ到達→登録→詳細画面へ戻って配置（R8.1, R8.10）
 *     看板の一覧の取得に失敗したときに「登録されていません」と偽らず失敗の文言を示す（是正 1 巡目）
 *     看板の一覧の取得中に看板の指定を変える操作を出さず、配置を消す保存を送らない（是正 2 巡目）
 * 12. カメラの導線の出し分け（タスク 23.5）: enumerateDevices を差し替え、videoinput の無い端末では
 *     カメラ撮影の導線を出さずローカルアップロードだけで追加でき（R5.3）、videoinput のある端末では
 *     導線を出す（R5.1）。権限ポリシーが camera を許さない文書では、videoinput の無い列挙でも導線を
 *     隠さない（R5.1、是正 1 巡目）
 *
 * 縮退した要素（理由明記）:
 *  - 現調写真コピー（R6.1 の実データ複製）: 同一プロジェクト配下に画像付き現場調査を用意する
 *    前準備が重く、本フローの主眼（工事写真の追加→整列→出力）から外れるため、導線ボタンの
 *    存在確認に留める（アップロード自体はローカルで検証済み）。
 *  - 看板重畳PDFの画素検証（R10.3 の重畳結果の見た目）: 看板の印字・重畳はサーバ側の印字画像
 *    生成に委譲されるため、E2E ではダウンロード発火＋取得ファイルが .pdf かつ非空であることまで
 *    を検証し、重畳画像そのものの画素比較は行わない（サーバ側単体/統合テストの責務）。
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { API_BASE_URL } from '../../config';

// ESモジュールでの __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');
const FIXTURE_PNG = path.join(__dirname, '../../fixtures/test-image.png');

/**
 * ページの読み込みより前に `navigator.mediaDevices.enumerateDevices()` を差し替え、
 * 指定した種類の機器だけを列挙する端末を作る（タスク 23.5, R5.3）。
 *
 * 許可の前の実ブラウザと同じく `deviceId` / `label` は空にする。呼び出し回数を
 * `window.__enumerateDevicesCalls` に数え、アプリが問い合わせたことを確かめられるようにする。
 * `navigator.mediaDevices` が無い環境では差し替えず、前提の確認で失敗させる。
 */
async function stubEnumerateDevices(page: Page, kinds: string[]): Promise<void> {
  await page.addInitScript((deviceKinds: string[]) => {
    const scope = window as unknown as { __enumerateDevicesCalls: number };
    scope.__enumerateDevicesCalls = 0;
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return;
    Object.defineProperty(mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: () => {
        scope.__enumerateDevicesCalls += 1;
        return Promise.resolve(
          deviceKinds.map((kind) => ({
            kind,
            deviceId: '',
            groupId: '',
            label: '',
            toJSON: () => ({}),
          }))
        );
      },
    });
  }, kinds);
}

/**
 * ページの読み込みより前に `document.permissionsPolicy.allowsFeature` を差し替え、
 * `camera` を許さない文書を作る（`Permissions-Policy: camera=()` の応答ヘッダー相当）。
 * 問い合わせの回数を `window.__cameraPolicyQueries` に数える。
 */
async function stubCameraDisallowedByPermissionsPolicy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as unknown as { __cameraPolicyQueries: number };
    scope.__cameraPolicyQueries = 0;
    Object.defineProperty(document, 'permissionsPolicy', {
      configurable: true,
      value: {
        allowsFeature: (feature: string) => {
          if (feature === 'camera') {
            scope.__cameraPolicyQueries += 1;
            return false;
          }
          return true;
        },
      },
    });
  });
}

/** アプリ（と本テスト）が権限ポリシーへ `camera` を問い合わせた回数 */
async function readCameraPolicyQueries(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __cameraPolicyQueries?: number }).__cameraPolicyQueries ?? 0
  );
}

/** アプリ（と本テスト）が `enumerateDevices` を呼んだ回数 */
async function readEnumerateDevicesCalls(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __enumerateDevicesCalls?: number }).__enumerateDevicesCalls ?? 0
  );
}

/** ページから見える `enumerateDevices` の列挙結果の種類 */
async function readEnumeratedKinds(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await navigator.mediaDevices.enumerateDevices()).map((device) => device.kind)
  );
}

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
    projectId = match?.[1] ?? null;
    expect(projectId).toBeTruthy();
  });

  /**
   * R2.1: プロジェクト詳細に工事写真パネルが「工程表パネルの直下」に表示される。
   * R1.1 / 6.1導線: パネルの空状態からアルバムを新規作成して一覧に反映される。
   *
   * @requirement construction-photo/REQ-2.1
   * @requirement construction-photo/REQ-1.1
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
   * R2.9: 一覧画面の画面タイトルを「工事写真一覧」として表示する。
   *
   * @requirement construction-photo/REQ-2.2
   * @requirement construction-photo/REQ-2.4
   * @requirement construction-photo/REQ-2.9
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
   *
   * @requirement construction-photo/REQ-4.1
   * @requirement construction-photo/REQ-5.1
   * @requirement construction-photo/REQ-6.1
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
   *
   * @requirement construction-photo/REQ-10.13
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
   * R7.4: 並び替え（上へ移動）。
   * R7.5: 印刷対象チェック。
   * R7.6, R11.4: 保存でメタ一括更新＋順序更新の最大2リクエストに束ねて確定する。
   * R7.8: 再読込で保存済みの表示順序が保持される（一覧の順序表示）。
   *
   * @requirement construction-photo/REQ-7.4
   * @requirement construction-photo/REQ-7.5
   * @requirement construction-photo/REQ-7.6
   * @requirement construction-photo/REQ-11.4
   * @requirement construction-photo/REQ-7.8
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
   *
   * @requirement construction-photo/REQ-10.1
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
   * R8.6: 編集して保存で工事看板レコードを更新する。
   * R8.7: 削除で当該工事看板を削除する。
   * R8.10: 一覧表示で当該プロジェクトに登録済みの工事看板を一覧表示する。
   *
   * @requirement construction-photo/REQ-8.1
   * @requirement construction-photo/REQ-8.6
   * @requirement construction-photo/REQ-8.7
   * @requirement construction-photo/REQ-8.10
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
   *
   * @requirement construction-photo/REQ-9.1
   * @requirement construction-photo/REQ-9.5
   * @requirement construction-photo/REQ-9.6
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

  /**
   * R9.7: 写真項目に関連付けられていた工事看板が削除されると、当該写真項目の看板の指定を解除し
   * 看板なしとして扱う。R8.8: 使用中の看板の削除では、使用件数を示して可否を確認する。
   *
   * 直前までのテストで、先頭の写真項目に `assignSignboardName` の看板を配置して保存済みである。
   * ここでは看板マスタでその看板を削除し、詳細画面の先頭の写真項目から「看板あり」の表示が消え、
   * 看板の操作ボタンの文言が「看板を配置」へ戻ること、再読込の後も写真一覧の API が看板の指定と
   * 配置を返さないことを確かめる。
   *
   * 看板の操作ボタンのアクセシブル名は aria-label（「看板を配置: <ファイル名>」）であり、看板の有無で
   * 変わるのは表示文言の側である。そのため、ボタンは aria-label で特定し、文言を `toHaveText` で主張する。
   * 看板マスタへは他のテストと同じく URL で直接入る（画面の導線は別タスクが足す）。
   *
   * @requirement construction-photo/REQ-9.7
   */
  test('使用中の看板を看板マスタで削除すると、写真項目の看板の指定が解除され看板なしになる', async ({
    page,
  }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    // 1) 前提: 先頭の写真項目は看板が指定されている（「看板あり」の表示と「看板を変更」の文言）
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    const targetItem = items.nth(0);
    const signboardButton = targetItem.getByRole('button', { name: /^看板を配置: / });
    await expect(targetItem.getByTestId('signboard-indicator')).toHaveText('看板あり', {
      timeout: getTimeout(15000),
    });
    await expect(signboardButton).toHaveText('看板を変更');

    // 2) 看板マスタで、使用中の看板を削除する。確認は使用件数を示す（R8.8）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /^工事看板マスタ$/ })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const signboardRow = page.getByRole('row').filter({ hasText: assignSignboardName });
    await expect(signboardRow).toHaveCount(1, { timeout: getTimeout(15000) });
    await expect(signboardRow).toContainText('1件');

    await signboardRow.getByRole('button', { name: /^削除$/ }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(deleteDialog).toContainText('1件の写真項目で使用中です');

    const deleteResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        /\/api\/construction-signboards\/[0-9a-f-]+$/.test(new URL(r.url()).pathname),
      { timeout: getTimeout(30000) }
    );
    await deleteDialog.getByRole('button', { name: /^削除する$/ }).click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBe(200);
    // 応答の使用件数は、看板の指定を解除した写真項目の件数である
    expect(await deleteResponse.json()).toEqual({ inUseCount: 1 });
    await expect(signboardRow).toHaveCount(0, { timeout: getTimeout(15000) });

    // 3) 詳細画面へ戻ると、先頭の写真項目は看板なしになっている（R9.7）
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(signboardButton).toHaveText('看板を配置', { timeout: getTimeout(15000) });
    await expect(targetItem.getByTestId('signboard-indicator')).toHaveCount(0);
    // サーバーの側の解除であり、画面に未保存の変更は生じない（R18）
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);

    // 4) 再読込の後も保たれる。写真一覧の API は看板の指定と配置を返さない（永続化）
    const listResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/construction-photos/${albumId}/images`,
      { timeout: getTimeout(30000) }
    );
    await page.reload();
    const listResponse = await listResponsePromise;
    expect(listResponse.status()).toBe(200);
    const listedPhotos = (await listResponse.json()) as Array<{
      signboardId: string | null;
      signboardPlacement: unknown;
    }>;
    expect(
      listedPhotos.map((p) => ({
        signboardId: p.signboardId,
        signboardPlacement: p.signboardPlacement,
      }))
    ).toEqual([
      { signboardId: null, signboardPlacement: null },
      { signboardId: null, signboardPlacement: null },
    ]);

    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(signboardButton).toHaveText('看板を配置', { timeout: getTimeout(15000) });
    await expect(targetItem.getByTestId('signboard-indicator')).toHaveCount(0);
  });

  // ==========================================================================
  // タスク 23.2: 看板マスタの画面へ画面の操作だけで到達できる
  //
  // 看板マスタ（`/projects/:projectId/construction-signboards`）の導線は二つある。
  //  - 常設: 工事写真一覧の見出しの行のリンク「工事看板マスタ」（看板マスタのブレッドクラムは
  //    工事写真一覧の配下に位置し、看板はプロジェクト単位で登録するため）
  //  - 文脈: 詳細画面の「看板を配置」のダイアログのリンク「工事看板マスタを開く」。看板が0件の
  //    ときは、選択肢が「未指定」だけになる理由の案内を添える
  // 以下のテストは、看板マスタへ `page.goto` で入らない。直前のテスト（R9.7）が配置済みの看板を
  // 取り除いたため、この時点で当該プロジェクトの看板は0件である（下で前提として主張する）。
  // ==========================================================================

  const EMPTY_SIGNBOARD_GUIDANCE = 'このプロジェクトには工事看板が登録されていません';

  /**
   * 看板が0件のプロジェクトで「看板を配置」を開くと、案内と看板マスタへのリンクが出る。
   * 未保存の変更があるときは、リンクを押しても離脱の確認（R18.2）を経てからしか遷移しない。
   * 「とどまる」で詳細画面と未保存の状態が保たれ、「離れる」で看板マスタへ遷移する。
   */
  test('看板が0件で「看板を配置」を開くと案内と看板マスタへのリンクが出て、未保存の変更があれば離脱の確認を経て看板マスタへ遷移する', async ({
    page,
  }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 未保存の変更を作る（印刷対象の切り替え）
    await items.nth(1).getByLabel('印刷対象に含める').click();
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // 1) 看板が0件のダイアログ: 選択肢は「未指定」だけで、案内とリンクが出る
    const signboardButton = items.nth(0).getByRole('button', { name: /^看板を配置: / });
    await signboardButton.click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    const options = assignDialog.locator('#signboard-assign-select option');
    await expect(options).toHaveCount(1);
    await expect(options).toHaveText(['未指定']);
    await expect(assignDialog.getByText(EMPTY_SIGNBOARD_GUIDANCE)).toBeVisible();
    const masterLink = assignDialog.getByRole('link', { name: '工事看板マスタを開く' });
    await expect(masterLink).toHaveAttribute(
      'href',
      `/projects/${projectId}/construction-signboards`
    );

    // 2) 未保存の変更があるので、リンクを押すと離脱の確認が出る。「とどまる」で詳細画面に残る
    await masterLink.click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    const unsavedDialog = page.getByRole('dialog', { name: '変更が保存されていません' });
    await expect(unsavedDialog).toBeVisible({ timeout: getTimeout(10000) });
    await unsavedDialog.getByRole('button', { name: 'このページにとどまる' }).click();
    await expect(unsavedDialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${albumId}$`));
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    // 3) もう一度リンクを押し、「ページを離れる」を選ぶと看板マスタへ遷移する
    await signboardButton.click();
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await masterLink.click();
    await expect(unsavedDialog).toBeVisible({ timeout: getTimeout(10000) });
    await unsavedDialog.getByRole('button', { name: 'ページを離れる' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-signboards$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('heading', { name: /^工事看板マスタ$/ })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByText('登録済みの工事看板はありません')).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * モバイル幅（375・320）で、工事写真一覧の看板マスタへのリンクと、看板の配置のダイアログの
   * 案内とリンクが水平にはみ出さない。ダイアログのリンクは 44×44 以上のタップ領域を持つ
   * （横断ルールの下限。検証の側は 44 を自前で綴る）。看板は0件のままで、案内が出る状態を測る。
   */
  test('モバイル幅（375・320）で看板マスタへのリンクと看板が0件の案内が水平にはみ出さず、ダイアログのリンクは 44×44 以上のタップ領域を持つ', async ({
    page,
  }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    // 検証の側の下限。実装の定数は取り込まない
    const TAP_TARGET_MIN_PX = 44;
    const HORIZONTAL_TOLERANCE_PX = 1;
    await loginAsUser(page, 'ADMIN_USER');

    interface Measurement {
      viewportWidth: number;
      documentScrollWidth: number;
      documentClientWidth: number;
      mainScrollWidth: number;
      mainClientWidth: number;
      targets: Array<{
        name: string;
        left: number;
        right: number;
        textLeft: number;
        textRight: number;
        width: number;
        height: number;
      }>;
    }

    /** 文書・<main> の横幅と、対象の要素の外接矩形・文字列の端（DOM Range）を測る */
    const measure = async (selectors: Array<{ name: string; selector: string }>) =>
      page.evaluate((sels): Measurement => {
        const main = document.querySelector('main');
        return {
          viewportWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          mainScrollWidth: main ? main.scrollWidth : -1,
          mainClientWidth: main ? main.clientWidth : -1,
          targets: sels.map(({ name, selector }) => {
            const el = document.querySelector(selector);
            if (!el) {
              return {
                name,
                left: NaN,
                right: NaN,
                textLeft: NaN,
                textRight: NaN,
                width: NaN,
                height: NaN,
              };
            }
            const r = el.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(el);
            const t = range.getBoundingClientRect();
            return {
              name,
              left: r.left,
              right: r.right,
              textLeft: t.left,
              textRight: t.right,
              width: r.width,
              height: r.height,
            };
          }),
        };
      }, selectors);

    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });

      // 1) 工事写真一覧: 見出しの行の看板マスタへのリンク
      await page.goto(`/projects/${projectId}/construction-photos`);
      await page.waitForLoadState('networkidle');
      const listLink = page.getByRole('link', { name: '工事看板マスタ' });
      await expect(listLink).toBeVisible({ timeout: getTimeout(15000) });
      await expect(listLink).toHaveAttribute(
        'href',
        `/projects/${projectId}/construction-signboards`
      );
      const listMeasurement = await measure([
        {
          name: '一覧のリンク',
          selector: `main a[href="/projects/${projectId}/construction-signboards"]`,
        },
      ]);
      expect(listMeasurement.viewportWidth).toBe(width);
      expect(listMeasurement.documentScrollWidth).toBeLessThanOrEqual(
        listMeasurement.documentClientWidth + HORIZONTAL_TOLERANCE_PX
      );
      expect(listMeasurement.mainScrollWidth).toBeLessThanOrEqual(
        listMeasurement.mainClientWidth + HORIZONTAL_TOLERANCE_PX
      );
      expect(listMeasurement.targets).toHaveLength(1);
      for (const target of listMeasurement.targets) {
        expect(target.left).toBeGreaterThanOrEqual(0);
        expect(target.right).toBeLessThanOrEqual(width + HORIZONTAL_TOLERANCE_PX);
        expect(target.textLeft).toBeGreaterThanOrEqual(0);
        expect(target.textRight).toBeLessThanOrEqual(width + HORIZONTAL_TOLERANCE_PX);
      }

      // 2) 詳細画面の「看板を配置」のダイアログ: 案内とリンク
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      const items = page.getByTestId('construction-photo-item');
      await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
      await items
        .nth(0)
        .getByRole('button', { name: /^看板を配置: / })
        .click();
      const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
      await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
      await expect(assignDialog.getByText(EMPTY_SIGNBOARD_GUIDANCE)).toBeVisible();
      await expect(assignDialog.getByRole('link', { name: '工事看板マスタを開く' })).toBeVisible();

      const dialogMeasurement = await measure([
        {
          name: 'ダイアログのリンク',
          selector: '[role="dialog"] a[data-testid="signboard-master-link"]',
        },
        {
          name: '看板が0件の案内',
          selector: '[role="dialog"] [data-testid="signboard-empty-guidance"]',
        },
        {
          name: 'ダイアログの本体',
          selector: '[role="dialog"] [data-testid="signboard-assign-content"]',
        },
      ]);
      expect(dialogMeasurement.documentScrollWidth).toBeLessThanOrEqual(
        dialogMeasurement.documentClientWidth + HORIZONTAL_TOLERANCE_PX
      );
      expect(dialogMeasurement.targets).toHaveLength(3);
      const [link, guidance, content] = dialogMeasurement.targets;
      // 本体は画面内に収まり、案内とリンクは本体の内側に収まる（文字列の端も含む）
      expect(content!.left).toBeGreaterThanOrEqual(0);
      expect(content!.right).toBeLessThanOrEqual(width + HORIZONTAL_TOLERANCE_PX);
      for (const target of [link!, guidance!]) {
        expect(target.left).toBeGreaterThanOrEqual(content!.left - HORIZONTAL_TOLERANCE_PX);
        expect(target.right).toBeLessThanOrEqual(content!.right + HORIZONTAL_TOLERANCE_PX);
        expect(target.textLeft).toBeGreaterThanOrEqual(content!.left - HORIZONTAL_TOLERANCE_PX);
        expect(target.textRight).toBeLessThanOrEqual(content!.right + HORIZONTAL_TOLERANCE_PX);
      }
      // ダイアログのリンクのタップ領域
      expect(link!.width).toBeGreaterThanOrEqual(TAP_TARGET_MIN_PX);
      expect(link!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN_PX);
    }
  });

  // 画面の操作だけで登録し配置する工事看板の件名
  const navigatedSignboardName = `E2E導線看板_${Date.now()}`;

  /**
   * プロジェクト詳細から、クリックだけで 工事写真パネル → 工事写真一覧 → 工事看板マスタ へ到達し、
   * 看板を登録する（R8.1）。登録した看板は看板マスタの一覧に表示される（R8.10）。続けて、
   * クリックだけで 工事写真一覧 → 詳細画面 へ戻り、登録した看板を「看板を配置」の選択肢から選んで
   * 写真項目へ配置し、保存する。
   *
   * @requirement construction-photo/REQ-8.1
   * @requirement construction-photo/REQ-8.10
   */
  test('プロジェクト詳細から画面の操作だけで看板マスタへ到達して看板を登録し、詳細画面へ戻って写真項目へ配置できる', async ({
    page,
  }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    // 1) プロジェクト詳細 → 工事写真パネルの「すべて見る」→ 工事写真一覧
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    const photoSection = page.getByTestId('construction-photo-section');
    await expect(photoSection).toBeVisible({ timeout: getTimeout(15000) });
    await photoSection.getByRole('link', { name: 'すべて見る' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-photos$`), {
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('heading', { name: '工事写真一覧' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 2) 工事写真一覧 → 「工事看板マスタ」のリンク → 看板マスタ
    await page.getByRole('link', { name: '工事看板マスタ' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-signboards$`), {
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('heading', { name: /^工事看板マスタ$/ })).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 前提: この時点の看板は0件である
    await expect(page.getByText('登録済みの工事看板はありません')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 3) 看板を新規登録する（R8.1）。一覧に表示される（R8.10）
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(navigatedSignboardName);
    await page.getByLabel('工事場所').fill('E2E導線現場');
    const createResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/projects/${projectId}/construction-signboards`,
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const createdRow = page.getByRole('row').filter({ hasText: navigatedSignboardName });
    await expect(createdRow).toHaveCount(1, { timeout: getTimeout(15000) });
    await expect(createdRow).toContainText('E2E導線現場');

    // 4) 「工事写真一覧に戻る」→ アルバムを選ぶ → 詳細画面
    await page.getByRole('link', { name: /工事写真一覧に戻る/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-photos$`), {
      timeout: getTimeout(10000),
    });
    await page.getByText(albumName).first().click();
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${albumId}$`), {
      timeout: getTimeout(15000),
    });
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 5) 「看板を配置」の選択肢に登録した看板が並び、0件の案内は出ない
    const targetItem = items.nth(0);
    await targetItem.getByRole('button', { name: /^看板を配置: / }).click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    const options = assignDialog.locator('#signboard-assign-select option');
    await expect(options).toHaveText(['未指定', navigatedSignboardName]);
    await expect(assignDialog.getByText(EMPTY_SIGNBOARD_GUIDANCE)).toHaveCount(0);

    // 6) 選んで配置し、保存する
    await assignDialog
      .locator('#signboard-assign-select')
      .selectOption({ label: navigatedSignboardName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor.getByTestId('signboard-indicator')).toContainText(navigatedSignboardName, {
      timeout: getTimeout(10000),
    });
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    const batchResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === '/api/construction-photos/images/batch',
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const batchResponse = await batchResponsePromise;
    expect(batchResponse.status()).toBe(200);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 7) 再読込の後も配置は保たれる
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(targetItem.getByTestId('signboard-indicator')).toHaveText('看板あり', {
      timeout: getTimeout(15000),
    });
  });

  /**
   * 看板の一覧の取得に失敗したときは、看板が登録済みのプロジェクトで「登録されていません」と
   * 偽って述べない。失敗の文言を role=alert で示す（是正 1 巡目）。直前のテストで看板を1件登録済みで
   * ある。取得の失敗は `page.route` で看板の一覧の GET に 500 を返して作る。経路の照合と応答の
   * ハンドラは参照で共有し、`unroute` で外したあとに同じ画面で看板が選択肢に並ぶこと
   * （＝前提として看板が実在すること）を確かめる。
   */
  test('看板の一覧の取得に失敗すると、看板が登録済みのプロジェクトで「登録されていません」と述べず、失敗の文言を示す', async ({
    page,
  }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    const signboardListPath = `/api/projects/${projectId}/construction-signboards`;
    let failedResponses = 0;
    const isSignboardListRequest = (url: URL): boolean => url.pathname === signboardListPath;
    const failSignboardList = async (route: import('@playwright/test').Route): Promise<void> => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      failedResponses += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    };
    await page.route(isSignboardListRequest, failSignboardList);

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect.poll(() => failedResponses, { timeout: getTimeout(15000) }).toBeGreaterThan(0);

    const signboardButton = items.nth(1).getByRole('button', { name: /^看板を配置: / });
    await signboardButton.click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(assignDialog.getByRole('alert')).toHaveText(
      '工事看板を読み込めませんでした。時間をおいて再度お試しください。'
    );
    await expect(assignDialog.getByText(EMPTY_SIGNBOARD_GUIDANCE)).toHaveCount(0);
    await assignDialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });

    // 前提の確認: 失敗を外して読み込み直すと、登録済みの看板が選択肢に並ぶ
    await page.unroute(isSignboardListRequest, failSignboardList);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await signboardButton.click();
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(assignDialog.locator('#signboard-assign-select option')).toHaveText([
      '未指定',
      navigatedSignboardName,
    ]);
    await expect(assignDialog.getByRole('alert')).toHaveCount(0);
  });

  /**
   * 看板の一覧の取得中に、看板の指定と配置を持つ写真項目の「看板を変更」を開いても、看板の指定を
   * 変える・解除する操作は出ず、配置を消す保存は送られない（是正 2 巡目）。一覧が届くと、選択は
   * 写真項目の現在の看板を指し、操作できるようになる。読み込み直した後も配置は保たれている。
   *
   * 取得中の窓は、看板の一覧の GET を、テストが解き放つまで待たせる `page.route` で作る（固定の
   * 待ち時間は使わない）。経路の照合と応答のハンドラは参照で共有し、`unroute` で外す。直前までの
   * テストで、先頭の写真項目に看板（`navigatedSignboardName`）を指定済みである。配置はエディタで
   * 動かさずに保存すると null のまま残るため、本テストの冒頭で API から配置を与えておく。
   */
  test('看板の一覧の取得中は「看板を変更」のダイアログで看板の指定を変える操作が出ず、配置を消す保存は送られず、一覧が届くと現在の看板が選ばれる', async ({
    page,
  }) => {
    expect(projectId).toBeTruthy();
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    // 0) 準備: 先頭の写真項目に配置を与える（看板の指定は直前のテストのまま）
    const seededPlacement = { left: 10, top: 20, width: 200, height: 150 };
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const preparedItems = page.getByTestId('construction-photo-item');
    await expect(preparedItems).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(preparedItems.nth(0).getByTestId('signboard-indicator')).toHaveText('看板あり', {
      timeout: getTimeout(15000),
    });
    const seededPhotoId = await preparedItems.nth(0).getAttribute('data-photo-id');
    expect(seededPhotoId).toBeTruthy();
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();
    const seedResponse = await page.request.patch(
      `${API_BASE_URL}/api/construction-photos/images/batch`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { items: [{ id: seededPhotoId, signboardPlacement: seededPlacement }] },
      }
    );
    expect(seedResponse.status()).toBe(200);

    const signboardListPath = `/api/projects/${projectId}/construction-signboards`;
    let releaseSignboardList: () => void = () => {};
    const signboardListGate = new Promise<void>((resolve) => {
      releaseSignboardList = resolve;
    });
    let heldRequests = 0;
    const isSignboardListRequest = (url: URL): boolean => url.pathname === signboardListPath;
    const holdSignboardList = async (route: import('@playwright/test').Route): Promise<void> => {
      if (route.request().method() === 'GET') {
        heldRequests += 1;
        await signboardListGate;
      }
      await route.fallback();
    };
    await page.route(isSignboardListRequest, holdSignboardList);

    // 写真項目のメタの一括更新（配置を消しうる保存）の送信を数える
    const batchRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/construction-photos/images/batch'
      ) {
        batchRequests.push(request.postData() ?? '');
      }
    });

    interface ListedPhoto {
      id: string;
      signboardId: string | null;
      signboardPlacement: { left: number; top: number; width: number; height: number } | null;
    }
    const photoListPath = `/api/construction-photos/${albumId}/images`;
    const isPhotoListResponse = (r: import('@playwright/test').Response): boolean =>
      r.request().method() === 'GET' && new URL(r.url()).pathname === photoListPath;

    // 1) 前提: 先頭の写真項目は看板の指定と配置を持つ
    const firstListPromise = page.waitForResponse(isPhotoListResponse, {
      timeout: getTimeout(30000),
    });
    await page.goto(`/construction-photos/${albumId}`);
    const firstList = (await (await firstListPromise).json()) as ListedPhoto[];
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    const targetPhotoId = await items.nth(0).getAttribute('data-photo-id');
    expect(targetPhotoId).toBeTruthy();
    const before = firstList.filter((p) => p.id === targetPhotoId);
    expect(before).toHaveLength(1);
    expect(before[0]!.signboardId).toBeTruthy();
    expect(before[0]!.signboardPlacement).toEqual(seededPlacement);
    await expect.poll(() => heldRequests, { timeout: getTimeout(15000) }).toBeGreaterThan(0);

    // 2) 取得中に「看板を変更」を開く: 選択は操作できず現在の看板を指し、配置エディタは出ない
    const signboardButton = items.nth(0).getByRole('button', { name: /^看板を配置: / });
    await expect(signboardButton).toHaveText('看板を変更');
    await signboardButton.click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    const select = assignDialog.locator('#signboard-assign-select');
    await expect(select).toBeDisabled();
    await expect(select).toHaveValue(before[0]!.signboardId!);
    await expect(assignDialog.getByRole('status')).toHaveText(/工事看板を読み込んでいます/);
    await expect(assignDialog.getByTestId('signboard-placement-editor')).toHaveCount(0);
    await expect(assignDialog.getByRole('button', { name: 'キャンセル' })).toBeEnabled();

    // 3) キャンセルしても未保存にはならず、画面の「保存」は押せない（配置を消す保存は送られない）
    await assignDialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    expect(batchRequests).toEqual([]);

    // 4) 取得中にもう一度開き、一覧を届けると、現在の看板が選ばれた状態で操作できるようになる
    await signboardButton.click();
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(select).toBeDisabled();
    releaseSignboardList();
    await expect(select).toBeEnabled({ timeout: getTimeout(15000) });
    await expect(select).toHaveValue(before[0]!.signboardId!);
    await expect(
      assignDialog.getByTestId('signboard-placement-editor').getByTestId('signboard-indicator')
    ).toContainText(navigatedSignboardName, { timeout: getTimeout(10000) });
    await assignDialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    expect(batchRequests).toEqual([]);

    // 5) 読み込み直した後も、看板の指定と配置は元のまま保たれている
    await page.unroute(isSignboardListRequest, holdSignboardList);
    const secondListPromise = page.waitForResponse(isPhotoListResponse, {
      timeout: getTimeout(30000),
    });
    await page.reload();
    const secondList = (await (await secondListPromise).json()) as ListedPhoto[];
    const after = secondList.filter((p) => p.id === targetPhotoId);
    expect(after).toHaveLength(1);
    expect(after[0]!.signboardId).toBe(before[0]!.signboardId);
    expect(after[0]!.signboardPlacement).toEqual(before[0]!.signboardPlacement);
    await expect(items.nth(0).getByTestId('signboard-indicator')).toHaveText('看板あり', {
      timeout: getTimeout(15000),
    });
    expect(batchRequests).toEqual([]);
  });

  /**
   * R5.3: カメラをサポートしない端末では、カメラ撮影による追加手段を提供せず、ローカル
   * アップロード手段のみを提示する（タスク 23.5）。
   *
   * 端末のカメラの有無は `navigator.mediaDevices.enumerateDevices()` の `videoinput` で
   * 判定する。ページの読み込みより前に `enumerateDevices` を差し替え、機器は列挙されるが
   * `videoinput` が無い端末を作る。差し替えが効いていることを前提として主張する。
   * 本テストは写真項目を 1 件足すため、写真項目の件数を 2 件と前提する他のテストより後に置く。
   *
   * @requirement construction-photo/REQ-5.3
   */
  test('カメラをサポートしない端末では、カメラ撮影の導線を出さずローカルアップロードだけで写真項目を追加できる', async ({
    page,
  }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');
    await stubEnumerateDevices(page, ['audioinput', 'audiooutput']);

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 前提: アプリが端末へ問い合わせ、差し替えた列挙（videoinput 無し）を受け取っている
    await expect
      .poll(() => readEnumerateDevicesCalls(page), { timeout: getTimeout(10000) })
      .toBeGreaterThan(0);
    expect(await readEnumeratedKinds(page)).toEqual(['audioinput', 'audiooutput']);

    // カメラ撮影の手段（ボタンと capture 付きの入力）が提供されない
    const uploader = page.getByTestId('photo-uploader');
    await expect(uploader).toBeVisible();
    await expect(uploader.getByTestId('camera-button')).toHaveCount(0, {
      timeout: getTimeout(10000),
    });
    await expect(uploader.getByTestId('camera-input')).toHaveCount(0);
    await expect(uploader.locator('input[capture]')).toHaveCount(0);

    // ローカルアップロードの手段は提示され、選択した画像が写真項目として追加される
    await expect(uploader.getByTestId('upload-area')).toBeVisible();
    const fileInput = uploader.getByTestId('file-input');
    await expect(fileInput).toHaveCount(1);
    const upload = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/construction-photos\/.+\/images$/.test(new URL(r.url()).pathname),
      { timeout: getTimeout(30000) }
    );
    await fileInput.setInputFiles(FIXTURE_JPG);
    expect((await upload).status()).toBeLessThan(300);
    await expect(items).toHaveCount(3, { timeout: getTimeout(20000) });

    // 判定の後も導線は出ないまま（アップロードの後の再描画で戻らない）
    await expect(uploader.getByTestId('camera-button')).toHaveCount(0);
  });

  /**
   * R5.1: カメラを持つ端末では、ローカルアップロードに加えてカメラ撮影の導線を出す
   * （タスク 23.5 の出し分けがカメラを持つ端末から撮影の手段を奪わないこと）。
   *
   * 判定の前（unknown）も導線は出るため、アプリが差し替えた列挙を受け取ったことを
   * 確かめてから主張する。
   *
   * @requirement construction-photo/REQ-5.1
   */
  test('カメラを持つ端末では、カメラ撮影の導線とローカルアップロードの両方を出す', async ({
    page,
  }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');
    await stubEnumerateDevices(page, ['audioinput', 'videoinput']);

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await expect
      .poll(() => readEnumerateDevicesCalls(page), { timeout: getTimeout(10000) })
      .toBeGreaterThan(0);
    expect(await readEnumeratedKinds(page)).toEqual(['audioinput', 'videoinput']);

    const uploader = page.getByTestId('photo-uploader');
    await expect(uploader.getByTestId('camera-button')).toBeVisible();
    await expect(uploader.getByTestId('camera-button')).toHaveText('カメラで撮影');
    await expect(uploader.getByTestId('camera-input')).toHaveAttribute('capture', 'environment');
    await expect(uploader.getByTestId('upload-area')).toBeVisible();
    await expect(uploader.getByTestId('file-input')).toHaveCount(1);
  });

  /**
   * R5.1: 権限ポリシーが `camera` を許さない文書では、カメラを持つ端末でも列挙から
   * `videoinput` が省かれる（W3C Media Capture and Streams）。`capture` 付きのファイル入力は
   * このポリシーの対象外であるため、その列挙を信じて導線を隠さない（タスク 23.5 の是正）。
   *
   * @requirement construction-photo/REQ-5.1
   */
  test('権限ポリシーが camera を許さない文書では、videoinput の無い列挙でもカメラ撮影の導線を隠さない', async ({
    page,
  }) => {
    expect(albumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');
    await stubCameraDisallowedByPermissionsPolicy(page);
    await stubEnumerateDevices(page, ['audioinput']);

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 前提: アプリが権限ポリシーへ camera を問い合わせ、許されないと答えられている
    await expect
      .poll(() => readCameraPolicyQueries(page), { timeout: getTimeout(10000) })
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() =>
        (
          document as unknown as { permissionsPolicy: { allowsFeature: (f: string) => boolean } }
        ).permissionsPolicy.allowsFeature('camera')
      )
    ).toBe(false);
    expect(await readEnumeratedKinds(page)).toEqual(['audioinput']);

    const uploader = page.getByTestId('photo-uploader');
    await expect(uploader.getByTestId('camera-button')).toBeVisible();
    await expect(uploader.getByTestId('camera-input')).toHaveAttribute('capture', 'environment');
    await expect(uploader.getByTestId('upload-area')).toBeVisible();
  });
});
