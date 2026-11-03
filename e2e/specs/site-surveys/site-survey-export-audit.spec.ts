/**
 * @fileoverview 現場調査の出力（画像の一括 ZIP・注釈付き画像・原画像・注釈の JSON）の事前記録の E2E テスト
 *
 * site-survey タスク119.2。design.md の「Requirement 39: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の画面の出力は、生成を始める前に `POST /api/v1/audit-logs/exports`（user-authentication の
 * ExportAuditService）へ出力の記録を要求し、記録が成功したときだけ生成とダウンロードを始める。
 * 記録の要求が失敗したときは生成もダウンロードも始めず、エラーメッセージを表示する。
 * 調査報告書の PDF は e2e/specs/site-surveys/site-survey-report-export-audit.spec.ts が同じ主張を持つ。
 *
 * 注釈の JSON の記録はブラウザの包み（`runRecordedExport`）だけで行い、サーバーの出力経路
 * （`GET /api/site-surveys/images/:imageId/annotations/export`）は記録しない。本テストは記録の要求が
 * 1 回だけであることを主張し、二重の記録が起きないことを確かめる。
 *
 * Requirements coverage (site-survey):
 * - REQ-39.7: 画像の一括 ZIP・注釈付き画像・原画像・注釈の JSON の出力は、生成の前に種別と案件を添えた
 *   出力の記録を 1 回だけ要求し、その記録の応答が生成の始まりとダウンロードより前に返る
 * - REQ-39.8: 記録の要求が失敗すると生成もダウンロードも始まらず、
 *   「出力を記録できなかったため中止しました」が表示される
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * 生成の始まりは、出力の処理が送る取得（画像の実体の fetch、注釈の JSON の取得）で観測する。
 * 注釈付き画像はブラウザのキャンバスから生成するため通信が無く、ダウンロードとの前後で観測する。
 */

import { test, expect, type Page, type Request } from '@playwright/test';
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

/** 記録の失敗で表示するエラーメッセージ（Requirement 39.8） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

/** 注釈の取得（JSON の出力と一括 ZIP の注釈の描画が送る）の経路 */
const ANNOTATION_PATH_REGEX =
  /^\/api\/site-surveys\/(?:annotations\/batch|images\/[^/]+\/annotations(?:\/export)?)$/;

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * 出力の生成が送る取得か
 *
 * 画像の実体の取得（API 以外への fetch）と、注釈の取得を生成の始まりとして数える。
 * 画面の表示のための画像の読み込みは img 要素（resourceType が image）であり数えない。
 */
function isGenerationRequest(request: Request): boolean {
  if (request.resourceType() !== 'fetch') {
    return false;
  }
  const requestPath = pathOf(request.url());
  if (requestPath === null) {
    return false;
  }
  return !requestPath.startsWith('/api/') || ANNOTATION_PATH_REGEX.test(requestPath);
}

/** 出力の操作で観測した出来事 */
type ExportEvent = 'record-request' | 'record-response' | 'generation-request' | 'download';

/** 出力の操作の観測を始める（画面の読み込みが落ち着いてから呼ぶ） */
function observeExport(page: Page) {
  const events: ExportEvent[] = [];
  const recordRequestBodies: unknown[] = [];
  const recordStatuses: number[] = [];
  const generationPaths: string[] = [];

  page.on('request', (request) => {
    const requestPath = pathOf(request.url());
    if (requestPath === RECORD_PATH && request.method() === 'POST') {
      events.push('record-request');
      recordRequestBodies.push(request.postDataJSON());
    } else if (isGenerationRequest(request)) {
      events.push('generation-request');
      generationPaths.push(requestPath ?? '');
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

  return { events, recordRequestBodies, recordStatuses, generationPaths };
}

/** 記録の要求だけを 500（記録の失敗）にし、要求の回数を返す関数を返す */
async function failExportRecords(page: Page): Promise<() => number> {
  let attempts = 0;
  await page.route('**/api/v1/audit-logs/exports', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    attempts += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Export record failed', code: 'EXPORT_RECORD_FAILED' }),
    });
  });
  return () => attempts;
}

