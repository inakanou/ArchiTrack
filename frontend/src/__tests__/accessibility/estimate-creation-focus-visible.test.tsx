/**
 * @fileoverview 見積書の部品・ページのフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）も重ねないことで規則に乗る
 * （タスク 60.1）。ここでは次を確かめる。
 *   (1) 見積明細の 3 行 1 セットの行（EstimateItemRow）の名称・規格・単位・数量・単価・備考の欄が、
 *       子を持たない項目・子を持つ項目（単価は集計の表示で欄が無い）・選択中の項目・注記行の
 *       いずれでも、インラインで outline を打ち消さず、影の輪も描かないこと
 *   (2) キー割当の一覧（EstimateKeymapHelp）の入口の釦・閉じる釦・一覧の本体（スクロール領域）が
 *       outline を打ち消さず、開いたときにフォーカスを受ける一覧そのもの（role=dialog）は、
 *       共通の輪を一覧の内側（白い面の上）へ描くよう outline-offset を負にしていること。
 *       一覧の外側は半透明の黒の幕で、共通の輪（#2563eb）を外側へ描くと幕の上で 3:1 に届かない
 *   (3) 見積書の作成画面（EstimateCreatePage）の見積書名の欄と内訳書の選択が、初期の表示・
 *       見積書名を空にした表示・作成の失敗の表示のいずれでも outline を打ち消さないこと
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/estimate/estimate-creation-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (estimate-creation):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 60.1 は、見積書の作成画面と明細の編集画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EstimateItemRow } from '../../components/estimate/EstimateItemRow';
import { EstimateKeymapHelp } from '../../components/estimate/EstimateKeymapHelp';
import EstimateCreatePage from '../../pages/EstimateCreatePage';
import type { EstimateItemLineEdit } from '../../hooks/useEstimateEditor';
import * as estimatesApi from '../../api/estimates';
import * as itemizedStatementsApi from '../../api/itemized-statements';

vi.mock('../../api/estimates');
vi.mock('../../api/itemized-statements');

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
      'input:not([type="hidden"]), select, textarea, button, [tabindex]'
    )
  );
}

// ============================================================================
// 見積明細の行（EstimateItemRow）
// ============================================================================

function line(
  lineType: EstimateItemLineEdit['lineType'],
  overrides: Partial<EstimateItemLineEdit> = {}
): EstimateItemLineEdit {
  return {
    id: `line-${lineType}`,
    estimateItemId: 'item-focus',
    lineType,
    name: 'フォーカス測定項目',
    specification: null,
    unit: '式',
    quantity: '1',
    unitPrice: '1000',
    amount: '1000',
    remarks: null,
    ...overrides,
  };
}

const STANDARD_LINES: EstimateItemLineEdit[] = [
  line('ESTIMATE'),
  line('EXECUTION'),
  line('VENDOR'),
];

/** 単価を入力できる行（子を持たない項目）の 1 行分の欄 */
const LINE_FIELDS_WITH_UNIT_PRICE = ['名称', '規格', '単位', '数量', '単価', '備考'];
/** 単価が集計の表示になる行（子を持つ項目）の 1 行分の欄 */
const LINE_FIELDS_WITHOUT_UNIT_PRICE = ['名称', '規格', '単位', '数量', '備考'];

function renderItemRow(props: Partial<React.ComponentProps<typeof EstimateItemRow>> = {}): void {
  render(<EstimateItemRow itemId="item-focus" lines={STANDARD_LINES} {...props} />);
}

describe('見積明細の行の欄が共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その欄だけキーボード操作でフォーカスが見えなくなる。
   */
  it('子を持たない項目の 3 行の欄がインラインで outline を消さず、影の輪も描かない', () => {
    renderItemRow();

    expect(focusableControls(screen.getByTestId('estimate-item-row')).map(describeControl)).toEqual(
      expectedControls([
        ...LINE_FIELDS_WITH_UNIT_PRICE,
        ...LINE_FIELDS_WITH_UNIT_PRICE,
        ...LINE_FIELDS_WITH_UNIT_PRICE,
      ])
    );
  });

  it('子を持つ項目の 3 行の欄（単価は集計の表示）がインラインで outline を消さず、影の輪も描かない', () => {
    renderItemRow({ hasChildren: true });

    expect(focusableControls(screen.getByTestId('estimate-item-row')).map(describeControl)).toEqual(
      expectedControls([
        ...LINE_FIELDS_WITHOUT_UNIT_PRICE,
        ...LINE_FIELDS_WITHOUT_UNIT_PRICE,
        ...LINE_FIELDS_WITHOUT_UNIT_PRICE,
      ])
    );
  });

  it('選択中の項目の欄もインラインで outline を消さず、影の輪も描かない', () => {
    renderItemRow({ isSelected: true });

    const row = screen.getByTestId('estimate-item-row');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(focusableControls(row).map(describeControl)).toEqual(
      expectedControls([
        ...LINE_FIELDS_WITH_UNIT_PRICE,
        ...LINE_FIELDS_WITH_UNIT_PRICE,
        ...LINE_FIELDS_WITH_UNIT_PRICE,
      ])
    );
  });

  it('注記行の名称の欄もインラインで outline を消さず、影の輪も描かない', () => {
    renderItemRow({
      itemType: 'NOTE',
      lines: [line('ESTIMATE', { name: 'フォーカス測定注記', unit: null, quantity: null })],
    });

    expect(focusableControls(screen.getByTestId('estimate-item-row')).map(describeControl)).toEqual(
      expectedControls(['名称'])
    );
  });

  it('フォーカス中の数量の欄も影の輪を描かず、outline を打ち消さない', () => {
    renderItemRow();

    const quantity = screen.getAllByRole('textbox', { name: '数量' })[0]!;
    fireEvent.focus(quantity);

    expect(describeControl(quantity)).toEqual(expectedControls(['数量'])[0]);
  });
});

