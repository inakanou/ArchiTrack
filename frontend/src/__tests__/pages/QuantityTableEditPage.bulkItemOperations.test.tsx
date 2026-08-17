/**
 * @fileoverview 数量表編集画面の数量項目グループ間移動・複数選択一括操作の配線テスト
 *
 * Task 115.29: 数量項目のグループ間移動と複数選択の一括操作を実装する
 *
 * 移動・一括操作はいずれもクライアントサイドドラフト（reducer）への反映であり、
 * 保存操作まで永続化APIを呼ばない（REQ-42.1）。
 *
 * Requirements:
 * - 6.2: 数量項目の移動操作で移動先選択UI（同一数量グループ内または別数量グループ）を表示する
 * - 6.4: 移動先に別数量グループが選択されると移動先へ移し元の位置から削除する
 * - 6.5: 複数の数量項目を選択して一括で削除・コピー・移動を実行する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// useBlocker をモック（データルーターなしでテストするため。Task 62.1 離脱ガード対応）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({
      state: 'unblocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    })),
  };
});
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import type { QuantityItemDetail, QuantityTableDetail } from '../../types/quantity-table.types';

// APIモック
vi.mock('../../api/quantity-tables');
vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-annotations');
vi.mock('../../services/export/QuantityTablePdfExportService');
vi.mock('../../services/export/PdfExportService');

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: vi.fn(() => ({
    isLoading: false,
    error: null,
    getSuggestions: vi.fn().mockReturnValue([]),
    addCandidateOnBlur: vi.fn(),
  })),
}));

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);

// ============================================================================
// テストフィクスチャ
// ============================================================================

function buildItem(id: string, groupId: string, name: string, displayOrder: number) {
  return {
    id,
    quantityGroupId: groupId,
    majorCategory: '土工',
    middleCategory: null,
    minorCategory: null,
    customCategory: null,
    workType: '掘削',
    name,
    specification: null,
    calculationMethod: 'STANDARD',
    calculationParams: null,
    adjustmentFactor: 1,
    roundingUnit: 0.01,
    quantity: 10,
    unit: 'm3',
    remarks: null,
    displayOrder,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } satisfies QuantityItemDetail;
}

/** グループ2件（group-a に項目2件、group-b に項目0件）の数量表詳細 */
const buildInitialDetail = (): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 2,
  itemCount: 2,
  groups: [
    {
      id: 'group-a',
      quantityTableId: 'qt-123',
      name: '移動元グループA',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 2,
      items: [
        buildItem('item-1', 'group-a', '根切り', 0),
        buildItem('item-2', 'group-a', '埋戻し', 1),
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'group-b',
      quantityTableId: 'qt-123',
      name: '移動先グループB',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 1,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/quantity-tables/qt-123/edit']}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 数量表詳細のロード完了を待つ */
async function renderLoaded() {
  mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
  renderWithRouter();
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getAllByTestId('quantity-item-row')).toHaveLength(2);
  });
}

/** グループカード（data-testid="quantity-group"）配下の数量項目行を返す */
function itemRowsOfGroup(groupIndex: number): HTMLElement[] {
  const groups = screen.getAllByTestId('quantity-group');
  return within(groups[groupIndex]!).queryAllByTestId('quantity-item-row');
}

// ============================================================================
// REQ-6.2 / REQ-6.4: 別グループへの移動
// ============================================================================

