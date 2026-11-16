/**
 * @fileoverview 見積カードの取り込みの画面（unit-price-ledger タスク4.3）
 *
 * zip、または複数の JSON の見積カードを選んで取り込み、結果の件数と内訳を出す。
 * 一覧の画面への組み込み（開く操作と、取り込み後の一覧の読み直し）は 4.6 で行う。
 *
 * - 送る前に、拡張子（.zip・.json）・ファイルの数（2000 個まで）・大きさ（zip は 50MB、JSON は 1MB まで）を
 *   確かめ、通らないファイルは送らない。上限の判定はサーバーが正で、サーバーの上限超過（413
 *   `LEDGER_IMPORT_TOO_LARGE`）はその文言をそのまま出す
 * - 取り込みは自動では送り直さない（multipart の送信は client がサーバーへ届く前の失敗に限って送り直す）
 * - 閉じている間は中身を外し、開き直すたびに選んだファイルと結果を捨てる
 *
 * Requirements (unit-price-ledger):
 * - 2.1: zip、または複数の JSON の見積カードを選んで取り込む
 * - 2.15: 登録した件数・飛ばした件数とカードの ID・登録できなかった件数と理由・参考の印を付けた件数を出す
 *   （2.9 の切り詰めた欄もカードごとに出す）
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import FocusManager from '../FocusManager';
import { ApiError } from '../../api/client';
import { unitPriceLedgerApi, type LedgerImportResult } from '../../api/unit-price-ledger';

// ============================================================================
// 型定義
// ============================================================================

export interface LedgerImportDialogProps {
  /** 開いているか */
  open: boolean;
  /** 閉じるとき（キャンセル・閉じる・Escape） */
  onClose: () => void;
  /** 取り込みが終わったとき（一覧の読み直しに使う） */
  onImported?: (result: LedgerImportResult) => void;
}

// ============================================================================
// 定数（backend の LEDGER_IMPORT_LIMITS と同じ）
// ============================================================================

const MB = 1024 * 1024;

/** 1 要求のファイルの数の上限 */
const MAX_FILE_COUNT = 2000;
/** zip のファイル 1 個の大きさの上限 */
const MAX_ZIP_SIZE = 50 * MB;
/** JSON のファイル 1 個の大きさの上限 */
const MAX_JSON_SIZE = 1 * MB;

const ACCEPT = '.zip,.json,application/zip,application/json';

const TITLE = '見積カードの取り込み';
const SUBMITTING_LABEL = '取り込み中…';
const GENERIC_ERROR_MESSAGE = '取り込みに失敗しました。時間をおいてもう一度お試しください';
const SKIPPED_NOTE = '既に取り込まれているカードの ID のため、登録せずに飛ばしました';

const BUTTON_BASE =
  'px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed';
const PRIMARY_BUTTON = `${BUTTON_BASE} bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-500`;
const SECONDARY_BUTTON = `${BUTTON_BASE} bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:bg-gray-200 disabled:text-gray-600`;

// ============================================================================
// 送る前の確かめ
// ============================================================================

const lowerName = (file: File): string => file.name.toLowerCase();
const isZip = (file: File): boolean => lowerName(file).endsWith('.zip');
const isJson = (file: File): boolean => lowerName(file).endsWith('.json');

/** 選んだファイルの誤りの文言（無ければ空） */
function validateLedgerImportFiles(files: ReadonlyArray<File>): string[] {
  if (files.length > MAX_FILE_COUNT) {
    return [`取り込むファイルの数が上限（${MAX_FILE_COUNT} 個）を超えています`];
  }
  return files.flatMap((file): string[] => {
    if (isZip(file)) {
      return file.size > MAX_ZIP_SIZE
        ? [`zip のファイルの大きさが上限（${MAX_ZIP_SIZE / MB}MB）を超えています（${file.name}）`]
        : [];
    }
    if (isJson(file)) {
      return file.size > MAX_JSON_SIZE
        ? [`JSON のファイルの大きさが上限（${MAX_JSON_SIZE / MB}MB）を超えています（${file.name}）`]
        : [];
    }
    return [`zip または JSON のファイルを選んでください（${file.name}）`];
  });
}

/** 取り込みの失敗の文言。サーバーが返した文言（413 の上限超過など）はそのまま出す */
const toErrorMessage = (error: unknown): string =>
  error instanceof ApiError && error.statusCode > 0 && error.message !== ''
    ? error.message
    : GENERIC_ERROR_MESSAGE;

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 見積カードの取り込みの画面
 *
 * @example
 * ```tsx
 * <LedgerImportDialog open={isOpen} onClose={() => setIsOpen(false)} onImported={() => reload()} />
 * ```
 */
export default function LedgerImportDialog({ open, onClose, onImported }: LedgerImportDialogProps) {
  const titleId = useId();
  const [submitting, setSubmitting] = useState(false);

  return (
    <FocusManager
      isOpen={open}
      onClose={onClose}
      closeOnEscape={!submitting}
      closeOnOutsideClick={false}
      ariaLabelledBy={titleId}
    >
      <LedgerImportDialogContent
        titleId={titleId}
        onClose={onClose}
        onImported={onImported}
        onSubmittingChange={setSubmitting}
      />
    </FocusManager>
  );
}

