/**
 * @fileoverview ImportDialog のインラインプレビュー（ファイルそのものの表示）の単体テスト
 *
 * Task 96.2: 取り込みダイアログへ PDF ビューア・ページ送り・Excel の表表示を結線する
 *
 * react-pdf と xlsx は jsdom で描画できないため、FileInlinePreview の単体テストと同じ手口で
 * 軽量なモックに置き換える。抽出処理（useImportDataExtractor）もモックし、表示部品の結線だけを確かめる。
 *
 * @module components/quantity-table-import/ImportDialog.inline-preview.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

const mockStartExtraction = vi.fn();
const mockRetry = vi.fn();
const mockReset = vi.fn();

vi.mock('./useImportDataExtractor', () => ({
  useImportDataExtractor: vi.fn(),
}));

// PDF.js ワーカーの初期化を無効化する
vi.mock('../estimate-requests/pdf-worker-config', () => ({}));

// react-pdf のモックが通知する総ページ数（既定は2ページ。テストごとに beforeEach で戻す）
let mockNumPages = 2;

// react-pdf のモック: mockNumPages ページの PDF として読み込み完了を通知し、表示中のページ番号を描く
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
      setTimeout(() => onLoadSuccess({ numPages: mockNumPages }), 0);
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

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      ['工種', '名称', '規格', '数量', '単位'],
      ['土工', '掘削工', '', '150', 'm3'],
    ]),
  },
}));

import { ImportDialog } from './ImportDialog';
import { useImportDataExtractor } from './useImportDataExtractor';

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

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onImport: vi.fn(),
  groups,
};

type ExtractorState = ReturnType<typeof useImportDataExtractor>;

function mockExtractor(overrides: Partial<ExtractorState>): void {
  vi.mocked(useImportDataExtractor).mockReturnValue({
    status: 'idle',
    progress: 0,
    progressMessage: '',
    result: null,
    error: null,
    startExtraction: mockStartExtraction,
    retry: mockRetry,
    reset: mockReset,
    ...overrides,
  });
}

function mockCompletedExtraction(): void {
  mockExtractor({
    status: 'completed',
    progress: 100,
    progressMessage: '完了',
    result: {
      headers: ['工種', '名称', '数量', '単位'],
      rows: [{ columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 }],
      extractionType: 'pdf-text',
      extractedText: '工種 名称 数量 単位\n土工 掘削工 150 m3',
    },
  });
}

function pdfFile(): File {
  return new File(['%PDF-1.4'], '数量表.pdf', { type: 'application/pdf' });
}

describe('ImportDialog: インラインプレビュー', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:import-preview');
    global.URL.revokeObjectURL = vi.fn();
    mockExtractor({});
  });

  afterEach(() => {
    cleanup();
    mockNumPages = 2;
  });

  /**
   * REQ-34.4 は総ページ数による例外を設けないため、1ページの PDF でも
   * 「ページ 1 / 1」と前ページ/次ページのボタンを出し、どちらも押せない状態にする。
   *
   * @requirement quantity-table-generation/REQ-34.4
   */
  it('1ページのPDFでも、現在ページ/総ページ数と非活性の前ページ/次ページのボタンを表示する', async () => {
    mockNumPages = 1;
    render(<ImportDialog {...defaultProps} />);

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), pdfFile());

    const preview = screen.getByRole('region', { name: 'ファイルプレビュー' });
    await waitFor(() => {
      expect(within(preview).getByText('ページ 1 / 1')).toBeInTheDocument();
    });
    expect(within(preview).getByRole('button', { name: '前へ' })).toBeDisabled();
    expect(within(preview).getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('ファイルをアップロードする前はインラインプレビューを表示しない', () => {
    render(<ImportDialog {...defaultProps} />);

    expect(screen.queryByRole('region', { name: 'ファイルプレビュー' })).not.toBeInTheDocument();
  });

  /**
   * アップロード直後（抽出処理中）から、ダイアログ内にファイルのインラインプレビューを表示する。
   *
   * @requirement quantity-table-generation/REQ-34.1
   */
  it('ファイルのアップロード時に、抽出処理の完了を待たずダイアログ内にインラインプレビューを表示する', async () => {
    const { rerender } = render(<ImportDialog {...defaultProps} />);

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), pdfFile());
    expect(mockStartExtraction).toHaveBeenCalledTimes(1);

    // アップロードを受けて抽出処理が始まった状態（処理中はファイル選択が非活性になる）
    mockExtractor({ status: 'processing', progress: 10, progressMessage: '処理中' });
    rerender(<ImportDialog {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    const preview = within(dialog).getByRole('region', { name: 'ファイルプレビュー' });
    expect(within(preview).getByTestId('pdf-document')).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar')).toBeInTheDocument();
  });

  /**
   * PDF のアップロード時は、PDF ビューア（react-pdf の Document / Page）で1ページ目を表示する。
   *
   * @requirement quantity-table-generation/REQ-34.2
   */
  it('PDFのアップロード時は、PDFビューアで1ページ目をインライン表示する', async () => {
    render(<ImportDialog {...defaultProps} />);

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), pdfFile());

    const preview = screen.getByRole('region', { name: 'ファイルプレビュー' });
    expect(within(preview).getByTestId('pdf-page')).toHaveAttribute('data-page-number', '1');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  /**
   * PDF のプレビュー中は、前ページ/次ページのボタンと「現在ページ / 総ページ数」を提供し、
   * ボタンで表示ページが切り替わる。先頭では前ページ、末尾では次ページが押せない。
   *
   * @requirement quantity-table-generation/REQ-34.4
   */
  it('PDFのプレビュー中は、前ページ/次ページのボタンと現在ページ/総ページ数でページを送れる', async () => {
    const user = userEvent.setup();
    render(<ImportDialog {...defaultProps} />);

    await user.upload(screen.getByLabelText('ファイルを選択'), pdfFile());

    const preview = screen.getByRole('region', { name: 'ファイルプレビュー' });
    await waitFor(() => {
      expect(within(preview).getByText('ページ 1 / 2')).toBeInTheDocument();
    });
    const prev = within(preview).getByRole('button', { name: '前へ' });
    const next = within(preview).getByRole('button', { name: '次へ' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    expect(within(preview).getByText('ページ 2 / 2')).toBeInTheDocument();
    expect(within(preview).getByTestId('pdf-page')).toHaveAttribute('data-page-number', '2');
    expect(next).toBeDisabled();
    expect(prev).toBeEnabled();

    await user.click(prev);
    expect(within(preview).getByText('ページ 1 / 2')).toBeInTheDocument();
    expect(within(preview).getByTestId('pdf-page')).toHaveAttribute('data-page-number', '1');
  });

  /**
   * Excel のアップロード時は、表データをテーブル形式でインライン表示する。
   *
   * @requirement quantity-table-generation/REQ-34.3
   */
  it('Excelのアップロード時は、表データをテーブル形式でインライン表示する', async () => {
    render(<ImportDialog {...defaultProps} />);

    await userEvent.upload(
      screen.getByLabelText('ファイルを選択'),
      new File(['xlsx'], '数量表.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );

    const preview = screen.getByRole('region', { name: 'ファイルプレビュー' });
    const table = await within(preview).findByRole('table');
    expect(within(table).getByText('工種')).toBeInTheDocument();
    expect(within(table).getByText('掘削工')).toBeInTheDocument();
  });

  /**
   * ブラウザが MIME 型を空で報告する .xls でも、拡張子から Excel と判定してテーブル表示する。
   * 抽出処理には選ばれたファイルそのものを渡す。
   *
   * @requirement quantity-table-generation/REQ-34.3
   */
  it('MIME型が空の.xlsファイルでも、拡張子からExcelと判定してテーブル形式でインライン表示する', async () => {
    render(<ImportDialog {...defaultProps} />);

    const xls = new File(['xls'], '数量表.xls', { type: '' });
    await userEvent.upload(screen.getByLabelText('ファイルを選択'), xls);

    const preview = screen.getByRole('region', { name: 'ファイルプレビュー' });
    expect(await within(preview).findByRole('table')).toBeInTheDocument();
    expect(mockStartExtraction).toHaveBeenCalledWith(xls);
  });

  it('対応していない形式のファイルではインラインプレビューを表示しない', async () => {
    render(<ImportDialog {...defaultProps} />);

    await userEvent.upload(
      screen.getByLabelText('ファイルを選択'),
      new File(['text'], 'memo.txt', { type: 'text/plain' }),
      { applyAccept: false }
    );

    expect(screen.getByText(/対応していないファイル形式です/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'ファイルプレビュー' })).not.toBeInTheDocument();
  });

  /**
   * インラインプレビューと抽出結果（抽出テキストとプレビューテーブル）を、同一ダイアログ内の
   * 同じ横並びの行へ配置する。実際の左右の位置関係は E2E が描画座標で確かめる。
   *
   * @requirement quantity-table-generation/REQ-34.5
   */
  it('インラインプレビューと抽出結果プレビューテーブルを同一ダイアログ内の同じ行に並べて配置する', async () => {
    mockCompletedExtraction();
    render(<ImportDialog {...defaultProps} />);

    await userEvent.upload(screen.getByLabelText('ファイルを選択'), pdfFile());

    const dialog = screen.getByRole('dialog');
    const preview = within(dialog).getByRole('region', { name: 'ファイルプレビュー' });
    const results = within(dialog).getByRole('region', { name: '抽出結果' });
    expect(within(preview).getByTestId('pdf-page')).toBeInTheDocument();
    expect(within(results).getByRole('table')).toBeInTheDocument();
    expect(within(results).getByRole('region', { name: '抽出テキスト' })).toBeInTheDocument();

    const row = preview.parentElement;
    expect(row).not.toBeNull();
    expect(results.parentElement).toBe(row);
    expect(row!.style.display).toBe('flex');
    expect(row!.style.flexDirection === '' || row!.style.flexDirection === 'row').toBe(true);
    // インラインプレビューが左、抽出結果が右（DOM 順）
    expect(row!.firstElementChild).toBe(preview);
  });
});