test.describe('現場調査の出力の事前記録（一括 ZIP・注釈付き画像・原画像・注釈の JSON）', () => {
  let projectId: string | null = null;
  let surveyId: string | null = null;
  let imageId: string | null = null;

  /**
   * 事前準備: 案件と現場調査を作り、注釈を保存した写真を 1 枚置く
   * （注釈の JSON の出力は保存済みの注釈を要する）
   */
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'REGULAR_USER');
      projectId = await createTestProject(page, '出力の事前記録_119');
      const seeded = await seedSurveyPhotosWithComments(
        page,
        'REGULAR_USER',
        projectId,
        '出力の事前記録_119',
        [null],
        'all'
      );
      surveyId = seeded.surveyId;
      imageId = seeded.imageIds[0] ?? null;
      assertPrepared(imageId, 'アップロードした写真のID');
      expect(seeded.annotatedImageIds, '前提: 写真に注釈が保存されている').toEqual([imageId]);
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

  /** 現場調査の詳細画面を開き、一括エクスポートの設定ダイアログを開く */
  async function openBulkExportDialog(page: Page) {
    assertPrepared(surveyId, '事前準備で作成した現場調査のID');
    await page.goto(`/site-surveys/${surveyId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="photo-panel-item"]').first()).toBeVisible({
      timeout: getTimeout(15000),
    });
    const observed = observeExport(page);
    await page.getByTestId('bulk-export-all-button').click();
    const settingsDialog = page.getByRole('dialog', { name: '全件一括エクスポート' });
    await expect(settingsDialog).toBeVisible({ timeout: getTimeout(10000) });
    return { observed, settingsDialog };
  }

  /** 画像の詳細画面を編集モードで開き、画像のエクスポートダイアログを開く */
  async function openImageExportDialog(page: Page) {
    assertPrepared(surveyId, '事前準備で作成した現場調査のID');
    assertPrepared(imageId, 'アップロードした写真のID');
    await page.goto(`/site-surveys/${surveyId}/images/${imageId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '編集モード', exact: true }).click();
    await expect(page.getByTestId('annotation-toolbar')).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 編集モードへの切り替えは描画面を作り直し、画像と注釈を読み直す（読み込み中の表示は
    // 注釈の取得を終えるまで出る）。読み直しの注釈の取得が観測の始まりより後に届くと、
    // 出力の生成の始まりと数えてしまうため、読み込み中の表示が消えてから観測を始める。
    await expect(
      page.getByTestId('annotation-editor-container').getByRole('status', { name: '読み込み中' })
    ).toHaveCount(0, { timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');

    const observed = observeExport(page);
    await page.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByText('画像エクスポート')).toBeVisible();
    return { observed, dialog };
  }

  /** 画像のエクスポートダイアログの各出力の操作 */
  const imageOutputs = [
    {
      name: '注釈付き画像',
      button: { name: 'エクスポート', exact: true },
      filename: /\.(jpe?g)$/i,
      // キャンバスから生成するため通信が無い
      expectsGenerationRequest: false,
    },
    {
      name: '原画像',
      button: { name: '元画像をダウンロード', exact: true },
      filename: /\.(jpe?g|png)$/i,
      expectsGenerationRequest: true,
    },
    {
      name: '注釈の JSON',
      button: { name: '注釈データ(JSON)をダウンロード', exact: true },
      filename: /_annotations\.json$/,
      expectsGenerationRequest: true,
    },
  ] as const;

  /**
   * @requirement site-survey/REQ-39.7
   */
  test('画像の一括 ZIP の出力が生成より前に出力の記録を1回要求する (site-survey/REQ-39.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const { observed, settingsDialog } = await openBulkExportDialog(page);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(120000) });
    await settingsDialog.getByRole('button', { name: '開始' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    const firstGeneration = observed.events.indexOf('generation-request');
    expect(firstGeneration, '前提: 一括 ZIP の生成が画像の取得を送る').toBeGreaterThanOrEqual(0);

    expect(
      observed.recordStatuses,
      'REQ-39.7: 一括 ZIP の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'site_survey_images_zip',
      projectId,
      targetIds: [imageId],
      itemCount: 1,
    });

    const recordResponse = observed.events.indexOf('record-response');
    expect(recordResponse, 'REQ-39.7: 記録の応答が生成の始まりより前に返る').toBeLessThan(
      firstGeneration
    );
    expect(recordResponse).toBeLessThan(observed.events.indexOf('download'));
  });

  /**
   * @requirement site-survey/REQ-39.8
   */
  test('出力の記録が失敗すると画像の一括 ZIP を生成せずエラーメッセージを表示する (site-survey/REQ-39.8)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');
    const recordAttempts = await failExportRecords(page);
    const { observed, settingsDialog } = await openBulkExportDialog(page);

    const startButton = settingsDialog.getByRole('button', { name: '開始' });
    await startButton.click();

    await expect(
      settingsDialog.getByRole('alert'),
      'REQ-39.8: 記録の失敗で「出力を記録できなかったため中止しました」が表示される'
    ).toContainText(RECORD_FAILED_MESSAGE, { timeout: getTimeout(30000) });
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(startButton).toBeEnabled();
    await expect(page.getByRole('dialog', { name: '一括エクスポート処理中' })).toHaveCount(0);

    expect(
      observed.events.filter((event) => event === 'generation-request'),
      'REQ-39.8: 記録の失敗の後に生成（画像の取得）が始まらない'
    ).toEqual([]);
    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-39.8: 記録の失敗の後にダウンロードが始まらない'
    ).toEqual([]);
  });

  for (const output of imageOutputs) {
    /**
     * @requirement site-survey/REQ-39.7
     */
    test(`${output.name}の出力が生成より前に出力の記録を1回要求する (site-survey/REQ-39.7)`, async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      const { observed, dialog } = await openImageExportDialog(page);

      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
      await dialog.getByRole('button', output.button).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(output.filename);

      expect(
        observed.recordStatuses,
        `REQ-39.7: ${output.name}の出力が出力の記録を 1 回要求し、201 で記録される`
      ).toEqual([201]);
      expect(observed.recordRequestBodies[0]).toEqual({
        kind: 'annotated_image',
        projectId,
        targetIds: [imageId],
        itemCount: 1,
      });

      const recordResponse = observed.events.indexOf('record-response');
      expect(recordResponse, '記録の応答を観測している').toBeGreaterThanOrEqual(0);
      expect(
        recordResponse,
        `REQ-39.7: ${output.name}の記録の応答がダウンロードより前に返る`
      ).toBeLessThan(observed.events.indexOf('download'));
      expect(
        observed.events.includes('generation-request'),
        `前提: ${output.name}の生成が取得を送るか（注釈付き画像はキャンバスから生成し送らない）`
      ).toBe(output.expectsGenerationRequest);
      expect(
        observed.events.slice(0, recordResponse),
        `REQ-39.7: ${output.name}の記録の応答が生成の始まりより前に返る`
      ).not.toContain('generation-request');
    });

    /**
     * @requirement site-survey/REQ-39.8
     */
    test(`出力の記録が失敗すると${output.name}を生成せずエラーメッセージを表示する (site-survey/REQ-39.8)`, async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');
      const recordAttempts = await failExportRecords(page);
      const { observed, dialog } = await openImageExportDialog(page);

      await dialog.getByRole('button', output.button).click();

      await expect(
        page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
        `REQ-39.8: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
      ).toBeVisible({ timeout: getTimeout(30000) });
      expect(
        recordAttempts(),
        '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
      ).toBe(1);

      expect(
        observed.events.filter((event) => event === 'generation-request'),
        `REQ-39.8: 記録の失敗の後に${output.name}の生成が始まらない`
      ).toEqual([]);
      expect(
        observed.events.filter((event) => event === 'download'),
        `REQ-39.8: 記録の失敗の後に${output.name}のダウンロードが始まらない`
      ).toEqual([]);
    });
  }
});
