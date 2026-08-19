/**
 * @fileoverview 現場調査画像の一括エクスポート E2E テスト
 *
 * Requirements coverage (site-survey):
 * - 31.1: 詳細画面の「全件一括エクスポート」で全画像を対象に開始する
 * - 31.2: 画像を選択した状態の「選択画像エクスポート」で選択画像のみを対象に開始する
 * - 31.3: 1 件も選択していない間は「選択画像エクスポート」を非活性として表示する
 * - 31.7: 対象画像群を単一の ZIP ファイルとしてダウンロード可能にする
 * - 31.8: ZIP 内の各画像ファイル名を個別エクスポートと整合する規則に統一する
 * - 31.9: ZIP ファイル名を現場調査名と実行日時が識別可能な形式で生成する
 * - 31.10: 進行中の進捗状況（件数・割合）を可視化する
 * - 31.11: 進行中の処理をキャンセル可能にする
 * - 31.12: キャンセル時は処理を中断し ZIP を生成しない
 *
 * Task 115.48（AI運用7原則 第3原則）:
 *   本 spec は以前 `E2E_SURVEY_ID` / `E2E_IMAGE_IDS` の有無で `test.skip` する構成であり、
 *   当該環境変数はリポジトリのどこにも設定されていないため全件が恒久的に飛ばされていた。
 *   前提となるプロジェクト・現場調査・画像は検証の中で用意する。用意できない場合は
 *   飛ばさずに失敗させる。
 *
 * 進捗・キャンセルの観測は、画像本体（署名付き URL）の応答を検証側から明示的に
 * 解放するまで保留させることで決定的にする（時間待ちに依存しない）。
 *
 * Task 115.66:
 *   要件31.2 / 31.3 の「選択」は常に *いま開いている現場調査* の画像一覧に対するものである。
 *   別の現場調査へ移ったときに選択が持ち越されないことは単体の検証しか無かったため、
 *   実ブラウザで調査A → 調査B の画面遷移を通す検証 (e) を追加する。
 *   遷移は利用者が実際に通る導線（詳細のパンくず「現場調査一覧」→ 一覧で調査Bを選ぶ）を
 *   使い、途中で画面が再読み込みされていない（SPA 内遷移である）ことも併せて確かめる。
 *
 * Task 115.86:
 *   115.66 が足した検証 (e) は *最終状態* しか主張していなかった。選択を画面より上へ
 *   持ち上げ、移動先の一覧を取得し終えてから整理して消す実装へ退行すると、移動先では
 *   「選択画像エクスポート」が一瞬だけ活性で描画されてしまう。要件31.3 は「1 件も
 *   選択していない間」の非活性を求めており、この一瞬も違反である。にもかかわらず
 *   最終状態だけを見る検証は緑のままになる。
 *   そこで移動先の調査の詳細取得の応答を保留し、保留したまま
 *     (1) 活性な「選択画像エクスポート」が一つも提示されていないこと
 *     (2) 以降に描かれる「選択画像エクスポート」を漏れなく記録する観測を仕掛けること
 *   を行ってから応答を解放する。記録は移動先の画面が何かを描くより前に必ず仕掛かるため、
 *   「最初に描かれた状態が 0 件かつ非活性であること」を取りこぼしなく主張できる。
 *   時間待ちで過渡状態を狙い撃つ必要が無く、間欠的な失敗を作らない。
 *
 * @requirement site-survey/REQ-31.1
 * @requirement site-survey/REQ-31.2
 * @requirement site-survey/REQ-31.3
 * @requirement site-survey/REQ-31.7
 * @requirement site-survey/REQ-31.8
 * @requirement site-survey/REQ-31.9
 * @requirement site-survey/REQ-31.10
 * @requirement site-survey/REQ-31.11
 * @requirement site-survey/REQ-31.12
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext, type Route } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 検証で用意する画像枚数（選択エクスポートの 3 件検証に足りる枚数） */
const FIXTURE_IMAGE_COUNT = 3;

/**
 * ZIP の中央ディレクトリを解析して収録エントリ名を取り出す。
 *
 * 解凍ライブラリを新規に導入せず、ZIP の終端レコード（EOCD）と中央ディレクトリを
 * 直接読むことで、収録件数と命名規則（Req 31.7 / 31.8）を厳密に検証する。
 */
