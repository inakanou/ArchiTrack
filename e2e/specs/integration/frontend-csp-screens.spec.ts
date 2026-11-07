/**
 * @fileoverview セキュリティヘッダーと CSP の下での主要画面の動作の E2E テスト
 *
 * user-authentication タスク56.2。design.md の FrontendNginxConfig の節。試験環境の画面の配信元
 * （本番と同じ nginx のイメージ。CSP の追加の取得先と HSTS は試験の compose が渡す）で主要画面を
 * 実際に操作し、次の二つを主張する。
 * - 操作の間にブラウザが画面の配信元から受けた全ての応答（HTML・JS・CSS・画像・pdf.js の worker など。
 *   API の中継を除く）が、CSP・HSTS・X-Frame-Options・X-Content-Type-Options・Referrer-Policy を
 *   design の値で一つずつ持ち、`Server` に版を含まない
 * - 操作の間に CSP の違反が一件も起きない（コンソールの違反の表示と `securitypolicyviolation` の
 *   イベントの両方で観測する）。CSP に当たる機能（保存先の画像の表示、画像の編集の描画面、PDF の
 *   プレビュー、PDF の出力、現場調査の一括エクスポート、Tesseract の資材の取得と OCR）を実際に動かし、
 *   機能が完了したことも併せて主張する（違反で機能が止まったまま「違反なし」と読まない）
 *
 * Requirements (user-authentication):
 * - REQ-44.1: 主要画面の操作中に画面の配信元から受けた各応答が、読み込み元を本システムと必要な外部
 *   サービスに限る Content-Security-Policy（design の指示子と、試験の画像の保存先を足した img-src・
 *   connect-src）を持つ
 * - REQ-44.2: 同じ各応答が Strict-Transport-Security・X-Frame-Options・X-Content-Type-Options・
 *   Referrer-Policy を design の値で一つずつ持つ
 * - REQ-44.3: 同じ各応答の `Server` が配信元の版を含まない
 * - REQ-44.4: ログイン、ダッシュボード、案件、現場調査と画像の編集、数量表、見積書の出力、工事写真、
 *   OCR の各画面が、CSP の違反を起こさずに表示・操作できる
 *
 * 観測の方針:
 * - 応答の差し替え（`page.route`）は用いない。Tesseract の資材（worker・コア・言語データ）も実際に取得する
 *   （CSP の connect-src・script-src を本物の取得で通すため）。資材は画面の配信元が配信する
 *   （是正計画 D14。cdn.jsdelivr.net から取得しないことも確かめる）。
 * - 違反の観測は次の四経路で行う（いずれかに一件でも現れれば違反とする）:
 *   - `event`: 画面の文書の `securitypolicyviolation`（初期化スクリプトで公開した関数へ送る）
 *   - `console`: 画面のコンソールの CSP の違反の表示（文書の中の違反だけが出る）
 *   - `cdp-log`: CDP の `Log.entryAdded` の CSP の違反の記録。worker の中の connect-src などの違反も
 *     出るが、worker の中の eval（`new Function`）の違反は出ない（レビューの実測）
 *   - `worker-event`: Web Worker（pdf.js・Tesseract など）の中の `securitypolicyviolation`。worker の
 *     生成を `page.on('worker')` で受けた直後に `worker.evaluate` で受け手を登録する。受け手は違反を
 *     worker の中の配列に積み、同時に目印付きの `console.error` で送る。画面の検査の終わりに、
 *     生きている worker からは配列を `worker.evaluate` で読み出し、既に終わった worker（Tesseract は
 *     OCR の後に止まる）からは送られていた分を使う
 *   - Playwright の `worker.on('console')` にも `page.on('console')` にも、worker の中の CSP の違反の
 *     表示はブラウザから来ない（レビューの実測）。worker のコンソールは目印付きの送信の受け取りにだけ使う
 * - worker の経路の限界: 受け手の登録は worker の最上位のスクリプトの実行と並行に進むため、生成の直後
 *   （登録が終わる前）に起きた違反は取りこぼしうる。その間の connect-src などの違反は `cdp-log` が捉えるが、
 *   eval の違反は捉えられない。受け手を登録できなかった worker（登録の前に終わった・評価に失敗した）は、
 *   黙って「違反なし」とみなさず、観測できなかった worker として赤にする
 * - 観測が違反を捉えられることは、配信された CSP が許さない取得先への接続を文書から試み、また blob の
 *   Worker の中で許されない取得先への接続と `new Function('')` を起こし、各経路に違反が現れることで示す
 *   （末尾の検査。受入基準の被覆ではない）。
 * - 状態を変えるのは案件・現場調査・数量表・見積・見積依頼・工事写真のデータだけで、利用者の状態
 *   （パスワード・2FA・有効状態・ロック）は変えない。ログインの画面の検査は、この spec の中で作る
 *   利用者（`createSessionUser`）でログインの画面から 2FA の検証まで通す。
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  test,
  expect,
  type Page,
  type Download,
  type Worker as PlaywrightWorker,
} from '@playwright/test';
import { API_BASE_URL, FRONTEND_BASE_URL, SAME_ORIGIN_API_BASE_URL } from '../../config';
import { loginAsUser, loginWithCredentials } from '../../helpers/auth-actions';
import { getAccessToken } from '../../helpers/auth-api';
import {
  createSessionUser,
  deleteSessionUsers,
  type SessionUser,
} from '../../fixtures/auth.fixtures';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import {
  expectSecurityHeaders,
  expectServerWithoutVersion,
  type HeaderEntry,
} from '../../helpers/frontend-security-headers';
import { seedProject } from '../../helpers/project-list-preconditions';
import {
  addQuantityGroup,
  attachPhotoToGroup,
  createTestQuantityTable,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { waitForFabricCanvas } from '../../helpers/fabric-canvas';
import { buildNewEstimateItemNode, saveEstimateDraft } from '../../helpers/estimate-draft';
import { seedEstimateRequest } from '../../helpers/estimate-request-preconditions';
import { expectPdfPreviewRendered } from '../../helpers/pdf-preview';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 画面のオリジン */
const APP_ORIGIN = new URL(FRONTEND_BASE_URL).origin;

