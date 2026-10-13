/**
 * @fileoverview 設計文書の追跡表（Requirements Traceability）が受入基準を漏らしていないことの検査
 *
 * ## なぜ在るか（タスク 115.228）
 *
 * タスク 115.208 は `site-survey` の要件4 へ受入基準14 を新設したが、`design.md` の総合追跡表の
 * 該当行は `| 4.1-4.6, 4.9 |` のままで **4.14 を含まなかった**。この漏れは**どの機械の関門にも
 * 掛からなかった**——`check:design-refs` は参照の形式だけを、`check:design-code-refs` は本番コード
 * への参照の形式だけを、`check:design-path-refs` はパスの実在だけを見る。追跡表が受入基準を
 * 網羅しているかを見る検査はリポジトリに存在しなかった。
 *
 * 115.228 はこの穴を、**有限集合上の全称命題**として書けるかという問いに変換した。書ける:
 *
 *   - **有限集合**: 各機能の `requirements.md` が挙げる**現役の**受入基準（取り消し線で撤廃された
 *     ものは分母外。判定は `scripts/requirement-document.ts` の `scanRequirementsDocument` が持つ）。
 *     本リポジトリの実データで 13 機能・2889 件である（2026-09-01 に実測）。
 *   - **述語**: その受入基準の番号が、同じ機能の `design.md` の追跡表いずれかの Requirement 列に
 *     （範囲・列挙を展開したうえで）現れること。追跡表の本文行は実データで 860 行である。
 *   - **判定**: 2889 × 860 の有限の照合であり、走査は必ず終端する。「漏れが無いことを走査で示せ」
 *     という終端しない受入条件（タスク 115.197 が禁じた形）ではなく、**全称命題の成否**を返す。
 *
 * 述語は今日**成立していない**。`npm run check:trace-coverage` の要約行が出す実測は
 * 「機能 13 件 / 追跡表の本文行 860 行 / 現役の受入基準 2889 件 / 欠落 617 件 / 死語 54 件 /
 * 読めない表記 25 件」である（2026-09-04 にリポジトリルートで実測。タスク 115.261 が `site-survey`
 * の欠落 24 件と死語 1 件を是正したぶん、115.228 当時の 641 件 / 55 件から減っている）。欠落 617 件の内訳の大きい二つは
 * `user-authentication`（追跡表を一つも持たないため 388 件全件）と `construction-photo`
 * （Requirement 列が受入基準ではなく要件番号だけを挙げるため 145 件全件）である。したがって本検査は
 * **「0 件であること」ではなく「宣言した状態から悪化していないこと」**を求める（ラチェット）。
 *
 * 件数は本コメント自身が動かす値ではないが、宣言を書き換えたら
 * `npx tsx scripts/check-traceability-coverage.ts --survey` で測り直すこと
 * （`.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」）。
 *
 * ## 二方向を見る
 *
 *   - **欠落**: 現役の受入基準が追跡表のどの行にも現れない。115.228 が是正した 4.14 の型。
 *   - **死語**: 追跡表が挙げる番号が現役の受入基準に無い（撤廃済み、または存在しない番号）。
 *     欠落だけを見ると、要件が撤廃されたのに追跡表が古い番号を挙げ続ける形を取り逃がす。
 *   - **読めない表記**: Requirement 列のトークンが `N.M` にも範囲にも解釈できない
 *     （`17.x` のような伏せ字、`4.1a` のような枝つき番号、`1.3.1` のような三段の番号）。
 *     **黙って読み飛ばすと欠落が過小に出る**ため、件数を数えて宣言と突き合わせる。
 *
 * ## 機能ごとの方針を宣言で持つ（AI運用7原則 第3原則）
 *
 * `FEATURE_POLICIES` が全機能の方針を宣言する。**宣言に無い機能があれば失敗する**——
 * 機能が増えたときに黙って検査の外へ落ちることを防ぐ（タスク 115.226 の「新たな無言の失敗経路」）。
 * 逆に**宣言にあって実在しない機能があっても失敗する**（宣言が対象より長生きすることを防ぐ。
 * タスク 115.227 の被検体の同一性の作法）。
 *
 *   - `mode: 'exact'`: 欠落・死語の集合が宣言と**完全に一致**することを求める。新たな漏れも、
 *     解消済みの宣言の置き去りも、どちらも赤くなる。`site-survey` がこの型である。
 *   - `mode: 'ratchet'`: 欠落・死語・読めない表記の件数が宣言した上限を**超えず、かつ下回らない**
 *     ことを求める。追跡表の内容そのものを書き起こす作業が別タスクを要する機能に用いる。
 *
 * ## 上限に遊びを持たせない（タスク 115.262）
 *
 * 115.228 が置いた当初の `ratchet` は上限を**超えない**ことだけを求めた。この形は
 * **上限を先回りで緩める書き換えを機構が止めない**——タスク 115.228 のレビューが実測し、
 * タスク 115.262 が現況で追試した。`construction-photo` の `maxMissing` を 145 から 200 へ
 * 書き換えると、`npm run check:trace-coverage` も `npm run check:trace-coverage:selftest` も
 * 緑のまま通り（前者は EXIT=0、後者は 32/32 件成功。2026-09-04、コミット `1a673496` の
 * 作業ツリーで実測）、同機能で最大 55 件の新規の欠落を無言で吸収できた。差分を人が読めば
 * 見えるが、**機構は止めなかった**。`site-survey` が採る `exact` の逐一列挙にはこの穴が無い。
 *
 * 是正は列挙への全面移行ではなく**遊びの禁止**とした。宣言した上限が実測を**上回っていても
 * 失敗する**（`judgeCeiling`）。二方向を合わせると上限は実測と一致するほかなく、
 * `exact` が集合について持つ性質——**宣言が現実によって一意に決まる**——を、件数のまま得る。
 * 列挙への全面移行（`ratchet` の 12 機能を `exact` へ）は 671 件のエントリを要し
 * （欠落 617 件 + 死語 54 件。2026-09-04 に実測。当時の作業ツリーのコミットは記録していない
 * ため、2026-09-07 にコミット `5dc930b0` の作業ツリーで `npm run check:trace-coverage` の
 * 要約行から追試した——欠落 617 件 / 死語 54 件は動いていない）、かつ `check:design-path-refs` の
 * `--update-baseline` と同じリポジトリ全域の慣行に触れるため、本タスクの境界
 * （網羅検査の上限宣言の緩和経路）の外にある。
 *
 * **締める向きは妨げない。** 実測が減ったときに求めるのは上限を同じ値まで**下げる**ことだけで
 * あり、失敗の文面が下げるべき値を名指しする。これは `exact` が「解消済みの欠落が宣言に
 * 残っています」で求めるものと同じ形である（タスク 115.261）。
 *
 * **母集団が空なら失敗する**（第3原則）。機能が 0 件のとき、宣言された機能の追跡表の本文行が
 * 0 行のとき、現役の受入基準が 0 件のときは、いずれも前提の崩壊として赤くする。
 *
 * 使用方法:
 *   npx tsx scripts/check-traceability-coverage.ts [--verbose] [--json] [--survey]
 *   npm run check:trace-coverage
 *   npm run check:trace-coverage:verbose
 *   npm run check:trace-coverage:survey    宣言を無視して実測値だけを印字する（宣言の更新用）
 *
 * ## 引用された表頭を宣言と読まない（タスク 115.263）
 *
 * 表頭の字面は設計文書の中で**引用**されうる。コードフェンスで囲った見本の中の
 * `| Requirement | Summary | Components |` を表の宣言と読むと**幻の表**が立ち、その見本行が
 * 挙げる番号が「被覆済み」に化けて欠落を隠す。判定の理由と、タスク 115.226 が `.ts` の側で
 * 確立した処方のどの半分が Markdown へ渡るのかは `markCodeFenceLines` に書いた。
 *
 * ## 見ないこと（限界）
 *
 *   - Components / Interfaces / Flows 列の中身は見ない。**担い手の欠落は本検査の対象外**である
 *     （`site-survey` の要件4.10 の行が `ImageOrderService` / `ImageListService` を欠く件は
 *     `design.md` の `## 未起票の提案の台帳（タスク 115.213）` の #8 が所管する）。
 *   - 受入基準が**正しい行**に載っているかは見ない。番号がどこかの行に現れれば述語は真になる。
 *   - `requirements.md` を持たないディレクトリは機能として数えない
 *     （`scripts/requirement-document.ts` の `discoverFeatureNames` の規則）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  discoverFeatureNames,
  requirementsDocumentPath,
  scanRequirementsDocument,
} from './requirement-document';
// 設計文書の位置は要件定義書と同じ根の下にある。根は一箇所（scripts/spec-directory.ts）から
// 取る（タスク 115.269）。ここが裸のリテラルを持っていたため、設計文書の根だけが動いても
// 本検査は旧い根を読み続けた——scripts/design-document.ts の `SPEC_DIR` だけを
// `'.kiro/specs-moved'` へ変える変異を当てると `npm run check:design-code-refs` は終了コード 1
// になるのに対し、`npm run check:trace-coverage` は終了コード 0 のまま（機能 13 件 /
// 追跡表の本文行 860 行）であった（コミット `97302295` の作業ツリーで 2026-09-04 に
// リポジトリルートで実測。変異は退避した控えからの書き戻しで復元した）
import { SPEC_DIR } from './spec-directory';

/** 追跡表の表頭。Requirement / Summary / Components の三列で始まる行を表頭とみなす */
export const TRACEABILITY_TABLE_HEADER = /^\| *Requirement \| *Summary \| *Components \|/;

