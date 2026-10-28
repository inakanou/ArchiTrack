/**
 * @fileoverview 工程表の出力の記録の E2E テスト
 *
 * construction-schedule タスク22.2。design.md の「Requirement 13: 案件の閲覧範囲と出力の記録の適用」の章。
 * 工程表の Excel・PDF はサーバーで生成する。サーバーはファイルを生成する前に出力の記録
 * （user-authentication の ExportAuditService）を 1 回行い、記録が失敗したときはファイルを返さず
 * 500 と識別子 `EXPORT_RECORD_FAILED` を返す。出力のダイアログはその応答でダウンロードを始めず、
 * エラーメッセージを表示する。ブラウザからは記録の要求（`POST /api/v1/audit-logs/exports`）を送らない
 * （二重の記録になるため）。
 *
 * 被覆する受入基準（construction-schedule の Requirement 13.6・13.7）は各テストの `@requirement` の印が名乗る。
 *
 * 記録は DB の監査 `DATA_EXPORTED`（実行者・種別・案件・対象・件数）で確かめ、ダウンロードは
 * Playwright の download の事象で確かめる（応答の成功だけで判定しない）。記録の失敗は、サーバー生成のため
 * 出力の要求そのものを route で記録の失敗の応答（500・EXPORT_RECORD_FAILED）にして起こす
 * （execution-budget-management タスク17.2 の E2E と同じ手段）。出力のダイアログは fetch で一度だけ要求する。
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 *
 * 検証に使う案件・工程表はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で作る
 * 一意のメールアドレスの利用者（営業担当者・作成者）とする。後始末で案件を先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page, type Request } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createSessionUser, deleteSessionUsers } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-cs-export-audit-';

/** ブラウザで生成する出力の記録の経路（本機能の出力では使わない） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 記録の失敗で表示するエラーメッセージ（Requirement 13.7） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

/** 出力の失敗の汎用の文言（Requirement 7.6・8.6） */
const EXPORT_FAILED_MESSAGE = '工程表の出力に失敗しました';

interface Fixture {
  projectId: string;
  scheduleId: string;
  scheduleName: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件と工程表（工程項目 3 件、うち出力対象 2 件）を DB に作る */
async function createFixture(ownerId: string): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = uniqueSuffix();
  const project = await prisma.project.create({
    data: { name: `${NAME_PREFIX}${suffix}`, salesPersonId: ownerId, createdById: ownerId },
    select: { id: true },
  });
  const scheduleName = `出力の記録の検証の工程表 ${suffix}`;
  const schedule = await prisma.constructionSchedule.create({
    data: {
      projectId: project.id,
      name: scheduleName,
      version: 0,
      items: {
        create: [
          { itemName: '出力の記録の検証の工程1', displayOrder: 0, duration: 2 },
          {
            itemName: '出力の記録の検証の工程2',
            displayOrder: 1,
            duration: 3,
            isExportTarget: false,
          },
          { itemName: '出力の記録の検証の工程3', displayOrder: 2, duration: 4 },
        ],
      },
    },
    select: { id: true },
  });
  return { projectId: project.id, scheduleId: schedule.id, scheduleName };
}

/** 利用者が残した監査 DATA_EXPORTED の行 */
async function exportRecords(actorId: string) {
  return getPrismaClient().auditLog.findMany({
    where: { action: 'DATA_EXPORTED', actorId },
    orderBy: { createdAt: 'asc' },
  });
}

/** 出力の要求・ブラウザからの記録の要求・ダウンロードを数える */
function observe(page: Page, exportPath: string) {
  const counts = { exportRequests: 0, recordRequests: 0, downloads: 0 };
  page.on('request', (req: Request) => {
    const path = new URL(req.url()).pathname;
    if (req.method() === 'GET' && path === exportPath) {
      counts.exportRequests += 1;
    }
    if (req.method() === 'POST' && path === RECORD_PATH) {
      counts.recordRequests += 1;
    }
  });
  page.on('download', () => {
    counts.downloads += 1;
  });
  return counts;
}

