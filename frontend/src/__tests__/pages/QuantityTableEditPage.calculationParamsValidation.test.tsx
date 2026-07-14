/**
 * @fileoverview 数量表編集画面の保存前 計算パラメータ検証テスト
 *
 * Task 68.7: 保存前の計算パラメータ検証を編集画面の保存処理へ配線する（TDDテストファースト）
 *
 * 保存操作（フル状態同期保存 saveQuantityTableDraft）の直前に、計算方法ごとの必須パラメータを
 * 検証し、違反があれば **サーバーへ送信せずに** 保存を中断してエラーメッセージを表示する。
 * 検証ロジックは `utils/calculation-params-validation` を単一情報源とし、バックエンドの
 * `quantity-validation.service.ts`（validateCountMode / validatePitchMode / validateAreaVolumeMode）
 * より厳しくしない（フロントだけが弾く状態を作らない）。
 *
 * Requirements:
 * - 47.9 / 8.15: 「箇所数」が未入力のまま保存を試行する場合、エラーメッセージを表示し箇所数の入力を求める
 * - 8.10: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）のいずれかが未入力で
 *   保存を試行する場合、エラーメッセージを表示し必須項目の入力を求める
 * - 8.7: 「面積・体積」モードで計算用列に値が1つも入力されていない状態で保存を試行する場合、
 *   エラーメッセージを表示する
 * - 11.2: 整合性チェックでエラーが検出された場合、保存を中断し問題箇所の修正を求める
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
const mockSaveQuantityTableDraft = vi.mocked(quantityTablesApi.saveQuantityTableDraft);

// ============================================================================
// テストフィクスチャ
// ============================================================================

/** 計算方法・計算パラメータ以外は妥当な（保存を妨げない）数量項目のひな型 */
const baseItem: QuantityItemDetail = {
  id: 'item-1',
  quantityGroupId: 'group-1',
  majorCategory: '土工',
  middleCategory: null,
  minorCategory: null,
  customCategory: null,
  workType: '掘削工',
  name: '掘削',
  specification: null,
  unit: 'm3',
  calculationMethod: 'STANDARD',
  calculationParams: null,
  adjustmentFactor: 1.0,
  roundingUnit: 0.01,
  quantity: 10,
  remarks: null,
  displayOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** 指定した数量項目群を1グループに持つ数量表詳細を組み立てる */
const buildDetail = (items: QuantityItemDetail[]): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 1,
  itemCount: items.length,
  groups: [
    {
      id: 'group-1',
      quantityTableId: 'qt-123',
      name: 'グループ1',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: items.length,
      items,
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

/** 数量表をロードして保存ボタンを押す */
async function loadAndSave(detail: QuantityTableDetail): Promise<void> {
  const user = userEvent.setup();
  mockGetQuantityTableDetail.mockResolvedValue(detail);

  renderWithRouter();

  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  await user.click(screen.getByRole('button', { name: '保存' }));
}

// ============================================================================
// テストケース
// ============================================================================

describe('QuantityTableEditPage - 保存前の計算パラメータ検証（Task 68.7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveQuantityTableDraft.mockImplementation(async () => buildDetail([baseItem]));
  });

  describe('計算方法「箇所数」（REQ-47 AC9 / REQ-8 AC15）', () => {
    it('箇所数が未入力のまま保存すると、サーバーへ送信されずにエラーが表示される（観測可能完了条件）', async () => {
      await loadAndSave(
        buildDetail([
          {
            ...baseItem,
            calculationMethod: 'COUNT',
            // 長さのみ入力済みで箇所数が欠落している状態
            calculationParams: { length: 2 },
          },
        ])
      );

      // 保存前チェックの本質: サーバーへ送信しない（REQ-11.2 保存の中断）
      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
      });
      expect(screen.getByText(/箇所数は必須です/)).toBeInTheDocument();
    });

    it('計算パラメータ自体が未設定の場合も、サーバーへ送信されずにエラーが表示される', async () => {
      await loadAndSave(
        buildDetail([
          {
            ...baseItem,
            calculationMethod: 'COUNT',
            calculationParams: null,
          },
        ])
      );

      await waitFor(() => {
        expect(screen.getByText(/計算パラメータが設定されていません/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });

    it('箇所数が範囲外の場合も、サーバーへ送信されずにエラーが表示される（REQ-47 AC11）', async () => {
      await loadAndSave(
        buildDetail([
          {
            ...baseItem,
            calculationMethod: 'COUNT',
            calculationParams: { count: 10000000 },
          },
        ])
      );

      await waitFor(() => {
        expect(screen.getByText(/箇所数は1〜9999999の範囲で入力してください/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });
  });

  describe('計算方法「ピッチ」（REQ-8 AC10）', () => {
    it('必須項目（端長2・ピッチ長）が未入力のまま保存すると、サーバーへ送信されずにエラーが表示される', async () => {
      await loadAndSave(
        buildDetail([
          {
            ...baseItem,
            calculationMethod: 'PITCH',
            calculationParams: { rangeLength: 100, endLength1: 5 },
          },
        ])
      );

      await waitFor(() => {
        expect(screen.getByText(/端長2は必須です/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });
  });

  describe('計算方法「面積・体積」（REQ-8 AC7）', () => {
    it('計算用列に値が1つも入力されていない状態で保存すると、サーバーへ送信されずにエラーが表示される', async () => {
      await loadAndSave(
        buildDetail([
          {
            ...baseItem,
            calculationMethod: 'AREA_VOLUME',
            calculationParams: {},
          },
        ])
      );

      await waitFor(() => {
        expect(
          screen.getByText(/面積・体積モードでは少なくとも1つの計算用列に値を入力してください/)
        ).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });
  });

  describe('正常系の回帰: 必須項目が揃っているデータは従来どおり保存できる', () => {
    it('全ての計算方法の必須項目が揃っていればフル状態同期保存APIが呼ばれる', async () => {
      const detail = buildDetail([
        { ...baseItem, id: 'item-1', calculationMethod: 'STANDARD', calculationParams: null },
        {
          ...baseItem,
          id: 'item-2',
          displayOrder: 1,
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10, depth: 5, height: 2 },
        },
        {
          ...baseItem,
          id: 'item-3',
          displayOrder: 2,
          calculationMethod: 'PITCH',
          calculationParams: { rangeLength: 100, endLength1: 5, endLength2: 5, pitchLength: 10 },
        },
        {
          ...baseItem,
          id: 'item-4',
          displayOrder: 3,
          calculationMethod: 'COUNT',
          calculationParams: { count: 5, length: 2, weight: 1.5 },
        },
      ]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });

      await loadAndSave(detail);

      await waitFor(() => {
        expect(screen.getByText(/保存しました/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
    });

    it('「面積・体積」で1項目だけ入力されている場合も保存できる（バックエンドより厳しくしない）', async () => {
      const detail = buildDetail([
        {
          ...baseItem,
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10 },
        },
      ]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });

      await loadAndSave(detail);

      await waitFor(() => {
        expect(screen.getByText(/保存しました/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
    });
  });

  describe('既存の検証（項目名・丸め設定）の回帰', () => {
    it('項目名が空の場合はサーバーへ送信されずにエラーが表示される', async () => {
      await loadAndSave(buildDetail([{ ...baseItem, name: '' }]));

      await waitFor(() => {
        expect(screen.getByText(/項目名が空の項目があります/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });

    it('丸め設定が0以下の場合はサーバーへ送信されずにエラーが表示される', async () => {
      await loadAndSave(buildDetail([{ ...baseItem, roundingUnit: 0 }]));

      await waitFor(() => {
        expect(screen.getByText(/丸め設定が無効です/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });
  });
});
