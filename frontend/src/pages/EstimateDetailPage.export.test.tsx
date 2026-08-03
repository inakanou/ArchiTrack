/**
 * @fileoverview EstimateDetailPage の帳票出力の統合テスト（実物のダイアログで検証）
 *
 * Task 56.9: 出力ダイアログの改修と未保存プレビュー
 *
 * `EstimateDetailPage.test.tsx` は `../components/estimate/EstimateExportDialog` を
 * 差し替えて描画するため、ページ → ダイアログの props が死んでいても全テストが緑になる
 * （53.14 / 54.2 / 56.8 で繰り返し死角になった構造）。本ファイルは出力ダイアログを
 * **実物のまま**描画し、明細テーブルの編集が実際に生成されるファイルへ届くことを固定する。
 *
 * Requirements (estimate-creation):
 * - 10.9: 出力形式のデフォルトをExcel（.xlsx）とする
 * - 10.10: チェックされた行タイプ（見積・実行・業者）を出力対象とする
 * - 32.1: 出力対象をチェックボックスで複数選択可能とする
 * - 32.7 / 38.1: チェックボックスのデフォルトは「見積」と「実行」
 * - 32.8: いずれもチェックされていない場合は出力ボタンを無効化する
 * - 56.1: 未保存の変更がある状態でも帳票を出力可能とする
 * - 56.2: 編集中の内容を反映した帳票を生成する
 * - 56.3: 保存操作を伴わせず、未保存の変更を保持する
 * - 56.4: 未保存の変更がある間、帳票が未保存の内容を含むことを画面上で示す
 *
 * @module pages/EstimateDetailPage.export
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as XLSX from 'xlsx';
import EstimateDetailPage from './EstimateDetailPage';
import * as estimatesApi from '../api/estimates';

vi.mock('../api/estimates');

/**
 * 帳票（PDF）サービスは**動的読み込み口ごと**差し替える（実体はフォント資産 約2.25MB を読む）。
 *
 * 差し替えるのは読み込み口だけで、**出力ダイアログと帳票用入力項目パネルは実物のまま**なので、
 * ページ → ダイアログの props が死んでいれば以下のテストは落ちる。
 * 読み込み口を経由していること自体は
 * `services/export/loadEstimatePdfExportService.test.ts` が静的 import グラフで検査する。
 */
const pdfGenerateAndDownload = vi.fn();
vi.mock('../services/export/loadEstimatePdfExportService', () => ({
  loadEstimatePdfExportService: async () => ({
    generate: vi.fn(),
    downloadFiles: vi.fn(),
    generateAndDownload: pdfGenerateAndDownload,
  }),
}));

