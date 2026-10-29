/**
 * @fileoverview 内訳書の API への案件の閲覧範囲の適用の E2E テスト
 *
 * itemized-statement-generation タスク27.1。design.md の「Requirement 18: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。内訳書の作成の要求が指す数量表が経路のプロジェクトに属さなければ
 * 数量表の不在と同じ 404 にし、並び順の保存に他の内訳書の内訳項目が混じれば要求全体を 400 で拒否する。
 *
 * 被覆する受入基準（itemized-statement-generation の Requirement 18.1〜18.6）は各テストの `@requirement` の印が名乗る。
 * 出力の記録（18.7・18.8）はタスク27.2 の担当で、本ファイルは扱わない。
 *
 * タスク29.1 で、画面が 404 を受けたときの表示（Requirement 19.1・19.2）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、取得の失敗・
 * 操作の失敗を告げる文言、応答の英語の文言と再試行の釦を出さない。
 *
 * 検証に使う案件・数量表・内訳書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
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
const NAME_PREFIX = 'e2e-is-scope-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000027101';

interface Fixture {
  projectId: string;
  quantityTableId: string;
  statementId: string;
  statementName: string;
  itemIds: string[];
  quantityItemName: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・数量表（数量項目 1 件）・内訳書（内訳項目 2 件）を DB に作る */
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
  const quantityItemName = `閲覧範囲検証の数量項目 ${label}-${suffix}`;
  const quantityTable = await prisma.quantityTable.create({
    data: {
      projectId: project.id,
      name: `閲覧範囲検証の数量表 ${label}-${suffix}`,
      groups: {
        create: [
          {
            name: 'グループ',
            displayOrder: 0,
            items: {
              create: [
                {
                  workType: '工種',
                  name: quantityItemName,
                  unit: 'm2',
                  quantity: 3,
                  displayOrder: 0,
                },
              ],
            },
          },
        ],
      },
    },
    select: { id: true },
  });
  const statementName = `閲覧範囲検証の内訳書 ${label}-${suffix}`;
  const statement = await prisma.itemizedStatement.create({
    data: {
      projectId: project.id,
      name: statementName,
      sourceQuantityTableId: quantityTable.id,
      sourceQuantityTableName: `${label} の数量表`,
      items: {
        create: [
          {
            workType: '工種A',
            name: `閲覧範囲検証の内訳 ${label}-1`,
            unit: '式',
            quantity: 1,
            displayOrder: 0,
          },
          {
            workType: '工種B',
            name: `閲覧範囲検証の内訳 ${label}-2`,
            unit: 'm',
            quantity: 2,
            displayOrder: 1,
          },
        ],
      },
    },
    select: { id: true, items: { select: { id: true }, orderBy: { displayOrder: 'asc' } } },
  });
  return {
    projectId: project.id,
    quantityTableId: quantityTable.id,
    statementId: statement.id,
    statementName,
    itemIds: statement.items.map((i) => i.id),
    quantityItemName,
  };
}

