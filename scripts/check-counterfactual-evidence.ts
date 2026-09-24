/**
 * @fileoverview 反実仮想の記述が実行した変異とその出力を引いていることの検査
 *
 * 本リポジトリの記録には「この変異を当てれば赤くなる／緑のままである」という形の
 * **反実仮想**が数多く書かれている。これらは後任が検査の実効を判断する根拠になるため、
 * 誤っていると誤診を招く。タスク 115.210 の起票時点で、同型の誤りが本系列で三度起きた。
 *   - 115.168: 「同一機能の一覧が段落をまたぐ形が実データに 4 件ある」と**測らずに断言**し、
 *     その線を自己検査で固定した。実測すると失われるのは 2 件だけで、両方とも偽の被覆主張だった。
 *   - 115.170: 「ツールバーの `overflowX` を外せば赤になる」とレビューが例示したが、実測では
 *     緑のままだった。封じ込めていたのは祖先の `overflow: hidden` だった。
 *   - 115.171: 「撤去した恒偽の分岐が生きていれば等倍リサイズが入る」とコメントに書いたが、
 *     逐語復元は一度も実行していなかった。実測すると 48/48 緑であった。
 * いずれも「この変異ならこうなるはずだ」を**実行せずに**書いたことに起因する。
 *
 * そこで作法を次のように固定する。**コメントに反実仮想を書く場合は、実際に実行した変異を
 * 名指しし、その出力（件数・比・日付）を同じコメント塊に書くこと。** 本検査はその
 * 引用の有無を機械で見る。
 *
 * 使用方法:
 *   npx tsx scripts/check-counterfactual-evidence.ts [--verbose] [--json] [--survey] [--list]
 *   npm run check:cf-evidence
 *   npm run check:cf-evidence:survey   # 下の「網の広さの実測」を数え直す
 *   npm run check:cf-evidence:list     # 照合した反実仮想の全文を印字する（読み直しの追試）
 *
 * ## 検出する形
 *
 * コメント塊（連続するコメント行のまとまり）を句点で文に割り、次の三つを**同じ文が
 * すべて**満たすとき「反実仮想の文」とする。
 *   (1) 逆引用符で囲まれたコード上の名前（`resizeRatio` / `toStrictEqual` / `foo.ts` など）
 *   (2) 仮定した改変を述べる語（`MUTATION_VOCABULARY`。外す・戻す・空にする・変異させる 等）
 *   (3) 検査の実行結果を述べる語（`VERDICT_VOCABULARY`。赤くなる・緑のまま・落ちる 等）
 * 三つを同じ文に要求するのは、実測（下の「網の広さの実測」）で (1) を落とすと product の
 * 散文（「包むと緑になるため無条件に主張する」等）が大量に混ざり、(3) だけでは
 * `判定根拠:` の定型（「遷移が壊れれば赤になる」）まで巻き込むためである。
 *
 * 三条件を実データへ当てる場所は `collectNetSentencesInSource` **一つ**である（タスク 115.229）。
 * 本検査の母集団・検出・全文の列挙・三段階の集計は、いずれもそこが付けた印を数える。
 * 一本化の前後で何がどう動いたかの実測は、同関数と `run` の注釈に置いた。
 *
 * ## 合格の条件
 *
 * 反実仮想の文を含むコメント塊には、**実行の引用**が同居しなければならない。実行の引用とは
 * 実行を述べる語（`EXECUTION_VOCABULARY`。実測・測った・走らせた・実行した・再現）と
 * **数字**が同じ塊に現れることである。数字を要求するのは、変異の出力（落ちた件数・比・
 * 実測した日付）が伴わない「実測した」だけの記述を引用と認めないためである。
 *
 * ## 明記する限界（この検査が保証しないこと）
 *
 * - **実行そのものは検査できない。** 本検査が見るのは「実行した変異とその出力を名指しした
 *   文面があるか」であって、変異が本当に実行されたかではない。`npm run check:design-code-refs`
 *   が参照の**形式**だけを見て実在を見ないのと同じ層である。文面の要求は、省略を
 *   押下前に可視化してレビューの対象に載せるところまでを担う。
 * - **コードのコメントしか見ない。** 設計文書（`.kiro/specs/<feature>/design.md`）と `tasks.md` は
 *   走査しない。前者は当時の判断を残す歴史記録であり、後者は「これを確かめよ」という
 *   指示の記録であって、いずれも「実行済みの断定」とは別物である。
 * - **レビューの指摘には届かない。** 115.170 の誤りはレビューの発言であってファイルに残らない。
 *   三件のうち機械が届くのは 115.171 の型（コメント）だけである。残る二つの型は
 *   `.kiro/steering/development-discipline.md` **単独**で拘束する。cc-sdd の配布物
 *   （`.claude/skills/` など）へは書かない——`npx cc-sdd@latest` の再実行で上書きされ、
 *   書き込んだ規律が無言のうちに消えるためである（同書の「なぜ本書に置くか」を参照）。
 * - **引用の中身は読まない。** 「1 件が落ちる（実測）」と書かれていれば通る。数値が実際の
 *   出力かどうかは人が読む。
 * - **文字列リテラルの中は見ない。** 自己検査の見本は文字列として置かれるため、
 *   見本そのものが本検査に掛かることはない。
 * - **版管理外の生成物は走査しない。** `generated`（Prisma クライアントの出力）を
 *   {@link EXCLUDED_DIRECTORIES} で除く。含めると走査ファイル数が手元（1804）と
 *   取得直後の統合（1750）で分かれ、記録した件数の追試が環境で食い違う。
 *
 * ## 網の広さの実測（2026-08-31。タスク 115.210）
 *
 * 網の広さを三段階で数え、一段ずつ読んで判別した。数え直しは `npm run check:cf-evidence:survey`
 * （`surveyNet`）が出す。起票時点の値は、当時のツリーを取り出し走査根の外へ置いた本体を
 * 走らせて得た。
 * **起票時点のツリー（コミット `95ea45e`。走査 1748 ファイル）**では次のとおりであった。
 *   - **(3) だけ**（検査の判定を述べる語）: 482 文・151 ファイル。うち引用を伴うものは
 *     166 文。読むと大半は反実仮想ではなく、「包むと緑になるため無条件に主張する」のような
 *     **構造の含意**（コードを読めば決まる）と、E2E の `判定根拠:` の定型であった。
 *     この段で引用を強制すると、正しい記述に「実測」を付けさせることになる。
 *   - **(2)+(3)**（変異の語と判定の語）: 66 文・20 ファイル。うち 26 文が引用なし。読むと
 *     「条件が偽なら落ちる」のような**実行時の条件**の記述が混ざる。
 *   - **(1)+(2)+(3)**（本検査が採る形）: 27 文・8 ファイル。引用あり 20 文・引用なし 7 文。
 *     この 7 文が自己検査 `MUST_DETECT` の先頭 7 件（陽性対照）の出所である。
 * **是正後の提出時点（走査 1750 ファイル）**は三条件が 35 文・9 ファイルで、引用を欠くものは
 * 0 件である。読み直しは `npm run check:cf-evidence:list` が全文を印字する
 * （{@link listCounterfactualSentences}）。35 文を一件ずつ読み、反実仮想でないものは **3 文**
 * であった。いずれも語が別の意味で使われた過検出で、引用を伴うため検出はされない。
 *   - `check-design-code-reference-format.ts` の「`303 行のファイル` の形だけは外すが」——
 *     検出規則の**除外**を述べた文が、変異の語「外す」に当たっている。
 *   - `check-e2e-assertion-guards.ts` の T10 の限界節「『過検出は主張を消す圧力になる』ため
 *     見逃す側へ倒す……型検査器（`ts.Program`）を持ち込めば表なしで判定できる」——
 *     変異の語「消す」（`主張を消す圧力`）と判定の語「見逃す」と名指し `ts.Program` の三つが
 *     揃うが、述べているのは**現行の方針と代替実装の費用**であって、変異を当てたときの
 *     赤／緑ではない。「型検査器を持ち込めば判定できる」は実装方式の実現可能性の見立てで
 *     あり、本書が拘束する「この変異なら赤くなる／緑のままである」の型には当たらない
 *     （実測されていない見立てである点は残る。網が拾ってしまうのは過検出である）。
 *   - 三つ目は、直前の項で二つ目を説明した本節の文それ自体である。過検出の中身を引くと、
 *     引いた文がまた網に掛かる。記録を書く行為そのものが母集団を動かす実例である
 *     （タスク 115.204 / 115.189）。**この項の三文が四つ目にならない理由は、名指しの
 *     欠如ではない。** 当該箇所へ逆引用符の名指しを一つだけ足す変異（「引いた文がまた
 *     `isCounterfactualSentence` の網に掛かる」）を当てても母集団は 35 のままで、
 *     名指しと変異の語と判定の語の三つを揃える変異（同じ箇所を「`BACKTICKED_NAME` を
 *     外すと引いた文も検出される」へ替える）を当てて初めて 36 へ動く（2026-08-31 に実測。
 *     変異は退避した控えからの書き戻しで復元した）。拘束しているのは、この項の三文が
 *     いずれも変異の語も判定の語も持たないことである。
 *
 * (1)（逆引用符の名指し）の要求——`hasBacktickedName`（タスク 115.229 の一本化の前は
 * `isCounterfactualSentence` の冒頭）の `BACKTICKED_NAME` の判定——を実際に外す変異
 * （`BACKTICKED_NAME.test(sentence) || sentence.length >= 0` へ替える）を当てると、母集団は
 * 55 文から 100 文へ増え、引用を欠く検出は 0 件から 22 件・16 ファイルへ増え、
 * 自己検査は 66 件中 4 件が落ちる（2026-09-01 に実測。起票時のツリー（走査 1750
 * ファイル）では 35 文から 77 文・20 件・15 ファイル・5 件であった。変異は退避した控えからの
 * 書き戻しで復元した）。増える 45 文には、画面操作の記述
 * （「ツールを一度離れて戻すと編集中の目印が落ちる」）、検証の手順（「ページの焦点を外す」）、
 * 方針の記述（「過検出は主張を消す圧力になるため見逃す側へ倒している」）、構造の含意
 * （「将来どの書き込み関数が足されても当該経路から呼ばれれば落ちる」）が混ざる。
 * **名指しの無い反実仮想は本検査の見逃しである**（意図した限界。真の該当も 45 文の中に
 * 在るが、それらは名指しを足せば捕まる形であり、名指しを求めない網は誤検出の方が多い）。
 * 落ちた 4 件のうち 3 件は上の三類型を据えた陰性対照である。
 * 合格の報告は母集団の大きさを出すので、台が空でないことは走らせれば確かめられる。
 *
 * ## 値の置換型を採る範囲（2026-09-03。タスク 115.248）
 *
 * 起票時の {@link MUTATION_VOCABULARY} は**撤去の動詞**（外す・消す・落とす・戻す・空にする）と
 * 「変異」を含む定型に偏っており、**値を別の値へ差し替える型**の動詞を一語も持たなかった。
 * このため `frontend/src/components/site-surveys/tap-target.constants.ts` の記録——44 を 20 へ
 * 変えて単体テストを走らせた実測を引く記録——は、(1) 名指しと (3) 判定の語を持ちながら (2) を
 * 欠き、本検査に**一文も索引されていなかった**。タスク 115.217 のレビューはこの取りこぼしを
 * 指摘した。**関門の緑は当該の記録について何も保証していなかった**のであり、レビュアーは
 * 関門に頼らず自分で変異を実行して確かめている。
 *
 * そこで `変え` と `置き換え` の二語を足した。走査根 4 つ・1765 ファイルに対する実測は
 * 次のとおりである（2026-09-03。`npm run check:cf-evidence:list` と
 * `npm run check:cf-evidence:survey` が数え直す）。
 *   - 足す前: 反実仮想 65 文・19 ファイル（引用を欠くもの 0 件）
 *   - 足した後: 72 文・20 ファイル（引用を欠くもの 0 件）。**偽陽性は一件も増えていない。**
 *   - **本節を書き足すと 73 文になる。** 下で引く
 *     `check-requirement-coverage.selftest.ts` の例文それ自体が三条件を満たすためである。
 *     記録を書く行為そのものが母集団を動かす（タスク 115.204 / 115.189）。**後任は
 *     測り直すこと。** 提出時の関門の報告は 73 件である（2026-09-03 に実測。その後の再実測は
 *     153 件——コミット `29c3b86f` へ当該タスクの変更を載せた作業ツリーで 2026-09-04 に
 *     リポジトリルートで実測。その次の再実測は 151 件である——コミット `272e3bde` へ
 *     タスク 115.266 の変更を載せた作業ツリーで 2026-09-04 にリポジトリルートで実測した。
 *     115.266 は散文の台帳を対照群へ移したため、台帳が持っていた反実仮想の文が減った。
 *     内訳は下の「実際に使われる言い回しを採る範囲」に置いた。**現況の再実測は
 *     153 件である**——コミット `43a1d564` へタスク 115.267 の変更を載せた作業ツリーで
 *     2026-09-04 にリポジトリルートで実測。115.267 が散文の列挙と `NARROWING` を
 *     突き合わせる確認を二ファイルへ足し、その注釈が引く反実仮想の分だけ増えた）。
 *   - 増えた 7 文の内訳は `tap-target.constants.ts` の 2 文と
 *     `check-requirement-coverage.selftest.ts` の 5 文である。後者は
 *     「`parseHeaderListItemIds` の `criterion: head[2] ?? null` を `?? '1'` へ変えると
 *     自己検査は 52/52 緑のまま」のような形で、**同型の取りこぼしが当該のファイル以外にも
 *     在った**ことを示す。
 *
 * **当時採らなかった動詞と、その判断の実測（2026-09-03 の観測。経緯として残す）。** 同じ
 * 置換・追加の一族として `替え` / `差し替え` / `書き換え` / `入れ替え` / `挿入` / `除く` /
 * `逆に` / `足す` / `無効化` を候補に挙げ、上の 72 文を基準として**一語ずつ**足して測った。
 *   - **引用を欠く検出を生む語**（足すと関門が赤くなる）: `替え` は 78 文・2 件、`差し替え` は
 *     76 文・2 件、`書き換え` は 78 文・1 件、`足す` は 93 文・2 件、`無効化` は 75 文・2 件。
 *     115.248 はこれらを「動詞が変異以外の意味で使われた**過検出**」と読み、`差し替え` /
 *     `無効化` / `足す` の三つを自己検査の陰性対照に据えた。
 *   - **検出を増やすが引用を欠く検出は 0 件の語**: `入れ替え` は 73 文、`挿入` は 74 文、
 *     `除く` は 73 文、`逆に` は 73 文。同タスクはいずれも採らなかった。採らない理由は
 *     「該当が無い」からではなく、記録の側に駆動する実例が無いためである。
 *   - **この読みのうち `替え` と `足す` については、タスク 115.265 が誤りであると判定した。**
 *     下の節を参照のこと。陰性対照に据えた三件のうち二件は陽性側へ移してある。
 *   - 上の一覧のうち `差し替え` と `入れ替え` は、**現在は候補ですらない**——`替え` を採った
 *     ことで、字面で引く一覧が両語を部分文字列として包含したためである。現況の実測と
 *     採らなかった語の一覧は自己検査の「語彙に採らなかった動詞」の節に置いた。
 *
 * **語彙を広げても残る取りこぼし（文の単位）。** 三条件は**一文**に揃うことを要求するため、
 * 変異を前の文で述べ判定だけを次の文へ置く形は、置換型の語を足しても索引されない。実例が
 * `tap-target.constants.ts` に在る（「残る 1 件は……取り込んだ名前を使う 10 件は 20px を
 * 描いたまま緑になる」）。ただし**引用の要求は塊の単位**である（{@link hasExecutionCitation}
 * は塊の本文を見る）。したがって同じ塊の別の一文が索引されていれば、その塊は引用を
 * 持たなければ通らない。文単位の取りこぼしは、塊に一文でも索引される文が在る限り合格の
 * 条件を緩めない。当該の帰結の節も自己検査の陰性対照に据えた。
 *
 * ## 実際に使われる言い回しを採る範囲（2026-09-04。タスク 115.265）
 *
 * **変異を実行して記録した文が、変異の検査の母集団に入っていなかった。** タスク 115.229 が
 * 新設した自己検査の注釈——`checkNetSurveyMatchesTheCheck` と
 * `checkSampleSubjectMatchesTheRun` の docstring——は、当てた変異も落ちた件数も実測の日付も
 * 書いているのに、本検査の索引から外れていた。当時の実装者は句点の分割が理由だと報告したが、
 * 115.229 のレビューが実測すると外れていた文は `named=true, mutated=false` であり、拘束して
 * いたのは**「替える」「足す」「足して」が {@link MUTATION_VOCABULARY} に無かったこと**で
 * あった。句点の分割で外れるのは一文だけである（括弧の中の句点が名指しを前の文へ置いて
 * いく形）。**網の目そのものを疑うこと**——分類の件数が 0 に届いても欠陥が 0 になった
 * とは限らない（タスク 115.127 段4 と同型）。
 *
 * そこで `替え` / `足す` / `足し` の三語を足した。連用形の `足し` を別に置くのは、115.248 が
 * 測ったのが終止形の `足す` だけであり、記録が実際に使う「足して」「足しても」を拾わなかった
 * ためである。**活用が違えば網から外れる。** 語彙は語幹ではなく字面で引くため、採る語は
 * 実際の記録の言い回しから取らなければならない。
 *
 * **広げる前の実測**（コミット `29c3b86f` の作業ツリー、2026-09-04。基準は母集団 109 文・
 * 引用を欠くもの 0 件）。一語ずつ足したときの増分と、そのうち引用を欠くものは次のとおり。
 *   - `替え`: +8 文（計 117）。うち引用を欠くもの **2 件**。
 *   - `足す`: +22 文（計 131）。うち引用を欠くもの **2 件**。
 *   - `足し`: +8 文（計 117）。うち引用を欠くもの **0 件**。
 *   - 三語をまとめて足すと 145 文（+36）・引用を欠く検出 **4 件 / 4 ファイル**。
 * **`足し` だけを採れば関門は緑のまま網が広がる。** それを採らなかったのは、`替え` と
 * `足す` が露出させる 4 件こそが本検査の狙う欠落だからである。**引用を持つ記録だけを
 * 呑み込む広げ方は、網を広げたように見えて一件も捕まえない。**
 *
 * **露出した 4 件は、いずれも過検出ではなく引用を欠いた反実仮想であった。** うち二件を
 * 115.248 は「動詞が変異以外の意味で使われた過検出」と読んだが、読み直すといずれも
 * 「この改変を当てるとこうなる」を述べている。**四件とも変異を実行して引用を書き足した**
 * （記述を削ってもいないし、語彙を狭めて逃がしてもいない）。
 *   - `check-design-path-references.selftest.ts` の `reportPreconditions`: 末尾へ
 *     `tally.failed += report('【変異】加算を伴わない確認', []);` の一行を足す変異を当てると、
 *     44 件中この 1 件だけが落ちる。
 *   - `check-e2e-assertion-guards.selftest.ts` の 115.163-13: `toHaveText` を
 *     `LANGUAGE_FIXING_EQUALITY_MATCHERS` へ足す変異を当てると、196 件中この 1 件だけが落ちる。
 *   - `check-requirement-exclusions.selftest.ts` の `MUTATION_SOURCE_ID`: 実在しない番号へ
 *     変える変異を当てると、64 件を数え上げる前に前提の崩壊を送出して EXIT=1 になる。
 *   - `frontend/src/pages/EstimateDetailPage.export.test.tsx`: ページがダイアログへ渡す
 *     `items` を空配列へ変える変異を当てると、ダイアログを差し替えて描画する兄弟
 *     `EstimateDetailPage.test.tsx` は 91/91 で緑のまま素通りし、実物を描画する当該ファイルは
 *     5 件中 2 件が落ちる。
 *   （四件とも 2026-09-04 に実測。変異はいずれも退避した控えからの書き戻しで復元し、
 *   復元後に元の件数へ戻ることを確かめた。）
 *
 * **閉じた一覧という道具立てそのものは正しいか。** 正しい、と判断した。(2) を語彙で引かず
 * 「仮定の改変を述べているか」を文法（条件形の「〜と」「〜ば」「〜ても」）で引く案は、
 * 判定の語だけの段が 790 文・168 ファイルある（うち引用なし 355 文）ことから分かるとおり
 * 網が広すぎる。その段には画面操作の記述も実行時の条件も混ざり、正しい記述へ「実測」を
 * 付けさせる圧力になる（起票時の 115.210 が同じ理由で (1) を要求に加えた）。
 * **ただし一覧の形には欠陥がある**——語幹ではなく字面で引くため、活用を一つ落とすと静かに
 * 漏れる。本タスクが `足す` と `足し` を別に置いたのはそのためである。自己検査
 * `checkEveryVocabularyEntryIsFixed` が固定するのは「宣言した語が実効を持つこと」であって
 * 「実効を持つ語が宣言に揃っていること」ではない（当時の**開示済みの限界**。揃っているかは、
 * 本節のように記録の側の実例から測るほかなかった）。**この非対称はタスク 115.319 が機械で
 * 塞いだ**——下の「活用形の網羅を機械で確かめる範囲」を参照のこと。
 *
 * **提出時の再実測（同日、本節を書き足した後）。** 母集団は 153 文 / 27 ファイルで、引用を
 * 欠くものは 0 件、自己検査は 75/75 であった。**本節を書き足す行為そのものが母集団を動かす**
 * （タスク 115.204 / 115.189。上の 145 文は書き足す前の値である）。**後任は測り直すこと。**
 * **タスク 115.266 の提出時点の再実測は 151 文 / 27 ファイルである**（引用を欠くもの 0 件、
 * 自己検査 75/75。コミット `272e3bde` へ同タスクの変更を載せた作業ツリーで 2026-09-04 に
 * リポジトリルートで実測）。同タスクが
 * `scripts/check-design-reference-format.selftest.ts` と兄弟の散文の台帳を対照群へ移し、
 * 台帳が持っていた反実仮想の文が減った分である。
 * **タスク 115.267 の提出時点の再実測は 153 文 / 27 ファイルである**（引用を欠くもの 0 件、
 * 自己検査 75/75。コミット `43a1d564` へ同タスクの変更を載せた作業ツリーで 2026-09-04 に
 * リポジトリルートで実測）。同タスクが同じ二ファイルへ、散文が挙げる「絞り込みに使える操作」
 * の列挙と `NARROWING` を突き合わせる確認を足した分である。
 *
 * ## 活用形の網羅を機械で確かめる範囲（2026-09-07。タスク 115.319）
 *
 * 上の節が開示した非対称——「宣言した語が実効を持つこと」しか固定していない——を機械で
 * 塞いだ。塞ぎ方は語幹照合への移行ではなく、**宣言した語の活用の型から未宣言の活用形を
 * 機械で導き、その一つでも実データで実効を持てば自己検査を赤くする**形である
 * （自己検査の `checkNoUnadoptedConjugationFormIsEffective`。活用の型そのものも
 * `checkVocabularyDeclaresItsConjugation` が語彙と双方向に突き合わせるので、語を足しても
 * 減らしても宣言を直さない限り赤くなる）。
 *
 * **現況の語彙を機械で洗った結果**（2026-09-07 にリポジトリルートで実測）。宣言済みの各語に
 * ついて活用の型から未宣言の形を導き、「名指しと判定の語を持つのに現況の語彙では変異の語を
 * 持たない文」（同日 229 文）のうち当該の形を含むものを数えた。実効を持っていたのは
 * 三形だけである。
 *   - `落とし`（`落とす` の連用形）: 8 文。うち塊が引用を欠くもの 3 件。
 *   - `空にし`（`空にする` の連用形）: 4 文。うち塊が引用を欠くもの 1 件。
 *   - `戻し`（`戻す` の連用形）: 2 文。いずれも塊は引用を持つ。
 *   - 他の未宣言形（`外さ` `外そ` `消さ` `消し` `消そ` `落とさ` `落とそ` `戻さ` `戻そ`
 *     `足さ` `足せ` `足そ` `空にせ` `空にさ` `空にしろ` `狭め` `広げ` `生きてい` `残してい`）は
 *     いずれも 0 文であった。
 * **起票が挙げた実例（`足す` と `足し`）で尽きてはいなかった。** 連用形の落ちは三語に及ぶ。
 * 三形はいずれも語彙へ採り、露出した引用欠は変異を実行して引用を書き足した（消しても
 * いないし、語彙を狭めて逃がしてもいない）。
 *   - `scripts/check-counterfactual-evidence.ts` の `SCAN_DIRS` と自己検査の
 *     `checkRealRepositoryIsScanned`: 走査根を落とす変異を当てて測った。結果は当該の注記に
 *     書いた——**export しただけでは根の脱落は赤くならない**。
 *   - `scripts/check-steering-test-tree.selftest.ts` の `ALL_COUNT_KINDS`: 表を空にする変異を
 *     当てて測った。結果は当該の注記に書いた。
 *
 * **語幹照合へ移さなかった理由（誤検出の増加を先に実測した。2026-09-07）。** 送り仮名を
 * 落とした語幹（`外` `消` `落` `戻` `変` `替` `足` `空` `狭` `広` ほか）で引く案を実データで
 * 測ると、上の 229 文のうち **162 文**を新たに拾い、そのうち塊が引用を欠くものは
 * **65 文**である。拾う文の大半は変異ではない——「壊れたシンボリックリンクなどは `statSync`
 * と同じ `catch` で走査から落ちる」（語幹 `落` に当たる）、「`main` が定数を印字する形が
 * 素通りする」（語幹 `残` に当たる）のように、**検査の説明の散文がそのまま語幹に当たる**。
 * 115.265 が文法的な信号（条件形）で引く案を退けた理由——判定の語だけの段は網が広すぎ、
 * 正しい記述へ「実測」を付けさせる圧力になる——と同じ形の失敗であり、採らなかった。
 *
 * **字面照合の限界として残るもの（開示）。** 採った三形はいずれも他語の部分文字列でもある
 * ——`戻し` は「差し戻し」に、`落とし` は「見落とし」「落とし穴」に含まれる。現況の実データ
 * では名指しと判定の語を併せ持つ文にこの形の誤検出は無い（上の 8 文と 2 文を一件ずつ読んで
 * 確かめた。いずれも「この改変を当てるとこうなる」を述べた反実仮想である）が、**将来の
 * 記述で誤検出が出る余地は残る**。また **本機構が覆うのは「宣言済みの語の活用の落ち」で
 * あって「未宣言の動詞」ではない**——語彙に一語も無い動詞（`書き換え` / `無効化`。
 * タスク 115.320 の所管）は活用の型を持たないため、本機構の網には掛からない
 * （**当該の二語は 115.320 が採った**。下の節を参照のこと。網の外に残るのは、
 * その二語でもなお語彙に一語も無い動詞である）。
 *
 * **提出時の再実測（同日。上の三形を採り、本節と各所の注記を書き終えた後に測り直した値で
 * ある。注記の追記そのものが母集団を動かすため、書いた値と現況が一致する不動点まで
 * 測り直しを繰り返した）。** 引用を照合した反実仮想は 187 件から 210 件へ増え、
 * 引用を欠く検出は 0 件、自己検査で落ちる確認も 0 件である。
 * **未宣言の活用形で実効を持つものは 0 件**——`checkNoUnadoptedConjugationFormIsEffective`
 * が毎回数え直すので、この値は記録ではなく関門が保つ。基準の「名指しと判定の語を持ちながら
 * 変異の語を欠く文」は 229 文から 220 文へ動いた（採った三形が索引側へ引き上げた分と、
 * 本節および各所の注記を書き足した分の差引である）。
 * **現況の再実測は 213 文である**——コミット `4807c112` へタスク 115.320 の変更を載せた
 * 作業ツリーで 2026-09-08 にリポジトリルートで実測した。同タスクが `書き換え` と `無効化` を
 * 索引側へ引き上げた分と、注記を書き足した分の差引である。
 * 上の三形の実効の値（8 文 / 4 文 / 2 文）と語幹照合の費用（162 文 / 65 文）は**採る前の
 * 基準で測った値**であり、採った後の同じ基準では母集団が動いている
 * （語幹照合の費用を採用後に測り直すと 153 文 / 62 文である。判断は変わらない）。
 * **記録を書く行為そのものが母集団を動かす**（タスク 115.204 / 115.189）。
 * **後任は測り直すこと**——採取は `npm run check:cf-evidence` と
 * `npm run check:cf-evidence:selftest` である。
 *
 * ## 未宣言の動詞を採る範囲（2026-09-08。タスク 115.320）
 *
 * 上の節が開示した残余——活用の網羅は**宣言済みの語**の落ちしか覆わず、語彙に一語も無い
 * 動詞は網に掛からない——のうち、115.265 が名指しで境界外へ送った二語（`書き換え` /
 * `無効化`）を採った。**採らずに済ませる選択肢は取らなかった。** 露出した引用欠は
 * いずれも変異を実行して引用を書き足してあり、記述を削っても語彙を狭めて逃がしてもいない
 * （115.265 の作法）。
 *
 * **採る前の実測**（コミット `4807c112` の作業ツリー、2026-09-08 にリポジトリルートで実測。
 * 基準は母集団 220 文・42 ファイル・引用を欠くもの 0 件）。一語ずつ足したときの増分と、
 * そのうち引用を欠くものは次のとおり。
 *   - `書き換え`: +12 文（計 232）・43 ファイル。うち引用を欠くもの **2 件**
 *     （`check-e2e-assertion-guards.selftest.ts` と `check-requirement-coverage.selftest.ts`）。
 *   - `無効化`: +3 文（計 223）・43 ファイル。うち引用を欠くもの **2 件**
 *     （`check-e2e-assertion-guards.ts` と `check-requirement-exclusions.ts`）。
 *   - 二語をまとめて足すと 235 文（+15）・44 ファイル・引用を欠く検出 **4 件 / 4 ファイル**。
 * **起票（115.265 が 2026-09-04 にコミット `29c3b86f` の作業ツリーで測った値）とは増分が
 * 違う**——同タスクは `書き換え` を +8、`無効化` を +3 と記録している。露出する記録の所在は
 * 四件とも一致した。増分が動いたのは、115.266 以降の各タスクが記録を書き足したためである。
 * **どちらの語も、既に引用を持つ記録だけを都合よく呑み込む広げ方ではない**（115.265 が
 * 「お手盛りの形」として退けた形——網だけ広がって一件も捕まえない広げ方——には当たらない）。
 *
 * **四件は過検出ではなく、引用を欠いた反実仮想であった。** 四件とも変異を実際に実行し、
 * 落ちた確認の件数と所在を当該の注記へ書いた。総数を分母に取る書き方は避けている
 * （タスク 115.316 の教訓——総数つきの分数は自己検査が一件増えるたびに古びる）。
 *   - `check-e2e-assertion-guards.selftest.ts` の 115.137-12: `getObservationPattern` が語彙を
 *     迂回して組み直した正規表現を返す変異を当てると、落ちる確認は当該の 1 件だけである。
 *     そのうえで参照の同一性の主張を字面の比較へ緩めると落ちる確認は 0 件になる。
 *   - `check-e2e-assertion-guards.ts` の `retryExhaustionFailureExclusion`: 規則 (a) を実装する
 *     一行を外す変異を当てて、合成の三形で対象外の件数を測った。**(a) が単独で効くのは
 *     主張を条件式に包む形だけ**で、then 節に包む形は (b) が別に拒む。
 *   - `check-requirement-coverage.selftest.ts` の `parseCoverageExtensionAlternatives`:
 *     本体の `COVERAGE_FILE_PATTERN` へ選択肢を一つ足す変異で落ちる確認は 1 件、そこへ
 *     「自己検査の側の写し」を持ち込むと落ちる確認は 0 件になる。
 *   - `check-requirement-exclusions.ts` の `VIOLATION_CHECKS`:
 *     `checkCriterionCorrespondence` を丸ごと無効化すると落ちる対照は 7 件、対照を二重欠陥へ
 *     戻したうえで `check` を見る判定を外すと 6 件へ減る（遮蔽の再現）。
 *   （四件とも 2026-09-08 に実測。変異はいずれも退避した控えからの書き戻しで復元し、
 *   復元後に落ちる確認が 0 件へ戻ることを確かめた。）
 *
 * **活用の型の分類**（115.319 の `MUTATION_PARADIGMS` が語ごとに要求する）。`書き換え` は
 * 一段動詞 `書き換える` の語幹であるから `vowel-stem`——語幹が全活用形の部分文字列になる。
 * `無効化` はサ変名詞の語幹であり `stem-literal` である——活用語尾は後ろに付き、語自身は
 * 漢字で終わるため、`無効化する` / `無効化し` / `無効化すれ` のいずれも部分文字列として
 * 覆う（`suru` と宣言すると `conjugationFormsOf` が語形の不一致として拒む）。
 * **二語を採ったことで新たに露出した未宣言の活用形は無い。**
 *
 * **他の候補の測り直し**（「一件見つけたら全件を疑う」）。115.265 が「引用欠 0 件」とした
 * `挿入` / `除く` / `逆に` と、`替え` に包含される `入れ替え` / `差し替え` も現況で測り直した。
 * 値と採取の手順は自己検査の「語彙に採らなかった動詞」の節に置いた。**いずれも引用を欠く
 * 検出は 0 件のままである。**
 *
 * **全称否定の三層**（`.kiro/steering/development-discipline.md` の作法）。
 *   - **機械が保証する層**: `npm run check:cf-evidence` が走査する範囲——
 *     `SCAN_DIRS`（`scripts` / `backend/src` / `frontend/src` / `e2e`）配下の
 *     {@link SCANNED_EXTENSIONS} のファイル、{@link EXCLUDED_DIRECTORIES} を除く——で、
 *     三条件を満たす文を含む塊が引用を欠くものは 0 件である。関門が毎回数え直す。
 *   - **人手で走査した層**: 上の四件は一件ずつ読み、述べている変異を実行して引用を書いた。
 *   - **未走査の残余**: 語彙に一語も無い動詞は依然として網に掛からない。本節が閉じたのは
 *     115.265 が名指しした二語であって、**未宣言の動詞が尽きたという主張ではない**。
 *     同型の露出を探す手順は上と同じである——候補の一語を {@link MUTATION_VOCABULARY} と
 *     `MUTATION_PARADIGMS` へ足し、`npm run check:cf-evidence` の引用を欠く検出を読む。
 *
 * **提出時の再実測（同日。二語を採り、本節と各所の注記を書き終えた後に測り直した値である。
 * 注記の追記そのものが母集団を動かすため、書いた値と現況が一致する不動点まで測り直しを
 * 繰り返した）。** 引用を照合した反実仮想は 220 件から 242 件へ増え、引用を欠く検出は
 * 0 件、自己検査で落ちる確認も 0 件である。**起点の 220 件は上の節が記録した 210 件では
 * ない**——115.319 の提出から本タスクの着手（コミット `4807c112`）までに、115.321 ほかが
 * 記録を書き足した分だけ動いている。**後任は測り直すこと**——採取は
 * `npm run check:cf-evidence` と `npm run check:cf-evidence:selftest` である。
 *
 * ## 一文連言と引用の帰属の限界（2026-09-24。タスク 100.29）
 *
 * 利用者の裁定（2026-09-24）により、本節は判定と語彙を改めず**現況の限界を開示するに留める**。
 * 以下はいずれも現行の {@link isCounterfactualSentence} と {@link hasExecutionCitation} の仕様
 * そのものであり、本検査の合格はこれらについて何も保証しない。**関門の合格を注記の事実性の
 * 根拠にしてはならない**——タスク 100.22 の記録によれば、同タスクは注記の事実性だけで 5 回
 * 差し戻されたが、関門はその 5 回とも合格を出していた。
 *   - **(1) 判定は一文の連言である。** 反実仮想と数えるのは、句点で割った一つの文が
 *     名指し（逆引用符）・変異の語（{@link MUTATION_VOCABULARY}）・判定の語
 *     （{@link VERDICT_VOCABULARY}）の三つを同時に持つときに限る。
 *   - **(2) 主張と引用の帰属は検証しない。** 引用の判定は塊の単位であり、塊のどこかに実行の
 *     語と数字が在れば、その塊の反実仮想の文はすべて「引用あり」になる。どの文がどの実測を
 *     引いているかは見ない。実物として、100.22 のデバッグ調査は、偽の因果文が別の変異の実測
 *     引用と同じ塊に同居していたために `npm run check:cf-evidence:list` の索引 203 番が
 *     「引用あり」と刻印されていたことを記録している。索引の番号は母集団の並びで動く。
 *     この番号は同調査の当時の作業ツリーでのものであり、コミット `7bc9cda1`（100.22 の提出）
 *     とその親のツリーで同じ出口を走らせると 203 番は別の文である（2026-09-24 に実測）。
 *   - **(3) 網を逃れる形がある。** 100.22 の記録によれば、同タスクが触れた塊で本検査が
 *     反実仮想と数える文は 9 文であり、反実仮想として読める文が別に 19 文あって、いずれも
 *     網の外にあった。9 文は再現した——コミット `7bc9cda1` のツリーで、親との差分が掛かる
 *     コメント塊 59 塊のうち三条件を満たす文を数えると 9 文である（2026-09-24 に実測）。
 *     19 文は同タスクが一件ずつ読んだ値であり、本タスクでは読み直していない。逃れる理由は
 *     次の三つである。
 *     - (i) 変異の語が語彙外: `退行` / `恒偽化` / `反転` / `締め` / `迂回` はいずれも
 *       語彙の語ではなく、語彙のどの語も部分文字列として含まない。ただし `反転させ` は語彙に
 *       在るため、「反転させる」は拾い「反転する」「反転した」は拾わない。
 *     - (ii) 判定の語が語彙外: `鳴る` / `捕まえる` / `効力` / `気づけない` / `到達しない` は
 *       いずれも語彙の語ではなく、語彙のどの語も部分文字列として含まない。
 *     - (iii) 語彙の追加では届かない形: 変異の語と判定の語が句点で別の文に分かれると、
 *       連言が一文の単位である限り、どの語を語彙へ加えても拾えない。上の「語彙を広げても
 *       残る取りこぼし（文の単位）」の節が開示した性質と同じものである。
 *   - **(4) 引用の判定は「実行の語 ∧ 数字」でしかない。** {@link hasExecutionCitation} は
 *     {@link EXECUTION_VOCABULARY} の語と数字（{@link FIGURE}）が塊に同居すれば真を返す。
 *     数字が変異の出力かどうかは見ないため、タスク番号や日付の数字だけでも引用として通る。
 *
 * **本節の事実の確かめ方（2026-09-24。コミット `a725d152` の作業ツリーで実測）。** (i)(ii) の
 * 十語は変異と判定の二つの語彙と字面で突き合わせた。述語の性質は合成の文を各関数へ渡して
 * 確かめた——(i) の各語を変異の語として持ち、名指しと語彙内の判定の語を持つ合成の文には
 * {@link isCounterfactualSentence} が五語とも偽を返し、同じ文型で変異の語を `反転させ` か
 * `外す` にすると真を返す。(ii) の各語を判定の語として持ち、名指しと `外す` を持つ合成の文にも
 * 五語とも偽を返す。句点で二文に分けた
 * 合成の塊は {@link scanSource} の検出が 0 件で、同じ内容を一文にすると 1 件である。
 * 引用を欠く反実仮想の文と同じ塊へ、別の変異の実測を述べる文（実行の語と数字を持つ）を
 * 置くと検出は 0 件になる。実行の語とタスク番号の数字だけを持つ本文にも
 * {@link hasExecutionCitation} は真を返す。
 *
 * **本節の追記は母集団を動かさない。** 本節の文はいずれも判定の語を持たないように書いた。
 * 追記の前後で `npm run check:cf-evidence`（既定 / `--json` / `--survey` / `--verbose`）と
 * `npm run check:cf-evidence:selftest` の出力と終了コードは一字一句同じであった。`--list` は
 * 本ファイルに属する 4 件の塊の開始行番号だけが追記の行数ぶん動き、文と引用の有無は同じであった
 * （いずれも 2026-09-24 に実測）。**後任は測り直すこと。**
 *
 * ## 許容リストは置いていない
 *
 * 逃がしは一切無い。引用を書けないなら、反実仮想を書かないか、変異を実行することになる。
 * 自己検査 `checkNoFindingsNarrowing` が、走査・判定・集計の各関数の本体に
 * ファイル名の文字列リテラルが無いことを機構として固定する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

/** 連続するコメント行のまとまり */
export interface CommentBlock {
  /** 1 始まりの開始行番号 */
  line: number;
  /** コメント記号を落とした本文（行ごと） */
  lines: string[];
}

