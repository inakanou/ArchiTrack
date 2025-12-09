import { useState, useRef, useEffect, ReactElement, useCallback, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './AppHeader.css';

/**
 * ドロップダウンメニューアイテムの型定義
 */
interface DropdownMenuItem {
  label: string;
  onClick: () => void;
  testId?: string;
  icon?: ReactElement;
}

/**
 * ドロップダウンメニューのプロパティ
 */
interface DropdownMenuProps {
  trigger: ReactElement;
  triggerClassName?: string;
  items: DropdownMenuItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

/**
 * ドロップダウンメニューコンポーネント
 *
 * アクセシビリティ対応:
 * - キーボードナビゲーション（Enter, Escape, Arrow keys）
 * - ARIA属性（aria-expanded, aria-haspopup, role="menu"）
 * - フォーカス管理
 */
function DropdownMenu({
  trigger,
  triggerClassName,
  items,
  isOpen,
  onToggle,
  onClose,
}: DropdownMenuProps): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // 外部クリックでメニューを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
        setFocusedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Escapeキーでメニューを閉じる
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            event.preventDefault();
            const item = items[focusedIndex];
            if (item) {
              item.onClick();
            }
            onClose();
            setFocusedIndex(-1);
          }
          break;
      }
    },
    [items, focusedIndex, onClose]
  );

  // ボタンでのキーボード操作
  const handleButtonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
        if (!isOpen) {
          setFocusedIndex(0);
        }
      } else if (event.key === 'ArrowDown' && !isOpen) {
        event.preventDefault();
        onToggle();
        setFocusedIndex(0);
      }
    },
    [onToggle, isOpen]
  );

  return (
    <div ref={menuRef} className="app-header-dropdown" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        onClick={onToggle}
        onKeyDown={handleButtonKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {trigger}
      </button>

      {isOpen && (
        <div role="menu" className="app-header-dropdown-panel is-open" aria-orientation="vertical">
          {items.map((item, index) => (
            <button
              key={item.label}
              role="menuitem"
              tabIndex={focusedIndex === index ? 0 : -1}
              onClick={() => {
                item.onClick();
                onClose();
                setFocusedIndex(-1);
              }}
              onMouseEnter={() => setFocusedIndex(index)}
              className={`app-header-dropdown-item ${focusedIndex === index ? 'is-focused' : ''}`}
              data-testid={item.testId}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ユーザーのイニシャルを取得
 */
function getInitials(displayName: string | undefined): string {
  if (!displayName) return 'U';
  const parts = displayName.trim().split(/\s+/);
  const firstPart = parts[0];
  const secondPart = parts[1];
  if (parts.length >= 2 && firstPart && secondPart) {
    const firstChar = firstPart[0] ?? '';
    const secondChar = secondPart[0] ?? '';
    return (firstChar + secondChar).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

/**
 * アイコンコンポーネント
 */
const Icons = {
  Dashboard: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  ),
  Admin: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
  Users: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  ),
  Invitation: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  Role: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  Permission: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  ),
  AuditLog: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  Profile: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  ),
  Logout: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  ),
  ChevronDown: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Logo: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
  /**
   * プロジェクトアイコン
   * REQ-21.3: プロジェクトリンクはアイコン付きで表示される
   */
  Project: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  ),
};

/**
 * AppHeaderコンポーネント
 *
 * 認証済みユーザー向けの共通ヘッダーナビゲーション
 *
 * ## 機能
 * - ロゴ・ダッシュボードリンク
 * - 管理者メニュー（admin ロールを持つユーザーのみ表示）
 * - ユーザーメニュー（プロフィール、ログアウト）
 *
 * ## アクセシビリティ
 * - セマンティックなHTML構造（header, nav）
 * - キーボードナビゲーション対応
 * - ARIA属性対応
 *
 * ## 要件
 * - 要件28.4: 認証済みユーザーにはヘッダーナビゲーションが表示される
 */
export function AppHeader(): ReactElement {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);

  // ユーザーが管理者かどうかを判定
  const isAdmin = user?.roles?.includes('admin') ?? false;

  /**
   * ログアウト処理
   * 要件28.41: ログアウトボタンクリック → ログアウト処理実行
   * 要件28.42: ログアウト完了時に「ログアウトしました」メッセージを表示
   *
   * ログアウト後のメッセージ表示はsessionStorageを使用。
   * ProtectedRouteがログアウト検知時に/loginへリダイレクトするため、
   * location.stateでのメッセージ伝達はProtectedRouteのstateで上書きされてしまう。
   */
  const handleLogout = useCallback(async () => {
    // ログアウトメッセージをsessionStorageに保存
    sessionStorage.setItem('logoutMessage', 'ログアウトしました');
    await logout();
  }, [logout]);

  // ユーザーメニューの項目
  const userMenuItems: DropdownMenuItem[] = [
    {
      label: 'プロフィール',
      onClick: () => navigate('/profile'),
      testId: 'user-menu-profile',
      icon: <Icons.Profile />,
    },
    {
      label: 'ログアウト',
      onClick: handleLogout,
      testId: 'user-menu-logout',
      icon: <Icons.Logout />,
    },
  ];

  // 管理者メニューの項目
  // REQ-28.25: ユーザー管理、招待管理、ロール管理、権限管理、監査ログへのリンク
  const adminMenuItems: DropdownMenuItem[] = [
    {
      label: 'ユーザー管理',
      onClick: () => navigate('/admin/users'),
      testId: 'admin-menu-users',
      icon: <Icons.Users />,
    },
    {
      label: '招待管理',
      onClick: () => navigate('/admin/invitations'),
      testId: 'admin-menu-invitations',
      icon: <Icons.Invitation />,
    },
    {
      label: 'ロール管理',
      onClick: () => navigate('/admin/roles'),
      testId: 'admin-menu-roles',
      icon: <Icons.Role />,
    },
    {
      label: '権限管理',
      onClick: () => navigate('/admin/permissions'),
      testId: 'admin-menu-permissions',
      icon: <Icons.Permission />,
    },
    {
      label: '監査ログ',
      onClick: () => navigate('/admin/audit-logs'),
      testId: 'admin-menu-audit-logs',
      icon: <Icons.AuditLog />,
    },
  ];

  // メニューの閉じ処理
  const closeUserMenu = useCallback(() => setIsUserMenuOpen(false), []);
  const closeAdminMenu = useCallback(() => setIsAdminMenuOpen(false), []);
  const toggleUserMenu = useCallback(() => setIsUserMenuOpen((prev) => !prev), []);
  const toggleAdminMenu = useCallback(() => setIsAdminMenuOpen((prev) => !prev), []);

  // ユーザーメニューのトリガー
  const userMenuTrigger = (
    <>
      <div className="app-header-avatar">{getInitials(user?.displayName)}</div>
      <span className="app-header-user-name">{user?.displayName ?? 'ユーザー'}</span>
      <Icons.ChevronDown />
    </>
  );

  // 管理メニューのトリガー
  const adminMenuTrigger = (
    <>
      <Icons.Admin />
      <span>管理メニュー</span>
      <Icons.ChevronDown />
    </>
  );

  return (
    <header className="app-header" role="banner">
      <div className="app-header-container">
        <div className="app-header-content">
          {/* ロゴ・ダッシュボードリンク */}
          <Link to="/" className="app-header-logo">
            <div className="app-header-logo-icon">
              <Icons.Logo />
            </div>
            <span className="app-header-logo-text">ArchiTrack</span>
          </Link>

          {/* ナビゲーションメニュー */}
          <nav className="app-header-nav" role="navigation">
            {/* ダッシュボードリンク */}
            <Link to="/" className="app-header-nav-link">
              <Icons.Dashboard />
              <span>ダッシュボード</span>
            </Link>

            {/* プロジェクトリンク - REQ-21.1, 21.2, 21.3, 21.4 */}
            <Link to="/projects" className="app-header-nav-link">
              <Icons.Project />
              <span>プロジェクト</span>
            </Link>

            {/* 管理者メニュー（admin ロールを持つユーザーのみ） */}
            {isAdmin && (
              <>
                <div className="app-header-separator" />
                <DropdownMenu
                  trigger={adminMenuTrigger}
                  triggerClassName="app-header-admin-trigger"
                  items={adminMenuItems}
                  isOpen={isAdminMenuOpen}
                  onToggle={toggleAdminMenu}
                  onClose={closeAdminMenu}
                />
              </>
            )}

            <div className="app-header-separator" />

            {/* ユーザーメニュー */}
            <DropdownMenu
              trigger={userMenuTrigger}
              triggerClassName="app-header-user-trigger"
              items={userMenuItems}
              isOpen={isUserMenuOpen}
              onToggle={toggleUserMenu}
              onClose={closeUserMenu}
            />
          </nav>
        </div>
      </div>
    </header>
  );
}
