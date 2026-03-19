/**
 * @fileoverview 契約書スキーマのユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 3.1: 新規契約入力フィールド
 * - 3.2: 消費税率デフォルト10%
 * - 5.1: 変更契約時のparentContractId必須化
 * - 5.3: 変更契約入力フィールド
 * - 7.1: 作成ボタン（バリデーション）
 * - 9.2: 編集保存（楽観的排他制御）
 */

import { describe, it, expect } from 'vitest';
import {
  createContractSchema,
  updateContractSchema,
  contractListQuerySchema,
  updateContractStatusSchema,
  CONTRACT_VALIDATION_MESSAGES,
} from '../../../schemas/contract.schema.js';

function getErrorMessages(result: {
  success: false;
  error: { issues: { message: string }[] };
}): string[] {
  return result.error.issues.map((issue) => issue.message);
}

// 有効なデータのテンプレート
const validCreateData = {
  contractType: 'NEW' as const,
  parentContractId: null,
  estimateId: '550e8400-e29b-41d4-a716-446655440001',
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '着手時30%、中間時30%、完了時40%',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: '550e8400-e29b-41d4-a716-446655440002',
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
};

const validUpdateData = {
  estimateId: '550e8400-e29b-41d4-a716-446655440001',
  contractDate: '2026-04-01',
  constructionStartDate: '2026-05-01',
  constructionEndDate: '2026-12-31',
  deliveryDate: '2027-01-15',
  taxRate: 0.1,
  paymentTerms: '着手時30%、中間時30%、完了時40%',
  separateConstruction: '電気設備工事',
  otherNotes: '特記事項なし',
  supervisorTradingPartnerId: '550e8400-e29b-41d4-a716-446655440002',
  contractAmount: 11000000,
  constructionPrice: 10000000,
  taxAmount: 1000000,
  version: 0,
};

