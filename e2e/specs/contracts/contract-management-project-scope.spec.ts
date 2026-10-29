/**
 * @fileoverview 契約書の API への案件の閲覧範囲の適用の E2E テスト
 *
 * contract-management タスク19.1。design.md の「Requirement 14: 案件の閲覧範囲の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。プロジェクトの配下の経路で、経路のプロジェクトに属さない契約書は
 * 不在と同じ 404 にする。作成・更新の要求が指す見積書が契約書のプロジェクトに属さなければ見積書の不在と同じ
 * 404 にし、変更契約の基となる契約書が経路のプロジェクトに属さなければ不在と同じ 422 にする。
 *
 * 被覆する受入基準（contract-management の Requirement 13.1、14.1〜14.7）は各テストの `@requirement` の印が名乗る。
 *
 * 検証に使う案件・見積書・契約書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で
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
const NAME_PREFIX = 'e2e-cm-scope-';

/** どの行としても存在しない ID（版 4・変種 8 の整った UUID） */
const MISSING_ID = '00000000-0000-4000-8000-000000019101';

interface Fixture {
  projectId: string;
  estimateId: string;
  estimateName: string;
  contractId: string;
}

/** 一意の接尾辞 */
function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(3).toString('hex')}`;
}

/** 案件・見積書・契約書を DB に作る */
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
  const estimateName = `閲覧範囲検証の見積書 ${label}-${suffix}`;
  const estimate = await prisma.estimate.create({
    data: { projectId: project.id, name: estimateName },
    select: { id: true },
  });
  const contract = await prisma.contract.create({
    data: {
      projectId: project.id,
      contractType: 'NEW',
      status: 'BEFORE_CONTRACT',
      estimateId: estimate.id,
      contractDate: new Date('2026-04-01'),
      constructionStartDate: new Date('2026-05-01'),
      constructionEndDate: new Date('2026-12-31'),
      deliveryDate: new Date('2027-01-15'),
      taxRate: 0.1,
      contractAmount: 11000000,
      constructionPrice: 10000000,
      taxAmount: 1000000,
    },
    select: { id: true },
  });
  return { projectId: project.id, estimateId: estimate.id, estimateName, contractId: contract.id };
}

/** 案件の契約書の状態（範囲外の要求の前後で変わらないことを比べる） */
async function snapshot(projectId: string): Promise<unknown> {
  return getPrismaClient().contract.findMany({
    where: { projectId },
    select: {
      id: true,
      estimateId: true,
      status: true,
      paymentTerms: true,
      version: true,
      deletedAt: true,
      updatedAt: true,
    },
    orderBy: { id: 'asc' },
  });
}

/** 作成・更新の要求の本文 */
function contractBody(estimateId: string): Record<string, unknown> {
  return {
    estimateId,
    contractDate: '2026-04-01',
    constructionStartDate: '2026-05-01',
    constructionEndDate: '2026-12-31',
    deliveryDate: '2027-01-15',
    taxRate: 0.1,
    paymentTerms: '侵入の試み',
    separateConstruction: '',
    otherNotes: '',
    supervisorTradingPartnerId: null,
    contractAmount: 11000000,
    constructionPrice: 10000000,
    taxAmount: 1000000,
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

/** 契約書詳細画面の URL を直接開き、契約書の取得の応答を待つ（オリジンは問わずパスで照合する） */
async function openContract(page: Page, projectId: string, contractId: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/contracts/${contractId}`,
    { timeout: getTimeout(30000) }
  );
  await page.goto(`/projects/${projectId}/contracts/${contractId}`);
  return (await loaded).status();
}

/**
 * 読み込み中の表示が消えた後の、本文の領域の表示の文字列。
 * 契約書詳細画面は共通の枠の main の内側に自分の main を置くため、内側（文書の順で後ろ）を読む
 */
async function settledMainText(page: Page): Promise<string> {
  const main = page.getByRole('main').last();
  await expect(main.getByText('読み込み中...')).toHaveCount(0, { timeout: getTimeout(15000) });
  return main.innerText();
}

