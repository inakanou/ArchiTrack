/**
 * @fileoverview 内訳書の Excel の出力の事前記録の E2E テスト
 *
 * itemized-statement-generation タスク27.2。design.md の「Requirement 18: 案件の閲覧範囲と出力の記録の適用」の章の
 * 「出力の記録」。内訳書詳細画面の Excel の出力は、生成を始める前に `POST /api/v1/audit-logs/exports`
 * （user-authentication の ExportAuditService）へ出力の記録を要求し、記録が成功したときだけ生成とダウンロードを始める。
 * 記録の要求が失敗したときは生成もダウンロードも始めず、エラーメッセージを表示する。
 *
 * 被覆する受入基準（itemized-statement-generation の Requirement 18.7・18.8）は各テストの `@requirement` の印が名乗る。
 *
 * タスク28.1: 同じ画面のクリップボードへのコピーも、書き込みの前に出力の記録を要求し、記録の成功の後にだけ
 * 中身を書き込み、記録の失敗では何も書き込まずに同じエラーメッセージを表示する（Requirement 18.9・18.10。
 * describe「内訳書のクリップボードへのコピーの事前記録」）。書き込みは user-authentication の
 * `runRecordedClipboardWrite` が行う。クリップボードの中身は Chromium に読み書きの権限を与えて読む
 * （E2E の設定は Chromium だけ）。
 *
 * 通信の観測は URL のパスで照合する（CI とローカルで API のオリジンが異なるため）。
 * Excel はブラウザで生成し通信を伴わないため、生成の始まりはダウンロードで観測する。
 * ダウンロードが実際に起きたことは `page.waitForEvent('download')` で確かめる（応答の成功だけで判定しない）。
 *
 * 検証に使う案件・数量表・内訳書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
 * 作る一意のメールアドレスの利用者（営業担当者・作成者）とする。後始末で案件を先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-is-export-audit-';

/** 出力の記録の経路（user-authentication タスク53.3） */
const RECORD_PATH = '/api/v1/audit-logs/exports';

/** 記録の失敗で表示するエラーメッセージ（Requirement 18.8・18.10） */
const RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

/** コピーの成功の通知（Requirement 14.6） */
const COPY_SUCCEEDED_MESSAGE = 'クリップボードにコピーしました';

/** 記録の後の書き込みの失敗のエラーメッセージ（Requirement 14.7） */
const COPY_FAILED_MESSAGE = 'クリップボードへのコピーに失敗しました';

/** コピーの前にクリップボードへ入れておく中身（記録の失敗で変わらないことを確かめる） */
const PREVIOUS_CLIPBOARD = 'e2e-previous-clipboard-content';

interface Fixture {
  projectId: string;
  statementId: string;
  statementName: string;
}

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** 正規表現の特殊文字を逃がす */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 案件・数量表・内訳書（内訳項目 3 件。工種A が 2 件、工種B が 1 件）を DB に作る */
async function createFixture(owner: CreatedUser): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const project = await prisma.project.create({
    data: { name: `${NAME_PREFIX}${suffix}`, salesPersonId: owner.id, createdById: owner.id },
    select: { id: true },
  });
  const quantityTable = await prisma.quantityTable.create({
    data: { projectId: project.id, name: `出力の事前記録の数量表 ${suffix}` },
    select: { id: true },
  });
  const statementName = `出力の事前記録の内訳書 ${suffix}`;
  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId: project.id,
      name: statementName,
      sourceQuantityTableId: quantityTable.id,
      sourceQuantityTableName: '出力の事前記録の数量表',
      items: {
        create: [
          {
            workType: '工種A',
            name: '出力の事前記録の内訳1',
            unit: '式',
            quantity: 1,
            displayOrder: 0,
          },
          {
            workType: '工種B',
            name: '出力の事前記録の内訳2',
            unit: 'm',
            quantity: 2,
            displayOrder: 1,
          },
          {
            workType: '工種A',
            name: '出力の事前記録の内訳3',
            unit: 'm2',
            quantity: 3,
            displayOrder: 2,
          },
        ],
      },
    },
    select: { id: true },
  });
  return { projectId: project.id, statementId: statement.id, statementName };
}

/** 出力の操作で観測した出来事 */
type ExportEvent = 'record-request' | 'record-response' | 'download';

