/**
 * ExportSettingsFormコンポーネント
 *
 * 個別/一括エクスポートで共有する設定フォーム
 * - 形式選択UI（JPEG/PNG）
 * - 解像度選択UI（低/中/高の3段階）
 * - 注釈モード選択UI（含める/含めない/元画像そのまま）
 *
 * Task 83.1: ExportSettingsForm の切り出し
 * 既存 ImageExportDialog.tsx 内の選択ロジックを独立化したもの。
 *
 * @see design.md - ExportSettingsForm (5247-5269)
 * @see requirements.md - 要件31.4
 */

import React, { useId } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * エクスポート形式
 */
export type ExportFormat = 'jpeg' | 'png';

/**
 * エクスポート解像度
 */
export type ExportResolution = 'low' | 'medium' | 'high';

/**
 * 注釈モード
 * - include: 注釈を含める
 * - exclude: 注釈を含めない（注釈描画はせずレンダリングのみ）
 * - original-only: 元画像そのまま（再レンダリングを行わず原本を取得）
 */
export type AnnotationMode = 'include' | 'exclude' | 'original-only';

/**
 * エクスポート設定
 */
export interface ExportSettings {
  /** 出力形式 */
  format: ExportFormat;
  /** 解像度 */
  resolution: ExportResolution;
  /** 注釈モード */
  annotationMode: AnnotationMode;
}

/**
 * ExportSettingsFormコンポーネントのProps
 */
export interface ExportSettingsFormProps {
  /** 現在の設定値 */
  value: ExportSettings;
  /** 設定変更ハンドラ */
  onChange: (next: ExportSettings) => void;
  /** 非活性フラグ */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
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
 * エクスポート設定フォーム
 */
const ExportSettingsForm: React.FC<ExportSettingsFormProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const formatLabelId = useId();
  const resolutionLabelId = useId();
  const annotationLabelId = useId();

  const handleFormatChange = (next: ExportFormat) => {
    onChange({ ...value, format: next });
  };

  const handleResolutionChange = (next: ExportResolution) => {
    onChange({ ...value, resolution: next });
  };

  const handleAnnotationModeChange = (next: AnnotationMode) => {
    onChange({ ...value, annotationMode: next });
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
      {/* エクスポート形式 */}
      <fieldset style={styles.fieldset} disabled={disabled}>
        <legend id={formatLabelId} style={styles.legend}>
          エクスポート形式
        </legend>
        <div style={styles.radioGroup} role="radiogroup" aria-labelledby={formatLabelId}>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="export-format"
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
              name="export-format"
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

      {/* 解像度選択 */}
      <fieldset style={styles.fieldset} disabled={disabled}>
        <legend id={resolutionLabelId} style={styles.legend}>
          品質（解像度）
        </legend>
        <div style={styles.radioGroup} role="radiogroup" aria-labelledby={resolutionLabelId}>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="export-resolution"
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
              name="export-resolution"
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
              name="export-resolution"
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

      {/* 注釈モード */}
      <fieldset style={styles.fieldset} disabled={disabled}>
        <legend id={annotationLabelId} style={styles.legend}>
          注釈オプション
        </legend>
        <div style={styles.radioGroup} role="radiogroup" aria-labelledby={annotationLabelId}>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="export-annotation-mode"
              value="include"
              checked={value.annotationMode === 'include'}
              onChange={() => handleAnnotationModeChange('include')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="注釈を含める"
            />
            注釈を含める
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="export-annotation-mode"
              value="exclude"
              checked={value.annotationMode === 'exclude'}
              onChange={() => handleAnnotationModeChange('exclude')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="注釈を含めない"
            />
            注釈を含めない
          </label>
          <label style={labelStyle(disabled)}>
            <input
              type="radio"
              name="export-annotation-mode"
              value="original-only"
              checked={value.annotationMode === 'original-only'}
              onChange={() => handleAnnotationModeChange('original-only')}
              disabled={disabled}
              style={radioStyle(disabled)}
              aria-label="元画像そのまま"
            />
            元画像そのまま
          </label>
        </div>
      </fieldset>
    </div>
  );
};

export default ExportSettingsForm;
