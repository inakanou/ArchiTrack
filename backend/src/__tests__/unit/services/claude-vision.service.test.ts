/**
 * ClaudeVisionServiceのユニットテスト
 *
 * Requirements:
 * - 21.3: Anthropic Messages API（claude-haiku-4-5-20251001）使用
 * - 21.4: 建設見積書プロンプト
 * - 21.5: JSON形式表データ抽出
 * - 21.6: LineItem[]形式変換
 * - 22.1: ANTHROPIC_API_KEY環境変数読み取り
 * - 22.2: APIキー未設定時の機能無効化
 * - 22.4: APIキーのログ/レスポンス非出力
 * - 23.1-23.7: エラーハンドリング
 * - 26.1-26.8: 構造化データ抽出精度
 *
 * @module tests/unit/services/claude-vision.service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    debug: vi.fn(),
  },
}));

// Import after mocks
import { ClaudeVisionService } from '../../../services/claude-vision.service.js';
import logger from '../../../utils/logger.js';

describe('ClaudeVisionService', () => {
  let service: ClaudeVisionService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isEnabled()', () => {
    it('should return true when ANTHROPIC_API_KEY is set', () => {
      service = new ClaudeVisionService('sk-ant-test-key');
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when ANTHROPIC_API_KEY is undefined', () => {
      service = new ClaudeVisionService(undefined);
      expect(service.isEnabled()).toBe(false);
    });

    it('should return false when ANTHROPIC_API_KEY is empty string', () => {
      service = new ClaudeVisionService('');
      expect(service.isEnabled()).toBe(false);
    });

    it('should log warning when API key is not set', () => {
      service = new ClaudeVisionService(undefined);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Claude Vision'));
    });
  });

  describe('extractLineItems()', () => {
    beforeEach(() => {
      service = new ClaudeVisionService('sk-ant-test-key');
    });

    it('should call Anthropic API with correct model (claude-haiku-4-5-20251001)', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                customCategory: null,
                workType: '土工',
                name: '掘削工',
                specification: 'バックホウ',
                unit: 'm3',
                quantity: 100,
                unitPrice: 2500,
                amount: 250000,
                remarks: null,
              },
            ]),
          },
        ],
      });

      await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
        }),
        expect.any(Object)
      );
    });

    it('should set timeout to 30 seconds', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
        }),
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should send images as base64 content blocks', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await service.extractLineItems([
        { base64Data: 'aW1hZ2UxZGF0YQ==', mediaType: 'image/png' },
        { base64Data: 'aW1hZ2UyZGF0YQ==', mediaType: 'image/jpeg' },
      ]);

      const callArgs = mockCreate.mock.calls[0]![0];
      const userMessage = callArgs.messages[0];
      expect(userMessage.role).toBe('user');

      // Should contain 2 image blocks + 1 text (prompt) block
      const imageBlocks = userMessage.content.filter((b: { type: string }) => b.type === 'image');
      expect(imageBlocks).toHaveLength(2);
      expect(imageBlocks[0].source.type).toBe('base64');
      expect(imageBlocks[0].source.data).toBe('aW1hZ2UxZGF0YQ==');
      expect(imageBlocks[0].source.media_type).toBe('image/png');
      expect(imageBlocks[1].source.data).toBe('aW1hZ2UyZGF0YQ==');
      expect(imageBlocks[1].source.media_type).toBe('image/jpeg');
    });

    it('should include prompt with field definitions', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);

      const callArgs = mockCreate.mock.calls[0]![0];
      const userMessage = callArgs.messages[0];
      const textBlock = userMessage.content.find((b: { type: string }) => b.type === 'text');
      expect(textBlock).toBeDefined();
      expect(textBlock!.text).toContain('customCategory');
      expect(textBlock!.text).toContain('workType');
      expect(textBlock!.text).toContain('name');
      expect(textBlock!.text).toContain('specification');
      expect(textBlock!.text).toContain('unit');
      expect(textBlock!.text).toContain('quantity');
      expect(textBlock!.text).toContain('unitPrice');
      expect(textBlock!.text).toContain('amount');
      expect(textBlock!.text).toContain('remarks');
    });

    it('should include exclusion rules in prompt (summary rows, headers)', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);

      const callArgs = mockCreate.mock.calls[0]![0];
      const userMessage = callArgs.messages[0];
      const textBlock = userMessage.content.find((b: { type: string }) => b.type === 'text');
      expect(textBlock!.text).toContain('合計');
      expect(textBlock!.text).toContain('小計');
      expect(textBlock!.text).toContain('ヘッダー');
    });

    it('should include JSON array output format instruction', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);

      const callArgs = mockCreate.mock.calls[0]![0];
      const userMessage = callArgs.messages[0];
      const textBlock = userMessage.content.find((b: { type: string }) => b.type === 'text');
      expect(textBlock!.text).toContain('JSON');
    });

    it('should parse JSON response with ```json markers', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '```json\n[{"customCategory": null, "workType": "土工", "name": "掘削工", "specification": "バックホウ", "unit": "m3", "quantity": 100, "unitPrice": 2500, "amount": 250000, "remarks": null}]\n```',
          },
        ],
      });

      const result = await service.extractLineItems([
        { base64Data: 'dGVzdA==', mediaType: 'image/png' },
      ]);

      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0]!.name).toBe('掘削工');
      expect(result.lineItems[0]!.workType).toBe('土工');
      expect(result.lineItems[0]!.quantity).toBe(100);
    });

    it('should parse JSON response with direct array format', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '[{"customCategory": null, "workType": null, "name": "テスト項目", "specification": null, "unit": "式", "quantity": 1, "unitPrice": 5000, "amount": 5000, "remarks": null}]',
          },
        ],
      });

      const result = await service.extractLineItems([
        { base64Data: 'dGVzdA==', mediaType: 'image/png' },
      ]);

      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0]!.name).toBe('テスト項目');
    });

    it('should convert string number fields to Number type', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '[{"name": "項目", "quantity": "100.5", "unitPrice": "2500", "amount": "251250"}]',
          },
        ],
      });

      const result = await service.extractLineItems([
        { base64Data: 'dGVzdA==', mediaType: 'image/png' },
      ]);

      expect(result.lineItems[0]!.quantity).toBe(100.5);
      expect(result.lineItems[0]!.unitPrice).toBe(2500);
      expect(result.lineItems[0]!.amount).toBe(251250);
    });

    it('should handle comma-separated numbers (e.g., "1,234,567" -> 1234567)', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '[{"name": "項目", "quantity": "1,234", "unitPrice": "33,000", "amount": "40,722,000"}]',
          },
        ],
      });

      const result = await service.extractLineItems([
        { base64Data: 'dGVzdA==', mediaType: 'image/png' },
      ]);

      expect(result.lineItems[0]!.quantity).toBe(1234);
      expect(result.lineItems[0]!.unitPrice).toBe(33000);
      expect(result.lineItems[0]!.amount).toBe(40722000);
    });

    it('should return pageCount matching images count', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      const result = await service.extractLineItems([
        { base64Data: 'aW1hZ2Ux', mediaType: 'image/png' },
        { base64Data: 'aW1hZ2Uy', mediaType: 'image/png' },
        { base64Data: 'aW1hZ2Uz', mediaType: 'image/png' },
      ]);

      expect(result.pageCount).toBe(3);
    });

    it('should handle null fields in response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '[{"customCategory": null, "workType": null, "name": "テスト", "specification": null, "unit": null, "quantity": null, "unitPrice": null, "amount": null, "remarks": null}]',
          },
        ],
      });

      const result = await service.extractLineItems([
        { base64Data: 'dGVzdA==', mediaType: 'image/png' },
      ]);

      expect(result.lineItems[0]!.customCategory).toBeNull();
      expect(result.lineItems[0]!.quantity).toBeNull();
      expect(result.lineItems[0]!.unitPrice).toBeNull();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      service = new ClaudeVisionService('sk-ant-test-key');
    });

    it('should convert APIConnectionTimeoutError to ClaudeVisionError.timeout()', async () => {
      const { APIConnectionTimeoutError } = await import('@anthropic-ai/sdk');
      mockCreate.mockRejectedValueOnce(new APIConnectionTimeoutError());

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionError);
        expect((e as ClaudeVisionError).errorType).toBe('timeout');
        expect((e as ClaudeVisionError).statusCode).toBe(504);
      }
    });

    it('should convert RateLimitError to ClaudeVisionError.rateLimit()', async () => {
      const { RateLimitError } = await import('@anthropic-ai/sdk');
      mockCreate.mockRejectedValueOnce(
        new RateLimitError(429, undefined, 'Rate limited', new Headers())
      );

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionError);
        expect((e as ClaudeVisionError).errorType).toBe('rate_limit');
      }
    });

    it('should convert AuthenticationError to ClaudeVisionError.authError()', async () => {
      const { AuthenticationError } = await import('@anthropic-ai/sdk');
      mockCreate.mockRejectedValueOnce(
        new AuthenticationError(401, undefined, 'Invalid key', new Headers())
      );

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionError);
        expect((e as ClaudeVisionError).errorType).toBe('auth_error');
      }
    });

    it('should throw ClaudeVisionError.parseError() when response is not valid JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'This is not JSON at all' }],
      });

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionError);
        expect((e as ClaudeVisionError).errorType).toBe('parse_error');
      }
    });

    it('should throw ClaudeVisionError.parseError() when parsed result is not an array', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"not": "an array"}' }],
      });

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionError);
        expect((e as ClaudeVisionError).errorType).toBe('parse_error');
      }
    });

    it('should convert generic Error to ClaudeVisionError.unknown()', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Something unexpected'));

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ClaudeVisionError);
        expect((e as ClaudeVisionError).errorType).toBe('unknown');
      }
    });

    it('should log errors without including API key', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Test error'));

      try {
        await service.extractLineItems([{ base64Data: 'dGVzdA==', mediaType: 'image/png' }]);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalled();
      const logCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
      const logData = JSON.stringify(logCall);
      expect(logData).not.toContain('sk-ant-test-key');
    });

    it('should log error with errorType and image count', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Test error'));

      try {
        await service.extractLineItems([
          { base64Data: 'dGVzdA==', mediaType: 'image/png' },
          { base64Data: 'dGVzdA==', mediaType: 'image/png' },
        ]);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: 'unknown',
          imageCount: 2,
        }),
        expect.any(String)
      );
    });
  });
});
