/**
 * @fileoverview 数量表編集ドラフト reducer のユニットテスト
 *
 * Task 60.1: 数量表編集ドラフトの reducer と仮ID採番を実装する（TDDテストファースト）
 *
 * Requirements:
 * - 42.1: グループ/項目の追加・削除・コピー・並び替えはクライアント編集状態にのみ反映
 * - 42.2: グループ名・数量表名の変更はクライアント編集状態にのみ反映
 * - 42.3: 写真紐づけ・変更はクライアント編集状態にのみ反映
 * - 42.4: 現場調査一括生成・インポート取り込みはクライアント編集状態にのみ反映
 * - 42.6: 保存操作前は永続化目的のサーバーアクセスを発生させない（reducer は純粋）
 * - 42.8: 保存完了時にサーバー最新データでスナップショット/ドラフトを同期し isDirty=false
 *
 * Design: design.md L1062-1131（State Management）, L2150（File Structure Plan）
 */

import { describe, expect, it, vi } from 'vitest';

import type { QuantityTableDetail } from '../types/quantity-table.types';
import {
  buildSaveQuantityTableDraftInput,
  createTempId,
  initialQuantityTableEditState,
  quantityTableEditReducer,
  type QuantityTableEditState,
} from './quantityTableEditReducer';

// ============================================================================
// テストフィクスチャ
// ============================================================================

