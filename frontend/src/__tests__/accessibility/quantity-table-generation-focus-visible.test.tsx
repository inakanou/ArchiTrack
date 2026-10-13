/**
 * @fileoverview 数量表の部品・ページのフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）もフォーカスの表示として
 * 重ねないことで規則に乗る（タスク 102.1）。ここでは次を確かめる。
 *   (1) 数量グループのカード（QuantityGroupCard）の中の、数量項目の行（EditableQuantityItemRow）の
 *       欄（AutocompleteInput）・計算方法の選択（CalculationMethodSelect）・計算の欄（CalculationFields）・
 *       数量の欄が、計算方法の 4 通り・入力中・入力の誤りと範囲外の警告の表示のいずれでも、
 *       インラインで outline を打ち消さず、影の輪も描かないこと。これらの欄は数量項目の表の
 *       水平スクロールのラッパー（REQ-41。overflow で中身を切り取る）の中にあり、表の縁で輪が
 *       欠けないよう、輪を欄の内側（outline-offset: -2px）へ描くこと
 *   (2) グループ名の編集中の欄（QuantityGroupCard）、数量表一覧（QuantityTableListPage）の名前の
 *       編集の欄、コピーのダイアログ（CopyQuantityTableDialog）の数量表名の欄、作成画面
 *       （QuantityTableCreatePage）の数量表名の欄が、インラインで outline を打ち消さず、
 *       影の輪も描かないこと（作成画面はフォーカス中の状態でも）
 *   (3) 上の各画面のその他の部品（グループの見出しの釦・行の選択とアクションの釦・一覧のカードの
 *       導線と釦・ダイアログの釦）が outline を打ち消さないこと。いずれもタスク 102.1 の変更の
 *       前から満たしており、網羅のための見張りとして置く
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ること・輪が表の縁で切り取られないことは
 * e2e/specs/quantity-tables/quantity-table-focus-visible.spec.ts が主張する
 * （jsdom は :focus-visible の照合も CSS の適用もレイアウトもしない）。
 *
 * Requirements (quantity-table-generation):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 102.1 は、数量表の一覧・作成画面・編集画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityGroupCard from '../../components/quantity-table/QuantityGroupCard';
import CopyQuantityTableDialog from '../../components/quantity-table/CopyQuantityTableDialog';
import QuantityTableCreatePage from '../../pages/QuantityTableCreatePage';
import QuantityTableListPage from '../../pages/QuantityTableListPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as projectsApi from '../../api/projects';
import type {
  CalculationMethod,
  QuantityGroupDetail,
  QuantityItemDetail,
} from '../../types/quantity-table.types';

vi.mock('../../api/quantity-tables');
vi.mock('../../api/projects');

/** 部品の名前と、インラインの outline の打ち消し・影の輪・輪の位置の有無 */
interface ControlStyle {
  name: string;
  outlineSuppressed: boolean;
  boxShadow: string;
  outlineOffset: string;
}

function describeControl(control: HTMLElement): ControlStyle {
  const labelText =
    (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).labels?.[0]
      ?.textContent ?? '';
  return {
    name:
      control.getAttribute('aria-label') ??
      (labelText.replace(/\*/g, '').trim() || (control.textContent ?? '').trim()),
    outlineSuppressed: control.style.outlineStyle === 'none' || control.style.outline === 'none',
    boxShadow: control.style.boxShadow,
    outlineOffset: control.style.outlineOffset,
  };
}

/** 数量項目の表の中で、輪を内側へ描く部品の outline-offset */
const INSET_OUTLINE_OFFSET = '-2px';

/** 名前の並びから、いずれも打ち消しと影の輪を持たないときの観測値を作る */
function expectedControls(names: string[], outlineOffset = ''): ControlStyle[] {
  return names.map((name) => ({ name, outlineSuppressed: false, boxShadow: '', outlineOffset }));
}

/** 要素の中の、キーボードで止まりうる部品（文書の並び順） */
function focusableControls(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], input:not([type="hidden"]), select, textarea, button, [tabindex]'
    )
  );
}

// ============================================================================
// 数量グループのカードと数量項目の行（QuantityGroupCard / EditableQuantityItemRow）
// ============================================================================

function item(
  id: string,
  name: string,
  calculationMethod: CalculationMethod,
  calculationParams: QuantityItemDetail['calculationParams'],
  quantity: number,
  displayOrder: number
): QuantityItemDetail {
  return {
    id,
    quantityGroupId: 'group-focus',
    majorCategory: '',
    middleCategory: null,
    minorCategory: null,
    customCategory: null,
    workType: 'フォーカス工種',
    name,
    specification: null,
    unit: '式',
    calculationMethod,
    calculationParams,
    adjustmentFactor: 1,
    roundingUnit: 0.01,
    quantity,
    remarks: null,
    displayOrder,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };
}

