/**
 * @fileoverview 見積依頼まわりの検証が必要とする前提を、崩れたら必ず失敗する形で用意する補助
 *
 * ## 背景（Task 115.127 段1）
 *
 * 見積依頼の E2E（OCR再実行・PDFテキスト抽出・OCR精度改善）は、いずれも
 * 「プロジェクト → 取引先 → 数量表 → 数量グループ → 数量項目 → 内訳書 → 見積依頼」を
 * API で作る同一の前提を必要としていた。その約110行が3ファイルへ複製されており、
 * 各テストの先頭は `test.skip(!createdEstimateRequestId, 'テスト前提データが作成されていません')`
 * で守られていた。前提の生成が壊れると、以降の検証は緑でも赤でもなく消える。
 * AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に直接抵触する。
 *
 * 本補助は前提を**自分で作る**。作れなければその場で失敗する。
 * 複製したまま個別に直すと再発するため、3ファイルから同じ補助を参照する。
 *
 * @module e2e/helpers/estimate-request-preconditions
 */

import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { assertPrepared } from './preconditions';
import { SAME_ORIGIN_API_BASE_URL } from '../config';
import { getAccessToken, loginViaApi, type AuthUserRef } from './auth-api';
import {
  deleteItemizedStatementViaApi,
  runCleanupSteps,
  type CleanupStep,
} from './itemized-statement-preconditions';
import { deleteQuantityTableViaApi } from './quantity-table-preconditions';
import { deleteProjectViaApi, deleteTradingPartnerViaApi } from './project-list-preconditions';

/**
 * 前提として作成する数量項目の内容
 */
export interface EstimateRequestSeedItem {
  /** 工種 */
  workType: string;
  /** 名称 */
  name: string;
  /** 規格 */
  specification: string;
  /** 単位 */
  unit: string;
  /** 数量 */
  quantity: number;
}

/**
 * 前提の作成に用いる識別用の情報
 */
export interface EstimateRequestSeedOptions {
  /** 作成するデータの名称に含める識別子（テストの出所が分かる文字列） */
  label: string;
  /** プロジェクトおよび取引先の住所 */
  siteAddress: string;
  /** 取引先のメールアドレス（一意である必要がある） */
  partnerEmail: string;
  /** 数量グループの名称 */
  groupName: string;
  /** 数量項目の内容 */
  item: EstimateRequestSeedItem;
}

/**
 * 前提として作成された資源の識別子
 */
export interface EstimateRequestSeed {
  /** 認証トークン */
  accessToken: string;
  /** 作成したプロジェクトのID */
  projectId: string;
  /** 作成した取引先のID */
  tradingPartnerId: string;
  /** 作成した数量表のID */
  quantityTableId: string;
  /** 作成した内訳書のID */
  itemizedStatementId: string;
  /** 作成した見積依頼のID */
  estimateRequestId: string;
}

/**
 * 応答が成功したことを主張し、本文を JSON として返す。
 *
 * 失敗した応答をそのまま `json()` すると解析時の例外になり、失敗の理由が
 * 「どのAPIが何番で落ちたか」ではなく解析の失敗として現れる。ここで状態番号を
 * 明示して失敗させる。
 *
 * @param response API の応答
 * @param label 何を作ろうとしていたか
 * @returns 応答本文
 * @throws 応答が成功でない場合
 */
async function expectCreated<T>(
  response: { ok(): boolean; status(): number; json(): Promise<unknown> },
  label: string
): Promise<T> {
  expect(response.ok(), `前提: ${label}が作成される (status=${response.status()})`).toBeTruthy();
  return (await response.json()) as T;
}

/**
 * 見積依頼の検証が必要とする前提一式を API で作成する。
 *
 * 呼び出し側は事前に `user` で `loginAsUser` を済ませていること（認証トークンを
 * `getAccessToken` で得るため）。いずれかの作成に失敗した時点で失敗する。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param user ページでログイン済みの利用者（トークンを得る利用者）
 * @param options 作成するデータの識別用の情報
 * @returns 作成した資源の識別子
 * @throws 認証トークンが無い・いずれかの作成APIが成功しない・IDが得られない場合
 */
