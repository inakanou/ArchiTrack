/**
 * @fileoverview 単価台帳の Excel の書き出しの E2E（unit-price-ledger タスク5.3）
 *
 * システム管理者が台帳の画面で一覧を絞り込み、その結果を Excel に書き出す。次のことを確かめる。
 * - ダウンロードした `単価台帳_YYYYMMDD.xlsx` が「見積」「明細行」「要確認」の 3 つのシートを持ち、
 *   絞り込みの結果の見積だけを、見積日の新しい順に、6.2 の列で出している
 * - 書き出しが監査ログ `DATA_EXPORTED`（種別 `unit_price_ledger_xlsx`・案件なし・件数は見積の数）に記録されている
 * - 出力の記録に失敗したときは、ファイルを出さずに「書き出しを記録できなかったため、出力を中止しました」と出す
 * - 絞り込みの結果が 0 件のときは、書き出しの操作ができない
 *
 * 記録の失敗の起こし方：出力の記録はサーバーが書き出しの要求（POST /api/unit-price-ledger/exports）の中で行い、
 * 画面から別の記録の要求は出ない。そこで書き出しの要求を E2E の中で横取りし、サーバーの ApiError と同じ形の
 * Problem Details（500・`code: 'EXPORT_RECORD_FAILED'`）を返させて、記録の失敗の応答を起こす。
 *
 * 材料は始める前に DB へ作る（業者名・案件名に `E2E書出検証` を入れる）。始める前と終わった後に、その文字の
 * 受領見積書（明細行は連鎖して消える）と案件を消す。5.1（`E2E取込検証`）・5.2（`E2E修正検証`）とは別の文字を使う。
 * - 甲：案件の無い受領見積書（採用）。直接工事の行（換算・分類キーあり）、参考の印のある行、別途の行
 * - 乙：案件の受領見積書（採用）。直接工事の行と産廃の行（分類キーは空）
 * - 丙：案件の無い受領見積書（不採用）。採否の絞り込みで外れる
 *
 * Requirements coverage (unit-price-ledger):
 * - 6.1: その時点の絞り込みの結果を、見積・明細行・要確認の 3 つのシートの Excel に書き出す
 * - 6.2: 明細行の一覧に、業者名・見積日・案件名と、区分・名称・規格・数量・単位・単価・金額・条件・換算・
 *   参考の印と理由・分類キーを出す
 * - 6.3: 書き出しを、実行者・出力の種別・件数・日時とともに出力の記録に残す
 * - 6.4: 出力の記録に失敗したら、ファイルを出さずに「書き出しを記録できなかったため、出力を中止しました」と出す
 * - 6.5: 絞り込みの結果が 0 件のとき、書き出しの操作をできないようにする
 */

