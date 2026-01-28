/**
 * @fileoverview 自社情報フロントエンドバリデーションスキーマのユニットテスト
 *
 * Task 5.2: フロントエンドバリデーションスキーマの実装
 *
 * バックエンドと同一のZodスキーマをテストし、フォーム入力時のリアルタイムバリデーションに使用。
 *
 * Requirements:
 * - 4.1: 会社名の最大文字数を200文字に制限
 * - 4.2: 住所の最大文字数を500文字に制限
 * - 4.3: 代表者名の最大文字数を100文字に制限
 * - 4.4: 電話番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）
 * - 4.5: FAX番号の形式バリデーション（数字、ハイフン、括弧のみ許可、最大20文字）
 * - 4.6: メールアドレスが入力されている場合、形式バリデーションを実行
 * - 4.7: メールアドレスの形式が不正な場合、「有効なメールアドレスを入力してください」エラー
 * - 4.8: メールアドレスの最大文字数を254文字に制限
 * - 4.9: 適格請求書発行事業者登録番号の形式バリデーション（T + 13桁の数字）
 * - 4.10: 適格請求書発行事業者登録番号の形式エラー表示
 */

import { describe, it, expect } from 'vitest';
import {
  companyInfoFormSchema,
  COMPANY_INFO_VALIDATION_MESSAGES,
  PHONE_FAX_REGEX,
  INVOICE_REGISTRATION_NUMBER_REGEX,
} from '../../utils/company-info.validation';

