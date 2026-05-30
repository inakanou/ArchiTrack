/**
 * @fileoverview bulkExportService - 複数画像の一括 ZIP エクスポート Coordinator
 *
 * 複数の現場調査画像に対し、Req 12 と同一の単一画像レンダリングを
 * 順次適用して JSZip に格納し、単一 ZIP Blob を生成する coordinator。
 *
 * 本ファイルは Task 84 全体の基盤であり、Task 84.1 で
 * 「順次レンダリング + JSZip パッケージング + 基本進捗 callback」を実装し、
 * Task 84.2 で「AbortSignal によるキャンセル経路と中間生成物解放」を実装し、
 * Task 84.3 で「部分失敗集約と原本そのまま分岐」を追加する。
 *
 * @requirement site-survey/REQ-31.5 順次レンダリング
 * @requirement site-survey/REQ-31.6 JSZip パッケージング
 * @requirement site-survey/REQ-31.7 進捗 callback
 * @requirement site-survey/REQ-31.8 ZIP 内ファイル名規則の統一
 * @requirement site-survey/REQ-31.11 進行中処理のキャンセル可能性
 * @requirement site-survey/REQ-31.12 キャンセル時に ZIP を生成しない
 * @requirement site-survey/REQ-31.13 部分失敗集約（個別画像 reject を捕捉し継続）
 * @requirement site-survey/REQ-31.18 原本そのまま分岐（annotationMode = 'original-only'）
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
  /** 処理完了枚数（0 始まり累計、成功・失敗いずれも含む試行数） */
  done: number;
  /** 全体枚数 */
  total: number;
  /** これまでに失敗した枚数（成功時は据え置き、失敗時に +1） */
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
  /**
   * 全体ステータス
   * - `success`: 全件成功し ZIP 生成完了
   * - `partial`: 1 件以上失敗。成功分のみを含む ZIP を生成（成功 0 件のときは空 ZIP）
   * - `cancelled`: AbortSignal により中断。ZIP は生成しない
   */
  status: 'success' | 'partial' | 'cancelled';
  /** 生成された ZIP Blob（`success` / `partial` のとき必須、`cancelled` で未設定） */
  zipBlob?: Blob;
  /** ZIP ファイル名（`success` / `partial` のとき必須） */
  zipFileName?: string;
  /** 失敗集約（`partial` のとき 1 件以上、`success` のときは空配列） */
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
 * 例外オブジェクトから message 文字列を取り出す。
 *
 * `failures[].message` 用に、Error / 文字列 / 不明型のいずれでも安全に扱う。
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * R2 オリジナル画像 URL から Blob を取得する（`annotationMode === 'original-only'` 用）
 *
 * 設計（design.md L5155）の "`ExportService.downloadOriginal(image)` 相当の R2 fetch のみ実行" を
 * 担う内部ヘルパー。`ExportService.downloadOriginalImage` は DOM ダウンロードまで実行してしまうため、
 * bulk 経路では fetch + blob() のみを行う等価実装をここに切り出す。
 *
 * @param originalUrl `SurveyImageInfo.originalUrl`（`string | null | undefined`）
 * @returns 取得した Blob
 * @throws originalUrl 未設定 / fetch ネットワーク失敗 / レスポンス !ok
 */
