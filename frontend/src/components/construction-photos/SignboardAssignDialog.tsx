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
 * Requirements: 9.1, 9.2, 9.5
 *
 * @module components/construction-photos/SignboardAssignDialog
 */

import { useState } from 'react';
import SignboardPlacementEditor from './SignboardPlacementEditor';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../../types/construction-photo.types';

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
}: SignboardAssignDialogProps): React.ReactElement {
  // 初期選択は写真項目の現在の看板（未指定は null, R9.2）
  const [selectedId, setSelectedId] = useState<string | null>(photo.signboardId);

  const selectedSignboard = signboards.find((s) => s.id === selectedId) ?? null;

  /** エディタの保存で確定した配置を、選択看板IDと組にして親へ返す（R9.5） */
  const handleEditorSave = (placement: SignboardPlacement | null): void => {
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
      <div style={styles.content}>
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
          >
            <option value="">未指定</option>
            {signboards.map((signboard) => (
              <option key={signboard.id} value={signboard.id}>
                {signboard.workName || '（名称未設定）'}
              </option>
            ))}
          </select>
        </div>

        {/* 配置エディタ（再利用・不変更）。看板未指定なら Rect 非表示で placement=null */}
        <SignboardPlacementEditor
          photo={photo}
          signboard={selectedSignboard}
          initialPlacement={photo.signboardPlacement}
          onSave={handleEditorSave}
        />

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
