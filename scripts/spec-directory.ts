/**
 * @fileoverview スペックの根（`.kiro/specs`）— 要件定義書と設計文書が共有する唯一の定義
 *
 * 一つの機能のスペックは `requirements.md` と `design.md` を**同じディレクトリ**へ置く
 * （`.kiro/specs/<機能>/`）。したがって「要件定義書の根」と「設計文書の走査根」は二つの
 * 概念ではなく、同じ一つの値である。本モジュールはその値をリポジトリで一箇所に置く。
 *
 * ## なぜ一つにしたか（タスク 115.269 の判断）
 *
 * タスク 115.231 が設計文書の走査根を scripts/design-document.ts へ一本化した時点で、
 * `scripts/` には同値のリテラルが三つ残っていた。追試の手順と実測（コミット `97302295`、
 * 2026-09-04 にリポジトリルートで実測）:
 * `git grep -n "'\.kiro/specs'" 97302295 -- 'scripts/*.ts' | grep -v '\.selftest\.ts'`
 * は 4 行を挙げ、うち実行されるコードは 3 行である——
 * scripts/requirement-document.ts:70 の `SPECS_DIR`、scripts/design-document.ts:87 の
 * `SPEC_DIR`、scripts/check-traceability-coverage.ts:493 の裸のリテラル。
 * 残る 1 行（scripts/design-document.ts:35）は注釈の中の引用である。
 * 自己検査（`*.selftest.ts`）は照合の素材や合成の木の組み立てとして同じ綴りを正当に持つため、
 * この数え上げの範囲外である。
 *
 * **一つにしてよいかを先に測った。** 要件被覆の走査と設計文書の走査は、字面の上では
 * 独立に動かせた。しかし**二つの検査が既に両者を同じ根の下で突き合わせている**:
 *   - scripts/check-traceability-coverage.ts は `discoverFeatureNames`（要件定義書の実在で
 *     機能を数える）が返した機能名で `requirements.md` を読み、同じ機能名で `design.md` を
 *     読んで追跡表と受入基準を突き合わせる
 *   - scripts/check-design-component-requirements.ts も同じ機能名を設計文書側の根の下の
 *     パス片として使う
 * すなわち「同じ機能名が両方の根の下で同じスペックを指す」ことは、**既に前提として
 * 使われている**。一つにしても新しい結合は生まれない。生まれないのは自由の方であり、
 * 消えるのは「二つの定数が黙って食い違える」ことだけである。
 *
 * **別名のままだと片方が動いてももう片方は静かに残る。** 実測（コミット `97302295` の
 * 作業ツリーで 2026-09-04 にリポジトリルートで実測。変異は退避した控えからの書き戻しで
 * 復元し、復元後は元の値に戻ることを確かめた）:
 *   - scripts/design-document.ts の `SPEC_DIR` だけを `'.kiro/specs-moved'` へ変えると、
 *     `npm run check:design-code-refs` は「走査対象の設計文書が一件も見つかりませんでした
 *     ／走査したディレクトリ: .kiro/specs-moved」で終了コード 1、
 *     `npm run check:design-component-reqs` も終了コード 1 になる。一方で
 *     **`npm run check:trace-coverage` は終了コード 0 のまま**であった
 *     （機能 13 件 / 追跡表の本文行 860 行 / 現役の受入基準 2889 件）。同検査は
 *     自前のリテラルで旧い根を読み続けており、設計文書の根が動いたことに気付けない
 *   - 逆に scripts/check-traceability-coverage.ts の裸のリテラルだけを
 *     `'.kiro/specs-moved'` へ変えると `npm run check:trace-coverage` は終了コード 1 に
 *     なるが、挙がる文言は「追跡表の本文行が 0 行です」「追跡表に現れない受入基準が
 *     N 件あります」であり（欠落は 617 件から 2889 件へ）、**根が食い違っていることは
 *     一言も名指ししない**。原因の診断は人手に残る
 *
 * ## 何が一つになり、何が呼び手に残るか
 *
 * 一つになったのは**定数の値**だけである。走査の起点（`rootDir` / `root`）と、
 * 設計文書側の `options.specDir` による差し替えは各呼び手にそのまま残る。自己検査が合成の
 * 根を与えて走らせる経路も変わらない。すなわち「要件被覆と設計文書の走査を別々の木へ
 * 向ける」ことは今も呼び手の側でできる。できなくなったのは、**二つの定数が別々の値へ
 * 静かに分かれる**ことだけである。
 *
 * ## 一つであり続けることを機械が見る範囲
 *
 * scripts/check-design-code-reference-format.selftest.ts の確認
 * 「スペックの根と走査根の複製が戻っていない（共有部品が唯一の担い手である）」が、
 * (a) 本モジュールが根を実行される部分に持つこと、(b) `scripts/` 直下の自己検査でない
 * `.ts` のうち本モジュール以外が根の断片を持たないこと、(c) scripts/requirement-document.ts と
 * scripts/design-document.ts が本モジュールから根を取り込んでいること、を確かめる。
 * **範囲外は保証しない**——自己検査（`*.selftest.ts`）・`.cjs` / `.mjs` / `.sh`、および
 * 断片方式そのものの天井（取り込んだ定数で書き直す形・逐語で持たずに組み立てる形）は
 * 同確認の注釈が実測とともに挙げる。
 */

/** 一つの機能のスペック（`requirements.md` / `design.md`）が置かれる根（リポジトリ相対） */
export const SPEC_DIR = '.kiro/specs';
