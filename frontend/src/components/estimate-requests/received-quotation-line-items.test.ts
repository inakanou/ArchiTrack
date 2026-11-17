/**
 * @fileoverview 受領見積書の明細行の変換と保存の前の検証（received-quotation-line-items）の単体テスト
 *
 * unit-price-ledger のタスク6.6 で ReceivedQuotationForm から出し、単価台帳の修正の画面と共有した部品を確かめる。
 * サーバーの明細行の値からフォームの値への変換（並び順の補完と既定）、保存の入力への変換（名称の空の行の除外・
 * 番号の振り直し・換算・台帳の欄）、保存の前の検証（45.4・45.9・46.5）を見る。
 */

import { describe, it, expect } from 'vitest';
import type { LineItemInfo } from '../../api/received-quotations';
import { createEmptyLineItem, type LineItemFormData } from './LineItemEditor';
import { formatQuantity, formatUnitPrice } from './number-format';
import { LINE_ITEM_SAVE_VALIDATION_MESSAGES } from './received-quotation-form-messages';
import {
  convertToLineItemFormData,
  convertToLineItemInput,
  getSubmittedLineItems,
  validateLineItemsForSave,
} from './received-quotation-line-items';

const messages = LINE_ITEM_SAVE_VALIDATION_MESSAGES;

const formItem = (overrides: Partial<LineItemFormData> = {}): LineItemFormData => ({
  ...createEmptyLineItem(0),
  id: 'row-1',
  name: '内装工事',
  ...overrides,
});

const serverItem = (overrides: Partial<LineItemInfo> = {}): LineItemInfo => ({
  id: 'li-1',
  receivedQuotationId: 'rq-1',
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
  conversion: null,
  classificationKey: null,
  quantityRowKey: null,
  isReference: false,
  referenceReason: null,
  ...overrides,
});

describe('getSubmittedLineItems', () => {
  it('名称の空の行（空白だけを含む）を除き、並びを保つ', () => {
    const items = [
      formItem({ id: 'a', name: 'A' }),
      formItem({ id: 'b', name: '  ' }),
      formItem({ id: 'c', name: 'C' }),
    ];
    expect(getSubmittedLineItems(items).map((item) => item.id)).toEqual(['a', 'c']);
  });
});

