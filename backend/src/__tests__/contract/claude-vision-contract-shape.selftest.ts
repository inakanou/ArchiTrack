/**
 * @fileoverview 契約検証（estimate-request タスク 91.1）の主張の組み立ての自己検査
 *
 * 実APIはローカルから届かない（WIF の識別トークンは main の GitHub Actions でしか発行されない）。
 * そこで、既知の応答の例を**本番の解析関数に通し**、`claude-vision-contract-shape.ts` の主張が
 * 正しい応答を通し、崩れた応答を拾い、違反の文言に応答の内容を漏らさないことを確かめる。
 *
 * 実APIは呼ばない。クライアントは偽物を差し込む。
 *
 * 既定の `npm test` には含めない（ファイル名が `*.test.ts` でない）。`npm run test:contract` と
 * `npm run test:contract:selftest` で選ばれる。
 *
 * @module __tests__/contract/claude-vision-contract-shape.selftest
 */
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeVisionError } from '../../errors/claudeVisionError.js';
import type { ClaudeVisionExtractionResult } from '../../services/claude-vision.service.js';
import {
  createServiceWithClient,
  findExtractionResultViolations,
  findRawResponseViolations,
  findWifEnvironmentProblems,
  loadFixtureImages,
  REQUIRED_WIF_VARIABLES,
  SHADOWING_CREDENTIAL_VARIABLES,
} from './claude-vision-contract-shape.js';

vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** 違反の文言に漏れてはならない印（応答の内容の代わり） */
const SENTINEL = 'LEAK-SENTINEL-91';

