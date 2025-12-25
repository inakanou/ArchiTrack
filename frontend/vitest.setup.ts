// jsdomの「Not implemented」警告を抑制（最初に実行）
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: string | Uint8Array) => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (str.includes('Not implemented')) {
    return true;
  }
  return originalStderrWrite(chunk);
}) as typeof process.stderr.write;

import '@testing-library/jest-dom/vitest';
