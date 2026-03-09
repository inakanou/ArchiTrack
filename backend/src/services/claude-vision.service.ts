/**
 * Claude Vision APIサービス
 *
 * Anthropic Messages APIのVision機能を使用してPDFページ画像から
 * 建設見積書の表データを構造化抽出する。
 *
 * Requirements:
 * - 21.1-21.8: Claude Vision API連携エンドポイント
 * - 22.1-22.4: Anthropic APIキー管理と環境設定
 * - 23.1-23.7: Claude Vision APIエラーハンドリング
 * - 26.1-26.8: Claude Vision構造化データ抽出精度
 *
 * @module services/claude-vision.service
 */
import Anthropic, {
  APIConnectionTimeoutError,
  RateLimitError,
  AuthenticationError,
} from '@anthropic-ai/sdk';
import { ClaudeVisionError } from '../errors/claudeVisionError.js';
import logger from '../utils/logger.js';

/**
 * Claude Vision APIに送信する画像データ
 */
export interface ClaudeVisionImageInput {
  /** Base64エンコードされた画像データ（data URL prefixなし） */
  base64Data: string;
  /** 画像のメディアタイプ */
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

/**
 * Claude Vision APIから抽出された明細行データ
 */
export interface ClaudeVisionLineItem {
  customCategory: string | null;
  workType: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  remarks: string | null;
}

/**
 * Claude Vision抽出結果
 */
export interface ClaudeVisionExtractionResult {
  lineItems: ClaudeVisionLineItem[];
  /** 処理されたページ数 */
  pageCount: number;
}

/**
 * 数量表用のClaude Vision抽出結果の明細行データ
 *
 * Requirements: 30.4
 */
export interface ClaudeVisionQuantityLineItem {
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string | null;
  name: string | null;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
}

/**
 * 数量表用のClaude Vision抽出結果
 */
export interface ClaudeVisionQuantityExtractionResult {
  lineItems: ClaudeVisionQuantityLineItem[];
  /** 処理されたページ数 */
  pageCount: number;
}

/**
 * 建設見積書の表データ抽出プロンプト
 * Requirements: 26.1-26.4
 */
const EXTRACTION_PROMPT = `あなたは建設見積書の表データを抽出するAIです。
以下の画像は建設見積書のページです。すべてのページの表から明細行データを抽出してJSON配列形式で返してください。

## 重要: 全ページを処理してください
複数ページの画像が提供された場合、すべてのページを確認し、各ページの表データを漏れなく抽出してください。
表紙（見積金額の概要のみ）は除外し、内訳書・明細書などの表データを抽出対象としてください。

## 抽出対象フィールド
各明細行について以下のフィールドを抽出してください:
- customCategory: 任意分類（該当する列がない場合はnull）
- workType: 工種（該当する列がない場合はnull）
- name: 名称（必須。項目名、品名、摘要などの列）
- specification: 規格（該当する列がない場合はnull）
- unit: 単位（該当する列がない場合はnull）
- quantity: 数量（数値。該当する列がない場合はnull）
- unitPrice: 単価（数値。該当する列がない場合はnull）
- amount: 金額（数値。該当する列がない場合はnull）
- remarks: 備考（該当する列がない場合はnull）

## 除外ルール
- ヘッダー行（列名の行）は除外してください
- 集計行は除外してください（以下のキーワードのみで構成される行: 合計、小計、直接工事費、一般管理費、値引き、消費税、計）
- 空行は除外してください

## 出力形式
JSON配列のみを出力してください。説明文やマークダウンは不要です。
数値はカンマなしの数値で出力してください（例: 1234567）。

例:
[
  {"customCategory": null, "workType": "土工", "name": "掘削工", "specification": "バックホウ0.45m3", "unit": "m3", "quantity": 150, "unitPrice": 2500, "amount": 375000, "remarks": null},
  {"customCategory": null, "workType": "土工", "name": "埋戻し工", "specification": null, "unit": "m3", "quantity": 80, "unitPrice": 1800, "amount": 144000, "remarks": "現場発生土使用"}
]`;

/**
 * 数量表の表データ抽出プロンプト
 * Requirements: 30.3
 */
const QUANTITY_TABLE_EXTRACTION_PROMPT = `あなたは建設工事の数量表データを抽出するAIです。
以下の画像は数量表または積算資料のページです。すべてのページの表から数量項目データを抽出してJSON配列形式で返してください。

## 重要: 全ページを処理してください
複数ページの画像が提供された場合、すべてのページを確認し、各ページの表データを漏れなく抽出してください。
表紙やタイトルのみのページは除外してください。

## 抽出対象フィールド
各数量項目について以下のフィールドを抽出してください:
- majorCategory: 大項目（大分類。該当する列がない場合はnull）
- middleCategory: 中項目（中分類。該当する列がない場合はnull）
- minorCategory: 小項目（小分類。該当する列がない場合はnull）
- customCategory: 任意分類（分類。該当する列がない場合はnull）
- workType: 工種（該当する列がない場合はnull）
- name: 名称（品名、項目名、摘要などの列。該当する列がない場合はnull）
- specification: 規格（仕様。該当する列がない場合はnull）
- quantity: 数量（数値。該当する列がない場合はnull）
- unit: 単位（該当する列がない場合はnull）
- remarks: 備考（摘要、コメント。該当する列がない場合はnull）

## 除外ルール
- ヘッダー行（列名の行）は除外してください
- 集計行は除外してください（以下のキーワードのみで構成される行: 合計、小計、計）
- 空行は除外してください

## 出力形式
JSON配列のみを出力してください。説明文やマークダウンは不要です。
数値はカンマなしの数値で出力してください（例: 1234567）。

例:
[
  {"majorCategory": "土工", "middleCategory": "掘削", "minorCategory": null, "customCategory": null, "workType": "土工", "name": "掘削工", "specification": "バックホウ0.45m3", "quantity": 150, "unit": "m3", "remarks": null},
  {"majorCategory": "土工", "middleCategory": null, "minorCategory": null, "customCategory": null, "workType": "土工", "name": "埋戻し工", "specification": null, "quantity": 80, "unit": "m3", "remarks": "現場発生土使用"}
]`;

/**
 * Claude Vision APIサービスクラス
 */
export class ClaudeVisionService {
  private client: Anthropic | null;
  private enabled: boolean;

