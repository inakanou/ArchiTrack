/**
 * @fileoverview 見積明細の一括保存（PUT /api/estimates/:id/save）E2E共通ヘルパー
 *
 * 明細操作系6経路（`POST /:id/items`、`DELETE /:id/items/:itemId`、
 * `POST /:id/items/:itemId/duplicate`、`PUT /:id/items/batch`、
 * `PUT /:id/items/reorder`、`PATCH /:id/items/:itemId/move`）は
 * estimate-creation Task 53.12 で撤去され、追加・削除・更新・並び順の変更・
 * 階層の変更は `PUT /:id/save` 1回へ集約された（estimate-creation REQ-42.1）。
 *
 * 本APIのワイヤ契約は **フル状態同期** かつ **strict** である。
 * - 明細行の9フィールド・ノードの `id`/`tempId`/`children`・`reportFields` は省略不可
 * - 数量・単価・金額は10進数**文字列**（数値を送ると400）
 * - ペイロードに現れない既存項目は削除される
 *
 * このため「1件追加」のようなテストフィクスチャも、現在のツリーを読み直して
 * 追加分を足した**全件**を送る必要がある。
 *
 * @module e2e/helpers/estimate-draft
 */

import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from '../config';

/** 明細行の行タイプ */
export type SaveLineType = 'ESTIMATE' | 'EXECUTION' | 'VENDOR';

/** 見積項目の種別 */
export type SaveItemType = 'STANDARD' | 'DISCOUNT' | 'NOTE';

/** 一括保存の明細行（9フィールドすべて省略不可） */
export interface SaveLinePayload {
  lineType: SaveLineType;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  remarks: string | null;
  sourceVendorName: string | null;
}

/** 一括保存の見積項目ノード（`id`/`tempId`/`children` は省略不可） */
export interface SaveNodePayload {
  id: string | null;
  tempId: string | null;
  itemType: SaveItemType;
  lines: SaveLinePayload[];
  children: SaveNodePayload[];
}

/** `GET /api/estimates/:id/items` が返す明細ツリーの節点 */
export interface EstimateItemNode {
  id: string;
  parentId: string | null;
  displayOrder: number;
  itemType: SaveItemType;
  lines: Array<{
    id: string;
    lineType: SaveLineType;
    name: string | null;
    specification: string | null;
    unit: string | null;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
    remarks: string | null;
    sourceVendorName: string | null;
  }>;
  children: EstimateItemNode[];
}

/** 帳票用入力項目（省略すると保存済みの値を消してしまうため常に送る） */
export interface SaveReportFields {
  submissionDate: string | null;
  validityPeriod: string | null;
  separateWorks: string[];
}

