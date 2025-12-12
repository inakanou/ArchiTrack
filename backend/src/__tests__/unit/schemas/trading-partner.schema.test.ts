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
        representativeName: null,
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
        representativeName: '山田太郎',
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

/**
 * 取引先更新スキーマのテスト
 * Requirements:
 * - 4.2, 4.3, 4.4: 更新時の必須・任意項目バリデーション
 * - 11.1-11.13: 各フィールドの文字数制限・形式バリデーション
 */
describe('updateTradingPartnerSchema', () => {
  // 動的インポートで更新スキーマを取得
  let updateTradingPartnerSchema: typeof import('../../../schemas/trading-partner.schema.js').updateTradingPartnerSchema;

  beforeAll(async () => {
    const module = await import('../../../schemas/trading-partner.schema.js');
    updateTradingPartnerSchema = module.updateTradingPartnerSchema;
  });

  // 有効な更新データのテンプレート
  const validUpdateData = {
    name: '更新テスト株式会社',
    nameKana: 'コウシンテストカブシキガイシャ',
    types: ['CUSTOMER'],
    address: '大阪府大阪市1-2-3',
    expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
  };

  describe('expectedUpdatedAtフィールドのバリデーション', () => {
    it('有効なISO8601形式の日付を受け入れること', () => {
      const result = updateTradingPartnerSchema.safeParse(validUpdateData);
      expect(result.success).toBe(true);
    });

    it('expectedUpdatedAtが必須であること', () => {
      const { expectedUpdatedAt: _, ...dataWithoutExpectedUpdatedAt } = validUpdateData;
      void _; // unused variable warning suppression
      const result = updateTradingPartnerSchema.safeParse(dataWithoutExpectedUpdatedAt);
      expect(result.success).toBe(false);
    });

    it('無効な日付形式を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        ...validUpdateData,
        expectedUpdatedAt: 'invalid-date',
      });
      expect(result.success).toBe(false);
    });

    it('空文字列を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        ...validUpdateData,
        expectedUpdatedAt: '',
      });
      expect(result.success).toBe(false);
    });

    it('日付のみの形式（YYYY-MM-DD）を受け入れること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        ...validUpdateData,
        expectedUpdatedAt: '2025-01-01',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('部分更新の対応', () => {
    it('expectedUpdatedAtのみ指定した場合でも成功すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('nameのみ更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        name: '新しい会社名',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('nameKanaのみ更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        nameKana: 'アタラシイカイシャメイ',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('typesのみ更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        types: ['SUBCONTRACTOR'],
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('addressのみ更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        address: '新しい住所',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('複数フィールドを同時に更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        name: '新しい会社名',
        nameKana: 'アタラシイカイシャメイ',
        phoneNumber: '06-1234-5678',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('更新時の必須フィールドバリデーション', () => {
    it('nameが空の場合エラーになること（部分更新でnameを指定した場合）', () => {
      const result = updateTradingPartnerSchema.safeParse({
        name: '',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('nameKanaが空の場合エラーになること（部分更新でnameKanaを指定した場合）', () => {
      const result = updateTradingPartnerSchema.safeParse({
        nameKana: '',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('typesが空配列の場合エラーになること（部分更新でtypesを指定した場合）', () => {
      const result = updateTradingPartnerSchema.safeParse({
        types: [],
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('addressが空の場合エラーになること（部分更新でaddressを指定した場合）', () => {
      const result = updateTradingPartnerSchema.safeParse({
        address: '',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('更新時の文字数制限バリデーション', () => {
    it('nameが200文字を超える場合エラーになること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        name: 'あ'.repeat(201),
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('nameKanaが200文字を超える場合エラーになること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        nameKana: 'ア'.repeat(201),
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('branchNameが100文字を超える場合エラーになること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        branchName: 'あ'.repeat(101),
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('addressが500文字を超える場合エラーになること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        address: 'あ'.repeat(501),
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('notesが2000文字を超える場合エラーになること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        notes: 'あ'.repeat(2001),
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('更新時のフリガナカタカナ制約', () => {
    it('nameKanaがカタカナの場合成功すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        nameKana: 'コウシンテスト',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('nameKanaがひらがなを含む場合エラーになること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        nameKana: 'こうしんてすと',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('更新時の種別バリデーション', () => {
    it('CUSTOMERに更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        types: ['CUSTOMER'],
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('SUBCONTRACTORに更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        types: ['SUBCONTRACTOR'],
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('CUSTOMERとSUBCONTRACTORの両方に更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        types: ['CUSTOMER', 'SUBCONTRACTOR'],
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効な種別を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        types: ['INVALID_TYPE'],
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('更新時の電話番号・FAX番号バリデーション', () => {
    it('有効な電話番号形式を受け入れること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        phoneNumber: '06-1234-5678',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効な電話番号形式を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        phoneNumber: 'invalid-phone',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('有効なFAX番号形式を受け入れること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        faxNumber: '06-1234-5679',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効なFAX番号形式を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        faxNumber: 'abc-defg-hijk',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('更新時のメールアドレスバリデーション', () => {
    it('有効なメールアドレスを受け入れること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        email: 'update@example.com',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効なメールアドレスを拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        email: 'invalid-email',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('更新時の請求締日・支払日バリデーション', () => {
    it('請求締日を1〜31で更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        billingClosingDay: 25,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('請求締日を末日（99）で更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        billingClosingDay: 99,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効な請求締日を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        billingClosingDay: 50,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('支払月オフセットを1〜3で更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        paymentMonthOffset: 2,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効な支払月オフセットを拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        paymentMonthOffset: 5,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('支払日を1〜31で更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        paymentDay: 15,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('支払日を末日（99）で更新できること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        paymentDay: 99,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('無効な支払日を拒否すること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        paymentDay: 40,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('任意フィールドのnullクリア', () => {
    it('branchNameをnullでクリアできること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        branchName: null,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('phoneNumberをnullでクリアできること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        phoneNumber: null,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('emailをnullでクリアできること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        email: null,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('billingClosingDayをnullでクリアできること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        billingClosingDay: null,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('notesをnullでクリアできること', () => {
      const result = updateTradingPartnerSchema.safeParse({
        notes: null,
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('全フィールド更新', () => {
    it('すべてのフィールドを同時に更新できること', () => {
      const fullUpdateData = {
        name: '更新後株式会社',
        nameKana: 'コウシンゴカブシキガイシャ',
        types: ['CUSTOMER', 'SUBCONTRACTOR'],
        address: '大阪府大阪市中央区1-2-3',
        branchName: '大阪支店',
        representativeName: '田中一郎',
        phoneNumber: '06-1234-5678',
        faxNumber: '06-1234-5679',
        email: 'updated@example.co.jp',
        billingClosingDay: 25,
        paymentMonthOffset: 2,
        paymentDay: 10,
        notes: '更新後の備考',
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
      };
      const result = updateTradingPartnerSchema.safeParse(fullUpdateData);
      expect(result.success).toBe(true);
    });
  });
});

/**
 * 取引先一覧取得クエリスキーマのテスト
 * Requirements:
 * - 1.3: 検索キーワードによる部分一致検索
 * - 1.4: 種別フィルタリング
 * - 1.5: ページネーション
 * - 1.6: ソート条件
 */
describe('tradingPartnerListQuerySchema', () => {
  // 動的インポートで一覧取得クエリスキーマを取得
  let tradingPartnerListQuerySchema: typeof import('../../../schemas/trading-partner.schema.js').tradingPartnerListQuerySchema;
  let TRADING_PARTNER_LIST_VALIDATION_MESSAGES: typeof import('../../../schemas/trading-partner.schema.js').TRADING_PARTNER_LIST_VALIDATION_MESSAGES;

  beforeAll(async () => {
    const module = await import('../../../schemas/trading-partner.schema.js');
    tradingPartnerListQuerySchema = module.tradingPartnerListQuerySchema;
    TRADING_PARTNER_LIST_VALIDATION_MESSAGES = module.TRADING_PARTNER_LIST_VALIDATION_MESSAGES;
  });

  describe('ページネーションパラメータのバリデーション', () => {
    it('pageとlimitが指定されていない場合、デフォルト値が適用されること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('pageが1以上の場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ page: '1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
      }
    });

    it('pageが0の場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ page: '0' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_LIST_VALIDATION_MESSAGES.PAGE_MIN);
      }
    });

    it('pageが負の数の場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ page: '-1' });
      expect(result.success).toBe(false);
    });

    it('limitが1以上100以下の場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('limitが0の場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ limit: '0' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_LIST_VALIDATION_MESSAGES.LIMIT_MIN);
      }
    });

    it('limitが100を超える場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ limit: '101' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_LIST_VALIDATION_MESSAGES.LIMIT_MAX);
      }
    });

    it('pageとlimitが数値文字列として渡された場合、数値に変換されること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ page: '3', limit: '25' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
        expect(result.data.limit).toBe(25);
      }
    });
  });

  describe('検索キーワードのバリデーション', () => {
    it('searchが未指定の場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('searchが1文字以上の場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ search: 'テ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('テ');
      }
    });

    it('searchが複数文字の場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ search: 'テスト会社' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('テスト会社');
      }
    });

    it('searchが空文字の場合、undefinedとして扱われること', () => {
      // 空文字はオプショナルな検索条件として無視
      const result = tradingPartnerListQuerySchema.safeParse({ search: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('種別フィルターのバリデーション', () => {
    it('typeが未指定の場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('typeがCUSTOMERの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ type: 'CUSTOMER' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('CUSTOMER');
      }
    });

    it('typeがSUBCONTRACTORの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ type: 'SUBCONTRACTOR' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('SUBCONTRACTOR');
      }
    });

    it('typeが無効な値の場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ type: 'INVALID' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_LIST_VALIDATION_MESSAGES.TYPE_INVALID);
      }
    });
  });

  describe('ソート条件のバリデーション', () => {
    it('sortとorderが未指定の場合、デフォルト値が適用されること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        // Requirements 1.8: フリガナ昇順がデフォルト
        expect(result.data.sort).toBe('nameKana');
        expect(result.data.order).toBe('asc');
      }
    });

    it('sortがnameKanaの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ sort: 'nameKana' });
      expect(result.success).toBe(true);
    });

    it('sortがnameの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ sort: 'name' });
      expect(result.success).toBe(true);
    });

    it('sortがcreatedAtの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ sort: 'createdAt' });
      expect(result.success).toBe(true);
    });

    it('sortが無効なフィールドの場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ sort: 'invalidField' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(
          TRADING_PARTNER_LIST_VALIDATION_MESSAGES.SORT_FIELD_INVALID
        );
      }
    });

    it('orderがascの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ order: 'asc' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.order).toBe('asc');
      }
    });

    it('orderがdescの場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ order: 'desc' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.order).toBe('desc');
      }
    });

    it('orderが無効な値の場合エラーになること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({ order: 'invalid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_LIST_VALIDATION_MESSAGES.ORDER_INVALID);
      }
    });
  });

  describe('複合条件のバリデーション', () => {
    it('すべてのパラメータが有効な場合成功すること', () => {
      const result = tradingPartnerListQuerySchema.safeParse({
        page: '2',
        limit: '30',
        search: 'テスト',
        type: 'CUSTOMER',
        sort: 'name',
        order: 'desc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(30);
        expect(result.data.search).toBe('テスト');
        expect(result.data.type).toBe('CUSTOMER');
        expect(result.data.sort).toBe('name');
        expect(result.data.order).toBe('desc');
      }
    });
  });
});

/**
 * 取引先検索クエリスキーマのテスト（オートコンプリート用）
 * Requirements:
 * - 10.2: 検索クエリが1文字以上で部分一致検索
 * - 10.5: 種別フィルター指定時の絞り込み
 */
describe('tradingPartnerSearchQuerySchema', () => {
  // 動的インポートで検索クエリスキーマを取得
  let tradingPartnerSearchQuerySchema: typeof import('../../../schemas/trading-partner.schema.js').tradingPartnerSearchQuerySchema;
  let TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES: typeof import('../../../schemas/trading-partner.schema.js').TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES;

  beforeAll(async () => {
    const module = await import('../../../schemas/trading-partner.schema.js');
    tradingPartnerSearchQuerySchema = module.tradingPartnerSearchQuerySchema;
    TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES = module.TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES;
  });

  describe('検索クエリ（q）のバリデーション', () => {
    it('qが1文字以上の場合成功すること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('テ');
      }
    });

    it('qが複数文字の場合成功すること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト株式会社' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('テスト株式会社');
      }
    });

    it('qが空文字の場合エラーになること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.QUERY_REQUIRED);
      }
    });

    it('qが未指定の場合エラーになること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('種別フィルター（type）のバリデーション', () => {
    it('typeが未指定の場合成功すること（オプショナル）', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBeUndefined();
      }
    });

    it('typeがCUSTOMERの場合成功すること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト', type: 'CUSTOMER' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('CUSTOMER');
      }
    });

    it('typeがSUBCONTRACTORの場合成功すること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({
        q: 'テスト',
        type: 'SUBCONTRACTOR',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('SUBCONTRACTOR');
      }
    });

    it('typeが無効な値の場合エラーになること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト', type: 'INVALID' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.TYPE_INVALID);
      }
    });
  });

  describe('件数制限（limit）のバリデーション', () => {
    it('limitが未指定の場合、デフォルト値（10）が適用されること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('limitが1以上10以下の場合成功すること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト', limit: '5' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(5);
      }
    });

    it('limitが0の場合エラーになること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト', limit: '0' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.LIMIT_MIN);
      }
    });

    it('limitが10を超える場合エラーになること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({ q: 'テスト', limit: '11' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_SEARCH_VALIDATION_MESSAGES.LIMIT_MAX);
      }
    });
  });

  describe('複合条件のバリデーション', () => {
    it('すべてのパラメータが有効な場合成功すること', () => {
      const result = tradingPartnerSearchQuerySchema.safeParse({
        q: 'テスト会社',
        type: 'CUSTOMER',
        limit: '5',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe('テスト会社');
        expect(result.data.type).toBe('CUSTOMER');
        expect(result.data.limit).toBe(5);
      }
    });
  });
});

/**
 * 取引先IDパラメータスキーマのテスト
 */
describe('tradingPartnerIdParamSchema', () => {
  // 動的インポートでIDパラメータスキーマを取得
  let tradingPartnerIdParamSchema: typeof import('../../../schemas/trading-partner.schema.js').tradingPartnerIdParamSchema;
  let TRADING_PARTNER_ID_VALIDATION_MESSAGES: typeof import('../../../schemas/trading-partner.schema.js').TRADING_PARTNER_ID_VALIDATION_MESSAGES;

  beforeAll(async () => {
    const module = await import('../../../schemas/trading-partner.schema.js');
    tradingPartnerIdParamSchema = module.tradingPartnerIdParamSchema;
    TRADING_PARTNER_ID_VALIDATION_MESSAGES = module.TRADING_PARTNER_ID_VALIDATION_MESSAGES;
  });

  describe('IDパラメータのバリデーション', () => {
    it('有効なUUIDの場合成功すること', () => {
      const result = tradingPartnerIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('idが空文字の場合エラーになること', () => {
      const result = tradingPartnerIdParamSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_ID_VALIDATION_MESSAGES.ID_REQUIRED);
      }
    });

    it('idがUUID形式でない場合エラーになること', () => {
      const result = tradingPartnerIdParamSchema.safeParse({ id: 'invalid-uuid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((issue) => issue.message);
        expect(errorMessages).toContain(TRADING_PARTNER_ID_VALIDATION_MESSAGES.ID_INVALID_UUID);
      }
    });

    it('idが未指定の場合エラーになること', () => {
      const result = tradingPartnerIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
