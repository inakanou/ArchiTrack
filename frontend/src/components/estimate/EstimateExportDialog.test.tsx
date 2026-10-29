/**
 * @fileoverview EstimateExportDialog の単体テスト（Task 56.9）
 *
 * 帳票の生成はフロントエンドで完結する（56.6 / 56.7）。本ダイアログの責務は
 * **編集中のツリーをそのまま出力サービスへ渡すこと**と、選択・既定値・エラー表示である。
 *
 * Requirements (estimate-creation):
 * - 10.9: 出力形式のデフォルトをExcel（.xlsx）とする
 * - 10.10: 出力ダイアログでチェックされた行タイプを出力対象とする
 * - 32.1: 「見積」「実行」「業者」をチェックボックスで複数選択可能とする
 * - 32.7: チェックボックスのデフォルト値を Requirement 38 AC1 に従って設定する
 * - 32.8: いずれもチェックされていない場合、出力ボタンを無効化する
 * - 38.1: デフォルト値として「見積」と「実行」をONとする
 * - 56.1: 未保存の変更がある状態でも帳票を出力可能とする
 * - 56.2: 編集中の内容を反映した帳票を生成する
 * - 56.3: 保存操作を伴わせず、未保存の変更を保持する
 * - 56.4: 未保存の変更がある間、帳票が未保存の内容を含むことを画面上で示す
 * - 10.7: 出力処理中であることを表示する
 * - 10.8: 日本語描画の準備に失敗した場合は中断してエラーメッセージを表示する
 *
 * タスク62.2: 生成の前の出力の記録と、記録の失敗での中止（describe「出力の記録」）
 * - @requirement estimate-creation/REQ-57.7
 * - @requirement estimate-creation/REQ-57.8
 *
 * 「未保存の編集が帳票に載る」の一気通貫（画面の編集 → 出力）は
 * `pages/EstimateDetailPage.export.test.tsx` が実物のページで検証する。
 *
 * @module components/estimate/EstimateExportDialog.test
 */

import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { EstimateExportDialog } from './EstimateExportDialog';
// 観測窓の裏取り用。**モックしない実物**を通して `fetch` の記録に現れることを確かめる。
import { getCompanyInfo } from '../../api/company-info';
import { ApiError, apiClient } from '../../api/client';
import type {
  EditableItem,
  EstimateReportFields,
} from '../../domain/estimate/estimateEditReducer.types';
import type { EstimatePdfExportInput } from '../../services/export/EstimatePdfExportService';

// ============================================================================
// モック
// ============================================================================

/**
 * 帳票（PDF）サービスは**動的読み込み口ごと**差し替える。
 *
 * 実体を読むとフォント資産（約2.25MB）まで読み込むため。読み込み口を経由していることは
 * `services/export/loadEstimatePdfExportService.test.ts` が静的 import グラフで機械検査する。
 */
const pdfGenerateAndDownload =
  vi.fn<(input: EstimatePdfExportInput) => Promise<readonly unknown[]>>();
vi.mock('../../services/export/loadEstimatePdfExportService', () => ({
  loadEstimatePdfExportService: async () => ({
    generate: vi.fn(),
    downloadFiles: vi.fn(),
    generateAndDownload: pdfGenerateAndDownload,
  }),
}));

/** 表紙の周辺情報の取得（読み取りのみ）。実 API を叩かないよう差し替える */
const loadSubject = vi.fn();
vi.mock('../../services/export/estimateReportSubject', () => ({
  loadEstimateReportSubject: (projectId: string) => loadSubject(projectId),
}));

const SUBJECT = {
  project: { name: '本社ビル改修工事', siteAddress: '東京都千代田区1-1' },
  customer: { name: '株式会社サンプル', representativeName: '山田太郎' },
  company: {
    companyName: '株式会社アークン',
    representative: '中野一郎',
    address: '大阪府大阪市1-1',
    phone: '06-0000-0000',
    fax: '06-0000-0001',
  },
};

// ============================================================================
// フィクスチャ
// ============================================================================

const line = (lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR', name: string, amount: string) => ({
  id: null,
  lineType,
  name,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: amount,
  amount,
  remarks: null,
  sourceVendorName: null,
});