import ExcelJS from 'exceljs';
import { test, expect, type Download, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { TEST_USERS } from '../../helpers/test-users';
import { getPrismaClient } from '../../fixtures/database';

/** 材料に共通の文字（業者名・案件名に入れる） */
const KEYWORD = 'E2E書出検証';

/** 書き出しの経路 */
const EXPORT_PATH = '/api/unit-price-ledger/exports';

/** 記録の失敗の文言（6.4） */
const RECORD_FAILED_MESSAGE = '書き出しを記録できなかったため、出力を中止しました';

/** シートの名前と並び（6.1） */
const SHEET_NAMES = ['見積', '明細行', '要確認'] as const;

/** 見積のシートの見出し（4.1 の一覧と同じ列） */
const QUOTATION_HEADER = [
  '業者名',
  '見積日',
  '案件名',
  '見積の合計（別途を除く）',
  '採否',
  '読取の確認',
  '参考の行',
];

/** 明細行・要確認のシートの見出し（6.2） */
const LINE_HEADER = [
  '業者名',
  '見積日',
  '案件名',
  '区分',
  '名称',
  '規格',
  '数量',
  '単位',
  '単価',
  '金額',
  '条件',
  '換算の数量',
  '換算の単位',
  '換算の単価',
  '換算の根拠',
  '参考の印',
  '参考の理由',
  '分類キー',
];

/** 材料の業者名・案件名・見積日 */
const FIXTURE = {
  kou: {
    vendor: `${KEYWORD}_塗装`,
    project: `${KEYWORD}_北庁舎改修`,
    date: '2026-10-01',
  },
  otsu: {
    vendor: `${KEYWORD}_設備`,
    project: `${KEYWORD}_南小学校改修`,
    date: '2026-09-15',
  },
  hei: {
    vendor: `${KEYWORD}_運送`,
    project: `${KEYWORD}_東倉庫新営`,
    date: '2026-08-01',
  },
} as const;

/** セルの値（空のセルは null） */
type CellValue = string | number | null;

/** 甲の明細行のシートの行（6.2 の列） */
const KOU_LINES: CellValue[][] = [
  [
    FIXTURE.kou.vendor,
    FIXTURE.kou.date,
    FIXTURE.kou.project,
    '直接工事',
    '外壁塗装',
    'シリコン系',
    10,
    'm2',
    2000,
    20000,
    '足場別途',
    20,
    '缶',
    1000,
    '1 缶 0.5m2',
    'なし',
    null,
    'E2E-KEY-001',
  ],
  [
    FIXTURE.kou.vendor,
    FIXTURE.kou.date,
    FIXTURE.kou.project,
    '直接工事',
    '養生',
    null,
    5,
    'm2',
    3000,
    15000,
    null,
    null,
    null,
    null,
    null,
    'あり',
    '概算のみ',
    'E2E-KEY-002',
  ],
  [
    FIXTURE.kou.vendor,
    FIXTURE.kou.date,
    FIXTURE.kou.project,
    '別途',
    '仮設足場',
    null,
    1,
    '式',
    30000,
    30000,
    null,
    null,
    null,
    null,
    null,
    'なし',
    null,
    null,
  ],
];

/** 乙の明細行のシートの行（6.2 の列。案件名は案件の名前） */
const OTSU_LINES: CellValue[][] = [
  [
    FIXTURE.otsu.vendor,
    FIXTURE.otsu.date,
    FIXTURE.otsu.project,
    '直接工事',
    '照明器具交換',
    'LED 40W 形',
    4,
    '台',
    12000,
    48000,
    null,
    null,
    null,
    null,
    null,
    'なし',
    null,
    'E2E-KEY-101',
  ],
  [
    FIXTURE.otsu.vendor,
    FIXTURE.otsu.date,
    FIXTURE.otsu.project,
    '産廃',
    '撤去品処分',
    null,
    1,
    '式',
    8000,
    8000,
    null,
    null,
    null,
    null,
    null,
    'なし',
    null,
    null,
  ],
];

/** 日本時間の日付を YYYYMMDD にする（ファイル名の日付） */
function jstDateStamp(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(value)
    .replace(/-/g, '');
}

/** URL からパスを取り出す（解釈できなければ null） */
function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

// ============================================================================
// 材料
// ============================================================================

interface CreatedFixtures {
  kouId: string;
  otsuId: string;
  heiId: string;
}

/** 管理者の利用者の ID（無ければ前提の誤りとして失敗する） */
async function adminUserId(): Promise<string> {
  const user = await getPrismaClient().user.findUnique({
    where: { email: TEST_USERS.ADMIN_USER.email },
    select: { id: true },
  });
  if (!user) {
    throw new Error(`利用者 ${TEST_USERS.ADMIN_USER.email} が見つかりません（検証の前提の誤り）`);
  }
  return user.id;
}

/** 材料の見積（甲・乙・丙）を DB に作る */
async function createFixtures(): Promise<CreatedFixtures> {
  const prisma = getPrismaClient();
  const userId = await adminUserId();

  const kou = await prisma.receivedQuotation.create({
    data: {
      vendorName: FIXTURE.kou.vendor,
      name: `${FIXTURE.kou.vendor}_${FIXTURE.kou.date}`,
      submittedAt: new Date(`${FIXTURE.kou.date}T00:00:00.000Z`),
      ledgerCardId: 'E2E-LEDGER-EXPORT-KOU',
      ledgerProjectName: FIXTURE.kou.project,
      adoption: 'ADOPTED',
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: '外壁塗装',
            specification: 'シリコン系',
            quantity: 10,
            unit: 'm2',
            unitPrice: 2000,
            amount: 20000,
            condition: '足場別途',
            conversionQuantity: 20,
            conversionUnit: '缶',
            conversionUnitPrice: 1000,
            conversionBasis: '1 缶 0.5m2',
            classificationKey: 'E2E-KEY-001',
          },
          {
            sortOrder: 1,
            category: 'DIRECT',
            name: '養生',
            quantity: 5,
            unit: 'm2',
            unitPrice: 3000,
            amount: 15000,
            isReference: true,
            referenceReason: '概算のみ',
            classificationKey: 'E2E-KEY-002',
          },
          {
            sortOrder: 2,
            category: 'EXCLUDED',
            name: '仮設足場',
            quantity: 1,
            unit: '式',
            unitPrice: 30000,
            amount: 30000,
          },
        ],
      },
    },
    select: { id: true },
  });

  const project = await prisma.project.create({
    data: { name: FIXTURE.otsu.project, salesPersonId: userId, createdById: userId },
    select: { id: true },
  });
  const otsu = await prisma.receivedQuotation.create({
    data: {
      projectId: project.id,
      vendorName: FIXTURE.otsu.vendor,
      name: `${FIXTURE.otsu.vendor}_${FIXTURE.otsu.date}`,
      submittedAt: new Date(`${FIXTURE.otsu.date}T00:00:00.000Z`),
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      readingConfirmedById: userId,
      readingConfirmedAt: new Date('2026-09-16T01:00:00.000Z'),
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: '照明器具交換',
            specification: 'LED 40W 形',
            quantity: 4,
            unit: '台',
            unitPrice: 12000,
            amount: 48000,
            classificationKey: 'E2E-KEY-101',
          },
          {
            sortOrder: 1,
            category: 'WASTE',
            name: '撤去品処分',
            quantity: 1,
            unit: '式',
            unitPrice: 8000,
            amount: 8000,
          },
        ],
      },
    },
    select: { id: true },
  });

  const hei = await prisma.receivedQuotation.create({
    data: {
      vendorName: FIXTURE.hei.vendor,
      name: `${FIXTURE.hei.vendor}_${FIXTURE.hei.date}`,
      submittedAt: new Date(`${FIXTURE.hei.date}T00:00:00.000Z`),
      ledgerCardId: 'E2E-LEDGER-EXPORT-HEI',
      ledgerProjectName: FIXTURE.hei.project,
      adoption: 'REJECTED',
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'TRAVEL',
            name: '運搬費',
            quantity: 1,
            unit: '式',
            unitPrice: 20000,
            amount: 20000,
            isReference: true,
            referenceReason: '手書きの見積',
          },
        ],
      },
    },
    select: { id: true },
  });

  return { kouId: kou.id, otsuId: otsu.id, heiId: hei.id };
}

