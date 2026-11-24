/**
 * @fileoverview 連携中のアプリの画面（user-authentication タスク78.2）
 *
 * design.md「Requirements 46-51」の ConnectedAppsPage に従う。経路は `/connected-apps`（既存の
 * ProtectedRoute の内側。制限中の利用者は既存の扱いで設定の画面へ移る）。プロフィールの画面から導線を置く。
 * - 本人の接続ごとにアプリの名称・操作の範囲・同意の日時・最後に使われた日時・期限を示す（49.1）。
 *   期限は API が返す実際に使えなくなる日時。決まり（未使用 30 日・同意から 90 日）は同意の画面と同じ言い回し
 * - 接続が無ければ連携中のアプリが無いことを示す（49.2）
 * - 取り消しはアプリの名称を示した確認のダイアログの後に、CSRF トークン付きの手段で DELETE を送る（49.3、49.4）。
 *   成功したら一覧から消して知らせ、404 は一覧を読み直して終了済みと知らせ、失敗は再試行を促す
 * - 接続の ID・Grant・トークンは表示しない（ID は取り消しの要求にだけ使う）
 *
 * @requirement user-authentication/REQ-49.1
 * @requirement user-authentication/REQ-49.2
 * @requirement user-authentication/REQ-49.3
 */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { ApiError } from '../api/client';
import {
  listOwnExternalAppConnections,
  revokeOwnExternalAppConnection,
  type ExternalAppConnection,
  type ExternalAppScope,
} from '../api/external-apps';
import FocusManager from '../components/FocusManager';
import { formatDateTime } from '../utils/formatters';

/** 最後に使われてから接続が切れるまでの日数（backend の CONNECTION_IDLE_MS。要件48.2） */
const CONNECTION_IDLE_DAYS = 30;
/** 同意から接続が切れるまでの日数（backend の CONNECTION_ABSOLUTE_MS。要件48.3） */
const CONNECTION_ABSOLUTE_DAYS = 90;

const SCOPE_LABELS: Record<ExternalAppScope, string> = {
  read: '読み取り',
  write: '書き込み',
};

const LOAD_ERROR_MESSAGE = '連携中のアプリを読み込めませんでした。時間をおいて再試行してください。';
const LOAD_NETWORK_ERROR_MESSAGE =
  '連携中のアプリを読み込めませんでした。ネットワーク接続を確認してください。';
const REVOKE_ERROR_MESSAGE = '接続を取り消せませんでした。時間をおいて再試行してください。';
const REVOKE_NETWORK_ERROR_MESSAGE =
  '接続を取り消せませんでした。ネットワーク接続を確認して、もう一度お試しください。';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly connections: readonly ExternalAppConnection[] };

function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 0;
}

/** 操作の範囲を読める日本語にする（未知の値は出さない） */
function scopeText(scopes: readonly ExternalAppScope[]): string {
  return scopes
    .filter((scope): scope is ExternalAppScope =>
      Object.prototype.hasOwnProperty.call(SCOPE_LABELS, scope)
    )
    .map((scope) => SCOPE_LABELS[scope])
    .join('、');
}

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

const termStyle: CSSProperties = { color: '#4b5563' };
const valueStyle: CSSProperties = { margin: 0, wordBreak: 'break-all' };

function disabledLook(style: CSSProperties, disabled: boolean): CSSProperties {
  return disabled ? { ...style, opacity: 0.6, cursor: 'not-allowed' } : style;
}

/**
 * 連携中のアプリの画面
 */
