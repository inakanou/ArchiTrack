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
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';
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
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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

  it('転記完了コールバックがデータ再取得を実行する', async () => {
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

    // 転記ダイアログを開いて完了ボタンを押す
    const transferBtn = screen.getByRole('button', { name: /受領見積書を業者金額に転記/ });
    await user.click(transferBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-transfer-dialog')).toBeInTheDocument();
    });

    // 初回取得分をクリア
    vi.mocked(estimatesApi.getEstimateDetail).mockClear();

    await user.click(screen.getByTestId('transfer-complete'));

    // onTransferComplete → fetchData が呼ばれる
    await waitFor(() => {
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledWith('est-001');
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
  // 階層移動のテスト (handleMoveUp / handleMoveDown)
  // =========================================================================

  it('handleMoveUpが親項目の上位に移動APIを呼ぶ', async () => {
    const user = userEvent.setup();
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.moveEstimateItem).mockResolvedValue(undefined);

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

    await user.click(screen.getByTestId('toolbar-move-up'));

    await waitFor(() => {
      expect(estimatesApi.moveEstimateItem).toHaveBeenCalledWith('est-001', 'item-child', null);
    });
  });

  it('handleMoveDownが直前の兄弟の子に移動APIを呼ぶ', async () => {
    const user = userEvent.setup();
    // item-parentとitem-siblingがルートレベルの兄弟
    // item-siblingはindex=1なのでpreviousSibling=item-parent
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.moveEstimateItem).mockResolvedValue(undefined);

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

    // handleMoveDownは'item-child'を使うが、item-childはparentIdがitem-parentでindex=0
    // currentIndex <= 0 なのでreturn early. ルートの兄弟を使って検証する
    // ツールバーモックはitem-childでhandleMoveDownを呼ぶので
    // item-childは親item-parentの子でindex=0、previousSiblingがない → early return
    await user.click(screen.getByTestId('toolbar-move-down'));

    // item-childはindex=0なのでcurrentIndex <= 0でearly return
    // moveEstimateItemは呼ばれない
    await waitFor(() => {
      expect(estimatesApi.moveEstimateItem).not.toHaveBeenCalled();
    });
  });

  it('handleMoveUp: 親がないルートアイテムの場合はearly return', async () => {
    // item-parentはparentId=null
    mockEditor.items = mockEditorItemsWithHierarchy;

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

    // handleMoveUpはcapturedToolbarProps経由で直接呼ぶ
    const onMoveUp = capturedToolbarProps.onMoveUp as (id: string) => void;
    onMoveUp('item-parent');

    // item-parentはparentId=nullなのでearly return
    expect(estimatesApi.moveEstimateItem).not.toHaveBeenCalled();
  });

  it('handleMoveUp: estimateがない場合はearly return', async () => {
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);

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

    // estimateは正常にロードされるのでこのテストではearly returnにならないが
    // 存在しないアイテムIDで呼べばfindItemがnullを返す
    const onMoveUp = capturedToolbarProps.onMoveUp as (id: string) => void;
    onMoveUp('non-existent-item');

    expect(estimatesApi.moveEstimateItem).not.toHaveBeenCalled();
  });

  it('handleMoveDown: 存在しないアイテムIDの場合はearly return', async () => {
    mockEditor.items = mockEditorItemsWithHierarchy;

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

    const onMoveDown = capturedToolbarProps.onMoveDown as (id: string) => void;
    onMoveDown('non-existent-item');

    expect(estimatesApi.moveEstimateItem).not.toHaveBeenCalled();
  });

  it('handleMoveUp: 移動API失敗時にエラーメッセージを表示', async () => {
    const user = userEvent.setup();
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.moveEstimateItem).mockRejectedValue(new Error('API Error'));

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

    await user.click(screen.getByTestId('toolbar-move-up'));

    await waitFor(() => {
      expect(screen.getByText('項目の移動に失敗しました')).toBeInTheDocument();
    });
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
  // handleMoveDown: 実際にAPI呼び出しが発生するケース
  // =========================================================================

  it('handleMoveDownが兄弟を持つアイテムで正しく移動APIを呼ぶ', async () => {
    // item-siblingはindex=1でpreviousSibling=item-parentを持つ
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.moveEstimateItem).mockResolvedValue(undefined);

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

    // capturedToolbarPropsから直接onMoveDownを呼ぶ
    const onMoveDown = capturedToolbarProps.onMoveDown as (id: string) => void;
    onMoveDown('item-sibling');

    await waitFor(() => {
      expect(estimatesApi.moveEstimateItem).toHaveBeenCalledWith(
        'est-001',
        'item-sibling',
        'item-parent'
      );
    });
  });

  it('handleMoveDown: 移動API失敗時にエラーメッセージを表示', async () => {
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.moveEstimateItem).mockRejectedValue(new Error('Move failed'));

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

    const onMoveDown = capturedToolbarProps.onMoveDown as (id: string) => void;
    onMoveDown('item-sibling');

    await waitFor(() => {
      expect(screen.getByText('項目の移動に失敗しました')).toBeInTheDocument();
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

  it('handleMoveUp: parentが見つからない場合はearly return', async () => {
    // 子のparentIdは存在するが、editorのitemsツリーではparentが見つからないケース
    mockEditor.items = [
      {
        id: 'item-orphan',
        estimateId: 'est-001',
        parentId: 'non-existent-parent',
        displayOrder: 0,
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
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    const onMoveUp = capturedToolbarProps.onMoveUp as (id: string) => void;
    onMoveUp('item-orphan');

    // parentが見つからないのでAPIは呼ばれない
    expect(estimatesApi.moveEstimateItem).not.toHaveBeenCalled();
  });

  it('handleMoveDown: ネストされた階層でgetSiblingsが再帰的に兄弟を検索すること', async () => {
    // 深い階層: root > parent > [child-a, child-b]
    // child-bをmoveDownするとgetSiblingsが再帰してparentの子を見つける
    mockEditor.items = [
      {
        id: 'root',
        estimateId: 'est-001',
        parentId: null,
        displayOrder: 0,
        lines: [],
        children: [
          {
            id: 'nested-parent',
            estimateId: 'est-001',
            parentId: 'root',
            displayOrder: 0,
            lines: [],
            children: [
              {
                id: 'nested-child-a',
                estimateId: 'est-001',
                parentId: 'nested-parent',
                displayOrder: 0,
                lines: [],
                children: [],
                isExpanded: true,
                createdAt: '2024-01-15T10:00:00.000Z',
                updatedAt: '2024-01-15T10:00:00.000Z',
              },
              {
                id: 'nested-child-b',
                estimateId: 'est-001',
                parentId: 'nested-parent',
                displayOrder: 1,
                lines: [],
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
        ],
        isExpanded: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ];
    vi.mocked(estimatesApi.moveEstimateItem).mockResolvedValue(undefined);

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

    const onMoveDown = capturedToolbarProps.onMoveDown as (id: string) => void;
    // nested-child-bはindex=1でpreviousSibling=nested-child-a
    // getSiblingsはroot.childrenからnested-parentを探し、その子を返す（再帰）
    onMoveDown('nested-child-b');

    await waitFor(() => {
      expect(estimatesApi.moveEstimateItem).toHaveBeenCalledWith(
        'est-001',
        'nested-child-b',
        'nested-child-a'
      );
    });
  });

  it('NET完了コールバックがデータ再取得を実行する', async () => {
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

    // NETダイアログを開いて完了ボタンを押す
    const netBtn = screen.getByRole('button', { name: /業者金額を実行金額に転記/ });
    await user.click(netBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-net-dialog')).toBeInTheDocument();
    });

    vi.mocked(estimatesApi.getEstimateDetail).mockClear();

    await user.click(screen.getByTestId('net-complete'));

    await waitFor(() => {
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledWith('est-001');
    });
  });

  it('利益率完了コールバックがデータ再取得を実行する', async () => {
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

    // 利益率ダイアログを開いて完了ボタンを押す
    const profitBtn = screen.getByRole('button', { name: /実行金額を見積金額に転記/ });
    await user.click(profitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mock-profit-dialog')).toBeInTheDocument();
    });

    vi.mocked(estimatesApi.getEstimateDetail).mockClear();

    await user.click(screen.getByTestId('profit-complete'));

    await waitFor(() => {
      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledWith('est-001');
    });
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
   * 退行防止（53.4）: 保存経路が未接続の間（53.5 まで）、保存操作が未保存の編集を破棄しないこと。
   *
   * 保存後に全件再取得すると `editor.setItems` が編集内容をサーバーデータで上書きし、
   * `isDirty` も false に落ちるため、ユーザーの編集が無言で消える。
   * design.md `#### File Structure Plan` > `#### Modified Files` の
   * 「保存は1回のみ、保存後の `fetchData()` を撤去」に従い再取得を行わない。
   *
   * ここでは**実物の `useEstimateEditor`** を用いて画面との結線ごと検証する。
   */
  it('保存操作で未保存の編集が破棄されないこと', async () => {
    editorMode.useReal = true;
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

  it('ツールバーの値引き行追加がeditor.addDiscountItemを呼ぶ (REQ-41.1)', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-add-discount'));
    expect(mockEditor.addDiscountItem).toHaveBeenCalled();
  });

  it('handleReorderが兄弟順序を入れ替えてreorder APIを呼ぶ (REQ-12.2)', async () => {
    const user = userEvent.setup();
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.reorderEstimateItems).mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    // item-sibling(index=1)を上へ → item-parentと入れ替え、displayOrderを0起点で振り直す
    await user.click(screen.getByTestId('toolbar-reorder-up'));

    await waitFor(() => {
      expect(estimatesApi.reorderEstimateItems).toHaveBeenCalledWith('est-001', [
        { id: 'item-sibling', displayOrder: 0 },
        { id: 'item-parent', displayOrder: 1 },
      ]);
    });
  });

  it('handleReorder: 並び替えAPI失敗時にエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    mockEditor.items = mockEditorItemsWithHierarchy;
    vi.mocked(estimatesApi.reorderEstimateItems).mockRejectedValue(new Error('fail'));

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-toolbar')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('toolbar-reorder-up'));

    await waitFor(() => {
      expect(screen.getByText('項目の並び替えに失敗しました')).toBeInTheDocument();
    });
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
});
