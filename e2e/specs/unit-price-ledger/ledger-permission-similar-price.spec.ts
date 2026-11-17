/**
 * @fileoverview 単価台帳の権限と似た単価の E2E（unit-price-ledger タスク5.4）
 *
 * 次のことを確かめる。
 * - システム管理者には上部の並びに「単価台帳」の導線が出る
 * - 見積の編集の権限（estimate:update）を持ち、台帳の管理の権限（unit_price_ledger:manage）を持たない
 *   一般ユーザーには、導線が出ず、台帳の一覧・詳細の画面は「単価台帳を表示する権限がありません」と出して内容を
 *   出さず、台帳の API（一覧・詳細・修正・印の更新・削除・取り込み・書き出し）は 403 で内容を返さない
 * - ロールの無い利用者（見積の編集の権限が無い）の似た単価の問い合わせは 403 で候補を返さない
 * - 一般ユーザーが似た単価を問い合わせると、分類キーが一致する行が名称の近さや見積日を問わず先に並び、
 *   担当外の案件の候補は「他案件」として案件の ID・受領見積書の ID・原本のパス・参考の理由の文を返さず
 *   （参考の印は返す）、担当の案件の候補は案件名と参考の理由の文を返し、案件の無い受領見積書の候補は台帳の
 *   案件名と原本のパスを返し、候補ごとに按分の内訳と按分の状態を返し、単価を決められない行は内訳の 4 つの
 *   金額を値なし（null）で返す
 *
 * 似た単価には、この仕様の画面が無い（後の claude-connector・見積の作成が使う）。そこで似た単価の問い合わせは、
 * 一般ユーザーとしてログインした利用者のアクセストークンで、E2E から API（POST /api/unit-price-ledger/similar-prices）
 * を直接呼んで確かめる。
 *
 * 材料は始める前に DB へ作る（業者名・案件名に `E2E似単価検証` を入れる）。始める前と終わった後に、その文字の
 * 受領見積書（明細行は連鎖して消える）と案件、メールアドレスが `e2e-similar-price-` で始まる利用者を消す。
 * 5.1（`E2E取込検証`）・5.2（`E2E修正検証`）・5.3（`E2E書出検証`）とは別の文字を使う。
 * 利用者は共有の役割の利用者と別に作り（案件の担当にするため）、ほかの spec の後始末
 * （`e2e-session-` の利用者を消す）に巻き込まれないメールアドレスにする。
 * - 担当外：管理者が営業担当者・作成者の案件の受領見積書。分類キーの一致する直接工事の行（名称は問い合わせと
 *   似ていない。単価が空で金額÷数量。参考の印と、担当外の案件の名前を含む参考の理由）、似ていない直接工事の行・
 *   産廃の行、問い合わせと同じ名称で単価・金額の無い直接工事の行（単価を決められない）、諸経費・交通費・
 *   法定福利費・値引き・別途の行
 * - 担当：一般ユーザーが営業担当者の案件の受領見積書。問い合わせと同じ名称の直接工事の行（参考の印と理由）と、
 *   同じ名称の諸経費の行（区分で外れる）、産廃の行・値引きの行
 * - 案件なし：案件の無い受領見積書（不採用・未確認）。問い合わせと同じ名称の直接工事の行（参考の印）
 *
 * 按分の内訳の期待値（8.1〜8.5。丸めは整数へ四捨五入（0 から遠い側））:
 * - 担当外：基準＝直接工事 10000＋14000＋産廃 6000＝30000、諸経費の率＝(1500＋500＋1000)÷30000＝0.1、
 *   値引きの率＝-1500÷30000＝-0.05（別途の 50000 は使わない）。単価＝10000÷3＝3333.33…→3333、
 *   諸経費の按分＝333.33…→333、値引きの按分＝-166.66…→-167、反映する単価＝3500→3500
 * - 担当：基準＝15000＋5000＝20000、諸経費の率＝2000÷20000＝0.1、値引きの率＝-1000÷20000＝-0.05。
 *   単価 3000、諸経費の按分 300、値引きの按分 -150、反映する単価 3150
 * - 案件なし：基準＝28000、諸経費・値引きは無い。単価 2800、按分 0・0、反映する単価 2800
 * - 担当外の単価を決められない行：換算の単価・単価・金額が無い（8.8）。4 つの金額は null で、状態は
 *   UNIT_PRICE_UNDETERMINED、按分できない印・反映できない印（金額の無い行は基準に入らない）
 *
 * Requirements coverage (unit-price-ledger):
 * - 7.1: 区分が直接工事か産廃の明細行から候補を返す（同じ名称の諸経費の行は候補にならない）
 * - 7.2: 分類キーが一致する行を、名称の近さを問わず候補に含め、名称の近さで選んだ候補より先に並べる
 * - 7.7: 候補ごとに業者名・見積日・案件名・名称・規格・単位・数量・区分・分類キーの一致・採否・読取の確認・
 *   参考の印と理由・按分の内訳を返す
 * - 8.4: 候補ごとに単価・諸経費の按分・値引きの按分・反映する単価を返す
 * - 8.8: 単価を決められない行は、単価・諸経費の按分・値引きの按分・反映する単価を値なしで返し、単価を
 *   決められないことを示す印（allocationStatus の UNIT_PRICE_UNDETERMINED）を返す
 * - 9.1: 閲覧範囲の内の案件の候補に案件名を返す
 * - 9.2: 閲覧範囲の外の案件の候補は「他案件」と返し、案件の ID・受領見積書の ID・原本のパス・参考の理由の文を
 *   返さない
 * - 9.3: 案件の無い受領見積書の候補に案件名と原本のパスを返す
 * - 9.4: 閲覧範囲の外の案件の候補にも、業者名・見積日・明細行の内容（参考の印を含み、参考の理由の文を除く）・
 *   按分の内訳を返す
 * - 10.1: 台帳の画面・取り込み・修正・削除・書き出しを、台帳の管理の権限を持つ利用者だけに許す
 * - 10.2: 似た単価の問い合わせを、見積の編集の権限を持つ利用者だけに許す
 * - 10.4: 権限の無い利用者の要求を拒み、内容を返さない
 * - 10.5: 台帳の管理の権限を持たない利用者に台帳の画面への導線を出さない（持つ利用者には出す）
 */

