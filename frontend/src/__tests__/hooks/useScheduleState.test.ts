/**
 * @vitest-environment jsdom
 */

/**
 * @fileoverview useScheduleState フックのユニットテスト
 *
 * Task 6.2: useScheduleState フックを実装する
 * Task 15.1: useScheduleStateフックの単体テスト作成
 *
 * Requirements:
 * - REQ-3.3: 着工日と日数から完了日を自動算出
 * - REQ-3.4: 着工日未入力バリデーション
 * - REQ-3.5: 日数0以下バリデーション
 * - REQ-4.1: 任意項目追加
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-4.3: 任意項目削除
 * - REQ-4.4: 数量表由来・任意項目の混在管理
 * - REQ-5.2: 並び順リアルタイム反映
 * - REQ-6.1: ガントチャートリアルタイム更新
 * - REQ-6.6: サーバー通信なしの更新
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScheduleState, calculateEndDate } from '../../hooks/useScheduleState';
import type { ScheduleDetail } from '../../api/schedules';

// schedules APIをモック
vi.mock('../../api/schedules', () => ({
  bulkSaveScheduleItems: vi.fn(),
}));

import { bulkSaveScheduleItems } from '../../api/schedules';

// テストデータ
const mockScheduleDetail: ScheduleDetail = {
  id: 'schedule-1',
  projectId: 'project-1',
  name: 'テスト工程表',
  quantityTableId: 'qt-1',
  quantityTableName: '数量表A',
  items: [
    {
      id: 'item-1',
      sourceType: 'QUANTITY_TABLE',
      sourceQuantityItemId: 'qi-1',
      itemName: '基礎工事',
      labelText: '基礎',
      detailText: 'コンクリート打設',
      startDate: '2026-04-01',
      duration: 10,
      displayOrder: 0,
      isExportTarget: true,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'item-2',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '仮設工事',
      labelText: '仮設',
      detailText: '足場設置',
      startDate: '2026-04-15',
      duration: 5,
      displayOrder: 1,
      isExportTarget: true,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
  ],
  version: 1,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

describe('useScheduleState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 初期化
  // ==========================================================================
  describe('初期化', () => {
    it('工程表データからStateを初期化する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      expect(result.current.state.schedule.id).toBe('schedule-1');
      expect(result.current.state.schedule.name).toBe('テスト工程表');
      expect(result.current.state.schedule.version).toBe(1);
      expect(result.current.state.items).toHaveLength(2);
      expect(result.current.state.isDirty).toBe(false);
    });

    it('各項目にendDateが自動算出されている', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      // 2026-04-01 + 10日 = 2026-04-10
      expect(result.current.state.items[0]!.endDate).toBe('2026-04-10');
      // 2026-04-15 + 5日 = 2026-04-19
      expect(result.current.state.items[1]!.endDate).toBe('2026-04-19');
    });

    it('着工日または日数がnullの場合はendDateがnullになる', () => {
      const detailWithNull: ScheduleDetail = {
        ...mockScheduleDetail,
        items: [
          {
            ...mockScheduleDetail.items[0]!,
            startDate: null,
            duration: null,
          },
        ],
      };
      const { result } = renderHook(() => useScheduleState(detailWithNull));

      expect(result.current.state.items[0]!.endDate).toBeNull();
    });
  });

  // ==========================================================================
  // 項目追加 (REQ-4.1)
  // ==========================================================================
  describe('addItem', () => {
    it('新しい任意項目を追加する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.addItem();
      });

      expect(result.current.state.items).toHaveLength(3);
      const newItem = result.current.state.items[2]!;
      expect(newItem.sourceType).toBe('MANUAL');
      expect(newItem.sourceQuantityItemId).toBeNull();
      expect(newItem.itemName).toBe('');
      expect(newItem.startDate).toBeNull();
      expect(newItem.duration).toBeNull();
      expect(newItem.displayOrder).toBe(2);
      expect(newItem.isExportTarget).toBe(true);
    });

    it('項目追加でdirty stateがtrueになる', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      expect(result.current.state.isDirty).toBe(false);

      act(() => {
        result.current.addItem();
      });

      expect(result.current.state.isDirty).toBe(true);
    });
  });

  // ==========================================================================
  // 項目削除 (REQ-4.3)
  // ==========================================================================
  describe('removeItem', () => {
    it('指定した項目を削除する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.removeItem('item-2');
      });

      expect(result.current.state.items).toHaveLength(1);
      expect(result.current.state.items[0]!.id).toBe('item-1');
    });

    it('項目削除でdirty stateがtrueになる', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.removeItem('item-1');
      });

      expect(result.current.state.isDirty).toBe(true);
    });

    it('削除後のdisplayOrderが再計算される', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.removeItem('item-1');
      });

      expect(result.current.state.items[0]!.displayOrder).toBe(0);
    });
  });

  // ==========================================================================
  // 項目更新 (REQ-4.2, REQ-6.1, REQ-6.6)
  // ==========================================================================
  describe('updateItem', () => {
    it('項目のフィールドを更新する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { itemName: '更新された基礎工事' });
      });

      expect(result.current.state.items[0]!.itemName).toBe('更新された基礎工事');
    });

    it('着工日を変更するとendDateが再算出される', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { startDate: '2026-05-01' });
      });

      // 2026-05-01 + 10日 = 2026-05-10
      expect(result.current.state.items[0]!.endDate).toBe('2026-05-10');
    });

    it('日数を変更するとendDateが再算出される', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { duration: 20 });
      });

      // 2026-04-01 + 20日 = 2026-04-20
      expect(result.current.state.items[0]!.endDate).toBe('2026-04-20');
    });

    it('着工日をnullにするとendDateがnullになる', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { startDate: null });
      });

      expect(result.current.state.items[0]!.endDate).toBeNull();
    });

    it('日数をnullにするとendDateがnullになる', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { duration: null });
      });

      expect(result.current.state.items[0]!.endDate).toBeNull();
    });

    it('ラベル文字を更新する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '新ラベル' });
      });

      expect(result.current.state.items[0]!.labelText).toBe('新ラベル');
    });

    it('詳細文字を更新する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { detailText: '新詳細' });
      });

      expect(result.current.state.items[0]!.detailText).toBe('新詳細');
    });

    it('出力対象チェックボックスを変更する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { isExportTarget: false });
      });

      expect(result.current.state.items[0]!.isExportTarget).toBe(false);
    });

    it('項目更新でdirty stateがtrueになる', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '新ラベル' });
      });

      expect(result.current.state.isDirty).toBe(true);
    });
  });

  // ==========================================================================
  // 完了日自動算出 (REQ-3.3)
  // ==========================================================================
  describe('完了日自動算出', () => {
    it('着工日と日数から完了日を正しく算出する（カレンダー日ベース）', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      // 2026-04-01 + 10日 = 2026-04-10
      expect(result.current.state.items[0]!.startDate).toBe('2026-04-01');
      expect(result.current.state.items[0]!.duration).toBe(10);
      expect(result.current.state.items[0]!.endDate).toBe('2026-04-10');
    });

    it('月をまたぐ場合の完了日算出', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { startDate: '2026-01-25', duration: 15 });
      });

      // 2026-01-25 + 15日 = 2026-02-08
      expect(result.current.state.items[0]!.endDate).toBe('2026-02-08');
    });

    it('年をまたぐ場合の完了日算出', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { startDate: '2026-12-25', duration: 15 });
      });

      // 2026-12-25 + 15日 = 2027-01-08
      expect(result.current.state.items[0]!.endDate).toBe('2027-01-08');
    });
  });

  // ==========================================================================
  // 並び替え (REQ-5.2)
  // ==========================================================================
  describe('reorderItems', () => {
    it('項目の並び順を変更する', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.reorderItems(0, 1);
      });

      expect(result.current.state.items[0]!.id).toBe('item-2');
      expect(result.current.state.items[1]!.id).toBe('item-1');
    });

    it('並び替え後のdisplayOrderが再計算される', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.reorderItems(0, 1);
      });

      expect(result.current.state.items[0]!.displayOrder).toBe(0);
      expect(result.current.state.items[1]!.displayOrder).toBe(1);
    });

    it('並び替えでdirty stateがtrueになる', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.reorderItems(0, 1);
      });

      expect(result.current.state.isDirty).toBe(true);
    });
  });

  // ==========================================================================
  // 保存 (REQ-6.6)
  // ==========================================================================
  describe('save', () => {
    it('バルク保存APIを呼び出す', async () => {
      const mockResult = {
        updatedItemCount: 2,
        updatedAt: '2026-03-14T10:00:00Z',
      };
      vi.mocked(bulkSaveScheduleItems).mockResolvedValueOnce(mockResult);

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '新ラベル' });
      });

      await act(async () => {
        await result.current.save();
      });

      expect(bulkSaveScheduleItems).toHaveBeenCalledWith('schedule-1', {
        version: 1,
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'item-1',
            itemName: '基礎工事',
            labelText: '新ラベル',
          }),
        ]),
      });
    });

    it('保存成功後にdirty stateがfalseになる', async () => {
      const mockResult = {
        updatedItemCount: 2,
        updatedAt: '2026-03-14T10:00:00Z',
      };
      vi.mocked(bulkSaveScheduleItems).mockResolvedValueOnce(mockResult);

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '新ラベル' });
      });

      expect(result.current.state.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.state.isDirty).toBe(false);
    });

    it('保存中はisLoadingがtrueになる', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(bulkSaveScheduleItems).mockReturnValueOnce(
        pendingPromise as Promise<{ updatedItemCount: number; updatedAt: string }>
      );

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '新ラベル' });
      });

      let savePromise: Promise<void>;
      act(() => {
        savePromise = result.current.save();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise!({ updatedItemCount: 2, updatedAt: '2026-03-14T10:00:00Z' });
        await savePromise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('保存失敗時にerrorがセットされる', async () => {
      vi.mocked(bulkSaveScheduleItems).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '新ラベル' });
      });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.error).toBe('Network error');
      // 保存失敗時はdirtyのまま
      expect(result.current.state.isDirty).toBe(true);
    });

    it('新規追加項目（temp-id）は保存時にid=nullで送信される', async () => {
      const mockResult = {
        updatedItemCount: 3,
        updatedAt: '2026-03-14T10:00:00Z',
      };
      vi.mocked(bulkSaveScheduleItems).mockResolvedValueOnce(mockResult);

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.addItem();
      });

      await act(async () => {
        await result.current.save();
      });

      const callArgs = vi.mocked(bulkSaveScheduleItems).mock.calls[0]!;
      const savedItems = callArgs[1].items;
      // 新規項目（temp-で始まるID）はnullで送信される
      const newItem = savedItems.find((item: { id: string | null }) => item.id === null);
      expect(newItem).toBeDefined();
    });

    it('Error以外の例外でもデフォルトのエラーメッセージがセットされる', async () => {
      vi.mocked(bulkSaveScheduleItems).mockRejectedValueOnce('unknown error');

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.error).toBe('保存に失敗しました');
    });
  });

  // ==========================================================================
  // Task 15.1: calculateEndDate 関数の独立テスト (REQ-3.3)
  // ==========================================================================
  describe('calculateEndDate', () => {
    it('正常な着工日と日数から完了日を算出する', () => {
      expect(calculateEndDate('2026-04-01', 1)).toBe('2026-04-01');
      expect(calculateEndDate('2026-04-01', 5)).toBe('2026-04-05');
      expect(calculateEndDate('2026-04-01', 10)).toBe('2026-04-10');
    });

    it('着工日がnullの場合はnullを返す', () => {
      expect(calculateEndDate(null, 5)).toBeNull();
    });

    it('日数がnullの場合はnullを返す', () => {
      expect(calculateEndDate('2026-04-01', null)).toBeNull();
    });

    it('両方nullの場合はnullを返す', () => {
      expect(calculateEndDate(null, null)).toBeNull();
    });

    it('無効な日付文字列の場合はnullを返す', () => {
      expect(calculateEndDate('invalid-date', 5)).toBeNull();
    });

    it('月末をまたぐ計算が正しい', () => {
      // 2026-01-30 + 5日 = 2026-02-03
      expect(calculateEndDate('2026-01-30', 5)).toBe('2026-02-03');
    });

    it('閏年を正しく処理する', () => {
      // 2028年は閏年: 2028-02-28 + 2日 = 2028-02-29
      expect(calculateEndDate('2028-02-28', 2)).toBe('2028-02-29');
    });

    it('年末をまたぐ計算が正しい', () => {
      // 2026-12-30 + 5日 = 2027-01-03
      expect(calculateEndDate('2026-12-30', 5)).toBe('2027-01-03');
    });

    it('日数1の場合は着工日と同日を返す', () => {
      expect(calculateEndDate('2026-04-01', 1)).toBe('2026-04-01');
    });
  });

  // ==========================================================================
  // Task 15.1: バリデーションロジック (REQ-3.4, REQ-3.5)
  // ==========================================================================
  describe('バリデーションロジック', () => {
    describe('REQ-3.4: 着工日未入力時のバリデーション', () => {
      it('着工日がnullで日数が入力されている場合、完了日はnullのまま', () => {
        const detailWithValidation: ScheduleDetail = {
          ...mockScheduleDetail,
          items: [
            {
              ...mockScheduleDetail.items[0]!,
              startDate: null,
              duration: 10,
            },
          ],
        };
        const { result } = renderHook(() => useScheduleState(detailWithValidation));

        // 着工日未入力なのでendDateはnull（完了日算出不可）
        expect(result.current.state.items[0]!.startDate).toBeNull();
        expect(result.current.state.items[0]!.duration).toBe(10);
        expect(result.current.state.items[0]!.endDate).toBeNull();
      });

      it('着工日を後からnullに変更すると完了日もnullになる', () => {
        const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

        // 最初はendDateが算出されている
        expect(result.current.state.items[0]!.endDate).toBe('2026-04-10');

        act(() => {
          result.current.updateItem('item-1', { startDate: null });
        });

        expect(result.current.state.items[0]!.endDate).toBeNull();
      });
    });

    describe('REQ-3.5: 日数0以下のバリデーション', () => {
      it('日数が0の場合、完了日は着工日の前日になる（カレンダー日ベース計算）', () => {
        const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

        act(() => {
          result.current.updateItem('item-1', { duration: 0 });
        });

        // duration=0: startDate + 0 - 1 = 前日（計算結果は業務的にはバリデーションエラー対象）
        // calculateEndDate は計算自体は行うが、UIレイヤーでバリデーションを表示する
        expect(result.current.state.items[0]!.duration).toBe(0);
        expect(result.current.state.items[0]!.endDate).toBe('2026-03-31');
      });

      it('日数が負の値の場合、endDateは着工日以前の日付になる', () => {
        const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

        act(() => {
          result.current.updateItem('item-1', { duration: -1 });
        });

        // duration=-1: startDate + (-1) - 1 = 2日前
        expect(result.current.state.items[0]!.duration).toBe(-1);
        expect(result.current.state.items[0]!.endDate).toBe('2026-03-30');
      });
    });
  });

  // ==========================================================================
  // Task 15.1: dirty state管理の詳細テスト
  // ==========================================================================
  describe('dirty state管理', () => {
    it('初期状態ではdirtyがfalse', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));
      expect(result.current.state.isDirty).toBe(false);
    });

    it('複数操作後もdirtyがtrue', () => {
      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.addItem();
      });
      act(() => {
        result.current.updateItem('item-1', { labelText: '変更' });
      });
      act(() => {
        result.current.removeItem('item-2');
      });

      expect(result.current.state.isDirty).toBe(true);
    });

    it('保存成功後にdirtyがfalseにリセットされる', async () => {
      vi.mocked(bulkSaveScheduleItems).mockResolvedValueOnce({
        updatedItemCount: 2,
        updatedAt: '2026-03-14T10:00:00Z',
      });

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.addItem();
      });

      expect(result.current.state.isDirty).toBe(true);

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.state.isDirty).toBe(false);
    });

    it('保存失敗後もdirtyがtrueのまま維持される', async () => {
      vi.mocked(bulkSaveScheduleItems).mockRejectedValueOnce(new Error('保存エラー'));

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.addItem();
      });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.state.isDirty).toBe(true);
    });

    it('保存成功後に再度変更するとdirtyがtrueに戻る', async () => {
      vi.mocked(bulkSaveScheduleItems).mockResolvedValueOnce({
        updatedItemCount: 2,
        updatedAt: '2026-03-14T10:00:00Z',
      });

      const { result } = renderHook(() => useScheduleState(mockScheduleDetail));

      act(() => {
        result.current.updateItem('item-1', { labelText: '変更1' });
      });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.state.isDirty).toBe(false);

      act(() => {
        result.current.updateItem('item-1', { labelText: '変更2' });
      });

      expect(result.current.state.isDirty).toBe(true);
    });
  });
});
