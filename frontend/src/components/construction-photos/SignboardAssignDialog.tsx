/**
 * @fileoverview 看板配置ダイアログ（詳細画面の結線用サブコンポーネント）
 *
 * Task 9.3 結線: 詳細画面の各写真項目から「看板を配置」導線でこのダイアログを開き、
 *   (1) 当該プロジェクトの工事看板を選択（未指定=None も可, R9.2）、
 *   (2) 再利用する {@link SignboardPlacementEditor} で写真上に配置し（R9.1, R9.3, R9.4）、
 *   (3) 保存すると選択看板ID＋配置ジオメトリを親（ConstructionPhotoDetailPage）へ返す。
 *
 * 保存の確定（メタバッチ＋順序の最大2リクエスト）は親の既存保存フローに統合する（R9.5）。
 * 本コンポーネントは看板選択とエディタの結線のみを担い、座標換算・fabric 連携は
 * SignboardPlacementEditor に委譲する（同エディタは不変更・再利用のみ）。
 *
 * タスク 23.2 追加: 看板マスタへの導線。看板を指定するこの場面は、利用者が看板の登録の必要に
 * 気付く場面である。看板が1件も無いと選択肢は「未指定」だけになるため、その旨の案内を出す。
 * 親が看板マスタの経路（`signboardMasterPath`）を渡したとき（＝利用者が看板の閲覧の権限を持つ
 * とき）は、看板の有無によらず看板マスタへのリンク「工事看板マスタを開く」を示す（別の看板を
 * 足す場面にも要るため）。リンクを押すとダイアログを閉じ、遷移は react-router の遷移として行う。
 * そのため親の画面の未保存の変更の確認（`useBlocker`, R18.2）を経る。ダイアログを先に閉じるのは、
 * 確認のダイアログをこのダイアログの背後に隠さないためである。モバイル幅では、リンクのタップ
 * 領域を横断ルールの下限（`TAP_TARGET_MIN_PX`）以上にする（R19、詳細画面の他の操作と同じ扱い）。
 *
 * 「登録されていません」は、看板の一覧の取得が成功して0件だったときだけ述べる（是正 1 巡目）。
 * 親は取得の状態（`signboardsStatus`）を渡す。取得の失敗は詳細画面の他の失敗の表示と同じく
 * role=alert で示し、0件とは述べない。看板の閲覧の権限が無い（親は取得しない。取得しても 403 で
 * あり0件ではない）ときは権限が無い旨を示す。取得中は role=status で示す。取得に失敗しても
 * 看板マスタへのリンクは残す——看板マスタは自前で一覧を取得するため、登録済みの看板を確かめる
 * 手段になり、リンクに添える文は「登録されていません」ではないため重複登録を誘わない。
 *
 * 是正 2 巡目: 看板の一覧が取得済み（`loaded`）でない間は、写真項目の看板の指定を変える・解除する
 * 操作を出さない。選択（select）を disabled にし、配置エディタ（その唯一の出力である「保存」を
 * 含む）を描画しない。エディタを描画しないのは、看板の実体を持たないエディタは「看板は未指定です
 * （配置なしで保存できます）」と偽って示し、その「保存」は配置に null を返すためである（取得中・
 * 失敗中に保存すると、利用者が触れていない配置が消えた）。「キャンセル」は常に押せる。取得済みでも、
 * 写真項目の看板が一覧に見当たらない（取り除かれた等）ときは、選択はその看板を指したまま、その旨を
 * 示し、エディタを描画しない。利用者が別の看板か「未指定」を明示的に選んだときだけエディタを出す。
 * 多重の防御として、`handleEditorSave` は解決できない看板を指したままでは `onSave` を呼ばない
 * （未保存の状態も立てない）。
 *
 * Requirements: 9.1, 9.2, 9.5
 *
 * @module components/construction-photos/SignboardAssignDialog
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import SignboardPlacementEditor from './SignboardPlacementEditor';
import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';
import { TAP_TARGET_MIN_PX } from '../../utils/tap-target';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../../types/construction-photo.types';

// ============================================================================
// 型
// ============================================================================

/**
 * 看板の一覧の取得の状態（是正 1 巡目）。
 * - `loaded`: 取得に成功した（`signboards` が0件なら「登録されていません」と述べてよい）
 * - `loading`: 取得中（権限情報のロード中を含む）
 * - `failed`: 取得に失敗した
 * - `not-permitted`: 看板の閲覧の権限（construction_signboard:read）が無く、取得していない
 */
