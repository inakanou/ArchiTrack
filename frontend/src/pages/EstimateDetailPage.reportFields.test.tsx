/**
 * @fileoverview EstimateDetailPage の帳票用入力項目の統合テスト（実物のコンポーネントで検証）
 *
 * Task 56.8: 帳票用入力項目のパネル
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate` を丸ごとモックするため、
 * 「パネルを操作する → 未保存になる → 保存ペイロードに載る」の一気通貫を捉えられない
 * （53.14 / 54.2 / 54.10 で繰り返し死角になった死んだ props と同じ問題）。
 * 本ファイルは帳票用入力項目パネルを**実物のまま**描画する。
 *
 * Requirements (estimate-creation):
 * - 54.1: 別途工事の記載を5件まで入力可能とする
 * - 54.2: 見積の有効期限を入力可能とする
 * - 54.3: 提出日を入力可能とする
 * - 54.6: 別途工事・有効期限・提出日を見積書画面から編集可能とする
 * - 54.7: 未入力の場合は空欄として扱う
 * - 54.8: 編集を未保存の変更として扱い、保存操作で確定する
 *
 * 新規作成時の既定値（54.4 / 54.5）は作成経路（`EstimateService.create`）の責務であり、
 * `backend/src/__tests__/unit/services/estimate.service.test.ts` が検証する。
 *
 * @module pages/EstimateDetailPage.reportFields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: 'unblocked' as const, proceed: vi.fn(), reset: vi.fn() }),
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const buildLine = (itemId: string, lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR') => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name: lineType === 'ESTIMATE' ? '建築工事' : null,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: '100000',
  amount: '100000',
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
});

const buildItem = () => ({
  id: 'item-a',
  estimateId: 'est-001',
  parentId: null,
  displayOrder: 0,
  itemType: 'STANDARD',
  lines: [
    buildLine('item-a', 'ESTIMATE'),
    buildLine('item-a', 'EXECUTION'),
    buildLine('item-a', 'VENDOR'),
  ],
  children: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
});

type ReportFields = estimatesApi.SaveEstimateDraftReportFields;

const detailWith = (reportFields: ReportFields) =>
  ({
    id: 'est-001',
    projectId: 'proj-001',
    name: 'テスト見積書',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    items: [buildItem()],
    totalAmount: '100000',
    reportFields,
  }) as unknown as estimatesApi.EstimateDetail;

const savedResponseWith = (reportFields: ReportFields) =>
  ({
    id: 'est-001',
    projectId: 'proj-001',
    project: { id: 'proj-001', name: 'テストプロジェクト' },
    name: 'テスト見積書',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    itemCount: 1,
    reportFields,
    items: [buildItem()],
  }) as unknown as estimatesApi.SaveEstimateDraftResponse;

/** 新規作成直後の見積書（サーバーが既定値を確定済み: 54.4 / 54.5） */
const NEWLY_CREATED: ReportFields = {
  submissionDate: '2026-08-01',
  validityPeriod: '提出日より1ヶ月間',
  separateWorks: [],
};

/** 52.2 以前に作られ、帳票用入力項目が未入力のままの見積書（54.7） */
const NEVER_FILLED: ReportFields = {
  submissionDate: null,
  validityPeriod: null,
  separateWorks: [],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

// ============================================================================
// ヘルパー
// ============================================================================

const setupApi = (reportFields: ReportFields): void => {
  vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(detailWith(reportFields));
  vi.mocked(estimatesApi.getEstimateItems).mockResolvedValue([
    buildItem(),
  ] as unknown as estimatesApi.EstimateItemHierarchy[]);
  vi.mocked(estimatesApi.saveEstimateDraft).mockImplementation(async (_id, request) =>
    savedResponseWith(request.reportFields)
  );
};

const waitForPanel = async (): Promise<HTMLElement> =>
  await screen.findByTestId('estimate-report-fields-panel');

const submissionDateInput = (): HTMLInputElement =>
  screen.getByLabelText('提出日') as HTMLInputElement;

const validityPeriodInput = (): HTMLInputElement =>
  screen.getByLabelText('見積有効期限') as HTMLInputElement;

const saveButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /^保存/ }) as HTMLButtonElement;

/** 直近の保存リクエストに載った帳票用入力項目 */
const lastSavedReportFields = (): ReportFields => {
  const calls = vi.mocked(estimatesApi.saveEstimateDraft).mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('保存が一度も呼ばれていない');
  return last[1].reportFields;
};

// ============================================================================
// テスト
// ============================================================================

