/**
 * @fileoverview 見積依頼テキスト生成サービス
 *
 * メールおよびFAX用の見積依頼文を生成します。
 *
 * Requirements:
 * - 6.1: メール見積依頼文のヘッダ・本文・フッタを生成
 * - 6.2: FAX見積依頼文のヘッダ・本文・フッタを生成
 * - 6.3: 内訳データをメール本文に含める
 * - 6.4: メールアドレス未登録時のエラー
 * - 6.5: FAX番号未登録時のエラー
 * - 7.3: 項目が選択されていない場合のエラー
 *
 * Task 2.3: EstimateRequestTextServiceの実装
 *
 * @module services/estimate-request-text
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  EstimateRequestNotFoundError,
  MissingContactInfoError,
  NoItemsSelectedError,
} from '../errors/estimateRequestError.js';

/**
 * 見積依頼テキストサービス依存関係
 */
export interface EstimateRequestTextServiceDependencies {
  prisma: PrismaClient;
}

/**
 * メール見積依頼テキスト
 */
export interface EmailEstimateRequestText {
  type: 'email';
  to: string;
  subject: string;
  body: string;
}

/**
 * FAX見積依頼テキスト
 */
export interface FaxEstimateRequestText {
  type: 'fax';
  faxNumber: string;
  body: string;
}

/**
 * 見積依頼テキスト（共用型）
 */
export type EstimateRequestText = EmailEstimateRequestText | FaxEstimateRequestText;

/**
 * 選択された項目情報
 */
interface SelectedItemInfo {
  workType: string | null;
  name: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number;
}

/**
 * 見積依頼テキスト生成サービス
 *
 * メールおよびFAX用の見積依頼文を生成します。
 */
export class EstimateRequestTextService {
  private readonly prisma: PrismaClient;

  constructor(deps: EstimateRequestTextServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * メール見積依頼文を生成する
   *
   * Requirements: 6.1, 6.3, 6.4, 7.3
   *
   * @param estimateRequestId - 見積依頼ID
   * @returns メール見積依頼テキスト
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   * @throws MissingContactInfoError メールアドレスが登録されていない場合
   * @throws NoItemsSelectedError 項目が選択されていない場合
   */
  async generateEmailText(estimateRequestId: string): Promise<EmailEstimateRequestText> {
    // 1. 見積依頼の取得
    const request = await this.getEstimateRequestWithDetails(estimateRequestId);

    // 2. メールアドレスの確認
    if (!request.tradingPartner.email) {
      throw new MissingContactInfoError('email', request.tradingPartner.id);
    }

    // 3. 選択された項目の取得
    const selectedItems = await this.getSelectedItems(estimateRequestId);

    if (selectedItems.length === 0) {
      throw new NoItemsSelectedError(estimateRequestId);
    }

    // 4. メール本文の生成
    const subject = `【お見積りご依頼】${request.project.name}`;
    const body = this.generateEmailBody(request, selectedItems);

    return {
      type: 'email',
      to: request.tradingPartner.email,
      subject,
      body,
    };
  }

  /**
   * FAX見積依頼文を生成する
   *
   * Requirements: 6.2, 6.5, 7.3
   *
   * @param estimateRequestId - 見積依頼ID
   * @returns FAX見積依頼テキスト
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   * @throws MissingContactInfoError FAX番号が登録されていない場合
   * @throws NoItemsSelectedError 項目が選択されていない場合
   */
  async generateFaxText(estimateRequestId: string): Promise<FaxEstimateRequestText> {
    // 1. 見積依頼の取得
    const request = await this.getEstimateRequestWithDetails(estimateRequestId);

    // 2. FAX番号の確認
    if (!request.tradingPartner.faxNumber) {
      throw new MissingContactInfoError('fax', request.tradingPartner.id);
    }

    // 3. 選択された項目の取得
    const selectedItems = await this.getSelectedItems(estimateRequestId);

    if (selectedItems.length === 0) {
      throw new NoItemsSelectedError(estimateRequestId);
    }

    // 4. FAX本文の生成
    const body = this.generateFaxBody(request, selectedItems);

    return {
      type: 'fax',
      faxNumber: request.tradingPartner.faxNumber,
      body,
    };
  }

  /**
   * 見積依頼のmethodに応じて適切なテキストを生成する
   *
   * @param estimateRequestId - 見積依頼ID
   * @returns 見積依頼テキスト
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   */
  async generateText(estimateRequestId: string): Promise<EstimateRequestText> {
    const request = await this.getEstimateRequestWithDetails(estimateRequestId);

    if (request.method === 'FAX') {
      return this.generateFaxText(estimateRequestId);
    }

    return this.generateEmailText(estimateRequestId);
  }

  /**
   * 見積依頼の詳細情報を取得する
   */
  private async getEstimateRequestWithDetails(estimateRequestId: string) {
    const request = await this.prisma.estimateRequest.findUnique({
      where: { id: estimateRequestId },
      include: {
        tradingPartner: {
          select: {
            id: true,
            name: true,
            email: true,
            faxNumber: true,
          },
        },
        itemizedStatement: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            siteAddress: true,
          },
        },
      },
    });

