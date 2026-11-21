/**
 * @fileoverview 受領見積書の保存の規則の共通部品（received-quotation-rules）の単体試験（unit-price-ledger タスク6.6）
 *
 * 受領見積書の保存と単価台帳の取り込み・修正が共有する、明細行の金額の補い・保存の形・比較の鍵、
 * 読取の確認の遷移（呼び出し元ごとの確認済みの送り直しの書き方を含む）、監査ログの台帳の項目、
 * 業者名と取引先の紐づけを確かめる。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { ValidationError } from '../../../errors/apiError.js';
import { RECEIVED_QUOTATION_VALIDATION_MESSAGES } from '../../../schemas/received-quotation.schema.js';
import {
  decideReadingConfirmation,
  decideVendorUpdate,
  fillLineItemAmounts,
  findSoleSubcontractorIdByName,
  haveLineItemsChanged,
  ledgerAuditFields,
  lineItemSignature,
  resolveVendor,
  toLineItemRow,
  toNumberOrNull,
  toScaled,
  type LineItemInput,
} from '../../../services/received-quotation-rules.js';

const ACTOR_ID = 'user-actor-001';

/** トランザクションの中のクライアント（取引先だけ） */
const createTx = () => ({
  tradingPartner: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
});
const asTx = (tx: ReturnType<typeof createTx>) => tx as unknown as Prisma.TransactionClient;

const lineInput = (overrides: Partial<LineItemInput> = {}): LineItemInput => ({
  name: '内装工事',
  sortOrder: 0,
  ...overrides,
});

