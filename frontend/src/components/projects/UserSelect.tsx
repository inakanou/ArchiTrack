import { useState, useEffect, useId, ChangeEvent } from 'react';
import { getAssignableUsers } from '../../api/projects';
import { useAuth } from '../../hooks/useAuth';
import type { AssignableUser } from '../../types/project.types';

/**
 * UserSelectコンポーネントのプロパティ
 */
export interface UserSelectProps {
  /** 現在の選択値（ユーザーID） */
  value: string;
  /** 値が変更された時のコールバック */
  onChange: (userId: string) => void;
  /** フォーカスを外した時のコールバック */
  onBlur?: () => void;
  /** ラベルテキスト */
  label: string;
  /** プレースホルダーテキスト */
  placeholder?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化状態 */
  disabled?: boolean;
  /** 外部から渡されるエラーメッセージ */
  error?: string;
  /**
   * ログインユーザーをデフォルト選択するかどうか
   * valueが空の場合のみ適用される
   */
  defaultToCurrentUser?: boolean;
}

/** スタイル定数 */
const STYLES = {
  colors: {
    error: '#dc2626',
    errorLight: 'rgba(220, 38, 38, 0.1)',
    focus: '#2563eb',
    focusLight: 'rgba(37, 99, 235, 0.1)',
    border: '#d1d5db',
    label: '#374151',
    text: '#111827',
    disabled: '#9ca3af',
    disabledBg: '#f3f4f6',
    white: '#ffffff',
    placeholder: '#9ca3af',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

/**
 * 担当者選択ドロップダウンコンポーネント
 *
 * 営業担当者・工事担当者の選択に使用するドロップダウンUIを提供します。
 * admin以外の有効なユーザー一覧を候補として表示します。
 *
 * @example
 * ```tsx
 * <UserSelect
 *   value={salesPersonId}
 *   onChange={setSalesPersonId}
 *   label="営業担当者"
 *   required
 *   defaultToCurrentUser
 * />
 * ```
 *
 * Requirements:
 * - 17.1: 営業担当者フィールドにドロップダウン選択UIを提供する
 * - 17.2: 工事担当者フィールドにドロップダウン選択UIを提供する
 * - 17.3: 営業担当者ドロップダウンでadmin以外の有効なユーザー一覧を候補として表示する
 * - 17.4: 工事担当者ドロップダウンでadmin以外の有効なユーザー一覧を候補として表示する
 * - 17.5: 各ユーザー候補にユーザーの表示名を表示する
 * - 17.6: 営業担当者フィールドのデフォルト選択値としてログインユーザーを設定する
 * - 17.7: 工事担当者フィールドのデフォルト選択値としてログインユーザーを設定する
 * - 17.8: ドロップダウンから担当者を選択したらユーザーIDをフォームに設定する
 * - 17.10: 担当者候補を取得中にローディングインジケータを表示する
 * - 17.11: 有効なユーザーが存在しない場合に「選択可能なユーザーがありません」というメッセージを表示する
 * - 20.2: アクセシビリティ属性を設定
 */
function UserSelect({
  value,
  onChange,
  onBlur,
  label,
  placeholder = '選択してください',
  required = false,
  disabled = false,
  error,
  defaultToCurrentUser = false,
}: UserSelectProps) {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [hasAppliedDefault, setHasAppliedDefault] = useState(false);

  const { user: currentUser } = useAuth();

  // 一意のIDを生成
  const uniqueId = useId();
  const selectId = `user-select-${uniqueId}`;
  const errorId = `user-select-error-${uniqueId}`;

  // 表示するエラー（外部エラーまたはフェッチエラー）
  const displayError = error || fetchError;
  const hasError = !!displayError;

  /**
   * ユーザー一覧を取得
   */
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setFetchError(null);

      try {
        const assignableUsers = await getAssignableUsers();
        setUsers(assignableUsers);
      } catch (err) {
        setFetchError('ユーザー一覧の取得に失敗しました');
        console.error('Failed to fetch assignable users:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  /**
   * デフォルト選択の適用
   * valueが空でdefaultToCurrentUserがtrueの場合、ログインユーザーをデフォルト選択
   */
  useEffect(() => {
    // ローディング中、既にデフォルト適用済み、または既に値がある場合はスキップ
    if (isLoading || hasAppliedDefault || value) {
      return;
    }

    // defaultToCurrentUserが有効で、currentUserがいる場合
    if (defaultToCurrentUser && currentUser) {
      // ユーザー一覧にcurrentUserが存在するか確認
      const userExists = users.some((u) => u.id === currentUser.id);
      if (userExists) {
        onChange(currentUser.id);
        setHasAppliedDefault(true);
      }
    }
  }, [isLoading, users, defaultToCurrentUser, currentUser, value, onChange, hasAppliedDefault]);

  /**
   * 選択値変更時のハンドラ
   */
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  /**
   * フォーカスを外した時のハンドラ
   */
  const handleBlur = () => {
    setIsFocused(false);
    if (onBlur) {
      onBlur();
    }
  };

  /**
   * フォーカスを得た時のハンドラ
   */
  const handleFocus = () => {
    if (!disabled) {
      setIsFocused(true);
    }
  };

  /**
   * 境界線の色を計算
   */
  const getBorderColor = (): string => {
    if (hasError) return STYLES.colors.error;
    if (isFocused) return STYLES.colors.focus;
    return STYLES.colors.border;
  };

  /**
   * ボックスシャドウを計算
   */
  const getBoxShadow = (): string => {
    if (!isFocused) return 'none';
    if (hasError) return `0 0 0 3px ${STYLES.colors.errorLight}`;
    return `0 0 0 3px ${STYLES.colors.focusLight}`;
  };

  // ローディング中の表示
  if (isLoading) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {/* ラベル */}
        <label
          htmlFor={selectId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: STYLES.colors.label,
          }}
        >
          {label}
          {required && (
            <span
              style={{
                color: STYLES.colors.error,
                marginLeft: '0.25rem',
              }}
              aria-hidden="true"
            >
              *
            </span>
          )}
        </label>

        {/* ローディングインジケータ */}
        <div
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: `1px solid ${STYLES.colors.border}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: STYLES.colors.placeholder,
            backgroundColor: STYLES.colors.disabledBg,
          }}
        >
          読み込み中...
        </div>
      </div>
    );
  }

  // ユーザーが存在しない場合
  if (users.length === 0 && !fetchError) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        {/* ラベル */}
        <label
          htmlFor={selectId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: STYLES.colors.label,
          }}
        >
          {label}
          {required && (
            <span
              style={{
                color: STYLES.colors.error,
                marginLeft: '0.25rem',
              }}
              aria-hidden="true"
            >
              *
            </span>
          )}
        </label>

        {/* 空メッセージ */}
        <div
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: `1px solid ${STYLES.colors.border}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: STYLES.colors.placeholder,
            backgroundColor: STYLES.colors.disabledBg,
          }}
        >
          選択可能なユーザーがありません
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* ラベル */}
      <label
        htmlFor={selectId}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: 500,
          color: hasError ? STYLES.colors.error : STYLES.colors.label,
        }}
      >
        {label}
        {required && (
          <span
            style={{
              color: STYLES.colors.error,
              marginLeft: '0.25rem',
            }}
            aria-hidden="true"
          >
            *
          </span>
        )}
      </label>

      {/* セレクトボックス */}
      <select
        id={selectId}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        disabled={disabled}
        aria-label={label}
        aria-required={required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: hasError ? `2px solid ${STYLES.colors.error}` : `1px solid ${getBorderColor()}`,
          borderRadius: STYLES.borderRadius,
          fontSize: '1rem',
          lineHeight: '1.5',
          color: disabled
            ? STYLES.colors.disabled
            : value
              ? STYLES.colors.text
              : STYLES.colors.placeholder,
          backgroundColor: disabled ? STYLES.colors.disabledBg : STYLES.colors.white,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: STYLES.transition,
          boxShadow: getBoxShadow(),
          appearance: 'auto',
        }}
      >
        {/* プレースホルダーオプション */}
        <option value="" disabled={required}>
          {placeholder}
        </option>

        {/* ユーザー候補 */}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName}
          </option>
        ))}
      </select>

      {/* エラーメッセージ */}
      {hasError && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          style={{
            marginTop: '0.25rem',
            fontSize: '0.875rem',
            color: STYLES.colors.error,
          }}
        >
          {displayError}
        </p>
      )}
    </div>
  );
}

export default UserSelect;
