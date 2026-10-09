/**
 * @fileoverview 内訳書の部品・ページのフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）も重ねないことで規則に乗る
 * （タスク 25.1）。ここでは次を確かめる。
 *   (1) 内訳書の作成フォーム（CreateItemizedStatementForm）の内訳書名の欄・数量表の選択・
 *       キャンセルと作成の釦が、初期の表示・入力の誤りの表示・作成の失敗の表示・数量表が無い表示の
 *       いずれでも、インラインで outline を打ち消さず、影の輪も描かないこと
 *   (2) 内訳書の詳細画面（ItemizedStatementDetailPage）の本文のフォーカスを受ける部品（パンくず・
 *       戻る導線・出力と削除の釦・フィルタの欄とクリアの釦・並び替えの釦）が、初期の表示と
 *       並び替えて保存の釦が出た表示で、インラインで outline を打ち消さず、影の輪も描かないこと
 *   (3) 内訳書の削除の確認（ItemizedStatementDeleteDialog）の釦と、プロジェクト詳細の内訳書の
 *       セクション（ItemizedStatementSectionCard）の導線が、outline を打ち消さないこと。
 *       いずれもタスク 25.1 の変更の前から満たしており、網羅のための見張りとして置く
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/itemized-statements/itemized-statement-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (itemized-statement-generation):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 25.1 は、内訳書の作成画面・一覧・詳細画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateItemizedStatementForm } from '../../components/itemized-statement/CreateItemizedStatementForm';
import ItemizedStatementDeleteDialog from '../../components/itemized-statement/ItemizedStatementDeleteDialog';
import { ItemizedStatementSectionCard } from '../../components/projects/ItemizedStatementSectionCard';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type {
  ItemizedStatementDetail,
  ItemizedStatementInfo,
} from '../../types/itemized-statement.types';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

vi.mock('../../api/itemized-statements');

// 詳細画面の離脱の確認（useBlocker）はデータルーターを要するため、ブロックしない状態に固定する
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
  };
});

/** 部品の名前と、インラインの outline の打ち消し・影の輪の有無 */
interface ControlStyle {
  name: string;
  outlineSuppressed: boolean;
  boxShadow: string;
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
  };
}

/** 名前の並びから、いずれも打ち消しと影の輪を持たないときの観測値を作る */
function expectedControls(names: string[]): ControlStyle[] {
  return names.map((name) => ({ name, outlineSuppressed: false, boxShadow: '' }));
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
// 内訳書の作成フォーム（CreateItemizedStatementForm）
// ============================================================================

const QUANTITY_TABLES: QuantityTableInfo[] = [
  {
    id: 'qt-focus',
    projectId: 'project-focus',
    name: 'フォーカス測定数量表',
    groupCount: 1,
    itemCount: 3,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

const CREATE_FORM_NAMES = ['内訳書名', '数量表', 'キャンセル', '作成'];

function renderCreateForm(
  props: Partial<React.ComponentProps<typeof CreateItemizedStatementForm>> = {}
): HTMLElement {
  const { container } = render(
    <CreateItemizedStatementForm
      projectId="project-focus"
      quantityTables={QUANTITY_TABLES}
      onSuccess={vi.fn()}
      onCancel={vi.fn()}
      defaultName="内訳書"
      {...props}
    />
  );
  const form = container.querySelector('form');
  expect(form).not.toBeNull();
  return form as HTMLElement;
}

describe('内訳書の作成フォームの部品が共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it('初期の表示の部品がインラインで outline を消さず、影の輪も描かない', () => {
    const form = renderCreateForm();

    expect(focusableControls(form).map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });

  it('入力の誤りの表示中も部品がインラインで outline を消さず、誤りの枠の色と文言は残る', () => {
    const form = renderCreateForm();
    fireEvent.change(screen.getByLabelText(/内訳書名/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      '内訳書名を入力してください',
      '数量表を選択してください',
    ]);
    // 誤りの表示は枠の色で示し、フォーカスの表示とは別に残る
    expect(screen.getByLabelText(/内訳書名/).style.borderColor).toBe('rgb(239, 68, 68)');
    expect(screen.getByLabelText(/数量表/).style.borderColor).toBe('rgb(239, 68, 68)');
    expect(focusableControls(form).map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });

  it('作成の失敗の表示中も部品がインラインで outline を消さず、失敗の文言を残す', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ message: 'E2E 失敗' });
    const form = renderCreateForm({ onSubmit });
    fireEvent.change(screen.getByLabelText(/数量表/), { target: { value: 'qt-focus' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByText('E2E 失敗')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '作成' })).toBeEnabled());
    expect(focusableControls(form).map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });

  it('数量表が無い表示（選択と作成の釦は無効）の部品もインラインで outline を消さない', () => {
    const form = renderCreateForm({ quantityTables: [] });

    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled();
    expect(focusableControls(form).map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });
});