describe('convertToLineItemFormData', () => {
  it('行が無い・未定義なら空の 1 行を返す', () => {
    for (const items of [undefined, []]) {
      const rows = convertToLineItemFormData(items);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('');
      expect(rows[0]!.sortOrder).toBe(0);
    }
  });

  it('空の欄を空の文字にし、数量・単価・換算の単価を表示の形にし、台帳の欄を読む', () => {
    const [row] = convertToLineItemFormData([
      serverItem({
        customCategory: '独自',
        workType: '内装',
        specification: '規格',
        unit: 'm2',
        quantity: 2.5,
        unitPrice: 1500,
        amount: 3750,
        remarks: '備考',
        category: 'WASTE',
        condition: '条件',
        conversion: { quantity: 2, unit: '式', unitPrice: 7500, basis: '根拠' },
        classificationKey: 'K-1',
        quantityRowKey: 'Q-1',
        isReference: true,
        referenceReason: '理由',
      }),
    ]);
    expect(row).toMatchObject({
      id: 'li-1',
      customCategory: '独自',
      workType: '内装',
      specification: '規格',
      unit: 'm2',
      quantity: formatQuantity('2.5'),
      unitPrice: formatUnitPrice('1500'),
      amount: 3750,
      remarks: '備考',
      category: 'WASTE',
      condition: '条件',
      conversionQuantity: '2',
      conversionUnit: '式',
      conversionUnitPrice: formatUnitPrice('7500'),
      conversionBasis: '根拠',
      classificationKey: 'K-1',
      quantityRowKey: 'Q-1',
      isReference: true,
      referenceReason: '理由',
    });
  });

  it('値の無い欄は空の文字にし、区分と参考の印が無ければ既定（直接工事・無）にする', () => {
    const legacy = {
      ...serverItem(),
      category: undefined,
      isReference: undefined,
    } as unknown as LineItemInfo;
    const [row] = convertToLineItemFormData([legacy]);
    expect(row).toMatchObject({
      customCategory: '',
      workType: '',
      specification: '',
      unit: '',
      quantity: formatQuantity(''),
      unitPrice: formatUnitPrice(''),
      amount: null,
      remarks: '',
      category: 'DIRECT',
      condition: '',
      conversionQuantity: '',
      conversionUnit: '',
      conversionUnitPrice: '',
      conversionBasis: '',
      classificationKey: '',
      quantityRowKey: '',
      isReference: false,
      referenceReason: '',
    });
  });

  it('並び順で昇順に並べ、欠けた並び順を補う（37.3）', () => {
    const rows = convertToLineItemFormData([
      serverItem({ id: 'b', sortOrder: 1 }),
      serverItem({ id: 'a', sortOrder: 0 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);

    const missing = { ...serverItem({ id: 'x' }), sortOrder: null } as unknown as LineItemInfo;
    const [filled] = convertToLineItemFormData([missing]);
    expect(typeof filled!.sortOrder).toBe('number');
  });
});

describe('convertToLineItemInput', () => {
  it('名称の空の行を除き、渡された並びの順に 0 から番号を振る', () => {
    const inputs = convertToLineItemInput([
      formItem({ id: 'a', name: 'A', sortOrder: 5 }),
      formItem({ id: 'b', name: '' }),
      formItem({ id: 'c', name: ' C ', sortOrder: 2 }),
    ]);
    expect(inputs.map((input) => [input.name, input.sortOrder])).toEqual([
      ['A', 0],
      ['C', 1],
    ]);
  });

  it('空の文字の欄を省き（undefined）、数を読み、台帳の欄を既定で補う', () => {
    const [input] = convertToLineItemInput([formItem({ quantity: '2.50', unitPrice: '1,500' })]);
    expect(input).toEqual({
      name: '内装工事',
      customCategory: undefined,
      workType: undefined,
      specification: undefined,
      unit: undefined,
      quantity: 2.5,
      unitPrice: parseFloat('1,500'),
      amount: undefined,
      remarks: undefined,
      sortOrder: 0,
      category: 'DIRECT',
      condition: null,
      conversion: null,
      classificationKey: null,
      quantityRowKey: null,
      isReference: false,
      referenceReason: null,
    });
  });

  it('入力された台帳の欄を送り、換算は 4 つが揃うときだけ送る（45.8）', () => {
    const [input] = convertToLineItemInput([
      formItem({
        customCategory: ' 独自 ',
        amount: 3000,
        remarks: '備考',
        category: 'DISCOUNT',
        condition: '条件',
        conversionQuantity: '2',
        conversionUnit: '式',
        conversionUnitPrice: '7500',
        conversionBasis: '根拠',
        classificationKey: 'K-1',
        quantityRowKey: 'Q-1',
        isReference: true,
        referenceReason: '理由',
      }),
    ]);
    expect(input).toMatchObject({
      customCategory: '独自',
      amount: 3000,
      remarks: '備考',
      category: 'DISCOUNT',
      condition: '条件',
      conversion: { quantity: 2, unit: '式', unitPrice: 7500, basis: '根拠' },
      classificationKey: 'K-1',
      quantityRowKey: 'Q-1',
      isReference: true,
      referenceReason: '理由',
    });
  });

  it('換算が一部だけ・単価が数でないときは換算を送らず、空白だけの参考の理由は null にする', () => {
    const inputs = convertToLineItemInput([
      formItem({ id: 'a', conversionQuantity: '2', conversionUnit: '式' }),
      formItem({
        id: 'b',
        conversionQuantity: '2',
        conversionUnit: '式',
        conversionUnitPrice: 'abc',
        conversionBasis: '根拠',
        referenceReason: '  ',
      }),
    ]);
    expect(inputs.map((input) => input.conversion)).toEqual([null, null]);
    expect(inputs[1]!.referenceReason).toBeNull();
  });
});

describe('validateLineItemsForSave', () => {
  it('誤りの無い行・名称の空の行は結果に入れない', () => {
    expect(
      validateLineItemsForSave([
        formItem({ id: 'ok' }),
        formItem({ id: 'blank', name: '', category: 'DISCOUNT', amount: 100 }),
      ])
    ).toEqual({});
  });

  it('値引きの行の金額（金額が空なら数量×単価）が正なら止める（45.4）', () => {
    expect(
      validateLineItemsForSave([
        formItem({ id: 'a', category: 'DISCOUNT', amount: 100 }),
        formItem({ id: 'b', category: 'DISCOUNT', quantity: '1', unitPrice: '500' }),
        formItem({ id: 'c', category: 'DISCOUNT', amount: -100 }),
        formItem({ id: 'd', category: 'DISCOUNT' }),
      ])
    ).toEqual({
      a: [messages.DISCOUNT_AMOUNT_POSITIVE],
      b: [messages.DISCOUNT_AMOUNT_POSITIVE],
    });
  });

  it('換算は 4 つすべてあるかすべて無く、数量は 0 より大きい（45.9）', () => {
    const complete = {
      conversionQuantity: '2',
      conversionUnit: '式',
      conversionUnitPrice: '7500',
      conversionBasis: '根拠',
    };
    expect(
      validateLineItemsForSave([
        formItem({ id: 'partial', conversionUnit: '式' }),
        formItem({ id: 'zero', ...complete, conversionQuantity: '0' }),
        formItem({ id: 'nan', ...complete, conversionQuantity: 'abc' }),
        formItem({ id: 'ok', ...complete }),
      ])
    ).toEqual({
      partial: [messages.CONVERSION_INCOMPLETE],
      zero: [messages.CONVERSION_INCOMPLETE],
      nan: [messages.CONVERSION_INCOMPLETE],
    });
  });

  it('参考の印が無の行の参考の理由を止め、一つの行の誤りをまとめて返す（46.5）', () => {
    expect(
      validateLineItemsForSave([
        formItem({
          id: 'a',
          category: 'DISCOUNT',
          amount: 100,
          conversionUnit: '式',
          isReference: false,
          referenceReason: '理由',
        }),
        formItem({ id: 'b', isReference: true, referenceReason: '理由' }),
      ])
    ).toEqual({
      a: [
        messages.DISCOUNT_AMOUNT_POSITIVE,
        messages.CONVERSION_INCOMPLETE,
        messages.REFERENCE_REASON_WITHOUT_REFERENCE,
      ],
    });
  });
});
