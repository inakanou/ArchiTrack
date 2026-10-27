/**
 * @fileoverview 数量表・数量グループ・数量項目・オートコンプリート候補への案件の閲覧範囲の適用の E2E テスト
 *
 * quantity-table-generation タスク104.1。design.md の「Requirement 50: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。一括の要求は範囲外が一つでも含まれれば全体を 404 にし、
 * 写真の紐付けが範囲外の現場調査・画像を指せば現場調査・画像の不在と同じ 404 にする。
 *
 * 被覆する受入基準（quantity-table-generation の Requirement 50.1〜50.7）は各テストの `@requirement` の印が名乗る。
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
    expect(await openQuantityTableEdit(page, MISSING_ID)).toBe(404);
    const missingAlert = page.getByRole('alert');
    await expect(missingAlert).toBeVisible({ timeout: getTimeout(15000) });
    const missingText = await missingAlert.innerText();

    expect(await openQuantityTableEdit(page, target.quantityTableId)).toBe(404);
    const outOfScopeAlert = page.getByRole('alert');
    await expect(outOfScopeAlert).toBeVisible({ timeout: getTimeout(15000) });
    expect(await outOfScopeAlert.innerText(), '存在しない数量表と同じ表示').toBe(missingText);
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
});