/** サーバー詳細フィクスチャを生成する */
function makeDetail(overrides: Partial<QuantityTableDetail> = {}): QuantityTableDetail {
  return {
    id: 'table-1',
    projectId: 'project-1',
    project: { id: 'project-1', name: 'プロジェクトA' },
    name: '数量表1',
    groupCount: 1,
    itemCount: 1,
    groups: [
      {
        id: 'group-1',
        quantityTableId: 'table-1',
        name: 'グループ1',
        surveyImageId: 'image-1',
        surveyImage: null,
        displayOrder: 0,
        itemCount: 1,
        items: [
          {
            id: 'item-1',
            quantityGroupId: 'group-1',
            majorCategory: '大項目',
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            workType: '工種',
            name: '項目1',
            specification: null,
            unit: 'm2',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: 12.5,
            remarks: null,
            displayOrder: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** ロード済みの編集状態を生成する */
function loadedState(detail: QuantityTableDetail = makeDetail()): QuantityTableEditState {
  return quantityTableEditReducer(initialQuantityTableEditState, {
    type: 'load',
    detail,
  });
}

// ============================================================================
// 仮ID採番
// ============================================================================

describe('createTempId', () => {
  it('temp- 接頭辞付きの一意なIDを採番する', () => {
    const a = createTempId();
    const b = createTempId();
    expect(a).toMatch(/^temp-/);
    expect(b).toMatch(/^temp-/);
    expect(a).not.toBe(b);
  });

  it('crypto.randomUUID を使用する', () => {
    const spy = vi.spyOn(crypto, 'randomUUID');
    createTempId();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// load
// ============================================================================

describe('load', () => {
  it('serverSnapshot と draft を設定し isDirty=false とする', () => {
    const detail = makeDetail();
    const state = loadedState(detail);

    expect(state.serverSnapshot).toBe(detail);
    expect(state.draft).not.toBeNull();
    expect(state.draft?.id).toBe('table-1');
    expect(state.draft?.name).toBe('数量表1');
    expect(state.isDirty).toBe(false);
  });

  it('数値フィールドを文字列ドラフトへマッピングする', () => {
    const state = loadedState();
    const item = state.draft!.groups[0]!.items[0]!;
    expect(item.quantity).toBe('12.5');
    expect(item.unit).toBe('m2');
    // 既存IDを持つ行は id を保持し tempId を持たない
    expect(item.id).toBe('item-1');
    expect('tempId' in item).toBe(false);
  });
});

// ============================================================================
// グループ操作
// ============================================================================

describe('group: addGroup', () => {
  it('末尾に空グループを追加し tempId を採番、isDirty=true', () => {
    const state = quantityTableEditReducer(loadedState(), { type: 'addGroup' });
    const groups = state.draft!.groups;
    expect(groups).toHaveLength(2);
    const added = groups[1]!;
    expect(added.id).toBeNull();
    expect(added.tempId).toMatch(/^temp-/);
    expect(added.items).toHaveLength(0);
    expect(added.displayOrder).toBe(1);
    expect(state.isDirty).toBe(true);
  });

  it('serverSnapshot は変更しない（純粋・差分基準保持）', () => {
    const before = loadedState();
    const after = quantityTableEditReducer(before, { type: 'addGroup' });
    expect(after.serverSnapshot).toBe(before.serverSnapshot);
    expect(before.draft!.groups).toHaveLength(1);
  });
});

describe('group: removeGroup', () => {
  it('指定グループを削除し isDirty=true', () => {
    const base = quantityTableEditReducer(loadedState(), { type: 'addGroup' });
    const target = base.draft!.groups[0]!;
    const state = quantityTableEditReducer(base, {
      type: 'removeGroup',
      groupKey: target.id ?? target.tempId!,
    });
    expect(state.draft!.groups).toHaveLength(1);
    expect(state.draft!.groups[0]!.id).toBeNull();
    expect(state.isDirty).toBe(true);
  });
});

describe('group: copyGroup', () => {
  it('元の直下に複製し displayOrder をシフト、名前は「{元名}のコピー」、tempID採番', () => {
    // 2グループ用意（group-1, 末尾追加）
    let state = quantityTableEditReducer(loadedState(), { type: 'addGroup' });
    state = quantityTableEditReducer(state, {
      type: 'renameGroup',
      groupKey: state.draft!.groups[1]!.tempId!,
      name: '後続グループ',
    });

    const source = state.draft!.groups[0]!;
    state = quantityTableEditReducer(state, {
      type: 'copyGroup',
      groupKey: source.id!,
    });

    const groups = state.draft!.groups;
    expect(groups).toHaveLength(3);
    // 元の直下（index 1）に複製が挿入される
    const copy = groups[1]!;
    expect(copy.id).toBeNull();
    expect(copy.tempId).toMatch(/^temp-/);
    expect(copy.name).toBe('グループ1のコピー');
    // 写真紐づけを引き継ぐ（参照のみ）
    expect(copy.surveyImageId).toBe('image-1');
    // 配下の項目も複製される（新規 tempId）
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]!.id).toBeNull();
    expect(copy.items[0]!.tempId).toMatch(/^temp-/);
    expect(copy.items[0]!.name).toBe('項目1');
    // displayOrder が連番に再採番される
    expect(groups.map((g) => g.displayOrder)).toEqual([0, 1, 2]);
    expect(state.isDirty).toBe(true);
  });

  it('元名がオーバーフローする場合に元名を切り詰めてサフィックスを付与', () => {
    const longName = 'あ'.repeat(30); // 全角30 = 幅60 > 50
    const detail = makeDetail({
      groups: [
        {
          ...makeDetail().groups[0]!,
          name: longName,
        },
      ],
    });
    let state = loadedState(detail);
    state = quantityTableEditReducer(state, {
      type: 'copyGroup',
      groupKey: 'group-1',
    });
    const copyName = state.draft!.groups[1]!.name ?? '';
    // 「のコピー」(幅8)が末尾に必ず付与され、全体は幅50以内
    expect(copyName.endsWith('のコピー')).toBe(true);
    // 幅計算（全角=2）で50以内
    const width = [...copyName].reduce((w, c) => w + ((c.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2), 0);
    expect(width).toBeLessThanOrEqual(50);
  });
});

describe('group: reorderGroup', () => {
  it('上下移動で並び順を入れ替え displayOrder を再採番、isDirty=true', () => {
    let state = quantityTableEditReducer(loadedState(), { type: 'addGroup' });
    const second = state.draft!.groups[1]!;
    // 末尾グループを上へ移動
    state = quantityTableEditReducer(state, {
      type: 'reorderGroup',
      groupKey: second.tempId!,
      direction: 'up',
    });
    const groups = state.draft!.groups;
    expect(groups[0]!.tempId).toBe(second.tempId);
    expect(groups.map((g) => g.displayOrder)).toEqual([0, 1]);
    expect(state.isDirty).toBe(true);
  });
});

describe('group: renameGroup / linkGroupImage', () => {
  it('グループ名を変更し isDirty=true', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'renameGroup',
      groupKey: 'group-1',
      name: '新グループ名',
    });
    expect(state.draft!.groups[0]!.name).toBe('新グループ名');
    expect(state.isDirty).toBe(true);
  });

  it('写真紐づけを設定/変更し isDirty=true（参照のみ）', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'linkGroupImage',
      groupKey: 'group-1',
      surveyImageId: 'image-2',
    });
    expect(state.draft!.groups[0]!.surveyImageId).toBe('image-2');
    expect(state.isDirty).toBe(true);
  });

  it('写真紐づけを null で解除できる', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'linkGroupImage',
      groupKey: 'group-1',
      surveyImageId: null,
    });
    expect(state.draft!.groups[0]!.surveyImageId).toBeNull();
  });
});