/**
 * 表の区切り行（GFM の delimiter row）
 *
 * 表頭の**次の行**がこれでなければ、その字面は表の宣言ではない（タスク 115.318）。GFM では
 * 区切り行を欠く行は表を開かず、素の段落として読まれる。各セルは `-` の並びで、両端に
 * 位置揃えの `:` を許す。表頭が行頭の `|` を要求するため、区切り行にも行頭の `|` を課す。
 *
 * **行頭の `|` を課すと、字下げされた区切り行も弾く（残余。タスク 115.318）。** GFM は 3 桁まで
 * の字下げを認めるため、字下げされた区切り行を持つ実在の表を落としうる。落ちる向きは安全側
 * （被覆済みに化けるのではなく、表と読まれず番号が未被覆へ回る）だが、**塞いでいないことは
 * 書いておく**。表頭 32 件のうち、次の行が字下げされた区切り行であるものは 0 件である——採取は
 * ``grep -rhA1 '^| *Requirement | *Summary | *Components |' .kiro/specs --include design.md``
 * の出力から `--` と表頭の行を除き、``grep -cE '^ {1,3}\|'`` を掛けたもの（コミット `b08733f9`
 * の作業ツリーで 2026-09-07 にリポジトリルートで実測）。
 *
 * **セル数が表頭と一致することまでは見ない（残余。タスク 115.318）。** GFM は一致を要求する
 * ため、数の食い違う字面は表として読まれない——にもかかわらず本検査はそれを表と読み、幻の表
 * として番号を被覆済みにしうる。**塞がないことと、書かないことは別である**（115.242 の教訓）。
 * 塞がない理由は、区切り行の**有無**が本タスクの境界であり、整形式の各条を数え上げる作業が
 * その外にあることによる。実データの露出は 0 件である——採取は
 * ``grep -rhA1 '^| *Requirement | *Summary | *Components |' .kiro/specs --include design.md``
 * の出力から `--` を除き、``awk -F'|' 'NR%2==1{h=NF} NR%2==0 && NF!=h {c++} END{print c+0}'``
 * を掛けたもの（2026-09-07 にリポジトリルートで実測）。
 */
