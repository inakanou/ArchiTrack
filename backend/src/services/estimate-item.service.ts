/**
 * @fileoverview 見積項目サービス
 *
 * 見積項目の参照（階層構造の取得）を担当します。
 *
 * 明細の削除・複写・並び替え・階層移動・一括更新は一括保存
 * （`EstimateDraftService.saveDraft` ＝ `PUT /api/estimates/:id/save`）へ統合したため、
 * 本サービスからは撤去済み（REQ-42.1、Task 53.12）。
 *
 * 受領見積書転記（`transferFromQuotation`）と個別作成（`createItem`）は、
 * 転記・諸経費行追加・値引き行追加がクライアント側の編集状態への反映へ移った結果、
 * 呼び出し元を失ったため Task 55.7 で撤去済み（REQ-49.3）。これらの生成経路は
 * `estimateEditReducer` が担い、確定は `PUT /api/estimates/:id/save` が行う。
 *
 * Requirements (estimate-creation):
 * - REQ-2.2: その項目を親項目の子として階層表示する
 * - REQ-2.4: 複数階層のネスト（例：建築工事 > 直接仮設工事 > 遣り方）をサポートする
 * - REQ-49.3: 転記・案分・利益率・諸経費行追加・値引き行追加はデータベースへ書き込まない
 *
 * Task 2.2: EstimateItemServiceの実装
 * Task 53.12: 明細操作系の撤去（一括保存へ統合）
 * Task 55.7: 転記・個別作成の撤去（クライアント側の編集状態へ移行）
 *
 * @module services/estimate-item
 */

import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * 見積項目サービス依存関係
 */
export interface EstimateItemServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 見積項目種別（永続化された値。Prisma enum `EstimateItemType` と同一集合）
 *
 * - STANDARD: 通常項目（見積・実行・業者の3行1セット）
 * - DISCOUNT: 値引き行（見積金額行のみ。実行・業者行を持たない、REQ-41.3）
 * - NOTE: 注記行（名称のみ。金額集計の対象外、REQ-55.1/55.2）
 *
 * NOTE 行は一括保存（`PUT /api/estimates/:id/save`）から生成されるため、
 * `GET /api/estimates/:id/items` の返却値にも現れる。集合から NOTE を落とすと
 * 返却値の型が実際の値を偽ることになるため含める。
 */
export type EstimateItemTypeValue = 'STANDARD' | 'DISCOUNT' | 'NOTE';

/**
 * 見積項目行情報
 */
export interface EstimateItemLineInfo {
  id: string;
  estimateItemId: string;
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR';
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
  sourceReceivedQuotationLineItemId: string | null;
  sourceVendorName: string | null;
}

/**
 * 見積項目情報（行を含む）
 */
export interface EstimateItemWithLines {
  id: string;
  estimateId: string;
  parentId: string | null;
  displayOrder: number;
  /** 項目種別（STANDARD=通常項目/DISCOUNT=値引き行/NOTE=注記行） */
  itemType: EstimateItemTypeValue;
  lines: EstimateItemLineInfo[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 見積項目階層情報
 */
export interface EstimateItemHierarchy extends EstimateItemWithLines {
  children: EstimateItemHierarchy[];
}

/**
 * 見積項目サービス
 *
 * 見積項目の参照（階層構造の取得）を担当します。書き込み経路は持ちません。
 */
export class EstimateItemService {
  private readonly prisma: PrismaClient;

  constructor(deps: EstimateItemServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 見積項目を階層構造で取得する
   *
   * Requirements: REQ-2.2, REQ-2.4
   *
   * @param estimateId - 見積書ID
   * @returns 階層構造の見積項目一覧
   */
  async getHierarchy(estimateId: string): Promise<EstimateItemHierarchy[]> {
    // 単一クエリで全項目を取得（N+1回避）
    const items = await this.prisma.estimateItem.findMany({
      where: { estimateId },
      include: {
        lines: {
          orderBy: { lineType: 'asc' },
        },
      },
      orderBy: [{ parentId: 'asc' }, { displayOrder: 'asc' }],
    });

    // クライアントサイドで階層構造を構築
    return this.buildHierarchyTree(items);
  }

  /**
   * フラットな配列から階層構造を構築
   */
  private buildHierarchyTree(
    items: Array<{
      id: string;
      estimateId: string;
      parentId: string | null;
      displayOrder: number;
      itemType?: string;
      createdAt: Date;
      updatedAt: Date;
      lines: Array<{
        id: string;
        estimateItemId: string;
        lineType: string;
        name: string | null;
        specification: string | null;
        unit: string | null;
        quantity: unknown;
        unitPrice: unknown;
        amount: unknown;
        remarks: string | null;
        sourceReceivedQuotationLineItemId: string | null;
        sourceVendorName: string | null;
      }>;
    }>
  ): EstimateItemHierarchy[] {
    const itemMap = new Map<string, EstimateItemHierarchy>();
    const roots: EstimateItemHierarchy[] = [];

    // 1パス目: マップ作成
    items.forEach((item) => {
      const itemWithLines = this.toEstimateItemWithLines(item);
      itemMap.set(item.id, { ...itemWithLines, children: [] });
    });

    // 2パス目: 親子関係構築
    items.forEach((item) => {
      const node = itemMap.get(item.id)!;
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        parent?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * データベースの結果をEstimateItemWithLinesに変換
   */
  private toEstimateItemWithLines(item: {
    id: string;
    estimateId: string;
    parentId: string | null;
    displayOrder: number;
    itemType?: string;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      estimateItemId: string;
      lineType: string;
      name: string | null;
      specification: string | null;
      unit: string | null;
      quantity: unknown;
      unitPrice: unknown;
      amount: unknown;
      remarks: string | null;
      sourceReceivedQuotationLineItemId?: string | null;
      sourceVendorName?: string | null;
    }>;
  }): EstimateItemWithLines {
    return {
      id: item.id,
      estimateId: item.estimateId,
      parentId: item.parentId,
      displayOrder: item.displayOrder,
      itemType: (item.itemType as EstimateItemTypeValue | undefined) ?? 'STANDARD',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lines: item.lines.map((line) => ({
        id: line.id,
        estimateItemId: line.estimateItemId,
        lineType: line.lineType as 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
        name: line.name,
        specification: line.specification,
        unit: line.unit,
        quantity: line.quantity !== null ? Number(line.quantity) : null,
        unitPrice: line.unitPrice !== null ? Number(line.unitPrice) : null,
        amount: line.amount !== null ? Number(line.amount) : null,
        remarks: line.remarks,
        sourceReceivedQuotationLineItemId: line.sourceReceivedQuotationLineItemId ?? null,
        sourceVendorName: line.sourceVendorName ?? null,
      })),
    };
  }
}
