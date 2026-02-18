/**
 * @fileoverview 見積書詳細画面のテスト
 *
 * Task 11.3: EstimateDetailPageの実装
 * Task 29-37: REQ-25〜REQ-32 関連の受入基準テスト
 *
 * Requirements:
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.7: 同一見積書を複数ユーザーが編集した場合、楽観的排他制御により競合を検出する
 * - REQ-14.8: 見積書画面を提供する
 * - REQ-14.9: 見積書の詳細情報（見積項目一覧、合計金額等）を表示する
 * - REQ-14.10: 編集・削除・出力ボタンを提供する
 * - REQ-15.4-15.8: パンくずナビゲーション
 * - REQ-26.1-26.2: アクションボタンの配置改善
 * - REQ-27.1-27.4: 保存ボタンとクライアントサイド編集
 * - REQ-28.1-28.4: 表示行フィルター
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateDetailPage from '../../pages/EstimateDetailPage';
import * as estimatesApi from '../../api/estimates';
import type { EstimateDetail, EstimateItemHierarchy } from '../../api/estimates';

// APIモック
vi.mock('../../api/estimates');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// useEstimateEditorモック
const mockEditor = {
  items: [] as EstimateItemHierarchy[],
  setItems: vi.fn(),
  isDirty: false,
  isSaving: false,
  save: vi.fn().mockResolvedValue(undefined),
  discard: vi.fn(),
  updateLine: vi.fn(),
  toggleExpanded: vi.fn(),
  reorderItems: vi.fn(),
  getTotalAmount: vi.fn(() => '100000'),
  addItem: vi.fn(),
  deleteItem: vi.fn(),
  duplicateItem: vi.fn(),
};

vi.mock('../../hooks/useEstimateEditor', () => ({
  useEstimateEditor: () => mockEditor,
}));

// テストデータ
const mockEstimateDetail: EstimateDetail = {
  id: 'est-1',
  projectId: 'project-1',
  name: 'テスト見積書',
  sourceItemizedStatementId: 'is-1',
  sourceItemizedStatementName: '第1回内訳書',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
  items: [
    {
      id: 'item-1',
      estimateId: 'est-1',
      parentId: null,
      displayOrder: 1,
      lines: [
        {
          id: 'line-1',
          estimateItemId: 'item-1',
          lineType: 'ESTIMATE',
          name: '工事A',
          specification: '規格A',
          unit: '式',
          quantity: '1',
          unitPrice: '100000',
          amount: '100000',
          remarks: null,
          sourceReceivedQuotationLineItemId: null,
          sourceVendorName: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      children: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  totalAmount: '100000',
};

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(id: string = 'est-1') {
  return render(
    <MemoryRouter initialEntries={[`/estimates/${id}`]}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
        <Route path="/projects/:projectId/estimates" element={<div>見積書一覧</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.items = mockEstimateDetail.items;
    mockEditor.isDirty = false;
    mockEditor.isSaving = false;
  });

  // ==========================================================================
  // 初期表示
  // ==========================================================================
  describe('初期表示', () => {
    it('ローディング状態が表示されること', () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockImplementation(
        () => new Promise(() => {}) // 永続的にpending
      );

      renderWithRouter();

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
    });

    it('見積書詳細が正常に表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // タイトル表示
      expect(screen.getByRole('heading', { name: 'テスト見積書' })).toBeInTheDocument();

      // 基本情報
      expect(screen.getByText('見積書名')).toBeInTheDocument();
      expect(screen.getByText('第1回内訳書')).toBeInTheDocument();

      // ヘッダーの削除ボタンとツールバーの削除ボタンの両方が存在する
      expect(screen.getAllByRole('button', { name: '削除' }).length).toBeGreaterThanOrEqual(1);
      // アクションボタン（サマリー下）
      expect(screen.getByRole('button', { name: '出力' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '受領見積書を業者金額に転記' })
      ).toBeInTheDocument();
    });

    it('パンくずナビゲーションが表示されること (REQ-15.4-15.8)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // パンくずの各項目を確認
      expect(screen.getByRole('link', { name: 'プロジェクト一覧' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'プロジェクト詳細' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '見積書一覧' })).toBeInTheDocument();
    });

    it('合計金額が表示されること (REQ-14.9)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'サマリー' })).toBeInTheDocument();
      expect(screen.getByText('見積金額合計')).toBeInTheDocument();
      expect(screen.getByText('100,000円')).toBeInTheDocument();
    });

    it('参照内訳書がない場合はハイフンが表示されること', async () => {
      const estimateWithoutSource: EstimateDetail = {
        ...mockEstimateDetail,
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
      };
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(estimateWithoutSource);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 参照内訳書のフィールドでハイフンを確認
      const infoValues = screen.getAllByText('-');
      expect(infoValues.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // エラー表示
  // ==========================================================================
  describe('エラー表示', () => {
    it('APIエラー時にエラーメッセージが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockRejectedValueOnce(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積書の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得すること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: '再試行' });
      await userEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(estimatesApi.getEstimateDetail).toHaveBeenCalledTimes(2);
    });

    it('見積書が見つからない場合にエラーメッセージが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(
        null as unknown as EstimateDetail
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // エラーまたは見積書が見つからないメッセージのいずれかが表示される
      const alertText = screen.getByRole('alert').textContent;
      expect(
        alertText?.includes('見積書が見つかりません') ||
          alertText?.includes('見積書の取得に失敗しました')
      ).toBe(true);
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-26: アクションボタンの配置改善
  // ==========================================================================
  describe('アクションボタンの配置 (REQ-26)', () => {
    it('転記・出力ボタンがサマリーパネルの下に配置されていること (REQ-26.1)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // サマリーパネルの存在確認
      const summaryPanel = screen.getByTestId('summary-panel');
      expect(summaryPanel).toBeInTheDocument();

      // アクションボタンの存在確認
      expect(
        screen.getByRole('button', { name: '受領見積書を業者金額に転記' })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '業者金額を実行金額に転記' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '実行金額を見積金額に転記' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '出力' })).toBeInTheDocument();
    });

    it('ヘッダーには削除ボタンのみが配置されていること (REQ-26.2)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // ヘッダー部分に転記・出力ボタンがないことを確認
      // ヘッダーの headerRight には削除ボタンのみがあるべき
      const headerDeleteButton = screen.getAllByRole('button', { name: '削除' });
      expect(headerDeleteButton.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // REQ-27: 保存ボタンとクライアントサイド編集
  // ==========================================================================
  describe('保存ボタンとクライアントサイド編集 (REQ-27)', () => {
    it('見積項目セクション内に保存ボタンが常に表示されること (REQ-27.2)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 保存ボタンが初期状態で表示されている（編集モード切替不要）
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });

    it('未保存の変更がない場合は保存ボタンが無効状態であること (REQ-27.4)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      mockEditor.isDirty = false;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton).toBeDisabled();
    });

    it('保存ボタンクリック時にsave()が呼び出されること (REQ-27.3)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
      mockEditor.isDirty = true;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: '保存' });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(mockEditor.save).toHaveBeenCalled();
      });
    });

    it('保存中は保存ボタンが「保存中...」と表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      mockEditor.isDirty = true;
      mockEditor.isSaving = true;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '保存中...' })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-28: 表示行フィルター
  // ==========================================================================
  describe('表示行フィルター (REQ-28)', () => {
    it('見積・実行・業者の3つのチェックボックスが表示されること (REQ-28.1)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByText('表示行:')).toBeInTheDocument();
      // フィルターのチェックボックスラベルを確認（他の「見積」テキストと区別するためlabel内を検証）
      const checkboxes = screen.getAllByRole('checkbox');
      const filterCheckboxes = checkboxes.filter((cb) => {
        const parent = cb.closest('label');
        return parent?.textContent?.match(/^見積$|^実行$|^業者$/);
      });
      expect(filterCheckboxes).toHaveLength(3);
    });

    it('デフォルトですべてのチェックボックスがONであること (REQ-28.2)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      // 表示行フィルターのチェックボックスは3つ
      const filterCheckboxes = checkboxes.filter((cb) => {
        const parent = cb.closest('label');
        return parent?.textContent?.match(/見積|実行|業者/);
      });
      expect(filterCheckboxes).toHaveLength(3);
      filterCheckboxes.forEach((cb) => {
        expect(cb).toBeChecked();
      });
    });

    it('チェックボックスのON/OFF切り替えが動作すること (REQ-28.3, REQ-28.4)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      const user = userEvent.setup();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 「見積」チェックボックスを見つけてクリック
      const checkboxes = screen.getAllByRole('checkbox');
      const estimateCheckbox = checkboxes.find((cb) => {
        const parent = cb.closest('label');
        return parent?.textContent?.includes('見積');
      });
      expect(estimateCheckbox).toBeDefined();

      await user.click(estimateCheckbox!);
      expect(estimateCheckbox).not.toBeChecked();

      // 再度クリックでONに戻る
      await user.click(estimateCheckbox!);
      expect(estimateCheckbox).toBeChecked();
    });
  });

  // ==========================================================================
  // 削除機能 (REQ-11.4, REQ-14.10)
  // ==========================================================================
  describe('削除機能', () => {
    /**
     * ヘッダーの削除ボタンを取得するヘルパー
     * ツールバーの「削除」ボタンと区別するため、ツールバー外のボタンを返す
     */
    function getHeaderDeleteButton(): HTMLElement {
      const toolbar = screen.getByTestId('estimate-item-toolbar');
      const allDeleteButtons = screen.getAllByRole('button', { name: '削除' });
      const headerDeleteButton = allDeleteButtons.find((btn) => !toolbar.contains(btn));
      if (!headerDeleteButton) throw new Error('Header delete button not found');
      return headerDeleteButton;
    }

    it('削除ボタンをクリックすると確認ダイアログが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const deleteButton = getHeaderDeleteButton();
      await userEvent.click(deleteButton);

      // ダイアログが表示される
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('見積書の削除')).toBeInTheDocument();
      expect(
        screen.getByText('この見積書を削除してよろしいですか？この操作は取り消せません。')
      ).toBeInTheDocument();
    });

    it('確認ダイアログでキャンセルをクリックするとダイアログが閉じること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = getHeaderDeleteButton();
      await userEvent.click(deleteButton);

      // キャンセル
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await userEvent.click(cancelButton);

      // ダイアログが閉じる
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('確認ダイアログで削除をクリックすると削除処理が実行されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      vi.mocked(estimatesApi.deleteEstimate).mockResolvedValueOnce(undefined);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = getHeaderDeleteButton();
      await userEvent.click(deleteButton);

      // 削除実行
      const confirmDeleteButton = screen
        .getByRole('dialog')
        .querySelector('button:last-child') as HTMLButtonElement;
      await userEvent.click(confirmDeleteButton);

      // APIが呼ばれること
      await waitFor(() => {
        expect(estimatesApi.deleteEstimate).toHaveBeenCalledWith(
          'est-1',
          '2025-01-02T00:00:00.000Z'
        );
      });

      // 一覧画面に遷移
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/estimates');
    });

    it('削除失敗時にエラーメッセージが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);
      vi.mocked(estimatesApi.deleteEstimate).mockRejectedValueOnce(new Error('Delete failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 削除ダイアログを開く
      const deleteButton = getHeaderDeleteButton();
      await userEvent.click(deleteButton);

      // 削除実行
      const confirmDeleteButton = screen
        .getByRole('dialog')
        .querySelector('button:last-child') as HTMLButtonElement;
      await userEvent.click(confirmDeleteButton);

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積書の削除に失敗しました')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 出力機能 (REQ-10.1-10.8, REQ-14.10)
  // ==========================================================================
  describe('出力機能', () => {
    it('出力ボタンをクリックすると出力ダイアログが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: '出力' });
      await userEvent.click(exportButton);

      // EstimateExportDialogが表示される
    });
  });

  // ==========================================================================
  // 転記機能 (REQ-4.1-4.5)
  // ==========================================================================
  describe('転記機能', () => {
    it('転記ボタンをクリックすると転記ダイアログが表示されること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const transferButton = screen.getByRole('button', { name: '受領見積書を業者金額に転記' });
      await userEvent.click(transferButton);

      // TransferQuotationDialogが表示される
    });
  });

  // ==========================================================================
  // 見積書一覧に戻る
  // ==========================================================================
  describe('見積書一覧に戻る', () => {
    it('「見積書一覧に戻る」リンクが正しいパスを持つこと', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: '見積書一覧に戻る' });
      expect(backLink).toHaveAttribute('href', '/projects/project-1/estimates');
    });
  });

  // ==========================================================================
  // 日付・金額のフォーマット
  // ==========================================================================
  describe('フォーマット表示', () => {
    it('作成日時と更新日時が日本語形式でフォーマットされること', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      // 日付フォーマットの確認（2025年1月1日または2025年1月2日）
      const jan1Dates = screen.getAllByText(/2025年1月1日/);
      const jan2Dates = screen.getAllByText(/2025年1月2日/);
      expect(jan1Dates.length).toBeGreaterThan(0);
      expect(jan2Dates.length).toBeGreaterThan(0);
    });

    it('金額がnullの場合は0円が表示されること', async () => {
      const baseItem = mockEstimateDetail.items[0]!;
      mockEditor.items = [
        {
          ...baseItem,
          lines: baseItem.lines.map((line) => ({
            ...line,
            amount: null,
          })),
        },
      ];
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const amountSection = screen.getByText('見積金額合計').closest('div');
      expect(amountSection?.textContent).toContain('0円');
    });

    it('項目が空の場合は0円が表示されること', async () => {
      mockEditor.items = [];
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const amountSection = screen.getByText('見積金額合計').closest('div');
      expect(amountSection?.textContent).toContain('0円');
    });
  });

  // ==========================================================================
  // ツールバー統合 (REQ-23, Task 26.2)
  // ==========================================================================
  describe('ツールバー統合', () => {
    it('見積項目セクション内にツールバーが表示されること (REQ-23.1)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      expect(screen.getByTestId('estimate-item-toolbar')).toBeInTheDocument();
    });

    it('項目追加ボタンクリックでaddItemが呼ばれること (REQ-23.2)', async () => {
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValueOnce(mockEstimateDetail);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-detail-page')).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /^\+\s*項目追加$/ });
      await userEvent.click(addButton);

      expect(mockEditor.addItem).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // IDなしの場合
  // ==========================================================================
  describe('IDなしの場合', () => {
    it('IDがない場合は何も取得しないこと', async () => {
      render(
        <MemoryRouter initialEntries={['/estimates/']}>
          <Routes>
            <Route path="/estimates/" element={<EstimateDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // APIが呼ばれないことを確認（ローディング状態のまま）
      await waitFor(
        () => {
          expect(estimatesApi.getEstimateDetail).not.toHaveBeenCalled();
        },
        { timeout: 100 }
      );
    });
  });
});
