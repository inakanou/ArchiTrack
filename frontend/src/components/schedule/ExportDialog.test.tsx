/**
 * @fileoverview ExportDialog テスト
 *
 * Task 13: フロントエンド出力ダイアログの実装
 *
 * Requirements (construction-schedule):
 * - REQ-7.1: Excel出力ボタン押下時にExcel形式（.xlsx）のファイルをダウンロード
 * - REQ-8.1: PDF出力ボタン押下時にPDF形式のファイルをダウンロード
 *
 * @module components/schedule/ExportDialog.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportDialog } from './ExportDialog';

describe('ExportDialog', () => {
  const defaultProps = {
    isOpen: true,
    scheduleId: 'schedule-001',
    scheduleName: 'テスト工程表',
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

  // ============================================================================
  // ダイアログ表示/非表示
  // ============================================================================

  it('isOpen=trueの場合、ダイアログが表示される', () => {
    render(<ExportDialog {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('工程表出力')).toBeInTheDocument();
  });

  it('isOpen=falseの場合、ダイアログが表示されない', () => {
    render(<ExportDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ============================================================================
  // 出力形式選択（Excel/PDF）
  // ============================================================================

  it('Excel形式とPDF形式のラジオボタンが表示される', () => {
    render(<ExportDialog {...defaultProps} />);

    const formatRadios = screen
      .getAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).name === 'export-format');
    expect(formatRadios).toHaveLength(2);

    expect(screen.getByText('Excel形式')).toBeInTheDocument();
    expect(screen.getByText('PDF形式')).toBeInTheDocument();
  });

  it('デフォルトでExcel形式が選択されている', () => {
    render(<ExportDialog {...defaultProps} />);

    const formatRadios = screen
      .getAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).name === 'export-format');

    const xlsxRadio = formatRadios.find(
      (r) => (r as HTMLInputElement).value === 'xlsx'
    ) as HTMLInputElement;
    const pdfRadio = formatRadios.find(
      (r) => (r as HTMLInputElement).value === 'pdf'
    ) as HTMLInputElement;

    expect(xlsxRadio.checked).toBe(true);
    expect(pdfRadio.checked).toBe(false);
  });

  it('PDF形式を選択できる', async () => {
    const user = userEvent.setup();
    render(<ExportDialog {...defaultProps} />);

    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    expect(pdfRadio).toBeChecked();
  });

  // ============================================================================
  // REQ-7.1: Excel出力
  // ============================================================================

  it('REQ-7.1: Excel出力ボタン押下時にエクスポートAPIを呼び出してファイルをダウンロードする', async () => {
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
    let downloadFileName = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = mockClick;
        Object.defineProperty(element, 'download', {
          set: (value: string) => {
            downloadFileName = value;
          },
          get: () => downloadFileName,
        });
      }
      return element;
    });

    render(<ExportDialog {...defaultProps} />);

    // デフォルトでExcelが選択されているのでそのまま出力
    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/schedules/schedule-001/export?format=xlsx',
        expect.objectContaining({ method: 'GET' })
      );
    });

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
      expect(downloadFileName).toContain('テスト工程表');
      expect(downloadFileName).toContain('.xlsx');
    });
  });

  // ============================================================================
  // REQ-8.1: PDF出力
  // ============================================================================

  it('REQ-8.1: PDF出力ボタン押下時にエクスポートAPIを呼び出してファイルをダウンロードする', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    const mockClick = vi.fn();
    let downloadFileName = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = mockClick;
        Object.defineProperty(element, 'download', {
          set: (value: string) => {
            downloadFileName = value;
          },
          get: () => downloadFileName,
        });
      }
      return element;
    });

    render(<ExportDialog {...defaultProps} />);

    // PDF形式を選択
    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/schedules/schedule-001/export?format=pdf',
        expect.objectContaining({ method: 'GET' })
      );
    });

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
      expect(downloadFileName).toContain('テスト工程表');
      expect(downloadFileName).toContain('.pdf');
    });
  });

  // ============================================================================
  // 出力中のローディング表示
  // ============================================================================

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

    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText(/出力中/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /出力中/i })).toBeDisabled();
  });

  it('出力処理中はキャンセルボタンが無効化される', async () => {
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

    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      expect(cancelButton).toBeDisabled();
    });
  });

  it('出力処理中はラジオボタンが無効化される', async () => {
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

    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      const radios = screen.getAllByRole('radio');
      radios.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });
  });

  // ============================================================================
  // エラーハンドリング
  // ============================================================================

  it('出力エラー時はエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('出力に失敗しました'));

    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/工程表の出力に失敗しました/i)).toBeInTheDocument();
    });
  });

  it('APIレスポンスがエラーの場合もエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // キャンセルと成功
  // ============================================================================

  it('キャンセルボタンでダイアログを閉じる', async () => {
    const user = userEvent.setup();

    render(<ExportDialog {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    await user.click(cancelButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('出力成功後にダイアログを閉じる', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
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

    render(<ExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
});