/** 画面の操作に用いる共有の役割（データの作成だけを行い、利用者の状態は変えない） */
const SCREEN_USER = 'ADMIN_USER' as const;

/** 違反の観測を受け取る、初期化スクリプトが呼ぶ関数の名前 */
const VIOLATION_BINDING = '__architrackCspViolation';

/** コンソールの表示・CDP の記録のうち CSP の違反を述べるもの（Chromium の文言） */
const CSP_CONSOLE_PATTERN = /Content Security Policy/i;

/** worker の中の受け手が違反を送るときの目印（`console.error` の第一引数） */
const WORKER_VIOLATION_MARK = '[e2e-csp-worker-violation]';

/** worker の中の受け手が違反を積む配列の名前 */
const WORKER_VIOLATION_STORE = '__architrackCspViolations';

/** 観測した CSP の違反の一件 */
interface CspViolation {
  /** 観測の経路 */
  source: 'event' | 'console' | 'cdp-log' | 'worker-event';
  /** 違反の内容（イベントは指示子と遮られた URI、コンソールと CDP は表示の本文） */
  detail: string;
}

/** 画面が作った Web Worker の一件の観測 */
interface WorkerRecord {
  url: string;
  worker: PlaywrightWorker;
  /** 受け手の登録の結果（登録できなければその理由） */
  registration: Promise<{ registered: true } | { registered: false; reason: string }>;
  /** 受け手から目印付きで送られた違反 */
  forwarded: string[];
  closed: boolean;
}

/** 応答の出所の分類 */
type ResponseKind = 'frontend' | 'proxied-api' | 'external' | 'in-browser';

/**
 * 応答の URL を出所で分ける。
 * - `in-browser`: blob: と data: の URL（ブラウザの中で作られたもので、配信元の応答ではない。
 *   blob: の URL の origin は作った文書のオリジンになるため、protocol で分ける）
 * - `external`: 画面の配信元以外（保存先の画像など）
 * - `proxied-api`: API の中継（backend の応答であり、56.1 の spec が /csrf-token で主張する）
 * - `frontend`: 画面の配信元の nginx が配信した応答（HTML・JS・CSS・画像・worker など）
 */
function responseKind(rawUrl: string): ResponseKind {
  const url = new URL(rawUrl);
  return url.protocol !== 'http:' && url.protocol !== 'https:'
    ? 'in-browser'
    : url.origin !== APP_ORIGIN
      ? 'external'
      : url.pathname.startsWith('/api/') || url.pathname === '/csrf-token'
        ? 'proxied-api'
        : 'frontend';
}

