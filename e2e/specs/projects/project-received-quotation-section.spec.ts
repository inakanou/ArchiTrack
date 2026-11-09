/**
 * @fileoverview プロジェクト詳細画面の受領見積書セクションの E2E テスト
 *
 * project-management タスク82.1。design.md の受領見積書セクション（Requirements 42・43）の
 * Testing Strategy の E2E。実際の画面とバックエンドを通して、次を確かめる。
 *
 * - セクションの件数（全N件）が detail-summary の総数・案件の受領見積書の一覧の画面の件数と一致すること
 *   （見積依頼に紐づくものと紐づかないものを数え、論理削除したものを数えない）
 * - 直近の受領見積書のカード（登録日時の新しい順・受領見積書名・業者名・提出日・NET金額）
 * - カード・「すべて見る」・「新規登録」で一覧の画面へ移り、「新規登録」では登録フォームが開くこと
 * - 見積依頼セクションの直後（見積書セクションの直前）に出ること
 * - 見積依頼の閲覧権限の無い利用者には出ず、detail-summary の応答にも受領見積書の鍵が無いこと
 *   （そのとき見積書セクションは見積依頼セクションの直後に出る。28.1 の改訂）
 * - 登録の権限の無い利用者には「新規登録」が出ないこと、空の表示
 * - detail-summary の応答を遅らせたときの骨組み（間接の検証。下記）
 *
 * Requirements coverage:
 * - REQ-28.1: 見積書セクションは受領見積書セクションの下。受領見積書セクションを出さない利用者には見積依頼セクションの下
 * - REQ-42.1〜42.14: プロジェクト詳細画面の受領見積書セクション
 * - REQ-43.1〜43.4: detail-summary API の受領見積書セクションデータ
 *
 * 被覆する受入基準は各テストの `@requirement` の印が名乗る。
 *
 * 検証に使う案件・取引先・見積依頼・受領見積書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、
 * 利用者はテストの中で作る一意のメールアドレスの利用者とする。共有の DB を他の試験と使うため、
 * 主張は自分の案件に絞る。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createCustomUser,
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { TEST_USERS } from '../../helpers/test-users';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件・取引先・受領見積書の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-pm-rq-section-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-pm-rq-section-role-';

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

// ============================================================================
// DB の前提
// ============================================================================

interface ProjectRef {
  id: string;
  name: string;
}

/** 利用者を営業担当者・作成者とする案件を DB に作る（利用者の閲覧範囲に入る） */
async function createProject(owner: CreatedUser, label: string): Promise<ProjectRef> {
  return getPrismaClient().project.create({
    data: {
      name: `${NAME_PREFIX}${label}-${uniqueSuffix()}`,
      salesPersonId: owner.id,
      createdById: owner.id,
    },
    select: { id: true, name: true },
  });
}

/** 協力業者の取引先を DB に作る */
async function createPartner(label: string): Promise<{ id: string; name: string }> {
  return getPrismaClient().tradingPartner.create({
    data: {
      name: `${NAME_PREFIX}業者-${label}-${uniqueSuffix()}`,
      nameKana: 'イーツーイーセクションギョウシャ',
      address: '東京都千代田区1-1-1',
      email: 'e2e-pm-rq-section-partner@example.com',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true, name: true },
  });
}

/** 内訳書の全項目を選んだ見積依頼を DB に作る */
async function createEstimateRequest(
  projectId: string,
  tradingPartnerId: string,
  label: string
): Promise<{ id: string }> {
  const prisma = getPrismaClient();
  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId,
      name: `受領見積書セクションの検証の内訳書 ${label}`,
      sourceQuantityTableId: `${NAME_PREFIX}${label}-qt`,
      sourceQuantityTableName: `${label} の数量表`,
      items: {
        create: [
          { workType: '内装工事', name: '床の張替え', unit: 'm2', quantity: 12, displayOrder: 1 },
        ],
      },
    },
    select: { id: true },
  });
  const items = await prisma.itemizedStatementItem.findMany({
    where: { itemizedStatementId: statement.id },
    select: { id: true },
  });
  return prisma.estimateRequest.create({
    data: {
      projectId,
      tradingPartnerId,
      itemizedStatementId: statement.id,
      name: `${NAME_PREFIX}見積依頼-${label}-${uniqueSuffix()}`,
      selectedItems: {
        create: items.map((item) => ({ itemizedStatementItemId: item.id, selected: true })),
      },
    },
    select: { id: true },
  });
}