// ============================================================================
// 数量表名変更
// ============================================================================

describe('renameTable', () => {
  it('数量表名を変更し isDirty=true', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'renameTable',
      name: '改名後の数量表',
    });
    expect(state.draft!.name).toBe('改名後の数量表');
    expect(state.isDirty).toBe(true);
  });
});

// ============================================================================
// 項目操作
// ============================================================================

describe('item: addItem', () => {
  it('指定グループの末尾に空項目を追加、tempId採番、isDirty=true', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'addItem',
      groupKey: 'group-1',
    });
    const items = state.draft!.groups[0]!.items;
    expect(items).toHaveLength(2);
    const added = items[1]!;
    expect(added.id).toBeNull();
    expect(added.tempId).toMatch(/^temp-/);
    expect(added.displayOrder).toBe(1);
    expect(state.isDirty).toBe(true);
  });
});

describe('item: removeItem', () => {
  it('指定項目を削除し displayOrder 再採番、isDirty=true', () => {
    let state = quantityTableEditReducer(loadedState(), {
      type: 'addItem',
      groupKey: 'group-1',
    });
    state = quantityTableEditReducer(state, {
      type: 'removeItem',
      groupKey: 'group-1',
      itemKey: 'item-1',
    });
    const items = state.draft!.groups[0]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBeNull();
    expect(items[0]!.displayOrder).toBe(0);
    expect(state.isDirty).toBe(true);
  });
});

describe('item: copyItem', () => {
  it('元の直下に複製し新規tempId採番、displayOrder再採番、isDirty=true', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'copyItem',
      groupKey: 'group-1',
      itemKey: 'item-1',
    });
    const items = state.draft!.groups[0]!.items;
    expect(items).toHaveLength(2);
    const copy = items[1]!;
    expect(copy.id).toBeNull();
    expect(copy.tempId).toMatch(/^temp-/);
    expect(copy.name).toBe('項目1');
    expect(items.map((i) => i.displayOrder)).toEqual([0, 1]);
    expect(state.isDirty).toBe(true);
  });
});

describe('item: reorderItem', () => {
  it('項目を下へ移動し displayOrder 再採番', () => {
    let state = quantityTableEditReducer(loadedState(), {
      type: 'addItem',
      groupKey: 'group-1',
    });
    state = quantityTableEditReducer(state, {
      type: 'reorderItem',
      groupKey: 'group-1',
      itemKey: 'item-1',
      direction: 'down',
    });
    const items = state.draft!.groups[0]!.items;
    expect(items[1]!.id).toBe('item-1');
    expect(items.map((i) => i.displayOrder)).toEqual([0, 1]);
    expect(state.isDirty).toBe(true);
  });
});

describe('item: updateItemField', () => {
  it('任意フィールドを更新し isDirty=true（他フィールドは保持）', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'updateItemField',
      groupKey: 'group-1',
      itemKey: 'item-1',
      updates: { name: '更新後', quantity: '99.0' },
    });
    const item = state.draft!.groups[0]!.items[0]!;
    expect(item.name).toBe('更新後');
    expect(item.quantity).toBe('99.0');
    expect(item.workType).toBe('工種'); // 未指定は保持
    expect(state.isDirty).toBe(true);
  });
});

// ============================================================================
// 現場調査一括生成
// ============================================================================

