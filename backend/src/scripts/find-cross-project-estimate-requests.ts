/**
 * @fileoverview 別のプロジェクトの内訳書を参照する見積依頼を確かめる運用の手順のスクリプト（estimate-request タスク121.2）
 *
 * Requirements (estimate-request):
 * - 51.3: 本要件の導入の前に作られた、別のプロジェクトの内訳書を参照する見積依頼の件数と見積依頼 ID を、
 *   システム管理者が運用の手順で確かめられるようにし、確かめる手順ではデータを変えない
 *
 * 見積依頼が別のプロジェクトの内訳書・内訳書の項目を参照していると、参照された側のプロジェクトの完全削除
 * （project-management の 46.5）が `Restrict` で毎回失敗する。2026-11-04 の是正（42.10）より前に作られた
 * 見積依頼に残りうるため、サーバー上で実行して確かめる。直す手順は持たない（design.md D16）。
 *
 * 実行方法（backend ディレクトリ。引数は取らない）:
 *   npm run estimate-request:find-cross-project
 *
 * 開発・試験の環境はソースを tsx で、本番のイメージ（src を運ばない）はビルド済みの
 * dist/src/scripts/find-cross-project-estimate-requests.js を node で実行する
 * （package.json の estimate-request:find-cross-project が選ぶ）。
 *
 * - 対象: 論理削除の有無を問わず、(a) 見積依頼の内訳書のプロジェクトが見積依頼のプロジェクトと違うもの、
 *   (b) 見積依頼の項目が指す内訳書の項目の内訳書のプロジェクトが見積依頼のプロジェクトと違うもの
 * - 出力: 1 行目に件数（不整合な見積依頼の数。(a)(b) の両方に当たる見積依頼も 1 件と数える）と行の数。
 *   続けて 1 行ずつ、見積依頼 ID・見積依頼のプロジェクト ID・参照先のプロジェクト ID・(a)(b) の別。
 *   行は（見積依頼・参照先のプロジェクト・種別）ごとに 1 行で、同じ見積依頼が (a) と (b) の両方、
 *   または (b) で複数の参照先のプロジェクトに出ることがある
 * - 名前・宛先・金額は出さない。失敗はエラーの種類だけを出し、文言を出さない
 * - 読むだけ（`SELECT` の 1 文だけ）で、書き込みの経路を持たない
 * - 終了コード: 0 = 確かめた（件数が 0 でも 0）、1 = 実行の失敗
 *
 * @module scripts/find-cross-project-estimate-requests
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import getPrismaClient, { disconnectPrisma } from '../db.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/** 終了コード */
export const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

/** 食い違いの種別（a: 内訳書、b: 内訳書の項目） */
export type CrossProjectKind = 'a' | 'b';

/** 見つけた食い違いの 1 行 */
export interface CrossProjectFinding {
  estimateRequestId: string;
  /** 見積依頼のプロジェクト ID */
  projectId: string;
  /** 参照先の内訳書のプロジェクト ID */
  referencedProjectId: string;
  kind: CrossProjectKind;
}

/** 読むのに使うクライアント（生の SELECT だけ） */
export type FindCrossProjectClient = Pick<PrismaClient, '$queryRaw'>;

/**
 * 食い違う見積依頼を読む（論理削除の有無を問わない）
 *
 * 結合を DB の中で済ませる 1 文の `SELECT` にする。見積依頼や項目を取り出してから比べる形は、
 * 件数に比例して転送と照会が増えるため避ける。入力は無く、埋め込む値も無い。
 * 表と列の名前は schema.prisma の `@@map`（表）と、`@map` の無い列の名前のとおり。
 *
 * @param prisma - データベースのクライアント
 * @returns 見積依頼 ID・種別・参照先のプロジェクト ID の順に並べた食い違い
 */
export async function findCrossProjectEstimateRequests(
  prisma: FindCrossProjectClient
): Promise<CrossProjectFinding[]> {
  return prisma.$queryRaw<CrossProjectFinding[]>`
    SELECT er."id" AS "estimateRequestId",
           er."projectId" AS "projectId",
           s."projectId" AS "referencedProjectId",
           'a'::text AS "kind"
      FROM "estimate_requests" er
      JOIN "itemized_statements" s ON s."id" = er."itemizedStatementId"
     WHERE s."projectId" <> er."projectId"
    UNION
    SELECT er."id" AS "estimateRequestId",
           er."projectId" AS "projectId",
           s."projectId" AS "referencedProjectId",
           'b'::text AS "kind"
      FROM "estimate_requests" er
      JOIN "estimate_request_items" eri ON eri."estimateRequestId" = er."id"
      JOIN "itemized_statement_items" i ON i."id" = eri."itemizedStatementItemId"
      JOIN "itemized_statements" s ON s."id" = i."itemizedStatementId"
     WHERE s."projectId" <> er."projectId"
    ORDER BY "estimateRequestId", "kind", "referencedProjectId"
  `;
}

/**
 * 出力の行を作る（ID と種別だけ）
 *
 * @param findings - 食い違い
 */
export function formatFindings(findings: readonly CrossProjectFinding[]): string[] {
  const requestCount = new Set(findings.map((f) => f.estimateRequestId)).size;
  return [
    `別のプロジェクトの内訳書を参照する見積依頼: ${requestCount} 件（行は ${findings.length} 行）`,
    ...findings.map(
      (f) =>
        `見積依頼 ${f.estimateRequestId} 見積依頼のプロジェクト ${f.projectId} 参照先のプロジェクト ${f.referencedProjectId} 種別 (${f.kind})`
    ),
  ];
}

/**
 * スクリプトの実行の部品
 */
export interface FindCrossProjectContext {
  prisma: FindCrossProjectClient;
  out: (line: string) => void;
  err: (line: string) => void;
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
 * 食い違いを読んで出し、終了コードを返す
 *
 * @param ctx - 実行の部品
 */
export async function runFindCrossProjectEstimateRequests(
  ctx: Omit<FindCrossProjectContext, 'close'>
): Promise<number> {
  let findings: CrossProjectFinding[];
  try {
    findings = await findCrossProjectEstimateRequests(ctx.prisma);
  } catch (error) {
    ctx.err(`不整合な見積依頼を確かめられませんでした（実行の失敗）: ${describeErrorKind(error)}`);
    return EXIT_CODE.FAILURE;
  }
  for (const line of formatFindings(findings)) {
    ctx.out(line);
  }
  return EXIT_CODE.SUCCESS;
}

/**
 * 本番の部品を作る（データベース）
 */
export async function createDefaultContext(): Promise<FindCrossProjectContext> {
  return {
    prisma: getPrismaClient(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    close: async () => {
      await disconnectPrisma();
    },
  };
}

/**
 * スクリプトの入口: 部品を作って実行し、接続を閉じて終了コードを返す
 *
 * @param createContext - 部品の作成（既定は本番の部品）
 */
export async function main(
  createContext: () => Promise<FindCrossProjectContext> = createDefaultContext
): Promise<number> {
  const ctx = await createContext();
  try {
    return await runFindCrossProjectEstimateRequests(ctx);
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
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(`不整合な見積依頼を確かめる実行に失敗しました: ${describeErrorKind(error)}`);
      process.exit(EXIT_CODE.FAILURE);
    });
}
