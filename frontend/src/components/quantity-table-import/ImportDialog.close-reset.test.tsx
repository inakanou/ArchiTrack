/**
 * @fileoverview ImportDialog のプレビューの高さの保存キーと、閉じたときの状態の破棄の単体テスト
 *
 * Task 97.9: 取り込みダイアログは受領見積書登録とプレビューの高さの保存キーを共有せず、
 * 閉じたときにファイルのプレビューと抽出結果を捨てる（利用者の裁定 2026-09-15）。
 * どちらも要件の受入基準には無い挙動であり、本ファイルは受入基準の番号を名乗らない。
 *
 * 抽出処理のフック（useImportDataExtractor）は実物を使い、その先の Excel 解析と PDF 抽出だけを
 * 模擬する。閉じた後に遅れて届いた抽出結果が、開き直したダイアログへ現れないことも確かめる。
 *
 * @module components/quantity-table-import/ImportDialog.close-reset.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';
import type { ImportExtractionResult } from '../../types/quantity-import.types';

// PDF.js ワーカーの初期化を無効化する
vi.mock('../estimate-requests/pdf-worker-config', () => ({}));

// react-pdf のモック: 2ページの PDF として読み込み完了を通知する
vi.mock('react-pdf', () => ({
  Document: ({
    children,
    file,
    onLoadSuccess,
  }: {
    children?: React.ReactNode;
    file?: string;
    onLoadSuccess?: (data: { numPages: number }) => void;
  }) => {
    if (file && onLoadSuccess) {
      setTimeout(() => onLoadSuccess({ numPages: 2 }), 0);
    }
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="pdf-page" data-page-number={pageNumber}>
      PDF Page {pageNumber}
    </div>
  ),
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

// インラインプレビューの Excel 表示用
vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      ['工種', '名称', '規格', '数量', '単位'],
      ['土工', '掘削工', '', '150', 'm3'],
    ]),
  },
}));

const mockParseExcelFile = vi.fn<(file: File) => Promise<ImportExtractionResult>>();
vi.mock('./excel-parser', () => ({
  parseExcelFile: (file: File) => mockParseExcelFile(file),
}));

const mockExtractPdfData =
  vi.fn<
    (file: File, onProgress: (p: number, m?: string) => void) => Promise<ImportExtractionResult>
  >();
vi.mock('./pdf-ocr-extractor', () => ({
  extractPdfData: (file: File, onProgress: (p: number, m?: string) => void) =>
    mockExtractPdfData(file, onProgress),
}));

import { ImportDialog } from './ImportDialog';

const RECEIVED_QUOTATION_PREVIEW_HEIGHT_KEY = 'architrack:received-quotation:preview-height';
const IMPORT_PREVIEW_HEIGHT_KEY = 'architrack:quantity-table-import:preview-height';

const groups: QuantityGroupDetail[] = [
  {
    id: 'group-1',
    quantityTableId: 'table-1',
    name: 'グループA',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 1,
    itemCount: 0,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const EXTRACTION_RESULT: ImportExtractionResult = {
  headers: ['工種', '名称', '数量', '単位'],
  rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
  extractionType: 'pdf-text',
  extractedText: '工種 名称 数量 単位\n土工 掘削工 150 m3',
};

function xlsxFile(): File {
  return new File(['xlsx'], '数量表.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function pdfFile(): File {
  return new File(['%PDF-1.4'], '数量表.pdf', { type: 'application/pdf' });
}

function renderDialog() {
  const props = { onClose: vi.fn(), onImport: vi.fn(), groups };
  const utils = render(<ImportDialog {...props} isOpen />);
  const close = () => utils.rerender(<ImportDialog {...props} isOpen={false} />);
  const reopen = () => utils.rerender(<ImportDialog {...props} isOpen />);
  return { ...utils, close, reopen };
}

/** 開き直したダイアログが初期状態（プレビュー・抽出結果・エラーが無い）であることを確かめる */
function expectInitialState(): void {
  // 不在の主張の前に、ダイアログそのものが描かれていることを確かめる
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('heading', { name: '数量表インポート' })).toBeInTheDocument();
  const results = within(dialog).getByRole('region', { name: '抽出結果' });

  expect(
    within(dialog).queryByRole('region', { name: 'ファイルプレビュー' })
  ).not.toBeInTheDocument();
  expect(within(results).queryByRole('table')).not.toBeInTheDocument();
  expect(within(results).queryByRole('region', { name: '抽出テキスト' })).not.toBeInTheDocument();
  expect(within(results).queryByRole('progressbar')).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: '一括取り込み' })).not.toBeInTheDocument();
  expect(within(dialog).getByLabelText('ファイルを選択')).toBeEnabled();
}