describe('Company Info Validation Schema', () => {
  // ============================================================================
  // 正規表現パターンテスト
  // ============================================================================
  describe('PHONE_FAX_REGEX', () => {
    it('数字のみの電話番号を許可する', () => {
      expect(PHONE_FAX_REGEX.test('0312345678')).toBe(true);
    });

    it('ハイフン付きの電話番号を許可する', () => {
      expect(PHONE_FAX_REGEX.test('03-1234-5678')).toBe(true);
    });

    it('括弧付きの電話番号を許可する', () => {
      expect(PHONE_FAX_REGEX.test('(03)1234-5678')).toBe(true);
    });

    it('アルファベットを含む電話番号を拒否する', () => {
      expect(PHONE_FAX_REGEX.test('03-1234-567a')).toBe(false);
    });

    it('空白を含む電話番号を拒否する', () => {
      expect(PHONE_FAX_REGEX.test('03 1234 5678')).toBe(false);
    });
  });

  describe('INVOICE_REGISTRATION_NUMBER_REGEX', () => {
    it('正しい形式（T+13桁数字）を許可する', () => {
      expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T1234567890123')).toBe(true);
    });

    it('Tで始まらない番号を拒否する', () => {
      expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('1234567890123')).toBe(false);
    });

    it('数字が12桁の番号を拒否する', () => {
      expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T123456789012')).toBe(false);
    });

    it('数字が14桁の番号を拒否する', () => {
      expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T12345678901234')).toBe(false);
    });

    it('小文字tで始まる番号を拒否する', () => {
      expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('t1234567890123')).toBe(false);
    });
  });

  // ============================================================================
  // 必須フィールドテスト
  // ============================================================================
  describe('Required Fields', () => {
    const validInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '代表 太郎',
      phone: '',
      fax: '',
      email: '',
      invoiceRegistrationNumber: '',
    };

    it('全ての必須フィールドが入力されていればバリデーション成功', () => {
      const result = companyInfoFormSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('会社名が空の場合バリデーション失敗 (Requirement 4.1)', () => {
      const input = { ...validInput, companyName: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.companyName).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_REQUIRED
        );
      }
    });

    it('住所が空の場合バリデーション失敗 (Requirement 4.2)', () => {
      const input = { ...validInput, address: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.address).toContain(COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_REQUIRED);
      }
    });

    it('代表者が空の場合バリデーション失敗 (Requirement 4.3)', () => {
      const input = { ...validInput, representative: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.representative).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_REQUIRED
        );
      }
    });
  });

  // ============================================================================
  // 文字数制限テスト
  // ============================================================================
  describe('Max Length Validation', () => {
    const validInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '代表 太郎',
      phone: '',
      fax: '',
      email: '',
      invoiceRegistrationNumber: '',
    };

    it('会社名が200文字以内ならバリデーション成功 (Requirement 4.1)', () => {
      const input = { ...validInput, companyName: 'a'.repeat(200) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('会社名が201文字以上ならバリデーション失敗 (Requirement 4.1)', () => {
      const input = { ...validInput, companyName: 'a'.repeat(201) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.companyName).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_TOO_LONG
        );
      }
    });

    it('住所が500文字以内ならバリデーション成功 (Requirement 4.2)', () => {
      const input = { ...validInput, address: 'a'.repeat(500) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('住所が501文字以上ならバリデーション失敗 (Requirement 4.2)', () => {
      const input = { ...validInput, address: 'a'.repeat(501) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.address).toContain(COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_TOO_LONG);
      }
    });

    it('代表者が100文字以内ならバリデーション成功 (Requirement 4.3)', () => {
      const input = { ...validInput, representative: 'a'.repeat(100) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('代表者が101文字以上ならバリデーション失敗 (Requirement 4.3)', () => {
      const input = { ...validInput, representative: 'a'.repeat(101) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.representative).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_TOO_LONG
        );
      }
    });
  });

  // ============================================================================
  // 電話番号・FAX番号テスト
  // ============================================================================
  describe('Phone/Fax Validation', () => {
    const validInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '代表 太郎',
      phone: '',
      fax: '',
      email: '',
      invoiceRegistrationNumber: '',
    };

    it('電話番号が空でもバリデーション成功', () => {
      const input = { ...validInput, phone: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('電話番号が正しい形式ならバリデーション成功 (Requirement 4.4)', () => {
      const input = { ...validInput, phone: '03-1234-5678' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('電話番号が不正な形式ならバリデーション失敗 (Requirement 4.4)', () => {
      const input = { ...validInput, phone: '03 1234 5678' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.phone).toContain(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_INVALID);
      }
    });

    it('電話番号が20文字を超えるとバリデーション失敗 (Requirement 4.4)', () => {
      const input = { ...validInput, phone: '0'.repeat(21) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.phone).toContain(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_TOO_LONG);
      }
    });

    it('FAX番号が空でもバリデーション成功', () => {
      const input = { ...validInput, fax: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('FAX番号が正しい形式ならバリデーション成功 (Requirement 4.5)', () => {
      const input = { ...validInput, fax: '03-1234-5679' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('FAX番号が不正な形式ならバリデーション失敗 (Requirement 4.5)', () => {
      const input = { ...validInput, fax: '03 1234 5679' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.fax).toContain(COMPANY_INFO_VALIDATION_MESSAGES.FAX_INVALID);
      }
    });

    it('FAX番号が20文字を超えるとバリデーション失敗 (Requirement 4.5)', () => {
      const input = { ...validInput, fax: '0'.repeat(21) };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.fax).toContain(COMPANY_INFO_VALIDATION_MESSAGES.FAX_TOO_LONG);
      }
    });
  });

  // ============================================================================
  // メールアドレステスト
  // ============================================================================
  describe('Email Validation', () => {
    const validInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '代表 太郎',
      phone: '',
      fax: '',
      email: '',
      invoiceRegistrationNumber: '',
    };

    it('メールアドレスが空でもバリデーション成功 (Requirement 4.6)', () => {
      const input = { ...validInput, email: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('メールアドレスが正しい形式ならバリデーション成功 (Requirement 4.6)', () => {
      const input = { ...validInput, email: 'test@example.com' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('メールアドレスが不正な形式ならバリデーション失敗 (Requirement 4.7)', () => {
      const input = { ...validInput, email: 'invalid-email' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.email).toContain(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_INVALID);
      }
    });

    it('メールアドレスが254文字を超えるとバリデーション失敗 (Requirement 4.8)', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'; // 250 + 12 = 262文字
      const input = { ...validInput, email: longEmail };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.email).toContain(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_TOO_LONG);
      }
    });

    it('メールアドレスが254文字以内ならバリデーション成功 (Requirement 4.8)', () => {
      const exactEmail = 'a'.repeat(240) + '@example.com'; // 240 + 12 = 252文字
      const input = { ...validInput, email: exactEmail };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // 適格請求書発行事業者登録番号テスト
  // ============================================================================
  describe('Invoice Registration Number Validation', () => {
    const validInput = {
      companyName: '株式会社テスト',
      address: '東京都渋谷区1-1-1',
      representative: '代表 太郎',
      phone: '',
      fax: '',
      email: '',
      invoiceRegistrationNumber: '',
    };

    it('適格請求書発行事業者登録番号が空でもバリデーション成功', () => {
      const input = { ...validInput, invoiceRegistrationNumber: '' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('適格請求書発行事業者登録番号が正しい形式ならバリデーション成功 (Requirement 4.9)', () => {
      const input = { ...validInput, invoiceRegistrationNumber: 'T1234567890123' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('適格請求書発行事業者登録番号がTで始まらない場合バリデーション失敗 (Requirement 4.10)', () => {
      const input = { ...validInput, invoiceRegistrationNumber: '1234567890123' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.invoiceRegistrationNumber).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('適格請求書発行事業者登録番号が12桁の場合バリデーション失敗 (Requirement 4.10)', () => {
      const input = { ...validInput, invoiceRegistrationNumber: 'T123456789012' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.invoiceRegistrationNumber).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('適格請求書発行事業者登録番号が14桁の場合バリデーション失敗 (Requirement 4.10)', () => {
      const input = { ...validInput, invoiceRegistrationNumber: 'T12345678901234' };
      const result = companyInfoFormSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors.invoiceRegistrationNumber).toContain(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });
  });

  // ============================================================================
  // バリデーションエラーメッセージテスト
  // ============================================================================
  describe('Validation Messages', () => {
    it('エラーメッセージが日本語で定義されている', () => {
      expect(COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_REQUIRED).toBe('会社名は必須です');
      expect(COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_TOO_LONG).toBe(
        '会社名は200文字以内で入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_REQUIRED).toBe('住所は必須です');
      expect(COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_TOO_LONG).toBe(
        '住所は500文字以内で入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_REQUIRED).toBe('代表者は必須です');
      expect(COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_TOO_LONG).toBe(
        '代表者名は100文字以内で入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_INVALID).toBe(
        '電話番号の形式が不正です（数字、ハイフン、括弧のみ使用可）'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_TOO_LONG).toBe(
        '電話番号は20文字以内で入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.FAX_INVALID).toBe(
        'FAX番号の形式が不正です（数字、ハイフン、括弧のみ使用可）'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.FAX_TOO_LONG).toBe(
        'FAX番号は20文字以内で入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_INVALID).toBe(
        '有効なメールアドレスを入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_TOO_LONG).toBe(
        'メールアドレスは254文字以内で入力してください'
      );
      expect(COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID).toBe(
        '適格請求書発行事業者登録番号は「T」+ 13桁の数字で入力してください'
      );
    });
  });
});