import { randomBytes } from 'crypto';
import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getAccessToken } from '../../helpers/auth-api';
import { getTimeout } from '../../helpers/wait-helpers';
import { TEST_USERS } from '../../helpers/test-users';
import { invalidateUserStateCache } from '../../helpers/user-state-cache';
import { getPrismaClient } from '../../fixtures/database';
import { createCustomUser, type CreatedUser } from '../../fixtures/auth.fixtures';
import { API_BASE_URL } from '../../config';

/** 材料に共通の文字（業者名・案件名に入れる） */
const KEYWORD = 'E2E似単価検証';

/** この spec が作る利用者のメールアドレスの接頭辞 */
const USER_EMAIL_PREFIX = 'e2e-similar-price-';

/** 権限の無い利用者に出す文言 */
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';

/** 台帳の API の経路 */
const LEDGER_API = `${API_BASE_URL}/api/unit-price-ledger`;

/** 問い合わせの名称（担当・案件なしの直接工事の行と同じ名称） */
const QUERY_NAME = `${KEYWORD} 耐火被覆吹付`;

/** 問い合わせと担当外の行の分類キー（体系に無い一意の値） */
const CLASSIFICATION_KEY = 'E2E-SIMILAR-PRICE-KEY-001';

/** 似た単価の候補（API の応答の 1 件） */
interface SimilarPriceCandidateBody {
  lineItemId: string;
  vendorName: string;
  submittedAt: string;
  projectName: string | null;
  projectId: string | null;
  receivedQuotationId: string | null;
  ledgerSourcePath: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  category: string;
  classificationKeyMatched: boolean;
  adoption: string;
  readingStatus: string;
  isReference: boolean;
  referenceReason: string | null;
  allocation: {
    allocationStatus: string;
    unitPrice: string | null;
    overheadAllocation: string | null;
    discountAllocation: string | null;
    appliedUnitPrice: string | null;
    allocatable: boolean;
    applicable: boolean;
  };
}