/** カードに出る受領見積書（期待値はテストが与えた入力から定まる） */
interface SeededQuotation {
  id: string;
  name: string;
  vendorName: string;
  /** 画面の提出日の表示（YYYY/MM/DD） */
  submittedLabel: string;
  /** 画面の NET金額の表示 */
  netLabel: string;
  /** detail-summary の値 */
  submittedAt: string;
  netAmount: number | null;
  createdAt: string;
}

interface SeededProject {
  project: ProjectRef;
  /** 論理削除されていない受領見積書の総数（見積依頼に紐づくもの1件を含む） */
  totalCount: number;
  /** 直近の受領見積書（登録日時の新しい順の3件） */
  latest: SeededQuotation[];
}

/**
 * 受領見積書を持つ案件を用意する。
 *
 * - 見積依頼の無い受領見積書3件と、見積依頼に紐づく受領見積書1件（最も新しい）→ 総数4件
 * - 論理削除した受領見積書1件（登録日時は最も新しいが数えず、カードにも出ない）
 * - 登録日時はテストが与え、直近の3件の並び（新しい順）を定める
 */
async function seedProjectWithQuotations(
  owner: CreatedUser,
  label: string
): Promise<SeededProject> {
  const prisma = getPrismaClient();
  const project = await createProject(owner, label);
  const partner = await createPartner(label);
  const estimateRequest = await createEstimateRequest(project.id, partner.id, label);
  const base = Date.now() - 60 * 60 * 1000;
  const minutes = (n: number) => new Date(base + n * 60 * 1000);

  const inputs = [
    {
      name: `${NAME_PREFIX}最も古い見積`,
      vendorName: '古株工業',
      submittedAt: '2026-09-01',
      netAmount: 100000,
      createdAt: minutes(1),
      estimateRequestId: null as string | null,
    },
    {
      name: `${NAME_PREFIX}二番目の見積`,
      vendorName: '二番手建材',
      submittedAt: '2026-09-15',
      netAmount: 2345678,
      createdAt: minutes(2),
      estimateRequestId: null,
    },
    {
      name: `${NAME_PREFIX}NET未入力の見積`,
      vendorName: '未入力設備',
      submittedAt: '2026-10-01',
      netAmount: null,
      createdAt: minutes(3),
      estimateRequestId: null,
    },
    {
      name: `${NAME_PREFIX}見積依頼に紐づく見積`,
      vendorName: partner.name,
      submittedAt: '2026-10-20',
      netAmount: 98765,
      createdAt: minutes(4),
      estimateRequestId: estimateRequest.id,
    },
  ];

  const created: SeededQuotation[] = [];
  for (const input of inputs) {
    const row = await prisma.receivedQuotation.create({
      data: {
        projectId: project.id,
        estimateRequestId: input.estimateRequestId,
        tradingPartnerId: input.estimateRequestId ? partner.id : null,
        vendorName: input.vendorName,
        name: input.name,
        submittedAt: new Date(input.submittedAt),
        netAmount: input.netAmount,
        createdAt: input.createdAt,
      },
      select: { id: true, submittedAt: true, createdAt: true },
    });
    created.push({
      id: row.id,
      name: input.name,
      vendorName: input.vendorName,
      submittedLabel: input.submittedAt.replace(/-/g, '/'),
      netLabel: input.netAmount === null ? '-' : `${input.netAmount.toLocaleString('ja-JP')}円`,
      submittedAt: row.submittedAt.toISOString(),
      netAmount: input.netAmount,
      createdAt: row.createdAt.toISOString(),
    });
  }

  // 論理削除したもの（最も新しい登録日時でも数えず、カードにも出ない）
  await prisma.receivedQuotation.create({
    data: {
      projectId: project.id,
      vendorName: '削除済み業者',
      name: `${NAME_PREFIX}削除済みの見積`,
      submittedAt: new Date('2026-10-25'),
      createdAt: minutes(5),
      deletedAt: new Date(),
    },
  });

  return {
    project,
    totalCount: inputs.length,
    latest: [...created].reverse().slice(0, 3),
  };
}

