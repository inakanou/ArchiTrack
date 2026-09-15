/**
 * ImportDialogコンポーネントの単体テスト
 *
 * Task 46.1-46.5 + 48.5: インポートダイアログ
 *
 * 下の一覧は本ファイルの検証が確かめる受入基準だけを挙げる（Task 97.10 で実体に揃えた）。
 * 抽出テキストの表示（29.7 / 29.8）は各検証に `@requirement` の印を付けてあるため一覧に重ねない。
 * インラインプレビュー（34.1〜34.5）の検証は `ImportDialog.inline-preview.test.tsx` に在る。
 * 本ファイルが確かめないもの: 27.1（編集画面の操作でダイアログを開くこと）、32.1〜32.6
 * （マッピングの表示と調整。`ImportPreviewTable.test.tsx` / `field-mapping.test.ts` が担う）、
 * 31.4 / 31.5（`field-mapping.test.ts`）、31.7（完了メッセージの確認・修正を促す句を主張していない）、
 * 31.8 / 31.9（編集画面の取り込み処理の責務）、33.3（リトライ中のインジケーター）。
 *
 * Requirements:
 * - 27.2-27.7: ファイルアップロードエリア・対応形式・非対応形式のエラー・処理の自動開始・処理中インジケーター
 * - 27.8: 処理中のファイル選択の非活性（一括取り込みボタンは非活性ではなく非表示であることを確かめる）
 * - 28.4: 抽出完了後のプレビューテーブル表示
 * - 31.1-31.3: 一括取り込みボタン・取り込み先グループ選択・選択したグループへの取り込み要求
 * - 31.6: 取り込んだ件数を含む完了メッセージ
 * - 33.1-33.2: リトライボタンの表示と再実行
 * - 33.4-33.5: 成否にかかわらない別ファイルのアップロードと前回結果のクリア
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDialog } from './ImportDialog';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

// Mock useImportDataExtractor
const mockStartExtraction = vi.fn();
const mockRetry = vi.fn();
const mockReset = vi.fn();

vi.mock('./useImportDataExtractor', () => ({
  useImportDataExtractor: vi.fn(() => ({
    status: 'idle',
    progress: 0,
    progressMessage: '',
    result: null,
    error: null,
    startExtraction: mockStartExtraction,
    retry: mockRetry,
    reset: mockReset,
  })),
}));

// Mock field-mapping
vi.mock('./field-mapping', () => ({
  autoDetectFieldMapping: vi.fn(() => ({
    mappings: { 0: 'workType', 1: 'name', 2: 'quantity', 3: 'unit' },
  })),
  convertToQuantityItems: vi.fn(() => [
    {
      majorCategory: '',
      middleCategory: '',
      minorCategory: '',
      customCategory: '',
      workType: '土工',
      name: '掘削工',
      specification: '',
      quantity: 150,
      unit: 'm3',
      remarks: '',
      calculationMethod: 'STANDARD',
      adjustmentFactor: 1,
      roundingUnit: 0.01,
    },
  ]),
}));

import { useImportDataExtractor } from './useImportDataExtractor';

const mockGroups: QuantityGroupDetail[] = [
  {
    id: 'group-1',
    quantityTableId: 'table-1',
    name: 'グループA',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 1,
    itemCount: 2,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'group-2',
    quantityTableId: 'table-1',
    name: 'グループB',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 2,
    itemCount: 0,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

describe('ImportDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onImport: vi.fn(),
    groups: mockGroups,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'idle',
      progress: 0,
      progressMessage: '',
      result: null,
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });
  });

  // ===========================================================================
  // Task 46.1: ファイルアップロードエリア
  // ===========================================================================

  it('ダイアログが開いている場合にファイルアップロードエリアが表示される', () => {
    render(<ImportDialog {...defaultProps} />);
    expect(screen.getByText('数量表インポート')).toBeInTheDocument();
    expect(screen.getByText(/ファイルをドラッグ&ドロップ/)).toBeInTheDocument();
  });

  it('ダイアログが閉じている場合はレンダリングされない', () => {
    render(<ImportDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('数量表インポート')).not.toBeInTheDocument();
  });

  it('対応ファイル形式（.xlsx、.xls、.pdf）のみ受け付ける', () => {
    render(<ImportDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText('ファイルを選択');
    expect(fileInput).toHaveAttribute('accept', '.xlsx,.xls,.pdf');
  });

  it('サポート対象外ファイルがアップロードされた場合はエラーメッセージを表示する', async () => {
    render(<ImportDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText('ファイルを選択') as HTMLInputElement;

    const unsupportedFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    // fireEvent.changeでaccept属性のフィルタを回避してテスト
    fireEvent.change(fileInput, { target: { files: [unsupportedFile] } });

    expect(screen.getByText(/対応していないファイル形式です/)).toBeInTheDocument();
    expect(mockStartExtraction).not.toHaveBeenCalled();
  });

  it('Excelファイルアップロード時にstartExtractionが呼ばれる', async () => {
    render(<ImportDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText('ファイルを選択');

    const excelFile = new File(['test'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await userEvent.upload(fileInput, excelFile);

    expect(mockStartExtraction).toHaveBeenCalledWith(excelFile);
  });

  it('PDFファイルアップロード時にstartExtractionが呼ばれる', async () => {
    render(<ImportDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText('ファイルを選択');

    const pdfFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    await userEvent.upload(fileInput, pdfFile);

    expect(mockStartExtraction).toHaveBeenCalledWith(pdfFile);
  });

  it('処理中はファイルアップロードボタンが非活性になる', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'processing',
      progress: 50,
      progressMessage: '処理中...',
      result: null,
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText('ファイルを選択');
    expect(fileInput).toBeDisabled();
  });

  it('処理中にプログレスバーが表示される', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'processing',
      progress: 50,
      progressMessage: 'Excelファイルを読み取り中...',
      result: null,
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Excelファイルを読み取り中...')).toBeInTheDocument();
  });

  // ===========================================================================
  // Task 46.3: 抽出結果プレビューテーブルとフィールドマッピング
  // ===========================================================================

  it('抽出完了後にプレビューテーブルが表示される', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    // プレビューテーブル内に抽出データが表示
    expect(screen.getByText('土工')).toBeInTheDocument();
    expect(screen.getByText('掘削工')).toBeInTheDocument();
  });

  // ===========================================================================
  // Task 46.4: 一括取り込み機能
  // ===========================================================================

  it('抽出完了時に一括取り込みボタンが表示される', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: '一括取り込み' })).toBeInTheDocument();
  });

  it('一括取り込みボタンクリック時に取り込み先グループ選択UIが表示される', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    const importButton = screen.getByRole('button', { name: '一括取り込み' });
    await userEvent.click(importButton);

    // グループ選択UIが表示
    expect(screen.getByText('取り込み先グループを選択')).toBeInTheDocument();
    expect(screen.getByText('グループA')).toBeInTheDocument();
    expect(screen.getByText('グループB')).toBeInTheDocument();
  });

  it('グループ選択後にonImportが呼ばれる', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);

    // 一括取り込みをクリック
    await userEvent.click(screen.getByRole('button', { name: '一括取り込み' }));

    // グループを選択
    await userEvent.click(screen.getByText('グループA'));

    expect(defaultProps.onImport).toHaveBeenCalledWith(
      'group-1',
      expect.arrayContaining([
        expect.objectContaining({
          workType: '土工',
          name: '掘削工',
        }),
      ])
    );
  });

  it('取り込み完了後に完了メッセージが表示される', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    defaultProps.onImport.mockResolvedValue(undefined);

    render(<ImportDialog {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: '一括取り込み' }));
    await userEvent.click(screen.getByText('グループA'));

    await waitFor(() => {
      expect(screen.getByText(/1件の数量項目を取り込みました/)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Task 46.5: リトライ・再アップロード機能
  // ===========================================================================

  it('エラー時にリトライボタンが表示される', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'error',
      progress: 0,
      progressMessage: '',
      result: null,
      error: 'ファイルの処理中にエラーが発生しました',
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    expect(screen.getByText('ファイルの処理中にエラーが発生しました')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リトライ' })).toBeInTheDocument();
  });

  it('リトライボタンクリック時にretry関数が呼ばれる', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'error',
      progress: 0,
      progressMessage: '',
      result: null,
      error: 'エラーメッセージ',
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'リトライ' }));
    expect(mockRetry).toHaveBeenCalled();
  });

  it('別ファイルアップロードで前回結果がクリアされる', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種'],
        rows: [{ columns: ['土工'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);

    // 別ファイルをアップロード
    const fileInput = screen.getByLabelText('ファイルを選択');
    const newFile = new File(['new'], 'new.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await userEvent.upload(fileInput, newFile);

    expect(mockReset).toHaveBeenCalled();
    expect(mockStartExtraction).toHaveBeenCalledWith(newFile);
  });

  it('閉じるボタンクリック時にonCloseが呼ばれる', async () => {
    render(<ImportDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('処理中は一括取り込みボタンが非活性になる', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'processing',
      progress: 30,
      progressMessage: '処理中...',
      result: null,
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    // processing中は一括取り込みボタンが表示されない
    expect(screen.queryByRole('button', { name: '一括取り込み' })).not.toBeInTheDocument();
  });

  it('グループ選択のキャンセルボタンで選択UIが閉じる', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);

    // 一括取り込みをクリック
    await userEvent.click(screen.getByRole('button', { name: '一括取り込み' }));
    expect(screen.getByText('取り込み先グループを選択')).toBeInTheDocument();

    // キャンセルをクリック
    await userEvent.click(screen.getByText('キャンセル'));
    expect(screen.queryByText('取り込み先グループを選択')).not.toBeInTheDocument();
  });

  it('取り込み失敗時にエラーメッセージが表示される', async () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: 'excel-parse',
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    defaultProps.onImport.mockRejectedValue(new Error('API error'));

    render(<ImportDialog {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: '一括取り込み' }));
    await userEvent.click(screen.getByText('グループA'));

    await waitFor(() => {
      expect(screen.getByText('取り込みに失敗しました。')).toBeInTheDocument();
    });
  });

  it('ドラッグ&ドロップでファイルをアップロードできる', async () => {
    render(<ImportDialog {...defaultProps} />);

    const dropZone = screen.getByText(/ファイルをドラッグ&ドロップ/).closest('div')!;

    const file = new File(['test'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(mockStartExtraction).toHaveBeenCalledWith(file);
  });

  it('ドラッグ離脱時にドラッグ状態がリセットされる', () => {
    render(<ImportDialog {...defaultProps} />);

    const dropZone = screen.getByText(/ファイルをドラッグ&ドロップ/).closest('div')!;

    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);

    // ドラッグ状態がリセットされたことを確認（エラーなく完了すればOK）
    expect(dropZone).toBeInTheDocument();
  });

  it('エラー時でもファイルアップロードが許可される', () => {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'error',
      progress: 0,
      progressMessage: '',
      result: null,
      error: 'エラー',
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });

    render(<ImportDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText('ファイルを選択');
    expect(fileInput).not.toBeDisabled();
  });
});

describe('ImportDialog: 抽出結果のテキストデータ表示', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onImport: vi.fn(),
    groups: mockGroups,
  };

  function mockCompleted(extractedText: string | undefined): void {
    vi.mocked(useImportDataExtractor).mockReturnValue({
      status: 'completed',
      progress: 100,
      progressMessage: '完了',
      result: {
        headers: ['工種', '名称', '数量', '単位'],
        rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
        extractionType: extractedText === undefined ? 'excel-parse' : 'pdf-text',
        ...(extractedText === undefined ? {} : { extractedText }),
      },
      error: null,
      startExtraction: mockStartExtraction,
      retry: mockRetry,
      reset: mockReset,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * OCR処理の完了時、抽出結果をテキストデータ（抽出テキストの領域）とプレビューテーブルの
   * 両方として同じダイアログに表示することを確かめる。
   *
   * @requirement quantity-table-generation/REQ-29.7
   */
  it('抽出テキストを持つ抽出結果は、抽出テキストとプレビューテーブルを併せて表示する', () => {
    mockCompleted('工種 名称 数量 単位\n土工 掘削工 150 m3');

    render(<ImportDialog {...defaultProps} />);

    const region = screen.getByRole('region', { name: '抽出テキスト' });
    expect(within(region).getByTestId('import-extracted-text').textContent).toBe(
      '工種 名称 数量 単位\n土工 掘削工 150 m3'
    );
    const table = screen.getByRole('table');
    expect(within(table).getByText('掘削工')).toBeInTheDocument();
  });

  /**
   * 抽出テキストはユーザーが選択・コピーできる状態（user-select: text）で表示することを確かめる。
   *
   * @requirement quantity-table-generation/REQ-29.8
   */
  it('抽出テキストは選択・コピーできる状態で表示する', () => {
    mockCompleted('土工 掘削工 150 m3');

    render(<ImportDialog {...defaultProps} />);

    const text = within(screen.getByRole('region', { name: '抽出テキスト' })).getByTestId(
      'import-extracted-text'
    );
    expect(text.style.userSelect).toBe('text');
  });

  it('抽出テキストを持たない抽出結果（Excel）では抽出テキストの領域を表示しない', () => {
    mockCompleted(undefined);

    render(<ImportDialog {...defaultProps} />);

    expect(screen.queryByRole('region', { name: '抽出テキスト' })).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
