/**
 * @fileoverview 単価台帳の見積カードの取り込みと「要確認」の絞り込みの E2E（unit-price-ledger タスク5.1）
 *
 * システム管理者が台帳の画面から、見積カードの zip と JSON を取り込み、結果の件数を確かめる。
 * もう一度取り込んで、既に取り込んだカードが飛ばされることを確かめ、一覧を「要確認」
 * 「分類キーの無い行がある」で絞り込む。
 *
 * 材料（e2e/fixtures/unit-price-ledger/）:
 * - `cards.zip`（`generate-ledger-cards-zip.mjs` が `zip-cards/` から作る）
 *   - `card-reference.json`：参考の理由（概算のみ・手書きの見積）のあるカード。行はどちらも直接工事
 *   - `card-missing-key.json`：参考の理由の無いカード。直接工事の行（分類キーは空）と諸経費の行
 * - `card-transport.json`：交通費と別途の行だけのカード（分類キーの無い行の対象にならない）
 * - `card-missing-required.json`：必須の項目（業者・行 1 の金額）の欠けたカード
 *
 * カードの ID は固定で、始める前にその ID の受領見積書を消す（同じ実行の中で繰り返しても通る）。
 * 業者名・案件名に共通の文字（`E2E取込検証`）を入れ、一覧はその文字で絞り込んでほかの見積と分ける。
 *
 * Requirements coverage (unit-price-ledger):
 * - 1.1: 案件の無い受領見積書（取り込んだカード）を台帳の見積として一覧に出す
 * - 2.1: zip と複数の JSON を選んで取り込み、1 枚のカードを 1 件の見積として登録する
 * - 2.3: 必須の項目の欠けたカードだけを登録せず、ファイル名と理由を出し、残りの取り込みを続ける
 * - 2.14: 既に取り込んだカードの ID は登録せずに飛ばし、既にある見積を変えない
 * - 2.15: 登録・飛ばし（カードの ID）・登録できなかった件数と理由・参考の印を付けた件数を出す
 * - 3.1: 参考の理由のあるカードのすべての明細行に参考の印と「、」でつないだ理由を付ける
 * - 4.1: 業者名・見積日・案件名・合計（別途を除く）・採否・読取の確認・参考の行を見積日の新しい順に出す
 * - 4.2: キーワード（業者名・案件名・明細行の名称）で絞り込む
 * - 4.3: 「要確認」で参考の印のある見積だけを出す
 * - 4.4: 「分類キーの無い行がある」で直接工事・産廃の分類キーの空の行のある見積だけを出す
 * - 4.5: 絞り込みの結果の総件数とページを出す
 * - 4.7: 0 件のとき「条件に合う見積はありません」と出す
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient } from '../../fixtures/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/unit-price-ledger');

const ZIP_FILE = path.join(FIXTURE_DIR, 'cards.zip');
const TRANSPORT_FILE = path.join(FIXTURE_DIR, 'card-transport.json');
const MISSING_REQUIRED_FILE = path.join(FIXTURE_DIR, 'card-missing-required.json');

/** 材料のカード（e2e/fixtures/unit-price-ledger/ の内容と同じ値） */
const CARDS = {
  reference: {
    id: 'E2E-LEDGER-IMPORT-REFERENCE',
    vendor: 'E2E取込検証_参考あり塗装',
    date: '2026-09-10',
    project: 'E2E取込検証_北小学校改修',
    total: '530,000円',
    adoption: '採用',
    reading: '未確認',
    hasReference: 'あり',
  },
  missingKey: {
    id: 'E2E-LEDGER-IMPORT-MISSING-KEY',
    vendor: 'E2E取込検証_内装',
    date: '2026-08-20',
    project: 'E2E取込検証_南庁舎改修',
    total: '110,000円',
    adoption: '採用',
    reading: '確認済み',
    hasReference: 'なし',
  },
  transport: {
    id: 'E2E-LEDGER-IMPORT-TRANSPORT',
    vendor: 'E2E取込検証_運送',
    date: '2026-07-05',
    project: 'E2E取込検証_東倉庫新営',
    total: '20,000円',
    adoption: '不採用',
    reading: '確認済み',
    hasReference: 'なし',
  },
} as const;

