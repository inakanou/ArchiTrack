/**
 * @fileoverview 単価台帳の一覧の画面の単体テスト（unit-price-ledger タスク4.2）
 *
 * 一覧（業者名・見積日・案件名・合計・採否・読取の確認・参考の行の有無）・絞り込み・ページと総件数・
 * 0 件の表示・書き出し（0 件のときは無効、記録の失敗の表示）・権限の無い利用者への非表示を確かめる。
 * タスク4.6: 取り込みの画面を開き、取り込みが終わったら、その時点の絞り込みとページで一覧を読み直す。
 * API は `unitPriceLedgerApi` を差し替える。
 *
 * @requirement unit-price-ledger/REQ-4.1 一覧の 7 つの欄
 * @requirement unit-price-ledger/REQ-4.2 キーワード・見積日の期間・案件の有無・採否・読取の確認・改修／新営の絞り込み
 * @requirement unit-price-ledger/REQ-4.3 「要確認」の絞り込み
 * @requirement unit-price-ledger/REQ-4.4 「分類キーの無い行がある」の絞り込み
 * @requirement unit-price-ledger/REQ-4.5 ページと総件数
 * @requirement unit-price-ledger/REQ-4.7 0 件のとき「条件に合う見積はありません」
 * @requirement unit-price-ledger/REQ-6.1 絞り込みの結果の書き出し
 * @requirement unit-price-ledger/REQ-6.4 出力の記録の失敗の表示
 * @requirement unit-price-ledger/REQ-6.5 0 件のとき書き出しを無効にする
 * @requirement unit-price-ledger/REQ-10.1 台帳の管理の権限を持つ利用者だけに許す
 * @requirement unit-price-ledger/REQ-2.1 一覧の画面から見積カードの取り込みの画面を開く（タスク4.6）
 * @requirement unit-price-ledger/REQ-2.15 取り込みの結果を出し、取り込みが終わったら一覧を読み直す（タスク4.6）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';
import { ApiError } from '../../api/client';
import type {
  LedgerImportResult,
  LedgerQuotationList,
  LedgerQuotationSummary,
  LedgerListQuery,
} from '../../api/unit-price-ledger';
import UnitPriceLedgerPage from '../../pages/UnitPriceLedgerPage';

const mocks = vi.hoisted(() => ({
  listQuotations: vi.fn(),
  exportLedger: vi.fn(),
  importCards: vi.fn(),
}));

vi.mock('../../api/unit-price-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/unit-price-ledger')>();
  return {
    ...actual,
    unitPriceLedgerApi: {
      ...actual.unitPriceLedgerApi,
      listQuotations: mocks.listQuotations,
      exportLedger: mocks.exportLedger,
      importCards: mocks.importCards,
    },
  };
});

const MANAGE = 'unit_price_ledger:manage';
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';
const EMPTY_MESSAGE = '条件に合う見積はありません';
const RECORD_FAILED_MESSAGE = '書き出しを記録できなかったため、出力を中止しました';

function authValue(permissions: string[]): AuthContextValue {
  return {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
      roles: ['user'],
      permissions,
    },
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    twoFactorState: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    sessionExpiredDuringOperation: false,
    clearSessionExpired: vi.fn(),
    handleReauthSuccess: vi.fn(),
    navigateToLogin: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    establishSession: vi.fn(),
    updateUser: vi.fn(),
  };
}

function summary(overrides: Partial<LedgerQuotationSummary> = {}): LedgerQuotationSummary {
  return {
    id: 'q-1',
    name: '山田設備_2026-04-01',
    vendorName: '山田設備',
    submittedAt: new Date(2026, 3, 1),
    projectId: 'p-1',
    estimateRequestId: 'er-1',
    projectName: '庁舎改修工事',
    constructionKind: 'RENOVATION',
    totalAmount: 1234000,
    adoption: 'ADOPTED',
    readingStatus: 'CONFIRMED',
    hasReferenceLines: true,
    ledgerCardId: null,
    createdAt: new Date(2026, 3, 2),
    updatedAt: new Date(2026, 3, 2),
    ...overrides,
  };
}

function listOf(
  data: LedgerQuotationSummary[],
  pagination: Partial<LedgerQuotationList['pagination']> = {}
): LedgerQuotationList {
  return {
    data,
    pagination: {
      page: 1,
      limit: 50,
      total: data.length,
      totalPages: data.length === 0 ? 0 : 1,
      ...pagination,
    },
  };
}

const TWO_ROWS = listOf([
  summary(),
  summary({
    id: 'q-2',
    vendorName: '鈴木電気',
    submittedAt: new Date(2026, 2, 15),
    projectId: null,
    estimateRequestId: null,
    projectName: null,
    totalAmount: null,
    adoption: 'REJECTED',
    readingStatus: 'UNCONFIRMED',
    hasReferenceLines: false,
  }),
]);

function renderPage(permissions: string[] = [MANAGE], url = '/unit-price-ledger'): void {
  render(
    <AuthContext.Provider value={authValue(permissions)}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/unit-price-ledger" element={<UnitPriceLedgerPage />} />
          <Route path="/unit-price-ledger/quotations/:id" element={<p>詳細の画面</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

/** 最後の一覧の問い合わせ */
function lastListQuery(): LedgerListQuery {
  const calls = mocks.listQuotations.mock.calls;
  return calls[calls.length - 1]?.[0] as LedgerListQuery;
}

