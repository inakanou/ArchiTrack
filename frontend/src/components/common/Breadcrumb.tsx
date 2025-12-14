import { Link } from 'react-router-dom';
import type { ReactElement } from 'react';

/**
 * パンくずナビゲーションの項目
 */
export interface BreadcrumbItem {
  /** 表示テキスト */
  label: string;
  /** リンク先パス（省略時はリンクなし） */
  path?: string;
}

/**
 * Breadcrumbコンポーネントのprops
 */
export interface BreadcrumbProps {
  /** パンくず項目の配列 */
  items: BreadcrumbItem[];
}

/**
 * パンくずナビゲーションコンポーネント
 *
 * 階層構造を示すナビゲーションを提供し、ユーザーが現在位置を把握できるようにする。
 * WAI-ARIA準拠のアクセシビリティ対応済み。
 *
 * @example
 * // 取引先一覧ページ
 * <Breadcrumb items={[
 *   { label: 'ダッシュボード', path: '/' },
 *   { label: '取引先' }
 * ]} />
 *
 * @example
 * // 取引先詳細ページ
 * <Breadcrumb items={[
 *   { label: 'ダッシュボード', path: '/' },
 *   { label: '取引先', path: '/trading-partners' },
 *   { label: partner.name }
 * ]} />
 *
 * @example
 * // 取引先新規作成ページ
 * <Breadcrumb items={[
 *   { label: 'ダッシュボード', path: '/' },
 *   { label: '取引先', path: '/trading-partners' },
 *   { label: '新規作成' }
 * ]} />
 *
 * @example
 * // 取引先編集ページ
 * <Breadcrumb items={[
 *   { label: 'ダッシュボード', path: '/' },
 *   { label: '取引先', path: '/trading-partners' },
 *   { label: partner.name, path: `/trading-partners/${partner.id}` },
 *   { label: '編集' }
 * ]} />
 */
export function Breadcrumb({ items }: BreadcrumbProps): ReactElement {
  return (
    <nav aria-label="パンくずナビゲーション" className="breadcrumb">
      <ol className="flex items-center space-x-2 text-sm text-gray-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center">
              {/* 区切り文字（最初の項目以外） */}
              {index > 0 && (
                <span className="mx-2" aria-hidden="true">
                  &gt;
                </span>
              )}

              {/* リンクまたはテキスト */}
              {item.path && !isLast ? (
                <Link to={item.path} className="hover:text-gray-700 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'text-gray-900 font-medium' : ''}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
