/**
 * @fileoverview EstimatePdfExportService の単体テスト（Task 56.6）
 *
 * **検証方針**: 描画そのもの（座標・字間・打ち切り）は 56.4 / 56.5 のテストが固定済みなので、
 * 本ファイルは**統括の責務**――フォント登録・用紙設定・ページ送りとルーティング・
 * ファイル単位の生成・逐次ダウンロード・進捗報告・失敗時の原子性――だけを検証する。
 * そのため `EstimateCoverRenderer` / `EstimateTableRenderer` / `estimateReportLayout` は
 * **モックせず実物を使い**、`jspdf` だけを記録用のダブルへ差し替える。
 * 各ページで最初に描かれる `Page.N` / `No. Page.N` の並びが、そのままページ送りの順序と
 * 表紙／表組みのルーティングを可視化する（表紙は `Page.N`、内訳書・明細書は `No. Page.N`）。
 *
 * Requirements (estimate-creation):
 * - 10.1: PDF出力で建設工事見積書形式のPDFファイルを生成する
 * - 10.3〜10.6: 用紙設定・表紙・表組み・表記を Requirement 50〜53 に従って構成する
 * - 10.7: 出力処理中であることを表示する（サービスは進捗を報告する）
 * - 10.8: 日本語文字の描画準備に失敗した場合は出力を中断しエラーを表示する
 * - 32.2: 行タイプごとに独立したファイルを生成する
 * - 32.3: 「見積」「実行」「業者」の順に逐次ダウンロードする
 * - 32.6: 各出力ファイル名に当該ファイルの行タイプのラベルを含める
 *
 * Design: design.md `#### Frontend Export` > `##### EstimatePdfExportService`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EditableItem,
  EditableLine,
  EstimateEditItemType,
  EstimateLineType,
} from '../../domain/estimate/estimateEditReducer.types';

// ============================================================================
// jsPDF の記録用ダブル
// ============================================================================

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface RecordingDoc {
  readonly index: number;
  readonly options: Readonly<Record<string, unknown>>;
  readonly calls: RecordedCall[];
  readonly blobs: Blob[];
}

const hoisted = vi.hoisted(() => {
  const docs: {
    index: number;
    options: Record<string, unknown>;
    calls: { method: string; args: unknown[] }[];
    blobs: Blob[];
  }[] = [];

  const control = {
    /** この番号の doc で `text` が例外を投げる（生成途中の失敗を模す） */
    failOnDocIndex: null as number | null,
    /** 投げる例外の種別 */
    failureKind: 'error' as 'error' | 'range',
    /** フォント登録の挙動 */
    fontMode: 'ok' as 'ok' | 'silent-failure' | 'throw',
  };

  const fontInitializeCalls: unknown[] = [];
  const downloadCalls: { blob: Blob; fileName: string | undefined }[] = [];

  return { docs, control, fontInitializeCalls, downloadCalls };
});

vi.mock('jspdf', () => {
  const MM_PER_PT = 25.4 / 72;

  function MockJsPDF(options: Record<string, unknown>) {
    const index = hoisted.docs.length;
    const entry = {
      index,
      options,
      calls: [] as { method: string; args: unknown[] }[],
      blobs: [] as Blob[],
    };
    hoisted.docs.push(entry);

    let fontSizePt = 10;
    const record = (method: string, ...args: unknown[]): void => {
      entry.calls.push({ method, args });
    };

    return {
      setFontSize: (size: number): void => {
        fontSizePt = size;
        record('setFontSize', size);
      },
      setFillColor: (red: number, green: number, blue: number): void =>
        record('setFillColor', red, green, blue),
      setDrawColor: (red: number, green: number, blue: number): void =>
        record('setDrawColor', red, green, blue),
      setLineWidth: (width: number): void => record('setLineWidth', width),
      rect: (x: number, y: number, w: number, h: number, style?: string): void =>
        record('rect', x, y, w, h, style),
      line: (x1: number, y1: number, x2: number, y2: number): void =>
        record('line', x1, y1, x2, y2),
      text: (text: string, x: number, y: number): void => {
        if (hoisted.control.failOnDocIndex === index) {
          throw hoisted.control.failureKind === 'range'
            ? new RangeError('levelSymbol: index は0以上の整数である必要があります: -1')
            : new Error('jsPDF: 描画に失敗しました');
        }
        record('text', text, x, y);
      },
      // 参照PDFの計量（56.4 / 56.5 のテストと同じ「ASCII 0.5em / それ以外 1em」）
      getTextWidth: (text: string): number => {
        let units = 0;
        for (const character of text) {
          units += (character.codePointAt(0) ?? 0) < 128 ? 0.5 : 1;
        }
        return units * fontSizePt * MM_PER_PT;
      },
      addPage: (): void => record('addPage'),
      setFont: (family: string): void => record('setFont', family),
      addFileToVFS: (name: string): void => record('addFileToVFS', name),
      addFont: (file: string, family: string, style: string): void =>
        record('addFont', file, family, style),
      output: (type: string): Blob => {
        record('output', type);
        const blob = new Blob([`pdf-${index}`], { type: 'application/pdf' });
        entry.blobs.push(blob);
        return blob;
      },
    };
  }

  return { jsPDF: MockJsPDF };
});

