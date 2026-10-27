/**
 * @fileoverview 工程表の API への案件の閲覧範囲の適用の E2E テスト
 *
 * construction-schedule タスク22.1。design.md の「Requirement 13: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。工程表の作成の要求が指す数量表が経路のプロジェクトに属さなければ
 * 数量表の不在と同じ 422 にして工程表を作成しない。
 *
 * 被覆する受入基準（construction-schedule の Requirement 13.1〜13.5）は各テストの `@requirement` の印が名乗る。
 * 出力の記録（13.6・13.7）はタスク22.2 の担当で、本ファイルは扱わない（出力の経路の範囲の判定は 13.2 として扱う）。
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

/** 読み込み中の表示が消えた後の、本文の領域の表示の文字列 */
async function settledMainText(page: Page): Promise<string> {
  const main = page.getByRole('main');
  await expect(main.getByText('読み込み中...')).toHaveCount(0, { timeout: getTimeout(15000) });
  return main.innerText();
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
    expect(await openSchedule(page, MISSING_ID)).toBe(404);
    const missingText = await settledMainText(page);
    expect(missingText.trim().length, '存在しない工程表の表示がある').toBeGreaterThan(0);

    expect(await openSchedule(page, target.scheduleId)).toBe(404);
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
});
