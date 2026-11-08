/**
 * @fileoverview useUnsavedChangesGuard / isFormDirty のユニットテスト
 *
 * Task 81.3: ReceivedQuotationForm セッション保護・未保存変更ガード・並び順送信のユニットテスト
 *
 * Requirements:
 * - 38.12: 未保存変更がある状態でダイアログクローズ要求があった場合、
 *          確認ダイアログを表示し、ユーザーが「はい」を選択した場合のみクローズする
 * - 38.13: 未保存変更がある状態でページ離脱が検知された場合、
 *          ブラウザ標準の beforeunload 確認ダイアログを表示する
 *
 * Source under test:
 * - frontend/src/components/estimate-requests/useUnsavedChangesGuard.ts
 *   （task 79.2 で実装済み。本ファイルはキャラクタライゼーション/ロックインテスト）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  isFormDirty,
  useUnsavedChangesGuard,
  UNSAVED_CHANGES_CONFIRM_MESSAGE,
  type FormSnapshot,
} from './useUnsavedChangesGuard';
import type { LineItemFormData } from './LineItemEditor';
import { createLedgerInfoFormData, type LedgerInfoFormData } from './ledger-info-form';

// ============================================================================
// テスト用ヘルパー: LineItemFormData の最小生成関数
// ============================================================================

function makeLineItem(overrides: Partial<LineItemFormData> = {}): LineItemFormData {
  return {
    id: 'li-default',
    sortOrder: 0,
    customCategory: '',
    workType: '',
    name: '',
    specification: '',
    unit: '',
    quantity: '',
    unitPrice: '',
    amount: null,
    remarks: '',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<FormSnapshot> = {}): FormSnapshot {
  return {
    name: '見積書',
    submittedAt: '2026-04-01',
    netAmount: '',
    selectedFile: null,
    lineItems: [makeLineItem({ id: 'li-1', sortOrder: 0 })],
    ...overrides,
  };
}

// ============================================================================
// isFormDirty 純粋関数のテスト (Requirements: 38.12)
// ============================================================================

describe('isFormDirty (Task 81.3, Requirements: 38.12)', () => {
  describe('scalar フィールドの差分検出', () => {
    it('全フィールドが完全一致の場合は dirty=false', () => {
      const snap = makeSnapshot();
      expect(isFormDirty(snap, snap)).toBe(false);
    });

    it('name が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ name: '見積書' });
      const cur = makeSnapshot({ name: '見積書（改定）' });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('submittedAt が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ submittedAt: '2026-04-01' });
      const cur = makeSnapshot({ submittedAt: '2026-04-02' });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('netAmount が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ netAmount: '' });
      const cur = makeSnapshot({ netAmount: '50000' });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('null / undefined / 空文字列 を等価として扱う（name）', () => {
      // name は string 型なので "" のみ。null/undefined は型上不可だが、
      // normalizeScalar 経路で許容されることを担保する。
      const snapEmpty = makeSnapshot({ name: '' });
      const curEmpty = makeSnapshot({ name: '' });
      expect(isFormDirty(curEmpty, snapEmpty)).toBe(false);
    });

    it('submittedAt: null と "" を等価として扱う', () => {
      const snap = makeSnapshot({ submittedAt: null });
      const cur = makeSnapshot({ submittedAt: '' });
      expect(isFormDirty(cur, snap)).toBe(false);
    });

    it('submittedAt: Date と等価な ISO 文字列差分を検出する', () => {
      const date1 = new Date('2026-04-01T00:00:00.000Z');
      const date2 = new Date('2026-04-02T00:00:00.000Z');
      const snap = makeSnapshot({ submittedAt: date1 });
      const cur = makeSnapshot({ submittedAt: date2 });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('netAmount: null と "" を等価として扱う', () => {
      const snap = makeSnapshot({ netAmount: null });
      const cur = makeSnapshot({ netAmount: '' });
      expect(isFormDirty(cur, snap)).toBe(false);
    });

    it('netAmount: number と等価な文字列を等価として扱う', () => {
      const snap = makeSnapshot({ netAmount: 50000 });
      const cur = makeSnapshot({ netAmount: '50000' });
      expect(isFormDirty(cur, snap)).toBe(false);
    });
  });

  describe('selectedFile (File) の参照同一性判定', () => {
    it('同じ File 参照は等価として扱う', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const snap = makeSnapshot({ selectedFile: file });
      const cur = makeSnapshot({ selectedFile: file });
      expect(isFormDirty(cur, snap)).toBe(false);
    });

    it('異なる File インスタンスは name/size 同一でも dirty として扱う（参照同一性）', () => {
      const file1 = new File(['content'], 'same.pdf', { type: 'application/pdf' });
      const file2 = new File(['content'], 'same.pdf', { type: 'application/pdf' });
      const snap = makeSnapshot({ selectedFile: file1 });
      const cur = makeSnapshot({ selectedFile: file2 });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('null → File への変化は dirty=true', () => {
      const file = new File(['content'], 'new.pdf', { type: 'application/pdf' });
      const snap = makeSnapshot({ selectedFile: null });
      const cur = makeSnapshot({ selectedFile: file });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('File → null への変化は dirty=true', () => {
      const file = new File(['content'], 'old.pdf', { type: 'application/pdf' });
      const snap = makeSnapshot({ selectedFile: file });
      const cur = makeSnapshot({ selectedFile: null });
      expect(isFormDirty(cur, snap)).toBe(true);
    });
  });

  describe('lineItems の差分検出', () => {
    it('配列長が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({
        lineItems: [makeLineItem({ id: 'a', sortOrder: 0 })],
      });
      const cur = makeSnapshot({
        lineItems: [
          makeLineItem({ id: 'a', sortOrder: 0 }),
          makeLineItem({ id: 'b', sortOrder: 1 }),
        ],
      });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('配列長0 同士は dirty=false', () => {
      const snap = makeSnapshot({ lineItems: [] });
      const cur = makeSnapshot({ lineItems: [] });
      expect(isFormDirty(cur, snap)).toBe(false);
    });

    it('customCategory が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({
        lineItems: [makeLineItem({ customCategory: '躯体' })],
      });
      const cur = makeSnapshot({
        lineItems: [makeLineItem({ customCategory: '仮設' })],
      });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('workType が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ workType: '鉄筋' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ workType: '型枠' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('name が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ name: 'A' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ name: 'B' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('specification が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ specification: 'SD295' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ specification: 'SD345' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('unit が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ unit: '個' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ unit: 'kg' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('quantity が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ quantity: '1.00' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ quantity: '2.00' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('unitPrice が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ unitPrice: '1000' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ unitPrice: '2000' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('remarks が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ remarks: 'A' })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ remarks: 'B' })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('sortOrder が異なる場合は dirty=true', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ sortOrder: 0 })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ sortOrder: 1 })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('amount のみ異なる場合は dirty=false（自動計算結果のため除外）', () => {
      // 単価のある行の金額は数量×単価で求めた値のため比べない（タスク117.4 で単価のある行に限定）
      const snap = makeSnapshot({
        lineItems: [makeLineItem({ quantity: '10', unitPrice: '100', amount: 1000 })],
      });
      const cur = makeSnapshot({
        lineItems: [makeLineItem({ quantity: '10', unitPrice: '100', amount: 9999 })],
      });
      expect(isFormDirty(cur, snap)).toBe(false);
    });

    it('単価が空の行で amount だけが異なる場合は dirty=true（利用者が直接入れた金額。タスク117.4）', () => {
      const snap = makeSnapshot({
        lineItems: [makeLineItem({ quantity: '1', unitPrice: '', amount: 1000 })],
      });
      const cur = makeSnapshot({
        lineItems: [makeLineItem({ quantity: '1', unitPrice: '', amount: 2000 })],
      });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('単価が空白だけの行も単価が空の行として amount を比べる（タスク117.4）', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem({ unitPrice: ' ', amount: null })] });
      const cur = makeSnapshot({ lineItems: [makeLineItem({ unitPrice: ' ', amount: 500 })] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('id のみ異なる場合は dirty=false（クライアントサイド一時IDのため除外）', () => {
      const snap = makeSnapshot({
        lineItems: [makeLineItem({ id: 'old-id' })],
      });
      const cur = makeSnapshot({
        lineItems: [makeLineItem({ id: 'new-id' })],
      });
      expect(isFormDirty(cur, snap)).toBe(false);
    });

    it('対象フィールドが全て一致すれば dirty=false（amount/id 差分があっても）', () => {
      const snap = makeSnapshot({
        lineItems: [
          makeLineItem({
            id: 'old-id',
            sortOrder: 0,
            customCategory: '躯体',
            workType: '鉄筋',
            name: '鉄筋D10',
            specification: 'SD295A',
            unit: 'kg',
            quantity: '1500.00',
            unitPrice: '100',
            amount: 150000,
            remarks: '基礎部分',
          }),
        ],
      });
      const cur = makeSnapshot({
        lineItems: [
          makeLineItem({
            id: 'new-id', // 異なる
            sortOrder: 0,
            customCategory: '躯体',
            workType: '鉄筋',
            name: '鉄筋D10',
            specification: 'SD295A',
            unit: 'kg',
            quantity: '1500.00',
            unitPrice: '100',
            amount: 99999, // 異なる
            remarks: '基礎部分',
          }),
        ],
      });
      expect(isFormDirty(cur, snap)).toBe(false);
    });
  });
});

// ============================================================================
// タスク117.4: 判定の対象に台帳の情報・業者名・明細行の新しい欄を足す
// ============================================================================

describe('isFormDirty の台帳の項目（タスク117.4）', () => {
  describe('明細行の新しい欄', () => {
    const cases: Array<[string, Partial<LineItemFormData>]> = [
      ['区分', { category: 'OVERHEAD' }],
      ['条件', { condition: '夜間' }],
      ['換算の数量', { conversionQuantity: '12' }],
      ['換算の単位', { conversionUnit: 'm2' }],
      ['換算の単価', { conversionUnitPrice: '1000' }],
      ['換算の根拠', { conversionBasis: '外周' }],
      ['分類キー', { classificationKey: 'K-01' }],
      ['数量表の行のキー', { quantityRowKey: 'row-1' }],
      ['参考の印', { isReference: true }],
      ['参考の理由', { referenceReason: '理由' }],
    ];
    it.each(cases)('%s が異なる場合は dirty=true', (_label, change) => {
      const snap = makeSnapshot({ lineItems: [makeLineItem()] });
      const cur = makeSnapshot({ lineItems: [makeLineItem(change)] });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('省略された欄と既定の値（区分は直接工事・文字は空・参考の印は無）は等価として扱う', () => {
      const snap = makeSnapshot({ lineItems: [makeLineItem()] });
      const cur = makeSnapshot({
        lineItems: [
          makeLineItem({
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
          }),
        ],
      });
      expect(isFormDirty(cur, snap)).toBe(false);
    });
  });

  describe('台帳の情報と業者名', () => {
    const ledger = createLedgerInfoFormData();

    it('台帳の情報が同じなら dirty=false', () => {
      const snap = makeSnapshot({ ledgerInfo: ledger });
      expect(isFormDirty(makeSnapshot({ ledgerInfo: { ...ledger } }), snap)).toBe(false);
    });

    it.each<[string, Partial<LedgerInfoFormData>]>([
      ['見積番号', { quoteNumber: 'Q-1' }],
      ['採否', { adoption: 'ADOPTED' }],
      ['読取の確認', { readingStatus: 'CONFIRMED' }],
      ['工事価格', { constructionPrice: '100' }],
      ['見積の区別', { quoteDiscriminator: '第2案' }],
    ])('台帳の情報の %s が異なる場合は dirty=true', (_label, change) => {
      const snap = makeSnapshot({ ledgerInfo: ledger });
      const cur = makeSnapshot({ ledgerInfo: { ...ledger, ...change } });
      expect(isFormDirty(cur, snap)).toBe(true);
    });

    it('業者名が異なる場合は dirty=true、取引先の ID だけが異なる場合も dirty=true', () => {
      const snap = makeSnapshot({ vendor: { vendorName: '業者A', tradingPartnerId: 'tp-1' } });
      expect(
        isFormDirty(makeSnapshot({ vendor: { vendorName: '業者B', tradingPartnerId: null } }), snap)
      ).toBe(true);
      expect(
        isFormDirty(makeSnapshot({ vendor: { vendorName: '業者A', tradingPartnerId: null } }), snap)
      ).toBe(true);
      expect(
        isFormDirty(
          makeSnapshot({ vendor: { vendorName: '業者A', tradingPartnerId: 'tp-1' } }),
          snap
        )
      ).toBe(false);
    });
  });
});

// ============================================================================
// useUnsavedChangesGuard カスタムフックのテスト (Requirements: 38.12, 38.13)
// ============================================================================

describe('useUnsavedChangesGuard (Task 81.3, Requirements: 38.12, 38.13)', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm');
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe('beforeunload リスナの登録 (Requirements: 38.13)', () => {
    it('isDirty=true の場合に beforeunload リスナが登録される', () => {
      renderHook(() => useUnsavedChangesGuard(true));

      const beforeUnloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === 'beforeunload'
      );
      expect(beforeUnloadCalls.length).toBe(1);
    });

    it('isDirty=false の場合は beforeunload リスナが登録されない', () => {
      renderHook(() => useUnsavedChangesGuard(false));

      const beforeUnloadCalls = addEventListenerSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === 'beforeunload'
      );
      expect(beforeUnloadCalls.length).toBe(0);
    });

    it('isDirty=true の beforeunload ハンドラは preventDefault と returnValue 設定を行う', () => {
      renderHook(() => useUnsavedChangesGuard(true));

      const beforeUnloadCall = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'beforeunload'
      );
      expect(beforeUnloadCall).toBeDefined();
      const handler = beforeUnloadCall![1] as (e: BeforeUnloadEvent) => void;

      // ダミーイベントで挙動を検証
      const preventDefault = vi.fn();
      const event = {
        preventDefault,
        returnValue: undefined as unknown as string,
      } as unknown as BeforeUnloadEvent;
      handler(event);

      expect(preventDefault).toHaveBeenCalled();
      expect(event.returnValue).toBe('');
    });

    it('アンマウント時に beforeunload リスナが解除される', () => {
      const { unmount } = renderHook(() => useUnsavedChangesGuard(true));

      // 登録時のハンドラ参照を取得
      const beforeUnloadCall = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'beforeunload'
      );
      const registeredHandler = beforeUnloadCall?.[1];
      expect(registeredHandler).toBeDefined();

      unmount();

      const removeCall = removeEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'beforeunload' && call[1] === registeredHandler
      );
      expect(removeCall).toBeDefined();
    });

    it('isDirty=true → false の遷移時にリスナが解除される', () => {
      const { rerender } = renderHook(
        ({ dirty }: { dirty: boolean }) => useUnsavedChangesGuard(dirty),
        {
          initialProps: { dirty: true },
        }
      );

      const beforeUnloadCall = addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'beforeunload'
      );
      const registeredHandler = beforeUnloadCall?.[1];
      expect(registeredHandler).toBeDefined();

      rerender({ dirty: false });

      const removeCall = removeEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'beforeunload' && call[1] === registeredHandler
      );
      expect(removeCall).toBeDefined();
    });
  });

  describe('confirmCloseIfDirty コールバック (Requirements: 38.12)', () => {
    it('isDirty=false の場合は確認ダイアログを表示せず true を返す', () => {
      const { result } = renderHook(() => useUnsavedChangesGuard(false));

      const ret = result.current.confirmCloseIfDirty();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(ret).toBe(true);
    });

    it('isDirty=true の場合に window.confirm を仕様メッセージで呼び出す', () => {
      confirmSpy.mockReturnValueOnce(true);
      const { result } = renderHook(() => useUnsavedChangesGuard(true));

      result.current.confirmCloseIfDirty();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CHANGES_CONFIRM_MESSAGE);
      expect(UNSAVED_CHANGES_CONFIRM_MESSAGE).toBe(
        '変更が保存されていません。閉じてもよろしいですか？'
      );
    });

    it('isDirty=true で confirm が true を返した場合に true を返す', () => {
      confirmSpy.mockReturnValueOnce(true);
      const { result } = renderHook(() => useUnsavedChangesGuard(true));

      expect(result.current.confirmCloseIfDirty()).toBe(true);
    });

    it('isDirty=true で confirm が false を返した場合に false を返す', () => {
      confirmSpy.mockReturnValueOnce(false);
      const { result } = renderHook(() => useUnsavedChangesGuard(true));

      expect(result.current.confirmCloseIfDirty()).toBe(false);
    });
  });
});
