/**
 * @fileoverview 復旧用の再有効化のスクリプト（タスク49.4）
 *
 * Requirements (user-authentication):
 * - REQ-36.3: 再有効化で再び利用できるようにする
 * - REQ-36.4: 再有効化を全システム管理者へ通知し、監査に記録する
 * - REQ-36.8: 90 日の自動無効化は最後の有効なシステム管理者も対象とするため、サーバー上で復旧できるようにする
 *
 * 全てのシステム管理者が無効になり画面から再有効化できないときに、サーバー上で実行する。
 *
 * 実行方法（backend ディレクトリ）:
 *   npm run user:reactivate -- --email <メールアドレス> [--reason <理由>]
 *
 * 開発・試験の環境はソースを tsx で、本番のイメージ（src を運ばない）はビルド済みの
 * dist/src/scripts/reactivate-user.js を node で実行する（package.json の user:reactivate が選ぶ）。
 *
 * - 再有効化は最後の再有効化の日時を書き（最終ログイン日時は変えない）、実行者の無い監査 `USER_REACTIVATED`
 *   （`metadata.trigger='operator_script'`）を記録し、コミットの後に状態のキャッシュを無効化し全システム管理者へ
 *   通知する（AccountStatusService.reactivateByOperatorScript）
 * - 終了コード: 0 = 再有効化した、または既に有効、1 = 該当する利用者が無い・実行の失敗、2 = 引数の誤り
 *
 * @module scripts/reactivate-user
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import type { Queue } from 'bull';
import getPrismaClient, { disconnectPrisma } from '../db.js';
import redis, { initRedis } from '../redis.js';
import { AccountStatusService } from '../services/account-status.service.js';
import { AdminNotificationService } from '../services/admin-notification.service.js';
import { createEmailQueue, enqueueAdminNotificationEmail } from '../services/email.service.js';
import { getSharedAuthenticatedUserStateService } from '../services/authenticated-user-state.service.js';

/** 終了コード */
export const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
} as const;

/** 理由を省いたときの監査と通知の理由 */
export const DEFAULT_REACTIVATION_REASON = 'サーバー上の復旧スクリプトによる再有効化';

export const USAGE =
  '使い方: npm run user:reactivate -- --email <メールアドレス> [--reason <理由>]';

export interface ReactivateUserArgs {
  email: string;
  reason: string;
}

export type ParseResult = { ok: true; value: ReactivateUserArgs } | { ok: false; error: string };

/**
 * 引数を読む（`--email <値>`・`--email=<値>`、`--reason <値>`・`--reason=<値>`）
 *
 * @param argv - スクリプトの引数（`process.argv.slice(2)`）
 */
export function parseReactivateUserArgs(argv: readonly string[]): ParseResult {
  const values: Record<'email' | 'reason', string | undefined> = {
    email: undefined,
    reason: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const match = /^--(email|reason)(?:=(.*))?$/.exec(arg);
    if (!match) {
      return { ok: false, error: `不明な引数です: ${arg}` };
    }
    const name = match[1] as 'email' | 'reason';
    let value = match[2];
    if (value === undefined) {
      value = argv[i + 1];
      i++;
    }
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: `--${name} の値がありません` };
    }
    values[name] = value.trim();
  }

  if (!values.email) {
    return { ok: false, error: '--email は必須です' };
  }
  if (values.reason !== undefined && values.reason.length === 0) {
    return { ok: false, error: '--reason が空です' };
  }
  return {
    ok: true,
    value: { email: values.email, reason: values.reason ?? DEFAULT_REACTIVATION_REASON },
  };
}

/**
 * スクリプトの実行の部品
 */
export interface ReactivateUserContext {
  service: Pick<AccountStatusService, 'reactivateByOperatorScript'>;
  /** 状態のキャッシュを無効化できる（キャッシュ基盤に接続できた）か */
  stateCacheAvailable: boolean;
  out: (line: string) => void;
  err: (line: string) => void;
  /** 接続を閉じる */
  close: () => Promise<void>;
}

