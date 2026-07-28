/**
 * @fileoverview ExportSettingsForm - 工事写真 ZIP一括エクスポート設定フォーム
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * {@link BulkExportDialog} が共有する設定入力フォーム。
 * - 形式選択UI（JPEG/PNG, R15.2）
 * - 解像度選択UI（低/中/高, R15.3）
 * - 看板重畳モード選択UI（composited/plain/original, R15.4）
 *
 * site-survey `components/site-surveys/ExportSettingsForm.tsx` の独立クローン。
 * site-survey 側の `annotationMode`（含める/含めない/元画像そのまま）に相当する
 * 選択軸を、工事写真では「看板重畳モード」（composited=看板を重畳した画像 /
 * plain=看板を重畳しない加工画像 / original=アップロード原本そのまま）に置き換える。
 * site-survey 側の実装・テストは一切変更しない。
 *
 * @requirement construction-photo/15.2 エクスポート画像形式（JPEG/PNG）の選択
 * @requirement construction-photo/15.3 エクスポート解像度（低/中/高）の選択
 * @requirement construction-photo/15.4 看板重畳モード（composited/plain/original）の選択
 * @see .kiro/specs/construction-photo/design.md ExportSettingsForm（追加機能ファイル, R15）
 * @module components/construction-photos/ExportSettingsForm
 */

import { useId } from 'react';
import type {
  ConstructionPhotoExportFormat,
  ConstructionPhotoExportResolution,
  ConstructionPhotoExportSettings,
  SignboardExportMode,
} from '../../services/export/ConstructionPhotoBulkExportService';

// ============================================================================
// Props
// ============================================================================

export interface ExportSettingsFormProps {
  /** 現在の設定値 */
  value: ConstructionPhotoExportSettings;
  /** 設定変更ハンドラ */
  onChange: (next: ConstructionPhotoExportSettings) => void;
  /** 非活性フラグ（例: エクスポート対象0件時） */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義（site-survey ExportSettingsForm と概ね統一）
// ============================================================================

const styles = {
  fieldset: {
    border: 'none',
    margin: 0,
    padding: 0,
    marginBottom: '20px',
  },
  legend: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
    display: 'block',
  },
  radioGroup: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#374151',
  },
  radioLabelDisabled: {
    cursor: 'not-allowed',
    color: '#6b7280', // WCAG 2.1 AA準拠 (5.0:1 on #fff)
  },
  radio: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  radioDisabled: {
    cursor: 'not-allowed',
  },
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事写真 ZIP一括エクスポートの設定フォーム（形式/解像度/看板重畳モード）。
 */
export function ExportSettingsForm({
  value,
  onChange,
  disabled = false,
}: ExportSettingsFormProps): React.ReactElement {
  const formatLabelId = useId();
  const resolutionLabelId = useId();
  const signboardModeLabelId = useId();

  const handleFormatChange = (next: ConstructionPhotoExportFormat): void => {
    onChange({ ...value, format: next });
  };

  const handleResolutionChange = (next: ConstructionPhotoExportResolution): void => {
    onChange({ ...value, resolution: next });
  };

  const handleSignboardModeChange = (next: SignboardExportMode): void => {
    onChange({ ...value, signboardMode: next });
  };

  const labelStyle = (isDisabled: boolean) => ({
    ...styles.radioLabel,
    ...(isDisabled ? styles.radioLabelDisabled : {}),
  });

  const radioStyle = (isDisabled: boolean) => ({
    ...styles.radio,
    ...(isDisabled ? styles.radioDisabled : {}),
  });

  return (
    <div>
      {/* エクスポート形式 (R15.2) */}
      <fieldset style={styles.fieldset} disabled={disabled}>
        <legend id={formatLabelId} style={styles.legend}>
          エクスポート形式
        </legend>
        <div style={styles.radioGroup} role="radiogroup" aria-labelledby={formatLabelId}>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-format"
              value="jpeg"
              checked={value.format === 'jpeg'}
              onChange={() => handleFormatChange('jpeg')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="JPEG"
            />
            JPEG
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-format"
              value="png"
              checked={value.format === 'png'}
              onChange={() => handleFormatChange('png')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="PNG"
            />
            PNG
          </label>
        </div>
      </fieldset>

      {/* 解像度選択 (R15.3) */}
      <fieldset style={styles.fieldset} disabled={disabled}>
        <legend id={resolutionLabelId} style={styles.legend}>
          品質（解像度）
        </legend>
        <div style={styles.radioGroup} role="radiogroup" aria-labelledby={resolutionLabelId}>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-resolution"
              value="low"
              checked={value.resolution === 'low'}
              onChange={() => handleResolutionChange('low')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="低"
            />
            低
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-resolution"
              value="medium"
              checked={value.resolution === 'medium'}
              onChange={() => handleResolutionChange('medium')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="中"
            />
            中
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-resolution"
              value="high"
              checked={value.resolution === 'high'}
              onChange={() => handleResolutionChange('high')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="高"
            />
            高
          </label>
        </div>
      </fieldset>

      {/* 看板重畳モード (R15.4) */}
      <fieldset style={styles.fieldset} disabled={disabled}>
        <legend id={signboardModeLabelId} style={styles.legend}>
          看板重畳モード
        </legend>
        <div style={styles.radioGroup} role="radiogroup" aria-labelledby={signboardModeLabelId}>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-signboard-mode"
              value="composited"
              checked={value.signboardMode === 'composited'}
              onChange={() => handleSignboardModeChange('composited')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="看板を重畳した画像"
            />
            看板を重畳した画像
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-signboard-mode"
              value="plain"
              checked={value.signboardMode === 'plain'}
              onChange={() => handleSignboardModeChange('plain')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="看板を重畳しない加工画像"
            />
            看板を重畳しない加工画像
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="cp-export-signboard-mode"
              value="original"
              checked={value.signboardMode === 'original'}
              onChange={() => handleSignboardModeChange('original')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="アップロード原本そのまま"
            />
            アップロード原本そのまま
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export default ExportSettingsForm;