/** 観測した応答の一件 */
interface ObservedResponse {
  url: string;
  kind: ResponseKind;
  resourceType: string;
  status: number;
  /** 応答のヘッダー（読み出しは画面の配信の応答に限る） */
  readHeaders: () => Promise<HeaderEntry[]>;
}

/** 一つの画面の操作の間の観測 */
interface ScreenObservation {
  violations: CspViolation[];
  /** 画面が作った Web Worker */
  workers: WorkerRecord[];
  /** 操作の間にブラウザが受けた全ての応答 */
  responses: ObservedResponse[];
}

/**
 * 画面の CSP の違反と配信の応答の観測を始める（画面へ最初に移る前に呼ぶ）。
 */
async function observeScreen(page: Page): Promise<ScreenObservation> {
  const observation: ScreenObservation = { violations: [], workers: [], responses: [] };

  // ブラウザの HTTP キャッシュを止め、全ての応答を配信元から受ける。Chromium はキャッシュへ
  // Strict-Transport-Security を保存しないため、キャッシュから出た応答では HSTS を観測できない
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  // CDP の記録（worker の中の connect-src などの違反も出る。worker の中の eval の違反は出ない）
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (CSP_CONSOLE_PATTERN.test(entry.text)) {
      observation.violations.push({
        source: 'cdp-log',
        detail: `${entry.url ?? ''}: ${entry.text}`,
      });
    }
  });
  await cdp.send('Log.enable');

  await page.exposeBinding(VIOLATION_BINDING, (_source, detail: string) => {
    observation.violations.push({ source: 'event', detail });
  });
  await page.addInitScript((bindingName) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as Record<string, (detail: string) => void>)[bindingName];
      report?.(
        `${event.effectiveDirective} blocked=${event.blockedURI} source=${event.sourceFile}:${event.lineNumber}`
      );
    });
  }, VIOLATION_BINDING);

  page.on('console', (message) => {
    if (CSP_CONSOLE_PATTERN.test(message.text())) {
      observation.violations.push({ source: 'console', detail: message.text() });
    }
  });
  page.on('worker', (worker) => {
    const record: WorkerRecord = {
      url: worker.url(),
      worker,
      forwarded: [],
      closed: false,
      registration: worker
        .evaluate(
          ({ mark, store }) => {
            const scope = self as unknown as Record<string, string[]>;
            scope[store] = [];
            self.addEventListener('securitypolicyviolation', (event) => {
              const detail = `${event.effectiveDirective} blocked=${event.blockedURI} source=${event.sourceFile}:${event.lineNumber}`;
              scope[store]!.push(detail);
              console.error(mark, detail);
            });
          },
          { mark: WORKER_VIOLATION_MARK, store: WORKER_VIOLATION_STORE }
        )
        .then(
          () => ({ registered: true as const }),
          (error: unknown) => ({ registered: false as const, reason: String(error) })
        ),
    };
    worker.on('console', (message) => {
      const text = message.text();
      if (text.startsWith(WORKER_VIOLATION_MARK)) {
        record.forwarded.push(text.slice(WORKER_VIOLATION_MARK.length).trim());
      }
    });
    worker.on('close', () => {
      record.closed = true;
    });
    observation.workers.push(record);
  });

  page.on('response', (response) => {
    observation.responses.push({
      url: response.url(),
      kind: responseKind(response.url()),
      resourceType: response.request().resourceType(),
      status: response.status(),
      readHeaders: () => response.headersArray(),
    });
  });

  return observation;
}

/**
 * 画面の操作の間に画面の配信元から受けた応答が、要件44.1〜44.3 のヘッダーを持つことを主張する。
 * 文書（HTML）と JS の応答を一件以上受けたことを先に確かめる（受けていなければ何も主張していない）。
 */
async function expectFrontendResponsesSecured(
  observation: ScreenObservation,
  screen: string
): Promise<void> {
  const responses = observation.responses.filter((response) => response.kind === 'frontend');
  const types = new Set(responses.map((response) => response.resourceType));
  expect(types.has('document'), `${screen}: 前提: 画面の文書（HTML）の応答を受けた`).toBe(true);
  expect(types.has('script'), `${screen}: 前提: JS の応答を受けた`).toBe(true);
  for (const response of responses) {
    const label = `${screen}: ${response.resourceType} ${new URL(response.url).pathname} (${response.status})`;
    expect(response.status, `${label} の応答が配信元からの成功である`).toBe(200);
    const headers = await response.readHeaders();
    expectSecurityHeaders(headers, label);
    expectServerWithoutVersion(headers, label);
  }
}

