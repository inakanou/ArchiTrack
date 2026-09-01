/**
 * @fileoverview 日時の順序に関する補助
 *
 * ## なぜ在るか
 *
 * `createdAt` と `updatedAt` の値は、どちらも Prisma クライアントが
 * **同一プロセスの壁時計**（`Date`）から採っている。スキーマ上は
 * `createdAt DateTime @default(now())` と `updatedAt DateTime @updatedAt` で
 * 出所が違うように読めるが、生成される SQL は INSERT で両列を明示的に渡すため、
 * DDL の `DEFAULT CURRENT_TIMESTAMP` には到達しない。出所は既に一つである。
 *
 * 壊れうるのは出所の一致ではなく、**その一つの壁時計が単調でないこと**である。
 * 壁時計は時刻同期・仮想化基盤の補正で後ろへ跳ぶ。実際に WSL2 上の E2E で、
 * 作成の 1 秒後に発行した更新の `updatedAt` が `createdAt` より 444ms 前になる
 * 事象が観測されている（`trading-partner-management/REQ-11.12` の検証）。
 *
 * 単調でない時計を前提にしたまま「更新日時は作成日時以降」という不変条件を
 * 検証側の許容幅で吸収すると、本当に順序が逆転した欠陥まで見逃す。そこで
 * 不変条件は書き込み時に成立させる。
 *
 * ## 設計上の含み（楽観的排他制御との関係）
 *
 * `trading-partner-management/design.md` は `updatedAt` による楽観的排他制御
 * （`expectedUpdatedAt` との一致判定）を敷いている。壁時計が作成日時より後ろに
 * ある間は連続する更新がいずれも作成日時へ押し上げられ、同じ `updatedAt` が続く。
 * この状態では古い `expectedUpdatedAt` が一致してしまい、競合の判定は働かない。
 *
 * これは押し上げが持ち込んだ性質ではなく、**単調でない壁時計を版として使うこと**に
 * 元から在る性質である（押し上げが無い場合、同じ状況では `updatedAt` が作成日時より
 * 前へ後退し、判定は同じく古い値と一致しうる上に順序の不変条件まで壊れる）。
 * 版を時刻から切り離す（単調増加する版番号を持つ）のが本来の解だが、それは
 * データモデルと API 契約の変更を伴うため本補助の範囲外とし、ここへ記録に留める。
 *
 * ## 押し上げが起きたことを残す
 *
 * 押し上げは値を静かに書き換えるため、そのままでは本番で時計の異常が起きた事実が
 * どこにも残らない。押し上げた場合に限り警告を残し、後追いできるようにする。
 */

import logger from './logger.js';

/**
 * 作成日時より前にならない更新日時を決める。
 *
 * 壁時計が作成日時より後ろにある場合に限り作成日時そのものを返す。
 * それ以外は壁時計の値をそのまま使う（実時刻を先へ水増ししない）。
 * 押し上げた場合は後退の幅とともに警告を残す。
 *
 * @param createdAt - 対象レコードの作成日時
 * @param now - 現在時刻（既定は壁時計）
 * @returns `createdAt` 以降であることが保証された更新日時
 */
export function resolveUpdatedAt(createdAt: Date, now: Date = new Date()): Date {
  if (now.getTime() >= createdAt.getTime()) {
    return now;
  }

  logger.warn(
    {
      createdAt: createdAt.toISOString(),
      wallClockNow: now.toISOString(),
      rollbackMs: createdAt.getTime() - now.getTime(),
    },
    '壁時計が作成日時より前を指したため更新日時を作成日時へ押し上げた'
  );

  return new Date(createdAt.getTime());
}
