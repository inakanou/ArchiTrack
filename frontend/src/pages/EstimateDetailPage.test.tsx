/**
 * @fileoverview EstimateDetailPage テスト
 *
 * Task 11.3: EstimateDetailPageの実装
 *
 * Requirements (estimate-creation):
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.7: 同一見積書を複数ユーザーが編集した場合、楽観的排他制御により競合を検出する
 * - REQ-14.8: 見積書画面を提供する
 * - REQ-14.9: 見積書の詳細情報（見積項目一覧、合計金額等）を表示する
 * - REQ-14.10: 編集・削除・出力ボタンを提供する
 * - REQ-15.4-15.8: パンくずナビゲーション
 * - REQ-34.4: 保存処理における全変更タイプの正しい処理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
import { ApiError } from '../api/client';
import type {
  EstimateItemHierarchyEdit,
  UseEstimateEditorOptions,
} from '../hooks/useEstimateEditor';
import { ESTIMATE_VIEW_MODE_STORAGE_KEY } from '../hooks/useEstimateViewModePreference';

// モック
vi.mock('../api/estimates');

// useEstimateEditorのモック
const mockEditor = {
  items: [] as ReturnType<typeof import('../hooks/useEstimateEditor').useEstimateEditor>['items'],
  // 表示状態フック（useEstimateNavigation）が読み取る編集中ツリー（54.2）
  editState: {
    items: [] as ReturnType<
      typeof import('../hooks/useEstimateEditor').useEstimateEditor
    >['editState']['items'],
  },
  isDirty: false,
  isSaving: false,
  updateLine: vi.fn(),
  reorderItems: vi.fn(),
  moveItem: vi.fn(),
  indentItem: vi.fn(),
  outdentItem: vi.fn(),
  addItem: vi.fn(),
  deleteItem: vi.fn(),
  duplicateItem: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  discard: vi.fn(),
  setItems: vi.fn(),
  getTotalAmount: vi.fn().mockReturnValue('0'),
  addDiscountItem: vi.fn(),
  addNoteItem: vi.fn(),
  // 範囲操作（53.3 / 54.6）とその失敗理由（44.6, 44.7 / 54.10）。
  // `lastError` は描画中に読まれるため、欠けているとモックが本物と乖離して落ちる。
  insertRowAfter: vi.fn(),
  deleteRows: vi.fn(),
  duplicateRows: vi.fn(),
  indentRange: vi.fn(),
  outdentRange: vi.fn(),
  lastError: null as import('../domain/estimate/estimateEditReducer.types').EditError | null,
  dismissError: vi.fn(),
};

/**
 * 表示ツリー（`mockEditor.items`）に対応する編集ツリーを作る
 *
 * 選択の所有者は `useEstimateNavigation` へ一本化され（54.10）、選択できる行は
 * `editState.items` から導かれる表示対象に限られる。表示ツリーだけを差し替えると
 * 本物では起こりえない「表には出ているが選択できない」状態になるため、両方を揃える。
 */
const toEditStateItems = (
  items: readonly EstimateItemHierarchyEdit[]
): { id: string; tempId: null; itemType: 'STANDARD'; lines: never[]; children: unknown[] }[] =>
  items.map((item) => ({
    id: item.id,
    tempId: null,
    itemType: 'STANDARD' as const,
    lines: [],
    children: toEditStateItems(item.children),
  }));

/** 表示ツリーと編集ツリーを同時に差し替える */
const setEditorItems = (items: EstimateItemHierarchyEdit[]): void => {
  mockEditor.items = items;
  mockEditor.editState.items = toEditStateItems(
    items
  ) as unknown as typeof mockEditor.editState.items;
};
// 既定はモックだが、フックと画面の結線そのものを検証するテストでは実物へ切り替える
const editorMode = vi.hoisted(() => ({ useReal: false }));
vi.mock('../hooks/useEstimateEditor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useEstimateEditor')>();
  return {
    ...actual,
    useEstimateEditor: (options: UseEstimateEditorOptions) =>
      editorMode.useReal ? actual.useEstimateEditor(options) : mockEditor,
  };
});

// 子コンポーネントのモック
let capturedToolbarProps: Record<string, unknown> = {};
let capturedTableProps: Record<string, unknown> = {};
vi.mock('../components/estimate', () => ({
  // 階層構造の俯瞰パネル（46.1〜46.6 / Task 54.5）。
  // 本ファイルは props の受け渡しだけを見る構成のため置き換えるが、実際の
  // 一気通貫（パネル操作 → 明細の追従）は `EstimateDetailPage.hierarchyPanel.test.tsx`
  // が実物のコンポーネントで固定している。
  EstimateHierarchyPanel: () => <div data-testid="mock-hierarchy-panel" />,
  EstimateItemTable: (props: Record<string, unknown>) => {
    capturedTableProps = props;
    return (
      <div
        data-testid="mock-item-table"
        data-selected-item-id={String(
          (props.selectedKeys as readonly string[] | undefined)?.[0] ?? ''
        )}
      >
        {props.onItemSelect ? (
          <button
            data-testid="select-item-btn"
            onClick={() => (props.onItemSelect as (id: string) => void)('item-001')}
          >
            SelectItem
          </button>
        ) : null}
      </div>
    );
  },
  EstimateItemToolbar: (props: Record<string, unknown>) => {
    capturedToolbarProps = props;
    return (
      <div data-testid="mock-toolbar">
        <button data-testid="toolbar-add" onClick={() => (props.onAddItem as () => void)()}>
          Add
        </button>
        <button
          data-testid="toolbar-add-child"
          onClick={() => (props.onAddChildItem as (id: string) => void)('parent-1')}
        >
          AddChild
        </button>
        <button
          data-testid="toolbar-delete"
          onClick={() => (props.onDeleteItems as (ids: readonly string[]) => void)(['item-1'])}
        >
          Delete
        </button>
        <button
          data-testid="toolbar-duplicate"
          onClick={() => (props.onDuplicateItems as (ids: readonly string[]) => void)(['item-1'])}
        >
          Duplicate
        </button>
        <button
          data-testid="toolbar-move-up"
          onClick={() => (props.onMoveUpItems as (ids: readonly string[]) => void)(['item-child'])}
        >
          MoveUp
        </button>
        <button
          data-testid="toolbar-move-down"
          onClick={() =>
            (props.onMoveDownItems as (ids: readonly string[]) => void)(['item-child'])
          }
        >
          MoveDown
        </button>
        <button
          data-testid="toolbar-add-discount"
          onClick={() => (props.onAddDiscountItem as () => void)()}
        >
          AddDiscount
        </button>
        <button
          data-testid="toolbar-add-note"
          onClick={() => (props.onAddNoteItem as () => void)()}
        >
          AddNote
        </button>
        <button
          data-testid="toolbar-reorder-up"
          onClick={() => (props.onReorderUp as (id: string) => void)('item-sibling')}
        >
          ReorderUp
        </button>
        <button
          data-testid="toolbar-reorder-down"
          onClick={() => (props.onReorderDown as (id: string) => void)('item-parent')}
        >
          ReorderDown
        </button>
      </div>
    );
  },
}));

