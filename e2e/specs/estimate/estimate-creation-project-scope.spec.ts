/**
 * @fileoverview 見積書・見積明細・編集中の在席・プロジェクト単位の受領見積書の一覧の API への案件の閲覧範囲の
 * 適用の E2E テスト
 *
 * estimate-creation タスク62.1。design.md の「Requirement 57: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。見積書の作成の要求が指す内訳書が経路のプロジェクトに属さなければ
 * 内訳書の不在と同じ 404 にし、見積明細の一括保存に他の見積書の見積項目が混じれば要求全体を 422 で拒否する。
 *
 * 被覆する受入基準（estimate-creation の Requirement 57.1〜57.6）は各テストの `@requirement` の印が名乗る。
 * 出力の記録（57.7・57.8）はタスク62.2 の担当で、本ファイルは扱わない。
 *
 * 検証に使う案件・内訳書・見積書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
 * 作る一意のメールアドレスの利用者とする。後始末で案件を先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import {
  createSessionUser,
  deleteSessionUsers,
  type CreatedUser,
} from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { loginViaApi } from '../../helpers/auth-api';
import { API_BASE_URL } from '../../config';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-ec-scope-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000062101';

interface Fixture {
  projectId: string;
  itemizedStatementId: string;
  estimateId: string;
  estimateItemId: string;
  estimateName: string;
  itemName: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・内訳書・見積書（見積項目 1 件）を DB に作る */
async function createFixture(
  label: string,
  people: { salesPersonId: string; createdById: string }
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
      name: `閲覧範囲検証の内訳書 ${label}-${suffix}`,
      sourceQuantityTableId: `${NAME_PREFIX}${label}-${suffix}-qt`,
      sourceQuantityTableName: `${label} の数量表`,
      items: {
        create: [
          {
            workType: '工種',
            name: `閲覧範囲検証の内訳 ${label}-${suffix}`,
            unit: '式',
            quantity: 1,
            displayOrder: 1,
          },
        ],
      },
    },
    select: { id: true },
  });
  const estimateName = `閲覧範囲検証の見積書 ${label}-${suffix}`;
  const itemName = `閲覧範囲検証の見積項目 ${label}-${suffix}`;
  const estimate = await prisma.estimate.create({
    data: {
      projectId: project.id,
      name: estimateName,
      items: {
        create: [
          {
            displayOrder: 0,
            lines: { create: [{ lineType: 'ESTIMATE', name: itemName, quantity: 1 }] },
          },
        ],
      },
    },
    select: { id: true, items: { select: { id: true } } },
  });
  return {
    projectId: project.id,
    itemizedStatementId: statement.id,
    estimateId: estimate.id,
    estimateItemId: estimate.items[0]!.id,
    estimateName,
    itemName,
  };
}

/** 案件の見積書まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  const prisma = getPrismaClient();
  const estimateWhere = { estimate: { projectId } };
  return {
    estimates: await prisma.estimate.findMany({
      where: { projectId },
      select: { id: true, name: true, validityPeriod: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    lines: await prisma.estimateItemLine.findMany({
      where: { estimateItem: estimateWhere },
      select: { id: true, name: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    editSessions: await prisma.estimateEditSession.count({ where: estimateWhere }),
  };
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

/** 見積書詳細画面の URL を直接開き、見積書の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openEstimate(page: Page, estimateId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/estimates/${estimateId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/estimates/${estimateId}`);
  return (await loaded).status();
}

/** 見積明細の一括保存の見積項目ノード */
function node(id: string | null, tempId: string | null, name: string): Record<string, unknown> {
  return {
    id,
    tempId,
    itemType: 'STANDARD',
    lines: [
      {
        lineType: 'ESTIMATE',
        name,
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
        sourceVendorName: null,
      },
    ],
    children: [],
  };
}