/** 出力の要求を、サーバーの記録の失敗の応答（ファイルを含まない 500）にする。返した回数を数える */
async function failExportRecord(page: Page, exportPath: string): Promise<{ fulfilled: number }> {
  const state = { fulfilled: 0 };
  await page.route(
    (url) => url.pathname === exportPath,
    async (route) => {
      state.fulfilled += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: RECORD_FAILED_MESSAGE,
          code: 'EXPORT_RECORD_FAILED',
        }),
      });
    }
  );
  return state;
}

/** 工程表詳細画面を開き、出力のダイアログを開く */
async function openExportDialog(page: Page, fixture: Fixture) {
  await page.goto(`/schedules/${fixture.scheduleId}`);
  await expect(page.getByRole('heading', { level: 1, name: fixture.scheduleName })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await page.getByTestId('export-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: getTimeout(5000) });
  return dialog;
}

test.describe('工程表の出力の記録', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // 工程表・工程項目は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement construction-schedule/REQ-13.6
   */
  test('出力のダイアログからの Excel 出力と PDF 出力は、出力のたびに種別・案件・工程表・件数つきの記録を 1 件残して実際にダウンロードされ、ブラウザからは記録を要求しない', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner.id);
    const exportPath = `/api/schedules/${fixture.scheduleId}/export`;
    const counts = observe(page, exportPath);

    await loginAsUser(page, owner);

    for (const [format, recordCount] of [
      ['xlsx', 1],
      ['pdf', 2],
    ] as const) {
      const dialog = await openExportDialog(page, fixture);
      const radio = dialog.locator(`input[value="${format}"]`);
      await radio.click();
      await expect(radio).toBeChecked({ timeout: getTimeout(5000) });

      const download = page.waitForEvent('download', { timeout: getTimeout(30000) });
      await dialog.getByRole('button', { name: '出力', exact: true }).click();
      expect((await download).suggestedFilename()).toBe(`${fixture.scheduleName}.${format}`);

      await expect
        .poll(async () => (await exportRecords(owner.id)).length, {
          timeout: getTimeout(15000),
        })
        .toBe(recordCount);
    }

    const records = await exportRecords(owner.id);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record).toMatchObject({ targetType: 'Project', targetId: fixture.projectId });
      expect(record.metadata).toMatchObject({
        kind: 'schedule_export',
        projectId: fixture.projectId,
        targetIds: [fixture.scheduleId],
        itemCount: 2,
      });
    }
    expect(counts.exportRequests).toBe(2);
    expect(counts.downloads).toBe(2);
    expect(counts.recordRequests).toBe(0);
    await expect(page.getByText(RECORD_FAILED_MESSAGE)).toHaveCount(0);
  });

  /**
   * @requirement construction-schedule/REQ-13.7
   */
  test('出力のダイアログは出力の記録の失敗の応答でダウンロードを始めず、出力を記録できなかった旨を表示する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner.id);
    const exportPath = `/api/schedules/${fixture.scheduleId}/export`;
    const counts = observe(page, exportPath);
    const failure = await failExportRecord(page, exportPath);

    await loginAsUser(page, owner);
    const dialog = await openExportDialog(page, fixture);
    await dialog.getByRole('button', { name: '出力', exact: true }).click();

    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText(RECORD_FAILED_MESSAGE, { timeout: getTimeout(30000) });
    await expect(alert).not.toContainText(EXPORT_FAILED_MESSAGE);
    // ダイアログは閉じず、再試行の釦が残る
    await expect(alert.getByRole('button', { name: '再試行', exact: true })).toBeVisible();
    expect(failure.fulfilled).toBeGreaterThan(0);
    expect(counts.exportRequests).toBeGreaterThan(0);
    expect(counts.recordRequests).toBe(0);
    expect(counts.downloads).toBe(0);
    expect(await exportRecords(owner.id)).toHaveLength(0);
  });
});
