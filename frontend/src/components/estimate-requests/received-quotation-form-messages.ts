/**
 * @fileoverview 受領見積書の登録・編集のフォームと、それを開く画面の文言（estimate-request のタスク117.4）
 *
 * フォームの部品のファイルから定数を出すと Fast Refresh が効かなくなるため、文言はこのファイルに置く。
 * 明細行の検証の文言・同じ原本の重複の文言はサーバーの検証の文言と同じにそろえる。
 *
 * 同じ原本の他の受領見積書の知らせ（48.4）は、保存の結果の `sharedOriginalCount`（同じ案件で原本の指紋が同じで
 * 見積の区別が違う、他の受領見積書の数）が 1 以上のときに、フォームを閉じた後の画面（見積依頼の詳細・案件の
 * 受領見積書の一覧）が出す。保存に成功するとフォームは閉じるため、フォームの中には出さない
 * （design の Requirements 43-50 の章の D6 の実装の記録（タスク117.4））。
 *
 * 根拠: 45.4, 45.9, 46.5, 46.9, 48.3, 48.4
 */

/**
 * 同じ原本の二重登録の文言（48.3。サーバーの 409 `DUPLICATE_ORIGINAL` の文言と同じ）
 */
export const DUPLICATE_ORIGINAL_MESSAGE = '同じ原本の受領見積書が既に登録されています';

/**
 * 明細行の保存の前の検証の文言（45.4・45.9・46.5。サーバーの明細行の検証と同じ文言）
 */
export const LINE_ITEM_SAVE_VALIDATION_MESSAGES = {
  DISCOUNT_AMOUNT_POSITIVE: '値引きの金額は0以下で入力してください',
  CONVERSION_INCOMPLETE:
    '換算は数量・単位・単価・根拠をすべて入力してください（数量は0より大きい値）',
  REFERENCE_REASON_WITHOUT_REFERENCE: '参考の理由は参考の印を付けた行にだけ入力できます',
} as const;

/** 明細行に誤りがあるときの、明細行の欄の下の知らせ（各行の下に文言を出す） */
export const LINE_ITEMS_ERROR_SUMMARY =
  '明細行に入力の誤りがあります。各行の下の表示を確かめてください';

/** 台帳の情報に誤りがあるときの、欄の見出しの下の知らせ（欄は既定で閉じているため。46.9） */
export const LEDGER_INFO_ERROR_SUMMARY =
  '台帳の情報に入力の誤りがあります。「台帳の情報」を開いて確かめてください';

/**
 * 同じ原本の他の受領見積書の件数から知らせの文言を作る。0 以下なら null（知らせを出さない）
 */
export function formatSharedOriginalNotice(sharedOriginalCount: number): string | null {
  if (!Number.isFinite(sharedOriginalCount) || sharedOriginalCount < 1) return null;
  return `同じ原本の受領見積書が他に${sharedOriginalCount}件登録されています（見積の区別が違うため登録しました）`;
}

/**
 * 保存に成功した後の受領見積書の一覧の再取得に失敗したときの知らせ。保存の失敗としてフォームへ伝えると、
 * 利用者が登録し直して同じ受領見積書を二重に作りうるため、フォームを閉じてからこの文言を出す
 */
export const QUOTATION_LIST_REFRESH_FAILED_MESSAGE =
  '受領見積書を保存しましたが、一覧の再読み込みに失敗しました。画面を再読み込みしてください。';