async function waitForTable(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: '台帳の見積の一覧' });
}

describe('UnitPriceLedgerPage（unit-price-ledger タスク4.2）', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:ledger');
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    mocks.listQuotations.mockReset();
    mocks.exportLedger.mockReset();
    mocks.importCards.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    mocks.listQuotations.mockResolvedValue(TWO_ROWS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('権限（10.1）', () => {
    it('台帳の管理の権限が無い利用者には内容を出さず、一覧も問い合わせない', () => {
      renderPage(['estimate:update']);

      expect(screen.getByRole('alert')).toHaveTextContent(NO_PERMISSION_MESSAGE);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '書き出し' })).not.toBeInTheDocument();
      expect(mocks.listQuotations).not.toHaveBeenCalled();
    });
  });

  describe('一覧（4.1）', () => {
    it('7 つの欄の見出しと、各行の値を出す', async () => {
      renderPage();
      const table = await waitForTable();

      const headers = within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent);
      expect(headers).toEqual([
        '業者名',
        '見積日',
        '案件名',
        '合計',
        '採否',
        '読取の確認',
        '参考の行',
      ]);

      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(2);
      const first = within(rows[0]!)
        .getAllByRole('cell')
        .map((td) => td.textContent);
      expect(first).toEqual([
        '山田設備',
        '2026-04-01',
        '庁舎改修工事',
        '1,234,000円',
        '採用',
        '確認済み',
        'あり',
      ]);
      const second = within(rows[1]!)
        .getAllByRole('cell')
        .map((td) => td.textContent);
      expect(second).toEqual(['鈴木電気', '2026-03-15', '-', '-', '不採用', '未確認', 'なし']);
    });

    it('業者名から見積の詳細の画面へ移る', async () => {
      renderPage();
      await waitForTable();

      const link = screen.getByRole('link', { name: '山田設備' });
      expect(link).toHaveAttribute('href', '/unit-price-ledger/quotations/q-1');

      await userEvent.click(link);
      expect(await screen.findByText('詳細の画面')).toBeInTheDocument();
    });

    it('初めは絞り込まずに 1 ページ目を問い合わせる', async () => {
      renderPage();
      await waitForTable();

      expect(mocks.listQuotations).toHaveBeenCalledTimes(1);
      expect(lastListQuery()).toEqual({ page: 1 });
    });

    it('一覧の取得に失敗したら、その旨を出す', async () => {
      mocks.listQuotations.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent('一覧を読み込めませんでした');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('絞り込み（4.2・4.3・4.4）', () => {
    type FilterCase = {
      title: string;
      apply: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
      expected: LedgerListQuery;
    };

    const cases: FilterCase[] = [
      {
        title: 'キーワード',
        apply: async (user) => {
          await user.type(screen.getByLabelText('キーワード'), 'エアコン');
        },
        expected: { keyword: 'エアコン', page: 1 },
      },
      {
        title: '見積日の期間',
        apply: async (user) => {
          await user.type(screen.getByLabelText('見積日（から）'), '2026-01-01');
          await user.type(screen.getByLabelText('見積日（まで）'), '2026-03-31');
        },
        expected: { submittedFrom: '2026-01-01', submittedTo: '2026-03-31', page: 1 },
      },
      {
        title: '案件の有無（なし）',
        apply: async (user) => {
          await user.selectOptions(screen.getByLabelText('案件の有無'), 'なし');
        },
        expected: { hasProject: false, page: 1 },
      },
      {
        title: '案件の有無（あり）',
        apply: async (user) => {
          await user.selectOptions(screen.getByLabelText('案件の有無'), 'あり');
        },
        expected: { hasProject: true, page: 1 },
      },
      {
        title: '採否',
        apply: async (user) => {
          await user.selectOptions(screen.getByLabelText('採否'), '不明');
        },
        expected: { adoption: 'UNKNOWN', page: 1 },
      },
      {
        title: '読取の確認',
        apply: async (user) => {
          await user.selectOptions(screen.getByLabelText('読取の確認'), '未確認');
        },
        expected: { readingStatus: 'UNCONFIRMED', page: 1 },
      },
      {
        title: '改修／新営',
        apply: async (user) => {
          await user.selectOptions(screen.getByLabelText('改修／新営'), '新営');
        },
        expected: { constructionKind: 'NEW_CONSTRUCTION', page: 1 },
      },
      {
        title: '要確認',
        apply: async (user) => {
          await user.click(screen.getByRole('checkbox', { name: '要確認' }));
        },
        expected: { needsReview: true, page: 1 },
      },
      {
        title: '分類キーの無い行がある',
        apply: async (user) => {
          await user.click(screen.getByRole('checkbox', { name: '分類キーの無い行がある' }));
        },
        expected: { missingClassificationKey: true, page: 1 },
      },
    ];

    it.each(cases)('$title で絞り込むと、その条件で問い合わせる', async ({ apply, expected }) => {
      const user = userEvent.setup();
      renderPage();
      await waitForTable();

      await apply(user);
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => expect(mocks.listQuotations).toHaveBeenCalledTimes(2));
      expect(lastListQuery()).toEqual(expected);
    });

    it('URL の検索の値から絞り込みとページを戻す', async () => {
      renderPage(
        [MANAGE],
        '/unit-price-ledger?keyword=%E5%B1%B1%E7%94%B0&hasProject=false&adoption=ADOPTED&needsReview=true&page=2'
      );
      await waitForTable();

      expect(lastListQuery()).toEqual({
        keyword: '山田',
        hasProject: false,
        adoption: 'ADOPTED',
        needsReview: true,
        page: 2,
      });
      expect(screen.getByLabelText('キーワード')).toHaveValue('山田');
      expect(screen.getByRole('checkbox', { name: '要確認' })).toBeChecked();
    });

    it('見積日の期間の始まりが終わりより後なら、問い合わせずに知らせる', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTable();

      await user.type(screen.getByLabelText('見積日（から）'), '2026-05-01');
      await user.type(screen.getByLabelText('見積日（まで）'), '2026-04-01');
      await user.click(screen.getByRole('button', { name: '検索' }));

      expect(
        await screen.findByText('見積日の期間は、始まりを終わり以前にしてください')
      ).toBeInTheDocument();
      expect(mocks.listQuotations).toHaveBeenCalledTimes(1);
    });

    it('条件をクリアすると、絞り込まずに問い合わせ直す', async () => {
      const user = userEvent.setup();
      renderPage([MANAGE], '/unit-price-ledger?keyword=abc&needsReview=true');
      await waitForTable();

      await user.click(screen.getByRole('button', { name: '条件をクリア' }));

      await waitFor(() => expect(lastListQuery()).toEqual({ page: 1 }));
      expect(screen.getByLabelText('キーワード')).toHaveValue('');
      expect(screen.getByRole('checkbox', { name: '要確認' })).not.toBeChecked();
    });
  });

  describe('ページと総件数（4.5）', () => {
    it('総件数とページを出し、次のページ・前のページを問い合わせる', async () => {
      const user = userEvent.setup();
      mocks.listQuotations.mockResolvedValue(
        listOf([summary()], { page: 1, total: 120, totalPages: 3 })
      );
      renderPage();
      await waitForTable();

      expect(screen.getByRole('status', { name: '絞り込みの結果' })).toHaveTextContent('120 件');
      expect(screen.getByText('1 / 3 ページ')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '前のページ' })).toBeDisabled();

      mocks.listQuotations.mockResolvedValue(
        listOf([summary({ id: 'q-51' })], { page: 2, total: 120, totalPages: 3 })
      );
      await user.click(screen.getByRole('button', { name: '次のページ' }));

      await waitFor(() => expect(lastListQuery()).toEqual({ page: 2 }));
      expect(await screen.findByText('2 / 3 ページ')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '前のページ' })).toBeEnabled();

      mocks.listQuotations.mockResolvedValue(
        listOf([summary({ id: 'q-101' })], { page: 3, total: 120, totalPages: 3 })
      );
      await user.click(screen.getByRole('button', { name: '次のページ' }));
      expect(await screen.findByText('3 / 3 ページ')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '次のページ' })).toBeDisabled();

      mocks.listQuotations.mockResolvedValue(
        listOf([summary({ id: 'q-51' })], { page: 2, total: 120, totalPages: 3 })
      );
      await user.click(screen.getByRole('button', { name: '前のページ' }));
      await waitFor(() => expect(lastListQuery()).toEqual({ page: 2 }));
    });

    /**
     * @requirement unit-price-ledger/REQ-4.7
     */
    it('範囲外のページを開いても、総件数があれば 0 件の文言を出さず、書き出しを押せる', async () => {
      mocks.listQuotations.mockResolvedValue(listOf([], { page: 9, total: 120, totalPages: 3 }));
      renderPage([MANAGE], '/unit-price-ledger?page=9');
      await waitFor(() => expect(lastListQuery()).toEqual({ page: 9 }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('120'));

      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /書き出/ })).toBeEnabled();
    });

    it('絞り込むとページを 1 に戻す', async () => {
      const user = userEvent.setup();
      mocks.listQuotations.mockResolvedValue(
        listOf([summary()], { page: 2, total: 120, totalPages: 3 })
      );
      renderPage([MANAGE], '/unit-price-ledger?page=2');
      await waitForTable();
      expect(lastListQuery()).toEqual({ page: 2 });

      await user.type(screen.getByLabelText('キーワード'), '山田');
      await user.click(screen.getByRole('button', { name: '検索' }));

      await waitFor(() => expect(lastListQuery()).toEqual({ keyword: '山田', page: 1 }));
    });
  });

  describe('0 件（4.7・6.5）', () => {
    it('「条件に合う見積はありません」を出し、書き出しを無効にする', async () => {
      mocks.listQuotations.mockResolvedValue(listOf([]));
      renderPage();

      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByRole('status', { name: '絞り込みの結果' })).toHaveTextContent('0 件');
      expect(screen.getByRole('button', { name: '書き出し' })).toBeDisabled();
    });

    it('件数があるときは書き出しを有効にする', async () => {
      renderPage();
      await waitForTable();

      expect(screen.getByRole('button', { name: '書き出し' })).toBeEnabled();
      expect(screen.queryByText(EMPTY_MESSAGE)).not.toBeInTheDocument();
    });
  });

  describe('書き出し（6.1・6.4）', () => {
    it('絞り込まないときは {} で書き出し、台帳のファイル名で保存する', async () => {
      const user = userEvent.setup();
      const blob = new Blob(['xlsx']);
      mocks.exportLedger.mockResolvedValue(blob);
      const clicked: string[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        clicked.push(this.download);
      });
      renderPage();
      await waitForTable();

      await user.click(screen.getByRole('button', { name: '書き出し' }));

      await waitFor(() => expect(mocks.exportLedger).toHaveBeenCalledTimes(1));
      expect(mocks.exportLedger).toHaveBeenCalledWith({});
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
      expect(clicked).toHaveLength(1);
      expect(clicked[0]).toMatch(/^単価台帳_\d{8}\.xlsx$/);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:ledger');
      click.mockRestore();
    });

    it('その時点の絞り込み（ページを除く）で書き出す', async () => {
      const user = userEvent.setup();
      mocks.exportLedger.mockResolvedValue(new Blob(['xlsx']));
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      renderPage(
        [MANAGE],
        '/unit-price-ledger?keyword=abc&readingStatus=UNCONFIRMED&missingClassificationKey=true&page=2'
      );
      await waitForTable();

      await user.click(screen.getByRole('button', { name: '書き出し' }));

      await waitFor(() =>
        expect(mocks.exportLedger).toHaveBeenCalledWith({
          keyword: 'abc',
          readingStatus: 'UNCONFIRMED',
          missingClassificationKey: true,
        })
      );
      click.mockRestore();
    });

    it('出力の記録に失敗したら、保存せずに 6.4 の文言を出す', async () => {
      const user = userEvent.setup();
      mocks.exportLedger.mockRejectedValue(
        new ApiError(500, '書き出しを記録できませんでした', {
          code: 'EXPORT_RECORD_FAILED',
          error: '書き出しを記録できませんでした',
        })
      );
      renderPage();
      await waitForTable();

      await user.click(screen.getByRole('button', { name: '書き出し' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_MESSAGE);
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('ほかの失敗では、書き出しに失敗した旨を出す', async () => {
      const user = userEvent.setup();
      mocks.exportLedger.mockRejectedValue(new ApiError(503, 'Service Unavailable'));
      renderPage();
      await waitForTable();

      await user.click(screen.getByRole('button', { name: '書き出し' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('書き出しに失敗しました');
      expect(screen.queryByText(RECORD_FAILED_MESSAGE)).not.toBeInTheDocument();
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });
  describe('取り込み（2.1・2.15、タスク4.6）', () => {
    const IMPORT_RESULT: LedgerImportResult = {
      importedCount: 2,
      skipped: [{ cardId: 'card-001' }],
      failed: [],
      truncated: [],
      referenceMarkedCount: 0,
    };
    const IMPORT_DIALOG_NAME = '見積カードの取り込み';
    const jsonFile = (name: string): File => new File(['{}'], name, { type: 'application/json' });

    it('見出しの取り込みの操作から、取り込みの画面を開く', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTable();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '取り込み' }));

      const dialog = screen.getByRole('dialog', { name: IMPORT_DIALOG_NAME });
      expect(within(dialog).getByLabelText('取り込むファイル')).toBeInTheDocument();
    });

    it('取り込みが終わったら結果を出し、その時点の絞り込みとページで一覧を読み直す', async () => {
      const user = userEvent.setup();
      mocks.importCards.mockResolvedValue(IMPORT_RESULT);
      renderPage([MANAGE], '/unit-price-ledger?keyword=%E5%B1%B1%E7%94%B0&page=2');
      await waitForTable();
      expect(mocks.listQuotations).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: '取り込み' }));
      const dialog = screen.getByRole('dialog', { name: IMPORT_DIALOG_NAME });
      await user.upload(within(dialog).getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
      await user.click(within(dialog).getByRole('button', { name: '取り込む' }));

      expect(
        await within(dialog).findByRole('heading', { name: '取り込みの結果' })
      ).toBeInTheDocument();
      await waitFor(() => expect(mocks.listQuotations).toHaveBeenCalledTimes(2));
      expect(lastListQuery()).toEqual({ keyword: '山田', page: 2 });
      expect(mocks.importCards).toHaveBeenCalledTimes(1);
      // 読み直した一覧を出し、結果の画面はそのまま開いている
      expect(await waitForTable()).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: IMPORT_DIALOG_NAME })).toBeInTheDocument();
      expect(screen.getByLabelText('キーワード')).toHaveValue('山田');
    });

    it('結果の画面を閉じると取り込みの操作へフォーカスを戻し、一覧はそれ以上問い合わせない', async () => {
      const user = userEvent.setup();
      mocks.importCards.mockResolvedValue(IMPORT_RESULT);
      renderPage();
      await waitForTable();

      const openButton = screen.getByRole('button', { name: '取り込み' });
      await user.click(openButton);
      const dialog = screen.getByRole('dialog', { name: IMPORT_DIALOG_NAME });
      await user.upload(within(dialog).getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
      await user.click(within(dialog).getByRole('button', { name: '取り込む' }));
      await within(dialog).findByRole('heading', { name: '取り込みの結果' });
      await waitFor(() => expect(mocks.listQuotations).toHaveBeenCalledTimes(2));
      await waitForTable();

      await user.click(within(dialog).getByRole('button', { name: '閉じる' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(openButton).toHaveFocus());
      expect(mocks.listQuotations).toHaveBeenCalledTimes(2);
    });

    it('取り込まずに閉じたときは、一覧を読み直さない', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTable();

      const openButton = screen.getByRole('button', { name: '取り込み' });
      await user.click(openButton);
      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(openButton).toHaveFocus());
      expect(mocks.importCards).not.toHaveBeenCalled();
      expect(mocks.listQuotations).toHaveBeenCalledTimes(1);
    });

    it('取り込みに失敗したときは、一覧を読み直さない', async () => {
      const user = userEvent.setup();
      mocks.importCards.mockRejectedValue(new ApiError(500, 'サーバーの誤り'));
      renderPage();
      await waitForTable();

      await user.click(screen.getByRole('button', { name: '取り込み' }));
      const dialog = screen.getByRole('dialog', { name: IMPORT_DIALOG_NAME });
      await user.upload(within(dialog).getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
      await user.click(within(dialog).getByRole('button', { name: '取り込む' }));

      expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
      expect(mocks.listQuotations).toHaveBeenCalledTimes(1);
    });
  });
});