/** 表紙の周辺情報（読み取りのみ）。実 API を叩かせない */
vi.mock('../services/export/estimateReportSubject', () => ({
  loadEstimateReportSubject: async () => ({
    project: { name: '本社ビル改修工事', siteAddress: '東京都千代田区1-1' },
    customer: { name: '株式会社サンプル', representativeName: '山田太郎' },
    company: {
      companyName: '株式会社アークン',
      representative: '中野一郎',
      address: '大阪府大阪市1-1',
      phone: '06-0000-0000',
      fax: '06-0000-0001',
    },
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: 'unblocked' as const, proceed: vi.fn(), reset: vi.fn() }),
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const SAVED_NAME = '保存済みの内装工事';
const EDITED_NAME = '未保存の内装工事';
/** 行タイプごとに別ファイルへ分かれる（32.2）ことまで見るため、実行金額行は別の名称にする */
const EDITED_EXECUTION_NAME = '未保存の実行側内装工事';
/** 帳票用入力項目（54.x / 56.8）。保存済みの値と未保存の編集を区別できる文言にする */
const SAVED_SUBMISSION_DATE = '2026-08-01';
const SAVED_VALIDITY_PERIOD = '提出日より1ヶ月間';
const EDITED_VALIDITY_PERIOD = '未保存の有効期限（提出日より3ヶ月間）';

const buildLine = (
  itemId: string,
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR',
  name: string
) => ({
  id: `${itemId}-${lineType}`,
  estimateItemId: itemId,
  lineType,
  name,
  specification: null,
  unit: '式',
  quantity: '1',
  unitPrice: '100000',
  amount: '100000',
  remarks: null,
  sourceReceivedQuotationLineItemId: null,
  sourceVendorName: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
});

const buildItem = (name: string) => ({
  id: 'item-a',
  estimateId: 'est-001',
  parentId: null,
  displayOrder: 0,
  itemType: 'STANDARD',
  lines: [
    buildLine('item-a', 'ESTIMATE', name),
    buildLine('item-a', 'EXECUTION', name),
    buildLine('item-a', 'VENDOR', name),
  ],
  children: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
});

const detail = {
  id: 'est-001',
  projectId: 'proj-001',
  name: 'テスト見積書',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  items: [buildItem(SAVED_NAME)],
  totalAmount: '100000',
  // 56.8 の申し送り: フィクスチャを全 null にすると「渡していない」と
  // 「空を渡した」が区別できず、死んだ prop が生き残る。非 null で立てる。
  reportFields: {
    submissionDate: SAVED_SUBMISSION_DATE,
    validityPeriod: SAVED_VALIDITY_PERIOD,
    separateWorks: ['電気設備工事'],
  },
} as unknown as estimatesApi.EstimateDetail;

// ============================================================================
// 観測窓
//
// 56.3（保存を伴わない）は「書き込みが0件」という否定の主張なので、
// **観測窓が書き込みを本当に捉えられること**を同じテスト内で示す必要がある。
// そのため API モジュールの全関数を記録する実装で置き換え、出力の後に保存を
// 実行して同じ記録に `saveEstimateDraft` が現れることまで確かめる。
// ============================================================================

/** 呼ばれた API 関数名を発生順に記録する */
const requestLog: string[] = [];

/** 記録を挟む前の既定の振る舞い（記録対象外の関数は `undefined` を返す） */
const defaultImplementations: Record<string, (...args: never[]) => unknown> = {
  getEstimateDetail: () => Promise.resolve(detail),
  getEstimateItems: () => Promise.resolve(detail.items),
  saveEstimateDraft: () =>
    Promise.resolve({
      ...detail,
      updatedAt: '2026-09-01T00:00:00.000Z',
    } as unknown as estimatesApi.SaveEstimateDraftResponse),
};

/** API モジュールの**全関数**を記録付きに差し替える（将来増えた関数も自動的に対象になる） */
const installRequestRecorder = (): void => {
  for (const [name, value] of Object.entries(estimatesApi)) {
    if (!vi.isMockFunction(value)) {
      continue;
    }
    const fallback = defaultImplementations[name];
    value.mockImplementation((...args: never[]) => {
      requestLog.push(name);
      return fallback === undefined ? undefined : fallback(...args);
    });
  }
};

// ============================================================================
// 生成物の観測
// ============================================================================

const downloaded: { fileName: string; blob: Blob }[] = [];
let nextBlob: Blob | null = null;

/** 生成された表計算ファイルの全セル値を連結した文字列 */
const sheetTextOf = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  return Object.entries(sheet)
    .filter(([key]) => !key.startsWith('!'))
    .map(([, cell]) => String((cell as XLSX.CellObject).v ?? ''))
    .join(' ');
};

beforeEach(() => {
  vi.clearAllMocks();
  requestLog.length = 0;
  downloaded.length = 0;
  nextBlob = null;
  installRequestRecorder();

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

// ============================================================================
// ヘルパー
// ============================================================================

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estimates/est-001']}>
      <Routes>
        <Route path="/estimates/:id" element={<EstimateDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

const waitForRow = async (): Promise<HTMLElement> =>
  await screen.findByTestId('estimate-item-item-a');

/** 指定した行タイプの名称欄（明細テーブルの実物） */
const nameInputOf = async (
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR'
): Promise<HTMLInputElement> => {
  const row = await waitForRow();
  const line = within(row).getByTestId(`line-type-${lineType}`);
  return within(line).getByLabelText('名称') as HTMLInputElement;
};

const openExportDialog = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(screen.getByRole('button', { name: '出力' }));
  return await screen.findByRole('dialog');
};

/**
 * 保存ボタン。
 *
 * 明細の名称も `button` として描画されるため、`/^保存/` のような前方一致だと
 * フィクスチャの「保存済みの内装工事」と衝突する。完全一致で取る。
 */
const saveButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;

// ============================================================================
// テスト
// ============================================================================

describe('EstimateDetailPage - 帳票出力', () => {
  it('未保存の編集を含む帳票を生成し、保存を伴わず未保存のまま残す（56.1〜56.4）', async () => {
    const user = userEvent.setup();
    renderPage();

    // --- 未保存の編集を作る -------------------------------------------------
    const estimateName = await nameInputOf('ESTIMATE');
    await user.clear(estimateName);
    await user.type(estimateName, EDITED_NAME);
    const executionName = await nameInputOf('EXECUTION');
    await user.clear(executionName);
    await user.type(executionName, EDITED_EXECUTION_NAME);
    expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();

    // --- 出力ダイアログ ----------------------------------------------------
    const dialog = await openExportDialog(user);
    // 56.4: 出力される帳票が未保存の内容を含むことを画面上で示す
    expect(within(dialog).getByTestId('estimate-export-unsaved-notice')).toBeInTheDocument();

    // 観測窓をここで開く。以降 `requestLog` に積まれたものが「出力に伴う通信」。
    requestLog.length = 0;

    await user.click(within(dialog).getByRole('button', { name: '出力' }));

    // --- 生成物 ------------------------------------------------------------
    // 10.9 / 32.7 / 38.1: 既定は表計算形式・「見積」＋「実行」の2ファイル
    await waitFor(() => {
      expect(downloaded.map((file) => file.fileName)).toEqual([
        'テスト見積書_見積.xlsx',
        'テスト見積書_実行.xlsx',
      ]);
    });

    // 56.2: サーバーが返した名称ではなく、画面で編集した名称が載る。
    // 32.2: 行タイプごとに独立したファイルなので、見積側の編集が実行側へ混ざらない。
    const estimateSheet = await sheetTextOf(downloaded[0]!.blob);
    expect(estimateSheet).toContain(EDITED_NAME);
    expect(estimateSheet).not.toContain(SAVED_NAME);
    expect(estimateSheet).not.toContain(EDITED_EXECUTION_NAME);
    const executionSheet = await sheetTextOf(downloaded[1]!.blob);
    expect(executionSheet).toContain(EDITED_EXECUTION_NAME);
    expect(executionSheet).not.toContain(SAVED_NAME);

    // --- 56.3: 出力は通信を1本も伴わない -----------------------------------
    // 観測窓は開いたまま。ここで閉じると 0 件の主張が空振りになる。
    expect(requestLog).toEqual([]);

    // 未保存の変更はそのまま残る（保存ボタンも押せるまま）
    expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    // --- 観測窓が書き込みを捉えられることの裏取り --------------------------
    // 同じ `requestLog` に保存が現れる＝上の `toEqual([])` は
    // 「窓が閉じていたから空だった」のではない。
    await user.click(saveButton());
    await waitFor(() => {
      expect(requestLog).toEqual(['saveEstimateDraft']);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();
    });
  });

  it('未保存の変更がない場合は未保存の告知を出さない（56.4 の対辺）', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRow();

    expect(screen.queryByTestId('estimate-unsaved-indicator')).not.toBeInTheDocument();

    const dialog = await openExportDialog(user);

    expect(within(dialog).queryByTestId('estimate-export-unsaved-notice')).not.toBeInTheDocument();
  });

  it('保存済みの内容だけを開いた状態では保存済みの名称が帳票に載る（56.2 の対辺）', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRow();

    const dialog = await openExportDialog(user);
    await user.click(within(dialog).getByRole('button', { name: '出力' }));

    await waitFor(() => expect(downloaded.length).toBe(2));
    const estimateSheet = await sheetTextOf(downloaded[0]!.blob);
    expect(estimateSheet).toContain(SAVED_NAME);
    expect(estimateSheet).not.toContain(EDITED_NAME);
  });

  /**
   * 帳票（PDF）だけが `reportFields` を消費する（表計算の表紙は表題とページ番号のみ / 56.7）。
   * 表計算経路のテストだけでは `reportFields` の prop が死んでいても検知できないため、
   * **PDF を選んだうえで帳票用入力項目パネルを実際に編集し**、その値が出力サービスへ
   * 届くことを固定する。
   */
  it('帳票用入力項目の未保存の編集が帳票（PDF）へ届く（56.2 / 54.x）', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRow();

    // 保存済みの値がパネルに載っている（＝サーバー値が編集状態へ入っている）
    const validityPeriod = screen.getByTestId('report-validity-period') as HTMLInputElement;
    expect(validityPeriod.value).toBe(SAVED_VALIDITY_PERIOD);

    // 未保存の編集を作る
    await user.clear(validityPeriod);
    await user.type(validityPeriod, EDITED_VALIDITY_PERIOD);
    expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();

    const dialog = await openExportDialog(user);
    requestLog.length = 0;

    await user.click(
      dialog.querySelector(
        'input[type="radio"][name="export-format"][value="pdf"]'
      ) as HTMLInputElement
    );
    await user.click(within(dialog).getByRole('button', { name: '出力' }));

    await waitFor(() => expect(pdfGenerateAndDownload).toHaveBeenCalledTimes(1));
    const input = pdfGenerateAndDownload.mock.calls[0]![0] as {
      estimate: { name: string; reportFields: { validityPeriod: string; submissionDate: string } };
      lineTypes: readonly string[];
    };

    // 編集中の値が届く（サーバーが返した値ではない）
    expect(input.estimate.reportFields.validityPeriod).toBe(EDITED_VALIDITY_PERIOD);
    // 編集していない項目は保存済みの値のまま届く（＝空の器を渡していない）
    expect(input.estimate.reportFields.submissionDate).toBe(SAVED_SUBMISSION_DATE);
    expect(input.lineTypes).toEqual(['ESTIMATE', 'EXECUTION']);

    // 56.3: PDF 経路でも書き込みは0件で、未保存のまま残る
    expect(requestLog).toEqual([]);
    expect(screen.getByTestId('estimate-unsaved-indicator')).toBeInTheDocument();

    // 観測窓が書き込みを捉えられることの裏取り
    await user.click(saveButton());
    await waitFor(() => expect(requestLog).toEqual(['saveEstimateDraft']));
  });

  it('行タイプをすべて外すと出力ボタンが無効になり、選び直すと出力できる（32.8）', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRow();

    const dialog = await openExportDialog(user);
    const exportButton = within(dialog).getByRole('button', { name: /^出力/ });
    const checkboxFor = (value: string): HTMLInputElement =>
      dialog.querySelector(`input[type="checkbox"][value="${value}"]`) as HTMLInputElement;

    await user.click(checkboxFor('ESTIMATE'));
    await user.click(checkboxFor('EXECUTION'));
    expect(exportButton).toBeDisabled();

    await user.click(exportButton);
    expect(downloaded).toEqual([]);

    // 1つ選び直せば出力できる（閾値の反対側）
    await user.click(checkboxFor('VENDOR'));
    expect(exportButton).toBeEnabled();

    await user.click(exportButton);
    await waitFor(() => {
      expect(downloaded.map((file) => file.fileName)).toEqual(['テスト見積書_業者.xlsx']);
    });
  });
});
