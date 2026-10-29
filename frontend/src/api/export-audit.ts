/**
 * @fileoverview データ出力の記録の API 呼び出しと、ブラウザで生成する出力の事前記録の包み（ExportAuditClient）
 *
 * user-authentication タスク53.4。design.md の「ExportAuditService と ExportAuditClient」の節に従う。
 * 経路は backend の `POST /api/v1/audit-logs/exports`（タスク53.3、201 `{ recordId }`・400・
 * 範囲外の案件の 404・記録の失敗の 500）。
 *
 * ブラウザ上で出力を生成する各業務機能は、生成の処理を `runRecordedExport` へ渡す。
 * 記録の要求が成功したときだけ生成を呼び、失敗したときは生成を始めずに
 * 「出力を記録できなかったため中止しました」を返す（呼び出し側が画面へ表示する）。
 * 本 spec には画面で生成する出力が無いため、画面への適用は各業務機能の spec が行う
 * （最初の適用先は site-survey の調査報告書の PDF 出力）。
 */

import { apiClient } from './client';

/** 出力の種別（backend の export-audit.service.ts の EXPORT_KINDS と同じ 14 種） */
export type ExportKind =
  | 'site_survey_report_pdf'
  | 'site_survey_images_zip'
  | 'quantity_table_pdf'
  | 'itemized_statement_xlsx'
  | 'estimate_request_xlsx'
  | 'estimate_pdf'
  | 'estimate_xlsx'
  | 'schedule_export'
  | 'order_export'
  | 'progress_export'
  | 'construction_photo_ledger_pdf'
  | 'construction_photos_zip'
  | 'annotated_image'
  | 'audit_log_json';

/** 出力の記録の入力 */
export interface ExportRecordInput {
  kind: ExportKind;
  /** 案件に属する出力は必須（`audit_log_json` だけ null） */
  projectId: string | null;
  /** 出力の対象のデータの ID */
  targetIds: string[];
  /** 出力した件数 */
  itemCount: number;
}

/** 出力の記録の応答 */
export interface ExportRecordResponse {
  recordId: string;
}

/** 事前記録つきの出力の失敗 */
export type RecordedExportError =
  | { type: 'RECORD_FAILED'; message: string }
  | { type: 'GENERATION_FAILED'; cause: unknown };

/** 事前記録つきの出力の結果 */
export type RecordedExportResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RecordedExportError };

/** 記録の要求が失敗したときに呼び出し側が表示するエラーメッセージ */
export const EXPORT_RECORD_FAILED_MESSAGE = '出力を記録できなかったため中止しました';

/**
 * データ出力を記録する（`POST /api/v1/audit-logs/exports`）
 *
 * 失敗（400・404・500・通信の失敗）は ApiError などの例外として呼び出し側へ伝わる。
 *
 * 自動再試行はしない。この要求は送るたびに記録が 1 件増える（冪等でない）ため、サーバーが
 * 書いた後に応答が失われた・壊れた場合に送り直すと、出力 1 回に記録が重なる。HTTP の自動再試行は
 * 冪等な要求に限る（RFC 9110 9.2.2）。失敗は 1 回で呼び出し側へ返し、利用者が出力をやり直す。
 * 401 のトークン更新の後の送り直しは残る（要求がサーバーで弾かれ、記録されていないため）。
 */
export async function recordExport(input: ExportRecordInput): Promise<ExportRecordResponse> {
  return apiClient.post<ExportRecordResponse>('/api/v1/audit-logs/exports', input, {
    disableRetry: true,
  });
}

/**
 * 出力を記録してから生成する
 *
 * 記録の要求が成功した（記録の ID が返った）ときだけ `generate` を呼ぶ。
 * 記録の要求が失敗したとき、または応答に記録の ID が無いときは `generate` を呼ばず、
 * `RECORD_FAILED` とエラーメッセージを返す。記録の後に生成が失敗したときは
 * `GENERATION_FAILED` と原因を返す（記録は再送しない）。
 *
 * @param input 記録の入力
 * @param generate 出力を生成する処理（記録の成功の後にだけ呼ばれる）
 */
export async function runRecordedExport<T>(
  input: ExportRecordInput,
  generate: () => Promise<T>
): Promise<RecordedExportResult<T>> {
  let recorded: ExportRecordResponse | undefined;
  try {
    recorded = await recordExport(input);
  } catch {
    return { ok: false, error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE } };
  }
  if (typeof recorded?.recordId !== 'string' || recorded.recordId.length === 0) {
    return { ok: false, error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE } };
  }

  try {
    const value = await generate();
    return { ok: true, value };
  } catch (cause) {
    return { ok: false, error: { type: 'GENERATION_FAILED', cause } };
  }
}
