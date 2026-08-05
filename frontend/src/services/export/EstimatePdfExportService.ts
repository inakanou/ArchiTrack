/**
 * @fileoverview EstimatePdfExportService - 帳票（PDF）の出力サービス
 *
 * `estimateReportLayout.buildFiles` が組み立てた `ReportFileSpec[]` を jsPDF へ描画し、
 * 行タイプごとに1ファイルとして逐次ダウンロードする。**描画そのものは行わず**、
 * 表紙は `EstimateCoverRenderer.drawCoverPage`、内訳書・明細書は
 * `EstimateTableRenderer.drawTablePage` へ委譲する。本モジュールの責務は
 * 「フォント登録・用紙設定・ページ送りとルーティング・ファイル生成・逐次ダウンロード・
 * 進捗報告・失敗時の中断」の統括に限る。
 *
 * **原子性**: 全ファイルの `Blob` を作り終えてからダウンロードを開始する。
 * 途中で失敗した場合はファイルを1つもダウンロードしない（design.md Postconditions
 * 「部分成功でダウンロードを始めない」）。`generate` は生成のみ、`downloadFiles` は配信のみを
 * 担い、`generateAndDownload` が「全件生成 → 全件配信」の順序を構造として保証する。
 *
 * **日本語フォント**: `PdfFontService.initialize(doc)` の結果を必ず検証し、
 * 登録できなかった場合は helvetica へフォールバックせず例外にする（10.8）。
 * 既存 `PdfReportService` のフォールバック挙動は踏襲しない。
 *
 * **動的読み込み**: 本モジュールはフォント資産（約2.25MB）へ静的に到達するため、
 * 初期表示のチャンクから切り離す。呼び出し側は `loadEstimatePdfExportService` を用いて
 * 動的に読み込むこと（本モジュールを静的 import してはならない）。
 *
 * 依存方向: `domain` / 他の `services/export` にのみ依存し、`hooks` / `components` /
 * `pages` / `api` には依存しない（design.md `#### Dependency Direction`）。
 *
 * Requirements (estimate-creation):
 * - 10.1: PDF出力で建設工事見積書形式のPDFファイルを生成する
 * - 10.3〜10.6: 用紙設定・表紙・表組み・表記を Requirement 50〜53 に従って構成する
 * - 10.7: 出力処理中であることを表示する（本サービスは進捗を報告する）
 * - 10.8: 日本語文字の描画準備に失敗した場合は出力を中断しエラーを表示する
 * - 32.2: 行タイプごとに独立したファイルを生成する
 * - 32.3: 「見積」「実行」「業者」の順に逐次ダウンロードする
 * - 32.6: 各出力ファイル名に当該ファイルの行タイプのラベルを含める
 *
 * Design: design.md `#### Frontend Export` > `##### EstimatePdfExportService`
 *
 * @module services/export/EstimatePdfExportService
 */

import Decimal from 'decimal.js';
import { jsPDF } from 'jspdf';

import type {
  EditableItem,
  EstimateLineType,
  EstimateReportFields,
} from '../../domain/estimate/estimateEditReducer.types';
import { recalculateAncestorAmounts } from '../../domain/estimate/estimateTree';

import { drawCoverPage } from './EstimateCoverRenderer';
import type { CompanyInfoSnapshot, EstimateCoverSubject } from './EstimateCoverRenderer';
import { drawTablePage } from './EstimateTableRenderer';
import { buildFiles, REPORT_GRID } from './estimateReportLayout';
import type { ReportFileSpec, ReportPage } from './estimateReportLayout';
import { PdfFontService } from './PdfFontService';
import { downloadPdf } from './PdfExportService';
import type { PdfExportPhase, PdfExportProgress } from './PdfExportService';
import { sanitizeName } from './zip-naming';

// ============================================================================
// 型定義（design.md `##### EstimatePdfExportService` の契約）
// ============================================================================

/** 帳票出力の入力（design.md `EstimatePdfExportInput`） */
export interface EstimatePdfExportInput {
  /**
   * 明細ツリー
   *
   * 親項目の金額が未確定でも構わない。本サービスが
   * `recalculateAncestorAmounts` を通してから `buildFiles` へ渡す。
   */
  readonly tree: readonly EditableItem[];
  /** 出力対象の行タイプ。順序は問わない（32.3 の順序は `buildFiles` が決める） */
  readonly lineTypes: readonly EstimateLineType[];
  readonly estimate: { readonly name: string; readonly reportFields: EstimateReportFields };
  readonly project: { readonly name: string; readonly siteAddress: string | null };
  readonly customer: { readonly name: string | null; readonly representativeName: string | null };
  readonly company: CompanyInfoSnapshot;
  /** 進捗の通知先（10.7）。表示は呼び出し側の責務 */
  readonly onProgress?: (progress: PdfExportProgress) => void;
}