export interface CounterfactualFinding {
  /** リポジトリ相対のファイルパス */
  file: string;
  /** コメント塊の 1 始まりの開始行番号 */
  line: number;
  /** 引用を欠いた反実仮想の文 */
  sentence: string;
}

export interface RunOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** 走査根（リポジトリ相対）。既定は {@link SCAN_DIRS} */
  scanDirs?: readonly string[];
}

export interface RunResult {
  findings: CounterfactualFinding[];
  /** 走査したファイル数 */
  scannedFiles: number;
  /** 走査根ごとのファイル数（どの根も遊んでいないことを見るため） */
  filesByScanDir: Record<string, number>;
  /**
   * 引用の有無を照合した反実仮想の文の総数。合格は「この有限集合の**すべて**が
   * 引用を伴う」という全称命題であり、その台の大きさを報告に出す。0 件の合格
   * （走査の空振り）を読み手が見分けられるようにするためである。
   */
  claims: number;
}

// ============================================================================
// 走査対象
// ============================================================================

/**
 * 走査根。**`main()` の中に隠さず export する**（タスク 115.227 が起票した型——同タスクは
 * 未着手であり、これは知見ではなく**指摘**である: 走査根が
 * 自己検査から到達できないと、根を落としても自己検査は緑のままになる）。
 *
 * **着手前（HEAD、コミット `166753d8`）の版での実測（2026-09-07。タスク 115.319 が語彙を
 * 広げて当該の記述を露出させたため測った）**: ここから `'e2e'` を落とすと、走査は
 * 1779 ファイルから 1562 ファイルへ、引用を照合した反実仮想は 187 件から 173 件へ減り、
 * `'scripts'` を落とすと 1729 ファイル・34 件へ減る。いずれの変異でも本検査も自己検査も
 * EXIT=0 の緑である（落ちた確認は 0 件）。
 *
 * **提出時点の再実測（同じコミット `166753d8` の作業ツリーへタスク 115.319 の未コミットの
 * 変更を載せた版。2026-09-07 にリポジトリルートで測り直した）**: 同じ `'e2e'` 落としで
 * 1779 ファイル・210 件が 1562 ファイル・196 件へ、`'scripts'` 落としで 1729 ファイル・
 * 36 件へ減る。判定は着手前と変わらず、どちらの変異でも本検査・自己検査ともに EXIT=0 の
 * 緑である。**`'scripts'` の例のほうが `'e2e'` より遥かに強い**——走査ファイル数の目減りは
 * 50 件にすぎないのに、引用を照合した反実仮想は 210 件から 36 件へ落ちる。
 * すなわち **export は数え直しを可能にするだけで、根の脱落を赤くはしない**——
 * `checkRealRepositoryIsScanned` は宣言された根が実在し空でないことしか見ないためである。
 * **本タスクが新設した活用形の網羅確認の実効範囲も、この走査根の完全性に丸ごと依存する**
 * ——根が欠ければ未宣言形を測る母集団ごと縮むためである。根の集合そのものを固定するかは
 * 115.227 の所管であり（本タスクでは新たな機構を作らない）、ここでは測った事実だけを残す。
 * 変異は退避した控えからの書き戻しで復元した。
 */
