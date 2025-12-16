import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 ストレージ設定テスト
 *
 * Requirements: 4.1, 14.6
 * - S3Clientのシングルトン初期化
 * - 環境変数の設定と検証
 * - 接続テストユーティリティ
 */

// AWS SDKのモック
vi.mock('@aws-sdk/client-s3');

// loggerのモック
vi.mock('../../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Storage Configuration', () => {
  // 元の環境変数を保存
  const originalEnv = { ...process.env };
  let mockSend: Mock;
  let mockDestroy: Mock;

  beforeEach(async () => {
    // テストごとにモジュールをリセット
    vi.resetModules();
    vi.clearAllMocks();

    // 環境変数をクリア
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_PUBLIC_URL;

    // S3Clientのモックを設定
    mockSend = vi.fn().mockResolvedValue({});
    mockDestroy = vi.fn();

    (S3Client as unknown as Mock).mockImplementation(function (this: unknown, config: unknown) {
      return {
        config,
        send: mockSend,
        destroy: mockDestroy,
      };
    });

    // HeadBucketCommandをクラスとしてモック
    (HeadBucketCommand as unknown as Mock).mockImplementation(function (
      this: unknown,
      params: unknown
    ) {
      return { input: params };
    });
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = { ...originalEnv };
  });

  describe('getS3Client', () => {
    it('should create S3Client with correct configuration when all env vars are set', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // Act
      const { getS3Client } = await import('../../../config/storage.js');
      const client = getS3Client();

      // Assert
      expect(client).toBeDefined();
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'auto',
          endpoint: 'https://test-account.r2.cloudflarestorage.com',
          credentials: {
            accessKeyId: 'test-access-key-id',
            secretAccessKey: 'test-secret-access-key',
          },
        })
      );
    });

    it('should return the same instance on subsequent calls (singleton)', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // Act
      const { getS3Client } = await import('../../../config/storage.js');
      const client1 = getS3Client();
      const client2 = getS3Client();

      // Assert
      expect(client1).toBe(client2);
      // S3Clientは1回だけ呼ばれる
      expect(S3Client).toHaveBeenCalledTimes(1);
    });

    it('should throw error when R2_ENDPOINT is not set', async () => {
      // Arrange
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_ENDPOINT is intentionally not set

      // Act & Assert
      const { getS3Client } = await import('../../../config/storage.js');
      expect(() => getS3Client()).toThrow('R2_ENDPOINT');
    });

    it('should throw error when R2_ACCESS_KEY_ID is not set', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_ACCESS_KEY_ID is intentionally not set

      // Act & Assert
      const { getS3Client } = await import('../../../config/storage.js');
      expect(() => getS3Client()).toThrow('R2_ACCESS_KEY_ID');
    });

    it('should throw error when R2_SECRET_ACCESS_KEY is not set', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_SECRET_ACCESS_KEY is intentionally not set

      // Act & Assert
      const { getS3Client } = await import('../../../config/storage.js');
      expect(() => getS3Client()).toThrow('R2_SECRET_ACCESS_KEY');
    });

    it('should throw error when R2_BUCKET_NAME is not set', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      // R2_BUCKET_NAME is intentionally not set

      // Act & Assert
      const { getS3Client } = await import('../../../config/storage.js');
      expect(() => getS3Client()).toThrow('R2_BUCKET_NAME');
    });
  });

  describe('getStorageConfig', () => {
    it('should return storage configuration object', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      process.env.R2_PUBLIC_URL = 'https://images.example.com';

      // Act
      const { getStorageConfig } = await import('../../../config/storage.js');
      const config = getStorageConfig();

      // Assert
      expect(config).toEqual({
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
        bucketName: 'test-bucket',
        publicUrl: 'https://images.example.com',
        region: 'auto',
      });
    });

    it('should return null for publicUrl when R2_PUBLIC_URL is not set', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_PUBLIC_URL is intentionally not set

      // Act
      const { getStorageConfig } = await import('../../../config/storage.js');
      const config = getStorageConfig();

      // Assert
      expect(config.publicUrl).toBeNull();
    });
  });

  describe('testStorageConnection', () => {
    it('should return true when connection is successful', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // モックが成功応答を返す（beforeEachで設定済み）
      mockSend.mockResolvedValue({});

      // Act
      const { testStorageConnection } = await import('../../../config/storage.js');
      const result = await testStorageConnection();

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');
      expect(mockSend).toHaveBeenCalled();
    });

    it('should return false with error message when connection fails', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // モックがエラーを返す
      mockSend.mockRejectedValue(new Error('Connection refused'));

      // Act
      const { testStorageConnection } = await import('../../../config/storage.js');
      const result = await testStorageConnection();

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });

  describe('disconnectStorage', () => {
    it('should disconnect and reset S3Client instance', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // Act
      const { getS3Client, disconnectStorage } = await import('../../../config/storage.js');
      getS3Client(); // 初期化
      await disconnectStorage();

      // Assert
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should not throw when called without initialization', async () => {
      // Arrange - no initialization

      // Act & Assert
      const { disconnectStorage } = await import('../../../config/storage.js');
      await expect(disconnectStorage()).resolves.not.toThrow();
    });
  });

  describe('isStorageConfigured', () => {
    it('should return true when all required env vars are set', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // Act
      const { isStorageConfigured } = await import('../../../config/storage.js');
      const result = isStorageConfigured();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when R2_ENDPOINT is missing', async () => {
      // Arrange
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_ENDPOINT is not set

      // Act
      const { isStorageConfigured } = await import('../../../config/storage.js');
      const result = isStorageConfigured();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when R2_ACCESS_KEY_ID is missing', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_ACCESS_KEY_ID is not set

      // Act
      const { isStorageConfigured } = await import('../../../config/storage.js');
      const result = isStorageConfigured();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when R2_SECRET_ACCESS_KEY is missing', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_BUCKET_NAME = 'test-bucket';
      // R2_SECRET_ACCESS_KEY is not set

      // Act
      const { isStorageConfigured } = await import('../../../config/storage.js');
      const result = isStorageConfigured();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when R2_BUCKET_NAME is missing', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      // R2_BUCKET_NAME is not set

      // Act
      const { isStorageConfigured } = await import('../../../config/storage.js');
      const result = isStorageConfigured();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when R2_ENDPOINT is empty string', async () => {
      // Arrange
      process.env.R2_ENDPOINT = '';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      // Act
      const { isStorageConfigured } = await import('../../../config/storage.js');
      const result = isStorageConfigured();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('resetS3Client', () => {
    it('should reset the singleton instance for testing purposes', async () => {
      // Arrange
      process.env.R2_ENDPOINT = 'https://test-account.r2.cloudflarestorage.com';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key-id';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-access-key';
      process.env.R2_BUCKET_NAME = 'test-bucket';

      const { getS3Client, resetS3Client } = await import('../../../config/storage.js');

      // Act
      const client1 = getS3Client();
      resetS3Client();
      const client2 = getS3Client();

      // Assert - S3Clientが2回呼ばれている（リセット後の再初期化）
      expect(S3Client).toHaveBeenCalledTimes(2);
      // client1とclient2は異なるインスタンス
      expect(client1).not.toBe(client2);
    });
  });
});
