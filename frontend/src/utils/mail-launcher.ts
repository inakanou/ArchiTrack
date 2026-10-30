/**
 * @fileoverview メール起動 URL ビルダーユーティリティ
 *
 * Task 87: メール起動 URL ビルダーユーティリティ
 *
 * 見積依頼文（宛先・表題・本文）から、OS 既定メールクライアント起動用の
 * `mailto:` URL（RFC 6068）と、ブラウザ版 Gmail の新規作成画面 URL を
 * 組み立てる純粋関数を提供します。
 *
 * URL ビルダー（buildMailtoUrl / buildGmailComposeUrl）は副作用（window 操作）を持ちません。
 *
 * Task 107.1: 見積依頼文をメールで開く操作は出力の記録の成功の後にだけ起動する（Requirement 42.15・42.16）。
 * そのための window の操作（mailto の起動、Gmail の作成画面のための空のタブの開閉と移動）を
 * openMailClient / openBlankMailTab / navigateMailTab / closeMailTab に置く。
 * 呼び出し側（EstimateRequestTextPanel のハンドラ）が記録の前後でこれらを呼ぶ。
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

// ============================================================================
// メールで開く操作（副作用あり。Task 107.1、Requirement 42.15・42.16）
// ============================================================================

/**
 * OS 既定のメールクライアントを `mailto:` の URL で起動する。
 *
 * 出力の記録の成功の後に呼ぶ（「メールで開く」のリンクの既定の動作は止めてある）。
 *
 * @param mailtoUrl - buildMailtoUrl が組み立てた URL
 */
export function openMailClient(mailtoUrl: string): void {
  window.location.href = mailtoUrl;
}

/**
 * 空の新しいタブを開き、開いたタブから元の画面を参照できないよう opener を切る。
 *
 * 記録を待ってから `window.open` すると利用者の操作による起動の扱いが切れてポップアップが
 * 止められうるため、クリックの処理の中で（`await` より前に）同期的に呼ぶ。中身（Gmail の作成画面）は
 * 記録の成功の後に navigateMailTab で入れ、記録の失敗では closeMailTab で閉じる。
 * 空のタブへ後から移すには開いたタブの参照が要るため `noopener` は付けず、opener を null にして
 * 従来の `noopener` と同じく移った先から元の画面を参照させない。
 *
 * @returns 開いたタブ。ポップアップが止められて開けなければ null
 */
export function openBlankMailTab(): Window | null {
  const tab = window.open('', '_blank');
  if (!tab) {
    return null;
  }
  try {
    tab.opener = null;
  } catch {
    // opener を書き換えられない環境でも、タブは開いたまま使う
  }
  return tab;
}

/**
 * openBlankMailTab で開いた空のタブを URL へ移す。
 *
 * タブの中に参照元を送らないリンク（`rel="noreferrer"`）を置いてクリックし、移った先へ参照元
 * （`Referer` と `document.referrer`）を渡さない（従来の `noreferrer` の保ち方）。
 *
 * @param tab - openBlankMailTab が返したタブ
 * @param url - 移る先（buildGmailComposeUrl が組み立てた URL）
 */
export function navigateMailTab(tab: Window, url: string): void {
  const doc = tab.document;
  const link = doc.createElement('a');
  link.href = url;
  link.rel = 'noreferrer';
  (doc.body ?? doc.documentElement).appendChild(link);
  link.click();
}

/**
 * openBlankMailTab で開いた空のタブを閉じる（記録の失敗など、作成画面へ移さないとき）。
 * 既に閉じたタブには何もしない。
 *
 * @param tab - openBlankMailTab が返したタブ
 */
export function closeMailTab(tab: Window): void {
  try {
    if (!tab.closed) {
      tab.close();
    }
  } catch {
    // 閉じられないタブは利用者が閉じる
  }
}