vi.mock('../components/estimate/EstimateExportDialog', () => ({
  EstimateExportDialog: (props: Record<string, unknown>) =>
    props.isOpen ? (
      <div role="dialog" data-testid="mock-export-dialog">
        <p>出力形式を選択</p>
        <button data-testid="export-close" onClick={() => (props.onClose as () => void)()}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock('../components/estimate/TransferQuotationDialog', () => ({
  TransferQuotationDialog: (props: Record<string, unknown>) =>
    props.isOpen ? (
      <div role="dialog" data-testid="mock-transfer-dialog">
        <button data-testid="transfer-close" onClick={() => (props.onClose as () => void)()}>
          Close
        </button>
        <button
          data-testid="transfer-complete"
          onClick={() => (props.onTransferComplete as () => void)()}
        >
          Complete
        </button>
      </div>
    ) : null,
}));

// 55.3: 案分はクライアント計算へ移り、適用は `onApply`（編集状態への反映）で行う。
// 実物のダイアログを通した検証は `EstimateDetailPage.netAllocation.test.tsx` が持つ。
vi.mock('../components/estimate/NetAllocationDialog', () => ({
  NetAllocationDialog: (props: Record<string, unknown>) =>
    props.isOpen ? (
      <div role="dialog" data-testid="mock-net-dialog">
        <button data-testid="net-close" onClick={() => (props.onClose as () => void)()}>
          Close
        </button>
        <button
          data-testid="net-apply"
          onClick={() =>
            (props.onApply as (payload: unknown) => void)({
              targetKeys: ['item-a'],
              excludeKeys: [],
              netAmount: '50000',
            })
          }
        >
          Apply
        </button>
      </div>
    ) : null,
}));

vi.mock('../components/estimate/ProfitRateDialog', () => ({
  ProfitRateDialog: (props: Record<string, unknown>) =>
    props.isOpen ? (
      <div role="dialog" data-testid="mock-profit-dialog">
        <button data-testid="profit-close" onClick={() => (props.onClose as () => void)()}>
          Close
        </button>
        <button data-testid="profit-complete" onClick={() => (props.onComplete as () => void)()}>
          Complete
        </button>
      </div>
    ) : null,
}));

vi.mock('../components/estimate/OverheadCostPanel', () => ({
  OverheadCostPanel: (props: Record<string, unknown>) => (
    <div data-testid="mock-overhead-panel">
      <button
        data-testid="overhead-calculate"
        onClick={() =>
          (props.onCalculate as (p: Record<string, unknown>) => void)({
            costType: 'COMMON_TEMPORARY',
            directCost: '1000000',
            constructionPeriod: '6',
            pureConstructionCost: '900000',
            constructionCost: '1100000',
            isRenovation: false,
          })
        }
      >
        Calculate
      </button>
      <button
        data-testid="overhead-add"
        onClick={() =>
          (props.onItemAdded as (p: Record<string, unknown>) => void)({
            costType: 'COMMON_TEMPORARY',
            name: '共通仮設費',
            specification: '',
            unit: '式',
            quantity: '1',
            unitPrice: '50000',
          })
        }
      >
        AddOverhead
      </button>
    </div>
  ),
}));

const mockNavigate = vi.fn();

// useBlocker のモック（Task 53.7: 未保存の変更がある状態での離脱ガード, 27.6）
//
// jsdom のテストはデータルーターではなく MemoryRouter で描画するため、実物の
// `useBlocker` は動作しない（ブロックはデータルーター側の遷移制御に依存する）。
// ItemizedStatementDetailPage / QuantityTableEditPage / CompanyInfoPage /
// ConstructionPhotoDetailPage の確立済みパターンに倣い `useBlocker` をモックし、
// (a) 未保存状態に応じた呼び出し引数、(b) blocked のときの確認ダイアログ結線
// （離れる→proceed / とどまる→reset）を検証する。
const mockBlockerProceed = vi.fn();
const mockBlockerReset = vi.fn();
const mockUseBlocker = vi.fn((_shouldBlock?: boolean) => ({
  state: 'unblocked' as 'unblocked' | 'blocked' | 'proceeding',
  proceed: mockBlockerProceed,
  reset: mockBlockerReset,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: (shouldBlock?: boolean) => mockUseBlocker(shouldBlock),
  };
});

const mockEstimateDetail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: 'is-001',
  sourceItemizedStatementName: '内訳書A',
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
  items: [
    {
      id: 'item-001',
      estimateId: 'est-001',
      parentId: null,
      displayOrder: 0,
      lines: [
        {
          id: 'line-001',
          estimateItemId: 'item-001',
          lineType: 'ESTIMATE' as const,
          name: '直接仮設工事',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '100000',
          amount: '100000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'line-002',
          estimateItemId: 'item-001',
          lineType: 'EXECUTION' as const,
          name: '直接仮設工事',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '90000',
          amount: '90000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'line-003',
          estimateItemId: 'item-001',
          lineType: 'VENDOR' as const,
          name: '直接仮設工事',
          specification: null,
          unit: '式',
          quantity: '1',
          unitPrice: '85000',
          amount: '85000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      ],
      children: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
  ],
  totalAmount: '100000',
};

// 階層構造を持つ編集用データ
const mockEditorItemsWithHierarchy = [
  {
    id: 'item-parent',
    estimateId: 'est-001',
    parentId: null,
    displayOrder: 0,
    lines: [
      {
        id: 'line-p-1',
        estimateItemId: 'item-parent',
        lineType: 'ESTIMATE' as const,
        name: '親項目',
        specification: null,
        unit: '式',
        quantity: '1',
        unitPrice: '100000',
        amount: '100000',
        remarks: null,
        sourceReceivedQuotationLineItemId: null,
        sourceVendorName: null,
      },
    ],
    children: [
      {
        id: 'item-child',
        estimateId: 'est-001',
        parentId: 'item-parent',
        displayOrder: 0,
        lines: [
          {
            id: 'line-c-1',
            estimateItemId: 'item-child',
            lineType: 'ESTIMATE' as const,
            name: '子項目',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '50000',
            amount: '50000',
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 'item-sibling',
    estimateId: 'est-001',
    parentId: null,
    displayOrder: 1,
    lines: [],
    children: [],
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
];

/**
 * 見積書の読み込み2経路をまとめてモックする（53.15）
 *
 * 画面はスナップショット（`name` / `updatedAt` など）を `GET /api/estimates/:id`、
 * 明細を階層形の `GET /api/estimates/:id/items` から取る。多くのテストの関心は
 * 明細の内容にあるため、同じフィクスチャから両経路を揃える。
 * 2経路で別々の内容を返す必要があるテストは個別にモックすること。
 */
const mockEstimateLoad = (detail: estimatesApi.EstimateDetail): void => {
  vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(detail);
  vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(detail.items);
};

/** {@link mockEstimateLoad} の「次の1回だけ」版（再同期で別の内容を返す場合に使う） */
const mockEstimateLoadOnce = (detail: estimatesApi.EstimateDetail): void => {
  vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(detail);
  vi.mocked(estimatesApi.getEstimateItems).mockResolvedValueOnce(detail.items);
};

describe('EstimateDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigate.mockReset();
    mockEstimateLoad(mockEstimateDetail);
    // mockEditorの状態リセット
    setEditorItems([]);
    mockEditor.isDirty = false;
    mockEditor.isSaving = false;
    mockEditor.save.mockResolvedValue(undefined);
    mockEditor.discard.mockReset();
    mockEditor.addItem.mockReset();
    mockEditor.deleteItem.mockReset();
    mockEditor.duplicateItem.mockReset();
    mockEditor.setItems.mockReset();
    mockEditor.addDiscountItem.mockReset();
    capturedToolbarProps = {};
    capturedTableProps = {};
    editorMode.useReal = false;
    // `vi.resetAllMocks()` が実装を落とすため、離脱ガードの既定（未ブロック）を戻す（27.6）
    mockBlockerProceed.mockReset();
    mockBlockerReset.mockReset();
    mockUseBlocker.mockReset();
    mockUseBlocker.mockImplementation(() => ({
      state: 'unblocked' as const,
      proceed: mockBlockerProceed,
      reset: mockBlockerReset,
    }));
  });

  /**
   * REQ-14.8: 見積書画面を提供する
   */
  it('見積書詳細画面が正しくレンダリングされる', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // h1要素で見積書名が表示される
    expect(screen.getByRole('heading', { level: 1, name: 'テスト見積書' })).toBeInTheDocument();
  });

  /**
   * REQ-11.2: 見積書の詳細を表示する
   */
  it('見積書の基本情報を表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // h1要素で見積書名が表示される
      expect(screen.getByRole('heading', { level: 1, name: 'テスト見積書' })).toBeInTheDocument();
    });

    // 参照内訳書名の表示
    expect(screen.getByText('内訳書A')).toBeInTheDocument();
  });

  /**
   * REQ-14.9: 見積項目一覧を表示する
   */
  it('見積項目一覧を表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // 見積項目セクションのタイトルが表示される
      expect(screen.getByRole('heading', { name: '見積項目' })).toBeInTheDocument();
    });
  });

  /**
   * REQ-14.9: 合計金額を表示する
   */
  it('合計金額を表示する', async () => {
    // editor.itemsにデータを設定してサマリー計算が動くようにする
    setEditorItems([
      {
        id: 'item-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: 'line-001',
            estimateItemId: 'item-001',
            lineType: 'ESTIMATE' as const,
            name: '直接仮設工事',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '100000',
            amount: '100000',
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // 合計金額セクションのタイトルが表示される
      expect(screen.getByRole('heading', { name: 'サマリー' })).toBeInTheDocument();
      // 金額が複数箇所に表示されるためgetAllByTextを使用
      expect(screen.getAllByText(/100,000/).length).toBeGreaterThan(0);
    });
  });

  /**
   * REQ-27.2: 保存ボタンを常時提供する（編集モード切替は廃止）
   */
  it('保存ボタンを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    });
  });

  /**
   * REQ-14.10: 削除ボタンを提供する
   */
  it('削除ボタンを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * REQ-14.10: 出力ボタンを提供する
   */
  it('出力ボタンを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /出力/i })).toBeInTheDocument();
    });
  });

  /**
   * REQ-15.8-15.11: パンくずナビゲーション（Task 43.3更新）
   * パンくず: ダッシュボード > プロジェクト一覧 > プロジェクト > 見積書一覧 > 見積書
   */
  it('パンくずナビゲーションを「ダッシュボード > プロジェクト一覧 > プロジェクト > 見積書一覧 > 見積書」形式で表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
      expect(screen.getByText('プロジェクト')).toBeInTheDocument();
      expect(screen.getByText('見積書一覧')).toBeInTheDocument();
    });

    // 最後の項目が固定テキスト「見積書」であること（見積書名ではない）
    const breadcrumb = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
    expect(breadcrumb).toBeInTheDocument();
    // 「見積書」テキストがパンくず内にあること（aria-current="page"）
    const currentPage = screen.getByText((content, element) => {
      return element?.getAttribute('aria-current') === 'page' && content === '見積書';
    });
    expect(currentPage).toBeInTheDocument();

    // 「プロジェクト詳細」ラベルが存在しないこと
    expect(screen.queryByText('プロジェクト詳細')).not.toBeInTheDocument();
  });

  /**
   * REQ-15.10: 「← 見積書一覧に戻る」リンクが存在しないこと（Task 43.3）
   */
  it('「← 見積書一覧に戻る」リンクが存在しない', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // 「← 見積書一覧に戻る」リンクが存在しないこと
    expect(screen.queryByText('← 見積書一覧に戻る')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('見積書一覧に戻る')).not.toBeInTheDocument();
  });

  /**
   * 削除ボタンクリックで確認ダイアログを表示する
   */
  it('削除ボタンクリックで確認ダイアログを表示する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    // ヘッダーの削除ボタン（有効なもの）を取得
    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/削除してよろしいですか/i)).toBeInTheDocument();
    });
  });

  /**
   * 削除確認ダイアログでキャンセルするとダイアログが閉じる
   */
  it('削除確認ダイアログでキャンセルするとダイアログが閉じる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  /**
   * 削除確認ダイアログで削除を実行する
   */
  it('削除確認ダイアログで削除を実行すると一覧画面に遷移する', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.deleteEstimate).mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // ダイアログ内の削除ボタンを取得（複数ある場合は最後の要素）
    const dialogDeleteButtons = screen.getAllByRole('button', { name: /^削除$/ });
    const confirmButton = dialogDeleteButtons[dialogDeleteButtons.length - 1]!;
    await user.click(confirmButton);

    await waitFor(() => {
      expect(estimatesApi.deleteEstimate).toHaveBeenCalledWith(
        'est-001',
        mockEstimateDetail.updatedAt
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/estimates');
  });

  /**
   * ローディング状態のテスト
   */
  it('ローディング中はスピナーを表示する', async () => {
    vi.mocked(estimatesApi.getEstimateDetail).mockImplementation(
      () => new Promise(() => {}) // 解決しないPromise
    );

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  /**
   * エラー状態のテスト
   */
  it('エラー時はエラーメッセージと再試行ボタンを表示する', async () => {
    vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('見積書の取得に失敗しました')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });

  /**
   * REQ-27.4: isDirty=falseの場合は保存ボタンがdisabled
   */
  it('未変更時は保存ボタンがdisabledで表示される', async () => {
    mockEditor.isDirty = false;

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /保存/i })).toBeDisabled();
  });

  /**
   * 出力ボタンクリックで出力ダイアログを表示する
   */
  it('出力ボタンクリックで出力ダイアログを表示する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /出力/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /出力/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/出力形式を選択/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 転記・NET・利益率ダイアログのテスト
  // =========================================================================

  it('転記ボタンクリックで転記ダイアログを表示し、閉じることができる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // 転記ボタンをクリック
    const transferBtn = screen.getByRole('button', { name: /受領見積書を業者金額に転記/ });
    await user.click(transferBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-transfer-dialog')).toBeInTheDocument();
    });

    // 閉じるボタン
    await user.click(screen.getByTestId('transfer-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('mock-transfer-dialog')).not.toBeInTheDocument();
    });
  });

  it('NET案分ボタンクリックでNETダイアログを表示し、閉じることができる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    const netBtn = screen.getByRole('button', { name: /業者金額を実行金額に転記/ });
    await user.click(netBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-net-dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('net-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('mock-net-dialog')).not.toBeInTheDocument();
    });
  });

  it('利益率ボタンクリックで利益率ダイアログを表示し、閉じることができる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    const profitBtn = screen.getByRole('button', { name: /実行金額を見積金額に転記/ });
    await user.click(profitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-profit-dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('profit-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('mock-profit-dialog')).not.toBeInTheDocument();
    });
  });

  it('出力ダイアログの閉じるコールバックが動作する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /出力/i });
    await user.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-export-dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('export-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('mock-export-dialog')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // ツールバーコールバックのテスト
  // =========================================================================

  it('ツールバーのaddItemがeditor.addItemを呼ぶ', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-add'));
    expect(mockEditor.addItem).toHaveBeenCalled();
  });

  it('ツールバーのaddChildItemがeditor.addItemを親IDつきで呼ぶ', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-add-child'));
    expect(mockEditor.addItem).toHaveBeenCalledWith('parent-1');
  });

  it('ツールバーの削除が選択範囲を editor.deleteRows へ渡すこと (44.3)', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-delete'));
    expect(mockEditor.deleteRows).toHaveBeenCalledWith(['item-1']);
  });

  it('ツールバーの複製が選択範囲を editor.duplicateRows へ渡すこと (44.3)', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-duplicate'));
    expect(mockEditor.duplicateRows).toHaveBeenCalledWith(['item-1']);
  });

  // =========================================================================
  // REQ-27: 保存ボタンのテスト（編集モード廃止、常時インライン編集）
  // =========================================================================

  /**
   * 保存後の全件再取得は design.md `#### Modified Files` の指示により撤去した（53.4）。
   * 再取得は `editor.setItems` 経由で未保存の編集を上書きしてしまう。
   */
  it('保存ボタンクリックでeditor.saveが呼ばれ、保存後の全件再取得を行わない', async () => {
    const user = userEvent.setup();
    mockEditor.isDirty = true;

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    });

    vi.mocked(estimatesApi.getEstimateDetail).mockClear();

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(mockEditor.save).toHaveBeenCalled();
    });

    expect(estimatesApi.getEstimateDetail).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 削除エラーのテスト
  // =========================================================================

  it('削除API失敗時にエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.deleteEstimate).mockRejectedValue(new Error('Delete failed'));

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
    const headerDeleteButton = deleteButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    await user.click(headerDeleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialogDeleteButtons = screen.getAllByRole('button', { name: /^削除$/ });
    const confirmButton = dialogDeleteButtons[dialogDeleteButtons.length - 1]!;
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('見積書の削除に失敗しました')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // formatAmount / toEditFormat のエッジケース（間接テスト）
  // =========================================================================

  it('金額がnullの項目でも正しく表示される', async () => {
    const detailWithNullAmount = {
      ...mockEstimateDetail,
      items: [
        {
          ...mockEstimateDetail.items[0]!,
          lines: [
            {
              ...mockEstimateDetail.items[0]!.lines[0]!,
              amount: null,
            },
          ],
        },
      ],
    };
    mockEstimateLoad(detailWithNullAmount);

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // サマリーパネルの金額が「-」と表示される（formatAmountのnull分岐）
    const summaryPanel = screen.getByTestId('summary-panel');
    expect(summaryPanel).toBeInTheDocument();
  });

  it('見積書データのitemsがundefinedの場合にtoEditFormatが空配列を返す', async () => {
    const detailWithNoItems = {
      ...mockEstimateDetail,
      items: undefined as unknown as typeof mockEstimateDetail.items,
    };
    mockEstimateLoad(detailWithNoItems);

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // toEditFormat(undefined)が空配列を返し、setItemsに空配列が渡される
    expect(mockEditor.setItems).toHaveBeenCalledWith([]);
  });

  // =========================================================================
  // 再試行ボタンのテスト
  // =========================================================================

  it('エラー状態で再試行ボタンをクリックするとデータを再取得する', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValueOnce(new Error('API Error'));

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('見積書の取得に失敗しました')).toBeInTheDocument();
    });

    // 2回目は成功させる
    mockEstimateLoad(mockEstimateDetail);
    await user.click(screen.getByRole('button', { name: '再試行' }));

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 追加カバレッジテスト
  // =========================================================================

  it('EXECUTIONチェックボックスのON/OFF切り替えが動作すること', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // 「実行」チェックボックスを見つけてクリック
    const checkboxes = screen.getAllByRole('checkbox');
    const executionCheckbox = checkboxes.find((cb) => {
      const parent = cb.closest('label');
      return parent?.textContent === '実行';
    });
    expect(executionCheckbox).toBeDefined();

    await user.click(executionCheckbox!);
    expect(executionCheckbox).not.toBeChecked();

    // 再度クリックでONに戻る
    await user.click(executionCheckbox!);
    expect(executionCheckbox).toBeChecked();
  });

  it('VENDORチェックボックスのON/OFF切り替えが動作すること', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // 「業者」チェックボックスを見つけてクリック
    const checkboxes = screen.getAllByRole('checkbox');
    const vendorCheckbox = checkboxes.find((cb) => {
      const parent = cb.closest('label');
      return parent?.textContent === '業者';
    });
    expect(vendorCheckbox).toBeDefined();

    await user.click(vendorCheckbox!);
    expect(vendorCheckbox).not.toBeChecked();
  });

  it('項目選択時にselectedItemとhasPreviousSiblingが計算されること', async () => {
    const user = userEvent.setup();
    // 2つの兄弟アイテムをセットして、2番目を選択すればhasPreviousSibling=trueになる
    setEditorItems([
      {
        id: 'item-first',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'item-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 1,
        lines: [],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-item-table')).toBeInTheDocument();
    });

    // onItemSelect('item-001')を呼ぶ
    await user.click(screen.getByTestId('select-item-btn'));

    await waitFor(() => {
      // selectedItemIdが設定されたことを確認（テーブルのdata属性で検証）
      expect(screen.getByTestId('mock-item-table')).toHaveAttribute(
        'data-selected-item-id',
        'item-001'
      );
    });

    // ツールバーには選択範囲（54.10 で所有者を一本化）と派生値が渡る
    expect(capturedToolbarProps.selectedKeys).toEqual(['item-001']);
    expect(capturedToolbarProps.hasPreviousSibling).toBe(true);
  });

  it('NaN金額でサマリーが正しく表示されること', async () => {
    setEditorItems([
      {
        id: 'item-nan',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: 'line-nan',
            estimateItemId: 'item-nan',
            lineType: 'ESTIMATE' as const,
            name: 'NaN項目',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: 'abc',
            amount: 'abc',
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    // NaN金額は集計時にskipされ、0円と表示される
    const summaryPanel = screen.getByTestId('summary-panel');
    expect(summaryPanel).toBeInTheDocument();
  });

  it('サマリーパネルで利益率・値引率が正しく計算されること', async () => {
    // ESTIMATE, EXECUTION, VENDORの全3行タイプを持つ項目を設定
    setEditorItems([
      {
        id: 'item-summary',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [
          {
            id: 'line-est',
            estimateItemId: 'item-summary',
            lineType: 'ESTIMATE' as const,
            name: '工事A',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '120000',
            amount: '120000',
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
          {
            id: 'line-exec',
            estimateItemId: 'item-summary',
            lineType: 'EXECUTION' as const,
            name: '工事A',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '100000',
            amount: '100000',
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
          {
            id: 'line-vendor',
            estimateItemId: 'item-summary',
            lineType: 'VENDOR' as const,
            name: '工事A',
            specification: null,
            unit: '式',
            quantity: '1',
            unitPrice: '80000',
            amount: '80000',
            remarks: null,
            sourceReceivedQuotationLineItemId: null,
            sourceVendorName: null,
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('summary-panel')).toBeInTheDocument();
    });

    // 利益率: (120000 - 100000) / 120000 * 100 = 16.67% (REQ-39.8)
    expect(screen.getByText('16.67%')).toBeInTheDocument();
    // 値引率: (100000 - 80000) / 80000 * 100 = 25%
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('selectedItemが子要素をもつ項目の子を選択した場合にfindItemが再帰的に検索すること', async () => {
    setEditorItems(mockEditorItemsWithHierarchy);

    // `select-item-btn` は 'item-001' を選ぶが、このフィクスチャに 'item-001' は無い。
    // 54.10 以降は明細に存在しないキーが選択状態にならないため、ここでは
    // `onItemSelect` を直接呼んで実在する子項目（item-parent の子）を選ぶ。
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-item-table')).toBeInTheDocument();
    });

    // onItemSelect を直接呼んで子アイテム（item-parent の子）を選択する。
    // 54.10 で選択の所有者を `useEstimateNavigation` へ一本化したため、
    // 明細ツリーに存在しないキーは選択状態にならない（＝ツールバーの操作対象にも
    // ならない）。ここでは実在する子項目を選び、再帰探索の結果を検証する。
    const table = screen.getByTestId('mock-item-table');
    await act(async () => {
      (capturedTableProps.onItemSelect as (id: string) => void)('item-child');
    });

    await waitFor(() => {
      expect(table).toHaveAttribute('data-selected-item-id', 'item-child');
    });
    expect(capturedToolbarProps.selectedKeys).toEqual(['item-child']);
    // 子階層の項目が再帰探索で見つかっている
    expect((capturedToolbarProps.selectedItem as { id: string } | null)?.id).toBe('item-child');
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/estimates/est-001']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

  /**
   * 退行防止（53.4）: 保存が失敗した場合に未保存の編集を破棄しないこと。
   *
   * 保存後に全件再取得すると `editor.setItems` が編集内容をサーバーデータで上書きし、
   * `isDirty` も false に落ちるため、ユーザーの編集が無言で消える。
   * design.md `#### File Structure Plan` > `#### Modified Files` の
   * 「保存は1回のみ、保存後の `fetchData()` を撤去」に従い再取得を行わない。
   *
   * 保存経路の接続（53.5）後は、保存が**成功した場合**に応答の最新ツリーで
   * 差し替えて未保存状態を解消するため（42.2, 42.7）、破棄されないことを確認する
   * 対象は保存失敗時となる。成功時の反映は後段の「明細の一括保存」で検証する。
   *
   * ここでは**実物の `useEstimateEditor`** を用いて画面との結線ごと検証する。
   */
  it('保存が失敗しても未保存の編集が破棄されないこと (42.5)', async () => {
    editorMode.useReal = true;
    vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValue(
      new ApiError(409, '他のユーザーによって更新されています')
    );
    const user = userEvent.setup();
    renderPage();

    const tableItems = () => (capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[];
    const estimateName = () =>
      tableItems()[0]?.lines.find((line) => line.lineType === 'ESTIMATE')?.name;

    await waitFor(() => {
      expect(tableItems()).toHaveLength(1);
    });
    expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    expect(estimateName()).toBe('直接仮設工事');

    // セル編集（表は onLineChange として editor.updateLine を受け取っている）
    await act(async () => {
      (
        capturedTableProps.onLineChange as (
          itemId: string,
          lineId: string,
          field: string,
          value: string
        ) => void
      )('item-001', 'line-001', 'name', '編集済み名称');
    });

    expect(estimateName()).toBe('編集済み名称');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '保存' }));

    // (a) 編集したセルの値が消えない / (b) 未保存状態が維持される（ボタンが有効なまま）
    expect(estimateName()).toBe('編集済み名称');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    // 保存後の全件再取得を行わない
    expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // 明細の一括保存（Task 53.5 / REQ-42）
  // =========================================================================

  describe('明細の一括保存 (REQ-42)', () => {
    /** 保存応答（`PUT /api/estimates/:id/save`）の既定形 */
    const buildSavedResponse = (
      overrides: Partial<estimatesApi.SaveEstimateDraftResponse> = {}
    ): estimatesApi.SaveEstimateDraftResponse => ({
      id: 'est-001',
      projectId: 'proj-001',
      project: { id: 'proj-001', name: 'テストプロジェクト' },
      name: 'テスト見積書',
      sourceItemizedStatementId: 'is-001',
      sourceItemizedStatementName: '内訳書A',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-20T12:00:00.000Z',
      itemCount: 1,
      reportFields: {
        submissionDate: '2026-07-31',
        validityPeriod: '提出日より1ヶ月間',
        separateWorks: ['外構工事'],
      },
      items: [
        {
          id: 'item-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          itemType: 'STANDARD',
          lines: [
            {
              id: 'line-001',
              estimateItemId: 'item-001',
              lineType: 'ESTIMATE',
              name: 'サーバー確定名称',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '100000',
              amount: '100000',
              remarks: null,
              sourceReceivedQuotationLineItemId: 'quotation-line-1',
              sourceVendorName: null,
            },
          ],
          children: [],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-20T12:00:00.000Z',
        },
      ],
      ...overrides,
    });

    /**
     * 書き込み系APIの呼び出し総数
     *
     * 「保存で発行されるのは1件だけ」を、エンドポイントの到達確認ではなく
     * **書き込み経路の総数**で数える（42.1, 27.3）。
     */
    const writeCallCount = (): number =>
      [
        estimatesApi.saveEstimateDraft,
        estimatesApi.createEstimate,
        estimatesApi.updateEstimate,
        estimatesApi.deleteEstimate,
        estimatesApi.transferFromQuotation,
        estimatesApi.calculateOverhead,
        estimatesApi.addOverheadItem,
        estimatesApi.addDiscountItem,
      ].reduce((total, fn) => total + vi.mocked(fn).mock.calls.length, 0);

    const editEstimateName = async (value: string) => {
      await act(async () => {
        (
          capturedTableProps.onLineChange as (
            itemId: string,
            lineId: string,
            field: string,
            value: string
          ) => void
        )('item-001', 'line-001', 'name', value);
      });
    };

    const tableItems = () => (capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[];

    beforeEach(() => {
      editorMode.useReal = true;
    });

    /**
     * 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
     * 27.3: クライアントサイドの変更内容を1回の保存操作でまとめてDBへ反映する
     */
    it('保存操作1回で書き込みリクエストが1件のみ発生すること (42.1, 27.3)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });

      // 行操作とセル編集を複数回行っても書き込みは発生しない（43.2 の前提）
      await editEstimateName('編集1');
      await editEstimateName('編集2');
      await act(async () => {
        (capturedToolbarProps.onAddItem as () => void)();
      });
      expect(writeCallCount()).toBe(0);

      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      expect(writeCallCount()).toBe(1);
    });

    /**
     * 42.1 / 54.8: 明細ツリー・楽観ロックの基準時刻・帳票用入力項目を1リクエストに含める
     *
     * ワイヤ契約（design.md `SaveEstimateItemNode` / `SaveEstimateLine`）は
     * 「null 許容だが省略不可」のため、全キーの存在も検証する。
     */
    it('保存リクエストに明細ツリー・基準時刻・帳票用入力項目を含めること (42.1, 54.8)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      const [estimateId, request] = vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]!;
      expect(estimateId).toBe('est-001');
      // 基準時刻は読み込み時のサーバースナップショット
      expect(request.expectedUpdatedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(request.reportFields).toEqual({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
      });

      const node = request.items[0]!;
      expect(Object.keys(node).sort()).toEqual(
        ['children', 'id', 'itemType', 'lines', 'tempId'].sort()
      );
      // 既存行は id ＋ tempId: null
      expect(node.id).toBe('item-001');
      expect(node.tempId).toBeNull();
      expect(node.itemType).toBe('STANDARD');
      // 葉ノードも children を明示送信する
      expect(node.children).toEqual([]);
      expect(node.lines).toHaveLength(3);

      const estimateLine = node.lines.find((line) => line.lineType === 'ESTIMATE')!;
      expect(Object.keys(estimateLine).sort()).toEqual(
        [
          'lineType',
          'name',
          'specification',
          'unit',
          'quantity',
          'unitPrice',
          'amount',
          'remarks',
          'sourceVendorName',
        ].sort()
      );
      expect(estimateLine.name).toBe('編集済み名称');
      // 空欄は省略ではなく null を明示送信する
      expect(estimateLine.specification).toBeNull();
      expect(estimateLine.remarks).toBeNull();
      expect(estimateLine.sourceVendorName).toBeNull();
      expect(estimateLine.quantity).toBe('1');
      expect(estimateLine.unitPrice).toBe('100000');
    });

    /**
     * サーバーは数量・単価・金額を**数値**で返すが、一括保存スキーマは10進数文字列しか
     * 受け付けない。未編集セルの値をそのまま載せると 400 になるため、送出前に揃える。
     */
    it('サーバーが数値で返した数量・単価・金額を10進数文字列で送出すること', async () => {
      mockEstimateLoad({
        ...mockEstimateDetail,
        items: [
          {
            ...mockEstimateDetail.items[0]!,
            lines: [
              {
                ...mockEstimateDetail.items[0]!.lines[0]!,
                // サーバーの実際の返却形（Decimal→number 変換後）
                quantity: 2 as unknown as string,
                unitPrice: 1500.5 as unknown as string,
                amount: 3001 as unknown as string,
              },
            ],
          },
        ],
      } as estimatesApi.EstimateDetail);
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      const line = vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1].items[0]!.lines[0]!;
      expect(line.quantity).toBe('2');
      expect(line.unitPrice).toBe('1500.5');
      expect(line.amount).toBe('3001');
    });

    /**
     * 42.1: 追加も同じ1リクエストで確定する。新規項目は `id: null` ＋ `tempId`。
     */
    it('新規に追加した項目がid=nullと一時IDで送られること (42.1)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await act(async () => {
        (capturedToolbarProps.onAddItem as () => void)();
      });
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      const items = vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1].items;
      expect(items).toHaveLength(2);
      const added = items[1]!;
      expect(added.id).toBeNull();
      expect(added.tempId).toMatch(/^tmp-/);
      expect(added.children).toEqual([]);
    });

    /**
     * 12.8: ドラッグ&ドロップで順序を変更して保存した場合、変更後の順序をDBへ反映する
     * 34.5: 並び順の変更を保存し、画面再読み込み後も変更後の構造で表示する
     * 42.6: 明細の並び順を画面に表示されている順序どおりに確定する
     *
     * この層で保証できるのは「画面の順序どおりの配列が1リクエストで送られること」まで。
     * 再読み込み後の順序維持そのものは配列順で `displayOrder` を再採番するサーバー
     * （52.5）と結合した E2E（53.14）が担当する。
     */
    it('ドラッグによる並び替えが保存対象に含まれること (12.8, 34.5, 42.6)', async () => {
      mockEstimateLoad({
        ...mockEstimateDetail,
        items: [
          mockEstimateDetail.items[0]!,
          {
            ...mockEstimateDetail.items[0]!,
            id: 'item-002',
            displayOrder: 1,
            lines: mockEstimateDetail.items[0]!.lines.map((line) => ({
              ...line,
              id: `${line.id}-2`,
              estimateItemId: 'item-002',
            })),
          },
        ],
      } as estimatesApi.EstimateDetail);
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      expect(tableItems().map((item) => item.id)).toEqual(['item-001', 'item-002']);

      // 表からのドロップ（editor.reorderItems）
      await act(async () => {
        (capturedTableProps.onDrop as (sourceId: string, targetId: string) => void)(
          'item-002',
          'item-001'
        );
      });
      expect(tableItems().map((item) => item.id)).toEqual(['item-002', 'item-001']);

      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      const items = vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1].items;
      expect(items.map((item) => item.id)).toEqual(['item-002', 'item-001']);
    });

    /**
     * 42.2: 保存後の最新の明細内容を画面に反映する
     * 42.7: 保存成功時に未保存の変更がない状態へ戻す
     * 27.4: 未保存の変更がない場合、保存ボタンを無効状態で表示する
     * 27.3: 1回の保存操作でまとめて反映する（保存後の明細の追加取得を行わない）
     */
    it('保存応答の最新ツリーで状態を差し替え追加取得を行わないこと (42.2, 42.7, 27.3, 27.4)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);

      await editEstimateName('編集済み名称');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
      });

      // 応答のツリーで差し替わる（送信した編集内容ではなくサーバー確定値）
      const estimateLine = tableItems()[0]?.lines.find((line) => line.lineType === 'ESTIMATE');
      expect(estimateLine?.name).toBe('サーバー確定名称');
      // 転記元行の参照も応答から取り込まれる
      expect(estimateLine?.sourceReceivedQuotationLineItemId).toBe('quotation-line-1');
      // 保存後の明細の追加取得は行わない
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    });

    /**
     * 42.5: 保存開始後に他ユーザーが更新していた場合、保存を中止して競合を表示し、
     *       編集中の内容を失わせない
     */
    it('競合応答（409）で編集内容を保持し競合の発生を提示すること (42.5)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValue(
        new ApiError(409, '他のユーザーによって更新されています')
      );
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByTestId('estimate-save-error')).toBeInTheDocument();
      });
      expect(screen.getByTestId('estimate-save-error')).toHaveTextContent(
        /他のユーザーによって更新されました/
      );
      // 編集内容は破棄されず、未保存状態のまま再保存できる
      expect(tableItems()[0]?.lines.find((line) => line.lineType === 'ESTIMATE')?.name).toBe(
        '編集済み名称'
      );
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
      // 明細一覧は保持され、画面全体がエラー表示へ差し替わらない
      expect(screen.getByTestId('mock-item-table')).toBeInTheDocument();
    });

    it('検証NG（422）でサーバーの応答内容を提示し編集内容を保持すること', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValue(
        new ApiError(422, '見積項目が自身の子孫に含まれています（循環参照）')
      );
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByTestId('estimate-save-error')).toHaveTextContent(
          /保存できません: 見積項目が自身の子孫に含まれています/
        );
      });
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    /**
     * 42.5: 連続保存で基準時刻を更新しないと、2回目が必ず競合になる。
     */
    it('2回目の保存で応答のupdatedAtを基準時刻として送ること (42.5)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });

      await editEstimateName('1回目');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
      });

      await editEstimateName('2回目');
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(2);
      });

      const calls = vi.mocked(estimatesApi.saveEstimateDraft).mock.calls;
      expect(calls[0]![1].expectedUpdatedAt).toBe('2024-01-15T10:00:00.000Z');
      expect(calls[1]![1].expectedUpdatedAt).toBe('2024-01-20T12:00:00.000Z');
    });

    it('保存成功後に直前の保存エラー表示が消えること', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockRejectedValueOnce(
        new ApiError(409, '他のユーザーによって更新されています')
      );
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(screen.getByTestId('estimate-save-error')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(screen.queryByTestId('estimate-save-error')).not.toBeInTheDocument();
      });
    });
  });

  it('ツールバーの値引き行追加がeditor.addDiscountItemを呼ぶ (REQ-41.1)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-add-discount'));
    expect(mockEditor.addDiscountItem).toHaveBeenCalled();
  });

  it('未選択時のツールバーの注記行追加が位置指定なしでeditor.addNoteItemを呼ぶ (55.1)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-add-note'));

    // 位置指定なし＝ルートレベル末尾
    expect(mockEditor.addNoteItem).toHaveBeenCalledWith(undefined);
  });

  it('項目選択時のツールバーの注記行追加が選択行の直後・同一階層を指定して呼ぶ (55.3)', async () => {
    const user = userEvent.setup();
    setEditorItems([
      {
        id: 'item-parent',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [],
        children: [
          {
            id: 'item-001',
            estimateId: 'est-001',
            parentId: 'item-parent',
            displayOrder: 0,
            lines: [],
            children: [],
            createdAt: '2024-01-15T10:00:00.000Z',
            updatedAt: '2024-01-15T10:00:00.000Z',
          },
        ],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    // 子階層の 'item-001' を選択する
    await user.click(screen.getByTestId('select-item-btn'));
    await waitFor(() => {
      expect(capturedToolbarProps.selectedKeys).toEqual(['item-001']);
    });

    await user.click(screen.getByTestId('toolbar-add-note'));

    expect(mockEditor.addNoteItem).toHaveBeenCalledWith({
      parentId: 'item-parent',
      afterId: 'item-001',
    });
  });

  it('サマリーの合計金額が注記行を集計対象から除外すること (55.2)', async () => {
    setEditorItems([
      {
        id: 'item-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        itemType: 'STANDARD',
        lines: [
          {
            id: 'line-001',
            estimateItemId: 'item-001',
            lineType: 'ESTIMATE',
            name: '項目',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            amount: '120000',
            remarks: null,
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'note-001',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 1,
        itemType: 'NOTE',
        lines: [
          {
            id: 'line-note-001',
            estimateItemId: 'note-001',
            lineType: 'ESTIMATE',
            name: '※支給材は別途',
            specification: null,
            unit: null,
            quantity: null,
            unitPrice: null,
            // 注記行が金額を持っていても集計対象外であること
            amount: '999999',
            remarks: null,
          },
        ],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('summary-panel')).toBeInTheDocument();
    });

    const summary = screen.getByTestId('summary-panel');
    // 見積金額合計は通常項目の 120000 のみ。注記行の 999999 は加算されない
    expect(within(summary).getByText('見積金額合計').parentElement).toHaveTextContent('120,000円');
    expect(within(summary).queryByText('1,119,999円')).not.toBeInTheDocument();
  });

  it('諸経費ダイアログを開閉できる (REQ-7.1)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    await user.click(screen.getByText('諸経費を計算して追加'));
    expect(screen.getByTestId('overhead-cost-dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => {
      expect(screen.queryByTestId('overhead-cost-dialog')).not.toBeInTheDocument();
    });
  });

  it('handleCalculateOverheadが計算APIを呼ぶ (REQ-7.3)', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.calculateOverhead).mockResolvedValue({
      rate: '0.1',
      amount: '100000',
      formula: 'directCost * 0.1',
    } as never);

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    await user.click(screen.getByText('諸経費を計算して追加'));
    await user.click(screen.getByTestId('overhead-calculate'));

    await waitFor(() => {
      expect(estimatesApi.calculateOverhead).toHaveBeenCalledWith(
        'est-001',
        expect.objectContaining({
          costType: 'COMMON_TEMPORARY',
          directCost: '1000000',
          constructionPeriod: 6,
          isRenovation: false,
        })
      );
    });
  });

  it('handleAddOverheadItemが諸経費追加APIを呼びダイアログを閉じる (REQ-7.1)', async () => {
    const user = userEvent.setup();
    vi.mocked(estimatesApi.addOverheadItem).mockResolvedValue(undefined as never);

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    await user.click(screen.getByText('諸経費を計算して追加'));
    await user.click(screen.getByTestId('overhead-add'));

    await waitFor(() => {
      expect(estimatesApi.addOverheadItem).toHaveBeenCalledWith('est-001', {
        costType: 'COMMON_TEMPORARY',
        unitPrice: 50000,
      });
    });

    // 追加後はダイアログが閉じる
    await waitFor(() => {
      expect(screen.queryByTestId('overhead-cost-dialog')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 行操作のローカル完結（Task 53.6 / REQ-43）
  // =========================================================================

  describe('行操作のローカル完結 (REQ-43)', () => {
    /**
     * 書き込み系APIの呼び出し総数
     *
     * 「行操作では書き込みが1件も発生しない」（43.1, 43.2）を、個別の
     * エンドポイント名ではなく**書き込み経路の総数**で数える。
     */
    const writeCallCount = (): number =>
      [
        estimatesApi.saveEstimateDraft,
        estimatesApi.createEstimate,
        estimatesApi.updateEstimate,
        estimatesApi.deleteEstimate,
        estimatesApi.transferFromQuotation,
        estimatesApi.calculateOverhead,
        estimatesApi.addOverheadItem,
        estimatesApi.addDiscountItem,
      ].reduce((total, fn) => total + vi.mocked(fn).mock.calls.length, 0);

    const buildLine = (itemId: string, name: string) => ({
      id: `line-${itemId}`,
      estimateItemId: itemId,
      lineType: 'ESTIMATE' as const,
      name,
      specification: null,
      unit: '式',
      quantity: '1',
      unitPrice: '100000',
      amount: '100000',
      remarks: null,
      sourceReceivedQuotationLineItemId: null,
      sourceVendorName: null,
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });

    const buildItem = (
      id: string,
      name: string,
      parentId: string | null,
      displayOrder: number,
      children: unknown[] = []
    ) => ({
      id,
      estimateId: 'est-001',
      parentId,
      displayOrder,
      lines: [buildLine(id, name)],
      children,
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });

    /** ルート [item-a, item-b]、item-b は子 item-c を持つ */
    const hierarchyDetail = {
      ...mockEstimateDetail,
      items: [
        buildItem('item-a', 'A項目', null, 0),
        buildItem('item-b', 'B項目', null, 1, [buildItem('item-c', 'C項目', 'item-b', 0)]),
      ],
    } as unknown as estimatesApi.EstimateDetail;

    const tableItems = () => (capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[];

    const itemNameOf = (item: EstimateItemHierarchyEdit | undefined) =>
      item?.lines.find((line) => line.lineType === 'ESTIMATE')?.name;

    /** ツールバーの操作をディスパッチする（画面の結線ごと検証する） */
    const invokeToolbar = async (prop: string, ...args: unknown[]) => {
      await act(async () => {
        (capturedToolbarProps[prop] as (...values: unknown[]) => void)(...args);
      });
    };

    const editItemName = async (itemId: string, value: string) => {
      await act(async () => {
        (
          capturedTableProps.onLineChange as (
            itemId: string,
            lineId: string,
            field: string,
            value: string
          ) => void
        )(itemId, `line-${itemId}`, 'name', value);
      });
    };

    beforeEach(() => {
      editorMode.useReal = true;
      mockEstimateLoad(hierarchyDetail);
    });

    /**
     * 43.1: 階層の上げ下げ・並び替えをサーバーへの保存を伴わずに画面上の明細へ反映する
     * 43.2: これらの操作を連続して行っても保存を発生させない
     * 12.7: 見積項目の操作を編集セッション中にサーバーへ問い合わせずに行う
     */
    it('階層の上げ下げと並び替えを連続して行っても書き込みが発生しないこと (43.1, 43.2, 12.7)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);

      // 下の階層へ: item-b が直前の兄弟 item-a の子になる（23.10）
      await invokeToolbar('onMoveDownItems', ['item-b']);
      expect(tableItems().map((item) => item.id)).toEqual(['item-a']);
      expect(tableItems()[0]?.children.map((child) => child.id)).toEqual(['item-b']);
      // 部分木ごと移動する（子 item-c は item-b の配下に残る）
      expect(tableItems()[0]?.children[0]?.children.map((child) => child.id)).toEqual(['item-c']);

      // 上の階層へ: item-b が親 item-a の兄弟レベルへ戻る（23.9）
      await invokeToolbar('onMoveUpItems', ['item-b']);
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);

      // 同一階層内の並び替え
      await invokeToolbar('onReorderUp', 'item-b');
      expect(tableItems().map((item) => item.id)).toEqual(['item-b', 'item-a']);

      await invokeToolbar('onReorderDown', 'item-b');
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);

      // 連続操作でも書き込みは1件も発生せず、明細の再取得も行われない
      expect(writeCallCount()).toBe(0);
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    });

    /**
     * 実行できない階層移動でもサーバーへ問い合わせない
     *
     * 旧実装は移動可否をページ側で判定して API を呼ぶ/呼ばないを決めていた。
     * 判定は遷移関数（53.3 の `outdentRange` / `indentRange`）へ移り、
     * ルート行の「上の階層へ」は `CANNOT_OUTDENT_ROOT`、直前の兄弟が無い行の
     * 「下の階層へ」は `NO_PRECEDING_SIBLING` で状態を変えない。
     *
     * 12.7: 見積項目の操作を編集セッション中にサーバーへ問い合わせずに行う
     * 43.2: 操作の回数に関わらずサーバーへの保存を発生させない
     */
    it('実行できない階層移動では明細が変化せず書き込みも再取得も起きないこと (12.7, 43.2)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      // ルート行を「上の階層へ」: これ以上上げられない
      await invokeToolbar('onMoveUpItems', ['item-a']);
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);

      // 先頭行を「下の階層へ」: 親になる直前の兄弟が無い
      await invokeToolbar('onMoveDownItems', ['item-a']);
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);

      // 兄弟の端での並び替えも状態を変えない
      await invokeToolbar('onReorderUp', 'item-a');
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);

      expect(writeCallCount()).toBe(0);
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    });

    /**
     * 43.3: 階層の上げ下げまたは並び替えを行った場合、それまでの未保存の編集内容を保持する
     */
    it('階層の上げ下げの後も未保存の編集内容が保持されること (43.3)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await editItemName('item-a', '編集済みA項目');
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');

      await invokeToolbar('onMoveDownItems', ['item-b']);

      // 階層が変わっても編集値は残り、未保存状態のまま保存できる
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
      expect(tableItems()[0]?.children.map((child) => child.id)).toEqual(['item-b']);
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);

      await invokeToolbar('onMoveUpItems', ['item-b']);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
    });

    /**
     * 43.3: 並び替えを行った場合、それまでの未保存の編集内容を保持する
     */
    it('並び替えの後も未保存の編集内容が保持されること (43.3)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await editItemName('item-b', '編集済みB項目');
      await invokeToolbar('onReorderUp', 'item-b');

      expect(tableItems().map((item) => item.id)).toEqual(['item-b', 'item-a']);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みB項目');
      expect(writeCallCount()).toBe(0);
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
    });

    /**
     * 43.4: 諸経費追加を行った場合、それまでの未保存の編集内容を保持する
     *
     * 諸経費行の追加そのものをクライアント側へ移すのは 55.6（段階3）。段階1では
     * サーバー書き込みが残るため、53.9 の暫定ガードが**未保存の編集がある間の起動**を
     * 抑止する。実行できない以上、未保存の編集が失われる余地も無い。
     * ガード解除後（＝段階3）の 43.4 は 55.6 が担う。
     */
    it('未保存の編集がある間は諸経費ダイアログが開かず編集内容が保持されること (43.4, 53.9)', async () => {
      vi.mocked(estimatesApi.addOverheadItem).mockResolvedValue(undefined as never);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByText('諸経費を計算して追加'));

      expect(screen.queryByTestId('overhead-cost-dialog')).not.toBeInTheDocument();
      expect(estimatesApi.addOverheadItem).not.toHaveBeenCalled();
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    /**
     * 43.4: 転記を行った場合、それまでの未保存の編集内容を保持する
     *
     * 転記そのものをクライアント側へ移すのは 55.5（段階3）。段階1では 53.9 の
     * 暫定ガードが未保存の編集がある間の起動を抑止する。
     */
    it('未保存の編集がある間は転記ダイアログが開かず編集内容が保持されること (43.4, 53.9)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));

      expect(screen.queryByTestId('mock-transfer-dialog')).not.toBeInTheDocument();
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    /**
     * 43.4: 利益率適用の後も未保存の編集内容を保持する
     *
     * 利益率適用は段階1のまま（サーバー書き込み）なので 53.9 の暫定ガードが
     * 未保存の編集がある間の起動を抑止する。NET案分は 55.3 でクライアント計算へ
     * 移ったためガードの対象外（未保存の値で案分するのが 5.8 / 18.10 の要件）。
     */
    it('未保存の編集がある間は利益率ダイアログが開かずNET案分は開くこと (43.4, 53.9, 18.10)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByRole('button', { name: /業者金額を実行金額に転記/ }));
      expect(screen.getByTestId('mock-net-dialog')).toBeInTheDocument();
      await user.click(screen.getByTestId('net-close'));

      await user.click(screen.getByRole('button', { name: /実行金額を見積金額に転記/ }));
      expect(screen.queryByTestId('mock-profit-dialog')).not.toBeInTheDocument();

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
    });
  });

  // =========================================================================
  // 転記系ダイアログの暫定ガード（Task 53.9 / 43.4, 49.5, 42.9）
  //
  // 段階1では転記・案分・利益率適用・諸経費追加がサーバーへ書き込むため、
  // (1) 未保存の編集がある間は起動を抑止し、(2) 操作直後にサーバー側で作られた行を
  // 編集状態へ取り込む。(2) を欠くと、次の保存ペイロードに当該行が現れず
  // design.md `#### 保存ペイロードとDB状態の対応`（`id` あり・ペイロードに不在 →
  // `deleteMany`）でサーバー上の行が消える。55.7 でガードごと撤去する暫定措置。
  // =========================================================================

  describe('転記系ダイアログの暫定ガード (Task 53.9)', () => {
    const buildLine = (itemId: string, name: string) => ({
      id: `line-${itemId}`,
      estimateItemId: itemId,
      lineType: 'ESTIMATE' as const,
      name,
      specification: null,
      unit: '式',
      quantity: '1',
      unitPrice: '100000',
      amount: '100000',
      remarks: null,
      sourceReceivedQuotationLineItemId: null,
      sourceVendorName: null,
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });

    const buildItem = (id: string, name: string, displayOrder: number) => ({
      id,
      estimateId: 'est-001',
      parentId: null,
      displayOrder,
      lines: [buildLine(id, name)],
      children: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });

    /** 読み込み直後のサーバー状態（ルート2件） */
    const baseDetail = {
      ...mockEstimateDetail,
      updatedAt: '2024-01-15T10:00:00.000Z',
      items: [buildItem('item-a', 'A項目', 0), buildItem('item-b', 'B項目', 1)],
    } as unknown as estimatesApi.EstimateDetail;

    /**
     * 転記系の操作でサーバー側に行が増えた状態
     *
     * 書き込みを伴うため `Estimate.updatedAt` も進む。クライアントが読み込み時の
     * スナップショットを持ち続けると次の保存が 409 になる（49.5）。
     */
    const resyncedDetail = {
      ...mockEstimateDetail,
      updatedAt: '2024-02-01T09:00:00.000Z',
      items: [
        buildItem('item-a', 'A項目', 0),
        buildItem('item-b', 'B項目', 1),
        buildItem('item-server', '共通仮設費', 2),
      ],
    } as unknown as estimatesApi.EstimateDetail;

    const buildSavedResponse = (): estimatesApi.SaveEstimateDraftResponse =>
      ({
        id: 'est-001',
        projectId: 'proj-001',
        project: { id: 'proj-001', name: 'テストプロジェクト' },
        name: 'テスト見積書',
        sourceItemizedStatementId: 'is-001',
        sourceItemizedStatementName: '内訳書A',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-03-01T00:00:00.000Z',
        itemCount: 2,
        reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        items: [
          { ...buildItem('item-a', 'A項目', 0), itemType: 'STANDARD' },
          { ...buildItem('item-b', 'B項目', 1), itemType: 'STANDARD' },
        ],
      }) as unknown as estimatesApi.SaveEstimateDraftResponse;

    const tableItems = () => (capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[];

    const itemNameOf = (item: EstimateItemHierarchyEdit | undefined) =>
      item?.lines.find((line) => line.lineType === 'ESTIMATE')?.name;

    const editItemName = async (itemId: string, value: string) => {
      await act(async () => {
        (
          capturedTableProps.onLineChange as (
            itemId: string,
            lineId: string,
            field: string,
            value: string
          ) => void
        )(itemId, `line-${itemId}`, 'name', value);
      });
    };

    /** 保存ペイロード（`saveEstimateDraft` の第2引数） */
    const savePayload = (): estimatesApi.SaveEstimateDraftRequest =>
      vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1];

    beforeEach(() => {
      editorMode.useReal = true;
      mockEstimateLoad(baseDetail);
    });

    /**
     * 未保存の変更がある間はサーバーへ書き込む3種のダイアログが開かず、保存を促す
     *
     * 43.4: 転記・案分・利益率適用・諸経費追加でそれまでの未保存の編集内容を保持する
     * 49.5: これらの操作の実行後の保存で競合エラーを発生させない
     *
     * NET案分は 55.3 でクライアント計算へ移りサーバーへ書き込まないため対象外。
     */
    it('未保存の変更がある間はサーバー書き込み系3ダイアログが開かず保存を促すこと (43.4, 49.5)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      const guarded: [RegExp, string][] = [
        [/受領見積書を業者金額に転記/, 'mock-transfer-dialog'],
        [/実行金額を見積金額に転記/, 'mock-profit-dialog'],
        [/諸経費を計算して追加/, 'overhead-cost-dialog'],
      ];

      for (const [buttonName, dialogTestId] of guarded) {
        await user.click(screen.getByRole('button', { name: buttonName }));
        expect(screen.queryByTestId(dialogTestId)).not.toBeInTheDocument();
        expect(screen.getByTestId('estimate-transfer-guard')).toHaveTextContent(
          '転記・案分・利益率適用・諸経費の追加を行う前に保存してください'
        );
      }

      // 抑止中はサーバーへの読み書きが一切起きず、編集内容もそのまま残る
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
    });

    /** ガードの対象はサーバーへ書き込む3種のみ。出力・NET案分は書き込まないため対象外 */
    it('未保存の変更があっても出力ダイアログは開くこと (53.9)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByRole('button', { name: '出力' }));
      expect(screen.getByTestId('mock-export-dialog')).toBeInTheDocument();
      expect(screen.queryByTestId('estimate-transfer-guard')).not.toBeInTheDocument();
    });

    /** 未保存の変更が無ければ従来どおり開く */
    it('未保存の変更が無い間は転記系4ダイアログが開くこと (53.9)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      expect(screen.getByTestId('mock-transfer-dialog')).toBeInTheDocument();
      await user.click(screen.getByTestId('transfer-close'));

      await user.click(screen.getByRole('button', { name: /業者金額を実行金額に転記/ }));
      expect(screen.getByTestId('mock-net-dialog')).toBeInTheDocument();
      await user.click(screen.getByTestId('net-close'));

      await user.click(screen.getByRole('button', { name: /実行金額を見積金額に転記/ }));
      expect(screen.getByTestId('mock-profit-dialog')).toBeInTheDocument();
      await user.click(screen.getByTestId('profit-close'));

      await user.click(screen.getByRole('button', { name: /諸経費を計算して追加/ }));
      expect(screen.getByTestId('overhead-cost-dialog')).toBeInTheDocument();

      expect(screen.queryByTestId('estimate-transfer-guard')).not.toBeInTheDocument();
    });

    /** 保存して未保存が解消されれば起動できるようになる */
    it('保存後は抑止していたダイアログが開くこと (43.4)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      expect(screen.queryByTestId('mock-transfer-dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      // 保存で未保存が解消されると案内も下がる
      await waitFor(() => {
        expect(screen.queryByTestId('estimate-transfer-guard')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      expect(screen.getByTestId('mock-transfer-dialog')).toBeInTheDocument();
    });

    /**
     * 諸経費追加でサーバー側に作られた行を編集状態へ取り込み、次の保存で削除させない
     *
     * 42.9: 保存処理において既存の見積項目とその実行予算項目からの参照関係を維持する
     *   （取り込まないと当該行がペイロードから欠落し `deleteMany` の対象になる）
     */
    it('諸経費追加で作られた行を取り込み、その後の編集を保存しても消えないこと (42.9)', async () => {
      vi.mocked(estimatesApi.addOverheadItem).mockResolvedValue(undefined as never);
      mockEstimateLoadOnce(baseDetail);
      mockEstimateLoad(resyncedDetail);
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      // 編集が無い状態で諸経費を追加する（ガードにより必ずこの状態で実行される）
      await user.click(screen.getByRole('button', { name: /諸経費を計算して追加/ }));
      await user.click(screen.getByTestId('overhead-add'));

      await waitFor(() => {
        expect(estimatesApi.addOverheadItem).toHaveBeenCalledTimes(1);
      });
      // サーバー側で作られた行が編集状態へ取り込まれる
      await waitFor(() => {
        expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b', 'item-server']);
      });

      // 取り込み後にセルを編集して保存しても、当該行はペイロードに残る
      await editItemName('item-a', '編集済みA項目');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      expect(savePayload().items.map((node) => node.id)).toEqual([
        'item-a',
        'item-b',
        'item-server',
      ]);
    });

    /**
     * 転記完了でサーバー側に作られた行を取り込み、基準時刻も最新へ進める
     *
     * 49.5: これらの操作の実行後に保存操作を行った場合、競合エラーを発生させない
     *   （書き込みで進んだ `Estimate.updatedAt` を取り込まないと次の保存が 409 になる）
     */
    it('転記完了で行を取り込み、次の保存が最新の基準時刻を送ること (49.5, 42.9)', async () => {
      mockEstimateLoadOnce(baseDetail);
      mockEstimateLoad(resyncedDetail);
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(buildSavedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      await user.click(screen.getByTestId('transfer-complete'));

      await waitFor(() => {
        expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b', 'item-server']);
      });

      await editItemName('item-a', '編集済みA項目');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      // 読み込み時のスナップショットではなく、転記後に取り直した時刻を送る
      expect(savePayload().expectedUpdatedAt).toBe('2024-02-01T09:00:00.000Z');
      expect(savePayload().items.map((node) => node.id)).toEqual([
        'item-a',
        'item-b',
        'item-server',
      ]);
    });

    /** 利益率適用も同じ取り込み経路を通る */
    it('利益率の完了でも行を取り込むこと (42.9)', async () => {
      mockEstimateLoadOnce(baseDetail);
      mockEstimateLoad(resyncedDetail);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await user.click(screen.getByRole('button', { name: /実行金額を見積金額に転記/ }));
      await user.click(screen.getByTestId('profit-complete'));
      await waitFor(() => {
        expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b', 'item-server']);
      });
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(2);
    });

    /**
     * NET案分はクライアント計算のため取り込み（再取得）の経路を通らない（55.3 / 49.2, 49.3）
     *
     * 案分結果が実際に編集状態へ入ることは
     * `EstimateDetailPage.netAllocation.test.tsx`（実物のダイアログと明細テーブル）が持つ。
     * 本ファイルは `../components/estimate` を丸ごとモックするため結線の生死は判定できない。
     */
    it('NET案分の適用では明細を再取得しないこと (49.2, 49.3)', async () => {
      mockEstimateLoadOnce(baseDetail);
      mockEstimateLoad(resyncedDetail);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await user.click(screen.getByRole('button', { name: /業者金額を実行金額に転記/ }));
      await user.click(screen.getByTestId('net-apply'));

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);
    });

    /** 取り込みに失敗したときは黙って続行させず再読み込みを促す */
    it('取り込みに失敗した場合は再読み込みを促すこと (42.9)', async () => {
      mockEstimateLoadOnce(baseDetail);
      vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValue(new Error('network'));
      vi.mocked(estimatesApi.getEstimateItems).mockRejectedValue(new Error('network'));
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      await user.click(screen.getByTestId('transfer-complete'));

      await waitFor(() => {
        expect(screen.getByTestId('estimate-transfer-guard')).toHaveTextContent(
          '転記結果の取り込みに失敗しました'
        );
      });
      // 画面全体をエラー表示へ差し替えない（編集中の明細を消さない）
      expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
    });

    /**
     * 未保存の変更がある状態で見積書を削除しても、削除後の遷移が離脱ガードに
     * 捕捉されない（53.7 の申し送り）。捕捉されると「このページにとどまる」を
     * 選んだユーザーが削除済みレコードの詳細画面に取り残される。
     */
    it('未保存の変更がある状態で削除しても遷移が離脱ガードに捕捉されないこと (27.6)', async () => {
      vi.mocked(estimatesApi.deleteEstimate).mockResolvedValue();
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');
      expect(mockUseBlocker).toHaveBeenLastCalledWith(true);

      const headerDeleteButton = screen
        .getAllByRole('button', { name: /削除/ })
        .find((button) => !(button as HTMLButtonElement).disabled)!;
      await user.click(headerDeleteButton);

      const confirmButtons = screen.getAllByRole('button', { name: /^削除$/ });
      await user.click(confirmButtons[confirmButtons.length - 1]!);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-001/estimates');
      });
      expect(mockUseBlocker).toHaveBeenLastCalledWith(false);
    });
  });

  // =========================================================================
  // 未保存状態の表示と離脱ガード（Task 53.7 / REQ-27.4〜27.7）
  //
  // 実物の `useEstimateEditor` と `estimateEditReducer` を通し、画面の未保存表示・
  // 離脱ガード・保存ボタン活性が編集状態と一致することを検証する。
  // =========================================================================

  describe('未保存状態の表示と離脱ガード (REQ-27)', () => {
    /**
     * 書き込み系APIの呼び出し総数
     *
     * 「自動保存を行わない」（27.7）は否定の要件のため、特定エンドポイントの
     * 未呼び出しではなく**書き込み経路の総数が0であること**で証明する。
     */
    const writeCallCount = (): number =>
      [
        estimatesApi.saveEstimateDraft,
        estimatesApi.createEstimate,
        estimatesApi.updateEstimate,
        estimatesApi.deleteEstimate,
        estimatesApi.transferFromQuotation,
        estimatesApi.calculateOverhead,
        estimatesApi.addOverheadItem,
        estimatesApi.addDiscountItem,
      ].reduce((total, fn) => total + vi.mocked(fn).mock.calls.length, 0);

    /** 保存応答（`PUT /api/estimates/:id/save`）の最小形 */
    const savedResponse = (): estimatesApi.SaveEstimateDraftResponse => ({
      id: 'est-001',
      projectId: 'proj-001',
      project: { id: 'proj-001', name: 'テストプロジェクト' },
      name: 'テスト見積書',
      sourceItemizedStatementId: 'is-001',
      sourceItemizedStatementName: '内訳書A',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-20T12:00:00.000Z',
      itemCount: 1,
      reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
      items: [
        {
          id: 'item-001',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          itemType: 'STANDARD',
          lines: [
            {
              id: 'line-001',
              estimateItemId: 'item-001',
              lineType: 'ESTIMATE',
              name: 'サーバー確定名称',
              specification: null,
              unit: '式',
              quantity: '1',
              unitPrice: '100000',
              amount: '100000',
              remarks: null,
              sourceReceivedQuotationLineItemId: null,
              sourceVendorName: null,
            },
          ],
          children: [],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-20T12:00:00.000Z',
        },
      ],
    });

    const tableItems = () => (capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[];

    const editEstimateName = async (value: string) => {
      await act(async () => {
        (
          capturedTableProps.onLineChange as (
            itemId: string,
            lineId: string,
            field: string,
            value: string
          ) => void
        )('item-001', 'line-001', 'name', value);
      });
    };

    /** ブラウザの離脱（タブを閉じる/再読み込み）を模した beforeunload の発火 */
    const dispatchBeforeUnload = (): Event => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event;
    };

    const lastBlockerArg = () => {
      const calls = mockUseBlocker.mock.calls;
      return calls[calls.length - 1]?.[0];
    };

    beforeEach(() => {
      editorMode.useReal = true;
    });

    /**
     * 27.4: 未保存の変更がない場合、保存ボタンを無効状態で表示する
     * 27.5: 未保存の変更がある間はその旨を画面上に表示する
     */
    it('未保存の変更が無い間は未保存表示を出さず保存ボタンを無効にする (27.4, 27.5)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });

      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    });

    /**
     * 27.5: 未保存の変更がある間はその旨を画面上に表示する
     * 27.4: 未保存の変更がある場合は保存ボタンが有効になる（無効表示は未保存が無い場合のみ）
     */
    it('未保存の変更がある間はその旨を画面上に表示する (27.5, 27.4)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');

      const indicator = screen.getByTestId('estimate-unsaved-indicator');
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveTextContent('未保存の変更があります');
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    /**
     * 27.5: 未保存の変更が無くなった後は未保存の表示を残さない
     * 27.4: 未保存の変更がない場合、保存ボタンを無効状態で表示する
     */
    it('保存が成功して未保存の変更が無くなると未保存表示が消える (27.5, 27.4)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(savedResponse());
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');
      expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    });

    /**
     * 27.6: 未保存の変更がある状態で画面を離れようとした場合、確認を求める
     *
     * アプリ内の画面遷移は React Router の遷移ブロックで捕捉する。
     * 未保存の変更が無い間はガードしない（確認を求めない）。
     */
    it('未保存の変更に応じてアプリ内遷移のガードが切り替わる (27.6)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      expect(lastBlockerArg()).toBe(false);

      await editEstimateName('編集済み名称');

      await waitFor(() => {
        expect(lastBlockerArg()).toBe(true);
      });
    });

    /**
     * 27.6: 未保存の変更がある状態で画面を離れようとした場合、確認を求める
     */
    it('離脱が捕捉されたとき確認ダイアログを表示する (27.6)', async () => {
      mockUseBlocker.mockImplementation(() => ({
        state: 'blocked' as const,
        proceed: mockBlockerProceed,
        reset: mockBlockerReset,
      }));
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });

      expect(
        await screen.findByRole('dialog', { name: '変更が保存されていません' })
      ).toBeInTheDocument();
    });

    /**
     * 27.6: 確認の結果に従って離脱する
     */
    it('確認ダイアログで「ページを離れる」を選ぶと遷移を続行する (27.6)', async () => {
      mockUseBlocker.mockImplementation(() => ({
        state: 'blocked' as const,
        proceed: mockBlockerProceed,
        reset: mockBlockerReset,
      }));
      const user = userEvent.setup();
      renderPage();

      const dialog = await screen.findByRole('dialog', { name: '変更が保存されていません' });
      await user.click(within(dialog).getByRole('button', { name: 'ページを離れる' }));

      expect(mockBlockerProceed).toHaveBeenCalledTimes(1);
      expect(mockBlockerReset).not.toHaveBeenCalled();
    });

    /**
     * 27.6: 確認の結果に従って離脱を取りやめる（編集内容は保持される）
     */
    it('確認ダイアログで「このページにとどまる」を選ぶと遷移を取り消す (27.6)', async () => {
      mockUseBlocker.mockImplementation(() => ({
        state: 'blocked' as const,
        proceed: mockBlockerProceed,
        reset: mockBlockerReset,
      }));
      const user = userEvent.setup();
      renderPage();

      const dialog = await screen.findByRole('dialog', { name: '変更が保存されていません' });
      await user.click(within(dialog).getByRole('button', { name: 'このページにとどまる' }));

      expect(mockBlockerReset).toHaveBeenCalledTimes(1);
      expect(mockBlockerProceed).not.toHaveBeenCalled();
    });

    /**
     * 27.6: ブラウザ操作による離脱（タブを閉じる・再読み込み）でも確認を求める
     *
     * 標準の beforeunload を打ち消す（`preventDefault`）ことでブラウザが確認を表示する。
     */
    it('未保存の変更がある間はブラウザの離脱で確認を求める (27.6)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');

      await waitFor(() => {
        expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
      });
    });

    /**
     * 27.6: 未保存の変更が無い間は確認を求めない（離脱を妨げない）
     */
    it('未保存の変更が無い間はブラウザの離脱で確認を求めない (27.6)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });

      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    });

    /**
     * 27.6: 画面を離れた後に確認を残さない（リスナーを解除する）
     */
    it('画面のアンマウント後はブラウザの離脱で確認を求めない (27.6)', async () => {
      const { unmount } = renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(1);
      });
      await editEstimateName('編集済み名称');
      await waitFor(() => {
        expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
      });

      unmount();

      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    });

    /**
     * 27.7: 自動保存を行わない
     *
     * 編集・行追加を行ったうえで時間を進め、書き込み経路の呼び出し総数が0のままで
     * あることを確認する。書き込みが発生するのは利用者が保存ボタンを押した場合のみ。
     *
     * **偽の timer は描画前に導入する**。編集より後に `vi.useFakeTimers()` を
     * 呼ぶと、それ以前に実タイマーで予約された自動保存が `advanceTimersByTime` の
     * 対象外となり、自動保存があっても検出できない（変異検証で確認済み）。
     * 偽の timer 下では `waitFor` / `userEvent` の内部待機が進まないため、
     * `act` と `advanceTimersByTimeAsync` / `fireEvent` だけで駆動する。
     */
    it('編集後に時間が経過しても自動保存を行わない (27.7)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue(savedResponse());
      vi.useFakeTimers();

      try {
        renderPage();

        // 初回読み込み（モックAPIの解決）はマイクロタスクのみで完了する
        await act(async () => {
          await Promise.resolve();
        });
        expect(tableItems()).toHaveLength(1);

        await editEstimateName('編集1');
        await editEstimateName('編集2');
        await act(async () => {
          (capturedToolbarProps.onAddItem as () => void)();
        });
        expect(writeCallCount()).toBe(0);

        // 時間経過（デバウンス/インターバルによる自動保存があれば発火する）
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        });

        expect(writeCallCount()).toBe(0);
        // 未保存のまま維持される（自動保存で解消されていない）
        expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

        // 書き込みは利用者の明示的な保存操作でのみ発生する
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: '保存' }));
        });
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
        expect(writeCallCount()).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // =========================================================================
  // 明細の階層の読み込み（Task 53.15 / REQ-2.2, 2.6, 23.9, 34.5, 42.1, 45.3）
  //
  // 退行の機序:
  // `GET /api/estimates/:id`（`estimate.service.ts` の `toEstimateDetailInfo`）は
  // 明細を**平坦な配列**で返し、`parentId` は持つが `children` キーを持たない。
  // これを `toEditFormat` に渡すと `item.children` が `undefined` になるため
  // 全項目が `children: []` となり、編集状態では全項目がルート扱いになる。
  // 一括保存は全件同期のため、この状態で保存すると DB 上の `parentId` が
  // NULL 化され既存見積書の階層が無言で失われる（保存自体は 200 で成功する）。
  //
  // したがって明細は階層形を返す `GET /api/estimates/:id/items` から読み込む。
  // 検証は**実物の `useEstimateEditor`** を通し、ページの結線ごと固定する
  // （53.4 の教訓: フック単体テストではページ経路の退行を検出できない）。
  // =========================================================================

  describe('明細の階層の読み込み (Task 53.15)', () => {
    const buildLine = (itemId: string, name: string) => ({
      id: `line-${itemId}`,
      estimateItemId: itemId,
      lineType: 'ESTIMATE' as const,
      name,
      specification: null,
      unit: '式',
      quantity: '1',
      unitPrice: '100000',
      amount: '100000',
      remarks: null,
      sourceReceivedQuotationLineItemId: null,
      sourceVendorName: null,
    });

    /**
     * `GET /api/estimates/:id` の**実際の**応答形（稼働中バックエンドで実測）
     *
     * 明細は平坦な2件で、`children` キーも `itemType` も存在しない。
     * 型宣言（`EstimateDetail.items: EstimateItemHierarchy[]`）はネスト形を
     * 主張しているが実体は伴わないため、キャストで実体側に合わせる。
     */
    const flatDetail = {
      id: 'est-001',
      projectId: 'proj-001',
      project: { id: 'proj-001', name: 'テストプロジェクト' },
      name: 'テスト見積書',
      sourceItemizedStatementId: null,
      sourceItemizedStatementName: null,
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-20T12:00:00.000Z',
      itemCount: 3,
      totalAmount: '100000',
      items: [
        {
          id: 'item-parent',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 0,
          lines: [buildLine('item-parent', '親項目')],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'item-child',
          estimateId: 'est-001',
          parentId: 'item-parent',
          displayOrder: 0,
          lines: [buildLine('item-child', '子項目')],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'item-sibling',
          estimateId: 'est-001',
          parentId: null,
          displayOrder: 1,
          lines: [buildLine('item-sibling', '兄弟項目')],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      ],
    } as unknown as estimatesApi.EstimateDetail;

    /**
     * `GET /api/estimates/:id/items` の応答形（稼働中バックエンドで実測）
     *
     * `EstimateItemService.getHierarchy` が親子関係を組んだツリーを返し、
     * `children` と `itemType` を持つ。行の形（数量・単価・金額が数値で返る点を含む）は
     * `GET /api/estimates/:id` と同一のため、保存時の10進数文字列への正規化
     * （`toDecimalPayloadValue`、53.5）はそのまま機能する。
     */
    const nestedItems = [
      {
        id: 'item-parent',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        itemType: 'STANDARD' as const,
        lines: [buildLine('item-parent', '親項目')],
        children: [
          {
            id: 'item-child',
            estimateId: 'est-001',
            parentId: 'item-parent',
            displayOrder: 0,
            itemType: 'STANDARD' as const,
            lines: [buildLine('item-child', '子項目')],
            children: [],
            createdAt: '2024-01-15T10:00:00.000Z',
            updatedAt: '2024-01-15T10:00:00.000Z',
          },
        ],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'item-sibling',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 1,
        itemType: 'STANDARD' as const,
        lines: [buildLine('item-sibling', '兄弟項目')],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ] as unknown as estimatesApi.EstimateItemHierarchy[];

    /** 転記などサーバー側の書き込み後に取り直す階層（子はそのまま維持される） */
    const resyncedNestedItems = [
      ...nestedItems,
      {
        id: 'item-server',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 2,
        itemType: 'STANDARD' as const,
        lines: [buildLine('item-server', 'サーバー生成項目')],
        children: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ] as unknown as estimatesApi.EstimateItemHierarchy[];

    const tableItems = () => (capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[];

    const savePayload = (): estimatesApi.SaveEstimateDraftRequest =>
      vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1];

    const editItemName = async (itemId: string, value: string) => {
      await act(async () => {
        (
          capturedTableProps.onLineChange as (
            itemId: string,
            lineId: string,
            field: string,
            value: string
          ) => void
        )(itemId, `line-${itemId}`, 'name', value);
      });
    };

    beforeEach(() => {
      editorMode.useReal = true;
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(flatDetail);
      vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue(nestedItems);
    });

    /**
     * 読み込み直後の編集状態が実際の親子関係を保持する
     *
     * 2.2: 親項目を持つ見積項目を親項目の子として階層表示する
     * 2.6: 項目の階層レベルをインデント表示で視覚的に区別する
     *   （表のインデントは編集状態の入れ子から導出されるため、入れ子が正であることが前提）
     * 45.3: ツリー表示では全階層をインデント付きで一覧表示する
     */
    it('読み込み直後の編集状態が既存の親子関係を保持すること (2.2, 2.6, 45.3)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      // ルートは親と兄弟の2件。子は親の配下に入る（平坦化されない）
      expect(tableItems().map((item) => item.id)).toEqual(['item-parent', 'item-sibling']);
      expect(tableItems()[0]?.children.map((child) => child.id)).toEqual(['item-child']);
      // 全3項目が表示対象として残っている（読み込みで項目が失われない）
      expect(tableItems()[1]?.children).toEqual([]);
    });

    /**
     * 子項目が「上の階層へ」の対象になる
     *
     * 23.9: 選択中の項目を現在の親の兄弟レベルに移動する
     *   ツールバーの活性判定は `selectedItem.parentId !== null` のため、
     *   読み込みで親子関係が失われると子項目を選んでも無効のままになる。
     */
    it('読み込んだ子項目に親が設定され「上の階層へ」の対象になること (23.9)', async () => {
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      const child = tableItems()[0]?.children[0];
      expect(child?.id).toBe('item-child');
      expect(child?.parentId).toBe('item-parent');
    });

    /**
     * 再読み込み後に編集して保存しても階層が壊れない（本タスクの中核）
     *
     * 34.5: 階層を変更して保存した場合、画面再読み込み後も変更後の構造で表示する
     * 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
     *   一括保存は全件同期のため、ペイロードの入れ子がそのまま DB の親子関係になる。
     *   平坦な編集状態から保存すると既存の階層が NULL 化される。
     */
    it('読み込み後にセルを編集して保存しても階層がペイロードに保たれること (34.5, 42.1)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue({
        ...flatDetail,
        reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        items: nestedItems,
      } as unknown as estimatesApi.SaveEstimateDraftResponse);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await editItemName('item-child', '編集済み子項目');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      // 送信されるツリーはルート2件で、子は親の `children` に入ったまま
      expect(savePayload().items.map((node) => node.id)).toEqual(['item-parent', 'item-sibling']);
      expect(savePayload().items[0]!.children.map((node) => node.id)).toEqual(['item-child']);
      expect(savePayload().items[0]!.children[0]!.lines[0]!.name).toBe('編集済み子項目');
    });

    /**
     * 転記系操作後の再同期も階層形の経路を通る（53.9 の `resyncAfterServerSideMutation`）
     *
     * 再同期が平坦な明細を編集状態へ流し込むと、次の保存で同じ破壊が起きる。
     *
     * 34.5: 画面再読み込み後も変更後の構造で表示する
     * 42.1: 変更を1回の保存操作でまとめて確定する
     */
    it('転記後の再同期でも階層が保たれ、次の保存で壊れないこと (34.5, 42.1)', async () => {
      vi.mocked(estimatesApi.getEstimateItems)
        .mockResolvedValueOnce(nestedItems)
        .mockResolvedValue(resyncedNestedItems);
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue({
        ...flatDetail,
        reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        items: resyncedNestedItems,
      } as unknown as estimatesApi.SaveEstimateDraftResponse);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      await user.click(screen.getByTestId('transfer-complete'));

      // サーバー側で作られた行を取り込んでも既存の親子関係は保たれる
      await waitFor(() => {
        expect(tableItems().map((item) => item.id)).toEqual([
          'item-parent',
          'item-sibling',
          'item-server',
        ]);
      });
      expect(tableItems()[0]?.children.map((child) => child.id)).toEqual(['item-child']);

      await editItemName('item-sibling', '編集済み兄弟項目');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      expect(savePayload().items[0]!.children.map((node) => node.id)).toEqual(['item-child']);
    });
  });

  // =========================================================================
  // 折りたたみの表示状態と表の結線（Task 54.2）
  // =========================================================================

  /**
   * 画面が `useEstimateNavigation` の折りたたみ状態と切替関数を
   * **同一インスタンスとして**表へ渡していることを検証する。
   *
   * `collapsedKeys` / `onToggleCollapsed` のどちらか一方でも渡し忘れると、
   * 型検査も既存テストも緑のまま実画面の展開・折りたたみだけが無反応になる
   * （53.14 の死んだ `onDragStart` / `onDrop` と同じ沈黙する失敗）。
   * そのため「切替関数を呼ぶ → 折りたたみキーが変わる」という往復で結線を固定する。
   *
   * Requirements (estimate-creation):
   * - 2.7: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
   * - 45.4: ツリー表示では子項目を持つ項目に展開/折りたたみの操作を提供する
   * - 45.5: 項目を折りたたんだ場合、その子孫項目を非表示にする
   */
  describe('折りたたみの表示状態と表の結線 (2.7, 45.4, 45.5)', () => {
    const collapsedKeys = (): ReadonlySet<string> =>
      capturedTableProps.collapsedKeys as ReadonlySet<string>;

    const toggleCollapsed = async (key: string): Promise<void> => {
      const handler = capturedTableProps.onToggleCollapsed;
      // 画面が渡し忘れていれば関数ではない（この時点で失敗させる）
      expect(typeof handler).toBe('function');
      await act(async () => {
        (handler as (key: string) => void)(key);
      });
    };

    it('表へ渡した onToggleCollapsed の呼び出しが同じ collapsedKeys に反映されること (2.7, 45.5)', async () => {
      editorMode.useReal = true;
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });

      // 初期状態は折りたたみなし（表示状態フックの既定）
      expect(collapsedKeys()).toBeInstanceOf(Set);
      expect([...collapsedKeys()]).toEqual([]);

      // 表からの通知で折りたたまれる
      await toggleCollapsed('item-001');
      expect([...collapsedKeys()]).toEqual(['item-001']);

      // 同じキーの再通知で展開へ戻る（同一インスタンスのトグルであることの裏付け）
      await toggleCollapsed('item-001');
      expect([...collapsedKeys()]).toEqual([]);
    });

    it('折りたたみ操作が編集状態（保存対象のツリー）を変えないこと (45.5)', async () => {
      editorMode.useReal = true;
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });
      const before = capturedTableProps.items as EstimateItemHierarchyEdit[];

      await toggleCollapsed('item-001');

      // 表示状態の変更なので、表へ渡す明細ツリーも未保存状態も動かない
      expect(capturedTableProps.items).toBe(before);
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    });
  });

  // =========================================================================
  // ドリルダウン表示の現在階層と表の結線（Task 54.3）
  // =========================================================================

  /**
   * 画面が `useEstimateNavigation` の現在階層と設定関数を**同一インスタンスとして**
   * 表へ渡していることを検証する。
   *
   * `currentLevelKey` / `onCurrentLevelChange` のどちらか一方でも渡し忘れると、
   * 型検査も既存テストも緑のまま実画面の階層下げ・階層上げ・経路クリックだけが
   * 無反応になる（53.14 の死んだ `onDragStart` / `onDrop` と同じ沈黙する失敗）。
   * そのため「設定関数を呼ぶ → 現在階層が変わる」という往復で結線を固定する。
   *
   * Requirements (estimate-creation):
   * - 45.6: ドリルダウン表示では現在の階層に属する項目のみを一覧表示する
   * - 45.7: 経路上の各階層へ戻る操作を提供する
   * - 45.8 / 45.9: 階層下げ・階層上げで表示する階層を切り替える
   */
  describe('ドリルダウン表示の現在階層と表の結線 (45.6, 45.7, 45.8, 45.9)', () => {
    const changeLevel = async (key: string | null): Promise<void> => {
      const handler = capturedTableProps.onCurrentLevelChange;
      // 画面が渡し忘れていれば関数ではない（この時点で失敗させる）
      expect(typeof handler).toBe('function');
      await act(async () => {
        (handler as (key: string | null) => void)(key);
      });
    };

    it('表へ渡した onCurrentLevelChange の呼び出しが同じ currentLevelKey に反映されること', async () => {
      editorMode.useReal = true;
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });

      // 初期状態はルート階層（表示状態フックの既定）
      expect(capturedTableProps.currentLevelKey).toBeNull();

      // 階層下げ・経路クリックの通知が現在階層へ往復する
      await changeLevel('item-001');
      expect(capturedTableProps.currentLevelKey).toBe('item-001');

      // 階層上げでルート階層へ戻る
      await changeLevel(null);
      expect(capturedTableProps.currentLevelKey).toBeNull();
    });

    it('表示モードを表示状態フックから表へ渡していること（既定はツリー表示 / 45.2）', async () => {
      editorMode.useReal = true;
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });

      // 切替UIは 54.4 の担当。ここでは表示状態フックの既定値が表へ届くことのみ固定する
      expect(capturedTableProps.viewMode).toBe('tree');
    });

    it('階層移動が編集状態（保存対象のツリー）を変えないこと (45.6)', async () => {
      editorMode.useReal = true;
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });
      const before = capturedTableProps.items as EstimateItemHierarchyEdit[];

      await changeLevel('item-001');

      expect(capturedTableProps.items).toBe(before);
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    });
  });

  // =========================================================================
  // 階層表示モードの切替と引き継ぎ（Task 54.4）
  // =========================================================================

  /**
   * 画面がツールバーの切替通知を表示状態フックへ渡し、その結果を表へ届けている
   * ことを**往復**で検証する。
   *
   * 54.3 の時点では切替UIが無く、`viewMode` はフックの既定値を渡すだけだったため
   * `viewMode="tree"` のリテラル直書きへ変異させてもテストが緑のままだった。
   * 切替UIが入る本タスクでは「切替を通知する → 表へ届く `viewMode` が変わる」で
   * 結線を固定し、53.14 の死んだ `onDragStart` / `onDrop` と同型の
   * 沈黙する失敗を防ぐ。実物のコンポーネントを描画した経路は
   * `EstimateDetailPage.viewMode.test.tsx` が担う。
   *
   * Requirements (estimate-creation):
   * - 45.1: ツリー表示とドリルダウン表示を提供する
   * - 45.2: 既定はツリー表示
   * - 45.10: モード切替で未保存の編集内容を保持する
   * - 45.11: 選択したモードを次回の画面表示時に引き継ぐ
   */
  describe('階層表示モードの切替と引き継ぎ (45.1, 45.2, 45.10, 45.11)', () => {
    const savePayload = (): estimatesApi.SaveEstimateDraftRequest =>
      vi.mocked(estimatesApi.saveEstimateDraft).mock.calls[0]![1];

    const changeViewMode = async (mode: string): Promise<void> => {
      const handler = capturedToolbarProps.onViewModeChange;
      // 画面が渡し忘れていれば関数ではない（この時点で失敗させる）
      expect(typeof handler).toBe('function');
      await act(async () => {
        (handler as (mode: string) => void)(mode);
      });
    };

    const editEstimateName = async (value: string): Promise<void> => {
      await act(async () => {
        (
          capturedTableProps.onLineChange as (
            itemId: string,
            lineId: string,
            field: string,
            value: string
          ) => void
        )('item-001', 'line-001', 'name', value);
      });
    };

    beforeEach(() => {
      editorMode.useReal = true;
      window.localStorage.clear();
    });

    afterEach(() => {
      // 端末単位の保存値が他のテストの初期表示モードへ漏れないようにする
      window.localStorage.clear();
    });

    it('ツールバーの切替通知が表の表示モードへ往復すること (45.1)', async () => {
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });

      // 既定はツリー表示（45.2）。ツールバーにも同じモードが届く
      expect(capturedTableProps.viewMode).toBe('tree');
      expect(capturedToolbarProps.viewMode).toBe('tree');

      await changeViewMode('drilldown');
      expect(capturedTableProps.viewMode).toBe('drilldown');
      expect(capturedToolbarProps.viewMode).toBe('drilldown');

      await changeViewMode('tree');
      expect(capturedTableProps.viewMode).toBe('tree');
      expect(capturedToolbarProps.viewMode).toBe('tree');
    });

    /**
     * design.md の状態遷移図はドリルダウン表示の入口を `[*] --> ルート階層` と
     * 定義している。モード切替でドリルダウン表示へ入る場合もルート階層から始める。
     */
    it('モード切替でドリルダウン表示へ入るとルート階層から始まること (45.1)', async () => {
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });

      await changeViewMode('drilldown');
      await act(async () => {
        (capturedTableProps.onCurrentLevelChange as (key: string | null) => void)('item-001');
      });
      expect(capturedTableProps.currentLevelKey).toBe('item-001');

      // ツリー表示へ戻し、再びドリルダウン表示にするとルート階層
      await changeViewMode('tree');
      await changeViewMode('drilldown');

      expect(capturedTableProps.currentLevelKey).toBeNull();
    });

    it('モード切替が編集状態（保存対象のツリー）を変えないこと (45.10)', async () => {
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });
      const before = capturedTableProps.items as EstimateItemHierarchyEdit[];

      await changeViewMode('drilldown');

      expect(capturedTableProps.items).toBe(before);
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    });

    it('モードを切り替えても未保存の編集内容が保持され、保存ペイロードに表示状態が入らないこと (45.10)', async () => {
      vi.mocked(estimatesApi.saveEstimateDraft).mockResolvedValue({
        ...mockEstimateDetail,
        project: { id: 'proj-001', name: 'テストプロジェクト' },
        itemCount: 1,
        reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
        items: mockEstimateDetail.items,
      } as unknown as estimatesApi.SaveEstimateDraftResponse);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });

      await editEstimateName('切替前の編集');
      await changeViewMode('drilldown');
      await changeViewMode('tree');

      // 未保存の編集内容が切替をまたいで残っている
      const items = capturedTableProps.items as EstimateItemHierarchyEdit[];
      expect(items[0]!.lines.find((line) => line.id === 'line-001')!.name).toBe('切替前の編集');
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      // 保存ペイロードは編集内容のみで、表示状態のキーを一切含まない
      const payload = savePayload();
      expect(Object.keys(payload).sort()).toEqual(['expectedUpdatedAt', 'items', 'reportFields']);
      expect(payload).not.toHaveProperty('viewMode');
      expect(payload).not.toHaveProperty('currentLevelKey');
      expect(payload).not.toHaveProperty('collapsedKeys');
      expect(payload.items[0]!.lines.find((line) => line.lineType === 'ESTIMATE')!.name).toBe(
        '切替前の編集'
      );
      expect(Object.keys(payload.items[0]!).sort()).toEqual([
        'children',
        'id',
        'itemType',
        'lines',
        'tempId',
      ]);
    });

    it('切り替えたモードを端末に保持し、次回の画面表示で引き継ぐこと (45.11)', async () => {
      const first = renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });
      await changeViewMode('drilldown');
      first.unmount();

      capturedTableProps = {};
      capturedToolbarProps = {};
      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });
      expect(capturedTableProps.viewMode).toBe('drilldown');
      expect(capturedToolbarProps.viewMode).toBe('drilldown');
    });

    it('壊れた保存値が残っていても既定のツリー表示で開くこと (45.2)', async () => {
      window.localStorage.setItem(ESTIMATE_VIEW_MODE_STORAGE_KEY, '{壊れた値');

      renderPage();

      await waitFor(() => {
        expect((capturedTableProps.items ?? []) as EstimateItemHierarchyEdit[]).toHaveLength(1);
      });
      expect(capturedTableProps.viewMode).toBe('tree');
      expect(capturedToolbarProps.viewMode).toBe('tree');
    });
  });
});
