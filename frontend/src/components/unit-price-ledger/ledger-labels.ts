/**
 * @fileoverview 単価台帳の画面の表示の文字（unit-price-ledger タスク4.2）
 *
 * 採否・読取の確認・改修／新営の文字は、受領見積書の台帳の情報の欄（LedgerInfoSection）の選択肢と同じ定義
 * （`components/estimate-requests/ledger-info-form.ts`。estimate-request 46.2・46.3・46.6）を使う
 * （タスク6.6。以前は同じ文字をここに書き写していた）。
 */

export {
  ADOPTION_LABELS,
  CONSTRUCTION_KIND_LABELS,
  READING_STATUS_LABELS,
} from '../estimate-requests/ledger-info-form';

/** 論理削除された案件の見積の印（unit-price-ledger 4.8。一覧と詳細で案件名の隣に出す） */
export const DELETED_PROJECT_LABEL = '削除済みの案件';