/** 3行タイプすべてに値を持つ1件のツリー */
const treeNamed = (name: string): readonly EditableItem[] => [
  {
    id: 'item-1',
    tempId: null,
    itemType: 'STANDARD',
    lines: [
      line('ESTIMATE', name, '100000'),
      line('EXECUTION', name, '80000'),
      line('VENDOR', name, '70000'),
    ],
    children: [],
  },
];

const REPORT_FIELDS: EstimateReportFields = {
  submissionDate: '2026-08-03',
  validityPeriod: '提出日より1ヶ月間',
  separateWorks: ['電気設備工事'],
};

const baseProps = {
  isOpen: true,
  estimateName: 'テスト見積書',
  estimateId: 'est-1',
  projectId: 'proj-1',
  items: treeNamed('内装工事'),
  reportFields: REPORT_FIELDS,
  hasUnsavedChanges: false,
  onClose: vi.fn(),
};

const renderDialog = (overrides: Partial<typeof baseProps> = {}) =>
  render(<EstimateExportDialog {...baseProps} onClose={vi.fn()} {...overrides} />);

// ============================================================================
// 出力の観測
// ============================================================================

/** ダウンロードされたファイル名と Blob（実物の表計算サービスが作ったもの） */
const downloaded: { fileName: string; blob: Blob }[] = [];
let nextBlob: Blob | null = null;

/**
 * 表計算ファイルの全セル値を連結した文字列（表題・見出し・明細・合計をすべて含む）
 *
 * 名称欄は階層記号を前置した文字列になる（53.1 / `Ⅰ．内装工事`）ため、
 * 完全一致ではなく包含で判定する。
 */
const sheetTextOf = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  return Object.entries(sheet)
    .filter(([key]) => !key.startsWith('!'))
    .map(([, cell]) => String((cell as XLSX.CellObject).v ?? ''))
    .join('\u0000');
};

beforeEach(() => {
  vi.clearAllMocks();
  downloaded.length = 0;
  nextBlob = null;
  pdfGenerateAndDownload.mockResolvedValue([]);
  loadSubject.mockResolvedValue(SUBJECT);
  // 出力の記録（POST /api/v1/audit-logs/exports）は既定で成功させる（57.7）
  vi.spyOn(apiClient, 'post').mockResolvedValue({ recordId: 'record-1' });

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      nextBlob = blob;
      return 'blob:mock';
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloaded.push({ fileName: this.download, blob: nextBlob! });
  });
});

afterEach(() => {
  // 56.3 のテストは途中で記録の差し替えを外す（実物の通信を観測窓に載せる）
  if (vi.isMockFunction(apiClient.post)) vi.mocked(apiClient.post).mockRestore();
});

const exportButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /^出力/ }) as HTMLButtonElement;

const checkbox = (value: 'ESTIMATE' | 'EXECUTION' | 'VENDOR'): HTMLInputElement =>
  document.querySelector(`input[type="checkbox"][value="${value}"]`) as HTMLInputElement;

const formatRadio = (value: 'pdf' | 'xlsx'): HTMLInputElement =>
  document.querySelector(
    `input[type="radio"][name="export-format"][value="${value}"]`
  ) as HTMLInputElement;

// ============================================================================
// 表示
// ============================================================================

describe('EstimateExportDialog - 表示', () => {
  it('isOpen=false の場合は何も表示しない', () => {
    const { container } = renderDialog({ isOpen: false });

    expect(container.innerHTML).toBe('');
  });

  it('出力対象を3つのチェックボックスで複数選択できる（32.1）', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(checkbox('ESTIMATE')).toBeInTheDocument();
    expect(checkbox('EXECUTION')).toBeInTheDocument();
    expect(checkbox('VENDOR')).toBeInTheDocument();

    await user.click(checkbox('VENDOR'));

    // 3つ同時に選択できる（ラジオボタンなら排他になる）
    expect(checkbox('ESTIMATE').checked).toBe(true);
    expect(checkbox('EXECUTION').checked).toBe(true);
    expect(checkbox('VENDOR').checked).toBe(true);
  });
});