export const SCAN_DIRS: readonly string[] = ['scripts', 'backend/src', 'frontend/src', 'e2e'];

/** 走査する拡張子 */
export const SCANNED_EXTENSIONS: readonly string[] = ['.ts', '.tsx'];

/**
 * 走査から外すディレクトリ（すべてビルド生成物・取得物）。
 *
 * `generated` は Prisma クライアントの出力で、版管理外（`backend/.gitignore` の
 * `generated/`）である。**手元には在るが取得直後の統合には無い**ため、外さないと
 * 報告する走査ファイル数が環境で変わり、記録した件数を後任が追試したときに合わない。
 * 除外は `scripts/check-requirement-exclusions.ts` の走査に前例がある。
 */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
  'generated',
]);

/** 走査根の配下から対象ファイルを列挙する */
export function collectSourceFiles(root: string, scanDir: string): string[] {
  const absoluteDir = path.join(root, scanDir);
  const files: string[] = [];
  const stack: string[] = [absoluteDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

// ============================================================================
// コメントの取り出し
// ============================================================================

/**
 * 一行の中で、**文字列リテラルの外に在る**最初のコメント開始位置を探す。
 *
 * 自己検査の見本はコメントの字面を文字列リテラルとして置くため、これを見ないと
 * 見本そのものが本検査に掛かる（本タスクの実装中に実際に 3 件掛かった）。
 * 引用符（`'` `"` バッククォート）の対応を行の先頭から数え、対応の外に在る
 * `//` と `/*` だけをコメントの開始として認める。
 *
 * **限界**: 状態は行をまたがない。複数行にわたるテンプレート文字列の途中の行に
 * `//` があると、コメントとして読む。走査の向きとしては過剰検出側であり、
 * 誤って告発された場合は引用を足すか字面を変えることで解ける。
 */
export function findCommentStart(line: string): { kind: 'line' | 'block'; index: number } | null {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote !== null) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '/' && line[index + 1] === '/') return { kind: 'line', index };
    if (character === '/' && line[index + 1] === '*') return { kind: 'block', index };
  }
  return null;
}

