/**
 * @fileoverview ブラウザ標準の対話（`dialog`）を寿命管理付きで観測するヘルパー
 *
 * `page.on('dialog', async ...)` は投げっぱなしの購読である。Playwright は
 * ハンドラの返す Promise を待ち合わせないため、リスナの中に置いた主張の失敗は
 * 「本体がまだ動いている間に届けばテストを赤にする」が「本体の終了後に届けば
 * 誰にも観測されない」という、届く時刻に依存した不定な扱いになる。
 * 後者では主張そのものが評価すらされずに緑で通過する（AI運用7原則 第3原則が
 * 禁じる「前提条件で検証が静かに無効化される」構造そのもの）。
 *
 * そこで本ヘルパーは Task 115.160 が確立した形をそのまま踏襲する。
 *
 * 1. 名前付きの購読にして本体の後始末で必ず外す（`detach()`）
 * 2. 保留中の応答を主張の前に待ち合わせる（`settle()`）
 * 3. 応答の失敗は控えておき、待ち合わせの直後に送出する（飲まない）
 *
 * 外す操作を待ち合わせより先に置くことが要点である。順序を逆にすると、
 * 待ち合わせている最中に新たな応答が積まれる余地が残ってしまう。
 *
 * 対話が出たという事実（種別・本文）は最初の `await` より前に同期で確定させる。
 * これにより「応答に失敗したせいで観測結果が消える」経路が無くなり、
 * 呼び出し側は `observed` に対して本体で普通に主張できる。
 *
 * @module e2e/helpers/dialog-observer
 */

import type { Dialog, Page } from '@playwright/test';

/**
 * 観測した対話の記録。
 *
 * `Dialog` そのものではなく値として控える。応答済みの `Dialog` からは
 * 情報を取り出せなくなる場合があるため、出た時点の内容を保持する。
 */
export interface DialogObservation {
  /** 対話の種別（`beforeunload` / `alert` / `confirm` / `prompt`）*/
  readonly type: string;
  /** 対話の本文 */
  readonly message: string;
}

/**
 * 寿命管理付きの対話観測。
 */
export interface DialogObserver {
  /**
   * 観測した対話の記録（出現順）。
   *
   * 主張に用いる前に必ず {@link DialogObserver.settle} を待ち合わせること。
   * 待ち合わせずに読むと、リスナの応答と本体の主張のどちらが先かが不定になる。
   */
  readonly observed: readonly DialogObservation[];

  /**
   * 購読を外す。本体の後始末（`finally`）で同期に呼ぶこと。
   *
   * 待ち合わせより先に外すことで、待ち合わせ中に新たな応答が積まれる余地を
   * 構造的に無くす。
   */
  detach(): void;

  /**
   * 保留中の応答をすべて待ち合わせ、控えた失敗があれば送出する。
   *
   * {@link DialogObserver.detach} の後、`observed` に対する主張の前に呼ぶこと。
   *
   * @throws 応答（`accept` / `dismiss`）が失敗していた場合、その最初の失敗
   */
  settle(): Promise<void>;
}

/**
 * 対話への応答方法。既定は `accept()`。
 *
 * `dismiss()` を用いるとナビゲーションが `ERR_ABORTED` になる場面があるため、
 * 拒否を観測したい場合のみ明示的に差し替える。
 */
export type DialogResponder = (dialog: Dialog) => Promise<void>;

const acceptDialog: DialogResponder = (dialog) => dialog.accept();

/**
 * 対話の観測を開始する。
 *
 * @param page - 対象のページ
 * @param respond - 対話への応答方法（既定は `accept()`）
 * @returns 寿命管理付きの観測ハンドル
 *
 * @example
 * ```ts
 * const dialogs = observeDialogs(page);
 * try {
 *   await page.goto('/next');
 * } finally {
 *   dialogs.detach();
 * }
 * await dialogs.settle();
 * expect(dialogs.observed.map((observation) => observation.type)).toContain('beforeunload');
 * ```
 */
export function observeDialogs(
  page: Page,
  respond: DialogResponder = acceptDialog
): DialogObserver {
  const observed: DialogObservation[] = [];

  // リスナが始めた応答は投げっぱなしにしない。起動ごとの完了を控えておき、
  // 本体の主張の前に必ず待ち合わせる。
  const pendingResponses: Promise<void>[] = [];

  // 応答が失敗した場合に備えて控える。ここで捨てると未処理の拒否になり、
  // どの応答が壊れたか分からなくなる。握り潰しではなく、待ち合わせの直後に送出する。
  const responseFailures: unknown[] = [];

  const onDialog = (dialog: Dialog): void => {
    // 出た事実は最初の await より前に同期で確定させる。
    observed.push({ type: dialog.type(), message: dialog.message() });

    pendingResponses.push(
      respond(dialog).catch((error: unknown) => {
        responseFailures.push(error);
      })
    );
  };

  page.on('dialog', onDialog);

  return {
    observed,

    detach(): void {
      page.off('dialog', onDialog);
    },

    async settle(): Promise<void> {
      await Promise.all(pendingResponses);
      if (responseFailures.length > 0) {
        throw responseFailures[0];
      }
    },
  };
}
