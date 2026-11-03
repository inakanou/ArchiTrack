/**
 * @fileoverview 見積書の PDF・Excel の出力の事前記録の E2E テスト
 *
 * estimate-creation タスク62.2。design.md の「Requirement 57: 案件の閲覧範囲と出力の記録の適用」の章の「出力の記録」。
 * 見積書の出力のダイアログは、生成を始める前に `POST /api/v1/audit-logs/exports`（user-authentication の
 * ExportAuditService）へ出力の記録を要求し、記録が成功したときだけ生成とダウンロードを始める。
 * 記録の要求が失敗したときは生成もダウンロードも始めず、エラーメッセージを表示する。
 *
 * 被覆する受入基準（estimate-creation の Requirement 57.7・57.8）は各テストの `@requirement` の印が名乗る。
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * PDF の生成の始まりは、生成が表紙の周辺情報として読む自社情報の取得（`GET /api/company-info`）で観測する
 * （見積書の詳細画面の表示はこの取得を送らない）。Excel の生成は通信を伴わないため、ダウンロードで観測する。
 * ダウンロードが実際に起きたことは `page.waitForEvent('download')` で確かめる（応答の成功だけで判定しない）。
 *
 * 検証に使う案件・見積書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
 * 作る一意のメールアドレスの利用者（営業担当者・作成者）とする。後始末で案件を先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Request } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-ec-export-audit-';

/** 出力の記録の経路（user-authentication タスク53.3） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** PDF の生成が表紙の周辺情報として読む自社情報の経路（生成の始まりの観測先） */
const COMPANY_INFO_PATH = '/api/company-info';

/** 記録の失敗で表示するエラーメッセージ（Requirement 57.8） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

interface Fixture {
  projectId: string;
  estimateId: string;
  estimateName: string;
}

/**
 * 出力の形式（ダイアログのラジオボタンの value と、記録の種別）
 *
 * `generationStart` は生成の始まりとして観測する出来事。PDF は表紙の周辺情報（自社情報）の取得、
 * Excel は通信を伴わないためダウンロードとする。
 */
const FORMATS = [
  {
    label: 'PDF',
    value: 'pdf',
    kind: 'estimate_pdf',
    extension: 'pdf',
    generationStart: 'generation-request',
  },
  {
    label: 'Excel',
    value: 'xlsx',
    kind: 'estimate_xlsx',
    extension: 'xlsx',
    generationStart: 'download',
  },
] as const;

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** 案件・見積書（見積項目 1 件）を DB に作る */
async function createFixture(owner: CreatedUser): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const project = await prisma.project.create({
    data: { name: `${NAME_PREFIX}${suffix}`, salesPersonId: owner.id, createdById: owner.id },
    select: { id: true },
  });
  const estimateName = `出力の事前記録の見積書 ${suffix}`;
  const estimate = await prisma.estimate.create({
    data: {
      projectId: project.id,
      name: estimateName,
      items: {
        create: [
          {
            displayOrder: 0,
            lines: {
              create: [
                {
                  lineType: 'ESTIMATE',
                  name: '出力の事前記録の見積項目',
                  unit: '式',
                  quantity: 1,
                  unitPrice: 100000,
                  amount: 100000,
                },
              ],
            },
          },
        ],
      },
    },
    select: { id: true },
  });
  return { projectId: project.id, estimateId: estimate.id, estimateName };
}

/** 出力の操作で観測した出来事 */
type ExportEvent = 'record-request' | 'record-response' | 'generation-request' | 'download';

/**
 * 見積書の詳細画面を開いて表示が落ち着いてから出力の操作の観測を始め、出力のダイアログで形式を選ぶ
 *
 * 出力対象は「見積」だけにする（1 回の出力で 1 ファイル）。
 */
