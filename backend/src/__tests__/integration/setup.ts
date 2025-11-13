/**
 * @fileoverview Integration test setup
 *
 * 統合テスト実行前に環境変数を設定
 */

import { beforeAll } from 'vitest';

beforeAll(() => {
  // 統合テストではNODE_ENV='test'を設定してレート制限をスキップ
  process.env.NODE_ENV = 'test';
});