test.describe('見積書・見積明細・在席・受領見積書の一覧の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // 内訳書・見積書・見積項目・在席は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement estimate-creation/REQ-57.1
   * @requirement estimate-creation/REQ-57.2
   * @requirement estimate-creation/REQ-57.3
   * @requirement estimate-creation/REQ-57.6
   */
  test('担当外の利用者が見積書の URL を直接開くと存在しない見積書と同じ表示になり、一覧・詳細・見積項目・受領見積書の一覧の API も存在しない ID と同じ 404 を返す', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は見積書と見積依頼の閲覧の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('direct-url', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 対照: 関係者（営業担当者・作成者）は見積書詳細画面を開け、見積書の名前が見出しに表示される
    await loginAsUser(page, owner);
    expect(await openEstimate(page, target.estimateId)).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: target.estimateName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 本体: 担当外の利用者は、存在しない見積書を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    expect(await openEstimate(page, MISSING_ID)).toBe(404);
    const missingAlert = page.getByRole('main').getByRole('alert');
    await expect(missingAlert).toBeVisible({ timeout: getTimeout(15000) });
    const missingText = await missingAlert.innerText();

    expect(await openEstimate(page, target.estimateId)).toBe(404);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toBeVisible({ timeout: getTimeout(15000) });
    expect(await alert.innerText(), '存在しない見積書と同じ表示').toBe(missingText);
    await expect(page.getByText(target.estimateName)).toHaveCount(0);

    // API: 一覧・直近・詳細・二重マウントの詳細・見積項目・受領見積書の一覧は、存在しない ID と同じ 404 の本文で、
    // 案件 ID も見積書 ID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [`/api/projects/${target.projectId}/estimates`, `/api/projects/${MISSING_ID}/estimates`],
      [
        `/api/projects/${target.projectId}/estimates/latest`,
        `/api/projects/${MISSING_ID}/estimates/latest`,
      ],
      [`/api/estimates/${target.estimateId}`, `/api/estimates/${MISSING_ID}`],
      [
        `/api/projects/${target.projectId}/estimates/${target.estimateId}`,
        `/api/projects/${target.projectId}/estimates/${MISSING_ID}`,
      ],
      [`/api/estimates/${target.estimateId}/items`, `/api/estimates/${MISSING_ID}/items`],
      [`/api/projects/${target.projectId}/quotations`, `/api/projects/${MISSING_ID}/quotations`],
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
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, outOfScopePath).not.toContain(target.projectId);
      expect(exposed, outOfScopePath).not.toContain(target.estimateId);
      expect(exposed, outOfScopePath).not.toContain(target.estimateName);
    }

    // 対照: 関係者の一覧には当該案件の見積書が載る（57.1・57.6）
    const ownerHeaders = await bearerFor(request, owner);
    const list = await request.get(`${API_BASE_URL}/api/projects/${target.projectId}/estimates`, {
      headers: ownerHeaders,
    });
    expect(list.status()).toBe(200);
    const listed = ((await list.json()) as { data: Array<{ id: string }> }).data.map((e) => e.id);
    expect(listed).toEqual([target.estimateId]);
  });

  /**
   * @requirement estimate-creation/REQ-57.2
   * @requirement estimate-creation/REQ-57.3
   */
  test('担当外の利用者の見積書の作成・更新・一括保存・削除・諸経費の計算・在席の通知と退出は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('write', { salesPersonId: owner.id, createdById: owner.id });
    const before = await snapshot(target.projectId);
    const estimate = await getPrismaClient().estimate.findUniqueOrThrow({
      where: { id: target.estimateId },
    });
    const expectedUpdatedAt = estimate.updatedAt.toISOString();
    const headers = await bearerFor(request, outsider);
    const base = `${API_BASE_URL}/api/estimates/${target.estimateId}`;

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/estimates`, {
        headers,
        data: { name: '侵入の試み', sourceItemizedStatementId: target.itemizedStatementId },
      }),
      await request.put(base, { headers, data: { name: '侵入の試み', expectedUpdatedAt } }),
      await request.put(`${base}/save`, {
        headers,
        data: {
          expectedUpdatedAt,
          reportFields: { submissionDate: null, validityPeriod: '侵入', separateWorks: [] },
          items: [node(target.estimateItemId, null, '侵入の試み')],
        },
      }),
      await request.post(`${base}/calculate-overhead`, {
        headers,
        data: {
          costType: 'GENERAL_ADMIN',
          directCost: '10000',
          constructionCost: '10000',
          isRenovation: false,
        },
      }),
      await request.put(`${base}/edit-session`, { headers }),
      await request.delete(`${base}/edit-session`, { headers }),
      await request.delete(base, { headers, data: { updatedAt: expectedUpdatedAt } }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, response.url()).not.toContain(target.projectId);
      expect(exposed, response.url()).not.toContain(target.estimateId);
    }

    expect(await snapshot(target.projectId)).toEqual(before);
  });

  /**
   * @requirement estimate-creation/REQ-57.4
   * @requirement estimate-creation/REQ-57.5
   */
  test('自分の案件の見積書の作成で他の案件の内訳書を指すと内訳書の不在と同じ 404 になり、一括保存に他の案件の見積項目が混じると全体が 422 で書き込まれない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('own', { salesPersonId: owner.id, createdById: owner.id });
    const foreign = await createFixture('foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);

    // 作成: 他の案件の内訳書は、存在しない内訳書と同じ 404 で、見積書は作られない（57.4）
    const create = (sourceItemizedStatementId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/estimates`, {
        headers,
        data: { name: '他の案件の内訳書からの作成の試み', sourceItemizedStatementId },
      });
    const missingStatement = await create(MISSING_ID);
    const foreignStatement = await create(foreign.itemizedStatementId);
    expect(missingStatement.status()).toBe(404);
    expect(foreignStatement.status()).toBe(404);
    const foreignStatementBody = (await foreignStatement.json()) as Record<string, unknown>;
    expect(foreignStatementBody.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
    expect(
      JSON.stringify(withoutInstance(foreignStatementBody))
        .split(foreign.itemizedStatementId)
        .join('<id>')
    ).toBe(
      JSON.stringify(withoutInstance((await missingStatement.json()) as Record<string, unknown>))
        .split(MISSING_ID)
        .join('<id>')
    );
    expect(JSON.stringify(foreignStatementBody)).not.toContain(foreign.projectId);

    // 一括保存: 自分の見積項目の書き換えと他の案件の見積項目が混じる要求は、存在しない ID と同じ 422（57.5）
    const estimate = await getPrismaClient().estimate.findUniqueOrThrow({
      where: { id: target.estimateId },
    });
    const save = (mixedId: string) =>
      request.put(`${API_BASE_URL}/api/estimates/${target.estimateId}/save`, {
        headers,
        data: {
          expectedUpdatedAt: estimate.updatedAt.toISOString(),
          reportFields: {
            submissionDate: null,
            validityPeriod: '書き換えの試み',
            separateWorks: [],
          },
          items: [
            node(target.estimateItemId, null, '書き換えの試み'),
            node(mixedId, null, '他の案件の見積項目の書き換えの試み'),
          ],
        },
      });
    const missingItem = await save(MISSING_ID);
    const foreignItem = await save(foreign.estimateItemId);
    expect(missingItem.status()).toBe(422);
    expect(foreignItem.status()).toBe(422);
    const foreignItemBody = (await foreignItem.json()) as Record<string, unknown>;
    expect(foreignItemBody.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
    expect(
      JSON.stringify(withoutInstance(foreignItemBody)).split(foreign.estimateItemId).join('<id>')
    ).toBe(
      JSON.stringify(withoutInstance((await missingItem.json()) as Record<string, unknown>))
        .split(MISSING_ID)
        .join('<id>')
    );

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });
});