/**
 * 再有効化を行い、終了コードを返す
 *
 * @param args - 読み終えた引数
 * @param ctx - 実行の部品
 */
export async function runReactivateUser(
  args: ReactivateUserArgs,
  ctx: Omit<ReactivateUserContext, 'close'>
): Promise<number> {
  if (!ctx.stateCacheAvailable) {
    ctx.err(
      '警告: キャッシュ基盤（REDIS_URL）に接続できません。状態のキャッシュを無効化できないため、' +
        '再有効化が反映されるまでキャッシュの有効期限まで待つことがあります'
    );
  }

  const result = await ctx.service.reactivateByOperatorScript(args.email, args.reason);
  if (result.ok) {
    ctx.out(`再有効化しました: ${args.email}（利用者 ID ${result.value.userId}）`);
    return EXIT_CODE.SUCCESS;
  }

  switch (result.error.type) {
    case 'USER_NOT_FOUND':
      ctx.err(`該当する利用者がいません: ${args.email}`);
      return EXIT_CODE.FAILURE;
    case 'ALREADY_IN_STATE':
      ctx.out(`既に有効です（何もしていません）: ${args.email}`);
      return EXIT_CODE.SUCCESS;
    default:
      ctx.err(`再有効化できませんでした: ${result.error.type}`);
      return EXIT_CODE.FAILURE;
  }
}

/**
 * 本番の部品を作る（データベース・キャッシュ基盤・メールキュー）
 */
export async function createDefaultContext(): Promise<ReactivateUserContext> {
  await initRedis();
  const redisClient = redis.getClient();
  const prisma = getPrismaClient();
  const emailQueue: Queue = createEmailQueue();
  emailQueue.on('error', (error: Error) => {
    console.error(`メールキューの接続の失敗: ${error.message}`);
  });

  const service = new AccountStatusService({
    prisma,
    userStateService: {
      invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
    },
    // 送信の処理を持たず、通知のメールをキューへ入れるだけにする（送信はサーバーのプロセスが行う）
    adminNotificationService: new AdminNotificationService(prisma, {
      sendAdminNotificationEmail: (to, subject, lines) =>
        enqueueAdminNotificationEmail(emailQueue, to, subject, lines),
    }),
  });

  return {
    service,
    stateCacheAvailable: redisClient !== null && redisClient.status === 'ready',
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    close: async () => {
      await emailQueue.close();
      await redis.disconnect();
      await disconnectPrisma();
    },
  };
}

/**
 * スクリプトの入口: 引数を読み、部品を作って実行し、接続を閉じて終了コードを返す
 *
 * @param argv - スクリプトの引数
 * @param createContext - 部品の作成（既定は本番の部品）
 * @param err - 引数の誤りの出力先
 */
export async function main(
  argv: readonly string[],
  createContext: () => Promise<ReactivateUserContext> = createDefaultContext,
  err: (line: string) => void = (line) => console.error(line)
): Promise<number> {
  const parsed = parseReactivateUserArgs(argv);
  if (!parsed.ok) {
    err(parsed.error);
    err(USAGE);
    return EXIT_CODE.USAGE;
  }

  const ctx = await createContext();
  try {
    return await runReactivateUser(parsed.value, ctx);
  } finally {
    await ctx.close();
  }
}

/**
 * このモジュール自身が直接実行されたかを判定する（テストからの import では起動しない）
 *
 * @param scriptPath - `process.argv[1]`
 * @param moduleUrl - `import.meta.url`
 */
export function isDirectExecution(scriptPath: string | undefined, moduleUrl: string): boolean {
  return scriptPath !== undefined && pathToFileURL(scriptPath).href === moduleUrl;
}

if (isDirectExecution(process.argv[1], import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        `再有効化の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.FAILURE);
    });
}