/** worker の観測の読み出しの結果 */
interface WorkerCollection {
  violations: CspViolation[];
  /** 受け手を登録できず、中の違反を観測できなかった worker */
  unobservable: string[];
}

/**
 * 画面が作った worker の中の違反を読み出す。生きている worker からは受け手の配列を読み、
 * 既に終わった worker からは受け手が送っていた分を使う。受け手を登録できなかった worker は
 * 観測できなかったものとして返す（黙って「違反なし」とみなさない）。
 */
async function collectWorkerViolations(observation: ScreenObservation): Promise<WorkerCollection> {
  const violations: CspViolation[] = [];
  const unobservable: string[] = [];
  for (const record of observation.workers) {
    const registration = await record.registration;
    const stored = registration.registered
      ? await record.worker
          .evaluate(
            (store) => [...((self as unknown as Record<string, string[]>)[store] ?? [])],
            WORKER_VIOLATION_STORE
          )
          .then(
            (details) => ({ read: true as const, details }),
            (error: unknown) => ({ read: false as const, reason: String(error) })
          )
      : { read: false as const, reason: registration.reason };
    // 読み出せない worker のうち、既に終わっていたものは受け手が送っていた分を使う。
    // 受け手を登録できなかったもの・終わっていないのに読めないものは観測できなかったものとする
    const fallsBackToForwarded = !stored.read && registration.registered && record.closed;
    const details = stored.read ? stored.details : record.forwarded;
    violations.push(
      ...details.map((detail) => ({
        source: 'worker-event' as const,
        detail: `${record.url}: ${detail}`,
      }))
    );
    unobservable.push(
      ...(stored.read || fallsBackToForwarded ? [] : [`${record.url}: ${stored.reason}`])
    );
  }
  return { violations, unobservable };
}

/** 画面の操作の間に CSP の違反が一件も起きていないことを主張する（要件44.4） */
async function expectNoCspViolation(observation: ScreenObservation, screen: string): Promise<void> {
  const workers = await collectWorkerViolations(observation);
  expect(
    workers.unobservable,
    `${screen}: 画面が作った全ての worker で、中の違反を観測できる（受け手を登録できた）`
  ).toEqual([]);
  const violations = [...observation.violations, ...workers.violations];
  expect(
    violations,
    `${screen}: CSP の違反が起きない（観測: ${JSON.stringify(violations, null, 2)}）`
  ).toEqual([]);
}

/** 操作の契機を与え、ダウンロードを一件受け取る */
async function downloadBy(page: Page, trigger: () => Promise<void>): Promise<Download> {
  const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(120000) });
  await trigger();
  return downloadPromise;
}