    if (!request || request.deletedAt !== null) {
      throw new EstimateRequestNotFoundError(estimateRequestId);
    }

    return request;
  }

  /**
   * 選択された項目を取得する
   */
  private async getSelectedItems(estimateRequestId: string): Promise<SelectedItemInfo[]> {
    const items = await this.prisma.estimateRequestItem.findMany({
      where: {
        estimateRequestId,
        selected: true,
      },
      include: {
        itemizedStatementItem: {
          select: {
            workType: true,
            name: true,
            specification: true,
            unit: true,
            quantity: true,
          },
        },
      },
      orderBy: { itemizedStatementItem: { displayOrder: 'asc' } },
    });

    return items.map((item) => ({
      workType: item.itemizedStatementItem.workType,
      name: item.itemizedStatementItem.name,
      specification: item.itemizedStatementItem.specification,
      unit: item.itemizedStatementItem.unit,
      quantity:
        typeof item.itemizedStatementItem.quantity === 'number'
          ? item.itemizedStatementItem.quantity
          : parseFloat(item.itemizedStatementItem.quantity.toString()),
    }));
  }

  /**
   * メール本文を生成する
   */
  private generateEmailBody(
    request: {
      name: string;
      includeBreakdownInBody: boolean;
      tradingPartner: { name: string };
      project: { name: string; siteAddress: string | null };
    },
    selectedItems: SelectedItemInfo[]
  ): string {
    const lines: string[] = [];

    // ヘッダ
    lines.push(`${request.tradingPartner.name} 御中`);
    lines.push('');
    lines.push('お世話になっております。');
    lines.push('');
    lines.push('下記の通り、お見積りをお願いいたします。');
    lines.push('');

    // プロジェクト情報
    lines.push('【物件情報】');
    lines.push(`物件名：${request.project.name}`);
    if (request.project.siteAddress) {
      lines.push(`現場住所：${request.project.siteAddress}`);
    }
    lines.push('');

    // 内訳書を本文に含める場合
    if (request.includeBreakdownInBody) {
      lines.push('【見積対象項目】');
      lines.push('');
      for (const item of selectedItems) {
        const parts: string[] = [];
        if (item.workType) parts.push(item.workType);
        if (item.name) parts.push(item.name);
        if (item.specification) parts.push(item.specification);
        parts.push(`${item.quantity}${item.unit ?? ''}`);
        lines.push(`・${parts.join(' / ')}`);
      }
      lines.push('');
    }

    // フッタ
    lines.push('ご多忙のところ恐れ入りますが、');
    lines.push('ご確認の程、よろしくお願いいたします。');
    lines.push('');
    lines.push('以上');

    return lines.join('\n');
  }

  /**
   * FAX本文を生成する
   */
  private generateFaxBody(
    request: {
      name: string;
      includeBreakdownInBody: boolean;
      tradingPartner: { name: string };
      project: { name: string; siteAddress: string | null };
    },
    selectedItems: SelectedItemInfo[]
  ): string {
    const lines: string[] = [];
    const currentDate = new Date().toLocaleDateString('ja-JP');

    // FAXヘッダ
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('　　　　　　FAX送信票');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`送信日：${currentDate}`);
    lines.push(`宛先：${request.tradingPartner.name} 御中`);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('【件名】お見積りご依頼');
    lines.push('');
    lines.push('お世話になっております。');
    lines.push('');
    lines.push('下記の通り、お見積りをお願いいたします。');
    lines.push('');

    // プロジェクト情報
    lines.push('【物件情報】');
    lines.push(`物件名：${request.project.name}`);
    if (request.project.siteAddress) {
      lines.push(`現場住所：${request.project.siteAddress}`);
    }
    lines.push('');

    // 内訳書を本文に含める場合
    if (request.includeBreakdownInBody) {
      lines.push('【見積対象項目】');
      lines.push('');
      for (const item of selectedItems) {
        const parts: string[] = [];
        if (item.workType) parts.push(item.workType);
        if (item.name) parts.push(item.name);
        if (item.specification) parts.push(item.specification);
        parts.push(`${item.quantity}${item.unit ?? ''}`);
        lines.push(`・${parts.join(' / ')}`);
      }
      lines.push('');
    }

    // フッタ
    lines.push('ご多忙のところ恐れ入りますが、');
    lines.push('ご確認の程、よろしくお願いいたします。');
    lines.push('');
    lines.push('以上');
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');

    return lines.join('\n');
  }
}
