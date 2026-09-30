/**
 * @fileoverview 外部AI（Claude Vision）の応答形式に対する契約検証（estimate-request タスク 91.1）
 *
 * ## なぜ在るか
 *
 * `src/__tests__/unit/services/claude-vision.service.test.ts` は Anthropic SDK をモックし、
 * 「こういう応答が来たらこう解釈するか」を確かめる。しかし**実APIが本当にその形の応答を返すか**は
 * 確かめていない。モデルの更新で応答形式が変わっても、モックの検証は緑のままである。
 * 本検証は、固定の入力画像 2 枚に対して実APIを呼び、本番の解釈が前提とする応答の**構造だけ**を主張する。
 * 主張の中身は `claude-vision-contract-shape.ts` にある。
 *
 * ## 通常の実行に含めない
 *
 * ファイル名を `*.test.ts` / `*.spec.ts` にしていない。既定の `vitest.config.ts`（`src/**\/*.{test,spec}.ts`）
 * にも統合の `vitest.integration.config.ts` にも選ばれず、`npm run test:contract`
 * （= `vitest run --config vitest.contract.config.ts`）でだけ選ばれる。
 *
 * ## 認証
 *
 * Workload Identity Federation（WIF）の環境変数から SDK が解決する。クライアントは**引数なしで**構築する。
 * WIF の識別トークンは main の GitHub Actions でしか発行されないため、ローカルでは実APIに届かない。
 * 前提が揃っていなければ **skip せずに失敗させる**（AI運用7原則 第3原則、タスク 91.2）。
 *
 * ## ログ
 *
 * 日次の実行ログは公開される。応答の本文や抽出した値を出力しないこと。違反の文言は位置と型だけを載せる。
 *
 * @module __tests__/contract/claude-vision.contract
 */
import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeVisionError } from '../../errors/claudeVisionError.js';
import type {
  ClaudeVisionExtractionResult,
  ClaudeVisionService,
} from '../../services/claude-vision.service.js';
import {
  createServiceWithClient,
  extractJsonArrayWithProductionParser,
  findExtractionResultViolations,
  findRawResponseViolations,
  findResponseText,
  findWifEnvironmentProblems,
  loadFixtureImages,
} from './claude-vision-contract-shape.js';

interface ContractOutcome {
  service: ClaudeVisionService;
  message: Anthropic.Messages.Message;
  result: ClaudeVisionExtractionResult;
  sentImageCount: number;
}

/**
 * 実APIを 1 回だけ呼び、応答と本番の抽出結果を返す。
 *
 * `beforeAll` に置かないのは、前提が欠けたときに各検証を「skipped」でなく「failed」として
 * 報告させるためである（両方の検証が同じ理由で失敗する）。呼び出しは記憶して 1 回に留める。
 */
async function runContract(): Promise<ContractOutcome> {
  const problems = findWifEnvironmentProblems(process.env);
  if (problems.length > 0) {
    throw new Error(
      'WIF の前提が揃っていないため契約検証を実行できない（skip はしない）:\n- ' +
        problems.join('\n- ')
    );
  }

  // 認証は WIF の環境変数から SDK が解決する。キーを渡さない
  const client = new Anthropic();
  // 実APIへそのまま通す（差し替えない）。応答を観測するためだけに包む
  const createSpy = vi.spyOn(client.messages, 'create');
  const service = createServiceWithClient(client);
  const images = loadFixtureImages();

  let result: ClaudeVisionExtractionResult;
  try {
    // 本番のプロンプト・モデル・送信の形・解析関数をそのまま通す
    result = await service.extractLineItems(images);
  } catch (error) {
    if (error instanceof ClaudeVisionError) {
      throw new Error(`本番の抽出経路が失敗した（errorType=${error.errorType}）: ${error.message}`);
    }
    throw error;
  }

  if (createSpy.mock.calls.length !== 1) {
    throw new Error(`Messages API の呼び出しが 1 回でない（${createSpy.mock.calls.length} 回）`);
  }
  const message: unknown = await createSpy.mock.results[0]?.value;
  if (
    typeof message !== 'object' ||
    message === null ||
    (message as { type?: unknown }).type !== 'message'
  ) {
    throw new Error('Messages API の応答を観測できなかった');
  }

  return {
    service,
    message: message as Anthropic.Messages.Message,
    result,
    sentImageCount: images.length,
  };
}

let pendingOutcome: Promise<ContractOutcome> | undefined;
function getOutcome(): Promise<ContractOutcome> {
  pendingOutcome ??= runContract();
  return pendingOutcome;
}

describe('Claude Vision の見積書抽出: 実APIの応答形式（契約検証）', () => {
  it('応答が完了し、本文から本番の解析関数が JSON 配列を取り出せ、各要素が約束の型を持つ（Req 21.5, 26.5, 26.6, 26.7, 26.8）', async () => {
    const outcome = await getOutcome();

    expect(findRawResponseViolations(outcome.service, outcome.message)).toEqual([]);
  });

  it('本番の変換後の明細が配列で、9 項目を持ち、数量・単価・金額が数値か null で、頁数が整数である（Req 21.6, 21.7, 26.7）', async () => {
    const outcome = await getOutcome();
    const text = findResponseText(outcome.message);
    const rawItemCount =
      text === null ? null : extractJsonArrayWithProductionParser(outcome.service, text).length;

    expect(
      findExtractionResultViolations(outcome.result, outcome.sentImageCount, rawItemCount)
    ).toEqual([]);
  });
});