/** 計算方法の 4 通りの項目を 1 件ずつ持つグループ（写真の紐付けは無い） */
const GROUP: QuantityGroupDetail = {
  id: 'group-focus',
  quantityTableId: 'qt-focus',
  name: 'フォーカス測定グループ',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 4,
  items: [
    item('item-standard', '標準項目', 'STANDARD', null, 1, 0),
    item('item-area', '面積体積項目', 'AREA_VOLUME', { width: 2, depth: 3 }, 6, 1),
    item(
      'item-pitch',
      'ピッチ項目',
      'PITCH',
      { rangeLength: 10, endLength1: 1, endLength2: 1, pitchLength: 2 },
      5,
      2
    ),
    item('item-count', '箇所数項目', 'COUNT', { count: 3 }, 3, 3),
  ],
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

/** 数量項目の行の 1 段目の欄・計算方法の選択・数量の欄（表の中で輪を内側へ描く部品） */
const ITEM_ROW_FIELD_NAMES = [
  '大項目',
  '中項目',
  '小項目',
  '任意分類',
  '工種',
  '名称',
  '規格',
  '計算方法',
  '数量',
  '単位',
  '備考',
];

/** 計算方法ごとの、行の 2 段目の計算の欄（表の中で輪を内側へ描く部品） */
const CALCULATION_FIELD_NAMES: Record<CalculationMethod, string[]> = {
  STANDARD: [],
  AREA_VOLUME: ['幅（W）', '奥行き（D）', '高さ（H）', '重量', '調整係数', '丸め設定'],
  PITCH: ['範囲長', '端長1', '端長2', 'ピッチ長', '長さ', '重量', '調整係数', '丸め設定'],
  COUNT: ['箇所数', '長さ', '重量', '調整係数', '丸め設定'],
};

/** 行ごとの、選択とアクションの釦（表の中にあるが、表の縁に接しないため輪の位置は既定のまま） */
const ITEM_ROW_BUTTON_NAMES = ['項目を選択', 'アクション'];

/** 計算方法の 4 通りの項目の行の部品の観測値（文書の並び順） */
function expectedItemRows(): ControlStyle[] {
  return GROUP.items.flatMap((groupItem) => [
    ...expectedControls(ITEM_ROW_FIELD_NAMES, INSET_OUTLINE_OFFSET),
    ...expectedControls(ITEM_ROW_BUTTON_NAMES),
    ...expectedControls(CALCULATION_FIELD_NAMES[groupItem.calculationMethod], INSET_OUTLINE_OFFSET),
  ]);
}

/** グループの見出しの部品（並び替えの釦は 1 グループのため無効だが、部品としては在る） */
const GROUP_HEAD_NAMES = [
  'グループを折りたたむ',
  'フォーカス測定グループ',
  '上へ移動',
  '下へ移動',
  'グループをコピー',
  'グループを削除',
  '写真を選択',
];

/** 項目の更新を状態へ反映するグループのカード（入力の誤りの表示は確定した値から決まるため） */
function StatefulGroupCard() {
  const [group, setGroup] = useState<QuantityGroupDetail>(GROUP);
  return (
    <MemoryRouter>
      <QuantityGroupCard
        group={group}
        groupDisplayName="フォーカス測定グループ"
        isEditable
        onAddItem={vi.fn()}
        onDeleteGroup={vi.fn()}
        onSelectImage={vi.fn()}
        onUpdateItem={(itemId, updates) =>
          setGroup((current) => ({
            ...current,
            items: current.items.map((groupItem) =>
              groupItem.id === itemId ? { ...groupItem, ...updates } : groupItem
            ),
          }))
        }
        onDeleteItem={vi.fn()}
        onCopyItem={vi.fn()}
        onMoveItem={vi.fn()}
        onMoveItemToGroup={vi.fn()}
        selectedItemIds={[]}
        onItemSelectionChange={vi.fn()}
        getSuggestions={() => []}
        onBlurAddCandidate={vi.fn()}
        onRenameGroup={vi.fn()}
        groupIndex={0}
        groupTotalCount={1}
        onMoveGroupUp={vi.fn()}
        onMoveGroupDown={vi.fn()}
        onCopyGroup={vi.fn()}
      />
    </MemoryRouter>
  );
}

function renderGroupCard(): HTMLElement {
  render(<StatefulGroupCard />);
  return screen.getByTestId('quantity-group-card');
}

/** 行（role="row" の項目の行）の中の、名前の一致する欄 */
function fieldInRow(rowIndex: number, name: string): HTMLElement {
  const rows = screen.getAllByTestId('quantity-item-row');
  const control = focusableControls(rows[rowIndex]!).find(
    (candidate) => describeControl(candidate).name === name
  );
  expect(control, `${rowIndex + 1} 行目の「${name}」`).toBeDefined();
  return control as HTMLElement;
}

describe('数量グループのカードと数量項目の行の部品が共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it('計算方法の 4 通りの行の部品がインラインで outline を消さず、影の輪も描かず、表の中の欄は輪を内側へ描く', () => {
    const card = renderGroupCard();

    expect(focusableControls(card).map(describeControl)).toEqual([
      ...expectedControls(GROUP_HEAD_NAMES),
      ...expectedItemRows(),
      ...expectedControls(['項目を追加']),
    ]);
  });

  it('欄の入力中（フォーカス中）もインラインで outline を消さず、影の輪も描かない', () => {
    renderGroupCard();
    const workType = fieldInRow(0, '工種');
    const method = fieldInRow(0, '計算方法');
    const width = fieldInRow(1, '幅（W）');
    fireEvent.focus(workType);
    fireEvent.change(workType, { target: { value: 'フォ' } });
    fireEvent.focus(method);
    fireEvent.focus(width);

    expect([workType, method, width].map(describeControl)).toEqual(
      expectedControls(['工種', '計算方法', '幅（W）'], INSET_OUTLINE_OFFSET)
    );
  });

  it('入力の誤りと範囲外の警告の表示中も欄がインラインで outline を消さず、誤りと警告の枠の色と文言は残る', () => {
    renderGroupCard();
    // 名称（必須）を空にして離れ、誤りを表示する
    const name = fieldInRow(0, '名称');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.blur(name);
    // 幅へ範囲外の値（上限 9999999.99 を超える）を入れて離れ、警告を表示する
    const width = fieldInRow(1, '幅（W）');
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: '99999999' } });
    fireEvent.blur(width);

    // 誤りと警告は枠の色（と誤りの淡い影）と文言で示し、フォーカスの表示とは別に残る
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.style.borderColor).toBe('rgb(220, 38, 38)');
    expect(width).toHaveAttribute('aria-invalid', 'true');
    expect(width.style.borderColor).toBe('rgb(245, 158, 11)');
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect([name, width].map(describeControl)).toEqual([
      {
        name: '名称',
        outlineSuppressed: false,
        boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.1)',
        outlineOffset: INSET_OUTLINE_OFFSET,
      },
      ...expectedControls(['幅（W）'], INSET_OUTLINE_OFFSET),
    ]);
  });

  it('グループ名の編集中の欄がインラインで outline を消さず、影の輪も描かない', () => {
    renderGroupCard();
    const heading = screen.getByRole('button', { name: 'フォーカス測定グループ' });
    fireEvent.keyDown(heading, { key: 'Enter' });

    const nameInput = screen.getByRole('textbox', { name: 'グループ名を編集' });
    expect(describeControl(nameInput)).toEqual(expectedControls(['グループ名を編集'])[0]);
  });
});

