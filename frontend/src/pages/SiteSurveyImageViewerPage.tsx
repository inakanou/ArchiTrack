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
 * - 9.3: 注釈を編集中に画面を離れようとしたとき、未保存の変更があれば確認ダイアログを表示する
 *
 * @requirement site-survey/REQ-9.3
 * @requirement site-survey/REQ-36.4
 * @requirement site-survey/REQ-36.6
 * @requirement site-survey/REQ-36.7
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useBlocker } from 'react-router-dom';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
import useMediaQuery from '../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../utils/responsive';
import { getSiteSurvey } from '../api/site-surveys';
import './SiteSurveyImageViewerPage.css';
import { ApiError } from '../api/client';
import type { SiteSurveyDetail, SurveyImageInfo } from '../types/site-survey.types';
import { Breadcrumb, ResourceNotFound } from '../components/common';
import AnnotationEditor from '../components/site-surveys/AnnotationEditor';
import { buildSiteSurveyImageBreadcrumb } from '../utils/siteSurveyBreadcrumb';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px 16px',
    // minHeight は svh 二段宣言のため CSS クラス .survey-image-viewer へ移設（REQ-36.4）
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  breadcrumbContainer: {
    marginBottom: '16px',
    // Task 98.2 root-cause fix (Req 34.6): モバイル幅で長いパンくず（非折返しの flex 行）が
    // device-width を超えて水平 overflow すると、モバイルブラウザの shrink-to-fit により
    // レイアウトビューポートが拡張され、編集領域や position:fixed の ZoomControls が
    // 可視画面下端より下へ押し出されて片手で到達できなくなる。パンくずを水平スクロール内に
    // 収め（overflowX:auto）レイアウトビューポート拡張を防ぐ。
    overflowX: 'auto',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    // 長いタイトルとボタンが同一行に共存できるよう、行の折返しは禁じつつ
    // 子（タイトル側）を縮小させて水平はみ出しを防ぐ（REQ-36.6）
    gap: '12px',
  } as React.CSSProperties,
  // タイトルラッパ: flex 行内で縮小可能にする。min-width:0 が無いと flex アイテムの
  // 既定 min-width:auto によりコンテンツ幅未満に縮まず、長いファイル名がボタンを
  // ビューポート外へ押し出して水平 overflow を招く（REQ-36.6）
  titleContainer: {
    flex: '1 1 auto',
    minWidth: 0,
  } as React.CSSProperties,
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
    // ラッパと同様に flex コンテキストで縮小できるようにする（REQ-36.6）
    minWidth: 0,
  } as React.CSSProperties,
  // モバイル幅: 単一行 + 省略記号で頭打ちにする。折返し（overflow-wrap）だと
  // 長いファイル名でヘッダー行が縦に伸び、sticky なアプリヘッダーが作業領域へ
  // 重畳する余地を生むため、省略記号で高さを一定に保つ（REQ-36.7）
  titleMobile: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    // ボタンは潰さずタイトル側を優先的に縮小させる（REQ-36.6）
    flexShrink: 0,
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  editButtonActive: {
    backgroundColor: '#16a34a',
  } as React.CSSProperties,
  editorContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
    // height/minHeight は svh 二段宣言のため CSS クラス .survey-image-viewer__editor へ移設（REQ-36.4）
    // インラインstyleはCSSクラスを上書きするため、ここに height/minHeight を残してはならない
  } as React.CSSProperties,
};

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
  // モバイル幅判定（MEDIA_QUERIES.isMobile = (max-width: 767px)）
  // 早期 return より前で無条件に呼び、Hooks の呼び出し順序を安定させる（REQ-36.7）
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  // データ状態
  const [survey, setSurvey] = useState<SiteSurveyDetail | null>(null);
  const [image, setImage] = useState<SurveyImageInfo | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // ==========================================================================
  // Task 115.102 (REQ-9.3): 未保存の注釈編集がある状態での離脱確認
  //
  // 注釈編集画面には離脱を捕捉する仕組みが一切無く、描いた注釈は保存せずに画面を離れると
  // 黙って失われていた。既存の確立済みパターン（CompanyInfoPage / QuantityTableEditPage 等）に
  // 合わせ、アプリ内遷移は `useBlocker` + `UnsavedChangesDialog`、タブクローズ/リロードは
  // `useUnsavedChanges` の beforeunload で捕捉する。
  //
  // 未保存かどうかの判定は注釈エディタ側が持つ（読み込み・復元由来の変更を除いた
  // ユーザー編集の有無）。本画面はその通知を受けて離脱を止める役だけを担う。
  // ==========================================================================
  const [hasUnsavedAnnotationChanges, setHasUnsavedAnnotationChanges] = useState(false);

  // タブクローズ/リロード時のブラウザ標準確認（REQ-9.3）
  //
  // `useUnsavedChanges` は自前の dirty 状態を持ち、`beforeunload` の登録条件は
  // 「`enabled` かつ内部の dirty」である。`enabled` だけを渡しても内部の dirty は
  // 初期値 false のままで登録されない（`EstimateDetailPage` が同じ注意書きを残している）。
  // 未保存判定の正は注釈エディタ側であるため、`setDirty` で追従させる。
  const { setDirty: setUnsavedGuardDirty } = useUnsavedChanges();

  useEffect(() => {
    setUnsavedGuardDirty(hasUnsavedAnnotationChanges);
  }, [hasUnsavedAnnotationChanges, setUnsavedGuardDirty]);

  // アプリ内ナビゲーションのブロック（REQ-9.3）
  const blocker = useBlocker(hasUnsavedAnnotationChanges);

  // 表示対象の画像が変われば、前の画像の未保存状態は引き継がない
  useEffect(() => {
    setHasUnsavedAnnotationChanges(false);
  }, [imageId]);

  // 表示状態（REQ-5.6: ズーム・回転・位置を注釈編集モードと共有する）
  //
  // Task 115.83: 閲覧モードと編集モードは同じ `AnnotationEditor` を `readOnly` で
  // 切り替えて使うが、切り替え時に Fabric キャンバスが作り直されるため、表示状態は
  // 画面（本ページ）側が保持しなければ引き継げない。以前は setter を持たない定数
  // だったため共有が成立していなかった。
  //
  // 初期値は `null`（＝未取得）とし、最初の表示では初期値を渡さない。保存済みの回転
  // （REQ-22.5）の復元を、まだ何も操作していない既定値で上書きしないためである。
  const [viewState, setViewState] = useState<{
    zoom: number;
    rotation: number;
    pan: { x: number; y: number };
  } | null>(null);

  /**
   * 表示状態の変化を受け取り保持する（REQ-5.6）。
   *
   * 同値の通知では state を更新せず、再描画の連鎖を避ける。
   */
  const handleViewStateChange = useCallback(
    (next: { zoom: number; rotation: number; pan: { x: number; y: number } }) => {
      setViewState((prev) => {
        if (
          prev &&
          prev.zoom === next.zoom &&
          prev.rotation === next.rotation &&
          prev.pan.x === next.pan.x &&
          prev.pan.y === next.pan.y
        ) {
          return prev;
        }
        return next;
      });
    },
    []
  );

  /**
   * 表示する画像が変わったら共有中の表示状態を破棄する（REQ-5.6）。
   *
   * 共有状態は「いま見ている画像の表示状態」であり、別画像へ持ち越すと、その画像の
   * 保存済み回転（REQ-22.5）を前の画像の回転で上書きしてしまう。
   */
  useEffect(() => {
    setViewState(null);
  }, [imageId]);

  /**
   * 注釈保存成功時のコールバック（REQ-23.5: サムネイルURL即時反映）
   *
   * AnnotationEditorの保存レスポンスに含まれるannotatedThumbnailUrlを
   * ローカルのimage stateに反映し、画面遷移なしで最新サムネイルを表示する。
   */
  const handleAnnotationSaved = useCallback((result: { annotatedThumbnailUrl: string | null }) => {
    setImage((prev) => {
      if (!prev) return prev;
      return { ...prev, annotatedThumbnailUrl: result.annotatedThumbnailUrl };
    });
  }, []);

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

  // 存在しないリソースの表示
  if (isNotFound) {
    return (
      <main role="main" className="survey-image-viewer" style={styles.container}>
        <ResourceNotFound
          resourceType="画像"
          returnPath={id ? `/site-surveys/${id}` : '/projects'}
          returnLabel="前の画面に戻る"
        />
      </main>
    );
  }

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" className="survey-image-viewer" style={styles.container}>
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
      <main role="main" className="survey-image-viewer" style={styles.container}>
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
  const breadcrumbItems = buildSiteSurveyImageBreadcrumb(
    survey.projectId,
    survey.project.name,
    survey.id,
    survey.name,
    image.fileName || '画像'
  );

  return (
    <main role="main" className="survey-image-viewer" style={styles.container}>
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbContainer}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.titleContainer}>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>
            {image.fileName || '画像'}
          </h1>
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
        <div className="survey-image-viewer__editor" style={styles.editorContainer}>
          <AnnotationEditor
            imageUrl={image.originalUrl}
            imageId={image.id}
            surveyId={id}
            initialZoom={viewState?.zoom}
            initialRotation={viewState?.rotation}
            initialPan={viewState?.pan}
            onViewStateChange={handleViewStateChange}
            readOnly={!isEditMode}
            imageInfo={image}
            onAnnotationSaved={handleAnnotationSaved}
            onRequestRefresh={fetchData}
            onDirtyChange={setHasUnsavedAnnotationChanges}
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

      {/* REQ-9.3: 未保存の注釈編集がある状態でのアプリ内遷移を確認する */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />

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