function readZipEntryNames(buffer: Buffer): string[] {
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('ZIP の終端レコード（EOCD）が見つかりません');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`ZIP の中央ディレクトリが不正です（entry ${i}）`);
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return names;
}

test.describe('現場調査画像の一括エクスポート', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdSurveyName = '';
  /** アップロードした画像 ID（選択エクスポートの対象指定に使う） */
  const uploadedImageIds: string[] = [];
  /** 現場調査をまたぐ遷移先（調査B）。同一プロジェクト配下に用意する (Task 115.66) */
  let secondSurveyId: string | null = null;
  let secondSurveyName = '';
  /** 調査B の画像 ID（調査B でも選択欄が描画される状態を作るために 1 枚用意する） */
  let secondSurveyImageId: string | null = null;

  /**
   * 一括エクスポートが読み出す画像本体（`/storage/surveys/<surveyId>/...` の原本）だけを
   * 対象に、応答を検証側の合図まで保留する関門を仕掛ける。
   *
   * サムネイル（`_thumb_` を含むキー）は詳細画面の表示に必要なため対象外にする。
   *
   * @param passThroughCount 保留せずに素通しする先頭リクエスト数
   * @returns 保留を解放する関数（呼ぶまで以降のリクエストは応答しない）
   */
  async function holdOriginalImageResponses(passThroughCount: number): Promise<() => void> {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seen = 0;

    await sharedPage.route(
      (url) =>
        url.pathname.includes(`/surveys/${createdSurveyId}/`) && !url.pathname.includes('_thumb_'),
      async (route) => {
        seen += 1;
        if (seen > passThroughCount) {
          await gate;
        }
        await route.continue();
      }
    );

    return release;
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();
    await loginAsUser(sharedPage, 'REGULAR_USER');

    // --- プロジェクト作成 ---
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `一括エクスポートE2E用PJ_${Date.now()}`;
    await sharedPage.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);
    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    const createProjectPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );
    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createProjectPromise;

    await sharedPage.waitForURL(/\/projects\/[0-9a-f-]+$/);
    createdProjectId = sharedPage.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
    expect(createdProjectId).toBeTruthy();

    // --- 現場調査作成 ---
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    createdSurveyName = `一括エクスポートE2E用調査_${Date.now()}`;
    await sharedPage.getByLabel(/調査名/i).fill(createdSurveyName);
    await sharedPage.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

    const createSurveyPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/') &&
        response.url().includes('site-surveys') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createSurveyPromise;

    await sharedPage.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
    createdSurveyId = sharedPage.url().match(/\/site-surveys\/([0-9a-f-]+)$/)?.[1] ?? null;
    expect(createdSurveyId).toBeTruthy();

    // --- 画像を API で直接アップロード（一括エクスポートの対象を用意する） ---
    const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
    expect(fs.existsSync(testImagePath)).toBeTruthy();
    const imageBuffer = fs.readFileSync(testImagePath);
    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));

    for (let i = 0; i < FIXTURE_IMAGE_COUNT; i++) {
      const uploadResponse = await sharedPage.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            images: {
              name: `bulk-export-${i + 1}.png`,
              mimeType: 'image/png',
              buffer: imageBuffer,
            },
          },
        }
      );
      expect(uploadResponse.ok()).toBeTruthy();

      const uploadBody = (await uploadResponse.json()) as {
        successful?: Array<{ id?: string }>;
      };
      const uploadedId = uploadBody.successful?.[0]?.id;
      expect(uploadedId).toBeTruthy();
      uploadedImageIds.push(uploadedId!);
    }

    expect(uploadedImageIds).toHaveLength(FIXTURE_IMAGE_COUNT);

    // --- 調査B（現場調査をまたぐ遷移先）を用意する (Task 115.66) ---
    // 用意できなければこの場で失敗させる（後段の検証へ失敗をずらさない）。
    secondSurveyName = `一括エクスポートE2E用調査B_${Date.now()}`;
    const secondSurveyResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/site-surveys`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          name: secondSurveyName,
          surveyDate: new Date().toISOString().split('T')[0]!,
        },
      }
    );
    expect(
      secondSurveyResponse.status(),
      `調査Bの作成に失敗した: ${await secondSurveyResponse.text()}`
    ).toBe(201);
    const secondSurveyBody = (await secondSurveyResponse.json()) as { id?: string };
    expect(secondSurveyBody.id, '調査Bの作成応答に id が含まれない').toBeTruthy();
    secondSurveyId = secondSurveyBody.id!;

    // 調査B にも画像を 1 枚置く。
    // 「選択できる画像がそもそも無いから 0 件」ではないことを担保する。
    const secondUploadResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/${secondSurveyId}/images`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
          images: {
            name: 'bulk-export-second-survey.png',
            mimeType: 'image/png',
            buffer: imageBuffer,
          },
        },
      }
    );
    expect(
      secondUploadResponse.ok(),
      `調査Bへの画像アップロードに失敗した: ${await secondUploadResponse.text()}`
    ).toBeTruthy();
    const secondUploadBody = (await secondUploadResponse.json()) as {
      successful?: Array<{ id?: string }>;
    };
    expect(secondUploadBody.successful?.[0]?.id, '調査Bの画像 ID が得られない').toBeTruthy();
    secondSurveyImageId = secondUploadBody.successful![0]!.id!;
  });

  test.afterAll(async ({ browser }) => {
    // 後始末: 作成したデータを ADMIN 権限の API 呼び出しで削除する。
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');
      const adminToken = await cleanupPage.evaluate(() => localStorage.getItem('accessToken'));
      const headers = { Authorization: `Bearer ${adminToken}` };
      if (createdSurveyId) {
        await cleanupPage.request.delete(`${API_BASE_URL}/api/site-surveys/${createdSurveyId}`, {
          headers,
        });
      }
      if (secondSurveyId) {
        await cleanupPage.request.delete(`${API_BASE_URL}/api/site-surveys/${secondSurveyId}`, {
          headers,
        });
      }
      if (createdProjectId) {
        await cleanupPage.request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
          headers,
        });
      }
    } catch {
      // 後始末の失敗は検証結果に影響させない
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
      await sharedContext?.close();
    }
  });

  test.afterEach(async () => {
    await sharedPage.unrouteAll({ behavior: 'ignoreErrors' });
  });

  /**
   * (a) 全件一括エクスポート: 詳細画面 → 設定 → 開始 → 進捗 → ZIP ダウンロード
   *     Requirement 31.1, 31.7, 31.8, 31.9, 31.10
   */
  test('(a) 全件一括エクスポートで進捗が可視化され全画像を含む ZIP がダウンロードされる', async () => {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    // 1 枚目だけ素通しし、2 枚目以降を保留する。
    // これにより「1 / 3 件」の進捗が観測可能な状態で確実に留まる。
    const releaseImages = await holdOriginalImageResponses(1);

    // 起動ボタン押下 (Requirement 31.1)
    await sharedPage.getByTestId('bulk-export-all-button').click();

    // BulkExportDialog（設定フォーム）が全件モードで開く
    const settingsDialog = sharedPage.getByRole('dialog', { name: '全件一括エクスポート' });
    await expect(settingsDialog).toBeVisible({ timeout: getTimeout(10000) });

    // 既定設定のまま開始 (Requirement 31.5)
    const downloadPromise = sharedPage.waitForEvent('download', { timeout: getTimeout(120000) });
    await settingsDialog.getByRole('button', { name: '開始' }).click();

    // 進捗ダイアログの可視化 (Requirement 31.10)
    const progressDialog = sharedPage.getByRole('dialog', { name: '一括エクスポート処理中' });
    await expect(progressDialog).toBeVisible({ timeout: getTimeout(15000) });

    // 件数と割合が実際に表示される（Requirement 31.10）
    await expect(progressDialog.getByText(`1 / ${FIXTURE_IMAGE_COUNT} 件`)).toBeVisible({
      timeout: getTimeout(30000),
    });
    const progressBar = progressDialog.getByRole('progressbar', { name: '一括エクスポート進捗' });
    await expect(progressBar).toHaveAttribute(
      'aria-valuenow',
      String(Math.floor((1 / FIXTURE_IMAGE_COUNT) * 100))
    );

    // 保留を解放して残りを処理させる
    releaseImages();

    // ZIP ダウンロード受信 (Requirement 31.7)
    const download = await downloadPromise;

    // ファイル名規則: <調査名>_<YYYYMMDD_HHmmss>.zip (Requirement 31.9)
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/\.zip$/i);
    expect(suggested).toMatch(
      new RegExp(
        `^${createdSurveyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d{8}_\\d{6}\\.zip$`
      )
    );

    // ZIP 内に全画像が収録される (Requirement 31.7 / 31.8)
    const downloadPath = await download.path();
    const entryNames = readZipEntryNames(fs.readFileSync(downloadPath));
    expect(entryNames).toHaveLength(FIXTURE_IMAGE_COUNT);
    for (const entryName of entryNames) {
      expect(entryName).toMatch(/^\d{3}_.+\.(jpg|png)$/i);
    }
  });

  /**
   * (b) 未選択時は「選択画像エクスポート」が非活性
   *     Requirement 31.3
   */
  test('(b) 画像を 1 件も選択していない間は選択画像エクスポートが非活性である', async () => {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    const trigger = sharedPage.getByTestId('bulk-export-selected-button');
    await expect(trigger).toBeVisible({ timeout: getTimeout(10000) });
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await expect(trigger).toHaveText('選択画像エクスポート（0 件）');
  });

  /**
   * (c) 進捗中のキャンセル: ZIP がダウンロードされない
   *     Requirement 31.11, 31.12
   */
  test('(c) 進捗中にキャンセルすると ZIP がダウンロードされない', async () => {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    // 1 枚目から保留する（処理が確実に進行中の状態でキャンセルを当てる）
    const releaseImages = await holdOriginalImageResponses(0);

    await sharedPage.getByTestId('bulk-export-all-button').click();
    const settingsDialog = sharedPage.getByRole('dialog', { name: '全件一括エクスポート' });
    await expect(settingsDialog).toBeVisible({ timeout: getTimeout(10000) });
    await settingsDialog.getByRole('button', { name: '開始' }).click();

    const progressDialog = sharedPage.getByRole('dialog', { name: '一括エクスポート処理中' });
    await expect(progressDialog).toBeVisible({ timeout: getTimeout(15000) });

    // 進行中に「キャンセル」(Requirement 31.11)
    await progressDialog.getByRole('button', { name: 'キャンセル' }).click();

    // 保留していた画像応答を解放し、中断が実際に効いていることを確かめる
    releaseImages();

    // Requirement 31.12: ZIP は生成・ダウンロードされない
    const download = await sharedPage
      .waitForEvent('download', { timeout: getTimeout(10000) })
      .catch(() => null);
    expect(download).toBeNull();

    // 進捗ダイアログが閉じる（中断の完了）
    await expect(progressDialog).toBeHidden({ timeout: getTimeout(15000) });
  });

  /**
   * (d) 選択画像エクスポート: 画像一覧で選択した画像だけが ZIP に入る
   *     Requirement 31.2, 31.7
   *
   * 選択操作を伴うため他シナリオの検証結果を巻き込まないよう最後に置く。
   */
  test('(d) 画像一覧で選択した画像のみが ZIP に入る', async () => {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    // Requirement 31.2: 画像一覧で対象を選択する
    const selectedIds = uploadedImageIds.slice(0, 2);
    for (const imageId of selectedIds) {
      const checkbox = sharedPage.getByTestId(`image-checkbox-${imageId}`);
      await expect(checkbox, '画像一覧に選択用チェックボックスが表示されない').toBeVisible({
        timeout: getTimeout(10000),
      });
      await checkbox.check();
    }

    // 選択件数がボタン表記に反映され、活性化する
    const trigger = sharedPage.getByTestId('bulk-export-selected-button');
    await expect(trigger).toBeEnabled();
    await expect(trigger).toHaveText(`選択画像エクスポート（${selectedIds.length} 件）`);
    await trigger.click();

    const settingsDialog = sharedPage.getByRole('dialog', {
      name: `${selectedIds.length} 件選択画像エクスポート`,
    });
    await expect(settingsDialog).toBeVisible({ timeout: getTimeout(10000) });

    const downloadPromise = sharedPage.waitForEvent('download', { timeout: getTimeout(120000) });
    await settingsDialog.getByRole('button', { name: '開始' }).click();
    const download = await downloadPromise;

    // ZIP 内が選択件数と一致する (Requirement 31.2 / 31.7)
    const downloadPath = await download.path();
    const entryNames = readZipEntryNames(fs.readFileSync(downloadPath));
    expect(entryNames).toHaveLength(selectedIds.length);
  });

  /**
   * (e) 現場調査をまたいでも選択が持ち越されない（移った直後の過渡状態を含む）
   *     Requirement 31.2, 31.3
   *
   * 調査A で選択して「選択画像エクスポート」が活性になることを確かめたうえで、
   * 利用者の導線（詳細のパンくず「現場調査一覧」→ 一覧で調査B を選ぶ）で調査B へ移り、
   * 調査B では 0 件かつ非活性へ戻ることを確かめる。
   * 途中で画面が再読み込みされていないこと（＝選択状態が持ち越されうる SPA 内遷移で
   * あること）を window 上の目印で確かめ、検証が素通りしないようにする。
   *
   * さらに Task 115.86 として、移動先の調査の詳細取得を保留したまま「活性な
   * 選択画像エクスポートが一つも無い」ことを主張し、保留中に観測を仕掛けてから解放する。
   * これにより移動先で *最初に* 描かれた「選択画像エクスポート」まで遡って
   * 0 件かつ非活性であることを主張でき、一瞬だけ活性化する退行を取り逃がさない。
   */
  test('(e) 別の現場調査へ移ると選択が持ち越されず選択画像エクスポートが非活性へ戻る', async () => {
    expect(secondSurveyId, '調査Bが用意されていない').toBeTruthy();
    expect(secondSurveyImageId, '調査Bの画像が用意されていない').toBeTruthy();

    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    // --- 調査A: 選択すると活性になる（反対の状態へ実際に遷移できることの確認）---
    const trigger = sharedPage.getByTestId('bulk-export-selected-button');
    await expect(trigger).toBeVisible({ timeout: getTimeout(10000) });
    await expect(trigger).toBeDisabled();

    const checkbox = sharedPage.getByTestId(`image-checkbox-${uploadedImageIds[0]}`);
    await expect(checkbox, '調査Aの画像一覧に選択用チェックボックスが表示されない').toBeVisible({
      timeout: getTimeout(10000),
    });
    await checkbox.check();
    await expect(trigger).toBeEnabled();
    await expect(trigger).toHaveText('選択画像エクスポート（1 件）');
    await expect(trigger).toHaveAttribute('aria-disabled', 'false');

    // 画面の再読み込みを検知するための目印を置く
    await sharedPage.evaluate(() => {
      (window as unknown as { __crossSurveyProbe?: string }).__crossSurveyProbe = 'survey-a';
    });

    // 移動先（調査B）の詳細取得を、検証側の合図まで保留する関門を仕掛ける (Task 115.86)。
    // 経路（パス）で照合する。オリジンは実行環境によって異なり、照合に用いると何も掛からない。
    let releaseDestinationDetail: () => void = () => {};
    const destinationDetailGate = new Promise<void>((resolve) => {
      releaseDestinationDetail = resolve;
    });
    let destinationDetailRequests = 0;
    const destinationDetailMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/site-surveys/${secondSurveyId}`);
    const holdDestinationDetail = async (route: Route): Promise<void> => {
      destinationDetailRequests += 1;
      await destinationDetailGate;
      await route.continue();
    };
    await sharedPage.route(destinationDetailMatcher, holdDestinationDetail);

    try {
      // --- 調査A → 現場調査一覧 → 調査B（利用者の導線を通る）---
      const breadcrumb = sharedPage.getByRole('navigation', { name: /パンくず|breadcrumb/i });
      await expect(breadcrumb).toBeVisible({ timeout: getTimeout(10000) });
      await breadcrumb.getByRole('link', { name: '現場調査一覧' }).click();
      await expect(sharedPage).toHaveURL(
        new RegExp(`/projects/${createdProjectId}/site-surveys$`),
        {
          timeout: getTimeout(15000),
        }
      );

      const secondSurveyLink = sharedPage.getByText(secondSurveyName).first();
      await expect(secondSurveyLink, '現場調査一覧に調査Bが表示されない').toBeVisible({
        timeout: getTimeout(15000),
      });
      await secondSurveyLink.click();
      await expect(sharedPage).toHaveURL(new RegExp(`/site-surveys/${secondSurveyId}$`), {
        timeout: getTimeout(15000),
      });

      // 関門に掛かった＝移動先の画像一覧はまだ画面へ届いていない (Task 115.86)
      await expect
        .poll(() => destinationDetailRequests, { timeout: getTimeout(15000) })
        .toBeGreaterThan(0);

      // 移動先の一覧を得る前から、選択は 0 件でなければならない (Requirement 31.3)。
      // 活性な「選択画像エクスポート」がこの時点で一つでもあれば、
      // それは前の調査の選択を持ち越したまま操作を許している。
      await expect(
        sharedPage.locator('[data-testid="bulk-export-selected-button"]:not([disabled])'),
        '移動先の画像一覧を得る前に「選択画像エクスポート」が活性で提示された'
      ).toHaveCount(0);

      // 応答を保留したまま観測を仕掛ける。移動先の画面はまだ何も描いていないため、
      // 以降に描かれる「選択画像エクスポート」を最初の一つ目から漏れなく記録できる。
      await sharedPage.evaluate(() => {
        const holder = window as unknown as {
          __selectedExportStates?: Array<{ present: boolean; text: string; disabled: boolean }>;
          __selectedExportObserver?: MutationObserver;
        };
        const states: Array<{ present: boolean; text: string; disabled: boolean }> = [];
        holder.__selectedExportStates = states;
        // 変化のたびに無条件で記録する（記録側で選り分けない）。
        // 未描画の間は present:false として残し、絞り込みと突き合わせは検証側で行う。
        const record = (): void => {
          const button = document.querySelector<HTMLButtonElement>(
            '[data-testid="bulk-export-selected-button"]'
          );
          states.push({
            present: button !== null,
            text: button === null ? '' : String(button.textContent).trim(),
            disabled: button === null ? true : button.disabled,
          });
        };
        record();
        const observer = new MutationObserver(record);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        holder.__selectedExportObserver = observer;
      });
    } finally {
      // 主張の成否によらず必ず解放する。関門そのものの取り外しは afterEach の
      // `unrouteAll` に委ねる（解放した応答の処理中に取り外すと競合するため）。
      releaseDestinationDetail();
    }

    // 遷移が SPA 内で行われた（＝ページ状態が持ち越されうる経路である）ことを確かめる。
    // 再読み込みが挟まっていた場合、以下の検証は選択の整理と無関係に成立してしまう。
    const probeAfterNavigation = await sharedPage.evaluate(
      () => (window as unknown as { __crossSurveyProbe?: string }).__crossSurveyProbe
    );
    expect(
      probeAfterNavigation,
      '調査A → 調査B の遷移で画面が再読み込みされており、選択の持ち越しを検証できていない'
    ).toBe('survey-a');

    // --- 調査B: 選択は持ち越されず 0 件かつ非活性 (Requirement 31.2, 31.3) ---
    const secondSurveyCheckbox = sharedPage.getByTestId(`image-checkbox-${secondSurveyImageId}`);
    await expect(secondSurveyCheckbox, '調査Bの画像一覧が描画されない').toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(secondSurveyCheckbox).not.toBeChecked();

    await expect(trigger).toHaveText('選択画像エクスポート（0 件）');
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');

    // --- 移った直後の過渡状態: 一瞬たりとも活性化していない (Requirement 31.3, Task 115.86) ---
    const observedStates = await sharedPage.evaluate(() => {
      const holder = window as unknown as {
        __selectedExportStates?: Array<{ present: boolean; text: string; disabled: boolean }>;
        __selectedExportObserver?: MutationObserver;
      };
      holder.__selectedExportObserver?.disconnect();
      return holder.__selectedExportStates;
    });
    expect(
      observedStates,
      '移動先で「選択画像エクスポート」の観測が仕掛かっていない'
    ).toBeDefined();
    const renderedStates = (
      observedStates as Array<{ present: boolean; text: string; disabled: boolean }>
    ).filter((state) => state.present === true);
    expect(
      renderedStates.length,
      '移動先で「選択画像エクスポート」が一度も描画されていない'
    ).toBeGreaterThan(0);
    expect(
      renderedStates[0],
      '移動先で最初に描画された「選択画像エクスポート」が 0 件かつ非活性ではない'
    ).toEqual({ present: true, text: '選択画像エクスポート（0 件）', disabled: true });
    expect(
      renderedStates.filter((state) => state.disabled === false),
      '移動先で「選択画像エクスポート」が一瞬でも活性化した'
    ).toEqual([]);
  });
});