// ============================================================================
// 内訳書の詳細画面（ItemizedStatementDetailPage）
// ============================================================================

const DETAIL: ItemizedStatementDetail = {
  id: 'statement-focus',
  projectId: 'project-focus',
  project: { id: 'project-focus', name: 'フォーカス測定プロジェクト' },
  name: 'フォーカス測定内訳書',
  sourceQuantityTableId: 'qt-focus',
  sourceQuantityTableName: 'フォーカス測定数量表',
  itemCount: 3,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  items: ['項目A', '項目B', '項目C'].map((name, index) => ({
    id: `item-${index}`,
    customCategory: '分類',
    workType: '工種',
    name,
    specification: null,
    unit: '式',
    quantity: 1,
    displayOrder: index,
  })),
};

/** パンくずから削除の釦までの、詳細画面の本文の見出しまわりの部品 */
const DETAIL_HEADER_NAMES = [
  'ダッシュボード',
  'プロジェクト一覧',
  'フォーカス測定プロジェクト',
  '内訳書一覧',
  '← プロジェクトに戻る',
];
const DETAIL_ACTION_NAMES = ['クリップボードにコピー', 'Excelダウンロード', '削除'];
const FILTER_NAMES = ['フィルタをクリア', '任意分類', '工種', '名称', '規格', '単位'];
/** 3 項目の並び替えの釦（先頭の上へと末尾の下へは無効だが、部品としては在る） */
const REORDER_NAMES = ['上へ移動', '下へ移動', '上へ移動', '下へ移動', '上へ移動', '下へ移動'];

async function renderDetailPage(): Promise<HTMLElement> {
  render(
    <MemoryRouter initialEntries={['/itemized-statements/statement-focus']}>
      <Routes>
        <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole('table');
  return screen.getByRole('main');
}

describe('内訳書の詳細画面の部品が共通のフォーカス表示を打ち消さない', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(DETAIL);
  });

  it('初期の表示の本文の部品がインラインで outline を消さず、影の輪も描かない', async () => {
    const main = await renderDetailPage();

    expect(focusableControls(main).map(describeControl)).toEqual(
      expectedControls([
        ...DETAIL_HEADER_NAMES,
        ...DETAIL_ACTION_NAMES,
        ...FILTER_NAMES,
        ...REORDER_NAMES,
      ])
    );
  });

  it('フィルタの欄は入力中もインラインで outline を消さず、影の輪も描かない', async () => {
    await renderDetailPage();
    const filter = screen.getByRole('textbox', { name: '名称' });
    fireEvent.focus(filter);
    fireEvent.change(filter, { target: { value: '項目' } });

    expect(describeControl(filter)).toEqual(expectedControls(['名称'])[0]);
  });

  it('並び替えて保存の釦が出た表示の本文の部品もインラインで outline を消さない', async () => {
    const main = await renderDetailPage();
    fireEvent.click(screen.getAllByRole('button', { name: '下へ移動' })[0]!);
    await screen.findByRole('button', { name: '並び順を保存' });

    expect(focusableControls(main).map(describeControl)).toEqual(
      expectedControls([
        ...DETAIL_HEADER_NAMES,
        '並び順を保存',
        ...DETAIL_ACTION_NAMES,
        ...FILTER_NAMES,
        ...REORDER_NAMES,
      ])
    );
  });
});

// ============================================================================
// 削除の確認と、プロジェクト詳細の内訳書のセクション（網羅のための見張り）
// ============================================================================

describe('内訳書の削除の確認とセクションの部品が共通のフォーカス表示を打ち消さない', () => {
  it('削除の確認の釦がインラインで outline を消さず、影の輪も描かない', () => {
    render(
      <ItemizedStatementDeleteDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        statementName="フォーカス測定内訳書"
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(
      focusableControls(dialog)
        .filter((control) => control.tagName === 'BUTTON')
        .map(describeControl)
    ).toEqual(expectedControls(['キャンセル', '削除']));
  });

  it('プロジェクト詳細の内訳書のセクションの導線がインラインで outline を消さない', () => {
    const statement: ItemizedStatementInfo = {
      id: 'statement-focus',
      projectId: 'project-focus',
      name: 'フォーカス測定内訳書',
      sourceQuantityTableId: 'qt-focus',
      sourceQuantityTableName: 'フォーカス測定数量表',
      itemCount: 3,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    };
    render(
      <MemoryRouter>
        <ItemizedStatementSectionCard
          projectId="project-focus"
          totalCount={1}
          latestStatements={[statement]}
          quantityTables={QUANTITY_TABLES}
          isLoading={false}
        />
      </MemoryRouter>
    );

    expect(
      focusableControls(screen.getByTestId('itemized-statement-section')).map(describeControl)
    ).toEqual(
      expectedControls(['内訳書を新規作成', 'すべて見る', 'フォーカス測定内訳書の内訳書詳細を見る'])
    );
  });
});