/** 権限を ID で引く（無ければ前提の誤りとして失敗する） */
async function permissionId(resource: string, action: string): Promise<string> {
  const permission = await getPrismaClient().permission.findFirst({
    where: { resource, action },
    select: { id: true },
  });
  if (!permission) {
    throw new Error(`権限 ${resource}:${action} が見つかりません（検証の前提の誤り）`);
  }
  return permission.id;
}

/** 指定の権限だけを持つロールの利用者を作る */
async function createLimitedUser(
  label: string,
  permissions: ReadonlyArray<readonly [string, string]>
): Promise<CreatedUser> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}${label}-${uniqueSuffix()}`,
      description: `E2E 受領見積書セクションの検証（${label}）`,
      priority: 0,
      isSystem: false,
    },
    select: { id: true, name: true },
  });
  for (const [resource, action] of permissions) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}pm-rq-section-${label}-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: `受領見積書セクションの検証 ${label}`,
    roles: [role.name],
  });
}

// ============================================================================
// 画面の操作
// ============================================================================

interface DetailSummaryBody {
  sections: Record<string, unknown> & {
    receivedQuotations?: {
      totalCount: number;
      latestReceivedQuotations: Array<{
        id: string;
        name: string;
        vendorName: string;
        submittedAt: string;
        netAmount: number | string | null;
        createdAt: string;
      }>;
    };
  };
}

/** プロジェクト詳細画面を開き、画面が受け取った detail-summary の応答を返す */
async function openProjectDetail(page: Page, projectId: string): Promise<DetailSummaryBody> {
  const summary = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/projects/${projectId}/detail-summary`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/projects/${projectId}`);
  const response = await summary;
  expect(response.status(), '前提: detail-summary が成功する').toBe(200);
  // 隣の見積依頼セクションが描かれたことで、詳細画面の本体の描画を確かめる
  await expect(page.getByTestId('estimate-request-section')).toBeVisible({
    timeout: getTimeout(15000),
  });
  return (await response.json()) as DetailSummaryBody;
}

function receivedQuotationSection(page: Page) {
  return page.getByRole('region', { name: '受領見積書', exact: true });
}

/** 新規登録のリンク（アクセシブルな名前「受領見積書を新規登録」） */
function registerLink(page: Page) {
  return receivedQuotationSection(page).getByRole('link', {
    name: '受領見積書を新規登録',
    exact: true,
  });
}

/** 案件の受領見積書の一覧の画面に移ったこと */
async function expectOnListPage(page: Page, projectId: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/quotations$`), {
    timeout: getTimeout(15000),
  });
  await expect(page.getByTestId('project-received-quotation-list-page')).toBeVisible({
    timeout: getTimeout(15000),
  });
}

/** 登録フォームの見出し */
function registerFormHeading(page: Page) {
  return page.getByRole('heading', { name: '受領見積書の登録', exact: true });
}

// ============================================================================
// テスト
// ============================================================================