describe('createContractSchema', () => {
  describe('有効なデータのバリデーション', () => {
    it('新規契約の有効なデータでバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse(validCreateData);
      expect(result.success).toBe(true);
    });

    it('変更契約の有効なデータでバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractType: 'AMENDMENT',
        parentContractId: '550e8400-e29b-41d4-a716-446655440003',
      });
      expect(result.success).toBe(true);
    });

    it('supervisorTradingPartnerIdがnullでもバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        supervisorTradingPartnerId: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('contractType バリデーション', () => {
    it('無効なcontractTypeでエラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractType: 'INVALID',
      });
      expect(result.success).toBe(false);
    });

    it('contractTypeが未指定の場合エラーになること', () => {
      const { contractType: _, ...dataWithout } = validCreateData;
      void _;
      const result = createContractSchema.safeParse(dataWithout);
      expect(result.success).toBe(false);
    });
  });

  describe('parentContractId バリデーション（変更契約時必須）', () => {
    it('変更契約でparentContractIdがnullの場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractType: 'AMENDMENT',
        parentContractId: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.PARENT_CONTRACT_REQUIRED))
        ).toBe(true);
      }
    });

    it('変更契約でparentContractIdが不正なUUIDの場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractType: 'AMENDMENT',
        parentContractId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('新規契約でparentContractIdがnullの場合は成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractType: 'NEW',
        parentContractId: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('estimateId バリデーション', () => {
    it('estimateIdが未指定の場合エラーになること', () => {
      const { estimateId: _, ...dataWithout } = validCreateData;
      void _;
      const result = createContractSchema.safeParse(dataWithout);
      expect(result.success).toBe(false);
    });

    it('estimateIdが不正なUUIDの場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        estimateId: 'invalid-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('日付バリデーション', () => {
    it('contractDateが不正な形式の場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractDate: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    it('着手日が完成日より後の場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        constructionStartDate: '2026-12-31',
        constructionEndDate: '2026-05-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.START_DATE_BEFORE_END_DATE))
        ).toBe(true);
      }
    });

    it('着手日と完成日が同じ場合はバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        constructionStartDate: '2026-06-01',
        constructionEndDate: '2026-06-01',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('taxRate バリデーション', () => {
    it('taxRateが未指定の場合デフォルト値0.10が設定されること', () => {
      const { taxRate: _, ...dataWithout } = validCreateData;
      void _;
      const result = createContractSchema.safeParse(dataWithout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.taxRate).toBe(0.1);
      }
    });

    it('taxRateが負の値の場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxRate: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it('taxRateが1を超える場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxRate: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('金額フィールド バリデーション', () => {
    it('contractAmountが負の値の場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractAmount: -1,
      });
      expect(result.success).toBe(false);
    });

    it('constructionPriceが負の値の場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        constructionPrice: -1,
      });
      expect(result.success).toBe(false);
    });

    it('taxAmountが負の値の場合エラーになること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxAmount: -1,
      });
      expect(result.success).toBe(false);
    });

    it('金額が0の場合はバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractAmount: 0,
        constructionPrice: 0,
        taxAmount: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('テキストフィールド バリデーション', () => {
    it('paymentTermsが空文字列でもバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        paymentTerms: '',
      });
      expect(result.success).toBe(true);
    });

    it('separateConstructionが空文字列でもバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        separateConstruction: '',
      });
      expect(result.success).toBe(true);
    });

    it('otherNotesが空文字列でもバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        otherNotes: '',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('updateContractSchema', () => {
  it('有効なデータでバリデーションが成功すること', () => {
    const result = updateContractSchema.safeParse(validUpdateData);
    expect(result.success).toBe(true);
  });

  it('versionが未指定の場合エラーになること', () => {
    const { version: _, ...dataWithout } = validUpdateData;
    void _;
    const result = updateContractSchema.safeParse(dataWithout);
    expect(result.success).toBe(false);
  });

  it('versionが負の値の場合エラーになること', () => {
    const result = updateContractSchema.safeParse({
      ...validUpdateData,
      version: -1,
    });
    expect(result.success).toBe(false);
  });

  it('versionが整数でない場合エラーになること', () => {
    const result = updateContractSchema.safeParse({
      ...validUpdateData,
      version: 1.5,
    });
    expect(result.success).toBe(false);
  });

  describe('クロスフィールドバリデーション（.refine）', () => {
    it('着手日が完成日より後の場合エラーになること', () => {
      const result = updateContractSchema.safeParse({
        ...validUpdateData,
        constructionStartDate: '2026-12-31',
        constructionEndDate: '2026-05-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(
          messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.START_DATE_BEFORE_END_DATE))
        ).toBe(true);
      }
    });

    it('着手日と完成日が同じ場合はバリデーションが成功すること', () => {
      const result = updateContractSchema.safeParse({
        ...validUpdateData,
        constructionStartDate: '2026-06-01',
        constructionEndDate: '2026-06-01',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('taxRate バリデーション', () => {
    it('taxRateが負の値の場合エラーになること', () => {
      const result = updateContractSchema.safeParse({
        ...validUpdateData,
        taxRate: -0.01,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MIN))).toBe(
          true
        );
      }
    });

    it('taxRateが1を超える場合エラーになること', () => {
      const result = updateContractSchema.safeParse({
        ...validUpdateData,
        taxRate: 1.01,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MAX))).toBe(
          true
        );
      }
    });

    it('taxRateが0の場合はバリデーションが成功すること', () => {
      const result = updateContractSchema.safeParse({
        ...validUpdateData,
        taxRate: 0,
      });
      expect(result.success).toBe(true);
    });

    it('taxRateが1の場合はバリデーションが成功すること', () => {
      const result = updateContractSchema.safeParse({
        ...validUpdateData,
        taxRate: 1,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('createContractSchema - クロスフィールドバリデーション（.refine）', () => {
  describe('着手日<=完成日の論理チェック', () => {
    it('着手日が完成日より後の場合、constructionStartDateパスにエラーが設定されること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        constructionStartDate: '2026-12-31',
        constructionEndDate: '2026-05-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const startDateError = result.error.issues.find((issue) =>
          issue.path.includes('constructionStartDate')
        );
        expect(startDateError).toBeDefined();
        expect(startDateError?.message).toBe(
          CONTRACT_VALIDATION_MESSAGES.START_DATE_BEFORE_END_DATE
        );
      }
    });
  });

  describe('変更契約時のparentContractId必須チェック', () => {
    it('AMENDMENTでparentContractIdが未指定（undefined）の場合エラーになること', () => {
      const { parentContractId: _, ...dataWithout } = validCreateData;
      void _;
      const result = createContractSchema.safeParse({
        ...dataWithout,
        contractType: 'AMENDMENT',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const parentError = result.error.issues.find((issue) =>
          issue.path.includes('parentContractId')
        );
        expect(parentError).toBeDefined();
        expect(parentError?.message).toBe(CONTRACT_VALIDATION_MESSAGES.PARENT_CONTRACT_REQUIRED);
      }
    });

    it('NEWでparentContractIdが指定されていても成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        contractType: 'NEW',
        parentContractId: '550e8400-e29b-41d4-a716-446655440003',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('消費税率の境界値テスト', () => {
    it('taxRateが0の場合はバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxRate: 0,
      });
      expect(result.success).toBe(true);
    });

    it('taxRateが1の場合はバリデーションが成功すること', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxRate: 1,
      });
      expect(result.success).toBe(true);
    });

    it('taxRateが0未満の場合エラーメッセージが正しいこと', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxRate: -0.01,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MIN))).toBe(
          true
        );
      }
    });

    it('taxRateが1超の場合エラーメッセージが正しいこと', () => {
      const result = createContractSchema.safeParse({
        ...validCreateData,
        taxRate: 1.01,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = getErrorMessages(result);
        expect(messages.some((m) => m.includes(CONTRACT_VALIDATION_MESSAGES.TAX_RATE_MAX))).toBe(
          true
        );
      }
    });
  });
});

describe('contractListQuerySchema', () => {
  it('空オブジェクトでデフォルト値が設定されること', () => {
    const result = contractListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('有効なクエリパラメータでバリデーションが成功すること', () => {
    const result = contractListQuerySchema.safeParse({
      page: '2',
      limit: '10',
      sortBy: 'contractDate',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
      expect(result.data.sortBy).toBe('contractDate');
      expect(result.data.sortOrder).toBe('asc');
    }
  });

  it('pageが0以下の場合エラーになること', () => {
    const result = contractListQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('limitが0以下の場合エラーになること', () => {
    const result = contractListQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('無効なsortByの場合エラーになること', () => {
    const result = contractListQuerySchema.safeParse({ sortBy: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('無効なsortOrderの場合エラーになること', () => {
    const result = contractListQuerySchema.safeParse({ sortOrder: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('updateContractStatusSchema', () => {
  it('BEFORE_CONTRACTが有効であること', () => {
    const result = updateContractStatusSchema.safeParse({ status: 'BEFORE_CONTRACT' });
    expect(result.success).toBe(true);
  });

  it('CONTRACTEDが有効であること', () => {
    const result = updateContractStatusSchema.safeParse({ status: 'CONTRACTED' });
    expect(result.success).toBe(true);
  });

  it('無効なステータスの場合エラーになること', () => {
    const result = updateContractStatusSchema.safeParse({ status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('statusが未指定の場合エラーになること', () => {
    const result = updateContractStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
