/**
 * @fileoverview 工程表の作成フォームの部品のフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）も重ねないことで規則に乗る
 * （タスク 19.1）。ここでは次を確かめる。
 *   (1) 工程表の作成フォームの部品 4 つ（工程表名称の欄・数量表の選択・キャンセル・作成の釦）が、
 *       初期の表示・名称の検証エラーの表示中・作成の失敗の表示中のいずれでも、インラインで
 *       outline を打ち消さず、影の輪も描かないこと
 *   (2) 検証エラーの表示中も、名称の欄の赤い枠と文言が残ること（フォーカス表示の是正で
 *       エラーの示し方を失わない）
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/schedules/construction-schedule-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (construction-schedule):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 19.1 は、要件 1・2 の工程表の作成画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ScheduleForm from '../../components/schedule/ScheduleForm';
import * as quantityTablesApi from '../../api/quantity-tables';

vi.mock('../../api/quantity-tables');

/** フォームのキーボードで止まる部品（画面の並び順） */
function getFormControls(): HTMLElement[] {
  return [
    screen.getByRole('textbox', { name: '工程表名称' }),
    screen.getByRole('combobox', { name: '数量表' }),
    screen.getByRole('button', { name: 'キャンセル' }),
    screen.getByRole('button', { name: '作成' }),
  ];
}

/** 部品の名前と、インラインの outline の打ち消し・影の輪の有無 */
function describeControl(control: HTMLElement): {
  name: string;
  outlineSuppressed: boolean;
  boxShadow: string;
} {
  const labelText = (control as HTMLInputElement).labels?.[0]?.textContent ?? '';
  return {
    name: labelText.trim() || (control.textContent ?? '').trim(),
    outlineSuppressed: control.style.outlineStyle === 'none' || control.style.outline === 'none',
    boxShadow: control.style.boxShadow,
  };
}

/** 4 つの部品がいずれも打ち消しと影の輪を持たないときの観測値 */
const EXPECTED_CONTROLS = ['工程表名称', '数量表', 'キャンセル', '作成'].map((name) => ({
  name,
  outlineSuppressed: false,
  boxShadow: '',
}));

function renderForm(error: string | null = null): void {
  render(
    <ScheduleForm
      projectId="proj-focus"
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      isSubmitting={false}
      error={error}
    />
  );
}

describe('工程表の作成フォームの部品が共通のフォーカス表示を打ち消さない', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it('初期の表示の4つの部品がインラインで outline を消さず、影の輪も描かない', async () => {
    renderForm();
    await waitFor(() => expect(quantityTablesApi.getQuantityTables).toHaveBeenCalled());

    expect(getFormControls().map(describeControl)).toEqual(EXPECTED_CONTROLS);
  });

  it('名称の検証エラーの表示中も4つの部品がインラインで outline を消さず、名称の欄は赤い枠と文言を残す', async () => {
    renderForm();
    await waitFor(() => expect(quantityTablesApi.getQuantityTables).toHaveBeenCalled());

    // 名称を空のまま送信すると、名称の欄に検証エラーが出る
    fireEvent.submit(screen.getByTestId('schedule-form'));
    expect(await screen.findByText('工程表名称を入力してください')).toBeInTheDocument();

    const nameInput = screen.getByRole('textbox', { name: '工程表名称' });
    expect(nameInput.style.border).toMatch(/#ef4444|rgb\(239, 68, 68\)/i);
    expect(getFormControls().map(describeControl)).toEqual(EXPECTED_CONTROLS);
  });

  it('フォーカス中の名称の欄も影の輪を描かず、outline を打ち消さない', async () => {
    renderForm();
    await waitFor(() => expect(quantityTablesApi.getQuantityTables).toHaveBeenCalled());

    const nameInput = screen.getByRole('textbox', { name: '工程表名称' });
    fireEvent.focus(nameInput);

    expect(describeControl(nameInput)).toEqual(EXPECTED_CONTROLS[0]);
  });

  it('作成の失敗の表示中も4つの部品がインラインで outline を消さず、影の輪も描かない', async () => {
    renderForm('工程表の作成に失敗しました');
    await waitFor(() => expect(quantityTablesApi.getQuantityTables).toHaveBeenCalled());

    expect(screen.getByRole('alert')).toHaveTextContent('工程表の作成に失敗しました');
    expect(getFormControls().map(describeControl)).toEqual(EXPECTED_CONTROLS);
  });
});
