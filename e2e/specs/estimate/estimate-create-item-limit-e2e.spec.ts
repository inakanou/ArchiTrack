/**
 * @fileoverview 内訳書からの見積書の作成の件数の上限の E2E テスト
 *
 * estimate-creation タスク69.1。design.md の「2026-11-01 の追加: 保存の上限の超過の画面の表示と、
 * 内訳書からの作成の件数の上限」の章の「決定」の「内訳書からの作成の件数の上限」。
 *
 * 内訳書から見積書を作ると、内訳書の項目 1 件につき根の見積項目 1 件を作る。作る見積項目の数が
 * 一括保存の総数の上限（Requirement 42.10、2000）を超えるなら、一括保存と同じ 422 で拒み、見積書を
 * 作らない（Requirement 3.6）。本ファイルは 2001 件の拒否（書き込まない）と、上限の内側（3 件）の
 * 対照（書き込む）を主張する。上限ちょうど（2000 件）で通ることは単体が主張する（作成のサービスの単体）。
 * 上限ちょうどの作成は所要が作成のトランザクションの既定の制限時間に迫る（統合の実測で 9738 ms の 500 が
 * 1 回）ため、本ファイルに常設しない。
 *
 * 内訳書は利用者と同じ経路で用意する: 数量表の保存の API（PUT /api/quantity-tables/:id/save）で
 * 集計で一つにまとまらない名前の数量項目を並べ、内訳書の作成の API で集計する。数量表の保存は
 * 一つの数量グループの数量項目を 2000 件までに限るため（quantity-table-generation の 42.11）、
 * 2000 件ごとに数量グループを分ける。
 *
 * 画面の表示（Requirement 3.7）はタスク69.2 の担当で、69.2 で本ファイルへ足す予定である。
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getAccessToken } from '../../helpers/auth-api';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPrepared } from '../../helpers/preconditions';
import { createTestProject } from '../../helpers/quantity-table-preconditions';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

/** 実行ごとに一意な接頭辞（数量項目の名前が集計の鍵になるため） */
const RUN_ID = Date.now().toString(36);

/** 一括保存の総数の上限（estimate-creation の 42.10。backend の SAVE_ESTIMATE_MAX_ITEMS） */
const SAVE_ESTIMATE_MAX_ITEMS = 2000;

/** 対照に用いる上限の内側の件数 */
const WITHIN_LIMIT_ITEMS = 3;

/** 数量表の保存の一つの数量グループの数量項目の数の上限（quantity-table-generation の 42.11） */
const QUANTITY_ITEMS_PER_GROUP = 2000;

/** 件数の上限の 422 の文言（backend の SAVE_ESTIMATE_VALIDATION_MESSAGES.ITEMS_TOO_MANY） */
const ITEMS_TOO_MANY = '見積明細は合計2000件以内で保存してください';

/**
 * 内訳書の項目を `count` 件持つ内訳書を、数量表の保存と内訳書の作成の API で用意する。
 *
 * @returns 作った内訳書の ID
 */
async function prepareItemizedStatement(
  request: APIRequestContext,
  token: string,
  projectId: string,
  label: string,
  count: number
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };
  const tableName = `件数上限_${label}_${RUN_ID}`;

  const created = await request.post(`${API_BASE_URL}/api/projects/${projectId}/quantity-tables`, {
    headers,
    data: { name: tableName },
  });
  expect(created.status(), '前提: 数量表を作成できる').toBe(201);
  const { id: tableId } = (await created.json()) as { id: string };

  const detail = await request.get(`${API_BASE_URL}/api/quantity-tables/${tableId}`, { headers });
  expect(detail.status(), '前提: 数量表を取得できる').toBe(200);
  const { updatedAt } = (await detail.json()) as { updatedAt: string };

  const groupCount = Math.ceil(count / QUANTITY_ITEMS_PER_GROUP);
  const groups = Array.from({ length: groupCount }, (_, groupIndex) => {
    const start = groupIndex * QUANTITY_ITEMS_PER_GROUP;
    const size = Math.min(QUANTITY_ITEMS_PER_GROUP, count - start);
    return {
      id: null,
      tempId: `temp-group-${groupIndex}`,
      name: `件数上限のグループ${groupIndex}_${RUN_ID}`,
      surveyImageId: null,
      displayOrder: groupIndex,
      items: Array.from({ length: size }, (_item, offset) => ({
        id: null,
        tempId: `temp-item-${start + offset}`,
        majorCategory: null,
        middleCategory: null,
        minorCategory: null,
        customCategory: null,
        workType: '工種',
        // 集計の鍵（任意分類・工種・名称・規格・単位）が項目ごとに違うよう名称を一意にする
        name: `${label}${start + offset}_${RUN_ID}`,
        specification: null,
        unit: 'm',
        calculationMethod: 'STANDARD',
        calculationParams: null,
        adjustmentFactor: 1,
        roundingUnit: 0.01,
        quantity: 1,
        remarks: null,
        displayOrder: offset,
      })),
    };
  });

  const saved = await request.put(`${API_BASE_URL}/api/quantity-tables/${tableId}/save`, {
    headers,
    data: { expectedUpdatedAt: updatedAt, name: tableName, groups },
    timeout: getTimeout(60000),
  });
  expect(saved.status(), `前提: 数量項目 ${count} 件の数量表を保存できる`).toBe(200);

  const statement = await request.post(
    `${API_BASE_URL}/api/projects/${projectId}/itemized-statements`,
    {
      headers,
      data: { name: `件数上限の内訳書_${label}_${RUN_ID}`, quantityTableId: tableId },
      timeout: getTimeout(60000),
    }
  );
  expect(statement.status(), '前提: 内訳書を作成できる').toBe(201);
  const { id: statementId } = (await statement.json()) as { id: string };

  const prisma = getPrismaClient();
  expect(
    await prisma.itemizedStatementItem.count({ where: { itemizedStatementId: statementId } }),
    `前提: 内訳書の項目が ${count} 件ある（集計で一つにまとまっていない）`
  ).toBe(count);
  return statementId;
}

