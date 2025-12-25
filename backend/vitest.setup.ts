// Vitest セットアップファイル
// 各テストファイル実行前の共通設定をここに記述
// 注意: このファイルは各テストファイルごとに実行されます
// 全テストで一度だけ実行する必要がある処理は vitest.global-setup.ts に記述してください

import 'dotenv/config';
import { vi } from 'vitest';

// ============================================================================
// グローバルモック: ログ出力の抑制
// ============================================================================
// テスト出力をクリーンに保つため、loggerをモックしてログ出力を抑制
// 個別のテストでモックを上書きしたい場合は vi.mock() で再定義可能
vi.mock('./src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
    })),
  },
}));

// 環境変数の検証
// globalSetupで設定された環境変数が正しく引き継がれているかを確認
if (!process.env.JWT_PUBLIC_KEY || !process.env.JWT_PRIVATE_KEY) {
  throw new Error(
    'JWT keys not found in environment variables. Global setup may not have run correctly.'
  );
}
