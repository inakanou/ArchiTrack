/**
 * @fileoverview 単価台帳の一覧の画面（/unit-price-ledger）
 *
 * unit-price-ledger タスク4.1: 経路と枠。タスク4.2: 一覧・絞り込み・ページと総件数・0 件の表示・書き出し。
 * タスク4.6: 見出しの操作の並びに取り込みの入口（LedgerImportDialog）を置き、取り込みが終わったら、
 * その時点の絞り込みとページ（URL の検索の値）のまま一覧を読み直す。
 *
 * 経路は認証済みの経路で、ProtectedRoute はロールしか確かめない。画面の中で台帳の管理の権限
 * （`unit_price_ledger:manage`）を確かめ、無ければ内容を出さず、一覧も問い合わせない（design.md の UnitPriceLedgerPage）。
 * 絞り込みとページは URL の検索の値に持つ（取引先の一覧の作りと同じ）。
 *
 * Requirements (unit-price-ledger):
 * - 2.1: 一覧の画面から見積カードの取り込みの画面を開く
 * - 2.15: 取り込みの結果は取り込みの画面が出し、取り込みが終わったら一覧を読み直して登録した見積を出す
 * - 4.1: 台帳の見積を、業者名・見積日・案件名・合計・採否・読取の確認・参考の行の有無とともに一覧に出す
 * - 4.2・4.3・4.4: 絞り込み（LedgerSearchFilter）
 * - 4.5: 一覧をページに分け、絞り込みの結果の総件数を出す
 * - 4.7: 0 件のとき「条件に合う見積はありません」と出す
 * - 6.1: その時点の絞り込みの結果を Excel に書き出す
 * - 6.4: 出力の記録に失敗したら、ファイルを保存せずに「書き出しを記録できなかったため、出力を中止しました」と出す
 * - 6.5: 0 件のとき書き出しをできないようにする
 * - 6.6: 見積の数が上限を超えて書き出しを拒まれたら（400 `LEDGER_EXPORT_TOO_MANY`）、サーバーの文言
 *   （絞り込みを狭める案内）を出す
 * - 4.9: 「削除済みの案件を除く」の絞り込みも URL の検索の値に持ち、書き出しにも同じ条件を送る
 * - 10.1・10.4: 台帳の管理の権限を持つ利用者だけに内容を出す
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { ApiError, getApiErrorCode } from '../api/client';
import {
  UNIT_PRICE_LEDGER_MANAGE_PERMISSION,
  buildLedgerExportFileName,
  unitPriceLedgerApi,
  type LedgerFilter,
  type LedgerListQuery,
  type LedgerQuotationList,
} from '../api/unit-price-ledger';
import type {
  ConstructionKind,
  QuotationAdoption,
  ReadingStatus,
} from '../api/received-quotations';
import LedgerSearchFilter from '../components/unit-price-ledger/LedgerSearchFilter';
import LedgerQuotationTable from '../components/unit-price-ledger/LedgerQuotationTable';
import LedgerImportDialog from '../components/unit-price-ledger/LedgerImportDialog';
import {
  ADOPTION_LABELS,
  CONSTRUCTION_KIND_LABELS,
  READING_STATUS_LABELS,
} from '../components/unit-price-ledger/ledger-labels';

// ============================================================================
// 定数
// ============================================================================

/** 権限の無い利用者に出す文言 */
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';

/** 0 件の文言（4.7） */
const EMPTY_MESSAGE = '条件に合う見積はありません';

/** 一覧の取得の失敗の文言 */
const LIST_FAILED_MESSAGE = '一覧を読み込めませんでした。時間をおいて、もう一度お試しください';

/** 出力の記録の失敗の文言（6.4） */
const EXPORT_RECORD_FAILED_MESSAGE = '書き出しを記録できなかったため、出力を中止しました';