test.describe('プロジェクト詳細画面 - 受領見積書セクション', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 受領見積書は案件を onDelete: Restrict で指すため先に消す
    await prisma.receivedQuotation.deleteMany({
      where: {
        OR: [
          { project: { name: { startsWith: NAME_PREFIX } } },
          { name: { startsWith: NAME_PREFIX } },
        ],
      },
    });
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement project-management/REQ-42.1
   * @requirement project-management/REQ-42.3
   * @requirement project-management/REQ-42.4
   * @requirement project-management/REQ-42.5
   * @requirement project-management/REQ-42.6
   * @requirement project-management/REQ-42.14
   * @requirement project-management/REQ-43.1
   * @requirement project-management/REQ-43.2
   * @requirement project-management/REQ-43.3
   * @requirement project-management/REQ-28.1
   */
  test('見積依頼セクションの直後に、一覧の画面と同じ件数と直近の受領見積書のカードを工程表セクションと同じ形で表示する', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const seeded = await seedProjectWithQuotations(owner, 'display');

    await loginAsUser(page, owner);
    const body = await openProjectDetail(page, seeded.project.id);

    // 43.1・43.2: 応答に総数と直近の受領見積書（ID・名前・業者名・提出日・NET金額・登録日時）が含まれる
    const summary = body.sections.receivedQuotations;
    expect(summary, '閲覧権限のある利用者の応答には受領見積書の鍵がある').toBeDefined();
    expect(summary?.totalCount).toBe(seeded.totalCount);
    expect(
      summary?.latestReceivedQuotations.map((q) => ({
        id: q.id,
        name: q.name,
        vendorName: q.vendorName,
        submittedAt: new Date(q.submittedAt).toISOString(),
        netAmount: q.netAmount === null ? null : Number(q.netAmount),
        createdAt: new Date(q.createdAt).toISOString(),
      }))
    ).toEqual(
      seeded.latest.map((q) => ({
        id: q.id,
        name: q.name,
        vendorName: q.vendorName,
        submittedAt: q.submittedAt,
        netAmount: q.netAmount,
        createdAt: q.createdAt,
      }))
    );

    // 42.1・42.3: 見出し「受領見積書」のセクション
    const section = receivedQuotationSection(page);
    await expect(section).toBeVisible({ timeout: getTimeout(15000) });
    await expect(section.getByRole('heading', { name: '受領見積書', level: 3 })).toBeVisible();

    // 42.1・28.1: 見積依頼セクションの直後、見積書セクションの直前
    await expect(section.locator('xpath=preceding-sibling::*[1]')).toHaveAttribute(
      'data-testid',
      'estimate-request-section'
    );
    await expect(section.locator('xpath=following-sibling::*[1]')).toHaveAttribute(
      'data-testid',
      'estimate-section'
    );

    // 42.4: 見積依頼に紐づくものと紐づかないものの総数（論理削除したものを除く）
    await expect(section.getByText(`全${seeded.totalCount}件`, { exact: true })).toBeVisible();

    // 42.5・42.6: 直近の受領見積書を登録日時の新しい順にカードで表示し、名前・業者名・提出日・NET金額を出す
    const cards = section.locator('[data-testid^="received-quotation-card-"]');
    await expect(cards).toHaveCount(seeded.latest.length);
    for (const [index, quotation] of seeded.latest.entries()) {
      const card = cards.nth(index);
      await expect(card).toHaveAttribute('data-testid', `received-quotation-card-${quotation.id}`);
      await expect(card.getByRole('heading', { level: 4 })).toHaveText(quotation.name);
      await expect(card).toContainText(quotation.vendorName);
      await expect(card).toContainText(`提出日 ${quotation.submittedLabel}`);
      await expect(card).toContainText(`NET ${quotation.netLabel}`);
    }
    await expect(section.getByText(`${NAME_PREFIX}削除済みの見積`)).toHaveCount(0);

    // 42.14: 工程表セクションと同じ形（region・h3 の見出し・枠の体裁）
    const schedule = page.getByTestId('schedule-section');
    await expect(schedule).toBeVisible();
    await expect(schedule).toHaveAttribute('role', 'region');
    const scheduleStyle = await schedule.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderTopLeftRadius,
        borderTop: s.borderTop,
        padding: s.paddingTop,
        marginBottom: s.marginBottom,
      };
    });
    await expect(section).toHaveCSS('background-color', scheduleStyle.backgroundColor);
    await expect(section).toHaveCSS('border-top-left-radius', scheduleStyle.borderRadius);
    await expect(section).toHaveCSS('border-top', scheduleStyle.borderTop);
    await expect(section).toHaveCSS('padding-top', scheduleStyle.padding);
    await expect(section).toHaveCSS('margin-bottom', scheduleStyle.marginBottom);
    await expect(schedule.getByRole('heading', { level: 3 })).toBeVisible();

    // 43.3: 総数が一覧の画面の件数と一致する（「すべて見る」で移った先の件数と行数）
    await section.getByRole('link', { name: 'すべて見る', exact: true }).click();
    await expectOnListPage(page, seeded.project.id);
    await expect(page.getByText(`全${seeded.totalCount}件`, { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid^="project-quotation-row-"]')).toHaveCount(
      seeded.totalCount
    );
  });

  /**
   * @requirement project-management/REQ-42.7
   * @requirement project-management/REQ-42.8
   * @requirement project-management/REQ-42.9
   * @requirement project-management/REQ-42.10
   * @requirement project-management/REQ-42.11
   */
  test('カードと「すべて見る」は一覧の画面へ移り、「新規登録」は一覧の画面で見積依頼の無い受領見積書の登録フォームを開く', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const seeded = await seedProjectWithQuotations(owner, 'navigation');
    const projectId = seeded.project.id;

    await loginAsUser(page, owner);

    // 42.7: カードのクリックで一覧の画面へ（登録フォームは開かない）
    await openProjectDetail(page, projectId);
    const section = receivedQuotationSection(page);
    const newestCard = section.getByTestId(`received-quotation-card-${seeded.latest[0]!.id}`);
    await expect(newestCard).toBeVisible({ timeout: getTimeout(15000) });
    await newestCard.click();
    await expectOnListPage(page, projectId);
    await expect(page.locator('[data-testid^="project-quotation-row-"]')).toHaveCount(
      seeded.totalCount
    );
    await expect(registerFormHeading(page)).toHaveCount(0);

    // 42.8・42.9: 受領見積書があるので「すべて見る」があり、一覧の画面へ移る（登録フォームは開かない）
    await openProjectDetail(page, projectId);
    const viewAll = section.getByRole('link', { name: 'すべて見る', exact: true });
    await expect(viewAll).toBeVisible({ timeout: getTimeout(15000) });
    await viewAll.click();
    await expectOnListPage(page, projectId);
    await expect(page.locator('[data-testid^="project-quotation-row-"]')).toHaveCount(
      seeded.totalCount
    );
    await expect(registerFormHeading(page)).toHaveCount(0);

    // 42.10・42.11: 登録の権限があるので「新規登録」があり、一覧の画面で登録フォームが開く
    await openProjectDetail(page, projectId);
    await expect(registerLink(page)).toBeVisible({ timeout: getTimeout(15000) });
    await registerLink(page).click();
    await expectOnListPage(page, projectId);
    await expect(registerFormHeading(page)).toBeVisible({ timeout: getTimeout(15000) });
    // 見積依頼の無い受領見積書の登録（案件の文脈の業者名の入力欄）
    await expect(page.getByRole('combobox', { name: '業者名' })).toBeVisible();
  });

  /**
   * @requirement project-management/REQ-42.12
   * @requirement project-management/REQ-42.8
   * @requirement project-management/REQ-42.11
   * @requirement project-management/REQ-43.3
   */
  test('受領見積書が無いと「受領見積書はまだありません」と「新規登録」を出し、「すべて見る」は出さず、新規登録で登録フォームが開く', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const project = await createProject(owner, 'empty');

    await loginAsUser(page, owner);
    const body = await openProjectDetail(page, project.id);
    expect(body.sections.receivedQuotations).toEqual({
      totalCount: 0,
      latestReceivedQuotations: [],
    });

    const section = receivedQuotationSection(page);
    await expect(section).toBeVisible({ timeout: getTimeout(15000) });
    await expect(section.getByText('全0件', { exact: true })).toBeVisible();
    await expect(section.getByText('受領見積書はまだありません', { exact: true })).toBeVisible();
    await expect(section.getByRole('link', { name: 'すべて見る' })).toHaveCount(0);
    await expect(section.locator('[data-testid^="received-quotation-card-"]')).toHaveCount(0);

    await expect(registerLink(page)).toBeVisible();
    await registerLink(page).click();
    await expectOnListPage(page, project.id);
    await expect(page.getByTestId('project-quotation-empty')).toHaveText(
      '受領見積書はまだありません'
    );
    await expect(registerFormHeading(page)).toBeVisible({ timeout: getTimeout(15000) });
  });

  /**
   * @requirement project-management/REQ-42.10
   * @requirement project-management/REQ-42.12
   */
  test('登録の権限の無い利用者には、受領見積書があってもなくても「新規登録」を出さない', async ({
    page,
  }) => {
    const readOnly = await createLimitedUser('read-only', [
      ['project', 'read'],
      ['estimate_request', 'read'],
    ]);
    const seeded = await seedProjectWithQuotations(readOnly, 'read-only');
    const emptyProject = await createProject(readOnly, 'read-only-empty');

    await loginAsUser(page, readOnly);

    // 受領見積書のある案件: セクション・件数・「すべて見る」は出て、「新規登録」は出ない
    await openProjectDetail(page, seeded.project.id);
    const section = receivedQuotationSection(page);
    await expect(section).toBeVisible({ timeout: getTimeout(15000) });
    await expect(section.getByText(`全${seeded.totalCount}件`, { exact: true })).toBeVisible();
    await expect(section.getByRole('link', { name: 'すべて見る', exact: true })).toBeVisible();
    await expect(registerLink(page)).toHaveCount(0);
    await expect(section.getByRole('link', { name: /新規登録/ })).toHaveCount(0);

    // 空の案件: 空の表示は出て、「新規登録」は出ない
    await openProjectDetail(page, emptyProject.id);
    await expect(section.getByText('受領見積書はまだありません', { exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(registerLink(page)).toHaveCount(0);
    await expect(section.getByRole('link', { name: /新規登録/ })).toHaveCount(0);
  });

  /**
   * @requirement project-management/REQ-42.2
   * @requirement project-management/REQ-43.4
   * @requirement project-management/REQ-28.1
   */
  test('見積依頼の閲覧権限の無い利用者には受領見積書セクションも件数も出さず、応答にも含めず、見積書セクションは見積依頼セクションの直後に出る', async ({
    page,
  }) => {
    const noRead = await createLimitedUser('no-read', [['project', 'read']]);
    const seeded = await seedProjectWithQuotations(noRead, 'no-read');

    await loginAsUser(page, noRead);
    const body = await openProjectDetail(page, seeded.project.id);

    // 43.4: 応答に受領見積書の鍵が無い（他のセクションは返っている）
    expect(Object.keys(body.sections)).toContain('estimateRequests');
    expect(Object.keys(body.sections)).toContain('estimates');
    expect(Object.keys(body.sections)).not.toContain('receivedQuotations');
    expect(JSON.stringify(body)).not.toContain(seeded.latest[0]!.id);

    // 42.2: セクションも件数も出ない（隣の見積依頼・見積書セクションは出ている）
    const estimateSection = page.getByTestId('estimate-section');
    await expect(estimateSection).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByTestId('received-quotation-section')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '受領見積書', exact: true })).toHaveCount(0);
    await expect(page.getByText(`${NAME_PREFIX}見積依頼に紐づく見積`)).toHaveCount(0);

    // 28.1: 見積書セクションは見積依頼セクションの直後
    await expect(estimateSection.locator('xpath=preceding-sibling::*[1]')).toHaveAttribute(
      'data-testid',
      'estimate-request-section'
    );
  });

  /**
   * @requirement project-management/REQ-42.13
   *
   * 検証方針（タスク82 の申し送り。project-execution-budget-section-e2e.spec.ts の REQ-40.8 と同じ）:
   * - 詳細画面はロード中にページ全体のスピナーを出すため、セクションの骨組みの分岐は実行時に描かれない。
   *   骨組みそのもの（isLoading=true のとき）は単体（ReceivedQuotationSectionCard.test.tsx）が保証する。
   * - E2E では detail-summary の応答を遅らせ、ロード中は「読み込み中...」が出ること、ロードの完了の後に
   *   受領見積書セクションが件数つきで描かれ、骨組みが DOM に残らないことを確かめる。
   */
  test('detail-summary の応答を遅らせるとロード中の表示が出て、完了の後に骨組みを残さずセクションが描かれる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const seeded = await seedProjectWithQuotations(owner, 'loading');

    await loginAsUser(page, owner);

    await page.route(
      new RegExp(`/api/projects/${seeded.project.id}/detail-summary`),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      }
    );

    await page.goto(`/projects/${seeded.project.id}`);

    // ロード中はページのロード中の表示が出る
    await expect(page.getByText('読み込み中...')).toBeVisible({ timeout: getTimeout(5000) });

    // 完了の後: セクションが件数とカードつきで描かれ、骨組みが残らない
    const section = receivedQuotationSection(page);
    await expect(section).toBeVisible({ timeout: getTimeout(15000) });
    await expect(section.getByText(`全${seeded.totalCount}件`, { exact: true })).toBeVisible();
    await expect(section).toHaveAttribute('aria-busy', 'false');
    await expect(section.locator('[data-testid^="received-quotation-card-"]')).toHaveCount(
      seeded.latest.length
    );
    await expect(page.getByTestId('received-quotation-section-skeleton')).toHaveCount(0);
  });
});
