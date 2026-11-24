/**
 * @fileoverview 接続の管理画面（user-authentication タスク78.3）
 *
 * design.md「Requirements 46-51」の AdminConnectionsPage に従う。経路は `/admin/external-app-connections`
 * とし、既存の管理者ルートと同じ `ProtectedRoute requiredRole="admin"` の内側に置く（画面はロール `admin`
 * で出し分け、API も DB のロール `admin` を確かめる。API が 403 を返したときは権限が無いことを示す）。
 * - 全利用者の接続を、利用者・アプリの名称・操作の範囲・同意の日時・最後に使われた日時・期限とともに示す（49.6）。
 *   期限は API が返す実際に使えなくなる日時
 * - 利用者とアプリの完全一致で絞り込み、既存のページ送り（PaginationUI）でページを切り替える（49.7）。
 *   利用者は既存の利用者の一覧（`GET /api/v1/users`）から選ぶ。読めなければ利用者の ID（UUID）を入力する。
 *   アプリは client ID を入力する（許可されたアプリの一覧の API は無い）。不正な値は送らず欄の下に誤りを示す
 * - 取り消しは利用者とアプリを示した確認のダイアログの後に、CSRF トークン付きの手段で DELETE を送る（49.8）。
 *   成功したら行を消して表示中のページを読み直し、404 は読み直して終了済みと知らせる
 * - 一覧の要求に世代の番号を振り、古い応答を捨てる（取り消した行が戻らないように）
 * - 接続の ID・利用者の ID・Grant・トークンは表示しない（接続の ID は取り消しの要求にだけ使う）
 *
 * @requirement user-authentication/REQ-49.6
 * @requirement user-authentication/REQ-49.7
 * @requirement user-authentication/REQ-49.8
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { z } from 'zod';
import { ApiError, apiClient, getApiErrorCode } from '../api/client';
import {
  listAdminExternalAppConnections,
  revokeExternalAppConnectionByAdmin,
  type AdminExternalAppConnection,
  type AdminExternalAppConnectionPage,
  type AdminExternalAppConnectionQuery,
} from '../api/external-apps';
import FocusManager from '../components/FocusManager';
import PaginationUI from '../components/projects/PaginationUI';
import { formatExternalAppScopes } from '../utils/external-app-scopes';
import { formatDateTime } from '../utils/formatters';

/** 1 ページの既定の件数（API の既定と同じ） */
const DEFAULT_LIMIT = 20;
/** アプリの client ID の形（API の検証と同じ。表示できる ASCII、255 文字まで） */
const CLIENT_ID_PATTERN = /^[\x20-\x7e]{1,255}$/;
/** 利用者の ID の形（API と同じ zod の UUID の検証） */
const userIdSchema = z.uuid();

const USER_ID_ERROR = '利用者の ID は UUID の形式で入力してください';
const CLIENT_ID_ERROR = 'アプリの client ID は半角の英数字・記号で 255 文字以内で入力してください';

const REVOKE_ERROR_MESSAGE = '接続を取り消せませんでした。時間をおいて再試行してください。';
const REVOKE_NETWORK_ERROR_MESSAGE =
  '接続を取り消せませんでした。ネットワーク接続を確認して、もう一度お試しください。';
const REVOKE_FORBIDDEN_MESSAGE =
  '接続を取り消す権限がありません。接続の取り消しはシステム管理者だけが行えます。';
const REVOKE_REJECTED_MESSAGE =
  '接続を取り消せませんでした。ページを読み込み直してから、もう一度お試しください。';

type LoadErrorKind = 'forbidden' | 'invalid' | 'network' | 'unavailable';

const LOAD_ERROR_MESSAGES: Record<LoadErrorKind, string> = {
  forbidden: 'この画面を使う権限がありません。接続の管理はシステム管理者だけが行えます。',
  invalid: '絞り込みの条件が正しくありません。条件を見直してください。',
  network: '接続の一覧を読み込めませんでした。ネットワーク接続を確認してください。',
  unavailable: '接続の一覧を読み込めませんでした。時間をおいて再試行してください。',
};

