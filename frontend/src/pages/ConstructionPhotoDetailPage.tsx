/**
 * @fileoverview 工事写真アルバム詳細ページ
 *
 * Task 6.3: 詳細画面：写真項目管理＋3系統アップロード
 *
 * site-survey の SiteSurveyDetailPage を雛形に、工事写真アルバム配下の写真項目を
 * 管理する詳細画面を提供する。
 *   - 詳細1リクエストで写真項目＋署名付きサムネURLを一括取得（R7.8, R11.2, R11.3）
 *   - 3系統アップローダ（ローカル/カメラ/現調選択）で写真項目を追加（R4, R5, R6）
 *   - コメント/印刷対象/並び替えを未保存状態で保持し、手動「保存」でメタデータ一括更新＋
 *     表示順序更新の最大2リクエストに束ねて確定（R7.6, R11.4）
 *
 * ルート登録（routes.tsx）・看板配置エディタ（Task 6.4）は本タスクの境界外。5.1 のAPIクライアントを
 * 使用する。
 *
 * Task 8.2 追加: 「PDF出力」ボタンを追加し、印刷対象のみ・保存表示順で印字画像をオンデマンド取得して
 * 台帳PDFを出力する（看板重畳はサーバ委譲、印刷対象0件は非実行で通知）。
 *
 * Task 12.2 追加: ZIP一括エクスポート（全件/選択）を結線する。
 *   - エクスポート起動導線（全件/選択ボタン）、対象選択（`PhotoItemPanel` の選択チェックで
 *     選択集合を本コンポーネントが保持, R15.6, R15.7）
 *   - `AbortController` の生成・`ConstructionPhotoBulkExportService.export` の実行・
 *     進捗（`onProgress`）反映・中断（`abort()`）・完了後の ZIP ダウンロード確定は
 *     本コンポーネントが担うオーケストレーション（`BulkExportDialog`/
 *     `BulkExportProgressDialog` は疎結合なプレゼンテーション部品, R15.1, R15.8, R15.9）
 *   - 対象0件時は非実行のまま通知（`onEmptyTarget`, R15.11）
 *
 * Task 12.4 追加: 権限に基づくUI表示制御を結線する。
 *   - `useConstructionPhotoPermission` の canEdit/canDelete で編集系・削除系の操作手段を
 *     出し分け（権限ロード中は当該フックが安全側でfalseを返すため追加のロード判定は不要, R17.5）
 *   - canEdit=false: アップローダ・アルバム編集導線を非表示にし、`PhotoItemPanel` を
 *     `readOnly` で保存/並び替え/コメント/印刷対象/看板配置を抑止（R17.1, R17.3）
 *   - canDelete=false: アルバム削除導線を非表示にし、写真項目削除ハンドラを渡さない（R17.2）
 *
 * Task 12.5 追加: 未保存離脱警告を結線する（独自isDirty stateを共有フックへ置換）。
 *   - 未保存判定 `isDirty` は本画面が持ち、コメント/印刷対象/並び替え/看板配置の
 *     変更発生で `markAsChanged()`、保存成功で `markAsSaved()`（R18.1, R18.3）
 *   - 共有フックへは `useUnsavedChanges({ isDirty: canEdit && isDirty })` と渡し、編集権限が
 *     無い場合は離脱警告を出さない（R18.4）。当初は `useUnsavedChanges({ enabled: canEdit })` と
 *     フック内部の dirty を使っていたが、quantity-table-generation の Task 100.24 でフックが
 *     自前の dirty 状態を持たず `isDirty` を直接受ける形へ一本化された
 *   - ブラウザのリロード/タブ・ウィンドウ閉じはフックの beforeunload が担う（R18.1）。
 *     アプリ内遷移は `useBlocker(isDirty)`（QuantityTableEditPage/CompanyInfoPage/
 *     ItemizedStatementDetailPage の確立済みパターン）で `Breadcrumb` のリンククリックを含む
 *     遷移全般を汎用的に捕捉し、`UnsavedChangesDialog` で確認、「離れる」選択時のみ
 *     `blocker.proceed()` で遷移を継続する（R18.2）
 *   - タスク 23.6 で、`markAsChanged()` / `markAsSaved()` を `syncDirtyWithPending()` へ置き換えた。
 *     `isDirty` は保留中の変更（`pendingChangesRef` のメタ変更と `pendingOrderRef` の順序変更）が
 *     一つでも残っているときに限って真で、保留を足す・消すすべての箇所（メタ変更・順序変更・保存・
 *     写真項目の削除の成功）でこの関数が保留から決め直す。変更前は削除の成功が保留を消しても
 *     フラグを戻さず、送るものの無い「保存」は冒頭で戻るため、読み込み直すまで未保存のまま残った
 *   - タスク 24.5 で、利用者の判断（2026-10-04）により、保存は開始時に送る保留を取り出し、成功の
 *     後は送ったものだけを保留から消す形へ改めた。変更前は成功の後に保留をすべて消したため、要求の
 *     実行中にした編集も消え、表示は編集されたままなのに未保存が解消し、離脱すると編集が失われた。
 *     実行中の編集は送った内容と比べ、違えば未保存として残して次の保存で送り、送った内容と同じ
 *     値へ戻したものは消す。失敗のときは従来どおり保留を何も消さない
 *
 * Task 21.3 追加: 写真項目の削除が失敗したときに、失敗を通知の枠（`styles.notice`、role=alert）へ
 *   出す。受入基準 7.7 は失敗時の表示を定めておらず、利用者の判断（2026-10-02）で加えた挙動である。
 *   文言と状態は同じ画面のアルバム削除の失敗と同じ形（`error`。サーバーが返した理由を優先し、
 *   無ければ既定の文言）で、セッション切れ（401）も他の失敗と区別しない。確認ダイアログは
 *   `PhotoItemPanel` が失敗時にも閉じ、通知は画面内へ送る
 *
 * Task 23.9 変更: 利用者の判断（2026-10-03）で、写真項目の削除の失敗の表示を、取り除こうとした
 *   写真項目の中（`PhotoItemPanel` が描く）へ移した。本画面は失敗を捕捉せず `PhotoItemPanel` へ
 *   伝播させ、通知の枠と失敗の状態（`error`）には載せず、画面を通知の枠へ送らない。21.3 が足した、通知の枠を
 *   画面内へ送る仕組み（要素の参照と要求の通し番号と effect）と、削除の開始時の `notice` と
 *   `error` の消去は、いずれも削除の失敗を通知の枠に出すための仕組みだったため外した。文言の規則と
 *   セッション切れを区別しないことは 21.3 のまま（規則は `PhotoItemPanel` へ移した）
 *
 * Task 23.4 変更: 利用者の判断（2026-10-03）で、ZIP の一括エクスポートの一部失敗時に自動では
 *   ダウンロードしないようにした（受入基準 15.10）。生成が終わった ZIP に失敗が一件でもあれば、
 *   Blob とファイル名を参照（`pendingExportRef`）に保留し、進捗ダイアログの結果の段（`exportOutcome`）で
 *   失敗した写真項目をファイル名と順番で示す。成功と失敗が混在するときは「成功した項目だけで
 *   ダウンロードする」で保留した ZIP をダウンロードして従来の部分失敗の通知を出し、「ダウンロードしない」
 *   （Escape を含む）では何もダウンロードせずに閉じる。すべて失敗したときはダウンロードせず、失敗の
 *   一覧と「閉じる」だけを示す。全件成功は従来どおり即座にダウンロードする。保留はダイアログを閉じる
 *   すべての経路・次のエクスポートの開始・画面の破棄で手放し、オブジェクトURLはダウンロードの瞬間に
 *   作ってその場で解放する（保留中は作らない）。画面の破棄時は実行中のエクスポートも中断する
 *
 * Task 22.1 変更: 利用者の判断（2026-10-04）で、通知の枠の通知（PDF・ZIP・アップロードの結果）と
 *   失敗（保存・アルバムの削除・取得）を一つの状態（`pageMessage`）にまとめた。変更前は二つの状態を
 *   `notice ?? error` で描いたため、通知が出ている間は失敗が隠れ、通知が消えると古い失敗が再び
 *   現れた。後から出たものが前のものを置き換え、消えた後に古いものは現れない。各操作の開始時の
 *   消去は変更前と同じくその種類だけを消す（保存の開始は失敗だけ、PDF・ZIP の開始と写真項目の
 *   追加は通知だけ）。自動で消えるタイマーは持たない
 *
 * Task 22.2 変更: 利用者の判断（2026-10-04）で、保存の失敗を保存ボタンの近く（`PhotoItemPanel` の
 *   保存ボタンの直後）にも表示する。上部の通知の枠は押した直後の位置で、375 幅で共通ヘッダの下、
 *   1280 幅で共通ヘッダに覆われ、320 幅で画面の外になるためである。上部の枠の表示は 22.1 の形のまま
 *   残す。近くの表示は `pageMessage` の保存の失敗（`isSaveFailure`）から描き、上部の枠と同じ契機で
 *   消え、後から出たものに置き換わる。読み上げを二重にしないため、近くの表示がある間は近くの表示
 *   だけを role=alert にし、上部の枠は同じ文言を role を持たずに描く。枠の role が変わるときは key で
 *   要素を作り直し、role=alert の枠は常に新しく挿入する（既存の要素へ後から付けると支援技術によって
 *   は読み上げられない）
 *
 * Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 11.3, 11.4, 11.5,
 *   10.1, 10.3, 10.12, 10.13, 15.1, 15.5, 15.6, 15.7, 15.8, 15.9, 15.11, 17.1, 17.2, 17.3,
 *   17.4, 17.5, 18.1, 18.2, 18.3, 18.4
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import {
  getConstructionPhotoAlbum,
  deleteConstructionPhotoAlbum,
} from '../api/construction-photos';
import {
  getConstructionPhotos,
  updateConstructionPhotoMetadataBatch,
  updateConstructionPhotoOrder,
  deleteConstructionPhoto,
} from '../api/construction-photo-images';
import { getProject } from '../api/projects';
import { getConstructionSignboards } from '../api/construction-signboards';
import { ApiError } from '../api/client';
// 台帳PDF出力サービスは日本語フォント資産（約3MB）へ静的に到達するため、
// 値としては静的 import せず出力実行時に動的読み込みする（初期チャンクからの分離）
import { loadConstructionPhotoLedgerExportService } from '../services/export/loadConstructionPhotoLedgerExportService';
import { constructionPhotoBulkExportService } from '../services/export/ConstructionPhotoBulkExportService';
import type {
  ConstructionPhotoExportProgress,
  ConstructionPhotoExportSettings,
} from '../services/export/ConstructionPhotoBulkExportService';
import { buildConstructionPhotoZipFileName } from '../services/export/constructionPhotoZipNaming';
import { Breadcrumb } from '../components/common';
import type { BreadcrumbItem } from '../components/common';
import { PhotoUploader } from '../components/construction-photos/PhotoUploader';
import {
  PhotoItemPanel,
  type PhotoMetadataChange,
} from '../components/construction-photos/PhotoItemPanel';
import { SignboardAssignDialog } from '../components/construction-photos/SignboardAssignDialog';
import type { SignboardsLoadStatus } from '../components/construction-photos/SignboardAssignDialog';
import AlbumDeleteDialog from '../components/construction-photos/AlbumDeleteDialog';
import {
  BulkExportDialog,
  type BulkExportDialogMode,
} from '../components/construction-photos/BulkExportDialog';
import {
  BulkExportProgressDialog,
  type BulkExportOutcome,
} from '../components/construction-photos/BulkExportProgressDialog';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
import { useConstructionPhotoPermission } from '../hooks/useConstructionPhotoPermission';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import useMediaQuery from '../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../utils/responsive';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
  BatchUpdatePhotoMetadataItem,
  PhotoOrderItem,
} from '../types/construction-photo.types';
import type { ProjectDetail } from '../types/project.types';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px 16px',
  } as React.CSSProperties,
  // モバイル幅では固定 maxWidth:1200px の支配を解消し、コンテナを画面幅にフィットさせて
  // 横スクロールを防ぐ（site-survey SiteSurveyDetailPage Task 100.2 と同一パターン, R19.1）
  containerMobile: {
    maxWidth: '100%',
    margin: '0',
    padding: '16px 12px',
  } as React.CSSProperties,
  // overflowX:auto は常時付与し、長いパンくず行を水平スクロール内に収めて
  // 祖先(コンテナ)の scrollWidth への寄与を断つ（デスクトップ幅でも回帰しない, R19.4）
  // overflowWrap:anywhere は共通 Breadcrumb の各項目（折り返さない flex 行の項目）へ継承され、
  // 区切りの無い英数字の語にも折り返し位置を与えて項目の最小幅を縮める。これが無いと
  // 「…工事_1790846187373」のような名前で項目の最小幅の和が狭幅を超え、ブレッドクラム
  // 自身が水平にはみ出す（タスク 19.2 の E2E で実測, R19.4）
  breadcrumbWrapper: {
    marginBottom: '16px',
    overflowX: 'auto' as const,
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  header: {
    marginBottom: '24px',
  } as React.CSSProperties,
  headerTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  albumActionsRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  editAlbumButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteAlbumButton: {
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // overflowWrap:anywhere は区切りの無い英数字の長い語（アルバム名は最大 200 文字）にも折り返し
  // 位置を与え、見出しの最小幅を縮める。これが無いと見出しが折り返さずに <main> を押し広げ、
  // 詳細画面に横スクロールが生じる（タスク 20.1 の E2E で実測, R19.1）。メモも同じ扱いとする
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  memo: {
    fontSize: '14px',
    color: '#6b7280',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    gap: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  exportButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  exportButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  headerButtonRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  zipExportButton: {
    backgroundColor: '#ffffff',
    color: '#1d4ed8',
    border: '1px solid #1d4ed8',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  zipExportButtonDisabled: {
    color: '#9ca3af',
    border: '1px solid #d1d5db',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  // overflowWrap:anywhere は共有のアップロード部品（ImageUploader）へ継承され、同部品が出す
  // 「アップロードできないファイルがあります」の表示（<ファイル名>: ファイルサイズが…）に折り返し
  // 位置を与える。これが無いと、区切りの無い長いファイル名でサイズ上限を超えるファイルを選んだ
  // ときに <main> が押し広げられる（タスク 20.8 の E2E で実測, R19.1）
  uploaderWrapper: {
    marginBottom: '24px',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  // overflowWrap:anywhere は区切りの無い長い語にも折り返し位置を与える。通知はアップロードに
  // 失敗したファイル名を並べ、カメラ由来のファイル名はアンダースコア区切りで一語として扱われる。
  // これが無いとファイル名が通知の枠の外へ描かれ、<main> を押し広げて詳細画面に横スクロールが
  // 生じる（タスク 20.8 の E2E で実測, R19.1）。保存エラーなどの文言も同じ枠に出る
  notice: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    whiteSpace: 'pre-line' as const,
    overflowWrap: 'anywhere' as const,
    color: '#991b1b',
    fontSize: '14px',
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
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  // overflowWrap:anywhere は、アルバムを取得できないときのエラー表示が区切りの無い長い文言で
  // <main> を押し広げないようにする（タスク 20.8 の E2E で実測, R19.1）
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    marginBottom: '16px',
    overflowWrap: 'anywhere' as const,
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * ZIP の Blob をファイルとしてダウンロードさせる。オブジェクトURLはその場で解放する（R15.1）
 */