/**
 * ソースから連続するコメント行のまとまりを取り出す。
 *
 * 文字列リテラルの中は見ない（{@link findCommentStart}）。
 * 行の途中から始まる `//` は、直前が `:` のとき URL とみなして読み飛ばす。
 * コードの行を挟むとまとまりは切れる（引用が遠くの塊から借りられないようにするため）。
 */
export function extractCommentBlocks(source: string): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  const lines = source.split(/\r?\n/);
  let current: CommentBlock | null = null;
  let insideBlockComment = false;

  const append = (index: number, text: string): void => {
    if (current === null) current = { line: index + 1, lines: [] };
    current.lines.push(text);
  };
  const flush = (): void => {
    if (current !== null) {
      blocks.push(current);
      current = null;
    }
  };

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (insideBlockComment) {
      append(index, trimmed.replace(/^\*+\s?/, '').replace(/\*\/\s*$/, ''));
      if (trimmed.includes('*/')) {
        insideBlockComment = false;
        flush();
      }
      return;
    }
    const start = findCommentStart(rawLine);
    if (start === null) {
      flush();
      return;
    }
    const body = rawLine.slice(start.index);
    if (start.kind === 'block') {
      append(
        index,
        body
          .replace(/^\/\*+\s?/, '')
          .replace(/\*\/\s*$/, '')
          .trim()
      );
      if (body.includes('*/')) flush();
      else insideBlockComment = true;
      return;
    }
    const beforeComment = rawLine.slice(0, start.index);
    // コードの後ろに付いた `//` のうち、直前が `:` のものは URL とみなして読み飛ばす
    if (rawLine[start.index - 1] === ':') {
      flush();
      return;
    }
    append(index, body.slice(2).trim());
    // コードの後ろに付いた注釈は、そこで塊を切る（行頭の注釈だけが続きを持つ）
    if (beforeComment.trim().length > 0) flush();
  });
  flush();
  return blocks;
}