export async function seedEstimateRequest(
  page: Page,
  user: AuthUserRef,
  options: EstimateRequestSeedOptions
): Promise<EstimateRequestSeed> {
  const { label, siteAddress, partnerEmail, groupName, item } = options;
  const stamp = Date.now();

  const accessToken = await getAccessToken(page, user);
  assertPrepared(accessToken, '認証トークン');
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 担当者候補を取得（salesPersonId に必要）
  const assignableRes = await page.request.get(`${SAME_ORIGIN_API_BASE_URL}/api/users/assignable`, {
    headers,
  });
  const assignableUsers = await expectCreated<Array<{ id: string }>>(
    assignableRes,
    '担当者候補の取得'
  );
  expect(assignableUsers.length, '前提: 担当者候補が1件以上存在する').toBeGreaterThan(0);
  const salesPersonId = assignableUsers[0]?.id;
  assertPrepared(salesPersonId, '担当者候補のID');

  // プロジェクト作成
  const projectRes = await page.request.post(`${SAME_ORIGIN_API_BASE_URL}/api/projects`, {
    headers,
    data: { name: `${label}-${stamp}`, salesPersonId, siteAddress },
  });
  const project = await expectCreated<{ id: string }>(projectRes, 'プロジェクト');
  assertPrepared(project.id, '作成したプロジェクトのID');

  // 取引先作成
  const partnerRes = await page.request.post(`${SAME_ORIGIN_API_BASE_URL}/api/trading-partners`, {
    headers,
    data: {
      name: `テスト業者-${label}-${stamp}`,
      nameKana: 'テストギョウシャ',
      types: ['SUBCONTRACTOR'],
      address: siteAddress,
      email: partnerEmail,
    },
  });
  const partner = await expectCreated<{ id: string }>(partnerRes, '取引先');
  assertPrepared(partner.id, '作成した取引先のID');

  // 数量表作成
  const quantityTableRes = await page.request.post(
    `${SAME_ORIGIN_API_BASE_URL}/api/projects/${project.id}/quantity-tables`,
    { headers, data: { name: `テスト数量表-${label}-${stamp}` } }
  );
  const quantityTable = await expectCreated<{ id: string }>(quantityTableRes, '数量表');
  assertPrepared(quantityTable.id, '作成した数量表のID');

  // 数量グループ作成
  const groupRes = await page.request.post(
    `${SAME_ORIGIN_API_BASE_URL}/api/quantity-tables/${quantityTable.id}/groups`,
    { headers, data: { name: groupName, displayOrder: 0 } }
  );
  const group = await expectCreated<{ id: string }>(groupRes, '数量グループ');
  assertPrepared(group.id, '作成した数量グループのID');

  // 数量項目作成
  const itemRes = await page.request.post(
    `${SAME_ORIGIN_API_BASE_URL}/api/quantity-groups/${group.id}/items`,
    {
      headers,
      data: item,
    }
  );
  await expectCreated<{ id: string }>(itemRes, '数量項目');

  // 内訳書作成（数量表から生成）
  const statementRes = await page.request.post(
    `${SAME_ORIGIN_API_BASE_URL}/api/projects/${project.id}/itemized-statements`,
    {
      headers,
      data: { name: `テスト内訳書-${label}-${stamp}`, quantityTableId: quantityTable.id },
    }
  );
  const statement = await expectCreated<{ id: string }>(statementRes, '内訳書');
  assertPrepared(statement.id, '作成した内訳書のID');

  // 見積依頼作成
  const estimateRequestRes = await page.request.post(
    `${SAME_ORIGIN_API_BASE_URL}/api/projects/${project.id}/estimate-requests`,
    {
      headers,
      data: {
        name: `テスト見積依頼-${label}-${stamp}`,
        tradingPartnerId: partner.id,
        itemizedStatementId: statement.id,
      },
    }
  );
  const estimateRequest = await expectCreated<{ id: string }>(estimateRequestRes, '見積依頼');
  assertPrepared(estimateRequest.id, '作成した見積依頼のID');

  return {
    accessToken,
    projectId: project.id,
    tradingPartnerId: partner.id,
    quantityTableId: quantityTable.id,
    itemizedStatementId: statement.id,
    estimateRequestId: estimateRequest.id,
  };
}