const TABLE_DELIMITER_ROW = /^\|(?: *:?-+:? *\|)+ *$/;

/** 設計文書のファイル名 */
export const DESIGN_DOCUMENT_BASENAME = 'design.md';

/**
 * コードフェンスの区切り行（CommonMark の fenced code block）
 *
 * 開き・閉じのいずれも「字下げ 3 桁まで」「同じ記号（`` ` `` か `~`）が 3 つ以上」で始まる。
 * 続きの文字列（情報文字列）は開きにだけ許される。
 */
const CODE_FENCE_DELIMITER = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** 開いているコードフェンス */
interface OpenCodeFence {
  /** 区切りの記号（`` ` `` か `~`） */
  readonly marker: string;
  /** 開きの記号の長さ。閉じはこれ以上の長さでなければならない */
  readonly length: number;
}

/** 区切り行なら記号・長さ・情報文字列を返す。区切り行でなければ null */
function readCodeFenceDelimiter(
  line: string
): { marker: string; length: number; info: string } | null {
  const match = CODE_FENCE_DELIMITER.exec(line);
  const run = match?.[1];
  const marker = run?.[0];
  if (run === undefined || marker === undefined) return null;
  return { marker, length: run.length, info: match?.[2] ?? '' };
}

/**
 * 引用された表頭を宣言と読まない（タスク 115.263）
 *
 * 表頭の字面は設計文書の**散文の中で引用されうる**。「追跡表の表頭は
 * `| Requirement | Summary | Components |` である」と書く記述、あるいは書き方の見本を
 * コードフェンスで囲って示す記述がそれである。これを表の宣言と読むと**幻の表**が生まれ、
 * その見本行が挙げる番号が「被覆済み」に化けて**欠落を隠す**。
 *
 * これはタスク 115.226 が `check-requirement-coverage.ts` の被覆印のヘッダー検出で塞いだ
 * 「字面と意味の取り違え」の、追跡表の側の同型である。ただし**同じ処方をそのまま当てては
 * ならない**——115.226 が走査するのは `.ts` / `.tsx` であり、本検査が走査するのは Markdown
 * だからである。処方の二つの半分は、こちらでは次のように分かれる。
 *
 *   1. **「行の中身の先頭にあること」の半分は、既に `TRACEABILITY_TABLE_HEADER` の `^` が
 *      持っている。** Markdown にコメント記号は無く、同正規表現は行頭直後の `|` しか
 *      認めないため（字下げも許さない）、散文の途中に引かれた字面
 *      （``表頭は `| Requirement | …` である``）も、引用符号を前置した行
 *      （`> | Requirement | …`）も、構造として当たらない。115.226 が
 *      `DECLARATION_PREFIX_REGEX` を要したのは、コメント記号という「行の中身の前の飾り」が
 *      `.ts` に在るためであり、**Markdown にはその飾りが無い**。実データでも行頭以外に現れる
 *      表頭の字面は 0 件である（13 機能の `design.md`、2026-09-04 にコミット `3b5d6917` の
 *      作業ツリーで実測）。この半分について足すべきものは無い。
 *   2. **「コードフェンスの内側にないこと」の半分がこちらの要点である。** フェンスの中の
 *      見本は行頭から `|` で始まるため、条件 1 では覆えない。ここで塞ぐのはこの一点である。
 *
 * **フェンスの開閉を数える範囲は文書の全体に取る。** 115.226 が数える範囲を「ヘッダーを囲む
 * コメントの塊」へ閉じ込めたのは、`.ts` では塊の外の閉じ忘れのフェンス一つが以降の
 * **すべての**ヘッダーを無言で落とし、被覆の過小計上と区間の過大帰属を同時に生むためだった。
 * Markdown にはコメントの塊に相当する内側の範囲が無く、**フェンスは文書全体に掛かる構造**で
 * あるから、全体で数えることが Markdown の読まれ方そのものである。加えて**落ちる向きが違う**
 * ——閉じ忘れが表を飲み込めば本文行が減り、欠落が増え、`exact` の集合ないし `ratchet` の上限
 * との食い違いとして**必ず赤くなる**（本文行が 0 行になる形は `judgeFeature` の前提の崩壊が
 * 別途受け持つ）。無言で消える経路が無いため、範囲を狭める機構は要らない。この向きは自己検査の
 * 「閉じ忘れのフェンスが表を飲み込んでも黙って通らない」が固定する。
 *
 * **字下げ 3 桁までを許す枝には実データの対照が無い（タスク 115.318）。** `CODE_FENCE_DELIMITER`
 * の `^ {0,3}` を `^` へ狭める変異を当てても、`npm run check:trace-coverage` も本ファイルの
 * 自己検査も緑のままであった（コミット `b08733f9` の作業ツリーで 2026-09-07 にリポジトリルートで
 * 実測。変異は退避した控えからの書き戻しで復元し `md5sum -c` で確認した）。実データの字下げされた
 * 区切りは 26 本ある——採取は
 * ``grep -rnE '^ {1,3}(`{3,}|~{3,})' .kiro/specs --include design.md | wc -l``（同日・同じ起点）。
 * いずれも開きと閉じが同じ字下げで対を成すため、許容を落としても対の外側の内外判定は動かない。
 * **ただし対の内側は動く。** 許容を落とすと内外判定が反転する行が 60 行ある。**だが実データが
 * 対照になりえない理由はそこではなく、その 60 行に追跡表の表頭が 1 件も無いことである**——
 * 反転する行は、両方の許容で内外を印付けて突き合わせると数えられ、そのうち表頭に当たる行を
 * 数えると 0 件になる（コミット `b08733f9` の作業ツリーで 2026-09-07 にリポジトリルートで実測）。
 * 対の釣り合いだけを理由に挙げると、内側を見落とした主張になる。
 *
 * **枝は落とさず、対照を足した。** CommonMark は字下げ 3 桁までの区切りを区切りと読む。許容を
 * 落とせば「対照が無い」状態は消えるが、それは正しさを捨てて消すことであり、字下げされた開きの
 * フェンスに囲われた見本が宣言に化ける経路（幻の表）を新たに開く。対照は自己検査の
 * 「字下げされた開きのフェンスの中に引かれた表頭を表と数えない」と
 * 「字下げされた閉じの区切りでフェンスは閉じる」の 2 件が持ち、`^ {0,3}` を `^` へ狭めると
 * この 2 件が落ちる（同日に実測。落ちる向きは前者が幻の表の発生、後者が飲み込みである）。
 *
 * @param lines 設計文書を行へ分けたもの
 * @returns 各行がフェンスの内側（区切り行そのものを含む）にあるか
 */
