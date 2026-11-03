/**
 * @fileoverview 数量表・数量グループ・数量項目・オートコンプリート候補への案件の閲覧範囲の適用の E2E テスト
 *
 * quantity-table-generation タスク104.1。design.md の「Requirement 50: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。一括の要求は範囲外が一つでも含まれれば全体を 404 にし、
 * 写真の紐付けが範囲外の現場調査・画像を指せば現場調査・画像の不在と同じ 404 にする。
 *
 * 被覆する受入基準（quantity-table-generation の Requirement 50.1〜50.7、50.10〔タスク105.1〕、50.11〔タスク107.1〕）は各テストの `@requirement` の印が名乗る。
 *
 * タスク106.1 で、画面が 404 を受けたときの表示（Requirement 51.1・51.2）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、読み込み・取得の
 * 失敗・操作の失敗を告げる文言、応答の英語の文言と再試行の釦を出さない。
 *
 * 検証に使う案件・現場調査・数量表はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
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
const NAME_PREFIX = 'e2e-qt-scope-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000104102';

interface Fixture {
  projectId: string;
  surveyId: string;
  surveyImageId: string;
  quantityTableId: string;
  quantityTableName: string;
  groupId: string;
  itemId: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・現場調査（画像 1 枚）・数量表（写真を紐付けたグループ 1 つ・項目 1 つ）を DB に作る */
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
  const survey = await prisma.siteSurvey.create({
    data: {
      projectId: project.id,
      name: `閲覧範囲検証の現場調査 ${label}`,
      surveyDate: new Date('2026-10-01'),
    },
    select: { id: true },
  });
  const image = await prisma.surveyImage.create({
    data: {
      surveyId: survey.id,
      originalPath: `surveys/${survey.id}/${label}.jpg`,
      thumbnailPath: `surveys/${survey.id}/${label}-thumb.jpg`,
      fileName: `${label}.jpg`,
      fileSize: 1024,
      width: 800,
      height: 600,
      displayOrder: 0,
    },
    select: { id: true },
  });
  const quantityTableName = `閲覧範囲検証の数量表 ${label}-${suffix}`;
  const table = await prisma.quantityTable.create({
    data: { projectId: project.id, name: quantityTableName },
    select: { id: true },
  });
  const group = await prisma.quantityGroup.create({
    data: {
      quantityTableId: table.id,
      name: `閲覧範囲検証のグループ ${label}`,
      surveyImageId: image.id,
      displayOrder: 0,
    },
    select: { id: true },
  });
  const item = await prisma.quantityItem.create({
    data: {
      quantityGroupId: group.id,
      majorCategory: '土工事',
      workType: '掘削',
      name: `閲覧範囲検証の項目 ${label}`,
      unit: 'm3',
      quantity: 1,
      displayOrder: 0,
    },
    select: { id: true },
  });
  return {
    projectId: project.id,
    surveyId: survey.id,
    surveyImageId: image.id,
    quantityTableId: table.id,
    quantityTableName,
    groupId: group.id,
    itemId: item.id,
  };
}