/** 作った材料 */
interface Fixtures {
  generalUser: CreatedUser;
  rolelessUser: CreatedUser;
  outOfScope: {
    projectId: string;
    projectName: string;
    quotationId: string;
    vendorName: string;
    keyLineId: string;
    undeterminedLineId: string;
    referenceReason: string;
  };
  inScope: {
    projectId: string;
    projectName: string;
    quotationId: string;
    vendorName: string;
    lineId: string;
    referenceReason: string;
  };
  noProject: {
    quotationId: string;
    vendorName: string;
    lineId: string;
    ledgerProjectName: string;
    ledgerSourcePath: string;
  };
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

// ============================================================================
// 材料
// ============================================================================

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

/** この spec の材料（受領見積書・案件・利用者）を消す */
async function cleanupFixtures(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.receivedQuotation.deleteMany({ where: { vendorName: { startsWith: KEYWORD } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: KEYWORD } } });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
    select: { id: true },
  });
  await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await invalidateUserStateCache(users.map((user) => user.id));
}

/** 材料を作る */
async function createFixtures(): Promise<Fixtures> {
  const prisma = getPrismaClient();
  const suffix = uniqueSuffix();
  const adminId = await adminUserId();

  const generalUser = await createCustomUser({
    email: `${USER_EMAIL_PREFIX}general-${suffix}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: 'Similar Price General',
    roles: ['user'],
  });
  const rolelessUser = await createCustomUser({
    email: `${USER_EMAIL_PREFIX}roleless-${suffix}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: 'Similar Price Roleless',
    roles: [],
  });

  // 担当外：管理者が営業担当者・作成者の案件（一般ユーザーは関係者でない）
  const outProjectName = `${KEYWORD}_担当外の案件_${suffix}`;
  const outProject = await prisma.project.create({
    data: { name: outProjectName, salesPersonId: adminId, createdById: adminId },
    select: { id: true },
  });
  const outVendorName = `${KEYWORD}_保温業者_${suffix}`;
  // 参考の理由の文は自由な文で、案件の名前を含みうる（範囲外の候補では返さない。9.2）
  const outReferenceReason = `${outProjectName}の図面と数量を照合する`;
  const outQuotation = await prisma.receivedQuotation.create({
    data: {
      projectId: outProject.id,
      vendorName: outVendorName,
      name: `${outVendorName}_2026-03-01`,
      submittedAt: new Date('2026-03-01T00:00:00.000Z'),
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: '配管保温巻き',
            specification: 'グラスウール 25mm',
            quantity: 3,
            unit: 'm',
            amount: 10000,
            classificationKey: CLASSIFICATION_KEY,
            isReference: true,
            referenceReason: outReferenceReason,
          },
          {
            sortOrder: 1,
            category: 'DIRECT',
            name: '配線ダクト',
            quantity: 2,
            unit: '本',
            unitPrice: 7000,
            amount: 14000,
          },
          {
            sortOrder: 2,
            category: 'WASTE',
            name: '発生材運搬',
            quantity: 1,
            unit: '式',
            unitPrice: 6000,
            amount: 6000,
          },
          { sortOrder: 3, category: 'OVERHEAD', name: '現場管理費', amount: 1500 },
          { sortOrder: 4, category: 'TRAVEL', name: '交通費', amount: 500 },
          { sortOrder: 5, category: 'LEGAL_WELFARE', name: '法定福利費', amount: 1000 },
          { sortOrder: 6, category: 'DISCOUNT', name: '出精値引き', amount: -1500 },
          { sortOrder: 7, category: 'EXCLUDED', name: '別途工事', amount: 50000 },
          // 単価・金額の無い直接工事の行（単価を決められない。8.8）。金額が無いので基準に入らない
          { sortOrder: 8, category: 'DIRECT', name: QUERY_NAME, quantity: 2, unit: 'm2' },
        ],
      },
    },
    select: {
      id: true,
      lineItems: { where: { sortOrder: { in: [0, 8] } }, select: { id: true, sortOrder: true } },
    },
  });

  // 担当：一般ユーザーが営業担当者の案件
  const inProjectName = `${KEYWORD}_担当の案件_${suffix}`;
  const inProject = await prisma.project.create({
    data: { name: inProjectName, salesPersonId: generalUser.id, createdById: adminId },
    select: { id: true },
  });
  const inVendorName = `${KEYWORD}_被覆業者_${suffix}`;
  const inReferenceReason = `${inProjectName}の数量は概算`;
  const inQuotation = await prisma.receivedQuotation.create({
    data: {
      projectId: inProject.id,
      vendorName: inVendorName,
      name: `${inVendorName}_2026-06-01`,
      submittedAt: new Date('2026-06-01T00:00:00.000Z'),
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: QUERY_NAME,
            quantity: 5,
            unit: 'm2',
            unitPrice: 3000,
            amount: 15000,
            isReference: true,
            referenceReason: inReferenceReason,
          },
          {
            sortOrder: 1,
            category: 'WASTE',
            name: '撤去材処分',
            quantity: 1,
            unit: '式',
            unitPrice: 5000,
            amount: 5000,
          },
          // 問い合わせと同じ名称でも、諸経費の行は候補にならない（7.1）
          { sortOrder: 2, category: 'OVERHEAD', name: QUERY_NAME, amount: 2000 },
          { sortOrder: 3, category: 'DISCOUNT', name: '値引き', amount: -1000 },
        ],
      },
    },
    select: { id: true, lineItems: { where: { sortOrder: 0 }, select: { id: true } } },
  });

  // 案件なし：案件の無い受領見積書（不採用・未確認。7.8 で候補に含まれる）
  const noVendorName = `${KEYWORD}_台帳業者_${suffix}`;
  const ledgerProjectName = `${KEYWORD}_台帳の案件_${suffix}`;
  const ledgerSourcePath = `E2E/似単価検証/${suffix}/見積.pdf`;
  const noQuotation = await prisma.receivedQuotation.create({
    data: {
      vendorName: noVendorName,
      name: `${noVendorName}_2026-01-10`,
      submittedAt: new Date('2026-01-10T00:00:00.000Z'),
      ledgerCardId: `E2E-SIMILAR-PRICE-${suffix}`,
      ledgerProjectName,
      ledgerSourcePath,
      adoption: 'REJECTED',
      lineItems: {
        create: [
          {
            sortOrder: 0,
            category: 'DIRECT',
            name: QUERY_NAME,
            quantity: 10,
            unit: 'm2',
            unitPrice: 2800,
            amount: 28000,
            isReference: true,
            referenceReason: '概算のみ',
          },
        ],
      },
    },
    select: { id: true, lineItems: { select: { id: true } } },
  });

  const firstLineId = (lines: ReadonlyArray<{ id: string }>, label: string): string => {
    const line = lines[0];
    if (!line) {
      throw new Error(`${label}の明細行を作れませんでした（検証の前提の誤り）`);
    }
    return line.id;
  };
  const outLineId = (sortOrder: number): string =>
    firstLineId(
      outQuotation.lineItems.filter((item) => item.sortOrder === sortOrder),
      `担当外の見積（並び ${sortOrder}）`
    );

  return {
    generalUser,
    rolelessUser,
    outOfScope: {
      projectId: outProject.id,
      projectName: outProjectName,
      quotationId: outQuotation.id,
      vendorName: outVendorName,
      keyLineId: outLineId(0),
      undeterminedLineId: outLineId(8),
      referenceReason: outReferenceReason,
    },
    inScope: {
      projectId: inProject.id,
      projectName: inProjectName,
      quotationId: inQuotation.id,
      vendorName: inVendorName,
      lineId: firstLineId(inQuotation.lineItems, '担当の見積'),
      referenceReason: inReferenceReason,
    },
    noProject: {
      quotationId: noQuotation.id,
      vendorName: noVendorName,
      lineId: firstLineId(noQuotation.lineItems, '案件の無い見積'),
      ledgerProjectName,
      ledgerSourcePath,
    },
  };
}

