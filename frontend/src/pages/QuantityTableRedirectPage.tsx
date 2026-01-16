/**
 * @fileoverview 数量表詳細ページからのリダイレクト
 *
 * REQ-1.5: 数量表カードクリックで編集画面遷移
 *
 * /projects/:projectId/quantity-tables/:id から
 * /quantity-tables/:id/edit へリダイレクトする
 */

import { Navigate, useParams } from 'react-router-dom';

/**
 * 数量表詳細ページ
 *
 * プロジェクト詳細画面の数量表セクションからのリンク先。
 * 編集画面へリダイレクトする。
 */
export default function QuantityTableRedirectPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate to="/projects" replace />;
  }

  return <Navigate to={`/quantity-tables/${id}/edit`} replace />;
}
