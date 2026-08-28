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
 * ## 唯一残る限界も同じ仕組みで固定する（Task 115.185）
 *
 * 拒否の仕組みは条件型の交差から**素の制約**へ移してある。この移行で、
 * 文字列を除いた制約を持つ汎用の補助からの呼び出しが通るようになり（誤拒否の解消）、
 * `unknown` を拒めるようにもなった。**残る限界は `any` の一つだけ**である。
 *
 * その一件は「見逃す側へ倒すと判断した限界」ではなく、`any` があらゆる引数型へ
 * 代入できるという言語の性質上、引数の型では原理的に塞げないものである。
 * 事例として置いてあるのは是認のためではなく、塞げるようになったら型検査が落ちて
 * 気づけるようにするためである。落ちたら是正できた合図なので、事例を消すのではなく
 * `preconditions.ts` の「型による強制の限界」節と対で書き改めること。
 *
 * @module e2e/helpers/preconditions.type-selftest
 */

import { assertPrepared, assertPresent } from './preconditions';

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
  // @ts-expect-error 文字列リテラルの共用体も拒む
  assertPresent(文字列リテラルまたはnull, '文字列リテラルの共用体');
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

/**
 * 無制約の型引数を伴う呼び出しは拒まれる。**これは誤拒否ではなく健全な拒否である。**
 *
 * 無制約の `T` は `string` にもなり得るのだから、通してしまえば文字列の拒否が骨抜きになる。
 * 逃げ道は明快で、**呼び出し側の型引数に文字列を除いた制約を足せばよい**
 * （直後の `文字列を除いた制約なら汎用の補助から呼べる` がその実演である）。
 *
 * 拒否が外れたらここが `TS2578` で落ちる。落ちたら文字列の拒否そのものが緩んだ疑いがあるので、
 * まず `文字列は拒まれる` が生きているかを確かめること。
 */
export function 無制約の型引数は健全に拒まれる<T>(値: T | null): T {
  // @ts-expect-error 無制約の T は string になりうるため拒む。呼び出し側で制約を足すこと
  assertPresent(値, '無制約の汎用の補助が受け取った値');
  return 値;
}

/**
 * 文字列を除いた制約を持つ汎用の補助からは呼べる（Task 115.185 で解消）。
 *
 * 条件型で拒んでいた頃は、`T extends number | boolean` と書いても `TS2345` で落ちていた。
 * 条件型が未解決の型引数の制約まで見に行かないためである。素の制約へ移して解消した。
 * ここが落ちたら誤拒否が再発したということなので、`preconditions.ts` の
 * 「なぜ条件型ではなく制約なのか」の判断ごと見直すこと。
 */
export function 文字列を除いた制約なら汎用の補助から呼べる<T extends number | boolean>(
  値: T | null
): T {
  assertPresent(値, '文字列を除いた制約の下で受け取った値');
  return 値;
}

/** 物を対象とする制約でも同様に呼べる（`T extends object` も文字列を含まないため）。 */
export function 物の制約なら汎用の補助から呼べる<T extends object>(値: T | null): T {
  assertPresent(値, '物の制約の下で受け取った値');
  return 値;
}

/**
 * 制約を書けない汎用の補助では `assertPrepared` へ退避できる。
 *
 * 115.166 のレビューは「別の補助へ逃げることもできない袋小路」と述べたが、
 * **型の上では袋小路ではない**ことを 115.185 が実測した。
 * 制約を足せる場合は上の二例のとおり `assertPresent` のまま通るので、この退避路は
 * **無制約の `T` を受けざるを得ない場合の逃げ道**である。
 * `assertPrepared` は 0 と false も弾くため、それらが正当な観測値になり得る対象では別種の偽赤になる。
 * この事例が落ちたら退避路そのものが失われたということなので、限界節を見直すこと。
 */
export function 制約を書けない場合は退避できる<T>(値: T | null): T {
  assertPrepared(値, '無制約の汎用の補助が受け取った値');
  return 値;
}

/** 不明な型は拒む（Task 115.185 で解消。実体が文字列でも通してしまう穴だった）。 */
export function 不明な型は拒まれる(): void {
  // @ts-expect-error unknown はこの制約へ代入できないため拒む
  assertPresent(不明な型, '実体は空文字だが型では分からない');
}

/**
 * 何でも受ける型はすり抜ける。**唯一残る限界である（Task 115.185）。**
 *
 * `any` はあらゆる引数型へ代入できるため、引数の型に何を書いても拒めない。
 * 見逃す側へ倒すと判断したのではなく、言語の性質上そうなる。
 * 塞ぐなら型ではなく走査側（`scripts/check-e2e-assertion-guards.ts` の系統）へ持ち出すことになる。
 * ここが落ちたら塞げたということなので、限界節の書き換えと対で直すこと。
 */
export function 何でも受ける型はすり抜ける(): void {
  assertPresent(何でも受ける型, '何でも受ける型は引数の型では拒めない');
}

/** 型検査だけを目的とした宣言。実行時には何も起きない。 */
declare const 文字列またはnull: string | null;
declare const 文字列またはundefined: string | undefined;
declare const 文字列: string;
declare const 文字列か数値かnull: string | number | null;
declare const 文字列リテラルまたはnull: 'a' | 'b' | null;
declare const 境界ボックスまたはnull: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;
declare const 数値またはnull: number | null;
declare const 真偽値またはundefined: boolean | undefined;
declare const 照合結果またはnull: RegExpMatchArray | null;
declare const 不明な型: unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 何でも受ける型がすり抜けることの実測に必要
declare const 何でも受ける型: any;