function markCodeFenceLines(lines: readonly string[]): boolean[] {
  const inside: boolean[] = [];
  let open: OpenCodeFence | null = null;
  for (const line of lines) {
    const delimiter = readCodeFenceDelimiter(line);
    if (delimiter === null) {
      inside.push(open !== null);
      continue;
    }
    if (open === null) {
      open = { marker: delimiter.marker, length: delimiter.length };
    } else if (
      delimiter.marker === open.marker &&
      delimiter.length >= open.length &&
      delimiter.info.trim() === ''
    ) {
      open = null;
    }
    // 区切り行そのものは表頭になりえないため、内側として扱って差し支えない
    inside.push(true);
  }
  return inside;
}

/** 範囲を表す区切り（半角ハイフン・各種ダッシュ・全角波ダッシュ・半角チルダ） */
const RANGE_SEPARATORS = '-‐‑‒–—―〜～~';

/** `4.1-4.6` / `32.9-32.10` / `10.3〜10.6` */
const RANGE_TOKEN = new RegExp(
  `^(\\d+[A-E]?)\\.(\\d+)\\s*[${RANGE_SEPARATORS}]\\s*(?:(\\d+[A-E]?)\\.)?(\\d+)$`
);
/** `4.14` / `27A.3` */
const SINGLE_TOKEN = /^(\d+[A-E]?)\.(\d+)$/;

/** 機能ごとの方針 */
export type FeaturePolicy =
  | {
      readonly mode: 'exact';
      /** 追跡表に現れない現役の受入基準。集合が完全に一致することを求める */
      readonly missing: readonly string[];
      /** 追跡表が挙げるが現役でない番号。集合が完全に一致することを求める */
      readonly orphans: readonly string[];
      /** 読めない表記の許容件数（`exact` では 0 を既定とする） */
      readonly maxUnparsed: number;
      /** なぜこの宣言でよいのか */
      readonly reason: string;
    }
  | {
      readonly mode: 'ratchet';
      readonly maxMissing: number;
      readonly maxOrphans: number;
      readonly maxUnparsed: number;
      /**
       * 追跡表を一つも持たないことを許す
       *
       * 既定（未指定）では本文行が 0 行の機能は**前提の崩壊**として赤くする——表頭の書式が
       * 変わって走査が空振りした形と区別できないためである。表そのものが未整備であることが
       * 判っている機能だけ、ここで明示的に許す。
       */
      readonly allowNoTraceabilityTable?: boolean;
      readonly reason: string;
    };

/**
 * 全機能の方針
 *
 * **鍵の集合は `discoverFeatureNames()` の返り値と完全に一致していなければならない。**
 * 一致しない場合（新設された機能、消えた機能）は検査が失敗する。
 *
 * 上限の値は 2026-09-01 に `npx tsx scripts/check-traceability-coverage.ts --survey` で実測した
 * 現況である（`site-survey` の宣言だけは 2026-09-04 のタスク 115.261 が空集合へ縮めた）。
 * **上限を緩める向きの書き換えは、追跡表の網羅が後退したことを意味する。**
 *
 * **上限は実測ちょうどでなければならない**（タスク 115.262 の `judgeCeiling`）。遊びを持つ宣言は
 * その幅ぶんの新たな悪化を無言で吸収するため、上回る向きの書き換えも赤くなる。本宣言の
 * 12 件の `ratchet` はいずれも遊び 0 であり（欠落・死語・読めない表記の三つとも実測と一致。
 * 2026-09-04 に実測。当時の作業ツリーのコミットは記録していないため、2026-09-07 に
 * コミット `5dc930b0` の作業ツリーで `npm run check:trace-coverage` を走らせて追試した——
 * 遊びが一つでもあれば `judgeCeiling` が赤くするところ、EXIT=0 であった）、
 * 本タスクは既存の上限を一つも動かしていない。
 */
