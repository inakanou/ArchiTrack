/**
 * toSafeInternalPath の単体テスト（是正計画 D13: ログイン後の遷移先の開放リダイレクトの是正）
 */
import { describe, it, expect } from 'vitest';
import { toSafeInternalPath } from './safe-redirect';

describe('toSafeInternalPath', () => {
  it.each(['/dashboard', '/admin/users?page=2', '/projects/1#photos', '/'])(
    '画面内のパス %s はそのまま返す',
    (value) => {
      expect(toSafeInternalPath(value)).toBe(value);
    }
  );

  it.each([
    ['外部 URL', 'https://malicious.example/phishing'],
    ['プロトコル相対 URL', '//malicious.example/phishing'],
    ['バックスラッシュで始まる値', '/\\malicious.example/phishing'],
    ['バックスラッシュを含む値', '/\\/malicious.example'],
    ['タブを含む値', '/\t/malicious.example'],
    ['改行を含む値', '/\n/malicious.example'],
    ['javascript スキーム', 'javascript:alert(1)'],
    ['相対パス', 'dashboard'],
    ['空文字', ''],
  ])('%s（%s）は null を返す', (_label, value) => {
    expect(toSafeInternalPath(value)).toBeNull();
  });

  it.each([null, undefined, 1, {}, ['/dashboard']])(
    '文字列でない値（%s）は null を返す',
    (value) => {
      expect(toSafeInternalPath(value)).toBeNull();
    }
  );
});
