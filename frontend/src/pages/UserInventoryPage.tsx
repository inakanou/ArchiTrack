/**
 * @fileoverview ユーザー棚卸し画面（/admin/user-inventory）
 *
 * タスク49.6: 管理メニューから開く。全利用者の棚卸しの列と、状態・最終ログインからの経過日数の
 * 絞り込み、無効化・再有効化（理由の入力）・管理者による 2FA の再設定の操作を置く。
 * 自分自身の行の操作は無効にする。閲覧は user:read（管理者のルートの内側）、操作は user:manage。
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 管理者が他の利用者の 2FA を再設定する操作（確認の後に `POST /:id/2fa/reset`）
 * - REQ-36.10: 表示名・メールアドレス・ロール・状態・2FA 登録の有無・最終ログイン日時・作成日時・招待者の列
 * - REQ-36.11: 状態と最終ログインからの経過日数で絞り込む
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import FocusManager from '../components/FocusManager';
import { useAuth } from '../hooks/useAuth';
import { usePermission } from '../hooks/usePermission';
import { ApiError, getApiErrorCode } from '../api/client';
import {
  deactivateUser,
  getUserInventory,
  reactivateUser,
  resetUserTwoFactor,
  type UserInventoryItem,
  type UserInventoryPagination,
  type UserInventoryStatus,
} from '../api/user-inventory';

/** 1 ページの件数（API の既定と同じ） */
const PAGE_SIZE = 20;
/** 経過日数の上限（API の検証と同じ） */
const MAX_INACTIVE_DAYS = 36500;
/** 理由の上限の文字数（API の検証と同じ。前後の空白を除いて数える） */
const MAX_REASON_LENGTH = 1000;

type OperationKind = 'deactivate' | 'reactivate' | 'reset2fa';

interface OperationTarget {
  kind: OperationKind;
  user: UserInventoryItem;
}

/** 読み上げだけに残す文言の見た目の消し方 */
const visuallyHidden: React.CSSProperties = {
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

const thStyle: React.CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.875rem',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem',
  fontSize: '0.875rem',
  verticalAlign: 'top',
};

/** 長い一語の名前・メールアドレスでも列の中で折り返す（375 幅の画面のはみ出し対策） */
const wrapCellStyle: React.CSSProperties = {
  ...tdStyle,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minWidth: '8rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '0.375rem',
  border: '1px solid #6b7280',
  fontSize: '1rem',
  boxSizing: 'border-box',
};

const buttonBase: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid transparent',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const OPERATION_LABELS: Record<OperationKind, { title: string; confirm: string; done: string }> = {
  deactivate: { title: 'ユーザーを無効化', confirm: '無効化する', done: '無効化しました' },
  reactivate: { title: 'ユーザーを再有効化', confirm: '再有効化する', done: '再有効化しました' },
  reset2fa: {
    title: '2FAを再設定',
    confirm: '2FAを再設定する',
    done: 'の2FAを再設定しました',
  },
};

/** 日時の表示（他の管理画面と同じ ja-JP の書式） */
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ja-JP');
}

/**
 * 経過日数の入力を数へ直す。空なら null（絞り込まない）、不正なら undefined
 *
 * 日本語入力で全角の数字が入っても受け付ける（NFKC で半角へ寄せる）。入力の途中は拒まず、
 * 絞り込みの実行の時点で判定する。
 */
function parseInactiveDays(raw: string): number | null | undefined {
  const normalized = raw.normalize('NFKC').trim();
  if (normalized === '') {
    return null;
  }
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const value = Number(normalized);
  return value <= MAX_INACTIVE_DAYS ? value : undefined;
}