/** 材料の受領見積書（明細行は連鎖して消える）と案件を消す */
async function cleanupFixtures(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.receivedQuotation.deleteMany({ where: { vendorName: { startsWith: KEYWORD } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: KEYWORD } } });
}

/** 監査ログの metadata（JSON）を読む形 */
interface ExportAuditMetadata {
  kind: unknown;
  projectId: unknown;
  targetIds: unknown;
  itemCount: unknown;
}

function isExportAuditMetadata(value: unknown): value is ExportAuditMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Excel の読み戻し
// ============================================================================

/** 読み戻したシート */
interface SheetContent {
  name: string;
  rows: CellValue[][];
}

/** セルの値を文字・数・null にする（それ以外の形は検証の誤りとして失敗する） */
function toCellValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw new Error(`想定しないセルの値の形です：${JSON.stringify(value)}`);
}

/** ダウンロードした xlsx のすべてのシートを、見出しの列数で読み戻す */
async function readWorkbook(filePath: string): Promise<SheetContent[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((sheet) => {
    const columnCount = sheet.getRow(1).cellCount;
    const rows: CellValue[][] = [];
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells: CellValue[] = [];
      for (let column = 1; column <= columnCount; column += 1) {
        cells.push(toCellValue(row.getCell(column).value));
      }
      rows.push(cells);
    }
    return { name: sheet.name, rows };
  });
}

// ============================================================================
// 画面の操作
// ============================================================================

/** 絞り込みの結果の総件数（4.5） */
function resultCount(page: Page) {
  return page.getByRole('status', { name: '絞り込みの結果' });
}

/** 書き出しの操作 */
function exportButton(page: Page) {
  return page.getByRole('button', { name: '書き出し', exact: true });
}