export const FEATURE_POLICIES: Readonly<Record<string, FeaturePolicy>> = {
  'company-info': {
    mode: 'ratchet',
    maxMissing: 0,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '現況で欠落・死語ともに 0 件。ラチェットで 0 を維持する',
  },
  'construction-photo': {
    mode: 'ratchet',
    maxMissing: 145,
    maxOrphans: 0,
    maxUnparsed: 20,
    reason:
      'Requirement 列が受入基準ではなく要件番号（`1` `2` …）だけを挙げるため、受入基準は 1 件も対応が取れない。表記を受入基準の粒度へ改める作業は本機能の別タスクを要する',
  },
  'construction-schedule': {
    mode: 'ratchet',
    maxMissing: 0,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '現況で欠落・死語ともに 0 件。ラチェットで 0 を維持する',
  },
  'contract-management': {
    mode: 'ratchet',
    maxMissing: 6,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '追跡表に行を持たない受入基準が残る。行の起こしは本機能の別タスクを要する',
  },
  'estimate-creation': {
    mode: 'ratchet',
    maxMissing: 7,
    maxOrphans: 24,
    maxUnparsed: 2,
    reason:
      'Requirement 列に `17.x` `31.x` のような伏せ字の表記が残り、指す受入基準を機械で確定できない。死語 24 件は撤廃済み・番号の付け替え済みの要件を追跡表が挙げ続けている形であり、整理は本機能の別タスクを要する',
  },
  'estimate-request': {
    mode: 'ratchet',
    maxMissing: 10,
    maxOrphans: 7,
    maxUnparsed: 0,
    reason:
      '追跡表に行を持たない受入基準と、現役でない番号を挙げる行が残る。是正は本機能の別タスクを要する',
  },
  'execution-budget-management': {
    mode: 'ratchet',
    maxMissing: 2,
    maxOrphans: 0,
    maxUnparsed: 0,
    reason: '追跡表に行を持たない受入基準が残る。行の起こしは本機能の別タスクを要する',
  },
  'itemized-statement-generation': {
    mode: 'ratchet',
    maxMissing: 0,
    maxOrphans: 12,
    maxUnparsed: 0,
    reason: '欠落は 0 件。現役でない番号を挙げる行が 12 件残り、整理は本機能の別タスクを要する',
  },
  'project-management': {
    mode: 'ratchet',
    maxMissing: 47,
    maxOrphans: 2,
    maxUnparsed: 2,
    reason:
      '追跡表に行を持たない受入基準が残る。Requirement 列の `4.1a` `4.1b` は枝つき番号であり、要件定義書の側で分母外の表記である',
  },
  'quantity-table-generation': {
    mode: 'ratchet',
    maxMissing: 11,
    maxOrphans: 7,
    maxUnparsed: 0,
    reason:
      '追跡表に行を持たない受入基準と、現役でない番号を挙げる行が残る。是正は本機能の別タスクを要する',
  },
  'site-survey': {
    mode: 'exact',
    // タスク 115.261 が、115.228 の残した 24 件の欠落と 1 件の死語をすべて是正した。
    // 内訳は、要件1 の併合行への `1.7` の吸収（担い手 `SiteSurveyService` / `SurveyRoutes` は
    // 既に同行に在る。4.14 と同型）、要件11.9 の独立行の新設（担い手 `PdfExportService` は
    // 併合行のどの部品とも異なる。4.7・4.8 と同型）、要件17（1 行）と要件19（3 行）の新設、
    // および移管済みの `**2.1**` の行の撤去（移管済みの受入基準は追跡表に行が無いことが正しい。
    // 本書 `### 部品の自己申告と追跡表の突き合わせ（タスク 115.113）` の要件2.2 の前例）である。
    // **集合が空であることを宣言する**——以後に漏れが生じれば新たな欠落・死語として赤くなる。
    missing: [],
    orphans: [],
    maxUnparsed: 0,
    reason:
      'タスク 115.261 が 115.228 の送った 24 件の欠落と 1 件の死語をすべて是正した。現況で欠落・死語ともに 0 件であり、exact の空集合として固定する',
  },
  'trading-partner-management': {
    mode: 'ratchet',
    maxMissing: 1,
    maxOrphans: 2,
    maxUnparsed: 1,
    reason: 'Requirement 列に `1.3.1` という三段の番号が残り、指す受入基準を機械で確定できない',
  },
  'user-authentication': {
    mode: 'ratchet',
    maxMissing: 388,
    maxOrphans: 0,
    maxUnparsed: 0,
    allowNoTraceabilityTable: true,
    reason:
      '`design.md` は在るが Requirements Traceability 表を一つも持たない。表の新設は本機能の別タスクを要する',
  },
};

/** 一機能の実測 */
export interface FeatureMeasurement {
  readonly feature: string;
  /** `design.md` の有無 */
  readonly hasDesignDocument: boolean;
  /** 追跡表の数 */
  readonly tables: number;
  /** 追跡表の本文行の数 */
  readonly rows: number;
  /** 現役の受入基準の数 */
  readonly criteria: number;
  /** 追跡表に現れない現役の受入基準（昇順） */
  readonly missing: readonly string[];
  /** 追跡表が挙げるが現役でない番号（昇順） */
  readonly orphans: readonly string[];
  /** `N.M` にも範囲にも解釈できなかった Requirement 列のトークン */
  readonly unparsed: readonly string[];
}

/** `REQ-4.14` を (4, 14) の順で並べるための鍵 */
function criterionSortKey(id: string): [string, number] {
  const match = /^REQ-(\d+[A-E]?)\.(\d+)$/.exec(id);
  if (match?.[1] === undefined || match[2] === undefined) return [id, 0];
  return [match[1].padStart(4, '0'), Number.parseInt(match[2], 10)];
}

function sortCriterionIds(ids: Iterable<string>): string[] {
  return [...ids].sort((left, right) => {
    const a = criterionSortKey(left);
    const b = criterionSortKey(right);
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] - b[1];
  });
}

