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
