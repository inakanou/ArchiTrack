/**
 * @fileoverview 取引先スキーマのユニットテスト
 *
 * Requirements:
 * - 2.2, 2.3, 2.4, 2.5, 2.6: 必須・任意項目のバリデーション
 * - 2.9, 2.10: メールアドレス形式、重複エラー
 * - 11.1-11.13: 各フィールドの文字数制限・形式バリデーション
 */

import { describe, it, expect } from 'vitest';
import {
  createTradingPartnerSchema,
  TRADING_PARTNER_VALIDATION_MESSAGES,
  KATAKANA_REGEX,
  PHONE_FAX_REGEX,
  BILLING_CLOSING_DAY_END_OF_MONTH,
  PAYMENT_DAY_END_OF_MONTH,
} from '../../../schemas/trading-partner.schema.js';

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

describe('createTradingPartnerSchema', () => {
  // 有効なデータのテンプレート
  const validData = {
    name: 'テスト株式会社',
    nameKana: 'テストカブシキガイシャ',
    types: ['CUSTOMER'],
    address: '東京都渋谷区1-2-3',
  };

  describe('必須フィールドのバリデーション', () => {
    it('有効なデータでバリデーションが成功すること', () => {
      const result = createTradingPartnerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('nameが空の場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        name: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_REQUIRED
        );
      }
    });

    it('nameがundefinedの場合エラーになること', () => {
      const { name: _, ...dataWithoutName } = validData;
      void _; // unused variable warning suppression
      const result = createTradingPartnerSchema.safeParse(dataWithoutName);
      expect(result.success).toBe(false);
    });

    it('nameKanaが空の場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_REQUIRED
        );
      }
    });

    it('typesが空配列の場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        types: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.TYPES_REQUIRED
        );
      }
    });

    it('addressが空の場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        address: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_REQUIRED
        );
      }
    });
  });

  describe('文字数制限のバリデーション', () => {
    it('nameが200文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        name: 'あ'.repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_TOO_LONG
        );
      }
    });

    it('nameが200文字以内の場合成功すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        name: 'あ'.repeat(200),
      });
      expect(result.success).toBe(true);
    });

    it('nameKanaが200文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'ア'.repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_TOO_LONG
        );
      }
    });

    it('branchNameが100文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        branchName: 'あ'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_TOO_LONG
        );
      }
    });

    it('branchNameKanaが100文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        branchNameKana: 'ア'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_KANA_TOO_LONG
        );
      }
    });

    it('representativeNameが100文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        representativeName: 'あ'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_TOO_LONG
        );
      }
    });

    it('representativeNameKanaが100文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        representativeNameKana: 'ア'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_KANA_TOO_LONG
        );
      }
    });

    it('addressが500文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        address: 'あ'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_TOO_LONG
        );
      }
    });

    it('notesが2000文字を超える場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        notes: 'あ'.repeat(2001),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NOTES_TOO_LONG
        );
      }
    });
  });

  describe('フリガナのカタカナ制約', () => {
    it('nameKanaがカタカナの場合成功すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'カブシキガイシャテスト',
      });
      expect(result.success).toBe(true);
    });

    it('nameKanaがひらがなを含む場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'かぶしきがいしゃ',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_KATAKANA_ONLY
        );
      }
    });

    it('nameKanaが漢字を含む場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: '株式会社',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_KATAKANA_ONLY
        );
      }
    });

    it('nameKanaが半角カタカナの場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'ｶﾌﾞｼｷｶﾞｲｼｬ',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_KANA_KATAKANA_ONLY
        );
      }
    });

    it('nameKanaがスペースを含む場合成功すること（全角・半角スペースはカタカナ扱い）', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'カブシキ ガイシャ',
      });
      expect(result.success).toBe(true);
    });

    it('nameKanaが中黒（・）を含む場合成功すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'カブシキ・ガイシャ',
      });
      expect(result.success).toBe(true);
    });

    it('nameKanaが長音（ー）を含む場合成功すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        nameKana: 'サービスセンター',
      });
      expect(result.success).toBe(true);
    });

    it('branchNameKanaがひらがなを含む場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        branchNameKana: 'とうきょうしてん',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.BRANCH_NAME_KANA_KATAKANA_ONLY
        );
      }
    });

    it('representativeNameKanaがひらがなを含む場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        representativeNameKana: 'やまだたろう',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.REPRESENTATIVE_NAME_KANA_KATAKANA_ONLY
        );
      }
    });
  });

  describe('種別（types）のバリデーション', () => {
    it('CUSTOMERのみを指定できること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        types: ['CUSTOMER'],
      });
      expect(result.success).toBe(true);
    });

    it('SUBCONTRACTORのみを指定できること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        types: ['SUBCONTRACTOR'],
      });
      expect(result.success).toBe(true);
    });

    it('CUSTOMERとSUBCONTRACTORの両方を指定できること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        types: ['CUSTOMER', 'SUBCONTRACTOR'],
      });
      expect(result.success).toBe(true);
    });

    it('無効な種別を指定した場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        types: ['INVALID_TYPE'],
      });
      expect(result.success).toBe(false);
    });

    it('重複した種別を指定しても成功すること（重複は許容）', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        types: ['CUSTOMER', 'CUSTOMER'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('電話番号・FAX番号の形式バリデーション', () => {
    it('有効な電話番号形式（ハイフン区切り）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        phoneNumber: '03-1234-5678',
      });
      expect(result.success).toBe(true);
    });

    it('有効な電話番号形式（括弧使用）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        phoneNumber: '(03)1234-5678',
      });
      expect(result.success).toBe(true);
    });

    it('有効な電話番号形式（数字のみ）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        phoneNumber: '0312345678',
      });
      expect(result.success).toBe(true);
    });

    it('無効な電話番号形式（英字を含む）を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        phoneNumber: '03-1234-ABCD',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.PHONE_NUMBER_INVALID
        );
      }
    });

    it('無効な電話番号形式（特殊文字を含む）を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        phoneNumber: '03@1234#5678',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.PHONE_NUMBER_INVALID
        );
      }
    });

    it('FAX番号も同様のバリデーションが適用されること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        faxNumber: '03-1234-5678',
      });
      expect(result.success).toBe(true);
    });

    it('無効なFAX番号形式を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        faxNumber: 'invalid-fax',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.FAX_NUMBER_INVALID
        );
      }
    });
  });

  describe('メールアドレス形式のバリデーション', () => {
    it('有効なメールアドレスを受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        email: 'test@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('サブドメイン付きのメールアドレスを受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        email: 'test@mail.example.co.jp',
      });
      expect(result.success).toBe(true);
    });

    it('無効なメールアドレス（@なし）を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.EMAIL_INVALID
        );
      }
    });

    it('無効なメールアドレス（ドメインなし）を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        email: 'test@',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.EMAIL_INVALID
        );
      }
    });
  });

  describe('請求締日のバリデーション', () => {
    it('1日〜31日の値を受け入れること', () => {
      for (let day = 1; day <= 31; day++) {
        const result = createTradingPartnerSchema.safeParse({
          ...validData,
          billingClosingDay: day,
        });
        expect(result.success).toBe(true);
      }
    });

    it('末日（99）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        billingClosingDay: BILLING_CLOSING_DAY_END_OF_MONTH,
      });
      expect(result.success).toBe(true);
    });

    it('0を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        billingClosingDay: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.BILLING_CLOSING_DAY_INVALID
        );
      }
    });

    it('32を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        billingClosingDay: 32,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.BILLING_CLOSING_DAY_INVALID
        );
      }
    });

    it('99以外の無効な値（50）を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        billingClosingDay: 50,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.BILLING_CLOSING_DAY_INVALID
        );
      }
    });
  });

  describe('支払月オフセットのバリデーション', () => {
    it('1（翌月）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentMonthOffset: 1,
      });
      expect(result.success).toBe(true);
    });

    it('2（翌々月）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentMonthOffset: 2,
      });
      expect(result.success).toBe(true);
    });

    it('3（3ヶ月後）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentMonthOffset: 3,
      });
      expect(result.success).toBe(true);
    });

    it('0を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentMonthOffset: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_MONTH_OFFSET_INVALID
        );
      }
    });

    it('4を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentMonthOffset: 4,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_MONTH_OFFSET_INVALID
        );
      }
    });
  });

  describe('支払日のバリデーション', () => {
    it('1日〜31日の値を受け入れること', () => {
      for (let day = 1; day <= 31; day++) {
        const result = createTradingPartnerSchema.safeParse({
          ...validData,
          paymentDay: day,
        });
        expect(result.success).toBe(true);
      }
    });

    it('末日（99）を受け入れること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentDay: PAYMENT_DAY_END_OF_MONTH,
      });
      expect(result.success).toBe(true);
    });

    it('0を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentDay: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_DAY_INVALID
        );
      }
    });

    it('32を拒否すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        paymentDay: 32,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.PAYMENT_DAY_INVALID
        );
      }
    });
  });

  describe('任意フィールドのバリデーション', () => {
    it('すべての任意フィールドがnullでも成功すること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        branchName: null,
        branchNameKana: null,
        representativeName: null,
        representativeNameKana: null,
        phoneNumber: null,
        faxNumber: null,
        email: null,
        billingClosingDay: null,
        paymentMonthOffset: null,
        paymentDay: null,
        notes: null,
      });
      expect(result.success).toBe(true);
    });

    it('すべての任意フィールドが未指定でも成功すること', () => {
      const result = createTradingPartnerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('すべてのフィールドが有効な値で成功すること', () => {
      const fullData = {
        name: 'テスト株式会社',
        nameKana: 'テストカブシキガイシャ',
        types: ['CUSTOMER', 'SUBCONTRACTOR'],
        address: '東京都渋谷区1-2-3',
        branchName: '東京支店',
        branchNameKana: 'トウキョウシテン',
        representativeName: '山田太郎',
        representativeNameKana: 'ヤマダタロウ',
        phoneNumber: '03-1234-5678',
        faxNumber: '03-1234-5679',
        email: 'contact@test.co.jp',
        billingClosingDay: 31,
        paymentMonthOffset: 1,
        paymentDay: 10,
        notes: '備考テキスト',
      };
      const result = createTradingPartnerSchema.safeParse(fullData);
      expect(result.success).toBe(true);
    });
  });

  describe('空白トリムのバリデーション', () => {
    it('nameが空白のみの場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        name: '   ',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.NAME_REQUIRED
        );
      }
    });

    it('addressが空白のみの場合エラーになること', () => {
      const result = createTradingPartnerSchema.safeParse({
        ...validData,
        address: '   ',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getFirstErrorMessage(result)).toBe(
          TRADING_PARTNER_VALIDATION_MESSAGES.ADDRESS_REQUIRED
        );
      }
    });
  });
});

