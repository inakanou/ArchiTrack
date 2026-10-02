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
      {/*
        狭い画面幅では一覧を複数行へ折り返す（flex-wrap）。行に収まらない項目は、一行の中で
        縮められる前に次の行へ送られるため、短い項目が縦長に潰れない。区切りの無い長い名前は、
        文字列の overflow-wrap:anywhere（wrap-anywhere）が項目の最小内容幅を下げるため、項目の
        中で折り返して、行を画面幅の外へ押し広げない。一行に収まる幅では従来と同じ配置になる。
      */}
      <ol className="flex flex-wrap items-center space-x-2 text-sm text-gray-500">
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
                <Link to={item.path} className="wrap-anywhere hover:text-gray-700 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'wrap-anywhere text-gray-900 font-medium' : 'wrap-anywhere'}
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
