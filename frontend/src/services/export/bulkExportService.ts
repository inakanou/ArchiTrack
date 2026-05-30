/**
 * @fileoverview bulkExportService - 複数画像の一括 ZIP エクスポート Coordinator
 *
 * 複数の現場調査画像に対し、Req 12 と同一の単一画像レンダリングを
 * 順次適用して JSZip に格納し、単一 ZIP Blob を生成する coordinator。
 *
 * 本ファイルは Task 84 全体の基盤であり、Task 84.1 で
 * 「順次レンダリング + JSZip パッケージング + 基本進捗 callback」を実装し、
 * Task 84.2 で「AbortSignal によるキャンセル経路と中間生成物解放」を実装する。
 * 部分失敗集約・原本そのまま分岐（Task 84.3）は後続タスクで追加する。
 *
 * @requirement site-survey/REQ-31.5 順次レンダリング
 * @requirement site-survey/REQ-31.6 JSZip パッケージング
 * @requirement site-survey/REQ-31.7 進捗 callback
 * @requirement site-survey/REQ-31.8 ZIP 内ファイル名規則の統一
 * @requirement site-survey/REQ-31.11 進行中処理のキャンセル可能性
 * @requirement site-survey/REQ-31.12 キャンセル時に ZIP を生成しない
 * @requirement site-survey/REQ-31.19 完了/キャンセル時の中間生成物解放
 * @see .kiro/specs/site-survey/design.md bulkExportService (5135-5215)
 */

import JSZip from 'jszip';
import { AnnotationRendererService } from './AnnotationRendererService';
import type { RenderOptions } from './AnnotationRendererService';
import { buildEntryName, buildZipFileName } from './zip-naming';
import type { SurveyImageInfo } from '../../types/site-survey.types';

// ============================================================================
// 型定義（design.md 5161-5206 行に準拠）
// ============================================================================

/**
 * エクスポート形式
 *
 * `ExportSettingsForm` (Task 83.1) および `zip-naming` の同名型と整合する。
 */
export type ExportFormat = 'jpeg' | 'png';

/**
 * エクスポート解像度（低・中・高）
 */
export type ExportResolution = 'low' | 'medium' | 'high';

/**
 * 注釈モード
 *
 * - `include`: 注釈を含めてレンダリング
 * - `exclude`: 注釈を含めずレンダリング（再レンダリング有）
 * - `original-only`: 元画像をそのまま取得（再レンダリング無し）
 */
export type AnnotationMode = 'include' | 'exclude' | 'original-only';

/**
 * エクスポート設定
 *
 * `ExportSettingsForm` の `ExportSettings` と構造一致。
 */
export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  annotationMode: AnnotationMode;
}

/**
 * 一括エクスポート対象画像（`SurveyImageInfo` 互換の最小型）
 *
 * 呼び出し側は `SurveyImageInfo` をそのまま渡せる。
 */
export type SurveyImageMetadata = SurveyImageInfo;

/**
 * `bulkExportService.execute` の入力
 */
export interface BulkExportInput {
  /** 現場調査 ID */
  surveyId: string;
  /** 現場調査名（ZIP ファイル名に利用） */
  surveyName: string;
  /** 一括エクスポート対象画像（少なくとも 1 件以上） */
  images: SurveyImageMetadata[];
  /** エクスポート設定 */
  settings: ExportSettings;
}

/**
 * 進捗情報
 *
 * `done <= total` を常に満たす。
 */
export interface BulkExportProgress {
  /** 処理完了枚数（0 始まり累計） */
  done: number;
  /** 全体枚数 */
  total: number;
  /** 失敗集約数（Task 84.3 で本格対応。本タスクでは常に 0） */
  failedSoFar: number;
}

/**
 * 失敗エントリ
 */
export interface BulkExportFailure {
  imageId: string;
  imageName: string;
  reason: 'render' | 'fetch' | 'unknown';
  message: string;
}

/**
 * `bulkExportService.execute` の結果
 */
