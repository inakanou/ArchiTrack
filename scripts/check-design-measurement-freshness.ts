/**
 * @fileoverview 設計文書が引く実測値の鮮度を機械で見る検査
 *
 * ## なぜ在るか（タスク 115.232）
 *
 * 設計文書が引く件数が現況と一致するかを見る関門は、本検査を置くまで**存在しなかった**。
 * 「無い」の走査範囲をコマンドで宣言する（日本語で範囲を宣言しない。開発規律の第2層の作法）。
 * `grep -ln 'design\.md\|design-document' scripts/check-*.ts | grep -v selftest` が挙げるのは
 * 9 件で、本検査を除くと 8 件である（2026-09-01 に実測）。その 8 件を一件ずつ走らせて要約行を
 * 読んだ結果、**文書側の数値と再現コマンドの出力を突き合わせるものは 0 件**であった（同日に実測）。
 * `check:design-refs` は参照の形式を、`check:design-code-refs` は本番コードへの参照の形式を、
 * `check:design-path-refs` はパスの実在を、`check:cf-evidence` はコード注釈の反実仮想を、
 * `check:trace-coverage` は追跡表と受入基準の対応を、`check:steering-refs` /
 * `check:steering-idents` / `check:steering-test-tree` は steering の側を見る。
 * どれも「本書が引く 216 件は今日も 216 件か」を問わない
 * （`216 件` は `design.md` が人手走査の母集団として引いている値である。**同書での出現は 2 箇所**——
 * `grep -o '216 件' .kiro/specs/site-survey/design.md | wc -l` が `2`、
 * どちらも同じ 1 行に在るため `grep -c` は `1` を返す。2026-09-04、コミット `24acf91f` で実測。
 * 本注釈は 115.232 の提出時点から「1 箇所」と述べていたが、それは行数であって出現数ではなかった。
 * 115.270 のレビューが検出し、本タスク 115.271 が是正した）。
 * 上の走査に掛からない関門（`design.md` を読まない検査）については保証しない。
 * `.kiro/specs/site-survey/design.md` 自身が第1層でこの不在を宣言している。
 *
 * 不在の代償は実測されている。タスク 115.212 は同型の掃き残しで**三度**、115.213 は**一度**
 * 差し戻された。とくに本書が自分自身を数える四値（強調記号を課す網・課さない網・再現コマンドを
 * 同じ行に持つ行・実測日を持たない残余）は、**それを述べる行自身が母集団に属する**ため、
 * 文書へ書き足すたびに動く。人手で一つずつ測って書き入れる手順は現に食い違っており、
 * 本検査を置いた 115.232 の提出時点では四値はいずれも文書側が古かった
 * （{@link DECLARED_STALE_DOCUMENT_FIGURES} が当時 4 件を要求していた）。
 * **タスク 115.270 がその四件を解消し、同定数は 0 件である**——文書側は現況を述べる字面を
 * 錨に採り、115.213 の提出時点の値は同じ行に歴史記録として残している
 * （下の「見ないこと」の「歴史記録と現況の区別は見ない」を見よ）。要約行は毎回この件数を印字する。
 *
 * ## 何を宣言し、何を突き合わせるか
 *
 * `scripts/design-measurements.json` の `entries` が一件ずつ次を宣言する。
 *
 *   - `id`: 宣言の識別子（重複は失敗）
 *   - `file`: 数値を載せている文書（リポジトリルート相対）
 *   - `anchor`: その数値を載せている**行**を一意に定める逐語の断片。
 *     0 行に当たるのも 2 行以上に当たるのも失敗にする
 *   - `command`: リポジトリルートで走らせると数値を再現するコマンド
 *   - `expected`: `command` の標準出力（前後の空白を除いたもの）と一致しなければならない値
 *   - `documentFigure`: 文書が載せている値。既定は `expected`
 *   - `documentRendering`: `anchor` の行に**ちょうど 1 箇所**現れていなければならない字面。
 *     既定は `documentFigure` そのもの。`documentFigure` を含んでいなければならない
 *   - `divergence`: `documentFigure` が `expected` と異なるときに必須。`kind` と `reason` を持つ
 *
 * **素の数字だけでは足りない。** 同じ行の別の数値に当たってしまう——`Component Summary` の
 * 節数を数える行は再現コマンドに `#{3,4}` を含むため、文書側の出力を `3` から `4` へ書き換えても
 * 素の `3` は残る。実際にこの変異を当てたところ、1 箇所であることを課す前の版は緑のまま
 * 素通りした（2026-09-01 に実測）。1 箇所を課したうえで当該の宣言を `` の出力が `3` `` へ
 * 改めると、同じ変異で「載せていません」として赤くなる（同日に実測）。
 * 現在の宣言 30 件のうち記法ごとの宣言を持つのは 23 件、素の字面のままは 7 件である（2026-09-02 に実測。
 * 本注釈を置いた 115.232 の提出時点は 29 件 / 22 件 / 7 件であり、タスク 115.233 が
 * `self-report-audit-implementation-files` を一件足した）。
 *
 * ## 一方向では足りない（タスク 115.227 の作法）
 *
 * `expected` と `command` の出力だけを突き合わせる形にすると、**宣言だけが新鮮で文書は古い**
 * 状態が緑で通る。宣言は文書の外に在るからである。そこで **`anchor` の行が `documentFigure` を
 * 現に載せていること**も課し、二方向で一致させる。
 *
 *   - 現況が動いた → `command` の出力が `expected` とずれて赤くなる
 *   - 文書の数値だけを書き換えた → `documentFigure` が行から消えて赤くなる
 *   - 宣言の `expected` だけを書き換えた → コマンドの出力とずれて赤くなる
 *   - 宣言の `documentFigure` だけを書き換えた → 行の字面とずれて赤くなる
 *
 * **「宣言をどう書き換えても赤くなる」ではない。** `command` を別の綴りへ差し替えて
 * 同じ出力を作る経路のうち、**リポジトリの外でも同じ値を出す形**はタスク 115.271 が塞いだ
 * （{@link hollowCommandFailures}）。**リポジトリを読みながら値は定数、という形は今も通る**
 * （下の「見ないこと」の空洞化の残余。実測済み）。
 *
 * ## 文書が古いことを宣言できる（タスク 115.228 の exact 判定）
 *
 * 文書側が現に古い値を載せている箇所は、`documentFigure` を `expected` と別に書き、
 * `divergence` へ理由を添えて**宣言**する。宣言は片道ではない。
 *
 *   - `documentFigure` が `expected` と等しいのに `divergence` があれば失敗（宣言が defect より長生きしている）
 *   - `documentFigure` が `expected` と異なるのに `divergence` が無ければ失敗
 *   - `kind: 'stale'` の件数は {@link DECLARED_STALE_DOCUMENT_FIGURES} と**完全に一致**しなければ失敗。
 *     新たな陳腐化も、解消済みの宣言の置き去りも、どちらも赤くなる
 *
 * **この宣言には穴がある。** 上限を先回りで緩める経路（`divergence` を足して定数を増やす）は
 * 塞げていない。タスク 115.228 が `FEATURE_POLICIES` について書き残したのと同じ限界であり、
 * ここでも解いていない。歯止めは件数が要約行へ毎回印字されることと、定数の変更が差分に現れることだけである。
 *
 * ## 母集団が空なら失敗する（AI運用7原則 第3原則）
 *
 * 宣言が 0 件のときは「合格」ではなく前提の崩壊として赤くする。加えて {@link MINIMUM_ENTRIES} を
 * 下回っても赤くする。**構造から導ける下限を本検査の設計では見つけられなかった**——タスク 115.222 が
 * 陽性対照へ課したような「本体の語彙を全て名指ししていること」に相当する構造が、文書中の数値の側に
 * 見当たらない（見つからなかったのであって、存在しないことを示したのではない）。
 * そこで件数の下限をコードへ書く。タスク 115.222 が名指した弱点（現況を貼ると正当な削減まで止まる）は
 * ここにも当てはまる。
 *
 * **下限に遊びを持たせない**（タスク 115.271 が 115.262 の作法へ揃えた）。下限を**上回っても**
 * 赤くする。二方向を合わせると宣言の件数は下限と一致するほかなく、増やす向きも減らす向きも
 * 定数の書き換えを伴うため、宣言の件数は差分に必ず現れる。**遊びが 1 件在った時点では
 * 「宣言を減らす変更は定数の書き換えを伴う」は偽であった**（{@link MINIMUM_ENTRIES} の
 * 注釈に実測がある）。
 *
 * ## コマンドを走らせることについて
 *
 * 本検査は宣言に書かれたシェルのコマンドを `bash -c` で実行する。**これは新しい権限ではない。**
 * 宣言を書き換えられる者は `package.json` の `scripts` も検査本体も書き換えられる。
 * それでも、宣言が黙って実行系になることを避けるため、コマンドを次の形に縛る。
 *
 *   - {@link splitCommandSegments} が引用を見ながら区切り（`|` `&` `;` 改行 `(` `)` `$(` `<(` `` ` ``）で
 *     コマンドを割る
 *   - 各区切りの先頭語が {@link READ_ONLY_COMMANDS} に無ければ失敗
 *
 * **これは権限の境界ではない。** 7 形を {@link splitCommandSegments} と {@link leadingWord} へ
 * 直接かけて数えたところ、`find . -name x -exec rm {} ;`・`git rm --cached a.md`・
 * `git checkout .`・`npx tsx scripts/whatever.ts`・`node -e "...writeFileSync..."`・
 * `grep -c 'rm -rf /' a.md`（引用の内側は実行されないので副作用も無い）の 6 形が通り、
 * 二重引用の内側の置換 `grep -c "$(rm -f /tmp/x)" a.md` の 1 形だけが `rm` として落ちた
 * （2026-09-01 に実測）。**リダイレクトも止まらない**——`grep -c x a.md > /tmp/f` / `>>` / `2>`
 * はいずれも先頭語が `grep` であるため通る（三形とも同じ経路で確認した。同日に実測）。
 * 止まるのは「宣言した綴り以外の先頭語」だけであり、
 * 狙いは逸脱をレビューに見えるようにすることである。
 *
 * ## 宣言に入れなかった値（実測に基づく除外）
 *
 *   - **実ディスクを権威にした非実在パスの件数**: 値が作業ツリーの状態に依存する。
 *     `.kiro/specs/site-survey/design.md` 自身が変異の実測を載せている（`mkdir -p backend/coverage`
 *     を当てると出力が 16 から 15 へ落ち、`rmdir` で戻ると 16 へ復する）。この実測から、
 *     押下前の関門に載せれば被覆計測の直後に赤くなる形だと判断して宣言から外した
 *     （**関門へ載せて赤くなることを確かめてはいない**。同書の実測からの推論である）。
 *   - **`strokeWidth` の同形の残存確認**: 封じているのは「行に載る字面が数値でないこと」ではない。
 *     `countFigureOnLine` は数値でない字面も逐語で数えるため、`documentRendering` に
 *     `出力は**空**である` を採れば当該行にちょうど 1 箇所で束縛でき、錨と字面の判定は通る。
 *     実際に束縛して走らせたところ、残る失敗は (a)「expected が空です」、
 *     (b)「documentFigure `空` が expected `` と異なるのに divergence の宣言がありません」、
 *     (c)「コマンドが終了コード 1 で失敗しました」の 3 件であり、錨・字面についての失敗は
 *     0 件であった（2026-09-01 に実測）。封じ込め要因は
 *     {@link shapeFailures} の `isNonEmptyString(entry.expected)` である——この条件だけを
 *     外す変異を当てると (a) が消えて残りは 2 件になった（同日に実測）。
 *     `expected` を `空` に改め終了コードも 0 に均した版では
 *     「引く値が現況と食い違います: expected=\`空\` actual=\`\`」の 1 件になる（同日に実測）。
 *     つまり文書の「空」は出力そのものではなく出力の言い換えであり、
 *     `expected` に採れる値が無い。よって宣言から外した。
 *   - **`N ファイル` / `N 箇所` / `N 行` / `N%` の形**: `design.md` の第1層が自ら
 *     「網に掛からない」と宣言している綴りである。本検査もそこへは手を伸ばしていない。
 *     **ここに件数を書かない。** `check:cf-evidence` の走査母集団は `scripts/` を含むため、
 *     本検査のような `.ts` を足す変更のたびに動く。数字を書けばこの行自身が
 *     「引く件数が古くなる」側へ回る（本検査が塞ごうとしている形そのもの）。
 *     測り直す出口だけを置く: 文書側は
 *     `grep -n '走査は本番コード' .kiro/specs/site-survey/design.md`、
 *     検査側は `npm run check:cf-evidence` の要約行。両者は基準が異なる
 *     （前者は本番コード、後者は走査対象の全体）。
 *
 * ## 壊れた宣言項目でも列挙を最後まで走らせる（タスク 115.272）
 *
 * {@link loadManifest} は `entries` の要素を検査せずそのまま積むため、`null`・文字列・数値・
 * 配列や、欄の型が違う項目がそのまま判定へ流れ込む。**是正前はこれが捕捉されない例外になり、
 * 列挙がそこで止まっていた。** 安全側（終了コード 1）には倒れるが、出るのはスタックトレース
 * だけで、**同じ関数が算出済みの指摘も、後ろに並んだ宣言の判定も報告へ届かなかった。**
 * 11 形を `--manifest` で与えて実測したところ、**9 形**がスタックトレースを出し、その 9 形では
 * 後ろに置いた宣言の指摘が一件も報告へ届かなかった（残る 2 形——`anchor` が数値・`divergence` が
 * 文字列——は例外にならず、後ろの宣言の指摘も届いていた。コミット `97948d3c`、2026-09-04 に実測）。
 * 現在は同じ 11 形すべてで、スタックトレースは 0 行・後ろの宣言の指摘は 11 形とも届き、
 * 終了コードは 1 のままである（同日、同じ 11 形で実測）。
 *
 * どこまでが機械の保証かを三層に分ける（開発規律の作法）。
 *
 *   - **機械保証**: {@link isEntryObject} が欄を持たない項目を、{@link fieldText} と
 *     {@link divergenceOf} が型の違う欄を、それぞれ例外ではなく指摘へ変える。自己検査の
 *     「壊れた欄の総当たり」が 8 欄 + 項目そのもの の 9 通り × 11 値 = 99 通りを毎回走らせ、
 *     **例外 0 件**かつ**無言で通る形 0 件**を要求する。**99 という数そのものも機械が保つ**——
 *     欄の一覧は自己検査が本ファイルの {@link ManifestEntry} の宣言から導き（手で写した一覧では
 *     ない）、組の数は自己検査の `EXHAUSTIVE_TRIAL_COUNT` に 99 と貼って厳密に突き合わせる。
 *     **実測（2026-09-04、自己検査 41 件）**: 欄を `id` の 1 欄へ痩せさせる（`UNCHECKED_FIELDS`
 *     へ残り 7 欄を足す）と 1 件が落ちて `22 通り` を報告する。値を `null` の 1 値へ痩せさせると
 *     1 件が落ちて `9 通り` を報告する。{@link ManifestEntry} から `documentRendering` の宣言を
 *     削ると 1 件が落ちて `88 通り` を報告する。値を `null` 11 個へ差し替えて幅だけ保つ痩せ方も
 *     1 件が落ちる（見本の重複を別に咎めるため）。**手で写した一覧だった是正前は、欄を `id` の
 *     1 欄へ痩せさせても 41/41 で緑のままだった**（いずれも同日に実測）
 *   - **最後の網**: {@link judge} が一件ごとの判定を `try` で囲み、例外を指摘へ変えて
 *     **次の項目へ進む**。握り潰しではない——指摘が積まれるので終了コードは 1 のままである。
 *     自己検査は欄の読み出し自体が例外を送出する項目でこの網が働くことを固定する
 *   - **残余（保証しない範囲）**: 母集団の集計（{@link duplicatedIds} /
 *     {@link countEntriesForFile} / {@link countStaleDivergences}）は一件ごとの判定の
 *     **外側**で走るため、最後の網の中に入っていない。三つとも欄を安全に読むので
 *     `JSON.parse` が作れる値では例外にならないが、欄の読み出し自体が例外を送出する項目
 *     （getter。JSON からは作れず、{@link judge} を直に呼ぶ経路でしか作れない）を渡せば
 *     そこで止まる
 *
 * **どの層が何を支えているかは変異で確かめた。** 一つずつ当てて自己検査 41 件を走らせ、
 * 控えからの書き戻しで復元した（いずれもコミット `97948d3c` の作業ツリー、2026-09-04 に実測）。
 *
 *   - {@link judge} の `try` を外す → 41 件中 1 件（最後の網の対照）が落ちる
 *   - {@link pushEntryFindings} の門番（`isEntryObject` の枝）を外す → 41 件中 **2 件**が落ちる。
 *     落ちるのは「壊れた欄の総当たり: 列挙は一度も中断せず、いずれの形も無言では通らない」と
 *     「壊れた宣言項目でもスタックトレースを出さず他の項目の指摘を報告する」の二つで、
 *     いずれも `null` の項目が {@link shapeFailures} で
 *     `TypeError: Cannot read properties of null (reading 'id')` になり最後の網へ落ちるためである。
 *     壊れた項目は最後の網が受け止めるため列挙は止まらないが、指摘が
 *     「判定が例外で中断しました」の一行へ縮み、**どの欄が壊れているかを失う**
 *   - {@link countStaleDivergences} を `divergenceOf` から `entry.divergence` の直読みへ戻す →
 *     41 件中 4 件が落ちる（`null` の項目と `divergence: null` が母集団の集計で例外になる）
 *   - {@link documentRenderingOf} の {@link fieldText} を外す → 41 件中 2 件が落ちる
 *     （「壊れた欄の総当たり」と「集計と検出の本体に絞り込みの経路が無い」）。総当たり 99 通りの
 *     うち **8 通り**——`documentRendering` が `0` / `1.5` / `-1.5` / `true` / `false` / `[]` /
 *     `{}` / `{"a":1}`——が最後の網へ落ちる（同変異のまま落ちた組の名前を印字して数えた）
 *   - **{@link documentFigureOf} の {@link fieldText} だけは挙動を支えていない**——外しても
 *     落ちるのは自己検査の字面の規則 1 件だけで（41 件中 1 件）、総当たりは緑のままである。
 *     戻り値の型の宣言（`string`）を実行時にも真に保つために置いている
 *
 * ## 見ないこと（限界）
 *
 *   - **壊れた宣言項目の残余は上の節に挙げる。** 一件ごとの判定は例外で止まらないが、
 *     母集団の集計は最後の網の外に在る
 *   - **宣言に無い数値は見ない。** 本検査は網羅を主張しない。`design.md` の数値のうち
 *     どれを宣言するかは人の判断であり、宣言しなければ黙って外れる
 *   - **`anchor` の行に `documentRendering` がちょうど 1 箇所在ることしか見ない。** その 1 箇所が
 *     本当にその数値の記述であるかは見ない。多義であることは検出するが、意味は見ない
 *   - **`anchor` と `command` の意味的な対応は見ない（空洞化の残余）。** タスク 115.271 が
 *     部分的に塞いだ。**塞いだ線**は「値が作業ディレクトリに依存すること」である
 *     （{@link hollowCommandFailures}）——リポジトリの外で走らせても同じ値を出す `command` は
 *     現況を測っていないとみなして落とす。**塞いでいない線**は「値が錨の行の主張から
 *     導かれること」であり、これは機械で決めきれないと判断した。判断は実測に基づく。
 *
 *     - 是正前: 30 件すべてを「錨はそのまま・`command` は `printf '<expected>'`」へ置換した
 *       仮マニフェストを `--manifest` で与えると、要約行は「宣言 30 件 / 文書側が古いと
 *       宣言した箇所 0 件」を出し、**終了コード 0 の緑**になった（コミット `24acf91f`、
 *       2026-09-04 に実測。115.232 の提出時点の 29 件 / 4 件から件数だけが動いている）
 *     - 是正後: 同じ写しに対し **30 件すべてが本判定で赤くなる**（同日・同じ写しで実測）。
 *       実マニフェスト 30 件はいずれも誤って告発されない（同日に 30 件を両方の起点で走らせ、
 *       同値になったものは 0 件）
 *     - **残余（現に通る形）**: `test -f <パス> && printf '13'` と
 *       `head -1 <パス> | wc -l | sed 's/1/13/'` は、リポジトリを読むため作業ディレクトリに
 *       依存し、本判定を通る（同日に実測）。また `expected` が `0` の宣言は、錨と無関係な
 *       ファイルに対する当たらない `grep -c` へ差し替えても `0` を出し続ける——実マニフェストの
 *       `multer-file-filter` で差し替えを当てたところ **EXIT=0 の緑**であった（同日に実測。
 *       {@link runOutsideRepository} に差し替えた綴りを載せている）。この二形は自己検査の
 *       「限界: リポジトリに触れるが値は定数、という command は現に通る」が固定しており、
 *       **将来この経路が塞がれたら当該の対照が赤くなり、本注釈の更新が強制される**
 *       （タスク 115.268 の作法）
 *     - **より強い判定を採らなかった根拠（いずれも実データで誤検出を数えた。同日に実測）**:
 *       (a)「`expected` の字面が `command` に現れたら失格」は 30 件中 **4 件**を誤って落とす
 *       （`component-summary-sections` は `#{3,4}` に、`new-survey-image-service-sites` /
 *       `image-order-display-order-writes` / `image-list-fixed-order-reads` は
 *       `|| test $? -eq 1` の `1` に当たる）。(b)「版管理の一覧どおりの木を作り中身だけ空にした
 *       写しで走らせて同値なら失格」は 30 件中 **7 件**を誤って落とす（`expected` が `0` の
 *       6 件と、ファイルの員数を数える `design-documents-scanned`）。**「命令が読んだ内容が
 *       値を決めていること」を求める判定は、正当な宣言の 4〜7 件を巻き添えにする**
 *
 *     {@link MINIMUM_ENTRIES} と {@link DECLARED_STALE_DOCUMENT_FIGURES} が件数しか見ない
 *     ことは変わらない。残余に対する歯止めは、宣言の差分がレビューに現れることだけである
 *   - **歴史記録と現況の区別は見ない。** 同じ行が当時の値と現況の値の両方を載せる形は、
 *     現況の側を `documentFigure` に採れば通る。当時の値が正しいかは見ない
 *   - **どのスペックの押下かは見ない。** 本検査は押下前の関門に載っており、宣言が指す文書は
 *     {@link GOVERNED_DOCUMENTS}（現在は現場調査スペックの設計文書）に限られる。
 *     別スペックだけを触っている者の押下も、現場調査の設計文書が引く値が現況とずれていれば
 *     止まる。押下者の変更範囲と関門の対象範囲は結び付いていない
 *   - **`git ls-files` を使う宣言は指標に依存する。** `nonexistent-paths-by-git-index` の
 *     再現コマンドは版管理の一覧を実在の権威に採るため、作業ツリーではなく**指標**を見る。
 *     実測: `scripts/__index-probe.tmp` を作ると `ls` は 1 件を返すのに
 *     `git ls-files | grep -c '__index-probe.tmp'` は 0 件のままで、`git status` は
 *     `?? scripts/__index-probe.tmp` と出た（2026-09-01 に実測。確認後に削除した）。
 *     すなわち作業ツリーに在っても指標に無いファイルは、この宣言にとって「実在しない」
 *
 * `MINIMUM_ENTRIES` / `DECLARED_STALE_DOCUMENT_FIGURES` を含め、上の限界はいずれも
 * 「本検査だけで宣言の質を保証しない」ことを述べている。質の担保は差分のレビューにある。
 *
 * ## 本注釈が引く数字について
 *
 * 変異と実測は 2026-09-01 に行い、**提出の直前（2026-09-02）に一件ずつ測り直した**
 * （タスク 115.189 の教訓「記録が引く件数は提出時に測り直す」）。宣言 29 件 / 記法ごと 22 件 /
 * 素の字面 7 件 / 文書側が古い 4 件 / `design.md` を読む検査 8 件 / 綴りの 9 形（通 4・落 5）と
 * 7 形（通 6・落 1）は、いずれも日をまたいでも同じ値であった（**この六つは 115.232 の提出時点の記録である**。
 * 宣言と記法ごとの件数は後続のタスク 115.233 が一件足して 30 件 / 23 件になった。2026-09-02 に実測）。
 * **`check:cf-evidence` の走査件数のように、本検査自身の追加で動く値はここに書かない**
 * （上の「宣言に入れなかった値」の三つ目を見よ）。
 *
 * **タスク 115.271 の提出時点の再実測**（コミット `24acf91f` の作業ツリー、2026-09-04）:
 * 宣言 30 件 / 記法ごと 23 件 / 素の字面 7 件 / 文書側が古い 0 件 /
 * `grep -ln 'design\.md\|design-document' scripts/check-*.ts | grep -v selftest` が挙げる
 * 検査 10 件（本検査を除くと 9 件）。**`design.md` を読む検査の数は 115.232 の 9 件 / 8 件から
 * 動いている**——後続のタスクが新設した検査が同じ網に掛かるためであり、
 * 「文書側の数値と再現コマンドの出力を突き合わせるものは本検査だけ」という主張の
 * 再走査は本タスクの境界（宣言の中身）の外にあるので行っていない。
 * 上段の 8 件は 115.232 の提出時点の記録としてそのまま残す。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-measurement-freshness.ts [--verbose] [--json] [--manifest=<path>]
 *   npm run check:design-measurement-freshness
 *   npm run check:design-measurement-freshness:verbose   宣言ごとの実測値を印字する（測り直しの出口）
 *   npm run check:design-measurement-freshness:json
 *   npm run check:design-measurement-freshness:selftest
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** 宣言の既定の位置（リポジトリルート相対） */
export const DEFAULT_MANIFEST_PATH = 'scripts/design-measurements.json';

