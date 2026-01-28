/**
 * @fileoverview 自社情報スキーマのユニットテスト
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
  updateCompanyInfoSchema,
  COMPANY_INFO_VALIDATION_MESSAGES,
  PHONE_FAX_REGEX,
  INVOICE_REGISTRATION_NUMBER_REGEX,
} from '../../../schemas/company-info.schema.js';

/**
 * エラーメッセージを安全に取得するヘルパー関数
 * TypeScript型安全性を確保しながらZodエラーメッセージにアクセス
 */
function getFirstErrorMessage(result: {
  success: false;
  error: { issues: { message: string }[] };
}): string {
  const firstIssue = result.error.issues[0];
  return firstIssue ? firstIssue.message : '';
}

describe('updateCompanyInfoSchema', () => {
  // 有効なデータのテンプレート
  const validData = {
    companyName: 'テスト株式会社',
    address: '東京都渋谷区1-2-3',
    representative: '山田太郎',
  };

  describe('必須フィールドのバリデーション', () => {
    it('有効なデータでバリデーションが成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('companyNameが空の場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        companyName: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_REQUIRED
        );
      }
    });

    it('companyNameがundefinedの場合エラーになること', () => {
      const { companyName: _, ...dataWithoutCompanyName } = validData;
      void _; // unused variable warning suppression
      const result = updateCompanyInfoSchema.safeParse(dataWithoutCompanyName);
      expect(result.success).toBe(false);
    });

    it('addressが空の場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        address: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_REQUIRED
        );
      }
    });

    it('addressがundefinedの場合エラーになること', () => {
      const { address: _, ...dataWithoutAddress } = validData;
      void _; // unused variable warning suppression
      const result = updateCompanyInfoSchema.safeParse(dataWithoutAddress);
      expect(result.success).toBe(false);
    });

    it('representativeが空の場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        representative: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_REQUIRED
        );
      }
    });

    it('representativeがundefinedの場合エラーになること', () => {
      const { representative: _, ...dataWithoutRepresentative } = validData;
      void _; // unused variable warning suppression
      const result = updateCompanyInfoSchema.safeParse(dataWithoutRepresentative);
      expect(result.success).toBe(false);
    });
  });

  describe('文字数制限のバリデーション', () => {
    // Requirements 4.1: 会社名最大200文字
    it('companyNameが200文字を超える場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        companyName: 'あ'.repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.COMPANY_NAME_TOO_LONG
        );
      }
    });

    it('companyNameが200文字以内の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        companyName: 'あ'.repeat(200),
      });
      expect(result.success).toBe(true);
    });

    // Requirements 4.2: 住所最大500文字
    it('addressが500文字を超える場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        address: 'あ'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.ADDRESS_TOO_LONG
        );
      }
    });

    it('addressが500文字以内の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        address: 'あ'.repeat(500),
      });
      expect(result.success).toBe(true);
    });

    // Requirements 4.3: 代表者名最大100文字
    it('representativeが100文字を超える場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        representative: 'あ'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.REPRESENTATIVE_TOO_LONG
        );
      }
    });

    it('representativeが100文字以内の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        representative: 'あ'.repeat(100),
      });
      expect(result.success).toBe(true);
    });

    // Requirements 4.4: 電話番号最大20文字
    it('phoneが20文字を超える場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '0'.repeat(21),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_TOO_LONG);
      }
    });

    it('phoneが20文字以内の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '0'.repeat(20),
      });
      expect(result.success).toBe(true);
    });

    // Requirements 4.5: FAX番号最大20文字
    it('faxが20文字を超える場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        fax: '0'.repeat(21),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.FAX_TOO_LONG);
      }
    });

    it('faxが20文字以内の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        fax: '0'.repeat(20),
      });
      expect(result.success).toBe(true);
    });

    // Requirements 4.8: メールアドレス最大254文字
    it('emailが254文字を超える場合エラーになること', () => {
      // 255文字以上: 246 (local) + 1 (@) + 8 (test.com) = 255文字
      const longLocalPart = 'a'.repeat(246);
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: `${longLocalPart}@test.com`,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_TOO_LONG);
      }
    });

    it('emailが254文字以内の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: 'test@example.com',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('電話番号・FAX番号の形式バリデーション', () => {
    // Requirements 4.4: 電話番号形式
    it('有効な電話番号形式（ハイフン区切り）を受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '03-1234-5678',
      });
      expect(result.success).toBe(true);
    });

    it('有効な電話番号形式（括弧使用）を受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '(03)1234-5678',
      });
      expect(result.success).toBe(true);
    });

    it('有効な電話番号形式（数字のみ）を受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '0312345678',
      });
      expect(result.success).toBe(true);
    });

    it('無効な電話番号形式（英字を含む）を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '03-1234-ABCD',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_INVALID);
      }
    });

    it('無効な電話番号形式（特殊文字を含む）を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '03@1234#5678',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.PHONE_INVALID);
      }
    });

    // Requirements 4.5: FAX番号形式
    it('FAX番号も同様のバリデーションが適用されること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        fax: '03-1234-5678',
      });
      expect(result.success).toBe(true);
    });

    it('無効なFAX番号形式を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        fax: 'invalid-fax',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.FAX_INVALID);
      }
    });

    it('電話番号が空文字の場合は成功すること（任意項目）', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: '',
      });
      expect(result.success).toBe(true);
    });

    it('FAX番号が空文字の場合は成功すること（任意項目）', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        fax: '',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('メールアドレス形式のバリデーション', () => {
    // Requirements 4.6, 4.7: メールアドレス形式
    it('有効なメールアドレスを受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: 'test@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('サブドメイン付きのメールアドレスを受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: 'test@mail.example.co.jp',
      });
      expect(result.success).toBe(true);
    });

    it('無効なメールアドレス（@なし）を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        // Requirements 4.7: 「有効なメールアドレスを入力してください」
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_INVALID);
      }
    });

    it('無効なメールアドレス（ドメインなし）を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: 'test@',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.EMAIL_INVALID);
      }
    });

    it('メールアドレスが空文字の場合は成功すること（任意項目）', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: '',
      });
      expect(result.success).toBe(true);
    });

    it('メールアドレスがnullの場合は成功すること（任意項目）', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        email: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('適格請求書発行事業者登録番号のバリデーション', () => {
    // Requirements 4.9, 4.10: T + 13桁数字形式
    it('有効な適格請求書発行事業者登録番号を受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: 'T1234567890123',
      });
      expect(result.success).toBe(true);
    });

    it('T + 13桁の数字のみを受け入れること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: 'T0000000000000',
      });
      expect(result.success).toBe(true);
    });

    it('Tで始まらない番号を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: '1234567890123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        // Requirements 4.10: 適格請求書発行事業者登録番号は「T」+ 13桁の数字で入力してください
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('小文字tで始まる番号を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: 't1234567890123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('13桁未満の番号を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: 'T123456789012',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('13桁を超える番号を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: 'T12345678901234',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('数字以外の文字を含む番号を拒否すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: 'T123456789012A',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          COMPANY_INFO_VALIDATION_MESSAGES.INVOICE_REGISTRATION_NUMBER_INVALID
        );
      }
    });

    it('適格請求書発行事業者登録番号が空文字の場合は成功すること（任意項目）', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: '',
      });
      expect(result.success).toBe(true);
    });

    it('適格請求書発行事業者登録番号がnullの場合は成功すること（任意項目）', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        invoiceRegistrationNumber: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('versionフィールドのバリデーション', () => {
    it('versionが0の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        version: 0,
      });
      expect(result.success).toBe(true);
    });

    it('versionが正の整数の場合成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        version: 5,
      });
      expect(result.success).toBe(true);
    });

    it('versionが負の数の場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        version: -1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(COMPANY_INFO_VALIDATION_MESSAGES.VERSION_INVALID);
      }
    });

    it('versionが小数の場合エラーになること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        version: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('versionが未指定の場合成功すること（オプショナル）', () => {
      const result = updateCompanyInfoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('任意フィールドのバリデーション', () => {
    it('すべての任意フィールドがnullでも成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse({
        ...validData,
        phone: null,
        fax: null,
        email: null,
        invoiceRegistrationNumber: null,
      });
      expect(result.success).toBe(true);
    });

    it('すべての任意フィールドが未指定でも成功すること', () => {
      const result = updateCompanyInfoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('すべてのフィールドが有効な値で成功すること', () => {
      const fullData = {
        companyName: 'テスト株式会社',
        address: '東京都渋谷区1-2-3',
        representative: '山田太郎',
        phone: '03-1234-5678',
        fax: '03-1234-5679',
        email: 'contact@test.co.jp',
        invoiceRegistrationNumber: 'T1234567890123',
        version: 1,
      };
      const result = updateCompanyInfoSchema.safeParse(fullData);
      expect(result.success).toBe(true);
    });
  });
});

