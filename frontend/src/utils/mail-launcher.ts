/**
 * @fileoverview メール起動 URL ビルダーユーティリティ
 *
 * Task 87: メール起動 URL ビルダーユーティリティ
 *
 * 見積依頼文（宛先・表題・本文）から、OS 既定メールクライアント起動用の
 * `mailto:` URL（RFC 6068）と、ブラウザ版 Gmail の新規作成画面 URL を
 * 組み立てる純粋関数を提供します。
 *
 * 本ユーティリティは副作用（window 操作）を一切持ちません。
 * URL を実際に開く処理（`window.location` / `window.open`）は呼び出し側
 * （EstimateRequestTextPanel のハンドラ）に置きます。
 *
 * Requirements:
 * - 41.2: mailto による OS 既定メーラー起動用 URL の生成（宛先・表題・本文入力済み）
 * - 41.3: ブラウザ版 Gmail の新規作成画面 URL の生成（宛先・表題・本文入力済み）
 * - 41.6: 本文の改行・整形を保持（CRLF 正規化のうえ `%0D%0A` にエンコード）
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * メール作成内容（メーラー起動 URL の入力）
 */
export interface MailComposition {
  /** 宛先メールアドレス（単一） */
  to: string;
  /** 表題 */
  subject: string;
  /** 本文（改行を含むプレーンテキスト） */
  body: string;
}

// ============================================================================
// 内部ヘルパー / 純粋関数
// ============================================================================

/**
 * 本文の改行を CRLF（`\r\n`）に正規化する。
 *
 * 入力に含まれる `\r\n` / `\r` / `\n` のいずれの改行表現も `\r\n` に統一します。
 * 正規化後の本文を `encodeURIComponent` / `URLSearchParams` でエンコードすると
 * `%0D%0A` となり、Windows メールクライアント・Gmail の双方で改行が保持されます。
 *
 * @param body - 改行を含むプレーンテキスト本文
 * @returns 改行を CRLF に正規化した本文
 */
export function normalizeBody(body: string): string {
  // 既存の CRLF を一旦 LF に畳んだうえで、残る単独の CR / LF を CRLF に統一する。
  // これにより CRLF が重複して "\r\r\n" になることを防ぐ。
  return body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
}

// ============================================================================
// URL ビルダー（純粋関数 / 副作用なし）
// ============================================================================

/**
 * OS 既定メールクライアント起動用の `mailto:` URL を組み立てる（RFC 6068）。
 *
 * - 宛先 `to` はアドレス位置（`mailto:` 直後）に配置します。
 * - `subject` / `body` は `URLSearchParams` でエンコードしたうえで、
 *   スペースを `%20` に置換します（`mailto` 本文では `+` がスペースとして
 *   解釈されないクライアントがあるため）。
 * - 本文の改行は CRLF に正規化したうえでエンコードされ、`%0D%0A` となります。
 *
 * 副作用はありません（URL 文字列を返すのみ）。
 *
 * @param composition - 宛先・表題・本文
 * @returns `mailto:<to>?subject=...&body=...` 形式の URL
 */
export function buildMailtoUrl(composition: MailComposition): string {
  const { to, subject, body } = composition;

  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', normalizeBody(body));

  // URLSearchParams はスペースを `+` にエンコードするため、mailto 互換のため `%20` に置換する。
  const query = params.toString().replace(/\+/g, '%20');

  return `mailto:${encodeURIComponent(to)}?${query}`;
}

/**
 * ブラウザ版 Gmail の新規作成画面 URL を組み立てる。
 *
 * - `view=cm`（compose）, `fs=1`（full screen）固定。
 * - `to` / `su`（表題）/ `body` を `URLSearchParams` でエンコードします。
 *   Gmail は `+` をスペースとして解釈するため、`%20` への置換は不要です。
 * - 本文の改行は CRLF に正規化したうえでエンコードされ、`%0D%0A` となります。
 *
 * 副作用はありません（URL 文字列を返すのみ）。
 *
 * @param composition - 宛先・表題・本文
 * @returns `https://mail.google.com/mail/?view=cm&fs=1&to=...&su=...&body=...` 形式の URL
 */
export function buildGmailComposeUrl(composition: MailComposition): string {
  const { to, subject, body } = composition;

  const params = new URLSearchParams();
  params.set('view', 'cm');
  params.set('fs', '1');
  params.set('to', to);
  params.set('su', subject);
  params.set('body', normalizeBody(body));

  return `https://mail.google.com/mail/?${params.toString()}`;
}
