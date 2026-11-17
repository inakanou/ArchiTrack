/**
 * @fileoverview 単価台帳の画面の表示の文字（unit-price-ledger タスク4.2）
 *
 * 採否・読取の確認・改修／新営の文字は、受領見積書の台帳の情報の欄（LedgerInfoSection）と同じにする。
 */

import type {
  ConstructionKind,
  QuotationAdoption,
  ReadingStatus,
} from '../../api/received-quotations';

/** 採否の文字（estimate-request 46.3） */
export const ADOPTION_LABELS: Readonly<Record<QuotationAdoption, string>> = {
  ADOPTED: '採用',
  REJECTED: '不採用',
  UNKNOWN: '不明',
};

/** 読取の確認の文字（estimate-request 46.6） */
export const READING_STATUS_LABELS: Readonly<Record<ReadingStatus, string>> = {
  UNCONFIRMED: '未確認',
  CONFIRMED: '確認済み',
};

/** 改修／新営の文字（estimate-request 46.2） */
export const CONSTRUCTION_KIND_LABELS: Readonly<Record<ConstructionKind, string>> = {
  RENOVATION: '改修',
  NEW_CONSTRUCTION: '新営',
};

/** 論理削除された案件の見積の印（unit-price-ledger 4.8。一覧と詳細で案件名の隣に出す） */
export const DELETED_PROJECT_LABEL = '削除済みの案件';
