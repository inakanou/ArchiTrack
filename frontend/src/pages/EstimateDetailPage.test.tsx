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

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// モック
vi.mock('../api/estimates');

// useEstimateEditorのモック
const mockEditor = {
  items: [] as ReturnType<typeof import('../hooks/useEstimateEditor').useEstimateEditor>['items'],
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
  toggleExpanded: vi.fn(),
  getTotalAmount: vi.fn().mockReturnValue('0'),
  addDiscountItem: vi.fn(),
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
  EstimateItemTable: (props: Record<string, unknown>) => {
    capturedTableProps = props;
    return (
      <div data-testid="mock-item-table" data-selected-item-id={String(props.selectedItemId ?? '')}>
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
          onClick={() => (props.onDeleteItem as (id: string) => void)('item-1')}
        >
          Delete
        </button>
        <button
          data-testid="toolbar-duplicate"
          onClick={() => (props.onDuplicateItem as (id: string) => void)('item-1')}
        >
          Duplicate
        </button>
        <button
          data-testid="toolbar-move-up"
          onClick={() => (props.onMoveUp as (id: string) => void)('item-child')}
        >
          MoveUp
        </button>
        <button
          data-testid="toolbar-move-down"
          onClick={() => (props.onMoveDown as (id: string) => void)('item-child')}
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

vi.mock('../components/estimate/NetAllocationDialog', () => ({
  NetAllocationDialog: (props: Record<string, unknown>) =>
    props.isOpen ? (
      <div role="dialog" data-testid="mock-net-dialog">
        <button data-testid="net-close" onClick={() => (props.onClose as () => void)()}>
          Close
        </button>
        <button data-testid="net-complete" onClick={() => (props.onComplete as () => void)()}>
          Complete
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
        isExpanded: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ],
    isExpanded: true,
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
    isExpanded: true,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
];

describe('EstimateDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigate.mockReset();
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    // mockEditorの状態リセット
    mockEditor.items = [];
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
    mockEditor.items = [
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
        isExpanded: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];

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

  it('ツールバーのdeleteItemがeditor.deleteItemを呼ぶ', async () => {
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
    expect(mockEditor.deleteItem).toHaveBeenCalledWith('item-1');
  });

  it('ツールバーのduplicateItemがeditor.duplicateItemを呼ぶ', async () => {
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
    expect(mockEditor.duplicateItem).toHaveBeenCalledWith('item-1');
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
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(detailWithNullAmount);

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
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(detailWithNoItems);

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
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
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
    mockEditor.items = [
      {
        id: 'item-first',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [],
        children: [],
        isExpanded: true,
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
        isExpanded: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];

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

    // ツールバーにselectedItemとhasPreviousSiblingが渡されていることを確認
    expect(capturedToolbarProps.selectedItemId).toBe('item-001');
    expect(capturedToolbarProps.hasPreviousSibling).toBe(true);
  });

  it('NaN金額でサマリーが正しく表示されること', async () => {
    mockEditor.items = [
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
        isExpanded: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];

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
    mockEditor.items = [
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
        isExpanded: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];

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
    const user = userEvent.setup();
    mockEditor.items = mockEditorItemsWithHierarchy;

    // select-item-btnは'item-001'をセットするが、ここではmockのonItemSelectを使って
    // 子アイテムを選択する（capturedToolbarPropsで確認）
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

    // onItemSelectを直接呼んで子アイテムを選択
    const table = screen.getByTestId('mock-item-table');
    // item-childはmockEditorItemsWithHierarchyのitem-parentの子
    // selectedItemのfindItemが再帰的にitem-childを見つけるか確認
    await user.click(screen.getByTestId('select-item-btn'));

    // select-item-btnは'item-001'を選択する。mockEditorItemsWithHierarchyには'item-001'がないため
    // selectedItem=nullとなりhasPreviousSibling=false
    await waitFor(() => {
      expect(table).toHaveAttribute('data-selected-item-id', 'item-001');
    });
    // capturedToolbarProps.selectedItem is null because 'item-001' doesn't exist in hierarchy
    expect(capturedToolbarProps.selectedItemId).toBe('item-001');
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
        estimatesApi.createEstimateItem,
        estimatesApi.deleteEstimateItem,
        estimatesApi.moveEstimateItem,
        estimatesApi.reorderEstimateItems,
        estimatesApi.batchUpdateEstimateItems,
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
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue({
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
      expect(estimatesApi.createEstimateItem).not.toHaveBeenCalled();
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
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue({
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
      expect(estimatesApi.reorderEstimateItems).not.toHaveBeenCalled();
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
        estimatesApi.createEstimateItem,
        estimatesApi.deleteEstimateItem,
        estimatesApi.moveEstimateItem,
        estimatesApi.reorderEstimateItems,
        estimatesApi.batchUpdateEstimateItems,
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
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(hierarchyDetail);
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
      await invokeToolbar('onMoveDown', 'item-b');
      expect(tableItems().map((item) => item.id)).toEqual(['item-a']);
      expect(tableItems()[0]?.children.map((child) => child.id)).toEqual(['item-b']);
      // 部分木ごと移動する（子 item-c は item-b の配下に残る）
      expect(tableItems()[0]?.children[0]?.children.map((child) => child.id)).toEqual(['item-c']);

      // 上の階層へ: item-b が親 item-a の兄弟レベルへ戻る（23.9）
      await invokeToolbar('onMoveUp', 'item-b');
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
      await invokeToolbar('onMoveUp', 'item-a');
      expect(tableItems().map((item) => item.id)).toEqual(['item-a', 'item-b']);

      // 先頭行を「下の階層へ」: 親になる直前の兄弟が無い
      await invokeToolbar('onMoveDown', 'item-a');
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

      await invokeToolbar('onMoveDown', 'item-b');

      // 階層が変わっても編集値は残り、未保存状態のまま保存できる
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
      expect(tableItems()[0]?.children.map((child) => child.id)).toEqual(['item-b']);
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);

      await invokeToolbar('onMoveUp', 'item-b');
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
     * 諸経費行の追加そのものをクライアント側へ移すのは 55.6（段階3）。
     * 53.6 では**明細の全件再取得**を撤去し、編集内容が失われないことを保証する。
     */
    it('諸経費追加で未保存の編集内容が保持され明細を再取得しないこと (43.4)', async () => {
      vi.mocked(estimatesApi.addOverheadItem).mockResolvedValue(undefined as never);
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByText('諸経費を計算して追加'));
      await user.click(screen.getByTestId('overhead-add'));

      await waitFor(() => {
        expect(estimatesApi.addOverheadItem).toHaveBeenCalled();
      });

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    /**
     * 43.4: 転記を行った場合、それまでの未保存の編集内容を保持する
     *
     * 転記そのものをクライアント側へ移すのは 55.5（段階3）。
     * 53.6 では**明細の全件再取得**を撤去し、編集内容が失われないことを保証する。
     */
    it('転記完了で未保存の編集内容が保持され明細を再取得しないこと (43.4)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByRole('button', { name: /受領見積書を業者金額に転記/ }));
      await waitFor(() => {
        expect(screen.getByTestId('mock-transfer-dialog')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('transfer-complete'));

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    /**
     * 43.4: NET案分・利益率適用の後も未保存の編集内容を保持する
     */
    it('NET案分・利益率の完了で明細を再取得しないこと (43.4)', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(tableItems()).toHaveLength(2);
      });
      await editItemName('item-a', '編集済みA項目');

      await user.click(screen.getByRole('button', { name: /業者金額を実行金額に転記/ }));
      await waitFor(() => {
        expect(screen.getByTestId('mock-net-dialog')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('net-complete'));

      await user.click(screen.getByRole('button', { name: /実行金額を見積金額に転記/ }));
      await waitFor(() => {
        expect(screen.getByTestId('mock-profit-dialog')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('profit-complete'));

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(1);
      expect(itemNameOf(tableItems()[0])).toBe('編集済みA項目');
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
        estimatesApi.createEstimateItem,
        estimatesApi.deleteEstimateItem,
        estimatesApi.moveEstimateItem,
        estimatesApi.reorderEstimateItems,
        estimatesApi.batchUpdateEstimateItems,
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
});