/**
 * 宣言が必ず一件以上覆っていなければならない文書
 *
 * 文書がここに挙がっていて宣言が一件も無ければ失敗する。文書を増やすときはここへ足す。
 *
 * **タスク 115.276 が steering 文書を一件加えた。** 加えた理由は「steering の実測値に鮮度の
 * 関門が無い」ことの実測である——115.235 が是正した免除件数を旧値へ戻す変異を当てても、
 * `check:steering-refs` / `check:steering-idents` / `check:steering-test-tree` /
 * `check:steering-dir-counts` / 本検査 / `check:design-path-refs` の**六つがすべて EXIT=0**
 * のままであった（コミット `079604bb`、2026-09-05 にリポジトリルートで実測）。
 * 115.275 が新設した `check:steering-dir-counts` は `structure.md` と `product.md` を
 * **行単位で**見るため、数値と実測日が別の行に分かれる `development-discipline.md` の散文には
 * 届かない。本検査は錨の行を名指す形なので、行の折り返しに依存せず同書を覆える。
 *
 * 同書の宣言は**いずれも版で固定する**（115.273 の作法）。理由と代償の実測は
 * 自己検査の `PINNED_STEERING_RECORD_DECLARATIONS` / `LIVE_STEERING_RECORD_DECLARATIONS`
 * に置いた。
 */
