/**
 * @fileoverview 見積依頼・受領見積書・ステータスへの案件の閲覧範囲の適用の E2E テスト
 *
 * estimate-request タスク103.1。design.md の「Requirement 42: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。受領見積書のファイルの署名付きURLは範囲内に限る。
 *
 * 被覆する受入基準（estimate-request の Requirement 42.1〜42.7）は各テストの `@requirement` の印が名乗る。
 *
 * 検証に使う案件・内訳書・見積依頼・受領見積書・取引先はテストの中で DB に作り（名前の接頭辞
 * `NAME_PREFIX`）、利用者はテストの中で作る一意のメールアドレスの利用者とする。後始末で案件と取引先を
 * 先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  SESSION_USER_EMAIL_PREFIX,
  createCustomUser,
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { TEST_USERS } from '../../helpers/test-users';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件・取引先の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-er-scope-';

/** テストの中で作るロールの名前の接頭辞（後始末で消す） */
const ROLE_NAME_PREFIX = 'e2e-er-scope-role-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000103101';

interface Fixture {
  projectId: string;
  itemizedStatementId: string;
  estimateRequestId: string;
  estimateRequestName: string;
  quotationId: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 協力業者の取引先を DB に作る */
async function createTradingPartner(): Promise<string> {
  const partner = await getPrismaClient().tradingPartner.create({
    data: {
      name: `${NAME_PREFIX}partner-${uniqueSuffix()}`,
      nameKana: 'イーツーイーキョウリョクギョウシャ',
      address: '東京都千代田区1-1-1',
      email: 'e2e-er-scope-partner@example.com',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true },
  });
  return partner.id;
}

/** 内訳書の全項目を選んだ見積依頼を DB に作る */
async function createEstimateRequest(
  projectId: string,
  itemizedStatementId: string,
  tradingPartnerId: string,
  name: string
): Promise<string> {
  const prisma = getPrismaClient();
  const items = await prisma.itemizedStatementItem.findMany({
    where: { itemizedStatementId },
    select: { id: true },
  });
  const created = await prisma.estimateRequest.create({
    data: {
      projectId,
      tradingPartnerId,
      itemizedStatementId,
      name,
      selectedItems: {
        create: items.map((item) => ({ itemizedStatementItemId: item.id, selected: true })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/** 案件・内訳書・見積依頼・受領見積書（ファイルあり）を DB に作る */
async function createFixture(
  label: string,
  people: { salesPersonId: string; createdById: string },
  tradingPartnerId: string
): Promise<Fixture> {
  const prisma = getPrismaClient();
  const suffix = uniqueSuffix();
  const project = await prisma.project.create({
    data: { name: `${NAME_PREFIX}${label}-${suffix}`, ...people },
    select: { id: true },
  });
  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId: project.id,
      name: `閲覧範囲検証の内訳書 ${label}`,
      sourceQuantityTableId: `${NAME_PREFIX}${label}-qt`,
      sourceQuantityTableName: `${label} の数量表`,
      items: {
        create: [
          { workType: '工種1', name: '名称1', unit: '式', quantity: 1, displayOrder: 1 },
          { workType: '工種2', name: '名称2', unit: 'm', quantity: 2, displayOrder: 2 },
        ],
      },
    },
    select: { id: true },
  });
  const estimateRequestName = `閲覧範囲検証の見積依頼 ${label}-${suffix}`;
  const estimateRequestId = await createEstimateRequest(
    project.id,
    statement.id,
    tradingPartnerId,
    estimateRequestName
  );
  const quotation = await prisma.receivedQuotation.create({
    data: {
      estimateRequestId,
      name: `閲覧範囲検証の受領見積書 ${label}`,
      submittedAt: new Date('2026-10-01'),
      filePath: `quotations/${estimateRequestId}/${label}.pdf`,
      fileName: `${label}.pdf`,
      fileMimeType: 'application/pdf',
      fileSize: 1024,
    },
    select: { id: true },
  });
  return {
    projectId: project.id,
    itemizedStatementId: statement.id,
    estimateRequestId,
    estimateRequestName,
    quotationId: quotation.id,
  };
}

/** 対象の案件の見積依頼まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  const prisma = getPrismaClient();
  return {
    requests: await prisma.estimateRequest.findMany({
      where: { projectId },
      select: { id: true, name: true, status: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    items: await prisma.estimateRequestItem.findMany({
      where: { estimateRequest: { projectId } },
      select: { id: true, selected: true },
      orderBy: { id: 'asc' },
    }),
    quotations: await prisma.receivedQuotation.findMany({
      where: { estimateRequest: { projectId } },
      select: { id: true, name: true, filePath: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
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

/** 見積依頼の閲覧と全案件閲覧の権限を持つ利用者（ロール名は admin ではない） */
async function createReadAllUser(): Promise<CreatedUser> {
  const prisma = getPrismaClient();
  const role = await prisma.role.create({
    data: {
      name: `${ROLE_NAME_PREFIX}read-all-${uniqueSuffix()}`,
      description: 'E2E 見積依頼の閲覧範囲の検証（全案件閲覧）',
      priority: 0,
      isSystem: false,
    },
    select: { id: true, name: true },
  });
  for (const [resource, action] of [
    ['estimate_request', 'read'],
    ['project', 'read'],
    ['project', 'read_all'],
  ] as const) {
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: await permissionId(resource, action) },
    });
  }
  return createCustomUser({
    email: `${SESSION_USER_EMAIL_PREFIX}er-scope-read-all-${uniqueSuffix()}@example.com`,
    password: TEST_USERS.REGULAR_USER.password,
    displayName: '見積依頼の閲覧範囲検証 read-all',
    roles: [role.name],
  });
}

/** 利用者として API にログインし、Bearer のヘッダーを返す */
async function bearerFor(
  request: APIRequestContext,
  user: CreatedUser
): Promise<Record<string, string>> {
  const { accessToken } = await loginViaApi(request, user);
  expect(accessToken, `${user.email} のアクセストークン`).toBeTruthy();
  return { Authorization: `Bearer ${accessToken}` };
}

function withoutInstance(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'instance'));
}

