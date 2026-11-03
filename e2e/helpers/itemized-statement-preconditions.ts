/**
 * @fileoverview 内訳書のE2Eテストが用いる前提条件の補助
 *
 * 内訳書詳細画面のフィルタ入力欄は `ItemizedStatementDetailPage` が
 * 内訳項目を 1 件以上持つときに必ず描画する（`FilterArea`）。
 * したがって「表示されていれば操作する」という関門は不要であり、
 * 前提そのものを無条件に主張してから操作すればよい。
 *
 * @module e2e/helpers/itemized-statement-preconditions
 */

import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { getTimeout } from './wait-helpers';
import { SAME_ORIGIN_API_BASE_URL } from '../config';
import { loginViaApi } from './auth-api';
import { deleteQuantityTableViaApi } from './quantity-table-preconditions';
import { deleteProjectViaApi, deleteTradingPartnerViaApi } from './project-list-preconditions';

/** 内訳書詳細画面がフィルタを提供するカラム (itemized-statement-generation/REQ-6.2) */
export type ItemizedStatementFilterColumn =
  'customCategory' | 'workType' | 'name' | 'specification' | 'unit';

/**
 * 内訳書詳細画面のフィルタ入力欄を、描画されていることを主張したうえで返す。
 *
 * 前提が崩れている場合は、後段の操作や主張ではなくこの時点で失敗する。
 *
 * @param page - Playwrightのページ
 * @param column - フィルタ対象のカラム
 * @returns フィルタ入力欄のロケーター
 */
export async function requireItemizedStatementFilterInput(
  page: Page,
  column: ItemizedStatementFilterColumn
): Promise<Locator> {
  const filterInput = page.locator(`input[id="filter-${column}"]`);
  await expect(
    filterInput,
    `内訳書詳細のフィルタ入力欄が表示されていない: filter-${column}`
  ).toBeVisible({ timeout: getTimeout(10000) });
  return filterInput;
}

/**
 * 内訳書詳細画面のフィルタクリアボタンを、描画されていることを主張したうえで返す。
 *
 * クリアボタンは `FilterArea` の見出しに常に置かれており
 * （`ItemizedStatementDetailPage.tsx` の `FilterArea`）、
 * フィルタ入力欄と同じ条件（内訳項目が1件以上）で必ず描画される。
 * したがって「表示されていればクリックする」という関門は不要である。
 *
 * `aria-label="フィルタをクリア"` を完全一致で指すため、
 * 画面内の他の「クリア」を含むボタンと取り違えることがない。
 *
 * @param page - Playwrightのページ
 * @returns フィルタクリアボタンのロケーター
 */
export async function requireItemizedStatementFilterClearButton(page: Page): Promise<Locator> {
  const clearButton = page.getByRole('button', { name: 'フィルタをクリア' });
  await expect(clearButton, '内訳書詳細のフィルタクリアボタンが表示されていない').toBeVisible({
    timeout: getTimeout(10000),
  });
  return clearButton;
}

/**
 * 内訳書を API で論理削除する（後始末用）
 *
 * `DELETE /api/itemized-statements/:id` は楽観的排他制御の基準時刻（updatedAt）を**本文**で求める
 * （画面の deleteItemizedStatement と同じ。見積依頼・受領見積書のクエリとは異なる）。現在の
 * updatedAt を読み直して送り、204 以外は例外にして後始末の失敗を見逃さない（2026-11-01 の是正まで、
 * 見積依頼の E2E の後始末は基準時刻を送らずに 400 を受け、状態コードを見ていなかったため
 * 内訳書がテスト DB に残っていた。claude-vision-e2e のファイル内の補助をここへ移した）。
 *
 * @param request - 要求のコンテキスト（`request` の fixture・`page.request`・`request.newContext()`）
 * @param token - アクセストークン
 * @param itemizedStatementId - 取り除く内訳書のID
 */
export async function deleteItemizedStatementViaApi(
  request: APIRequestContext,
  token: string,
  itemizedStatementId: string
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const current = await request.get(
    `${SAME_ORIGIN_API_BASE_URL}/api/itemized-statements/${itemizedStatementId}`,
    { headers }
  );
  if (current.status() !== 200) {
    throw new Error(
      `itemized statement read before delete failed: ${current.status()} ${await current.text()}`
    );
  }
  const { updatedAt } = (await current.json()) as { updatedAt: string };
  const res = await request.delete(
    `${SAME_ORIGIN_API_BASE_URL}/api/itemized-statements/${itemizedStatementId}`,
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { updatedAt },
    }
  );
  if (res.status() !== 204) {
    throw new Error(`itemized statement delete failed: ${res.status()} ${await res.text()}`);
  }
}

/** 後始末の一つの手順（何を消すかの名前と、その削除） */
export interface CleanupStep {
  /** 失敗の報告に出す名前（資源の種類と ID） */
  label: string;
  /** 削除の本体。失敗は例外で知らせる */
  run: () => Promise<void>;
}

/**
 * 後始末の手順を順に**すべて**走らせ、失敗を集めて最後にまとめて例外にする。
 *
 * 最初の失敗で止めると、その後ろの資源（親のプロジェクト・取引先など）が消えずに残る。
 * 各手順の失敗は握りつぶさず、すべての手順を試した後に件数と内容をまとめて投げるため、
 * 後始末が一つでも失敗すれば必ず赤になる（2026-11-02 の是正）。
 *
 * @param steps - 子から親の順に並べた後始末の手順
 * @throws いずれかの手順が失敗した場合（失敗したすべての手順の名前と理由を含む）
 */