function fakeMessage(
  text: string | null,
  stopReason: Anthropic.Messages.StopReason = 'end_turn'
): Anthropic.Messages.Message {
  return {
    id: 'msg_selftest',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: text === null ? [] : [{ type: 'text', text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Messages.Message;
}

/** 偽のクライアント。`messages.create` が固定の応答を返す */
function fakeClient(message: Anthropic.Messages.Message) {
  const create = vi.fn().mockResolvedValue(message);
  const client = { messages: { create } } as unknown as Anthropic;
  return { client, create };
}

/** 本番の経路（`extractLineItems`）に既知の応答を通し、両方の主張の違反を返す */
async function evaluate(text: string | null, stopReason?: Anthropic.Messages.StopReason) {
  const message = fakeMessage(text, stopReason);
  const { client } = fakeClient(message);
  const service = createServiceWithClient(client);
  const images = loadFixtureImages();
  const raw = findRawResponseViolations(service, message);
  let result: ClaudeVisionExtractionResult | null = null;
  let extractionError: unknown = null;
  try {
    result = await service.extractLineItems(images);
  } catch (error) {
    extractionError = error;
  }
  const extraction =
    result === null ? null : findExtractionResultViolations(result, images.length, null);
  return { raw, extraction, result, extractionError };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customCategory: null,
    workType: '仮設工',
    name: '足場設置',
    specification: '枠組足場',
    unit: 'm2',
    quantity: 120,
    unitPrice: 1500,
    amount: 180000,
    remarks: null,
    ...overrides,
  };
}

describe('契約検証の主張: 正しい応答を通す', () => {
  it('数値が数値で返る応答は違反なし', async () => {
    const { raw, extraction } = await evaluate(JSON.stringify([row(), row({ name: '掘削' })]));
    expect(raw).toEqual([]);
    expect(extraction).toEqual([]);
  });

  it('カンマ区切りの文字列の数値は本番の変換で数値になり、違反なし（Req 26.8）', async () => {
    const { raw, extraction, result } = await evaluate(
      JSON.stringify([row({ quantity: '120', unitPrice: '1,500', amount: '180,000' })])
    );
    expect(raw).toEqual([]);
    expect(extraction).toEqual([]);
    expect(result?.lineItems[0]?.amount).toBe(180000);
  });

  it('前置きの文と ```json のコードブロックに包まれた応答も、本番の解析関数が取り出せて違反なし', async () => {
    const text = '以下です。\n```json\n' + JSON.stringify([row()]) + '\n```';
    const { raw, extraction } = await evaluate(text);
    expect(raw).toEqual([]);
    expect(extraction).toEqual([]);
  });

  it('一部の数値列が null の行があっても、三つ揃った行が一つあれば違反なし', async () => {
    const { raw, extraction } = await evaluate(
      JSON.stringify([row(), row({ quantity: null, unitPrice: null })])
    );
    expect(raw).toEqual([]);
    expect(extraction).toEqual([]);
  });
});

describe('契約検証の主張: 崩れた応答を拾う', () => {
  it('数値列に数値として解釈できない文字列が来ると違反（本番の変換が黙って null に落とす形）', async () => {
    const { raw } = await evaluate(JSON.stringify([row({ quantity: `約${SENTINEL}` })]));
    expect(raw).toEqual(['raw[0].quantity が本番の数値変換で数値として解釈できない（string）']);
  });

  it('名称が null だと違反', async () => {
    const { raw } = await evaluate(JSON.stringify([row({ name: null })]));
    expect(raw).toEqual(['raw[0].name が空でない文字列でない（null）']);
  });

  it('文字列の項目にオブジェクトが来ると違反', async () => {
    const { raw } = await evaluate(JSON.stringify([row({ unit: { value: SENTINEL } })]));
    expect(raw).toEqual(['raw[0].unit が文字列・数値・null のいずれでもない（object）']);
  });

  it('要素がオブジェクトでない配列は違反', async () => {
    const { raw } = await evaluate(JSON.stringify([SENTINEL]));
    expect(raw).toEqual(['raw[0] がオブジェクトでない（string）']);
  });

  it('JSON 配列を含まない応答は違反で、本番の経路も parse_error で失敗する（Req 26.6）', async () => {
    const { raw, extractionError } = await evaluate(`申し訳ありません ${SENTINEL}`);
    expect(raw).toEqual(['応答の本文から本番の解析関数が JSON 配列を取り出せない']);
    expect(extractionError).toBeInstanceOf(ClaudeVisionError);
    expect((extractionError as ClaudeVisionError).errorType).toBe('parse_error');
  });

  it('テキストのブロックが無い応答は違反', async () => {
    const { raw } = await evaluate(null);
    expect(raw).toEqual(['応答にテキストのブロックが無い']);
  });

  it('max_tokens で打ち切られた応答は違反', async () => {
    const { raw } = await evaluate(JSON.stringify([row()]), 'max_tokens');
    expect(raw).toEqual(['応答が完了していない（stop_reason=max_tokens）']);
  });

  it('空の配列は変換後の主張で違反（自明な成立を許さない）', async () => {
    const { raw, extraction } = await evaluate('[]');
    expect(raw).toEqual([]);
    expect(extraction).toEqual(['lineItems が空である（構造の主張が自明に成立してしまう）']);
  });

  it('数量・単価・金額が揃う行が無いと違反（自明な成立を許さない）', async () => {
    const { extraction } = await evaluate(
      JSON.stringify([row({ quantity: null }), row({ amount: null })])
    );
    expect(extraction).toEqual([
      '数量・単価・金額の三つが揃って数値である行が一つも無い（数値の変換の主張が自明に成立してしまう）',
    ]);
  });

  it('頁数が整数でない・送った枚数と違う・件数が応答と違うと違反', () => {
    const lineItems = [
      {
        customCategory: null,
        workType: null,
        name: 'x',
        specification: null,
        unit: null,
        quantity: 1,
        unitPrice: 1,
        amount: 1,
        remarks: null,
      },
    ];
    expect(findExtractionResultViolations({ lineItems, pageCount: 1.5 }, 2, 1)).toEqual([
      'pageCount が整数でない（number）',
    ]);
    expect(findExtractionResultViolations({ lineItems, pageCount: 3 }, 2, 1)).toEqual([
      'pageCount が送った画像の枚数と一致しない',
    ]);
    expect(findExtractionResultViolations({ lineItems, pageCount: 2 }, 2, 5)).toEqual([
      'lineItems の件数が応答の配列の要素数と一致しない',
    ]);
  });

  it('違反の文言に応答の内容（印）を漏らさない', async () => {
    const cases = [
      JSON.stringify([row({ quantity: `約${SENTINEL}`, unit: { v: SENTINEL } })]),
      JSON.stringify([SENTINEL]),
      `申し訳ありません ${SENTINEL}`,
    ];
    for (const text of cases) {
      const { raw, extraction } = await evaluate(text);
      const all = [...raw, ...(extraction ?? [])];
      expect(all.length).toBeGreaterThan(0);
      expect(all.join('\n')).not.toContain(SENTINEL);
    }
  });
});

describe('契約検証の主張: 本番の経路をそのまま通している', () => {
  it('差し込んだクライアントに、本番のモデルとプロンプトで 2 枚の画像が送られる（Req 21.3, 21.8）', async () => {
    const { client, create } = fakeClient(fakeMessage(JSON.stringify([row()])));
    const service = createServiceWithClient(client);
    expect(service.isEnabled()).toBe(true);

    await service.extractLineItems(loadFixtureImages());

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0] as Anthropic.Messages.MessageCreateParamsNonStreaming;
    expect(params.model).toBe('claude-haiku-4-5-20251001');
    const content = params.messages[0]?.content as Anthropic.Messages.ContentBlockParam[];
    expect(content.map((block) => block.type)).toEqual(['image', 'image', 'text']);
    // 本番のプロンプトが使われていること（契約検証側で複製していない）
    expect((content[2] as Anthropic.Messages.TextBlockParam).text).toContain('建設見積書');
  });

  it('固定の入力画像は 2 枚の PNG で、どれも 100KB 未満', () => {
    const images = loadFixtureImages();
    expect(images).toHaveLength(2);
    for (const image of images) {
      const bytes = Buffer.from(image.base64Data, 'base64');
      expect(image.mediaType).toBe('image/png');
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.length).toBeLessThan(100 * 1024);
    }
  });
});

