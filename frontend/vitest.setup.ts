// jsdomの「Not implemented」警告を抑制（最初に実行）
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: string | Uint8Array) => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (str.includes('Not implemented')) {
    return true;
  }
  return originalStderrWrite(chunk);
}) as typeof process.stderr.write;

// DOMMatrix / DOMPoint / Path2D のモック（pdfjs-dist / react-pdf 用）
// jsdom環境ではこれらのAPIが未実装のためモックが必要
class DOMMatrixMock {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  m11 = 1;
  m12 = 0;
  m13 = 0;
  m14 = 0;
  m21 = 0;
  m22 = 1;
  m23 = 0;
  m24 = 0;
  m31 = 0;
  m32 = 0;
  m33 = 1;
  m34 = 0;
  m41 = 0;
  m42 = 0;
  m43 = 0;
  m44 = 1;
  is2D = true;
  isIdentity = true;

  constructor(_init?: string | number[]) {
    // 初期化パラメータは無視
  }

  multiply() {
    return new DOMMatrixMock();
  }
  translate() {
    return new DOMMatrixMock();
  }
  scale() {
    return new DOMMatrixMock();
  }
  rotate() {
    return new DOMMatrixMock();
  }
  inverse() {
    return new DOMMatrixMock();
  }
  transformPoint() {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
}

class DOMPointMock {
  x = 0;
  y = 0;
  z = 0;
  w = 1;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
}

class Path2DMock {
  constructor(_path?: string | Path2DMock) {
    // 初期化パラメータは無視
  }
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}

// グローバルに設定
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = DOMMatrixMock;
}
if (typeof globalThis.DOMPoint === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMPoint = DOMPointMock;
}
if (typeof globalThis.Path2D === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Path2D = Path2DMock;
}

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
import { afterEach, vi } from 'vitest';

// Testing Library の cleanup を各テスト後に自動実行
// これにより DOM 要素とイベントリスナーが確実にクリーンアップされる
afterEach(() => {
  cleanup();
  // すべてのモックを元の実装に戻してメモリを完全に解放
  // restoreAllMocks は clearAllMocks よりも徹底的で、
  // モックの実装自体を削除してメモリリークを防ぐ
  vi.restoreAllMocks();
});
