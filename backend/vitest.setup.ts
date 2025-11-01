// Vitest セットアップファイル
// テスト実行前の共通設定をここに記述

// 環境変数のモック設定（テスト用）
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379/1';