/** コメント塊の本文（行を空白で連結したもの） */
export function blockText(block: CommentBlock): string {
  return block.lines.join(' ');
}

/** 本文を句点で文へ割る */
export function splitSentences(text: string): string[] {
  return text
    .split('。')
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

// ============================================================================
// 判定の語彙
// ============================================================================

/**
 * 仮定した改変を述べる語。**実行時の条件（「条件が偽なら」）とは区別する**ため、
 * コードへの手当てを表す他動詞に限る。
 */
export const MUTATION_VOCABULARY: readonly string[] = [
  '外す',
  '外せ',
  '外し',
  '消す',
  '消せ',
  '落とす',
  '落とせ',
  '落とし',
  '戻す',
  '戻せ',
  '戻し',
  '書き戻',
  '変え',
  '置き換え',
  '替え',
  '書き換え',
  '無効化',
  '足す',
  '足し',
  '空にする',
  '空にすれ',
  '空にし',
  '反転させ',
  '変異させ',
  '変異を掛け',
  '変異を当て',
  '生きていれ',
  '残していれ',
  '逐語復元',
  '狭める',
  '狭めれ',
  '広げる',
  '広げれ',
];

/** 検査の実行結果を述べる語 */
export const VERDICT_VOCABULARY: readonly string[] = [
  '赤くなる',
  '赤になる',
  '赤に倒れる',
  '緑のまま',
  '緑で通る',
  '緑になる',
  '落ちる',
  '素通り',
  '検出される',
  '検出されない',
  '全件通過',
  '見逃す',
];

/** 実行したことを述べる語 */
export const EXECUTION_VOCABULARY: readonly string[] = [
  '実測',
  '測っ',
  '測り直',
  '走らせ',
  '実行し',
  '再現',
];

/** 逆引用符で囲まれたコード上の名前 */
const BACKTICKED_NAME = /`[^`\s][^`]*`/;

/** 変異の出力にあたる数字（半角・全角） */
const FIGURE = /[0-9０-９]/;

function includesAny(text: string, vocabulary: readonly string[]): boolean {
  return vocabulary.some((word) => text.includes(word));
}

/**
 * 語彙の差し替え口。**自己検査が語彙の一語だけを抜いて判定を測り直す**ために開けてある
 * （タスク 115.181 の教訓: 宣言だけあって固定の無い判断は、次の変更で黙って失われる）。
 * 本番の呼び出しは既定の語彙を用いる。
 */
export interface VocabularyOverride {
  mutation?: readonly string[];
  verdict?: readonly string[];
  execution?: readonly string[];
}

/**
 * (1) 逆引用符で囲まれたコード上の名前を持つか。
 *
 * 三条件はこの三つの述語（{@link hasBacktickedName} / {@link hasMutationWord} /
 * {@link hasVerdictWord}）だけが実装し、連言は {@link isCounterfactualSentence} だけが組む
 * （タスク 115.229）。以前は同じ三条件が当該述語と `collectNetSentences` の二箇所にあった。
 */
export function hasBacktickedName(sentence: string): boolean {
  return BACKTICKED_NAME.test(sentence);
}

/** (2) 仮定した改変を述べる語を持つか */
export function hasMutationWord(sentence: string, vocabulary: VocabularyOverride = {}): boolean {
  return includesAny(sentence, vocabulary.mutation ?? MUTATION_VOCABULARY);
}

/** (3) 検査の実行結果を述べる語を持つか */
export function hasVerdictWord(sentence: string, vocabulary: VocabularyOverride = {}): boolean {
  return includesAny(sentence, vocabulary.verdict ?? VERDICT_VOCABULARY);
}

/**
 * 一つの文が反実仮想か。三つの条件（名指し・変異・判定）をすべて満たすときに限る。
 *
 * **三条件の連言を組む唯一の場所**である。全文の列挙・三段階の集計・本検査の母集団は
 * いずれも {@link collectNetSentencesInSource} を通じてこの述語だけを見る。
 */
export function isCounterfactualSentence(
  sentence: string,
  vocabulary: VocabularyOverride = {}
): boolean {
  return (
    hasBacktickedName(sentence) &&
    hasMutationWord(sentence, vocabulary) &&
    hasVerdictWord(sentence, vocabulary)
  );
}

/**
 * コメント塊が実行の引用を持つか。実行を述べる語と数字の同居を求める。
 */
export function hasExecutionCitation(text: string, vocabulary: VocabularyOverride = {}): boolean {
  if (!includesAny(text, vocabulary.execution ?? EXECUTION_VOCABULARY)) return false;
  return FIGURE.test(text);
}

// ============================================================================
// 走査
// ============================================================================

/**
 * 判定の語を持つ一文と、その文がどの段に属するかの記録。
 *
 * **記録に「一件ずつ読んだ」と書くための列挙の出口**である。件数だけを出す
 * {@link surveyNet} では、後任が同じ読み直しを再現できない（タスク 115.210 の
 * 差し戻し 1 回目: 「反実仮想でないものは 1 文」という網羅の主張が 1 件ずれていた）。
 */
export interface NetSentence {
  /** リポジトリ相対のファイルパス */
  file: string;
  /** コメント塊の 1 始まりの開始行番号 */
  line: number;
  sentence: string;
  /** 同じ塊が実行の引用を持つか */
  cited: boolean;
  /** (1) 逆引用符の名指しを持つか */
  named: boolean;
  /** (2) 変異の語を持つか */
  mutated: boolean;
  /**
   * 三条件をすべて満たすか（{@link isCounterfactualSentence} の判定）。
   * 本検査の母集団・全文の列挙・三段階の最も狭い段は、いずれもこの印だけを見る。
   */
  counterfactual: boolean;
}

/**
 * 一つのソースから、判定の語を持つ文を三条件の印つきで取り出す。
 *
 * **三条件を実データへ当てる場所はここ一つである**（タスク 115.229）。本検査の母集団
 * （{@link RunResult.claims}）・検出（{@link scanSource}）・全文の列挙
 * （{@link listCounterfactualSentences}）・三段階の集計（{@link surveyNet}）は、いずれも
 * この列挙が付けた印から導かれる。したがって**現在の実装では**列挙と母集団は同じ印を
 * 数えており、三条件の数え方が二つに分かれていない。**ただし「構造だから将来も分かれない」
 * とまでは言えない**——再び別々に数え始めれば分かれる。その再発は自己検査
 * `checkNetSurveyMatchesTheCheck` が列挙と母集団を**件数ではなく同一性で**突き合わせて
 * 捕まえる（件数だけの突き合わせは同じ件数の別集合を素通りさせる。当てた変異と出力は
 * 当該の確認の docstring に引いた）。
 *
 * 一本化の前（タスク 115.229 の起票時点）は、三条件が {@link isCounterfactualSentence} と
 * 当時の {@link collectNetSentences} に二重に実装されていた。実測: 当時の
 * `isCounterfactualSentence` へ第四の条件（`FIGURE` の同居）を足す変異を当てると、母集団は
 * 52 件から 47 件へ落ちる一方で列挙は 52 文を印字し、両者は現に乖離した。一本化した現在
 * 同じ変異を当てると、母集団も列挙も 50 件で揃って動く（いずれも 2026-09-01 に実測。
 * 変異は退避した控えからの書き戻しで復元した）。
 */
export function collectNetSentencesInSource(relativePath: string, source: string): NetSentence[] {
  const rows: NetSentence[] = [];
  for (const block of extractCommentBlocks(source)) {
    const text = blockText(block);
    const cited = hasExecutionCitation(text);
    for (const sentence of splitSentences(text)) {
      if (!hasVerdictWord(sentence)) continue;
      rows.push({
        file: relativePath,
        line: block.line,
        sentence,
        cited,
        named: hasBacktickedName(sentence),
        mutated: hasMutationWord(sentence),
        counterfactual: isCounterfactualSentence(sentence),
      });
    }
  }
  return rows;
}

/**
 * 印つきの列挙から、引用を欠いた反実仮想の文を取り出す。
 * {@link run} と {@link scanSource} が**同じ実装**を通るようにするためのものである
 * （見本が駆動する {@link scanSource} が本検査の検出と別物にならないようにする。
 * タスク 115.227 の型）。
 */
function findingsFromNetSentences(rows: readonly NetSentence[]): CounterfactualFinding[] {
  return rows
    .filter((row) => row.counterfactual && !row.cited)
    .map((row) => ({ file: row.file, line: row.line, sentence: row.sentence }));
}

/**
 * 一つのソースに含まれる反実仮想の文の数。
 *
 * {@link run} は母集団を {@link collectNetSentences} から導くため本関数を経由しない。
 * 自己検査 `checkClaimCountIsHonest` が、走査の原始的な部品（{@link extractCommentBlocks} /
 * {@link splitSentences} / {@link isCounterfactualSentence}）で組んだ**独立の数え直し**と
 * 本関数および {@link RunResult.claims} を突き合わせるための窓口である。
 */
export function countCounterfactuals(source: string): number {
  return collectNetSentencesInSource('', source).filter((row) => row.counterfactual).length;
}

/** 一つのソースから、引用を欠いた反実仮想の文を検出する */
export function scanSource(relativePath: string, source: string): CounterfactualFinding[] {
  return findingsFromNetSentences(collectNetSentencesInSource(relativePath, source));
}

/** 網の広さの一段分の集計 */
export interface NetSurveyTier {
  /** 条件を満たした文の数 */
  sentences: number;
  /** それらを含むファイルの数 */
  files: number;
  /** うち、実行の引用を持つ塊に属する文の数 */
  cited: number;
}

/**
 * 網の広さの三段階。**記録に書いた件数の追試手段を成果物に残すための出口**である
 * （タスク 115.189 の教訓: 追試の手段を残せない実測は記録に書かない）。
 * 本検査が採るのは最も狭い {@link NetSurveyTier} である `allThree` で、その文の数は
 * {@link RunResult.claims} と一致する。タスク 115.229 以降、両者は同じ列挙
 * （{@link collectNetSentences}）が付けた同じ印（{@link NetSentence.counterfactual}）を
 * 数えるため、**現在の実装では**一致が構造から出ている。**ただし「構造だから将来も
 * 分かれない」とまでは言えない**——{@link surveyNet} が段を積むときに独自の絞りを足せば
 * 分かれる。この立場は {@link collectNetSentencesInSource} の注釈と同じである
 * （タスク 115.264 で論調を揃えた）。
 *
 * その分岐は自己検査 `checkNetSurveyMatchesTheCheck` が最も狭い段と母集団を突き合わせて
 * 捕まえる。実測: {@link surveyNet} の段を積む条件へ絞りを足す変異
 * （`row.counterfactual` を `row.counterfactual && row.sentence.length < 200` へ変える）を
 * 当てると、自己検査のうち落ちるのは当該の 1 件だけで、「最も狭い段が本検査の母集団と
 * 一致しない（本検査 109 / 三段階 91）」と告げる（コミット `6b7d3e83` へ本注釈の
 * 書き換えを載せた作業ツリーで 2026-09-04 に実測。変異は退避した控えからの書き戻しで
 * 復元した）。
 */
export interface NetSurvey {
  scannedFiles: number;
  /** (3) 検査の判定を述べる語だけを見る段 */
  verdictOnly: NetSurveyTier;
  /** (2)+(3) 変異の語と判定の語を見る段 */
  mutationAndVerdict: NetSurveyTier;
  /** (1)+(2)+(3) 名指しを加えた段（本検査が採る形） */
  allThree: NetSurveyTier;
}

/** 走査根の配下のすべてのソースから、判定の語を持つ文を印つきで集める */
export function collectNetSentences(options: RunOptions = {}): NetSentence[] {
  const root = options.root ?? ROOT;
  const scanDirs = options.scanDirs ?? SCAN_DIRS;
  const rows: NetSentence[] = [];
  for (const scanDir of scanDirs) {
    for (const relativePath of collectSourceFiles(root, scanDir)) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
      rows.push(...collectNetSentencesInSource(relativePath, source));
    }
  }
  return rows;
}