export function ConnectedAppsPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [loadCount, setLoadCount] = useState(0);
  /** 確認中の取り消しの対象。null はダイアログを閉じている */
  const [target, setTarget] = useState<ExternalAppConnection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  /** 取り消しの結果の知らせ（常に置いた role="status" の領域で読み上げる） */
  const [announcement, setAnnouncement] = useState('');

  /** 送信中か（同期で判定して二重の送信を防ぐ） */
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** ダイアログを閉じた後のフォーカスの戻り先。null なら開く前の要素（取り消しのボタン）へ戻る */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const headingId = useId();
  const rulesHeadingId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listOwnExternalAppConnections()
      .then((connections) => {
        if (!cancelled) setList({ status: 'ready', connections });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setList({
          status: 'error',
          message: isNetworkError(error) ? LOAD_NETWORK_ERROR_MESSAGE : LOAD_ERROR_MESSAGE,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [loadCount]);

  const retryLoad = () => {
    setList({ status: 'loading' });
    setLoadCount((count) => count + 1);
  };

  /** 表示中の一覧を残したまま読み直す（404 の後に使う） */
  const refreshList = async () => {
    try {
      const connections = await listOwnExternalAppConnections();
      if (mountedRef.current) setList({ status: 'ready', connections });
    } catch (error) {
      if (!mountedRef.current) return;
      setList({
        status: 'error',
        message: isNetworkError(error) ? LOAD_NETWORK_ERROR_MESSAGE : LOAD_ERROR_MESSAGE,
      });
    }
  };

  const removeFromList = (connectionId: string) => {
    setList((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            connections: current.connections.filter((item) => item.id !== connectionId),
          }
        : current
    );
  };

  const openDialog = (connection: ExternalAppConnection) => {
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
    const { id, appName } = target;
    try {
      await revokeOwnExternalAppConnection(id);
      if (!mountedRef.current) return;
      removeFromList(id);
      finishRevoke(`「${appName}」の接続を取り消しました。`);
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof ApiError && error.statusCode === 404) {
        removeFromList(id);
        finishRevoke(`「${appName}」の接続はすでに終了していました。一覧を更新しました。`);
        void refreshList();
        return;
      }
      setRevokeError(isNetworkError(error) ? REVOKE_NETWORK_ERROR_MESSAGE : REVOKE_ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="connected-apps-container"
      style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem', minWidth: 0 }}
    >
      <h1
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem' }}
      >
        連携中のアプリ
      </h1>

      <a
        href="/profile"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#1d4ed8',
          textDecoration: 'underline',
          marginBottom: '1.5rem',
        }}
      >
        ← プロフィールに戻る
      </a>

      <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1rem' }}>
        あなたの ArchiTrack
        のアカウントへの接続を許可した外部アプリです。使わなくなったアプリの接続は取り消してください。
      </p>

      <section
        aria-labelledby={rulesHeadingId}
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
        }}
      >
        <h2 id={rulesHeadingId} style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          接続の期限
        </h2>
        <p style={{ margin: '0 0 0.25rem' }}>接続は、次のどちらか早い時点で切れます。</p>
        <ul style={{ margin: '0 0 0.25rem', paddingLeft: '1.25rem' }}>
          <li>最後に使われてから {CONNECTION_IDLE_DAYS} 日間使われなかったとき</li>
          <li>同意から {CONNECTION_ABSOLUTE_DAYS} 日が過ぎたとき（使っていても延長されません）</li>
        </ul>
        <p style={{ margin: 0, color: '#4b5563' }}>
          各アプリの「期限」は、この決まりで実際に使えなくなる日時です。切れた後は、アプリから接続し直してください。
        </p>
      </section>

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
              }
            : undefined
        }
      >
        {announcement}
      </div>

      {list.status === 'loading' && (
        <div aria-live="polite" style={{ textAlign: 'center', padding: '2rem', color: '#4b5563' }}>
          読み込み中...
        </div>
      )}

      {list.status === 'error' && (
        <div
          role="alert"
          style={{
            ...alertStyle,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <span>{list.message}</span>
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
        </div>
      )}

      {list.status === 'ready' && list.connections.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#4b5563' }}>
          <p style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>連携中のアプリはありません。</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            外部アプリから接続を申し込むと、同意の後にここに表示されます。
          </p>
        </div>
      )}

      {list.status === 'ready' && list.connections.length > 0 && (
        <ul
          aria-labelledby={headingId}
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {list.connections.map((connection) => (
            <li
              key={connection.id}
              style={{
                padding: '1.25rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                backgroundColor: 'white',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                <h2
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    margin: 0,
                    wordBreak: 'break-all',
                    minWidth: 0,
                  }}
                >
                  {connection.appName}
                </h2>
                <button
                  type="button"
                  onClick={() => openDialog(connection)}
                  disabled={submitting}
                  aria-label={`「${connection.appName}」の接続を取り消す`}
                  style={disabledLook(
                    {
                      ...buttonBase,
                      backgroundColor: 'white',
                      color: '#b91c1c',
                      borderColor: '#b91c1c',
                    },
                    submitting
                  )}
                >
                  取り消す
                </button>
              </div>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content 1fr',
                  gap: '0.25rem 1rem',
                  fontSize: '0.875rem',
                  margin: 0,
                }}
              >
                <dt style={termStyle}>許可している操作</dt>
                <dd style={valueStyle}>{scopeText(connection.scopes)}</dd>
                <dt style={termStyle}>同意した日時</dt>
                <dd style={valueStyle}>{formatDateTime(connection.consentedAt)}</dd>
                <dt style={termStyle}>最後に使われた日時</dt>
                <dd style={valueStyle}>
                  {connection.lastUsedAt === null
                    ? 'まだ使われていません'
                    : formatDateTime(connection.lastUsedAt)}
                </dd>
                <dt style={termStyle}>期限</dt>
                <dd style={valueStyle}>{formatDateTime(connection.expiresAt)}</dd>
              </dl>
            </li>
          ))}
        </ul>
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
              style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.75rem' }}
            >
              接続の取り消し
            </h2>
            <div id={dialogDescriptionId} style={{ fontSize: '0.875rem', color: '#374151' }}>
              <p style={{ margin: '0 0 0.5rem', wordBreak: 'break-all' }}>
                「{target.appName}」の接続を取り消しますか？
              </p>
              <p style={{ margin: '0 0 0.75rem' }}>
                取り消すと、このアプリはすぐに ArchiTrack
                のデータを使えなくなります。もう一度使うには、アプリから接続し直してください。
              </p>
            </div>

            {revokeError && (
              <div role="alert" style={{ ...alertStyle, marginBottom: '0.75rem' }}>
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

export default ConnectedAppsPage;