  constructor(anthropicApiKey: string | undefined) {
    this.enabled = !!anthropicApiKey;

    if (this.enabled) {
      this.client = new Anthropic({ apiKey: anthropicApiKey });
    } else {
      this.client = null;
      logger.warn('Claude Vision機能が無効です（ANTHROPIC_API_KEY未設定）');
    }
  }

  /**
   * Claude Vision APIが有効かどうかを返す
   * Requirements: 22.2
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * PDFページ画像から明細行データを抽出する
   * Requirements: 21.3-21.8, 26.1-26.8
   */
  async extractLineItems(images: ClaudeVisionImageInput[]): Promise<ClaudeVisionExtractionResult> {
    if (!this.client) {
      throw ClaudeVisionError.serviceUnavailable();
    }

    try {
      // Build content blocks: images + prompt text
      const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

      for (const image of images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.base64Data,
          },
        });
      }

      contentBlocks.push({
        type: 'text',
        text: EXTRACTION_PROMPT,
      });

      // Call Anthropic Messages API
      // Requirements: 21.3 (claude-haiku-4-5-20251001), 21.8 (multiple pages in one request)
      const response = await this.client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: contentBlocks,
            },
          ],
        },
        {
          timeout: 30000, // 30 seconds timeout (Requirements: 23.1)
        }
      );

      // Extract text from response
      const textBlock = response.content.find(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      );

      if (!textBlock) {
        throw ClaudeVisionError.parseError();
      }

      // Parse JSON from response text
      const lineItems = this.parseResponseToLineItems(textBlock.text);

      return {
        lineItems,
        pageCount: images.length,
      };
    } catch (error) {
      // Re-throw ClaudeVisionError as-is
      if (error instanceof ClaudeVisionError) {
        this.logError(error.errorType, error.message, images.length);
        throw error;
      }

      // Convert Anthropic SDK errors to ClaudeVisionError
      const claudeError = this.convertError(error);
      this.logError(claudeError.errorType, (error as Error).message || 'Unknown', images.length);
      throw claudeError;
    }
  }

  /**
   * PDFページ画像から数量表データを抽出する
   * Requirements: 30.3, 30.4
   *
   * Task 43.1: 数量表のフィールド構造に特化したプロンプトでClaude Vision APIを呼び出す
   */
  async extractQuantityTableData(
    images: ClaudeVisionImageInput[]
  ): Promise<ClaudeVisionQuantityExtractionResult> {
    if (!this.client) {
      throw ClaudeVisionError.serviceUnavailable();
    }

    try {
      const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

      for (const image of images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.base64Data,
          },
        });
      }

      contentBlocks.push({
        type: 'text',
        text: QUANTITY_TABLE_EXTRACTION_PROMPT,
      });

      const response = await this.client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: contentBlocks,
            },
          ],
        },
        {
          timeout: 30000,
        }
      );

      const textBlock = response.content.find(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      );

      if (!textBlock) {
        throw ClaudeVisionError.parseError();
      }

      const lineItems = this.parseResponseToQuantityLineItems(textBlock.text);

      return {
        lineItems,
        pageCount: images.length,
      };
    } catch (error) {
      if (error instanceof ClaudeVisionError) {
        this.logError(error.errorType, error.message, images.length);
        throw error;
      }

      const claudeError = this.convertError(error);
      this.logError(claudeError.errorType, (error as Error).message || 'Unknown', images.length);
      throw claudeError;
    }
  }

  /**
   * Claude APIレスポンステキストからJSON配列を抽出してQuantityLineItem[]に変換
   * Requirements: 30.4
   */
  private parseResponseToQuantityLineItems(responseText: string): ClaudeVisionQuantityLineItem[] {
    const parsed = this.extractJsonArray(responseText);

    return parsed.map((item: Record<string, unknown>) => ({
      majorCategory: item.majorCategory != null ? String(item.majorCategory) : null,
      middleCategory: item.middleCategory != null ? String(item.middleCategory) : null,
      minorCategory: item.minorCategory != null ? String(item.minorCategory) : null,
      customCategory: item.customCategory != null ? String(item.customCategory) : null,
      workType: item.workType != null ? String(item.workType) : null,
      name: item.name != null ? String(item.name) : null,
      specification: item.specification != null ? String(item.specification) : null,
      quantity: this.parseNumericField(item.quantity),
      unit: item.unit != null ? String(item.unit) : null,
      remarks: item.remarks != null ? String(item.remarks) : null,
    }));
  }

  /**
   * レスポンステキストからJSON配列を抽出する（共通処理）
   */
  private extractJsonArray(responseText: string): Record<string, unknown>[] {
    let jsonText = responseText.trim();

    const jsonBlockMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch?.[1]) {
      jsonText = jsonBlockMatch[1].trim();
    } else {
      const arrayStart = jsonText.indexOf('[');
      const arrayEnd = jsonText.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = jsonText.substring(arrayStart, arrayEnd + 1);
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw ClaudeVisionError.parseError();
    }

    if (!Array.isArray(parsed)) {
      throw ClaudeVisionError.parseError();
    }

    return parsed as Record<string, unknown>[];
  }

  /**
   * Claude APIレスポンステキストからJSON配列を抽出してLineItem[]に変換
   * Requirements: 26.5-26.8
   */
  private parseResponseToLineItems(responseText: string): ClaudeVisionLineItem[] {
    const parsed = this.extractJsonArray(responseText);

    // Convert each item to ClaudeVisionLineItem with proper type coercion
    return parsed.map((item: Record<string, unknown>) => ({
      customCategory: item.customCategory != null ? String(item.customCategory) : null,
      workType: item.workType != null ? String(item.workType) : null,
      name: String(item.name || ''),
      specification: item.specification != null ? String(item.specification) : null,
      unit: item.unit != null ? String(item.unit) : null,
      quantity: this.parseNumericField(item.quantity),
      unitPrice: this.parseNumericField(item.unitPrice),
      amount: this.parseNumericField(item.amount),
      remarks: item.remarks != null ? String(item.remarks) : null,
    }));
  }

  /**
   * 数値フィールドをNumber型に変換
   * カンマ区切り数値にも対応
   * Requirements: 26.7, 26.8
   */
  private parseNumericField(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Remove commas from comma-separated numbers (e.g., "1,234,567" -> "1234567")
      const cleaned = value.replace(/,/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  /**
   * Anthropic SDKエラーをClaudeVisionErrorに変換
   * Requirements: 23.1-23.5
   */
  private convertError(error: unknown): ClaudeVisionError {
    if (error instanceof APIConnectionTimeoutError) {
      return ClaudeVisionError.timeout();
    }
    if (error instanceof RateLimitError) {
      return ClaudeVisionError.rateLimit();
    }
    if (error instanceof AuthenticationError) {
      return ClaudeVisionError.authError();
    }
    if (error instanceof Error) {
      return ClaudeVisionError.unknown(error.message);
    }
    return ClaudeVisionError.unknown('Unknown error');
  }

  /**
   * エラーログを記録（APIキーは含めない）
   * Requirements: 23.6
   */
  private logError(errorType: string, originalMessage: string, imageCount: number): void {
    logger.error(
      {
        errorType,
        originalMessage,
        imageCount,
      },
      'Claude Vision API error'
    );
  }
}
