/**
 * @fileoverview EstimateExportDialog テスト
 *
 * Task 42.4: 見積書出力の行タイプ複数選択テスト
 *
 * Requirements (estimate-creation):
 * - REQ-32.1: 出力対象として「見積」「実行」「業者」をチェックボックスで複数選択可能とする
 * - REQ-32.2: チェックされた行タイプの列のみを出力対象とする
 * - REQ-32.3: 出力ファイル名にチェックされた行タイプのラベルを含める
 * - REQ-32.4: lineTypesクエリパラメータ（カンマ区切り）を受け付ける
 * - REQ-32.5: デフォルト値として「見積」のみをONとする
 * - REQ-32.6: いずれのチェックボックスもチェックされていない場合、出力ボタンを無効化する
 * - REQ-32.7: チェックされた行タイプの列を横1列に並べ、行タイプごとのプレフィックス付き列名で出力する
 * - REQ-32.8: 出力形式のデフォルトをExcel（.xlsx）とする
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、建設工事見積書形式のExcelファイルを生成する
 * - REQ-10.8: 見積書出力が処理中の場合、出力処理中であることを表示する
 * - REQ-10.14: 出力形式のデフォルトをExcel（.xlsx）とする
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

  // ============================================================================
  // REQ-32.1: チェックボックスで複数選択可能
  // ============================================================================

  /**
   * REQ-32.1: 出力対象をチェックボックスで表示する（ラジオボタンではない）
   */
  it('出力対象がチェックボックスで表示される（ラジオボタンではない）', () => {
    render(<EstimateExportDialog {...defaultProps} />);

    // チェックボックスが3つ存在する
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);

    // 「見積」「実行」「業者」のラベルが表示されている
    expect(screen.getByText('見積')).toBeInTheDocument();
    expect(screen.getByText('実行')).toBeInTheDocument();
    expect(screen.getByText('業者')).toBeInTheDocument();

    // ラジオボタンが出力対象セクションに存在しない（出力形式セクションにはラジオボタンがあるが、出力対象セクションはチェックボックスであること）
    const lineTypeRadios = screen
      .queryAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).name === 'export-line-type');
    expect(lineTypeRadios).toHaveLength(0);
  });

  /**
   * REQ-32.1: 複数のチェックボックスを同時に選択できる
   */
  it('複数のチェックボックスを同時に選択できる', async () => {
    const user = userEvent.setup();
    render(<EstimateExportDialog {...defaultProps} />);

    const checkboxes = screen.getAllByRole('checkbox');
    // デフォルトで見積がON
    const estimateCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'ESTIMATE'
    ) as HTMLInputElement;
    const executionCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'EXECUTION'
    ) as HTMLInputElement;
    const vendorCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'VENDOR'
    ) as HTMLInputElement;

    expect(estimateCheckbox).toBeTruthy();
    expect(executionCheckbox).toBeTruthy();
    expect(vendorCheckbox).toBeTruthy();

    // 実行と業者もチェックする
    await user.click(executionCheckbox);
    await user.click(vendorCheckbox);

    // 3つともチェックされている
    expect(estimateCheckbox.checked).toBe(true);
    expect(executionCheckbox.checked).toBe(true);
    expect(vendorCheckbox.checked).toBe(true);
  });

  // ============================================================================
  // REQ-32.5: デフォルト値は「見積」のみON
  // ============================================================================

  /**
   * REQ-32.5: デフォルト値は「見積」のみON
   */
  it('デフォルト値は「見積」のみON、「実行」「業者」はOFF', () => {
    render(<EstimateExportDialog {...defaultProps} />);

    const checkboxes = screen.getAllByRole('checkbox');
    const estimateCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'ESTIMATE'
    ) as HTMLInputElement;
    const executionCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'EXECUTION'
    ) as HTMLInputElement;
    const vendorCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'VENDOR'
    ) as HTMLInputElement;

    expect(estimateCheckbox.checked).toBe(true);
    expect(executionCheckbox.checked).toBe(false);
    expect(vendorCheckbox.checked).toBe(false);
  });

  // ============================================================================
  // REQ-32.8, REQ-10.14: 出力形式のデフォルトをExcel（.xlsx）とする
  // ============================================================================

  /**
   * REQ-32.8, REQ-10.14: 出力形式のデフォルトをExcel（.xlsx）とする
   */
  it('出力形式のデフォルトがExcel（.xlsx）である', () => {
    render(<EstimateExportDialog {...defaultProps} />);

    const formatRadios = screen.getAllByRole('radio').filter((radio) => {
      return (radio as HTMLInputElement).name === 'export-format';
    });

    const xlsxRadio = formatRadios.find(
      (r) => (r as HTMLInputElement).value === 'xlsx'
    ) as HTMLInputElement;
    const pdfRadio = formatRadios.find(
      (r) => (r as HTMLInputElement).value === 'pdf'
    ) as HTMLInputElement;

    expect(xlsxRadio.checked).toBe(true);
    expect(pdfRadio.checked).toBe(false);
  });

  // ============================================================================
  // REQ-32.6: チェックボックス全OFFで出力ボタンがdisabled
  // ============================================================================

  /**
   * REQ-32.6: いずれのチェックボックスもチェックされていない場合、出力ボタンを無効化する
   */
  it('チェックボックス全OFFで出力ボタンがdisabledになる', async () => {
    const user = userEvent.setup();
    render(<EstimateExportDialog {...defaultProps} />);

    // デフォルトでは「見積」がONなので出力ボタンは有効（出力形式もデフォルトExcelなので選択済み）
    const exportButton = screen.getByRole('button', { name: '出力' });
    expect(exportButton).not.toBeDisabled();

    // 「見積」のチェックを外す
    const checkboxes = screen.getAllByRole('checkbox');
    const estimateCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'ESTIMATE'
    )!;
    await user.click(estimateCheckbox);

    // 全てのチェックボックスがOFFになったので出力ボタンはdisabled
    expect(exportButton).toBeDisabled();
  });

  // ============================================================================
  // REQ-32.4: lineTypesクエリパラメータ（カンマ区切り）
  // ============================================================================

  /**
   * REQ-32.4: 単一行タイプ選択時のlineTypesパラメータ確認
   */
  it('単一行タイプ選択時にlineTypesクエリパラメータが正しく付加される', async () => {
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

    // デフォルト（見積+実行ON、出力形式Excel）で出力（REQ-38.1）
    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/estimates/est-001/export?format=xlsx&lineTypes=ESTIMATE,EXECUTION',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  /**
   * REQ-32.4: 複数行タイプ選択時にlineTypesパラメータがカンマ区切りで付加される
   */
  it('複数行タイプ選択時にlineTypesクエリパラメータがカンマ区切りで付加される', async () => {
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

    // REQ-38.1: デフォルトで見積+実行がON。業者もチェックする
    const checkboxes = screen.getAllByRole('checkbox');
    const vendorCheckbox = checkboxes.find((cb) => (cb as HTMLInputElement).value === 'VENDOR')!;
    await user.click(vendorCheckbox);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/estimates/est-001/export?format=xlsx&lineTypes=ESTIMATE,EXECUTION,VENDOR',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  // ============================================================================
  // REQ-32.3: 出力ファイル名に行タイプラベルを含める
  // ============================================================================

  /**
   * REQ-32.3: 出力ファイル名に選択された行タイプラベルが含まれる（単一）
   */
  it('出力ファイル名に選択された行タイプラベルが含まれる（単一）', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    let downloadFileName = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = vi.fn();
        Object.defineProperty(element, 'download', {
          set: (value: string) => {
            downloadFileName = value;
          },
          get: () => downloadFileName,
        });
      }
      return element;
    });

    render(<EstimateExportDialog {...defaultProps} />);

    // REQ-38.1: デフォルト（見積+実行ON、Excel）で出力
    // 見積のみにするため実行をOFF
    const checkboxes = screen.getAllByRole('checkbox');
    const executionCheckbox = checkboxes.find(
      (cb) => (cb as HTMLInputElement).value === 'EXECUTION'
    )!;
    await user.click(executionCheckbox);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(downloadFileName).toContain('_見積');
      expect(downloadFileName).toContain('.xlsx');
    });
  });

  /**
   * REQ-32.3: 出力ファイル名に複数行タイプラベルがアンダースコア区切りで含まれる
   */
  it('出力ファイル名に複数行タイプラベルがアンダースコア区切りで含まれる', async () => {
    const user = userEvent.setup();
    const mockBlob = new Blob(['test'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    let downloadFileName = '';
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = vi.fn();
        Object.defineProperty(element, 'download', {
          set: (value: string) => {
            downloadFileName = value;
          },
          get: () => downloadFileName,
        });
      }
      return element;
    });

    render(<EstimateExportDialog {...defaultProps} />);

    // REQ-38.1: デフォルトで見積+実行がON。そのまま出力
    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(downloadFileName).toContain('_見積_実行');
      expect(downloadFileName).toContain('.xlsx');
    });
  });

  // ============================================================================
  // REQ-10.1: PDF出力
  // ============================================================================

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

    // 出力形式をPDFに変更
    const pdfRadio = screen
      .getAllByRole('radio')
      .find((r) => (r as HTMLInputElement).value === 'pdf')!;
    await user.click(pdfRadio);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/estimates/est-001/export?format=pdf&lineTypes=ESTIMATE,EXECUTION',
        expect.objectContaining({ method: 'GET' })
      );
    });

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });
  });

  /**
   * REQ-10.2: Excel出力を実行できる（デフォルトで選択済み）
   */
  it('Excel出力を実行できる（デフォルト選択）', async () => {
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

    // デフォルトでExcelが選択済み（REQ-38.1: 見積+実行がデフォルトON）
    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/estimates/est-001/export?format=xlsx&lineTypes=ESTIMATE,EXECUTION',
        expect.objectContaining({ method: 'GET' })
      );
    });

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // REQ-10.8: 出力処理中表示
  // ============================================================================

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

    // デフォルトでExcelが選択済みなので、そのまま出力
    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText(/出力中/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /出力中/i })).toBeDisabled();
  });

  // ============================================================================
  // エラーハンドリング
  // ============================================================================

  /**
   * 出力エラー時はエラーメッセージを表示する
   */
  it('出力エラー時はエラーメッセージを表示する', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('出力に失敗しました'));

    render(<EstimateExportDialog {...defaultProps} />);

    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/見積書の出力に失敗しました/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // キャンセルと成功
  // ============================================================================

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
   * 出力成功後にダイアログを閉じる
   */
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

    render(<EstimateExportDialog {...defaultProps} />);

    // デフォルトでExcelが選択済み
    const exportButton = screen.getByRole('button', { name: '出力' });
    await user.click(exportButton);

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 出力形式選択（既存テスト更新）
  // ============================================================================

  /**
   * 出力形式選択オプションを表示する
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

    // デフォルトで選択済みだが、改めてクリック
    await user.click(excelRadio);

    expect(excelRadio).toBeChecked();
  });
});
