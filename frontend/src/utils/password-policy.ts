/**
 * パスワードの規則（user-authentication 要件2.5・2.6）
 *
 * 画面での事前の確認は backend の `PasswordService.validatePasswordStrength` の長さと複雑性の判定、
 * `auth.routes.ts` の `getPasswordViolationMessage` の文言と一致させる。画面が backend より厳しい規則
 * （4種類全ての文字種の要求・同じ文字の連続の禁止）を課すと、要件と backend が受け付けるパスワードを
 * 画面だけが拒むため、それらは課さない。
 *
 * 漏洩パスワード（要件2.7）・利用者の情報の含有（要件2.8）・履歴（要件7.7）は backend だけが判定する。
 */

import type { PasswordRequirements } from '../types/auth.types';

/** 最小文字数（要件2.5。backend の SECURITY_CONFIG.PASSWORD.MIN_LENGTH と同じ値） */
export const PASSWORD_MIN_LENGTH = 12;

/** 含めるべき文字種の数（要件2.6。backend の PasswordService.MIN_CHAR_TYPES と同じ値） */
export const PASSWORD_MIN_CHARACTER_TYPES = 3;

/** 記号（backend と同じく英数字以外の全ての文字） */
const SPECIAL_CHARACTER_PATTERN = /[^a-zA-Z0-9]/;

/**
 * パスワードの要件の達成状況（パスワードの要件のチェックリストの表示に使う）
 */
export function getPasswordRequirements(password: string): PasswordRequirements {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = SPECIAL_CHARACTER_PATTERN.test(password);
  const characterTypes = [hasUppercase, hasLowercase, hasNumber, hasSpecialChar].filter(
    Boolean
  ).length;

  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    complexity: characterTypes >= PASSWORD_MIN_CHARACTER_TYPES,
  };
}

/**
 * 長さと複雑性の規則に反する点の文言（backend の getPasswordViolationMessage と同じ文言・順序）
 *
 * 文字種が3種類に満たないときだけ、足りない文字種を全て挙げる
 */
export function getPasswordPolicyViolations(password: string): string[] {
  const requirements = getPasswordRequirements(password);
  const violations: string[] = [];

  if (!requirements.minLength) {
    violations.push(`パスワードは${PASSWORD_MIN_LENGTH}文字以上である必要があります`);
  }
  if (!requirements.complexity) {
    if (!requirements.hasUppercase) {
      violations.push('パスワードは大文字を1文字以上含む必要があります');
    }
    if (!requirements.hasLowercase) {
      violations.push('パスワードは小文字を1文字以上含む必要があります');
    }
    if (!requirements.hasNumber) {
      violations.push('パスワードは数字を1文字以上含む必要があります');
    }
    if (!requirements.hasSpecialChar) {
      violations.push('パスワードは記号を1文字以上含む必要があります');
    }
  }

  return violations;
}

/**
 * 長さと複雑性の規則に反するときの表示の文言（backend と同じく `; ` でつなぐ）。反しなければ null
 */
export function getPasswordPolicyError(password: string): string | null {
  const violations = getPasswordPolicyViolations(password);
  return violations.length > 0 ? violations.join('; ') : null;
}