export const GOVERNED_DOCUMENTS: readonly string[] = [
  '.kiro/specs/site-survey/design.md',
  '.kiro/steering/development-discipline.md',
];

/**
 * 宣言の件数の下限。**遊びを持たせない**（タスク 115.271 が 115.262 の作法へ揃えた）
 *
 * **構造から導ける下限を見つけられなかったのでコードへ書く**
 * （冒頭の「母集団が空なら失敗する」を見よ。AI運用7原則 第3原則。
 * タスク 115.222 の作法と、そこで名指しされた弱点の両方が当てはまる）。
 *
 * 115.232 が置いた当初の値は 29 件で、宣言は 30 件であった。**この 1 件の遊びは、
 * 宣言を一件無言で削れることを意味していた**——実マニフェストから
 * `self-reference-undated-residue` の一件を落とした写しを `--manifest` で与えると、
 * 要約は「宣言 29 件 / 文書側が古いと宣言した箇所 0 件」を出して EXIT=0 の緑になった
 * （コミット `24acf91f` の作業ツリーで 2026-09-04 に実測）。冒頭の注釈が挙げていた歯止め
 * 「宣言を減らす変更は定数の書き換えを伴い、差分としてレビューに現れる」は、
 * **最初の一件については偽であった**。
 *
 * タスク 115.262 が `scripts/check-traceability-coverage.ts` の上限へ課したのと同じ形
 * （`judgeCeiling`。上限が実測を上回っていても失敗させ、二方向を合わせて宣言を実測と
 * 一致させる）を、ここでは下限へ課す。名前は `MINIMUM_ENTRIES` のままにする——
 * 115.262 も `maxMissing` の名を保ったまま遊びを禁じており、作法を揃えるとはそういう意味である。
 * 増やす向きも減らす向きも定数の書き換えを伴うため、**宣言の件数は差分に必ず現れる**。
 *
 * **タスク 115.273 が 30 件から 50 件へ上げた。** 増分の 20 件は
 * `#### 他スペックの設計文書の走査（タスク 115.234）` が印字する二十値であり、
 * いずれも読む先の版を名指す（`git grep <版> -- ...`）。版で固定した理由は
 * 自己検査の `PINNED_FOREIGN_SCAN_DECLARATIONS` に実測とともに書いた。
 *
 * **タスク 115.276 が 50 件から 54 件へ上げた。** 増分の 4 件は
 * `.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」節が引く
 * 四値（`123 件` が 2 箇所・`62 文`・`18 ファイル`）であり、いずれも記録が書き込まれた版
 * `114e3179` を名指す。版で固定した理由と、作業ツリー読みを採らなかった代償の実測は
 * 自己検査の `PINNED_STEERING_RECORD_DECLARATIONS` / `LIVE_STEERING_RECORD_DECLARATIONS`
 * に書いた。
 *
 * **タスク 115.278 が 54 件から 66 件へ上げた。** 増分の 12 件は
 * `#### 自己申告をそのまま写さなかった 18 件` の区分(2) の追記と、その追記が名指す
 * backend 側の残余が引く値である。うち 5 件は読む先の版を名指し
 * （`git grep <版> -- ...` が 3 件、`git show <版>:<パス>` が 2 件）、
 * 残る 7 件は作業ツリー・`tasks.md`・検査本体・直近のコミットメッセージを読む。
 * **値が `0` の宣言は、コマンドの形によって載せられたり載せられなかったりする。**
 * パイプの終端が `grep -c` になる形は、リポジトリの外でも同じ `0` を出すため
 * {@link runOutsideRepository} の対照が区別できず、正当な宣言が「空洞化の経路」として
 * 告発される——実マニフェストの写しへ「是正後の版で `0` を返す」二件を足して `--manifest` で
 * 与えると、その二件だけが本判定で赤くなった（2026-09-05 に実測）。一方、ファイルを引数で渡す
 * 単一の `grep -c` は、外ではファイルが無くて終了コード 2 になるため値が `0` でも通る
 * （`component-reqs-gate-ignores-requirements-doc` がその形である）。
 * そのため「是正後の版で `0` を返す」側は宣言に載せず、是正前の版の `10` と、
 * 番号だけを網に掛けた `12` / `2` の対で同じ変化を固定した。
 *
 * **タスク 115.280 が 78 件から 82 件へ上げた。** 増分の 4 件は台帳の #7（他機能スペックの
 * 除外一覧の道具名）の追随であり、うち 3 件は読む先の版を名指す（`git grep <版> -- ...`）。
 * **同タスクは既存の `jest-alternative-verification-exclusions` の読む先も作業ツリーから
 * 版 `b999b2d` へ移した。** 作業ツリー読みのままでは、この宣言が数える総数が
 * **他スペックの是正のたびに減る**ため、8 つの機能スペックの是正を本検査が止めていた——
 * `e2e/requirement-exclusions.json` の `project-management/REQ-18.1` の道具名を
 * `Jest / Mock Service Worker` から `Vitest / Mock Service Worker` へ改める変異を当てると、
 * 移す前の版では「expected=\`64 0\` actual=\`63 0\`」の 1 件を報告して終了コード 1 になり、
 * 移した後の版では同じ変異で指摘 0 件・終了コード 0 のままである
 * （コミット `18516005` の作業ツリー、2026-09-05 に実測。変異は控えからの書き戻しで復元した）。
 * 版で固定した記録の側と、8 スペックの進捗で動かない現況の側（現場調査スペックの所管の
 * 件数 `0`）を別の宣言に分け、**動く総数は文書にも宣言にも持たない**形にした。
 *
 * **タスク 115.283 が 83 件から 90 件へ上げた。** 増分の 7 件は
 * `#### バックエンド資材の走査（タスク 115.283。手順1 が「別途の走査が要る」と述べた分）` が
 * 置いた値である。内訳は、追跡表の 5 行へ加えた担い手の名前がその行に在ることを固定する 5 件
 * （いずれもパイプの終端が `grep -c` で値は `1`。`|| test $? -eq 1` は付けない——付けると外側の
 * 終了コードが 0 へ均され、名前が落ちて内側の値も `0` になった瞬間に内外が一致して
 * {@link runOutsideRepository} の対照が偽の「空洞化の経路」を報告するためである。
 * 115.282 が `traceability-10-9-image-order-service` へ書いた理由と同じである）と、
 * 走査の母集団を固定する 2 件（`106` と `26`。いずれも終端が `wc -l` であり、
 * リポジトリの外では `0` を返すため対照が区別できる）である。
 *
 * **タスク 115.285 が 90 件から 91 件へ上げた。** 増分の 1 件は
 * `#### 機械の関門（タスク 115.228 が新設）` の「見ないこと」の項が引く追跡表の要件4.10 の行を
 * 固定する `traceability-4-10-order-and-list-service` である（パイプの終端が `grep -c` で値は
 * `1`。`|| test $? -eq 1` を付けない理由は上の 5 件と同じ）。同項の例示はタスク 115.239 の消化で
 * 指し先の状態が消えたため過去の事実として書き分けられており、**過去形の記録は指し先が元の姿へ
 * 復した場合に黙って現況とずれる**——そのずれをこの宣言が受け持つ。
 *
 * **タスク 115.292 が 91 件から 93 件へ上げた。** 増分の 2 件は
 * `### 受入基準が名指す逐語の実在に関門を置くという判断（タスク 115.292）` が引く台帳の二値
 * （裁定の全件 `27` と、支えが無いと裁定した `4`）であり、いずれも
 * `scripts/criterion-literal-adjudication.json` を `node -e` で読む。**作業ツリーを読む形で
 * 据えたのは、この二値が過去についての記録ではなく現況の主張だからである**——台帳が増減すれば
 * 文書側も同時に測り直すべきであり、版で固定すると測り直しの契機が消える。台帳の件数そのものは
 * `scripts/check-criterion-literal-presence.ts` の `LEDGER_ENTRY_LIMIT` が完全一致で持つため、
 * **この宣言は「文書が引く値」と「台帳の実体」の一致だけを受け持つ**（二つの関門は別の対象を
 * 見ており、片方だけでは文書側の陳腐化を捕らえられない）。
 *
 * **同じタスクのレビューを受けて 93 件から 95 件へ上げた。** 増分の 2 件は同じ節が開示する
 * **註釈の抜け道の実額**（本番の非註釈行に一度も無い `61` 組と、そのうち本番の註釈が支えている
 * `43` 組）であり、いずれも `npm run check:criterion-literals:survey:tsv` の出力を読む。
 * **この二値は関門の判定に影響しない**——走査の出口の値だからである。宣言へ載せたのは、
 * **開示の側が陳腐化しても誰も気付かない**状態を避けるためであり、走査の出口が壊れた場合も
 * 同検査が赤くなる。
 *
 * **タスク 115.293 が 95 件から 100 件へ上げた。** 増分の 5 件は
 * `### 免除の側にも集合を持たせ、母数は関門にしないという判断（タスク 115.293）` が
 * `scripts/design-path-exemption-baseline.json` から引く五値——免除の延べ `123`、
 * 免除の distinct `30`、両者の差 `93`、母数の履歴の起点 `574`、基準に記録された母数 `609`——であり、
 * いずれも同ファイルを `node -e` で読む。**作業ツリーを読む形で据えた**——五値はいずれも
 * 過去についての記録ではなく現況の主張であり、基準が更新されれば文書側も同時に測り直すべきだからである。
 * 免除の延べと distinct は `npm run check:design-path-refs` がラチェットで固定するが、
 * **母数の二値はどの関門も合否に用いない**（同スクリプトの 115.293 の節を見よ）。
 * すなわち母数の二値については、**この宣言だけが記録の陳腐化を捕らえる**。
 *
 * **タスク 115.296 が 105 件から 107 件へ上げた。** 増分の 2 件は
 * `### 走査の件数を相異なる実体にし、循環での無限降下を訪問済み集合で閉じるという判断（タスク 115.296）`
 * が引く二値——読み手コーパスの走査根の直下のシンボリックリンク `2` 本と、同型の走査器を探した
 * 母集団 `24` 件——であり、いずれも作業ツリーを読む（`find` と `grep -l` の終端が `wc -l`）。
 * **同節が引く「走査した読み手候補 2018 ファイル」は宣言に載せていない**——ファイルを一つ
 * 足すたびに動くため、載せると押下のたびに赤くなるからである（同節の「残る穴」(i) に開示した）。
 * **`backend/src` / `frontend/src` の配下のリンクが 0 本であることも載せていない**——
 * パイプの終端が `wc -l` で値が `0` の宣言は、リポジトリの外でも同じ `0` を出すため
 * {@link runOutsideRepository} の対照が区別できず、正当な宣言が「空洞化の経路」として
 * 告発される（上のタスク 115.279 の節が述べる形と同じである）。
 *
 * **タスク 115.299 が 114 件から 116 件へ上げた。** 増分の 2 件は
 * `### 散文どうしが述べる要件範囲の食い違いを条文で裁き、この型を機械で見ないという判断（タスク 115.299）`
 * の走査 (1)(2) が引く二値（取り消し線で突き合わせの母集団から外れる表の行 `2`、設計文書の散文が
 * 担い手と要件番号を同一行で述べる箇所 `19`）であり、いずれも作業ツリーを読む。**版で固定しないのは
 * この二値が過去についての記録ではなく現況の主張だからである**——どちらも増えれば同型の食い違いを
 * 測り直す契機であり、版で固定すると測り直しの契機が消える。前者は
 * `scripts/check-design-component-requirements.ts` の `FEATURE_POLICIES` が受け口を持たないため、
 * **この宣言だけが記録の陳腐化を捕らえる**。
 *
 * **タスク 115.300 が 116 件から 118 件へ上げた。** 増分の 2 件は
 * `### 裁定記録 §4 の指し先を表題の逐語へ移し、指し先の実在に関門を置くという判断（タスク 115.300）`
 * が引く二値（裁定記録 §4 の指し先の数 `162`、同一ファイル内で表題が重複する指し先の数 `0`）で
 * あり、いずれも作業ツリーを読む。**版で固定しないのは現況の主張だからである。** 前者は
 * `scripts/check-adjudication-pointers.ts` の `DECLARED_POINTER_COUNT` が完全一致で課しており、
 * **片方だけを書き換えるとどちらかの関門が赤くなる**。後者は同関門が判定に使わない値であり、
 * **増えたことを知らせる受け口は本宣言だけである**（表題だけでは区間を一つに絞れない指し先が
 * 生じたことを示す）。
 */