describe('generateGroupsFromSurvey', () => {
  it('写真枚数分のグループを末尾に追加し連番命名・写真紐づけ・項目0件', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'generateGroupsFromSurvey',
      surveyName: '現場調査X',
      surveyImageIds: ['img-a', 'img-b', 'img-c'],
    });
    const groups = state.draft!.groups;
    // 既存1 + 生成3
    expect(groups).toHaveLength(4);
    const generated = groups.slice(1);
    expect(generated.map((g) => g.name)).toEqual(['現場調査X 1', '現場調査X 2', '現場調査X 3']);
    expect(generated.map((g) => g.surveyImageId)).toEqual(['img-a', 'img-b', 'img-c']);
    generated.forEach((g) => {
      expect(g.id).toBeNull();
      expect(g.tempId).toMatch(/^temp-/);
      expect(g.items).toHaveLength(0);
    });
    expect(groups.map((g) => g.displayOrder)).toEqual([0, 1, 2, 3]);
    expect(state.isDirty).toBe(true);
  });

  // @requirement quantity-table-generation/REQ-40.6: 「{現場調査名} {連番}」が最大文字数を超える場合は調査名側を切り詰める
  it('生成グループ名が最大文字数を超える場合は調査名を切り詰めて連番を付与する（REQ-40.6）', () => {
    const longSurveyName = 'あ'.repeat(30); // 全角30 = 幅60 > 50（GROUP_NAME_MAX_WIDTH）
    const state = quantityTableEditReducer(loadedState(), {
      type: 'generateGroupsFromSurvey',
      surveyName: longSurveyName,
      surveyImageIds: ['img-a'],
    });
    const generated = state.draft!.groups.slice(1);
    expect(generated).toHaveLength(1);
    const name = generated[0]!.name ?? '';
    // 連番サフィックス（' 1'）が末尾に必ず付与される
    expect(name.endsWith(' 1')).toBe(true);
    // 幅計算（全角=2, 半角=1）で 50 以内に切り詰められている
    const width = [...name].reduce((w, c) => w + ((c.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2), 0);
    expect(width).toBeLessThanOrEqual(50);
    // 実際に切り詰めが発生している（元の調査名がそのまま先頭に残っていない）
    expect(name.startsWith(longSurveyName)).toBe(false);
  });

  it('写真0枚なら何も追加せず isDirty は変化しない', () => {
    const base = loadedState();
    const state = quantityTableEditReducer(base, {
      type: 'generateGroupsFromSurvey',
      surveyName: '現場調査X',
      surveyImageIds: [],
    });
    expect(state.draft!.groups).toHaveLength(1);
    expect(state.isDirty).toBe(false);
  });
});

// ============================================================================
// インポート取り込み
// ============================================================================

describe('importItems', () => {
  it('対象グループの末尾に項目を追加し tempId採番・displayOrder連番、isDirty=true', () => {
    const state = quantityTableEditReducer(loadedState(), {
      type: 'importItems',
      groupKey: 'group-1',
      items: [
        {
          majorCategory: '大A',
          middleCategory: '',
          minorCategory: '',
          customCategory: '',
          workType: '工A',
          name: '取込A',
          specification: '',
          quantity: 5,
          unit: '個',
          remarks: '',
          calculationMethod: 'STANDARD',
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        },
        {
          majorCategory: '大B',
          middleCategory: '',
          minorCategory: '',
          customCategory: '',
          workType: '工B',
          name: '取込B',
          specification: '',
          quantity: 6,
          unit: '本',
          remarks: '',
          calculationMethod: 'STANDARD',
          adjustmentFactor: 1.0,
          roundingUnit: 0.01,
        },
      ],
    });
    const items = state.draft!.groups[0]!.items;
    expect(items).toHaveLength(3); // 既存1 + 取込2
    expect(items.slice(1).map((i) => i.name)).toEqual(['取込A', '取込B']);
    expect(items.slice(1).map((i) => i.quantity)).toEqual(['5', '6']);
    items.slice(1).forEach((i) => {
      expect(i.id).toBeNull();
      expect(i.tempId).toMatch(/^temp-/);
    });
    expect(items.map((i) => i.displayOrder)).toEqual([0, 1, 2]);
    expect(state.isDirty).toBe(true);
  });
});

// ============================================================================
// save-sync
// ============================================================================

describe('saveSync', () => {
  it('サーバーの採番済み詳細で serverSnapshot/draft を置換し isDirty=false', () => {
    // 編集して dirty 状態にする
    let state = quantityTableEditReducer(loadedState(), { type: 'addGroup' });
    state = quantityTableEditReducer(state, { type: 'renameTable', name: '編集中' });
    expect(state.isDirty).toBe(true);

    // サーバーが採番済み詳細を返す（tempID は実IDに解決済み）
    const saved = makeDetail({
      name: '編集中',
      groups: [
        makeDetail().groups[0]!,
        {
          ...makeDetail().groups[0]!,
          id: 'group-2', // 採番済み
          name: null,
          surveyImageId: null,
          displayOrder: 1,
          items: [],
        },
      ],
    });

    const synced = quantityTableEditReducer(state, { type: 'saveSync', detail: saved });
    expect(synced.serverSnapshot).toBe(saved);
    expect(synced.draft!.name).toBe('編集中');
    expect(synced.draft!.groups).toHaveLength(2);
    // 全グループが実ID（tempId なし）
    synced.draft!.groups.forEach((g) => {
      expect(g.id).not.toBeNull();
      expect('tempId' in g).toBe(false);
    });
    expect(synced.isDirty).toBe(false);
  });
});

