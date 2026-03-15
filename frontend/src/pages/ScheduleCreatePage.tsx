/**
 * @fileoverview 工程表新規作成画面
 *
 * Task 8: フロントエンド工程表作成フォームの実装
 *
 * Requirements (construction-schedule):
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存（API呼び出し）
 * - REQ-1.6: 保存失敗時エラー表示と入力内容保持
 * - REQ-2.1: 数量表選択肢表示
 * - REQ-2.2: 数量表なしで空の工程表作成
 * - REQ-2.3: 数量表指定時の項目自動取得
 *
 * @module pages/ScheduleCreatePage
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createSchedule } from '../api/schedules';
import type { CreateScheduleInput } from '../api/schedules';
import ScheduleForm from '../components/schedule/ScheduleForm';
import { Breadcrumb } from '../components/common';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工程表新規作成画面
 *
 * ScheduleFormコンポーネントを利用し、
 * 作成ボタン押下時にAPI呼び出し（POST）と工程表詳細画面への遷移を行う。
 *
 * Requirements:
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存（API呼び出し）
 * - REQ-1.6: 保存失敗時エラー表示と入力内容保持
 * - REQ-2.1: 数量表選択肢表示
 * - REQ-2.2: 数量表なしで空の工程表作成
 * - REQ-2.3: 数量表指定時の項目自動取得
 */
export default function ScheduleCreatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // 作成処理の状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /**
   * フォーム送信処理
   * Requirements: REQ-1.3, REQ-2.2, REQ-2.3
   */
  const handleSubmit = useCallback(
    async (data: CreateScheduleInput) => {
      if (!projectId) return;

      setIsSubmitting(true);
      setCreateError(null);

      try {
        const schedule = await createSchedule(projectId, data);
        navigate(`/schedules/${schedule.id}`);
      } catch {
        setCreateError('工程表の作成に失敗しました');
      } finally {
        setIsSubmitting(false);
      }
    },
    [projectId, navigate]
  );

  /**
   * キャンセル処理
   */
  const handleCancel = useCallback(() => {
    navigate(`/projects/${projectId}/schedules`);
  }, [navigate, projectId]);

  if (!projectId) {
    return null;
  }

  return (
    <main role="main" style={styles.container} data-testid="schedule-create-page">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${projectId}` },
            { label: '工程表一覧', path: `/projects/${projectId}/schedules` },
            { label: '新規作成' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>工程表作成</h1>
      </div>

      {/* 工程表作成フォーム */}
      <ScheduleForm
        projectId={projectId}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
        error={createError}
      />
    </main>
  );
}
