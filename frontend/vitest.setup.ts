// jsdomの「Not implemented」警告を抑制（最初に実行）
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: string | Uint8Array) => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (str.includes('Not implemented')) {
    return true;
  }
  return originalStderrWrite(chunk);
}) as typeof process.stderr.write;

// React Testing Libraryのact()警告を抑制
// fake timersとReactの状態更新の相互作用による既知の問題
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const message = typeof args[0] === 'string' ? args[0] : '';
  if (message.includes('inside a test was not wrapped in act')) {
    return;
  }
  originalConsoleError(...args);
};

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library の cleanup を各テスト後に自動実行
// これにより DOM 要素とイベントリスナーが確実にクリーンアップされる
afterEach(() => {
  cleanup();
});