/** 一覧をキーワードと採否で絞り込む */
async function searchLedger(
  page: Page,
  options: { keyword: string; adoption?: '採用' | '不採用' }
): Promise<void> {
  const form = page.getByRole('search', { name: '台帳の絞り込み' });
  await form.getByLabel('キーワード').fill(options.keyword);
  await form
    .getByLabel('採否', { exact: true })
    .selectOption({ label: options.adoption ?? 'すべて' });

  const listResponse = page.waitForResponse(
    (response) =>
      pathOf(response.url()) === '/api/unit-price-ledger/quotations' &&
      new URL(response.url()).searchParams.get('keyword') === options.keyword &&
      response.request().method() === 'GET',
    { timeout: getTimeout(30000) }
  );
  await form.getByRole('button', { name: '検索' }).click();
  expect((await listResponse).status()).toBe(200);
}

// ============================================================================
// テスト
// ============================================================================

test.describe('単価台帳の Excel の書き出し', () => {
  test.describe.configure({ mode: 'serial' });

  let fixtures: CreatedFixtures;

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixtures = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto('/unit-price-ledger');
    await expect(page.getByRole('heading', { level: 1, name: '単価台帳' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 初めの一覧を読み終えてから絞り込む（読み込み中は絞り込みの欄が使えない）
    await expect(resultCount(page)).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement unit-price-ledger/REQ-6.1
   * @requirement unit-price-ledger/REQ-6.2
   * @requirement unit-price-ledger/REQ-6.3
   */
  test('絞り込んだ結果を書き出すと、3 つのシートの Excel が保存され、出力の記録に残る (unit-price-ledger/REQ-6.1, REQ-6.2, REQ-6.3)', async ({
    page,
  }) => {
    // 採否「採用」で絞り込み、不採用の丙を外す
    await searchLedger(page, { keyword: KEYWORD, adoption: '採用' });
    await expect(resultCount(page)).toHaveText('2 件');
    await expect(exportButton(page)).toBeEnabled();

    const exportRequests: unknown[] = [];
    page.on('request', (request) => {
      if (pathOf(request.url()) === EXPORT_PATH && request.method() === 'POST') {
        exportRequests.push(request.postDataJSON());
      }
    });

    const stampBefore = jstDateStamp(new Date());
    const exportResponse = page.waitForResponse(
      (response) =>
        pathOf(response.url()) === EXPORT_PATH && response.request().method() === 'POST',
      { timeout: getTimeout(60000) }
    );
    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await exportButton(page).click();
    expect((await exportResponse).status()).toBe(200);
    const download: Download = await downloadPromise;
    const stampAfter = jstDateStamp(new Date());

    // その時点の絞り込みの条件を送っている（6.1）
    expect(exportRequests).toHaveLength(1);
    expect(exportRequests[0]).toMatchObject({ keyword: KEYWORD, adoption: 'ADOPTED' });

    // ファイル名は「単価台帳_YYYYMMDD.xlsx」（日本時間の日付）
    expect([`単価台帳_${stampBefore}.xlsx`, `単価台帳_${stampAfter}.xlsx`]).toContain(
      download.suggestedFilename()
    );
    await expect(exportButton(page)).toBeEnabled({ timeout: getTimeout(30000) });
    await expect(page.getByRole('alert')).toHaveCount(0);

    const sheets = await readWorkbook(await download.path());
    expect(sheets.map((sheet) => sheet.name)).toEqual([...SHEET_NAMES]);
    const [quotationSheet, lineSheet, reviewSheet] = sheets;

    // 見積のシート：絞り込みの結果の見積だけを見積日の新しい順に（合計は別途を除く）
    expect(quotationSheet?.rows).toEqual([
      QUOTATION_HEADER,
      [FIXTURE.kou.vendor, FIXTURE.kou.date, FIXTURE.kou.project, 35000, '採用', '未確認', 'あり'],
      [
        FIXTURE.otsu.vendor,
        FIXTURE.otsu.date,
        FIXTURE.otsu.project,
        56000,
        '採用',
        '確認済み',
        'なし',
      ],
    ]);

    // 明細行のシート：6.2 の列で、見積の並びのまま、見積の中は表示順
    expect(lineSheet?.rows).toEqual([LINE_HEADER, ...KOU_LINES, ...OTSU_LINES]);

    // 要確認のシート：参考の印のある明細行だけ（絞り込みで外れた丙の行は出ない）
    expect(reviewSheet?.rows).toEqual([LINE_HEADER, KOU_LINES[1]]);

    // 出力の記録（6.3）：実行者・種別・件数・日時。対象は絞り込みの結果の見積
    const adminId = await adminUserId();
    const logs = await getPrismaClient().auditLog.findMany({
      where: {
        action: 'DATA_EXPORTED',
        targetId: 'unit_price_ledger_xlsx',
        metadata: { path: ['targetIds'], array_contains: [fixtures.kouId] },
      },
      select: { actorId: true, targetType: true, metadata: true, createdAt: true },
    });
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log?.actorId).toBe(adminId);
    expect(log?.targetType).toBe('DataExport');
    expect(log?.createdAt).toBeInstanceOf(Date);
    const metadata = log?.metadata;
    expect(isExportAuditMetadata(metadata)).toBe(true);
    if (!isExportAuditMetadata(metadata)) {
      throw new Error('出力の記録の metadata が想定の形ではありません');
    }
    expect(metadata.kind).toBe('unit_price_ledger_xlsx');
    expect(metadata.projectId).toBeNull();
    expect(metadata.itemCount).toBe(2);
    expect(metadata.targetIds).toEqual([fixtures.kouId, fixtures.otsuId]);
  });

  /**
   * @requirement unit-price-ledger/REQ-6.4
   */
  test('出力の記録に失敗すると、ファイルを保存せずに中止の文言が出る (unit-price-ledger/REQ-6.4)', async ({
    page,
  }) => {
    await searchLedger(page, { keyword: KEYWORD });
    await expect(resultCount(page)).toHaveText('3 件');

    // 書き出しの要求を横取りし、サーバーの記録の失敗（ApiError の Problem Details）を返させる
    let interceptedCount = 0;
    await page.route(`**${EXPORT_PATH}`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      interceptedCount += 1;
      await route.fulfill({
        status: 500,
        // サーバーの errorHandler は res.json で返すため、Content-Type は application/json
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          type: 'https://api.architrack.com/errors/internal-server-error',
          title: 'EXPORT_RECORD_FAILED',
          status: 500,
          detail: RECORD_FAILED_MESSAGE,
          instance: EXPORT_PATH,
          code: 'EXPORT_RECORD_FAILED',
          message: RECORD_FAILED_MESSAGE,
        }),
      });
    });

    const downloads: string[] = [];
    page.on('download', (download) => {
      downloads.push(download.suggestedFilename());
    });

    await exportButton(page).click();

    await expect(page.getByRole('alert')).toHaveText(RECORD_FAILED_MESSAGE, {
      timeout: getTimeout(30000),
    });
    // 書き出しが終わって操作が戻ってから、ダウンロードが起きていないことを確かめる
    await expect(exportButton(page)).toBeEnabled({ timeout: getTimeout(30000) });
    expect(interceptedCount).toBe(1);
    expect(downloads).toEqual([]);

    // 記録の失敗を起こした要求はサーバーへ届いていないので、丙を含む出力の記録も無い
    const logs = await getPrismaClient().auditLog.findMany({
      where: {
        action: 'DATA_EXPORTED',
        targetId: 'unit_price_ledger_xlsx',
        metadata: { path: ['targetIds'], array_contains: [fixtures.heiId] },
      },
      select: { id: true },
    });
    expect(logs).toHaveLength(0);
  });

  /**
   * @requirement unit-price-ledger/REQ-6.5
   */
  test('絞り込みの結果が 0 件のときは、書き出しの操作ができない (unit-price-ledger/REQ-6.5)', async ({
    page,
  }) => {
    // 結果のある絞り込みでは書き出せる
    await searchLedger(page, { keyword: KEYWORD });
    await expect(resultCount(page)).toHaveText('3 件');
    await expect(exportButton(page)).toBeEnabled();

    // 0 件の絞り込みでは書き出せない
    await searchLedger(page, { keyword: `${KEYWORD}_該当なし` });
    await expect(resultCount(page)).toHaveText('0 件');
    await expect(page.getByText('条件に合う見積はありません')).toBeVisible();
    await expect(exportButton(page)).toBeDisabled();
  });
});