// ============================================================================
// 既定値（38.1, 32.7, 10.9, 32.8）
// ============================================================================

describe('EstimateExportDialog - 既定値', () => {
  it('行タイプの既定は「見積」と「実行」の2つで「業者」はOFF（38.1 / 32.7）', () => {
    renderDialog();

    expect(checkbox('ESTIMATE').checked).toBe(true);
    expect(checkbox('EXECUTION').checked).toBe(true);
    expect(checkbox('VENDOR').checked).toBe(false);
  });

  it('出力形式の既定は表計算形式（10.9 / 32.8）', () => {
    renderDialog();

    expect(formatRadio('xlsx').checked).toBe(true);
    expect(formatRadio('pdf').checked).toBe(false);
  });

  it('既定のまま出力すると「見積」「実行」の2ファイルを表計算形式でこの順に生成する', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(exportButton());

    await waitFor(() => {
      expect(downloaded.map((file) => file.fileName)).toEqual([
        'テスト見積書_見積.xlsx',
        'テスト見積書_実行.xlsx',
      ]);
    });
  });
});

// ============================================================================
// 出力ボタンの閾値（32.8）
// ============================================================================

describe('EstimateExportDialog - 出力ボタンの活性', () => {
  it('行タイプが1つでも選択されていれば有効', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(checkbox('EXECUTION'));

    // 「見積」だけが残った状態＝閾値のちょうど上
    expect(checkbox('ESTIMATE').checked).toBe(true);
    expect(checkbox('EXECUTION').checked).toBe(false);
    expect(checkbox('VENDOR').checked).toBe(false);
    expect(exportButton()).toBeEnabled();
  });

  it('いずれも選択されていない場合は無効になり、押しても出力しない（32.8）', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(checkbox('ESTIMATE'));
    await user.click(checkbox('EXECUTION'));

    expect(checkbox('ESTIMATE').checked).toBe(false);
    expect(checkbox('EXECUTION').checked).toBe(false);
    expect(checkbox('VENDOR').checked).toBe(false);
    expect(exportButton()).toBeDisabled();

    await user.click(exportButton());

    expect(downloaded).toEqual([]);
  });

  it('外した行タイプを選び直すと再び有効になる', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(checkbox('ESTIMATE'));
    await user.click(checkbox('EXECUTION'));
    expect(exportButton()).toBeDisabled();

    await user.click(checkbox('VENDOR'));

    expect(exportButton()).toBeEnabled();
  });
});

// ============================================================================
// 未保存の変更（56.1, 56.2, 56.4）
// ============================================================================

describe('EstimateExportDialog - 未保存の変更', () => {
  it('未保存の変更がある場合は帳票が未保存の内容を含むことを示す（56.4）', () => {
    renderDialog({ hasUnsavedChanges: true });

    const notice = screen.getByTestId('estimate-export-unsaved-notice');
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).toContain('未保存');
  });

  it('未保存の変更がない場合は示さない', () => {
    renderDialog({ hasUnsavedChanges: false });

    expect(screen.queryByTestId('estimate-export-unsaved-notice')).not.toBeInTheDocument();
  });

  it('未保存の変更がある状態でも出力ボタンは有効（56.1）', () => {
    renderDialog({ hasUnsavedChanges: true });

    expect(exportButton()).toBeEnabled();
  });

  it('渡された編集中のツリーの内容が生成された表計算ファイルに載る（56.2）', async () => {
    const user = userEvent.setup();
    renderDialog({ items: treeNamed('未保存の内装工事'), hasUnsavedChanges: true });

    await user.click(exportButton());
    await waitFor(() => expect(downloaded.length).toBeGreaterThan(0));

    const text = await sheetTextOf(downloaded[0]!.blob);
    expect(text).toContain('未保存の内装工事');
    // 渡していない名称は載らない＝上の包含判定が名称に反応していることの裏取り
    expect(text).not.toContain('保存済みの内装工事');
  });
});

// ============================================================================
// 帳票（PDF）出力
// ============================================================================