describe('契約検証の主張: WIF の前提（揃っていなければ skip せず失敗させる）', () => {
  const complete: NodeJS.ProcessEnv = {
    ANTHROPIC_FEDERATION_RULE_ID: `fdrl_${SENTINEL}`,
    ANTHROPIC_ORGANIZATION_ID: `org-${SENTINEL}`,
    ANTHROPIC_SERVICE_ACCOUNT_ID: `svac_${SENTINEL}`,
    ANTHROPIC_IDENTITY_TOKEN_FILE: `/tmp/${SENTINEL}`,
  };
  const fileExists = () => true;

  it('揃っていれば問題なし', () => {
    expect(findWifEnvironmentProblems(complete, fileExists)).toEqual([]);
  });

  it('識別トークンを値で渡しても問題なし', () => {
    const env: NodeJS.ProcessEnv = { ...complete, ANTHROPIC_IDENTITY_TOKEN: 'jwt' };
    delete env.ANTHROPIC_IDENTITY_TOKEN_FILE;
    expect(findWifEnvironmentProblems(env, () => false)).toEqual([]);
  });

  it.each(REQUIRED_WIF_VARIABLES)('%s が無ければ問題として挙がる', (name) => {
    const env = { ...complete };
    delete env[name];
    expect(findWifEnvironmentProblems(env, fileExists)).toEqual([`${name} が未設定または空である`]);
  });

  it('識別トークンが無ければ問題として挙がる', () => {
    const env = { ...complete };
    delete env.ANTHROPIC_IDENTITY_TOKEN_FILE;
    expect(findWifEnvironmentProblems(env, fileExists)).toHaveLength(1);
  });

  it('識別トークンのファイルが無いか空なら問題として挙がる', () => {
    expect(findWifEnvironmentProblems(complete, () => false)).toEqual([
      'ANTHROPIC_IDENTITY_TOKEN_FILE が指すファイルが無いか空である',
    ]);
  });

  it.each(SHADOWING_CREDENTIAL_VARIABLES)(
    '%s が空文字でも設定されていれば問題として挙がる（WIF より優先されうる）',
    (name) => {
      const env = { ...complete, [name]: '' };
      expect(findWifEnvironmentProblems(env, fileExists)).toHaveLength(1);
    }
  );

  it('空の環境ではすべての不足が挙がり、値は文言に載らない', () => {
    expect(findWifEnvironmentProblems({}, fileExists)).toHaveLength(4);
    const env = { ...complete, ANTHROPIC_API_KEY: SENTINEL };
    expect(findWifEnvironmentProblems(env, () => false).join('\n')).not.toContain(SENTINEL);
  });
});
