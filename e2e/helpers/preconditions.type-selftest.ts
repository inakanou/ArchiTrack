/**
 * @fileoverview `assertPresent` が文字列を拒み、それ以外を通すことの型検査による自己検証
 *
 * ## なぜ実行されないファイルを置くのか（Task 115.166）
 *
 * `assertPresent` の「文字列は対象に取れない」という決まりは実行時ではなく型で守っている。
 * 型の決まりは実行しても確かめられないため、**型検査そのものを試験の実行**として扱う。
 * 本ファイルは `tsconfig.json` の `include`（`e2e/**\/*`）に入るため `npm run type-check` が検査する。
 * 一方 Playwright の `testDir` は `./e2e/specs` であり、本ファイルは収集対象外で実行されない。
 *
 * `@ts-expect-error` は「この行は型エラーになるはず」という主張である。
 * 拒否印が外れて文字列が通るようになれば、エラーが出なくなった `@ts-expect-error` 自体が
 * `TS2578: Unused '@ts-expect-error' directive` として落ちる。
 * つまり**是正が外れた瞬間に型検査が赤くなる**。どこからも import されないが死蔵ではない。
 *
 * @module e2e/helpers/preconditions.type-selftest
 */

import { assertPresent } from './preconditions';

/** 文字列を対象とする呼び出しは拒む（空文字が正当な観測値になり得ないため `assertPrepared` を使う）。 */
export function 文字列は拒まれる(): void {
  // @ts-expect-error 文字列を対象とする前提には assertPrepared を使うこと
  assertPresent(文字列またはnull, 'textContent の結果');
  // @ts-expect-error 文字列を対象とする前提には assertPrepared を使うこと
  assertPresent(文字列またはundefined, '配列から取り出した文字列');
  // @ts-expect-error 文字列を対象とする前提には assertPrepared を使うこと
  assertPresent(文字列, 'null にならない文字列');
  // @ts-expect-error 共用体に文字列が混ざる対象も拒む
  assertPresent(文字列か数値かnull, '文字列が混ざった共用体');
}

/** 0 や false が正当な観測値になり得る対象は従来どおり通す（過剰な拒否をしていないことの主張）。 */
export function 文字列以外は通る(): void {
  assertPresent(境界ボックスまたはnull, '境界ボックス');
  const 幅: number = 境界ボックスまたはnull.width;

  assertPresent(数値またはnull, '実高さ');
  const 高さ: number = 数値またはnull;

  assertPresent(真偽値またはundefined, '取得できたか');
  const 可否: boolean = 真偽値またはundefined;

  assertPresent(照合結果またはnull, '照合結果');
  const 先頭: string | undefined = 照合結果またはnull[0];

  void [幅, 高さ, 可否, 先頭];
}

/** 型検査だけを目的とした宣言。実行時には何も起きない。 */
declare const 文字列またはnull: string | null;
declare const 文字列またはundefined: string | undefined;
declare const 文字列: string;
declare const 文字列か数値かnull: string | number | null;
declare const 境界ボックスまたはnull: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;
declare const 数値またはnull: number | null;
declare const 真偽値またはundefined: boolean | undefined;
declare const 照合結果またはnull: RegExpMatchArray | null;
