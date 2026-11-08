/**
 * @fileoverview 外部の AI での読み取り（Claude Vision）の確認と分岐の文言（estimate-request のタスク119.1）
 *
 * 部品のファイルから定数を出すと Fast Refresh が効かなくなるため、`VisionConsentDialog` と
 * `OcrDataExtractor` が使う文言はこのファイルに置く（先例 `received-quotation-form-messages.ts`）。
 * 停止と利用者の上限の文言は受入基準の逐語のとおりにする。
 *
 * 根拠: design の「Requirements 43-50」の章の D7 と「外部の AI での読み取りの分岐」の流れ（24.2, 49.1, 49.2, 49.3,
 * 49.4, 49.6, 49.8）
 */

/** 送る前の確認の画面の文言（49.1） */
export const VISION_CONSENT_MESSAGES = {
  TITLE: '外部のAIでの読み取りの確認',
  NOTICE:
    'ページの画像を外部のAIサービス（Anthropic社のClaude）へ送って読み取ります。送らずに、この端末で読み取ることもできます。',
  /** 外部の AI へ送って読み取る（49.1） */
  SEND: '送って読み取る',
  /** 外部へ送らずに端末の OCR で読み取る（49.2） */
  DEVICE: '送らずに端末で読み取る',
  /** どちらも選ばずに閉じる（49.3。Escape も同じ） */
  CLOSE: '閉じる',
} as const;

/**
 * 端末で読み取るときに、外部へ送らなかった・送れなかった理由として画面に出す知らせ（49.4・49.8）
 */
export const VISION_READING_NOTICES = {
  /** 管理者が外部の AI での読み取りを止めている（49.4） */
  DISABLED_BY_ADMIN: '外部のAIでの読み取りはシステム管理者により停止されています',
  /** 利用者ごとの回数の上限を超えた（49.8） */
  USER_RATE_LIMITED:
    '外部のAIでの読み取りの回数の上限に達したため、端末で読み取りました。しばらく待ってから再度お試しください',
} as const;

/**
 * 確認を出さずに端末で読み取るときの、従来の切り替えの知らせ（Requirement 25.4）に添える理由
 *
 * - NO_PERMISSION: 専用の権限が無い（49.6）
 * - NOT_CONFIGURED: 外部の AI の鍵が設定されていない
 * - STATUS_UNAVAILABLE: 状態の取得に失敗した。送ってよいか分からないため送らない側に倒す
 */
export const VISION_FALLBACK_REASONS = {
  NO_PERMISSION: '外部のAIでの読み取りの権限がありません',
  NOT_CONFIGURED: '外部のAIでの読み取りが設定されていません',
  STATUS_UNAVAILABLE: '外部のAIでの読み取りの状態を確認できませんでした',
} as const;
