/**
 * Noto Sans JP フォント - Base64エンコードデータ
 *
 * Task 21.1: 日本語フォント埋め込みを実装する
 *
 * このファイルには、サブセット化されたNoto Sans JPフォントの
 * Base64エンコードデータが含まれています。
 *
 * フォント情報:
 * - フォント名: Noto Sans JP Regular
 * - ライセンス: OFL-1.1 (Open Font License)
 * - 元ソース: Google Fonts (https://fonts.google.com/noto/specimen/Noto+Sans+JP)
 * - サブセット対象: JIS第1水準漢字 + ひらがな + カタカナ + 英数字記号（約3,000文字）
 * - 目標サイズ: 約500KB
 *
 * サブセット化プロセス:
 * 1. Google FontsからNoto Sans JP Regularをダウンロード
 * 2. fonttools (pyftsubset) でサブセット化
 * 3. Base64エンコード
 *
 * コマンド例:
 * ```bash
 * pyftsubset NotoSansJP-Regular.ttf \
 *   --text-file=characters.txt \
 *   --output-file=NotoSansJP-Regular-subset.ttf \
 *   --flavor=woff2
 *
 * base64 -w 0 NotoSansJP-Regular-subset.ttf > noto-sans-jp-base64.txt
 * ```
 *
 * @see design.md - 日本語フォント埋め込み詳細
 * @see requirements.md - 要件10.6
 */

/**
 * Noto Sans JP Regular (サブセット版) - Base64エンコードデータ
 *
 * 注意: これはプレースホルダーです。
 * 本番環境では実際のサブセット化されたフォントデータに置き換える必要があります。
 *
 * 実際のフォントデータ生成手順:
 * 1. npm run generate:pdf-font を実行（scripts/generate-pdf-font.jsを使用）
 * 2. 生成されたBase64データでこの定数を更新
 */
export const NotoSansJPBase64: string =
  // 以下は最小限のTTFフォントヘッダーを模したプレースホルダー
  // 実際の運用では、サブセット化されたNoto Sans JPフォントのBase64データに置き換える
  'AAEAAAAOAIAAAwBgR0RFRgAQAAQAAAGEAAAAFkdQT1MAABAABAAAAZwAAABCR1NVQgAQAAQAAAHg' +
  'AAAAIk9TLzIAkQHKAAAB+AAAAGBjbWFwAK0ArgAAAmgAAAFaZ2FzcAAAABAAAAPEAAAACGdseWYA' +
  'ABjYAAADzAAAABRoZWFkFCMbPQAAA+AAAAAQaGhlYQfkA+YAAAQEAAAAJGhtdHgPvgH2AAAEKAA' +
  'AACBsb2NhABIAKAAABEgAAAAUbWF4cAANAFAAAARcAAAAIG5hbWUAAgAAAAAEfAAAACJwb3N0AA' +
  'MAAAAABKAAAAAgAAEAAAABAADjyNlfXw889QADA+gAAAAA2QKK+gAAAADZAor6AAD/4APoBAAA' +
  'AAMAAgAAAAAAAAABAAAD6P/gAAAD6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAABAABAAAABQAMAA' +
  'IAAAAAAAIAAAABAAEAAABAALgAAAAAAAAABAPoAZAABQAAApkCzAAAAI8CmQLMAAAB6wAzAQkA' +
  'AAACAAUDAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAg//8D6P/gAAAD6CAAAAABAAAAA' +
  'AAAAAACAAAAAAAAAAAAAAAAAAAB4AAAAeAAAAHgAAAB4AAAAAAAAUAAMAAQAAABQABAAcAAAAB' +
  'AAEAAEAAAAg//8AAAAg////4QABAAAAAAAAAQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAABAAEAAQAAAAwAFAAEAAAAAgAAAAEAAAAAAAABAAAAAAAAAAAAAAAA' +
  'AAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADQAAAAAAAAAAAAAAAQAAAAAA' +
  'AAAAAQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * フォントデータのサイズ情報（参考）
 *
 * - プレースホルダーサイズ: 約1KB（テスト用）
 * - 目標サブセットサイズ: 約500KB
 * - フルフォントサイズ: 約16MB
 */
export const FONT_INFO = {
  name: 'Noto Sans JP',
  weight: 'Regular',
  license: 'OFL-1.1',
  isSubset: true,
  targetCharacterCount: 3000,
  estimatedSize: '500KB',
} as const;
