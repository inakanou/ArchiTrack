/**
 * @fileoverview システム設定の画面（/admin/settings）
 *
 * estimate-request の design.md の章「Requirements 43-50」の D8（タスク119.2）。
 * 管理メニューの「システム設定」から開く。外部の AI での読み取り（受領見積書・数量表の取り込みの
 * OCR で画像を Anthropic 社の Claude へ送る機能）の今の状態を示し、確認の後に全体で停止・再開する。
 * 変更は読んだ版を添えて送り、他の管理者が先に変えていた（409 `SYSTEM_SETTING_CONFLICT`）ときは
 * その旨を示して最新の状態を読み直す。変更の監査ログへの記録はサーバーが行う。
 * 管理者のルートのブロックの内側に置く（経路は `settings:update` を求める）。
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import FocusManager from '../components/FocusManager';
import { ApiError } from '../api/client';
import {
  getExternalAiReadingSetting,
  isSystemSettingConflictError,
  updateExternalAiReadingSetting,
  type ExternalAiReadingSetting,
} from '../api/system-settings';

const buttonBase: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid transparent',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const alertStyle: React.CSSProperties = {
  padding: '0.75rem',
  borderRadius: '0.375rem',
  backgroundColor: '#fee2e2',
  color: '#991b1b',
  marginBottom: '1rem',
  fontSize: '0.875rem',
  overflowWrap: 'anywhere',
};

const LOAD_ERROR_MESSAGE = '設定を読み込めませんでした。時間をおいて再試行してください。';
const CONFLICT_MESSAGE =
  'この設定は他の管理者により変更されていました。最新の状態を読み込みましたので、確かめてから操作し直してください。';

/** 変更の失敗を利用者に向けた文言へ直す（競合は別に扱う） */
function updateErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.statusCode === 403) {
    return 'この設定を変更する権限がありません。';
  }
  return '設定を変更できませんでした。時間をおいて再度お試しください。';
}

export function AdminSettingsPage() {
  const idPrefix = useId();
  const sectionTitleId = `${idPrefix}-external-ai-title`;
  const dialogTitleId = `${idPrefix}-dialog-title`;
  const dialogDescId = `${idPrefix}-dialog-desc`;

  const [setting, setSetting] = useState<ExternalAiReadingSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  /** 確認中の変更（停止なら false、再開なら true）。null は確認を閉じている */
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflictNotice, setConflictNotice] = useState('');

  const cancelRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    getExternalAiReadingSetting()
      .then((value) => {
        if (cancelled) return;
        setSetting(value);
      })
      .catch(() => {
        if (cancelled) return;
        setSetting(null);
        setLoadError(LOAD_ERROR_MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const openConfirm = (enabled: boolean) => {
    setUpdateError('');
    setPendingEnabled(enabled);
  };

  const closeConfirm = useCallback(() => {
    if (submitting) return;
    setPendingEnabled(null);
    setUpdateError('');
  }, [submitting]);

  const handleConfirm = async () => {
    if (pendingEnabled === null || setting === null) return;
    setSubmitting(true);
    setUpdateError('');
    setNotice('');
    setConflictNotice('');
    try {
      const updated = await updateExternalAiReadingSetting(pendingEnabled, setting.version);
      setSetting(updated);
      setPendingEnabled(null);
      setNotice(
        updated.enabled
          ? '外部のAIでの読み取りを再開しました。'
          : '外部のAIでの読み取りを停止しました。'
      );
    } catch (error) {
      if (isSystemSettingConflictError(error)) {
        setPendingEnabled(null);
        setConflictNotice(CONFLICT_MESSAGE);
        reload();
      } else {
        setUpdateError(updateErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stopping = pendingEnabled === false;

  return (
    <div
      data-testid="admin-settings-container"
      style={{ maxWidth: '960px', margin: '0 auto', padding: '1rem', minWidth: 0 }}
    >
      <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
        システム設定
      </h1>

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
            fontSize: '0.875rem',
          }}
        >
          {notice}
        </div>
      )}

      {conflictNotice && (
        <div role="alert" style={alertStyle}>
          {conflictNotice}
        </div>
      )}

      {loadError && (
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
          <span>{loadError}</span>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
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

      {loading && setting === null && !loadError && (
        <div role="status" style={{ textAlign: 'center', padding: '2rem', color: '#4b5563' }}>
          読み込み中...
        </div>
      )}

      {setting !== null && (
        <section
          aria-labelledby={sectionTitleId}
          style={{
            padding: '1.25rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            backgroundColor: 'white',
          }}
        >
          <h2
            id={sectionTitleId}
            style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}
          >
            外部のAIでの読み取り
          </h2>
          <p style={{ color: '#4b5563', fontSize: '0.875rem', marginBottom: '1rem' }}>
            受領見積書や数量表の取り込みのOCRで、ページの画像を外部のAIサービス（Anthropic社のClaude）へ送って読み取る機能です。停止すると、全ての利用者が画像を送らずに端末で読み取ります。
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <p style={{ fontSize: '0.875rem' }}>
              現在の状態:{' '}
              <strong
                data-testid="external-ai-reading-state"
                style={{
                  display: 'inline-block',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: setting.enabled ? '#d1fae5' : '#fee2e2',
                  color: setting.enabled ? '#065f46' : '#991b1b',
                }}
              >
                {setting.enabled ? '有効' : '停止中'}
              </strong>
            </p>
            <button
              type="button"
              onClick={() => openConfirm(!setting.enabled)}
              disabled={loading || submitting}
              style={{
                ...buttonBase,
                backgroundColor: setting.enabled ? '#b91c1c' : '#1d4ed8',
                color: 'white',
                cursor: loading || submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {setting.enabled ? '停止する' : '再開する'}
            </button>
          </div>
        </section>
      )}

      <FocusManager
        isOpen={pendingEnabled !== null}
        onClose={closeConfirm}
        closeOnEscape={!submitting}
        initialFocusRef={cancelRef as React.RefObject<HTMLElement>}
        ariaLabelledBy={dialogTitleId}
      >
        {pendingEnabled !== null && (
          <div
            aria-describedby={dialogDescId}
            style={{ width: 'min(32rem, calc(100vw - 4rem))', maxWidth: '100%' }}
          >
            <h2
              id={dialogTitleId}
              style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.75rem' }}
            >
              {stopping ? '外部のAIでの読み取りを停止' : '外部のAIでの読み取りを再開'}
            </h2>
            <p
              id={dialogDescId}
              style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem' }}
            >
              {stopping
                ? '停止すると、全ての利用者のOCRで画像を外部へ送らず、端末での読み取りだけを使います。変更は監査ログに記録されます。'
                : '再開すると、利用者はOCRのたびに確認したうえで、画像を外部のAIサービスへ送って読み取れるようになります。変更は監査ログに記録されます。'}
            </p>

            {updateError && (
              <div role="alert" style={{ ...alertStyle, marginBottom: '0.75rem' }}>
                {updateError}
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
                onClick={closeConfirm}
                disabled={submitting}
                style={{
                  ...buttonBase,
                  backgroundColor: 'white',
                  color: '#374151',
                  borderColor: '#6b7280',
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
                  backgroundColor: stopping ? '#b91c1c' : '#1d4ed8',
                  color: 'white',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '処理中...' : stopping ? '停止する' : '再開する'}
              </button>
            </div>
          </div>
        )}
      </FocusManager>
    </div>
  );
}

export default AdminSettingsPage;