export interface BulkExportResult {
  /** 全体ステータス */
  status: 'success' | 'partial' | 'cancelled';
  /** 生成された ZIP Blob（`status === 'success'` のとき必須、`cancelled` で未設定） */
  zipBlob?: Blob;
  /** ZIP ファイル名（`status === 'success'` のとき必須） */
  zipFileName?: string;
  /** 失敗集約（Task 84.3 で実装、本タスクでは常に空配列） */
  failures: BulkExportFailure[];
}

/**
 * bulkExportService インターフェース
 */
export interface BulkExportService {
  execute(
    input: BulkExportInput,
    onProgress: (progress: BulkExportProgress) => void,
    signal: AbortSignal
  ): Promise<BulkExportResult>;
}

// ============================================================================
// 解像度ごとの品質パラメータ
// ============================================================================

/**
 * `ExportResolution` を `AnnotationRendererService.renderImage` の `quality`
 * パラメータにマップする。
 *
 * 既存 `ExportService.exportImage` の慣習に従い 0.6 / 0.9 / 1.0 の 3 段階とする。
 */
const QUALITY_BY_RESOLUTION: Record<ExportResolution, number> = {
  low: 0.6,
  medium: 0.9,
  high: 1.0,
};

// ============================================================================
// 内部ヘルパー
// ============================================================================

/**
 * `data:` URL を Blob に変換する
 *
 * `AnnotationRendererService.renderImage` は dataURL を返すため、
 * JSZip に追加する前に Blob 化する必要がある。
 *
 * テスト容易性のためグローバル `fetch` を経由する（モック差し替え可）。
 *
 * @param dataUrl dataURL 文字列
 * @returns Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * `BulkExportInput.settings` を `AnnotationRendererService.renderImage` の
 * `RenderOptions` に変換する。
 */
function settingsToRenderOptions(settings: ExportSettings): RenderOptions {
  return {
    format: settings.format,
    quality: QUALITY_BY_RESOLUTION[settings.resolution],
  };
}

// ============================================================================
// Service 実装
// ============================================================================

/**
 * `bulkExportService` のデフォルト実装を生成する factory
 *
 * Task 84.1 のスコープ:
 *   - `input.images` を順次 `AnnotationRendererService.renderImage` でレンダリング
 *   - 戻りの dataURL を Blob 化し `zip-naming.buildEntryName` でエントリ名を決定して JSZip に追加
 *   - 完了時に `JSZip.generateAsync({ type: 'blob' })` で単一 ZIP Blob を生成
 *   - 進捗 callback は各画像処理完了ごとに `{ done: index+1, total, failedSoFar: 0 }`
 *   - 開始前 abort 済み signal のみ最低限の cancelled 経路を実装
 *
 * Task 84.2 のスコープ:
 *   - 各反復先頭・renderImage 完了直後・blob 化完了直後の 3 箇所で
 *     `signal.aborted` を確認し、true なら ZIP 生成をスキップして
 *     `{ status: 'cancelled', failures: [], zipBlob: undefined }` を返す
 *   - キャンセル時／完了時とも JSZip インスタンスおよび中間 Blob 参照を解放する
 *
 * Task 84.3 で以下が後続追加される:
 *   - 失敗画像の `failures` 集約と `original-only` 分岐
 *
 * @param renderer `AnnotationRendererService` のインスタンス（DI）
 * @returns BulkExportService 実装
 */
