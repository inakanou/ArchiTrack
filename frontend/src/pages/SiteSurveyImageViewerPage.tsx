/**
 * @fileoverview 現場調査画像ビューア/エディタページ
 *
 * Task 22.1: ルーティング設定を実装する
 *
 * Requirements:
 * - 2.4: 詳細画面の画像クリックで画像ビューア/エディタに遷移する
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 5.2: ズームイン/ズームアウト操作
 * - 5.3: 画像の回転
 * - 5.4: パン操作（表示領域移動）
 * - 5.6: 表示状態を注釈編集モードと共有
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSiteSurvey } from '../api/site-surveys';
import { ApiError } from '../api/client';
import type { SiteSurveyDetail, SurveyImageInfo } from '../types/site-survey.types';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import AnnotationEditor from '../components/site-surveys/AnnotationEditor';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px 16px',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  breadcrumbContainer: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
  } as React.CSSProperties,
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  } as React.CSSProperties,
  imageContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  placeholderContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '2px dashed #d1d5db',
  } as React.CSSProperties,
  placeholderText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '8px',
  } as React.CSSProperties,
  placeholderSubText: {
    fontSize: '14px',
    color: '#9ca3af',
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  editButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  editButtonActive: {
    backgroundColor: '#16a34a',
  } as React.CSSProperties,
  editorContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    height: 'calc(100vh - 200px)',
    minHeight: '500px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 画像ビューアページ用のパンくずを生成
 */
function buildImageViewerBreadcrumb(
  projectId: string,
  projectName: string,
  surveyId: string,
  surveyName: string,
  imageName: string
): BreadcrumbItem[] {
  return [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査', path: `/projects/${projectId}/site-surveys` },
    { label: surveyName, path: `/site-surveys/${surveyId}` },
    { label: imageName },
  ];
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現場調査画像ビューア/エディタページ
 *
 * 現場調査に紐づく画像を表示し、注釈編集機能を提供します。
 * Note: 注釈編集機能の詳細実装は後続タスクで行います。
 */
export default function SiteSurveyImageViewerPage() {
  const { id, imageId } = useParams<{ id: string; imageId: string }>();
  const navigate = useNavigate();

  // データ状態
  const [survey, setSurvey] = useState<SiteSurveyDetail | null>(null);
  const [image, setImage] = useState<SurveyImageInfo | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // ビューア状態（REQ-5.6: 将来的にAnnotationEditorと状態共有用）
  const [zoom] = useState(1);
  const [rotation] = useState(0);
  const [pan] = useState({ x: 0, y: 0 });

  /**
   * 現場調査と画像データを取得
   */
  const fetchData = useCallback(async () => {
    if (!id || !imageId) return;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const surveyData = await getSiteSurvey(id);
      setSurvey(surveyData);

      // 指定された画像を検索
      const foundImage = surveyData.images.find((img) => img.id === imageId);
      if (foundImage) {
        setImage(foundImage);
      } else {
        setIsNotFound(true);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 404) {
          setIsNotFound(true);
          return;
        }
        setError(err.message || 'エラーが発生しました');
      } else {
        setError('エラーが発生しました');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, imageId]);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 詳細ページに戻る
   */
  const handleBackClick = useCallback(() => {
    if (id) {
      navigate(`/site-surveys/${id}`);
    } else {
      navigate(-1);
    }
  }, [id, navigate]);

  // 存在しないリソースの表示
  if (isNotFound) {
    return (
      <main role="main" style={styles.container}>
        <ResourceNotFound
          resourceType="画像"
          returnPath={id ? `/site-surveys/${id}` : '/projects'}
          returnLabel="現場調査に戻る"
        />
      </main>
    );
  }

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
          <p>読み込み中...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    );
  }

  // エラー表示
  if (error && !survey) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // データがない場合
  if (!survey || !image || !id) {
    return null;
  }

  // パンくずナビゲーション項目
  const breadcrumbItems = buildImageViewerBreadcrumb(
    survey.projectId,
    survey.project.name,
    survey.id,
    survey.name,
    image.fileName || '画像'
  );

  return (
    <main role="main" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div>
          <Link to={`/site-surveys/${id}`} style={styles.backLink} onClick={handleBackClick}>
            &larr; 現場調査に戻る
          </Link>
          <h1 style={styles.title}>{image.fileName || '画像'}</h1>
        </div>
        <button
          type="button"
          style={{
            ...styles.editButton,
            ...(isEditMode ? styles.editButtonActive : {}),
          }}
          onClick={() => setIsEditMode(!isEditMode)}
          aria-pressed={isEditMode}
        >
          {isEditMode ? '編集終了' : '編集モード'}
        </button>
      </div>

      {/* 画像表示 / 注釈エディタ（REQ-9.2: 閲覧モードでも注釈を表示） */}
      {image.originalUrl ? (
        <div style={styles.editorContainer}>
          <AnnotationEditor
            imageUrl={image.originalUrl}
            imageId={image.id}
            surveyId={id}
            initialZoom={zoom}
            initialRotation={rotation}
            initialPan={pan}
            readOnly={!isEditMode}
          />
        </div>
      ) : (
        <div style={styles.imageContainer}>
          <div style={styles.placeholderContainer}>
            <p style={styles.placeholderText}>画像が読み込めません</p>
            <p style={styles.placeholderSubText}>画像が存在しないか、読み込みに失敗しました。</p>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </main>
  );
}