// ============================================================================
// フル状態同期保存ペイロード構築（buildSaveQuantityTableDraftInput）
// Task 61.4 / REQ-42.5
// ============================================================================

describe('buildSaveQuantityTableDraftInput', () => {
  it('ドラフト全状態を expectedUpdatedAt・name・groups[全状態] のペイロードへ構築する', () => {
    // ロード→新規グループ追加→新規項目追加→数量表名変更で混在状態を作る
    let state = loadedState();
    state = quantityTableEditReducer(state, { type: 'renameTable', name: '改訂版数量表' });
    state = quantityTableEditReducer(state, { type: 'addGroup' });
    // 既存グループ（group-1）へ新規項目を追加
    state = quantityTableEditReducer(state, { type: 'addItem', groupKey: 'group-1' });

    const input = buildSaveQuantityTableDraftInput(state.draft!, '2026-01-01T00:00:00.000Z');

    // 楽観ロック用 expectedUpdatedAt と数量表名
    expect(input.expectedUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(input.name).toBe('改訂版数量表');

    // グループは2件（既存＋新規）。displayOrder は配列順
    expect(input.groups).toHaveLength(2);
    expect(input.groups.map((g) => g.displayOrder)).toEqual([0, 1]);

    // 既存グループは id=UUID（tempId なし）
    const existingGroup = input.groups[0]!;
    expect(existingGroup.id).toBe('group-1');
    expect('tempId' in existingGroup).toBe(false);

    // 新規グループは id=null＋tempId、name は null→空文字へ正規化
    const newGroup = input.groups[1]!;
    expect(newGroup.id).toBeNull();
    expect(newGroup.tempId).toMatch(/^temp-/);
    expect(newGroup.name).toBe('');

    // 既存グループ配下: 既存項目＋新規項目、displayOrder は配列順
    expect(existingGroup.items.map((i) => i.displayOrder)).toEqual([0, 1]);
    const existingItem = existingGroup.items[0]!;
    expect(existingItem.id).toBe('item-1');
    expect('tempId' in existingItem).toBe(false);
    // 文字列保持の数値フィールドは数値へ変換される
    expect(existingItem.quantity).toBe(12.5);
    expect(existingItem.adjustmentFactor).toBe(1);
    expect(existingItem.roundingUnit).toBe(0.01);

    const newItem = existingGroup.items[1]!;
    expect(newItem.id).toBeNull();
    expect(newItem.tempId).toMatch(/^temp-/);
    expect(typeof newItem.quantity).toBe('number');
  });

  it('並び替え後の配列順を displayOrder として採用する', () => {
    let state = loadedState();
    state = quantityTableEditReducer(state, { type: 'addGroup' }); // displayOrder 1 の新規グループ
    // 新規グループを先頭へ移動
    const newKey = state.draft!.groups[1]!.tempId!;
    state = quantityTableEditReducer(state, {
      type: 'reorderGroup',
      groupKey: newKey,
      direction: 'up',
    });

    const input = buildSaveQuantityTableDraftInput(state.draft!, 'x');
    // 先頭が新規グループ（id=null）、displayOrder=0
    expect(input.groups[0]!.id).toBeNull();
    expect(input.groups[0]!.displayOrder).toBe(0);
    expect(input.groups[1]!.id).toBe('group-1');
    expect(input.groups[1]!.displayOrder).toBe(1);
  });
});

// ============================================================================
// 純粋性 / 未ロード防御
// ============================================================================

describe('reducer purity / guards', () => {
  it('draft が null のとき編集アクションは状態を変更しない', () => {
    const state = quantityTableEditReducer(initialQuantityTableEditState, { type: 'addGroup' });
    expect(state).toBe(initialQuantityTableEditState);
  });

  it('編集アクションは入力 state を変更しない（不変）', () => {
    const before = loadedState();
    const beforeGroups = before.draft!.groups;
    quantityTableEditReducer(before, { type: 'addGroup' });
    expect(before.draft!.groups).toBe(beforeGroups);
    expect(before.draft!.groups).toHaveLength(1);
  });
});