/**
 * 日本語フォント登録のダブル
 *
 * **実サービスの3経路を忠実に再現する**（`PdfFontService.ts:103-134`）:
 * - `ok`: VFS登録 → `addFont` → `setFont` して `isLoaded() === true`
 * - `silent-failure`: フォントデータが小さい場合の経路。**例外を投げずに** `FAILED` で戻る
 *   （＝この経路こそ、統括側が結果を見なければ helvetica のまま描画が続いてしまう穴）
 * - `throw`: `addFont` が例外を投げる経路
 */
vi.mock('./PdfFontService', () => {
  class PdfFontService {
    private loaded = false;

    initialize(doc: {
      setFont(family: string): void;
      addFont(a: string, b: string, c: string): void;
    }): void {
      hoisted.fontInitializeCalls.push(doc);
      this.loaded = false;
      if (hoisted.control.fontMode === 'throw') {
        throw new Error('addFont に失敗しました');
      }
      if (hoisted.control.fontMode === 'silent-failure') {
        return;
      }
      doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
      doc.setFont('NotoSansJP');
      this.loaded = true;
    }

    isLoaded(): boolean {
      return this.loaded;
    }
  }

  return { PdfFontService, PDF_FONT_FAMILY: 'NotoSansJP' };
});

vi.mock('./PdfExportService', () => ({
  downloadPdf: (blob: Blob, fileName?: string): void => {
    hoisted.downloadCalls.push({ blob, fileName });
  },
}));

import {
  EstimatePdfExportError,
  downloadFiles,
  estimatePdfExportService,
  generate,
  generateAndDownload,
  type EstimatePdfExportInput,
} from './EstimatePdfExportService';

// ============================================================================
// 記録の読み出しユーティリティ
// ============================================================================

function docs(): readonly RecordingDoc[] {
  return hoisted.docs as unknown as readonly RecordingDoc[];
}

function callsOf(doc: RecordingDoc): readonly RecordedCall[] {
  return doc.calls;
}

function textsOf(doc: RecordingDoc): readonly string[] {
  return callsOf(doc)
    .filter((call) => call.method === 'text')
    .map((call) => String(call.args[0]));
}

/** ページ番号として描かれた文字列だけを描画順に取り出す */
function pageMarkersOf(doc: RecordingDoc): readonly string[] {
  return textsOf(doc).filter((text) => text.startsWith('Page.') || text.startsWith('No. Page.'));
}

/** `addPage` で区切ったページごとの呼び出し列 */
function pageSegmentsOf(doc: RecordingDoc): readonly (readonly RecordedCall[])[] {
  const segments: RecordedCall[][] = [[]];
  for (const call of callsOf(doc)) {
    if (call.method === 'addPage') {
      segments.push([]);
      continue;
    }
    segments[segments.length - 1]!.push(call);
  }
  return segments;
}

const DRAWING_METHODS = new Set(['text', 'line', 'rect']);

// ============================================================================
// フィクスチャ
// ============================================================================

function line(lineType: EstimateLineType, overrides: Partial<EditableLine> = {}): EditableLine {
  return {
    id: null,
    lineType,
    name: null,
    specification: null,
    unit: null,
    quantity: null,
    unitPrice: null,
    amount: null,
    remarks: null,
    sourceVendorName: null,
    ...overrides,
  };
}

function item(options: {
  key: string;
  itemType?: EstimateEditItemType;
  lines: readonly EditableLine[];
  children?: readonly EditableItem[];
}): EditableItem {
  return {
    id: options.key,
    tempId: null,
    itemType: options.itemType ?? 'STANDARD',
    lines: options.lines,
    children: options.children ?? [],
  };
}

