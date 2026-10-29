/**
 * @fileoverview 実行予算・発注・出来高・原価・月次締め・出力の API への案件の閲覧範囲の適用の E2E テスト
 *
 * execution-budget-management タスク17.1。design.md の「Requirement 20: 案件の閲覧範囲と出力の記録の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。経路の実行予算項目・発注・出来高記録が経路の案件に属さなければ
 * 不在と同じ 404 にし、一括の要求は属さない項目が一つでも含まれれば全体を 404 にして書き込まない。
 *
 * 経路の案件と子・一括の項目の実際の案件が食い違い、実際の案件が範囲外なら、応答を変えずに範囲外の拒否として
 * 記録する（20.9。タスク18.1、user-authentication の要件39.8 の本機能への適用）。
 *
 * 被覆する受入基準（execution-budget-management の Requirement 20.1〜20.6・20.9 と、改訂した Requirement 17.1・17.2）は
 * 各テストの `@requirement` の印が名乗る。出力の記録（20.7・20.8）はタスク17.2 の担当で、本ファイルは扱わない。
 *
 * 検証に使う案件・見積書・契約・実行予算はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
 * 作る一意のメールアドレスの利用者とする。後始末で案件を先に消してから取引先と利用者を消す。
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

/** テストの中で作る案件・取引先の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-eb-scope-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000017101';

interface Fixture {
  projectId: string;
  budgetId: string;
  itemIds: [string, string];
  itemName: string;
  orderId: string;
  progressRecordId: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 発注先の取引先を DB に作る */
async function createTradingPartner(): Promise<string> {
  const partner = await getPrismaClient().tradingPartner.create({
    data: {
      name: `${NAME_PREFIX}partner-${uniqueSuffix()}`,
      nameKana: 'イーツーイーキョウリョクギョウシャ',
      address: '東京都千代田区1-1-1',
      types: { create: [{ type: 'SUBCONTRACTOR' }] },
    },
    select: { id: true },
  });
  return partner.id;
}

/** 案件・見積書・契約・実行予算（2 項目）・発注・出来高記録を DB に作る */
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
  const estimate = await prisma.estimate.create({
    data: { projectId: project.id, name: `閲覧範囲検証の見積書 ${label}` },
    select: { id: true },
  });
  const contract = await prisma.contract.create({
    data: {
      projectId: project.id,
      contractType: 'NEW',
      status: 'CONTRACTED',
      estimateId: estimate.id,
      contractDate: new Date('2026-01-01'),
      constructionStartDate: new Date('2026-02-01'),
      constructionEndDate: new Date('2026-12-31'),
      deliveryDate: new Date('2027-01-15'),
      taxRate: 0.1,
      contractAmount: 22000,
      constructionPrice: 20000,
      taxAmount: 2000,
    },
    select: { id: true },
  });
  const budget = await prisma.executionBudget.create({
    data: { projectId: project.id, contractId: contract.id },
    select: { id: true },
  });
  const itemName = `閲覧範囲検証の予算項目 ${label}-${suffix}`;
  const first = await prisma.executionBudgetItem.create({
    data: {
      executionBudgetId: budget.id,
      displayOrder: 0,
      name: itemName,
      unit: 'm2',
      quantity: 10,
      executionUnitPrice: 1000,
      executionAmount: 10000,
    },
    select: { id: true },
  });
  const second = await prisma.executionBudgetItem.create({
    data: {
      executionBudgetId: budget.id,
      displayOrder: 1,
      name: `${itemName}-2`,
      unit: 'm3',
      quantity: 5,
      executionUnitPrice: 2000,
      executionAmount: 10000,
    },
    select: { id: true },
  });
  const order = await prisma.order.create({
    data: {
      executionBudgetId: budget.id,
      tradingPartnerId,
      items: {
        create: [
          { executionBudgetItemId: first.id, checked: true },
          { executionBudgetItemId: second.id, checked: false },
        ],
      },
    },
    select: { id: true },
  });
  const progress = await prisma.progressRecord.create({
    data: {
      executionBudgetId: budget.id,
      constructionDate: new Date('2026-10-01'),
      items: { create: [{ executionBudgetItemId: first.id, amount: 3000 }] },
    },
    select: { id: true },
  });
  return {
    projectId: project.id,
    budgetId: budget.id,
    itemIds: [first.id, second.id],
    itemName,
    orderId: order.id,
    progressRecordId: progress.id,
  };
}