// ============================================================================
// 数量表一覧（QuantityTableListPage）とコピーのダイアログ（CopyQuantityTableDialog）
// ============================================================================

const PROJECT = {
  id: 'project-focus',
  name: 'フォーカス測定プロジェクト',
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'user-1', displayName: '担当者' },
  status: 'PREPARING',
  statusLabel: '準備中',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
} as unknown as Awaited<ReturnType<typeof projectsApi.getProject>>;

const TABLES = {
  data: [
    {
      id: 'qt-focus',
      projectId: 'project-focus',
      name: 'フォーカス測定数量表',
      groupCount: 1,
      itemCount: 4,
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

describe('数量表一覧とコピーのダイアログの部品が共通のフォーカス表示を打ち消さない', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(PROJECT);
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(TABLES);
  });

  async function renderListPage(): Promise<HTMLElement> {
    render(
      <MemoryRouter initialEntries={['/projects/project-focus/quantity-tables']}>
        <Routes>
          <Route path="/projects/:projectId/quantity-tables" element={<QuantityTableListPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('link', { name: 'フォーカス測定数量表の数量表詳細を見る' });
    return screen.getByRole('main');
  }

  it('一覧の本文の部品がインラインで outline を消さず、影の輪も描かない（網羅のための見張り）', async () => {
    const main = await renderListPage();

    expect(focusableControls(main).map(describeControl)).toEqual(
      expectedControls([
        'ダッシュボード',
        'プロジェクト一覧',
        'フォーカス測定プロジェクト',
        'プロジェクト詳細に戻る',
        '新規作成',
        'フォーカス測定数量表の数量表詳細を見る',
        '名前を編集',
        'コピー',
        '削除',
      ])
    );
  });

  it('名前の編集中のカードの名前の欄がインラインで outline を消さず、影の輪も描かない', async () => {
    const main = await renderListPage();
    fireEvent.click(screen.getByRole('button', { name: '名前を編集' }));
    await screen.findByRole('textbox', { name: '数量表名を編集' });

    expect(focusableControls(main).map(describeControl)).toEqual(
      expectedControls([
        'ダッシュボード',
        'プロジェクト一覧',
        'フォーカス測定プロジェクト',
        'プロジェクト詳細に戻る',
        '新規作成',
        '数量表名を編集',
        'コピー',
        '削除',
      ])
    );
  });

  it('コピーのダイアログの部品がインラインで outline を消さず、影の輪も描かない', () => {
    render(
      <CopyQuantityTableDialog
        isOpen
        onClose={vi.fn()}
        sourceTable={{ id: 'qt-focus', name: 'フォーカス測定数量表' }}
        onCopyComplete={vi.fn()}
      />
    );

    expect(focusableControls(screen.getByRole('dialog')).map(describeControl)).toEqual(
      expectedControls(['数量表名', 'キャンセル', 'コピーを作成'])
    );
  });

  it('コピーの失敗の表示中もダイアログの部品がインラインで outline を消さず、失敗の文言を残す', async () => {
    vi.mocked(quantityTablesApi.copyQuantityTable).mockRejectedValue(new Error('E2E 失敗'));
    render(
      <CopyQuantityTableDialog
        isOpen
        onClose={vi.fn()}
        sourceTable={{ id: 'qt-focus', name: 'フォーカス測定数量表' }}
        onCopyComplete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'コピーを作成' }));

    expect(await screen.findByText('E2E 失敗')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'コピーを作成' })).toBeEnabled());
    expect(focusableControls(screen.getByRole('dialog')).map(describeControl)).toEqual(
      expectedControls(['数量表名', 'キャンセル', 'コピーを作成'])
    );
  });
});