test.describe('契約書の案件の閲覧範囲', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    // 見積書・契約書は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement contract-management/REQ-13.1
   * @requirement contract-management/REQ-14.1
   * @requirement contract-management/REQ-14.2
   * @requirement contract-management/REQ-14.3
   * @requirement contract-management/REQ-14.7
   */
  test('担当外の利用者が契約書の URL を直接開くと存在しない契約書と同じ表示になり、一覧・詳細の API も存在しない ID と同じ 404 を返す', async ({
    page,
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    // 一般ユーザー（user ロール）は契約書の閲覧の権限を持ち、範囲の判定まで届く
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('direct-url', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });

    // 対照: 関係者（営業担当者・作成者）は契約書詳細画面を開け、見積書の名前が表示される
    await loginAsUser(page, owner);
    expect(await openContract(page, target.projectId, target.contractId)).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '契約書詳細' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByText(target.estimateName)).toBeVisible();

    // 本体: 担当外の利用者は、存在しない契約書を開いたときと同じ表示になる
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, outsider);
    expect(await openContract(page, target.projectId, MISSING_ID)).toBe(404);
    const missingText = await settledMainText(page);
    expect(missingText.trim().length, '存在しない契約書の表示がある').toBeGreaterThan(0);

    expect(await openContract(page, target.projectId, target.contractId)).toBe(404);
    expect(await settledMainText(page), '存在しない契約書と同じ表示').toBe(missingText);
    await expect(page.getByText(target.estimateName)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: '契約書詳細' })).toHaveCount(0);

    // API: 一覧・詳細・プロジェクトの配下の詳細は、存在しない ID と同じ 404 の本文で、案件 ID も契約書 ID も含まない
    const headers = await bearerFor(request, outsider);
    for (const [outOfScopePath, missingPath] of [
      [`/api/projects/${target.projectId}/contracts`, `/api/projects/${MISSING_ID}/contracts`],
      [`/api/contracts/${target.contractId}`, `/api/contracts/${MISSING_ID}`],
      [
        `/api/projects/${target.projectId}/contracts/${target.contractId}`,
        `/api/projects/${target.projectId}/contracts/${MISSING_ID}`,
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
      expect(exposed, outOfScopePath).not.toContain(target.contractId);
      expect(exposed, outOfScopePath).not.toContain(target.estimateName);
    }

    // 対照: 関係者の一覧には当該案件の契約書が載る（14.1・14.7）
    const ownerHeaders = await bearerFor(request, owner);
    const list = await request.get(`${API_BASE_URL}/api/projects/${target.projectId}/contracts`, {
      headers: ownerHeaders,
    });
    expect(list.status()).toBe(200);
    const listed = ((await list.json()) as { contracts: Array<{ id: string }> }).contracts.map(
      (c) => c.id
    );
    expect(listed).toEqual([target.contractId]);
  });

  /**
   * 一般ユーザー（user ロール）は契約書の削除の権限を持たないため、削除は範囲の判定より先に 403 になる
   * （Requirement 13.4）。削除の範囲外の 404 は統合テストが確かめる。
   *
   * @requirement contract-management/REQ-14.2
   * @requirement contract-management/REQ-14.3
   */
  test('担当外の利用者の契約書の作成・更新・ステータスの変更は 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('write', { salesPersonId: owner.id, createdById: owner.id });
    const before = await snapshot(target.projectId);
    const headers = await bearerFor(request, outsider);
    const base = `${API_BASE_URL}/api/contracts/${target.contractId}`;

    const responses = [
      await request.post(`${API_BASE_URL}/api/projects/${target.projectId}/contracts`, {
        headers,
        data: { ...contractBody(target.estimateId), contractType: 'NEW', parentContractId: null },
      }),
      await request.put(base, {
        headers,
        data: { ...contractBody(target.estimateId), version: 0 },
      }),
      await request.patch(`${base}/status`, { headers, data: { status: 'CONTRACTED' } }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code, response.url()).toBe('NOT_FOUND');
      const exposed = JSON.stringify(withoutInstance(body));
      expect(exposed, response.url()).not.toContain(target.projectId);
      expect(exposed, response.url()).not.toContain(target.contractId);
    }

    expect(await snapshot(target.projectId)).toEqual(before);
  });

  /**
   * @requirement contract-management/REQ-14.4
   */
  test('自分の案件の配下の経路で他の案件の契約書を指すと契約書の不在と同じ 404 になり、データは変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('own', { salesPersonId: owner.id, createdById: owner.id });
    const foreign = await createFixture('foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const nested = `${API_BASE_URL}/api/projects/${target.projectId}/contracts`;

    const missing = await request.get(`${nested}/${MISSING_ID}`, { headers });
    expect(missing.status()).toBe(404);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    const responses = [
      await request.get(`${nested}/${foreign.contractId}`, { headers }),
      await request.put(`${nested}/${foreign.contractId}`, {
        headers,
        data: { ...contractBody(foreign.estimateId), version: 0 },
      }),
      await request.patch(`${nested}/${foreign.contractId}/status`, {
        headers,
        data: { status: 'CONTRACTED' },
      }),
    ];
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      expect(
        withoutInstance((await response.json()) as Record<string, unknown>),
        '契約書の不在と同じ本文'
      ).toEqual(missingBody);
    }

    // 対照: 経路の案件と契約書の案件が一致すれば従来どおり読める
    const own = await request.get(`${nested}/${target.contractId}`, { headers });
    expect(own.status()).toBe(200);

    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 応答は不在と同じ 404 のまま、契約書の実際の案件が範囲外なら範囲外の拒否として記録する
   * （contract-management タスク20.2。user-authentication の要件39.8 の本機能への適用）。
   * 不在の契約書と、範囲内の他の案件の契約書（経路の誤り）は記録しない。
   *
   * @requirement contract-management/REQ-14.9
   * @requirement user-authentication/REQ-39.8
   */
  test('自分の案件の配下の経路で範囲外の案件の契約書を指すと 404 になり、契約書の案件を対象に監査の記録が 1 件増える', async ({
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
    const nested = `${API_BASE_URL}/api/projects/${target.projectId}/contracts`;

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      getPrismaClient().auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });

    // 不在の契約書: 404 で記録しない
    const missingBefore = await deniedCount();
    const missing = await request.get(`${nested}/${MISSING_ID}`, { headers });
    expect(missing.status()).toBe(404);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect((await deniedCount()) - missingBefore, '不在の契約書は記録しない').toBe(0);

    // 範囲内の他の案件の契約書（経路の誤り）: 不在と同じ 404 で記録しない
    const siblingBefore = await deniedCount();
    const misrouted = await request.get(`${nested}/${sibling.contractId}`, { headers });
    expect(misrouted.status()).toBe(404);
    expect(withoutInstance((await misrouted.json()) as Record<string, unknown>)).toEqual(
      missingBody
    );
    expect((await deniedCount()) - siblingBefore, '範囲内の食い違いは記録しない').toBe(0);

    // 範囲外の案件の契約書: 不在と同じ 404 で、契約書の案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const outOfScope = await request.get(`${nested}/${foreign.contractId}`, { headers });
    expect(outOfScope.status()).toBe(404);
    expect(
      withoutInstance((await outOfScope.json()) as Record<string, unknown>),
      '契約書の不在と同じ本文'
    ).toEqual(missingBody);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect(
      (await deniedCount(foreign.projectId)) - foreignBefore,
      '記録の対象は契約書の実際の案件'
    ).toBe(1);

    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * @requirement contract-management/REQ-14.5
   * @requirement contract-management/REQ-14.6
   */
  test('自分の案件の契約書の作成・更新で他の案件の見積書や契約書を指すと不在と同じ応答になり、契約書は作られず変わらない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('ref-own', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('ref-foreign', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const createUrl = `${API_BASE_URL}/api/projects/${target.projectId}/contracts`;

    /** 本文の中の要求が指した ID を置き換える（不在の応答と ID 以外が同じことを比べるため） */
    const masked = async (
      response: Awaited<ReturnType<APIRequestContext['post']>>,
      id: string
    ): Promise<unknown> =>
      JSON.parse(
        JSON.stringify(withoutInstance((await response.json()) as Record<string, unknown>))
          .split(id)
          .join('<requested-id>')
      );

    // 14.5: 作成の見積書
    const createWith = (estimateId: string) =>
      request.post(createUrl, {
        headers,
        data: { ...contractBody(estimateId), contractType: 'NEW', parentContractId: null },
      });
    const missingEstimate = await createWith(MISSING_ID);
    const foreignEstimate = await createWith(foreign.estimateId);
    expect(missingEstimate.status()).toBe(404);
    expect(foreignEstimate.status()).toBe(404);
    expect(await masked(foreignEstimate, foreign.estimateId), '見積書の不在と同じ本文').toEqual(
      await masked(missingEstimate, MISSING_ID)
    );

    // 14.5: 更新の見積書
    const updateWith = (estimateId: string) =>
      request.put(`${API_BASE_URL}/api/contracts/${target.contractId}`, {
        headers,
        data: { ...contractBody(estimateId), version: 0 },
      });
    const missingUpdate = await updateWith(MISSING_ID);
    const foreignUpdate = await updateWith(foreign.estimateId);
    expect(missingUpdate.status()).toBe(404);
    expect(foreignUpdate.status()).toBe(404);
    expect(await masked(foreignUpdate, foreign.estimateId)).toEqual(
      await masked(missingUpdate, MISSING_ID)
    );

    // 14.6: 変更契約の基となる契約書
    const amendWith = (parentContractId: string) =>
      request.post(createUrl, {
        headers,
        data: { ...contractBody(target.estimateId), contractType: 'AMENDMENT', parentContractId },
      });
    const missingParent = await amendWith(MISSING_ID);
    const foreignParent = await amendWith(foreign.contractId);
    expect(missingParent.status()).toBe(422);
    expect(foreignParent.status()).toBe(422);
    const foreignParentBody = (await foreignParent.json()) as Record<string, unknown>;
    expect(withoutInstance(foreignParentBody), '基となる契約書の不在と同じ本文').toEqual(
      withoutInstance((await missingParent.json()) as Record<string, unknown>)
    );

    for (const body of [
      await foreignEstimate.json(),
      await foreignUpdate.json(),
      foreignParentBody,
    ]) {
      const exposed = JSON.stringify(body);
      expect(exposed).not.toContain(foreign.projectId);
      expect(exposed).not.toContain(foreign.estimateName);
    }

    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });
});
