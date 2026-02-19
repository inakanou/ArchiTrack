/**
 * @fileoverview EstimateExportDialog テスト
 *
 * Task 37.3: 出力ダイアログの行タイプ選択テスト
 *
 * Requirements:
 * - REQ-32.1: 出力ダイアログに「見積」「実行」「業者」の3つのラジオボタンを提供
 * - REQ-32.2: デフォルト値は「見積」（ESTIMATE）を選択
 * - REQ-32.3: 出力実行時にlineTypeパラメータをAPIリクエストに付加
 * - REQ-32.4: 出力ファイル名に行タイプラベルを含める
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateExportDialog } from '../../../components/estimate/EstimateExportDialog';

describe('EstimateExportDialog', () => {
  const defaultProps = {
    isOpen: true,
    estimateId: 'est-1',
    estimateName: 'テスト見積書',
    onClose: vi.fn(),
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('isOpen=falseの場合は何も表示しない', () => {
    const { container } = render(<EstimateExportDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=trueの場合はダイアログが表示される', () => {
    render(<EstimateExportDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('見積書出力')).toBeInTheDocument();
  });

  // ==========================================================================
  // REQ-32.1: 行タイプラジオボタン
  // ==========================================================================
  describe('出力対象ラジオボタン (REQ-32.1)', () => {
    it('「出力対象」セクションに見積・実行・業者の3つのラジオボタンがあること', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      expect(screen.getByText('出力対象')).toBeInTheDocument();

      const lineTypeRadios = screen.getAllByRole('radio').filter((radio) => {
        return (radio as HTMLInputElement).name === 'export-line-type';
      });
      expect(lineTypeRadios).toHaveLength(3);
    });

    it('各ラジオボタンのラベルが正しいこと', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      // formatName divの中のテキストを確認
      expect(screen.getByText('見積金額行を出力します')).toBeInTheDocument();
      expect(screen.getByText('実行金額行を出力します')).toBeInTheDocument();
      expect(screen.getByText('業者金額行を出力します')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-32.2: デフォルト値
  // ==========================================================================
  describe('デフォルト値 (REQ-32.2)', () => {
    it('デフォルトで「見積」（ESTIMATE）が選択されていること', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      const lineTypeRadios = screen.getAllByRole('radio').filter((radio) => {
        return (radio as HTMLInputElement).name === 'export-line-type';
      });

      const estimateRadio = lineTypeRadios.find(
        (r) => (r as HTMLInputElement).value === 'ESTIMATE'
      );
      expect(estimateRadio).toBeChecked();
    });
  });

  // ==========================================================================
  // REQ-32.3: lineTypeパラメータ付加
  // ==========================================================================
  describe('lineTypeパラメータ (REQ-32.3)', () => {
    it('出力実行時にlineTypeクエリパラメータがAPIリクエストに含まれること', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      // createObjectURLとrevokeObjectURLのモック
      const mockUrl = 'blob:http://localhost/test';
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
      globalThis.URL.revokeObjectURL = vi.fn();

      render(<EstimateExportDialog {...defaultProps} />);

      // PDF形式を選択
      const pdfRadio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === 'pdf');
      await user.click(pdfRadio!);

      // 出力ボタンをクリック
      const exportButton = screen.getByRole('button', { name: '出力' });
      await user.click(exportButton);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/estimates/est-1/export?format=pdf&lineType=ESTIMATE',
          expect.objectContaining({
            method: 'GET',
          })
        );
      });
    });

    it('実行タイプを選択した場合にlineType=EXECUTIONがAPIリクエストに含まれること', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
      globalThis.URL.revokeObjectURL = vi.fn();

      render(<EstimateExportDialog {...defaultProps} />);

      // 実行ラジオボタンを選択
      const executionRadio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === 'EXECUTION');
      await user.click(executionRadio!);

      // PDF形式を選択
      const pdfRadio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === 'pdf');
      await user.click(pdfRadio!);

      // 出力
      const exportButton = screen.getByRole('button', { name: '出力' });
      await user.click(exportButton);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/estimates/est-1/export?format=pdf&lineType=EXECUTION',
          expect.objectContaining({
            method: 'GET',
          })
        );
      });
    });
  });

  // ==========================================================================
  // REQ-32.4: ファイル名に行タイプラベル
  // ==========================================================================
  describe('ファイル名 (REQ-32.4)', () => {
    it('出力ファイル名に「_見積」が含まれること（デフォルト）', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
      globalThis.URL.revokeObjectURL = vi.fn();

      // createElement('a')で作成されるリンク要素のdownloadプロパティを追跡
      let capturedDownload = '';
      const originalCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((...args: Parameters<typeof document.createElement>) => {
        const el = originalCreateElement(...args);
        if (args[0] === 'a') {
          const originalDescriptor =
            Object.getOwnPropertyDescriptor(el, 'download') ||
            Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'download');
          Object.defineProperty(el, 'download', {
            get() {
              return capturedDownload;
            },
            set(value: string) {
              capturedDownload = value;
              if (originalDescriptor?.set) originalDescriptor.set.call(el, value);
            },
            configurable: true,
          });
        }
        return el;
      });

      render(<EstimateExportDialog {...defaultProps} />);

      // PDF形式を選択
      const pdfRadio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === 'pdf');
      await user.click(pdfRadio!);

      // 出力
      await user.click(screen.getByRole('button', { name: '出力' }));

      await waitFor(() => {
        expect(capturedDownload).toBe('テスト見積書_見積.pdf');
      });

      createElementSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 出力形式選択
  // ==========================================================================
  describe('出力形式選択', () => {
    it('出力形式を選択しないと出力ボタンが無効であること', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      const exportButton = screen.getByRole('button', { name: '出力' });
      expect(exportButton).toBeDisabled();
    });

    it('PDF形式を選択すると出力ボタンが有効になること', async () => {
      const user = userEvent.setup();
      render(<EstimateExportDialog {...defaultProps} />);

      const pdfRadio = screen
        .getAllByRole('radio')
        .find((r) => (r as HTMLInputElement).value === 'pdf');
      await user.click(pdfRadio!);

      const exportButton = screen.getByRole('button', { name: '出力' });
      expect(exportButton).not.toBeDisabled();
    });
  });

  // ==========================================================================
  // キャンセル
  // ==========================================================================
  describe('キャンセル', () => {
    it('キャンセルボタンクリックでonCloseが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<EstimateExportDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
});
