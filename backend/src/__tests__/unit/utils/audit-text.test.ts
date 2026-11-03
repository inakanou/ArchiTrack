/**
 * @fileoverview 監査に書く文字列の切り詰め（boundAuditText）の単体テスト
 *
 * 上限以下はそのまま、上限を超えると上限までに切り詰めて truncated を立て、
 * 末尾でサロゲートの対を分けないことを確かめる。
 */

import { describe, it, expect } from 'vitest';
import {
  AUDIT_IP_ADDRESS_MAX_LENGTH,
  AUDIT_USER_AGENT_MAX_LENGTH,
  boundAuditText,
} from '../../../utils/audit-text.js';

describe('boundAuditText', () => {
  it('上限ちょうどまではそのまま返し、truncated を立てない', () => {
    expect(boundAuditText('abcde', 5)).toEqual({ value: 'abcde', truncated: false });
    expect(boundAuditText('', 5)).toEqual({ value: '', truncated: false });
  });

  it('上限を超えると上限までに切り詰め、truncated を立てる', () => {
    expect(boundAuditText('abcdef', 5)).toEqual({ value: 'abcde', truncated: true });
  });

  it('切り詰めの末尾が上位サロゲートになるときは、その一文字ぶんを落として対を分けない', () => {
    // '😀' は UTF-16 で 2 単位（😀）。上限 3 で切ると 3 単位目が上位サロゲートになる
    const result = boundAuditText('ab😀c', 3);

    expect(result).toEqual({ value: 'ab', truncated: true });
    expect(result.value.length).toBe(2);
  });

  it('切り詰めの末尾が下位サロゲート（対の後半）なら、対を保ったまま上限で切る', () => {
    expect(boundAuditText('a😀bc', 3)).toEqual({ value: 'a😀', truncated: true });
  });

  it('上位サロゲートより大きい単位（下位サロゲートや通常の文字）では末尾を落とさない', () => {
    // '' は私用領域の文字で、上位サロゲートの範囲（0xD800〜0xDBFF）の外
    expect(boundAuditText('abcd', 3)).toEqual({ value: 'ab', truncated: true });
  });

  it('ユーザーエージェントと送信元 IP の上限を持つ', () => {
    expect(AUDIT_USER_AGENT_MAX_LENGTH).toBe(512);
    expect(AUDIT_IP_ADDRESS_MAX_LENGTH).toBe(64);
  });
});