describe('カタカナ正規表現', () => {
  it('全角カタカナにマッチすること', () => {
    expect(KATAKANA_REGEX.test('アイウエオ')).toBe(true);
    expect(KATAKANA_REGEX.test('カタカナテスト')).toBe(true);
  });

  it('長音符（ー）を含む文字列にマッチすること', () => {
    expect(KATAKANA_REGEX.test('サービスセンター')).toBe(true);
  });

  it('中黒（・）を含む文字列にマッチすること', () => {
    expect(KATAKANA_REGEX.test('カブシキ・ガイシャ')).toBe(true);
  });

  it('全角スペースを含む文字列にマッチすること', () => {
    expect(KATAKANA_REGEX.test('カブシキ　ガイシャ')).toBe(true);
  });

  it('半角スペースを含む文字列にマッチすること', () => {
    expect(KATAKANA_REGEX.test('カブシキ ガイシャ')).toBe(true);
  });

  it('ひらがなを含む文字列にマッチしないこと', () => {
    expect(KATAKANA_REGEX.test('かたかな')).toBe(false);
  });

  it('漢字を含む文字列にマッチしないこと', () => {
    expect(KATAKANA_REGEX.test('株式会社')).toBe(false);
  });

  it('半角カタカナを含む文字列にマッチしないこと', () => {
    expect(KATAKANA_REGEX.test('ｶﾀｶﾅ')).toBe(false);
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
});
