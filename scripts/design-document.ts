/**
 * @fileoverview 設計文書（`.kiro/specs/<機能>/design.md`）の走査根
 *
 * 「どの設計文書を読むか」を決める規則——置き場所（`SPEC_DIR`）・文書名（`DESIGN_DOC_NAME`）・
 * 列挙（`collectDesignDocuments`）——を、リポジトリで一箇所に置く（タスク 115.231）。
 *
 * ただし置き場所そのものの値は本モジュールでは持たない（タスク 115.269）。
 * `.kiro/specs` は要件定義書の根でもあり、二箇所に置くと同値の別名が並ぶためである。
 * 値は scripts/spec-directory.ts が唯一の担い手として持ち、本モジュールは取り込んで
 * 再輸出する。判断の経緯と、別名のままだと片方が動いてももう片方が静かに残ることの実測は
 * scripts/spec-directory.ts の冒頭に置く。
 *
 * ## なぜ一箇所でなければならないか
 *
 * この規則は三つの検査の**母集団**を同時に決めている。
 *   - 設計文書から本番コードへの行番号参照の形式（scripts/check-design-code-reference-format.ts）
 *   - 本番コードから設計文書への参照および設計文書間の参照の形式
 *     （scripts/check-design-reference-format.ts）
 *   - 設計文書が挙げるパス・ファイル名の実在（scripts/check-design-path-references.ts）
 *
 * 母集団がずれると、ある文書が片方の検査からだけ抜ける。抜けた側はその文書について該当を
 * 挙げなくなるが、**期待する件数を宣言する相手がいなければ検査は緑のまま通る**。これは
 * タスク 115.190 / 115.221 が要件定義書の側で実測した穴（抽出規則・機能名の探索が二箇所に
 * 複製され、片方だけを変えても全検査が緑で通った）と同型である。件数の宣言があれば赤に
 * なることは本タスクでも測った——下の走査の輪へ `if (entry.name === 'site-survey') continue;`
 * を一行差し込むと `npm run check:design-code-refs:selftest` は 72 件中 2 件が落ちる
 * （2026-09-01 に実測）。
 *
 * ## 一元化の前に測った差（タスク 115.231）
 *
 * 起票文の主張——走査根が「`check-design-code-reference-format.ts` に定義、
 * `check-design-reference-format.ts` はそれを借用、`check-design-path-references.ts` は複製」
 * ——はコミット `d1b51c6` のツリーで成立していた（`SPEC_DIR` と `DESIGN_DOC_NAME` の
 * 定義は 2 ファイル・`collectDesignDocuments` の定義も同じ 2 ファイル、借用は 1 ファイル）。
 *
 * **二つの複製は逐語では一致していなかった。** 差は列挙が返す文字列の作り方 1 行だけで、
 * `check-design-code-reference-format.ts` は `path.relative(root, candidate)` を正規化して
 * 返し、`check-design-path-references.ts` は `` `${specDir}/${entry.name}/${DESIGN_DOC_NAME}` ``
 * と受け取った綴りのまま連結して返していた。この差が出力に現れるのは `specDir` が
 * 正規形でない場合に限る。7 通りの `specDir` を両実装へ与えて実測したところ、
 * 既定と `'.kiro/specs'` の 2 通りは 13 件が逐語一致し、
 * `'.kiro/specs/'` / `'./.kiro/specs'` / `'.kiro//specs'` / `'x/../.kiro/specs'` / `'/.kiro/specs'`
 * の 5 通りで先頭要素が食い違った（例: 前者 `.kiro/specs/company-info/design.md` に対し
 * 後者 `.kiro/specs//company-info/design.md`。2026-09-01 にリポジトリルートで実測）。
 *
 * **その 5 通りを与える呼び手は、次の走査の範囲では無い。** 走査は
 * `git grep -n "specDir" d1b51c6` で宣言する——リポジトリ全体で 37 行、
 * すべて `scripts/` 配下の 5 ファイル（三つの検査本体に 26 行・二つの自己検査に 11 行）に
 * 収まる。全件を読むと本体の 26 行は型宣言と `options.specDir ?? SPEC_DIR` と報告の文面、
 * 自己検査の 11 行は本体のソースを見張る正規表現であって、`run({ specDir })` の形で値を渡す
 * 呼び手は 0 件であった（2026-09-01 に実測）。**この走査は綴り `specDir` を含む行だけを見て
 * いる。** 別名へ束ねてから渡す形・設定ファイルや環境変数を経由する形は範囲外であり、
 * 保証しない。範囲内では差は到達不能であり、正規化する側（`path.relative`）へ寄せても
 * 三つの検査の出力は動かない。
 *
 * 動かないことは、`d1b51c6` を取り出した別ツリーと本ツリーで三つの検査を走らせ `cmp` で
 * 突き合わせて確かめた——`check-design-code-reference-format` と
 * `check-design-path-references` は標準出力・標準エラーとも逐語一致し、
 * `check-design-reference-format` は本番コードの走査件数だけが 750 と 804 で違う。
 * 差の 54 は `.gitignore` された `backend/src/generated/` の実ファイル数であり、
 * 取り出したツリーには存在しない（2026-09-01 に実測）。設計文書の走査件数は
 * どちらも 13 で一致する。
 *
 * ## 採った形と、残る限界
 *
 * 返す文字列はリポジトリルート相対に正規化する。`specDir` に絶対パスや `..` を与えると
 * 正規化の結果はルート外を指しうるが、上の走査の範囲では与える呼び手は無い。**呼び手を増やすときは
 * `specDir` を正規形（先頭・末尾にスラッシュを持たない相対パス）で渡すこと。**
 *
 * 走査対象が一件も無い場合は空配列を返す。**呼び手はこれを「設計文書が無い」と読んで黙って
 * 素通りさせてはならない**（AI運用7原則 第3原則）。三つの検査はいずれも空を前提の崩壊と
 * みなして落とす——`scannedFiles.length === 0` / `scannedDesignDocuments.length === 0` の
 * 関門を三者とも持ち、`grep -n "length === 0" scripts/check-design-*.ts` で所在を確かめられる
 * （タスク 115.221 が要件定義書の側で採った分担と同じく、空を返すのは本モジュールの既定で
 * あり、それを停止条件にするかは呼び手が決める）。
 *
 * 一元化が保たれていることは、次の範囲で機械が見る。
 * scripts/check-design-code-reference-format.selftest.ts の
 * 「走査根の複製が戻っていない（共有部品が唯一の担い手である）」が、三つの消費側のソースに
 * 走査根の断片が現れないこと・三者が本モジュールを静的に取り込んでいること・
 * 断片が本モジュールに実在すること（対照が空振りしていないこと）を確かめる。
 * **この対照には天井が二つある**（取り込んだ定数で列挙を書き直す形／同じ行の手前に `//` を
 * 含む文字列を置く形）。実測とともに同ファイルの `SCAN_ROOT_FRAGMENTS` の注釈に記す。
 * `collectDesignDocuments` の本体そのものは、同自己検査の `checkNoFindingsNarrowing` が
 * 空でない全行を許可形と突き合わせて見張る（走査根に spec 名の除外を差し込む手を塞ぐため。
 * 見張りの対象は本モジュールのソースを含む）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { SPEC_DIR } from './spec-directory.js';

/**
 * 設計文書の置き場所（リポジトリ相対）
 *
 * 値は scripts/spec-directory.ts が持つ（タスク 115.269）。要件定義書の根と同じ一つの値で
 * あり、ここで持つと同値の別名が二つ並ぶ。再輸出するのは、既存の呼び手が本モジュールから
 * 走査根の三点（置き場所・文書名・列挙）をまとめて取れる形を保つためである。
 */
export { SPEC_DIR };

/** 走査対象の文書名 */
export const DESIGN_DOC_NAME = 'design.md';

/**
 * `.kiro/specs/<feature>/design.md` を列挙する
 *
 * @param root 走査の起点。自己検査は合成の根を与える
 * @param specDir 設計文書の置き場所（`root` からの相対）。正規形で渡すこと
 */
export function collectDesignDocuments(root: string, specDir: string = SPEC_DIR): string[] {
  const absoluteSpecDir = path.join(root, specDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteSpecDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const documents: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(absoluteSpecDir, entry.name, DESIGN_DOC_NAME);
    if (!fs.existsSync(candidate)) continue;
    documents.push(path.relative(root, candidate).split(path.sep).join('/'));
  }
  return documents.sort();
}