// ============================================================================
// キー割当の一覧（EstimateKeymapHelp）
// ============================================================================

describe('キー割当の一覧が共通のフォーカス表示を打ち消さない', () => {
  it('入口の釦がインラインで outline を消さず、影の輪も描かない', () => {
    render(<EstimateKeymapHelp />);

    expect(describeControl(screen.getByTestId('open-keymap-help'))).toEqual(
      expectedControls(['キーボード操作の一覧'])[0]
    );
  });

  it('開いた一覧の閉じる釦と本体（スクロール領域）がインラインで outline を消さない', () => {
    render(<EstimateKeymapHelp />);
    fireEvent.click(screen.getByTestId('open-keymap-help'));

    const dialog = screen.getByRole('dialog', { name: 'キーボード操作の割り当て一覧' });
    const [closeButton, scrollBody, ...rest] = focusableControls(dialog);
    expect(rest).toEqual([]);
    expect(describeControl(closeButton!)).toEqual(expectedControls(['閉じる'])[0]);
    expect(scrollBody!.tabIndex).toBe(0);
    expect(scrollBody!.style.outlineStyle).not.toBe('none');
    expect(scrollBody!.style.outline).not.toBe('none');
  });

  it('開いたときにフォーカスを受ける一覧そのものは outline を消さず、輪を内側（白い面の上）へ描く', () => {
    render(<EstimateKeymapHelp />);
    fireEvent.click(screen.getByTestId('open-keymap-help'));

    const dialog = screen.getByRole('dialog', { name: 'キーボード操作の割り当て一覧' });
    expect(dialog).toHaveFocus();
    expect({
      outlineSuppressed: dialog.style.outlineStyle === 'none' || dialog.style.outline === 'none',
      outlineOffset: dialog.style.outlineOffset,
      backgroundColor: dialog.style.backgroundColor,
    }).toEqual({
      outlineSuppressed: false,
      // 共通の輪の太さ（2px）だけ内側へ寄せ、外側の半透明の黒の幕ではなく一覧の白い面の上へ描く
      outlineOffset: '-2px',
      backgroundColor: 'rgb(255, 255, 255)',
    });
  });
});

// ============================================================================
// 見積書の作成画面（EstimateCreatePage）
// ============================================================================

function renderCreatePage(): void {
  render(
    <MemoryRouter initialEntries={['/projects/proj-focus/estimates/new']}>
      <Routes>
        <Route path="/projects/:projectId/estimates/new" element={<EstimateCreatePage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 作成画面のフォームの部品（画面の並び順） */
function getCreateFormControls(): HTMLElement[] {
  const form = screen.getByTestId('estimate-create-page').querySelector('form');
  expect(form).not.toBeNull();
  return focusableControls(form as HTMLElement);
}

const CREATE_FORM_NAMES = ['見積書名', '内訳書を選択', 'キャンセル', '作成'];

describe('見積書の作成画面の部品が共通のフォーカス表示を打ち消さない', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  it('初期の表示の部品がインラインで outline を消さず、影の輪も描かない', async () => {
    renderCreatePage();
    await screen.findByRole('combobox', { name: '内訳書を選択' });

    expect(getCreateFormControls().map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });

  it('見積書名を空にした表示（作成の釦は無効）の部品もインラインで outline を消さない', async () => {
    renderCreatePage();
    await screen.findByRole('combobox', { name: '内訳書を選択' });

    fireEvent.change(screen.getByLabelText(/見積書名/), { target: { value: '' } });
    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled();

    expect(getCreateFormControls().map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });

  it('作成の失敗の表示中も部品がインラインで outline を消さず、失敗の文言を残す', async () => {
    vi.mocked(estimatesApi.createEstimate).mockRejectedValue(new Error('failed'));
    renderCreatePage();
    await screen.findByRole('combobox', { name: '内訳書を選択' });

    fireEvent.click(screen.getByRole('button', { name: '作成' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('見積書の作成に失敗しました');
    await waitFor(() => expect(screen.getByRole('button', { name: '作成' })).toBeEnabled());

    expect(getCreateFormControls().map(describeControl)).toEqual(
      expectedControls(CREATE_FORM_NAMES)
    );
  });
});