/** 操作の失敗を利用者に向けた文言へ直す */
function operationErrorMessage(kind: OperationKind, error: unknown): string {
  const code = getApiErrorCode(error);
  const status = error instanceof ApiError ? error.statusCode : null;
  switch (code) {
    case 'LAST_ACTIVE_ADMIN_PROTECTED':
      return '最後の有効なシステム管理者は無効化できません。先に他のシステム管理者を有効にしてください。';
    case 'ALREADY_IN_STATE':
      return kind === 'deactivate'
        ? 'このユーザーは既に無効化されています。一覧を最新の状態に更新しました。'
        : 'このユーザーは既に有効です。一覧を最新の状態に更新しました。';
    case 'SELF_DEACTIVATION_FORBIDDEN':
      return '自分自身のアカウントは無効化できません。';
    case 'SELF_RESET_FORBIDDEN':
      return '自分自身の2FAは再設定できません。';
    case 'USER_NOT_FOUND':
      return '対象のユーザーが見つかりません。削除された可能性があります。一覧を最新の状態に更新しました。';
    case 'VALIDATION_ERROR':
      return `理由を${MAX_REASON_LENGTH}文字以内で入力してください。`;
  }
  if (status === 403) {
    return 'この操作を行う権限がありません。';
  }
  if (status === 404) {
    return '対象のユーザーが見つかりません。削除された可能性があります。一覧を最新の状態に更新しました。';
  }
  const action =
    kind === 'deactivate' ? '無効化' : kind === 'reactivate' ? '再有効化' : '2FAの再設定';
  return `${action}に失敗しました。時間をおいて再度お試しください。`;
}

/** 失敗の後に一覧を取り直すべきか（対象の状態がこの画面の表示と食い違っている） */
function shouldReloadAfterError(error: unknown): boolean {
  const code = getApiErrorCode(error);
  return (
    code === 'ALREADY_IN_STATE' ||
    code === 'USER_NOT_FOUND' ||
    (error instanceof ApiError && error.statusCode === 404)
  );
}