type CardKey = keyof typeof CARDS;

/** 必須の項目の欠けたカードの ID（登録されないので、消す対象にも入れて残りを確かめる） */
const MISSING_REQUIRED_CARD_ID = 'E2E-LEDGER-IMPORT-MISSING-REQUIRED';

/** 必須の項目の欠けたカードの、取り込みの結果の行 */
const MISSING_REQUIRED_RESULT =
  'card-missing-required.json：必須の項目が欠けているか読めません：業者、行 1 の金額';

/** 参考の理由のあるカードの理由（「、」でつなぐ。3.1） */
const REFERENCE_REASON = '概算のみ、手書きの見積';

/** 材料のカードに共通の文字（業者名・案件名に入れてある） */
const KEYWORD = 'E2E取込検証';

const ALL_CARD_IDS = [...Object.values(CARDS).map((card) => card.id), MISSING_REQUIRED_CARD_ID];

// ============================================================================
// 画面の操作
// ============================================================================

/** 取り込みの画面を開き、材料のファイルを選んで取り込み、結果の区画を返す */
async function importFixtureCards(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '取り込み', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '見積カードの取り込み' })).toBeVisible();

  await dialog
    .getByLabel('取り込むファイル')
    .setInputFiles([ZIP_FILE, TRANSPORT_FILE, MISSING_REQUIRED_FILE]);
  await expect(dialog.getByText('3 個のファイルを選びました')).toBeVisible();

  const importResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/unit-price-ledger/imports') &&
      response.request().method() === 'POST',
    { timeout: getTimeout(120000) }
  );
  await dialog.getByRole('button', { name: '取り込む', exact: true }).click();
  expect((await importResponse).status()).toBe(200);

  const result = dialog.getByRole('region', { name: '取り込みの結果' });
  await expect(result).toBeVisible({ timeout: getTimeout(30000) });
  return result;
}

/** 取り込みの画面を閉じる */
async function closeImportDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await expect(dialog).toBeHidden();
}

/** 一覧をキーワードと印で絞り込む */
async function searchLedger(
  page: Page,
  options: { keyword: string; needsReview?: boolean; missingClassificationKey?: boolean }
): Promise<void> {
  const form = page.getByRole('search', { name: '台帳の絞り込み' });
  await form.getByLabel('キーワード').fill(options.keyword);
  await form.getByLabel('要確認').setChecked(options.needsReview ?? false);
  await form
    .getByLabel('分類キーの無い行がある')
    .setChecked(options.missingClassificationKey ?? false);

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/unit-price-ledger/quotations?') &&
      new URL(response.url()).searchParams.get('keyword') === options.keyword &&
      response.request().method() === 'GET',
    { timeout: getTimeout(30000) }
  );
  await form.getByRole('button', { name: '検索' }).click();
  expect((await listResponse).status()).toBe(200);
}

/** 一覧の表の本文の行 */
function ledgerRows(page: Page): Locator {
  return page
    .getByRole('table', { name: '台帳の見積の一覧' })
    .getByRole('rowgroup')
    .nth(1)
    .getByRole('row');
}

/** 一覧の表の行が、並びのとおりの見積であることを確かめる（4.1 の欄と並び） */
async function expectLedgerRows(page: Page, keys: ReadonlyArray<CardKey>): Promise<void> {
  const rows = ledgerRows(page);
  await expect(rows).toHaveCount(keys.length, { timeout: getTimeout(15000) });
  for (const [index, key] of keys.entries()) {
    const card = CARDS[key];
    await expect(rows.nth(index).getByRole('cell')).toHaveText([
      card.vendor,
      card.date,
      card.project,
      card.total,
      card.adoption,
      card.reading,
      card.hasReference,
    ]);
  }
}

/** 絞り込みの結果の総件数（4.5） */
function resultCount(page: Page): Locator {
  return page.getByRole('status', { name: '絞り込みの結果' });
}