/**
 * 3行タイプすべてに出力対象を持つ明細ツリー
 *
 * **`r1` の親行は金額欄が空**（`ESTIMATE` は名称のみ、`EXECUTION` は全欄未設定）である点が要。
 * `recalculateAncestorAmounts` を通さずに `buildFiles` へ渡すと、
 * `EXECUTION` では `r1` が「値を持たない項目」と判定されて**配下ごと帳票から消える**
 * （tasks.md Implementation Notes 56.3 の 56.6 への申し送り）。
 *
 * - `ESTIMATE`: r1 = 25,000 + 16,000 = 41,000、r2 = 9,000 → 合計 50,000
 * - `EXECUTION`: r1 = 20,000（`r1c2` は実行金額行を持たない）、r2 は実行金額行なし → 合計 20,000
 * - `VENDOR`: r2 = 8,000 のみ（r1 は業者金額行を持たない）→ 合計 8,000
 */
function referenceTree(): readonly EditableItem[] {
  return [
    item({
      key: 'r1',
      lines: [
        // 金額欄は空。子の合計で確定させるのは `recalculateAncestorAmounts` の責務
        line('ESTIMATE', { name: '仮設工事', unit: '式', quantity: '1' }),
        // 実行金額行は全欄未設定＝再計算前は「値を持たない項目」
        line('EXECUTION'),
      ],
      children: [
        item({
          key: 'r1c1',
          lines: [
            line('ESTIMATE', {
              name: '足場',
              specification: '枠組足場',
              unit: '㎡',
              quantity: '100',
              unitPrice: '250',
              amount: '25000',
            }),
            line('EXECUTION', { name: '足場', unit: '㎡', quantity: '100', amount: '20000' }),
          ],
        }),
        item({
          key: 'r1c2',
          lines: [
            line('ESTIMATE', {
              name: '養生',
              unit: '㎡',
              quantity: '80',
              unitPrice: '200',
              amount: '16000',
            }),
          ],
        }),
      ],
    }),
    item({
      key: 'r2',
      lines: [
        line('ESTIMATE', {
          name: '塗装工事',
          unit: '式',
          quantity: '1',
          unitPrice: '9000',
          amount: '9000',
        }),
        line('VENDOR', {
          name: '塗装工事',
          unit: '式',
          quantity: '1',
          unitPrice: '8000',
          amount: '8000',
        }),
      ],
    }),
  ];
}

function input(overrides: Partial<EstimatePdfExportInput> = {}): EstimatePdfExportInput {
  return {
    tree: referenceTree(),
    lineTypes: ['ESTIMATE'],
    estimate: {
      name: '本社ビル改修工事 見積',
      reportFields: {
        submissionDate: '2026-05-01',
        validityPeriod: '発行日より3ヶ月',
        separateWorks: [],
      },
    },
    project: { name: '本社ビル改修工事', siteAddress: '兵庫県姫路市平野町４３番地' },
    customer: { name: '株式会社アークン', representativeName: '中野 一誠' },
    company: {
      companyName: '株式会社アークン',
      representative: '代表取締役 中野',
      address: '〒670-0933 兵庫県姫路市平野町４３番地',
      phone: '079-000-0000',
      fax: '079-000-0001',
    },
    ...overrides,
  };
}

// ============================================================================

beforeEach(() => {
  hoisted.docs.length = 0;
  hoisted.fontInitializeCalls.length = 0;
  hoisted.downloadCalls.length = 0;
  hoisted.control.failOnDocIndex = null;
  hoisted.control.failureKind = 'error';
  hoisted.control.fontMode = 'ok';
});

// ============================================================================
// 用紙設定とページ送り（10.3, 50.1）
// ============================================================================

/**
 * @requirement estimate-creation/REQ-10.3 出力の用紙設定とページ構成を Requirement 50 に従って構成する
 */
