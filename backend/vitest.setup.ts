// Vitest セットアップファイル
// テスト実行前の共通設定をここに記述

// 環境変数のデフォルト設定（テスト用）
// 既に設定されている場合は上書きしない（GitHub Actions等での設定を尊重）
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = process.env.PORT || '3001';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