/** 本検査が採る形（三条件をすべて満たす文）だけを取り出す */
export function listCounterfactualSentences(options: RunOptions = {}): NetSentence[] {
  return collectNetSentences(options).filter((row) => row.counterfactual);
}

export function surveyNet(options: RunOptions = {}): NetSurvey {
  const root = options.root ?? ROOT;
  const scanDirs = options.scanDirs ?? SCAN_DIRS;

  const tiers = {
    verdictOnly: { sentences: 0, files: new Set<string>(), cited: 0 },
    mutationAndVerdict: { sentences: 0, files: new Set<string>(), cited: 0 },
    allThree: { sentences: 0, files: new Set<string>(), cited: 0 },
  };
  let scannedFiles = 0;
  for (const scanDir of scanDirs) {
    scannedFiles += collectSourceFiles(root, scanDir).length;
  }

  for (const row of collectNetSentences({ root, scanDirs })) {
    const matched = [
      tiers.verdictOnly,
      ...(row.mutated ? [tiers.mutationAndVerdict] : []),
      ...(row.counterfactual ? [tiers.allThree] : []),
    ];
    for (const tier of matched) {
      tier.sentences += 1;
      tier.files.add(row.file);
      if (row.cited) tier.cited += 1;
    }
  }

  const freeze = (tier: (typeof tiers)['allThree']): NetSurveyTier => ({
    sentences: tier.sentences,
    files: tier.files.size,
    cited: tier.cited,
  });
  return {
    scannedFiles,
    verdictOnly: freeze(tiers.verdictOnly),
    mutationAndVerdict: freeze(tiers.mutationAndVerdict),
    allThree: freeze(tiers.allThree),
  };
}

