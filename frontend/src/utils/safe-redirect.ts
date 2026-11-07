/**
 * 画面内の遷移先として安全なパスかを判定する（開放リダイレクトの防止）
 *
 * `/` で始まる値でも、次のものは別のオリジンへ遷移しうるため拒否する。
 * - `//evil.example`（プロトコル相対 URL）
 * - `/\evil.example`（URL の解釈でバックスラッシュが `/` に読み替えられ `//evil.example` になる）
 * - タブ・改行などの制御文字を含む値（URL の解釈で取り除かれ `//` が現れうる）
 * 最後に、画面のオリジンを基準に URL として解釈し、同じオリジンに留まることを確かめる。
 */

// バックスラッシュと制御文字（C0・DEL）
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

/**
 * 安全な画面内のパスならその値を、そうでなければ null を返す
 */
export function toSafeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  if (UNSAFE_CHARACTERS.test(value)) {
    return null;
  }
  try {
    const origin = window.location.origin;
    if (new URL(value, origin).origin !== origin) {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}
