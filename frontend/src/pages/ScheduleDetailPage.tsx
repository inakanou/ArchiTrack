/**
 * @fileoverview 工程表詳細・編集画面
 *
 * Task 9.1: ScheduleDetailPageと項目入力行を実装する
 * Task 9.2: SortableScheduleListによる並び順管理を実装する
 *
 * Requirements (construction-schedule):
 * - REQ-1.4: 工程表詳細表示
 * - REQ-2.4: 数量表項目の着工日・日数入力欄
 * - REQ-3.1: 着工日入力欄
 * - REQ-3.2: 日数入力欄
 * - REQ-3.4: 着工日未入力バリデーション
 * - REQ-3.5: 日数0以下バリデーション
 * - REQ-4.1: 任意項目追加
 * - REQ-4.2: 任意項目の入力欄
 * - REQ-4.3: 任意項目削除
 * - REQ-4.4: 数量表由来・任意項目の混在管理
 * - REQ-5.1: 並び順変更機能
 * - REQ-5.2: 並び順リアルタイム反映
 * - REQ-9.1: 出力対象チェックボックス表示
 * - REQ-9.2: チェックボックス初期値ON
 * - REQ-10.1: ラベル文字入力欄
 * - REQ-11.1: 詳細文字入力欄
 *
 * @module pages/ScheduleDetailPage
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getScheduleDetail } from '../api/schedules';
import type { ScheduleDetail } from '../api/schedules';
import { useScheduleState } from '../hooks/useScheduleState';
import { SortableScheduleList } from '../components/schedule/SortableScheduleList';
import { Breadcrumb } from '../components/common';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1600px',
    margin: '0 auto',
    padding: '24px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold' as const,
    color: '#111827',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  } as React.CSSProperties,
  saveButton: {
    padding: '8px 24px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  } as React.CSSProperties,
  saveButtonDisabled: {
    padding: '8px 24px',
    backgroundColor: '#9ca3af',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  contentLayout: {
    display: 'flex',
    gap: '24px',
  } as React.CSSProperties,
  itemsArea: {
    flex: '1',
    minWidth: '0',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    overflow: 'auto',
  } as React.CSSProperties,
  ganttArea: {
    flex: '1',
    minWidth: '0',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '16px',
  } as React.CSSProperties,
  ganttPlaceholder: {
    color: '#6b7280',
    fontSize: '14px',
    textAlign: 'center' as const,
    padding: '48px',
  } as React.CSSProperties,
  errorMessage: {
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    borderRadius: '4px',
  } as React.CSSProperties,
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: '#6b7280',
    fontSize: '16px',
  } as React.CSSProperties,
  dirtyBadge: {
    padding: '4px 8px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '4px',
    fontSize: '12px',
  } as React.CSSProperties,
  backLink: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================================================
// 内部コンポーネント
// ============================================================================

/**
 * 工程表詳細のメインコンテンツ（データロード後）
 */
function ScheduleDetailContent({ data }: { data: ScheduleDetail }) {
  const {
    state,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    save,
    isLoading: isSaving,
    error: saveError,
  } = useScheduleState(data);

  return (
    <>
      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>{state.schedule.name}</h1>
        <div style={styles.headerActions}>
          {state.isDirty && <span style={styles.dirtyBadge}>未保存の変更があります</span>}
          <button
            type="button"
            data-testid="add-item-button"
            style={styles.addButton}
            onClick={addItem}
          >
            + 項目追加
          </button>
          <button
            type="button"
            data-testid="save-button"
            style={isSaving ? styles.saveButtonDisabled : styles.saveButton}
            onClick={save}
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* エラーメッセージ */}
      {saveError && (
        <div style={styles.errorMessage} data-testid="save-error">
          {saveError}
        </div>
      )}

      {/* メインコンテンツ: 項目一覧 + ガントチャート */}
      <div style={styles.contentLayout}>
        {/* 項目一覧エリア */}
        <div style={styles.itemsArea} data-testid="schedule-items-area">
          <SortableScheduleList
            items={state.items}
            onUpdate={updateItem}
            onRemove={removeItem}
            onReorder={reorderItems}
          />
        </div>

        {/* ガントチャートエリア（Task 10で実装予定） */}
        <div style={styles.ganttArea} data-testid="gantt-chart-area">
          <div style={styles.ganttPlaceholder}>ガントチャート表示エリア（Task 10で実装予定）</div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工程表詳細・編集画面
 */
export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [scheduleData, setScheduleData] = useState<ScheduleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 工程表データを取得
  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function loadSchedule() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getScheduleDetail(id!);
        if (!cancelled) {
          setScheduleData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '工程表の読み込みに失敗しました');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSchedule();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // パンくずリスト
  const breadcrumbItems = scheduleData
    ? [
        { label: 'プロジェクト一覧', path: '/projects' },
        {
          label: 'プロジェクト詳細',
          path: `/projects/${scheduleData.projectId}`,
        },
        {
          label: '工程表一覧',
          path: `/projects/${scheduleData.projectId}/schedules`,
        },
        { label: scheduleData.name },
      ]
    : [];

  // ローディング
  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>読み込み中...</div>
      </div>
    );
  }

  // エラー
  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorMessage}>{error}</div>
      </div>
    );
  }

  // データなし
  if (!scheduleData) {
    return (
      <div style={styles.container}>
        <div style={styles.errorMessage}>工程表が見つかりません</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Breadcrumb items={breadcrumbItems} />
      <ScheduleDetailContent data={scheduleData} />
    </div>
  );
}
