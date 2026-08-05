/**
 * @fileoverview useEstimateNavigation フックのテスト
 *
 * Task 54.1: 表示状態の管理
 *
 * 表示モード・現在階層・選択範囲・展開状態・カーソル位置を編集状態と分離して
 * 保持することと、表示状態の変更が編集状態（＝保存ペイロード）へ一切影響しない
 * ことを検証します。
 *
 * Requirements (estimate-creation):
 * - 44.1: 連続する複数の明細行を範囲として選択可能とする
 * - 44.2: 範囲選択を解除した場合、単一項目の選択なしの状態に戻す
 * - 44.8: 複数行が選択されている場合、選択中の行数を画面上に表示する（行数の供給）
 * - 45.10: 階層表示モードを切り替えても未保存の編集内容を保持する
 *
 * Design: design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`（:3833-3855）、
 * `**表示状態**: ... いずれも保存ペイロードに含めない`（:3544）、
 * `Domain boundaries: 「編集状態（保存対象）」と「表示状態（保存対象外）」を別フックに分離する`（:3683）
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEstimateNavigation } from './useEstimateNavigation';
import {
  useEstimateEditor,
  type EstimateEditorSavePayload,
  type EstimateItemHierarchyEdit,
} from './useEstimateEditor';
import type {
  EditableItem,
  EditableLine,
  EstimateLineType,
} from '../domain/estimate/estimateEditReducer.types';

// ============================================================================
// テストデータ
// ============================================================================

const createLine = (lineType: EstimateLineType, name: string): EditableLine => ({
  id: `line-${name}-${lineType}`,
  lineType,
  name,
  specification: null,
  unit: null,
  quantity: null,
  unitPrice: null,
  amount: '1000',
  remarks: null,
  sourceVendorName: null,
});

const createItem = (
  id: string,
  name: string,
  children: readonly EditableItem[] = []
): EditableItem => ({
  id,
  tempId: null,
  itemType: 'STANDARD',
  lines: [createLine('ESTIMATE', name), createLine('EXECUTION', name), createLine('VENDOR', name)],
  children,
});

/**
 * 表示順（先行順）は item-a, item-a1, item-a2, item-b, item-c
 */
const createTree = (): readonly EditableItem[] => [
  createItem('item-a', 'A', [createItem('item-a1', 'A1'), createItem('item-a2', 'A2')]),
  createItem('item-b', 'B'),
  createItem('item-c', 'C'),
];

// ============================================================================
// 表示モード（45.1, 45.2）
// ============================================================================