describe('EstimateExportDialog - 帳票（PDF）出力', () => {
  it('動的読み込み口から取得したサービスへ編集中のツリーと帳票用入力項目を渡す', async () => {
    const user = userEvent.setup();
    const items = treeNamed('未保存の内装工事');
    renderDialog({ items, hasUnsavedChanges: true });

    await user.click(formatRadio('pdf'));
    await user.click(exportButton());

    await waitFor(() => expect(pdfGenerateAndDownload).toHaveBeenCalledTimes(1));
    const input = pdfGenerateAndDownload.mock.calls[0]![0];
    expect(input.tree).toBe(items);
    expect(input.lineTypes).toEqual(['ESTIMATE', 'EXECUTION']);
    expect(input.estimate).toEqual({ name: 'テスト見積書', reportFields: REPORT_FIELDS });
    expect(input.project).toEqual(SUBJECT.project);
    expect(input.customer).toEqual(SUBJECT.customer);
    expect(input.company).toEqual(SUBJECT.company);
    expect(loadSubject).toHaveBeenCalledWith('proj-1');
  });

  it('出力サービスの日本語エラーメッセージをそのまま表示する（10.8）', async () => {
    const user = userEvent.setup();
    pdfGenerateAndDownload.mockRejectedValue(
      new Error(
        '日本語フォントの登録に失敗したため、帳票の出力を中断しました。文字が正しく表示されないファイルは作成されません。'
      )
    );
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(formatRadio('pdf'));
    await user.click(exportButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('日本語フォントの登録に失敗したため');
    // 失敗した以上ダイアログは開いたままで、選択をやり直せる
    expect(onClose).not.toHaveBeenCalled();
    expect(exportButton()).toBeEnabled();
  });

  it('出力処理中であることと出力サービスの進捗を表示する（10.7）', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    pdfGenerateAndDownload.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          input.onProgress?.({
            phase: 'generating',
            current: 0,
            total: 2,
            percent: 0,
            message: '見積の帳票を生成中... (1/2)',
          });
          release = () => resolve([]);
        })
    );
    renderDialog();

    await user.click(formatRadio('pdf'));
    await user.click(exportButton());

    await waitFor(() => expect(exportButton().textContent).toContain('出力中'));
    expect(exportButton()).toBeDisabled();
    // 進捗はサービスが報告した文言をそのまま出す（画面側で作文しない）
    expect(screen.getByTestId('estimate-export-progress').textContent).toBe(
      '見積の帳票を生成中... (1/2)'
    );

    release();
    // 完了後は進捗表示を残さない
    await waitFor(() =>
      expect(screen.queryByTestId('estimate-export-progress')).not.toBeInTheDocument()
    );
  });
});

// ============================================================================
// 出力に保存を伴わせない（56.3）
// ============================================================================