describe('QuantityTableEditPage - 数量項目のグループ間移動（REQ-6.2, 6.4）', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('アクションメニューの「別グループに移動」で移動先選択ダイアログが開く（REQ-6.2）', async () => {
    await renderLoaded();

    const firstRow = itemRowsOfGroup(0)[0]!;
    await user.click(within(firstRow).getByRole('button', { name: 'アクション' }));
    await user.click(screen.getByRole('menuitem', { name: /別グループに移動/ }));

    const dialog = await screen.findByRole('dialog');
    const radioGroup = within(dialog).getByRole('radiogroup', { name: 'グループ選択' });
    expect(within(radioGroup).getAllByRole('radio')).toHaveLength(2);
    // 移動モードでは現在のグループを移動先に選べない
    expect(within(radioGroup).getAllByRole('radio')[0]!).toBeDisabled();
    expect(within(radioGroup).getAllByRole('radio')[1]!).toBeEnabled();
  });

  it('移動先グループを選んで確定すると移動元から消え移動先に現れる（REQ-6.4）', async () => {
    await renderLoaded();
    expect(itemRowsOfGroup(0)).toHaveLength(2);
    expect(itemRowsOfGroup(1)).toHaveLength(0);

    const firstRow = itemRowsOfGroup(0)[0]!;
    await user.click(within(firstRow).getByRole('button', { name: 'アクション' }));
    await user.click(screen.getByRole('menuitem', { name: /別グループに移動/ }));

    const dialog = await screen.findByRole('dialog');
    const radios = within(dialog)
      .getByRole('radiogroup', { name: 'グループ選択' })
      .querySelectorAll('input[type="radio"]');
    await user.click(radios[1] as HTMLElement);
    await user.click(within(dialog).getByRole('button', { name: '移動' }));

    // ダイアログが閉じる
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(itemRowsOfGroup(0)).toHaveLength(1);
    expect(itemRowsOfGroup(1)).toHaveLength(1);
    // 移動したのは「根切り」
    expect(within(itemRowsOfGroup(1)[0]!).getByDisplayValue('根切り')).toBeInTheDocument();
    expect(within(itemRowsOfGroup(0)[0]!).getByDisplayValue('埋戻し')).toBeInTheDocument();
  });

  it('移動をキャンセルすると項目は動かない', async () => {
    await renderLoaded();

    const firstRow = itemRowsOfGroup(0)[0]!;
    await user.click(within(firstRow).getByRole('button', { name: 'アクション' }));
    await user.click(screen.getByRole('menuitem', { name: /別グループに移動/ }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(itemRowsOfGroup(0)).toHaveLength(2);
    expect(itemRowsOfGroup(1)).toHaveLength(0);
  });
});

// ============================================================================
// REQ-6.5: 複数選択の一括操作
// ============================================================================

describe('QuantityTableEditPage - 複数選択の一括操作（REQ-6.5）', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('項目未選択のときは一括操作の操作面を表示しない', async () => {
    await renderLoaded();

    // 操作面そのものと、その中の各操作の双方が現れないことを一つの検証で確かめる
    // （Task 115.44: 操作面の要素だけを見る同趣旨の検証が重複していたため統合した）
    expect(screen.queryByTestId('quantity-item-bulk-action-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /選択した項目を削除/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /選択した項目をコピー/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /選択した項目を移動/ })).not.toBeInTheDocument();
  });

  it('複数の項目を選択すると一括の削除・コピー・移動の操作面が現れる', async () => {
    await renderLoaded();

    const rows = itemRowsOfGroup(0);
    await user.click(within(rows[0]!).getByRole('checkbox'));
    await user.click(within(rows[1]!).getByRole('checkbox'));

    expect(within(rows[0]!).getByRole('checkbox')).toBeChecked();
    expect(within(rows[1]!).getByRole('checkbox')).toBeChecked();

    expect(await screen.findByRole('button', { name: /選択した項目を削除/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /選択した項目をコピー/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /選択した項目を移動/ })).toBeVisible();
  });

  it('選択した全項目を一括削除できる', async () => {
    await renderLoaded();

    const rows = itemRowsOfGroup(0);
    await user.click(within(rows[0]!).getByRole('checkbox'));
    await user.click(within(rows[1]!).getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: /選択した項目を削除/ }));

    await waitFor(() => {
      expect(screen.queryAllByTestId('quantity-item-row')).toHaveLength(0);
    });
    // 削除後は選択が解除され操作面も消える
    expect(screen.queryByRole('button', { name: /選択した項目を削除/ })).not.toBeInTheDocument();
  });

  it('選択した全項目を一括コピーできる（各項目の直下に複製）', async () => {
    await renderLoaded();

    const rows = itemRowsOfGroup(0);
    await user.click(within(rows[0]!).getByRole('checkbox'));
    await user.click(within(rows[1]!).getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: /選択した項目をコピー/ }));

    await waitFor(() => {
      expect(itemRowsOfGroup(0)).toHaveLength(4);
    });
    const names = itemRowsOfGroup(0).map(
      (row) => (within(row).getByLabelText('名称') as HTMLInputElement).value
    );
    expect(names).toEqual(['根切り', '根切り', '埋戻し', '埋戻し']);
  });

  it('選択した全項目を一括で別グループへ移動できる', async () => {
    await renderLoaded();

    const rows = itemRowsOfGroup(0);
    await user.click(within(rows[0]!).getByRole('checkbox'));
    await user.click(within(rows[1]!).getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: /選択した項目を移動/ }));

    const dialog = await screen.findByRole('dialog');
    const radios = within(dialog)
      .getByRole('radiogroup', { name: 'グループ選択' })
      .querySelectorAll('input[type="radio"]');
    await user.click(radios[1] as HTMLElement);
    await user.click(within(dialog).getByRole('button', { name: '移動' }));

    await waitFor(() => {
      expect(itemRowsOfGroup(1)).toHaveLength(2);
    });
    expect(itemRowsOfGroup(0)).toHaveLength(0);
    // 移動後は選択が解除される
    expect(screen.queryByRole('button', { name: /選択した項目を移動/ })).not.toBeInTheDocument();
  });

  it('一括操作はいずれも保存APIを呼ばない（クライアントサイドドラフト・REQ-42.1）', async () => {
    await renderLoaded();

    const rows = itemRowsOfGroup(0);
    await user.click(within(rows[0]!).getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: /選択した項目をコピー/ }));

    await waitFor(() => {
      expect(itemRowsOfGroup(0)).toHaveLength(3);
    });
    expect(vi.mocked(quantityTablesApi.saveQuantityTableDraft)).not.toHaveBeenCalled();
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Task 115.38: 一括操作の操作面を選択中は常に視認できる位置に置く
// ============================================================================