function downloadZip(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 看板の配置が同じか（null 同士も同じとする） */
function isSamePlacement(
  a: SignboardPlacement | null | undefined,
  b: SignboardPlacement | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/**
 * メタ変更の項目の一覧。`PhotoMetadataChange` へ項目が足されたら型の検査で漏れが分かるよう、
 * 全項目を持つ形で書く（比べる項目が漏れると、実行中の編集を送った内容と同じとみなして消しうる）
 */
const METADATA_CHANGE_KEYS = Object.keys({
  comment: true,
  includeInReport: true,
  signboardId: true,
  signboardPlacement: true,
} satisfies Record<keyof PhotoMetadataChange, true>) as Array<keyof PhotoMetadataChange>;

/** 写真項目のメタ変更が同じ内容か（持つ項目の組と各値で比べる） */
function isSameMetadataChange(a: PhotoMetadataChange, b: PhotoMetadataChange): boolean {
  return METADATA_CHANGE_KEYS.every((key) => {
    if (key in a !== key in b) return false;
    if (key === 'signboardPlacement') {
      return isSamePlacement(a.signboardPlacement, b.signboardPlacement);
    }
    return a[key] === b[key];
  });
}

/** 順序の保留が同じ内容か（写真項目の並びと各順序で比べる） */
function isSameOrder(a: PhotoOrderItem[], b: PhotoOrderItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => item.id === b[i]!.id && item.order === b[i]!.order)
  );
}