test.describe('セキュリティヘッダーと CSP の下での主要画面の動作（user-authentication 56.2）', () => {
  test.describe.configure({ mode: 'serial' });

  let loginScreenUser: SessionUser | null = null;
  let projectId: string | null = null;
  let surveyId: string | null = null;
  let surveyImageId: string | null = null;
  let quantityTableId: string | null = null;
  let estimateId: string | null = null;
  let estimateRequestSeed: Awaited<ReturnType<typeof seedEstimateRequest>> | null = null;

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await loginAsUser(page, SCREEN_USER);
      const accessToken = await getAccessToken(page, SCREEN_USER);
      const headers = { Authorization: `Bearer ${accessToken}` };
      const deletions: string[] = [];
      if (estimateRequestSeed) {
        deletions.push(
          `/api/estimate-requests/${estimateRequestSeed.estimateRequestId}`,
          `/api/itemized-statements/${estimateRequestSeed.itemizedStatementId}`,
          `/api/trading-partners/${estimateRequestSeed.tradingPartnerId}`,
          `/api/projects/${estimateRequestSeed.projectId}`
        );
      }
      if (estimateId) deletions.push(`/api/estimates/${estimateId}`);
      if (projectId) deletions.push(`/api/projects/${projectId}`);
      for (const deletion of deletions) {
        await page.request.delete(`${API_BASE_URL}${deletion}`, { headers });
      }
    } finally {
      await page.close();
      await deleteSessionUsers();
    }
  });

  test('事前準備: 案件・現場調査の写真・数量表・見積・見積依頼を作る', async ({ page }) => {
    test.setTimeout(getTimeout(180000));
    await loginAsUser(page, SCREEN_USER);

    loginScreenUser = await createSessionUser('ADMIN_USER');

    const project = await seedProject(page, SCREEN_USER, 'E2E_CSP画面検証');
    projectId = project.id;

    // 写真選択の候補は注釈を持つ写真だけであるため、注釈まで保存する（画像の編集の描画面でも復元される）
    const seeded = await seedSurveyPhotosWithComments(
      page,
      SCREEN_USER,
      project.id,
      'E2E_CSP画面検証調査',
      ['CSP検証の写真1', 'CSP検証の写真2'],
      'all'
    );
    surveyId = seeded.surveyId;
    surveyImageId = seeded.imageIds[0] ?? null;
    assertPrepared(surveyImageId, '現場調査の1枚目の画像のID');

    const table = await createTestQuantityTable(page, project.id, 'E2E_CSP画面検証数量表');
    quantityTableId = table.id;

    const accessToken = await getAccessToken(page, SCREEN_USER);
    const estimateResponse = await page.request.post(
      `${SAME_ORIGIN_API_BASE_URL}/api/projects/${project.id}/estimates`,
      { headers: { Authorization: `Bearer ${accessToken}` }, data: { name: 'E2E_CSP画面検証見積' } }
    );
    expect(estimateResponse.status(), '前提: 見積書が作成される').toBe(201);
    estimateId = ((await estimateResponse.json()) as { id: string }).id;
    assertPrepared(estimateId, '作成した見積書のID');
    await saveEstimateDraft(page.request, accessToken, estimateId, [
      buildNewEstimateItemNode({
        name: 'CSP検証の項目',
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 10000,
        executionUnitPrice: 8000,
      }),
    ]);

    estimateRequestSeed = await seedEstimateRequest(page, SCREEN_USER, {
      label: 'E2E_CSP画面検証見積依頼',
      siteAddress: '東京都千代田区テスト5-6-2',
      partnerEmail: 'e2e-csp-screens@example.com',
      groupName: '建築工事グループ',
      item: {
        workType: '建築工事',
        name: '外壁塗装',
        specification: 'シリコン系',
        unit: 'm2',
        quantity: 100,
      },
    });
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('ログインの画面: ログインの画面から 2FA の検証を経てダッシュボードへ入るまで CSP の違反が起きない', async ({
    page,
  }) => {
    assertPrepared(loginScreenUser, '事前準備で作成したログインの画面の検査の利用者');
    const observation = await observeScreen(page);

    await loginWithCredentials(page, loginScreenUser.email, loginScreenUser.password);
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');

    await expectFrontendResponsesSecured(observation, 'ログイン');
    await expectNoCspViolation(observation, 'ログイン');
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('ダッシュボードと案件の画面: 一覧と詳細の表示で CSP の違反が起きない', async ({ page }) => {
    assertPrepared(projectId, '事前準備で作成した案件のID');
    const observation = await observeScreen(page);
    await loginAsUser(page, SCREEN_USER);

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');

    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'プロジェクト一覧' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.waitForLoadState('networkidle');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('construction-photo-section')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.waitForLoadState('networkidle');

    await expectFrontendResponsesSecured(observation, 'ダッシュボードと案件');
    await expectNoCspViolation(observation, 'ダッシュボードと案件');
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('現場調査と画像の編集の画面: 写真の表示・画像の編集の描画面・一括エクスポートで CSP の違反が起きない', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    assertPrepared(surveyId, '事前準備で作成した現場調査のID');
    assertPrepared(surveyImageId, '事前準備で作成した現場調査の画像のID');
    const observation = await observeScreen(page);
    await loginAsUser(page, SCREEN_USER);

    // 画像の表示と画像の編集（保存先の画像の取得・描画面への読み込み）
    await page.goto(`/site-surveys/${surveyId}/images/${surveyImageId}`);
    await page.waitForLoadState('networkidle');
    const editModeButton = page.getByRole('button', { name: '編集モード', exact: true });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.click();
    await expect(page.getByTestId('annotation-toolbar')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await waitForFabricCanvas(page, 15000);
    await page.waitForLoadState('networkidle');

    // 詳細の写真の一覧と一括エクスポート（data の URL と保存先の画像の取得）
    await page.goto(`/site-surveys/${surveyId}`);
    await page.waitForLoadState('networkidle');
    await page.getByTestId('bulk-export-all-button').click();
    const settingsDialog = page.getByRole('dialog', { name: '全件一括エクスポート' });
    await expect(settingsDialog).toBeVisible({ timeout: getTimeout(10000) });
    const download = await downloadBy(page, () =>
      settingsDialog.getByRole('button', { name: '開始' }).click()
    );
    expect(download.suggestedFilename(), '一括エクスポートの ZIP がダウンロードされる').toMatch(
      /\.zip$/i
    );
    expect(await download.failure(), 'ZIP のダウンロードが失敗しない').toBeNull();

    await expectFrontendResponsesSecured(observation, '現場調査と画像の編集');
    await expectNoCspViolation(observation, '現場調査と画像の編集');
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('数量表の画面: 写真の紐づけと PDF の出力で CSP の違反が起きない', async ({ page }) => {
    test.setTimeout(getTimeout(180000));
    assertPrepared(quantityTableId, '事前準備で作成した数量表のID');
    const observation = await observeScreen(page);
    await loginAsUser(page, SCREEN_USER);

    await openQuantityTableEdit(page, quantityTableId);
    const group = await addQuantityGroup(page);
    await attachPhotoToGroup(page, group, 0);
    await saveQuantityTableDraft(page);

    const pdfButton = page.getByRole('button', { name: /PDF出力/ });
    await expect(pdfButton, '前提: PDF出力ボタンが表示される').toBeVisible({
      timeout: getTimeout(10000),
    });
    const download = await downloadBy(page, () => pdfButton.click());
    expect(download.suggestedFilename(), '数量表の PDF がダウンロードされる').toMatch(/\.pdf$/i);
    expect(await download.failure(), '数量表の PDF のダウンロードが失敗しない').toBeNull();

    await expectFrontendResponsesSecured(observation, '数量表');
    await expectNoCspViolation(observation, '数量表');
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('見積書の出力: 見積の PDF の出力で CSP の違反が起きない', async ({ page }) => {
    test.setTimeout(getTimeout(180000));
    assertPrepared(estimateId, '事前準備で作成した見積書のID');
    const observation = await observeScreen(page);
    await loginAsUser(page, SCREEN_USER);

    await page.goto(`/estimates/${estimateId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[aria-label="見積項目テーブル"]')).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.getByRole('button', { name: /^出力$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await page.locator('input[type="checkbox"][value="ESTIMATE"]').check();
    await page.locator('input[type="checkbox"][value="EXECUTION"]').uncheck();
    await page.locator('input[type="checkbox"][value="VENDOR"]').uncheck();
    await page.locator('input[type="radio"][name="export-format"][value="pdf"]').check();
    const download = await downloadBy(page, () =>
      dialog.getByRole('button', { name: /^出力$/i }).click()
    );
    expect(download.suggestedFilename(), '見積の PDF がダウンロードされる').toMatch(/\.pdf$/i);
    expect(await download.failure(), '見積の PDF のダウンロードが失敗しない').toBeNull();
    await expect(dialog).toBeHidden({ timeout: getTimeout(60000) });

    await expectFrontendResponsesSecured(observation, '見積書の出力');
    await expectNoCspViolation(observation, '見積書の出力');
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('工事写真の画面: アルバムの作成・写真の追加・写真台帳の PDF の出力で CSP の違反が起きない', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    assertPrepared(projectId, '事前準備で作成した案件のID');
    const observation = await observeScreen(page);
    await loginAsUser(page, SCREEN_USER);

    await page.goto(`/projects/${projectId}/construction-photos/new`);
    await page.getByLabel('アルバム名').fill(`E2E_CSP画面検証アルバム_${Date.now()}`);
    const createAlbumPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/') &&
        response.url().includes('/construction-photos') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '作成' }).click();
    const createAlbumResponse = await createAlbumPromise;
    expect(createAlbumResponse.status(), '前提: アルバムが作成される').toBe(201);
    const albumId = ((await createAlbumResponse.json()) as { id?: string }).id ?? null;
    assertPrepared(albumId, '作成したアルバムのID');

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    const uploadPromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/construction-photos\/.+\/images$/.test(response.url()),
      { timeout: getTimeout(30000) }
    );
    await page
      .getByTestId('file-input')
      .setInputFiles(path.join(__dirname, '../../fixtures/test-image.jpg'));
    expect((await uploadPromise).ok(), '前提: 写真がアップロードされる').toBe(true);
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    await items.first().getByLabel('印刷対象に含める').check();
    const batchPromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await batchPromise).ok(), '前提: 印刷対象の指定が保存される').toBe(true);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    const download = await downloadBy(page, () =>
      page.getByRole('button', { name: 'PDF出力' }).click()
    );
    expect(download.suggestedFilename(), '写真台帳の PDF がダウンロードされる').toMatch(/\.pdf$/i);
    expect(await download.failure(), '写真台帳の PDF のダウンロードが失敗しない').toBeNull();

    await expectFrontendResponsesSecured(observation, '工事写真');
    await expectNoCspViolation(observation, '工事写真');
  });

  /**
   * @requirement user-authentication/REQ-44.1
   * @requirement user-authentication/REQ-44.2
   * @requirement user-authentication/REQ-44.3
   * @requirement user-authentication/REQ-44.4
   */
  test('OCR の画面: スキャンPDFの PDF のプレビューと Tesseract の OCR で CSP の違反が起きない', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(240000));
    assertPrepared(estimateRequestSeed, '事前準備で作成した見積依頼');
    const observation = await observeScreen(page);
    await loginAsUser(page, SCREEN_USER);

    await page.goto(`/estimate-requests/${estimateRequestSeed.estimateRequestId}`);
    await expect(page.getByTestId('estimate-request-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: /受領見積書登録/i }).click();
    await expect(page.locator('#quotation-name')).toBeVisible({ timeout: getTimeout(10000) });
    // 画像のみの PDF は Claude Vision の失敗（試験環境はキーを持たない）の後に Tesseract の OCR へ進む
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, '../../fixtures/test-scanned-pdf.pdf'));

    // PDF のプレビュー（react-pdf が blob の URL を取得し、pdf.js の worker で描く）
    await expectPdfPreviewRendered(page);

    // Tesseract の OCR（画面の配信元の worker・コア・言語データを取得して読む。是正計画 D14）
    const extractedText = page.getByTestId('ocr-extracted-text');
    await expect(extractedText).toBeVisible({ timeout: getTimeout(180000) });
    await expect(page.getByTestId('ocr-error-message')).toHaveCount(0);
    expect(
      ((await extractedText.textContent()) ?? '').replace(/\s/g, ''),
      'OCR が画像の中の語を読み取る'
    ).toContain('外壁塗装工事');

    const tesseractAssets = observation.responses.filter(
      (response) =>
        response.kind === 'frontend' && new URL(response.url).pathname.startsWith('/tesseract/')
    );
    expect(
      tesseractAssets.some((response) => response.url.includes('/@tesseract.js-data/jpn/')),
      '前提: Tesseract の日本語データを画面の配信元から取得した'
    ).toBe(true);
    for (const response of tesseractAssets) {
      expect(response.status, `${response.url} の取得が成功する`).toBeLessThan(400);
    }
    expect(
      observation.responses
        .filter((response) => response.kind === 'external')
        .map((response) => new URL(response.url).hostname)
        .filter(
          (hostname) => hostname === 'cdn.jsdelivr.net' || hostname === 'tessdata.projectnaptha.com'
        ),
      'Tesseract の資材を外部の CDN から取得しない'
    ).toEqual([]);

    // worker の経路が空振りしていないこと: pdf.js の worker と Tesseract の worker を受けている
    const workerUrls = observation.workers.map((record) => record.url);
    expect(
      workerUrls.some((url) => url.includes('pdf.worker')),
      `前提: pdf.js の worker を観測した（観測: ${JSON.stringify(workerUrls)}）`
    ).toBe(true);
    expect(
      workerUrls.filter((url) => !url.includes('pdf.worker')).length,
      `前提: Tesseract の worker を観測した（観測: ${JSON.stringify(workerUrls)}）`
    ).toBeGreaterThanOrEqual(1);

    await expectFrontendResponsesSecured(observation, 'OCR');
    await expectNoCspViolation(observation, 'OCR');
  });

  /**
   * 上の「違反が起きない」の主張が、違反が起きたときに赤になることの確認。配信された CSP が
   * connect-src・img-src に含めない取得先へ文書から接続を試み、文書のイベント・コンソールの表示・
   * CDP の記録の各経路に違反が現れることを確かめる。受入基準の被覆ではないため
   * `@requirement` は付けない。
   */
  test('観測の確認: 配信された CSP が許さない取得先への接続は違反として観測される', async ({
    page,
  }) => {
    const observation = await observeScreen(page);
    await page.goto('/login');
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible({ timeout: getTimeout(15000) });

    await page.evaluate(async () => {
      const image = document.createElement('img');
      image.src = 'https://csp-probe.example.invalid/probe.png';
      document.body.appendChild(image);
      await fetch('https://csp-probe.example.invalid/probe.json').catch(() => null);
    });

    await expect
      .poll(() => observation.violations.filter((v) => v.source === 'event').length, {
        message: '文書の securitypolicyviolation が connect-src と img-src の二件を捉える',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => observation.violations.filter((v) => v.source === 'console').length, {
        message: 'コンソールの CSP の違反の表示を捉える',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThanOrEqual(2);
    const details = observation.violations.map((violation) => violation.detail).join('\n');
    expect(details, 'connect-src の違反として観測される').toContain('connect-src');
    expect(details, 'img-src の違反として観測される').toContain('img-src');
    await expect
      .poll(
        () =>
          observation.violations.filter(
            (v) => v.source === 'cdp-log' && v.detail.includes('csp-probe.example.invalid')
          ).length,
        { message: 'CDP の記録が文書の違反を捉える', timeout: getTimeout(10000) }
      )
      .toBeGreaterThanOrEqual(1);
  });

  /**
   * worker の経路の確認。blob の Worker の中で、配信された CSP が許さない取得先への接続と
   * `new Function('')` を起こし、worker の経路（受け手の配列の読み出し・目印付きの送信）が
   * connect-src と eval（script-src）の違反をそれぞれ捉えること、CDP の記録が worker の中の
   * connect-src の違反を捉えることを確かめる。受入基準の被覆ではないため `@requirement` は付けない。
   */
  test('観測の確認: Web Worker の中の接続と eval の違反は worker の経路で観測される', async ({
    page,
  }) => {
    const observation = await observeScreen(page);
    await page.goto('/login');
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible({ timeout: getTimeout(15000) });

    // 受け手の登録が終わってから違反を起こすため、worker は合図を受けてから動く
    const workerUrl = await page.evaluate(() => {
      const source = `self.onmessage = async () => {
        await fetch('https://csp-probe.example.invalid/worker.json').catch(() => null);
        try { new Function(''); } catch (error) { void error; }
        self.postMessage('done');
      };`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      (window as unknown as Record<string, Worker>).__cspProbeWorker = new Worker(url);
      return url;
    });
    await expect
      .poll(() => observation.workers.filter((record) => record.url === workerUrl).length, {
        message: '前提: blob の Worker の生成を受けた',
        timeout: getTimeout(10000),
      })
      .toBe(1);
    const probeRecord = observation.workers.find((record) => record.url === workerUrl)!;
    expect(await probeRecord.registration, '前提: worker に受け手を登録できた').toEqual({
      registered: true,
    });

    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const worker = (window as unknown as Record<string, Worker>).__cspProbeWorker!;
          worker.onmessage = () => resolve();
          worker.postMessage('go');
        })
    );

    const collected = await collectWorkerViolations(observation);
    expect(collected.unobservable, '前提: worker の中の違反を観測できる').toEqual([]);
    const workerDetails = collected.violations
      .filter((violation) => violation.detail.startsWith(workerUrl))
      .map((violation) => violation.detail);
    expect(
      workerDetails.some((detail) => detail.includes('connect-src')),
      `worker の経路が worker の中の connect-src の違反を捉える（観測: ${JSON.stringify(workerDetails)}）`
    ).toBe(true);
    expect(
      workerDetails.some((detail) => detail.includes('script-src') && detail.includes('eval')),
      `worker の経路が worker の中の eval の違反を捉える（観測: ${JSON.stringify(workerDetails)}）`
    ).toBe(true);
    await expect
      .poll(() => probeRecord.forwarded.length, {
        message:
          'worker の受け手が目印付きの送信でも二件を送る（終わった worker の読み出しの代わり）',
        timeout: getTimeout(10000),
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(
        () =>
          observation.violations.filter(
            (v) => v.source === 'cdp-log' && v.detail.includes('worker.json')
          ).length,
        {
          message: 'CDP の記録が worker の中の connect-src の違反を捉える',
          timeout: getTimeout(10000),
        }
      )
      .toBeGreaterThanOrEqual(1);
  });
});
