/**
 * @fileoverview ExportDialog テスト
 *
 * Task 13: フロントエンド出力ダイアログの実装
 *
 * Requirements (construction-schedule):
 * - REQ-7.1: Excel出力ボタン押下時にExcel形式（.xlsx）のファイルをダウンロード
 * - REQ-8.1: PDF出力ボタン押下時にPDF形式のファイルをダウンロード
 * - REQ-7.6 / REQ-8.6: 出力失敗時にエラーメッセージを表示し、再試行を促す（Task 18.1）
 *
 * @module components/schedule/ExportDialog.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  // REQ-7.6 / REQ-8.6: 出力失敗時の再試行の促し
  // ============================================================================

  describe.each([
    { req: 'REQ-7.6', label: 'Excel', format: 'xlsx' },
    { req: 'REQ-8.6', label: 'PDF', format: 'pdf' },
  ] as const)('$req: $label 出力の失敗時の再試行', ({ format }) => {
    const exportUrl = `http://localhost:3000/api/schedules/schedule-001/export?format=${format}`;

    const selectFormat = async (user: ReturnType<typeof userEvent.setup>) => {
      const radio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === format)!;
      await user.click(radio);
      expect(radio).toBeChecked();
    };

    const spyDownloadLink = () => {
      const originalCreateElement = document.createElement.bind(document);
      const mockClick = vi.fn();
      const downloaded: string[] = [];
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = mockClick;
          let name = '';
          Object.defineProperty(element, 'download', {
            set: (value: string) => {
              name = value;
              downloaded.push(value);
            },
            get: () => name,
          });
        }
        return element;
      });
      return { mockClick, downloaded };
    };

    it.each([
      {
        cause: '通信が失敗した場合',
        failure: () => Promise.reject(new Error('network error')),
      },
      {
        cause: 'API が 500 を返した場合',
        failure: () => Promise.resolve({ ok: false, status: 500 }),
      },
    ])(
      '$cause、エラーメッセージとともに再試行ボタンを表示し、再試行で同じ形式の出力を再度要求する',
      async ({ failure }) => {
        const user = userEvent.setup();
        const { mockClick, downloaded } = spyDownloadLink();
        const fetchMock = vi
          .fn()
          .mockImplementationOnce(failure)
          .mockResolvedValueOnce({
            ok: true,
            blob: () => Promise.resolve(new Blob(['test'])),
          });
        globalThis.fetch = fetchMock;

        render(<ExportDialog {...defaultProps} />);
        await selectFormat(user);
        await user.click(screen.getByRole('button', { name: '出力' }));

        // 失敗時: エラーメッセージと再試行ボタンが現れる
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('工程表の出力に失敗しました');
        const retryButton = within(alert).getByRole('button', { name: '再試行' });
        expect(retryButton).toBeEnabled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(defaultProps.onClose).not.toHaveBeenCalled();
        expect(mockClick).not.toHaveBeenCalled();

        // 再試行: 直前の形式で出力が再度要求される
        await user.click(retryButton);

        await waitFor(() => {
          expect(fetchMock).toHaveBeenCalledTimes(2);
        });
        expect(fetchMock).toHaveBeenNthCalledWith(
          2,
          exportUrl,
          expect.objectContaining({ method: 'GET' })
        );

        // 再試行の成功: ダウンロードしてダイアログを閉じ、エラーは消える
        await waitFor(() => {
          expect(mockClick).toHaveBeenCalledTimes(1);
          expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
        });
        expect(downloaded).toEqual([`テスト工程表.${format}`]);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      }
    );

    it('再試行がまた失敗した場合、エラーメッセージと再試行ボタンを表示し続ける', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      globalThis.fetch = fetchMock;

      render(<ExportDialog {...defaultProps} />);
      await selectFormat(user);
      await user.click(screen.getByRole('button', { name: '出力' }));

      const alert = await screen.findByRole('alert');
      await user.click(within(alert).getByRole('button', { name: '再試行' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        exportUrl,
        expect.objectContaining({ method: 'GET' })
      );
      const alertAfterRetry = await screen.findByRole('alert');
      expect(alertAfterRetry).toHaveTextContent('工程表の出力に失敗しました');
      expect(within(alertAfterRetry).getByRole('button', { name: '再試行' })).toBeEnabled();
      expect(defaultProps.onClose).not.toHaveBeenCalled();
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