/**
 * 本検査の母集団と検出を出す。**母集団は {@link collectNetSentences} の列挙から導く**
 * （タスク 115.229）。
 *
 * 一本化の前は本関数が {@link countCounterfactuals} と {@link scanSource} を経由して独自に
 * 数えており、全文の列挙と母集団は別々の実装で数えられていた。当時、両者の一致を担保して
 * いたのは構造ではなく自己検査 `checkNetSurveyMatchesTheCheck` 単独である。実測: 列挙の側
 * だけを狭める変異（当時の `listCounterfactualSentences` の絞りへ `row.sentence.length < 200`
 * を足す）を当てると、自己検査 65 件のうち落ちるのは当該の 1 件だけで、その 1 件を外すと
 * 64/64 で緑になり本検査も合格を出した（2026-09-01 に実測。変異は退避した控えからの
 * 書き戻しで復元した）。
 */
export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const scanDirs = options.scanDirs ?? SCAN_DIRS;

  const filesByScanDir: Record<string, number> = {};
  let scannedFiles = 0;
  for (const scanDir of scanDirs) {
    const files = collectSourceFiles(root, scanDir);
    filesByScanDir[scanDir] = files.length;
    scannedFiles += files.length;
  }

  const rows = collectNetSentences({ root, scanDirs });

  return {
    findings: findingsFromNetSentences(rows),
    scannedFiles,
    filesByScanDir,
    claims: rows.filter((row) => row.counterfactual).length,
  };
}

