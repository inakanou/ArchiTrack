/**
 * @fileoverview 2FA の暗号化鍵の入れ替えの後始末のスクリプト
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 2FA の再設定で全リフレッシュトークンを失効させ、再設定より前のアクセストークンを拒否する
 * - REQ-34.10: 2FA の再設定を監査に記録する
 *
 * TWO_FACTOR_ENCRYPTION_KEY を入れ替えると、入れ替えより前の鍵で暗号化された 2FA の秘密は復号できず、
 * その利用者はログインの 2FA の検証で止まる（管理者は自分の 2FA を再設定できない）。鍵を入れ替えて
 * デプロイした後に、サーバー上（新しい鍵の環境変数を持つ環境）で実行し、現在の鍵で復号できない利用者の
 * 2FA を未登録へ戻す。利用者は次のログインで 2FA 設定の画面へ進み、新しい鍵で登録し直す。
 *
 * 実行方法（backend ディレクトリ）:
 *   npm run user:reset-undecryptable-2fa                      # 確認だけ（書き込まない）
 *   npm run user:reset-undecryptable-2fa -- --apply [--reason <理由>]
 *
 * 開発・試験の環境はソースを tsx で、本番のイメージ（src を運ばない）はビルド済みの
 * dist/src/scripts/reset-undecryptable-two-factor.js を node で実行する（package.json が選ぶ）。
 *
 * - 現在の鍵で復号できる秘密（入れ替えの後に登録し直した利用者）は変えない。何度実行しても同じ結果になる
 * - 終了コード: 0 = 完了（確認だけを含む）、1 = 鍵の未設定・形式の誤り・一部の失敗、2 = 引数の誤り
 *
 * @module scripts/reset-undecryptable-two-factor
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import getPrismaClient, { disconnectPrisma } from '../db.js';
import redis, { initRedis } from '../redis.js';
import {
  TwoFactorService,
  type UndecryptableTwoFactorKind,
} from '../services/two-factor.service.js';
import { getSharedAuthenticatedUserStateService } from '../services/authenticated-user-state.service.js';

/** 終了コード */
export const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
} as const;

/** 理由を省いたときの監査の理由 */
export const DEFAULT_RESET_REASON = '2FA の暗号化鍵の入れ替え（復号できない秘密の再設定）';

export const USAGE =
  '使い方: npm run user:reset-undecryptable-2fa -- [--apply] [--reason <理由>]（--apply が無ければ確認だけ）';

/** 2FA の暗号化鍵の形式（256 ビットの 16 進） */
const TWO_FACTOR_ENCRYPTION_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export interface ResetUndecryptableArgs {
  apply: boolean;
  reason: string;
}

export type ParseResult =
  { ok: true; value: ResetUndecryptableArgs } | { ok: false; error: string };

/**
 * 引数を読む（`--apply`、`--reason <値>`・`--reason=<値>`）
 *
 * @param argv - スクリプトの引数（`process.argv.slice(2)`）
 */
export function parseResetUndecryptableArgs(argv: readonly string[]): ParseResult {
  let apply = false;
  let reason: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    const match = /^--reason(?:=(.*))?$/.exec(arg);
    if (!match) {
      return { ok: false, error: `不明な引数です: ${arg}` };
    }
    let value = match[1];
    if (value === undefined) {
      value = argv[i + 1];
      i++;
    }
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: '--reason の値がありません' };
    }
    reason = value.trim();
    if (reason.length === 0) {
      return { ok: false, error: '--reason が空です' };
    }
  }

  return { ok: true, value: { apply, reason: reason ?? DEFAULT_RESET_REASON } };
}

/** 判定の対象の利用者（2FA の列） */
export interface TwoFactorCandidate {
  id: string;
  email: string;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorPendingSecret: string | null;
}

/**
 * スクリプトの実行の部品
 */
export interface ResetUndecryptableContext {
  /** 2FA を登録済み、または秘密を持つ利用者を読む */
  listCandidates: () => Promise<TwoFactorCandidate[]>;
  service: Pick<
    TwoFactorService,
    'classifyUndecryptableTwoFactor' | 'resetUndecryptableByOperatorScript'
  >;
  /** 現在の暗号化鍵（TWO_FACTOR_ENCRYPTION_KEY） */
  encryptionKey: string | undefined;
  /** 状態のキャッシュを無効化できる（キャッシュ基盤に接続できた）か */
  stateCacheAvailable: boolean;
  out: (line: string) => void;
  err: (line: string) => void;
  /** 接続を閉じる */
  close: () => Promise<void>;
}