describe('用紙設定とページ送り', () => {
  it('用紙を横向き・mm単位のA4として生成する', async () => {
    await generate(input({ lineTypes: ['ESTIMATE'] }));

    expect(docs()).toHaveLength(1);
    expect(docs()[0]!.options).toEqual({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
  });

  it('表紙の描画と表組みの描画を組み立て結果のページ順に呼び出す', async () => {
    await generate(input({ lineTypes: ['ESTIMATE'] }));

    // 表紙は `Page.N`、内訳書・明細書は `No. Page.N`（56.4 / 56.5 の描画契約）。
    // この並びがそのまま「ページ送りの順序」と「kind によるルーティング」を表す。
    expect(pageMarkersOf(docs()[0]!)).toEqual(['Page.1', 'No. Page.2', 'No. Page.3']);
  });

  it('ページごとに1回だけ改ページする', async () => {
    await generate(input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] }));

    // ESTIMATE: 表紙+内訳書+明細書=3ページ / EXECUTION: 内訳書+明細書=2ページ / VENDOR: 内訳書=1ページ
    const addPageCounts = docs().map(
      (doc) => callsOf(doc).filter((call) => call.method === 'addPage').length
    );
    expect(addPageCounts).toEqual([2, 1, 0]);
  });

  it('表紙を持たないファイルは1ページ目から内訳書を描く', async () => {
    await generate(input({ lineTypes: ['EXECUTION', 'VENDOR'] }));

    expect(pageMarkersOf(docs()[0]!)).toEqual(['No. Page.1', 'No. Page.2']);
    expect(pageMarkersOf(docs()[1]!)).toEqual(['No. Page.1']);
  });

  it('ページごとに塗り色・線色・線幅を明示設定してから描画する', async () => {
    // 56.4 / 56.5 のいずれも jsPDF のグラフィクス状態を戻さずに終了するため、
    // 表紙が設定した灰色の塗りが後続ページへ持ち越されないことを統括側で担保する。
    await generate(input({ lineTypes: ['ESTIMATE'] }));

    for (const segment of pageSegmentsOf(docs()[0]!)) {
      const firstDrawingAt = segment.findIndex((call) => DRAWING_METHODS.has(call.method));
      expect(firstDrawingAt).toBeGreaterThan(0);
      const preamble = segment.slice(0, firstDrawingAt);
      expect(preamble.filter((c) => c.method === 'setFillColor').map((c) => c.args)).toContainEqual(
        [0, 0, 0]
      );
      expect(preamble.filter((c) => c.method === 'setDrawColor').map((c) => c.args)).toContainEqual(
        [0, 0, 0]
      );
      expect(preamble.some((call) => call.method === 'setLineWidth')).toBe(true);
    }
  });
});

// ============================================================================
// 日本語フォントの登録（10.8）
// ============================================================================

describe('日本語フォントの登録', () => {
  it('ファイルごとに日本語フォントを登録してから描画する', async () => {
    await generate(input({ lineTypes: ['ESTIMATE', 'EXECUTION'] }));

    expect(hoisted.fontInitializeCalls).toHaveLength(2);
    for (const doc of docs()) {
      const setFontAt = callsOf(doc).findIndex((call) => call.method === 'setFont');
      const firstDrawingAt = callsOf(doc).findIndex((call) => DRAWING_METHODS.has(call.method));
      expect(setFontAt).toBeGreaterThanOrEqual(0);
      expect(setFontAt).toBeLessThan(firstDrawingAt);
      expect(callsOf(doc)[setFontAt]!.args).toEqual(['NotoSansJP']);
    }
  });

  it('登録が黙って失敗した場合、代替フォントへ切り替えず出力を中断する', async () => {
    hoisted.control.fontMode = 'silent-failure';

    await expect(generate(input({ lineTypes: ['ESTIMATE'] }))).rejects.toBeInstanceOf(
      EstimatePdfExportError
    );

    // 代替フォント（helvetica）が使える状態であることの裏取り:
    // doc は生成済み＝描画を続けようと思えば続けられた。にもかかわらず描画も出力もしない。
    expect(docs()).toHaveLength(1);
    expect(callsOf(docs()[0]!).filter((call) => DRAWING_METHODS.has(call.method))).toHaveLength(0);
    expect(callsOf(docs()[0]!).filter((call) => call.method === 'output')).toHaveLength(0);
    expect(docs()[0]!.blobs).toHaveLength(0);
  });

  it('登録が例外を投げた場合も出力を中断し、原因の例外を保持する', async () => {
    hoisted.control.fontMode = 'throw';

    const error = await generate(input({ lineTypes: ['ESTIMATE'] })).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(EstimatePdfExportError);
    expect(callsOf(docs()[0]!).filter((call) => DRAWING_METHODS.has(call.method))).toHaveLength(0);
    // 送出された例外を握り潰すと原因が失われ調査できなくなるため、
    // フォント登録の失敗は「握り潰して結果だけ見る」のではなく原因ごと引き取る。
    expect((error as EstimatePdfExportError).reason).toBeInstanceOf(Error);
    expect(((error as EstimatePdfExportError).reason as Error).message).toBe(
      'addFont に失敗しました'
    );
  });

  it('登録失敗のエラーは日本語の利用者向けメッセージを持つ', async () => {
    hoisted.control.fontMode = 'silent-failure';

    await expect(generate(input({ lineTypes: ['ESTIMATE'] }))).rejects.toThrow(
      /日本語フォント.*出力を中断/
    );
  });

  it('同じ入力でも登録に成功すればファイルを生成する（失敗側アサーションの非空振り確認）', async () => {
    const files = await generate(input({ lineTypes: ['ESTIMATE'] }));

    expect(files).toHaveLength(1);
    expect(
      callsOf(docs()[0]!).filter((call) => DRAWING_METHODS.has(call.method)).length
    ).toBeGreaterThan(0);
  });
});

