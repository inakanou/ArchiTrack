/**
 * @fileoverview 単価台帳の見積の修正・印の編集・削除の E2E（unit-price-ledger タスク5.2）
 *
 * システム管理者が台帳の見積の詳細の画面で、次のことを確かめる。
 * - 案件の無い受領見積書：見積の情報と明細行を直し（行の追加・削除・並べ替え・分類キー）、
 *   読取の確認を確認済みにすると確認者と日時が記録され、確認の後に論理削除できる
 * - 案件の受領見積書：読取の確認・参考の印と理由・分類キーだけを直せ、ほかの欄は受領見積書の画面への導線が出る
 * - 開いた後にほかの利用者が見積を更新していたときは、保存せずに排他の不一致の文言が出る
 * - 論理削除された案件の受領見積書は、一覧と詳細で削除済みの案件と出て、除く絞り込みで出なくなる
 *
 * 材料はテストごとに DB へ作る（業者名・案件名に `E2E修正検証` と一意の接尾辞を付ける）。
 * 始める前と終わった後に、その文字の受領見積書（明細行は連鎖して消える）と案件を消す。
 * 5.1 の取り込みの E2E（`E2E取込検証`）とは別の文字を使い、並列で件数が崩れないようにする。
 *
 * ほかの利用者の更新は、画面を開いた後に DB の見積を直接更新して作る（`updatedAt` が進む）。
 *
 * Requirements coverage (unit-price-ledger):
 * - 4.8: 論理削除された案件の受領見積書を一覧と詳細に出し、案件名の隣に「削除済みの案件」と出す
 * - 4.9: 「削除済みの案件を除く」で絞り込むと、論理削除された案件の受領見積書を出さない
 * - 4.6: 見積の情報・カードの ID・原本のパスと、すべての明細行（区分・条件・換算・参考の印と理由・分類キー・
 *   数量表の行のキー）を出す
 * - 5.1: 案件の無い受領見積書の業者名・案件名・原本のパスと、明細行の追加・削除・並べ替え・各欄を直せる
 * - 5.2: 案件の受領見積書は、読取の確認・参考の印と理由・分類キーだけを直せ、ほかの欄は受領見積書の画面への導線を出す
 * - 5.3: 分類キーは 50 文字まで、体系に無い値でもそのまま保存する
 * - 5.4: 読取の確認を確認済みにすると、確認した利用者と日時を記録する
 * - 5.5: 案件の無い受領見積書は、確認の後に論理削除する
 * - 5.6: 開いた後にほかの利用者が更新していたら、保存せずに
 *   「ほかの利用者が更新しました。最新の内容を読み込み直してください」と出す
 */

import { randomBytes } from 'crypto';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { TEST_USERS } from '../../helpers/test-users';
import { getPrismaClient } from '../../fixtures/database';

/** 材料に共通の文字（業者名・案件名に入れる） */
const KEYWORD = 'E2E修正検証';

const CONFLICT_MESSAGE = 'ほかの利用者が更新しました。最新の内容を読み込み直してください';

/** 体系に登録の無い 50 文字の分類キー（5.3） */
const CLASSIFICATION_KEY_50 = `E2E-未登録の分類キー-${'X'.repeat(37)}`;

/** 日時の表示（ja-JP の年月日と時分） */
const DATE_TIME_PATTERN = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/;

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

// ============================================================================
// 材料
// ============================================================================