describe('EstimateDetailPage - 帳票用入力項目', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('読み込み（54.6, 54.7）', () => {
    it('保存済みの帳票用入力項目をパネルへ反映する', async () => {
      setupApi({
        submissionDate: '2026-08-04',
        validityPeriod: '提出日より3ヶ月間',
        separateWorks: ['電気設備工事', '空調設備工事'],
      });

      renderPage();
      await waitForPanel();

      expect(submissionDateInput().value).toBe('2026-08-04');
      expect(validityPeriodInput().value).toBe('提出日より3ヶ月間');
      expect((screen.getByLabelText('別途工事1') as HTMLInputElement).value).toBe('電気設備工事');
      expect((screen.getByLabelText('別途工事2') as HTMLInputElement).value).toBe('空調設備工事');
    });

    it('未入力の見積書を開いても未保存の変更にはならない', async () => {
      setupApi(NEVER_FILLED);

      renderPage();
      await waitForPanel();

      expect(submissionDateInput().value).toBe('');
      expect(validityPeriodInput().value).toBe('');
      // 読み込みだけで未保存になると、開いて閉じるだけで離脱確認が出る
      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('新規作成直後の既定値を反映し、未保存の変更にはならない', async () => {
      setupApi(NEWLY_CREATED);

      renderPage();
      await waitForPanel();

      expect(submissionDateInput().value).toBe('2026-08-01');
      expect(validityPeriodInput().value).toBe('提出日より1ヶ月間');
      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
    });
  });

  describe('未保存の変更としての扱い（54.8）', () => {
    it('帳票用入力項目だけを編集しても未保存インジケーターが出る', async () => {
      const user = userEvent.setup();
      setupApi(NEVER_FILLED);

      renderPage();
      await waitForPanel();
      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();

      await user.type(validityPeriodInput(), '年');

      expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
      // 編集の時点では書き込まない（27.7: 自動保存を行わない）
      expect(estimatesApi.saveEstimateDraft).not.toHaveBeenCalled();
    });

    it('別途工事を追加しただけでも未保存インジケーターが出る', async () => {
      const user = userEvent.setup();
      setupApi(NEVER_FILLED);

      renderPage();
      await waitForPanel();

      await user.click(screen.getByRole('button', { name: '別途工事を追加' }));

      expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();
    });

    it('保存すると帳票用入力項目が保存ペイロードに載り、未保存表示が消える', async () => {
      const user = userEvent.setup();
      setupApi(NEVER_FILLED);

      renderPage();
      await waitForPanel();

      await user.type(submissionDateInput(), '2026-09-15');
      await user.type(validityPeriodInput(), '提出日より2ヶ月間');
      await user.click(screen.getByRole('button', { name: '別途工事を追加' }));
      await user.type(screen.getByLabelText('別途工事1'), '電気設備工事');

      await user.click(saveButton());

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      expect(lastSavedReportFields()).toEqual({
        submissionDate: '2026-09-15',
        validityPeriod: '提出日より2ヶ月間',
        separateWorks: ['電気設備工事'],
      });
      await waitFor(() => {
        expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
      });
    });

    it('未入力に戻した項目は空欄として保存ペイロードに載る', async () => {
      const user = userEvent.setup();
      setupApi({
        submissionDate: '2026-08-04',
        validityPeriod: '提出日より3ヶ月間',
        separateWorks: ['電気設備工事'],
      });

      renderPage();
      await waitForPanel();

      await user.clear(submissionDateInput());
      await user.clear(validityPeriodInput());
      await user.click(screen.getByRole('button', { name: '別途工事1を削除' }));

      await user.click(saveButton());

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      // 空文字ではなく null。空配列も「未入力」として送る（54.7）
      expect(lastSavedReportFields()).toEqual({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: [],
      });
    });
  });

  describe('別途工事の件数上限（54.1）', () => {
    it('5件まで入力して保存できる', async () => {
      const user = userEvent.setup();
      setupApi({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['工事1', '工事2', '工事3', '工事4'],
      });

      renderPage();
      await waitForPanel();

      await user.click(screen.getByRole('button', { name: '別途工事を追加' }));
      await user.type(screen.getByLabelText('別途工事5'), '工事5');

      await user.click(saveButton());

      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });
      expect(lastSavedReportFields().separateWorks).toEqual([
        '工事1',
        '工事2',
        '工事3',
        '工事4',
        '工事5',
      ]);
    });

    it('5件に達すると6件目を追加できない', async () => {
      const user = userEvent.setup();
      setupApi({
        submissionDate: null,
        validityPeriod: null,
        separateWorks: ['工事1', '工事2', '工事3', '工事4', '工事5'],
      });

      renderPage();
      await waitForPanel();

      const addButton = screen.getByRole('button', { name: '別途工事を追加' });
      expect(addButton).toBeDisabled();

      await user.click(addButton);

      expect(screen.queryByLabelText('別途工事6')).not.toBeInTheDocument();
      // 追加できなかった＝未保存の変更も生じない
      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
    });
  });

  describe('保存後の再読み込みで維持される', () => {
    it('保存ペイロードの内容が再読み込み後のパネルに現れる', async () => {
      const user = userEvent.setup();
      setupApi(NEVER_FILLED);

      const first = renderPage();
      await waitForPanel();

      await user.type(submissionDateInput(), '2026-10-31');
      await user.type(validityPeriodInput(), '提出日より6ヶ月間');
      await user.click(screen.getByRole('button', { name: '別途工事を追加' }));
      await user.type(screen.getByLabelText('別途工事1'), '解体工事');
      await user.click(screen.getByRole('button', { name: '別途工事を追加' }));
      await user.type(screen.getByLabelText('別途工事2'), '外構工事');

      await user.click(saveButton());
      await waitFor(() => {
        expect(estimatesApi.saveEstimateDraft).toHaveBeenCalledTimes(1);
      });

      // 再読み込み後にサーバーが返すのは「実際に送られたペイロード」。
      // 画面のローカル状態ではなく保存要求そのものを次の読み込みの正とする。
      const persisted = lastSavedReportFields();
      first.unmount();
      vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(detailWith(persisted));

      renderPage();
      await waitForPanel();

      expect(submissionDateInput().value).toBe('2026-10-31');
      expect(validityPeriodInput().value).toBe('提出日より6ヶ月間');
      expect((screen.getByLabelText('別途工事1') as HTMLInputElement).value).toBe('解体工事');
      expect((screen.getByLabelText('別途工事2') as HTMLInputElement).value).toBe('外構工事');
      // 再読み込み直後は確定済み＝未保存の変更なし
      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
    });
  });
});