// ============================================================================
// 行タイプごとのファイル生成と逐次ダウンロード（32.2, 32.3, 32.6）
// ============================================================================

describe('行タイプごとのファイル生成と逐次ダウンロード', () => {
  it('チェックされた行タイプの数だけファイルを生成する', async () => {
    const files = await generateAndDownload(
      input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] })
    );

    expect(files).toHaveLength(3);
    expect(hoisted.downloadCalls).toHaveLength(3);
  });

  it('指定順に依らず「見積」「実行」「業者」の順に逐次ダウンロードする', async () => {
    await generateAndDownload(input({ lineTypes: ['VENDOR', 'EXECUTION', 'ESTIMATE'] }));

    expect(hoisted.downloadCalls.map((call) => call.fileName)).toEqual([
      '本社ビル改修工事 見積_見積.pdf',
      '本社ビル改修工事 見積_実行.pdf',
      '本社ビル改修工事 見積_業者.pdf',
    ]);
  });

  it('各ファイル名に当該ファイルの行タイプのラベルを含める', async () => {
    const files = await generate(input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] }));

    expect(files.map((file) => ({ lineType: file.lineType, fileName: file.fileName }))).toEqual([
      { lineType: 'ESTIMATE', fileName: '本社ビル改修工事 見積_見積.pdf' },
      { lineType: 'EXECUTION', fileName: '本社ビル改修工事 見積_実行.pdf' },
      { lineType: 'VENDOR', fileName: '本社ビル改修工事 見積_業者.pdf' },
    ]);
  });

  it('ファイル名にできない文字を含む見積名を安全な名前へ置き換える', async () => {
    const files = await generate(
      input({
        lineTypes: ['ESTIMATE'],
        estimate: {
          name: 'A/B:C*見積',
          reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        },
      })
    );

    expect(files[0]!.fileName).toBe('A_B_C_見積_見積.pdf');
  });

  it('選択されていない行タイプのファイルを生成しない', async () => {
    const files = await generate(input({ lineTypes: ['EXECUTION'] }));

    expect(files.map((file) => file.lineType)).toEqual(['EXECUTION']);
    expect(docs()).toHaveLength(1);
  });

  it('ファイルごとに独立した jsPDF ドキュメントから Blob を取り出す', async () => {
    const files = await generate(input({ lineTypes: ['ESTIMATE', 'EXECUTION'] }));

    expect(docs()).toHaveLength(2);
    expect(files[0]!.blob).toBe(docs()[0]!.blobs[0]);
    expect(files[1]!.blob).toBe(docs()[1]!.blobs[0]);
    expect(files[0]!.blob).not.toBe(files[1]!.blob);
  });

  it('generate はダウンロードを行わない（生成と配信を分離する）', async () => {
    await generate(input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] }));

    expect(hoisted.downloadCalls).toHaveLength(0);
  });

  it('downloadFiles は受け取った順に Blob とファイル名を渡す', () => {
    const blobA = new Blob(['a']);
    const blobB = new Blob(['b']);

    downloadFiles([
      { lineType: 'ESTIMATE', fileName: '見積.pdf', blob: blobA },
      { lineType: 'VENDOR', fileName: '業者.pdf', blob: blobB },
    ]);

    expect(hoisted.downloadCalls).toEqual([
      { blob: blobA, fileName: '見積.pdf' },
      { blob: blobB, fileName: '業者.pdf' },
    ]);
  });
});

