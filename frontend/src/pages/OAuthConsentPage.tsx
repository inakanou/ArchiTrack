/**
 * @fileoverview 外部アプリの接続の同意の画面（user-authentication タスク78.1）
 *
 * design.md「Requirements 46-51」の ConsentPage に従う。経路は `/connect/consent/:uid`（ProtectedRoute の内側）。
 * - 申し込みについて 2FA を通してから、アプリ名・戻り先のホスト名・利用者・範囲・期限を示し、同意か拒否を受ける
 * - 「読み取り」は外せず、「書き込み」は既定で未選択。`offline_access` は選択肢に出さない（47.5）
 * - 同意・拒否の後は応答の `redirectTo` へ全ページで遷移する。URL は画面で組み立てない
 * - 送信中は二重の送信を受けず、ページの離脱に確認を出す（タスク74.2 の申し送り）
 * - パスワード変更・2FA 登録を求められている利用者には操作を出さず、設定を済ませてからアプリで接続し直すよう
 *   案内する（要件34.2 に例外を作らない。2026-11-24 の利用者の判断）
 * - 案内には URL の値（uid など）を表示しない
 *
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.5
 * @requirement user-authentication/REQ-47.11
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, getApiErrorCode } from '../api/client';
import {
  approveConsent,
  denyConsent,
  getConsentInteraction,
  isValidInteractionUid,
  verifyConsentSecondFactor,
  type ConsentInteractionView,
  type ConsentSecondFactorCode,
  type ExternalAppScope,
} from '../api/external-apps';
import TwoFactorVerificationForm from '../components/TwoFactorVerificationForm';
import { useAuth } from '../hooks/useAuth';
import type { VerifyTOTPResult } from '../types/two-factor.types';
import { navigateFullPage } from '../utils/full-page-navigation';
import {
  getUserRestriction,
  isUserRestrictionCode,
  restrictedPathFor,
  type UserRestriction,
} from '../utils/user-restriction';

/** 2FA の入力欄に常に示す注意（ログイン直後の同じコードは再利用として拒まれ、失敗に数えられる） */
export const CONSENT_NEXT_CODE_NOTICE =
  'ログインで使ったコードは使えません。次のコードをお待ちください';

/** 画面の全体の案内の種類 */
type PageErrorKind =
  | 'reconnect'
  | 'permission'
  | 'invalidRequest'
  | 'unavailable'
  | 'network'
  | 'unknown';

type PageError =
  | { readonly kind: PageErrorKind }
  | { readonly kind: 'restricted'; readonly restriction: UserRestriction };

type PageState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly error: PageError }
  | {
      readonly phase: 'second-factor';
      readonly view: ConsentInteractionView;
      readonly notice?: string;
    }
  | { readonly phase: 'consent'; readonly view: ConsentInteractionView }
  | { readonly phase: 'redirecting' };

type PendingAction = 'second-factor' | 'approve' | 'deny';

const PAGE_ERROR_MESSAGES: Record<PageErrorKind, string> = {
  reconnect:
    '接続の申し込みが見つからないか、有効期限が切れました。アプリから接続し直してください。',
  permission: '外部アプリを接続する権限がありません。管理者に依頼してください。',
  invalidRequest:
    'アプリの申し込みの内容に誤りがあるため接続できません。接続を拒否してアプリへ戻ってください。',
  unavailable: '現在処理できません。時間をおいて再試行してください。',
  network: 'ネットワーク接続を確認してください。',
  unknown: '処理に失敗しました。時間をおいて再試行してください。',
};

const RETRYABLE_KINDS: readonly PageErrorKind[] = ['unavailable', 'network', 'unknown'];

const DENIABLE_KINDS: readonly PageErrorKind[] = ['permission', 'invalidRequest'];

function restrictedMessage(restriction: UserRestriction): string {
  const reason =
    restriction === 'PASSWORD_CHANGE_REQUIRED'
      ? 'パスワードの変更が済んでいないため'
      : '二要素認証の設定が済んでいないため';
  return `${reason}、外部アプリを接続できません。設定を済ませてからアプリで接続し直してください。`;
}