describe('received-quotation-rules', () => {
  describe('toScaled・toNumberOrNull', () => {
    it('小数の桁で揃えた数にし、null と undefined は null にする', () => {
      expect(toScaled('1.23456', 4)).toBe(1.2346);
      expect(toScaled(new Prisma.Decimal('3000.10'), 2)).toBe(3000.1);
      expect(toScaled(null, 2)).toBeNull();
      expect(toScaled(undefined, 2)).toBeNull();
    });

    it('Decimal・数を数にし、null と undefined は null にする', () => {
      expect(toNumberOrNull(new Prisma.Decimal('12.5'))).toBe(12.5);
      expect(toNumberOrNull(3)).toBe(3);
      expect(toNumberOrNull(null)).toBeNull();
      expect(toNumberOrNull(undefined)).toBeNull();
    });
  });

  describe('fillLineItemAmounts', () => {
    it('送られた金額は数量×単価と違っても保持する（45.12）', () => {
      const [item] = fillLineItemAmounts([lineInput({ quantity: 2, unitPrice: 100, amount: 150 })]);
      expect(item!.amount).toBe(150);
    });

    it('金額が無く数量と単価があるときだけ、数量×単価を四捨五入して求める（11.12）', () => {
      const items = fillLineItemAmounts([
        lineInput({ quantity: 1.5, unitPrice: 101, amount: null }),
        lineInput({ quantity: 3, unitPrice: 0.5 }),
      ]);
      expect(items.map((item) => item.amount)).toEqual([152, 2]);
    });

    it('数量か単価が無いときは金額を null にする', () => {
      const items = fillLineItemAmounts([
        lineInput({ quantity: 2, unitPrice: null }),
        lineInput({ unitPrice: 100 }),
      ]);
      expect(items.map((item) => item.amount)).toEqual([null, null]);
    });

    it('入力の欄を保ち、入力を書き換えない', () => {
      const input = lineInput({ quantity: 2, unitPrice: 100, remarks: '備考' });
      const [item] = fillLineItemAmounts([input]);
      expect(item).toEqual({ ...input, amount: 200 });
      expect(input.amount).toBeUndefined();
    });
  });

  describe('toLineItemRow', () => {
    it('省略された欄を null・区分を直接工事（45.3）・参考の印を無にする', () => {
      expect(toLineItemRow(lineInput())).toEqual({
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '内装工事',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
        category: 'DIRECT',
        condition: null,
        conversionQuantity: null,
        conversionUnit: null,
        conversionUnitPrice: null,
        conversionBasis: null,
        classificationKey: null,
        quantityRowKey: null,
        isReference: false,
        referenceReason: null,
      });
    });

    it('送られた値を保ち、換算を 4 列に分ける', () => {
      const row = toLineItemRow(
        lineInput({
          sortOrder: 3,
          customCategory: '独自',
          workType: '内装',
          specification: '規格',
          unit: 'm2',
          quantity: 10,
          unitPrice: 1500,
          amount: 15000,
          remarks: '備考',
          category: 'WASTE',
          condition: '条件',
          conversion: { quantity: 2, unit: '式', unitPrice: 7500, basis: '根拠' },
          classificationKey: 'K-1',
          quantityRowKey: 'Q-1',
          isReference: true,
          referenceReason: '理由',
        })
      );
      expect(row).toMatchObject({
        sortOrder: 3,
        category: 'WASTE',
        conversionQuantity: 2,
        conversionUnit: '式',
        conversionUnitPrice: 7500,
        conversionBasis: '根拠',
        isReference: true,
        referenceReason: '理由',
      });
    });
  });

  describe('lineItemSignature・haveLineItemsChanged', () => {
    const stored = {
      ...toLineItemRow(lineInput({ quantity: 2, unitPrice: 1500, amount: 3000 })),
      quantity: new Prisma.Decimal('2.0000'),
      unitPrice: new Prisma.Decimal('1500.00'),
      amount: new Prisma.Decimal('3000.00'),
    };

    it('DB の桁で揃えて比べ、保存済みの行と同じ値の保存の形を同じとみる', () => {
      const after = toLineItemRow(lineInput({ quantity: 2, unitPrice: 1500, amount: 3000 }));
      expect(lineItemSignature(stored)).toBe(lineItemSignature(after));
      expect(haveLineItemsChanged([stored], [after])).toBe(false);
    });

    it('保存済みの区分と参考の印が空なら、既定（直接工事・無）とみる', () => {
      const legacy = { ...stored, category: null, isReference: null };
      expect(lineItemSignature(legacy)).toBe(lineItemSignature(stored));
    });

    it('欄の値が違えば変わったとみる', () => {
      const after = toLineItemRow(lineInput({ quantity: 2, unitPrice: 1600, amount: 3000 }));
      expect(haveLineItemsChanged([stored], [after])).toBe(true);
    });

    it('行の数が違えば変わったとみる', () => {
      expect(haveLineItemsChanged([stored], [])).toBe(true);
      expect(haveLineItemsChanged([], [])).toBe(false);
    });
  });

  describe('decideReadingConfirmation（46.6〜46.8）', () => {
    const now = new Date('2026-11-17T00:00:00.000Z');
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const unconfirmed = {
      readingStatus: 'UNCONFIRMED',
      readingConfirmedById: null,
      readingConfirmedAt: null,
      readingConfirmationRoute: null,
    };

    for (const reconfirm of ['writeStatus', 'omit'] as const) {
      describe(`reconfirm: ${reconfirm}`, () => {
        const options = { reconfirm };

        it('保存前が確認済みで内容が変わるときは、確認済みを送っていても未確認に戻す（46.8）', () => {
          expect(
            decideReadingConfirmation('CONFIRMED', 'CONFIRMED', true, ACTOR_ID, options)
          ).toEqual(unconfirmed);
          expect(
            decideReadingConfirmation('CONFIRMED', undefined, true, ACTOR_ID, options)
          ).toEqual(unconfirmed);
        });

        it('未確認（作成を含む）から確認済みにしたときは、確認者を操作した利用者、日時を今とする（46.7）', () => {
          const confirmed = {
            readingStatus: 'CONFIRMED',
            readingConfirmedById: ACTOR_ID,
            readingConfirmedAt: now,
            readingConfirmationRoute: 'SCREEN',
          };
          expect(
            decideReadingConfirmation('UNCONFIRMED', 'CONFIRMED', false, ACTOR_ID, options)
          ).toEqual(confirmed);
          expect(decideReadingConfirmation(null, 'CONFIRMED', false, ACTOR_ID, options)).toEqual(
            confirmed
          );
        });

        it('保存前が未確認なら、内容が変わっても戻す対象にしない', () => {
          expect(
            decideReadingConfirmation('UNCONFIRMED', undefined, true, ACTOR_ID, options)
          ).toEqual({});
        });

        it('未確認を送れば確認者と日時を消し、送らなければ変えない', () => {
          expect(
            decideReadingConfirmation('CONFIRMED', 'UNCONFIRMED', false, ACTOR_ID, options)
          ).toEqual(unconfirmed);
          expect(
            decideReadingConfirmation('CONFIRMED', undefined, false, ACTOR_ID, options)
          ).toEqual({});
        });
      });
    }

    it('確認済みの送り直しは、writeStatus なら状態の列だけを書き、確認者と日時を保つ', () => {
      expect(
        decideReadingConfirmation('CONFIRMED', 'CONFIRMED', false, ACTOR_ID, {
          reconfirm: 'writeStatus',
        })
      ).toEqual({ readingStatus: 'CONFIRMED' });
    });

    it('確認済みの送り直しは、omit なら何も書かない', () => {
      expect(
        decideReadingConfirmation('CONFIRMED', 'CONFIRMED', false, ACTOR_ID, { reconfirm: 'omit' })
      ).toEqual({});
    });

    describe('読取の確認の経路（46.12・46.13・46.15・46.18。タスク123.2）', () => {
      const archibenchAt = new Date('2026-11-16T09:30:00.000Z');

      /**
       * @requirement estimate-request/REQ-46.13
       */
      it('新しく確認済みにするとき、経路と日時を渡さなければ経路を画面、日時を今とする', () => {
        for (const reconfirm of ['writeStatus', 'omit'] as const) {
          for (const previous of [null, 'UNCONFIRMED'] as const) {
            expect(
              decideReadingConfirmation(previous, 'CONFIRMED', false, ACTOR_ID, { reconfirm })
            ).toEqual({
              readingStatus: 'CONFIRMED',
              readingConfirmedById: ACTOR_ID,
              readingConfirmedAt: now,
              readingConfirmationRoute: 'SCREEN',
            });
          }
        }
      });

      /**
       * @requirement estimate-request/REQ-46.15
       */
      it('新しく確認済みにするとき、渡された経路と日時を書き、確認者は操作した利用者とする', () => {
        expect(
          decideReadingConfirmation(null, 'CONFIRMED', false, ACTOR_ID, {
            reconfirm: 'writeStatus',
            newConfirmation: { route: 'ARCHIBENCH', confirmedAt: archibenchAt },
          })
        ).toEqual({
          readingStatus: 'CONFIRMED',
          readingConfirmedById: ACTOR_ID,
          readingConfirmedAt: archibenchAt,
          readingConfirmationRoute: 'ARCHIBENCH',
        });
      });

      /**
       * @requirement estimate-request/REQ-46.12
       */
      it('確認済みの送り直しは経路に触れず、渡された経路と日時も書かない（追補の前の確認済みの null も保つ）', () => {
        const newConfirmation = { route: 'ARCHIBENCH', confirmedAt: archibenchAt } as const;
        expect(
          decideReadingConfirmation('CONFIRMED', 'CONFIRMED', false, ACTOR_ID, {
            reconfirm: 'writeStatus',
            newConfirmation,
          })
        ).toEqual({ readingStatus: 'CONFIRMED' });
        expect(
          decideReadingConfirmation('CONFIRMED', 'CONFIRMED', false, ACTOR_ID, {
            reconfirm: 'omit',
            newConfirmation,
          })
        ).toEqual({});
      });

      /**
       * @requirement estimate-request/REQ-46.18
       */
      it('内容の変化で未確認へ戻すとき、経路を null にする（確認済みと経路を渡していても戻す）', () => {
        const written = decideReadingConfirmation('CONFIRMED', 'CONFIRMED', true, ACTOR_ID, {
          reconfirm: 'writeStatus',
          newConfirmation: { route: 'ARCHIBENCH', confirmedAt: archibenchAt },
        });
        expect(written).toEqual(unconfirmed);
        expect(written.readingConfirmationRoute).toBeNull();
      });

      /**
       * @requirement estimate-request/REQ-46.18
       * @requirement estimate-request/REQ-46.12
       */
      it('未確認の送信で、経路を null にする（保存前が確認済みでも未確認でも）', () => {
        for (const previous of ['CONFIRMED', 'UNCONFIRMED', null] as const) {
          const written = decideReadingConfirmation(previous, 'UNCONFIRMED', false, ACTOR_ID, {
            reconfirm: 'omit',
          });
          expect(written).toEqual(unconfirmed);
          expect(written.readingConfirmationRoute).toBeNull();
        }
      });

      it('読取の確認を送らず内容も変わらなければ、経路の列を書かない', () => {
        expect(
          decideReadingConfirmation('CONFIRMED', undefined, false, ACTOR_ID, {
            reconfirm: 'writeStatus',
          })
        ).not.toHaveProperty('readingConfirmationRoute');
      });
    });
  });

  describe('ledgerAuditFields（46.11）', () => {
    it('台帳の項目を入れ、距離を数にし、工事価格・確定金額を入れない', () => {
      const fields = ledgerAuditFields({
        vendorName: '山田工務店',
        quoteNumber: 'Q-1',
        overallConditions: '条件',
        siteLocation: '東京',
        constructionKind: 'RENOVATION',
        useType: '事務所',
        workConditions: '夜間',
        distanceKm: new Prisma.Decimal('12.5'),
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        readingConfirmationRoute: 'ARCHIBENCH',
        quoteDiscriminator: '',
        constructionPrice: 1000,
        confirmedAmount: 900,
      } as Parameters<typeof ledgerAuditFields>[0]);
      expect(fields).toEqual({
        vendorName: '山田工務店',
        quoteNumber: 'Q-1',
        overallConditions: '条件',
        siteLocation: '東京',
        constructionKind: 'RENOVATION',
        useType: '事務所',
        workConditions: '夜間',
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        readingConfirmationRoute: 'ARCHIBENCH',
        quoteDiscriminator: '',
      });
    });

    /**
     * @requirement estimate-request/REQ-46.21
     */
    it('読取の確認の経路を入れ、経路の無い行（未確認・追補の前の確認済み）は null を入れる', () => {
      const source = {
        vendorName: '山田工務店',
        quoteNumber: null,
        overallConditions: null,
        siteLocation: null,
        constructionKind: null,
        useType: null,
        workConditions: null,
        distanceKm: null,
        adoption: 'UNKNOWN',
        readingStatus: 'CONFIRMED',
        quoteDiscriminator: '',
      };
      for (const route of ['SCREEN', 'LEDGER_IMPORT', 'ARCHIBENCH', null] as const) {
        const fields = ledgerAuditFields({ ...source, readingConfirmationRoute: route });
        expect(fields).toHaveProperty('readingConfirmationRoute', route);
      }
    });

    it('距離が無ければ null にする', () => {
      const fields = ledgerAuditFields({
        vendorName: '山田工務店',
        quoteNumber: null,
        overallConditions: null,
        siteLocation: null,
        constructionKind: null,
        useType: null,
        workConditions: null,
        distanceKm: null,
        adoption: 'UNKNOWN',
        readingStatus: 'UNCONFIRMED',
        readingConfirmationRoute: null,
        quoteDiscriminator: '',
      });
      expect(fields.distanceKm).toBeNull();
    });
  });

  describe('findSoleSubcontractorIdByName（44.6・44.7、2.10・2.11）', () => {
    it('論理削除されていない協力業者で名前が完全に一致する 1 件の ID を返す', async () => {
      const tx = createTx();
      tx.tradingPartner.findMany.mockResolvedValue([{ id: 'tp-1' }]);
      await expect(findSoleSubcontractorIdByName(asTx(tx), '山田工務店')).resolves.toBe('tp-1');
      expect(tx.tradingPartner.findMany).toHaveBeenCalledWith({
        where: {
          name: '山田工務店',
          deletedAt: null,
          types: { some: { type: 'SUBCONTRACTOR' } },
        },
        select: { id: true },
        take: 2,
      });
    });

    it('0 件・複数なら null を返す', async () => {
      const tx = createTx();
      tx.tradingPartner.findMany.mockResolvedValueOnce([]);
      await expect(findSoleSubcontractorIdByName(asTx(tx), 'x')).resolves.toBeNull();
      tx.tradingPartner.findMany.mockResolvedValueOnce([{ id: 'tp-1' }, { id: 'tp-2' }]);
      await expect(findSoleSubcontractorIdByName(asTx(tx), 'x')).resolves.toBeNull();
    });
  });

  describe('resolveVendor（44.5〜44.7）', () => {
    it('選んだ取引先が論理削除されていない協力業者なら、紐づけて業者名に取引先の名前を入れる', async () => {
      const tx = createTx();
      tx.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp-1',
        name: '取引先の名前',
        deletedAt: null,
        types: [{ type: 'CUSTOMER' }, { type: 'SUBCONTRACTOR' }],
      });
      await expect(resolveVendor(asTx(tx), '入力の名前', 'tp-1')).resolves.toEqual({
        vendorName: '取引先の名前',
        tradingPartnerId: 'tp-1',
      });
      expect(tx.tradingPartner.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['無い', null],
      [
        '論理削除済み',
        { id: 'tp-1', name: 'a', deletedAt: new Date(), types: [{ type: 'SUBCONTRACTOR' }] },
      ],
      ['協力業者でない', { id: 'tp-1', name: 'a', deletedAt: null, types: [{ type: 'CUSTOMER' }] }],
    ])(
      '選んだ取引先が%sなら ValidationError で拒み、名前の照合へ切り替えない',
      async (_label, partner) => {
        const tx = createTx();
        tx.tradingPartner.findUnique.mockResolvedValue(partner);
        const error = await resolveVendor(asTx(tx), '入力の名前', 'tp-1').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toBe(
          RECEIVED_QUOTATION_VALIDATION_MESSAGES.TRADING_PARTNER_NOT_SUBCONTRACTOR
        );
        expect(tx.tradingPartner.findMany).not.toHaveBeenCalled();
      }
    );

    it('取引先を選ばなければ、前後の空白を除いた業者名で照合する', async () => {
      const tx = createTx();
      tx.tradingPartner.findMany.mockResolvedValue([{ id: 'tp-9' }]);
      await expect(resolveVendor(asTx(tx), '  山田工務店  ', null)).resolves.toEqual({
        vendorName: '山田工務店',
        tradingPartnerId: 'tp-9',
      });
      expect(tx.tradingPartner.findMany.mock.calls[0]![0].where.name).toBe('山田工務店');
    });

    it('照合が 1 件でなければ業者名だけを保つ', async () => {
      const tx = createTx();
      tx.tradingPartner.findMany.mockResolvedValue([]);
      await expect(resolveVendor(asTx(tx), '山田工務店', null)).resolves.toEqual({
        vendorName: '山田工務店',
        tradingPartnerId: null,
      });
    });
  });

  describe('decideVendorUpdate（44.8）', () => {
    const current = { vendorName: '山田工務店', tradingPartnerId: 'tp-1' };

    it('業者名も取引先も送らないとき、同じ業者名・同じ取引先を送り直したときは決め直さない', () => {
      expect(decideVendorUpdate(current, {})).toBeNull();
      expect(decideVendorUpdate(current, { vendorName: ' 山田工務店 ' })).toBeNull();
      expect(
        decideVendorUpdate(current, { vendorName: '山田工務店', tradingPartnerId: 'tp-1' })
      ).toBeNull();
    });

    it('今と違う取引先を選んだときは、その ID で決め直す', () => {
      expect(decideVendorUpdate(current, { tradingPartnerId: 'tp-2' })).toEqual({
        vendorName: '山田工務店',
        tradingPartnerId: 'tp-2',
      });
    });

    it('業者名を変えたときは、名前の照合で決め直す（今の取引先を送り直しても照合する）', () => {
      expect(decideVendorUpdate(current, { vendorName: '佐藤建設' })).toEqual({
        vendorName: '佐藤建設',
        tradingPartnerId: null,
      });
      expect(
        decideVendorUpdate(current, { vendorName: '佐藤建設', tradingPartnerId: 'tp-1' })
      ).toEqual({ vendorName: '佐藤建設', tradingPartnerId: null });
    });

    it('取引先の紐づけを外す（null を送る）ときは、今の業者名で照合し直す', () => {
      expect(decideVendorUpdate(current, { tradingPartnerId: null })).toEqual({
        vendorName: '山田工務店',
        tradingPartnerId: null,
      });
    });
  });
});
