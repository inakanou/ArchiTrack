import { useState, useRef, useEffect, ReactElement, useCallback, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * ドロップダウンメニューアイテムの型定義
 */
interface DropdownMenuItem {
  label: string;
  onClick: () => void;
  testId?: string;
}

/**
 * ドロップダウンメニューのプロパティ
 */
interface DropdownMenuProps {
  label: string;
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
  label,
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
    <div ref={menuRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        onKeyDown={handleButtonKeyDown}
        className="flex items-center space-x-1 text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span>{label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50"
          aria-orientation="vertical"
        >
          <div className="py-1">
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
                className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${
                  focusedIndex === index ? 'bg-gray-100' : ''
                }`}
                data-testid={item.testId}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

  // ユーザーメニューの項目
  const userMenuItems: DropdownMenuItem[] = [
    {
      label: 'プロフィール',
      onClick: () => navigate('/profile'),
      testId: 'user-menu-profile',
    },
    {
      label: 'ログアウト',
      onClick: () => logout(),
      testId: 'user-menu-logout',
    },
  ];

  // 管理者メニューの項目
  const adminMenuItems: DropdownMenuItem[] = [
    {
      label: 'ユーザー管理',
      onClick: () => navigate('/admin/users'),
      testId: 'admin-menu-users',
    },
    {
      label: '招待管理',
      onClick: () => navigate('/admin/invitations'),
      testId: 'admin-menu-invitations',
    },
    {
      label: '監査ログ',
      onClick: () => navigate('/admin/audit-logs'),
      testId: 'admin-menu-audit-logs',
    },
  ];

  // メニューの閉じ処理
  const closeUserMenu = useCallback(() => setIsUserMenuOpen(false), []);
  const closeAdminMenu = useCallback(() => setIsAdminMenuOpen(false), []);
  const toggleUserMenu = useCallback(() => setIsUserMenuOpen((prev) => !prev), []);
  const toggleAdminMenu = useCallback(() => setIsAdminMenuOpen((prev) => !prev), []);

  return (
    <header className="bg-white shadow-sm" role="banner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* ロゴ・ダッシュボードリンク */}
          <div className="flex items-center">
            <Link
              to="/"
              className="flex items-center space-x-2 text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors"
            >
              <span>ArchiTrack</span>
            </Link>
          </div>

          {/* ナビゲーションメニュー */}
          <nav className="flex items-center space-x-4" role="navigation">
            {/* ダッシュボードリンク */}
            <Link
              to="/"
              className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              ダッシュボード
            </Link>

            {/* 管理者メニュー（admin ロールを持つユーザーのみ） */}
            {isAdmin && (
              <DropdownMenu
                label="管理メニュー"
                items={adminMenuItems}
                isOpen={isAdminMenuOpen}
                onToggle={toggleAdminMenu}
                onClose={closeAdminMenu}
              />
            )}

            {/* ユーザーメニュー */}
            <DropdownMenu
              label={user?.displayName ?? 'ユーザー'}
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