/** 一覧の要求の結果（`stale` は新しい要求に追い越された。`moved` は最後のページへ寄せ直した） */
type LoadOutcome = 'ok' | 'error' | 'stale' | 'moved';

interface UserOption {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

type UserOptionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly users: readonly UserOption[] };

function classifyLoadError(error: unknown): LoadErrorKind {
  if (error instanceof ApiError) {
    if (error.statusCode === 0) return 'network';
    if (error.statusCode === 403) return 'forbidden';
    if (error.statusCode === 400) return 'invalid';
  }
  return 'unavailable';
}

function revokeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 0) return REVOKE_NETWORK_ERROR_MESSAGE;
    if (error.statusCode === 403) {
      return getApiErrorCode(error) === 'SYSTEM_ADMIN_REQUIRED'
        ? REVOKE_FORBIDDEN_MESSAGE
        : REVOKE_REJECTED_MESSAGE;
    }
  }
  return REVOKE_ERROR_MESSAGE;
}

/** 利用者の一覧の応答から選択肢を作る（形が違えば読めなかったものとして扱う） */
function toUserOptions(body: unknown): readonly UserOption[] {
  if (!Array.isArray(body)) {
    throw new Error('Invalid users response');
  }
  return body
    .filter(
      (item): item is UserOption =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as UserOption).id === 'string' &&
        typeof (item as UserOption).displayName === 'string' &&
        typeof (item as UserOption).email === 'string' &&
        userIdSchema.safeParse((item as UserOption).id).success
    )
    .map(({ id, displayName, email }) => ({ id, displayName, email }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
}

/** 読み上げだけに残す文言の見た目の消し方 */
const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const thStyle: CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.875rem',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '0.75rem',
  fontSize: '0.875rem',
  verticalAlign: 'top',
};

/** 長い一語の名前・メールアドレス・client ID でも列の中で折り返す */
const wrapCellStyle: CSSProperties = {
  ...tdStyle,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minWidth: '8rem',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '0.375rem',
  border: '1px solid #6b7280',
  fontSize: '1rem',
  boxSizing: 'border-box',
  backgroundColor: 'white',
};

const buttonBase: CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid transparent',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const alertStyle: CSSProperties = {
  padding: '0.75rem',
  borderRadius: '0.375rem',
  backgroundColor: '#fee2e2',
  color: '#991b1b',
  marginBottom: '1rem',
  fontSize: '0.875rem',
};

const subTextStyle: CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#4b5563' };

function disabledLook(style: CSSProperties, disabled: boolean): CSSProperties {
  return disabled ? { ...style, opacity: 0.6, cursor: 'not-allowed' } : style;
}

/**
 * 接続の管理画面
 */