describe('useEstimateNavigation', () => {
  describe('表示モード', () => {
    /** @requirement estimate-creation/REQ-45.2 */
    it('既定の表示モードはツリー表示である', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      expect(result.current.viewMode).toBe('tree');
    });

    /** @requirement estimate-creation/REQ-45.1 */
    it('表示モードをドリルダウン表示へ切り替えられる', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.setViewMode('drilldown');
      });

      expect(result.current.viewMode).toBe('drilldown');
    });

    /** @requirement estimate-creation/REQ-45.1 */
    it('初期表示モードを外部から与えられる（永続化した値の引き継ぎ口）', () => {
      const { result } = renderHook(() =>
        useEstimateNavigation({ items: createTree(), initialViewMode: 'drilldown' })
      );

      expect(result.current.viewMode).toBe('drilldown');
    });
  });

  // ==========================================================================
  // 現在階層（45.6）
  // ==========================================================================

  describe('現在階層', () => {
    /** @requirement estimate-creation/REQ-45.6 */
    it('既定の現在階層はルート階層（null）である', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      expect(result.current.currentLevelKey).toBeNull();
    });

    /** @requirement estimate-creation/REQ-45.6 */
    it('ドリルダウン表示では現在階層に属する項目のみが表示対象になる', () => {
      const { result } = renderHook(() =>
        useEstimateNavigation({ items: createTree(), initialViewMode: 'drilldown' })
      );

      expect(result.current.visibleKeys).toEqual(['item-a', 'item-b', 'item-c']);

      act(() => {
        result.current.setCurrentLevelKey('item-a');
      });

      expect(result.current.currentLevelKey).toBe('item-a');
      expect(result.current.visibleKeys).toEqual(['item-a1', 'item-a2']);
    });

    /**
     * 54.3 のレビュー申し送り: `EstimateItemDrilldownView` は現在階層のキーが
     * ツリーに無い場合（編集で削除された等）ルート階層へ落として一覧する。
     * 本フックの `visibleKeys` が空を返すと、画面に見えている行とキー操作の
     * 対象行（54.6 は `visibleKeys` を基準に動く）が食い違う。
     *
     * @requirement estimate-creation/REQ-45.6
     */
    it('現在階層の項目が編集で消えた場合はビューと同じくルート階層を表示対象にする', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useEstimateNavigation({ items, initialViewMode: 'drilldown' }),
        { initialProps: { items: createTree() } }
      );

      act(() => {
        result.current.setCurrentLevelKey('item-a');
      });
      expect(result.current.visibleKeys).toEqual(['item-a1', 'item-a2']);

      // item-a を削除した編集結果を流し込む（現在階層のキーが陳腐化する）
      rerender({ items: [createItem('item-b', 'B'), createItem('item-c', 'C')] });

      expect(result.current.currentLevelKey).toBe('item-a');
      expect(result.current.visibleKeys).toEqual(['item-b', 'item-c']);
    });

    /** @requirement estimate-creation/REQ-45.3 */
    it('ツリー表示では現在階層に関わらず全階層が表示対象になる', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.setCurrentLevelKey('item-a');
      });

      expect(result.current.visibleKeys).toEqual([
        'item-a',
        'item-a1',
        'item-a2',
        'item-b',
        'item-c',
      ]);
    });
  });

  // ==========================================================================
  // 展開状態（45.4, 45.5）
  // ==========================================================================

  describe('展開状態', () => {
    /** @requirement estimate-creation/REQ-45.3 */
    it('既定ではすべての項目が展開されている', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      expect(result.current.collapsedKeys.size).toBe(0);
      expect(result.current.isCollapsed('item-a')).toBe(false);
    });

    /** @requirement estimate-creation/REQ-45.5 */
    it('折りたたむと子孫が表示対象から外れ、再度切り替えると戻る', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.toggleCollapsed('item-a');
      });

      expect(result.current.isCollapsed('item-a')).toBe(true);
      expect(result.current.visibleKeys).toEqual(['item-a', 'item-b', 'item-c']);

      act(() => {
        result.current.toggleCollapsed('item-a');
      });

      expect(result.current.isCollapsed('item-a')).toBe(false);
      expect(result.current.visibleKeys).toEqual([
        'item-a',
        'item-a1',
        'item-a2',
        'item-b',
        'item-c',
      ]);
    });
  });

  // ==========================================================================
  // 一括の展開・折りたたみ（46.4）と俯瞰パネルからの移動（46.5）
  //
  // 俯瞰パネル（Task 54.5）は折りたたみ状態を自前で持たず、本フックの
  // `collapsedKeys` を明細テーブルと共有する。「すべて展開・すべて折りたたむ」も
  // パネル側で集合を組み立てず、ここに置いた基本操作を通す。
  // ==========================================================================

  describe('一括の展開・折りたたみと俯瞰パネルからの移動', () => {
    /**
     * 表示順（先行順）は item-a, item-a1, item-a1x, item-a2, item-b, item-c
     *
     * item-a1 が子（item-a1x）を持つため、祖先が2段の折りたたみを検証できる。
     */
    const createDeepTree = (): readonly EditableItem[] => [
      createItem('item-a', 'A', [
        createItem('item-a1', 'A1', [createItem('item-a1x', 'A1X')]),
        createItem('item-a2', 'A2'),
      ]),
      createItem('item-b', 'B'),
      createItem('item-c', 'C'),
    ];

    /** @requirement estimate-creation/REQ-46.4 */
    it('すべて折りたたむと子を持つ項目がすべて折りたたまれ、子孫が表示対象から外れる', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createDeepTree() }));

      act(() => {
        result.current.collapseAll();
      });

      expect([...result.current.collapsedKeys].sort()).toEqual(['item-a', 'item-a1']);
      expect(result.current.visibleKeys).toEqual(['item-a', 'item-b', 'item-c']);
    });

    /** @requirement estimate-creation/REQ-46.4 */
    it('すべて折りたたむは子を持たない項目を折りたたみ対象にしない', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createDeepTree() }));

      act(() => {
        result.current.collapseAll();
      });

      // 子を持つ項目は折りたたまれ、葉は対象外（no-op では前半が満たされない）
      expect(result.current.isCollapsed('item-a')).toBe(true);
      expect(result.current.isCollapsed('item-a1')).toBe(true);
      expect(result.current.isCollapsed('item-b')).toBe(false);
      expect(result.current.isCollapsed('item-a1x')).toBe(false);
    });

    /** @requirement estimate-creation/REQ-46.4 */
    it('すべて展開すると折りたたみが解除され全階層が表示対象へ戻る', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createDeepTree() }));

      act(() => {
        result.current.collapseAll();
      });
      // 展開の前に確かに折りたたまれていること（両方 no-op でも通る形にしない）
      expect(result.current.visibleKeys).toEqual(['item-a', 'item-b', 'item-c']);

      act(() => {
        result.current.expandAll();
      });

      expect(result.current.collapsedKeys.size).toBe(0);
      expect(result.current.visibleKeys).toEqual([
        'item-a',
        'item-a1',
        'item-a1x',
        'item-a2',
        'item-b',
        'item-c',
      ]);
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('ツリー表示では折りたたまれた祖先を展開して対象項目を表示対象に含め選択する', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createDeepTree() }));

      act(() => {
        result.current.collapseAll();
      });
      expect(result.current.visibleKeys).not.toContain('item-a1x');

      act(() => {
        result.current.revealAndSelect('item-a1x');
      });

      expect(result.current.visibleKeys).toContain('item-a1x');
      expect(result.current.selectedKeys).toEqual(['item-a1x']);
      expect(result.current.isSelected('item-a1x')).toBe(true);
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('ツリー表示では対象項目より下位の折りたたみは解除しない', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createDeepTree() }));

      act(() => {
        result.current.collapseAll();
      });

      act(() => {
        result.current.revealAndSelect('item-a1');
      });

      // 祖先（item-a）だけが展開され、対象自身の折りたたみは保たれる
      expect(result.current.isCollapsed('item-a')).toBe(false);
      expect(result.current.isCollapsed('item-a1')).toBe(true);
      expect(result.current.visibleKeys).toEqual([
        'item-a',
        'item-a1',
        'item-a2',
        'item-b',
        'item-c',
      ]);
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('ドリルダウン表示では対象項目が属する階層へ現在階層を移し選択する', () => {
      const { result } = renderHook(() =>
        useEstimateNavigation({ items: createDeepTree(), initialViewMode: 'drilldown' })
      );

      expect(result.current.visibleKeys).toEqual(['item-a', 'item-b', 'item-c']);

      act(() => {
        result.current.revealAndSelect('item-a1x');
      });

      // item-a1x は item-a1 の子。現在階層は item-a1 へ移り、対象が一覧に現れる
      expect(result.current.currentLevelKey).toBe('item-a1');
      expect(result.current.visibleKeys).toContain('item-a1x');
      expect(result.current.selectedKeys).toEqual(['item-a1x']);
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('ドリルダウン表示でルート直下の項目を指定した場合は現在階層をルートへ戻す', () => {
      const { result } = renderHook(() =>
        useEstimateNavigation({ items: createDeepTree(), initialViewMode: 'drilldown' })
      );

      act(() => {
        result.current.setCurrentLevelKey('item-a1');
      });

      act(() => {
        result.current.revealAndSelect('item-b');
      });

      expect(result.current.currentLevelKey).toBeNull();
      expect(result.current.selectedKeys).toEqual(['item-b']);
    });

    /** @requirement estimate-creation/REQ-46.5 */
    it('ツリーに存在しないキーを指定しても表示状態を変更しない', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createDeepTree() }));

      act(() => {
        result.current.collapseAll();
      });
      const before = result.current.collapsedKeys;
      expect(before.size).toBeGreaterThan(0);

      act(() => {
        result.current.revealAndSelect('item-unknown');
      });

      expect(result.current.collapsedKeys).toBe(before);
      expect(result.current.selectedKeys).toEqual([]);
    });
  });

  // ==========================================================================
  // 選択範囲（44.1, 44.2, 44.8）
  // ==========================================================================

  describe('選択範囲', () => {
    /** @requirement estimate-creation/REQ-44.2 */
    it('初期状態では何も選択されていない', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      expect(result.current.selectedKeys).toEqual([]);
      expect(result.current.selectedCount).toBe(0);
    });

    /** @requirement estimate-creation/REQ-44.1 */
    it('単一の項目を選択できる', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.selectSingle('item-b');
      });

      expect(result.current.selectedKeys).toEqual(['item-b']);
      expect(result.current.selectedCount).toBe(1);
      expect(result.current.isSelected('item-b')).toBe(true);
      expect(result.current.isSelected('item-c')).toBe(false);
    });

    /** @requirement estimate-creation/REQ-44.1 */
    it('連続する複数行を範囲として選択できる（表示順で連続する）', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.selectSingle('item-a1');
      });
      act(() => {
        result.current.extendSelectionTo('item-b');
      });

      expect(result.current.selectedKeys).toEqual(['item-a1', 'item-a2', 'item-b']);
      expect(result.current.selectedCount).toBe(3);
    });

    /** @requirement estimate-creation/REQ-44.1 */
    it('範囲を逆向きに指定しても表示順（先行順）に正規化される', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.selectSingle('item-b');
      });
      act(() => {
        result.current.extendSelectionTo('item-a1');
      });

      expect(result.current.selectedKeys).toEqual(['item-a1', 'item-a2', 'item-b']);
    });

    /** @requirement estimate-creation/REQ-44.8 */
    it('選択中の行数を供給する', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.selectSingle('item-a');
      });
      act(() => {
        result.current.extendSelectionTo('item-c');
      });

      expect(result.current.selectedCount).toBe(5);
    });

    /** @requirement estimate-creation/REQ-44.2 */
    it('範囲選択を解除すると選択なしの状態に戻る', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.selectSingle('item-a1');
      });
      act(() => {
        result.current.extendSelectionTo('item-b');
      });
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedKeys).toEqual([]);
      expect(result.current.selectedCount).toBe(0);
      expect(result.current.isSelected('item-a1')).toBe(false);
    });

    /** @requirement estimate-creation/REQ-44.2 */
    it('範囲選択中に単一選択を行うと選択が1件へ縮む', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.selectSingle('item-a1');
      });
      act(() => {
        result.current.extendSelectionTo('item-c');
      });
      act(() => {
        result.current.selectSingle('item-c');
      });

      expect(result.current.selectedKeys).toEqual(['item-c']);
    });

    /** @requirement estimate-creation/REQ-44.1 */
    it('編集で削除された行は選択範囲から自動的に外れる', () => {
      const { result, rerender } = renderHook(
        ({ items }: { items: readonly EditableItem[] }) => useEstimateNavigation({ items }),
        { initialProps: { items: createTree() } }
      );

      act(() => {
        result.current.selectSingle('item-b');
      });
      expect(result.current.selectedKeys).toEqual(['item-b']);

      rerender({ items: createTree().filter((item) => item.id !== 'item-b') });

      expect(result.current.selectedKeys).toEqual([]);
      expect(result.current.selectedCount).toBe(0);
    });

    /** @requirement estimate-creation/REQ-45.5 */
    it('ドリルダウン表示では現在階層の中で範囲選択が閉じる', () => {
      const { result } = renderHook(() =>
        useEstimateNavigation({ items: createTree(), initialViewMode: 'drilldown' })
      );

      act(() => {
        result.current.setCurrentLevelKey('item-a');
      });
      act(() => {
        result.current.selectSingle('item-a1');
      });
      act(() => {
        result.current.extendSelectionTo('item-a2');
      });

      expect(result.current.selectedKeys).toEqual(['item-a1', 'item-a2']);
    });
  });

  // ==========================================================================
  // カーソル位置
  // ==========================================================================

  describe('カーソル位置', () => {
    it('初期状態のカーソルは未設定である', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      expect(result.current.cursor).toBeNull();
    });

    it('カーソル位置をセル単位で保持する', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.setCursor({ key: 'item-a2', lineType: 'EXECUTION', field: 'unitPrice' });
      });

      expect(result.current.cursor).toEqual({
        key: 'item-a2',
        lineType: 'EXECUTION',
        field: 'unitPrice',
      });
    });

    it('選択操作でカーソル行が追随し、セル位置は維持される', () => {
      const { result } = renderHook(() => useEstimateNavigation({ items: createTree() }));

      act(() => {
        result.current.setCursor({ key: 'item-a', lineType: 'VENDOR', field: 'quantity' });
      });
      act(() => {
        result.current.selectSingle('item-c');
      });

      expect(result.current.cursor).toEqual({
        key: 'item-c',
        lineType: 'VENDOR',
        field: 'quantity',
      });
    });
  });

  // ==========================================================================
  // 編集状態との分離（45.10 / design.md :3544, :3683）
  // ==========================================================================

  describe('編集状態との分離', () => {
    const createEditorItems = (): EstimateItemHierarchyEdit[] => [
      {
        id: 'item-a',
        estimateId: 'estimate-1',
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: 'line-a-estimate',
            estimateItemId: 'item-a',
            lineType: 'ESTIMATE',
            name: 'A',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: '1000',
            remarks: null,
          },
        ],
        children: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'item-b',
        estimateId: 'estimate-1',
        parentId: null,
        displayOrder: 1,
        lines: [
          {
            id: 'line-b-estimate',
            estimateItemId: 'item-b',
            lineType: 'ESTIMATE',
            name: 'B',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: '2000',
            remarks: null,
          },
        ],
        children: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    /**
     * 編集フック（保存ペイロードの唯一の生成元）と表示状態フックを同時に使う
     */
    const renderCombined = (
      onSave: (payload: EstimateEditorSavePayload) => Promise<void>
    ): ReturnType<
      typeof renderHook<
        {
          editor: ReturnType<typeof useEstimateEditor>;
          nav: ReturnType<typeof useEstimateNavigation>;
        },
        unknown
      >
    > =>
      renderHook(() => {
        const editor = useEstimateEditor({
          estimateId: 'estimate-1',
          initialItems: createEditorItems(),
          onSave,
        });
        const nav = useEstimateNavigation({ items: editor.editState.items });
        return { editor, nav };
      });

    /** @requirement estimate-creation/REQ-45.10 */
    it('表示状態を変更しても未保存の編集内容が保持される', async () => {
      const payloads: EstimateEditorSavePayload[] = [];
      const { result } = renderCombined(async (payload) => {
        payloads.push(payload);
      });

      // 未保存の編集を作る
      act(() => {
        result.current.editor.updateLine('item-a', 'line-a-estimate', 'name', '編集後A');
      });
      expect(result.current.editor.isDirty).toBe(true);

      const itemsBefore = result.current.editor.editState.items;

      // 表示状態をひととおり変更する
      act(() => {
        result.current.nav.setViewMode('drilldown');
      });
      act(() => {
        result.current.nav.setCurrentLevelKey('item-a');
      });
      act(() => {
        result.current.nav.setViewMode('tree');
      });
      act(() => {
        result.current.nav.toggleCollapsed('item-a');
      });
      act(() => {
        result.current.nav.selectSingle('item-a');
      });
      act(() => {
        result.current.nav.extendSelectionTo('item-b');
      });
      act(() => {
        result.current.nav.setCursor({
          key: 'item-b',
          lineType: 'ESTIMATE',
          field: 'quantity',
        });
      });

      // 編集状態は同一参照のまま（表示状態は編集状態に触れていない）
      expect(result.current.editor.editState.items).toBe(itemsBefore);
      expect(result.current.editor.isDirty).toBe(true);

      await act(async () => {
        await result.current.editor.save();
      });

      expect(payloads).toHaveLength(1);
      const saved = payloads[0];
      expect(saved).toBeDefined();
      const savedName = saved?.items[0]?.lines.find((line) => line.lineType === 'ESTIMATE')?.name;
      expect(savedName).toBe('編集後A');
    });

    /** @requirement estimate-creation/REQ-45.10 */
    it('保存ペイロードに表示状態が一切含まれない', async () => {
      const payloads: EstimateEditorSavePayload[] = [];
      const { result } = renderCombined(async (payload) => {
        payloads.push(payload);
      });

      act(() => {
        result.current.nav.setViewMode('drilldown');
      });
      act(() => {
        result.current.nav.toggleCollapsed('item-a');
      });
      act(() => {
        result.current.nav.selectSingle('item-a');
      });
      act(() => {
        result.current.nav.setCursor({ key: 'item-a', lineType: 'VENDOR', field: 'remarks' });
      });
      act(() => {
        result.current.editor.updateLine('item-b', 'line-b-estimate', 'name', '編集後B');
      });

      await act(async () => {
        await result.current.editor.save();
      });

      const saved = payloads[0];
      expect(saved).toBeDefined();
      // 保存ペイロードのトップレベルは明細と帳票用入力項目のみ
      expect(Object.keys(saved ?? {}).sort()).toEqual(['items', 'reportFields']);

      const serialized = JSON.stringify(saved);
      for (const viewStateKey of [
        'viewMode',
        'currentLevelKey',
        'collapsedKeys',
        'selectedKeys',
        'cursor',
        'isCollapsed',
        'drilldown',
      ]) {
        expect(serialized).not.toContain(viewStateKey);
      }
    });

    /** @requirement estimate-creation/REQ-45.10 */
    it('編集状態フックの state に表示状態のフィールドが存在しない', () => {
      const { result } = renderCombined(async () => {});

      expect(Object.keys(result.current.editor.editState).sort()).toEqual([
        'isDirty',
        'items',
        'lastError',
        'reportFields',
      ]);
    });
  });
});
