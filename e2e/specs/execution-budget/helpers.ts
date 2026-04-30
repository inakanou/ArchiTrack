/**
 * @fileoverview 実行予算管理 E2E テスト共通ヘルパー
 *
 * execution-budget-management 機能 E2E テストにおいて、テストデータ作成や
 * APIアクセスに用いる共通ユーティリティを提供します。
 *
 * @module e2e/specs/execution-budget/helpers
 */

import type { APIRequestContext, Page } from '@playwright/test';
import { API_BASE_URL } from '../../config';
import { getPrismaClient } from '../../fixtures/database';

/**
 * APIアクセストークンを取得する
 */
export async function getApiToken(
  request: APIRequestContext,
  email = 'user@example.com',
  password = 'Password123!'
): Promise<string> {
  const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`login failed: status ${res.status()}`);
  }
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

/**
 * ブラウザの localStorage からアクセストークンを取得する
 */
export async function getAccessTokenFromPage(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('accessToken'));
  if (!token) throw new Error('accessToken not found in localStorage');
  return token;
}

/**
 * Bearer ヘッダ生成
 */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * 担当者一覧から1件取得（プロジェクト作成用）
 */
export async function getSalesPersonId(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${API_BASE_URL}/api/users/assignable`, {
    headers: authHeaders(token),
  });
  const users = (await res.json()) as Array<{ id: string }>;
  if (!users || users.length === 0 || !users[0]) {
    throw new Error('assignable user not found');
  }
  return users[0].id;
}

/**
 * テスト用プロジェクトを作成し、IDを返す
 */
export async function createTestProject(
  request: APIRequestContext,
  token: string,
  namePrefix = 'E2E実行予算'
): Promise<string> {
  const salesPersonId = await getSalesPersonId(request, token);
  const res = await request.post(`${API_BASE_URL}/api/projects`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: {
      name: `${namePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      salesPersonId,
      siteAddress: '東京都千代田区テスト1-1-1',
    },
  });
  if (res.status() !== 201) {
    throw new Error(`project create failed: status ${res.status()}, body=${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/**
 * テスト用協力業者（取引先）を作成する
 */
export async function createTestSubcontractor(
  request: APIRequestContext,
  token: string,
  options?: { name?: string; nameKana?: string }
): Promise<{ id: string; name: string }> {
  const name =
    options?.name ?? `E2E業者_実行予算_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nameKana = options?.nameKana ?? 'イーツーイーギョウシャ';
  const res = await request.post(`${API_BASE_URL}/api/trading-partners`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: {
      name,
      nameKana,
      address: '東京都新宿区テスト1-1-1',
      types: ['SUBCONTRACTOR'],
    },
  });
  if (res.status() !== 201) {
    throw new Error(`subcontractor create failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string; name: string };
  return { id: body.id, name };
}

/**
 * 簡易見積書を作成する
 */
export async function createTestEstimate(
  request: APIRequestContext,
  token: string,
  projectId: string,
  name?: string
): Promise<string> {
  const res = await request.post(`${API_BASE_URL}/api/projects/${projectId}/estimates`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { name: name ?? `E2E見積_${Date.now()}` },
  });
  if (res.status() !== 201) {
    throw new Error(`estimate create failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/**
 * 見積項目（ESTIMATE/EXECUTION/VENDOR の3行）を1件作成する
 */
export async function createEstimateItem(
  request: APIRequestContext,
  token: string,
  estimateId: string,
  options: {
    name: string;
    specification?: string;
    unit?: string;
    quantity: number;
    estimateUnitPrice: number;
    executionUnitPrice: number;
    vendorName?: string | null;
    displayOrder: number;
    parentId?: string | null;
  }
): Promise<{ id: string }> {
  const lines: Array<Record<string, unknown>> = [
    {
      lineType: 'ESTIMATE',
      name: options.name,
      specification: options.specification ?? null,
      unit: options.unit ?? '式',
      quantity: options.quantity,
      unitPrice: options.estimateUnitPrice,
    },
    {
      lineType: 'EXECUTION',
      name: options.name,
      specification: options.specification ?? null,
      unit: options.unit ?? '式',
      quantity: options.quantity,
      unitPrice: options.executionUnitPrice,
    },
    {
      lineType: 'VENDOR',
      name: options.vendorName ?? null,
      quantity: options.quantity,
      unitPrice: options.executionUnitPrice,
    },
  ];

  const res = await request.post(`${API_BASE_URL}/api/estimates/${estimateId}/items`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: {
      parentId: options.parentId ?? null,
      displayOrder: options.displayOrder,
      lines,
    },
  });
  if (res.status() !== 201) {
    throw new Error(`estimate item create failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };

  // VENDOR行のsourceVendorNameをDB直接更新で設定（API経由では設定できないため）
  if (options.vendorName) {
    await setEstimateItemVendorName(body.id, options.vendorName);
  }

  return { id: body.id };
}

/**
 * 見積項目のVENDOR行に sourceVendorName を直接DBで設定する
 *
 * 実行予算作成時、サービス層は VENDOR 行の sourceVendorName から取引先マスタを
 * 検索し、plannedVendorId を実行予算項目に設定する。
 * createEstimateItem API では sourceVendorName を渡せないため、E2E テストの
 * セットアップとして Prisma 直接更新で設定する。
 */
export async function setEstimateItemVendorName(
  estimateItemId: string,
  vendorName: string
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.estimateItemLine.updateMany({
    where: { estimateItemId, lineType: 'VENDOR' },
    data: { sourceVendorName: vendorName, name: vendorName },
  });
}

/**
 * 契約書を作成する
 */
export async function createTestContract(
  request: APIRequestContext,
  token: string,
  projectId: string,
  estimateId: string,
  options?: {
    contractAmount?: number;
    constructionPrice?: number;
    taxAmount?: number;
    contractType?: 'NEW' | 'AMENDMENT';
    parentContractId?: string;
  }
): Promise<string> {
  const constructionPrice = options?.constructionPrice ?? 1000000;
  const taxAmount = options?.taxAmount ?? Math.floor(constructionPrice * 0.1);
  const contractAmount = options?.contractAmount ?? constructionPrice + taxAmount;
  const res = await request.post(`${API_BASE_URL}/api/projects/${projectId}/contracts`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: {
      contractType: options?.contractType ?? 'NEW',
      parentContractId: options?.parentContractId ?? null,
      estimateId,
      contractDate: '2024-06-01',
      constructionStartDate: '2024-07-01',
      constructionEndDate: '2024-12-31',
      deliveryDate: '2025-01-15',
      taxRate: 0.1,
      paymentTerms: '契約時50%、完了時50%',
      separateConstruction: '',
      otherNotes: '',
      contractAmount,
      constructionPrice,
      taxAmount,
    },
  });
  if (res.status() !== 201) {
    throw new Error(`contract create failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/**
 * 契約書のステータスを CONTRACTED に変更する
 *
 * 変更契約一覧 API は `status: 'CONTRACTED'` の AMENDMENT 契約のみを対象とするため、
 * 反映対象として一覧に表示させるには事前にこの操作が必要。
 */
export async function setContractContracted(
  request: APIRequestContext,
  token: string,
  contractId: string
): Promise<void> {
  const res = await request.patch(`${API_BASE_URL}/api/contracts/${contractId}/status`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { status: 'CONTRACTED' },
  });
  if (!res.ok()) {
    throw new Error(`contract status update failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 実行予算を作成する
 */
export async function createTestExecutionBudget(
  request: APIRequestContext,
  token: string,
  projectId: string,
  contractId: string
): Promise<{ id: string }> {
  const res = await request.post(`${API_BASE_URL}/api/projects/${projectId}/execution-budget`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { contractId },
  });
  if (res.status() !== 201) {
    throw new Error(`execution budget create failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return { id: body.id };
}

/**
 * 実行予算を取得する
 */
export async function getExecutionBudget(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<unknown> {
  const res = await request.get(`${API_BASE_URL}/api/projects/${projectId}/execution-budget`, {
    headers: authHeaders(token),
  });
  if (!res.ok()) return null;
  return res.json();
}

/**
 * 発注を作成する
 */
export async function createTestOrder(
  request: APIRequestContext,
  token: string,
  projectId: string,
  tradingPartnerId: string
): Promise<{ id: string; status: string }> {
  const res = await request.post(
    `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders`,
    {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { tradingPartnerId },
    }
  );
  if (res.status() !== 201) {
    throw new Error(`order create failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string; status: string };
  return { id: body.id, status: body.status };
}

/**
 * 発注のチェック済み項目を更新する
 */
export async function updateOrderItems(
  request: APIRequestContext,
  token: string,
  projectId: string,
  orderId: string,
  itemIds: string[]
): Promise<unknown> {
  const res = await request.put(
    `${API_BASE_URL}/api/projects/${projectId}/execution-budget/orders/${orderId}/items`,
    {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { itemIds },
    }
  );
  if (!res.ok()) {
    throw new Error(`order items update failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/**
 * プロジェクトをクリーンアップ（論理削除）
 */
export async function deleteProject(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/projects/${projectId}`, {
    headers: authHeaders(token),
  });
}

/**
 * 取引先をクリーンアップ
 */
export async function deleteTradingPartner(
  request: APIRequestContext,
  token: string,
  tradingPartnerId: string
): Promise<void> {
  await request.delete(`${API_BASE_URL}/api/trading-partners/${tradingPartnerId}`, {
    headers: authHeaders(token),
  });
}