export function AdminExternalAppConnectionsPage() {
  // 適用中の条件（絞り込み・ページ・件数）
  const [query, setQuery] = useState<AdminExternalAppConnectionQuery>({
    page: 1,
    limit: DEFAULT_LIMIT,
  });
  const [pageData, setPageData] = useState<AdminExternalAppConnectionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadErrorKind | null>(null);

  // 絞り込みの入力（「絞り込む」までは適用しない）
  const [userOptions, setUserOptions] = useState<UserOptionsState>({ status: 'loading' });
  const [userInput, setUserInput] = useState('');
  const [clientInput, setClientInput] = useState('');
  const [userError, setUserError] = useState('');
  const [clientError, setClientError] = useState('');

  // 取り消し
  const [target, setTarget] = useState<AdminExternalAppConnection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  /** 取り消しの結果の知らせ（常に置いた role="status" の領域で読み上げる） */
  const [announcement, setAnnouncement] = useState('');

  /** 一覧の要求の世代。新しい要求を出すたびに進め、古い応答を捨てる */
  const generationRef = useRef(0);
  /** 表示中の一覧の条件（取り消しの後の読み直しに使う） */
  const queryRef = useRef(query);
  /** 次に一覧の読み込みが失敗したら失敗の案内へフォーカスを移すか */
  const focusLoadErrorRef = useRef(false);
  /** 送信中か（同期で判定して二重の送信を防ぐ） */
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loadErrorRef = useRef<HTMLDivElement>(null);
  const userSelectRef = useRef<HTMLSelectElement>(null);
  const userTextRef = useRef<HTMLInputElement>(null);
  const clientInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const revokeErrorRef = useRef<HTMLDivElement>(null);
  /** ダイアログを閉じた後のフォーカスの戻り先。null なら開く前の要素（取り消しのボタン）へ戻る */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const idPrefix = useId();
  const userFieldId = `${idPrefix}-user`;
  const userHelpId = `${idPrefix}-user-help`;
  const userErrorId = `${idPrefix}-user-error`;
  const clientFieldId = `${idPrefix}-client`;
  const clientHelpId = `${idPrefix}-client-help`;
  const clientErrorId = `${idPrefix}-client-error`;
  const dialogTitleId = `${idPrefix}-dialog-title`;
  const dialogDescriptionId = `${idPrefix}-dialog-desc`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 一覧の 1 ページを読む。新しい要求に追い越された応答は捨てる */
  const loadPage = useCallback(
    async (
      pageQuery: AdminExternalAppConnectionQuery,
      focusErrorOnFail: boolean
    ): Promise<LoadOutcome> => {
      generationRef.current += 1;
      const generation = generationRef.current;
      setLoading(true);
      try {
        const response = await listAdminExternalAppConnections(pageQuery);
        if (!mountedRef.current || generation !== generationRef.current) return 'stale';
        // 取り消しで件数が減り、表示中のページが範囲外になったときは最後のページへ寄せる
        const lastPage = Math.max(1, response.pagination.totalPages);
        if (response.data.length === 0 && pageQuery.page > lastPage) {
          setQuery({ ...pageQuery, page: lastPage });
          return 'moved';
        }
        setPageData(response);
        setLoadError(null);
        setLoading(false);
        return 'ok';
      } catch (error) {
        if (!mountedRef.current || generation !== generationRef.current) return 'stale';
        focusLoadErrorRef.current = focusErrorOnFail;
        setPageData(null);
        setLoadError(classifyLoadError(error));
        setLoading(false);
        return 'error';
      }
    },
    []
  );

  useEffect(() => {
    queryRef.current = query;
    void loadPage(query, false);
  }, [query, loadPage]);

  // 絞り込みの利用者の選択肢（既存の利用者の一覧。読めなければ ID の入力にする）
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<unknown>('/api/v1/users')
      .then((body) => {
        if (!cancelled) setUserOptions({ status: 'ready', users: toUserOptions(body) });
      })
      .catch(() => {
        if (!cancelled) setUserOptions({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 再試行や取り消しの後の読み直しが失敗したら、失敗の案内へフォーカスを移す（body へ落とさない）
  useEffect(() => {
    if (loadError !== null && focusLoadErrorRef.current) {
      focusLoadErrorRef.current = false;
      loadErrorRef.current?.focus();
      // 閉じたダイアログが後からフォーカスを戻す先も失敗の案内にする（見出しへ戻して案内から外さない）
      returnFocusRef.current = loadErrorRef.current;
    }
  }, [loadError]);

  // 取り消しの失敗の案内が出たら、そこへフォーカスを移す
  useEffect(() => {
    if (revokeError) {
      revokeErrorRef.current?.focus();
    }
  }, [revokeError]);

  const retryLoad = () => {
    // 押した「再試行」は消えるので、先に見出しへフォーカスを移す
    headingRef.current?.focus();
    setLoadError(null);
    void loadPage(queryRef.current, true);
  };

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 利用者の ID は DB で大文字と小文字を区別して照合されるので、小文字にそろえる
    const userValue = userInput.trim().toLowerCase();
    const clientValue = clientInput.trim();
    const nextUserError =
      userValue !== '' && !userIdSchema.safeParse(userValue).success ? USER_ID_ERROR : '';
    const nextClientError =
      clientValue !== '' && !CLIENT_ID_PATTERN.test(clientValue) ? CLIENT_ID_ERROR : '';
    setUserError(nextUserError);
    setClientError(nextClientError);
    if (nextUserError) {
      (userOptions.status === 'error' ? userTextRef : userSelectRef).current?.focus();
      return;
    }
    if (nextClientError) {
      clientInputRef.current?.focus();
      return;
    }
    setAnnouncement('');
    setQuery((current) => ({
      page: 1,
      limit: current.limit,
      ...(userValue !== '' ? { userId: userValue } : {}),
      ...(clientValue !== '' ? { clientId: clientValue } : {}),
    }));
  };

  const handleClearFilters = () => {
    setUserInput('');
    setClientInput('');
    setUserError('');
    setClientError('');
    setAnnouncement('');
    setQuery((current) => ({ page: 1, limit: current.limit }));
  };

  const handlePageChange = useCallback((nextPage: number) => {
    setQuery((current) => ({ ...current, page: nextPage }));
  }, []);

  const handleLimitChange = useCallback((nextLimit: number) => {
    setQuery((current) => ({ ...current, page: 1, limit: nextLimit }));
  }, []);

  const removeRow = (connectionId: string) => {
    setPageData((current) =>
      current === null
        ? current
        : { ...current, data: current.data.filter((item) => item.id !== connectionId) }
    );
  };

  const openDialog = (connection: AdminExternalAppConnection) => {
    if (busyRef.current) return;
    returnFocusRef.current = null;
    setRevokeError('');
    setAnnouncement('');
    setTarget(connection);
  };

  const closeDialog = useCallback(() => {
    if (busyRef.current) return;
    setTarget(null);
    setRevokeError('');
  }, []);

  /** 取り消しが済んだ（または既に終わっていた）ので、ダイアログを閉じて知らせる */
  const finishRevoke = (message: string) => {
    // 取り消したボタンは一覧から消えるので、ページの見出しへフォーカスを戻す
    returnFocusRef.current = headingRef.current;
    setTarget(null);
    setRevokeError('');
    setAnnouncement(message);
  };

  const confirmRevoke = async () => {
    if (target === null || busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setRevokeError('');
    setAnnouncement('');
    // 押したボタンは送信中に無効になるので、フォーカスをダイアログの見出しへ移す（body へ落とさない）
    dialogTitleRef.current?.focus();
    const { id, appName, user } = target;
    const subject = `${user.displayName}の「${appName}」の接続`;
    try {
      await revokeExternalAppConnectionByAdmin(id);
      if (!mountedRef.current) return;
      removeRow(id);
      finishRevoke(`${subject}を取り消しました。`);
      // 件数とページの中身を合わせるため、表示中のページを読み直す
      void loadPage(queryRef.current, true);
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof ApiError && error.statusCode === 404) {
        removeRow(id);
        const message = `${subject}はすでに終了していました。`;
        finishRevoke(message);
        void loadPage(queryRef.current, true).then((outcome) => {
          // 読み直せたときだけ一覧の更新を知らせる（失敗・追い越しでは残さない）
          if (outcome === 'ok' && mountedRef.current) {
            setAnnouncement((current) =>
              current === message ? `${message}一覧を更新しました。` : current
            );
          }
        });
        return;
      }
      setRevokeError(revokeErrorMessage(error));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const hasFilter = query.userId !== undefined || query.clientId !== undefined;
  const items = pageData?.data ?? null;
  const forbidden = loadError === 'forbidden';
  const canRetry = loadError === 'network' || loadError === 'unavailable';

  return (
    <div
      data-testid="admin-external-app-connections-container"
      style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem', minWidth: 0 }}
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem' }}
      >
        外部アプリの接続
      </h1>
      <p style={{ color: '#4b5563', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        全ての利用者が接続を許可した外部アプリを確認し、不正の疑いがある接続を取り消せます。一覧は同意の新しい順に並びます。期限は、未使用
        30 日と同意から 90 日の早い方で実際に使えなくなる日時です。
      </p>

      {/* 取り消しの結果の知らせ。読み上げのために常に置く */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={
          announcement
            ? {
                padding: '0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: '#d1fae5',
                color: '#065f46',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                overflowWrap: 'anywhere',
              }
            : undefined
        }
      >
        {announcement}
      </div>

      {loadError !== null && (
        <div
          ref={loadErrorRef}
          role="alert"
          tabIndex={-1}
          style={{
            ...alertStyle,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <span>{LOAD_ERROR_MESSAGES[loadError]}</span>
          {canRetry && (
            <button
              type="button"
              onClick={retryLoad}
              style={{
                ...buttonBase,
                backgroundColor: 'white',
                color: '#991b1b',
                borderColor: '#991b1b',
              }}
            >
              再試行
            </button>
          )}
        </div>
      )}

      {/* 絞り込み（要件49.7）。権限が無ければ出さない */}
      {!forbidden && (
        <form
          role="search"
          aria-label="接続の絞り込み"
          onSubmit={handleFilterSubmit}
          noValidate
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '1rem',
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
          }}
        >
          <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
            <label
              htmlFor={userFieldId}
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              {userOptions.status === 'error' ? '利用者の ID' : '利用者'}
            </label>
            {userOptions.status === 'error' ? (
              <input
                id={userFieldId}
                ref={userTextRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                aria-invalid={userError ? true : undefined}
                aria-describedby={userError ? `${userHelpId} ${userErrorId}` : userHelpId}
                style={inputStyle}
              />
            ) : (
              <select
                id={userFieldId}
                ref={userSelectRef}
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                disabled={userOptions.status === 'loading'}
                aria-invalid={userError ? true : undefined}
                aria-describedby={userError ? `${userHelpId} ${userErrorId}` : userHelpId}
                style={inputStyle}
              >
                <option value="">すべての利用者</option>
                {userOptions.status === 'ready' &&
                  userOptions.users.map((option) => (
                    <option key={option.id} value={option.id}>
                      {`${option.displayName}（${option.email}）`}
                    </option>
                  ))}
              </select>
            )}
            <p
              id={userHelpId}
              style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}
            >
              {userOptions.status === 'error'
                ? '利用者の一覧を読み込めなかったため、利用者の ID（UUID）を入力してください。空欄なら絞り込みません。'
                : userOptions.status === 'loading'
                  ? '利用者の一覧を読み込み中です。'
                  : '選んだ利用者の接続だけを表示します。'}
            </p>
            {userError && (
              <p
                id={userErrorId}
                role="alert"
                style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: '0.25rem' }}
              >
                {userError}
              </p>
            )}
          </div>
          <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
            <label
              htmlFor={clientFieldId}
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
            >
              アプリの client ID
            </label>
            <input
              id={clientFieldId}
              ref={clientInputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={clientInput}
              onChange={(event) => setClientInput(event.target.value)}
              aria-invalid={clientError ? true : undefined}
              aria-describedby={clientError ? `${clientHelpId} ${clientErrorId}` : clientHelpId}
              style={inputStyle}
            />
            <p
              id={clientHelpId}
              style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}
            >
              一覧の「アプリ」の欄に示す client ID
              と完全に一致する接続を表示します。空欄なら絞り込みません。
            </p>
            {clientError && (
              <p
                id={clientErrorId}
                role="alert"
                style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: '0.25rem' }}
              >
                {clientError}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="submit"
              style={{ ...buttonBase, backgroundColor: '#1d4ed8', color: 'white' }}
            >
              絞り込む
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasFilter && userInput === '' && clientInput === ''}
              style={disabledLook(
                {
                  ...buttonBase,
                  backgroundColor: 'white',
                  color: '#374151',
                  borderColor: '#6b7280',
                },
                !hasFilter && userInput === '' && clientInput === ''
              )}
            >
              条件をクリア
            </button>
          </div>
        </form>
      )}

      {loading && (items === null || items.length === 0) && loadError === null && (
        <div aria-live="polite" style={{ textAlign: 'center', padding: '2rem', color: '#4b5563' }}>
          読み込み中...
        </div>
      )}

      {!loading && items !== null && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#4b5563' }}>
          {hasFilter ? '条件に合う接続はありません。' : '外部アプリの接続はありません。'}
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div
          style={{ position: 'relative', overflowX: 'auto', maxWidth: '100%' }}
          aria-busy={loading}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
            <caption style={visuallyHidden}>外部アプリの接続の一覧</caption>
            <thead style={{ backgroundColor: '#f3f4f6' }}>
              <tr>
                <th scope="col" style={thStyle}>
                  利用者
                </th>
                <th scope="col" style={thStyle}>
                  アプリ
                </th>
                <th scope="col" style={thStyle}>
                  許可している操作
                </th>
                <th scope="col" style={thStyle}>
                  同意した日時
                </th>
                <th scope="col" style={thStyle}>
                  最後に使われた日時
                </th>
                <th scope="col" style={thStyle}>
                  期限
                </th>
                <th scope="col" style={thStyle}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((connection) => (
                <tr key={connection.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <th scope="row" style={{ ...wrapCellStyle, fontWeight: 600, textAlign: 'left' }}>
                    {connection.user.displayName}
                    <span style={{ ...subTextStyle, fontWeight: 400 }}>
                      {connection.user.email}
                    </span>
                  </th>
                  <td style={wrapCellStyle}>
                    {connection.appName}
                    <span style={subTextStyle}>client ID: {connection.clientId}</span>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {formatExternalAppScopes(connection.scopes)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {formatDateTime(connection.consentedAt)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {connection.lastUsedAt === null
                      ? 'まだ使われていません'
                      : formatDateTime(connection.lastUsedAt)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {formatDateTime(connection.expiresAt)}
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => openDialog(connection)}
                      disabled={submitting}
                      aria-label={`${connection.user.displayName}の「${connection.appName}」の接続を取り消す`}
                      style={disabledLook(
                        {
                          ...buttonBase,
                          padding: '0.375rem 0.75rem',
                          backgroundColor: 'white',
                          color: '#b91c1c',
                          borderColor: '#b91c1c',
                        },
                        submitting
                      )}
                    >
                      取り消す
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageData !== null && pageData.pagination.total > 0 && (
        <PaginationUI
          pagination={pageData.pagination}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      )}

      <FocusManager
        isOpen={target !== null}
        onClose={closeDialog}
        closeOnEscape={!submitting}
        initialFocusRef={cancelRef as React.RefObject<HTMLElement>}
        returnFocusRef={returnFocusRef as React.RefObject<HTMLElement>}
        ariaLabelledBy={dialogTitleId}
      >
        {target !== null && (
          <div
            aria-describedby={dialogDescriptionId}
            style={{ width: 'min(32rem, calc(100vw - 4rem))', maxWidth: '100%' }}
          >
            <h2
              id={dialogTitleId}
              ref={dialogTitleRef}
              tabIndex={-1}
              style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.75rem' }}
            >
              接続の取り消し
            </h2>
            <div id={dialogDescriptionId} style={{ fontSize: '0.875rem', color: '#374151' }}>
              <p style={{ margin: '0 0 0.5rem', overflowWrap: 'anywhere' }}>
                {`${target.user.displayName}（${target.user.email}）の「${target.appName}」の接続を取り消しますか？`}
              </p>
              <p style={{ margin: '0 0 0.75rem' }}>
                取り消すと、このアプリはすぐにこの利用者の ArchiTrack
                のデータを使えなくなります。もう一度使うには、利用者がアプリから接続し直す必要があります。
              </p>
            </div>

            {revokeError && (
              <div
                ref={revokeErrorRef}
                role="alert"
                tabIndex={-1}
                style={{ ...alertStyle, marginBottom: '0.75rem' }}
              >
                {revokeError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginTop: '1rem',
              }}
            >
              <button
                ref={cancelRef}
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                style={disabledLook(
                  {
                    ...buttonBase,
                    backgroundColor: 'white',
                    color: '#374151',
                    borderColor: '#6b7280',
                  },
                  submitting
                )}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void confirmRevoke()}
                disabled={submitting}
                aria-busy={submitting}
                style={disabledLook(
                  { ...buttonBase, backgroundColor: '#b91c1c', color: 'white' },
                  submitting
                )}
              >
                {submitting ? '取り消し中...' : '取り消す'}
              </button>
            </div>
          </div>
        )}
      </FocusManager>
    </div>
  );
}

export default AdminExternalAppConnectionsPage;
