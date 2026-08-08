/**
 * @fileoverview 未送信画像の保持・重複排除・プレビューURL生存管理フック
 *
 * 画像アップロードに失敗した画像を画面に保持し、その場で再送できるようにする。
 * 「何を保持しているか」のみを所有し、再送の実行そのものは責務外とする。
 *
 * Requirements:
 * - 37.1: 失敗した画像を未送信画像として画面に保持する
 * - 37.5: 一部が成功した場合、成功した画像を未送信画像から取り除く
 * - 37.6: 全ての画像が成功した場合、未送信画像の表示を解消する
 * - 37.9: 新たなファイル選択・撮影を行っても既存の未送信画像を保持し続ける
 * - 37.17: 再送不可と区別された画像を再送の対象に含めない
 *
 * 設計方針:
 * - 公開する操作を `record(attempted, failed)` の1メソッドに集約する。初回
 *   アップロードと再送を同一経路で扱うことで、「試行して成功したものは保持に
 *   残らない／失敗したものは重複しない」という不変条件を1箇所で保証する。
 * - 保持件数の上限は設けない。上限は「保持しきれず消える」という本要件の趣旨に
 *   反するためである。
 * - ObjectURL の生成・解放は本フックが唯一の責任者とする。生成は保持開始時、
 *   解放は保持から外れた時点・破棄時・アンマウント時に行う。
 *
 * 依存方向:
 * - 本モジュールは `types` / `utils` と React のみに依存する。再送の実行主体は
 *   利用側コンポーネントの `onUpload` であるため、`api` 層へは依存しない。
 *
 * 状態更新の作法:
 * - 保持の実体は ref に置き、`useState` は再描画のトリガとしてのみ用いる。
 *   `setState` の更新関数は React が複数回呼び出しうる（StrictMode 等）ため、
 *   その中で ObjectURL の生成・解放という副作用を起こすと URL が漏れる・
 *   二重解放されるおそれがある。副作用は呼び出しごとに1回だけ実行する。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FailedUpload, PendingUpload } from '../types/upload.types';

/**
 * usePendingUploads の戻り値
 */
export interface UsePendingUploadsResult {
  /** 保持中の未送信画像。追加順を維持する */
  readonly pending: readonly PendingUpload[];
  /** 再送可能な File のみ。空配列なら再送不可 */
  readonly retriableFiles: readonly File[];
  /**
   * 1回の送信試行の結果を反映する。
   * attempted のうち failed に含まれないものを保持から取り除き、
   * failed を追加または既存エントリの更新として反映する。
   */
  record: (attempted: readonly File[], failed: readonly FailedUpload[]) => void;
  /** 保持中の全画像を解放する */
  discardAll: () => void;
}

/**
 * 重複排除と React key に用いる安定キーを組み立てる。
 *
 * 同一画像を再送して繰り返し失敗しても保持件数が増えないよう、File の同一性
 * （オブジェクト参照）ではなく画像名・サイズ・更新時刻から導出する。再送では
 * 同じ File インスタンスを渡すとは限らないためである。
 *
 * @param file - 対象の画像
 * @returns 安定キー
 */
function buildPendingId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * 未送信画像を保持し、プレビューURLの生存を管理するフック。
 *
 * @returns 保持中の未送信画像と、その反映・破棄の操作
 */
export function usePendingUploads(): UsePendingUploadsResult {
  const [pending, setPending] = useState<readonly PendingUpload[]>([]);

  /**
   * 保持の最新値。副作用（ObjectURL の生成・解放）を `setState` の更新関数から
   * 切り離すために保持する。アンマウント時の解放にも用いる。
   */
  const pendingRef = useRef<readonly PendingUpload[]>([]);

  /** 保持を確定し、再描画を促す */
  const commit = useCallback((next: readonly PendingUpload[]): void => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const record = useCallback(
    (attempted: readonly File[], failed: readonly FailedUpload[]): void => {
      const attemptedIds = new Set(attempted.map(buildPendingId));

      // 同一試行内で同じ画像が重複して報告された場合は最後の結果を採用する
      const failuresById = new Map<string, FailedUpload>();
      for (const failure of failed) {
        failuresById.set(buildPendingId(failure.file), failure);
      }

      const next: PendingUpload[] = [];

      for (const entry of pendingRef.current) {
        const failure = failuresById.get(entry.id);

        if (failure) {
          // 既存項目の更新。同じ画像を指すためプレビューURLは再利用し、
          // 失敗理由と再送可否のみ最新の試行結果へ差し替える
          next.push({
            ...entry,
            file: failure.file,
            error: failure.error,
            kind: failure.kind,
          });
          failuresById.delete(entry.id);
          continue;
        }

        if (attemptedIds.has(entry.id)) {
          // 試行して失敗しなかった＝成功したため保持から取り除く
          URL.revokeObjectURL(entry.previewUrl);
          continue;
        }

        // 今回の試行に含まれない既存の保持はそのまま温存する
        next.push(entry);
      }

      // 未保持だった失敗を新規項目として追加順に追加する
      for (const [id, failure] of failuresById) {
        next.push({
          id,
          file: failure.file,
          error: failure.error,
          kind: failure.kind,
          previewUrl: URL.createObjectURL(failure.file),
        });
      }

      commit(next);
    },
    [commit]
  );

  const discardAll = useCallback((): void => {
    for (const entry of pendingRef.current) {
      URL.revokeObjectURL(entry.previewUrl);
    }
    commit([]);
  }, [commit]);

  // アンマウント時に保持中のプレビューURLを解放する
  useEffect(() => {
    return () => {
      for (const entry of pendingRef.current) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      pendingRef.current = [];
    };
  }, []);

  const retriableFiles = useMemo(
    () => pending.filter((entry) => entry.kind === 'retriable').map((entry) => entry.file),
    [pending]
  );

  return { pending, retriableFiles, record, discardAll };
}

export default usePendingUploads;