/**
 * 操作面が通常の流れ（数量グループ一覧の直前）に置かれていると、下方の数量項目を
 * 選択した場合に操作面が画面外へ出てしまい、上方向へスクロールしないと操作できない。
 *
 * 是正方式は固定表示ヘッダー（REQ-45）と同じ position: sticky を用い、
 * 数量グループ一覧の「後ろ」へ置いてビューポート下端へ貼り付ける。
 * 末尾に配置することで操作面自身が流れの中で領域を確保し、
 * 最終行を恒久的に覆い隠さない（REQ-45.3 と同じ考え方）。
 *
 * 実ブラウザ上の見え方（下方の行を選択したときの視認性・狭幅での収まり・
 * 前面要素との重なり）は仮想DOMでは判定できないため、ここでは
 * 「ビューポート基準で固定される」「一覧より後ろに置かれる」「前面要素より背面に置かれる」
 * 「操作群が折り返す」というレイアウト契約を検証し、実際の見え方は実ブラウザ検証で確認する。
 *
 * Task 115.44: 収まりを担っていない指定の照合と、選択が無い間の非表示の重複検証を整理した
 * （非表示の検証は REQ-6.5 の「項目未選択のときは一括操作の操作面を表示しない」へ統合）。
 */
describe('QuantityTableEditPage - 一括操作の操作面の常時視認（REQ-6.5, REQ-45 と同方式）', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 項目を1件選択して操作面の要素を返す */
  async function selectItemAndGetBar(): Promise<HTMLElement> {
    await renderLoaded();
    const rows = itemRowsOfGroup(0);
    await user.click(within(rows[1]!).getByRole('checkbox'));
    return await screen.findByTestId('quantity-item-bulk-action-bar');
  }

  it('選択中の操作面はビューポート下端に固定表示される（通常の流れで画面外へ出ない）', async () => {
    const bar = await selectItemAndGetBar();

    expect(bar.style.position).toBe('sticky');
    expect(bar.style.bottom).toBe('0px');
  });

  it('操作面は数量グループ一覧より後ろに置かれ、末尾で自身の領域を確保する', async () => {
    const bar = await selectItemAndGetBar();
    const groupSection = screen.getByTestId('quantity-group-section');

    // 一覧より前にあると、末尾へ貼り付ける固定表示が成立せず流れの途中で
    // 空隙が生じるため、DOM順で一覧の後ろにあることを要求する
    expect(
      groupSection.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('操作面は補完候補一覧・行のアクションメニュー（z-index 1000）より背面に置かれる', async () => {
    const bar = await selectItemAndGetBar();

    const zIndex = Number(bar.style.zIndex);
    expect(Number.isNaN(zIndex)).toBe(false);
    expect(zIndex).toBeGreaterThan(0);
    expect(zIndex).toBeLessThan(1000);
  });

  /**
   * 狭い幅での収まり（Task 115.44 で組み替え）
   *
   * 収まりを実際に担っているのは折り返しの指定である。操作面は main（padding のみの
   * ブロック）直下の自動幅ブロックであり、外枠の幅は常に親の内容領域に収まる。
   * はみ出しうるのは中の操作群だけで、それを防ぐのは flexWrap である。
   * 併記されていた boxSizing / maxWidth は自動幅のブロックでは効かないため、
   * 指定ごと外した（照合していただけで収まりを保証していなかった）。
   */
  it('操作群が折り返す（狭い幅で操作面が横幅からはみ出さないための指定）', async () => {
    const bar = await selectItemAndGetBar();

    expect(bar.style.flexWrap).toBe('wrap');
  });
});