export type SignboardsLoadStatus = 'loaded' | 'loading' | 'failed' | 'not-permitted';

/** 看板の一覧の取得に失敗したときの文言 */
const SIGNBOARDS_LOAD_FAILED_MESSAGE =
  '工事看板を読み込めませんでした。時間をおいて再度お試しください。';

/** 看板の閲覧の権限が無いときの文言 */
const SIGNBOARDS_NOT_PERMITTED_MESSAGE = '工事看板を閲覧する権限が無いため、看板を選択できません。';

// ============================================================================
// Props
// ============================================================================

export interface SignboardAssignDialogProps {
  /** 配置対象の写真項目（背景・実寸・既存配置の供給元） */
  photo: ConstructionPhotoWithUrls;
  /** 当該プロジェクトの工事看板一覧（選択肢） */
  signboards: ConstructionSignboard[];
  /**
   * 保存時のハンドラ。選択看板ID（未指定は null）と配置ジオメトリ（未指定は null）を返す。
   * 親は未保存の pending 変更として保持し、既存の保存フローで確定する。
   */
  onSave: (signboardId: string | null, placement: SignboardPlacement | null) => void;
  /** ダイアログを閉じる（キャンセル）ハンドラ */
  onClose: () => void;
  /**
   * 当該プロジェクトの看板マスタの経路（タスク 23.2）。渡したときだけ看板マスタへのリンクを示す。
   * 親は利用者が看板の閲覧の権限（construction_signboard:read）を持つときだけ渡す。
   */
  signboardMasterPath?: string;
  /**
   * 看板の一覧の取得の状態（是正 1 巡目）。既定は `loaded`（`signboards` を取得済みの一覧として扱う）。
   * 「登録されていません」の案内は `loaded` かつ0件のときだけ出す。
   */
  signboardsStatus?: SignboardsLoadStatus;
}

// ============================================================================
// スタイル
// ============================================================================

