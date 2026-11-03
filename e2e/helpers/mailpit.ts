/**
 * Mailpit（テスト用のメールサーバー）から、テストが送らせたメールを読む補助
 *
 * パスワードリセットと招待のメールのリンクを E2E で辿るために使う（user-authentication 要件7.1・1.3・37.3）。
 */

import { API_BASE_URL } from '../config';

// Mailpit API URL
//
// 公開ポートは環境ごとに違い、backend の公開ポートと組で決まる。
//   テスト環境（docker-compose.test.yml）: backend `3100:3000` / Mailpit `8026:8025`
//   CI 環境（docker-compose.ci.yml）:      backend `3000:3000` / Mailpit `8025:8025`
//   開発環境（docker-compose.dev.yml）:    backend `3000:3000` / Mailpit `8025:8025`
//
// 従来は 8025 に固定していた。テスト環境（`npm run test:docker`）では
// そこに居るのは**開発環境の Mailpit** であり、開発環境が落ちていれば接続すらできない。
// どちらにせよテストが送らせたメールは見つからず、取得結果は常に null になる。
// その null を「メールが取れた場合のみ検証する」分岐で受けていたため、
// メール経由の検証は一度も実行されていなかった。
//
// `process.env.CI` では判別できない。`.husky/scripts/pre-push.sh` はテスト環境に対して
// `CI=true npx playwright test` を実行するためである。判別できるのは接続先そのもの、
// すなわち {@link API_BASE_URL} のポートである。
const MAILPIT_HOST_PORT = new URL(API_BASE_URL).port === '3100' ? 8026 : 8025;

/** Mailpit の API の URL */
export const mailpitApiUrl =
  process.env.MAILPIT_API_URL ?? `http://localhost:${MAILPIT_HOST_PORT}/api/v1`;

/** Mailpit から読んだメール */
export interface MailpitEmail {
  id: string;
  subject: string;
  html: string;
  text: string;
}

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

function isAddressedTo(message: MailpitMessageSummary, toEmail: string): boolean {
  return message.To?.some((to) => to.Address.toLowerCase() === toEmail.toLowerCase()) ?? false;
}

async function listMessages(): Promise<MailpitMessageSummary[]> {
  const response = await fetch(`${mailpitApiUrl}/messages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }
  const data = (await response.json()) as { messages: MailpitMessageSummary[] };
  return data.messages ?? [];
}

/**
 * Mailpitから全メールを削除
 */
export async function clearMailpit(): Promise<void> {
  // 消せなかった場合に黙って続けると、前のテストが残したメールを
  // 「今回送られたメール」として読んでしまう。前提が崩れた地点で失敗させる。
  const response = await fetch(`${mailpitApiUrl}/messages`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(
      `Mailpit のメールを消去できない: ${mailpitApiUrl} が ${response.status} を返した`
    );
  }
}

/**
 * 特定の宛先に既に届いているメールの ID を読む
 *
 * 全件の消去（{@link clearMailpit}）の代わりに、操作の前に呼んで {@link getEmailFromMailpit} の
 * `excludeIds` へ渡すと、操作の後に届いたメールだけを読める。
 *
 * @param toEmail - 宛先メールアドレス
 * @returns 届いているメールの ID
 */
export async function listMailpitMessageIds(toEmail: string): Promise<Set<string>> {
  const messages = await listMessages();
  return new Set(messages.filter((msg) => isAddressedTo(msg, toEmail)).map((msg) => msg.ID));
}

/**
 * Mailpitから特定の宛先に送信されたメールを取得
 * @param toEmail - 宛先メールアドレス
 * @param options.maxRetries - 最大リトライ回数
 * @param options.excludeIds - 読まないメールの ID（操作の前から届いていたもの）
 * @returns メール情報（届かない場合は例外を投げる）
 */
export async function getEmailFromMailpit(
  toEmail: string,
  options: {
    // メール送信は BullMQ のキュー経由（`backend/src/services/email.service.ts`）であり、
    // 要求の応答が返ってから実際に届くまでに間がある。1周1秒で待つ。
    maxRetries?: number;
    excludeIds?: ReadonlySet<string>;
  } = {}
): Promise<MailpitEmail> {
  const { maxRetries = 15, excludeIds } = options;
  let lastFailure = 'メールが届いていない';

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 宛先でフィルタリング（一覧は新しい順）
      const email = (await listMessages()).find(
        (msg) => isAddressedTo(msg, toEmail) && !excludeIds?.has(msg.ID)
      );

      if (email) {
        // メール本文を取得
        const messageResponse = await fetch(`${mailpitApiUrl}/message/${email.ID}`);
        if (!messageResponse.ok) {
          throw new Error(`Failed to fetch message body: ${messageResponse.statusText}`);
        }
        const messageData = (await messageResponse.json()) as {
          ID: string;
          Subject: string;
          HTML: string;
          Text: string;
        };
        return {
          id: messageData.ID,
          subject: messageData.Subject,
          html: messageData.HTML,
          text: messageData.Text,
        };
      }

      // メールが見つからない場合は少し待ってリトライ
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // 取得できないまま null を返すと、呼び出し側が「取れたときだけ検証する」形になり、
  // メールが一通も送られていない欠陥が緑のまま通る。届くべきメールが無い地点で失敗させる。
  throw new Error(
    `メールを取得できない（宛先: ${toEmail} / Mailpit: ${mailpitApiUrl}）: ${lastFailure}`
  );
}
