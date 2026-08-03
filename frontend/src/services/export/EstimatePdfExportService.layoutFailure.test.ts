/**
 * @fileoverview 帳票の組み立て段階で送出された例外の扱いの単体テスト（Task 56.6）
 *
 * 56.1 の `levelSymbol` は不正入力に対して `RangeError` を投げる。この例外は
 * `estimateReportLayout.buildFiles` の**内側**で起きるため、出力サービスが
 * 描画段階だけを `try` で囲っていると未捕捉のまま画面へ抜ける
 * （tasks.md Implementation Notes 56.1「出力サービスは `levelSymbol` の例外を
 * 未捕捉クラッシュにせずユーザーに見えるエラーとして扱うこと」）。
 *
 * `buildFiles` は正当な入力に対しては `levelSymbol` へ常に非負整数を渡すため、
 * 入力側からこの例外を起こすことはできない。そこで本ファイルだけ `buildFiles` を
 * 差し替え、**組み立て段階も統括の try に入っていること**を固定する。
 *
 * Requirements: 10.8（出力を中断してエラーメッセージを表示する）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  downloadCalls: [] as string[],
  buildFilesThrows: true,
}));

vi.mock('jspdf', () => {
  function MockJsPDF() {
    return {
      setFontSize: (): void => {},
      setFillColor: (): void => {},
      setDrawColor: (): void => {},
      setLineWidth: (): void => {},
      rect: (): void => {},
      line: (): void => {},
      text: (): void => {},
      getTextWidth: (): number => 1,
      addPage: (): void => {},
      setFont: (): void => {},
      output: (): Blob => new Blob(['pdf']),
    };
  }
  return { jsPDF: MockJsPDF };
});

vi.mock('./PdfFontService', () => ({
  PdfFontService: class {
    initialize(): void {}
    isLoaded(): boolean {
      return true;
    }
  },
  PDF_FONT_FAMILY: 'NotoSansJP',
}));

vi.mock('./PdfExportService', () => ({
  downloadPdf: (_blob: Blob, fileName?: string): void => {
    hoisted.downloadCalls.push(fileName ?? '');
  },
}));

vi.mock('./estimateReportLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./estimateReportLayout')>();
  return {
    ...actual,
    buildFiles: (): never => {
      throw new RangeError('levelSymbol: index は0以上の整数である必要があります: -1');
    },
  };
});

import {
  EstimatePdfExportError,
  generateAndDownload,
  type EstimatePdfExportInput,
} from './EstimatePdfExportService';

const input: EstimatePdfExportInput = {
  tree: [],
  lineTypes: ['ESTIMATE'],
  estimate: {
    name: '見積',
    reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
  },
  project: { name: '工事', siteAddress: null },
  customer: { name: null, representativeName: null },
  company: {
    companyName: null,
    representative: null,
    address: null,
    phone: null,
    fax: null,
  },
};

beforeEach(() => {
  hoisted.downloadCalls.length = 0;
});

describe('帳票の組み立て段階での失敗', () => {
  it('階層記号の RangeError を利用者向けエラーへ包み、ダウンロードを行わない', async () => {
    const error = await generateAndDownload(input).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EstimatePdfExportError);
    expect((error as EstimatePdfExportError).message).toMatch(/帳票の出力に失敗しました/);
    expect((error as EstimatePdfExportError).reason).toBeInstanceOf(RangeError);
    expect(hoisted.downloadCalls).toEqual([]);
  });
});
