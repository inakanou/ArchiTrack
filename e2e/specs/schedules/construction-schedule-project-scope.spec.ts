/**
 * @fileoverview 工程表の API への案件の閲覧範囲の適用の E2E テスト
 *
 * construction-schedule タスク22.1。design.md の「Requirement 13: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。工程表の作成の要求が指す数量表が経路のプロジェクトに属さなければ
 * 数量表の不在と同じ 422 にして工程表を作成しない。
 *
 * 被覆する受入基準（construction-schedule の Requirement 13.1〜13.5、13.8〔タスク23.1〕、13.9〔タスク25.1〕、13.10〔タスク25.2〕）は
 * 各テストの `@requirement` の印が名乗る。
 * 出力の記録（13.6・13.7）はタスク22.2 の担当で、本ファイルは扱わない（出力の経路の範囲の判定は 13.2 として扱う）。
 *
 * タスク24.1 で、画面が 404 を受けたときの表示（Requirement 14.1・14.2）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、取得の失敗・
 * 操作の失敗を告げる文言、応答の英語の文言と再試行の釦を出さない。
 *
 * 検証に使う案件・数量表・工程表はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
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
const NAME_PREFIX = 'e2e-cs-scope-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000022101';

interface Fixture {
  projectId: string;
  quantityTableId: string;
  quantityItemName: string;
  scheduleId: string;
  scheduleName: string;
  itemIds: string[];
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・数量表（数量項目 1 件）・工程表（工程項目 2 件）を DB に作る */
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
  const scheduleName = `閲覧範囲検証の工程表 ${label}-${suffix}`;
  const schedule = await prisma.constructionSchedule.create({
    data: {
      projectId: project.id,
      name: scheduleName,
      version: 0,
      items: {
        create: [
          { itemName: `閲覧範囲検証の工程 ${label}-1`, displayOrder: 0, duration: 2 },
          { itemName: `閲覧範囲検証の工程 ${label}-2`, displayOrder: 1, duration: 4 },
        ],
      },
    },
    select: { id: true, items: { select: { id: true }, orderBy: { displayOrder: 'asc' } } },
  });
  return {
    projectId: project.id,
    quantityTableId: quantityTable.id,
    quantityItemName,
    scheduleId: schedule.id,
    scheduleName,
    itemIds: schedule.items.map((i) => i.id),
  };
}