/** 帳票用入力項目の既定値（提出日・有効期限・別途工事を扱わないテスト向け） */
export const DEFAULT_REPORT_FIELDS: SaveReportFields = {
  submissionDate: null,
  validityPeriod: null,
  separateWorks: [],
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 数値を保存スキーマの10進数文字列へ変換する（数値のまま送ると400になる） */
export function toDecimalString(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** 明細行を9フィールドすべて明示した形で組み立てる（キー欠落は400） */
export function buildSaveLine(
  lineType: SaveLineType,
  overrides: Partial<Omit<SaveLinePayload, 'lineType'>> = {}
): SaveLinePayload {
  return {
    lineType,
    name: null,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount: null,
    remarks: null,
    sourceVendorName: null,
    ...overrides,
  };
}

/** 3行1セット（見積・実行・業者）の新規項目を組み立てる（estimate-creation REQ-1.2） */
export function buildNewEstimateItemNode(options: {
  name: string;
  specification?: string | null;
  unit?: string | null;
  quantity?: number | null;
  estimateUnitPrice?: number | null;
  executionUnitPrice?: number | null;
  vendorUnitPrice?: number | null;
  vendorName?: string | null;
  tempId?: string;
  children?: SaveNodePayload[];
}): SaveNodePayload {
  const quantity = options.quantity ?? null;
  const specification = options.specification ?? null;
  const unit = options.unit ?? null;

  const line = (
    lineType: SaveLineType,
    unitPrice: number | null,
    name: string | null,
    sourceVendorName: string | null = null
  ): SaveLinePayload =>
    buildSaveLine(lineType, {
      name,
      specification,
      unit,
      quantity: toDecimalString(quantity),
      unitPrice: toDecimalString(unitPrice),
      // 金額はサーバーが再計算しないため、単価×数量を明示的に送る
      amount:
        quantity !== null && unitPrice !== null ? toDecimalString(quantity * unitPrice) : null,
      sourceVendorName,
    });

  return {
    id: null,
    tempId: options.tempId ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    itemType: 'STANDARD',
    lines: [
      line('ESTIMATE', options.estimateUnitPrice ?? null, options.name),
      line('EXECUTION', options.executionUnitPrice ?? null, options.name),
      line(
        'VENDOR',
        options.vendorUnitPrice ?? options.executionUnitPrice ?? null,
        options.vendorName ?? options.name,
        options.vendorName ?? null
      ),
    ],
    children: options.children ?? [],
  };
}

/** 既存の明細ツリー（GET の返却形）を保存ペイロードの形へ写す */
export function toSaveNodes(items: readonly EstimateItemNode[]): SaveNodePayload[] {
  return items.map((item) => ({
    id: item.id,
    tempId: null,
    itemType: item.itemType,
    lines: item.lines.map((line) =>
      buildSaveLine(line.lineType, {
        name: line.name,
        specification: line.specification,
        unit: line.unit,
        quantity: toDecimalString(line.quantity),
        unitPrice: toDecimalString(line.unitPrice),
        amount: toDecimalString(line.amount),
        remarks: line.remarks,
        sourceVendorName: line.sourceVendorName ?? null,
      })
    ),
    children: toSaveNodes(item.children),
  }));
}

/** 明細ツリーを平坦化する */
export function flattenSaveNodes(nodes: readonly SaveNodePayload[]): SaveNodePayload[] {
  return nodes.flatMap((node) => [node, ...flattenSaveNodes(node.children)]);
}

/** 明細ツリー内の全項目IDを集める */
export function collectEstimateItemIds(items: readonly EstimateItemNode[]): string[] {
  return items.flatMap((item) => [item.id, ...collectEstimateItemIds(item.children)]);
}

/** 明細ツリーを平坦化する（GET の返却形） */
export function flattenEstimateItems(items: readonly EstimateItemNode[]): EstimateItemNode[] {
  return items.flatMap((item) => [item, ...flattenEstimateItems(item.children)]);
}

/** 見積金額行の名称で節点を探す */
export function findEstimateItemByName(
  items: readonly EstimateItemNode[],
  name: string
): EstimateItemNode | undefined {
  return flattenEstimateItems(items).find((item) =>
    item.lines.some((line) => line.lineType === 'ESTIMATE' && line.name === name)
  );
}

/** 見積書の現在の明細ツリーを取得する */
export async function getEstimateItemTree(
  request: APIRequestContext,
  token: string,
  estimateId: string
): Promise<EstimateItemNode[]> {
  const res = await request.get(`${API_BASE_URL}/api/estimates/${estimateId}/items`, {
    headers: authHeaders(token),
  });
  if (!res.ok()) {
    throw new Error(`estimate items fetch failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as EstimateItemNode[];
}

/** 楽観ロックの基準時刻を取得する（estimate-creation REQ-42.5。不一致だと409） */
export async function getEstimateUpdatedAt(
  request: APIRequestContext,
  token: string,
  estimateId: string
): Promise<string> {
  const res = await request.get(`${API_BASE_URL}/api/estimates/${estimateId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok()) {
    throw new Error(`estimate fetch failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { updatedAt: string };
  return body.updatedAt;
}

/**
 * 明細ツリー全体を1リクエストで保存する（estimate-creation REQ-42.1）
 *
 * ペイロードに現れない既存項目は削除されるため、`items` は常に**全件**であること。
 */
export async function saveEstimateDraft(
  request: APIRequestContext,
  token: string,
  estimateId: string,
  items: SaveNodePayload[],
  options: { reportFields?: SaveReportFields; expectedUpdatedAt?: string } = {}
): Promise<EstimateItemNode[]> {
  const expectedUpdatedAt =
    options.expectedUpdatedAt ?? (await getEstimateUpdatedAt(request, token, estimateId));

  const res = await request.put(`${API_BASE_URL}/api/estimates/${estimateId}/save`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: {
      expectedUpdatedAt,
      reportFields: options.reportFields ?? DEFAULT_REPORT_FIELDS,
      items,
    },
  });
  if (res.status() !== 200) {
    throw new Error(`estimate draft save failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { items: EstimateItemNode[] };
  return body.items;
}

/**
 * 既存の明細を保ったまま見積項目を1件追加する
 *
 * 一括保存はフル状態同期のため、現在のツリーを読み直して追加分を足した全件を送る。
 *
 * @returns 追加された見積項目のID
 */
export async function appendEstimateItem(
  request: APIRequestContext,
  token: string,
  estimateId: string,
  node: SaveNodePayload,
  options: { parentId?: string | null; displayOrder?: number } = {}
): Promise<string> {
  const before = await getEstimateItemTree(request, token, estimateId);
  const beforeIds = new Set(collectEstimateItemIds(before));
  const items = toSaveNodes(before);

  let siblings: SaveNodePayload[];
  if (options.parentId) {
    const parentNode = flattenSaveNodes(items).find((n) => n.id === options.parentId);
    if (!parentNode) {
      throw new Error(`parent estimate item not found in tree: ${options.parentId}`);
    }
    siblings = parentNode.children;
  } else {
    siblings = items;
  }

  // 表示順はペイロードの配列順で確定するため、指定位置に差し込む
  const index = options.displayOrder ?? siblings.length;
  siblings.splice(Math.min(Math.max(index, 0), siblings.length), 0, node);

  await saveEstimateDraft(request, token, estimateId, items);

  const after = await getEstimateItemTree(request, token, estimateId);
  const createdIds = collectEstimateItemIds(after).filter((id) => !beforeIds.has(id));
  if (createdIds.length !== 1 || !createdIds[0]) {
    throw new Error(`expected exactly 1 created estimate item, got ${createdIds.length}`);
  }
  return createdIds[0];
}
