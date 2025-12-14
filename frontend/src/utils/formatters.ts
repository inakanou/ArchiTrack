/**
 * 日付を YYYY-MM-DD 形式でフォーマット
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * APIステータスを日本語に変換
 */
export function translateApiStatus(status: string): string {
  const translations: Record<string, string> = {
    checking: '確認中...',
    connected: '接続済み',
    disconnected: '未接続',
  };
  return translations[status] || status;
}

/**
 * バージョン文字列を検証
 */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

// ============================================================================
// 取引先関連フォーマット関数
// ============================================================================

/** 末日を表す値 */
const LAST_DAY_VALUE = 99;

/**
 * 請求締日を日本語表記に変換
 *
 * @param day - 請求締日（1-31 or 99=末日）
 * @returns 日本語表記（例: "25日"、"末日"）、未設定の場合はnull
 *
 * @example
 * formatBillingClosingDay(25)  // "25日"
 * formatBillingClosingDay(99)  // "末日"
 * formatBillingClosingDay(null) // null
 */
export function formatBillingClosingDay(day: number | null): string | null {
  if (day === null) {
    return null;
  }
  if (day === LAST_DAY_VALUE) {
    return '末日';
  }
  return `${day}日`;
}

/**
 * 月オフセットを日本語ラベルに変換
 */
function getMonthOffsetLabel(offset: number): string {
  switch (offset) {
    case 1:
      return '翌月';
    case 2:
      return '翌々月';
    case 3:
      return '3ヶ月後';
    default:
      return `${offset}ヶ月後`;
  }
}

/**
 * 支払日を日本語表記に変換
 *
 * @param monthOffset - 月オフセット（1=翌月, 2=翌々月, 3=3ヶ月後）
 * @param day - 支払日（1-31 or 99=末日）
 * @returns 日本語表記（例: "翌月10日"、"翌々月末日"）、未設定の場合はnull
 *
 * @example
 * formatPaymentDate(1, 10)  // "翌月10日"
 * formatPaymentDate(2, 99)  // "翌々月末日"
 * formatPaymentDate(null, null) // null
 */
export function formatPaymentDate(monthOffset: number | null, day: number | null): string | null {
  if (monthOffset === null || day === null) {
    return null;
  }

  const monthLabel = getMonthOffsetLabel(monthOffset);
  const dayLabel = day === LAST_DAY_VALUE ? '末日' : `${day}日`;

  return `${monthLabel}${dayLabel}`;
}

/**
 * ISO8601形式の日時文字列を日本語ロケールでフォーマット
 *
 * @param isoString - ISO8601形式の日時文字列
 * @returns 日本語ロケールでフォーマットされた日時（例: "2025/01/15 10:30"）
 *
 * @example
 * formatDateTime('2025-01-15T10:30:00.000Z') // "2025/01/15 19:30" (JST)
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
