/**
 * @fileoverview 見積書・見積明細・編集中の在席・プロジェクト単位の受領見積書の一覧の API への案件の閲覧範囲の
 * 適用の E2E テスト
 *
 * estimate-creation タスク62.1。design.md の「Requirement 57: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。見積書の作成の要求が指す内訳書が経路のプロジェクトに属さなければ
 * 内訳書の不在と同じ 404 にし、見積明細の一括保存に他の見積書の見積項目が混じれば要求全体を 422 で拒否する。
 *
 * 被覆する受入基準（estimate-creation の Requirement 57.1〜57.6、57.9〔タスク63.1〕、57.10〔タスク65.1〕、
 * 57.11〔タスク66.1〕）は
 * 各テストの `@requirement` の印が名乗る。
 * 出力の記録（57.7・57.8）はタスク62.2 の担当で、本ファイルは扱わない。
 *
 * タスク64.1 で、画面が 404 を受けたときの表示（Requirement 58.1・58.2）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、取得の失敗・
 * 操作の失敗を告げる文言と再試行の釦を出さない。
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

/**
 * 読み込み中の表示が消えた後の、本文の領域の表示の文字列。
 * 見積書の画面は共通の枠の main の内側に自分の main を置くため、内側（文書の順で後ろ）を読む
 */
async function settledMainText(page: Page): Promise<string> {
  const main = page.getByRole('main').last();
  await expect(main.getByText('読み込み中...')).toHaveCount(0, { timeout: getTimeout(15000) });
  return main.innerText();
}

/** 画面の URL を直接開き、指定のパスの GET の応答を待つ（オリジンは問わずパスで照合する） */
async function openAndWait(page: Page, url: string, apiPath: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === apiPath,
    { timeout: getTimeout(30000) }
  );
  await page.goto(url);
  return (await loaded).status();
}

/** 見積書の画面が 404 を受けたときに出してはならない、障害を告げる文言（REQ-58.1・58.2） */
const FAILURE_TEXTS = [
  '見積書の取得に失敗しました',
  '見積書の削除に失敗しました',
  '見積書の作成に失敗しました',
  '諸経費の計算に失敗しました。再度お試しください。',
  '保存に失敗しました。再度お試しください。',
  'Not found',
] as const;