// ============================================================================
// 実行
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');
  const survey = args.includes('--survey');
  const listAll = args.includes('--list');

  const result = run();

  // 「35 文を一件ずつ読んだ」という網羅の主張を、後任がそのまま再現できるようにする出口
  if (listAll && !json) {
    const rows = listCounterfactualSentences();
    console.log(`本検査が照合する反実仮想の全文（${rows.length} 文）`);
    rows.forEach((row, index) => {
      console.log(
        `${String(index + 1).padStart(3, ' ')}. ${row.file}:${row.line}` +
          `（引用${row.cited ? 'あり' : 'なし'}）`
      );
      console.log(`     ${row.sentence}`);
    });
    console.log('');
  }

  // 記録に書いた三段階の件数を、後任がそのまま数え直せるようにする出口
  if (survey && !json) {
    const net = surveyNet();
    console.log(`網の広さの三段階（走査 ${net.scannedFiles} ファイル）`);
    for (const [label, tier] of [
      ['(3) 判定の語だけ            ', net.verdictOnly],
      ['(2)+(3) 変異＋判定          ', net.mutationAndVerdict],
      ['(1)+(2)+(3) 名指し＋変異＋判定', net.allThree],
    ] as const) {
      console.log(
        `  ${label}: ${tier.sentences} 文 / ${tier.files} ファイル` +
          `（引用あり ${tier.cited} 文・引用なし ${tier.sentences - tier.cited} 文）`
      );
    }
    console.log('');
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗
  if (result.scannedFiles === 0) {
    if (!json) {
      console.error('❌ 走査対象のソースが一件も見つかりませんでした');
      console.error(`   走査根: ${SCAN_DIRS.join(', ')}`);
      console.error(
        '   リポジトリルートで実行しているか、走査根が変わっていないか確認してください'
      );
    }
    process.exit(1);
  }

  // 前提条件で検査を無効化しない: 走査根のどれかが空なら、その根は遊んでいる（115.227）
  const emptyScanDirs = Object.entries(result.filesByScanDir)
    .filter(([, count]) => count === 0)
    .map(([scanDir]) => scanDir);
  if (emptyScanDirs.length > 0) {
    if (!json) {
      console.error('❌ 対象ファイルが一件も無い走査根があります');
      console.error(`   該当: ${emptyScanDirs.join(', ')}`);
      console.error('   走査根が移動・改名された場合は SCAN_DIRS を追随させてください');
    }
    process.exit(1);
  }

  // 前提条件で検査を無効化しない: ソースは在るのに反実仮想が一件も取れないなら、
  // 検出規則が壊れている（走査の空振り）。0 件の合格は合格ではなく失敗とする
  if (result.claims === 0) {
    if (!json) {
      console.error('❌ ソースは在るのに、引用を照合できる反実仮想の記述が一件もありません');
      console.error(`   走査 ${result.scannedFiles} ファイル`);
      console.error('   名指し・変異・判定の三条件で文を取り出す規則が壊れている疑いがあります');
    }
    process.exit(1);
  }

  if (result.findings.length > 0) {
    if (!json) {
      console.error('❌ 実行した変異を引かない反実仮想の記述があります');
      console.error('');
      console.error('   「この変異なら赤くなる／緑のままだ」を実行せずに書くと、後任が誤診します');
      console.error('   （タスク 115.168 / 115.170 / 115.171 で三度起きました）。');
      console.error('   変異を実際に当て、当てた変異と出力（落ちた件数・実測した日付）を');
      console.error('   同じコメントに書いてください。書けないなら反実仮想を書かないでください。');
      console.error('');
      const byFile = new Map<string, CounterfactualFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        console.error(`   ${file} (${list.length}件)`);
        for (const finding of list) {
          const preview =
            finding.sentence.length > 100 && !verbose
              ? `${finding.sentence.slice(0, 100)}…`
              : finding.sentence;
          console.error(`     L${finding.line}: ${preview}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル` +
          `（走査 ${result.scannedFiles} ファイル、反実仮想 ${result.claims} 件）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ 反実仮想の記述はすべて実行した変異を引いています（走査 ${result.scannedFiles} ファイル: ` +
        `${SCAN_DIRS.join(' / ')}、引用を照合した反実仮想 ${result.claims} 件）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
