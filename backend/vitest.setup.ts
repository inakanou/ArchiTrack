// Vitest セットアップファイル
// 各テストファイル実行前の共通設定をここに記述
// 注意: このファイルは各テストファイルごとに実行されます
// 全テストで一度だけ実行する必要がある処理は vitest.global-setup.ts に記述してください

import 'dotenv/config';

// 環境変数の検証
// globalSetupで設定された環境変数が正しく引き継がれているかを確認
if (!process.env.JWT_PUBLIC_KEY || !process.env.JWT_PRIVATE_KEY) {
  throw new Error(
    'JWT keys not found in environment variables. Global setup may not have run correctly.'
  );
}