interface ContentProps {
  titleId: string;
  onClose: () => void;
  onImported?: (result: LedgerImportResult) => void;
  onSubmittingChange: (submitting: boolean) => void;
}

/** 中身（閉じると外れ、状態を捨てる） */
function LedgerImportDialogContent({
  titleId,
  onClose,
  onImported,
  onSubmittingChange,
}: ContentProps) {
  const baseId = useId();
  const inputId = `${baseId}-files`;
  const hintId = `${baseId}-hint`;
  const resultTitleId = `${baseId}-result-title`;
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LedgerImportResult | null>(null);

  useEffect(() => {
    onSubmittingChange(submitting);
  }, [submitting, onSubmittingChange]);

  // 外れるときは、送信中の印を戻す
  useEffect(() => () => onSubmittingChange(false), [onSubmittingChange]);

  // 結果を出したら、結果の見出しへフォーカスを移す
  useEffect(() => {
    if (result) resultHeadingRef.current?.focus();
  }, [result]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const errors = validateLedgerImportFiles(selected);
    setFileErrors(errors);
    setSubmitError(null);
    setFiles(errors.length === 0 ? selected : []);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (files.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const imported = await unitPriceLedgerApi.importCards(files);
      setResult(imported);
      onImported?.(imported);
    } catch (error) {
      setSubmitError(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [files, submitting, onImported]);

  const errors = submitError ? [...fileErrors, submitError] : fileErrors;

  return (
    <div className="w-[min(640px,85vw)] p-2">
      <h2 id={titleId} className="text-lg font-bold text-gray-800 mb-4">
        {TITLE}
      </h2>

      {result ? (
        <ImportResultView result={result} titleId={resultTitleId} headingRef={resultHeadingRef} />
      ) : (
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
            取り込むファイル
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT}
            aria-describedby={hintId}
            disabled={submitting}
            onChange={handleChange}
            className="block w-full text-sm text-gray-700"
          />
          <p id={hintId} className="mt-1 text-xs text-gray-600">
            見積カードの zip（50MB まで）、または JSON（1 個 1MB まで）を、合わせて {MAX_FILE_COUNT}{' '}
            個まで選べます
          </p>

          {files.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-gray-700">{files.length} 個のファイルを選びました</p>
              <ul
                aria-label="選んだファイル"
                className="mt-1 max-h-32 overflow-auto text-xs text-gray-600 list-disc pl-5"
              >
                {files.map((file, index) => (
                  <li key={`${index}-${file.name}`} className="break-all">
                    {file.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-4 p-3 rounded-lg border border-red-500 bg-red-50 text-sm text-red-700"
        >
          {errors.map((message, index) => (
            <p key={index} className="break-all">
              {message}
            </p>
          ))}
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-3 text-sm text-gray-700">
        {submitting ? SUBMITTING_LABEL : ''}
      </div>

      <div className="flex justify-end gap-3 mt-4">
        {result ? (
          <button type="button" className={PRIMARY_BUTTON} onClick={onClose}>
            閉じる
          </button>
        ) : (
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={onClose}
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => void handleSubmit()}
              disabled={files.length === 0 || submitting}
            >
              {submitting ? SUBMITTING_LABEL : '取り込む'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 結果
// ============================================================================

interface ImportResultViewProps {
  result: LedgerImportResult;
  titleId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/** 取り込みの結果の件数と内訳（2.15・2.9） */
function ImportResultView({ result, titleId, headingRef }: ImportResultViewProps) {
  const { importedCount, skipped, failed, truncated, referenceMarkedCount } = result;
  const listClass = 'mt-1 mb-2 max-h-40 overflow-auto text-xs text-gray-700 list-disc pl-5';

  return (
    <section aria-labelledby={titleId}>
      <h3
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold text-gray-800 mb-2 focus:outline-none"
      >
        取り込みの結果
      </h3>
      <div className="space-y-1 text-sm text-gray-800">
        <p>登録した件数：{importedCount} 件</p>

        <p>飛ばした件数：{skipped.length} 件</p>
        {skipped.length > 0 && (
          <>
            <p className="text-xs text-gray-600">{SKIPPED_NOTE}</p>
            <ul aria-label="飛ばしたカードの ID" className={listClass}>
              {skipped.map((item, index) => (
                <li key={`${index}-${item.cardId}`} className="break-all">
                  {item.cardId}
                </li>
              ))}
            </ul>
          </>
        )}

        <p>登録できなかった件数：{failed.length} 件</p>
        {failed.length > 0 && (
          <ul aria-label="登録できなかったファイルと理由" className={listClass}>
            {failed.map((item, index) => (
              <li key={`${index}-${item.fileName}`} className="break-all">
                {item.fileName}：{item.reason}
              </li>
            ))}
          </ul>
        )}

        <p>切り詰めた件数：{truncated.length} 件</p>
        {truncated.length > 0 && (
          <ul aria-label="切り詰めたカードと欄" className={listClass}>
            {truncated.map((item, index) => (
              <li key={`${index}-${item.cardId}`} className="break-all">
                {item.cardId}：{item.fields.join('、')}
              </li>
            ))}
          </ul>
        )}

        <p>参考の印を付けた件数：{referenceMarkedCount} 件</p>
      </div>
    </section>
  );
}
