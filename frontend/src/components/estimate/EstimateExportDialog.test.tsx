/**
 * @fileoverview EstimateExportDialog テスト
 *
 * Task 11.5: 見積書出力ダイアログの実装
 *
 * Requirements (estimate-creation):
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、建設工事見積書形式のExcelファイルを生成する
 * - REQ-10.8: 見積書出力が処理中の場合、出力処理中であることを表示する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateExportDialog } from './EstimateExportDialog';

describe('EstimateExportDialog', () => {
  const defaultProps = {
    isOpen: true,
    estimateId: 'est-001',
    estimateName: 'テスト見積書',
    onClose: vi.fn(),
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    originalFetch = globalThis.fetch;
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * ダイアログが開かれたときに表示される
   */
  it('ダイアログが開かれたときに正しくレンダリングされる', () => {
    render(<EstimateExportDialog {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('見積書出力')).toBeInTheDocument();
  });

  /**
   * isOpen=false の場合、ダイアログが表示されない
   */
  it('isOpen=false の場合、ダイアログが表示されない', () => {
    render(<EstimateExportDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * REQ-10.1, REQ-10.2: 出力形式を選択できる
   */
  it('出力形式選択オプションを表示する', () => {
    render(<EstimateExportDialog {...defaultProps} />);

    expect(screen.getByText('出力対象と出力形式を選択してください')).toBeInTheDocument();

    const formatRadios = screen.getAllByRole('radio').filter((radio) => {
      return (radio as HTMLInputElement).name === 'export-format';
    });
    expect(formatRadios).toHaveLength(2);
  });

  /**
   * PDF出力形式を選択できる
   */
  it('PDF出力形式を選択できる', async () => {
    const user = userEvent.setup();

    render(<EstimateExportDialog {...defaultProps} />);

    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    expect(pdfRadio).toBeChecked();
  });

  /**
   * Excel出力形式を選択できる
   */
  it('Excel出力形式を選択できる', async () => {
    const user = userEvent.setup();

    render(<EstimateExportDialog {...defaultProps} />);

    const excelRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'xlsx')!;
    await user.click(excelRadio);

    expect(excelRadio).toBeChecked();
  });

  /**
   * REQ-10.1: PDF出力を実行できる
   */
  it('PDF出力を実行できる', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    const mockClick = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = mockClick;
      }
      return element;
    });

    render(<EstimateExportDialog {...defaultProps} />);

    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/estimates/est-001/export?format=pdf&lineType=ESTIMATE',
        expect.objectContaining({ method: 'GET' })
      );
    });

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });
  });

  /**
   * REQ-10.2: Excel出力を実行できる
   */
  it('Excel出力を実行できる', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    const mockClick = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = mockClick;
      }
      return element;
    });

    render(<EstimateExportDialog {...defaultProps} />);

    const excelRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'xlsx')!;
    await user.click(excelRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/estimates/est-001/export?format=xlsx&lineType=ESTIMATE',
        expect.objectContaining({ method: 'GET' })
      );
    });

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });
  });

  /**
   * REQ-10.8: 出力処理中のインジケーター表示
   */
  it('出力処理中はローディングインジケーターを表示する', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob(['test'])),
              }),
            1000
          );
        })
    );

    render(<EstimateExportDialog {...defaultProps} />);

    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText(/出力中/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /出力中/i })).toBeDisabled();
  });

  /**
   * 出力形式が選択されていない場合、出力ボタンが無効
   */
  it('出力形式が選択されていない場合、出力ボタンが無効', () => {
    render(<EstimateExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    expect(exportButton).toBeDisabled();
  });

  /**
   * キャンセルボタンでダイアログを閉じる
   */
  it('キャンセルボタンでダイアログを閉じる', async () => {
    const user = userEvent.setup();

    render(<EstimateExportDialog {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    await user.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  /**
   * エラー時はエラーメッセージを表示する
   */
  it('出力エラー時はエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('出力に失敗しました'));

    render(<EstimateExportDialog {...defaultProps} />);

    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/見積書の出力に失敗しました/i)).toBeInTheDocument();
    });
  });

  /**
   * 出力成功後にダイアログを閉じる
   */
  it('出力成功後にダイアログを閉じる', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = vi.fn();
      }
      return element;
    });

    render(<EstimateExportDialog {...defaultProps} />);

    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
});