interface CreatedQuotation {
  id: string;
  vendorName: string;
  cardId: string | null;
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

/** 案件の無い受領見積書（取り込んだカードと同じ形）を作る */
async function createLedgerQuotation(): Promise<CreatedQuotation> {
  const suffix = uniqueSuffix();
  const vendorName = `${KEYWORD}_内装_${suffix}`;
  const cardId = `E2E-LEDGER-EDIT-${suffix}`;
  const created = await getPrismaClient().receivedQuotation.create({
    data: {
      vendorName,
      name: `${vendorName}_2026-06-01`,
      submittedAt: new Date('2026-06-01T00:00:00.000Z'),
      ledgerCardId: cardId,
      ledgerSourcePath: 'E2E/修正検証/内装_見積.pdf',
      ledgerProjectName: `${KEYWORD}_西庁舎改修`,
      quoteNumber: 'Q-0601',
      adoption: 'ADOPTED',
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: 'ボード張り',
            specification: '12.5mm',
            quantity: 10,
            unit: 'm2',
            unitPrice: 2000,
            amount: 20000,
            condition: '夜間作業',
            conversionQuantity: 20,
            conversionUnit: '枚',
            conversionUnitPrice: 1000,
            conversionBasis: '1 枚 0.5m2',
            quantityRowKey: 'QT-E2E-001',
          },
          {
            sortOrder: 1,
            category: 'DIRECT',
            name: '軽鉄下地',
            quantity: 10,
            unit: 'm2',
            unitPrice: 1500,
            amount: 15000,
            isReference: true,
            referenceReason: '概算のみ',
          },
          {
            sortOrder: 2,
            category: 'OVERHEAD',
            name: '現場管理費',
            quantity: 1,
            unit: '式',
            unitPrice: 5000,
            amount: 5000,
          },
        ],
      },
    },
    select: { id: true },
  });
  return { id: created.id, vendorName, cardId };
}