/**
 * 見積依頼を API で論理削除する（後始末用）
 *
 * 楽観的排他制御の基準時刻（現在の updatedAt）を読み直し、画面の deleteEstimateRequest と同じく
 * クエリ（`?updatedAt=`）で送る。204 以外は例外にして、後始末の失敗を見逃さない（2026-10-31 の是正まで、
 * 後始末は基準時刻を送らずに 400 を受け、状態コードを見ていなかったため見積依頼が残っていた）。
 *
 * @param request - 要求のコンテキスト（`request` の fixture または `page.request`）
 * @param token - アクセストークン
 * @param estimateRequestId - 取り除く見積依頼のID
 */
export async function deleteEstimateRequestViaApi(
  request: APIRequestContext,
  token: string,
  estimateRequestId: string
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const current = await request.get(
    `${SAME_ORIGIN_API_BASE_URL}/api/estimate-requests/${estimateRequestId}`,
    { headers }
  );
  if (current.status() !== 200) {
    throw new Error(
      `estimate request read before delete failed: ${current.status()} ${await current.text()}`
    );
  }
  const { updatedAt } = (await current.json()) as { updatedAt: string };
  const res = await request.delete(
    `${SAME_ORIGIN_API_BASE_URL}/api/estimate-requests/${estimateRequestId}?updatedAt=${encodeURIComponent(updatedAt)}`,
    { headers }
  );
  if (res.status() !== 204) {
    throw new Error(`estimate request delete failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 受領見積書を API で論理削除する（後始末用）
 *
 * 楽観的排他制御の基準時刻（現在の updatedAt）を読み直し、画面の deleteReceivedQuotation と同じく
 * クエリ（`?updatedAt=`）で送る。204 以外は例外にして、後始末の失敗を見逃さない（2026-10-31 の是正まで、
 * 受領見積書の後始末は状態コードを見ておらず、削除できなくても気づけなかった）。
 *
 * @param request - 要求のコンテキスト（`request` の fixture または `page.request`）
 * @param token - アクセストークン
 * @param quotationId - 取り除く受領見積書のID
 */
export async function deleteReceivedQuotationViaApi(
  request: APIRequestContext,
  token: string,
  quotationId: string
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const current = await request.get(`${SAME_ORIGIN_API_BASE_URL}/api/quotations/${quotationId}`, {
    headers,
  });
  if (current.status() !== 200) {
    throw new Error(
      `received quotation read before delete failed: ${current.status()} ${await current.text()}`
    );
  }
  const { updatedAt } = (await current.json()) as { updatedAt: string };
  const res = await request.delete(
    `${SAME_ORIGIN_API_BASE_URL}/api/quotations/${quotationId}?updatedAt=${encodeURIComponent(updatedAt)}`,
    { headers }
  );
  if (res.status() !== 204) {
    throw new Error(`received quotation delete failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 見積依頼の E2E が作った資源の識別子（後始末の対象）。作られなかったもの（null・未設定）は飛ばす。
 */
export interface EstimateRequestCleanupTargets {
  /** 見積依頼のID。設定されていれば、その配下の受領見積書を一覧で拾ってすべて消してから消す */
  estimateRequestId?: string | null;
  /** 内訳書のID */
  itemizedStatementId?: string | null;
  /** 数量表のID */
  quantityTableId?: string | null;
  /** プロジェクトのID */
  projectId?: string | null;
  /** 取引先のID */
  tradingPartnerId?: string | null;
}

/**
 * 見積依頼の E2E が作った資源を API で片付ける（`test.afterAll` 用）
 *
 * afterAll では page を使えないため、新しい要求のコンテキストで管理者としてログインし直す。
 * 一般ユーザーには project:delete が無くプロジェクトの削除が 403 になるため、管理者で消す。
 *
 * 受領見積書（見積依頼の配下を一覧で拾う）→ 見積依頼 → 内訳書 → 数量表 → プロジェクト → 取引先
 * の順（子から親）に消す。いずれの経路も 204 以外は失敗とし、後始末の失敗を握りつぶさない。
 * 最初の失敗で止めず、すべての削除を試した後に失敗をまとめて例外にする（`runCleanupSteps`。
 * 2026-11-02 の是正まで最初の失敗で止まり、その後ろの親の資源が消えずに残っていた）。
 * 2026-11-01 の是正まで、見積依頼の E2E の後始末は serial の最後の test に置かれ、途中の検証が
 * 落ちると走らず、内訳書は基準時刻を送らずに 400 を受け、どの削除も状態コードを見ていなかった
 * （claude-vision-e2e の afterAll をここへ寄せた）。
 *
 * @param targets - 片付ける資源の識別子
 * @throws 管理者のトークンが得られない・いずれかの削除が 204 で終わらない場合
 */
export async function cleanupEstimateRequestFixtures(
  targets: EstimateRequestCleanupTargets
): Promise<void> {
  const api = await playwrightRequest.newContext();
  try {
    const { accessToken: adminToken } = await loginViaApi(api, 'ADMIN_USER');
    if (!adminToken) {
      throw new Error('cleanup: 管理者のアクセストークンが得られない');
    }
    const headers = { Authorization: `Bearer ${adminToken}` };
    const { estimateRequestId, itemizedStatementId, quantityTableId, projectId, tradingPartnerId } =
      targets;
    const steps: CleanupStep[] = [];

    if (estimateRequestId) {
      steps.push(
        {
          label: `received quotations of estimate request ${estimateRequestId}`,
          run: async () => {
            // 受領見積書の一覧は GET /api/estimate-requests/:id/quotations が配列で返す
            const quotationsRes = await api.get(
              `${SAME_ORIGIN_API_BASE_URL}/api/estimate-requests/${estimateRequestId}/quotations`,
              { headers }
            );
            if (quotationsRes.status() !== 200) {
              throw new Error(
                `received quotation list failed: ${quotationsRes.status()} ${await quotationsRes.text()}`
              );
            }
            const quotations = (await quotationsRes.json()) as Array<{ id: string }>;
            await runCleanupSteps(
              quotations.map((quotation) => ({
                label: `received quotation ${quotation.id}`,
                run: () => deleteReceivedQuotationViaApi(api, adminToken, quotation.id),
              }))
            );
          },
        },
        {
          label: `estimate request ${estimateRequestId}`,
          run: () => deleteEstimateRequestViaApi(api, adminToken, estimateRequestId),
        }
      );
    }
    if (itemizedStatementId) {
      steps.push({
        label: `itemized statement ${itemizedStatementId}`,
        run: () => deleteItemizedStatementViaApi(api, adminToken, itemizedStatementId),
      });
    }
    if (quantityTableId) {
      steps.push({
        label: `quantity table ${quantityTableId}`,
        run: () => deleteQuantityTableViaApi(api, adminToken, quantityTableId),
      });
    }
    if (projectId) {
      steps.push({
        label: `project ${projectId}`,
        run: () => deleteProjectViaApi(api, adminToken, projectId),
      });
    }
    if (tradingPartnerId) {
      steps.push({
        label: `trading partner ${tradingPartnerId}`,
        run: () => deleteTradingPartnerViaApi(api, adminToken, tradingPartnerId),
      });
    }

    await runCleanupSteps(steps);
  } finally {
    await api.dispose();
  }
}
