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
import { FIELD_RANGE_CONFIG } from '../../utils/numeric-range-validation';

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

    // 計算方法を「箇所数」へ切り替えた直後は計算パラメータ自体が未設定になる。
    // 汎用の「計算パラメータが設定されていません」ではユーザーに箇所数の入力を求められず
    // REQ-47 AC9 を満たさないため、パラメータ未設定も箇所数の未入力として扱う。
    it('計算パラメータ自体が未設定の場合も、箇所数の入力を求めるエラーが表示され保存されない（REQ-47 AC9）', async () => {
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
        expect(screen.getByText(/箇所数は必須です/)).toBeInTheDocument();
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
          screen.getByText(
            /面積・体積モードでは幅\(W\)・奥行き\(D\)・高さ\(H\)のうち最低1項目を入力してください/
          )
        ).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });

    /**
     * タスク 100.10（2026-09-23、利用者の裁定）: 条文は幅(W)・奥行き(D)・高さ(H) のみを数える。
     * 改める前の実体は重量も「いずれか1つ」に数えており、重量だけの状態が保存できていた。
     */
    it('重量だけが入力されている状態で保存すると、サーバーへ送信されずにエラーが表示される', async () => {
      await loadAndSave(
        buildDetail([
          {
            ...baseItem,
            calculationMethod: 'AREA_VOLUME',
            calculationParams: { weight: 3 },
          },
        ])
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            /面積・体積モードでは幅\(W\)・奥行き\(D\)・高さ\(H\)のうち最低1項目を入力してください/
          )
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

    /*
     * Requirements (quantity-table-generation): 10.3, 11.2
     *
     * Task 80.2: 保存前の整合性チェックが引く範囲を正典へ一本化したことを固定する。
     * 上限は正典から取り出す。検証側へ数値を書き写すと、範囲が変わったとき
     * 検証だけが古い前提のまま緑になる。
     */
    it('丸め設定が上限を超える場合もサーバーへ送信されずにエラーが表示される', async () => {
      const aboveMax = FIELD_RANGE_CONFIG.roundingUnit.max + 0.01;
      await loadAndSave(buildDetail([{ ...baseItem, roundingUnit: aboveMax }]));

      await waitFor(() => {
        expect(screen.getByText(/丸め設定が無効です/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });

    /*
     * Requirements (quantity-table-generation): 10.3, 11.2
     *
     * 下限側の退行（旧実装の `<= 0` は `0 < v < 0.01` を素通りさせていた）を固定する。
     * 境界は正典から導く。
     */
    it('丸め設定が下限を下回る正の値の場合もサーバーへ送信されずにエラーが表示される', async () => {
      const belowMin = FIELD_RANGE_CONFIG.roundingUnit.min / 2;
      expect(belowMin).toBeGreaterThan(0);
      await loadAndSave(buildDetail([{ ...baseItem, roundingUnit: belowMin }]));

      await waitFor(() => {
        expect(screen.getByText(/丸め設定が無効です/)).toBeInTheDocument();
      });
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });

    /*
     * Requirements (quantity-table-generation): 9.3, 11.2
     *
     * 調整係数の `0` と負値は REQ-9.3 の有効域の内側である。タスク 80.2 の時点では
     * 保存経路（backend の `saveDraftItemSchema` の `z.number().positive()`）が拒んでいたため、
     * 保存前に止めて名指していた。**タスク 85.1 がバックエンドを有効域へ揃えたため
     * 向きが反転した**——止めずにサーバーへ送る。
     */
    it.each([
      ['0', 0],
      ['負の値', -0.5],
      ['下限', FIELD_RANGE_CONFIG.adjustmentFactor.min],
    ])('調整係数が%sの場合も保存は中断されずサーバーへ送信される', async (_label, value) => {
      const detail = buildDetail([{ ...baseItem, adjustmentFactor: value }]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });

      await loadAndSave(detail);

      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalled();
      });
      const calls = mockSaveQuantityTableDraft.mock.calls as unknown as [
        string,
        { groups: { items: { adjustmentFactor: number }[] }[] },
      ][];
      const sentItems = calls[calls.length - 1]?.[1]?.groups?.[0]?.items;
      expect(sentItems?.[0]?.adjustmentFactor).toBe(value);
    });

    /*
     * Requirements (quantity-table-generation): 9.3, 11.2
     *
     * 上の「中断しない」が、保存前の検査そのものが死んでいるだけで成立していないことを
     * 同じ欄で確かめる。有効域の外は引き続き中断する。
     */
    it.each([
      ['下限未満', FIELD_RANGE_CONFIG.adjustmentFactor.min - 0.01],
      ['上限超過', FIELD_RANGE_CONFIG.adjustmentFactor.max + 0.01],
    ])(
      '調整係数が有効域の外（%s）の場合はサーバーへ送信されずにエラーが表示される',
      async (_label, value) => {
        await loadAndSave(buildDetail([{ ...baseItem, adjustmentFactor: value }]));

        await waitFor(() => {
          expect(screen.getByText(/調整係数が無効です/)).toBeInTheDocument();
        });
        expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
      }
    );

    it('丸め設定が有効域の上限のときはサーバーへ送信される', async () => {
      const detail = buildDetail([
        { ...baseItem, roundingUnit: FIELD_RANGE_CONFIG.roundingUnit.max },
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

  /*
   * Requirements (quantity-table-generation): 10.3, 11.2
   *
   * Task 90.1: 範囲外の既存値を持つ項目を救済する。
   *
   * 正典の範囲（0.01〜99.99）より広い範囲で永続化された丸め設定（例: 旧保存経路の上限
   * 999.99 の内側の 500）は、保存前の整合性チェックで保存を中断させる。計算方法「標準」の
   * 項目では丸め設定・調整係数の欄が描画されない（REQ-10.8）ため、名指すだけでは
   * 直す手段が無い。**告知が項目・欄・現在の値・範囲を名指し、描画されない欄に限って
   * 利用者の操作で既定値へ戻す出口を持つこと**を固定する。値を黙って書き換えないことも併せて固定する。
   */
  describe('範囲外の既存値の救済（Task 90.1）', () => {
    /** 旧保存経路（上限 999.99）なら永続化できた、正典の上限を超える丸め設定 */
    const LEGACY_ROUNDING_UNIT = 500;
    /** 旧作成経路（上限なしの正値）なら永続化できた、正典の上限を超える調整係数 */
    const LEGACY_ADJUSTMENT_FACTOR = 50;

    const roundingRange = `${FIELD_RANGE_CONFIG.roundingUnit.min}〜${FIELD_RANGE_CONFIG.roundingUnit.max}`;
    const adjustmentRange = `${FIELD_RANGE_CONFIG.adjustmentFactor.min}〜${FIELD_RANGE_CONFIG.adjustmentFactor.max}`;

    type SentItem = {
      name: string;
      roundingUnit: number;
      adjustmentFactor: number;
      quantity: number;
    };

    /** 最後に送られた保存要求の項目群 */
    function lastSentItems(): SentItem[] | undefined {
      const calls = mockSaveQuantityTableDraft.mock.calls as unknown as [
        string,
        { groups: { items: SentItem[] }[] },
      ][];
      return calls[calls.length - 1]?.[1]?.groups?.[0]?.items;
    }

    it('前提: 救済の対象とする既存値は正典の範囲の外にある', () => {
      expect(LEGACY_ROUNDING_UNIT).toBeGreaterThan(FIELD_RANGE_CONFIG.roundingUnit.max);
      expect(LEGACY_ADJUSTMENT_FACTOR).toBeGreaterThan(FIELD_RANGE_CONFIG.adjustmentFactor.max);
    });

    it('「標準」の項目の丸め設定が範囲外なら、項目・欄・現在の値・範囲と、欄が表示されないことを名指して保存を中断する', async () => {
      await loadAndSave(buildDetail([{ ...baseItem, roundingUnit: LEGACY_ROUNDING_UNIT }]));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        `保存できません: グループ「グループ1」の項目「掘削」の丸め設定が無効です（現在の値: 500.00）。${roundingRange}の範囲外ですが、計算方法「標準」ではこの欄は表示されません。既定値に戻してから保存してください`
      );
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
    });

    it('「標準」の項目の丸め設定は告知の操作で既定値へ戻り、名指した項目だけが変わって保存できる', async () => {
      const user = userEvent.setup();
      const detail = buildDetail([
        { ...baseItem, roundingUnit: LEGACY_ROUNDING_UNIT },
        { ...baseItem, id: 'item-2', name: '埋戻し', roundingUnit: 0.5, displayOrder: 1 },
      ]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });
      await loadAndSave(detail);

      const resetButton = await screen.findByRole('button', {
        name: '丸め設定を既定値（0.01）に戻す',
      });
      // 押す前は何も送られていない（値を黙って書き換えて保存しないこと）
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();

      await user.click(resetButton);
      await waitFor(() => {
        expect(screen.queryByText(/丸め設定が無効です/)).not.toBeInTheDocument();
      });
      // 戻す操作そのものは保存しない（永続化は保存操作時のみ。REQ-42.7）
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });
      expect(lastSentItems()).toEqual([
        expect.objectContaining({ name: '掘削', roundingUnit: 0.01, quantity: 10 }),
        expect.objectContaining({ name: '埋戻し', roundingUnit: 0.5, quantity: 10 }),
      ]);
    });

    it('「標準」の項目の調整係数が範囲外なら、同じ形で名指し、告知の操作で既定値へ戻して保存できる', async () => {
      const user = userEvent.setup();
      const detail = buildDetail([{ ...baseItem, adjustmentFactor: LEGACY_ADJUSTMENT_FACTOR }]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });
      await loadAndSave(detail);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        `保存できません: グループ「グループ1」の項目「掘削」の調整係数が無効です（現在の値: 50.00）。${adjustmentRange}の範囲外ですが、計算方法「標準」ではこの欄は表示されません。既定値に戻してから保存してください`
      );

      await user.click(screen.getByRole('button', { name: '調整係数を既定値（1.00）に戻す' }));
      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });
      expect(lastSentItems()).toEqual([
        expect.objectContaining({ name: '掘削', adjustmentFactor: 1, roundingUnit: 0.01 }),
      ]);
    });

    it('欄が描画される計算方法では、既定値へ戻す操作を出さず、範囲内の値の入力を求めて欄から直させる', async () => {
      const user = userEvent.setup();
      const detail = buildDetail([
        {
          ...baseItem,
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { width: 10 },
          roundingUnit: LEGACY_ROUNDING_UNIT,
        },
      ]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });
      await loadAndSave(detail);

      const alert = await screen.findByText(/丸め設定が無効です/);
      expect(alert).toHaveTextContent(
        `保存できません: グループ「グループ1」の項目「掘削」の丸め設定が無効です（現在の値: 500.00）。${roundingRange}の範囲で入力してください`
      );
      expect(screen.queryByRole('button', { name: /既定値.*に戻す/ })).not.toBeInTheDocument();
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();

      // 名指された欄は描画されており、既存値のまま直せる
      const roundingInput = screen.getByLabelText('丸め設定');
      expect(roundingInput).toHaveValue('500.00');
      await user.clear(roundingInput);
      await user.type(roundingInput, '1');
      await user.tab();

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });
      expect(lastSentItems()?.[0]?.roundingUnit).toBe(1);
    });

    /*
     * 数量も同じ出口を持つ。旧作成経路（タスク 85.1 より前）は数量に上限を課さず（非負であることのみ）、
     * 保存前の整合性チェックは数量の範囲を見ていなかった。そのため範囲外の既存値は保存経路の 400 で初めて
     * 止まり、画面は一般の「再度お試しください」を出していた——再試行しても成功せず、問題箇所も名指さない。
     * 数量の欄は計算方法によらず描画されるため、既定値へ戻す操作は出さず、範囲内の値の入力を求める。
     */
    it('数量が範囲外の既存値なら、サーバーへ送らず項目・現在の値・範囲を名指し、欄から直すと保存できる', async () => {
      const user = userEvent.setup();
      const aboveMax = 100000000;
      expect(aboveMax).toBeGreaterThan(FIELD_RANGE_CONFIG.quantity.max);
      const detail = buildDetail([{ ...baseItem, quantity: aboveMax }]);
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...detail,
        updatedAt: '2026-02-02T00:00:00Z',
      });
      await loadAndSave(detail);

      const alert = await screen.findByText(/数量が無効です/);
      expect(alert).toHaveTextContent(
        `保存できません: グループ「グループ1」の項目「掘削」の数量が無効です（現在の値: 100000000.00）。${FIELD_RANGE_CONFIG.quantity.min}〜${FIELD_RANGE_CONFIG.quantity.max}の範囲で入力してください`
      );
      expect(screen.queryByRole('button', { name: /既定値.*に戻す/ })).not.toBeInTheDocument();
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();

      const quantityInput = screen.getByRole('textbox', { name: '数量' });
      await user.clear(quantityInput);
      await user.type(quantityInput, '5');
      await user.tab();

      await user.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });
      expect(lastSentItems()?.[0]?.quantity).toBe(5);
    });

    it('先頭に告げる誤りが別の問題なら、既定値へ戻す操作は出さない（告げていない欄を書き換えない）', async () => {
      await loadAndSave(
        buildDetail([{ ...baseItem, name: '', roundingUnit: LEGACY_ROUNDING_UNIT }])
      );

      await screen.findByText(/項目名が空の項目があります/);
      expect(screen.queryByRole('button', { name: /既定値.*に戻す/ })).not.toBeInTheDocument();
    });

    it('告知を閉じると、既定値へ戻す操作も消える', async () => {
      const user = userEvent.setup();
      await loadAndSave(buildDetail([{ ...baseItem, roundingUnit: LEGACY_ROUNDING_UNIT }]));

      await screen.findByRole('button', { name: '丸め設定を既定値（0.01）に戻す' });
      await user.click(screen.getByRole('button', { name: 'エラーを閉じる' }));
      expect(
        screen.queryByRole('button', { name: '丸め設定を既定値（0.01）に戻す' })
      ).not.toBeInTheDocument();
    });

    /*
     * 操作は、それを名指した告知が表示されている間だけ出る。告知を閉じた後に別の操作エラー
     * （ここでは PDF 出力の失敗）が出たとき、その告知の下に丸め設定を書き換える操作が
     * 並ばないことを固定する——利用者が読んでいる告知が名指していない欄を書き換えさせない。
     */
    it('告知を閉じた後に別の操作エラーが出ても、既定値へ戻す操作はその下に並ばない', async () => {
      const user = userEvent.setup();
      await loadAndSave(buildDetail([{ ...baseItem, roundingUnit: LEGACY_ROUNDING_UNIT }]));

      await screen.findByRole('button', { name: '丸め設定を既定値（0.01）に戻す' });
      await user.click(screen.getByRole('button', { name: 'エラーを閉じる' }));

      const { generateQuantityTablePdf } =
        await import('../../services/export/QuantityTablePdfExportService');
      vi.mocked(generateQuantityTablePdf).mockRejectedValue(new Error('PDF generation failed'));
      await user.click(screen.getByRole('button', { name: /PDF/ }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('PDF生成中にエラーが発生しました');
      expect(
        screen.queryByRole('button', { name: '丸め設定を既定値（0.01）に戻す' })
      ).not.toBeInTheDocument();
    });
  });
});