export function UserInventoryPage() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const canManage = hasPermission('user:manage');
  const currentUserId = user?.id ?? null;

  const idPrefix = useId();
  const statusFilterId = `${idPrefix}-status`;
  const daysFilterId = `${idPrefix}-days`;
  const daysHelpId = `${idPrefix}-days-help`;
  const daysErrorId = `${idPrefix}-days-error`;
  const selfNoteId = `${idPrefix}-self-note`;
  const dialogTitleId = `${idPrefix}-dialog-title`;
  const dialogDescId = `${idPrefix}-dialog-desc`;
  const reasonId = `${idPrefix}-reason`;
  const reasonHelpId = `${idPrefix}-reason-help`;
  const reasonErrorId = `${idPrefix}-reason-error`;

  // 一覧
  const [items, setItems] = useState<UserInventoryItem[] | null>(null);
  const [pagination, setPagination] = useState<UserInventoryPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 絞り込み（適用中の条件）
  const [statusFilter, setStatusFilter] = useState<UserInventoryStatus | ''>('');
  const [inactiveDays, setInactiveDays] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  // 経過日数の入力欄（絞り込みの実行までは適用しない）
  const [daysInput, setDaysInput] = useState('');
  const [daysError, setDaysError] = useState('');

  // 操作
  const [operation, setOperation] = useState<OperationTarget | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState('');

  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    getUserInventory({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(inactiveDays !== null ? { inactiveDaysAtLeast: inactiveDays } : {}),
      page,
      limit: PAGE_SIZE,
    })
      .then((response) => {
        if (cancelled) return;
        // 操作で件数が減り、表示中のページが範囲外になったときは最後のページへ寄せる
        const lastPage = Math.max(1, response.pagination.totalPages);
        if (response.data.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setItems(response.data);
        setPagination(response.pagination);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('ユーザーの一覧を取得できませんでした。時間をおいて再度お試しください。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, inactiveDays, page, reloadToken]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value === 'active' || value === 'inactive' ? value : '');
    setPage(1);
  };

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseInactiveDays(daysInput);
    if (parsed === undefined) {
      setDaysError(`経過日数は0〜${MAX_INACTIVE_DAYS}の整数で入力してください`);
      return;
    }
    setDaysError('');
    setInactiveDays(parsed);
    setPage(1);
  };

  const handleClearFilters = () => {
    setStatusFilter('');
    setInactiveDays(null);
    setDaysInput('');
    setDaysError('');
    setPage(1);
  };

  const openOperation = (kind: OperationKind, target: UserInventoryItem) => {
    setOperation({ kind, user: target });
    setReason('');
    setReasonError('');
    setOperationError('');
    setNotice('');
    setComposing(false);
  };

  const closeOperation = useCallback(() => {
    if (submitting) return;
    setOperation(null);
  }, [submitting]);

  const handleConfirm = async () => {
    if (!operation) return;
    const { kind, user: target } = operation;
    const needsReason = kind !== 'reset2fa';
    const trimmedReason = reason.trim();
    if (needsReason) {
      if (trimmedReason.length === 0) {
        setReasonError('理由を入力してください');
        reasonRef.current?.focus();
        return;
      }
      if (trimmedReason.length > MAX_REASON_LENGTH) {
        setReasonError(`理由は${MAX_REASON_LENGTH}文字以内で入力してください`);
        reasonRef.current?.focus();
        return;
      }
    }
    setReasonError('');
    setOperationError('');
    setSubmitting(true);
    try {
      if (kind === 'deactivate') {
        await deactivateUser(target.id, trimmedReason);
      } else if (kind === 'reactivate') {
        await reactivateUser(target.id, trimmedReason);
      } else {
        await resetUserTwoFactor(target.id);
      }
      setOperation(null);
      setNotice(
        kind === 'reset2fa'
          ? `${target.displayName}${OPERATION_LABELS.reset2fa.done}`
          : `${target.displayName}を${OPERATION_LABELS[kind].done}`
      );
      reload();
    } catch (error) {
      setOperationError(operationErrorMessage(kind, error));
      if (shouldReloadAfterError(error)) {
        reload();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = pagination?.totalPages ?? 0;
  const hasFilter = statusFilter !== '' || inactiveDays !== null;
  const reasonRequired = operation !== null && operation.kind !== 'reset2fa';

  return (
    <div
      data-testid="user-inventory-container"
      style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem', minWidth: 0 }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        ユーザー棚卸し
      </h1>
      <p style={{ color: '#4b5563', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        全ユーザーの状態と利用状況を確認できます。一覧はログインの実績が無いユーザーを先頭に、最終ログインの古い順に並びます。
      </p>

      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: '#d1fae5',
            color: '#065f46',
            marginBottom: '1rem',
            overflowWrap: 'anywhere',
          }}
        >
          {notice}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            marginBottom: '1rem',
          }}
        >
          {loadError}
        </div>
      )}

      {/* 絞り込み（要件36.11） */}
      <form
        role="search"
        aria-label="ユーザーの絞り込み"
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
        <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
          <label
            htmlFor={statusFilterId}
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            状態
          </label>
          <select
            id={statusFilterId}
            value={statusFilter}
            onChange={(event) => handleStatusChange(event.target.value)}
            style={inputStyle}
          >
            <option value="">すべて</option>
            <option value="active">有効</option>
            <option value="inactive">無効</option>
          </select>
        </div>
        <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
          <label
            htmlFor={daysFilterId}
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
          >
            最終ログインからの経過日数（以上）
          </label>
          <input
            id={daysFilterId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={daysInput}
            onChange={(event) => setDaysInput(event.target.value)}
            aria-invalid={daysError ? true : undefined}
            aria-describedby={daysError ? `${daysHelpId} ${daysErrorId}` : daysHelpId}
            style={inputStyle}
          />
          <p
            id={daysHelpId}
            style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}
          >
            ログインの実績が無いユーザーは作成日時から数えます。空欄なら絞り込みません。
          </p>
          {daysError && (
            <p
              id={daysErrorId}
              role="alert"
              style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: '0.25rem' }}
            >
              {daysError}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="submit"
            style={{
              ...buttonBase,
              backgroundColor: '#1d4ed8',
              color: 'white',
              padding: '0.5rem 1rem',
            }}
          >
            絞り込む
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            disabled={!hasFilter && daysInput === ''}
            style={{
              ...buttonBase,
              backgroundColor: 'white',
              color: '#374151',
              borderColor: '#6b7280',
              padding: '0.5rem 1rem',
            }}
          >
            条件をクリア
          </button>
        </div>
      </form>

      {canManage && (
        <p id={selfNoteId} style={visuallyHidden}>
          自分自身のアカウントはこの画面から操作できません
        </p>
      )}

      {loading && items === null && (
        <div role="status" style={{ textAlign: 'center', padding: '2rem', color: '#4b5563' }}>
          読み込み中...
        </div>
      )}

      {items !== null && items.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#4b5563' }}>
          条件に合うユーザーはいません
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div
          data-testid="user-inventory-table-wrapper"
          style={{ overflowX: 'auto', maxWidth: '100%' }}
          aria-busy={loading}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white',
            }}
          >
            <caption style={visuallyHidden}>ユーザー棚卸しの一覧</caption>
            <thead style={{ backgroundColor: '#f3f4f6' }}>
              <tr>
                <th scope="col" style={thStyle}>
                  表示名
                </th>
                <th scope="col" style={thStyle}>
                  メールアドレス
                </th>
                <th scope="col" style={thStyle}>
                  ロール
                </th>
                <th scope="col" style={thStyle}>
                  状態
                </th>
                <th scope="col" style={thStyle}>
                  2FA登録
                </th>
                <th scope="col" style={thStyle}>
                  最終ログイン日時
                </th>
                <th scope="col" style={thStyle}>
                  作成日時
                </th>
                <th scope="col" style={thStyle}>
                  招待者
                </th>
                {canManage && (
                  <th scope="col" style={thStyle}>
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isSelf = item.id === currentUserId;
                const isActive = item.status === 'active';
                return (
                  <tr
                    key={item.id}
                    data-testid={`user-inventory-row-${item.id}`}
                    style={{ borderTop: '1px solid #e5e7eb' }}
                  >
                    <th
                      scope="row"
                      style={{ ...wrapCellStyle, fontWeight: 600, textAlign: 'left' }}
                    >
                      {item.displayName}
                    </th>
                    <td style={wrapCellStyle}>{item.email}</td>
                    <td style={{ ...tdStyle, overflowWrap: 'anywhere' }}>
                      {item.roles.length > 0 ? item.roles.join('、') : '—'}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: isActive ? '#d1fae5' : '#e5e7eb',
                          color: isActive ? '#065f46' : '#1f2937',
                        }}
                      >
                        {isActive ? '有効' : '無効'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {item.twoFactorEnabled ? '登録済み' : '未登録'}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {item.lastLoginAt ? (
                        formatDateTime(item.lastLoginAt)
                      ) : (
                        <>
                          <span aria-hidden="true">—</span>
                          <span style={visuallyHidden}>ログインの実績なし</span>
                        </>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {formatDateTime(item.createdAt)}
                    </td>
                    <td style={{ ...tdStyle, overflowWrap: 'anywhere' }}>
                      {item.invitedBy ? item.invitedBy.displayName : '—'}
                    </td>
                    {canManage && (
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() =>
                              openOperation(isActive ? 'deactivate' : 'reactivate', item)
                            }
                            disabled={isSelf}
                            aria-label={`${item.displayName}を${isActive ? '無効化' : '再有効化'}`}
                            aria-describedby={isSelf ? selfNoteId : undefined}
                            style={{
                              ...buttonBase,
                              backgroundColor: isSelf
                                ? '#e5e7eb'
                                : isActive
                                  ? '#fee2e2'
                                  : '#dbeafe',
                              color: isSelf ? '#4b5563' : isActive ? '#991b1b' : '#1e40af',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isActive ? '無効化' : '再有効化'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openOperation('reset2fa', item)}
                            disabled={isSelf}
                            aria-label={`${item.displayName}の2FAを再設定`}
                            aria-describedby={isSelf ? selfNoteId : undefined}
                            style={{
                              ...buttonBase,
                              backgroundColor: isSelf ? '#e5e7eb' : '#fef3c7',
                              color: isSelf ? '#4b5563' : '#92400e',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                            }}
                          >
                            2FAを再設定
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ページ送り */}
      {pagination && totalPages > 1 && (
        <nav
          aria-label="ページ送り"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '1.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            style={{
              ...buttonBase,
              backgroundColor: '#f3f4f6',
              color: '#374151',
              padding: '0.5rem 1rem',
            }}
          >
            前へ
          </button>
          <span aria-live="polite" style={{ fontWeight: 500 }}>
            {page} / {totalPages} ページ（全 {pagination.total} 件）
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || loading}
            style={{
              ...buttonBase,
              backgroundColor: '#f3f4f6',
              color: '#374151',
              padding: '0.5rem 1rem',
            }}
          >
            次へ
          </button>
        </nav>
      )}
      {pagination && totalPages <= 1 && pagination.total > 0 && (
        <p style={{ marginTop: '1rem', textAlign: 'center', color: '#4b5563' }}>
          全 {pagination.total} 件
        </p>
      )}

      {/* 操作の確認（無効化・再有効化は理由の入力、2FA の再設定は影響の確認） */}
      <FocusManager
        isOpen={operation !== null}
        onClose={closeOperation}
        closeOnEscape={!submitting && !composing}
        initialFocusRef={(reasonRequired ? reasonRef : cancelRef) as React.RefObject<HTMLElement>}
        ariaLabelledBy={dialogTitleId}
      >
        {operation && (
          <div
            aria-describedby={dialogDescId}
            style={{ width: 'min(32rem, calc(100vw - 4rem))', maxWidth: '100%' }}
          >
            <h2
              id={dialogTitleId}
              style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.75rem' }}
            >
              {OPERATION_LABELS[operation.kind].title}
            </h2>
            <div id={dialogDescId} style={{ fontSize: '0.875rem', color: '#374151' }}>
              <p style={{ marginBottom: '0.5rem', overflowWrap: 'anywhere' }}>
                対象: {operation.user.displayName}（{operation.user.email}）
              </p>
              {operation.kind === 'deactivate' && (
                <p style={{ marginBottom: '0.75rem' }}>
                  無効化すると、このユーザーは全ての端末からログアウトし、再有効化するまでログインできません。全てのシステム管理者に通知されます。
                </p>
              )}
              {operation.kind === 'reactivate' && (
                <p style={{ marginBottom: '0.75rem' }}>
                  再有効化すると、このユーザーは再びログインできるようになります。全てのシステム管理者に通知されます。
                </p>
              )}
              {operation.kind === 'reset2fa' && (
                <p style={{ marginBottom: '0.75rem' }}>
                  2FAを再設定すると、このユーザーの認証アプリの登録とバックアップコードを削除し、全ての端末からログアウトさせます。次回のログインで2FAの設定が必要になります。
                </p>
              )}
            </div>

            {reasonRequired && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label
                  htmlFor={reasonId}
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}
                >
                  理由（必須）
                </label>
                <textarea
                  id={reasonId}
                  ref={reasonRef}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  onCompositionStart={() => setComposing(true)}
                  onCompositionEnd={() => setComposing(false)}
                  rows={3}
                  required
                  aria-required="true"
                  aria-invalid={reasonError ? true : undefined}
                  aria-describedby={reasonError ? `${reasonHelpId} ${reasonErrorId}` : reasonHelpId}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <p
                  id={reasonHelpId}
                  style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '0.25rem' }}
                >
                  監査ログに記録されます（{MAX_REASON_LENGTH}文字以内）。
                </p>
                {reasonError && (
                  <p
                    id={reasonErrorId}
                    role="alert"
                    style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: '0.25rem' }}
                  >
                    {reasonError}
                  </p>
                )}
              </div>
            )}

            {operationError && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                {operationError}
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
                onClick={closeOperation}
                disabled={submitting}
                style={{
                  ...buttonBase,
                  backgroundColor: 'white',
                  color: '#374151',
                  borderColor: '#6b7280',
                  padding: '0.5rem 1rem',
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                style={{
                  ...buttonBase,
                  backgroundColor: operation.kind === 'reactivate' ? '#1d4ed8' : '#b91c1c',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '処理中...' : OPERATION_LABELS[operation.kind].confirm}
              </button>
            </div>
          </div>
        )}
      </FocusManager>
    </div>
  );
}