/** 見積依頼の詳細の URL を直接開き、見積依頼の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openEstimateRequestDetail(page: Page, estimateRequestId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/estimate-requests/${estimateRequestId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/estimate-requests/${estimateRequestId}`);
  return (await loaded).status();
}

test.describe('見積依頼・受領見積書・ステータスの案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 見積依頼・項目・受領見積書・内訳書は案件の削除に連なって消える
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
    await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_NAME_PREFIX } } });
  });

  /**
   * @requirement estimate-request/REQ-42.1
   * @requirement estimate-request/REQ-42.2
   * @requirement estimate-request/REQ-42.3
   * @requirement estimate-request/REQ-42.7
   */
  test('担当外の利用者が見積依頼の URL を直接開くと存在しない見積依頼と同じ表示になり、受領見積書の署名付きURLも返らない', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const readAll = await createReadAllUser();
    const partnerId = await createTradingPartner();
    const target = await createFixture(
      'direct-url',
      { salesPersonId: owner.id, createdById: owner.id },
      partnerId
    );

    // 対照: 関係者（営業担当者・作成者）は詳細を開け、見積依頼名が表示される
    await loginAsUser(page, owner);
    expect(await openEstimateRequestDetail(page, target.estimateRequestId)).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: target.estimateRequestName })
    ).toBeVisible({ timeout: getTimeout(15000) });

    // 関係者と全案件閲覧の権限の利用者には、受領見積書のファイルの署名付きURLが発行される
    for (const [label, headers] of [
      ['関係者', await bearerFor(request, owner)],
      ['全案件閲覧', await bearerFor(request, readAll)],
    ] as const) {
      const preview = await request.get(
        `${API_BASE_URL}/api/quotations/${target.quotationId}/preview`,
        { headers }
      );
      expect(preview.status(), `${label} のプレビュー`).toBe(200);
      expect(
        ((await preview.json()) as { url?: string }).url,
        `${label} の署名付きURL`
      ).toBeTruthy();
    }

    // 本体: 担当外の利用者は、存在しない見積依頼を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    expect(await openEstimateRequestDetail(page, MISSING_ID)).toBe(404);
    const missingAlert = page.getByRole('alert');
    await expect(missingAlert).toBeVisible({ timeout: getTimeout(15000) });
    const missingText = await missingAlert.innerText();

    expect(await openEstimateRequestDetail(page, target.estimateRequestId)).toBe(404);
    const outOfScopeAlert = page.getByRole('alert');
    await expect(outOfScopeAlert).toBeVisible({ timeout: getTimeout(15000) });
    expect(await outOfScopeAlert.innerText(), '存在しない見積依頼と同じ表示').toBe(missingText);
    await expect(page.getByText(target.estimateRequestName)).toHaveCount(0);

    // API: 見積依頼・項目・見積依頼文・履歴・受領見積書・プレビューは存在しない ID と同じ 404 の本文で、
    // 署名付きURL もプロジェクトID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [
        `/api/estimate-requests/${target.estimateRequestId}`,
        `/api/estimate-requests/${MISSING_ID}`,
      ],
      [
        `/api/estimate-requests/${target.estimateRequestId}/items-with-status`,
        `/api/estimate-requests/${MISSING_ID}/items-with-status`,
      ],
      [
        `/api/estimate-requests/${target.estimateRequestId}/text`,
        `/api/estimate-requests/${MISSING_ID}/text`,
      ],
      [
        `/api/estimate-requests/${target.estimateRequestId}/status-history`,
        `/api/estimate-requests/${MISSING_ID}/status-history`,
      ],
      [
        `/api/estimate-requests/${target.estimateRequestId}/quotations`,
        `/api/estimate-requests/${MISSING_ID}/quotations`,
      ],
      [`/api/quotations/${target.quotationId}`, `/api/quotations/${MISSING_ID}`],
      [`/api/quotations/${target.quotationId}/preview`, `/api/quotations/${MISSING_ID}/preview`],
    ] as const) {
      const missing = await request.get(`${API_BASE_URL}${missingPath}`, { headers });
      const outOfScope = await request.get(`${API_BASE_URL}${outOfScopePath}`, { headers });
      expect(missing.status(), missingPath).toBe(404);
      expect(outOfScope.status(), outOfScopePath).toBe(404);
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(body.code, outOfScopePath).toBe('NOT_FOUND');
      expect(withoutInstance(body), outOfScopePath).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(withoutInstance(body)), outOfScopePath).not.toContain(target.projectId);
      expect(body.url, outOfScopePath).toBeUndefined();
    }
  });

  /**
   * @requirement estimate-request/REQ-42.2
   * @requirement estimate-request/REQ-42.3
   * @requirement estimate-request/REQ-42.5
   */
  test('担当外の利用者の見積依頼の作成・更新・項目の選択の保存・ステータスの変更・削除と受領見積書の登録・削除は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は見積依頼の閲覧・作成・編集・削除の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const partnerId = await createTradingPartner();
    const target = await createFixture(
      'write',
      { salesPersonId: owner.id, createdById: owner.id },
      partnerId
    );
    const prisma = getPrismaClient();
    const estimateRequest = await prisma.estimateRequest.findUniqueOrThrow({
      where: { id: target.estimateRequestId },
      select: { updatedAt: true },
    });
    const quotation = await prisma.receivedQuotation.findUniqueOrThrow({
      where: { id: target.quotationId },
      select: { updatedAt: true },
    });
    const requestItems = await prisma.estimateRequestItem.findMany({
      where: { estimateRequestId: target.estimateRequestId },
      select: { id: true },
    });
    const before = await snapshot(target.projectId);
    const headers = await bearerFor(request, outsider);

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/estimate-requests`, {
        headers,
        data: { name: 'intrusion', tradingPartnerId: partnerId },
      }),
      await request.put(`${API_BASE_URL}/api/estimate-requests/${target.estimateRequestId}`, {
        headers,
        data: { name: 'intrusion', expectedUpdatedAt: estimateRequest.updatedAt.toISOString() },
      }),
      // 項目の選択の保存（一括）は要求全体が 404 になり、どの項目も変わらない
      await request.patch(
        `${API_BASE_URL}/api/estimate-requests/${target.estimateRequestId}/items`,
        {
          headers,
          data: { items: requestItems.map((item) => ({ itemId: item.id, selected: false })) },
        }
      ),
      await request.patch(
        `${API_BASE_URL}/api/estimate-requests/${target.estimateRequestId}/status`,
        { headers, data: { status: 'REQUESTED' } }
      ),
      await request.post(
        `${API_BASE_URL}/api/estimate-requests/${target.estimateRequestId}/quotations`,
        {
          headers,
          multipart: {
            name: 'intrusion',
            submittedAt: '2026-10-27T00:00:00.000Z',
            lineItems: JSON.stringify([{ name: '項目', sortOrder: 0, quantity: 1, unitPrice: 1 }]),
          },
        }
      ),
      await request.delete(`${API_BASE_URL}/api/quotations/${target.quotationId}`, {
        headers,
        data: { updatedAt: quotation.updatedAt.toISOString() },
      }),
      await request.delete(`${API_BASE_URL}/api/estimate-requests/${target.estimateRequestId}`, {
        headers,
        data: { updatedAt: estimateRequest.updatedAt.toISOString() },
      }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      expect(JSON.stringify(withoutInstance(body)), response.url()).not.toContain(target.projectId);
    }

    expect(await snapshot(target.projectId)).toEqual(before);
  });

  /**
   * @requirement estimate-request/REQ-42.4
   */
  test('見積依頼の作成の要求が範囲外の案件の内訳書を指すと、存在しない内訳書と同じ 404 になり、見積依頼は作成されない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const partnerId = await createTradingPartner();
    const target = await createFixture(
      'create-own',
      { salesPersonId: owner.id, createdById: owner.id },
      partnerId
    );
    const foreign = await createFixture(
      'create-foreign',
      { salesPersonId: other.id, createdById: other.id },
      partnerId
    );
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const create = (itemizedStatementId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/estimate-requests`, {
        headers,
        data: { name: 'cross-project', tradingPartnerId: partnerId, itemizedStatementId },
      });

    const missing = await create(MISSING_ID);
    const crossed = await create(foreign.itemizedStatementId);
    expect(missing.status()).toBe(404);
    expect(crossed.status()).toBe(404);
    const body = (await crossed.json()) as Record<string, unknown>;
    expect(body.code).toBe('NOT_FOUND');
    expect(withoutInstance(body)).toEqual(
      withoutInstance((await missing.json()) as Record<string, unknown>)
    );
    expect(JSON.stringify(withoutInstance(body))).not.toContain(foreign.projectId);
    expect(JSON.stringify(withoutInstance(body))).not.toContain(foreign.itemizedStatementId);

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 作成の要求が指す内訳書が経路のプロジェクトに属さなければ、範囲の内外にかかわらず内訳書の不在と
   * 同じ 404 で拒否し、内訳書の案件が範囲外のときだけ記録する（estimate-request タスク104.1）。
   *
   * @requirement estimate-request/REQ-42.10
   */
  test('見積依頼の作成の要求が範囲内の他のプロジェクトの内訳書を指すと、存在しない内訳書と同じ 404 になり、見積依頼は作成されず範囲外のときだけ記録される', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const partnerId = await createTradingPartner();
    const target = await createFixture(
      'belong-own',
      { salesPersonId: owner.id, createdById: owner.id },
      partnerId
    );
    const sibling = await createFixture(
      'belong-sibling',
      { salesPersonId: owner.id, createdById: owner.id },
      partnerId
    );
    const foreign = await createFixture(
      'belong-foreign',
      { salesPersonId: other.id, createdById: other.id },
      partnerId
    );
    const beforeTarget = await snapshot(target.projectId);
    const beforeSibling = await snapshot(sibling.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const create = (itemizedStatementId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/estimate-requests`, {
        headers,
        data: { name: 'cross-project', tradingPartnerId: partnerId, itemizedStatementId },
      });

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      getPrismaClient().auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });

    // 不在の内訳書: 404 で記録しない
    const missingBefore = await deniedCount();
    const missing = await create(MISSING_ID);
    expect(missing.status()).toBe(404);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect((await deniedCount()) - missingBefore, '不在の内訳書は記録しない').toBe(0);

    // 範囲内の他のプロジェクトの内訳書: 不在と同じ 404 で、見積依頼を作らず記録しない
    const siblingBefore = await deniedCount();
    const crossed = await create(sibling.itemizedStatementId);
    expect(crossed.status()).toBe(404);
    const crossedBody = withoutInstance((await crossed.json()) as Record<string, unknown>);
    expect(crossedBody.code).toBe('NOT_FOUND');
    expect(crossedBody, '内訳書の不在と同じ本文').toEqual(missingBody);
    expect(JSON.stringify(crossedBody)).not.toContain(sibling.projectId);
    expect(JSON.stringify(crossedBody)).not.toContain(sibling.itemizedStatementId);
    expect((await deniedCount()) - siblingBefore, '範囲内の食い違いは記録しない').toBe(0);
    expect(await snapshot(target.projectId), '見積依頼は作成されない').toEqual(beforeTarget);

    // 範囲外のプロジェクトの内訳書: 不在と同じ 404 で、内訳書の案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const outOfScope = await create(foreign.itemizedStatementId);
    expect(outOfScope.status()).toBe(404);
    expect(
      withoutInstance((await outOfScope.json()) as Record<string, unknown>),
      '内訳書の不在と同じ本文'
    ).toEqual(missingBody);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect(
      (await deniedCount(foreign.projectId)) - foreignBefore,
      '記録の対象は内訳書の実際の案件'
    ).toBe(1);

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(sibling.projectId)).toEqual(beforeSibling);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * @requirement estimate-request/REQ-42.1
   * @requirement estimate-request/REQ-42.6
   */
  test('一覧と他の見積依頼での選択状態には範囲内の見積依頼だけが載り、担当外の利用者には一覧が返らず一覧の画面に行が出ない', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const partnerId = await createTradingPartner();
    const target = await createFixture(
      'list-own',
      { salesPersonId: owner.id, createdById: owner.id },
      partnerId
    );
    const foreign = await createFixture(
      'list-foreign',
      { salesPersonId: other.id, createdById: other.id },
      partnerId
    );
    const siblingName = `閲覧範囲検証の同じ案件の見積依頼 ${uniqueSuffix()}`;
    const siblingId = await createEstimateRequest(
      target.projectId,
      target.itemizedStatementId,
      partnerId,
      siblingName
    );
    // 別の案件の見積依頼が同じ内訳書の項目を選んでいる（範囲外の見積依頼の名前を漏らさないこと）
    const foreignName = `閲覧範囲検証の別の案件の見積依頼 ${uniqueSuffix()}`;
    await createEstimateRequest(
      foreign.projectId,
      target.itemizedStatementId,
      partnerId,
      foreignName
    );

    const ownerHeaders = await bearerFor(request, owner);
    const list = await request.get(
      `${API_BASE_URL}/api/projects/${target.projectId}/estimate-requests`,
      { headers: ownerHeaders }
    );
    expect(list.status()).toBe(200);
    const listed = ((await list.json()) as { data: Array<{ id: string }> }).data.map((r) => r.id);
    expect(listed.sort()).toEqual([target.estimateRequestId, siblingId].sort());

    const items = await request.get(
      `${API_BASE_URL}/api/estimate-requests/${target.estimateRequestId}/items-with-status`,
      { headers: ownerHeaders }
    );
    expect(items.status()).toBe(200);
    const itemsBody = (await items.json()) as Array<{
      otherRequests: Array<{ estimateRequestId: string; estimateRequestName: string }>;
    }>;
    expect(itemsBody).toHaveLength(2);
    for (const item of itemsBody) {
      expect(item.otherRequests.map((r) => r.estimateRequestName)).toEqual([siblingName]);
    }
    expect(JSON.stringify(itemsBody)).not.toContain(foreignName);

    // 担当外の利用者: 一覧・直近の見積依頼は存在しない案件と同じ 404
    const outsiderHeaders = await bearerFor(request, other);
    for (const [outOfScopePath, missingPath] of [
      [
        `/api/projects/${target.projectId}/estimate-requests`,
        `/api/projects/${MISSING_ID}/estimate-requests`,
      ],
      [
        `/api/projects/${target.projectId}/estimate-requests/latest`,
        `/api/projects/${MISSING_ID}/estimate-requests/latest`,
      ],
    ] as const) {
      const missing = await request.get(`${API_BASE_URL}${missingPath}`, {
        headers: outsiderHeaders,
      });
      const outOfScope = await request.get(`${API_BASE_URL}${outOfScopePath}`, {
        headers: outsiderHeaders,
      });
      expect(missing.status(), missingPath).toBe(404);
      expect(outOfScope.status(), outOfScopePath).toBe(404);
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(withoutInstance(body), outOfScopePath).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(withoutInstance(body)), outOfScopePath).not.toContain(target.projectId);
    }

    // 画面: 担当外の利用者が見積依頼一覧の URL を開いても見積依頼の行は出ない
    await loginAsUser(page, other);
    const listed404 = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/projects/${target.projectId}/estimate-requests`,
      { timeout: getTimeout(30000) }
    );
    await page.goto(`/projects/${target.projectId}/estimate-requests`);
    expect((await listed404).status()).toBe(404);
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText(target.estimateRequestName)).toHaveCount(0);
    await expect(page.getByText(siblingName)).toHaveCount(0);
  });
});