// ============================================================================
// 途中失敗の原子性（10.8 / design.md Postconditions）
// ============================================================================

describe('途中で失敗した場合の原子性', () => {
  it('3ファイル中2ファイル目で失敗した場合、ファイルを1つもダウンロードしない', async () => {
    hoisted.control.failOnDocIndex = 1;

    await expect(
      generateAndDownload(input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] }))
    ).rejects.toBeInstanceOf(EstimatePdfExportError);

    // 非空振りの裏取り: 1ファイル目は**既に Blob まで出来上がっている**。
    // 「生成のたびにダウンロードする」実装ならここで1件ダウンロード済みになる。
    expect(docs().length).toBeGreaterThanOrEqual(2);
    expect(docs()[0]!.blobs).toHaveLength(1);
    expect(callsOf(docs()[0]!).filter((call) => call.method === 'output')).toHaveLength(1);

    expect(hoisted.downloadCalls).toHaveLength(0);
  });

  it('失敗しなければ同じ入力で3ファイルがダウンロードされる（原子性アサーションの非空振り確認）', async () => {
    await generateAndDownload(input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] }));

    expect(hoisted.downloadCalls).toHaveLength(3);
  });

  it('1ファイル目で失敗した場合もダウンロードしない', async () => {
    hoisted.control.failOnDocIndex = 0;

    await expect(
      generateAndDownload(input({ lineTypes: ['ESTIMATE', 'EXECUTION'] }))
    ).rejects.toBeInstanceOf(EstimatePdfExportError);
    expect(hoisted.downloadCalls).toHaveLength(0);
  });

  it('描画中の RangeError を利用者向けエラーへ包んで送出する', async () => {
    // 56.1 の `levelSymbol` は不正入力に `RangeError` を投げる。未捕捉のまま画面へ抜けさせず、
    // 原因を保持したまま利用者に見えるエラーとして扱う（56.1 からの申し送り）。
    hoisted.control.failOnDocIndex = 0;
    hoisted.control.failureKind = 'range';

    const error = await generate(input({ lineTypes: ['ESTIMATE'] })).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(EstimatePdfExportError);
    expect((error as EstimatePdfExportError).message).toMatch(/帳票の出力に失敗しました/);
    expect((error as EstimatePdfExportError).reason).toBeInstanceOf(RangeError);
  });
});

// ============================================================================
// 進捗の報告（10.7）
// ============================================================================

describe('進捗の報告', () => {
  it('生成中であることをファイルごとに報告し、完了で締める', async () => {
    const progress: { phase: string; percent: number; message?: string }[] = [];

    await generate(
      input({
        lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'],
        onProgress: (received) => {
          progress.push({
            phase: received.phase,
            percent: received.percent,
            message: received.message,
          });
        },
      })
    );

    expect(progress.map((entry) => entry.phase)).toEqual([
      'initializing',
      'generating',
      'generating',
      'generating',
      'finalizing',
      'complete',
    ]);
    expect(progress.filter((entry) => entry.phase === 'generating').map((e) => e.message)).toEqual([
      '見積の帳票を生成中... (1/3)',
      '実行の帳票を生成中... (2/3)',
      '業者の帳票を生成中... (3/3)',
    ]);
    expect(progress[progress.length - 1]!.percent).toBe(100);
  });

  it('進捗コールバックが無くても生成できる', async () => {
    await expect(generate(input({ lineTypes: ['ESTIMATE'] }))).resolves.toHaveLength(1);
  });
});

// ============================================================================
// 描画対象の受け渡し（56.3 / 56.4 からの申し送り）
// ============================================================================

/**
 * @requirement estimate-creation/REQ-10.4 出力の表紙を Requirement 51 に従って構成する
 * @requirement estimate-creation/REQ-10.5 出力の内訳書ページと明細書ページの表組みを Requirement 52 に従って構成する
 * @requirement estimate-creation/REQ-10.6 出力の数量・単価・金額・単位・階層記号の表記を Requirement 53 に従って構成する
 */
