/**
 * @fileoverview ブラウザで生成する出力の事前記録を、現場調査の調査報告書の PDF 出力で観測する E2E テスト
 *
 * user-authentication タスク53.4。design.md の「ExportAuditService と ExportAuditClient」の節。
 * 本 spec には画面で生成する出力が無いため、本番の入口での確認は最初の適用先である
 * site-survey の調査報告書の PDF 出力で行う（利用者の判断、2026-10-16）。
 *
 * 調査報告書の出力は、site-survey タスク119.2 で事前記録の包み（`frontend/src/api/export-audit.ts` の
 * `runRecordedExport`）を通した。user-authentication タスク53.4 が置いた `test.fail()` のラチェットは
 * 119.2 の適用で反転したため外し、被覆済みへ移した。site-survey のほかの出力（画像の一括 ZIP・
 * 注釈付き画像・原画像・注釈の JSON）は e2e/specs/site-surveys/site-survey-export-audit.spec.ts が確かめる。
 *
 * Requirements (user-authentication):
 * - REQ-40.10: 調査報告書の出力の開始時に、生成（注釈の取得）より前に出力の記録を要求する
 * - REQ-40.11: 出力の記録の要求が失敗したときは生成を始めず、ダウンロードもせず、エラーメッセージを表示する
 *
 * Requirements (site-survey):
 * - REQ-39.7: 調査報告書の PDF の出力は、生成の前に種別と案件を添えた出力の記録を 1 回だけ要求する
 * - REQ-39.8: 記録の要求が失敗すると生成もダウンロードも始まらず、エラーメッセージが表示される
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * 生成の始まりは、報告書の描画が最初に送る注釈の取得
 * （`POST /api/site-surveys/annotations/batch`、失敗時は画像ごとの取得）で観測する。
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getAccessToken } from '../../helpers/auth-api';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import {
  createTestProject,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';
import { SAME_ORIGIN_API_BASE_URL } from '../../config';

/** 出力の記録の経路（user-authentication タスク53.3） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 報告書の生成が送る注釈の取得の経路 */
const GENERATION_PATH_REGEX =
  /^\/api\/site-surveys\/(?:annotations\/batch|images\/[^/]+\/annotations)$/;

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** 調査報告書の出力の操作で観測した出来事 */
type ExportEvent = 'record-request' | 'record-response' | 'generation-request' | 'download';

/**
 * 現場調査の詳細画面を開き、出力の操作の観測を始める
 *
 * 画面の読み込みが落ち着いてから観測を始め、操作より前の通信を混ぜない。
 */
