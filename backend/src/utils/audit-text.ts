/**
 * 監査に書く利用者由来の文字列の長さの上限の適用
 *
 * 認証の監査（user-authentication タスク53.1）とデータ出力の記録（タスク53.3）が共有する。
 *
 * @module utils/audit-text
 */

/** 監査に書くユーザーエージェントの上限 */
export const AUDIT_USER_AGENT_MAX_LENGTH = 512;
/** 監査に書く送信元 IP の上限（`req.ip` は通常この長さに収まる） */
export const AUDIT_IP_ADDRESS_MAX_LENGTH = 64;

/**
 * 利用者が与えた文字列を監査に書ける長さまでに切り詰める
 *
 * 長さに上限の無い入力をそのまま書くと、`target_id` の btree 索引の行の上限（2704 バイト）を超えて記録が
 * 失敗し（記録を逃れられる）、metadata も肥大する。上限は UTF-16 の単位で数え、末尾でサロゲートの対を
 * 分けない（254 文字は 4 バイトの文字でも索引の上限に収まる）。
 */
export function boundAuditText(value: string, max: number): { value: string; truncated: boolean } {
  if (value.length <= max) {
    return { value, truncated: false };
  }
  let bounded = value.slice(0, max);
  const last = bounded.charCodeAt(bounded.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    bounded = bounded.slice(0, -1);
  }
  return { value: bounded, truncated: true };
}