export function createBulkExportService(
  renderer: AnnotationRendererService = new AnnotationRendererService()
): BulkExportService {
  return {
    async execute(
      input: BulkExportInput,
      onProgress: (progress: BulkExportProgress) => void,
      signal: AbortSignal
    ): Promise<BulkExportResult> {
      const total = input.images.length;

      // 開始前 abort 済みなら即座に cancelled を返す（REQ-31.11 / REQ-31.12）
      if (signal.aborted) {
        return { status: 'cancelled', failures: [] };
      }

      // JSZip と各種中間参照は cancelled / success のいずれの経路でも
      // 明示的に解放するため、try/finally でクリーンアップする（REQ-31.19）
      let zip: JSZip | null = new JSZip();
      const existingNames = new Set<string>();
      const renderOptions = settingsToRenderOptions(input.settings);
      const exportedAt = new Date();

      /**
       * キャンセル時の共通 return ヘルパー。
       *
       * - ZIP Blob は生成しない（REQ-31.12）
       * - JSZip インスタンス参照を解放し中間生成物の保持を断つ（REQ-31.19）
       */
      const buildCancelledResult = (): BulkExportResult => {
        // JSZip 内部の files マップを明示的に破棄する。
        // `zip.files = {}` への直接代入は型上不可なため、参照を null 化して
        // GC 任せにする。残りのスコープ内変数（blob 等）もこの時点で
        // 参照を失う設計とする。
        zip = null;
        return { status: 'cancelled', failures: [] };
      };

      try {
        for (let index = 0; index < input.images.length; index += 1) {
          // (a) 反復先頭での abort 確認
          if (signal.aborted) {
            return buildCancelledResult();
          }

          const image = input.images[index];
          // `noUncheckedIndexedAccess` 対策: ループ上限が `input.images.length` のため
          // 通常は undefined にならないが、型安全のため明示的に防御
          if (!image) {
            continue;
          }

          // 1. 注釈付き画像をレンダリング
          const rendered = await renderer.renderImage(image, renderOptions);

          // (b) renderImage 完了直後の abort 確認
          //     非同期処理の最中に abort された場合、ここで検知して
          //     これ以降の Blob 化・ZIP 追加・進捗通知を行わない。
          if (signal.aborted) {
            return buildCancelledResult();
          }

          // 注釈レンダリング失敗時の本格的な集約は Task 84.3 に委譲
          // 本タスクでは観測可能完了状態を満たすため、null 時は単にスキップ
          if (!rendered) {
            continue;
          }

          // 2. dataURL → Blob
          let blob: Blob | null = await dataUrlToBlob(rendered.dataUrl);

          // (c) Blob 変換完了直後の abort 確認
          //     dataUrlToBlob 内の fetch も非同期処理であるため、
          //     ZIP 追加直前にも abort を確認して中間 Blob を破棄する。
          if (signal.aborted) {
            blob = null;
            return buildCancelledResult();
          }

          // 3. ZIP エントリ名を決定
          const entryName = buildEntryName(
            {
              surveyName: input.surveyName,
              exportedAt,
              image: { id: image.id, fileName: image.fileName },
              index,
              format: input.settings.format,
            },
            existingNames
          );

          // 4. JSZip に追加
          zip.file(entryName, blob);

          // 中間 Blob 参照を即座に解放（JSZip 内部に保持されるため
          // ローカル変数からの参照は不要）
          blob = null;

          // 5. 進捗 callback
          onProgress({
            done: index + 1,
            total,
            failedSoFar: 0,
          });
        }

        // ループ完了直前の最終 abort 確認
        // generateAsync 開始直前に abort されている場合も中間生成物を残さない
        if (signal.aborted) {
          return buildCancelledResult();
        }

        // ZIP Blob 生成
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFileName = buildZipFileName(input.surveyName, exportedAt);

        return {
          status: 'success',
          zipBlob,
          zipFileName,
          failures: [],
        };
      } finally {
        // 成功・キャンセルいずれの場合も JSZip インスタンス参照を解放する。
        // 成功時の `zipBlob` は呼び出し側に返却済みであり、JSZip 自体への
        // 参照を保持する意味はないため、ここで明示的に null 化する。（REQ-31.19）
        zip = null;
      }
    },
  };
}

// ============================================================================
// デフォルトインスタンス
// ============================================================================

/**
 * デフォルトの `bulkExportService` インスタンス
 *
 * テスト容易性のため、必要に応じて `createBulkExportService(renderer)` で
 * 個別インスタンスを生成して差し替え可能。
 */
export const bulkExportService: BulkExportService = createBulkExportService();