async function openSurveyAndObserve(page: Page, surveyId: string) {
  await page.goto(`/site-surveys/${surveyId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="photo-panel-item"]').first()).toBeVisible({
    timeout: getTimeout(15000),
  });

  const events: ExportEvent[] = [];
  const recordRequestBodies: unknown[] = [];
  const recordStatuses: number[] = [];

  page.on('request', (request) => {
    const requestPath = pathOf(request.url());
    if (requestPath === RECORD_PATH && request.method() === 'POST') {
      events.push('record-request');
      recordRequestBodies.push(request.postDataJSON());
    } else if (requestPath !== null && GENERATION_PATH_REGEX.test(requestPath)) {
      events.push('generation-request');
    }
  });
  page.on('response', (response) => {
    if (pathOf(response.url()) === RECORD_PATH && response.request().method() === 'POST') {
      events.push('record-response');
      recordStatuses.push(response.status());
    }
  });
  page.on('download', () => {
    events.push('download');
  });

  return { events, recordRequestBodies, recordStatuses };
}

test.describe('ブラウザで生成する出力の事前記録（調査報告書の PDF 出力）', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string | null = null;
  let surveyId: string | null = null;
  let imageId: string | null = null;

  /**
   * 事前準備: 案件と現場調査を作り、報告書の出力対象の写真を 1 枚置く
   */
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'REGULAR_USER');
      projectId = await createTestProject(page, '出力の事前記録');
      const seeded = await seedSurveyPhotosWithComments(
        page,
        'REGULAR_USER',
        projectId,
        '出力の事前記録',
        [null],
        'none'
      );
      surveyId = seeded.surveyId;
      imageId = seeded.imageIds[0] ?? null;
      assertPrepared(imageId, 'アップロードした写真のID');

      const accessToken = await getAccessToken(page, 'REGULAR_USER');
      const patchResponse = await page.request.patch(
        `${SAME_ORIGIN_API_BASE_URL}/api/site-surveys/images/${imageId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { includeInReport: true },
        }
      );
      expect(
        patchResponse.ok(),
        `前提: 写真を報告書の出力対象にできる (status=${patchResponse.status()})`
      ).toBeTruthy();
      const patched = (await patchResponse.json()) as { includeInReport?: boolean };
      expect(patched.includeInReport, '前提: 写真が報告書の出力対象になる').toBe(true);
    } finally {
      await context.close();
    }
  });

  /**
   * 後始末: 作った現場調査と案件を消す
   */
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      const headers = { Authorization: `Bearer ${await getAccessToken(page, 'ADMIN_USER')}` };
      assertPrepared(surveyId, '事前準備で作成した現場調査のID');
      const surveyDeletion = await page.request.delete(
        `${SAME_ORIGIN_API_BASE_URL}/api/site-surveys/${surveyId}`,
        { headers }
      );
      expect(
        surveyDeletion.ok(),
        `後始末: 現場調査を消せる (status=${surveyDeletion.status()})`
      ).toBeTruthy();
      assertPrepared(projectId, '事前準備で作成した案件のID');
      const projectDeletion = await page.request.delete(
        `${SAME_ORIGIN_API_BASE_URL}/api/projects/${projectId}`,
        { headers }
      );
      expect(
        projectDeletion.ok(),
        `後始末: 案件を消せる (status=${projectDeletion.status()})`
      ).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * @requirement user-authentication/REQ-40.10
   * @requirement site-survey/REQ-39.7
   */
  test('調査報告書の出力が生成より前に出力の記録を要求する (user-authentication/REQ-40.10, site-survey/REQ-39.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    assertPrepared(surveyId, '事前準備で作成した現場調査のID');
    const observed = await openSurveyAndObserve(page, surveyId);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(120000) });
    await page.getByRole('button', { name: '調査報告書出力' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^現場調査報告書_\d{8}\.pdf$/);

    // 生成が実際に走ったこと（注釈の取得が送られたこと）を先に確かめる
    const firstGeneration = observed.events.indexOf('generation-request');
    expect(firstGeneration, '前提: 報告書の生成が注釈の取得を送る').toBeGreaterThanOrEqual(0);

    // REQ-40.10: 出力の開始時に記録を要求し、記録が成功している
    expect(
      observed.recordStatuses,
      'REQ-40.10: 調査報告書の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies[0]).toMatchObject({
      kind: 'site_survey_report_pdf',
      projectId,
    });

    // 記録の応答が、生成の最初の要求とダウンロードより前に返っている
    const recordResponse = observed.events.indexOf('record-response');
    expect(
      recordResponse,
      'REQ-40.10: 記録の応答が生成の始まり（注釈の取得）より前に返る'
    ).toBeLessThan(firstGeneration);
    expect(recordResponse).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement user-authentication/REQ-40.11
   * @requirement site-survey/REQ-39.8
   */
  test('出力の記録が失敗すると調査報告書を生成せずエラーメッセージを表示する (user-authentication/REQ-40.11, site-survey/REQ-39.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    assertPrepared(surveyId, '事前準備で作成した現場調査のID');

    // 記録の要求だけを 500（記録の失敗）にする
    let failedRecordAttempts = 0;
    await page.route('**/api/v1/audit-logs/exports', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      failedRecordAttempts += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Export record failed',
          code: 'EXPORT_RECORD_FAILED',
        }),
      });
    });

    const observed = await openSurveyAndObserve(page, surveyId);

    const exportButton = page.getByRole('button', { name: '調査報告書出力' });
    await exportButton.click();

    // REQ-40.11: 出力を中止し、エラーメッセージを表示する（記録の要求は再試行の後に失敗する）
    await expect(
      page.getByRole('alert'),
      'REQ-40.11: 記録の失敗で「出力を記録できなかったため中止しました」が表示される'
    ).toContainText('出力を記録できなかったため中止しました', { timeout: getTimeout(30000) });
    expect(failedRecordAttempts, '記録の要求が送られ、失敗の応答を受けている').toBeGreaterThan(0);
    await expect(exportButton).toBeEnabled();

    // 生成もダウンロードも始まっていない
    expect(
      observed.events.filter((event) => event === 'generation-request').length,
      'REQ-40.11: 記録の失敗の後に生成（注釈の取得）が始まらない'
    ).toBe(0);
    expect(
      observed.events.filter((event) => event === 'download').length,
      'REQ-40.11: 記録の失敗の後にダウンロードが始まらない'
    ).toBe(0);
  });
});