/** ほかの書き出しの失敗の文言 */
const EXPORT_FAILED_MESSAGE = '書き出しに失敗しました。時間をおいて、もう一度お試しください';

/** 出力の記録の失敗のエラーコード（backend の LedgerExportService） */
const EXPORT_RECORD_FAILED_CODE = 'EXPORT_RECORD_FAILED';

/** 見積の数が上限を超えたときのエラーコード（backend の LedgerExportService。6.6） */
const EXPORT_TOO_MANY_CODE = 'LEDGER_EXPORT_TOO_MANY';

const BUTTON_CLASS =
  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

// ============================================================================
// URL の検索の値
// ============================================================================

function pickEnum<T extends string>(
  value: string | null,
  labels: Readonly<Record<T, string>>
): T | undefined {
  return value !== null && Object.prototype.hasOwnProperty.call(labels, value)
    ? (value as T)
    : undefined;
}

function pickFlag(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function pickText(value: string | null): string | undefined {
  return value === null || value === '' ? undefined : value;
}

/** URL の検索の値から絞り込みを読む。知らない値は捨てる */
function parseFilter(params: URLSearchParams): LedgerFilter {
  const candidate: LedgerFilter = {
    keyword: pickText(params.get('keyword')),
    submittedFrom: pickText(params.get('submittedFrom')),
    submittedTo: pickText(params.get('submittedTo')),
    hasProject: pickFlag(params.get('hasProject')),
    adoption: pickEnum<QuotationAdoption>(params.get('adoption'), ADOPTION_LABELS),
    readingStatus: pickEnum<ReadingStatus>(params.get('readingStatus'), READING_STATUS_LABELS),
    constructionKind: pickEnum<ConstructionKind>(
      params.get('constructionKind'),
      CONSTRUCTION_KIND_LABELS
    ),
    needsReview: pickFlag(params.get('needsReview')) === true ? true : undefined,
    missingClassificationKey:
      pickFlag(params.get('missingClassificationKey')) === true ? true : undefined,
    excludeDeletedProjects:
      pickFlag(params.get('excludeDeletedProjects')) === true ? true : undefined,
  };
  const filter: LedgerFilter = {};
  for (const [key, value] of Object.entries(candidate) as Array<
    [keyof LedgerFilter, LedgerFilter[keyof LedgerFilter]]
  >) {
    if (value !== undefined) {
      Object.assign(filter, { [key]: value });
    }
  }
  return filter;
}

function parsePage(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function buildSearchParams(filter: LedgerFilter, page: number): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined) params.set(key, String(value));
  }
  if (page > 1) params.set('page', String(page));
  return params;
}

/**
 * 書き出しの失敗を画面の文言にする。記録の失敗は 6.4 の文言、上限の超過はサーバーの文言（6.6）、
 * ほかは書き出しに失敗した旨
 */
function toExportErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code === EXPORT_RECORD_FAILED_CODE) return EXPORT_RECORD_FAILED_MESSAGE;
  if (code === EXPORT_TOO_MANY_CODE && error instanceof ApiError && error.message !== '') {
    return error.message;
  }
  return EXPORT_FAILED_MESSAGE;
}

// ============================================================================
// ファイルの保存
// ============================================================================

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 一覧の本体（権限を確かめた後）
// ============================================================================

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; list: LedgerQuotationList };

