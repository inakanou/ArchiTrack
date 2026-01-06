/**
 * @fileoverview 数量表保存フックのテスト
 *
 * Task 8.2: 手動保存と整合性チェックを実装する
 *
 * Requirements:
 * - 11.1: 数量表の各フィールドの変更内容を保存する
 * - 11.4: 楽観的排他制御エラー（競合）が発生した場合、再読み込みを促すダイアログを表示する
 * - 11.5: 自動保存が有効な状態で、一定間隔で数量表を自動保存する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuantityTableSave } from './useQuantityTableSave';
import type { QuantityTableEdit, QuantityGroupEdit, QuantityItemEdit } from '../types/quantity-edit.types';

// localStorageのモック
const localStorageMock: Record<string, string> = {};

describe('useQuantityTableSave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => localStorageMock[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      localStorageMock[key] = value;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
      delete localStorageMock[key];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.keys(localStorageMock).forEach((key) => delete localStorageMock[key]);
  });

  const mockQuantityTable: QuantityTableEdit = {
    id: 'qt-001',
    projectId: 'proj-001',
    project: { id: 'proj-001', name: 'Test Project' },
    name: 'Test Quantity Table',
    groupCount: 1,
    itemCount: 2,
    groups: [
      {
        id: 'qg-001',
        quantityTableId: 'qt-001',
        name: 'Group 1',
        surveyImageId: null,
        surveyImage: null,
        displayOrder: 0,
        items: [
          {
            id: 'qi-001',
            quantityGroupId: 'qg-001',
            majorCategory: '躯体',
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            workType: 'コンクリート工',
            name: '普通コンクリート',
            specification: '24-12-20',
            unit: 'm3',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: 100,
            remarks: null,
            displayOrder: 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          } as QuantityItemEdit,
        ],
        isExpanded: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      } as QuantityGroupEdit,
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  describe('保存状態管理', () => {
    it('初期状態が正しいこと', () => {
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
        })
      );

      expect(result.current.saveStatus).toBe('idle');
      expect(result.current.isSaving).toBe(false);
      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.lastSavedAt).toBeNull();
      expect(result.current.validationErrors).toEqual([]);
    });

    it('変更追跡が正しく機能すること', () => {
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false, // 自動保存を無効化
        })
      );

      act(() => {
        result.current.markAsChanged();
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('保存成功後にhasUnsavedChangesがfalseになること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          onSave,
        })
      );

      act(() => {
        result.current.markAsChanged();
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe('バリデーション', () => {
    it('必須フィールドが空の場合にバリデーションエラーを返すこと', () => {
      const baseGroup = mockQuantityTable.groups[0]!;
      const baseItem = baseGroup.items[0]!;
      const invalidTable: QuantityTableEdit = {
        ...mockQuantityTable,
        groups: [
          {
            ...baseGroup,
            items: [
              {
                ...baseItem,
                majorCategory: '', // 必須フィールドが空
                workType: '', // 必須フィールドが空
                name: '', // 必須フィールドが空
                unit: '', // 必須フィールドが空
              } as QuantityItemEdit,
            ],
          } as QuantityGroupEdit,
        ],
      };

      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: invalidTable,
          enabled: true,
          autoSaveEnabled: false,
        })
      );

      const errors = result.current.validate();

      expect(errors).toContainEqual(
        expect.objectContaining({
          path: expect.stringContaining('majorCategory'),
          message: expect.stringContaining('必須'),
        })
      );
      expect(errors).toContainEqual(
        expect.objectContaining({
          path: expect.stringContaining('workType'),
          message: expect.stringContaining('必須'),
        })
      );
      expect(errors).toContainEqual(
        expect.objectContaining({
          path: expect.stringContaining('name'),
          message: expect.stringContaining('必須'),
        })
      );
      expect(errors).toContainEqual(
        expect.objectContaining({
          path: expect.stringContaining('unit'),
          message: expect.stringContaining('必須'),
        })
      );
    });

    it('有効なデータの場合はバリデーションエラーが空であること', () => {
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
        })
      );

      const errors = result.current.validate();
      expect(errors).toHaveLength(0);
    });

    it('saveメソッドがバリデーションエラー時に保存をスキップすること', async () => {
      const baseGroup2 = mockQuantityTable.groups[0]!;
      const baseItem2 = baseGroup2.items[0]!;
      const invalidTable: QuantityTableEdit = {
        ...mockQuantityTable,
        groups: [
          {
            ...baseGroup2,
            items: [
              {
                ...baseItem2,
                majorCategory: '', // 必須フィールドが空
              } as QuantityItemEdit,
            ],
          } as QuantityGroupEdit,
        ],
      };

      const onValidationError = vi.fn();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: invalidTable,
          enabled: true,
          autoSaveEnabled: false,
          onValidationError,
          onSave,
        })
      );

      await act(async () => {
        await result.current.save();
      });

      expect(onValidationError).toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
      expect(result.current.saveStatus).toBe('error');
    });
  });

  describe('整合性チェック', () => {
    it('checkIntegrityが整合性の問題を検出すること', () => {
      const baseGroup3 = mockQuantityTable.groups[0]!;
      const baseItem3 = baseGroup3.items[0]!;
      const tableWithIntegrityIssue: QuantityTableEdit = {
        ...mockQuantityTable,
        groups: [
          {
            ...baseGroup3,
            items: [
              {
                ...baseItem3,
                calculationMethod: 'AREA_VOLUME',
                calculationParams: null, // AREA_VOLUMEなのにパラメータがない
              } as QuantityItemEdit,
            ],
          } as QuantityGroupEdit,
        ],
      };

      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: tableWithIntegrityIssue,
          enabled: true,
          autoSaveEnabled: false,
        })
      );

      const integrityIssues = result.current.checkIntegrity();
      expect(integrityIssues.length).toBeGreaterThan(0);
    });

    it('整合性のあるデータでは空の配列を返すこと', () => {
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
        })
      );

      const integrityIssues = result.current.checkIntegrity();
      // STANDARDモードで計算パラメータがnullの場合は問題なし
      // quantity=100なので0の警告もなし
      // adjustmentFactor=1.0なので問題なし
      expect(integrityIssues).toHaveLength(0);
    });
  });

  describe('楽観的排他制御', () => {
    it('競合エラー時にconflictErrorフラグが立つこと', () => {
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
        })
      );

      // 競合をシミュレート
      act(() => {
        result.current.setConflictError(true, '2025-01-02T00:00:00.000Z');
      });

      expect(result.current.hasConflict).toBe(true);
      expect(result.current.serverUpdatedAt).toBe('2025-01-02T00:00:00.000Z');
    });

    it('resolveConflictで競合解決ができること', async () => {
      const onReload = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          onReload,
        })
      );

      act(() => {
        result.current.setConflictError(true, '2025-01-02T00:00:00.000Z');
      });

      await act(async () => {
        await result.current.resolveConflict('reload');
      });

      expect(onReload).toHaveBeenCalled();
      expect(result.current.hasConflict).toBe(false);
    });

    it('競合解決でforceOverwriteを選択した場合は強制保存すること', async () => {
      const onForceSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          onForceSave,
        })
      );

      act(() => {
        result.current.setConflictError(true, '2025-01-02T00:00:00.000Z');
      });

      await act(async () => {
        await result.current.resolveConflict('forceOverwrite');
      });

      expect(onForceSave).toHaveBeenCalled();
    });
  });

  describe('保存実行', () => {
    it('save実行中はisSaving=trueになること', async () => {
      let resolvePromise: () => void;
      const onSave = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePromise = resolve;
          })
      );

      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          onSave,
        })
      );

      // 保存開始
      act(() => {
        result.current.save();
      });

      // 非同期処理の開始を待つ
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isSaving).toBe(true);
      expect(result.current.saveStatus).toBe('saving');

      // 保存完了
      await act(async () => {
        resolvePromise!();
        await Promise.resolve();
      });

      expect(result.current.isSaving).toBe(false);
      expect(result.current.saveStatus).toBe('saved');
    });

    it('保存成功時にlastSavedAtが更新されること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          onSave,
        })
      );

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.lastSavedAt).not.toBeNull();
    });

    it('保存失敗時にsaveStatus=errorになること', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          onSave,
        })
      );

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.saveStatus).toBe('error');
      expect(result.current.saveError).toBe('Save failed');
    });
  });

  describe('自動保存', () => {
    it('自動保存がトリガーされること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: true,
          autoSaveDebounceMs: 1500,
          onSave,
        })
      );

      act(() => {
        result.current.markAsChanged();
      });

      // デバウンス時間経過前
      expect(onSave).not.toHaveBeenCalled();

      // デバウンス時間経過
      await act(async () => {
        vi.advanceTimersByTime(1500);
        await vi.runAllTimersAsync();
      });

      expect(onSave).toHaveBeenCalled();
    });

    it('autoSaveEnabled=falseの場合は自動保存されないこと', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          autoSaveDebounceMs: 1500,
          onSave,
        })
      );

      act(() => {
        result.current.markAsChanged();
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();
      });

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('ドラフト保存', () => {
    it('変更時にドラフトが保存されること', () => {
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          draftKey: 'qt-draft-qt-001',
        })
      );

      act(() => {
        result.current.markAsChanged();
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'qt-draft-qt-001',
        expect.any(String)
      );
    });

    it('loadDraftでドラフトを復元できること', () => {
      const draftData = { ...mockQuantityTable, name: 'Draft Version' };
      localStorageMock['qt-draft-qt-001'] = JSON.stringify(draftData);

      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          draftKey: 'qt-draft-qt-001',
        })
      );

      const draft = result.current.loadDraft();
      expect(draft).toEqual(draftData);
    });

    it('保存成功後にドラフトがクリアされること', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useQuantityTableSave({
          quantityTable: mockQuantityTable,
          enabled: true,
          autoSaveEnabled: false,
          draftKey: 'qt-draft-qt-001',
          onSave,
        })
      );

      await act(async () => {
        await result.current.save();
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith('qt-draft-qt-001');
    });
  });
});