/**
 * 保存の成功の後に、送った保留だけを保留から消す（タスク 24.5）。
 * 写真項目ごとに、現在の保留が送った内容と同じなら消す。保存の要求の実行中に編集され、送った
 * 内容と違えば、その写真項目の保留はそのまま残し、次の保存で送る（送った項目を再び送っても
 * 結果は変わらない）。実行中に送った値から編集して送った値へ戻したときは、保存された値と表示が
 * 一致するため消す。実行中に取り除かれた写真項目は保留に無いため何もしない。
 */
function removeSentFromPending(
  pending: Map<string, PhotoMetadataChange>,
  sent: Map<string, PhotoMetadataChange>
): void {
  sent.forEach((sentChange, photoId) => {
    const current = pending.get(photoId);
    if (current && isSameMetadataChange(current, sentChange)) {
      pending.delete(photoId);
    }
  });
}

/**
 * 工事写真アルバム詳細ページ
 */
/**
 * 通知の枠に出す表示の種類（タスク 22.1）。`notice` は PDF・ZIP・アップロードの結果の通知、
 * `error` は保存・アルバムの削除・取得の失敗である。描画はどちらも同じ枠（role=alert）で、
 * 種類は消去の対象を決めるために持つ（各操作の開始時の消去は、変更前と同じくその種類だけを消す）
 */