function LedgerListContent(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const filter = useMemo(() => parseFilter(new URLSearchParams(searchKey)), [searchKey]);
  const page = useMemo(() => parsePage(new URLSearchParams(searchKey)), [searchKey]);
  /** 絞り込みが変わったら絞り込みの欄を作り直す（欄の値を条件に戻す） */
  const filterKey = useMemo(() => buildSearchParams(filter, 1).toString(), [filter]);

  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** 取り込みが終わるたびに増やし、同じ絞り込みとページで一覧を読み直す */
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const query: LedgerListQuery = { ...filter, page };
    setListState({ status: 'loading' });
    unitPriceLedgerApi.listQuotations(query).then(
      (list) => {
        if (!cancelled) setListState({ status: 'loaded', list });
      },
      () => {
        if (!cancelled) setListState({ status: 'error' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [filter, page, reloadCount]);

  const handleOpenImport = useCallback(() => setImportOpen(true), []);
  const handleCloseImport = useCallback(() => setImportOpen(false), []);
  // 取り込みの画面は、送信中に閉じられても、終われば呼ぶ（LedgerImportDialog）
  const handleImported = useCallback(() => setReloadCount((count) => count + 1), []);

  const handleSearch = useCallback(
    (next: LedgerFilter) => {
      setExportError(null);
      setSearchParams(buildSearchParams(next, 1));
    },
    [setSearchParams]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      setSearchParams(buildSearchParams(filter, nextPage));
    },
    [filter, setSearchParams]
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      // 書き出しは本文が必須で、絞り込まないときも {} を送る（3.1）
      const blob = await unitPriceLedgerApi.exportLedger({ ...filter });
      saveBlob(blob, buildLedgerExportFileName(new Date()));
    } catch (err) {
      setExportError(toExportErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }, [filter]);

  const loaded = listState.status === 'loaded' ? listState.list : null;
  const total = loaded?.pagination.total ?? 0;
  const totalPages = loaded?.pagination.totalPages ?? 0;
  const currentPage = loaded?.pagination.page ?? page;
  const exportDisabled = loaded === null || total === 0 || exporting;

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">単価台帳</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenImport}
            aria-haspopup="dialog"
            className={`${BUTTON_CLASS} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}
          >
            取り込み
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportDisabled}
            aria-busy={exporting || undefined}
            className={`${BUTTON_CLASS} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          >
            {exporting ? '書き出し中...' : '書き出し'}
          </button>
        </div>
      </div>

      <LedgerImportDialog
        open={importOpen}
        onClose={handleCloseImport}
        onImported={handleImported}
      />

      {exportError !== null && (
        <p
          role="alert"
          className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800"
        >
          {exportError}
        </p>
      )}

      <LedgerSearchFilter
        key={filterKey}
        filter={filter}
        onSearch={handleSearch}
        disabled={listState.status === 'loading'}
      />

      {listState.status === 'loading' && (
        <p role="status" className="py-12 text-center text-gray-600">
          読み込み中...
        </p>
      )}

      {listState.status === 'error' && (
        <p
          role="alert"
          className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800"
        >
          {LIST_FAILED_MESSAGE}
        </p>
      )}

      {loaded !== null && (
        <section aria-label="台帳の見積">
          <p role="status" aria-label="絞り込みの結果" className="mb-3 text-sm text-gray-700">
            {total} 件
          </p>
          {total === 0 ? (
            <p className="py-12 text-center text-gray-600 bg-white rounded-xl border border-gray-200">
              {EMPTY_MESSAGE}
            </p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <LedgerQuotationTable quotations={loaded.data} />
            </div>
          )}
          {totalPages > 0 && (
            <nav aria-label="ページ" className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className={`${BUTTON_CLASS} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
              >
                前のページ
              </button>
              <span className="text-sm text-gray-700">
                {currentPage} / {totalPages} ページ
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={`${BUTTON_CLASS} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
              >
                次のページ
              </button>
            </nav>
          )}
        </section>
      )}
    </>
  );
}

// ============================================================================
// 画面
// ============================================================================

export default function UnitPriceLedgerPage(): ReactElement {
  const { hasPermission, isLoading } = usePermission();

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <p role="status" className="text-gray-600">
          読み込み中...
        </p>
      </div>
    );
  }

  if (!hasPermission(UNIT_PRICE_LEDGER_MANAGE_PERMISSION)) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <p
          role="alert"
          className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800"
        >
          {NO_PERMISSION_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <LedgerListContent />
    </div>
  );
}