describe('EstimateExportDialog - 保存を伴わない', () => {
  /**
   * 「通信が0件」は否定の主張なので、**観測窓が通信を本当に捉えられること**を
   * 同じテスト内で示さなければ空振りになる（窓が閉じていても 0 件になる）。
   * そのため窓は開いたままにし、出力の後に実物の API 関数を1本通して
   * 同じ記録に現れることまで確かめる（53.14 → 54.11 / 55.9 で確立した手順）。
   */
  /*
   * タスク62.2 で主張を改めた: 改訂前は「API を1本も呼ばない」だった。出力の記録（57.7）が
   * 生成の前に記録の要求を1本伴うようになったため、出力に伴う通信が**出力の記録の1本だけ**で
   * 保存の要求を含まないことを主張する（56.3 の「保存操作を伴わせない」は変わらない）。
   */
  it('表計算出力は出力の記録の1本のほかに API を呼ばない（56.3）', async () => {
    const user = userEvent.setup();
    // 記録の要求も実物の通信を通し、同じ観測窓に載せる
    vi.mocked(apiClient.post).mockRestore();
    const requestLog: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requestLog.push(`${init?.method ?? 'GET'} ${url}`);
        return Promise.resolve({
          ok: true,
          status: url.includes('/api/v1/audit-logs/exports') ? 201 : 200,
          headers: { get: () => 'application/json' },
          json: async () =>
            url.includes('/api/v1/audit-logs/exports')
              ? { recordId: 'record-1' }
              : { success: true, data: {} },
          text: async () => '',
        } as unknown as Response);
      })
    );

    try {
      renderDialog({ hasUnsavedChanges: true });

      await user.click(exportButton());
      await waitFor(() => expect(downloaded.length).toBe(2));

      // 観測窓は開いたまま。出力に伴う通信は出力の記録の1本だけ（保存の要求は無い）。
      expect(requestLog).toHaveLength(1);
      expect(requestLog[0]).toMatch(/^POST .*\/api\/v1\/audit-logs\/exports$/);

      // --- 窓が通信を捉えられることの裏取り --------------------------------
      // 同じ窓に実物の API 呼び出しが記録される＝上の件数は
      // 「窓が通信を見られなかったから少なかった」のではない。
      await getCompanyInfo();
      expect(requestLog).toHaveLength(2);
      expect(requestLog[1]).toContain('/api/company-info');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ============================================================================
// 閉じる
// ============================================================================

describe('EstimateExportDialog - 閉じる', () => {
  it('キャンセルで閉じる', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('出力に成功したら閉じる', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(exportButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

// ============================================================================
// 出力の記録（57.7, 57.8。タスク62.2。user-authentication の要件40.9〜40.11）
// ============================================================================

describe('EstimateExportDialog - 出力の記録', () => {
  /** 表示の文言の完全一致（余計な文言が付け足されていないこと） */
  const RECORD_FAILED_EXACT = /^出力を記録できなかったため中止しました$/;

  /** 親1件・子2件（見積項目は3件）のツリー */
  const nestedTree: readonly EditableItem[] = [
    {
      ...treeNamed('内装工事')[0]!,
      children: [
        { ...treeNamed('床仕上げ')[0]!, id: 'item-2' },
        { ...treeNamed('壁仕上げ')[0]!, id: 'item-3' },
      ],
    },
  ];

  /** 記録の要求を保留にし、解決の関数を返す */
  function holdRecord() {
    const holder: { resolve: (value: { recordId: string }) => void } = { resolve: () => {} };
    vi.mocked(apiClient.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          holder.resolve = resolve as (value: { recordId: string }) => void;
        })
    );
    return holder;
  }

  /** 記録の解決の後の非同期の続きを流し切る */
  async function flushAsync() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('Excel の出力は生成の前に、種別・案件・見積書・見積項目の件数を添えた記録を1回要求する', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ items: nestedTree, onClose });

    await user.click(exportButton());

    await waitFor(() => expect(downloaded).toHaveLength(2));
    const postSpy = vi.mocked(apiClient.post);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/audit-logs/exports',
      {
        kind: 'estimate_xlsx',
        projectId: 'proj-1',
        targetIds: ['est-1'],
        itemCount: 3,
      },
      { disableRetry: true }
    );
    // 記録の要求がファイルの生成（Blob の URL 化）より先に行われている
    expect(postSpy.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(URL.createObjectURL).mock.invocationCallOrder[0]!
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('PDF の出力は表紙の周辺情報の読み込みと生成の前に、種別 estimate_pdf の記録を1回要求する', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(formatRadio('pdf'));
    await user.click(exportButton());

    await waitFor(() => expect(pdfGenerateAndDownload).toHaveBeenCalledTimes(1));
    const postSpy = vi.mocked(apiClient.post);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/audit-logs/exports',
      {
        kind: 'estimate_pdf',
        projectId: 'proj-1',
        targetIds: ['est-1'],
        itemCount: 1,
      },
      { disableRetry: true }
    );
    expect(postSpy.mock.invocationCallOrder[0]).toBeLessThan(
      loadSubject.mock.invocationCallOrder[0]!
    );
    expect(postSpy.mock.invocationCallOrder[0]).toBeLessThan(
      pdfGenerateAndDownload.mock.invocationCallOrder[0]!
    );
  });

  it('未保存の変更がある状態の出力も同じ記録を経る（Requirement 56）', async () => {
    const user = userEvent.setup();
    renderDialog({ hasUnsavedChanges: true });

    await user.click(exportButton());

    await waitFor(() => expect(downloaded).toHaveLength(2));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/audit-logs/exports',
      expect.objectContaining({ kind: 'estimate_xlsx', targetIds: ['est-1'] }),
      { disableRetry: true }
    );
  });

  it.each([
    ['Excel', 'xlsx'],
    ['PDF', 'pdf'],
  ] as const)(
    '%s: 記録の要求が失敗すると生成もダウンロードもせず、エラーメッセージを表示してダイアログを閉じない',
    async (_label, format) => {
      const user = userEvent.setup();
      vi.mocked(apiClient.post).mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      const onClose = vi.fn();
      renderDialog({ onClose, hasUnsavedChanges: true });

      await user.click(formatRadio(format));
      await user.click(exportButton());

      expect(within(await screen.findByRole('alert')).getByText(RECORD_FAILED_EXACT)).toBeVisible();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(loadSubject).not.toHaveBeenCalled();
      expect(pdfGenerateAndDownload).not.toHaveBeenCalled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(downloaded).toEqual([]);
      expect(onClose).not.toHaveBeenCalled();
      // 出力中の表示は解かれ、出力し直せる。未保存の告知も残る（56.3）
      expect(exportButton()).toBeEnabled();
      expect(exportButton().textContent).toBe('出力');
      expect(screen.getByTestId('estimate-export-unsaved-notice')).toBeInTheDocument();
    }
  );

  it('記録の応答に記録の ID が無いときも生成しない', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({});
    renderDialog();

    await user.click(exportButton());

    expect(within(await screen.findByRole('alert')).getByText(RECORD_FAILED_EXACT)).toBeVisible();
    expect(downloaded).toEqual([]);
  });

  it('記録の後の生成の失敗（10.8）は従来の文言を表示し、記録は再送しない', async () => {
    const user = userEvent.setup();
    pdfGenerateAndDownload.mockRejectedValue(
      new Error('日本語フォントの登録に失敗したため、帳票の出力を中断しました。')
    );
    renderDialog();

    await user.click(formatRadio('pdf'));
    await user.click(exportButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      '日本語フォントの登録に失敗したため、帳票の出力を中断しました。'
    );
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('記録の要求中は出力とキャンセルを止め、押し直しても記録は1回で、記録の成功の後に生成する', async () => {
    const record = holdRecord();
    const onClose = vi.fn();
    renderDialog({ onClose });

    act(() => {
      exportButton().click();
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    expect(exportButton()).toBeDisabled();
    expect(exportButton().textContent).toContain('出力中');
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    act(() => {
      exportButton().click();
      screen.getByRole('button', { name: 'キャンセル' }).click();
    });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);

    await act(async () => {
      record.resolve({ recordId: 'record-1' });
    });

    await waitFor(() => expect(downloaded).toHaveLength(2));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('記録の要求中にダイアログが閉じられたら、記録の成功の後も生成もダウンロードもしない', async () => {
    const user = userEvent.setup();
    const record = holdRecord();
    const onClose = vi.fn();
    const { rerender } = render(<EstimateExportDialog {...baseProps} onClose={onClose} />);

    await user.click(formatRadio('pdf'));
    act(() => {
      exportButton().click();
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    rerender(<EstimateExportDialog {...baseProps} isOpen={false} onClose={onClose} />);
    await act(async () => {
      record.resolve({ recordId: 'record-1' });
    });
    await flushAsync();

    expect(loadSubject).not.toHaveBeenCalled();
    expect(pdfGenerateAndDownload).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('記録の要求中に画面が破棄されたら、記録の成功の後も生成もダウンロードもしない', async () => {
    const record = holdRecord();
    const { unmount } = renderDialog();

    act(() => {
      exportButton().click();
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      record.resolve({ recordId: 'record-1' });
    });
    await flushAsync();

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);
  });

  it('StrictMode の二重の effect の後も、記録の成功の後に生成する', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <EstimateExportDialog {...baseProps} onClose={vi.fn()} />
      </StrictMode>
    );

    await user.click(exportButton());

    await waitFor(() => expect(downloaded).toHaveLength(2));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
