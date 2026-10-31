/**
 * @fileoverview 契約書の API への案件の閲覧範囲の適用の E2E テスト
 *
 * contract-management タスク19.1。design.md の「Requirement 14: 案件の閲覧範囲の適用」の章。
 * 本機能の API は経路ごとに案件の閲覧範囲の判定部品（user-authentication の requireProjectScope）を通り、
 * 範囲外を存在しない場合と同じ汎用の 404 にする。プロジェクトの配下の経路で、経路のプロジェクトに属さない契約書は
 * 不在と同じ 404 にする。作成・更新の要求が指す見積書が契約書のプロジェクトに属さなければ見積書の不在と同じ
 * 404 にし、変更契約の基となる契約書が経路のプロジェクトに属さなければ不在と同じ 422 にする。
 *
 * 被覆する受入基準（contract-management の Requirement 11.8・11.9、13.1、14.1〜14.10 と、user-authentication の
 * Requirement 39.8）は各テストの `@requirement` の印が名乗る。
 *
 * タスク21.1 で、画面が 404 を受けたときの表示（Requirement 11.8・11.9）を足した。範囲外と不在は同じ 404 であり、
 * 画面は見つからない旨（共通部品 ResourceNotFound、操作では見つからない旨のメッセージ）を表示し、予期しない
 * エラーや取得の失敗を告げる文言と再試行の釦を出さない。
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

/** 画面の URL を直接開き、指定のパスの GET の応答を待つ（オリジンは問わずパスで照合する） */
async function openAndWait(page: Page, url: string, apiPath: string): Promise<number> {
  const loaded = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === apiPath,
    { timeout: getTimeout(30000) }
  );
  await page.goto(url);
  return (await loaded).status();
}

/** 契約書の画面が 404 を受けたときに出してはならない、障害を告げる文言（REQ-11.8・11.9） */
const FAILURE_TEXTS = [
  '予期しないエラーが発生しました。',
  '契約書の取得に失敗しました',
  '削除に失敗しました',
] as const;