async function fetchOriginalBlob(originalUrl: string | null | undefined): Promise<Blob> {
  if (!originalUrl) {
    throw new Error('originalUrl is required for original-only export');
  }
  const response = await fetch(originalUrl, {
    mode: 'cors',
    credentials: 'omit', // 署名付き URL は認証不要（ExportService と同じ方針）
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch original image: ${response.status} ${response.statusText || ''}`.trim()
    );
  }
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
 * Task 84.3 のスコープ:
 *   - 個別画像処理を try/catch で包み reject を `failures: BulkExportFailure[]` に集約
 *     してループ継続。`reason` は `render` / `fetch` の発生フェーズで分類
 *   - `settings.annotationMode === 'original-only'` のとき `renderImage` をスキップし、
 *     `fetchOriginalBlob` で `image.originalUrl` から Blob を直接取得
 *   - 1 件以上失敗があれば `status: 'partial'` を返し、成功分のみ含む ZIP を生成
 *   - 進捗 callback の `failedSoFar` を `failures.length` で更新
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
      const failures: BulkExportFailure[] = [];
      const useOriginalOnly = input.settings.annotationMode === 'original-only';

      /**
       * キャンセル時の共通 return ヘルパー。
       *
       * - ZIP Blob は生成しない（REQ-31.12）
       * - JSZip インスタンス参照を解放し中間生成物の保持を断つ（REQ-31.19）
       * - これまで集約した失敗集は破棄する（キャンセル時の `failures` は空配列で固定）
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

          // ----------------------------------------------------------------
          // 個別画像処理: try/catch で reject を捕捉して failures に集約する。
          // ループは継続し、最終的に成功分のみで ZIP を生成する（REQ-31.13）
          // ----------------------------------------------------------------
          let blob: Blob | null = null;
          // 例外発生時に reason を切り分けるため、現在のフェーズを保持する。
          //   'render' : renderImage / dataURL → Blob 変換
          //   'fetch'  : original-only モードの R2 fetch
          let phase: 'render' | 'fetch' = useOriginalOnly ? 'fetch' : 'render';

          try {
            if (useOriginalOnly) {
              // 原本そのまま: renderImage をスキップし R2 fetch のみ実行（REQ-31.18）
              phase = 'fetch';
              blob = await fetchOriginalBlob(image.originalUrl);
            } else {
              // 通常: AnnotationRendererService.renderImage → dataURL → Blob
              phase = 'render';
              const rendered = await renderer.renderImage(image, renderOptions);

              // (b) renderImage 完了直後の abort 確認
              //     非同期処理の最中に abort された場合、ここで検知して
              //     これ以降の Blob 化・ZIP 追加・進捗通知を行わない。
              if (signal.aborted) {
                return buildCancelledResult();
              }

              // renderImage が falsy を返したら失敗扱い（reject と同等）
              if (!rendered) {
                throw new Error('renderImage returned no result');
              }

              blob = await dataUrlToBlob(rendered.dataUrl);
            }

            // (c) Blob 取得完了直後の abort 確認
            //     fetch 系処理は非同期であるため、ZIP 追加直前にも abort を
            //     確認して中間 Blob を破棄する。
            if (signal.aborted) {
              blob = null;
              return buildCancelledResult();
            }

            // ZIP エントリ名を決定
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

            // JSZip に追加
            zip.file(entryName, blob);

            // 中間 Blob 参照を即座に解放（JSZip 内部に保持されるため
            // ローカル変数からの参照は不要）
            blob = null;
          } catch (error) {
            // abort 由来のキャンセルは上の signal.aborted チェックで処理済み。
            // ここで捕捉されるのは個別画像処理の純粋な失敗のみ。
            blob = null;
            failures.push({
              imageId: image.id,
              imageName: image.fileName,
              reason: phase,
              message: extractErrorMessage(error),
            });
          }

          // 進捗 callback（成功・失敗いずれの場合も index+1 / total を通知）
          onProgress({
            done: index + 1,
            total,
            failedSoFar: failures.length,
          });
        }

        // ループ完了直前の最終 abort 確認
        // generateAsync 開始直前に abort されている場合も中間生成物を残さない
        if (signal.aborted) {
          return buildCancelledResult();
        }

        // ZIP Blob 生成（成功分のみ。全件失敗時も空 ZIP を返す）
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFileName = buildZipFileName(input.surveyName, exportedAt);

        return {
          status: failures.length === 0 ? 'success' : 'partial',
          zipBlob,
          zipFileName,
          failures,
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
