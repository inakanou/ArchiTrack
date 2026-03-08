/**
 * @fileoverview EstimateExportDialog テスト
 *
 * Task 37.3: 出力ダイアログの行タイプ選択テスト
 * Task 42.3: ラジオボタンからチェックボックスへの変更対応
 *
 * Requirements:
 * - REQ-32.1: 出力ダイアログに「見積」「実行」「業者」の3つのチェックボックスを提供
 * - REQ-32.2: デフォルト値は「見積」（ESTIMATE）のみ選択
 * - REQ-32.3: 出力実行時にlineTypesパラメータをAPIリクエストに付加
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
  // REQ-32.1: 行タイプチェックボックス
  // ==========================================================================
  describe('出力対象チェックボックス (REQ-32.1)', () => {
    it('「出力対象」セクションに見積・実行・業者の3つのチェックボックスがあること', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      expect(screen.getByText('出力対象')).toBeInTheDocument();

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    });

    it('各チェックボックスのラベルが正しいこと', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      expect(screen.getByText('見積金額行を出力します')).toBeInTheDocument();
      expect(screen.getByText('実行金額行を出力します')).toBeInTheDocument();
      expect(screen.getByText('業者金額行を出力します')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // REQ-38.1: デフォルト値（REQ-32.5を上書き: 「見積」と「実行」がON）
  // ==========================================================================
  describe('デフォルト値 (REQ-38.1)', () => {
    it('デフォルトで「見積」と「実行」が選択されていること（REQ-38.1）', () => {
      render(<EstimateExportDialog {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      const estimateCheckbox = checkboxes.find(
        (cb) => (cb as HTMLInputElement).value === 'ESTIMATE'
      );
      const executionCheckbox = checkboxes.find(
        (cb) => (cb as HTMLInputElement).value === 'EXECUTION'
      );
      const vendorCheckbox = checkboxes.find((cb) => (cb as HTMLInputElement).value === 'VENDOR');

      expect(estimateCheckbox).toBeChecked();
      expect(executionCheckbox).toBeChecked();
      expect(vendorCheckbox).not.toBeChecked();
    });
  });

  // ==========================================================================
  // REQ-32.3: lineTypesパラメータ付加
  // ==========================================================================
  describe('lineTypesパラメータ (REQ-32.3)', () => {
    it('出力実行時にlineTypesクエリパラメータがAPIリクエストに含まれること', async () => {
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
          'http://localhost:3000/api/estimates/est-1/export?format=pdf&lineTypes=ESTIMATE,EXECUTION',
          expect.objectContaining({
            method: 'GET',
          })
        );
      });
    });

    it('実行タイプを選択した場合にlineTypes=EXECUTIONがAPIリクエストに含まれること', async () => {
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

      // デフォルトの見積チェックボックスをOFF（REQ-38.1で見積と実行がデフォルトON）
      const checkboxes = screen.getAllByRole('checkbox');
      const estimateCheckbox = checkboxes.find(
        (cb) => (cb as HTMLInputElement).value === 'ESTIMATE'
      )!;
      await user.click(estimateCheckbox);

      // 実行チェックボックスはデフォルトでONなのでそのまま

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
          'http://localhost:3000/api/estimates/est-1/export?format=pdf&lineTypes=EXECUTION',
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
        expect(capturedDownload).toBe('テスト見積書_見積_実行.pdf');
      });

      createElementSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 出力形式選択
  // ==========================================================================
  describe('出力形式選択', () => {
    it('チェックボックスが全てOFFの場合、出力ボタンが無効であること', async () => {
      const user = userEvent.setup();
      render(<EstimateExportDialog {...defaultProps} />);

      // デフォルトでONの見積・実行チェックボックスをOFFにする（REQ-38.1対応）
      const checkboxes = screen.getAllByRole('checkbox');
      const estimateCheckbox = checkboxes.find(
        (cb) => (cb as HTMLInputElement).value === 'ESTIMATE'
      )!;
      const executionCheckbox = checkboxes.find(
        (cb) => (cb as HTMLInputElement).value === 'EXECUTION'
      )!;
      await user.click(estimateCheckbox);
      await user.click(executionCheckbox);

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
