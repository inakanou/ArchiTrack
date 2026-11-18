/**
 * パスワードの規則のテスト（user-authentication 要件2.5・2.6）
 *
 * 画面の規則は backend の PasswordService.validatePasswordStrength（長さ・複雑性）と
 * auth.routes.ts の getPasswordViolationMessage の文言に一致させる
 */

import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_CHARACTER_TYPES,
  PASSWORD_MIN_LENGTH,
  getPasswordPolicyError,
  getPasswordPolicyViolations,
  getPasswordRequirements,
} from './password-policy';

describe('password-policy', () => {
  it('最小文字数は12、含めるべき文字種の数は3とする（要件2.5・2.6）', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MIN_CHARACTER_TYPES).toBe(3);
  });

  describe('getPasswordRequirements', () => {
    it('11文字は長さの要件を満たさず、12文字は満たす（要件2.5）', () => {
      expect(getPasswordRequirements('Abcdefghij1').minLength).toBe(false);
      expect(getPasswordRequirements('Abcdefghij1!').minLength).toBe(true);
    });

    it('英数字以外の全ての文字を記号と数える（backend の /[^a-zA-Z0-9]/ と同じ）', () => {
      for (const symbol of ['!', '~', '_', '-', ' ', '`', '\\', 'あ']) {
        expect(getPasswordRequirements(`abc${symbol}`).hasSpecialChar).toBe(true);
      }
      expect(getPasswordRequirements('Abc123').hasSpecialChar).toBe(false);
    });

    it.each([
      ['大文字・小文字・数字', 'Abcdefghij12', true],
      ['大文字・小文字・記号', 'Abcdefghij!!', true],
      ['大文字・数字・記号', 'ABCDEFGHI12!', true],
      ['小文字・数字・記号', 'abcdefghi12!', true],
      ['4種類', 'Abcdefghi12!', true],
      ['小文字・数字', 'abcdefghij12', false],
      ['大文字・小文字', 'Abcdefghijkl', false],
      ['記号だけ', '!!!!!!!!!!!!', false],
    ])('%s の文字種の要件は %s（3種類以上で満たす。要件2.6）', (_, password, expected) => {
      expect(getPasswordRequirements(password).complexity).toBe(expected);
    });
  });

  describe('getPasswordPolicyViolations / getPasswordPolicyError', () => {
    it('長さと文字種の要件を満たせば違反は無い（同じ文字の連続も拒まない）', () => {
      expect(getPasswordPolicyViolations('Newwwwpass123')).toEqual([]);
      expect(getPasswordPolicyViolations('aaaaaaaaaa1!')).toEqual([]);
      expect(getPasswordPolicyError('lowercaseonly1~')).toBeNull();
    });

    it('文字種が3種類以上なら、欠けている文字種があっても文字種の違反を挙げない', () => {
      expect(getPasswordPolicyViolations('Lowercaseonly12')).toEqual([]);
    });

    it('文字種が3種類に満たないとき、足りない文字種を backend と同じ順に全て挙げる', () => {
      expect(getPasswordPolicyViolations('abcdefghij12')).toEqual([
        'パスワードは大文字を1文字以上含む必要があります',
        'パスワードは記号を1文字以上含む必要があります',
      ]);
      expect(getPasswordPolicyViolations('ABCDEFGHIJ!!')).toEqual([
        'パスワードは小文字を1文字以上含む必要があります',
        'パスワードは数字を1文字以上含む必要があります',
      ]);
    });

    it('短く文字種も足りないときは、長さの違反を先に挙げ、文言を `; ` でつなぐ', () => {
      expect(getPasswordPolicyError('abc')).toBe(
        [
          'パスワードは12文字以上である必要があります',
          'パスワードは大文字を1文字以上含む必要があります',
          'パスワードは数字を1文字以上含む必要があります',
          'パスワードは記号を1文字以上含む必要があります',
        ].join('; ')
      );
    });

    it('文字種を満たし短いだけなら、長さの違反だけを挙げる', () => {
      expect(getPasswordPolicyError('Short1!A')).toBe('パスワードは12文字以上である必要があります');
    });
  });
});