describe('ImportDialog: 閉じたときの状態の破棄', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:import-preview');
    global.URL.revokeObjectURL = vi.fn();
    mockParseExcelFile.mockResolvedValue({ ...EXTRACTION_RESULT, extractionType: 'excel-parse' });
  });

  afterEach(() => {
    cleanup();
  });

  it('抽出を終えた後に閉じて開き直すと、ファイルのプレビューと抽出結果が残らない', async () => {
    const { close, reopen } = renderDialog();

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), xlsxFile());

    // 前提: 閉じる前はプレビューと抽出結果が表示されている
    const results = screen.getByRole('region', { name: '抽出結果' });
    expect(await within(results).findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ファイルプレビュー' })).toBeInTheDocument();
    expect(within(results).getByRole('region', { name: '抽出テキスト' })).toBeInTheDocument();

    close();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    reopen();

    expectInitialState();
  });

  it('取り込み先の選択を開いたまま閉じて開き直すと、選択の表示が残らない', async () => {
    const user = userEvent.setup();
    const { close, reopen } = renderDialog();

    await user.upload(screen.getByLabelText('ファイルを選択'), xlsxFile());
    await user.click(await screen.findByRole('button', { name: '一括取り込み' }));
    // 前提: 取り込み先の選択が表示されている
    expect(screen.getByText('取り込み先グループを選択')).toBeInTheDocument();

    close();
    reopen();

    expectInitialState();
    expect(screen.queryByText('取り込み先グループを選択')).not.toBeInTheDocument();
  });

  it('対応していない形式のエラーを出したまま閉じて開き直すと、エラーが残らない', async () => {
    const { close, reopen } = renderDialog();

    await userEvent.upload(
      screen.getByLabelText('ファイルを選択'),
      new File(['text'], 'memo.txt', { type: 'text/plain' }),
      { applyAccept: false }
    );
    // 前提: 形式エラーが表示されている
    expect(screen.getByRole('alert')).toHaveTextContent('対応していないファイル形式です');

    close();
    reopen();

    expectInitialState();
  });

  it('抽出の処理中に閉じ、閉じた後に抽出結果が届いても、開き直したダイアログに現れない', async () => {
    let resolveExtraction: (result: ImportExtractionResult) => void = () => {};
    mockExtractPdfData.mockImplementation(
      () =>
        new Promise<ImportExtractionResult>((resolve) => {
          resolveExtraction = resolve;
        })
    );
    const { close, reopen } = renderDialog();

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), pdfFile());
    // 前提: 処理中の表示が出ており、抽出処理が呼ばれている
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockExtractPdfData).toHaveBeenCalledTimes(1);
    });

    close();
    // 閉じた後に抽出結果が届く
    await act(async () => {
      resolveExtraction(EXTRACTION_RESULT);
    });
    reopen();

    expectInitialState();
    // 遅れて届いた結果の反映を待っても現れない
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expectInitialState();
  });

  it('閉じて開き直した後に選んだファイルは、通常どおりプレビューと抽出結果を表示する', async () => {
    const { close, reopen } = renderDialog();

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), xlsxFile());
    expect(
      await within(screen.getByRole('region', { name: '抽出結果' })).findByRole('table')
    ).toBeInTheDocument();

    close();
    reopen();
    expectInitialState();

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), xlsxFile());
    expect(
      await within(screen.getByRole('region', { name: '抽出結果' })).findByRole('table')
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ファイルプレビュー' })).toBeInTheDocument();
    expect(mockParseExcelFile).toHaveBeenCalledTimes(2);
  });
});

describe('ImportDialog: プレビューの高さの保存キー', () => {
  let originalSetPointerCapture: unknown;
  let originalInnerHeight: number;

  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:import-preview');
    global.URL.revokeObjectURL = vi.fn();
    mockParseExcelFile.mockResolvedValue({ ...EXTRACTION_RESULT, extractionType: 'excel-parse' });
    // jsdom は Pointer Capture API を実装していないためスタブする
    originalSetPointerCapture = (HTMLElement.prototype as unknown as Record<string, unknown>)
      .setPointerCapture;
    (HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture = vi.fn();
    originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 2000 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalSetPointerCapture === undefined) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture;
    } else {
      (HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture =
        originalSetPointerCapture;
    }
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  /** ファイルプレビューの縦幅（style.height を持つ最も内側の要素）を返す */
  function previewHeightPx(preview: HTMLElement): number {
    let node: HTMLElement | null = within(preview).getByRole('table');
    while (node && !node.style.height) {
      node = node.parentElement;
    }
    return node ? Number.parseInt(node.style.height, 10) : -1;
  }

  it('取り込みダイアログのプレビューは、受領見積書とは別のキーで高さを復元し保存する', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === RECEIVED_QUOTATION_PREVIEW_HEIGHT_KEY) return '300';
      if (key === IMPORT_PREVIEW_HEIGHT_KEY) return '350';
      return null;
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

    renderDialog();
    await userEvent.upload(screen.getByLabelText('ファイルを選択'), xlsxFile());

    const preview = screen.getByRole('region', { name: 'ファイルプレビュー' });
    await within(preview).findByRole('table');

    // 取り込みダイアログのキーの値 350 が復元される（受領見積書のキーの 300 ではない）
    expect(getItemSpy).toHaveBeenCalledWith(IMPORT_PREVIEW_HEIGHT_KEY);
    expect(previewHeightPx(preview)).toBe(350);

    const handle = within(preview).getByTestId('preview-resize-handle');
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 160 });
    await waitFor(() => {
      expect(previewHeightPx(preview)).toBe(410);
    });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 160 });

    await waitFor(() => {
      expect(setItemSpy).toHaveBeenCalledWith(IMPORT_PREVIEW_HEIGHT_KEY, '410');
    });
    expect(setItemSpy).not.toHaveBeenCalledWith(
      RECEIVED_QUOTATION_PREVIEW_HEIGHT_KEY,
      expect.any(String)
    );
  });
});
