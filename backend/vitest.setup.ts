// Vitest セットアップファイル
// テスト実行前の共通設定をここに記述
import 'dotenv/config';

// 環境変数のデフォルト設定（テスト用）
// 既に設定されている場合は上書きしない（GitHub Actions等での設定を尊重）
// CI環境ではGitHub Actionsが環境変数を設定する
// ローカル環境では.envファイルから読み込まれる
if (!process.env.CI) {
  // ローカル環境: .envから読み込んだ値を使用（開発用DBを使用）
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
} else {
  // CI環境: GitHub Actionsが設定した環境変数を使用
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.PORT = process.env.PORT || '3001';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
}