export const MINIMUM_ENTRIES = 118;

/**
 * 文書側が現に古い値を載せていると宣言してよい件数（完全一致）
 *
 * 2026-09-01 の時点では 4 件であった——`design.md` が自分自身を数える四値である。
 * **タスク 115.270 がこの四件を解消したので 0 件へ締めた**（コミット `dc76e1d9` の版に対し
 * 2026-09-04 に実測。文書側の四値を現況の 92 / 267 / 98 / 199 へ改め、四件の `divergence` を外した）。
 * 増えても減っても失敗する（タスク 115.228 の exact 判定）。
 */
export const DECLARED_STALE_DOCUMENT_FIGURES = 0;

/**
 * コマンドの各区切りの先頭語として許す綴り
 *
 * 権限の境界ではない（冒頭の注釈を見よ）。逸脱をレビューに見えるようにするための宣言である。
 */
export const READ_ONLY_COMMANDS: readonly string[] = [
  'awk',
  'basename',
  'cat',
  'cut',
  'dirname',
  'find',
  'git',
  'grep',
  'head',
  'ls',
  'node',
  'npm',
  'npx',
  'printf',
  'sed',
  'sort',
  'tail',
  'test',
  'tr',
  'true',
  'uniq',
  'wc',
];

/** コマンド一本あたりの実行時間の上限 */
export const COMMAND_TIMEOUT_MS = 60_000;

