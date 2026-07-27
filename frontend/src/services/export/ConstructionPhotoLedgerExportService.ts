/**
 * ConstructionPhotoLedgerExportService - 工事写真台帳PDF出力オーケストレーション
 *
 * Task 8.2: PDF出力結線（印字画像・看板重畳・0件通知）
 *
 * 詳細画面の「PDF出力」から呼ばれる結線層。8.1 の版組レンダラ
 * （{@link buildConstructionPhotoLedger}）を再利用し、以下を担う。
 *
 *  1. 印刷対象(includeInReport=true)の写真のみを保存表示順(displayOrder 昇順)で抽出 (要件10.1, 10.12)
 *  2. 印刷対象0件は非実行で通知（PDF未生成） (要件10.13)
 *  3. 各対象写真の印字画像をサーバからオンデマンド取得（看板ありはサーバで電子小黒板を
 *     重畳済み・看板なしは原本。クライアントでは合成しない） (要件10.3)
 *  4. Blob(image/jpeg)→dataURL 変換して版組レンダラへ渡し、工事名・工事施工者
 *     （会社情報の会社名）と共にPDFドキュメントを構築・保存 (要件10.2)
 *
 * 版組（8.1 の {@link ConstructionPhotoLedgerService}）は本タスクでは変更しない。
 *
 * @see design.md - System Flows（PDF出力時オンデマンド: GET print-image→dataURL→ledger）
 * @see design.md - Components and Interfaces（getPrintImage / ConstructionPhotoLedgerService）
 * @see requirements.md - 要件10.1, 10.3, 10.12, 10.13
 *
 * @module services/export/ConstructionPhotoLedgerExportService
 */

import { jsPDF } from 'jspdf';
import {
  buildConstructionPhotoLedger,
  type LedgerPhotoItem,
} from './ConstructionPhotoLedgerService';
import { getConstructionPhotoPrintImage } from '../../api/construction-photo-images';
import { getCompanyInfo } from '../../api/company-info';
import { isCompanyInfo } from '../../types/company-info.types';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 台帳PDF出力の入力
 */
export interface ConstructionPhotoLedgerExportInput {
  /** アルバム配下の全写真項目（署名URL同梱。表示順は本関数で displayOrder 昇順に正規化） */
  photos: ConstructionPhotoWithUrls[];
  /** 工事名（表紙に表示。アルバム名 or プロジェクト名） */
  workName: string;
  /** 保存ファイル名（省略時は工事名から生成） */
  fileName?: string;
}

/**
 * 台帳PDF出力の結果
 *
 * - `generated: true`: 印刷対象がありPDFを生成・保存した
 * - `generated: false`: 印刷対象が0件のため非実行（呼び出し側で通知する）
 */
export type ConstructionPhotoLedgerExportResult =
  | { generated: true; itemCount: number }
  | { generated: false; reason: 'no-printable' };

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * Blob を dataURL 文字列へ変換する
 *
 * jsPDF の addImage は dataURL を要求するため、印字画像 Blob(image/jpeg) を
 * FileReader で dataURL に変換する。
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('印字画像の読み込みに失敗しました'));
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// 公開関数
// ============================================================================

/**
 * 工事写真台帳PDFを出力する（オーケストレーション）
 *
 * 印刷対象のみを保存表示順で対象に、印字画像をオンデマンド取得して版組レンダラへ渡し、
 * PDFを構築して保存する。印刷対象0件のときはPDFを生成せず結果で通知する。
 *
 * @param input 写真項目・工事名
 * @returns 生成有無を示す結果（0件時は generated=false）
 */
export async function exportConstructionPhotoLedger(
  input: ConstructionPhotoLedgerExportInput
): Promise<ConstructionPhotoLedgerExportResult> {
  // 印刷対象のみ・保存表示順(displayOrder 昇順)に正規化 (要件10.1, 10.12)
  const printablePhotos = input.photos
    .filter((photo) => photo.includeInReport)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // 印刷対象0件は非実行で通知 (要件10.13)
  if (printablePhotos.length === 0) {
    return { generated: false, reason: 'no-printable' };
  }

  // 工事施工者は会社情報の会社名（未登録時は空文字） (要件10.2)
  const companyInfo = await getCompanyInfo();
  const contractorName = isCompanyInfo(companyInfo) ? companyInfo.companyName : '';

  // 各印刷対象の印字画像をオンデマンド取得（看板重畳はサーバ側で実施済み） (要件10.3)
  const items: LedgerPhotoItem[] = [];
  for (const photo of printablePhotos) {
    const blob = await getConstructionPhotoPrintImage(photo.id);
    const dataUrl = await blobToDataUrl(blob);
    items.push({
      dataUrl,
      comment: photo.comment,
      width: photo.width,
      height: photo.height,
    });
  }

  // 8.1 の版組レンダラでPDFドキュメントを構築（A4縦・mm）
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  buildConstructionPhotoLedger(doc, {
    workName: input.workName,
    contractorName,
    items,
  });

  const fileName = input.fileName ?? `工事写真台帳_${input.workName || '工事写真'}.pdf`;
  doc.save(fileName);

  return { generated: true, itemCount: items.length };
}