// ============================================================================
// テスト
// ============================================================================

test.describe('単価台帳の見積カードの取り込みと要確認の絞り込み', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // 同じ実行の中で繰り返しても通るように、材料のカードの ID の受領見積書を消す（明細行は連鎖して消える）
    await getPrismaClient().receivedQuotation.deleteMany({
      where: { ledgerCardId: { in: ALL_CARD_IDS } },
    });
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
   * @requirement unit-price-ledger/REQ-1.1
   * @requirement unit-price-ledger/REQ-2.1
   * @requirement unit-price-ledger/REQ-2.3
   * @requirement unit-price-ledger/REQ-2.15
   * @requirement unit-price-ledger/REQ-4.1
   * @requirement unit-price-ledger/REQ-4.2
   * @requirement unit-price-ledger/REQ-4.5
   */
  test('カードの zip と JSON を取り込むと、件数と登録できなかった理由が出て、一覧に見積日の新しい順で出る (unit-price-ledger/REQ-1.1, REQ-2.1, REQ-2.3, REQ-2.15, REQ-4.1, REQ-4.2, REQ-4.5)', async ({
    page,
  }) => {
    const result = await importFixtureCards(page);

    await expect(result.getByText(/^登録した件数：/)).toHaveText('登録した件数：3 件');
    await expect(result.getByText(/^飛ばした件数：/)).toHaveText('飛ばした件数：0 件');
    await expect(result.getByText(/^登録できなかった件数：/)).toHaveText(
      '登録できなかった件数：1 件'
    );
    await expect(
      result.getByRole('list', { name: '登録できなかったファイルと理由' }).getByRole('listitem')
    ).toHaveText([MISSING_REQUIRED_RESULT]);
    await expect(result.getByText(/^参考の印を付けた件数：/)).toHaveText(
      '参考の印を付けた件数：1 件'
    );
    await expect(result.getByRole('list', { name: '飛ばしたカードの ID' })).toHaveCount(0);

    await closeImportDialog(page);

    await searchLedger(page, { keyword: KEYWORD });
    await expect(resultCount(page)).toHaveText('3 件');
    await expectLedgerRows(page, ['reference', 'missingKey', 'transport']);
    await expect(page.getByRole('navigation', { name: 'ページ' })).toContainText('1 / 1 ページ');

    // 必須の項目の欠けたカードは登録されていない（その案件名では 0 件）
    await searchLedger(page, { keyword: 'E2E取込検証_西公民館改修' });
    await expect(resultCount(page)).toHaveText('0 件');
  });

  /**
   * @requirement unit-price-ledger/REQ-2.14
   * @requirement unit-price-ledger/REQ-2.15
   */
  test('同じカードをもう一度取り込むと、登録せずに飛ばしたカードの ID を出し、一覧の見積は増えない (unit-price-ledger/REQ-2.14, REQ-2.15)', async ({
    page,
  }) => {
    const result = await importFixtureCards(page);

    await expect(result.getByText(/^登録した件数：/)).toHaveText('登録した件数：0 件');
    await expect(result.getByText(/^飛ばした件数：/)).toHaveText('飛ばした件数：3 件');
    const skippedIds = result
      .getByRole('list', { name: '飛ばしたカードの ID' })
      .getByRole('listitem');
    await expect(skippedIds).toHaveCount(3);
    for (const card of Object.values(CARDS)) {
      await expect(skippedIds.filter({ hasText: new RegExp(`^${card.id}$`) })).toHaveCount(1);
    }
    await expect(result.getByText(/^登録できなかった件数：/)).toHaveText(
      '登録できなかった件数：1 件'
    );
    await expect(
      result.getByRole('list', { name: '登録できなかったファイルと理由' }).getByRole('listitem')
    ).toHaveText([MISSING_REQUIRED_RESULT]);
    await expect(result.getByText(/^参考の印を付けた件数：/)).toHaveText(
      '参考の印を付けた件数：0 件'
    );

    await closeImportDialog(page);

    // 既にある見積は変わらず、増えもしない
    await searchLedger(page, { keyword: KEYWORD });
    await expect(resultCount(page)).toHaveText('3 件');
    await expectLedgerRows(page, ['reference', 'missingKey', 'transport']);
  });

  /**
   * @requirement unit-price-ledger/REQ-3.1
   */
  test('参考の理由のあるカードの見積は、すべての明細行に参考の印と「、」でつないだ理由が付く (unit-price-ledger/REQ-3.1)', async ({
    page,
  }) => {
    await searchLedger(page, { keyword: CARDS.reference.vendor });
    await expect(resultCount(page)).toHaveText('1 件');
    await ledgerRows(page).first().getByRole('link', { name: CARDS.reference.vendor }).click();

    await expect(page.getByRole('heading', { level: 1, name: '見積の詳細' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const lineTable = page.getByRole('table', { name: '明細行' });
    // 見積を読み終えて明細行の表が出てから、見出しの並びを読む（allTextContents は待たない）
    await expect(
      lineTable.getByRole('columnheader', { name: '参考の理由', exact: true })
    ).toBeVisible({ timeout: getTimeout(15000) });
    const headers = await lineTable.getByRole('columnheader').allTextContents();
    const markIndex = headers.indexOf('参考の印');
    const reasonIndex = headers.indexOf('参考の理由');
    const nameIndex = headers.indexOf('名称');
    expect(markIndex).toBeGreaterThanOrEqual(0);
    expect(reasonIndex).toBeGreaterThanOrEqual(0);
    expect(nameIndex).toBeGreaterThanOrEqual(0);

    const lineRows = lineTable.getByRole('rowgroup').nth(1).getByRole('row');
    await expect(lineRows).toHaveCount(2);
    for (const [index, name] of ['外壁塗装', '養生'].entries()) {
      const cells = lineRows.nth(index).getByRole('cell');
      await expect(cells.nth(nameIndex)).toHaveText(name);
      await expect(cells.nth(markIndex)).toHaveText('あり');
      await expect(cells.nth(reasonIndex)).toHaveText(REFERENCE_REASON);
    }
  });

  /**
   * @requirement unit-price-ledger/REQ-4.3
   * @requirement unit-price-ledger/REQ-4.5
   */
  test('「要確認」で絞り込むと、参考の印のある見積だけが出る (unit-price-ledger/REQ-4.3, REQ-4.5)', async ({
    page,
  }) => {
    await searchLedger(page, { keyword: KEYWORD, needsReview: true });
    await expect(page).toHaveURL(/needsReview=true/);
    await expect(resultCount(page)).toHaveText('1 件');
    await expectLedgerRows(page, ['reference']);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.4
   * @requirement unit-price-ledger/REQ-4.5
   */
  test('「分類キーの無い行がある」で絞り込むと、直接工事の行に分類キーの無い見積だけが出る (unit-price-ledger/REQ-4.4, REQ-4.5)', async ({
    page,
  }) => {
    await searchLedger(page, { keyword: KEYWORD, missingClassificationKey: true });
    await expect(page).toHaveURL(/missingClassificationKey=true/);
    await expect(resultCount(page)).toHaveText('2 件');
    // 交通費と別途の行だけの見積は出ない
    await expectLedgerRows(page, ['reference', 'missingKey']);
  });

  /**
   * @requirement unit-price-ledger/REQ-4.3
   * @requirement unit-price-ledger/REQ-4.7
   */
  test('絞り込みの結果が 0 件のときは「条件に合う見積はありません」と出る (unit-price-ledger/REQ-4.3, REQ-4.7)', async ({
    page,
  }) => {
    // 参考の印の無い見積を「要確認」で絞り込む
    await searchLedger(page, { keyword: CARDS.missingKey.vendor, needsReview: true });
    await expect(resultCount(page)).toHaveText('0 件');
    await expect(page.getByText('条件に合う見積はありません')).toBeVisible();
    await expect(page.getByRole('table', { name: '台帳の見積の一覧' })).toHaveCount(0);
  });
});