/** 生成済みの1ファイル（design.md `GeneratedReportFile`） */
export interface GeneratedReportFile {
  readonly lineType: EstimateLineType;
  readonly fileName: string;
  readonly blob: Blob;
}

/**
 * 帳票出力サービス
 *
 * design.md の契約は `generate` のみを定めるが、tasks.md 56.6 の受入基準
 * 「行タイプごとに1ファイルを生成し『見積』『実行』『業者』の順に逐次ダウンロードする」
 * を本サービスの責務として満たすため、配信（`downloadFiles`）と
 * その合成（`generateAndDownload`）を加えている。生成と配信を別メソッドに保つことで
 * 「全件生成してから配信する」原子性が呼び出し側の書き方に依存しなくなる。
 */
export interface EstimatePdfExportService {
  /** 行タイプごとに1ファイル。「見積」「実行」「業者」の順で返す（32.3） */
  generate(input: EstimatePdfExportInput): Promise<readonly GeneratedReportFile[]>;
  /** 生成済みファイルを受け取った順に逐次ダウンロードする（32.3） */
  downloadFiles(files: readonly GeneratedReportFile[]): void;
  /** 全件を生成し終えてから逐次ダウンロードする（10.8 / 部分成功で配信しない） */
  generateAndDownload(input: EstimatePdfExportInput): Promise<readonly GeneratedReportFile[]>;
}

/**
 * 帳票出力の失敗
 *
 * `message` はそのまま画面に出せる日本語であること（10.8）。原因の例外は
 * `reason` に保持する（`Error.cause` は tsconfig の `lib: ES2020` に無いため独自に持つ）。
 * 56.1 の `levelSymbol` が投げる `RangeError` のような**組み立て段階の例外も
 * 未捕捉のまま画面へ抜けさせず**、必ず本エラーへ包んで送出する。
 */
export class EstimatePdfExportError extends Error {
  /** 原因となった例外 */
  public readonly reason: unknown;

  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = 'EstimatePdfExportError';
    this.reason = reason;
  }
}

// ============================================================================
// 定数
// ============================================================================

/** 日本語フォントの登録に失敗したときの利用者向けメッセージ（10.8） */
export const FONT_REGISTRATION_ERROR_MESSAGE =
  '日本語フォントの登録に失敗したため、帳票の出力を中断しました。文字が正しく表示されないファイルは作成されません。';

/** 生成中に失敗したときの利用者向けメッセージの前置き */
export const EXPORT_FAILURE_MESSAGE_PREFIX = '帳票の出力に失敗しました。';

/** 用紙（50.1。`REPORT_GRID.paper` の 297mm × 210mm と同じA4横） */
const DOCUMENT_OPTIONS = {
  orientation: 'landscape',
  unit: 'mm',
  format: 'a4',
} as const;

/** ファイル名の拡張子 */
const FILE_EXTENSION = '.pdf';

/** 見積名とラベルの区切り（32.6） */
const FILE_NAME_SEPARATOR = '_';

/** 進捗のフェーズ（`PdfExportService` の `PdfExportPhase` に型で拘束される） */
const PHASE_INITIALIZING: PdfExportPhase = 'initializing';
const PHASE_GENERATING: PdfExportPhase = 'generating';
const PHASE_FINALIZING: PdfExportPhase = 'finalizing';
const PHASE_COMPLETE: PdfExportPhase = 'complete';

/** 最終処理の進捗率（`PdfExportService` の慣例に合わせる） */
const FINALIZING_PERCENT = 95;

// ============================================================================
// 描画先（jsPDF の必要な面）
// ============================================================================

/**
 * 本サービスが用いる jsPDF の面
 *
 * 2つのレンダラが要求する面（`CoverPdfDocument` / `TablePdfDocument`）に、
 * ページ送りと出力を加えたもの。`jsPDF` が構造的に満たす。
 */