describe('描画対象の受け渡し', () => {
  it('親の金額が空でも再計算済みツリーを渡すため配下が帳票から消えない', async () => {
    await generate(input({ lineTypes: ['EXECUTION'] }));

    const texts = textsOf(docs()[0]!);
    // `r1` の実行金額行は全欄未設定。再計算せずに渡すと `r1` ごと省かれ、
    // 明細書ページ自体が生成されないため `足場` はどこにも描かれない。
    expect(texts).toContain('足場');
    expect(texts).toContain('20,000');
    expect(pageMarkersOf(docs()[0]!)).toEqual(['No. Page.1', 'No. Page.2']);
  });

  it('表紙の見積金額は同一ファイルの内訳書の合計行と一致する', async () => {
    await generate(input({ lineTypes: ['ESTIMATE'] }));

    const texts = textsOf(docs()[0]!);
    // 内訳書の合計行（52.10）: 41,000（仮設工事） + 9,000（塗装工事）
    expect(texts).toContain('50,000');
    // 表紙（51.6 / 53.8）: 同じ金額を全角で
    expect(texts).toContain(' 御見積金額 ￥５０，０００ ');
  });

  it('内訳書の合計がゼロの見積書でも表紙にゼロ金額を描き、出力を失敗させない', async () => {
    // 53.4 により `formatMoney` はゼロを**空欄**にするため、合計行の金額欄は `''` になる
    // （`estimateReportLayout.ts:236-238`）。新規作成直後の空の見積書や全額ゼロの
    // 無償見積書は**必ずこの経路を通る**ので、空文字を `Decimal` へ戻す際に
    // 落とし穴（`new Decimal('')` は DecimalError を送出する）を踏んではならない。
    // 表紙の 53.8 はゼロを空欄にせず「０」として出力する。
    const files = await generate(input({ lineTypes: ['ESTIMATE'], tree: [] }));

    expect(files).toHaveLength(1);
    expect(textsOf(docs()[0]!)).toContain(' 御見積金額 ￥０ ');
  });

  it('全ての金額がゼロのツリーでも表紙にゼロ金額を描き、出力を失敗させない', async () => {
    // 空ツリーだけでなく「項目はあるが合計がゼロ」の側からも同じ境界を跨ぐ。
    const zeroTree: readonly EditableItem[] = [
      item({
        key: 'z1',
        lines: [
          line('ESTIMATE', {
            name: '無償対応',
            unit: '式',
            quantity: '1',
            unitPrice: '0',
            amount: '0',
          }),
        ],
      }),
    ];

    const files = await generate(input({ lineTypes: ['ESTIMATE'], tree: zeroTree }));

    expect(files).toHaveLength(1);
    const texts = textsOf(docs()[0]!);
    // 項目自体は 38.2 の「値を持つ」判定で残る（ゼロは空欄化されるだけで省略理由ではない）。
    // 名称欄は 53.7 の第1階層の階層記号付き。
    expect(texts).toContain('Ａ.無償対応');
    expect(texts).toContain(' 御見積金額 ￥０ ');
  });

  it('表紙は見積のファイルにのみ描かれ、実行・業者のファイルには描かれない', async () => {
    await generate(input({ lineTypes: ['ESTIMATE', 'EXECUTION', 'VENDOR'] }));

    expect(textsOf(docs()[0]!).some((text) => text.startsWith(' 御見積金額 '))).toBe(true);
    expect(textsOf(docs()[1]!).some((text) => text.startsWith(' 御見積金額 '))).toBe(false);
    expect(textsOf(docs()[2]!).some((text) => text.startsWith(' 御見積金額 '))).toBe(false);
  });

  it('表紙に工事情報・宛先・自社情報を渡す', async () => {
    await generate(input({ lineTypes: ['ESTIMATE'] }));

    const texts = textsOf(docs()[0]!);
    expect(texts.some((text) => text.includes('本社ビル改修工事'))).toBe(true);
    expect(texts.some((text) => text.includes('株式会社アークン'))).toBe(true);
    expect(texts.some((text) => text.includes('兵庫県姫路市平野町４３番地'))).toBe(true);
  });
});

// ============================================================================
// 公開インターフェース
// ============================================================================

describe('公開インターフェース', () => {
  it('サービスオブジェクトは generate / downloadFiles / generateAndDownload を提供する', () => {
    expect(typeof estimatePdfExportService.generate).toBe('function');
    expect(typeof estimatePdfExportService.downloadFiles).toBe('function');
    expect(typeof estimatePdfExportService.generateAndDownload).toBe('function');
  });
});