const styles = {
  dialog: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  } as React.CSSProperties,
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  } as React.CSSProperties,
  content: {
    position: 'relative' as const,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '720px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  label: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: 500,
  } as React.CSSProperties,
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,
  // 看板が0件の案内。overflowWrap:anywhere は区切りの無い長い語にも折り返し位置を与え、
  // 狭幅でダイアログの本体を押し広げないようにする
  emptyGuidance: {
    margin: 0,
    fontSize: '14px',
    color: '#374151',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  // 取得の失敗の文言（詳細画面の通知の枠と同じ配色）
  loadFailed: {
    margin: 0,
    padding: '12px',
    fontSize: '14px',
    color: '#991b1b',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  masterLinkRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  masterLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 500,
    color: '#1d4ed8',
    textDecoration: 'underline',
  } as React.CSSProperties,
  // モバイル幅でのみ合成するタップ領域の下限（R19, タスク 23.2。PhotoItemPanel と同じ出所）
  masterLinkMobile: {
    minWidth: `${TAP_TARGET_MIN_PX}px`,
    minHeight: `${TAP_TARGET_MIN_PX}px`,
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 看板選択＋配置エディタを提示するモーダルダイアログ。
 */
export function SignboardAssignDialog({
  photo,
  signboards,
  onSave,
  onClose,
  signboardMasterPath,
  signboardsStatus = 'loaded',
}: SignboardAssignDialogProps): React.ReactElement {
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  // 初期選択は写真項目の現在の看板（未指定は null, R9.2）
  const [selectedId, setSelectedId] = useState<string | null>(photo.signboardId);

  const selectedSignboard = signboards.find((s) => s.id === selectedId) ?? null;

  const isListUsable = signboardsStatus === 'loaded';
  // 写真項目の現在の看板が一覧で解決できない（取得前・失敗・権限なし・一覧に無い）
  const isCurrentUnresolved =
    photo.signboardId !== null && !signboards.some((s) => s.id === photo.signboardId);
  // 選択が看板を指しているのに、その看板を一覧で解決できない
  const isSelectionUnresolved = selectedId !== null && selectedSignboard === null;
  // 看板の指定を変える操作（配置エディタとその「保存」）を出してよいか（是正 2 巡目）
  const canAssign = isListUsable && !isSelectionUnresolved;

  /**
   * エディタの保存で確定した配置を、選択看板IDと組にして親へ返す（R9.5）。
   * 多重の防御（是正 2 巡目）: 一覧が使えない間、または解決できない看板を指したままでは呼ばない。
   * 写真項目の現在の値をそのまま返す案は、変更の無い保存で未保存の状態を立ててしまうため採らない。
   */
  const handleEditorSave = (placement: SignboardPlacement | null): void => {
    if (!canAssign) return;
    onSave(selectedId, placement);
  };

  return (
    <div
      style={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signboard-assign-title"
    >
      <div style={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div style={styles.content} data-testid="signboard-assign-content">
        <h2 id="signboard-assign-title" style={styles.title}>
          看板を配置
        </h2>

        {/* 看板選択（未指定を許容, R9.2） */}
        <div style={styles.field}>
          <label htmlFor="signboard-assign-select" style={styles.label}>
            看板を選択
          </label>
          <select
            id="signboard-assign-select"
            style={styles.select}
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value === '' ? null : e.target.value)}
            disabled={!isListUsable}
          >
            <option value="">未指定</option>
            {/* 写真項目の現在の看板を一覧で解決できない間も、選択は「未指定」を装わずその看板を指す */}
            {isCurrentUnresolved && photo.signboardId && (
              <option value={photo.signboardId} disabled>
                現在の看板（一覧で確認できません）
              </option>
            )}
            {signboards.map((signboard) => (
              <option key={signboard.id} value={signboard.id}>
                {signboard.workName || '（名称未設定）'}
              </option>
            ))}
          </select>
        </div>

        {/* 看板の一覧の取得の状態（是正 1 巡目）。失敗・権限なし・取得中を「0件」と取り違えない */}
        {signboardsStatus === 'failed' && (
          <p role="alert" style={styles.loadFailed} data-testid="signboard-load-failed">
            {SIGNBOARDS_LOAD_FAILED_MESSAGE}
          </p>
        )}
        {signboardsStatus === 'not-permitted' && (
          <p style={styles.emptyGuidance}>{SIGNBOARDS_NOT_PERMITTED_MESSAGE}</p>
        )}
        {signboardsStatus === 'loading' && (
          <p role="status" style={styles.emptyGuidance}>
            工事看板を読み込んでいます…
          </p>
        )}

        {/* 取得済みの一覧に、選んでいる（写真項目の現在の）看板が無い（是正 2 巡目） */}
        {isListUsable && isSelectionUnresolved && (
          <p style={styles.emptyGuidance} data-testid="signboard-unresolved-guidance">
            現在の看板は工事看板の一覧にありません（取り除かれた可能性があります）。別の看板か「未指定」を選んでから保存してください。
          </p>
        )}

        {/* 看板が0件の案内（タスク 23.2）。取得に成功して0件のときだけ、選択肢が「未指定」だけに
            なる理由を示す */}
        {signboardsStatus === 'loaded' && signboards.length === 0 && (
          <p style={styles.emptyGuidance} data-testid="signboard-empty-guidance">
            このプロジェクトには工事看板が登録されていません。
            {signboardMasterPath ? '工事看板マスタで登録すると、ここで選択できます。' : ''}
          </p>
        )}

        {/* 看板マスタへの導線（タスク 23.2、看板の閲覧の権限があるときだけ親が経路を渡す） */}
        {signboardMasterPath && (
          <div style={styles.masterLinkRow}>
            <Link
              to={signboardMasterPath}
              onClick={onClose}
              style={{
                ...styles.masterLink,
                ...(isMobile ? styles.masterLinkMobile : {}),
              }}
              data-testid="signboard-master-link"
            >
              工事看板マスタを開く
            </Link>
          </div>
        )}

        {/* 配置エディタ（再利用・不変更）。看板未指定なら Rect 非表示で placement=null。
            一覧が使えない間・解決できない看板を指している間は描画しない（是正 2 巡目） */}
        {canAssign && (
          <SignboardPlacementEditor
            photo={photo}
            signboard={selectedSignboard}
            initialPlacement={photo.signboardPlacement}
            onSave={handleEditorSave}
          />
        )}

        <div style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.cancelButton}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignboardAssignDialog;