/** 宣言された食い違いの種別 */
export type DivergenceKind = 'stale';

export interface Divergence {
  readonly kind: DivergenceKind;
  readonly reason: string;
}

/** 宣言の一件 */
export interface ManifestEntry {
  readonly id: string;
  readonly file: string;
  readonly anchor: string;
  readonly command: string;
  readonly expected: string;
  readonly documentFigure?: string;
  readonly documentRendering?: string;
  readonly divergence?: Divergence;
  readonly note?: string;
}

/** 失敗の一件 */
export interface Finding {
  readonly id: string;
  readonly file: string;
  readonly anchor: string;
  readonly message: string;
}

/** 実測の結果（--verbose / --json が読む） */
export interface Measurement {
  readonly id: string;
  readonly file: string;
  readonly expected: string;
  readonly actual: string;
  readonly documentFigure: string;
  readonly stale: boolean;
}

// ============================================================================
// コマンドの綴りを見る
// ============================================================================

/** 入れ子の置換を抜けたときに戻る場所 */
interface SegmentFrame {
  readonly text: string;
  readonly double: boolean;
  readonly closer: string;
}

/**
 * 引用を見ながらコマンドを区切りで割る
 *
 * 単引用の内側では何も区切りにしない。二重引用の内側でも `$(` と `` ` `` は
 * シェルが展開するため置換の開始として扱う。置換を閉じたら**外側の区切りへ戻る**——
 * `)` の枝から復帰の 2 行（`current = frame?.text`・`inDouble = frame?.double`）を外し、
 * 代わりに空の区切りを始める変異を当てて `nonexistent-paths-by-git-index` の
 * `command` を割ったところ、先頭語の並びは
 * `["printf","printf","grep","printf","tr","sed","sort","git","awk","wc"]`（許容外 0 件）から
 * `["printf","/[A-Za-z0-9_.@-]+","printf","printf","|"]` へ崩れ、許容外が 2 件
 * （`/[A-Za-z0-9_.@-]+` と `|`）になって実マニフェストが赤くなった（2026-09-01 に実測）。
 * 置換の外側に続く綴りが「先頭語」に見えてしまうためである。
 *
 * **この分割はシェルの構文解析ではない。** 変数展開・ヒアドキュメント・別名・
 * 予約語（`if` / `for`）・環境変数の前置・リダイレクトを**解釈しない**。
 * 「解釈しない」は「素通りさせる」ではない。解釈しない結果これらが先頭語の位置に来れば、
 * 許容集合に無い綴りとして {@link vocabularyFailures} が落とす。9 形を
 * 本関数と {@link leadingWord} へ直接かけて数えたところ、`$CMD a.md`（`$CMD`）・
 * ヒアドキュメント（本文行と終端子）・`alias`・`if ...; then ...; fi`（`if` / `then` / `fi`）・
 * `FOO=1 grep ...`（`FOO=1`）の 5 形が落ち、`grep -c x a.md > /tmp/f` と `>>` と `2>` の
 * 3 形、および引数の位置の展開 `grep -c "$PATTERN" a.md` の 1 形は通った
 * （2026-09-01 に実測）。**リダイレクトと引数中の展開は通る。**
 */