const KIND_LABEL: Record<Exclude<UndecryptableTwoFactorKind, 'none'>, string> = {
  full: '2FA を未登録へ戻す',
  pending_only: '再登録中の秘密だけを消す',
};

/**
 * 判定と再設定を行い、終了コードを返す
 *
 * @param args - 読み終えた引数
 * @param ctx - 実行の部品
 */
export async function runResetUndecryptable(
  args: ResetUndecryptableArgs,
  ctx: Omit<ResetUndecryptableContext, 'close'>
): Promise<number> {
  // 鍵が無い・形式が違うと全員が「復号できない」と判定されるため、何もせずに止める
  if (!ctx.encryptionKey || !TWO_FACTOR_ENCRYPTION_KEY_PATTERN.test(ctx.encryptionKey)) {
    ctx.err(
      'TWO_FACTOR_ENCRYPTION_KEY が未設定か、64 文字の 16 進ではありません。' +
        '入れ替え後の鍵を設定した環境で実行してください（何も変えていません）'
    );
    return EXIT_CODE.FAILURE;
  }
  if (args.apply && !ctx.stateCacheAvailable) {
    ctx.err(
      '警告: キャッシュ基盤（REDIS_URL）に接続できません。状態のキャッシュを無効化できないため、' +
        '再設定が反映されるまでキャッシュの有効期限まで待つことがあります'
    );
  }

  const candidates = await ctx.listCandidates();
  const counts = { full: 0, pending_only: 0, none: 0, failed: 0 };

  for (const candidate of candidates) {
    if (!args.apply) {
      const kind = await ctx.service.classifyUndecryptableTwoFactor(candidate);
      counts[kind]++;
      if (kind !== 'none') {
        ctx.out(`対象（${KIND_LABEL[kind]}）: ${candidate.email}`);
      }
      continue;
    }

    try {
      const result = await ctx.service.resetUndecryptableByOperatorScript(
        candidate.id,
        args.reason
      );
      if (!result.ok) {
        // 読み出しの後に削除された利用者
        counts.none++;
        continue;
      }
      counts[result.value]++;
      if (result.value !== 'none') {
        ctx.out(`再設定しました（${KIND_LABEL[result.value]}）: ${candidate.email}`);
      }
    } catch (error) {
      counts.failed++;
      ctx.err(
        `再設定に失敗しました: ${candidate.email}（${error instanceof Error ? error.message : String(error)}）`
      );
    }
  }

  const verb = args.apply ? '再設定した' : '再設定の対象';
  ctx.out(
    `${verb}: 未登録へ戻す ${counts.full} 人・再登録中の秘密を消す ${counts.pending_only} 人` +
      `（現在の鍵で復号できる ${counts.none} 人は変えていません）`
  );
  if (!args.apply && counts.full + counts.pending_only > 0) {
    ctx.out('書き込むには --apply を付けて実行してください');
  }
  if (counts.failed > 0) {
    ctx.err(`${counts.failed} 人の再設定に失敗しました。もう一度実行すると残りだけを再設定します`);
    return EXIT_CODE.FAILURE;
  }
  return EXIT_CODE.SUCCESS;
}

/**
 * 本番の部品を作る（データベース・キャッシュ基盤）
 */
export async function createDefaultContext(): Promise<ResetUndecryptableContext> {
  await initRedis();
  const redisClient = redis.getClient();
  const prisma = getPrismaClient();
  const service = new TwoFactorService({
    invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
  });

  return {
    listCandidates: () =>
      prisma.user.findMany({
        where: {
          OR: [
            { twoFactorEnabled: true },
            { twoFactorSecret: { not: null } },
            { twoFactorPendingSecret: { not: null } },
          ],
        },
        select: {
          id: true,
          email: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
          twoFactorPendingSecret: true,
        },
        orderBy: { email: 'asc' },
      }),
    service,
    encryptionKey: process.env.TWO_FACTOR_ENCRYPTION_KEY,
    stateCacheAvailable: redisClient !== null && redisClient.status === 'ready',
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    close: async () => {
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
  createContext: () => Promise<ResetUndecryptableContext> = createDefaultContext,
  err: (line: string) => void = (line) => console.error(line)
): Promise<number> {
  const parsed = parseResetUndecryptableArgs(argv);
  if (!parsed.ok) {
    err(parsed.error);
    err(USAGE);
    return EXIT_CODE.USAGE;
  }

  const ctx = await createContext();
  try {
    return await runResetUndecryptable(parsed.value, ctx);
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
        `2FA の再設定の実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.FAILURE);
    });
}
