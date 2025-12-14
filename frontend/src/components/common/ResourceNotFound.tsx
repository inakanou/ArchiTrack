import { Link } from 'react-router-dom';
import type { ReactElement } from 'react';

/**
 * ResourceNotFoundコンポーネントのprops
 */
export interface ResourceNotFoundProps {
  /** リソースタイプ（例: "取引先"、"プロジェクト"） */
  resourceType: string;
  /** 戻り先のパス */
  returnPath: string;
  /** 戻るリンクのラベル */
  returnLabel: string;
}

/**
 * リソース未検出コンポーネント
 *
 * リソースが見つからない場合に統一されたエラー表示を提供する。
 * 他の機能でも再利用可能な汎用コンポーネント。
 *
 * @example
 * // 取引先詳細ページで取引先が見つからない場合
 * <ResourceNotFound
 *   resourceType="取引先"
 *   returnPath="/trading-partners"
 *   returnLabel="取引先一覧に戻る"
 * />
 *
 * @example
 * // プロジェクト詳細ページでプロジェクトが見つからない場合
 * <ResourceNotFound
 *   resourceType="プロジェクト"
 *   returnPath="/projects"
 *   returnLabel="プロジェクト一覧に戻る"
 * />
 */
export function ResourceNotFound({
  resourceType,
  returnPath,
  returnLabel,
}: ResourceNotFoundProps): ReactElement {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900">{resourceType}が見つかりません</h1>
      <p className="mt-2 text-gray-600">
        指定された{resourceType}は存在しないか、削除されています。
      </p>
      <Link
        to={returnPath}
        className="mt-4 inline-block text-blue-600 hover:text-blue-800 underline"
      >
        {returnLabel}
      </Link>
    </div>
  );
}

export default ResourceNotFound;