/** 案件の数量表まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  const prisma = getPrismaClient();
  return {
    tables: await prisma.quantityTable.findMany({
      where: { projectId },
      select: { id: true, name: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    groups: await prisma.quantityGroup.findMany({
      where: { quantityTable: { projectId } },
      select: { id: true, name: true, surveyImageId: true, displayOrder: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    items: await prisma.quantityItem.findMany({
      where: { quantityGroup: { quantityTable: { projectId } } },
      select: { id: true, quantityGroupId: true, name: true, displayOrder: true, updatedAt: true },
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

/** 数量表の編集画面の URL を直接開き、数量表の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openQuantityTableEdit(page: Page, quantityTableId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/quantity-tables/${quantityTableId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/quantity-tables/${quantityTableId}/edit`);
  return (await loaded).status();
}

/**
 * 読み込み中の表示が消えた後の、本文の領域の表示の文字列。
 * 数量表の画面は共通の枠の main の内側に自分の main を置くため、内側（文書の順で後ろ）を読む
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

/** 数量表の画面が 404 を受けたときに出してはならない、障害を告げる文言（タスク106.1） */
const FAILURE_TEXTS = [
  '数量表の取得に失敗しました',
  '読み込みに失敗しました',
  'プロジェクト情報の取得に失敗しました',
  '削除に失敗しました',
  '数量表の作成に失敗しました',
  '数量表名の保存に失敗しました',
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
async function expectNotFoundView(page: Page, resourceType: '数量表' | 'プロジェクト') {
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

test.describe('数量表・数量グループ・数量項目・候補の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // 数量表・数量グループ・数量項目・現場調査・現調画像は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement quantity-table-generation/REQ-50.1
   * @requirement quantity-table-generation/REQ-50.2
   * @requirement quantity-table-generation/REQ-50.3
   * @requirement quantity-table-generation/REQ-50.6
   * @requirement quantity-table-generation/REQ-50.7
   */
  test('担当外の利用者が数量表の URL を直接開くと存在しない数量表と同じ表示になり、API も署名付きURLを返さない', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は数量表の閲覧・作成・編集・削除の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('direct-url', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 対照: 関係者（営業担当者・作成者）は編集画面を開け、数量表名が表示される
    await loginAsUser(page, owner);
    expect(await openQuantityTableEdit(page, target.quantityTableId)).toBe(200);
    await expect(page.getByRole('textbox', { name: '数量表名' })).toHaveValue(
      target.quantityTableName,
      { timeout: getTimeout(15000) }
    );

    // 関係者には、紐付けた写真の URL が詳細の応答で発行される
    const ownerHeaders = await bearerFor(request, owner);
    const ownerDetail = await request.get(
      `${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}`,
      { headers: ownerHeaders }
    );
    expect(ownerDetail.status()).toBe(200);
    const ownerGroups = (
      (await ownerDetail.json()) as {
        groups: Array<{ id: string; surveyImage: { thumbnailUrl: string | null } | null }>;
      }
    ).groups;
    expect(
      ownerGroups.find((g) => g.id === target.groupId)?.surveyImage?.thumbnailUrl
    ).toBeTruthy();

    // 本体: 担当外の利用者は、存在しない数量表を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    // タスク106.1: 表示は不在の表示（ResourceNotFound。role="alert" を持たない）になったため、本文の領域の
    // 見つからない旨の表示どうしを比べる
    expect(await openQuantityTableEdit(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '数量表');
    const missingText = await settledMainText(page);
    expect(missingText.trim().length, '存在しない数量表の表示がある').toBeGreaterThan(0);

    expect(await openQuantityTableEdit(page, target.quantityTableId)).toBe(404);
    await expectNotFoundView(page, '数量表');
    expect(await settledMainText(page), '存在しない数量表と同じ表示').toBe(missingText);
    await expect(page.getByText(target.quantityTableName)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '数量表名' })).toHaveCount(0);

    // API: 一覧・直近・詳細・グループ・項目・候補は存在しない ID と同じ 404 の本文で、
    // 署名付きURL もプロジェクトID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [
        `/api/projects/${target.projectId}/quantity-tables`,
        `/api/projects/${MISSING_ID}/quantity-tables`,
      ],
      [
        `/api/projects/${target.projectId}/quantity-tables/summary`,
        `/api/projects/${MISSING_ID}/quantity-tables/summary`,
      ],
      [`/api/quantity-tables/${target.quantityTableId}`, `/api/quantity-tables/${MISSING_ID}`],
      [
        `/api/quantity-tables/${target.quantityTableId}/groups`,
        `/api/quantity-tables/${MISSING_ID}/groups`,
      ],
      [`/api/quantity-groups/${target.groupId}`, `/api/quantity-groups/${MISSING_ID}`],
      [`/api/quantity-groups/${target.groupId}/items`, `/api/quantity-groups/${MISSING_ID}/items`],
      [`/api/quantity-items/${target.itemId}`, `/api/quantity-items/${MISSING_ID}`],
      [
        `/api/projects/${target.projectId}/quantity-items/autocomplete-candidates`,
        `/api/projects/${MISSING_ID}/quantity-items/autocomplete-candidates`,
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
      expect(exposed, outOfScopePath).not.toContain('Url');
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-50.2
   * @requirement quantity-table-generation/REQ-50.3
   */
  test('担当外の利用者の数量表・数量グループ・数量項目の作成・更新・保存・コピー・移動・削除は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('write', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const prisma = getPrismaClient();
    const table = await prisma.quantityTable.findUniqueOrThrow({
      where: { id: target.quantityTableId },
      select: { updatedAt: true },
    });
    const group = await prisma.quantityGroup.findUniqueOrThrow({
      where: { id: target.groupId },
      select: { updatedAt: true },
    });
    const before = await snapshot(target.projectId);
    const headers = await bearerFor(request, outsider);

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/quantity-tables`, {
        headers,
        data: { name: 'intrusion' },
      }),
      await request.put(`${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}/save`, {
        headers,
        data: {
          expectedUpdatedAt: table.updatedAt.toISOString(),
          name: 'intrusion',
          groups: [],
        },
      }),
      await request.post(`${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}/copy`, {
        headers,
        data: { name: 'intrusion' },
      }),
      await request.post(`${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}/groups`, {
        headers,
        data: { name: 'intrusion' },
      }),
      await request.put(`${API_BASE_URL}/api/quantity-groups/${target.groupId}`, {
        headers,
        data: { name: 'intrusion', expectedUpdatedAt: group.updatedAt.toISOString() },
      }),
      await request.post(`${API_BASE_URL}/api/quantity-items/${target.itemId}/copy`, { headers }),
      await request.post(`${API_BASE_URL}/api/quantity-items/bulk-copy`, {
        headers,
        data: { itemIds: [target.itemId] },
      }),
      await request.delete(`${API_BASE_URL}/api/quantity-items/${target.itemId}`, { headers }),
      await request.delete(`${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}`, {
        headers,
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
   * 応答は不在と同じ 404 のまま、対象の実際の案件が範囲外なら範囲外の拒否として記録する
   * （quantity-table-generation タスク105.1。user-authentication の要件39.8 の本機能への適用）。
   * 自分の案件・数量表・数量グループの経路で、範囲外の案件の数量表・数量グループ・数量項目を指す。
   * 不在の対象と、範囲内の他の親の対象（経路の誤り）は記録しない。データは変わらない。
   *
   * @requirement quantity-table-generation/REQ-50.10
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の親の経路で範囲外の案件の数量表・数量グループ・数量項目を指すと 404 になり、対象の実際の案件を対象に監査の記録が 1 件ずつ増える', async ({
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
    const prisma = getPrismaClient();
    const foreignGroup = await prisma.quantityGroup.findUniqueOrThrow({
      where: { id: foreign.groupId },
      select: { updatedAt: true },
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeSibling = await snapshot(sibling.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);

    /** 利用者が残した範囲外のアクセスの記録の件数（対象の案件を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });

    const tables = `${API_BASE_URL}/api/projects/${target.projectId}/quantity-tables`;
    const groups = `${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}/groups`;
    const items = `${API_BASE_URL}/api/quantity-groups/${target.groupId}/items`;
    const cases: Array<{
      parent: string;
      siblingId: string;
      foreign: Array<() => ReturnType<APIRequestContext['get']>>;
    }> = [
      {
        parent: tables,
        siblingId: sibling.quantityTableId,
        foreign: [
          () => request.get(`${tables}/${foreign.quantityTableId}`, { headers }),
          () =>
            request.post(`${tables}/${foreign.quantityTableId}/copy`, {
              headers,
              data: { name: 'intrusion' },
            }),
        ],
      },
      {
        parent: groups,
        siblingId: sibling.groupId,
        foreign: [
          () => request.get(`${groups}/${foreign.groupId}`, { headers }),
          () =>
            request.put(`${groups}/${foreign.groupId}`, {
              headers,
              data: { name: 'intrusion', expectedUpdatedAt: foreignGroup.updatedAt.toISOString() },
            }),
        ],
      },
      {
        parent: items,
        siblingId: sibling.itemId,
        foreign: [
          () => request.get(`${items}/${foreign.itemId}`, { headers }),
          () => request.delete(`${items}/${foreign.itemId}`, { headers }),
        ],
      },
    ];

    for (const { parent, siblingId, foreign: foreignCalls } of cases) {
      // 不在の対象: 404 で記録しない
      const missingBefore = await deniedCount();
      const missing = await request.get(`${parent}/${MISSING_ID}`, { headers });
      expect(missing.status(), parent).toBe(404);
      const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
      expect(missingBody.code, parent).toBe('NOT_FOUND');
      expect((await deniedCount()) - missingBefore, `${parent}: 不在は記録しない`).toBe(0);

      // 範囲内の他の親の対象（経路の誤り）: 不在と同じ 404 で記録しない
      const siblingBefore = await deniedCount();
      const misrouted = await request.get(`${parent}/${siblingId}`, { headers });
      expect(misrouted.status(), parent).toBe(404);
      expect(withoutInstance((await misrouted.json()) as Record<string, unknown>), parent).toEqual(
        missingBody
      );
      expect((await deniedCount()) - siblingBefore, `${parent}: 範囲内の食い違いは記録しない`).toBe(
        0
      );

      // 範囲外の案件の対象: 読み込みも書き込みも不在と同じ 404 で、対象の実際の案件を対象に 1 件ずつ記録する
      for (const call of foreignCalls) {
        const allBefore = await deniedCount();
        const foreignBefore = await deniedCount(foreign.projectId);
        const outOfScope = await call();
        const label = `${outOfScope.url()}`;
        expect(outOfScope.status(), label).toBe(404);
        const body = withoutInstance((await outOfScope.json()) as Record<string, unknown>);
        expect(body, `${label}: 対象の不在と同じ本文`).toEqual(missingBody);
        expect(JSON.stringify(body), label).not.toContain(foreign.projectId);
        expect((await deniedCount()) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(1);
        expect(
          (await deniedCount(foreign.projectId)) - foreignBefore,
          `${label}: 記録の対象は対象の実際の案件`
        ).toBe(1);
      }
    }

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(sibling.projectId)).toEqual(beforeSibling);
    expect(await snapshot(foreign.projectId), 'データは変わらない').toEqual(beforeForeign);
  });

  /**
   * 数量表の保存の本文に、保存する数量表に属さない既存の ID が混じると、応答は不在の ID と同じ従来の 400 の
   * まま、その ID の実際の案件が範囲外なら範囲外の拒否として記録する（quantity-table-generation タスク107.1。
   * user-authentication の要件39.8 の改訂〔作成・保存の要求が指す他のデータ〕の本機能への適用）。
   * 不在の ID は記録しない。どちらの数量表も変わらない。
   *
   * @requirement quantity-table-generation/REQ-50.11
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の数量表の保存の本文へ範囲外の案件の数量グループの ID を混ぜると 400 になり、その案件を対象に監査の記録が 1 件増え、どちらの数量表も変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('save-foreign-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('save-foreign-other', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const prisma = getPrismaClient();
    const targetTable = await prisma.quantityTable.findUniqueOrThrow({
      where: { id: target.quantityTableId },
      select: { updatedAt: true },
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);

    /** 利用者が残した範囲外のアクセスの記録の件数（対象の案件を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });

    /** 自分の数量表のグループと項目に、属さないグループの ID を 1 つ混ぜた保存の要求 */
    const saveWith = (strayGroupId: string) =>
      request.put(`${API_BASE_URL}/api/quantity-tables/${target.quantityTableId}/save`, {
        headers,
        data: {
          expectedUpdatedAt: targetTable.updatedAt.toISOString(),
          name: target.quantityTableName,
          groups: [
            {
              id: target.groupId,
              name: '閲覧範囲検証のグループ save-foreign-own',
              surveyImageId: target.surveyImageId,
              displayOrder: 0,
              items: [
                {
                  id: target.itemId,
                  majorCategory: '土工事',
                  middleCategory: null,
                  minorCategory: null,
                  customCategory: null,
                  workType: '掘削',
                  name: '閲覧範囲検証の項目 save-foreign-own',
                  specification: null,
                  unit: 'm3',
                  calculationMethod: 'STANDARD',
                  calculationParams: null,
                  adjustmentFactor: 1,
                  roundingUnit: 0.01,
                  quantity: 1,
                  remarks: null,
                  displayOrder: 0,
                },
              ],
            },
            { id: strayGroupId, name: '混入', surveyImageId: null, displayOrder: 1, items: [] },
          ],
        },
      });

    // 不在の ID: 従来の 400 で記録しない
    const missingBefore = await deniedCount();
    const missing = await saveWith(MISSING_ID);
    expect(missing.status(), '不在の ID').toBe(400);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect(missingBody.code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
    expect(missingBody['groups[1].id']).toBe('この数量表に属さない数量グループが指定されています');
    expect((await deniedCount()) - missingBefore, '不在の ID は記録しない').toBe(0);

    // 範囲外の案件の数量表のグループの ID: 不在の ID と同じ 400 の本文で、その案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const outOfScope = await saveWith(foreign.groupId);
    expect(outOfScope.status(), '範囲外の案件の ID').toBe(400);
    const body = withoutInstance((await outOfScope.json()) as Record<string, unknown>);
    expect(body, '不在の ID と同じ本文').toEqual(missingBody);
    expect(JSON.stringify(body)).not.toContain(foreign.projectId);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect(
      (await deniedCount(foreign.projectId)) - foreignBefore,
      '記録の対象は混ぜた ID の実際の案件'
    ).toBe(1);

    expect(await snapshot(target.projectId), '保存する数量表は変わらない').toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId), '範囲外の数量表は変わらない').toEqual(beforeForeign);
  });

  /**
   * @requirement quantity-table-generation/REQ-50.4
   * @requirement quantity-table-generation/REQ-50.5
   */
  test('一括コピーに範囲外の項目が混じると全体が 404 になり、範囲外の現場調査・画像を指す紐付けは不在と同じ 404 になる', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('bulk-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('bulk-foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);

    // 一括コピー: 範囲内の項目と範囲外の項目が混じる要求は、不在の項目が混じる要求と同じ 404
    const bulkCopy = (itemIds: string[]) =>
      request.post(`${API_BASE_URL}/api/quantity-items/bulk-copy`, {
        headers,
        data: { itemIds },
      });
    const missingCopy = await bulkCopy([target.itemId, MISSING_ID]);
    const crossedCopy = await bulkCopy([target.itemId, foreign.itemId]);
    expect(missingCopy.status()).toBe(404);
    expect(crossedCopy.status()).toBe(404);
    const copyBody = (await crossedCopy.json()) as Record<string, unknown>;
    expect(copyBody.code).toBe('NOT_FOUND');
    expect(withoutInstance(copyBody)).toEqual(
      withoutInstance((await missingCopy.json()) as Record<string, unknown>)
    );

    // 写真の紐付け: 範囲外の案件の画像・現場調査は、不在の画像・現場調査と同じ 404
    for (const [path, field, foreignRef, code] of [
      [
        `/api/quantity-tables/${target.quantityTableId}/groups`,
        'surveyImageId',
        foreign.surveyImageId,
        'SURVEY_IMAGE_NOT_FOUND',
      ],
      [
        `/api/quantity-tables/${target.quantityTableId}/groups/from-survey`,
        'siteSurveyId',
        foreign.surveyId,
        'SITE_SURVEY_NOT_FOUND',
      ],
    ] as const) {
      const missing = await request.post(`${API_BASE_URL}${path}`, {
        headers,
        data: { [field]: MISSING_ID },
      });
      const crossed = await request.post(`${API_BASE_URL}${path}`, {
        headers,
        data: { [field]: foreignRef },
      });
      expect(missing.status(), path).toBe(404);
      expect(crossed.status(), path).toBe(404);
      const crossedBody = (await crossed.json()) as Record<string, unknown>;
      const missingBody = (await missing.json()) as Record<string, unknown>;
      expect(crossedBody.code, path).toBe(code);
      expect(missingBody.code, path).toBe(code);
      const normalize = (body: Record<string, unknown>, ref: string): unknown =>
        JSON.parse(JSON.stringify(withoutInstance(body)).split(ref).join('<ref>'));
      expect(normalize(crossedBody, foreignRef), path).toEqual(normalize(missingBody, MISSING_ID));
      expect(JSON.stringify(crossedBody), path).not.toContain(foreign.projectId);
    }

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });
  /**
   * 数量表の編集の画面は数量表の読み込みの 404 で、一覧・新規作成の画面はプロジェクトの読み込みの 404 で、
   * 見つからない旨とプロジェクトの一覧へのリンクを表示する（quantity-table-generation タスク106.1）。
   * 範囲外と不在は同じ表示。
   *
   * @requirement quantity-table-generation/REQ-51.1
   */
  test('担当外の利用者が数量表の画面の URL を開くと見つからない旨とプロジェクトの一覧へのリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    await loginAsUser(page, outsider);

    // 編集の画面: 数量表が見つからない旨と、プロジェクトの一覧へのリンク
    expect(await openQuantityTableEdit(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '数量表');
    const missingEditText = await settledMainText(page);
    expect(await openQuantityTableEdit(page, target.quantityTableId)).toBe(404);
    await expectNotFoundView(page, '数量表');
    expect(await settledMainText(page), '存在しない数量表と同じ表示').toBe(missingEditText);
    await expect(page.getByText(target.quantityTableName)).toHaveCount(0);

    // 一覧の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/quantity-tables`,
        `/api/projects/${MISSING_ID}/quantity-tables`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingListText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/quantity-tables`,
        `/api/projects/${target.projectId}/quantity-tables`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingListText);
    await expect(page.getByText(target.quantityTableName)).toHaveCount(0);

    // 新規作成の画面: プロジェクトの読み込みの 404 で、プロジェクトが見つからない旨とプロジェクトの一覧への
    // リンク。入力欄と作成の釦を出さない
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/quantity-tables/new`,
        `/api/projects/${MISSING_ID}`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingCreateText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/quantity-tables/new`,
        `/api/projects/${target.projectId}`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingCreateText);
    await expect(page.getByRole('button', { name: '作成', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('数量表名')).toHaveCount(0);
  });

  /**
   * 開いた後に数量表（作成ではプロジェクト）が論理的に取り除かれると、操作の要求は 404 を受ける。画面は
   * 見つからない旨のメッセージを表示し、操作の失敗を告げる文言や応答の英語の文言を出さない
   * （quantity-table-generation タスク106.1）。編集の画面の保存は未保存の変更を保ち、一覧の画面の削除は
   * 一覧を保ったまま表示する。
   *
   * @requirement quantity-table-generation/REQ-51.2
   */
  test('開いた後に論理的に取り除かれた数量表・プロジェクトへの操作で、見つからない旨のメッセージが表示される', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const people = { salesPersonId: owner.id, createdById: owner.id };
    const editTarget = await createFixture('gone-edit', people);
    const listTarget = await createFixture('gone-list', people);
    const createTarget = await createFixture('gone-create', people);
    const prisma = getPrismaClient();
    const softDeleteTable = (fixture: Fixture) =>
      prisma.quantityTable.update({
        where: { id: fixture.quantityTableId },
        data: { deletedAt: new Date() },
      });
    const tableGone = '数量表が見つかりません。存在しないか、削除されています。';
    const projectGone = 'プロジェクトが見つかりません。存在しないか、削除されています。';
    /** 指定の方法とパスの要求の応答を待つ（オリジンは問わずパスで照合する） */
    const responseOf = (method: string, pathname: string) =>
      page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname === pathname,
        { timeout: getTimeout(30000) }
      );
    await loginAsUser(page, owner);

    // 編集の画面の保存（従来は保存の失敗の汎用の文言）。未保存の変更は保つ
    expect(await openQuantityTableEdit(page, editTarget.quantityTableId)).toBe(200);
    const nameInput = page.getByRole('textbox', { name: '数量表名' });
    await expect(nameInput).toHaveValue(editTarget.quantityTableName, {
      timeout: getTimeout(15000),
    });
    await softDeleteTable(editTarget);
    await nameInput.fill('取り除かれた後の変更');
    await nameInput.press('Tab');
    await expect(page.getByTestId('unsaved-changes-badge')).toBeVisible();
    const saved = responseOf('PUT', `/api/quantity-tables/${editTarget.quantityTableId}/save`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saved).status()).toBe(404);
    await expect(page.getByRole('alert').filter({ hasText: tableGone })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByTestId('unsaved-changes-badge')).toBeVisible();
    await expect(nameInput).toHaveValue('取り除かれた後の変更');
    await expectNoFailureFeedback(page);

    // 一覧の画面の名称の変更・コピー・削除。一覧を開いた後に数量表を論理的に取り除く
    expect(
      await openAndWait(
        page,
        `/projects/${listTarget.projectId}/quantity-tables`,
        `/api/projects/${listTarget.projectId}/quantity-tables`
      )
    ).toBe(200);
    const main = page.getByRole('main').last();
    await expect(main.getByText(listTarget.quantityTableName)).toBeVisible({
      timeout: getTimeout(15000),
    });
    await softDeleteTable(listTarget);

    // 名称の変更（従来は名称の保存の失敗の文言）。入力を保つ
    await main.getByRole('button', { name: '名前を編集' }).click();
    const renameInput = main.getByRole('textbox', { name: '数量表名を編集' });
    await renameInput.fill('取り除かれた後の名称');
    const renamed = responseOf('PUT', `/api/quantity-tables/${listTarget.quantityTableId}`);
    await renameInput.press('Enter');
    expect((await renamed).status()).toBe(404);
    await expect(main.getByRole('alert').filter({ hasText: tableGone })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(renameInput).toHaveValue('取り除かれた後の名称');
    await expectNoFailureFeedback(page);
    await renameInput.press('Escape');
    await expect(renameInput).toHaveCount(0);

    // コピー（従来は応答の英語の文言をそのまま表示）。ダイアログを開いたまま表示する
    await main.getByRole('button', { name: 'コピー', exact: true }).click();
    const copyDialog = page.getByRole('dialog', { name: '数量表をコピー' });
    await expect(copyDialog).toBeVisible({ timeout: getTimeout(10000) });
    const copied = responseOf('POST', `/api/quantity-tables/${listTarget.quantityTableId}/copy`);
    await copyDialog.getByRole('button', { name: 'コピーを作成' }).click();
    expect((await copied).status()).toBe(404);
    await expect(copyDialog.getByRole('alert')).toHaveText(tableGone, {
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);
    await copyDialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(copyDialog).toHaveCount(0);

    // 削除（従来は削除の失敗の文言と再試行の釦で一覧を置き換えていた）。一覧を保つ
    await main.getByRole('button', { name: '削除', exact: true }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    const deleted = responseOf('DELETE', `/api/quantity-tables/${listTarget.quantityTableId}`);
    await deleteDialog.getByRole('button', { name: '削除', exact: true }).click();
    expect((await deleted).status()).toBe(404);
    const listError = page.getByTestId('quantity-table-list-operation-error');
    await expect(listError).toHaveText(tableGone, { timeout: getTimeout(10000) });
    await expect(listError).toHaveAttribute('role', 'alert');
    await expect(deleteDialog).toHaveCount(0);
    await expect(main.getByText(listTarget.quantityTableName)).toBeVisible();
    await expectNoFailureFeedback(page);
    expect(
      await prisma.quantityTable.count({ where: { projectId: listTarget.projectId } }),
      'コピーは作られない'
    ).toBe(1);

    // 数量表の作成（従来は作成の失敗の汎用の文言）。開いた後にプロジェクトを論理削除する
    expect(
      await openAndWait(
        page,
        `/projects/${createTarget.projectId}/quantity-tables/new`,
        `/api/projects/${createTarget.projectId}`
      )
    ).toBe(200);
    const createInput = page.getByLabel('数量表名');
    await expect(createInput).toBeVisible({ timeout: getTimeout(15000) });
    await createInput.fill('取り除かれたプロジェクトへの作成の試み');
    await prisma.project.update({
      where: { id: createTarget.projectId },
      data: { deletedAt: new Date() },
    });
    const created = responseOf('POST', `/api/projects/${createTarget.projectId}/quantity-tables`);
    await page.getByRole('button', { name: '作成', exact: true }).click();
    expect((await created).status()).toBe(404);
    await expect(page.getByRole('alert').filter({ hasText: projectGone })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page).toHaveURL(
      new RegExp(`/projects/${createTarget.projectId}/quantity-tables/new$`)
    );
    await expect(createInput).toHaveValue('取り除かれたプロジェクトへの作成の試み');
    await expectNoFailureFeedback(page);
    expect(
      await prisma.quantityTable.count({ where: { projectId: createTarget.projectId } }),
      '数量表は作られない'
    ).toBe(1);
  });
});