/** 障害を告げる文言と再試行の釦が画面のどこにも無いことを主張する */
async function expectNoFailureFeedback(page: Page): Promise<void> {
  for (const text of FAILURE_TEXTS) {
    await expect(page.getByText(text), text).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
}

/** 契約書の不在の表示（ResourceNotFound）。戻り先は案件の契約書の一覧 */
async function expectContractNotFound(page: Page, projectId: string): Promise<void> {
  const main = page.getByRole('main').last();
  await expect(main.getByRole('heading', { name: '契約書が見つかりません' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(main.getByRole('link', { name: '契約書一覧に戻る' })).toHaveAttribute(
    'href',
    `/projects/${projectId}/contracts`
  );
  await expectNoFailureFeedback(page);
}

/** プロジェクトの不在の表示（ResourceNotFound）。戻り先はプロジェクトの一覧 */
async function expectProjectNotFound(page: Page): Promise<void> {
  const main = page.getByRole('main').last();
  await expect(main.getByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeVisible({
    timeout: getTimeout(15000),
  });
  await expect(main.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  await expectNoFailureFeedback(page);
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
   * 論理削除済みの契約書も、データベースに実在する限り契約書の実際の案件で判定する（contract-management
   * タスク22.1。user-authentication の要件39.8 の 2026-10-30 の改訂の本機能への適用）。範囲外の案件の
   * 論理削除済みの契約書を `/api/contracts/:id` の詳細と、自分の案件の配下の経路で指すと、存在しない契約書と
   * 同じ 404 のまま、契約書の案件を対象に要求ごとに 1 件記録する。データは変わらない。
   *
   * @requirement contract-management/REQ-14.9
   * @requirement contract-management/REQ-14.10
   * @requirement user-authentication/REQ-39.8
   */
  test('範囲外の案件の論理削除済みの契約書を詳細の API と自分の案件の配下の経路で指すと、存在しない契約書と同じ 404 になり、契約書の案件を対象に監査の記録が 1 件ずつ増える', async ({
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
    await getPrismaClient().contract.update({
      where: { id: foreign.contractId },
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
        `${API_BASE_URL}/api/contracts/${foreign.contractId}`,
        `${API_BASE_URL}/api/contracts/${MISSING_ID}`,
      ],
      [
        '自分の案件の配下の経路',
        `${API_BASE_URL}/api/projects/${target.projectId}/contracts/${foreign.contractId}`,
        `${API_BASE_URL}/api/projects/${target.projectId}/contracts/${MISSING_ID}`,
      ],
    ];
    for (const [label, deletedUrl, missingUrl] of cases) {
      // 存在しない契約書: 404 で記録しない
      const missingBefore = await deniedCount();
      const missing = await request.get(missingUrl, { headers });
      expect(missing.status(), `${label}: 不在`).toBe(404);
      const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
      expect((await deniedCount()) - missingBefore, `${label}: 不在の契約書は記録しない`).toBe(0);

      // 範囲外の案件の論理削除済みの契約書: 不在と同じ 404 で、契約書の案件を対象に 1 件記録する
      const allBefore = await deniedCount();
      const foreignBefore = await deniedCount(foreign.projectId);
      const response = await request.get(deletedUrl, { headers });
      expect(response.status(), label).toBe(404);
      expect(
        withoutInstance((await response.json()) as Record<string, unknown>),
        `${label}: 契約書の不在と同じ本文`
      ).toEqual(missingBody);
      expect((await deniedCount()) - allBefore, `${label}: 記録は 1 件だけ増える`).toBe(1);
      expect(
        (await deniedCount(foreign.projectId)) - foreignBefore,
        `${label}: 記録の対象は契約書の実際の案件`
      ).toBe(1);
    }

    expect(await snapshot(foreign.projectId)).toEqual(beforeForeign);
  });

  /**
   * 変更契約の作成で、基となる契約書の所属の照合を論理削除の確かめより先に置く（contract-management
   * タスク22.2。design.md の「2026-10-30 の追加」章の「決定」の「基となる契約書の照合の順」）。範囲外の案件の
   * 論理削除済みの契約書を基に指す作成は、存在しない基と同じ 422 と本文のまま、基となる契約書の案件を対象に
   * 1 件記録し、契約書を作らない。同じプロジェクトの論理削除済みの基は同じ 422 で記録しない。
   *
   * @requirement contract-management/REQ-14.8
   */
  test('範囲外の案件の論理削除済みの契約書を基に指す変更契約の作成は、存在しない基と同じ 422 になり、基の案件を対象に監査の記録が 1 件増え、契約書は作られない', async ({
    request,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const other = await createSessionUser('REGULAR_USER');
    const target = await createFixture('amend-own-deleted', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    const foreign = await createFixture('amend-foreign-deleted', {
      salesPersonId: other.id,
      createdById: other.id,
    });
    const prisma = getPrismaClient();
    await prisma.contract.update({
      where: { id: foreign.contractId },
      data: { deletedAt: new Date() },
    });
    const ownDeleted = await prisma.contract.create({
      data: {
        projectId: target.projectId,
        contractType: 'NEW',
        status: 'BEFORE_CONTRACT',
        estimateId: target.estimateId,
        contractDate: new Date('2026-04-01'),
        constructionStartDate: new Date('2026-05-01'),
        constructionEndDate: new Date('2026-12-31'),
        deliveryDate: new Date('2027-01-15'),
        taxRate: 0.1,
        contractAmount: 11000000,
        constructionPrice: 10000000,
        taxAmount: 1000000,
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    const beforeTarget = await snapshot(target.projectId);
    const beforeForeign = await snapshot(foreign.projectId);
    const headers = await bearerFor(request, owner);
    const createUrl = `${API_BASE_URL}/api/projects/${target.projectId}/contracts`;

    /** 利用者が残した範囲外のアクセスの記録の件数（対象を指定すればその案件だけ） */
    const deniedCount = (targetId?: string): Promise<number> =>
      prisma.auditLog.count({
        where: {
          action: 'PROJECT_SCOPE_DENIED',
          actorId: owner.id,
          ...(targetId ? { targetId } : {}),
        },
      });
    const amendWith = (parentContractId: string) =>
      request.post(createUrl, {
        headers,
        data: { ...contractBody(target.estimateId), contractType: 'AMENDMENT', parentContractId },
      });

    // 存在しない基: 422 で記録しない
    const missingBefore = await deniedCount();
    const missing = await amendWith(MISSING_ID);
    expect(missing.status(), '存在しない基').toBe(422);
    const missingBody = withoutInstance((await missing.json()) as Record<string, unknown>);
    expect(missingBody.code).toBe('CONTRACT_VALIDATION_ERROR');
    expect((await deniedCount()) - missingBefore, '存在しない基は記録しない').toBe(0);

    // 範囲外の案件の論理削除済みの基: 不在と同じ 422 で、基となる契約書の案件を対象に 1 件記録する
    const allBefore = await deniedCount();
    const foreignBefore = await deniedCount(foreign.projectId);
    const foreignParent = await amendWith(foreign.contractId);
    expect(foreignParent.status(), '範囲外の案件の論理削除済みの基').toBe(422);
    const foreignParentBody = withoutInstance(
      (await foreignParent.json()) as Record<string, unknown>
    );
    expect(foreignParentBody, '基となる契約書の不在と同じ本文').toEqual(missingBody);
    const exposed = JSON.stringify(foreignParentBody);
    expect(exposed).not.toContain(foreign.projectId);
    expect(exposed).not.toContain(foreign.contractId);
    expect((await deniedCount()) - allBefore, '記録は 1 件だけ増える').toBe(1);
    expect(
      (await deniedCount(foreign.projectId)) - foreignBefore,
      '記録の対象は基となる契約書の案件'
    ).toBe(1);

    // 同じプロジェクトの論理削除済みの基: 不在と同じ 422 で記録しない
    const ownBefore = await deniedCount();
    const ownParent = await amendWith(ownDeleted.id);
    expect(ownParent.status(), '同じプロジェクトの論理削除済みの基').toBe(422);
    expect(
      withoutInstance((await ownParent.json()) as Record<string, unknown>),
      '同じプロジェクトの論理削除済みの基も不在と同じ本文'
    ).toEqual(missingBody);
    expect(
      (await deniedCount()) - ownBefore,
      '同じプロジェクトの論理削除済みの基は記録しない'
    ).toBe(0);

    // 契約書は作られず、どちらの案件の契約書も変わらない
    expect(await snapshot(target.projectId)).toEqual(beforeTarget);
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
  /**
   * 契約書の詳細・編集の画面は契約書の読み込みの 404 で、一覧・作成の画面はプロジェクトの読み込みの 404 で、
   * 見つからない旨と戻り先の一覧へのリンクを表示する（contract-management タスク21.1）。範囲外と不在は同じ表示。
   *
   * @requirement contract-management/REQ-11.8
   */
  test('担当外の利用者が契約書の画面の URL を開くと見つからない旨と一覧へのリンクが表示され、存在しない対象と同じ表示になる', async ({
    page,
  }) => {
    const owner = await createSessionUser('REGULAR_USER');
    const outsider = await createSessionUser('REGULAR_USER');
    const target = await createFixture('not-found-view', {
      salesPersonId: owner.id,
      createdById: owner.id,
    });
    await loginAsUser(page, outsider);

    // 詳細・編集の画面: 契約書が見つからない旨と、案件の契約書の一覧へのリンク
    for (const suffix of ['', '/edit']) {
      const missingUrl = `/projects/${target.projectId}/contracts/${MISSING_ID}${suffix}`;
      const scopedUrl = `/projects/${target.projectId}/contracts/${target.contractId}${suffix}`;
      expect(await openAndWait(page, missingUrl, `/api/contracts/${MISSING_ID}`)).toBe(404);
      await expectContractNotFound(page, target.projectId);
      const missingText = await settledMainText(page);

      expect(await openAndWait(page, scopedUrl, `/api/contracts/${target.contractId}`)).toBe(404);
      await expectContractNotFound(page, target.projectId);
      expect(await settledMainText(page), `${scopedUrl} は存在しない契約書と同じ表示`).toBe(
        missingText
      );
      await expect(page.getByText(target.estimateName)).toHaveCount(0);
    }

    // 一覧の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/contracts`,
        `/api/projects/${MISSING_ID}/contracts`
      )
    ).toBe(404);
    await expectProjectNotFound(page);
    const missingListText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/contracts`,
        `/api/projects/${target.projectId}/contracts`
      )
    ).toBe(404);
    await expectProjectNotFound(page);
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingListText);

    // 作成の画面: プロジェクトが見つからない旨と、プロジェクトの一覧へのリンク。フォームを出さない
    expect(
      await openAndWait(
        page,
        `/projects/${MISSING_ID}/contracts/new`,
        `/api/projects/${MISSING_ID}`
      )
    ).toBe(404);
    await expectProjectNotFound(page);
    const missingCreateText = await settledMainText(page);
    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/contracts/new`,
        `/api/projects/${target.projectId}`
      )
    ).toBe(404);
    await expectProjectNotFound(page);
    expect(await settledMainText(page), '存在しないプロジェクトと同じ表示').toBe(missingCreateText);
    await expect(page.getByRole('button', { name: '作成', exact: true })).toHaveCount(0);
  });

  /**
   * 開いた後に契約書が論理削除されると、保存・ステータスの変更・削除の要求は不在と同じ 404 を受ける。
   * 画面は契約書が見つからない旨のメッセージを表示し、予期しないエラーや削除の失敗の文言を出さない
   * （contract-management タスク21.1）。削除の権限を持つ管理者で操作する。
   *
   * @requirement contract-management/REQ-11.9
   */
  test('開いた後に論理削除された契約書の保存・ステータスの変更・削除で、契約書が見つからない旨のメッセージが表示される', async ({
    page,
  }) => {
    const admin = await createSessionUser('ADMIN_USER');
    const editTarget = await createFixture('gone-edit', {
      salesPersonId: admin.id,
      createdById: admin.id,
    });
    const detailTarget = await createFixture('gone-detail', {
      salesPersonId: admin.id,
      createdById: admin.id,
    });
    const softDelete = (id: string) =>
      getPrismaClient().contract.update({ where: { id }, data: { deletedAt: new Date() } });
    const notFoundMessage = '契約書が見つかりません。存在しないか、削除されています。';
    await loginAsUser(page, admin);

    // 編集の画面の保存
    expect(
      await openAndWait(
        page,
        `/projects/${editTarget.projectId}/contracts/${editTarget.contractId}/edit`,
        `/api/contracts/${editTarget.contractId}`
      )
    ).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '契約書編集' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await softDelete(editTarget.contractId);
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname === `/api/contracts/${editTarget.contractId}`
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saved).status()).toBe(404);
    await expect(
      page.getByRole('main').last().getByRole('alert').filter({ hasText: notFoundMessage })
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/contracts/${editTarget.contractId}/edit$`));
    await expectNoFailureFeedback(page);

    // 詳細の画面のステータスの変更
    expect(
      await openAndWait(
        page,
        `/projects/${detailTarget.projectId}/contracts/${detailTarget.contractId}`,
        `/api/contracts/${detailTarget.contractId}`
      )
    ).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '契約書詳細' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await softDelete(detailTarget.contractId);
    const statusChanged = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === `/api/contracts/${detailTarget.contractId}/status`
    );
    await page.getByRole('button', { name: /契約済にする/ }).click();
    expect((await statusChanged).status()).toBe(404);
    await expect(page.getByText(notFoundMessage).first()).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);

    // 詳細の画面の削除（確認のダイアログ）
    await page.getByRole('button', { name: '削除', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const deleted = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        new URL(r.url()).pathname === `/api/contracts/${detailTarget.contractId}`
    );
    await dialog.getByRole('button', { name: '削除する' }).click();
    expect((await deleted).status()).toBe(404);
    await expect(dialog.getByRole('alert')).toHaveText(notFoundMessage, {
      timeout: getTimeout(10000),
    });
    await expectNoFailureFeedback(page);
    // 一覧へ遷移しない（削除の成功として扱わない）
    await expect(page).toHaveURL(new RegExp(`/contracts/${detailTarget.contractId}$`));
  });

  /**
   * 作成の画面を開いた後にプロジェクトが論理削除されると、作成の要求は不在と同じ 404 を受ける。画面は
   * プロジェクトが見つからない旨のメッセージ（ContractCreatePage は作成の 404 を `notFoundTarget: 'project'` で
   * 分類する）を表示し、予期しないエラーやシステムエラーの文言、契約書が見つからない旨を出さない。契約書は
   * 作られない（contract-management タスク21.1）。
   *
   * @requirement contract-management/REQ-11.9
   */
  test('作成の画面を開いた後にプロジェクトが論理削除されると、作成でプロジェクトが見つからない旨のメッセージが表示され、契約書は作られない', async ({
    page,
  }) => {
    const admin = await createSessionUser('ADMIN_USER');
    const target = await createFixture('gone-create', {
      salesPersonId: admin.id,
      createdById: admin.id,
    });
    const prisma = getPrismaClient();
    const projectGone = 'プロジェクトが見つかりません。存在しないか、削除されています。';
    await loginAsUser(page, admin);

    expect(
      await openAndWait(
        page,
        `/projects/${target.projectId}/contracts/new`,
        `/api/projects/${target.projectId}`
      )
    ).toBe(200);
    const createPage = page.getByTestId('contract-create-page');
    await expect(createPage.getByRole('heading', { level: 1, name: '契約書作成' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const estimateSelect = createPage.locator('select#estimateId');
    await expect(estimateSelect.locator(`option[value="${target.estimateId}"]`)).toHaveCount(1, {
      timeout: getTimeout(15000),
    });
    await estimateSelect.selectOption(target.estimateId);
    await createPage.locator('#contractDate').fill('2026-04-01');
    await createPage.locator('#constructionStartDate').fill('2026-05-01');
    await createPage.locator('#constructionEndDate').fill('2026-12-31');
    await createPage.locator('#deliveryDate').fill('2027-01-15');
    // 操作の前は作成の失敗の表示が無い（後の主張が前の表示を拾わない）
    await expect(createPage.getByRole('alert')).toHaveCount(0);
    const before = await prisma.contract.count({ where: { projectId: target.projectId } });

    await prisma.project.update({
      where: { id: target.projectId },
      data: { deletedAt: new Date() },
    });
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/projects/${target.projectId}/contracts`,
      { timeout: getTimeout(30000) }
    );
    await createPage.getByRole('button', { name: '作成', exact: true }).click();
    expect((await created).status()).toBe(404);

    await expect(createPage.getByRole('alert')).toHaveText(projectGone, {
      timeout: getTimeout(10000),
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${target.projectId}/contracts/new$`));
    await expectNoFailureFeedback(page);
    for (const text of [
      'システムエラーが発生しました。しばらくしてからお試しください。',
      '契約書が見つかりません。存在しないか、削除されています。',
    ]) {
      await expect(page.getByText(text), text).toHaveCount(0);
    }
    expect(
      await prisma.contract.count({ where: { projectId: target.projectId } }),
      '契約書は作られない'
    ).toBe(before);
    expect(before, '作成の前の契約書は fixture の 1 件').toBe(1);
  });
});
