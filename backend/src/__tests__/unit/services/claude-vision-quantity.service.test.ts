/**
 * ClaudeVisionService 数量表抽出メソッドのユニットテスト
 *
 * Task 43.1: バックエンドのClaudeVisionServiceに数量表用抽出メソッドを追加する
 *
 * Requirements:
 * - 30.3: 数量表の表構造を解析するためのプロンプトを含める
 * - 30.4: Claude APIのレスポンスからJSON形式の表データを抽出し、数量項目フィールドにマッピングする
 *
 * @module tests/unit/services/claude-vision-quantity.service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeVisionError } from '../../../errors/claudeVisionError.js';

// Mock the @anthropic-ai/sdk module
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
    constructor() {}
  }

  class APIConnectionTimeoutError extends Error {
    constructor(opts?: { message?: string }) {
      super(opts?.message || 'Connection timeout');
      this.name = 'APIConnectionTimeoutError';
    }
  }

  class RateLimitError extends Error {
    status = 429;
    constructor(
      status: number,
      _error: unknown,
      message: string | undefined,
      _headers: Record<string, string>
    ) {
      super(message || 'Rate limit');
      this.name = 'RateLimitError';
      this.status = status;
    }
  }

  class AuthenticationError extends Error {
    status = 401;
    constructor(
      status: number,
      _error: unknown,
      message: string | undefined,
      _headers: Record<string, string>
    ) {
      super(message || 'Authentication error');
      this.name = 'AuthenticationError';
      this.status = status;
    }
  }

  return {
    default: MockAnthropic,
    APIConnectionTimeoutError,
    RateLimitError,
    AuthenticationError,
  };
});

// Mock logger
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  ClaudeVisionService,
  type ClaudeVisionQuantityLineItem,
} from '../../../services/claude-vision.service.js';

describe('ClaudeVisionService - 数量表抽出', () => {
  let service: ClaudeVisionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClaudeVisionService('test-api-key');
  });

  describe('extractQuantityTableData', () => {
    it('数量表用プロンプトでClaude Vision APIを呼び出し、数量項目フィールドにマッピングされた結果を返す', async () => {
      // Arrange
      const mockResponseJson: ClaudeVisionQuantityLineItem[] = [
        {
          majorCategory: '土工',
          middleCategory: '掘削',
          minorCategory: null,
          customCategory: null,
          workType: '土工',
          name: '掘削工',
          specification: 'バックホウ0.45m3',
          quantity: 150,
          unit: 'm3',
          remarks: null,
        },
        {
          majorCategory: '土工',
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '土工',
          name: '埋戻し工',
          specification: null,
          quantity: 80,
          unit: 'm3',
          remarks: '現場発生土使用',
        },
      ];

      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponseJson),
          },
        ],
      });

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      // Act
      const result = await service.extractQuantityTableData(images);

      // Assert
      expect(result.lineItems).toHaveLength(2);
      expect(result.pageCount).toBe(1);
      expect(result.lineItems[0]).toEqual({
        majorCategory: '土工',
        middleCategory: '掘削',
        minorCategory: null,
        customCategory: null,
        workType: '土工',
        name: '掘削工',
        specification: 'バックホウ0.45m3',
        quantity: 150,
        unit: 'm3',
        remarks: null,
      });
    });

    it('数量表用プロンプトに数量項目フィールド（大項目・中項目・小項目・任意分類・工種・名称・規格・数量・単位・備考）の抽出指示が含まれる', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '[]' }],
      });

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      await service.extractQuantityTableData(images);

      // プロンプトのテキストブロックを確認
      const callArgs = mockCreate.mock.calls[0]?.[0];
      const messages = callArgs?.messages;
      expect(messages).toBeDefined();
      const userContent = messages[0]?.content;
      const textBlock = userContent.find((block: { type: string }) => block.type === 'text');
      expect(textBlock).toBeDefined();
      const promptText = textBlock.text;

      // 数量表用フィールドの指示が含まれていること
      expect(promptText).toContain('majorCategory');
      expect(promptText).toContain('middleCategory');
      expect(promptText).toContain('minorCategory');
      expect(promptText).toContain('customCategory');
      expect(promptText).toContain('workType');
      expect(promptText).toContain('specification');
      expect(promptText).toContain('quantity');
      expect(promptText).toContain('unit');
      expect(promptText).toContain('remarks');
      // 見積書用フィールドが含まれないこと
      expect(promptText).not.toContain('unitPrice');
      expect(promptText).not.toContain('amount');
    });

    it('APIキー未設定の場合はserviceUnavailableエラーをスローする', async () => {
      const disabledService = new ClaudeVisionService(undefined);

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      await expect(disabledService.extractQuantityTableData(images)).rejects.toThrow(
        ClaudeVisionError
      );
    });

    it('JSONレスポンスが```json...```マーカーで囲まれている場合も正しくパースする', async () => {
      const mockResponse = [
        {
          majorCategory: null,
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '仮設',
          name: '仮設工',
          specification: null,
          quantity: 1,
          unit: '式',
          remarks: null,
        },
      ];

      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify(mockResponse) + '\n```',
          },
        ],
      });

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      const result = await service.extractQuantityTableData(images);
      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0]?.workType).toBe('仮設');
    });

    it('カンマ区切り数値を正しくパースする', async () => {
      const mockResponse = [
        {
          majorCategory: null,
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          workType: '土工',
          name: '掘削工',
          specification: null,
          quantity: '1,234.56',
          unit: 'm3',
          remarks: null,
        },
      ];

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      });

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      const result = await service.extractQuantityTableData(images);
      expect(result.lineItems[0]?.quantity).toBe(1234.56);
    });

    it('レスポンスにテキストブロックが含まれない場合はparseErrorをスローする', async () => {
      mockCreate.mockResolvedValue({
        content: [],
      });

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      await expect(service.extractQuantityTableData(images)).rejects.toThrow(ClaudeVisionError);
    });

    it('不正なJSONレスポンスの場合はparseErrorをスローする', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json' }],
      });

      const images = [{ base64Data: 'dGVzdA==', mediaType: 'image/png' as const }];

      await expect(service.extractQuantityTableData(images)).rejects.toThrow(ClaudeVisionError);
    });
  });
});