async function openDialogAndObserve(page: Page, fixture: Fixture, format: 'pdf' | 'xlsx') {
  const detailResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' && pathOf(r.url()) === `/api/estimates/${fixture.estimateId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/estimates/${fixture.estimateId}`);
  expect((await detailResponse).status(), '前提: 見積書の詳細を取得できる').toBe(200);
  await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
  await page.waitForLoadState('networkidle');

  const events: ExportEvent[] = [];
  const recordRequestBodies: unknown[] = [];
  const recordStatuses: number[] = [];
  const isGenerationRequest = (request: Request): boolean =>
    request.method() === 'GET' && pathOf(request.url()) === COMPANY_INFO_PATH;

  page.on('request', (request) => {
    if (pathOf(request.url()) === RECORD_PATH && request.method() === 'POST') {
      events.push('record-request');
      recordRequestBodies.push(request.postDataJSON());
    } else if (isGenerationRequest(request)) {
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

  await page.getByRole('button', { name: /^出力$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
  await dialog.locator('input[type="checkbox"][value="EXECUTION"]').uncheck();
  await expect(dialog.locator('input[type="checkbox"][value="ESTIMATE"]')).toBeChecked();
  await dialog.locator(`input[type="radio"][name="export-format"][value="${format}"]`).check();

  return { dialog, events, recordRequestBodies, recordStatuses };
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

test.describe('見積書の PDF・Excel の出力の事前記録', () => {
  test.afterEach(async () => {
    // 見積書・見積項目・見積項目行は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  for (const format of FORMATS) {
    /**
     * @requirement estimate-creation/REQ-57.7
     */
    test(`見積書の ${format.label} の出力が生成より前に出力の記録を種別・案件・見積書つきで1回要求する`, async ({
      page,
    }) => {
      const owner = await createSessionUser('REGULAR_USER');
      const fixture = await createFixture(owner);
      await loginAsUser(page, owner);
      const observed = await openDialogAndObserve(page, fixture, format.value);

      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
      await observed.dialog.getByRole('button', { name: /^出力$/ }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${fixture.estimateName}_見積.${format.extension}`);
      // 生成とダウンロードが終わるとダイアログが閉じる
      await expect(observed.dialog).toBeHidden({ timeout: getTimeout(60000) });

      expect(
        observed.recordStatuses,
        `REQ-57.7: 見積書の ${format.label} の出力が出力の記録を 1 回要求し、201 で記録される`
      ).toEqual([201]);
      expect(observed.recordRequestBodies, 'REQ-57.7: 記録の要求は 1 回だけ').toHaveLength(1);
      expect(observed.recordRequestBodies[0]).toEqual({
        kind: format.kind,
        projectId: fixture.projectId,
        targetIds: [fixture.estimateId],
        itemCount: 1,
      });

      const recordResponse = observed.events.indexOf('record-response');
      expect(recordResponse, 'REQ-57.7: 記録の応答が返っている').toBeGreaterThanOrEqual(0);
      const firstGeneration = observed.events.indexOf(format.generationStart);
      expect(
        firstGeneration,
        `前提: ${format.label} の生成の始まり（${format.generationStart}）を観測できる`
      ).toBeGreaterThanOrEqual(0);
      expect(recordResponse, 'REQ-57.7: 記録の応答が生成の始まりより前に返る').toBeLessThan(
        firstGeneration
      );
      expect(recordResponse, 'REQ-57.7: 記録の応答がダウンロードより前に返る').toBeLessThan(
        observed.events.indexOf('download')
      );
    });

    /**
     * @requirement estimate-creation/REQ-57.8
     */
    test(`出力の記録が失敗すると見積書の ${format.label} を生成もダウンロードもせずエラーメッセージを表示する`, async ({
      page,
    }) => {
      const owner = await createSessionUser('REGULAR_USER');
      const fixture = await createFixture(owner);
      await loginAsUser(page, owner);
      const recordAttempts = await failExportRecords(page);
      const observed = await openDialogAndObserve(page, fixture, format.value);

      const exportButton = observed.dialog.getByRole('button', { name: /^出力/ });
      await exportButton.click();

      await expect(
        observed.dialog.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
        `REQ-57.8: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
      ).toBeVisible({ timeout: getTimeout(30000) });
      // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
      expect(
        recordAttempts(),
        '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
      ).toBe(1);
      // ダイアログは閉じず、出力し直せる
      await expect(observed.dialog).toBeVisible();
      await expect(exportButton).toBeEnabled();
      await expect(exportButton).toHaveText('出力');

      expect(
        observed.events.filter((event) => event === 'generation-request'),
        'REQ-57.8: 記録の失敗の後に生成（表紙の周辺情報の取得）が始まらない'
      ).toEqual([]);
      expect(
        observed.events.filter((event) => event === 'download'),
        'REQ-57.8: 記録の失敗の後にダウンロードが始まらない'
      ).toEqual([]);
    });
  }
});