/**
 * 設計文書から追跡表の本文行を取り出す
 *
 * 表頭（`TRACEABILITY_TABLE_HEADER`）の**2行下**（区切り行の次）から、`|` で始まらない行の
 * 直前までを本文行とする。この数え方は `design.md` の
 * `### 部品の自己申告と追跡表の突き合わせ（タスク 115.113）` が定めた再現手順と同一である。
 *
 * **コードフェンスの内側に引かれた表頭は宣言ではない**（タスク 115.263。理由と、
 * 115.226 の処方のどの半分が Markdown へ渡るかは `markCodeFenceLines` に書いた）。
 * 本文行の側にフェンスを見る必要は無い——フェンスの区切り行は `|` で始まらないため、
 * 宣言と認めた表頭の直下の連なりへ割り込めないからである。
 *
 * **区切り行を伴わない表頭も宣言ではない**（タスク 115.318）。是正前は表頭の**次の行**を
 * 見ずに `index + 2` から本文行を数えていたため、区切り行を欠いたまま並べた行の塊
 * （GFM は表として読まない）を表として読み、その 2 行目以降が挙げる番号を被覆済みにした。
 * これはフェンスの外の散文に置かれた見本を宣言と読む経路であり、115.263 が塞いだ幻の表の
 * **フェンスに囲われていない側**である。
 *
 * **是正は挙動を変えていない。** 実データで表頭は 32 件あり、次の行が区切り行でないものは
 * 0 件である——採取は
 * ``grep -rh '^| *Requirement | *Summary | *Components |' .kiro/specs --include design.md | wc -l``
 * と、同じ起点に `-A1` を付けて表頭の行と `--` を除き ``grep -vc '^|[ :|-]*|$'`` を掛けたもの
 * （2026-09-07 にリポジトリルートで実測）。`npm run --silent check:trace-coverage` の出力は
 * 是正の前後でバイト単位で一致する。
 *
 * **残余（塞いでいないこと。タスク 115.318 の記録）**: フェンスに囲われず、かつ区切り行まで
 * 揃えて散文中に書かれた見本の表は、依然として実在の表と見分けられない。表頭と区切り行の
 * 水準には「これは見本である」と述べる語彙が無いためであり、115.226 が自身の行中フェンスの
 * 事例について書き残したのと同種の残余である。塞ぐには見本の側へ印を要求する規約が要る。
 */
export function extractTraceabilityRows(designContent: string): {
  tables: number;
  rows: string[];
} {
  const lines = designContent.split('\n');
  const insideFence = markCodeFenceLines(lines);
  const rows: string[] = [];
  let tables = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || !TRACEABILITY_TABLE_HEADER.test(line)) continue;
    if (insideFence[index] === true) continue; // 見本として引かれた字面は表の宣言ではない
    const delimiterLine = lines[index + 1];
    // 区切り行を欠く字面は GFM が表として読まない。表の宣言と認めない（タスク 115.318）
    if (delimiterLine === undefined || !TABLE_DELIMITER_ROW.test(delimiterLine)) continue;
    tables += 1;
    for (let cursor = index + 2; cursor < lines.length; cursor++) {
      const bodyLine = lines[cursor];
      if (bodyLine === undefined || !bodyLine.startsWith('|')) break;
      rows.push(bodyLine);
    }
  }
  return { tables, rows };
}

/**
 * 追跡表の本文行の Requirement 列を受入基準の番号へ展開する
 *
 * 強調記号（`**`）とバッククォートは意味を持たない装飾として落とす。`,` で区切った各トークンを
 * 単独の番号または範囲として読む。**どちらでもないトークンは黙って捨てず `unparsed` に積む**。
 */