export async function runCleanupSteps(steps: ReadonlyArray<CleanupStep>): Promise<void> {
  const failures: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failures.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`cleanup failed (${failures.length}件):\n${failures.join('\n')}`);
  }
}

/**
 * プロジェクトの配下の内訳書・数量表の ID を一覧の API で（全ページ）拾う。
 *
 * @param request - 要求のコンテキスト
 * @param token - アクセストークン
 * @param projectId - 対象のプロジェクトのID
 * @param resource - 'itemized-statements' または 'quantity-tables'
 * @returns 論理削除されていない資源の ID
 * @throws 一覧の取得が 200 で終わらない場合
 */
async function listProjectChildIds(
  request: APIRequestContext,
  token: string,
  projectId: string,
  resource: 'itemized-statements' | 'quantity-tables'
): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const res = await request.get(
      `${SAME_ORIGIN_API_BASE_URL}/api/projects/${projectId}/${resource}?page=${page}&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status() !== 200) {
      throw new Error(`${resource} list failed: ${res.status()} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
      pagination: { totalPages: number };
    };
    ids.push(...body.data.map((row) => row.id));
    if (page >= body.pagination.totalPages) {
      return ids;
    }
  }
}

/**
 * 内訳書の E2E が作った資源の識別子（後始末の対象）。作られなかったもの（null・未設定）は飛ばす。
 */
export interface ProjectFixtureCleanupTargets {
  /** 内訳書のID */
  itemizedStatementIds?: ReadonlyArray<string | null | undefined>;
  /** 数量表のID */
  quantityTableIds?: ReadonlyArray<string | null | undefined>;
  /**
   * 配下の内訳書・数量表を一覧で拾ってすべて消してから消すプロジェクトのID。
   * 画面の操作で作った内訳書のように ID を控えていない子も、これで取り残さない
   */
  projectIds?: ReadonlyArray<string | null | undefined>;
  /** 取引先のID（プロジェクトの後に消す） */
  tradingPartnerIds?: ReadonlyArray<string | null | undefined>;
}

/** null・未設定を除き、重複を取り除く */
function presentIds(ids: ReadonlyArray<string | null | undefined> | undefined): string[] {
  return [...new Set((ids ?? []).filter((id): id is string => !!id))];
}

/**
 * 内訳書の E2E が作った資源を管理者として API で片付ける（`test.afterEach`・`test.afterAll` 用）
 *
 * 新しい要求のコンテキストで管理者としてログインし直す（一般利用者には project:delete が無く、
 * プロジェクトの削除が 403 になる）。内訳書 → 数量表 → プロジェクト（配下を一覧で拾って先に消す）→
 * 取引先の順（子から親）に消す。プロジェクトの論理削除は配下を消さないため、配下を先に消す。
 * いずれの削除も 204 以外は失敗とし、すべてを試した後にまとめて例外にする（`runCleanupSteps`）。
 * 対象が一つも無ければ何もしない（ログインもしない）。
 *
 * @param targets - 片付ける資源の識別子
 * @throws 管理者のトークンが得られない・いずれかの削除（一覧の取得を含む）が成功しない場合
 */
export async function cleanupProjectFixtures(targets: ProjectFixtureCleanupTargets): Promise<void> {
  const itemizedStatementIds = presentIds(targets.itemizedStatementIds);
  const quantityTableIds = presentIds(targets.quantityTableIds);
  const projectIds = presentIds(targets.projectIds);
  const tradingPartnerIds = presentIds(targets.tradingPartnerIds);
  if (
    itemizedStatementIds.length +
      quantityTableIds.length +
      projectIds.length +
      tradingPartnerIds.length ===
    0
  ) {
    return;
  }

  const api = await playwrightRequest.newContext();
  try {
    const { accessToken: adminToken } = await loginViaApi(api, 'ADMIN_USER');
    if (!adminToken) {
      throw new Error('cleanup: 管理者のアクセストークンが得られない');
    }
    const steps: CleanupStep[] = [
      ...itemizedStatementIds.map((id) => ({
        label: `itemized statement ${id}`,
        run: () => deleteItemizedStatementViaApi(api, adminToken, id),
      })),
      ...quantityTableIds.map((id) => ({
        label: `quantity table ${id}`,
        run: () => deleteQuantityTableViaApi(api, adminToken, id),
      })),
      // 配下の内訳書・数量表を一覧で拾って先に消す。一覧が取れない・一つ消せないときも、
      // 残りとプロジェクトそのものの削除は試す
      ...projectIds.flatMap((id) => [
        {
          label: `itemized statements of project ${id}`,
          run: async () =>
            runCleanupSteps(
              (await listProjectChildIds(api, adminToken, id, 'itemized-statements')).map(
                (childId) => ({
                  label: `itemized statement ${childId}`,
                  run: () => deleteItemizedStatementViaApi(api, adminToken, childId),
                })
              )
            ),
        },
        {
          label: `quantity tables of project ${id}`,
          run: async () =>
            runCleanupSteps(
              (await listProjectChildIds(api, adminToken, id, 'quantity-tables')).map(
                (childId) => ({
                  label: `quantity table ${childId}`,
                  run: () => deleteQuantityTableViaApi(api, adminToken, childId),
                })
              )
            ),
        },
        { label: `project ${id}`, run: () => deleteProjectViaApi(api, adminToken, id) },
      ]),
      ...tradingPartnerIds.map((id) => ({
        label: `trading partner ${id}`,
        run: () => deleteTradingPartnerViaApi(api, adminToken, id),
      })),
    ];
    await runCleanupSteps(steps);
  } finally {
    await api.dispose();
  }
}