/**
 * 内訳書詳細画面を開いて表示が落ち着いてから出力の操作の観測を始める
 */
async function openAndObserve(page: Page, fixture: Fixture) {
  const detailResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      pathOf(r.url()) === `/api/itemized-statements/${fixture.statementId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/itemized-statements/${fixture.statementId}`);
  expect((await detailResponse).status(), '前提: 内訳書の詳細を取得できる').toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: fixture.statementName })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await page.waitForLoadState('networkidle');

  const events: ExportEvent[] = [];
  const recordRequestBodies: unknown[] = [];
  const recordStatuses: number[] = [];

  page.on('request', (request) => {
    if (pathOf(request.url()) === RECORD_PATH && request.method() === 'POST') {
      events.push('record-request');
      recordRequestBodies.push(request.postDataJSON());
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

test.describe('内訳書の Excel の出力の事前記録', () => {
  test.afterEach(async () => {
    // 数量表・内訳書・内訳項目は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.7
   */
  test('内訳書の Excel の出力が生成より前に出力の記録を種別・案件・内訳書・フィルタ後の件数つきで1回要求する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner);
    await loginAsUser(page, owner);
    const observed = await openAndObserve(page, fixture);

    // 工種A で絞り込み、出力の対象を 3 件から 2 件にする（記録の件数はフィルタ後の件数。Requirement 13.6）
    await page
      .getByRole('region', { name: 'フィルタ' })
      .getByLabel('工種', { exact: true })
      .fill('工種A');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await page.getByRole('button', { name: 'Excelダウンロード' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^${escapeRegExp(fixture.statementName)}_\\d{8}\\.xlsx$`)
    );
    // 生成とダウンロードが終わると出力の操作が戻る
    await expect(page.getByRole('button', { name: 'Excelダウンロード' })).toBeEnabled({
      timeout: getTimeout(30000),
    });

    expect(
      observed.recordStatuses,
      'REQ-18.7: 内訳書の Excel の出力が出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies, 'REQ-18.7: 記録の要求は 1 回だけ').toHaveLength(1);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'itemized_statement_xlsx',
      projectId: fixture.projectId,
      targetIds: [fixture.statementId],
      itemCount: 2,
    });

    const recordResponse = observed.events.indexOf('record-response');
    expect(recordResponse, 'REQ-18.7: 記録の応答が返っている').toBeGreaterThanOrEqual(0);
    expect(recordResponse, 'REQ-18.7: 記録の応答がダウンロード（生成）より前に返る').toBeLessThan(
      observed.events.indexOf('download')
    );
    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-18.7: 1 回の操作でダウンロードは 1 回'
    ).toHaveLength(1);
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.8
   */
  test('出力の記録が失敗すると内訳書の Excel を生成もダウンロードもせずエラーメッセージを表示する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner);
    await loginAsUser(page, owner);
    const recordAttempts = await failExportRecords(page);
    const observed = await openAndObserve(page, fixture);

    const exportButton = page.getByRole('button', { name: 'Excelダウンロード' });
    await exportButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-18.8: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    // 生成中の表示は解かれ、出力し直せる
    await expect(exportButton).toBeEnabled();
    await expect(exportButton).toHaveText('Excel');

    expect(
      observed.events.filter((event) => event === 'download'),
      'REQ-18.8: 記録の失敗の後に生成もダウンロードも始まらない'
    ).toEqual([]);
  });
});

/** クリップボードの中身を読む（Chromium に読み書きの権限を与えてある前提） */
async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(async () => navigator.clipboard.readText());
}

/** クリップボードへ前の中身を入れ、入ったことを確かめる */
async function seedClipboard(page: Page): Promise<void> {
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), PREVIOUS_CLIPBOARD);
  expect(await readClipboard(page), '前提: クリップボードに前の中身が入っている').toBe(
    PREVIOUS_CLIPBOARD
  );
}

test.describe('内訳書のクリップボードへのコピーの事前記録', () => {
  test.afterEach(async () => {
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.9
   */
  test('コピーは出力の記録を種別・案件・内訳書・フィルタ後の件数つきで1回要求し、記録の成功の後にだけクリップボードへ書き込む', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner);
    await loginAsUser(page, owner);

    // 記録の要求を止めておき、記録の応答より前にクリップボードが変わらないことを確かめる
    let releaseRecord: () => void = () => {};
    const recordGate = new Promise<void>((resolve) => {
      releaseRecord = resolve;
    });
    let recordHeld!: () => void;
    const recordArrived = new Promise<void>((resolve) => {
      recordHeld = resolve;
    });
    await page.route('**/api/v1/audit-logs/exports', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      recordHeld();
      await recordGate;
      await route.continue();
    });

    const observed = await openAndObserve(page, fixture);
    await seedClipboard(page);

    // 工種A で絞り込み、コピーの対象を 3 件から 2 件にする（Requirement 14.5）
    await page
      .getByRole('region', { name: 'フィルタ' })
      .getByLabel('工種', { exact: true })
      .fill('工種A');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);

    const copyButton = page.getByRole('button', { name: 'クリップボードにコピー' });
    await copyButton.click();

    await recordArrived;
    // 記録の要求中: コピーの操作は止まり、クリップボードは前の中身のまま
    await expect(copyButton).toBeDisabled();
    expect(
      await readClipboard(page),
      'REQ-18.9: 記録の応答より前にクリップボードへ書き込まれない'
    ).toBe(PREVIOUS_CLIPBOARD);

    releaseRecord();

    await expect(
      page.getByRole('status').filter({ hasText: COPY_SUCCEEDED_MESSAGE }),
      'REQ-18.9: 記録の成功の後にコピーが成功する'
    ).toBeVisible({ timeout: getTimeout(30000) });
    await expect(copyButton).toBeEnabled();

    expect(
      observed.recordStatuses,
      'REQ-18.9: コピーが出力の記録を 1 回要求し、201 で記録される'
    ).toEqual([201]);
    expect(observed.recordRequestBodies, 'REQ-18.9: 記録の要求は 1 回だけ').toHaveLength(1);
    expect(observed.recordRequestBodies[0]).toEqual({
      kind: 'itemized_statement_clipboard',
      projectId: fixture.projectId,
      targetIds: [fixture.statementId],
      itemCount: 2,
    });

    expect(
      await readClipboard(page),
      'REQ-18.9: 記録の成功の後にフィルタ後の項目がタブ区切りで書き込まれる（Requirement 14.2〜14.5・14.8）'
    ).toBe(
      [
        '任意分類\t工種\t名称\t規格\t数量\t単位',
        '\t工種A\t出力の事前記録の内訳1\t\t1.00\t式',
        '\t工種A\t出力の事前記録の内訳3\t\t3.00\tm2',
      ].join('\n') + '\n'
    );
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.10
   */
  test('出力の記録が失敗するとクリップボードへ何も書き込まず、記録の失敗のエラーメッセージを表示する', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const owner = await createSessionUser('REGULAR_USER');
    const fixture = await createFixture(owner);
    await loginAsUser(page, owner);
    const recordAttempts = await failExportRecords(page);
    await openAndObserve(page, fixture);
    await seedClipboard(page);

    const copyButton = page.getByRole('button', { name: 'クリップボードにコピー' });
    await copyButton.click();

    await expect(
      page.getByRole('alert').filter({ hasText: RECORD_FAILED_MESSAGE }),
      `REQ-18.10: 記録の失敗で「${RECORD_FAILED_MESSAGE}」が表示される`
    ).toBeVisible({ timeout: getTimeout(30000) });
    // 記録の要求は非冪等なので API クライアントは送り直さない。失敗の応答でも回数はちょうど 1 回
    expect(
      recordAttempts(),
      '記録の要求はちょうど 1 回送られ、失敗の応答を受けても送り直されない'
    ).toBe(1);
    await expect(copyButton).toBeEnabled();

    expect(
      await readClipboard(page),
      'REQ-18.10: 記録の失敗ではクリップボードへ何も書き込まれず、前の中身のまま'
    ).toBe(PREVIOUS_CLIPBOARD);
    await expect(
      page.getByText(COPY_SUCCEEDED_MESSAGE),
      'REQ-18.10: 記録の失敗でコピーの成功の通知を出さない'
    ).toHaveCount(0);
    await expect(
      page.getByText(COPY_FAILED_MESSAGE),
      'REQ-18.10: 記録の失敗は 14.7 の文言に代えて記録の失敗の文言で表示する'
    ).toHaveCount(0);
  });
});