/** 案件と、その案件の受領見積書（見積依頼の無いもの）を作る */
async function createProjectQuotation(): Promise<CreatedQuotation & { projectId: string }> {
  const prisma = getPrismaClient();
  const suffix = uniqueSuffix();
  const userId = await adminUserId();
  const project = await prisma.project.create({
    data: {
      name: `${KEYWORD}_案件_${suffix}`,
      salesPersonId: userId,
      createdById: userId,
    },
    select: { id: true },
  });
  const vendorName = `${KEYWORD}_設備_${suffix}`;
  const created = await prisma.receivedQuotation.create({
    data: {
      projectId: project.id,
      vendorName,
      name: `${vendorName}_2026-05-15`,
      submittedAt: new Date('2026-05-15T00:00:00.000Z'),
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: '照明器具交換',
            quantity: 4,
            unit: '台',
            unitPrice: 12000,
            amount: 48000,
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
  return { id: created.id, vendorName, cardId: null, projectId: project.id };
}

/** 材料の受領見積書（明細行は連鎖して消える）と案件を消す */
async function cleanupFixtures(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.receivedQuotation.deleteMany({
    where: { vendorName: { startsWith: KEYWORD } },
  });
  await prisma.project.deleteMany({ where: { name: { startsWith: KEYWORD } } });
}

// ============================================================================
// 画面の操作
// ============================================================================

/** 見積の詳細の画面を開き、見積を読み終えるまで待つ */
async function openDetail(page: Page, quotationId: string): Promise<void> {
  const detailResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/unit-price-ledger/quotations/${quotationId}` &&
      response.request().method() === 'GET',
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/unit-price-ledger/quotations/${quotationId}`);
  expect((await detailResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '見積の詳細' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(page.getByRole('table', { name: '明細行' })).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 見積の情報の欄の値（dt の次の dd） */
function infoValue(page: Page, term: string): Locator {
  return page
    .getByRole('region', { name: '見積の情報' })
    .locator('dt', { hasText: new RegExp(`^${term}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/** 詳細の明細行の表の本文の行 */
function detailLineRows(page: Page): Locator {
  return page.getByRole('table', { name: '明細行' }).getByRole('rowgroup').nth(1).getByRole('row');
}

/** 詳細の明細行の表の行の、見出しの名前の欄の文字を確かめる */
async function expectLineCells(
  page: Page,
  expected: ReadonlyArray<Readonly<Record<string, string>>>
): Promise<void> {
  const table = page.getByRole('table', { name: '明細行' });
  const rows = detailLineRows(page);
  await expect(rows).toHaveCount(expected.length, { timeout: getTimeout(15000) });
  const headers = await table.getByRole('columnheader').allTextContents();
  for (const [index, cells] of expected.entries()) {
    const rowCells = rows.nth(index).getByRole('cell');
    for (const [column, text] of Object.entries(cells)) {
      const columnIndex = headers.indexOf(column);
      expect(columnIndex, `明細行の表に「${column}」の列がある`).toBeGreaterThanOrEqual(0);
      await expect(rowCells.nth(columnIndex)).toHaveText(text);
    }
  }
}

/** 保存の要求（PUT または PATCH）の応答を待つ */
function waitForSave(page: Page, quotationId: string, method: 'PUT' | 'PATCH') {
  const path =
    method === 'PUT'
      ? `/api/unit-price-ledger/quotations/${quotationId}`
      : `/api/unit-price-ledger/quotations/${quotationId}/marks`;
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === method,
    { timeout: getTimeout(30000) }
  );
}

// ============================================================================
// テスト
// ============================================================================

test.describe('単価台帳の見積の修正・印の編集・削除', () => {
  test.beforeAll(async () => {
    await cleanupFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAsUser(page, 'ADMIN_USER');
  });

  /**
   * @requirement unit-price-ledger/REQ-4.6
   */
  test('一覧の見積を選ぶと、見積の情報・カードの ID・原本のパスと、すべての明細行の欄が出る (unit-price-ledger/REQ-4.6)', async ({
    page,
  }) => {
    const quotation = await createLedgerQuotation();

    await page.goto('/unit-price-ledger');
    const form = page.getByRole('search', { name: '台帳の絞り込み' });
    await expect(page.getByRole('status', { name: '絞り込みの結果' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await form.getByLabel('キーワード').fill(quotation.vendorName);
    const listResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/unit-price-ledger/quotations?') &&
        new URL(response.url()).searchParams.get('keyword') === quotation.vendorName &&
        response.request().method() === 'GET',
      { timeout: getTimeout(30000) }
    );
    await form.getByRole('button', { name: '検索' }).click();
    expect((await listResponse).status()).toBe(200);
    await expect(page.getByRole('status', { name: '絞り込みの結果' })).toHaveText('1 件');

    await page
      .getByRole('table', { name: '台帳の見積の一覧' })
      .getByRole('link', { name: quotation.vendorName })
      .click();
    await expect(page).toHaveURL(new RegExp(`/unit-price-ledger/quotations/${quotation.id}$`));
    await expect(page.getByRole('table', { name: '明細行' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await expect(infoValue(page, '業者名')).toHaveText(quotation.vendorName);
    await expect(infoValue(page, '見積日')).toHaveText('2026-06-01');
    await expect(infoValue(page, '案件名')).toHaveText(`${KEYWORD}_西庁舎改修`);
    await expect(infoValue(page, '見積番号')).toHaveText('Q-0601');
    await expect(infoValue(page, '採否')).toHaveText('採用');
    await expect(infoValue(page, '読取の確認')).toHaveText('未確認');
    await expect(infoValue(page, '合計（別途を除く）')).toHaveText('40,000円');
    await expect(infoValue(page, 'カードの ID')).toHaveText(quotation.cardId ?? '');
    await expect(infoValue(page, '原本のパス')).toHaveText('E2E/修正検証/内装_見積.pdf');

    await expectLineCells(page, [
      {
        区分: '直接工事',
        名称: 'ボード張り',
        規格: '12.5mm',
        数量: '10',
        単位: 'm2',
        単価: '2,000円',
        金額: '20,000円',
        条件: '夜間作業',
        換算: '20 枚 × 1,000円（1 枚 0.5m2）',
        参考の印: 'なし',
        参考の理由: '-',
        分類キー: '-',
        数量表の行のキー: 'QT-E2E-001',
      },
      {
        区分: '直接工事',
        名称: '軽鉄下地',
        条件: '-',
        換算: '-',
        参考の印: 'あり',
        参考の理由: '概算のみ',
        分類キー: '-',
        数量表の行のキー: '-',
      },
      { 区分: '諸経費', 名称: '現場管理費', 金額: '5,000円', 参考の印: 'なし' },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-5.1
   * @requirement unit-price-ledger/REQ-5.3
   * @requirement unit-price-ledger/REQ-5.4
   */
  test('案件の無い見積は、見積の情報と明細行（追加・削除・並べ替え・分類キー）を直し、読取の確認を確認済みにして保存できる (unit-price-ledger/REQ-5.1, REQ-5.3, REQ-5.4)', async ({
    page,
  }) => {
    const quotation = await createLedgerQuotation();
    const startedAt = new Date();
    await openDetail(page, quotation.id);

    // 案件の無い見積は、修正と削除の操作があり、印の編集や受領見積書の画面への導線は無い
    await expect(page.getByRole('button', { name: '削除', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '印の編集' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '受領見積書の画面で修正する' })).toHaveCount(0);

    await page.getByRole('button', { name: '修正', exact: true }).click();
    const editForm = page.getByRole('form', { name: '見積の修正' });
    await expect(editForm).toBeVisible();

    // 見積の情報（5.1）
    const newVendorName = `${quotation.vendorName}_直し`;
    await editForm.getByLabel('業者名').fill(newVendorName);
    await editForm.getByLabel('案件名').fill(`${KEYWORD}_西庁舎改修_直し`);
    await editForm.getByLabel('原本のパス').fill('E2E/修正検証/内装_見積_直し.pdf');
    await editForm.getByLabel('見積日').fill('2026-06-02');

    // 台帳の情報（見積番号）を直し、読取の確認を確認済みにする（5.1・5.4）
    await editForm.getByRole('button', { name: '台帳の情報' }).click();
    await editForm.getByLabel('見積番号').fill('Q-0601-R');
    await editForm.getByLabel('読取の確認').selectOption('CONFIRMED');
    await expect(editForm.getByText('保存すると確認者と日時を記録します')).toBeVisible();

    // 明細行の各欄を直す（5.1）
    await expect(editForm.getByLabel('行1 名称')).toHaveValue('ボード張り');
    await editForm.getByLabel('行1 名称').fill('石膏ボード張り');
    await editForm.getByLabel('行1 規格').fill('12.5mm 二重張り');

    // 体系に無い 50 文字の分類キー。51 文字目は入らない（5.3）
    await editForm.getByLabel('行2 分類キー').fill(`${CLASSIFICATION_KEY_50}Y`);
    await expect(editForm.getByLabel('行2 分類キー')).toHaveValue(CLASSIFICATION_KEY_50);

    // 行 3（現場管理費）を削除する
    await editForm.getByRole('button', { name: '行3の操作メニュー' }).click();
    await page.getByRole('menuitem', { name: '削除' }).click();
    await expect(editForm.getByLabel('行3 名称')).toHaveCount(0);

    // 行を追加し、名称・数量・単位・単価を入れる
    await editForm.getByRole('button', { name: '行を追加' }).click();
    await editForm.getByLabel('行3 名称').fill('開口補強');
    await editForm.getByLabel('行3 数量').fill('2');
    await editForm.getByLabel('行3 単位').fill('箇所');
    await editForm.getByLabel('行3 単価').fill('3000');

    // 追加した行を一番上へ並べ替える
    await editForm.getByRole('button', { name: '行3の操作メニュー' }).click();
    await page.getByRole('menuitem', { name: '上に移動' }).click();
    await editForm.getByRole('button', { name: '行2の操作メニュー' }).click();
    await page.getByRole('menuitem', { name: '上に移動' }).click();
    await expect(editForm.getByLabel('行1 名称')).toHaveValue('開口補強');
    await expect(editForm.getByLabel('行2 名称')).toHaveValue('石膏ボード張り');
    await expect(editForm.getByLabel('行3 名称')).toHaveValue('軽鉄下地');

    const saveResponse = waitForSave(page, quotation.id, 'PUT');
    await editForm.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saveResponse).status()).toBe(200);

    await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();
    await expect(editForm).toHaveCount(0);

    await expect(infoValue(page, '業者名')).toHaveText(newVendorName);
    await expect(infoValue(page, '案件名')).toHaveText(`${KEYWORD}_西庁舎改修_直し`);
    await expect(infoValue(page, '原本のパス')).toHaveText('E2E/修正検証/内装_見積_直し.pdf');
    await expect(infoValue(page, '見積日')).toHaveText('2026-06-02');
    await expect(infoValue(page, '見積番号')).toHaveText('Q-0601-R');
    await expect(infoValue(page, '読取の確認')).toHaveText('確認済み');
    await expect(infoValue(page, '確認者')).toHaveText(TEST_USERS.ADMIN_USER.displayName);
    await expect(infoValue(page, '確認日時')).toHaveText(DATE_TIME_PATTERN);
    await expect(infoValue(page, '合計（別途を除く）')).toHaveText('41,000円');

    await expectLineCells(page, [
      { 名称: '開口補強', 数量: '2', 単位: '箇所', 単価: '3,000円', 金額: '6,000円' },
      {
        名称: '石膏ボード張り',
        規格: '12.5mm 二重張り',
        条件: '夜間作業',
        換算: '20 枚 × 1,000円（1 枚 0.5m2）',
        数量表の行のキー: 'QT-E2E-001',
      },
      {
        名称: '軽鉄下地',
        参考の印: 'あり',
        参考の理由: '概算のみ',
        分類キー: CLASSIFICATION_KEY_50,
      },
    ]);

    // 記録された確認者と日時（5.4）と、そのまま保存された分類キー（5.3）
    const saved = await getPrismaClient().receivedQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      select: {
        readingStatus: true,
        readingConfirmedById: true,
        readingConfirmedAt: true,
        lineItems: {
          select: { name: true, classificationKey: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    expect(saved.readingStatus).toBe('CONFIRMED');
    expect(saved.readingConfirmedById).toBe(await adminUserId());
    expect(saved.readingConfirmedAt).not.toBeNull();
    expect(saved.readingConfirmedAt!.getTime()).toBeGreaterThanOrEqual(startedAt.getTime() - 1000);
    expect(saved.lineItems).toEqual([
      { name: '開口補強', classificationKey: null },
      { name: '石膏ボード張り', classificationKey: null },
      { name: '軽鉄下地', classificationKey: CLASSIFICATION_KEY_50 },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-5.5
   */
  test('案件の無い見積は、確認の後に論理削除され、一覧から消える (unit-price-ledger/REQ-5.5)', async ({
    page,
  }) => {
    const quotation = await createLedgerQuotation();
    await openDetail(page, quotation.id);

    // 確認で取り消すと消えない
    await page.getByRole('button', { name: '削除', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '見積の削除' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`「${quotation.vendorName}_2026-06-01」を削除しますか？`);
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(infoValue(page, '業者名')).toHaveText(quotation.vendorName);
    const afterCancel = await getPrismaClient().receivedQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      select: { deletedAt: true },
    });
    expect(afterCancel.deletedAt).toBeNull();

    // 確認して削除すると一覧へ戻る
    await page.getByRole('button', { name: '削除', exact: true }).click();
    const deleteResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/unit-price-ledger/quotations/${quotation.id}` &&
        response.request().method() === 'DELETE',
      { timeout: getTimeout(30000) }
    );
    await page
      .getByRole('dialog', { name: '見積の削除' })
      .getByRole('button', { name: '削除する' })
      .click();
    expect((await deleteResponse).status()).toBe(204);
    await expect(page).toHaveURL(/\/unit-price-ledger$/, { timeout: getTimeout(15000) });

    // 行は残り、削除の日時が入る（論理削除）
    const deleted = await getPrismaClient().receivedQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      select: { deletedAt: true },
    });
    expect(deleted.deletedAt).not.toBeNull();

    // 一覧には出ない
    const form = page.getByRole('search', { name: '台帳の絞り込み' });
    await expect(page.getByRole('status', { name: '絞り込みの結果' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await form.getByLabel('キーワード').fill(quotation.vendorName);
    const listResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/unit-price-ledger/quotations?') &&
        new URL(response.url()).searchParams.get('keyword') === quotation.vendorName &&
        response.request().method() === 'GET',
      { timeout: getTimeout(30000) }
    );
    await form.getByRole('button', { name: '検索' }).click();
    expect((await listResponse).status()).toBe(200);
    await expect(page.getByRole('status', { name: '絞り込みの結果' })).toHaveText('0 件');
    await expect(page.getByText('条件に合う見積はありません')).toBeVisible();
  });

  /**
   * @requirement unit-price-ledger/REQ-5.2
   * @requirement unit-price-ledger/REQ-5.3
   * @requirement unit-price-ledger/REQ-5.4
   */
  test('案件の受領見積書は、読取の確認・参考の印と理由・分類キーだけを直せ、ほかの欄は受領見積書の画面への導線が出る (unit-price-ledger/REQ-5.2, REQ-5.3, REQ-5.4)', async ({
    page,
  }) => {
    const quotation = await createProjectQuotation();
    await openDetail(page, quotation.id);

    // 修正・削除は無く、印の編集と受領見積書の画面への導線が出る（5.2）
    await expect(page.getByRole('button', { name: '修正', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '受領見積書の画面で修正する' })).toHaveAttribute(
      'href',
      `/projects/${quotation.projectId}/quotations`
    );

    await page.getByRole('button', { name: '印の編集' }).click();
    const marksForm = page.getByRole('form', { name: '印の編集' });
    await expect(marksForm).toBeVisible();

    // 直せる欄は読取の確認と、明細行ごとの参考の印・参考の理由・分類キーだけ
    await expect(marksForm.getByRole('textbox')).toHaveCount(4);
    await expect(marksForm.getByRole('combobox')).toHaveCount(1);
    await expect(marksForm.getByRole('checkbox')).toHaveCount(2);
    await expect(marksForm.getByLabel('業者名')).toHaveCount(0);
    await expect(marksForm.getByLabel('行1 名称')).toHaveCount(0);
    await expect(marksForm.getByLabel('行1 単価')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '行を追加' })).toHaveCount(0);

    await marksForm.getByLabel('読取の確認').selectOption('CONFIRMED');
    await marksForm.getByRole('checkbox', { name: '行1 参考', exact: true }).check();
    await marksForm.getByLabel('行1 参考の理由').fill('仮の数量');
    await marksForm.getByLabel('行2 分類キー').fill(`${CLASSIFICATION_KEY_50}Y`);
    await expect(marksForm.getByLabel('行2 分類キー')).toHaveValue(CLASSIFICATION_KEY_50);

    const saveResponse = waitForSave(page, quotation.id, 'PATCH');
    await marksForm.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saveResponse).status()).toBe(200);

    await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();
    await expect(marksForm).toHaveCount(0);
    await expect(infoValue(page, '業者名')).toHaveText(quotation.vendorName);
    await expect(infoValue(page, '読取の確認')).toHaveText('確認済み');
    await expect(infoValue(page, '確認者')).toHaveText(TEST_USERS.ADMIN_USER.displayName);
    await expect(infoValue(page, '確認日時')).toHaveText(DATE_TIME_PATTERN);

    await expectLineCells(page, [
      {
        区分: '直接工事',
        名称: '照明器具交換',
        単価: '12,000円',
        参考の印: 'あり',
        参考の理由: '仮の数量',
        分類キー: '-',
      },
      {
        区分: '産廃',
        名称: '撤去品処分',
        参考の印: 'なし',
        参考の理由: '-',
        分類キー: CLASSIFICATION_KEY_50,
      },
    ]);

    const saved = await getPrismaClient().receivedQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      select: {
        vendorName: true,
        readingStatus: true,
        readingConfirmedById: true,
        readingConfirmedAt: true,
        lineItems: {
          select: { name: true, isReference: true, referenceReason: true, classificationKey: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    expect(saved.vendorName).toBe(quotation.vendorName);
    expect(saved.readingStatus).toBe('CONFIRMED');
    expect(saved.readingConfirmedById).toBe(await adminUserId());
    expect(saved.readingConfirmedAt).not.toBeNull();
    expect(saved.lineItems).toEqual([
      {
        name: '照明器具交換',
        isReference: true,
        referenceReason: '仮の数量',
        classificationKey: null,
      },
      {
        name: '撤去品処分',
        isReference: false,
        referenceReason: null,
        classificationKey: CLASSIFICATION_KEY_50,
      },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-5.6
   */
  test('案件の無い見積を開いた後にほかの利用者が更新していると、保存せずに排他の不一致の文言が出る (unit-price-ledger/REQ-5.6)', async ({
    page,
  }) => {
    const quotation = await createLedgerQuotation();
    await openDetail(page, quotation.id);

    await page.getByRole('button', { name: '修正', exact: true }).click();
    const editForm = page.getByRole('form', { name: '見積の修正' });
    await editForm.getByLabel('行1 名称').fill('自分の直し');

    // ほかの利用者の更新
    await getPrismaClient().receivedQuotation.update({
      where: { id: quotation.id },
      data: { ledgerSourcePath: 'E2E/修正検証/ほかの利用者の直し.pdf' },
    });

    const saveResponse = waitForSave(page, quotation.id, 'PUT');
    await editForm.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saveResponse).status()).toBe(409);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(CONFLICT_MESSAGE);
    await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toHaveCount(0);

    // 保存されていない
    const afterConflict = await getPrismaClient().receivedQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      select: { lineItems: { select: { name: true }, orderBy: { sortOrder: 'asc' } } },
    });
    expect(afterConflict.lineItems.map((item) => item.name)).toEqual([
      'ボード張り',
      '軽鉄下地',
      '現場管理費',
    ]);

    // 読み込み直すと、ほかの利用者の更新が出て、自分の入力は捨てられる
    await alert.getByRole('button', { name: '最新の内容を読み込み直す' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(infoValue(page, '原本のパス')).toHaveText('E2E/修正検証/ほかの利用者の直し.pdf');
    await expectLineCells(page, [
      { 名称: 'ボード張り' },
      { 名称: '軽鉄下地' },
      { 名称: '現場管理費' },
    ]);
  });

  /**
   * @requirement unit-price-ledger/REQ-5.6
   */
  test('案件の受領見積書の印の編集を開いた後にほかの利用者が更新していると、保存せずに排他の不一致の文言が出る (unit-price-ledger/REQ-5.6)', async ({
    page,
  }) => {
    const quotation = await createProjectQuotation();
    await openDetail(page, quotation.id);

    await page.getByRole('button', { name: '印の編集' }).click();
    const marksForm = page.getByRole('form', { name: '印の編集' });
    await marksForm.getByLabel('行1 分類キー').fill('E2E-自分の分類キー');

    // ほかの利用者の更新
    await getPrismaClient().receivedQuotation.update({
      where: { id: quotation.id },
      data: { quoteNumber: 'Q-OTHER-USER' },
    });

    const saveResponse = waitForSave(page, quotation.id, 'PATCH');
    await marksForm.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saveResponse).status()).toBe(409);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(CONFLICT_MESSAGE);
    await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toHaveCount(0);

    const afterConflict = await getPrismaClient().receivedQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      select: {
        lineItems: { select: { classificationKey: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    expect(afterConflict.lineItems.map((item) => item.classificationKey)).toEqual([null, null]);

    await alert.getByRole('button', { name: '最新の内容を読み込み直す' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(infoValue(page, '見積番号')).toHaveText('Q-OTHER-USER');
    await expectLineCells(page, [{ 分類キー: '-' }, { 分類キー: '-' }]);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.8
   * @requirement unit-price-ledger/REQ-4.9
   */
  test('論理削除された案件の見積は一覧と詳細で「削除済みの案件」と出て、「削除済みの案件を除く」で絞り込むと出ない (unit-price-ledger/REQ-4.8, REQ-4.9)', async ({
    page,
  }) => {
    const quotation = await createProjectQuotation();
    await getPrismaClient().project.update({
      where: { id: quotation.projectId },
      data: { deletedAt: new Date() },
    });

    await page.goto('/unit-price-ledger');
    const form = page.getByRole('search', { name: '台帳の絞り込み' });
    const resultCount = page.getByRole('status', { name: '絞り込みの結果' });
    await expect(resultCount).toBeVisible({ timeout: getTimeout(15000) });

    const search = async (exclude: boolean) => {
      await form.getByLabel('キーワード').fill(quotation.vendorName);
      await form.getByLabel('削除済みの案件を除く').setChecked(exclude);
      const listResponse = page.waitForResponse(
        (response) => {
          if (
            !response.url().includes('/api/unit-price-ledger/quotations?') ||
            response.request().method() !== 'GET'
          ) {
            return false;
          }
          const params = new URL(response.url()).searchParams;
          return (
            params.get('keyword') === quotation.vendorName &&
            params.get('excludeDeletedProjects') === (exclude ? 'true' : null)
          );
        },
        { timeout: getTimeout(30000) }
      );
      await form.getByRole('button', { name: '検索' }).click();
      expect((await listResponse).status()).toBe(200);
    };

    // 除かないときは出て、案件名の隣に「削除済みの案件」と出る（4.8）
    await search(false);
    await expect(resultCount).toHaveText('1 件');
    const row = page
      .getByRole('table', { name: '台帳の見積の一覧' })
      .getByRole('row')
      .filter({ hasText: quotation.vendorName });
    await expect(row.getByRole('cell').nth(2)).toHaveText(/^E2E修正検証_案件_.+削除済みの案件$/);

    // 「削除済みの案件を除く」で絞り込むと出ない（4.9）
    await search(true);
    await expect(page).toHaveURL(/excludeDeletedProjects=true/);
    await expect(resultCount).toHaveText('0 件');
    await expect(page.getByText('条件に合う見積はありません')).toBeVisible();

    // 詳細の案件名にも「削除済みの案件」と出る（4.8）
    await openDetail(page, quotation.id);
    await expect(infoValue(page, '案件名')).toHaveText(/^E2E修正検証_案件_.+（削除済みの案件）$/);
  });
});