/** 障害を告げる文言と再試行の釦が画面のどこにも無いことを主張する */
async function expectNoFailureFeedback(page: Page): Promise<void> {
  for (const text of FAILURE_TEXTS) {
    await expect(page.getByText(text, { exact: true }), text).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
}

/** 不在の表示（ResourceNotFound）。いずれの画面も戻り先はプロジェクトの一覧 */
async function expectNotFoundView(page: Page, resourceType: '見積書' | 'プロジェクト') {
  const main = page.getByRole('main').last();
  await expect(main.getByRole('heading', { name: `${resourceType}が見つかりません` })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(main.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  await expectNoFailureFeedback(page);
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
    // タスク64.1: 表示は不在の表示（ResourceNotFound。role="alert" を持たない）になったため、
    // 見つからない旨の表示どうしを比べる
    expect(await openEstimate(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '見積書');
    const missingText = await settledMainText(page);

    expect(await openEstimate(page, target.estimateId)).toBe(404);
    await expectNotFoundView(page, '見積書');
    expect(await settledMainText(page), '存在しない見積書と同じ表示').toBe(missingText);
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

  /**
   * 応答は不在と同じ 404 のまま、見積書の実際の案件が範囲外なら範囲外の拒否として記録する
   * （estimate-creation タスク63.1。user-authentication の要件39.8 の本機能への適用）。
   * 不在の見積書と、範囲内の他の案件の見積書（経路の誤り）は記録しない。
   *
   * @requirement estimate-creation/REQ-57.9
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の案件の配下の経路で範囲外の案件の見積書を指すと 404 になり、見積書の案件を対象に監査の記録が 1 件増え、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('mismatch-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const sibling = await createFixture('mismatch-sibling', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('mismatch-foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeSibling = await snapshot(sibling.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const nested = `${API_BASE_URL}/api/projects/${target.projectId}/estimates`;

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      getPrismaClient().auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });

    // 不在の見積書: 404 で記録しない
    const missingBefore = await deniedCount();
    const missing = await request.get(`${nested}/${MISSING_ID}`, { headers });
    expect(missing.status()).toBe(404);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect((await deniedCount()) - missingBefore, '不在の見積書は記録しない').toBe(0);

    // 範囲内の他の案件の見積書（経路の誤り）: 不在と同じ 404 で記録しない
    const siblingBefore = await deniedCount();
    const misrouted = await request.get(`${nested}/${sibling.estimateId}`, { headers });
    expect(misrouted.status()).toBe(404);
    expect(withoutInstance((await misrouted.json()) as Record<string, unknown>)).toEqual(
      missingBody
    );
    expect((await deniedCount()) - siblingBefore, '範囲内の食い違いは記録しない').toBe(0);

    // 範囲外の案件の見積書を読む・一括保存する・諸経費を計算する・削除する:
    // 不在と同じ 404 で、要求ごとに見積書の案件を対象に 1 件記録する
    const foreignEstimate = await getPrismaClient().estimate.findUniqueOrThrow({
      where: { id: foreign.estimateId },
    });
    const expectedUpdatedAt = foreignEstimate.updatedAt.toISOString();
    const base = `${nested}/${foreign.estimateId}`;
    const calls = [
      { label: 'GET', send: () => request.get(base, { headers }) },
      {
        label: 'PUT save',
        send: () =>
          request.put(`${base}/save`, {
            headers,
            data: {
              expectedUpdatedAt,
              reportFields: { submissionDate: null, validityPeriod: '食い違い', separateWorks: [] },
              items: [node(foreign.estimateItemId, null, '食い違いの経路からの書き換えの試み')],
            },
          }),
      },
      {
        label: 'POST calculate-overhead',
        send: () =>
          request.post(`${base}/calculate-overhead`, {
            headers,
            data: {
              costType: 'GENERAL_ADMIN',
              directCost: '10000',
              constructionCost: '10000',
              isRenovation: false,
            },
          }),
      },
      {
        label: 'DELETE',
        send: () => request.delete(base, { headers, data: { updatedAt: expectedUpdatedAt } }),
      },
    ];
    for (const { label, send } of calls) {
      const allBefore = await deniedCount();
      const foreignBefore = await deniedCount(foreign.projectId);
      const outOfScope = await send();
      expect(outOfScope.status(), label).toBe(404);
      const body = withoutInstance((await outOfScope.json()) as Record<string, unknown>);
      expect(body, `${label}: 見積書の不在と同じ本文`).toEqual(missingBody);
      expect(JSON.stringify(body), label).not.toContain(foreign.projectId);
      expect(JSON.stringify(body), label).not.toContain(foreign.estimateId);
      expect((await deniedCount()) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(1);
      expect(
        (await deniedCount(foreign.projectId)) - foreignBefore,
        `${label}: 記録の対象は見積書の実際の案件`
      ).toBe(1);
    }

    expect(await snapshot(sibling.projectId)).toEqual(beforeSibling);
    expect(await snapshot(foreign.projectId), 'データは変わらない').toEqual(beforeForeign);
  });

  /**
   * 見積書の作成で、内訳書の所属の照合を論理削除の確かめより先に置く（estimate-creation タスク65.1。
   * design.md の「2026-10-30 の追加」章の「決定」の「内訳書の照合の順」）。範囲外の案件の論理削除済みの
   * 内訳書を指す作成は、存在しない内訳書と同じ 404 と本文のまま、内訳書の案件を対象に 1 件記録し、見積書を
   * 作らない。自分の案件の論理削除済みの内訳書は同じ 404 で記録しない（user-authentication の要件39.8 の
   * 改訂。対象のデータの論理削除は記録の要否を変えない）。
   *
   * @requirement estimate-creation/REQ-57.10
   * @requirement user-authentication/REQ-39.8
   */
  test('範囲外の案件の論理削除済みの内訳書を指す見積書の作成は、存在しない内訳書と同じ 404 になり、内訳書の案件を対象に監査の記録が 1 件増え、見積書は作られない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('own-is-deleted', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('foreign-is-deleted', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const prisma = getPrismaClient();
    await prisma.itemizedStatement.update({
      where: { id: foreign.itemizedStatementId },
      data: { deletedAt: new Date() },
    });
    const ownSuffix = uniqueSuffix();
    const ownDeleted = await prisma.itemizedStatement.create({
      data: {
        projectId: target.projectId,
        name: `閲覧範囲検証の論理削除済みの内訳書 ${ownSuffix}`,
        sourceQuantityTableId: `${NAME_PREFIX}own-deleted-${ownSuffix}-qt`,
        sourceQuantityTableName: '論理削除済みの内訳書の数量表',
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const estimateName = `論理削除済みの内訳書からの作成の試み ${uniqueSuffix()}`;

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });
    const create = (sourceItemizedStatementId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/estimates`, {
        headers,
        data: { name: estimateName, sourceItemizedStatementId },
      });
    /** 本文に写る要求の内訳書 ID を伏せて、存在しない内訳書の本文と比べる形にする */
    const masked = (body: Record<string, unknown>, statementId: string): string =>
      JSON.stringify(withoutInstance(body)).split(statementId).join('<id>');

    // 存在しない内訳書: 404 で記録しない
    const missingBefore = await deniedCount();
    const missing = await create(MISSING_ID);
    expect(missing.status(), '存在しない内訳書').toBe(404);
    const missingBody = (await missing.json()) as Record<string, unknown>;
    expect(missingBody.code).toBe('ITEMIZED_STATEMENT_NOT_FOUND');
    const missingMasked = masked(missingBody, MISSING_ID);
    expect((await deniedCount()) - missingBefore, '存在しない内訳書は記録しない').toBe(0);

    // 範囲外の案件の論理削除済みの内訳書: 不在と同じ 404 で、内訳書の案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const foreignStatement = await create(foreign.itemizedStatementId);
    expect(foreignStatement.status(), '範囲外の案件の論理削除済みの内訳書').toBe(404);
    const foreignBody = (await foreignStatement.json()) as Record<string, unknown>;
    expect(masked(foreignBody, foreign.itemizedStatementId), '存在しない内訳書と同じ本文').toBe(
      missingMasked
    );
    expect(JSON.stringify(withoutInstance(foreignBody))).not.toContain(foreign.projectId);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect((await deniedCount(foreign.projectId)) - foreignBefore, '記録の対象は内訳書の案件').toBe(
      1
    );

    // 自分の案件の論理削除済みの内訳書: 不在と同じ 404 で記録しない
    const ownBefore = await deniedCount();
    const ownStatement = await create(ownDeleted.id);
    expect(ownStatement.status(), '自分の案件の論理削除済みの内訳書').toBe(404);
    expect(
      masked((await ownStatement.json()) as Record<string, unknown>, ownDeleted.id),
      '自分の案件の論理削除済みの内訳書も不在と同じ本文'
    ).toBe(missingMasked);
    expect((await deniedCount()) - ownBefore, '自分の案件の論理削除済みの内訳書は記録しない').toBe(
      0
    );

    // 見積書は作られず、どちらの案件の見積書も変わらない
    expect(await prisma.estimate.count({ where: { name: estimateName } })).toBe(0);
    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 応答は 57.5 の 422 のまま、一括保存の本文の属さない見積項目の ID の実際の案件が範囲外なら、その案件を対象に
   * 範囲外の拒否として 1 件記録する（estimate-creation タスク66.1。user-authentication の要件39.8 の改訂〔作成・保存の
   * 要求が指す他のデータも同じ方針で判定する〕の本機能への適用。同 spec のタスク66.1 の申し送り）。
   * 存在しない ID は同じ 422 で記録しない。
   *
   * @requirement estimate-creation/REQ-57.11
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の見積書の一括保存の本文に範囲外の案件の見積項目の ID を混ぜると 422 になり、その案件を対象に監査の記録が 1 件増え、どちらの見積書も変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('body-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('body-foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const prisma = getPrismaClient();
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: target.estimateId } });
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
    /** 本文に写る要求の見積項目 ID を伏せて、存在しない ID の本文と比べる形にする */
    const masked = (body: Record<string, unknown>, itemId: string): string =>
      JSON.stringify(withoutInstance(body)).split(itemId).join('<id>');

    // 存在しない ID: 422 で記録しない
    const missingBefore = await deniedCount();
    const missing = await save(MISSING_ID);
    expect(missing.status(), '存在しない ID').toBe(422);
    const missingMasked = masked((await missing.json()) as Record<string, unknown>, MISSING_ID);
    expect((await deniedCount()) - missingBefore, '存在しない ID は記録しない').toBe(0);

    // 範囲外の案件の見積項目: 存在しない ID と同じ 422 の本文で、その案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const foreignItem = await save(foreign.estimateItemId);
    expect(foreignItem.status(), '範囲外の案件の見積項目').toBe(422);
    const foreignBody = (await foreignItem.json()) as Record<string, unknown>;
    expect(foreignBody.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
    expect(masked(foreignBody, foreign.estimateItemId), '存在しない ID と同じ本文').toBe(
      missingMasked
    );
    expect(JSON.stringify(withoutInstance(foreignBody))).not.toContain(foreign.projectId);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect(
      (await deniedCount(foreign.projectId)) - foreignBefore,
      '記録の対象は見積項目の実際の案件'
    ).toBe(1);

    // どちらの見積書も変わらない
    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 見積書の詳細の画面は見積書の読み込みの 404 で、一覧・新規作成の画面はプロジェクトの読み込みの 404 で、
   * 見つからない旨とプロジェクトの一覧へのリンクを表示する（estimate-creation タスク64.1）。範囲外と不在は同じ表示。
   *
   * @requirement estimate-creation/REQ-58.1
   */
  test('担当外の利用者が見積書の画面の URL を開くと見つからない旨とプロジェクトの一覧へのリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    await loginAsUser(page, outsider);

    // 詳細の画面: 見積書が見つからない旨と、プロジェクトの一覧へのリンク
    expect(await openEstimate(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '見積書');
    const missingDetailText = await settledMainText(page);
    expect(await openEstimate(page, target.estimateId)).toBe(404);
    await expectNotFoundView(page, '見積書');
    expect(await settledMainText(page), '存在しない見積書と同じ表示').toBe(missingDetailText);
    await expect(page.getByText(target.estimateName)).toHaveCount(0);

    // 一覧の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/estimates`,
        `/api/projects/${MISSING_ID}/estimates`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingListText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/estimates`,
        `/api/projects/${target.projectId}/estimates`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingListText);
    await expect(page.getByText(target.estimateName)).toHaveCount(0);

    // 新規作成の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク。入力欄を出さない
    // （従来は内訳書の一覧の読み込みの失敗を無視して入力欄を出していた）
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/estimates/new`,
        `/api/projects/${MISSING_ID}/itemized-statements`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingCreateText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/estimates/new`,
        `/api/projects/${target.projectId}/itemized-statements`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingCreateText);
    await expect(page.getByRole('button', { name: '作成', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('見積書名')).toHaveCount(0);
  });

  /**
   * 開いた後に案件が閲覧範囲外になる（作成ではプロジェクトが論理的に取り除かれる）と、操作の要求は 404 を受ける。
   * 画面は見つからない旨のメッセージを表示し、操作の失敗を告げる文言を出さず、失敗を無視しない
   * （estimate-creation タスク64.1）。範囲外と不在は同じ 404 で、画面も区別しない。諸経費の計算は見積書の
   * 論理削除を区別しない判定部品を通った後に見積書を読まずに計算するため、案件を範囲外にして 404 を起こす。
   * 削除も案件を範囲外にして 404 を起こす（タスク64.1 の時点では、画面の削除の要求は楽観的排他制御の基準時刻を
   * 本文でなくクエリで送っており、判定部品の後の本文の検証で 400 になるため、論理的に取り除かれた見積書では 404 に
   * 届かなかった。2026-10-30 の是正でサーバーが基準時刻をクエリで受け取るようになり、論理削除でも 404 を
   * 起こせるようになったが、手法は変えていない）。
   *
   * @requirement estimate-creation/REQ-58.2
   */
  test('開いた後に範囲外になった案件の見積書・取り除かれたプロジェクトへの操作で、見つからない旨のメッセージが表示される', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const people = { salesPersonId: owner.id, createdById: owner.id };
    const deleteTarget = await createFixture('gone-delete', people);
    const scopeTarget = await createFixture('gone-scope', people);
    const createTarget = await createFixture('gone-create', people);
    const prisma = getPrismaClient();
    const estimateGone = '見積書が見つかりません。すでに削除された可能性があります。';
    const projectGone = 'プロジェクトが見つかりません。すでに削除された可能性があります。';
    /** 指定の方法とパスの要求の応答を待つ（オリジンは問わずパスで照合する） */
    const responseOf = (method: string, pathname: string) =>
      page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname === pathname,
        { timeout: getTimeout(30000) }
      );
    await loginAsUser(page, owner);

    /** 開いた後に案件を閲覧範囲外にする（担当者・作成者を他の利用者へ替える） */
    const moveOutOfScope = (fixture: Fixture) =>
      prisma.project.update({
        where: { id: fixture.projectId },
        data: { salesPersonId: other.id, createdById: other.id },
      });

    // 削除（従来は画面全体を削除の失敗の文言と再試行の釦へ置き換えていた）。見積書を表示したまま
    expect(await openEstimate(page, deleteTarget.estimateId)).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: deleteTarget.estimateName })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText(estimateGone)).toHaveCount(0);
    await moveOutOfScope(deleteTarget);
    // 見出しの横の見積書の削除の釦（明細のツールバーの行の削除の釦より文書の順で前にある）
    await page
      .getByTestId('estimate-detail-page')
      .getByRole('button', { name: '削除', exact: true })
      .first()
      .click();
    const deleteDialog = page.getByRole('dialog', { name: '見積書の削除' });
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    const deleted = responseOf('DELETE', `/api/estimates/${deleteTarget.estimateId}`);
    await deleteDialog.getByRole('button', { name: '削除', exact: true }).click();
    expect((await deleted).status()).toBe(404);
    const operationError = page.getByTestId('estimate-operation-error');
    await expect(operationError.getByText(estimateGone, { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(operationError).toHaveAttribute('role', 'alert');
    await expect(deleteDialog).toBeHidden();
    await expect(
      page.getByRole('heading', { level: 1, name: deleteTarget.estimateName })
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/estimates/${deleteTarget.estimateId}$`));
    await expectNoFailureFeedback(page);
    expect(
      (
        await prisma.estimate.findUniqueOrThrow({
          where: { id: deleteTarget.estimateId },
          select: { deletedAt: true },
        })
      ).deletedAt,
      '見積書は取り除かれない'
    ).toBeNull();

    // 諸経費の計算（従来は失敗を捕まえず何も表示しなかった）。開いた後に案件を閲覧範囲外にする
    expect(await openEstimate(page, scopeTarget.estimateId)).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: scopeTarget.estimateName })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await moveOutOfScope(scopeTarget);
    await page.getByRole('button', { name: '諸経費を計算して追加' }).click();
    const overheadDialog = page.getByTestId('overhead-cost-dialog');
    await expect(overheadDialog).toBeVisible({ timeout: getTimeout(10000) });
    await overheadDialog.getByLabel('直接工事費').fill('100000');
    await overheadDialog.getByLabel('工期').fill('12');
    const calculated = responseOf(
      'POST',
      `/api/estimates/${scopeTarget.estimateId}/calculate-overhead`
    );
    await overheadDialog.getByRole('button', { name: '計算', exact: true }).click();
    expect((await calculated).status()).toBe(404);
    await expect(overheadDialog.getByRole('alert')).toHaveText(estimateGone, {
      timeout: getTimeout(10000),
    });
    await expect(overheadDialog.getByTestId('calculated-amount')).toHaveCount(0);
    await expectNoFailureFeedback(page);
    await overheadDialog.getByRole('button', { name: '閉じる' }).click();
    await expect(overheadDialog).toBeHidden({ timeout: getTimeout(10000) });

    // 受領見積書の転記のダイアログ（従来は読み込みの失敗を無視し、受領見積書が無い場合と同じ表示だった）
    const quotationsLoaded = responseOf('GET', `/api/projects/${scopeTarget.projectId}/quotations`);
    await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
    expect((await quotationsLoaded).status()).toBe(404);
    const transferDialog = page.getByRole('dialog', { name: '受領見積書から転記' });
    await expect(transferDialog.getByRole('alert')).toHaveText(projectGone, {
      timeout: getTimeout(10000),
    });
    // 受領見積書の選択と転記先の選択に代えて表示する
    await expect(transferDialog.getByRole('combobox')).toHaveCount(0);
    await transferDialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(transferDialog).toBeHidden({ timeout: getTimeout(10000) });

    // 作成（従来は作成の失敗の汎用の文言）。開いた後にプロジェクトを論理的に取り除く
    expect(
      await openAndWait(
        page,
        `/projects/${createTarget.projectId}/estimates/new`,
        `/api/projects/${createTarget.projectId}/itemized-statements`
      )
    ).toBe(200);
    await expect(page.getByRole('combobox', { name: '内訳書を選択' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await prisma.project.update({
      where: { id: createTarget.projectId },
      data: { deletedAt: new Date() },
    });
    const created = responseOf('POST', `/api/projects/${createTarget.projectId}/estimates`);
    await page.getByRole('button', { name: '作成', exact: true }).click();
    expect((await created).status()).toBe(404);
    await expect(page.getByRole('main').last().getByRole('alert')).toHaveText(projectGone, {
      timeout: getTimeout(10000),
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${createTarget.projectId}/estimates/new$`));
    await expectNoFailureFeedback(page);
    expect(
      await prisma.estimate.count({ where: { projectId: createTarget.projectId } }),
      '見積書は作られない'
    ).toBe(1);
  });
});
