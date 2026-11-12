/**
 * @fileoverview 完全削除の対象に戻す運用の手順のスクリプト（project-management タスク83.6）
 *
 * Requirements (project-management):
 * - 46.14: 5 回続けて失敗して対象から外したプロジェクトを、サーバー上でプロジェクト ID を指定して対象に戻す
 *
 * 失敗の原因（他のプロジェクトからの参照など）を直した後に、サーバー上で実行する。原因を直したかは
 * 確かめない（直さずに戻せば、また 5 回で外れて知らせが来る。design.md D13）。
 *
 * 実行方法（backend ディレクトリ）:
 *   npm run project:purge-requeue -- --project-id <プロジェクト ID>
 *
 * 開発・試験の環境はソースを tsx で、本番のイメージ（src を運ばない）はビルド済みの
 * dist/src/scripts/requeue-project-purge.js を node で実行する（package.json の project:purge-requeue が選ぶ）。
 *
 * - 部品はデータベースだけで組み立てる（ProjectPurgeRequeuer）。ストレージにも通知にも頼らないため、
 *   ストレージの不調が完全削除の失敗の原因でも対象に戻せる。
 *   通知の部品は渡さない（戻したことは実行者の無い監査 `PROJECT_PURGE_REQUEUED` に残る。ProjectPurgeService.requeue）
 * - 出力にプロジェクト名とエラーの文言を出さない（ID と結果、失敗はエラーの種類だけ）
 * - 終了コード: 0 = 対象に戻した、または既に対象、1 = 該当するプロジェクトが無い・実行の失敗、
 *   2 = 引数の誤り（ID が UUID の形でない場合を含む）
 *
 * @module scripts/requeue-project-purge
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import getPrismaClient, { disconnectPrisma } from '../db.js';
import { ProjectPurgeRequeuer } from '../services/project-purge.service.js';

/** 終了コード */
export const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
} as const;

export const USAGE = '使い方: npm run project:purge-requeue -- --project-id <プロジェクト ID>';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequeueProjectPurgeArgs {
  projectId: string;
}

export type ParseResult =
  { ok: true; value: RequeueProjectPurgeArgs } | { ok: false; error: string };

/**
 * 引数を読む（`--project-id <値>`・`--project-id=<値>`）
 *
 * @param argv - スクリプトの引数（`process.argv.slice(2)`）
 */
export function parseRequeueProjectPurgeArgs(argv: readonly string[]): ParseResult {
  let projectId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const match = /^--project-id(?:=(.*))?$/.exec(arg);
    if (!match) {
      return { ok: false, error: `不明な引数です: ${arg}` };
    }
    let value = match[1];
    if (value === undefined) {
      value = argv[i + 1];
      i++;
    }
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: '--project-id の値がありません' };
    }
    projectId = value.trim();
  }

  if (projectId === undefined) {
    return { ok: false, error: '--project-id は必須です' };
  }
  if (!UUID_PATTERN.test(projectId)) {
    return { ok: false, error: '--project-id が UUID の形ではありません' };
  }
  return { ok: true, value: { projectId } };
}

/**
 * スクリプトの実行の部品
 */
export interface RequeueProjectPurgeContext {
  /** 対象に戻す部品 */
  service: Pick<ProjectPurgeRequeuer, 'requeue'>;
  out: (line: string) => void;
  err: (line: string) => void;
  /** 現在の時刻（記録の日時） */
  now: () => Date;
  /** 接続を閉じる */
  close: () => Promise<void>;
}

/**
 * エラーの種類だけを表す（エラーの文言は出さない）
 */
function describeErrorKind(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} ${code}` : error.name;
}

/**
 * 対象に戻し、終了コードを返す
 *
 * @param args - 読み終えた引数
 * @param ctx - 実行の部品
 */
export async function runRequeueProjectPurge(
  args: RequeueProjectPurgeArgs,
  ctx: Omit<RequeueProjectPurgeContext, 'close'>
): Promise<number> {
  let outcome: Awaited<ReturnType<ProjectPurgeRequeuer['requeue']>>;
  try {
    outcome = await ctx.service.requeue(args.projectId, ctx.now());
  } catch (error) {
    ctx.err(`対象に戻せませんでした（実行の失敗）: ${describeErrorKind(error)}`);
    return EXIT_CODE.FAILURE;
  }

  switch (outcome) {
    case 'requeued':
      ctx.out(`完全削除の対象に戻しました: ${args.projectId}（次の回で先に試みます）`);
      return EXIT_CODE.SUCCESS;
    case 'not_excluded':
      ctx.out(`既に完全削除の対象です（何もしていません）: ${args.projectId}`);
      return EXIT_CODE.SUCCESS;
    case 'not_found':
      ctx.err(`論理削除したプロジェクトが見つかりません: ${args.projectId}`);
      return EXIT_CODE.FAILURE;
  }
}

/**
 * 本番の部品を作る（データベースだけ。ストレージにも通知にも頼らない）
 */
export async function createDefaultContext(): Promise<RequeueProjectPurgeContext> {
  const prisma = getPrismaClient();
  const service = new ProjectPurgeRequeuer({ prisma });

  return {
    service,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    now: () => new Date(),
    close: async () => {
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
  createContext: () => Promise<RequeueProjectPurgeContext> = createDefaultContext,
  err: (line: string) => void = (line) => console.error(line)
): Promise<number> {
  const parsed = parseRequeueProjectPurgeArgs(argv);
  if (!parsed.ok) {
    err(parsed.error);
    err(USAGE);
    return EXIT_CODE.USAGE;
  }

  const ctx = await createContext();
  try {
    return await runRequeueProjectPurge(parsed.value, ctx);
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
      console.error(`対象に戻す実行に失敗しました: ${describeErrorKind(error)}`);
      process.exit(EXIT_CODE.FAILURE);
    });
}