describe('電話番号・FAX番号正規表現', () => {
  it('数字のみにマッチすること', () => {
    expect(PHONE_FAX_REGEX.test('0312345678')).toBe(true);
  });

  it('ハイフン区切りにマッチすること', () => {
    expect(PHONE_FAX_REGEX.test('03-1234-5678')).toBe(true);
  });

  it('括弧使用にマッチすること', () => {
    expect(PHONE_FAX_REGEX.test('(03)1234-5678')).toBe(true);
  });

  it('英字を含む文字列にマッチしないこと', () => {
    expect(PHONE_FAX_REGEX.test('03-ABCD-5678')).toBe(false);
  });

  it('特殊文字を含む文字列にマッチしないこと', () => {
    expect(PHONE_FAX_REGEX.test('03@1234#5678')).toBe(false);
  });

  it('空文字列にマッチしないこと', () => {
    expect(PHONE_FAX_REGEX.test('')).toBe(false);
  });
});

describe('適格請求書発行事業者登録番号正規表現', () => {
  it('T + 13桁数字にマッチすること', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T1234567890123')).toBe(true);
  });

  it('すべて0でもマッチすること', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T0000000000000')).toBe(true);
  });

  it('Tで始まらない文字列にマッチしないこと', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('1234567890123')).toBe(false);
  });

  it('小文字tで始まる文字列にマッチしないこと', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('t1234567890123')).toBe(false);
  });

  it('12桁の数字にマッチしないこと', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T123456789012')).toBe(false);
  });

  it('14桁の数字にマッチしないこと', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T12345678901234')).toBe(false);
  });

  it('数字以外の文字を含む場合マッチしないこと', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('T123456789012A')).toBe(false);
  });

  it('空文字列にマッチしないこと', () => {
    expect(INVOICE_REGISTRATION_NUMBER_REGEX.test('')).toBe(false);
  });
});