/** API の失敗を画面の全体の案内へ写す（design.md の Error Handling） */
function pageErrorOf(error: unknown): PageError {
  if (!(error instanceof ApiError)) {
    return { kind: 'unknown' };
  }
  const code = getApiErrorCode(error);
  if (error.statusCode === 403 && isUserRestrictionCode(code)) {
    return { kind: 'restricted', restriction: code };
  }
  if (error.statusCode === 404) {
    return { kind: 'reconnect' };
  }
  if (error.statusCode === 403 && code === 'PERMISSION_REQUIRED') {
    return { kind: 'permission' };
  }
  if (error.statusCode === 400) {
    return { kind: 'invalidRequest' };
  }
  if (error.statusCode === 503) {
    return { kind: 'unavailable' };
  }
  if (error.statusCode === 0) {
    return { kind: 'network' };
  }
  return { kind: 'unknown' };
}

function readResponseField(error: ApiError, field: string): unknown {
  const body = error.response;
  return body !== null && typeof body === 'object' && field in body
    ? (body as Record<string, unknown>)[field]
    : undefined;
}

/**
 * 2FA の入力のその場で示す失敗の文言。画面の全体の案内にする失敗は null
 */
function secondFactorErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const code = getApiErrorCode(error);
  if (error.statusCode === 400 && code === 'SECOND_FACTOR_FAILED') {
    return '認証コードが正しくありません。';
  }
  if (error.statusCode === 400 && code === 'INVALID_REQUEST') {
    return '認証コードの形式が正しくありません。';
  }
  if (error.statusCode === 403 && code === 'SECOND_FACTOR_LOCKED') {
    const unlockAt = new Date(String(readResponseField(error, 'unlockAt')));
    return Number.isNaN(unlockAt.getTime())
      ? '二要素認証が一時的にロックされました。時間をおいて再試行してください。'
      : `二要素認証が一時的にロックされました。${unlockAt.toLocaleString('ja-JP')} 以降に再試行してください。`;
  }
  if (error.statusCode === 429) {
    const retryAfter = Number(readResponseField(error, 'retryAfter'));
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? `試行回数の上限に達しました。${Math.ceil(retryAfter)} 秒ほど待ってから再試行してください。`
      : '試行回数の上限に達しました。しばらく時間をおいて再試行してください。';
  }
  if (error.statusCode === 0) {
    return 'ネットワーク接続を確認してください。';
  }
  return null;
}

/** 申し込みの範囲のうち、画面で選べるもの（`offline_access` などは出さない） */
function selectableScopes(view: ConsentInteractionView): { read: boolean; write: boolean } {
  return {
    read: view.requestedScopes.includes('read'),
    write: view.requestedScopes.includes('write'),
  };
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#f3f4f6',
  padding: '1rem',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '32rem',
  padding: '2rem',
  backgroundColor: 'white',
  borderRadius: '0.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const alertStyle: CSSProperties = {
  padding: '0.75rem',
  marginBottom: '1.5rem',
  backgroundColor: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: '0.375rem',
  color: '#991b1b',
  fontSize: '0.875rem',
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
};

const primaryButtonStyle: CSSProperties = {
  flex: 1,
  padding: '0.625rem 1.25rem',
  backgroundColor: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  flex: 1,
  padding: '0.625rem 1.25rem',
  backgroundColor: '#fff',
  color: '#1f2937',
  border: '1px solid #9ca3af',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
};

function disabledLook(style: CSSProperties, disabled: boolean): CSSProperties {
  return disabled ? { ...style, opacity: 0.6, cursor: 'not-allowed' } : style;
}

/**
 * 外部アプリの接続の同意の画面
 */