export function expandRequirementColumn(rows: readonly string[]): {
  covered: Set<string>;
  unparsed: string[];
} {
  const covered = new Set<string>();
  const unparsed: string[] = [];
  for (const row of rows) {
    const cell = row.split('|')[1];
    if (cell === undefined) continue;
    const normalized = cell.replace(/\*\*/g, '').replace(/`/g, '').trim();
    for (const rawToken of normalized.split(',')) {
      const token = rawToken.trim();
      if (token === '' || token === '-') continue;

      const range = RANGE_TOKEN.exec(token);
      if (range?.[1] !== undefined && range[2] !== undefined && range[4] !== undefined) {
        const requirementId = range[1];
        // 範囲の右端が別の要件を指す表記（`4.5-5.2`）は展開の仕方が一意に決まらない
        if (range[3] !== undefined && range[3] !== requirementId) {
          unparsed.push(token);
          continue;
        }
        const from = Number.parseInt(range[2], 10);
        const to = Number.parseInt(range[4], 10);
        if (to < from) {
          unparsed.push(token);
          continue;
        }
        for (let number = from; number <= to; number++) {
          covered.add(`REQ-${requirementId}.${number}`);
        }
        continue;
      }

      const single = SINGLE_TOKEN.exec(token);
      if (single?.[1] !== undefined && single[2] !== undefined) {
        covered.add(`REQ-${single[1]}.${Number.parseInt(single[2], 10)}`);
        continue;
      }

      unparsed.push(token);
    }
  }
  return { covered, unparsed };
}

/** 一機能を実測する */
export function measureFeature(rootDir: string, feature: string): FeatureMeasurement {
  const designPath = path.join(rootDir, SPEC_DIR, feature, DESIGN_DOCUMENT_BASENAME);
  const hasDesignDocument = fs.existsSync(designPath);
  const { tables, rows } = hasDesignDocument
    ? extractTraceabilityRows(fs.readFileSync(designPath, 'utf8'))
    : { tables: 0, rows: [] as string[] };
  const { covered, unparsed } = expandRequirementColumn(rows);

  const requirementsPath = requirementsDocumentPath(rootDir, feature);
  const requirements = scanRequirementsDocument(
    fs.readFileSync(requirementsPath, 'utf8'),
    requirementsPath
  );

  const active = new Set<string>();
  for (const requirement of requirements) {
    for (const criterion of requirement.criteria) {
      active.add(`${requirement.id}.${criterion.number}`);
    }
  }

  const missing = sortCriterionIds([...active].filter((id) => !covered.has(id)));
  const orphans = sortCriterionIds([...covered].filter((id) => !active.has(id)));

  return {
    feature,
    hasDesignDocument,
    tables,
    rows: rows.length,
    criteria: active.size,
    missing,
    orphans,
    unparsed,
  };
}

/** 判定の結果 */
export interface Judgement {
  readonly failures: string[];
  readonly measurements: FeatureMeasurement[];
}

/**
 * 宣言した上限に遊びが無いことを求める（タスク 115.262）
 *
 * `ratchet` の上限は「超えないこと」だけを求める形では、**先回りで緩めた宣言を機構が止めない**。
 * 上限が実測を上回っていれば、その幅ぶんの新たな悪化が無言で吸収される。ここでは逆向き——
 * **上限が実測を上回っていれば失敗**——を課す。既存の「上限を超えたら失敗」と合わせると、
 * 宣言は実測と一致するほかない。
 *
 * **締める向きは妨げない。** 実測が減ったときに求めるのは上限を実測と同じ値まで下げることだけで
 * あり、下げるべき値は失敗の文面が名指しする。実測が増えた側は既存の判定が受け持つため、
 * ここでは扱わない（同じ食い違いを二度報告しない）。
 */
function judgeCeiling(label: string, kind: string, actual: number, ceiling: number): string[] {
  if (ceiling <= actual) return [];
  return [
    `${label}: ${kind}の上限を ${ceiling} 件と宣言していますが実測は ${actual} 件です` +
      `（遊び ${ceiling - actual} 件）。上限は実測ちょうどに保ってください——` +
      `遊びを持つ宣言は、その幅ぶんの新たな悪化を無言で吸収します。上限を ${actual} 件へ下げてください。`,
  ];
}

function judgeFeature(measurement: FeatureMeasurement, policy: FeaturePolicy): string[] {
  const failures: string[] = [];
  const label = measurement.feature;

  // 母集団が空なら前提の崩壊として赤くする（AI運用7原則 第3原則）
  if (measurement.criteria === 0) {
    failures.push(`${label}: 現役の受入基準が 0 件です（要件定義書の読み取りが空振りしています）`);
  }
  const noTablesAllowed = policy.mode === 'ratchet' && policy.allowNoTraceabilityTable === true;
  if (measurement.rows === 0 && !noTablesAllowed) {
    failures.push(
      `${label}: 追跡表の本文行が 0 行です（表頭の書式が変わって走査が空振りした疑いがあります）。` +
        '表が未整備であることが判っている機能なら FEATURE_POLICIES で allowNoTraceabilityTable を宣言してください。'
    );
  }
  if (measurement.rows > 0 && noTablesAllowed) {
    failures.push(
      `${label}: allowNoTraceabilityTable を宣言していますが追跡表の本文行が ${measurement.rows} 行あります。宣言を外してください。`
    );
  }

  if (policy.mode === 'exact') {
    const declaredMissing = new Set(policy.missing);
    const actualMissing = new Set(measurement.missing);
    const newlyMissing = measurement.missing.filter((id) => !declaredMissing.has(id));
    const staleMissing = policy.missing.filter((id) => !actualMissing.has(id));
    if (newlyMissing.length > 0) {
      failures.push(
        `${label}: 追跡表に現れない受入基準が宣言より増えています: ${newlyMissing.join(', ')}`
      );
    }
    if (staleMissing.length > 0) {
      failures.push(
        `${label}: 解消済みの欠落が宣言に残っています（宣言から削ってください）: ${staleMissing.join(', ')}`
      );
    }

    const declaredOrphans = new Set(policy.orphans);
    const actualOrphans = new Set(measurement.orphans);
    const newlyOrphaned = measurement.orphans.filter((id) => !declaredOrphans.has(id));
    const staleOrphans = policy.orphans.filter((id) => !actualOrphans.has(id));
    if (newlyOrphaned.length > 0) {
      failures.push(`${label}: 現役でない番号を追跡表が挙げています: ${newlyOrphaned.join(', ')}`);
    }
    if (staleOrphans.length > 0) {
      failures.push(
        `${label}: 解消済みの死語が宣言に残っています（宣言から削ってください）: ${staleOrphans.join(', ')}`
      );
    }

    if (measurement.unparsed.length > policy.maxUnparsed) {
      failures.push(
        `${label}: Requirement 列に読めない表記が ${measurement.unparsed.length} 件あります` +
          `（宣言は ${policy.maxUnparsed} 件）: ${[...new Set(measurement.unparsed)].join(', ')}`
      );
    }
    failures.push(
      ...judgeCeiling(label, '読めない表記', measurement.unparsed.length, policy.maxUnparsed)
    );
    return failures;
  }

  if (measurement.missing.length > policy.maxMissing) {
    failures.push(
      `${label}: 追跡表に現れない受入基準が ${measurement.missing.length} 件あります` +
        `（宣言の上限は ${policy.maxMissing} 件）。増えた分: ` +
        `${measurement.missing.slice(policy.maxMissing).join(', ')}`
    );
  }
  if (measurement.orphans.length > policy.maxOrphans) {
    failures.push(
      `${label}: 現役でない番号を追跡表が ${measurement.orphans.length} 件挙げています` +
        `（宣言の上限は ${policy.maxOrphans} 件）: ${measurement.orphans.join(', ')}`
    );
  }
  if (measurement.unparsed.length > policy.maxUnparsed) {
    failures.push(
      `${label}: Requirement 列に読めない表記が ${measurement.unparsed.length} 件あります` +
        `（宣言の上限は ${policy.maxUnparsed} 件）: ${[...new Set(measurement.unparsed)].join(', ')}`
    );
  }
  // 上限に遊びを持たせない（タスク 115.262）。先回りで緩めた宣言を機構の側で止める。
  failures.push(
    ...judgeCeiling(
      label,
      '追跡表に現れない受入基準',
      measurement.missing.length,
      policy.maxMissing
    ),
    ...judgeCeiling(label, '現役でない番号', measurement.orphans.length, policy.maxOrphans),
    ...judgeCeiling(label, '読めない表記', measurement.unparsed.length, policy.maxUnparsed)
  );
  return failures;
}

/**
 * 全機能を判定する
 *
 * @param rootDir リポジトリ根
 * @param policies 方針の宣言。既定は `FEATURE_POLICIES`
 * @param features 機能名。既定は `discoverFeatureNames(rootDir)`
 */
export function judge(
  rootDir: string,
  policies: Readonly<Record<string, FeaturePolicy>> = FEATURE_POLICIES,
  features: readonly string[] = discoverFeatureNames(rootDir)
): Judgement {
  const failures: string[] = [];
  const measurements: FeatureMeasurement[] = [];

  // 母集団が空なら前提の崩壊として赤くする（AI運用7原則 第3原則）
  if (features.length === 0) {
    failures.push(
      '機能が 1 件も見つかりません（.kiro/specs/ の走査が空振りしています）。' +
        'この状態で「漏れは無い」と読んではなりません。'
    );
  }
  if (Object.keys(policies).length === 0) {
    failures.push('方針の宣言が空です（FEATURE_POLICIES が失われています）。');
  }

  // 宣言と実在の双方向の一致を求める（片方向だと、機能の新設で黙って検査の外へ落ちる）
  const declared = new Set(Object.keys(policies));
  const discovered = new Set(features);
  for (const feature of features) {
    if (!declared.has(feature)) {
      failures.push(
        `機能 ${feature} が FEATURE_POLICIES に宣言されていません。` +
          '追跡表の網羅の方針（exact / ratchet）を宣言してください。'
      );
    }
  }
  for (const feature of declared) {
    if (!discovered.has(feature)) {
      failures.push(
        `FEATURE_POLICIES が宣言する機能 ${feature} が .kiro/specs/ に実在しません。` +
          '宣言が対象より長生きしています。'
      );
    }
  }

  for (const feature of features) {
    const policy = policies[feature];
    if (policy === undefined) continue; // 上で失敗として計上済み
    const measurement = measureFeature(rootDir, feature);
    measurements.push(measurement);
    failures.push(...judgeFeature(measurement, policy));
  }

  return { failures, measurements };
}

function reportSurvey(measurements: readonly FeatureMeasurement[]): void {
  for (const measurement of measurements) {
    console.log(
      `${measurement.feature}: tables=${measurement.tables} rows=${measurement.rows} ` +
        `criteria=${measurement.criteria} missing=${measurement.missing.length} ` +
        `orphans=${measurement.orphans.length} unparsed=${measurement.unparsed.length}`
    );
    if (measurement.missing.length > 0) console.log(`  missing: ${measurement.missing.join(', ')}`);
    if (measurement.orphans.length > 0) console.log(`  orphans: ${measurement.orphans.join(', ')}`);
    if (measurement.unparsed.length > 0) {
      console.log(`  unparsed: ${[...new Set(measurement.unparsed)].join(', ')}`);
    }
  }
}

export function execute(argv: readonly string[], rootDir = process.cwd()): number {
  const verbose = argv.includes('--verbose');
  const json = argv.includes('--json');
  const survey = argv.includes('--survey');

  if (survey) {
    const features = discoverFeatureNames(rootDir);
    reportSurvey(features.map((feature) => measureFeature(rootDir, feature)));
    return 0;
  }

  const { failures, measurements } = judge(rootDir);

  const totals = measurements.reduce(
    (accumulator, measurement) => ({
      rows: accumulator.rows + measurement.rows,
      criteria: accumulator.criteria + measurement.criteria,
      missing: accumulator.missing + measurement.missing.length,
      orphans: accumulator.orphans + measurement.orphans.length,
      unparsed: accumulator.unparsed + measurement.unparsed.length,
    }),
    { rows: 0, criteria: 0, missing: 0, orphans: 0, unparsed: 0 }
  );

  if (json) {
    console.log(JSON.stringify({ failures, totals, measurements }, null, 2));
    return failures.length > 0 ? 1 : 0;
  }

  console.log('🔍 追跡表の受入基準の網羅を検査しています (scripts/check-traceability-coverage.ts)');
  console.log(
    `   機能 ${measurements.length} 件 / 追跡表の本文行 ${totals.rows} 行 / ` +
      `現役の受入基準 ${totals.criteria} 件`
  );
  console.log(
    `   欠落 ${totals.missing} 件 / 死語 ${totals.orphans} 件 / 読めない表記 ${totals.unparsed} 件` +
      '（いずれも宣言との比較で判定します）'
  );

  if (verbose) {
    console.log('');
    reportSurvey(measurements);
  }

  if (failures.length > 0) {
    console.error('');
    console.error('❌ 追跡表と受入基準の対応が宣言と食い違います:');
    for (const failure of failures) console.error(`   - ${failure}`);
    console.error('');
    console.error('対応方法:');
    console.error('  1. 受入基準を新設したなら、design.md の追跡表の Requirement 列へ番号を加える');
    console.error('     （併合行なら `4.1-4.6, 4.9, 4.14` のように列へ足せば行数は動きません）');
    console.error('  2. 受入基準を撤廃したなら、追跡表の側の番号も落とす');
    console.error('  3. 行を起こせない事情があるなら、FEATURE_POLICIES へ理由と併せて宣言する');
    console.error('  4. 上限に遊びがあると言われたなら、上限を実測ちょうどへ下げる');
    console.error(
      '     （上限を先回りで緩める書き換えは、その幅ぶんの悪化を無言で吸収するため塞いでいます）'
    );
    console.error('');
    console.error('詳細確認: npm run check:trace-coverage:verbose');
    return 1;
  }

  console.log('✅ 追跡表と受入基準の対応は宣言どおりです');
  return 0;
}

function main(): void {
  const exitCode = execute(process.argv.slice(2));
  if (exitCode !== 0) process.exit(exitCode);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