// ============================================================================
// 観測の補助
// ============================================================================

/** 上部の並びの「単価台帳」の導線 */
function ledgerNavLink(page: Page) {
  return page.getByRole('navigation').getByRole('link', { name: '単価台帳', exact: true });
}

/** 画面が台帳の API へ出した要求の経路を記録する */
function recordLedgerApiRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/unit-price-ledger')) {
      paths.push(`${request.method()} ${pathname}`);
    }
  });
  return paths;
}

/** 403 で、台帳の内容（材料の文字・一覧・見積・候補）を返さないことを確かめる */
async function expectForbiddenWithoutContent(response: APIResponse, label: string): Promise<void> {
  expect(response.status(), `${label} は 403`).toBe(403);
  const text = await response.text();
  expect(text, `${label} の応答に材料の文字が無い`).not.toContain(KEYWORD);
  const body = JSON.parse(text) as Record<string, unknown>;
  for (const key of ['items', 'quotation', 'lineItems', 'candidates', 'total']) {
    expect(Object.keys(body), `${label} の応答に ${key} が無い`).not.toContain(key);
  }
}

// ============================================================================
// テスト
// ============================================================================

test.describe('単価台帳の権限と似た単価', () => {
  test.describe.configure({ mode: 'serial' });

  let fixtures: Fixtures;

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixtures = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  /**
   * @requirement unit-price-ledger/REQ-10.5
   */
  test('台帳の管理の権限を持つシステム管理者には、上部の並びに「単価台帳」の導線が出る (unit-price-ledger/REQ-10.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'ADMIN_USER');
    await page.goto('/dashboard');
    await expect(ledgerNavLink(page)).toBeVisible({ timeout: getTimeout(15000) });
    await ledgerNavLink(page).click();
    await expect(page).toHaveURL(/\/unit-price-ledger$/);
    await expect(page.getByRole('heading', { level: 1, name: '単価台帳' })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * @requirement unit-price-ledger/REQ-10.1
   * @requirement unit-price-ledger/REQ-10.4
   * @requirement unit-price-ledger/REQ-10.5
   */
  test('一般ユーザーには導線が出ず、台帳の一覧と詳細の画面は権限が無い旨を出して内容を出さず、台帳の API を要求しない (unit-price-ledger/REQ-10.1, REQ-10.4, REQ-10.5)', async ({
    page,
  }) => {
    const ledgerRequests = recordLedgerApiRequests(page);
    await loginAsUser(page, fixtures.generalUser);

    await page.goto('/unit-price-ledger');
    await expect(page.getByRole('alert').filter({ hasText: NO_PERMISSION_MESSAGE })).toBeVisible({
      timeout: getTimeout(15000),
    });
    // 権限を読み終えて文言が出た時点で、上部の並びは表示済み（自社情報の導線）で、台帳の導線は無い
    await expect(
      page.getByRole('navigation').getByRole('link', { name: '自社情報', exact: true })
    ).toBeVisible();
    await expect(ledgerNavLink(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: '単価台帳' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(KEYWORD)).toHaveCount(0);

    await page.goto(`/unit-price-ledger/quotations/${fixtures.noProject.quotationId}`);
    await expect(page.getByRole('alert').filter({ hasText: NO_PERMISSION_MESSAGE })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('heading', { level: 1, name: '見積の詳細' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(KEYWORD)).toHaveCount(0);

    expect(ledgerRequests, '画面は台帳の API を要求しない').toEqual([]);
  });

  /**
   * @requirement unit-price-ledger/REQ-10.1
   * @requirement unit-price-ledger/REQ-10.4
   */
  test('一般ユーザーの台帳の一覧・詳細・修正・印の更新・削除・取り込み・書き出しの API は 403 で内容を返さない (unit-price-ledger/REQ-10.1, REQ-10.4)', async ({
    page,
    request,
  }) => {
    const token = await getAccessToken(page, fixtures.generalUser);
    const headers = { Authorization: `Bearer ${token}` };
    const quotationPath = `${LEDGER_API}/quotations/${fixtures.noProject.quotationId}`;

    await expectForbiddenWithoutContent(
      await request.get(`${LEDGER_API}/quotations?keyword=${encodeURIComponent(KEYWORD)}`, {
        headers,
      }),
      '一覧'
    );
    await expectForbiddenWithoutContent(await request.get(quotationPath, { headers }), '詳細');
    await expectForbiddenWithoutContent(
      await request.put(quotationPath, {
        headers,
        data: { vendorName: `${KEYWORD}_書き換え` },
      }),
      '修正'
    );
    await expectForbiddenWithoutContent(
      await request.patch(`${quotationPath}/marks`, {
        headers,
        data: { readingStatus: 'CONFIRMED' },
      }),
      '印の更新'
    );
    await expectForbiddenWithoutContent(await request.delete(quotationPath, { headers }), '削除');
    await expectForbiddenWithoutContent(
      await request.post(`${LEDGER_API}/imports`, {
        headers,
        multipart: {
          files: {
            name: 'card.json',
            mimeType: 'application/json',
            buffer: Buffer.from('{}'),
          },
        },
      }),
      '取り込み'
    );
    await expectForbiddenWithoutContent(
      await request.post(`${LEDGER_API}/exports`, { headers, data: {} }),
      '書き出し'
    );

    // 拒まれた修正・削除は見積を変えていない
    const unchanged = await getPrismaClient().receivedQuotation.findUnique({
      where: { id: fixtures.noProject.quotationId },
      select: { vendorName: true, deletedAt: true, readingStatus: true },
    });
    expect(unchanged).toEqual({
      vendorName: fixtures.noProject.vendorName,
      deletedAt: null,
      readingStatus: 'UNCONFIRMED',
    });
  });

  /**
   * @requirement unit-price-ledger/REQ-10.2
   * @requirement unit-price-ledger/REQ-10.4
   */
  test('見積の編集の権限が無い利用者の似た単価の問い合わせは 403 で候補を返さない (unit-price-ledger/REQ-10.2, REQ-10.4)', async ({
    page,
    request,
  }) => {
    const token = await getAccessToken(page, fixtures.rolelessUser);
    const response = await request.post(`${LEDGER_API}/similar-prices`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: QUERY_NAME, classificationKey: CLASSIFICATION_KEY },
    });
    await expectForbiddenWithoutContent(response, '似た単価');
  });

  /**
   * @requirement unit-price-ledger/REQ-7.1
   * @requirement unit-price-ledger/REQ-7.2
   * @requirement unit-price-ledger/REQ-7.7
   * @requirement unit-price-ledger/REQ-8.4
   * @requirement unit-price-ledger/REQ-8.8
   * @requirement unit-price-ledger/REQ-9.1
   * @requirement unit-price-ledger/REQ-9.2
   * @requirement unit-price-ledger/REQ-9.3
   * @requirement unit-price-ledger/REQ-9.4
   * @requirement unit-price-ledger/REQ-10.2
   */
  test('見積の編集の権限を持つ一般ユーザーが似た単価を問い合わせると、分類キーの一致が先に並び、担当外の案件は「他案件」になって参考の理由の文を返さず、按分の内訳が返り、単価を決められない行は値なしになる (unit-price-ledger/REQ-7.1, REQ-7.2, REQ-7.7, REQ-8.4, REQ-8.8, REQ-9.1, REQ-9.2, REQ-9.3, REQ-9.4, REQ-10.2)', async ({
    page,
    request,
  }) => {
    const token = await getAccessToken(page, fixtures.generalUser);
    const response = await request.post(`${LEDGER_API}/similar-prices`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: QUERY_NAME, classificationKey: CLASSIFICATION_KEY },
    });
    expect(response.status()).toBe(200);
    const { candidates } = (await response.json()) as { candidates: SimilarPriceCandidateBody[] };

    // 7.1・7.2：分類キーの一致する担当外の行（名称は似ていない・見積日は古い）が先頭で、名称で選んだ
    // 直接工事の行が見積日の新しい順（担当 → 担当外の単価を決められない行 → 案件なし）に続く。
    // 同じ名称の諸経費の行と、似ていない行は候補にならない
    expect(candidates.map((candidate) => candidate.lineItemId)).toEqual([
      fixtures.outOfScope.keyLineId,
      fixtures.inScope.lineId,
      fixtures.outOfScope.undeterminedLineId,
      fixtures.noProject.lineId,
    ]);
    expect(candidates.map((candidate) => candidate.classificationKeyMatched)).toEqual([
      true,
      false,
      false,
      false,
    ]);

    const [outOfScope, inScope, undetermined, noProject] = candidates;

    // 9.2：担当外の案件は「他案件」で、案件を特定できる情報を返さない。業者名・見積日・明細行・按分は返す（9.4）
    expect(outOfScope).toEqual({
      lineItemId: fixtures.outOfScope.keyLineId,
      vendorName: fixtures.outOfScope.vendorName,
      submittedAt: '2026-03-01',
      projectName: '他案件',
      projectId: null,
      receivedQuotationId: null,
      ledgerSourcePath: null,
      name: '配管保温巻き',
      specification: 'グラスウール 25mm',
      unit: 'm',
      quantity: '3',
      category: 'DIRECT',
      classificationKeyMatched: true,
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      // 9.2・9.4：参考の印は返し、参考の理由の文（担当外の案件の名前を含む）は返さない
      isReference: true,
      referenceReason: null,
      // 8.4：単価 10000÷3、諸経費の率 0.1、値引きの率 -0.05（別途を使わない）。丸めは整数へ四捨五入
      allocation: {
        allocationStatus: 'ALLOCATED',
        unitPrice: '3333',
        overheadAllocation: '333',
        discountAllocation: '-167',
        appliedUnitPrice: '3500',
        allocatable: true,
        applicable: true,
      },
    });
    for (const candidate of [outOfScope, undetermined]) {
      const outOfScopeText = JSON.stringify(candidate);
      expect(outOfScopeText).not.toContain(fixtures.outOfScope.projectName);
      expect(outOfScopeText).not.toContain(fixtures.outOfScope.projectId);
      expect(outOfScopeText).not.toContain(fixtures.outOfScope.quotationId);
      expect(outOfScopeText).not.toContain(fixtures.outOfScope.referenceReason);
    }

    // 8.8：担当外の単価を決められない行は、按分の内訳の 4 つの金額を値なし（null）で返し、状態で理由を示す
    expect(undetermined).toEqual({
      lineItemId: fixtures.outOfScope.undeterminedLineId,
      vendorName: fixtures.outOfScope.vendorName,
      submittedAt: '2026-03-01',
      projectName: '他案件',
      projectId: null,
      receivedQuotationId: null,
      ledgerSourcePath: null,
      name: QUERY_NAME,
      specification: null,
      unit: 'm2',
      quantity: '2',
      category: 'DIRECT',
      classificationKeyMatched: false,
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      isReference: false,
      referenceReason: null,
      allocation: {
        allocationStatus: 'UNIT_PRICE_UNDETERMINED',
        unitPrice: null,
        overheadAllocation: null,
        discountAllocation: null,
        appliedUnitPrice: null,
        allocatable: false,
        applicable: false,
      },
    });

    // 9.1：担当の案件は案件名・案件の ID・受領見積書の ID を返す
    expect(inScope).toEqual({
      lineItemId: fixtures.inScope.lineId,
      vendorName: fixtures.inScope.vendorName,
      submittedAt: '2026-06-01',
      projectName: fixtures.inScope.projectName,
      projectId: fixtures.inScope.projectId,
      receivedQuotationId: fixtures.inScope.quotationId,
      ledgerSourcePath: null,
      name: QUERY_NAME,
      specification: null,
      unit: 'm2',
      quantity: '5',
      category: 'DIRECT',
      classificationKeyMatched: false,
      adoption: 'ADOPTED',
      readingStatus: 'CONFIRMED',
      // 範囲内の案件の候補は、参考の理由の文をそのまま返す
      isReference: true,
      referenceReason: fixtures.inScope.referenceReason,
      // 8.4：単価 3000、諸経費の率 2000÷20000、値引きの率 -1000÷20000
      allocation: {
        allocationStatus: 'ALLOCATED',
        unitPrice: '3000',
        overheadAllocation: '300',
        discountAllocation: '-150',
        appliedUnitPrice: '3150',
        allocatable: true,
        applicable: true,
      },
    });

    // 9.3：案件の無い受領見積書は台帳の案件名と原本のパスを返す。不採用・未確認・参考の印も返す（7.7）
    expect(noProject).toEqual({
      lineItemId: fixtures.noProject.lineId,
      vendorName: fixtures.noProject.vendorName,
      submittedAt: '2026-01-10',
      projectName: fixtures.noProject.ledgerProjectName,
      projectId: null,
      receivedQuotationId: fixtures.noProject.quotationId,
      ledgerSourcePath: fixtures.noProject.ledgerSourcePath,
      name: QUERY_NAME,
      specification: null,
      unit: 'm2',
      quantity: '10',
      category: 'DIRECT',
      classificationKeyMatched: false,
      adoption: 'REJECTED',
      readingStatus: 'UNCONFIRMED',
      isReference: true,
      referenceReason: '概算のみ',
      allocation: {
        allocationStatus: 'ALLOCATED',
        unitPrice: '2800',
        overheadAllocation: '0',
        discountAllocation: '0',
        appliedUnitPrice: '2800',
        allocatable: true,
        applicable: true,
      },
    });
  });
});