type PageMessageKind = 'notice' | 'error';

interface PageMessage {
  kind: PageMessageKind;
  text: string;
  /**
   * 保存の失敗か（タスク 22.2）。真のとき、同じ文言を保存ボタンの近くにも role=alert で表示し、
   * 上部の枠は role を持たずに描く（読み上げを二重にしない）。上部の枠と近くの表示は同じこの
   * 状態から描くため、消える契機と後からの置き換えは揃う
   */
  isSaveFailure?: boolean;
}

export default function ConstructionPhotoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // 権限（R17.1, R17.2, R17.3, R17.5: ロード中は canEdit/canDelete が安全側でfalseになる）
  const {
    canEdit,
    canDelete,
    canViewSignboards,
    isLoading: isPermissionLoading,
  } = useConstructionPhotoPermission();

  // モバイル幅判定（Requirement 19 / Task 12.6）。固定幅の支配を解消するため、
  // ページコンテナの maxWidth/padding をモバイル幅で切り替える（R19.1）。
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    ...(isMobile ? styles.containerMobile : {}),
  };

  // 未保存のメタデータ変更（photoId -> {comment?, includeInReport?, signboardId?, signboardPlacement?}）
  const pendingChangesRef = useRef<Map<string, PhotoMetadataChange>>(new Map());
  // 未保存の順序変更
  const pendingOrderRef = useRef<PhotoOrderItem[] | null>(null);

  // 未保存離脱警告（R18.1, R18.3, R18.4）。編集権限が無ければ未保存変更が生じないため無効化する。
  const [isDirty, setIsDirty] = useState(false);
  /**
   * 未保存の状態を保留中の変更から決め直す（タスク 23.6）。保留（メタ変更・順序変更）が一つでも
   * 残っていれば未保存、空なら未保存でない。保留を足す・消す箇所は必ずこの関数を呼ぶ。
   */
  const syncDirtyWithPending = useCallback(() => {
    setIsDirty(pendingChangesRef.current.size > 0 || pendingOrderRef.current !== null);
  }, []);
  useUnsavedChanges({ isDirty: canEdit && isDirty });
  // アプリ内遷移の汎用ガード（Breadcrumbのリンククリック含む全遷移を捕捉, R18.2）。
  // QuantityTableEditPage/CompanyInfoPage/ItemizedStatementDetailPage の確立済みパターンに準拠。
  const blocker = useBlocker(isDirty);

  const [album, setAlbum] = useState<ConstructionPhotoAlbum | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [photos, setPhotos] = useState<ConstructionPhotoWithUrls[]>([]);
  const [signboards, setSignboards] = useState<ConstructionSignboard[]>([]);
  // 看板の一覧の取得の状態（是正 1 巡目）。取得の失敗・権限なしを「0件」と取り違えないために持つ
  const [signboardsStatus, setSignboardsStatus] = useState<SignboardsLoadStatus>('loading');

  // 看板配置ダイアログの対象写真項目（null=閉）
  const [assignTargetPhoto, setAssignTargetPhoto] = useState<ConstructionPhotoWithUrls | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  // 通知の枠に出す一つの表示（タスク 22.1）。通知（PDF・ZIP・アップロードの結果）と失敗（保存・
  // アルバムの削除・取得）を一つの状態に持ち、後から出たものが前のものを置き換える。消去は
  // その種類のものだけを消す（`clearPageMessage`）。アルバムの取得の失敗も失敗としてここに載り、
  // アルバムが無いときは本体の代わりにエラー画面を描く
  const [pageMessage, setPageMessage] = useState<PageMessage | null>(null);
  const showPageMessage = useCallback(
    (kind: PageMessageKind, text: string, options?: { isSaveFailure?: boolean }) => {
      setPageMessage({ kind, text, isSaveFailure: options?.isSaveFailure ?? false });
    },
    []
  );
  const clearPageMessage = useCallback((kind: PageMessageKind) => {
    setPageMessage((prev) => (prev?.kind === kind ? null : prev));
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // アルバム削除確認ダイアログの開閉状態（R16.3, R16.4）
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);

  // ZIP一括エクスポート対象の選択集合（R15.6, R15.7）
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  // 起動中の BulkExportDialog モード（null は閉, R15.5, R15.6）
  const [bulkExportMode, setBulkExportMode] = useState<BulkExportDialogMode | null>(null);
  // 進捗ダイアログの開閉状態
  const [exportProgressOpen, setExportProgressOpen] = useState(false);
  // 直近の onProgress 通知（R15.8）
  const [exportProgress, setExportProgress] = useState<ConstructionPhotoExportProgress | null>(
    null
  );
  // エクスポート処理が実行中かどうか（false=完了/中断確定）
  const [isExportRunning, setIsExportRunning] = useState(false);
  // 実行中の AbortController（中断操作で abort() を呼ぶ, R15.9）
  const exportControllerRef = useRef<AbortController | null>(null);
  // 一部失敗時に利用者の選択を待つ間だけ保留する ZIP（R15.10, タスク 23.4）
  const pendingExportRef = useRef<{ blob: Blob; fileName: string } | null>(null);
  // 一部失敗・全件失敗の結果（進捗ダイアログの結果の段に出す, R15.10）
  const [exportOutcome, setExportOutcome] = useState<BulkExportOutcome | null>(null);

  // 画面の破棄時は、実行中のエクスポートを中断し、保留中の ZIP を手放す
  useEffect(() => {
    return () => {
      exportControllerRef.current?.abort();
      exportControllerRef.current = null;
      pendingExportRef.current = null;
    };
  }, []);

  /**
   * アルバム・プロジェクト・写真項目一覧を取得する。
   * 写真項目は一覧APIで署名付きサムネURLと共に一括取得する（R7.8, R11.2）。
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    clearPageMessage('error');

    try {
      const albumData = await getConstructionPhotoAlbum(id);
      setAlbum(albumData);

      const [photosResult, projectResult] = await Promise.allSettled([
        getConstructionPhotos(id),
        getProject(albumData.projectId),
      ]);

      if (photosResult.status === 'fulfilled') {
        setPhotos(photosResult.value);
      } else {
        throw photosResult.reason;
      }

      // プロジェクト取得失敗はブレッドクラムのみに影響するため致命的ではない
      setProject(projectResult.status === 'fulfilled' ? projectResult.value : null);
    } catch (err) {
      showPageMessage(
        'error',
        err instanceof ApiError
          ? err.message || '工事写真アルバムの取得に失敗しました'
          : '工事写真アルバムの取得に失敗しました'
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, clearPageMessage, showPageMessage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 看板配置ダイアログの選択肢となる、当該プロジェクトの工事看板の一覧を取得する（是正 1 巡目）。
   *
   * 看板の閲覧の権限（construction_signboard:read）が無ければ取得しない（取得しても 403 であり、
   * 「0件」ではない）。権限情報のロード中は取得中として扱う。取得の失敗は致命的ではない
   * （配置ダイアログの選択肢にだけ影響する）が、状態を `failed` として残し、ダイアログが
   * 「登録されていません」と偽って述べないようにする。写真項目の「看板あり」の表示は
   * 写真項目の `signboardId` から出るため、この一覧に依存しない。
   */
  const signboardsProjectId = album?.projectId;
  useEffect(() => {
    if (isPermissionLoading) {
      setSignboardsStatus('loading');
      return;
    }
    if (!canViewSignboards) {
      setSignboards([]);
      setSignboardsStatus('not-permitted');
      return;
    }
    if (!signboardsProjectId) return;

    let cancelled = false;
    setSignboardsStatus('loading');
    getConstructionSignboards(signboardsProjectId).then(
      (data) => {
        if (cancelled) return;
        setSignboards(data);
        setSignboardsStatus('loaded');
      },
      () => {
        if (cancelled) return;
        setSignboards([]);
        setSignboardsStatus('failed');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [signboardsProjectId, canViewSignboards, isPermissionLoading]);

  /**
   * 3系統アップローダから追加された写真項目をローカル状態へ追記する。
   * 応答には署名付きサムネURLが含まれるため再取得なしで即座に一覧へ反映する。
   */
  const handlePhotosAdded = useCallback(
    (added: ConstructionPhotoWithUrls[]) => {
      if (added.length === 0) return;
      clearPageMessage('notice');
      setPhotos((prev) => [...prev, ...added].sort((a, b) => a.displayOrder - b.displayOrder));
    },
    [clearPageMessage]
  );

  const handleUploaderNotify = useCallback(
    (message: string) => {
      showPageMessage('notice', message);
    },
    [showPageMessage]
  );

  /**
   * メタデータ（コメント/印刷対象）変更ハンドラ（未保存状態で保持, R7.1, R7.5）
   */
  const handleMetadataChange = useCallback(
    (photoId: string, metadata: PhotoMetadataChange) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? {
                ...p,
                ...(metadata.comment !== undefined && { comment: metadata.comment }),
                ...(metadata.includeInReport !== undefined && {
                  includeInReport: metadata.includeInReport,
                }),
                ...(metadata.signboardId !== undefined && {
                  signboardId: metadata.signboardId,
                }),
                ...(metadata.signboardPlacement !== undefined && {
                  signboardPlacement: metadata.signboardPlacement,
                }),
              }
            : p
        )
      );

      const existing = pendingChangesRef.current.get(photoId) ?? {};
      pendingChangesRef.current.set(photoId, { ...existing, ...metadata });
      syncDirtyWithPending();
    },
    [syncDirtyWithPending]
  );

  /**
   * 写真項目クリックハンドラ（R14.1）。
   * 当該写真項目のフルスクリーンビューアへ遷移する。
   * 未保存変更時の確認は `useBlocker`（下記）がアプリ内遷移全般を汎用的にガードする（R18.2）。
   */
  const handlePhotoClick = useCallback(
    (photo: ConstructionPhotoWithUrls) => {
      if (!album) return;
      navigate(`/construction-photos/${album.id}/photos/${photo.id}`);
    },
    [album, navigate]
  );

  /**
   * アルバム編集ボタンハンドラ（R16.1, R16.2）。アルバム編集画面へ遷移する。
   * 未保存変更時の確認は `useBlocker`（下記）がアプリ内遷移全般を汎用的にガードする（R18.2）。
   */
  const handleEditAlbum = useCallback(() => {
    if (!album) return;
    navigate(`/construction-photos/${album.id}/edit`);
  }, [album, navigate]);

  /**
   * アルバム削除ボタンハンドラ（R16.3, R16.4）。削除確認ダイアログを開く。
   */
  const handleDeleteAlbumRequest = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  /**
   * アルバム削除確認ダイアログのキャンセルハンドラ
   */
  const handleDeleteAlbumCancel = useCallback(() => {
    setIsDeleteDialogOpen(false);
  }, []);

  /**
   * アルバム削除確認の承認ハンドラ（R16.5）。
   * 削除APIを呼び出し、成功したら工事写真一覧画面へ遷移する。
   */
  const handleDeleteAlbumConfirm = useCallback(async () => {
    if (!album) return;
    setIsDeletingAlbum(true);
    try {
      await deleteConstructionPhotoAlbum(album.id);
      navigate(`/projects/${album.projectId}/construction-photos`);
    } catch (err) {
      showPageMessage(
        'error',
        err instanceof ApiError
          ? err.message || 'アルバムの削除に失敗しました'
          : 'アルバムの削除に失敗しました'
      );
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeletingAlbum(false);
    }
  }, [album, navigate, showPageMessage]);

  /**
   * 「看板を配置」導線ハンドラ（R9.1）。対象写真項目の配置ダイアログを開く。
   */
  const handleAssignSignboard = useCallback((photo: ConstructionPhotoWithUrls) => {
    setAssignTargetPhoto(photo);
  }, []);

  /**
   * 看板配置ダイアログの保存ハンドラ（R9.1, R9.2, R9.5）。
   * 選択看板ID（未指定は null）と配置ジオメトリ（未指定は null）を、写真項目ごとの
   * 未保存メタ変更として保持し、既存の保存フロー（メタバッチ）で確定する。
   */
  const handleSignboardSave = useCallback(
    (signboardId: string | null, placement: SignboardPlacement | null) => {
      if (!assignTargetPhoto) return;
      handleMetadataChange(assignTargetPhoto.id, {
        signboardId,
        signboardPlacement: placement,
      });
      setAssignTargetPhoto(null);
    },
    [assignTargetPhoto, handleMetadataChange]
  );

  /**
   * 順序変更ハンドラ（未保存状態で保持, R7.3, R7.4）
   */
  const handleOrderChange = useCallback(
    (newOrders: PhotoOrderItem[]) => {
      setPhotos((prev) => {
        const orderMap = new Map(newOrders.map((o) => [o.id, o.order]));
        return prev.map((p) => ({
          ...p,
          displayOrder: orderMap.get(p.id) ?? p.displayOrder,
        }));
      });
      pendingOrderRef.current = newOrders;
      syncDirtyWithPending();
    },
    [syncDirtyWithPending]
  );

  /**
   * 手動保存（R7.6, R11.4）
   * 未保存のメタデータ変更をメタバッチ1リクエスト、順序変更を順序更新1リクエストの
   * 最大2リクエストにまとめて確定する。
   */
  const handleSave = useCallback(async () => {
    if (!id) return;
    const hasMetadataChanges = pendingChangesRef.current.size > 0;
    const hasOrderChanges = pendingOrderRef.current !== null;
    if (!hasMetadataChanges && !hasOrderChanges) {
      // 送るものが無い。保存ボタンは未保存でない間は押せないが、押せた場合も未保存の状態を
      // 保留（空）に揃え、押した後に未保存のまま残らないようにする（R18.3, タスク 23.6）
      syncDirtyWithPending();
      return;
    }

    // 送る保留を開始時に取り出す（タスク 24.5）。要求の実行中の編集は保留へ足されるが、
    // ここで取り出した内容には入らない
    const sentChanges = new Map(pendingChangesRef.current);
    const sentOrder = pendingOrderRef.current;

    setIsSaving(true);
    clearPageMessage('error');
    try {
      // メタデータ一括更新（1リクエスト）
      if (hasMetadataChanges) {
        const items: BatchUpdatePhotoMetadataItem[] = [];
        sentChanges.forEach((changes, photoId) => {
          items.push({ id: photoId, ...changes });
        });
        await updateConstructionPhotoMetadataBatch(items);
      }

      // 表示順序更新（1リクエスト）
      if (sentOrder) {
        await updateConstructionPhotoOrder(id, sentOrder);
      }

      // 送った保留だけを消す。実行中の編集で送った内容と違うものは未保存として残す（タスク 24.5）
      removeSentFromPending(pendingChangesRef.current, sentChanges);
      if (pendingOrderRef.current && sentOrder && isSameOrder(pendingOrderRef.current, sentOrder)) {
        pendingOrderRef.current = null;
      }
      syncDirtyWithPending();
    } catch (err) {
      showPageMessage('error', err instanceof ApiError ? err.message : '保存に失敗しました', {
        isSaveFailure: true,
      });
    } finally {
      setIsSaving(false);
    }
  }, [id, syncDirtyWithPending, clearPageMessage, showPageMessage]);

  /**
   * PDF出力ハンドラ（R10.1, R10.3, R10.12, R10.13）
   *
   * 印刷対象のみ・保存表示順で印字画像をオンデマンド取得して台帳PDFを出力する。
   * 看板重畳はサーバの印字画像エンドポイントに委譲する。印刷対象0件は非実行で通知する。
   */
  const handleExportPdf = useCallback(async () => {
    if (!album) return;
    clearPageMessage('notice');
    setIsExporting(true);
    try {
      const { exportConstructionPhotoLedger } = await loadConstructionPhotoLedgerExportService();
      const result = await exportConstructionPhotoLedger({
        photos,
        workName: project?.name ?? album.name,
      });
      if (!result.generated) {
        showPageMessage(
          'notice',
          '印刷対象の写真がありません。印刷対象を選択してからPDF出力してください。'
        );
      }
    } catch (err) {
      showPageMessage('notice', err instanceof ApiError ? err.message : 'PDF出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  }, [album, project, photos, clearPageMessage, showPageMessage]);

  /**
   * 写真項目削除ハンドラ（R7.7）
   *
   * 失敗は捕捉せず `PhotoItemPanel` へ伝播させる。同部品が確認ダイアログを閉じ、失敗をその写真
   * 項目の中に表示する（タスク 23.9）。本画面は失敗を通知の枠（`pageMessage`）に載せず
   * （載せると、どの写真項目の失敗かが分からず、後から出た通知に置き換えられる。タスク 22.1）、
   * 写真項目・未保存の変更・選択集合にも触れない。先に出ている通知（アップロードの失敗など）と失敗の表示
   * （保存の失敗など）も消さない（21.3 は削除の失敗を通知の枠に出すために消していた）。
   *
   * 成功したときは、取り除いた写真項目の保留（メタ変更と順序変更の該当の行）を消し、未保存の
   * 状態を残りの保留から決め直す（タスク 23.6）。他の写真項目の編集や順序変更が残れば未保存の
   * まま、残らなければ未保存を解消する。順序変更の保留から写真項目がすべて消えたときは、送る
   * 順序が無いため保留そのものを無くす。
   */
  const handleDelete = useCallback(
    async (photoId: string) => {
      await deleteConstructionPhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      pendingChangesRef.current.delete(photoId);
      if (pendingOrderRef.current) {
        pendingOrderRef.current = pendingOrderRef.current
          .filter((o) => o.id !== photoId)
          .map((o, index) => ({ ...o, order: index + 1 }));
        if (pendingOrderRef.current.length === 0) {
          pendingOrderRef.current = null;
        }
      }
      syncDirtyWithPending();
      setSelectedPhotoIds((prev) => {
        if (!prev.has(photoId)) return prev;
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    },
    [syncDirtyWithPending]
  );

  /**
   * エクスポート対象の選択チェックのトグルハンドラ（R15.6）
   */
  const handleToggleSelectPhoto = useCallback((photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  /** 「全件エクスポート」起動ボタン（R15.1, R15.5） */
  const handleExportAll = useCallback(() => {
    setBulkExportMode('all');
  }, []);

  /** 「選択エクスポート」起動ボタン（R15.1, R15.6, R15.7） */
  const handleExportSelected = useCallback(() => {
    setBulkExportMode('selected');
  }, []);

  /** BulkExportDialog のキャンセル close */
  const handleExportDialogClose = useCallback(() => {
    setBulkExportMode(null);
  }, []);

  /** 対象0件時の通知（R15.11） */
  const handleExportEmptyTarget = useCallback(() => {
    showPageMessage('notice', 'エクスポート対象の写真項目がありません。');
  }, [showPageMessage]);

  /**
   * ZIP一括エクスポートの実行オーケストレーション（R15.1, R15.5, R15.6, R15.8, R15.9）
   *
   * `AbortController` を生成して `ConstructionPhotoBulkExportService.export` を呼び出し、
   * `onProgress` で進捗 state を更新する。完了後は ZIP Blob を `a` タグでダウンロードし、
   * 部分失敗（`failed`）はユーザーへ通知する。`AbortError` は中断として扱う。
   */
  const handleExportStart = useCallback(
    (settings: ConstructionPhotoExportSettings) => {
      if (!album) return;
      const mode = bulkExportMode;
      const targets =
        mode === 'selected' ? photos.filter((p) => selectedPhotoIds.has(p.id)) : photos;

      setBulkExportMode(null);

      if (targets.length === 0) {
        // BulkExportDialog 側で開始ボタン非活性により既に防止済みだが念のため二重防御する
        showPageMessage('notice', 'エクスポート対象の写真項目がありません。');
        return;
      }

      const controller = new AbortController();
      exportControllerRef.current = controller;
      pendingExportRef.current = null;
      setExportOutcome(null);
      clearPageMessage('notice');
      setExportProgress(null);
      setIsExportRunning(true);
      setExportProgressOpen(true);

      constructionPhotoBulkExportService
        .export(targets, settings, {
          onProgress: (progress) => setExportProgress(progress),
          signal: controller.signal,
        })
        .then((result) => {
          // 生成の完了と行き違いに中断されたときは、中断として扱いダウンロードしない
          if (controller.signal.aborted) {
            showPageMessage('notice', 'エクスポートを中断しました。');
            return;
          }
          const fileName = buildConstructionPhotoZipFileName(album.name, new Date());

          if (result.failed.length === 0) {
            downloadZip(result.blob, fileName);
            return;
          }

          // 失敗した写真項目を、利用者が特定できる形（ファイル名とエクスポート対象の中での順番）にする
          const failedIds = new Set(result.failed);
          const failedItems = targets
            .map((photo, index) => ({
              id: photo.id,
              fileName: photo.fileName,
              position: index + 1,
            }))
            .filter((item) => failedIds.has(item.id));
          const succeededCount = targets.length - failedItems.length;

          if (succeededCount > 0) {
            // 自動ではダウンロードせず、利用者の選択を待つ（R15.10）
            pendingExportRef.current = { blob: result.blob, fileName };
            setExportOutcome({ kind: 'partial', failedItems, succeededCount });
          } else {
            setExportOutcome({ kind: 'allFailed', failedItems });
            showPageMessage(
              'notice',
              `すべての写真項目（${failedItems.length}件）のエクスポートに失敗しました。ZIPはダウンロードしていません。`
            );
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            showPageMessage('notice', 'エクスポートを中断しました。');
          } else {
            showPageMessage(
              'notice',
              err instanceof ApiError ? err.message : 'エクスポートに失敗しました'
            );
          }
        })
        .finally(() => {
          setIsExportRunning(false);
          exportControllerRef.current = null;
        });
    },
    [album, bulkExportMode, photos, selectedPhotoIds, clearPageMessage, showPageMessage]
  );

  /** 進捗ダイアログの中断ボタン（R15.9） */
  const handleExportCancel = useCallback(() => {
    exportControllerRef.current?.abort();
  }, []);

  /**
   * 進捗ダイアログを閉じる（完了/中断確定後の「閉じる」、結果の段の「ダウンロードしない」・
   * 「閉じる」・Escape）。保留中の ZIP はここで手放し、ダウンロードしない（R15.10）
   */
  const handleExportProgressClose = useCallback(() => {
    pendingExportRef.current = null;
    setExportOutcome(null);
    setExportProgressOpen(false);
    setExportProgress(null);
  }, []);

  /** 結果の段の「成功した項目だけでダウンロードする」（R15.10） */
  const handleExportContinue = useCallback(() => {
    const pending = pendingExportRef.current;
    const failedCount = exportOutcome?.failedItems.length ?? 0;
    pendingExportRef.current = null;
    setExportOutcome(null);
    setExportProgressOpen(false);
    setExportProgress(null);
    if (!pending) return;
    downloadZip(pending.blob, pending.fileName);
    showPageMessage(
      'notice',
      `一部の写真項目（${failedCount}件）のエクスポートに失敗しました。成功した項目のみでZIPをダウンロードしました。`
    );
  }, [exportOutcome, showPageMessage]);

  // ローディング
  if (isLoading && !album) {
    return (
      <main role="main" style={containerStyle}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} aria-label="読み込み中" />
          <p>読み込み中...</p>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  // エラー（データ未取得）
  if (pageMessage?.kind === 'error' && !album) {
    return (
      <main role="main" style={containerStyle}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{pageMessage.text}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  if (!album || !id) {
    return null;
  }

  // 保存の失敗は保存ボタンの近く（PhotoItemPanel）にも出す（タスク 22.2）。その間、上部の枠は同じ
  // 文言を role を持たずに描き、読み上げは近くの表示（role=alert）の一度にする。保存ボタンが描かれ
  // ない間（編集権限が無い・写真項目が無い）は近くの表示も無いため、上部の枠を role=alert で描く
  // （role が変わるときは枠を作り直すため、新しく挿入された role=alert の枠として読み上げられる）
  const isSaveFailureShown =
    pageMessage?.kind === 'error' &&
    pageMessage.isSaveFailure === true &&
    canEdit &&
    photos.length > 0;

  // ブレッドクラム（階層規約の共通化は Task 7.1 で実施予定）
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    ...(project ? [{ label: project.name, path: `/projects/${album.projectId}` }] : []),
    { label: '工事写真一覧', path: `/projects/${album.projectId}/construction-photos` },
    { label: album.name },
  ];

  return (
    <main role="main" aria-busy={isLoading} style={containerStyle}>
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div style={styles.header}>
        <div style={styles.headerTitleRow}>
          <h1 style={styles.title}>{album.name}</h1>
          {/* アルバム編集・削除導線（R16.1, R16.2, R16.3, R16.4、権限連動 R17.1, R17.2, R17.5） */}
          <div style={styles.albumActionsRow}>
            {canEdit && (
              <button type="button" onClick={handleEditAlbum} style={styles.editAlbumButton}>
                編集
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteAlbumRequest}
                style={styles.deleteAlbumButton}
              >
                削除
              </button>
            )}
          </div>
        </div>
        {album.memo && <p style={styles.memo}>{album.memo}</p>}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>写真項目</h2>
          <div style={styles.headerButtonRow}>
            {/* ZIP一括エクスポート起動導線（R15.1, R15.5, R15.6, R15.7） */}
            <button type="button" onClick={handleExportAll} style={styles.zipExportButton}>
              全件エクスポート
            </button>
            <button
              type="button"
              onClick={handleExportSelected}
              disabled={selectedPhotoIds.size === 0}
              aria-disabled={selectedPhotoIds.size === 0}
              style={{
                ...styles.zipExportButton,
                ...(selectedPhotoIds.size === 0 ? styles.zipExportButtonDisabled : {}),
              }}
            >
              選択エクスポート（{selectedPhotoIds.size}件）
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting}
              style={{
                ...styles.exportButton,
                ...(isExporting ? styles.exportButtonDisabled : {}),
              }}
            >
              {isExporting ? 'PDF出力中...' : 'PDF出力'}
            </button>
          </div>
        </div>

        {/* 通知（部分失敗・保存エラーなど）。通知と失敗は一つの表示で、後から出たものが前のものを
            置き換える（タスク 22.1）。写真項目の削除の失敗は、その写真項目の中に PhotoItemPanel が
            表示する（タスク 23.9） */}
        {/* role の有無が変わるときは key で要素を作り直す（タスク 22.2）。既存の要素へ後から
            role=alert を付けると、支援技術によっては読み上げられないため、role=alert の枠は
            常に新しく挿入する */}
        {pageMessage && (
          <div
            key={isSaveFailureShown ? 'save-failure' : 'frame'}
            role={isSaveFailureShown ? undefined : 'alert'}
            style={styles.notice}
          >
            {pageMessage.text}
          </div>
        )}

        {/* 3系統アップローダ（R4, R5, R6, R11.5、編集権限連動 R17.1, R17.5） */}
        {canEdit && (
          <div style={styles.uploaderWrapper}>
            <PhotoUploader
              albumId={album.id}
              projectId={album.projectId}
              onPhotosAdded={handlePhotosAdded}
              onNotify={handleUploaderNotify}
            />
          </div>
        )}

        {/* 写真項目管理パネル（R7, R11.3）
            編集権限なしは readOnly で保存・並び替え・コメント・印刷対象・看板配置を抑止
            （R17.1, R17.3, R17.5）。写真項目削除は削除権限がある場合のみハンドラを渡す（R17.2）。 */}
        <PhotoItemPanel
          photos={photos}
          onPhotoMetadataChange={handleMetadataChange}
          onPhotoClick={handlePhotoClick}
          onOrderChange={handleOrderChange}
          onSave={handleSave}
          onDelete={canDelete ? handleDelete : undefined}
          onAssignSignboard={handleAssignSignboard}
          isDirty={isDirty}
          isSaving={isSaving}
          saveFailure={isSaveFailureShown ? pageMessage.text : null}
          isLoading={isLoading}
          readOnly={!canEdit}
          showOrderNumbers
          selectedPhotoIds={selectedPhotoIds}
          onToggleSelect={handleToggleSelectPhoto}
        />
      </div>

      {/* 看板配置ダイアログ（R9.1, R9.2, R9.5）。看板の閲覧の権限があれば、当該プロジェクトの
          看板マスタへのリンクを示す（タスク 23.2）。リンクの遷移は上の useBlocker の確認を経る（R18.2） */}
      {assignTargetPhoto && (
        <SignboardAssignDialog
          photo={assignTargetPhoto}
          signboards={signboards}
          signboardsStatus={signboardsStatus}
          onSave={handleSignboardSave}
          onClose={() => setAssignTargetPhoto(null)}
          signboardMasterPath={
            canViewSignboards ? `/projects/${album.projectId}/construction-signboards` : undefined
          }
        />
      )}

      {/* ZIP一括エクスポート設定ダイアログ（R15.1, R15.2, R15.3, R15.4, R15.5, R15.6, R15.7, R15.11） */}
      {bulkExportMode !== null && (
        <BulkExportDialog
          open
          mode={bulkExportMode}
          totalCount={photos.length}
          selectedCount={selectedPhotoIds.size}
          onClose={handleExportDialogClose}
          onStart={handleExportStart}
          onEmptyTarget={handleExportEmptyTarget}
        />
      )}

      {/* ZIP一括エクスポート進捗ダイアログ（R15.8, R15.9） */}
      {exportProgressOpen && (
        <BulkExportProgressDialog
          open
          progress={exportProgress}
          isRunning={isExportRunning}
          outcome={exportOutcome}
          onCancel={handleExportCancel}
          onClose={handleExportProgressClose}
          onContinue={handleExportContinue}
        />
      )}

      {/* アルバム削除確認ダイアログ（R16.3, R16.4, R16.5） */}
      <AlbumDeleteDialog
        isOpen={isDeleteDialogOpen}
        albumName={album.name}
        onConfirm={handleDeleteAlbumConfirm}
        onClose={handleDeleteAlbumCancel}
        isDeleting={isDeletingAlbum}
      />

      {/* 未保存離脱確認ダイアログ（アプリ内遷移全般をuseBlockerで捕捉, R18.2） */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