// ============================================================================
// 作成画面（QuantityTableCreatePage）
// ============================================================================

describe('作成画面の部品が共通のフォーカス表示を打ち消さない', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(projectsApi.getProject).mockResolvedValue(PROJECT);
  });

  async function renderCreatePage(): Promise<HTMLElement> {
    render(
      <MemoryRouter initialEntries={['/projects/project-focus/quantity-tables/new']}>
        <Routes>
          <Route
            path="/projects/:projectId/quantity-tables/new"
            element={<QuantityTableCreatePage />}
          />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('heading', { name: '数量表を新規作成' });
    return screen.getByRole('main');
  }

  const CREATE_NAMES = [
    'ダッシュボード',
    'プロジェクト一覧',
    'フォーカス測定プロジェクト',
    '数量表一覧',
    '数量表一覧に戻る',
    '数量表名',
    'キャンセル',
    '作成',
  ];

  it('初期の表示の部品がインラインで outline を消さず、影の輪も描かない', async () => {
    const main = await renderCreatePage();

    expect(focusableControls(main).map(describeControl)).toEqual(expectedControls(CREATE_NAMES));
  });

  it('数量表名の欄はフォーカス中もインラインで outline を消さず、影の輪も描かない', async () => {
    await renderCreatePage();
    const nameInput = screen.getByRole('textbox', { name: '数量表名' });
    fireEvent.focus(nameInput);

    // フォーカス中の枠の色は残る（表示の主は共通の輪）
    expect(nameInput.style.borderColor).toBe('rgb(37, 99, 235)');
    expect(describeControl(nameInput)).toEqual(expectedControls(['数量表名'])[0]);
  });

  it('作成の失敗の表示中も部品がインラインで outline を消さず、失敗の文言を残す', async () => {
    vi.mocked(quantityTablesApi.createQuantityTable).mockRejectedValue(new Error('失敗'));
    const main = await renderCreatePage();
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByText('数量表の作成に失敗しました')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '作成' })).toBeEnabled());
    expect(focusableControls(main).map(describeControl)).toEqual(expectedControls(CREATE_NAMES));
  });
});