export function splitCommandSegments(command: string): string[] {
  const segments: string[] = [];
  const frames: SegmentFrame[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let index = 0;
  while (index < command.length) {
    const character = command[index] ?? '';
    const next = command[index + 1] ?? '';
    if (inSingle) {
      if (character === "'") inSingle = false;
      else current += character;
      index += 1;
      continue;
    }
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '"') {
      inDouble = !inDouble;
      index += 1;
      continue;
    }
    if (character === "'" && !inDouble) {
      inSingle = true;
      index += 1;
      continue;
    }
    const opensSubstitution =
      (character === '$' && next === '(') ||
      (!inDouble && (character === '<' || character === '>') && next === '(') ||
      (!inDouble && character === '(');
    if (opensSubstitution) {
      frames.push({ text: current, double: inDouble, closer: ')' });
      current = '';
      inDouble = false;
      index += character === '(' ? 1 : 2;
      continue;
    }
    if (character === '`') {
      if (frames.length > 0 && (frames[frames.length - 1]?.closer ?? '') === '`') {
        segments.push(current);
        const frame = frames.pop();
        current = frame?.text ?? '';
        inDouble = frame?.double ?? false;
      } else {
        frames.push({ text: current, double: inDouble, closer: '`' });
        current = '';
        inDouble = false;
      }
      index += 1;
      continue;
    }
    if (
      character === ')' &&
      frames.length > 0 &&
      (frames[frames.length - 1]?.closer ?? '') === ')'
    ) {
      segments.push(current);
      const frame = frames.pop();
      current = frame?.text ?? '';
      inDouble = frame?.double ?? false;
      index += 1;
      continue;
    }
    if (!inDouble && '|&;\n'.includes(character)) {
      segments.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }
  segments.push(current);
  return segments;
}

/** 区切りの先頭語。空白で切った最初の語を返す（無ければ空文字列） */
export function leadingWord(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.length === 0) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

/** コマンドの各区切りの先頭語が宣言した綴りに収まっていること */
function vocabularyFailures(command: string): string[] {
  const failures: string[] = [];
  for (const segment of splitCommandSegments(command)) {
    const word = leadingWord(segment);
    if (word === '') continue;
    if (READ_ONLY_COMMANDS.includes(word)) continue;
    failures.push(
      `コマンドの区切り「${segment.trim()}」の先頭語 \`${word}\` が READ_ONLY_COMMANDS にありません`
    );
  }
  return failures;
}

// ============================================================================
// 宣言の読み込み
// ============================================================================

export interface LoadedManifest {
  readonly entries: ManifestEntry[];
  readonly errors: string[];
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 宣言の項目が欄を持つオブジェクトであること（タスク 115.272）
 *
 * `JSON.parse` は配列の要素に何でも置ける。{@link loadManifest} は要素をそのまま
 * {@link ManifestEntry} として積むため、`null` ・文字列・数値・配列が判定へ流れ込みうる。
 */
function isEntryObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 欄を文字列として読む。文字列でない欄は空として読む（タスク 115.272）
 *
 * **判定を緩めない。** 空として読んだ欄は {@link shapeFailures} の
 * `isNonEmptyString` が漏れなく咎める（`id` / `file` / `anchor` / `command` / `expected` /
 * `documentFigure`）。`documentRendering` は `documentFigure` を含まないことで咎められる。
 * ここでの読み替えは、咎める前に例外で列挙が止まるのを防ぐためだけに在る。
 */
function fieldText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * `divergence` の欄を安全に読む（タスク 115.272）
 *
 * オブジェクトでない `divergence`（`null` や文字列）は「宣言されていない」ものとして扱い、
 * {@link shapeFailures} が別に咎める。項目そのものがオブジェクトでない場合も同様に扱う——
 * {@link countStaleDivergences} は一件ごとの判定の外側から呼ばれるため、
 * ここで守らないと母集団の集計が例外で落ちる。
 */
function divergenceOf(entry: ManifestEntry): Divergence | undefined {
  if (!isEntryObject(entry)) return undefined;
  const value: unknown = entry.divergence;
  return isEntryObject(value) ? (value as Divergence) : undefined;
}

/**
 * 宣言を読み込む
 *
 * 読めない・形が違うときは**空の宣言を返して合格させない**。errors が一件でもあれば
 * 呼び出し側は終了コード 1 を返す。
 */
export function loadManifest(manifestPath: string): LoadedManifest {
  const entries: ManifestEntry[] = [];
  const errors: string[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    errors.push(`宣言 ${manifestPath} を読めません`);
    return { entries, errors };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    errors.push(`宣言 ${manifestPath} が JSON として読めません: ${String(error)}`);
    return { entries, errors };
  }
  const container = parsed as { entries?: unknown };
  if (!Array.isArray(container.entries)) {
    errors.push(`宣言 ${manifestPath} が entries の配列を持ちません`);
    return { entries, errors };
  }
  for (const candidate of container.entries) {
    entries.push(candidate as ManifestEntry);
  }
  return { entries, errors };
}

// ============================================================================
// 一件ごとの判定
// ============================================================================

/** 宣言の形（欄が揃っているか、宣言どうしが矛盾していないか） */
function shapeFailures(entry: ManifestEntry): string[] {
  const failures: string[] = [];
  if (!isNonEmptyString(entry.id)) failures.push('id が空です');
  if (!isNonEmptyString(entry.file)) failures.push('file が空です');
  if (!isNonEmptyString(entry.anchor)) failures.push('anchor が空です');
  if (!isNonEmptyString(entry.command)) failures.push('command が空です');
  if (!isNonEmptyString(entry.expected)) failures.push('expected が空です');
  const figure = documentFigureOf(entry);
  const divergence = divergenceOf(entry);
  if (entry.documentFigure !== undefined && !isNonEmptyString(entry.documentFigure)) {
    failures.push('documentFigure が空です');
  }
  if (entry.documentRendering !== undefined && !isNonEmptyString(entry.documentRendering)) {
    failures.push('documentRendering が空です');
  }
  if (entry.divergence !== undefined && divergence === undefined) {
    failures.push('divergence が欄を持つオブジェクトではありません');
  }
  if (figure !== entry.expected && divergence === undefined) {
    failures.push(
      `documentFigure \`${figure}\` が expected \`${String(entry.expected)}\` と異なるのに divergence の宣言がありません`
    );
  }
  if (figure === entry.expected && divergence !== undefined) {
    failures.push(
      'divergence を宣言していますが documentFigure と expected が一致しています（宣言が対象より長生きしています。divergence を外してください）'
    );
  }
  if (divergence !== undefined && !isNonEmptyString(divergence.reason)) {
    failures.push('divergence の reason が空です');
  }
  const rendering = documentRenderingOf(entry);
  if (!rendering.includes(figure)) {
    failures.push(
      `documentRendering \`${rendering}\` が documentFigure \`${figure}\` を含みません（記法と値が切り離されています）`
    );
  }
  if (entry.documentRendering !== undefined && entry.documentRendering === figure) {
    failures.push(
      'documentRendering が documentFigure と同じです（既定と同じ宣言は外してください）'
    );
  }
  if (divergence !== undefined && divergence.kind !== 'stale') {
    failures.push(`divergence の kind \`${String(divergence.kind)}\` は宣言されていません`);
  }
  return failures;
}

/** `anchor` が一行に当たること、その行が `documentFigure` を載せていること */
function anchorFailures(root: string, entry: ManifestEntry): string[] {
  const failures: string[] = [];
  const absolute = path.resolve(root, fieldText(entry.file));
  let content: string;
  try {
    content = fs.readFileSync(absolute, 'utf8');
  } catch {
    failures.push(`file ${String(entry.file)} を読めません`);
    return failures;
  }
  const matched = anchoredLines(content, fieldText(entry.anchor));
  if (matched.length === 0) {
    failures.push(`anchor が ${entry.file} に見つかりません: ${entry.anchor}`);
    return failures;
  }
  if (matched.length > 1) {
    failures.push(
      `anchor が ${entry.file} の ${matched.length} 行に当たります（一意に定まる断片にしてください）: ${entry.anchor}`
    );
    return failures;
  }
  const figure = documentRenderingOf(entry);
  const occurrences = countFigureOnLine(matched[0] ?? '', figure);
  if (occurrences === 0) {
    failures.push(
      `anchor の行が documentFigure \`${figure}\` を載せていません（文書側が書き換わった疑いがあります）: ${entry.anchor}`
    );
  }
  if (occurrences > 1) {
    failures.push(
      `anchor の行に documentFigure \`${figure}\` が ${occurrences} 箇所あり、どれを指すか定まりません（記法ごと宣言してください。例: \`3\` ではなく \`\\\`3\\\`\`）: ${entry.anchor}`
    );
  }
  return failures;
}

/** 走らせた結果を `expected` と突き合わせる */
function measurementFailures(entry: ManifestEntry, outcome: MeasurementOutcome): string[] {
  const failures: string[] = [];
  if (outcome.failure !== '') {
    failures.push(outcome.failure);
    return failures;
  }
  if (outcome.output !== entry.expected) {
    failures.push(
      `${entry.file} の「${entry.anchor}」が引く値が現況と食い違います: expected=\`${entry.expected}\` actual=\`${outcome.output}\``
    );
  }
  return failures;
}

/**
 * 宣言が現況を測っていること（空洞化の部分的な歯止め。タスク 115.271）
 *
 * 錨・字面・出力の突き合わせは**どれも `command` が現況を読んでいることを求めない**。
 * `command` を `printf '<数字>'` に差し替えて `expected` をその数字に合わせれば、
 * 錨が文書の一意な行を指してさえいれば三つとも通る。ここではその形を落とす——
 * **リポジトリの外（空の一時ディレクトリ）で走らせても同じ値を出す `command` は、
 * 現況を測っていない**とみなす。
 *
 * 実測（コミット `24acf91f` の作業ツリー、2026-09-04）。実マニフェスト 30 件の `command` を
 * 一件ずつリポジトリルートと空の一時ディレクトリの両方で走らせたところ、**両者が同じ値を
 * 出した宣言は 0 件**であった（空側の内訳は「出力が異なる」14 件と「終了コードが 0 でない」
 * 16 件。二度の実行を合わせた所要は 745 ミリ秒）。すなわちこの判定は現況の宣言を一件も
 * 誤って告発しない。同じ 30 件を「錨はそのまま・`command` は `printf '<expected>'`」へ
 * 置換した写しを `--manifest` で与えると、この判定を置く前は EXIT=0 の緑であったのに対し、
 * 置いた後は 30 件すべてが本判定で赤くなる。
 *
 * **塞げていない経路は {@link runOutsideRepository} と冒頭の「見ないこと（限界）」に挙げる。**
 * 判定が見ているのは「値が作業ディレクトリに依存すること」であって、
 * 「値が錨の行の主張から導かれること」ではない。
 */
function hollowCommandFailures(entry: ManifestEntry, inside: MeasurementOutcome): string[] {
  const failures: string[] = [];
  if (inside.failure !== '') return failures;
  const outside = runOutsideRepository(String(entry.command ?? ''));
  if (outside.failure === '' && outside.output === inside.output) {
    failures.push(
      `command がリポジトリの外でも同じ値 \`${outside.output}\` を出します（この宣言は現況を測っていません。空洞化の経路。冒頭の「見ないこと（限界）」を見よ）: ${String(entry.command ?? '')}`
    );
  }
  return failures;
}

/**
 * 一件ぶんの失敗を積む
 *
 * 綴りの検査で落ちたコマンドは**この経路では走らせない**。走らせてから綴りを咎めるのでは、
 * 宣言に紛れ込んだ想定外のコマンドが一度は実行されてしまう。
 *
 * **判定の経路を塞ぐだけでは足りない。** `bash -c` を呼ぶのは {@link runMeasurement} の
 * 1 箇所だが、そこへ至る入口は本関数（判定）・{@link runOutsideRepository}（空洞化の対照）・
 * {@link measureAll}（報告）の三つである。{@link measureAll} は判定に関わらない報告用でありながら
 * `bash -c` を呼ぶ。以前の版は同関数が綴りを参照しておらず、`--verbose` で痕跡ファイルが
 * 1 個できた（2026-09-01 に実測）。両方を塞いだ現在は既定・`--verbose`・`--json --verbose` の
 * いずれでも痕跡は 0 個である（同日に実測）。{@link runOutsideRepository} は本関数が綴りで
 * 落とした後にしか呼ばれない——本関数の `if (vocabulary.length > 0) return;` より後に在る。
 */
function pushEntryFindings(root: string, entry: ManifestEntry, findings: Finding[]): void {
  if (!isEntryObject(entry)) {
    findings.push(makeBrokenEntryFinding(entry));
    return;
  }
  for (const message of shapeFailures(entry)) {
    findings.push(makeFinding(entry, message));
  }
  const vocabulary = vocabularyFailures(String(entry.command ?? ''));
  for (const message of vocabulary) {
    findings.push(makeFinding(entry, message));
  }
  for (const message of anchorFailures(root, entry)) {
    findings.push(makeFinding(entry, message));
  }
  if (vocabulary.length > 0) return;
  const outcome = runMeasurement(root, String(entry.command ?? ''));
  for (const message of measurementFailures(entry, outcome)) {
    findings.push(makeFinding(entry, message));
  }
  for (const message of hollowCommandFailures(entry, outcome)) {
    findings.push(makeFinding(entry, message));
  }
}

// ============================================================================
// 集計（絞り込みの操作を置かない。タスク 115.230 の作法）
// ============================================================================

/** 宣言の全体に掛かる前提を見る */
function pushPopulationFindings(entries: readonly ManifestEntry[], findings: Finding[]): void {
  if (entries.length === 0) {
    findings.push(makeGlobalFinding('宣言が 0 件です（この状態を合格にしてはなりません）'));
  }
  if (entries.length < MINIMUM_ENTRIES) {
    findings.push(
      makeGlobalFinding(
        `宣言が ${entries.length} 件で下限 ${MINIMUM_ENTRIES} 件を下回ります（MINIMUM_ENTRIES を見よ）`
      )
    );
  }
  if (entries.length > MINIMUM_ENTRIES) {
    findings.push(
      makeGlobalFinding(
        `宣言が ${entries.length} 件で、宣言した下限 ${MINIMUM_ENTRIES} 件を上回ります（遊び ${entries.length - MINIMUM_ENTRIES} 件）。下限は宣言の件数ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの無言の削除を吸収します。MINIMUM_ENTRIES を ${entries.length} 件へ上げてください。`
      )
    );
  }
  for (const duplicated of duplicatedIds(entries)) {
    findings.push(makeGlobalFinding(`id \`${duplicated}\` が重複しています`));
  }
  for (const document of GOVERNED_DOCUMENTS) {
    if (countEntriesForFile(entries, document) === 0) {
      findings.push(makeGlobalFinding(`${document} を指す宣言が一件もありません`));
    }
  }
}

/** 宣言された文書側の陳腐が宣言どおりの件数であること */
function pushDivergenceRatchetFindings(
  entries: readonly ManifestEntry[],
  findings: Finding[]
): void {
  const stale = countStaleDivergences(entries);
  if (stale > DECLARED_STALE_DOCUMENT_FIGURES) {
    findings.push(
      makeGlobalFinding(
        `文書側が古いと宣言した箇所が ${stale} 件で、宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を超えています`
      )
    );
  }
  if (stale < DECLARED_STALE_DOCUMENT_FIGURES) {
    findings.push(
      makeGlobalFinding(
        `文書側が古いと宣言した箇所が ${stale} 件で、宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を下回ります（解消したなら DECLARED_STALE_DOCUMENT_FIGURES を締めてください）`
      )
    );
  }
}

/** 全件を判定する */
export function judge(root: string, entries: readonly ManifestEntry[]): Finding[] {
  const findings: Finding[] = [];
  pushPopulationFindings(entries, findings);
  let position = 0;
  for (const entry of entries) {
    position += 1;
    try {
      pushEntryFindings(root, entry, findings);
    } catch (error) {
      findings.push(makeThrownFinding(position, error));
    }
  }
  pushDivergenceRatchetFindings(entries, findings);
  return findings;
}

// ============================================================================
// 小道具
// ============================================================================

/** `documentFigure` の既定は `expected` */
export function documentFigureOf(entry: ManifestEntry): string {
  return fieldText(entry.documentFigure ?? entry.expected);
}

/**
 * 文書の行に現れていなければならない字面
 *
 * 素の数字は同じ行の別の数値にも当たるため、記法ごと（`` `3` `` や `**8件**`）宣言できる。
 * 既定は `documentFigure` そのもので、記法は `documentFigure` を含んでいなければならない
 * （{@link shapeFailures} が課す。含まなくてよいと、値と記法が黙って切り離される）。
 */
export function documentRenderingOf(entry: ManifestEntry): string {
  return fieldText(entry.documentRendering ?? documentFigureOf(entry));
}

/** `anchor` を逐語で含む行を集める */
export function anchoredLines(content: string, anchor: string): string[] {
  const matched: string[] = [];
  for (const line of content.split('\n')) {
    if (line.includes(anchor)) matched.push(line);
  }
  return matched;
}

/**
 * 行が字面を何箇所に載せているか
 *
 * 数字だけの字面は前後を数字で挟まれていないことまで求める（`81` が `1815` に当たらないように）。
 * 数字以外を含む字面（`64 0` や `` `3` `` など）は逐語の部分一致で数える。
 *
 * **1 箇所であることまで求める理由**（呼び出し側 {@link anchorFailures} が判定する）。
 * 素の数字は同じ行の別の数値にも当たる。実例として、`Component Summary` の節数を数える行は
 * 再現コマンドの中に `#{3,4}` を含むため、文書側の出力を `3` から `4` へ書き換えても
 * 素の `3` は `#{3,4}` の側に残る。`countFigureOnLine` が真偽だけを返していた版に
 * この変異を当てると検査は緑のまま素通りし、失敗は 0 件であった
 * （2026-09-01 に実測）。1 箇所であることを課したうえで当該の宣言を `` `3` `` の記法ごとの
 * 字面へ改めると、同じ変異で「載せていません」として赤くなる（同日に実測）。
 */
export function countFigureOnLine(line: string, figure: string): number {
  const pattern = /^\d+$/.test(figure)
    ? new RegExp(`(?<![0-9])${figure}(?![0-9])`, 'g')
    : new RegExp(figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    count += 1;
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return count;
}

/** 重複した id */
export function duplicatedIds(entries: readonly ManifestEntry[]): string[] {
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const entry of entries) {
    if (!isEntryObject(entry)) continue;
    const id = String(entry.id ?? '');
    if (seen.has(id) && !duplicated.includes(id)) duplicated.push(id);
    seen.add(id);
  }
  return duplicated;
}

/** ある文書を指す宣言の数 */
export function countEntriesForFile(entries: readonly ManifestEntry[], file: string): number {
  let count = 0;
  for (const entry of entries) {
    if (isEntryObject(entry) && entry.file === file) count += 1;
  }
  return count;
}

/** `kind: 'stale'` を宣言した件数 */
export function countStaleDivergences(entries: readonly ManifestEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (divergenceOf(entry)?.kind === 'stale') count += 1;
  }
  return count;
}

function makeFinding(entry: ManifestEntry, message: string): Finding {
  return {
    id: String(entry.id ?? '(id なし)'),
    file: String(entry.file ?? '(file なし)'),
    anchor: String(entry.anchor ?? '(anchor なし)'),
    message,
  };
}

function makeGlobalFinding(message: string): Finding {
  return { id: '(宣言全体)', file: '(宣言全体)', anchor: '(宣言全体)', message };
}

/** 欄を持つオブジェクトですらない項目の失敗（タスク 115.272） */
function makeBrokenEntryFinding(value: unknown): Finding {
  return {
    id: '(壊れた項目)',
    file: '(壊れた項目)',
    anchor: '(壊れた項目)',
    message: `宣言の項目が欄を持つオブジェクトではありません（型 ${typeof value}）: ${String(JSON.stringify(value))}`,
  };
}

/**
 * 一件の判定が例外で落ちたことの失敗（最後の網。タスク 115.272）
 *
 * **項目の中身には触れない。** 例外の出どころが欄の読み出しそのものである場合、
 * ここで項目を読むと失敗の報告自身が例外になる。名指しは並び順で行う。
 */
function makeThrownFinding(position: number, error: unknown): Finding {
  return {
    id: `(${position} 件目)`,
    file: `(${position} 件目)`,
    anchor: `(${position} 件目)`,
    message: `宣言の判定が例外で中断しました（項目そのものが壊れている疑いがあります）: ${String(error)}`,
  };
}

export interface MeasurementOutcome {
  readonly output: string;
  readonly failure: string;
}

/**
 * コマンドをリポジトリルートで走らせる
 *
 * 走らせられない・終了コードが 0 でない・時間切れは、いずれも**読み飛ばさず失敗にする**
 * （AI運用7原則 第3原則）。
 */
export function runMeasurement(root: string, command: string): MeasurementOutcome {
  const result = spawnSync('bash', ['-c', command], {
    cwd: root,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return { output: '', failure: `コマンドを起動できません: ${String(result.error)}` };
  }
  if (result.status === null) {
    return { output: '', failure: `コマンドが時間切れまたは信号で終了しました: ${command}` };
  }
  if (result.status !== 0) {
    return {
      output: '',
      failure: `コマンドが終了コード ${result.status} で失敗しました: ${command}${
        result.stderr.trim().length > 0 ? ` / ${result.stderr.trim()}` : ''
      }`,
    };
  }
  return { output: result.stdout.trim(), failure: '' };
}

/**
 * 同じコマンドをリポジトリの外（空の一時ディレクトリ）で走らせる（タスク 115.271）
 *
 * {@link hollowCommandFailures} が使う対照である。宣言のコマンドはすべてリポジトリルート
 * 相対で書かれているため、起点を空のディレクトリへ移せば、現況を読んでいる宣言は
 * 別の値を出すか終了コードが 0 でなくなる。**綴りの検査を通ったコマンドしかここへ来ない**
 * （{@link pushEntryFindings} が先に落とす）。
 *
 * **この対照が見ているのは作業ディレクトリへの依存であって、値の由来ではない。** 塞げない形:
 *
 *   - **リポジトリを読むが値は定数**——`test -f <パス> && printf '13'` は
 *     ルートでは `13`、空のディレクトリでは終了コード 1 になるため通る（2026-09-04 に実測）。
 *     `head -1 <パス> | wc -l | sed 's/1/13/'` も同様に通った（同日に実測）
 *   - **錨と無関係な読み出し**——`expected` が `0` の宣言は、存在するどのファイルに対する
 *     当たらない `grep -c` へ差し替えても `0` を出し続ける。実マニフェストの
 *     `multer-file-filter`（`backend/src/routes/survey-images.routes.ts` の `fileFilter` を
 *     数える宣言）の `command` を
 *     `grep -c '当たらない綴りZZZ' .kiro/specs/site-survey/design.md || test $? -eq 1` へ
 *     差し替えた写しを `--manifest` で与えると、要約は「宣言 30 件 / 文書側が古いと宣言した
 *     箇所 0 件」を出して **EXIT=0 の緑**であった（2026-09-04 に実測）
 *   - **絶対パスで書いた宣言は逆に誤って告発される**——起点を移しても値が動かないためである。
 *     `multer-file-filter` の `command` の対象パスだけを絶対パスへ書き換えた写しを与えると、
 *     正当な宣言であるにもかかわらず「リポジトリの外でも同じ値 `0` を出します」で赤くなった
 *     （2026-09-04 に実測）。現在の宣言 30 件はすべてリポジトリルート相対であり、
 *     絶対パスを含むものは無い（同日に 30 件を両方の起点で走らせて確認。誤検出 0 件）。
 *     絶対パスの宣言を足すときは、この判定が先に赤くなる
 */
export function runOutsideRepository(command: string): MeasurementOutcome {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-outside-'));
  try {
    return runMeasurement(directory, command);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * 宣言ごとの実測（報告用。判定は {@link judge} が持つ）
 *
 * **綴りで落ちたコマンドはここでも走らせない。** 以前の版は
 * {@link vocabularyFailures} を参照せず {@link runMeasurement} を直に呼んでいたため、
 * 判定の経路では実行されないコマンドが `--verbose` / `--json --verbose` では実行された。
 * `command` に `sh -c "touch <marker>"` を置いた仮マニフェストを与えて実測したところ、
 * 既定の経路では痕跡ファイルが 0 個であるのに `--verbose` では 1 個できた（2026-09-01 に実測）。
 * `pre-push.sh` の案内も本体の対応方法も、落ちた直後に `:verbose` を勧める。
 * すなわち**推奨した回復手順そのものが実行経路だった**。
 * 現在は綴りで落ちた宣言を「実行しません」と報告し、痕跡は `--verbose` でも 0 個である
 * （同日に実測。自己検査の「`--verbose` でも実行されない」が固定する）。
 */
export function measureAll(root: string, entries: readonly ManifestEntry[]): Measurement[] {
  const measurements: Measurement[] = [];
  for (const entry of entries) {
    if (!isEntryObject(entry)) {
      measurements.push({
        id: '(壊れた項目)',
        file: '(壊れた項目)',
        expected: '',
        actual: '(失敗) 宣言の項目が欄を持つオブジェクトではないため実行しません',
        documentFigure: '',
        stale: false,
      });
      continue;
    }
    const command = String(entry.command ?? '');
    const rejected = vocabularyFailures(command);
    const outcome: MeasurementOutcome =
      rejected.length > 0
        ? { output: '', failure: `綴りが許容外のため実行しません: ${rejected.join(' / ')}` }
        : runMeasurement(root, command);
    measurements.push({
      id: String(entry.id ?? ''),
      file: String(entry.file ?? ''),
      expected: String(entry.expected ?? ''),
      actual: outcome.failure === '' ? outcome.output : `(失敗) ${outcome.failure}`,
      documentFigure: documentFigureOf(entry),
      stale: divergenceOf(entry) !== undefined,
    });
  }
  return measurements;
}

// ============================================================================
// 入口
// ============================================================================

function manifestPathFrom(argv: readonly string[], root: string): string {
  for (const argument of argv) {
    if (argument.startsWith('--manifest=')) {
      const given = argument.slice('--manifest='.length);
      return path.isAbsolute(given) ? given : path.join(root, given);
    }
  }
  return path.join(root, DEFAULT_MANIFEST_PATH);
}

export function execute(argv: readonly string[], root = process.cwd()): number {
  const verbose = argv.includes('--verbose');
  const json = argv.includes('--json');
  const manifestPath = manifestPathFrom(argv, root);
  const { entries, errors } = loadManifest(manifestPath);
  const findings = judge(root, entries);
  const stale = countStaleDivergences(entries);

  if (json) {
    console.log(
      JSON.stringify(
        {
          manifest: path.relative(root, manifestPath),
          declared: entries.length,
          stale,
          errors,
          findings,
          measurements: verbose ? measureAll(root, entries) : [],
        },
        null,
        2
      )
    );
    return errors.length + findings.length > 0 ? 1 : 0;
  }

  console.log(
    '🔍 設計文書の実測値の鮮度を検査しています (scripts/check-design-measurement-freshness.ts)'
  );
  console.log(
    `   宣言 ${entries.length} 件 / 対象文書 ${GOVERNED_DOCUMENTS.length} 件 / ` +
      `文書側が古いと宣言した箇所 ${stale} 件`
  );

  if (verbose) {
    console.log('');
    for (const measurement of measureAll(root, entries)) {
      console.log(
        `   ${measurement.id}: expected=${measurement.expected} actual=${measurement.actual} ` +
          `documentFigure=${measurement.documentFigure}${measurement.stale ? ' (stale 宣言あり)' : ''}`
      );
    }
  }

  if (errors.length + findings.length > 0) {
    console.error('');
    console.error('❌ 設計文書の実測値の鮮度に問題があります:');
    for (const error of errors) console.error(`   - ${error}`);
    for (const finding of findings) console.error(`   - [${finding.id}] ${finding.message}`);
    console.error('');
    console.error('対応方法:');
    console.error('  1. 現況が動いたなら、文書の数値と宣言の expected を同時に測り直す');
    console.error('  2. 文書側だけが古いなら documentFigure と divergence を宣言する');
    console.error('     （DECLARED_STALE_DOCUMENT_FIGURES も同時に動かすこと）');
    console.error('  3. 実測値の一覧: npm run check:design-measurement-freshness:verbose');
    return 1;
  }

  console.log('✅ 宣言した実測値はいずれも現況および文書の字面と一致します');
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