/** 案件の見積書と見積項目の数（論理削除済みを含む。書き込みが 0 件であることを数で確かめる） */
async function countEstimateRows(projectId: string): Promise<{ estimates: number; items: number }> {
  const prisma = getPrismaClient();
  return {
    estimates: await prisma.estimate.count({ where: { projectId } }),
    items: await prisma.estimateItem.count({ where: { estimate: { projectId } } }),
  };
}

test.describe('内訳書からの見積書の作成の件数の上限 (estimate-creation/REQ-3.6)', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string | null = null;

  test.afterAll(async () => {
    // 事前準備が案件を作れていなければ、後始末の対象が無いことを失敗として示す（素通りさせない）
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID（後始末）');
    const prisma = getPrismaClient();
    // 数千件の項目を持つ見積書・内訳書・数量表を DB から消す（案件の削除の API は論理削除のため）
    await prisma.estimate.deleteMany({ where: { projectId } });
    await prisma.itemizedStatement.deleteMany({ where: { projectId } });
    await prisma.quantityTable.deleteMany({ where: { projectId } });
    await prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    expect(
      await prisma.itemizedStatement.count({ where: { projectId } }),
      '後始末: 件数の上限の検証の内訳書が DB から消える'
    ).toBe(0);
  });

  test('事前準備: プロジェクトを作成する', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
    projectId = await createTestProject(page, 'EST_CREATE_LIMIT_PJ');
  });

  /**
   * 項目が 2001 件の内訳書を指定した作成は、一括保存と同じ 422（ESTIMATE_DRAFT_VALIDATION_ERROR、
   * `details.issues` の一つの問題で `path` が `items`）で拒まれ、見積書も見積項目も増えない。
   *
   * @requirement estimate-creation/REQ-3.6
   */
  test('項目が 2001 件の内訳書からの作成は一括保存と同じ 422 になり、見積書も見積項目も増えない', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(180000));
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
    const token = await getAccessToken(page, 'REGULAR_USER');
    const statementId = await prepareItemizedStatement(
      page.request,
      token,
      projectId,
      '超過',
      SAVE_ESTIMATE_MAX_ITEMS + 1
    );
    const before = await countEstimateRows(projectId);
    const estimateName = `件数上限超過の見積書_${RUN_ID}`;

    const response = await page.request.post(
      `${API_BASE_URL}/api/projects/${projectId}/estimates`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: estimateName, sourceItemizedStatementId: statementId },
        timeout: getTimeout(60000),
      }
    );

    expect(response.status()).toBe(422);
    const body = (await response.json()) as {
      code: string;
      message: string;
      details: { issues: Array<{ path: string; message: string }> };
    };
    expect(body.code).toBe('ESTIMATE_DRAFT_VALIDATION_ERROR');
    expect(body.message).toBe('見積明細の入力内容に不備があるため保存できません');
    expect(body.details.issues).toEqual([{ path: 'items', message: ITEMS_TOO_MANY }]);

    expect(await countEstimateRows(projectId), '見積書も見積項目も増えない').toEqual(before);
    const prisma = getPrismaClient();
    expect(
      await prisma.estimate.count({ where: { projectId, name: estimateName } }),
      '拒まれた名前の見積書は無い'
    ).toBe(0);
  });

  /**
   * 対照: 項目が上限の内側（3 件）の内訳書からは、従来どおり見積項目 3 件の見積書を作る。
   *
   * @requirement estimate-creation/REQ-3.6
   */
  test('項目が上限の内側の内訳書からは見積項目がその件数の見積書を作る（対照）', async ({
    page,
  }) => {
    test.setTimeout(getTimeout(120000));
    assertPrepared(projectId, '事前準備で作成したプロジェクトのID');
    const token = await getAccessToken(page, 'REGULAR_USER');
    const statementId = await prepareItemizedStatement(
      page.request,
      token,
      projectId,
      '対照',
      WITHIN_LIMIT_ITEMS
    );
    const before = await countEstimateRows(projectId);

    const response = await page.request.post(
      `${API_BASE_URL}/api/projects/${projectId}/estimates`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: `件数上限の内側の見積書_${RUN_ID}`,
          sourceItemizedStatementId: statementId,
        },
        timeout: getTimeout(60000),
      }
    );

    expect(response.status(), await response.text()).toBe(201);
    const body = (await response.json()) as { id: string; itemCount: number };
    expect(body.itemCount).toBe(WITHIN_LIMIT_ITEMS);
    expect(await countEstimateRows(projectId)).toEqual({
      estimates: before.estimates + 1,
      items: before.items + WITHIN_LIMIT_ITEMS,
    });
  });
});