export function OAuthConsentPage() {
  const params = useParams<{ uid: string }>();
  const uid = isValidInteractionUid(params.uid) ? params.uid : null;
  const { user } = useAuth();
  const userRestriction = getUserRestriction(user);

  const [state, setState] = useState<PageState>({ phase: 'loading' });
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [writeSelected, setWriteSelected] = useState(false);
  const [loadCount, setLoadCount] = useState(0);
  /** 送信中か（同期で判定して二重の送信を防ぎ、離脱の確認にも使う） */
  const busyRef = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  /** 同意の内容の説明の文（2FA を通って切り替わったときにフォーカスを移す） */
  const introRef = useRef<HTMLParagraphElement>(null);
  const focusIntroRef = useRef(false);
  const readDescriptionId = useId();
  const writeDescriptionId = useId();
  const detailsHeadingId = useId();
  const expiryHeadingId = useId();

  const isRestricted = userRestriction !== null;

  // 申し込みの内容を読む。uid の形が不正なとき・制限中の利用者には API を呼ばない
  useEffect(() => {
    if (uid === null || isRestricted) {
      return;
    }
    let cancelled = false;
    setState({ phase: 'loading' });
    setActionError(null);
    getConsentInteraction(uid)
      .then((view) => {
        if (cancelled) return;
        setWriteSelected(false);
        setState(
          view.secondFactorVerified ? { phase: 'consent', view } : { phase: 'second-factor', view }
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ phase: 'error', error: pageErrorOf(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, isRestricted, loadCount]);

  // 送信中のページの離脱に確認を出す。遷移の直前に busyRef を下ろすので全ページの遷移は止めない
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!busyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 案内を出したら案内へフォーカスを移す（スクリーンリーダーにも role="alert" で知らせる）
  const alertKey =
    uid === null
      ? 'invalid'
      : isRestricted
        ? 'restricted'
        : actionError
          ? `action:${actionError}`
          : state.phase === 'error'
            ? `error:${state.error.kind}`
            : state.phase === 'second-factor' && state.notice
              ? 'second-factor-notice'
              : null;
  useEffect(() => {
    if (alertKey !== null) {
      alertRef.current?.focus();
    }
  }, [alertKey]);

  // 2FA を通って同意の内容へ切り替わったら、説明の文へフォーカスを移す
  useEffect(() => {
    if (state.phase === 'consent' && focusIntroRef.current) {
      focusIntroRef.current = false;
      introRef.current?.focus();
    }
  }, [state.phase]);

  const beginAction = (action: PendingAction): boolean => {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    setPending(action);
    setActionError(null);
    return true;
  };

  const endAction = () => {
    busyRef.current = false;
    setPending(null);
  };

  const submitDecision = async (
    decision: 'approve' | 'deny',
    view: ConsentInteractionView | null
  ): Promise<void> => {
    if (uid === null || !beginAction(decision)) {
      return;
    }
    try {
      const scopes: ExternalAppScope[] = writeSelected ? ['read', 'write'] : ['read'];
      const { redirectTo } =
        decision === 'approve' ? await approveConsent(uid, scopes) : await denyConsent(uid);
      // 遷移の離脱の確認を出さないよう先に下ろす。遷移までの間は操作を出さない
      busyRef.current = false;
      setState({ phase: 'redirecting' });
      navigateFullPage(redirectTo);
    } catch (error) {
      endAction();
      const code = getApiErrorCode(error);
      if (
        error instanceof ApiError &&
        error.statusCode === 403 &&
        code === 'SECOND_FACTOR_REQUIRED' &&
        view !== null
      ) {
        setState({
          phase: 'second-factor',
          view,
          notice: '二要素認証の確認の有効期限が切れました。もう一度コードを入力してください。',
        });
        return;
      }
      const pageError = pageErrorOf(error);
      if (pageError.kind !== 'restricted' && RETRYABLE_KINDS.includes(pageError.kind)) {
        setActionError(PAGE_ERROR_MESSAGES[pageError.kind]);
        return;
      }
      setState({ phase: 'error', error: pageError });
    }
  };

  const verifySecondFactor = async (
    view: ConsentInteractionView,
    code: ConsentSecondFactorCode
  ): Promise<VerifyTOTPResult> => {
    if (uid === null || !beginAction('second-factor')) {
      return { success: false, error: '処理中です。しばらくお待ちください。' };
    }
    try {
      await verifyConsentSecondFactor(uid, code);
      endAction();
      focusIntroRef.current = true;
      setState({ phase: 'consent', view });
      return { success: true };
    } catch (error) {
      endAction();
      const message = secondFactorErrorMessage(error);
      if (message !== null) {
        return { success: false, error: message };
      }
      setState({ phase: 'error', error: pageErrorOf(error) });
      return { success: false, error: '' };
    }
  };

  // フォーカスを移す案内は 1 つだけ（並べて出すときは後の案内に ref を付ける）
  const renderAlert = (message: string, focusTarget = true) => (
    <div
      ref={focusTarget ? alertRef : undefined}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      style={alertStyle}
    >
      {message}
    </div>
  );

  const renderShell = (content: ReactNode) => (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          外部アプリの接続
        </h1>
        {content}
      </div>
    </main>
  );

  const denyButton = (label: string) => (
    <button
      type="button"
      onClick={() => void submitDecision('deny', null)}
      disabled={pending !== null}
      aria-busy={pending === 'deny'}
      style={disabledLook(secondaryButtonStyle, pending !== null)}
    >
      {label}
    </button>
  );

  // 制限中の利用者（要件34.2）: 操作を出さず案内だけを出す。API は呼ばない
  const restriction =
    userRestriction ??
    (state.phase === 'error' && state.error.kind === 'restricted' ? state.error.restriction : null);
  if (restriction !== null) {
    return renderShell(
      <>
        {renderAlert(restrictedMessage(restriction))}
        <p style={{ textAlign: 'center', fontSize: '0.875rem' }}>
          <Link to={restrictedPathFor(restriction)} style={{ color: '#1d4ed8' }}>
            設定へ進む
          </Link>
        </p>
      </>
    );
  }

  if (uid === null) {
    return renderShell(renderAlert(PAGE_ERROR_MESSAGES.reconnect));
  }

  if (state.phase === 'loading') {
    return renderShell(
      <div role="status" aria-live="polite" style={{ textAlign: 'center', color: '#4b5563' }}>
        読み込み中...
      </div>
    );
  }

  if (state.phase === 'redirecting') {
    return renderShell(
      <div role="status" aria-live="polite" style={{ textAlign: 'center', color: '#4b5563' }}>
        アプリへ戻っています...
      </div>
    );
  }

  if (state.phase === 'error' && state.error.kind !== 'restricted') {
    const { kind } = state.error;
    return renderShell(
      <>
        {renderAlert(PAGE_ERROR_MESSAGES[kind], actionError === null)}
        {actionError && renderAlert(actionError)}
        {RETRYABLE_KINDS.includes(kind) && (
          <div style={{ display: 'flex' }}>
            <button
              type="button"
              onClick={() => setLoadCount((count) => count + 1)}
              style={primaryButtonStyle}
            >
              再試行
            </button>
          </div>
        )}
        {DENIABLE_KINDS.includes(kind) && (
          <div style={{ display: 'flex' }}>{denyButton('接続を拒否してアプリへ戻る')}</div>
        )}
      </>
    );
  }

  if (state.phase === 'error') {
    // 制限中の案内は上で出している（型の絞り込みのため）
    return renderShell(renderAlert(PAGE_ERROR_MESSAGES.unknown));
  }

  if (state.phase === 'second-factor') {
    const { view } = state;
    return renderShell(
      <>
        {state.notice && renderAlert(state.notice, actionError === null)}
        {actionError && renderAlert(actionError)}
        <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem' }}>
          外部アプリの接続を続けるには、二要素認証のコードを入力してください。
        </p>
        <TwoFactorVerificationForm
          onVerifyTOTP={(code) => verifySecondFactor(view, { type: 'totp', code })}
          onVerifyBackupCode={(code) => verifySecondFactor(view, { type: 'backup', code })}
          onCancel={() => void submitDecision('deny', view)}
          cancelLabel="接続を拒否する"
          notice={CONSENT_NEXT_CODE_NOTICE}
          disabled={pending === 'deny'}
        />
      </>
    );
  }

  // 同意の内容（47.4・47.5）
  const { view } = state;
  const scopes = selectableScopes(view);
  const submitting = pending !== null;
  return renderShell(
    <>
      {actionError && renderAlert(actionError)}
      <p
        ref={introRef}
        tabIndex={-1}
        style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1rem' }}
      >
        次のアプリが、あなたの ArchiTrack
        のアカウントへの接続を求めています。内容を確かめてください。
      </p>

      <section aria-labelledby={detailsHeadingId} style={{ marginBottom: '1rem' }}>
        <h2 id={detailsHeadingId} style={sectionHeadingStyle}>
          接続の内容
        </h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '0.25rem 1rem',
            fontSize: '0.875rem',
            margin: 0,
          }}
        >
          <dt style={{ color: '#4b5563' }}>アプリ</dt>
          <dd style={{ margin: 0, fontWeight: 700, wordBreak: 'break-all' }}>{view.appName}</dd>
          <dt style={{ color: '#4b5563' }}>戻り先</dt>
          <dd style={{ margin: 0, wordBreak: 'break-all' }}>{view.redirectHost}</dd>
          <dt style={{ color: '#4b5563' }}>アカウント</dt>
          <dd style={{ margin: 0, wordBreak: 'break-all' }}>
            {view.account.displayName}（{view.account.email}）
          </dd>
        </dl>
      </section>

      <fieldset
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <legend style={{ ...sectionHeadingStyle, padding: '0 0.25rem', marginBottom: 0 }}>
          許可する操作
        </legend>
        {scopes.read && (
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked
                disabled
                readOnly
                aria-describedby={readDescriptionId}
              />
              <span>読み取り（必須）</span>
            </label>
            <p
              id={readDescriptionId}
              style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.8125rem', color: '#4b5563' }}
            >
              閲覧できる範囲のデータを読み取ります。この範囲は外せません。
            </p>
          </div>
        )}
        {scopes.write && (
          <div>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={writeSelected}
                disabled={submitting}
                onChange={(event) => setWriteSelected(event.target.checked)}
                aria-describedby={writeDescriptionId}
              />
              <span>書き込み（任意）</span>
            </label>
            <p
              id={writeDescriptionId}
              style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.8125rem', color: '#4b5563' }}
            >
              データの作成や変更を許可します。必要なときだけ選んでください。
            </p>
          </div>
        )}
      </fieldset>

      <section aria-labelledby={expiryHeadingId} style={{ marginBottom: '1.5rem' }}>
        <h2 id={expiryHeadingId} style={sectionHeadingStyle}>
          接続の期限
        </h2>
        <p style={{ fontSize: '0.875rem', margin: '0 0 0.25rem' }}>
          この接続は、次のどちらか早い時点で切れます。
        </p>
        <ul style={{ fontSize: '0.875rem', margin: '0 0 0.25rem', paddingLeft: '1.25rem' }}>
          <li>最後に使われてから {view.idleDays} 日間使われなかったとき</li>
          <li>同意から {view.absoluteDays} 日が過ぎたとき（使っていても延長されません）</li>
        </ul>
        <p style={{ fontSize: '0.875rem', margin: 0, color: '#4b5563' }}>
          切れた後は、アプリから接続し直してください。
        </p>
      </section>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {denyButton('拒否する')}
        <button
          type="button"
          onClick={() => void submitDecision('approve', view)}
          disabled={submitting}
          aria-busy={pending === 'approve'}
          style={disabledLook(primaryButtonStyle, submitting)}
        >
          許可する
        </button>
      </div>
    </>
  );
}

export default OAuthConsentPage;