/** 案件の工程表まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  const prisma = getPrismaClient();
  return {
    schedules: await prisma.constructionSchedule.findMany({
      where: { projectId },
      select: { id: true, name: true, version: true, deletedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    items: await prisma.scheduleItem.findMany({
      where: { schedule: { projectId } },
      select: { id: true, itemName: true, displayOrder: true, duration: true },
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

/** 工程表詳細画面の URL を直接開き、工程表の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openSchedule(page: Page, scheduleId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/schedules/${scheduleId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/schedules/${scheduleId}`);
  return (await loaded).status();
}

/**
 * 読み込み中の表示が消えた後の、本文の領域の表示の文字列。
 * 一覧・新規作成の画面は共通の枠の main の内側に自分の main を置くため、内側（文書の順で後ろ）を読む
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

/** 工程表の画面が 404 を受けたときに出してはならない、障害を告げる文言（タスク24.1） */
const FAILURE_TEXTS = [
  '工程表の取得に失敗しました',
  '工程表の読み込みに失敗しました',
  '工程表の削除に失敗しました',
  '工程表の作成に失敗しました',
  '工程表の出力に失敗しました',
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
async function expectNotFoundView(page: Page, resourceType: '工程表' | 'プロジェクト') {
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

test.describe('工程表の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // 数量表・工程表・工程項目は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement construction-schedule/REQ-13.1
   * @requirement construction-schedule/REQ-13.2
   * @requirement construction-schedule/REQ-13.3
   * @requirement construction-schedule/REQ-13.5
   */
  test('担当外の利用者が工程表の URL を直接開くと存在しない工程表と同じ表示になり、一覧・詳細・出力の API も存在しない ID と同じ 404 を返す', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は工程表の閲覧の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('direct-url', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 対照: 関係者（営業担当者・作成者）は工程表詳細画面を開け、工程表の名前が見出しに表示される
    await loginAsUser(page, owner);
    expect(await openSchedule(page, target.scheduleId)).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: target.scheduleName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 本体: 担当外の利用者は、存在しない工程表を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    // タスク24.1: 表示は不在の表示（ResourceNotFound）になったため、見つからない旨の表示どうしを比べる
    expect(await openSchedule(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '工程表');
    const missingText = await settledMainText(page);
    expect(missingText.trim().length, '存在しない工程表の表示がある').toBeGreaterThan(0);

    expect(await openSchedule(page, target.scheduleId)).toBe(404);
    await expectNotFoundView(page, '工程表');
    expect(await settledMainText(page), '存在しない工程表と同じ表示').toBe(missingText);
    await expect(page.getByText(target.scheduleName)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: target.scheduleName })).toHaveCount(0);

    // API: 一覧・詳細・二重マウントの詳細・出力は、存在しない ID と同じ 404 の本文で、
    // 案件 ID も工程表 ID も含まず、ファイルを返さない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [`/api/projects/${target.projectId}/schedules`, `/api/projects/${MISSING_ID}/schedules`],
      [`/api/schedules/${target.scheduleId}`, `/api/schedules/${MISSING_ID}`],
      [
        `/api/projects/${target.projectId}/schedules/${target.scheduleId}`,
        `/api/projects/${target.projectId}/schedules/${MISSING_ID}`,
      ],
      [
        `/api/schedules/${target.scheduleId}/export?format=xlsx`,
        `/api/schedules/${MISSING_ID}/export?format=xlsx`,
      ],
    ] as const) {
      const missing = await request.get(`${API_BASE_URL}${missingPath}`, { headers });
      const outOfScope = await request.get(`${API_BASE_URL}${outOfScopePath}`, { headers });
      expect(missing.status(), missingPath).toBe(404);
      expect(outOfScope.status(), outOfScopePath).toBe(404);
      expect(outOfScope.headers()['content-disposition'], outOfScopePath).toBeUndefined();
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(body.code, outOfScopePath).toBe('NOT_FOUND');
      expect(withoutInstance(body), outOfScopePath).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, outOfScopePath).not.toContain(target.projectId);
      expect(exposed, outOfScopePath).not.toContain(target.scheduleId);
      expect(exposed, outOfScopePath).not.toContain(target.scheduleName);
    }

    // 対照: 関係者の一覧には当該案件の工程表が載る（13.1・13.5）
    const ownerHeaders = await bearerFor(request, owner);
    const list = await request.get(`${API_BASE_URL}/api/projects/${target.projectId}/schedules`, {
      headers: ownerHeaders,
    });
    expect(list.status()).toBe(200);
    const listed = ((await list.json()) as { schedules: Array<{ id: string }> }).schedules.map(
      (s) => s.id
    );
    expect(listed).toEqual([target.scheduleId]);
  });

  /**
   * @requirement construction-schedule/REQ-13.2
   * @requirement construction-schedule/REQ-13.3
   */
  test('担当外の利用者の工程表の作成・更新・一括保存・削除は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('write', { salesPersonId: owner.id, createdById: owner.id });
    const before = await snapshot(target.projectId);
    const headers = await bearerFor(request, outsider);
    const base = `${API_BASE_URL}/api/schedules/${target.scheduleId}`;

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/schedules`, {
        headers,
        data: { name: '侵入の試み', quantityTableId: target.quantityTableId },
      }),
      await request.put(base, { headers, data: { name: '侵入の試み', version: 0 } }),
      await request.put(`${base}/bulk-save`, {
        headers,
        data: {
          version: 0,
          items: target.itemIds.map((id, index) => ({
            id,
            itemName: `書き換えの試み-${index}`,
            labelText: '',
            detailText: '',
            startDate: null,
            duration: 9,
            displayOrder: index,
            isExportTarget: true,
          })),
        },
      }),
      await request.delete(base, { headers }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, response.url()).not.toContain(target.projectId);
      expect(exposed, response.url()).not.toContain(target.scheduleId);
    }

    expect(await snapshot(target.projectId)).toEqual(before);
  });

  /**
   * 応答は不在と同じ 404 のまま、工程表の実際の案件が範囲外なら範囲外の拒否として記録する
   * （construction-schedule タスク23.1。user-authentication の要件39.8 の本機能への適用）。
   * 不在の工程表と、範囲内の他の案件の工程表（経路の誤り）は記録しない。出力の経路は 404 で終わり、
   * 出力の記録を残さずファイルを返さない。
   *
   * @requirement construction-schedule/REQ-13.8
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の案件の配下の経路で範囲外の案件の工程表を指すと 404 になり、工程表の案件を対象に監査の記録が 1 件増える', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('own', { salesPersonId: owner.id, createdById: owner.id });
    const sibling = await createFixture('sibling', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const nested = `${API_BASE_URL}/api/projects/${target.projectId}/schedules`;

    /** 利用者が残した監査の記録の件数（対象を指定すればその案件だけ） */
    const auditCount = (action: string, targetId?: string): Promise<number> =>
      getPrismaClient().auditLog.count({
        where: { action, actorId: owner.id, ...(targetId ? { targetId } : {}) },
      });
    const deniedCount = (targetId?: string): Promise<number> =>
      auditCount('PROJECT_SCOPE_DENIED', targetId);

    // 不在の工程表: 404 で記録しない
    const missingBefore = await deniedCount();
    const missing = await request.get(`${nested}/${MISSING_ID}`, { headers });
    expect(missing.status()).toBe(404);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect((await deniedCount()) - missingBefore, '不在の工程表は記録しない').toBe(0);

    // 範囲内の他の案件の工程表（経路の誤り）: 不在と同じ 404 で記録しない
    const siblingBefore = await deniedCount();
    const misrouted = await request.get(`${nested}/${sibling.scheduleId}`, { headers });
    expect(misrouted.status()).toBe(404);
    expect(withoutInstance((await misrouted.json()) as Record<string, unknown>)).toEqual(
      missingBody
    );
    expect((await deniedCount()) - siblingBefore, '範囲内の食い違いは記録しない').toBe(0);

    // 範囲外の案件の工程表: 詳細も出力も不在と同じ 404 で、工程表の案件を対象に要求ごとに 1 件記録する
    const exportedBefore = await auditCount('DATA_EXPORTED');
    for (const path of [
      `${nested}/${foreign.scheduleId}`,
      `${nested}/${foreign.scheduleId}/export?format=xlsx`,
    ]) {
      const allBefore = await deniedCount();
      const foreignBefore = await deniedCount(foreign.projectId);
      const outOfScope = await request.get(path, { headers });
      expect(outOfScope.status(), path).toBe(404);
      expect(outOfScope.headers()['content-disposition'], path).toBeUndefined();
      expect(
        withoutInstance((await outOfScope.json()) as Record<string, unknown>),
        `${path}: 工程表の不在と同じ本文`
      ).toEqual(missingBody);
      expect((await deniedCount()) - allBefore, `${path}: 記録は 1 件だけ増える`).toBe(1);
      expect(
        (await deniedCount(foreign.projectId)) - foreignBefore,
        `${path}: 記録の対象は工程表の実際の案件`
      ).toBe(1);
    }
    expect((await auditCount('DATA_EXPORTED')) - exportedBefore, '出力の記録は残さない').toBe(0);

    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 論理的に取り除かれた工程表も、データベースに実在する限り工程表の実際の案件で判定する（construction-schedule
   * タスク25.1。user-authentication の要件39.8 の 2026-10-30 の改訂の本機能への適用）。範囲外の案件の
   * 論理的に取り除かれた工程表を `/api/schedules/:id` の詳細と、自分の案件の配下の経路で指すと、存在しない
   * 工程表と同じ 404 のまま、工程表の案件を対象に要求ごとに 1 件記録する。データは変わらない。
   *
   * @requirement construction-schedule/REQ-13.8
   * @requirement construction-schedule/REQ-13.9
   * @requirement user-authentication/REQ-39.8
   */
  test('範囲外の案件の論理的に取り除かれた工程表を詳細の API と自分の案件の配下の経路で指すと、存在しない工程表と同じ 404 になり、工程表の案件を対象に監査の記録が 1 件ずつ増える', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('own-deleted', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('foreign-deleted', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    await getPrismaClient().constructionSchedule.update({
      where: { id: foreign.scheduleId },
      data: { deletedAt: new Date() },
    });
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      getPrismaClient().auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });

    const cases: Array<[string, string, string]> = [
      [
        '詳細の API',
        `${API_BASE_URL}/api/schedules/${foreign.scheduleId}`,
        `${API_BASE_URL}/api/schedules/${MISSING_ID}`,
      ],
      [
        '自分の案件の配下の経路',
        `${API_BASE_URL}/api/projects/${target.projectId}/schedules/${foreign.scheduleId}`,
        `${API_BASE_URL}/api/projects/${target.projectId}/schedules/${MISSING_ID}`,
      ],
    ];
    for (const [label, deletedUrl, missingUrl] of cases) {
      // 存在しない工程表: 404 で記録しない
      const missingBefore = await deniedCount();
      const missing = await request.get(missingUrl, { headers });
      expect(missing.status(), `${label}: 不在`).toBe(404);
      const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
      expect((await deniedCount()) - missingBefore, `${label}: 不在の工程表は記録しない`).toBe(0);

      // 範囲外の案件の論理的に取り除かれた工程表: 不在と同じ 404 で、工程表の案件を対象に 1 件記録する
      const allBefore = await deniedCount();
      const foreignBefore = await deniedCount(foreign.projectId);
      const response = await request.get(deletedUrl, { headers });
      expect(response.status(), label).toBe(404);
      expect(
        withoutInstance((await response.json()) as Record<string, unknown>),
        `${label}: 工程表の不在と同じ本文`
      ).toEqual(missingBody);
      expect((await deniedCount()) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(1);
      expect(
        (await deniedCount(foreign.projectId)) - foreignBefore,
        `${label}: 記録の対象は工程表の実際の案件`
      ).toBe(1);
    }

    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * @requirement construction-schedule/REQ-13.4
   */
  test('自分の案件の工程表の作成で他の案件の数量表を指すと数量表の不在と同じ 422 になり、工程表は作られない', async ({
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

    const create = (quantityTableId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/schedules`, {
        headers,
        data: { name: '他の案件の数量表からの作成の試み', quantityTableId },
      });
    const missingTable = await create(MISSING_ID);
    const foreignTable = await create(foreign.quantityTableId);
    expect(missingTable.status()).toBe(422);
    expect(foreignTable.status()).toBe(422);
    const foreignBody = (await foreignTable.json()) as Record<string, unknown>;
    expect(foreignBody.code).toBe('SCHEDULE_VALIDATION_ERROR');
    expect(foreignBody, '存在しない数量表と同じ本文').toEqual(await missingTable.json());
    const exposed = JSON.stringify(foreignBody);
    expect(exposed).not.toContain(foreign.projectId);
    expect(exposed).not.toContain(foreign.quantityTableId);
    expect(exposed).not.toContain(foreign.quantityItemName);

    // 対照: 自分の案件の数量表からは作成でき、数量項目が工程項目へ写る（13.1）
    const own = await create(target.quantityTableId);
    expect(own.status()).toBe(201);
    const ownBody = (await own.json()) as { id: string; items: Array<{ itemName: string }> };
    expect(ownBody.items.map((i) => i.itemName)).toEqual([target.quantityItemName]);
    await getPrismaClient().constructionSchedule.delete({ where: { id: ownBody.id } });

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 工程表の作成で、数量表の所属の照合を論理削除の確かめより先に置く（construction-schedule タスク25.2。
   * design.md の「2026-10-30 の追加」章の「決定」の「数量表の照合の順」）。範囲外の案件の論理削除済みの
   * 数量表を指す作成は、存在しない数量表と同じ 422 と本文のまま、数量表の案件を対象に 1 件記録し、工程表を
   * 作らない。自分の案件の論理削除済みの数量表は同じ 422 で記録しない。
   *
   * @requirement construction-schedule/REQ-13.10
   */
  test('範囲外の案件の論理削除済みの数量表を指す工程表の作成は、存在しない数量表と同じ 422 になり、数量表の案件を対象に監査の記録が 1 件増え、工程表は作られない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('own-qt-deleted', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('foreign-qt-deleted', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const prisma = getPrismaClient();
    await prisma.quantityTable.update({
      where: { id: foreign.quantityTableId },
      data: { deletedAt: new Date() },
    });
    const ownDeleted = await prisma.quantityTable.create({
      data: {
        projectId: target.projectId,
        name: `閲覧範囲検証の論理削除済みの数量表 ${uniqueSuffix()}`,
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const scheduleName = `論理削除済みの数量表からの作成の試み ${uniqueSuffix()}`;

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });
    const create = (quantityTableId: string) =>
      request.post(`${API_BASE_URL}/api/projects/${target.projectId}/schedules`, {
        headers,
        data: { name: scheduleName, quantityTableId },
      });

    // 存在しない数量表: 422 で記録しない
    const missingBefore = await deniedCount();
    const missing = await create(MISSING_ID);
    expect(missing.status(), '存在しない数量表').toBe(422);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect(missingBody.code).toBe('SCHEDULE_VALIDATION_ERROR');
    expect((await deniedCount()) - missingBefore, '存在しない数量表は記録しない').toBe(0);

    // 範囲外の案件の論理削除済みの数量表: 不在と同じ 422 で、数量表の案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const foreignTable = await create(foreign.quantityTableId);
    expect(foreignTable.status(), '範囲外の案件の論理削除済みの数量表').toBe(422);
    const foreignBody = withoutInstance((await foreignTable.json()) as Record<string, unknown>);
    expect(foreignBody, '存在しない数量表と同じ本文').toEqual(missingBody);
    const exposed = JSON.stringify(foreignBody);
    expect(exposed).not.toContain(foreign.projectId);
    expect(exposed).not.toContain(foreign.quantityTableId);
    expect(exposed).not.toContain(foreign.quantityItemName);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect((await deniedCount(foreign.projectId)) - foreignBefore, '記録の対象は数量表の案件').toBe(
      1
    );

    // 自分の案件の論理削除済みの数量表: 不在と同じ 422 で記録しない
    const ownBefore = await deniedCount();
    const ownTable = await create(ownDeleted.id);
    expect(ownTable.status(), '自分の案件の論理削除済みの数量表').toBe(422);
    expect(
      withoutInstance((await ownTable.json()) as Record<string, unknown>),
      '自分の案件の論理削除済みの数量表も不在と同じ本文'
    ).toEqual(missingBody);
    expect((await deniedCount()) - ownBefore, '自分の案件の論理削除済みの数量表は記録しない').toBe(
      0
    );

    // 工程表は作られず、どちらの案件の工程表も変わらない
    expect(await prisma.constructionSchedule.count({ where: { name: scheduleName } })).toBe(0);
    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 工程表の詳細の画面は工程表の読み込みの 404 で、一覧・新規作成の画面はプロジェクトの読み込みの 404 で、
   * 見つからない旨とプロジェクトの一覧へのリンクを表示する（construction-schedule タスク24.1）。
   * 範囲外と不在は同じ表示。
   *
   * @requirement construction-schedule/REQ-14.1
   */
  test('担当外の利用者が工程表の画面の URL を開くと見つからない旨とプロジェクトの一覧へのリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    await loginAsUser(page, outsider);

    // 詳細の画面: 工程表が見つからない旨と、プロジェクトの一覧へのリンク
    expect(await openSchedule(page, MISSING_ID)).toBe(404);
    await expectNotFoundView(page, '工程表');
    const missingDetailText = await settledMainText(page);
    expect(await openSchedule(page, target.scheduleId)).toBe(404);
    await expectNotFoundView(page, '工程表');
    expect(await settledMainText(page), '存在しない工程表と同じ表示').toBe(missingDetailText);
    await expect(page.getByText(target.scheduleName)).toHaveCount(0);

    // 一覧の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/schedules`,
        `/api/projects/${MISSING_ID}/schedules`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingListText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/schedules`,
        `/api/projects/${target.projectId}/schedules`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingListText);
    await expect(page.getByText(target.scheduleName)).toHaveCount(0);

    // 新規作成の画面: 数量表の選択肢の読み込みの 404 で、プロジェクトが見つからない旨と
    // プロジェクトの一覧へのリンク。入力欄と作成の釦を出さない
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/schedules/new`,
        `/api/projects/${MISSING_ID}/quantity-tables`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    const missingCreateText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/schedules/new`,
        `/api/projects/${target.projectId}/quantity-tables`
      )
    ).toBe(404);
    await expectNotFoundView(page, 'プロジェクト');
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingCreateText);
    await expect(page.getByRole('button', { name: '作成', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('工程表名称')).toHaveCount(0);
  });

  /**
   * 開いた後に工程表（作成ではプロジェクト）が論理的に取り除かれると、操作の要求は 404 を受ける。画面は
   * 見つからない旨のメッセージを表示し、操作の失敗を告げる文言や応答の英語の文言を出さない
   * （construction-schedule タスク24.1）。出力のダイアログは再試行の釦を出さず、一覧の画面の削除は一覧を
   * 保ったまま表示する。
   *
   * @requirement construction-schedule/REQ-14.2
   */
  test('開いた後に論理的に取り除かれた工程表・プロジェクトへの操作で、見つからない旨のメッセージが表示される', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const people = { salesPersonId: owner.id, createdById: owner.id };
    const detailTarget = await createFixture('gone-detail', people);
    const listTarget = await createFixture('gone-list', people);
    const createTarget = await createFixture('gone-create', people);
    const prisma = getPrismaClient();
    const softDeleteSchedule = (fixture: Fixture) =>
      prisma.constructionSchedule.update({
        where: { id: fixture.scheduleId },
        data: { deletedAt: new Date() },
      });
    const scheduleGone = '工程表が見つかりません。存在しないか、削除されています。';
    const projectGone = 'プロジェクトが見つかりません。存在しないか、削除されています。';
    /** 指定の方法とパスの要求の応答を待つ（オリジンは問わずパスで照合する） */
    const responseOf = (method: string, pathname: string) =>
      page.waitForResponse(
        (r) => r.request().method() === method && new URL(r.url()).pathname === pathname,
        { timeout: getTimeout(30000) }
      );
    await loginAsUser(page, owner);

    // 詳細の画面の保存（従来は応答の英語の文言）。未保存の変更は保つ
    expect(await openSchedule(page, detailTarget.scheduleId)).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: detailTarget.scheduleName })
    ).toBeVisible({ timeout: getTimeout(15000) });
    await softDeleteSchedule(detailTarget);
    const label = page.getByTestId(`label-text-${detailTarget.itemIds[0]}`);
    await label.fill('取り除かれた後の変更');
    const saved = responseOf('PUT', `/api/schedules/${detailTarget.scheduleId}/bulk-save`);
    await page.getByTestId('save-button').click();
    expect((await saved).status()).toBe(404);
    await expect(page.getByTestId('save-error')).toHaveText(scheduleGone, {
      timeout: getTimeout(10000),
    });
    await expect(page.getByText('未保存の変更があります')).toBeVisible();
    await expect(label).toHaveValue('取り除かれた後の変更');
    await expectNoFailureFeedback(page);

    // 出力のダイアログ（従来は出力の失敗の文言と再試行の釦）。ダウンロードを始めない
    let downloads = 0;
    page.on('download', () => {
      downloads += 1;
    });
    await page.getByTestId('export-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    const exported = responseOf('GET', `/api/schedules/${detailTarget.scheduleId}/export`);
    await dialog.getByRole('button', { name: '出力', exact: true }).click();
    expect((await exported).status()).toBe(404);
    const exportAlert = dialog.getByRole('alert');
    await expect(exportAlert).toHaveText(scheduleGone, { timeout: getTimeout(10000) });
    await expect(dialog.getByRole('button', { name: '再試行' })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expectNoFailureFeedback(page);
    expect(downloads, 'ダウンロードを始めない').toBe(0);

    // 一覧の画面の削除（従来は削除の失敗の汎用の文言と再試行の釦で一覧を置き換えていた）。一覧を保つ
    expect(
      await openAndWait(
        page,
        `/projects/${listTarget.projectId}/schedules`,
        `/api/projects/${listTarget.projectId}/schedules`
      )
    ).toBe(200);
    const row = page.getByTestId(`schedule-row-${listTarget.scheduleId}`);
    await expect(row).toBeVisible({ timeout: getTimeout(15000) });
    await softDeleteSchedule(listTarget);
    await row.getByRole('button', { name: `${listTarget.scheduleName}を削除` }).click();
    const listDialog = page.getByRole('dialog');
    await expect(listDialog).toBeVisible({ timeout: getTimeout(10000) });
    const listDeleted = responseOf('DELETE', `/api/schedules/${listTarget.scheduleId}`);
    await listDialog.getByRole('button', { name: '確認', exact: true }).click();
    expect((await listDeleted).status()).toBe(404);
    const listError = page.getByTestId('schedule-list-operation-error');
    await expect(listError).toHaveText(scheduleGone, { timeout: getTimeout(10000) });
    await expect(listError).toHaveAttribute('role', 'alert');
    await expect(row).toBeVisible();
    await expectNoFailureFeedback(page);

    // 工程表の作成（従来は作成の失敗の汎用の文言）。開いた後にプロジェクトを論理削除する
    expect(
      await openAndWait(
        page,
        `/projects/${createTarget.projectId}/schedules/new`,
        `/api/projects/${createTarget.projectId}/quantity-tables`
      )
    ).toBe(200);
    const nameInput = page.getByLabel('工程表名称');
    await expect(nameInput).toBeVisible({ timeout: getTimeout(15000) });
    await nameInput.fill('取り除かれたプロジェクトへの作成の試み');
    await prisma.project.update({
      where: { id: createTarget.projectId },
      data: { deletedAt: new Date() },
    });
    const created = responseOf('POST', `/api/projects/${createTarget.projectId}/schedules`);
    await page.getByRole('button', { name: '作成', exact: true }).click();
    expect((await created).status()).toBe(404);
    await expect(page.getByRole('alert').filter({ hasText: projectGone })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${createTarget.projectId}/schedules/new$`));
    await expect(nameInput).toHaveValue('取り除かれたプロジェクトへの作成の試み');
    await expectNoFailureFeedback(page);
    expect(
      await prisma.constructionSchedule.count({ where: { projectId: createTarget.projectId } }),
      '工程表は作られない'
    ).toBe(1);
  });
});