/** 案件の実行予算まわりのデータの状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  const prisma = getPrismaClient();
  const budgetWhere = { executionBudget: { projectId } };
  return {
    budgets: await prisma.executionBudget.findMany({
      where: { projectId },
      select: { id: true, version: true, deletedAt: true, updatedAt: true },
    }),
    items: await prisma.executionBudgetItem.findMany({
      where: budgetWhere,
      select: {
        id: true,
        executionUnitPrice: true,
        currentMonthExpense: true,
        remarks: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    orders: await prisma.order.findMany({
      where: budgetWhere,
      select: {
        id: true,
        status: true,
        confirmedAmount: true,
        deletedAt: true,
        updatedAt: true,
        items: {
          select: { executionBudgetItemId: true, checked: true },
          orderBy: { executionBudgetItemId: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    }),
    progress: await prisma.progressRecord.findMany({
      where: budgetWhere,
      select: {
        id: true,
        constructionDate: true,
        items: {
          select: { executionBudgetItemId: true, amount: true },
          orderBy: { executionBudgetItemId: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    }),
    monthlyCloses: await prisma.monthlyCloseHistory.count({ where: budgetWhere }),
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

/** 実行予算の画面の URL を直接開き、実行予算の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openExecutionBudget(page: Page, projectId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/projects/${projectId}/execution-budget`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/projects/${projectId}/execution-budget`);
  return (await loaded).status();
}

test.describe('実行予算・発注・出来高・原価・月次締めの案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    const prisma = getPrismaClient();
    // 発注項目・出来高項目は他の案件の実行予算項目を指しうる（是正前の振る舞いで作られた行）ため先に消す。
    // 実行予算・項目・発注・出来高・契約・見積書は案件の削除に連なって消える
    const budgetWhere = { executionBudget: { project: { name: { startsWith: NAME_PREFIX } } } };
    await prisma.orderItem.deleteMany({
      where: { OR: [{ order: budgetWhere }, { executionBudgetItem: budgetWhere }] },
    });
    await prisma.progressRecordItem.deleteMany({
      where: { OR: [{ progressRecord: budgetWhere }, { executionBudgetItem: budgetWhere }] },
    });
    await prisma.project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement execution-budget-management/REQ-20.1
   * @requirement execution-budget-management/REQ-20.2
   * @requirement execution-budget-management/REQ-20.3
   * @requirement execution-budget-management/REQ-20.6
   * @requirement execution-budget-management/REQ-17.1
   */
  test('担当外の利用者が実行予算の URL を直接開くと存在しない案件と同じ表示になり、一覧の API も存在しない案件と同じ 404 を返す', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は実行予算・発注・出来高の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const tradingPartnerId = await createTradingPartner();
    const target = await createFixture(
      'direct-url',
      { salesPersonId: owner.id, createdById: owner.id },
      tradingPartnerId
    );

    // 対照: 関係者（営業担当者・作成者）は実行予算の画面を開け、予算項目が表示される
    await loginAsUser(page, owner);
    expect(await openExecutionBudget(page, target.projectId)).toBe(200);
    await expect(page.getByText(target.itemName, { exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 本体: 担当外の利用者は、存在しない案件の実行予算を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    expect(await openExecutionBudget(page, MISSING_ID)).toBe(404);
    const missingMain = page.getByRole('main');
    await expect(page.getByText('実行予算はまだ作成されていません。')).toBeVisible({
      timeout: getTimeout(15000),
    });
    const missingText = (await missingMain.innerText()).split(MISSING_ID).join('<id>');

    expect(await openExecutionBudget(page, target.projectId)).toBe(404);
    await expect(page.getByText('実行予算はまだ作成されていません。')).toBeVisible({
      timeout: getTimeout(15000),
    });
    expect(
      (await page.getByRole('main').innerText()).split(target.projectId).join('<id>'),
      '存在しない案件と同じ表示'
    ).toBe(missingText);
    await expect(page.getByText(target.itemName)).toHaveCount(0);

    // API: 実行予算・未反映の変更契約・発注一覧・発注詳細・出来高・月別出来高・月次締め履歴・出力は
    // 存在しない案件と同じ 404 の本文で、案件 ID も実行予算 ID も含まない
    const headers = await bearerFor(request, outsider);
    for (const suffix of [
      '',
      '/unreflected-amendments',
      '/orders',
      `/orders/${target.orderId}`,
      '/progress',
      '/progress/monthly',
      '/progress/2026-10-01',
      '/monthly-close',
      `/orders/${target.orderId}/export?format=xlsx`,
      '/progress/monthly/export?format=xlsx',
    ]) {
      const missing = await request.get(
        `${API_BASE_URL}/api/projects/${MISSING_ID}/execution-budget${suffix}`,
        { headers }
      );
      const outOfScope = await request.get(
        `${API_BASE_URL}/api/projects/${target.projectId}/execution-budget${suffix}`,
        { headers }
      );
      expect(missing.status(), suffix).toBe(404);
      expect(outOfScope.status(), suffix).toBe(404);
      const body = (await outOfScope.json()) as Record<string, unknown>;
      expect(body.code, suffix).toBe('NOT_FOUND');
      expect(withoutInstance(body), suffix).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, suffix).not.toContain(target.projectId);
      expect(exposed, suffix).not.toContain(target.budgetId);
    }
  });

  /**
   * @requirement execution-budget-management/REQ-20.2
   * @requirement execution-budget-management/REQ-20.3
   * @requirement execution-budget-management/REQ-17.2
   */
  test('担当外の利用者の実行予算項目の編集・原価の入力・発注の操作・出来高の保存と削除・月次締め・削除は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const tradingPartnerId = await createTradingPartner();
    const target = await createFixture(
      'write',
      { salesPersonId: owner.id, createdById: owner.id },
      tradingPartnerId
    );
    const before = await snapshot(target.projectId);
    const headers = await bearerFor(request, outsider);
    const base = `${API_BASE_URL}/api/projects/${target.projectId}/execution-budget`;

    const responses = [
      await request.patch(`${base}/items/${target.itemIds[0]}`, {
        headers,
        data: { executionUnitPrice: '9999', version: 0 },
      }),
      await request.patch(`${base}/items/${target.itemIds[0]}/cost`, {
        headers,
        data: { currentMonthExpense: '777', version: 0 },
      }),
      await request.post(`${base}/orders`, { headers, data: { tradingPartnerId } }),
      await request.put(`${base}/orders/${target.orderId}/items`, {
        headers,
        data: { itemIds: target.itemIds },
      }),
      await request.patch(`${base}/orders/${target.orderId}/status`, {
        headers,
        data: { status: 'UNDER_REVIEW' },
      }),
      await request.post(`${base}/progress`, {
        headers,
        data: {
          constructionDate: '2026-10-02',
          items: [{ itemId: target.itemIds[0], amount: '100' }],
        },
      }),
      await request.delete(`${base}/progress/${target.progressRecordId}`, { headers }),
      await request.post(`${base}/monthly-close`, { headers, data: { targetMonth: '2026-10' } }),
      await request.delete(`${base}/orders/${target.orderId}`, { headers }),
      await request.delete(base, { headers }),
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
   * 他の案件（利用者にとって範囲外）の子・項目を指す要求は、応答は不在と同じ 404 のまま、子・項目の実際の
   * 案件を対象に要求ごとに 1 件記録する（20.9）。存在しない ID の要求は記録しない
   *
   * @requirement execution-budget-management/REQ-20.4
   * @requirement execution-budget-management/REQ-20.5
   * @requirement execution-budget-management/REQ-20.9
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の案件の経路で他の案件の発注・項目を指すと不在と同じ 404 になり、一括の要求に他の案件の項目が混じると全体が 404 で書き込まれず、範囲外の案件を対象に監査の記録が要求ごとに 1 件増える', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const tradingPartnerId = await createTradingPartner();
    const target = await createFixture(
      'own',
      { salesPersonId: owner.id, createdById: owner.id },
      tradingPartnerId
    );
    const foreign = await createFixture(
      'foreign',
      { salesPersonId: other.id, createdById: other.id },
      tradingPartnerId
    );
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const base = `${API_BASE_URL}/api/projects/${target.projectId}/execution-budget`;
    const prisma = getPrismaClient();

    /** 利用者が残した範囲外のアクセスの記録の件数（対象の案件を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });
    /** 要求の前後で、記録が全体で increase 件、うち案件 foreign を対象に increase 件増えたことを確かめる */
    const expectDenied = async <T>(
      label: string,
      increase: number,
      call: () => Promise<T>
    ): Promise<T> => {
      const allBefore = await deniedCount();
      const foreignBefore = await deniedCount(foreign.projectId);
      const result = await call();
      expect((await deniedCount()) - allBefore, `${label}: 記録の増分`).toBe(increase);
      expect(
        (await deniedCount(foreign.projectId)) - foreignBefore,
        `${label}: 記録の対象は子・項目の実際の案件`
      ).toBe(increase);
      return result;
    };

    // 子リソース: 他の案件の発注・項目・出来高記録は、存在しない ID と同じ 404。
    // 存在しない ID は記録せず、範囲外の案件の子は要求ごとに 1 件記録する
    for (const [crossedPath, missingPath] of [
      [`/orders/${foreign.orderId}`, `/orders/${MISSING_ID}`],
      [`/orders/${foreign.orderId}/export?format=xlsx`, `/orders/${MISSING_ID}/export?format=xlsx`],
    ] as const) {
      const missing = await expectDenied(missingPath, 0, () =>
        request.get(`${base}${missingPath}`, { headers })
      );
      const crossed = await expectDenied(crossedPath, 1, () =>
        request.get(`${base}${crossedPath}`, { headers })
      );
      expect(missing.status(), crossedPath).toBe(404);
      expect(crossed.status(), crossedPath).toBe(404);
      const crossedBody = (await crossed.json()) as Record<string, unknown>;
      expect(crossedBody.code, crossedPath).toBe('NOT_FOUND');
      expect(withoutInstance(crossedBody), crossedPath).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
      expect(JSON.stringify(withoutInstance(crossedBody)), crossedPath).not.toContain(
        foreign.projectId
      );
    }
    const crossedWrites = [
      await expectDenied('項目の原価の入力', 1, () =>
        request.patch(`${base}/items/${foreign.itemIds[0]}/cost`, {
          headers,
          data: { currentMonthExpense: '777', version: 0 },
        })
      ),
      await expectDenied('出来高記録の削除', 1, () =>
        request.delete(`${base}/progress/${foreign.progressRecordId}`, { headers })
      ),
      await expectDenied('発注の削除', 1, () =>
        request.delete(`${base}/orders/${foreign.orderId}`, { headers })
      ),
    ];
    for (const response of crossedWrites) {
      expect(response.status(), response.url()).toBe(404);
      expect(((await response.json()) as Record<string, unknown>).code, response.url()).toBe(
        'NOT_FOUND'
      );
    }

    // 一括: 自分の案件の項目と他の案件の項目が混じる要求は、存在しない項目が混じる要求と同じ 404
    const updateOrderItems = (itemIds: string[]) =>
      request.put(`${base}/orders/${target.orderId}/items`, { headers, data: { itemIds } });
    const saveProgress = (itemId: string) =>
      request.post(`${base}/progress`, {
        headers,
        data: {
          constructionDate: '2026-10-03',
          items: [
            { itemId: target.itemIds[0], amount: '100' },
            { itemId, amount: '200' },
          ],
        },
      });
    // 一括: 存在しない項目は記録せず、範囲外の案件の項目が混じる要求は案件ごとに 1 件記録する
    // （同じ案件の項目が 2 件混じっても 1 件）
    for (const [missing, crossed] of [
      [
        await expectDenied('チェック済み項目の更新（存在しない項目）', 0, () =>
          updateOrderItems([target.itemIds[1], MISSING_ID])
        ),
        await expectDenied('チェック済み項目の更新（範囲外の案件の項目 2 件）', 1, () =>
          updateOrderItems([target.itemIds[1], foreign.itemIds[0], foreign.itemIds[1]])
        ),
      ],
      [
        await expectDenied('出来高の保存（存在しない項目）', 0, () => saveProgress(MISSING_ID)),
        await expectDenied('出来高の保存（範囲外の案件の項目）', 1, () =>
          saveProgress(foreign.itemIds[0])
        ),
      ],
    ] as const) {
      expect(missing.status(), crossed.url()).toBe(404);
      expect(crossed.status(), crossed.url()).toBe(404);
      const crossedBody = (await crossed.json()) as Record<string, unknown>;
      expect(crossedBody.code, crossed.url()).toBe('NOT_FOUND');
      expect(withoutInstance(crossedBody), crossed.url()).toEqual(
        withoutInstance((await missing.json()) as Record<string, unknown>)
      );
    }

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });
});