interface ReportPdfDocument {
  setFontSize(size: number): void;
  setFillColor(red: number, green: number, blue: number): void;
  setDrawColor(red: number, green: number, blue: number): void;
  setLineWidth(width: number): void;
  rect(x: number, y: number, width: number, height: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  text(text: string, x: number, y: number): void;
  getTextWidth(text: string): number;
  addPage(): void;
}

// ============================================================================
// フォント登録（10.8）
// ============================================================================

/**
 * 日本語フォントを登録する
 *
 * `PdfFontService.initialize` は**フォントデータが不正な場合に例外を投げずに戻る**
 * （`PdfFontService.ts:111-115`）。その経路で描画を続けると jsPDF の既定フォント
 * （helvetica）が使われ、日本語が化けたPDFが出来上がる。10.8 はこれを禁じているため、
 * 例外の有無に依らず `isLoaded()` を検証し、登録できていなければ中断する。
 *
 * Requirements: 10.8
 */
function registerJapaneseFont(doc: jsPDF): void {
  const fontService = new PdfFontService();
  try {
    fontService.initialize(doc);
  } catch (error) {
    throw new EstimatePdfExportError(FONT_REGISTRATION_ERROR_MESSAGE, error);
  }
  if (!fontService.isLoaded()) {
    throw new EstimatePdfExportError(FONT_REGISTRATION_ERROR_MESSAGE);
  }
}

// ============================================================================
// 描画状態（56.4 / 56.5 からの申し送り）
// ============================================================================

/**
 * ページ先頭でグラフィクス状態を既定へ戻す
 *
 * `drawCoverPage` も `drawTablePage` も jsPDF のグラフィクス状態
 * （fillColor / drawColor / lineWidth）を**戻さずに終了する**。表紙が設定した
 * 網掛けの灰色（192,192,192）が次ページへ持ち越されないよう、ページごとに明示設定する。
 * 値は jsPDF の既定（黒）と本帳票の内側罫線の太さ。
 */
function resetGraphicsState(doc: ReportPdfDocument): void {
  doc.setFillColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(REPORT_GRID.borderThinMm);
}

// ============================================================================
// 表紙の描画対象（56.4 からの申し送り）
// ============================================================================

/** 帳票の金額表記（`formatMoney`）を `Decimal` へ戻す。空欄はゼロ */
function parseReportMoney(text: string): Decimal {
  const digits = text.replace(/,/g, '');
  if (digits === '') {
    return new Decimal(0);
  }
  return new Decimal(digits);
}

/**
 * 当該ファイルの内訳書の合計金額を取り出す
 *
 * 表紙の見積金額（51.6）は**同一ファイルの内訳書の合計行と同じ金額**でなければならない。
 * `buildFiles` の表紙ページは `totalRow: null` なので、合計を別経路で計算すると
 * 表紙だけ違う数字になりうる。ここでは**内訳書の合計行の文字列そのもの**を読み戻すことで
 * 一致を構造的に保証する（56.4 からの申し送り）。
 *
 * 内訳書が複数ページに分かれる場合、合計行を持つのは最終ページのみ（50.10）。
 */
function summaryTotalAmount(file: ReportFileSpec): Decimal {
  for (let index = file.pages.length - 1; index >= 0; index -= 1) {
    const page = file.pages[index];
    if (page !== undefined && page.kind === 'summary' && page.totalRow !== null) {
      return parseReportMoney(page.totalRow.amount);
    }
  }
  return new Decimal(0);
}

function coverSubject(input: EstimatePdfExportInput, file: ReportFileSpec): EstimateCoverSubject {
  return {
    reportFields: input.estimate.reportFields,
    project: input.project,
    customer: input.customer,
    company: input.company,
    totalAmount: summaryTotalAmount(file),
  };
}

// ============================================================================
// ファイル名（32.6）
// ============================================================================

/**
 * ファイル名を組み立てる
 *
 * 「{見積名}_{行タイプのラベル}.pdf」。ラベルは `ReportFileSpec.fileNameLabel`
 * （「見積」「実行」「業者」）をそのまま用いる。見積名はパス区切りなどを含みうるため
 * 既存の `sanitizeName` で安全化する。
 *
 * Requirements: 32.6
 */
export function buildReportFileName(estimateName: string, fileNameLabel: string): string {
  return `${sanitizeName(estimateName)}${FILE_NAME_SEPARATOR}${fileNameLabel}${FILE_EXTENSION}`;
}

// ============================================================================
// 1ファイルの描画
// ============================================================================

/**
 * 1ファイル分の jsPDF ドキュメントを組み立てて `Blob` にする
 *
 * ページは `ReportFileSpec.pages` の順に描く。2ページ目以降は `addPage` で送る。
 * `kind` による振り分けは 56.4 / 56.5 の事前条件どおり
 * （`cover` → `drawCoverPage`、`summary` / `detail` → `drawTablePage`）。
 * どちらのレンダラも想定外の `kind` に `RangeError` を投げるため、
 * 振り分けを誤ると静かに壊れたPDFにはならず必ず失敗する。
 */
function renderFile(input: EstimatePdfExportInput, file: ReportFileSpec): Blob {
  const doc = new jsPDF(DOCUMENT_OPTIONS);
  registerJapaneseFont(doc);

  file.pages.forEach((page: ReportPage, index: number) => {
    if (index > 0) {
      doc.addPage();
    }
    resetGraphicsState(doc);

    if (page.kind === 'cover') {
      // 表紙ページを含むのは `hasCoverPage === true` のファイルだけ（51.16）。
      // 実行金額・業者金額のファイルはこの分岐に入らないため表紙は描かれない（50.12）
      drawCoverPage(doc, page, coverSubject(input, file));
      return;
    }
    drawTablePage(doc, page);
  });

  return doc.output('blob');
}

// ============================================================================
// 進捗（10.7）
// ============================================================================

function reportProgress(
  onProgress: ((progress: PdfExportProgress) => void) | undefined,
  progress: PdfExportProgress
): void {
  if (onProgress !== undefined) {
    onProgress(progress);
  }
}

function percentOf(current: number, total: number): number {
  if (total <= 0) {
    return 100;
  }
  return Math.round((current / total) * 100);
}

// ============================================================================
// 公開関数
// ============================================================================

/**
 * 行タイプごとの帳票ファイルを生成する
 *
 * **ダウンロードは行わない**。全ファイルの `Blob` を作り終えてから返すため、
 * 呼び出し側が返り値を配信する限り「途中で失敗したらファイルを1つも配信しない」が成り立つ。
 *
 * 失敗時は生成済みのファイルを一切返さず `EstimatePdfExportError` を送出する。
 *
 * Requirements: 10.1, 10.3〜10.8, 32.2, 32.3, 32.6
 */
export async function generate(
  input: EstimatePdfExportInput
): Promise<readonly GeneratedReportFile[]> {
  const onProgress = input.onProgress;
  reportProgress(onProgress, {
    phase: PHASE_INITIALIZING,
    current: 0,
    total: new Set(input.lineTypes).size,
    percent: 0,
    message: '帳票の出力を準備中...',
  });

  try {
    // `buildFiles` は親項目の金額を再計算しない。再計算前のツリーを渡すと、
    // 金額欄が空の親が「値を持たない項目」と判定されて配下ごと帳票から消える
    // （tasks.md Implementation Notes 56.3 の申し送り）。
    const files = buildFiles(recalculateAncestorAmounts(input.tree), input.lineTypes);
    const generated: GeneratedReportFile[] = [];

    for (const [index, file] of files.entries()) {
      reportProgress(onProgress, {
        phase: PHASE_GENERATING,
        current: index,
        total: files.length,
        percent: percentOf(index, files.length),
        message: `${file.fileNameLabel}の帳票を生成中... (${index + 1}/${files.length})`,
      });

      generated.push({
        lineType: file.lineType,
        fileName: buildReportFileName(input.estimate.name, file.fileNameLabel),
        blob: renderFile(input, file),
      });
    }

    reportProgress(onProgress, {
      phase: PHASE_FINALIZING,
      current: files.length,
      total: files.length,
      percent: FINALIZING_PERCENT,
      message: 'ファイルを準備中...',
    });
    reportProgress(onProgress, {
      phase: PHASE_COMPLETE,
      current: files.length,
      total: files.length,
      percent: 100,
      message: '帳票の出力が完了しました',
    });

    return generated;
  } catch (error) {
    // 組み立て段階（`levelSymbol` の `RangeError` など）も描画段階も、
    // 未捕捉のまま画面へ抜けさせない（56.1 からの申し送り）。
    if (error instanceof EstimatePdfExportError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new EstimatePdfExportError(`${EXPORT_FAILURE_MESSAGE_PREFIX}${detail}`, error);
  }
}

/**
 * 生成済みファイルを受け取った順に逐次ダウンロードする
 *
 * zip 化は行わず、既存 `PdfExportService.downloadPdf` をファイル数分呼び出す（32.3）。
 *
 * Requirements: 32.3, 32.6
 */
export function downloadFiles(files: readonly GeneratedReportFile[]): void {
  for (const file of files) {
    downloadPdf(file.blob, file.fileName);
  }
}

/**
 * 帳票を生成し「見積」「実行」「業者」の順に逐次ダウンロードする
 *
 * `generate` が全ファイルを作り終えてから `downloadFiles` を呼ぶため、
 * 途中で失敗した場合はファイルを1つもダウンロードしない。
 *
 * Requirements: 10.8, 32.2, 32.3, 32.6
 */
export async function generateAndDownload(
  input: EstimatePdfExportInput
): Promise<readonly GeneratedReportFile[]> {
  const files = await generate(input);
  downloadFiles(files);
  return files;
}

/** サービスの実体（`loadEstimatePdfExportService` が動的に返す） */
export const estimatePdfExportService: EstimatePdfExportService = {
  generate,
  downloadFiles,
  generateAndDownload,
};