/** 案件の内訳書まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  const prisma = getPrismaClient();
  return {
    statements: await prisma.itemizedStatement.findMany({
      where: { projectId },
      select: { id: true, name: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    items: await prisma.itemizedStatementItem.findMany({
      where: { itemizedStatement: { projectId } },
      select: { id: true, displayOrder: true },
      orderBy: { id: 'asc' },
    }),
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

/** 内訳書詳細画面の URL を直接開き、内訳書の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openStatement(page: Page, statementId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/itemized-statements/${statementId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/itemized-statements/${statementId}`);
  return (await loaded).status();
}

/**
 * 読み込み中の表示が消えた後の、本文の領域の表示の文字列。
 * 内訳書の画面は共通の枠の main の内側に自分の main を置くことがあるため、内側（文書の順で後ろ）を読む
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

/** 内訳書の画面が 404 を受けたときに出してはならない、障害を告げる文言（REQ-19.1・19.2） */
const FAILURE_TEXTS = [
  '内訳書の取得に失敗しました',
  'プロジェクトの取得に失敗しました',
  '削除に失敗しました',
  '並び順の保存に失敗しました',
  '内訳書の作成中にエラーが発生しました',
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
async function expectNotFoundView(page: Page, resourceType: '内訳書' | 'プロジェクト') {
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

test.describe('内訳書の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // 数量表・内訳書・内訳項目は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.1
   * @requirement itemized-statement-generation/REQ-18.2
   * @requirement itemized-statement-generation/REQ-18.3
   * @requirement itemized-statement-generation/REQ-18.6
   */
  test('担当外の利用者が内訳書の URL を直接開くと存在しない内訳書と同じ表示になり、一覧・直近の内訳書の要約・詳細の API も存在しない ID と同じ 404 を返す', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は内訳書の閲覧の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('direct-url', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 対照: 関係者（営業担当者・作成者）は内訳書詳細画面を開け、内訳書の名前が見出しに表示される
    await loginAsUser(page, owner);
    expect(await openStatement(page, target.statementId)).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: target.statementName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 本体: 担当外の利用者は、存在しない内訳書を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    // タスク29.1: 表示は不在の表示（ResourceNotFound。role="alert" を持たない）になったため、
    // 見つからない旨の表示どうしを比べる
    expect(await openStatement(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '内訳書');
    const missingText = await settledMainText(page);

    expect(await openStatement(page, target.statementId)).toBe(404);
    await expectNotFoundView(page, '内訳書');
    expect(await settledMainText(page), '存在しない内訳書と同じ表示').toBe(missingText);
    await expect(page.getByText(target.statementName)).toHaveCount(0);

    // API: 一覧・直近の内訳書の要約・詳細・二重マウントの詳細は、存在しない ID と同じ 404 の本文で、
    // 案件 ID も内訳書 ID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [
        `/api/projects/${target.projectId}/itemized-statements`,
        `/api/projects/${MISSING_ID}/itemized-statements`,
      ],
      [
        `/api/projects/${target.projectId}/itemized-statements/latest`,
        `/api/projects/${MISSING_ID}/itemized-statements/latest`,
      ],
      [`/api/itemized-statements/${target.statementId}`, `/api/itemized-statements/${MISSING_ID}`],
      [
        `/api/projects/${target.projectId}/itemized-statements/${target.statementId}`,
        `/api/projects/${target.projectId}/itemized-statements/${MISSING_ID}`,
      ],
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
      expect(exposed, outOfScopePath).not.toContain(target.statementId);
      expect(exposed, outOfScopePath).not.toContain(target.statementName);
    }

    // 対照: 関係者の一覧には当該案件の内訳書が載る（18.1・18.6）
    const ownerHeaders = await bearerFor(request, owner);
    const list = await request.get(
      `${API_BASE_URL}/api/projects/${target.projectId}/itemized-statements`,
      { headers: ownerHeaders }
    );
    expect(list.status()).toBe(200);
    const listed = ((await list.json()) as { data: Array<{ id: string }> }).data.map((s) => s.id);
    expect(listed).toEqual([target.statementId]);
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.2
   * @requirement itemized-statement-generation/REQ-18.3
   */
  test('担当外の利用者の内訳書の作成・並び順の保存・削除は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('write', { salesPersonId: owner.id, createdById: owner.id });
    const before = await snapshot(target.projectId);
    const statement = await getPrismaClient().itemizedStatement.findUniqueOrThrow({
      where: { id: target.statementId },
    });
    const updatedAt = statement.updatedAt.toISOString();
    const headers = await bearerFor(request, outsider);
    const base = `${API_BASE_URL}/api/itemized-statements/${target.statementId}`;

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/itemized-statements`, {
        headers,
        data: { name: '侵入の試み', quantityTableId: target.quantityTableId },
      }),
      await request.patch(`${base}/items/order`, {
        headers,
        data: {
          updatedAt,
          items: [
            { id: target.itemIds[1], displayOrder: 0 },
            { id: target.itemIds[0], displayOrder: 1 },
          ],
        },
      }),
      await request.delete(base, { headers, data: { updatedAt } }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, response.url()).not.toContain(target.projectId);
      expect(exposed, response.url()).not.toContain(target.statementId);
    }

    expect(await snapshot(target.projectId)).toEqual(before);
  });

  /**
   * @requirement itemized-statement-generation/REQ-18.4
   * @requirement itemized-statement-generation/REQ-18.5
   */
  test('自分の案件の内訳書の作成で他の案件の数量表を指すと数量表の不在と同じ 404 になり、並び順の保存に他の案件の内訳項目が混じると全体が 400 で書き込まれない', async ({
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

    // 作成: 他の案件の数量表は、存在しない数量表と同じ 404 で、内訳書は作られない（18.4）
    const create = (quantityTableId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/itemized-statements`, {
        headers,
        data: { name: '他の案件の数量表からの作成の試み', quantityTableId },
      });
    const missingTable = await create(MISSING_ID);
    const foreignTable = await create(foreign.quantityTableId);
    expect(missingTable.status()).toBe(404);
    expect(foreignTable.status()).toBe(404);
    const foreignTableBody = (await foreignTable.json()) as Record<string, unknown>;
    expect(foreignTableBody.code).toBe('QUANTITY_TABLE_NOT_FOUND');
    expect(
      JSON.stringify(withoutInstance(foreignTableBody)).split(foreign.quantityTableId).join('<id>')
    ).toBe(
      JSON.stringify(withoutInstance((await missingTable.json()) as Record<string, unknown>))
        .split(MISSING_ID)
        .join('<id>')
    );
    expect(JSON.stringify(foreignTableBody)).not.toContain(foreign.projectId);
    expect(JSON.stringify(foreignTableBody)).not.toContain(foreign.quantityItemName);

    // 並び順の保存: 自分の内訳項目の並べ替えと他の案件の内訳項目が混じる要求は、存在しない ID と同じ 400（18.5）
    const statement = await getPrismaClient().itemizedStatement.findUniqueOrThrow({
      where: { id: target.statementId },
    });
    const save = (mixedId: string) =>
      request.patch(`${API_BASE_URL}/api/itemized-statements/${target.statementId}/items/order`, {
        headers,
        data: {
          updatedAt: statement.updatedAt.toISOString(),
          items: [
            { id: target.itemIds[1], displayOrder: 0 },
            { id: target.itemIds[0], displayOrder: 1 },
            { id: mixedId, displayOrder: 2 },
          ],
        },
      });
    const missingItem = await save(MISSING_ID);
    const foreignItem = await save(foreign.itemIds[0]!);
    expect(missingItem.status()).toBe(400);
    expect(foreignItem.status()).toBe(400);
    const foreignItemBody = (await foreignItem.json()) as Record<string, unknown>;
    expect(foreignItemBody.code).toBe('ITEM_NOT_BELONG_TO_STATEMENT');
    expect(
      JSON.stringify(withoutInstance(foreignItemBody)).split(foreign.itemIds[0]!).join('<id>')
    ).toBe(
      JSON.stringify(withoutInstance((await missingItem.json()) as Record<string, unknown>))
        .split(MISSING_ID)
        .join('<id>')
    );

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 応答は不在と同じ 404 のまま、内訳書の実際の案件が範囲外なら範囲外の拒否として記録する
   * （itemized-statement-generation タスク28.2。user-authentication の要件39.8 の本機能への適用）。
   * 不在の内訳書と、範囲内の他の案件の内訳書（経路の誤り）は記録しない。
   *
   * @requirement itemized-statement-generation/REQ-18.11
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の案件の配下の経路で範囲外の案件の内訳書を指すと 404 になり、内訳書の案件を対象に監査の記録が 1 件増え、データは変わらない', async ({
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
    const nested = `${API_BASE_URL}/api/projects/${target.projectId}/itemized-statements`;

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
    const missing = await request.get(`${nested}/${MISSING_ID}`, { headers });
    expect(missing.status()).toBe(404);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect((await deniedCount()) - missingBefore, '不在の内訳書は記録しない').toBe(0);

    // 範囲内の他の案件の内訳書（経路の誤り）: 不在と同じ 404 で記録しない
    const siblingBefore = await deniedCount();
    const misrouted = await request.get(`${nested}/${sibling.statementId}`, { headers });
    expect(misrouted.status()).toBe(404);
    expect(withoutInstance((await misrouted.json()) as Record<string, unknown>)).toEqual(
      missingBody
    );
    expect((await deniedCount()) - siblingBefore, '範囲内の食い違いは記録しない').toBe(0);

    // 範囲外の案件の内訳書を読む・削除する: 不在と同じ 404 で、要求ごとに内訳書の案件を対象に 1 件記録する
    const foreignStatement = await getPrismaClient().itemizedStatement.findUniqueOrThrow({
      where: { id: foreign.statementId },
    });
    const updatedAt = foreignStatement.updatedAt.toISOString();
    const calls = [
      {
        label: 'GET',
        send: () => request.get(`${nested}/${foreign.statementId}`, { headers }),
      },
      {
        label: 'DELETE',
        send: () =>
          request.delete(`${nested}/${foreign.statementId}`, { headers, data: { updatedAt } }),
      },
    ];
    for (const { label, send } of calls) {
      const allBefore = await deniedCount();
      const foreignBefore = await deniedCount(foreign.projectId);
      const outOfScope = await send();
      expect(outOfScope.status(), label).toBe(404);
      const body = withoutInstance((await outOfScope.json()) as Record<string, unknown>);
      expect(body, `${label}: 内訳書の不在と同じ本文`).toEqual(missingBody);
      expect(JSON.stringify(body), label).not.toContain(foreign.projectId);
      expect(JSON.stringify(body), label).not.toContain(foreign.statementId);
      expect((await deniedCount()) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(1);
      expect(
        (await deniedCount(foreign.projectId)) - foreignBefore,
        `${label}: 記録の対象は内訳書の実際の案件`
      ).toBe(1);
    }

    expect(await snapshot(sibling.projectId)).toEqual(beforeSibling);
    expect(await snapshot(foreign.projectId), 'データは変わらない').toEqual(beforeForeign);
  });

  /**
   * 内訳書の詳細の画面は内訳書の読み込みの 404 で、一覧・新規作成の画面はプロジェクトの読み込みの 404 で、
   * 見つからない旨とプロジェクトの一覧へのリンクを表示する（itemized-statement-generation タスク29.1）。
   * 範囲外と不在は同じ表示。
   *
   * @requirement itemized-statement-generation/REQ-19.1
   */
  test('担当外の利用者が内訳書の画面の URL を開くと見つからない旨とプロジェクトの一覧へのリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    await loginAsUser(page, outsider);

    // 詳細の画面: 内訳書が見つからない旨と、プロジェクトの一覧へのリンク
    expect(await openStatement(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '内訳書');
    const missingDetailText = await settledMainText(page);
    expect(await openStatement(page, target.statementId)).toBe(404);
    await expectNotFoundView(page, '内訳書');
    expect(await settledMainText(page), '存在しない内訳書と同じ表示').toBe(missingDetailText);
    await expect(page.getByText(target.statementName)).toHaveCount(0);

    // 一覧の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/itemized-statements`,
        `/api/projects/${MISSING_ID}/itemized-statements`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingListText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/itemized-statements`,
        `/api/projects/${target.projectId}/itemized-statements`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingListText);
    await expect(page.getByText(target.statementName)).toHaveCount(0);

    // 新規作成の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク。フォームを出さない
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/itemized-statements/new`,
        `/api/projects/${MISSING_ID}`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingCreateText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/itemized-statements/new`,
        `/api/projects/${target.projectId}`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingCreateText);
    await expect(page.getByRole('button', { name: '作成', exact: true })).toHaveCount(0);
  });

  /**
   * 開いた後に内訳書（作成ではプロジェクト）が論理削除されると、操作の要求は 404 を受ける。画面は見つからない
   * 旨のメッセージを表示し、操作の失敗を告げる文言や応答の英語の文言を出さない
   * （itemized-statement-generation タスク29.1）。一覧の画面の削除は一覧を保ったまま表示する。
   *
   * @requirement itemized-statement-generation/REQ-19.2
   */
  test('開いた後に論理削除された内訳書・プロジェクトへの操作で、見つからない旨のメッセージが表示される', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const people = { salesPersonId: owner.id, createdById: owner.id };
    const orderTarget = await createFixture('gone-order', people);
    const deleteTarget = await createFixture('gone-delete', people);
    const listTarget = await createFixture('gone-list', people);
    const createTarget = await createFixture('gone-create', people);
    const prisma = getPrismaClient();
    const softDeleteStatement = (fixture: Fixture) =>
      prisma.itemizedStatement.update({
        where: { id: fixture.statementId },
        data: { deletedAt: new Date() },
      });
    const statementGone = '内訳書が見つかりません。存在しないか、削除されています。';
    const projectGone = 'プロジェクトが見つかりません。存在しないか、削除されています。';
    /** 指定の方法とパスの要求の応答を待つ（オリジンは問わずパスで照合する） */
    const responseOf = (method: string, pathname: string) =>
      page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname === pathname,
        { timeout: getTimeout(30000) }
      );
    await loginAsUser(page, owner);

    // 詳細の画面の並び順の保存（従来は応答の英語の文言）。未保存の並び順は保つ
    expect(await openStatement(page, orderTarget.statementId)).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: orderTarget.statementName })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await softDeleteStatement(orderTarget);
    await page.getByRole('button', { name: '下へ移動' }).first().click();
    const saved = responseOf(
      'PATCH',
      `/api/itemized-statements/${orderTarget.statementId}/items/order`
    );
    await page.getByRole('button', { name: '並び順を保存' }).click();
    expect((await saved).status()).toBe(404);
    const main = page.getByRole('main').last();
    await expect(main.getByRole('alert').filter({ hasText: statementGone })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('button', { name: '並び順を保存' })).toBeVisible();
    await expectNoFailureFeedback(page);

    // 詳細の画面の削除（従来は応答の英語の文言）。画面は内訳書を表示したまま
    expect(await openStatement(page, deleteTarget.statementId)).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: deleteTarget.statementName })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText(statementGone)).toHaveCount(0);
    await softDeleteStatement(deleteTarget);
    await main.getByRole('button', { name: '削除', exact: true }).click();
    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toBeVisible({ timeout: getTimeout(10000) });
    const detailDeleted = responseOf(
      'DELETE',
      `/api/itemized-statements/${deleteTarget.statementId}`
    );
    await detailDialog.getByRole('button', { name: '削除', exact: true }).click();
    expect((await detailDeleted).status()).toBe(404);
    await expect(main.getByRole('alert').filter({ hasText: statementGone })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page).toHaveURL(new RegExp(`/itemized-statements/${deleteTarget.statementId}$`));
    await expectNoFailureFeedback(page);

    // 一覧の画面の削除（従来は削除の失敗の汎用の文言で一覧を置き換えていた）。一覧を保つ
    expect(
      await openAndWait(
        page,
        `/projects/${listTarget.projectId}/itemized-statements`,
        `/api/projects/${listTarget.projectId}/itemized-statements`
      )
    ).toBe(200);
    const card = page.getByTestId(`statement-card-${listTarget.statementId}`);
    await expect(card).toBeVisible({ timeout: getTimeout(15000) });
    await softDeleteStatement(listTarget);
    await card.getByRole('button', { name: '削除', exact: true }).click();
    const listDialog = page.getByRole('dialog');
    await expect(listDialog).toBeVisible({ timeout: getTimeout(10000) });
    const listDeleted = responseOf('DELETE', `/api/itemized-statements/${listTarget.statementId}`);
    await listDialog.getByRole('button', { name: '削除', exact: true }).click();
    expect((await listDeleted).status()).toBe(404);
    const listError = page.getByTestId('itemized-statement-list-operation-error');
    await expect(listError).toHaveText(statementGone, { timeout: getTimeout(10000) });
    await expect(listError).toHaveAttribute('role', 'alert');
    await expect(card).toBeVisible();
    await expectNoFailureFeedback(page);

    // 内訳書の作成（従来は応答の英語の文言）。開いた後にプロジェクトを論理削除する
    expect(
      await openAndWait(
        page,
        `/projects/${createTarget.projectId}/itemized-statements/new`,
        `/api/projects/${createTarget.projectId}`
      )
    ).toBe(200);
    const quantityTableSelect = page.getByRole('combobox', { name: '数量表' });
    await expect(quantityTableSelect).toBeVisible({ timeout: getTimeout(15000) });
    await quantityTableSelect.selectOption(createTarget.quantityTableId);
    await prisma.project.update({
      where: { id: createTarget.projectId },
      data: { deletedAt: new Date() },
    });
    const created = responseOf(
      'POST',
      `/api/projects/${createTarget.projectId}/itemized-statements`
    );
    await page.getByRole('button', { name: '作成', exact: true }).click();
    expect((await created).status()).toBe(404);
    await expect(page.getByText(projectGone, { exact: true })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page).toHaveURL(
      new RegExp(`/projects/${createTarget.projectId}/itemized-statements/new$`)
    );
    await expectNoFailureFeedback(page);
    expect(
      await prisma.itemizedStatement.count({ where: { projectId: createTarget.projectId } }),
      '内訳書は作られない'
    ).toBe(1);
  });
});
