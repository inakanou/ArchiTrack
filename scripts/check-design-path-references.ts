/**
 * @fileoverview 設計文書が挙げるパス・ファイル名の**実在**検査
 *
 * タスク 115.149 が置いた `check-design-code-reference-format.ts` は、設計文書から本番コードへの
 * 参照の**形式**（行番号で指していないか）だけを見る。同スクリプトが限界として明記するとおり、
 * **実在しないファイルを指す参照は形式が正しければ通過する**。タスク 115.169 が置いた
 * `check-steering-file-references.ts` は実在を見るが、対象は `.kiro/steering/*.md` に限られる。
 * 本スクリプトはその二つの穴の交点——**設計文書（`.kiro/specs/<feature>/design.md`）が挙げる
 * パスの実在**——を所管する（タスク 115.173）。
 *
 * ## steering と設計文書の違い（なぜ 115.169 の判断をそのまま使えないか）
 *
 * 115.169 は「steering は現在の構成の記述であり歴史記録ではないので、挙げたファイルは全件が
 * 現存主張である」と判断できた。**設計文書ではこれが成立しない。** 設計文書は当時の判断を
 * 意図して保存する歴史記録であり、`site-survey/design.md` は撤去済みのファイルを
 * 「撤去した」という記録として名指しで残している（タスク 115.85 / 115.107 / 115.146 / 112.1）。
 * これらを告発する検査は、記録を消させる圧力になるため成立しない。
 *
 * したがって本検査は**現存主張と撤去の記録を区別する**。区別の手掛かりは発明ではなく、
 * 実データにあるものを使う: 設計文書は撤去したファイルについて、**そのファイルを名指しつつ
 * 不在を述べる行**を必ず一つ持っている（「撤去済み」「削除」「実在しない」など）。
 * 着手時の実測（13 文書・候補トークン 1251 件）では、実在しないパス参照は延べ 80 件あり、
 * うち 73 件が同じ文書内に不在の記録を持っていた（`site-survey/design.md` 71 件、
 * `estimate-creation/design.md` 1 件、`estimate-request/design.md` 1 件）。記録を持たない
 * 7 件は**すべて真の失効**であり、タスク 115.173 で是正した。免除した 73 件のうち 72 件は
 * 実際に撤去・削除の記録であり、残る 1 件だけが誤った免除である（下の限界の一つ目）。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-path-references.ts [--verbose] [--json]
 *   npm run check:design-path-refs
 *   npm run check:design-path-refs:update [-- --allow-increase]   免除の面の基準を書き出す
 *   npm run check:design-path-refs:selftest                        検出規則と関門の自己検査
 *
 * ## 検出する形（いずれも「このパス／ファイルが在る」と述べている形）
 *
 *   (1) **ルート相対パス**: バッククォートで囲まれた文字列**全体**が
 *       `[A-Za-z0-9_.@-]+(/[A-Za-z0-9_.@-]+)+` に一致し、先頭セグメントがリポジトリ最上位の
 *       エントリ名（`EXCLUDED_DIRECTORIES` を除いた実ディスクの直下エントリ。**版管理下とは
 *       限らない**）と一致し、末尾セグメントが拡張子を持つもの。
 *       版管理下に無い最上位エントリも索引に入る（実測: `.env` 系・`.logs` 等 8 件）。
 *       未追跡ファイルによってのみ実在と判定される候補は実測 0 件だが、**未追跡の新規ファイル
 *       を指す参照は commit 前でも通る**——これは見逃し側の限界である。
 *       例: `` `frontend/src/pages/SiteSurveyDetailPage.tsx` ``
 *       **この形に拡張子の絞りは無い。** `.js` / `.jsx` / `.yml` / `.sql` / `.prisma` などを
 *       指す参照も同じく照合する（115.169 の拡張子の絞りが残した穴——後続 115.199——を
 *       本形式では持ち込まない）。先頭セグメントの条件がライブラリ名・MIME 型・要件タグを
 *       落とすため、絞りを入れなくても誤検出が出ないことを実測で確かめてある。
 *
 *   (2) **裸のファイル名**: バッククォートで囲まれた文字列全体が
 *       `[A-Za-z0-9_@-][A-Za-z0-9_@.-]*` かつ拡張子が `BARE_NAME_EXTENSIONS` のもの。
 *       例: `` `ImageViewer.tsx` ``。設計文書は「同ディレクトリの別部品」を裸の名前で書くため、
 *       この形を落とすと撤去済み部品への参照の大半を取り逃がす（着手時の実測で 28 件）。
 *       照合はリポジトリ内に**同じ basename のファイルが一つでも在るか**で行う。
 *
 * ## 免除する形（撤去の記録。実在の主張ではない）
 *
 *   参照 R が実在しないとき、**同じ設計文書の中に「R の不在を述べている行」が一つでもあれば**
 *   R への参照は検出しない。不在を述べている行とは、不在の語（`ABSENCE_MARKERS`）を含み、
 *   かつ R と同じファイルを名指している行である（ルート相対パスは完全一致、裸のファイル名は
 *   同じ basename を持つルート相対パスでも足りる）。
 *
 *   **文書全体を免除の範囲に採ったのは、設計文書が実際にその書き方をしているからである。**
 *   `site-survey/design.md` は撤去の事実を「実在照合の基準線」小節と当該部品の節で一度ずつ
 *   記録し、他の 20 箇所以上の言及は当時の判断のまま残している。行ごとに不在を書き足させる
 *   規則にすると、記録の本文を書き換えさせることになる（タスク 115.169・115.172 が確立した
 *   「歴史記録は書き換えない」基準に反する）。
 *
 *   **これは許容リストではない。** 名指しで逃がす経路は一切無く、免除されるかどうかは
 *   文書が不在を述べているかだけで決まる。免除を得る方法は「撤去を記録に書く」ことであり、
 *   それはタスク 115.169 が残した教訓「部品を消すときは、その部品を指す記述を同じ変更で
 *   数え上げること」を文書側で機械化したものである。
 *
 * ## 免除機構の「面」の実測と監視（タスク 115.215）
 *
 *   115.173 は上の限界（一度でも不在を記録すれば、その文書内の同じファイルへの言及は
 *   すべて免除される）を**言葉では開示したが、規模を測っていなかった**。開示した数は
 *   「不在の明記により免除 N 件」——**いま免除されている件数**であって、免除機構がどれだけの
 *   参照を射程に収めているかではない。115.168 の教訓「測らずに断言した否定は、そのまま検査で
 *   固定される」と同じ穴である。
 *
 *   そこで二つの数を分けて出す。どちらも合否と独立に毎回出力する。
 *
 *   - **面（reach）**: いま**実在しながら**、同じ文書の不在を述べる行に名指されている参照の
 *     distinct 件数。そのファイルが撤去された瞬間、同じ文書内の全言及が無言で免除へ移る。
 *     すなわち免除機構の blast radius である。母数は同じ走査から取った候補の distinct 件数。
 *   - **免除（exempted）**: いま免除している参照の延べ件数。面が現に免除へ転じた分もここに入る。
 *
 *   **両方を見張らないと素通りする向きがある。** 面に入っているファイルを撤去すると、面は
 *   **減り**、免除が跳ねる。面だけを基準にすると、この向きは「狭まった」という助言に化ける。
 *   `frontend/src/components/site-surveys/AnnotationEditor.tsx` を消す変異を当てると本検査は
 *   赤くなるが、115.173 の版では同じ変異でも緑のまま素通りしていた。
 *   2026-08-31 にリポジトリルートで実測した内訳は次のとおり——
 *   `.kiro/specs/site-survey/design.md` の免除は 122 件から 161 件へ増え、面は 131 件から
 *   129 件へ減り、基準との照合で exit 1 になる。115.173 の版（コミット `7da4861` の本ファイル。
 *   基準を持たない形）を同じツリーで走らせると、免除だけが 123 件から 162 件へ動き、
 *   exit 0 のまま「合格」が出ていた。変異は退避した控えからの書き戻しで復元し
 *   `md5sum -c` で一致を確認した（復元後の実行は exit 0）。
 *   **版の手掛かりに日付だけを使わない**——本リポジトリは同じ日に複数のタスクが着地する。
 *
 *   **起票時（115.173 の時点）の数は既に古い。** タスク 115.215 の起票文は面 160 件 /
 *   候補 543 件（29.5%）・`site-survey` 単独 128 件 / 277 件（46%）・免除 72 件を引くが、
 *   コミット `7da4861` のツリーで測り直すと面 162 件 / 候補 574 件（28.2%）・`site-survey`
 *   単独 131 件 / 308 件（42.5%）・免除 123 件である（2026-08-31 にリポジトリルートで実測）。
 *   起票以降の 115.204 / 115.212 / 115.213 が設計文書を編集したためである。**これらの数は
 *   本注釈では歴史記録としてのみ持ち、現況は毎回の出力と基準に読ませる。**
 *
 *   **面には「別事由の不在の語」で偶発的に入る参照も含まれる**（上の限界(a)と同根であり、
 *   面はその影響も込みで数えた値である）。本タスクで実際に起きた: 設計文書へ
 *   `scripts/design-path-exemption-baseline.json` を名指す一節を足したところ、その行が
 *   別の文脈で「撤去」の語を含んでいたため面が 131 件から 132 件へ動き、本検査が exit 1 に
 *   なった。名指しを `DEFAULT_BASELINE_PATH` へ置き換えて 131 件へ戻した（2026-08-31 に実測）。
 *
 *   **基準は `DEFAULT_BASELINE_PATH` に置く。** 面・免除のいずれかが文書単位で基準を超えたら
 *   exit 1 とする。減った場合は助言のみ（基準の更新を促す）。内訳の合計と総数が食い違う基準は
 *   手で書き換えられた疑いがあるため、照合の前に拒否する。
 *
 *   **基準を静かに書き直せる仕組みは監視ではない。** `--update-baseline` は面・免除が増える
 *   方向の書き出しを既定で拒否し、`--allow-increase` の明示を要求する。
 *
 *   面の母数（候補の distinct 件数）は記録するが**合否には用いない**。設計文書は編集のたびに
 *   候補が増減するため、母数を関門にすると文章の増減そのものが赤を出す。比の開示に留める。
 *
 *   **面は「参照トークン」単位の distinct で数える——ファイル単位ではない。** 同じファイルが
 *   ルート相対パスと裸のファイル名の両方で名指されていれば **2 件**を占める
 *   （`collectAbsenceDeclarations` がルート相対パスとその basename の双方を宣言集合へ入れ、
 *   `scanDocument` は `claim.reference` を逐語で面へ加えるため）。
 *   **したがって出力の「免除機構の面 N 件」を撤去され得るファイル数として読んではならない。**
 *   撤去されたときに無言になる言及の**延べ数**は、さらに面より大きい（
 *   `frontend/src/components/site-surveys/AnnotationEditor.tsx` を消す変異の実測では、
 *   面が 2 件減る一方で免除は 39 件増えた。2026-08-31 にリポジトリルートで実測）。
 *   115.215 は実体の数を JSDoc の実測値としてだけ持ち、**追試の手順**として
 *   `npm run check:design-path-refs:json` の `reach.documents[].reached` を自分で束ねることを
 *   求めていた。その手順は `bundleReachEntities` として本ファイルに入り、毎回の出力が持つ
 *   （タスク 115.241。下の節）。
 *
 * ## 開示と関門の穴を塞ぐ（タスク 115.241）
 *
 *   115.215 のレビューが非ブロッキングとして七つの穴を挙げた。以下は各々の決着である。
 *   数値はいずれも 2026-09-02 にリポジトリルートで実測した（基点はコミット `106bfda`。
 *   本タスクは `.kiro/specs/<feature>/design.md` を一行も変えないため、着手前後で面・候補・免除は動かない）:
 *   面 162 件 / 候補 distinct 592 件（27.4%）/ 実体 123 件 / 免除 123 件。
 *
 *   **(1) 実体の件数を毎回の出力に出す。** 115.215 は「自己検査の制御を伴わない計算値を
 *   関門へ増やす」ことを避けて見送っていた。本タスクは `bundleReachEntities` を置き、
 *   同時に自己検査へ制御を置いた——面 2 件から実体 1 件（同一ファイルの二通りの綴り）と
 *   実体 2 件（同じ basename の別実体）の双方を導く対である。`bundleReachEntities` が
 *   `reached.length` を返す変異を当てると自己検査は 2/38 件で赤くなる（2026-09-02 に実測）。
 *
 *   **(2) 裸の名前だけで面に入る参照の曖昧性を開示する。** 裸の名前は basename しか照合せず、
 *   面から外れるのは同名の一致が**全て**消えたときだけである。実体の束ねはこれを 1 件に畳むため、
 *   畳んだ分を必ず併記する。実測では面に入る裸の参照のうち 3 件が複数の実在に一致していた——
 *   `site-survey/design.md` の `index.ts` が 12 件、`quantity-table-generation/design.md` の
 *   `calculation-engine.ts` が 2 件、`estimate-request/design.md` の
 *   `EstimateRequestForm.test.tsx` が 2 件である（2026-09-02 に実測）。
 *   `FileIndex.names` は 1 件以上かどうかしか答えないため、`FileIndex.nameCounts` を足した。
 *
 *   **(3) 開示は測った値を述べる形にした。** 115.215 の出力は「面の件数は撤去され得る
 *   ファイルの数より多い」という**無条件の狭義の不等式**を毎回述べていた。両方の綴りで
 *   名指されたファイルが一つも無い木では偽になる——面 1 件・実体 1 件だけを持つ使い捨ての木で
 *   115.215 の版を走らせると、この一文がそのまま出た（2026-09-02 に実測）。
 *   現在は「実体のファイルは N 件で、残る M 件は既に数えたファイルの別表記である」と
 *   測った値だけを述べる。
 *
 *   **(4) 実在検査に失格があるツリーでは基準を更新しない。** 115.215 の `execute()` は
 *   `result.findings.length > 0` でも更新経路が `0` を返し、失格の赤を出したうえで
 *   「基準を更新しました」と成功を報告して書き出していた——失格 1 件を持つ使い捨ての木で
 *   `--update-baseline --allow-increase` が exit 0 を返し基準ファイルが生成されることを
 *   実測した（2026-09-02）。落ちている木で測った面を基準へ焼き付ければ、次回以降その面が
 *   正当な現況として扱われる。現在は更新そのものを拒否する。
 *
 *   **(5) 基準は面の集合を持つ。** 115.215 の基準は文書ごとの**件数**だけを持っていたため、
 *   同一文書内で 1 件が抜け 1 件が入る**入れ替え**はどちらの件数も動かず素通りした——
 *   面 1 件の使い捨ての木で名指す現存ファイルを別のものへ差し替えると exit 0 のままだった
 *   （2026-09-02 に実測）。現在は `documents` が参照トークンの配列を持ち、`compareReach` が
 *   集合の差を取る。同じ変異は exit 1 になる。件数だけを持つ 115.215 形式の基準は
 *   「面 0」と解さずに拒否する（読めない基準を無言の合格へ落とさないため）。
 *
 *   **(6) 母数（`candidateTotal`）は関門にしない——比の開示を基準時と並べる形にした。**
 *   比そのものを関門にする形は検討したうえで採らなかった。理由は 115.215 と同じである:
 *   設計文書は編集のたびに候補が増減するため、母数を含む量を関門にすると文章の増減そのものが
 *   赤を出す。**代わりに信号を置いた**——出力は現在の比と併せて基準記録時の母数と比を出す。
 *   本タスクの着手時点で、基準の母数は 574 件（比 28.2%）、実測の母数は 592 件（比 27.4%）で
 *   あり、面が一件も動かないまま比が 0.8 ポイント薄まっていた（2026-09-02 に実測）。
 *   115.215 の版はこの差を一切出していなかった。**残る限界**: 基準を更新すると母数も
 *   書き換わるため、薄まりが見えるのは前回の更新からの差だけである。
 *   **この限界はタスク 115.293 が追記のみの履歴で解消した**（下の節）。
 *
 * ## 免除の側にも集合を持たせ、母数は関門にしない（タスク 115.293）
 *
 *   115.241 は面（reach）の側だけを集合にした。免除（exempted）の側は延べ件数のままであったため、
 *   面について 115.241 が塞いだ「1 件が抜け 1 件が入る入れ替え」の穴が、免除の側にはそのまま残っていた。
 *
 *   **(1) 判断: 延べと集合の両方を持つ（数え方は変えない）。** 実測で決めた——
 *   免除は延べ 123 件に対し distinct は **30 件**であり、差は **93 件**である
 *   （内訳は `.kiro/specs/site-survey/design.md` が延べ 122 / distinct 29、
 *   `.kiro/specs/estimate-creation/design.md` が延べ 1 / distinct 1。2026-09-05 にリポジトリルートで実測）。
 *   延べの大半は同じ参照への繰り返しの言及であり（最多は `ImageViewer.tsx` の 20 行）、
 *   **数え方を distinct へ置き換えると 93 件ぶんの動きが見えなくなる**。
 *   一方で延べだけでは入れ替えが素通りする。**二つは互いに包含関係を持たない**——
 *   同じ参照への言及が一つ増えると延べだけが動き、参照が入れ替わると集合だけが動く。
 *   したがって両方を持ち、両方を関門に掛ける。
 *   `exempted` に件数がある文書は `exemptedReferences` にも集合を持たねばならない
 *   （集合だけを消して関門を外す経路を塞ぐ。`compareReach` が照合の前に拒否する）。
 *
 *   **(2) 判断: 母数（`candidateTotal`）は関門にしない。開示に留める。**
 *   115.215 の却下理由（設計文書の編集そのものが赤を出す）が**今も成立することを変異で確かめた**——
 *   `.kiro/specs/site-survey/design.md` へ、実在するファイルを二つ名指すだけの一行
 *   （面にも免除にも入らない普通の記述）を足すと、母数は 609 件から 611 件へ、
 *   比は 27.1% から 27.0% へ動く。面は 165 件のまま一件も動かない
 *   （2026-09-05 にリポジトリルートで実測）。母数や比を関門に掛ければ、**この一行が赤を出す**。
 *   比が下がる向きだけを関門にしても同じである——薄まりは面の増加ではなく記述量の増加で起きるためである。
 *   **選ばなかった案**: (a) 母数の完全一致を関門にする（上の一行で赤くなる）。
 *   (b) 比の下限を関門にする（同上。かつ閾値の根拠が無い）。
 *   (c) 母数の増分に上限を置く（閾値が恣意的で、通常の加筆で跳ねる）。
 *
 *   **(3) ただし「見えるのは前回の更新からの差だけ」という限界は解消した。**
 *   基準へ**追記のみ**の履歴 `candidateHistory` を持たせ、毎回の出力が**起点からの薄まり**を出す。
 *   起点の三点は版管理から復元した（`git log -- scripts/design-path-exemption-baseline.json` の
 *   各版の `candidateTotal`）: 2026-08-31 に面 162 / 母数 574（28.2%）、
 *   2026-09-02 に面 162 / 母数 592（27.4%）、2026-09-05 に面 165 / 母数 603（27.4%）である。
 *   `writeReachBaseline` は前回の履歴を読んで末尾へ追記する（値が同じなら追記しない）。
 *   履歴の末尾が `reachTotal` / `candidateTotal` と食い違う基準は照合の前に拒否する——
 *   履歴を空にしたり末尾を書き換えたりして薄まりを見えなくする経路を塞ぐため。
 *   **残る限界（開示）**: 履歴の**途中の項を消す**書き換えは検出できない。基準ファイルは
 *   人手で編集できる版管理下の成果物であり、末尾の自己整合より前は版管理の差分でしか見えない。
 *
 *   **(7) 開示と基準の読み書きも絞り込みの監視対象に入れた。** 115.215 は
 *   `loadReachBaseline` / `writeReachBaseline` / `reportReach` / `main` を
 *   自己検査の `checkNoFindingsNarrowing` の外に置いていた。`reportReach` は
 *   「文書 X を開示から隠す」絞り込みが最も自然に入る場所である——同関数の文書ごとの
 *   繰り返しの冒頭へ、設計文書のパスを文字列リテラルで名指して `continue` する一行を
 *   足す変異を当てても、115.215 の版の自己検査は 35/35 件で緑のままだった
 *   （2026-09-02 に実測。変異の逐語は自己検査の網に掛からないよう本注釈へは写さない——
 *   `checkNoFindingsNarrowing` は注釈を除いたソースを見るため掛からないが、
 *   後任が本注釈の文字列を検索して実体と取り違えることを避ける）。
 *   自己検査の許容リスト検出は拡張子を `.tsx?` 系に絞っていたため設計文書の `.md` を
 *   取り逃がしていた。`.md` を網へ足し、`reach.documents` を間引く形も見るようにした。
 *   同じ二つの変異は現在いずれも自己検査を赤くする（2026-09-02 に実測）。
 *
 * ## 検出しない形（限界。見逃し側。いずれも実測に基づく）
 *
 *   - **不在の語が何を指すかまでは見ない。** 着手時の実測で `estimate-request/design.md` の
 *     File Structure Plan の一行が該当した。当該行は区分が `Modified`（=現存主張）で
 *     ありながら、備考の「必須前提 422 ケースを削除」の `削除` が不在の語に当たるため、
 *     同じ行が名指すパスは「不在を述べた行」と誤って解釈され免除される。
 *     **語が何を指すかは機械では判らない**ため、この向きの誤りは残る（本タスクでは当該
 *     一件を人手で是正したうえで、変異を戻して検出されないことを実測した）。
 *   - **一度でも不在を記録すれば、その文書内の同じファイルへの参照はすべて免除される。**
 *     撤去を一箇所に記録し、他の言及を当時のまま残す書き方をそのまま許すということである。
 *     読み手が免除された箇所だけを読んだときに撤去を知る保証は無い。これは
 *     「歴史記録を書き換えない」基準と引き換えに受け入れた見逃しである。
 *   - **裸のファイル名は拡張子を `BARE_NAME_EXTENSIONS` に絞る。** 絞りの根拠は実測である:
 *     設計文書の裸トークンでこの絞りを外して `.js` / `.prisma` などまで広げると、
 *     真の失効は **1 件も増えず**、誤検出だけが 5 件（`this.prisma` 3 件、`decimal.js` /
 *     `Decimal.js` 2 件）増えた。設計文書は `Class.method` / `object.property` を裸トークンで
 *     多用するため、拡張子が広いほど属性アクセスを拾う。ルート相対パス（形(1)）には
 *     この絞りを適用しない。
 *   - **裸のファイル名は basename しか照合しない。** ディレクトリの移動は検出しない
 *     （115.169 と同じ判断。字下げや文脈からパスを組み立てると在るファイルを誤って告発する）。
 *     **免除の面にも同じ曖昧性が及ぶ**——裸の名前で面に入った参照が面から外れるのは、
 *     同名の実在が全て消えたときだけである。該当は毎回の出力が件数と最大の一致数で開示する
 *     （タスク 115.241。実測では 3 件・最大 12 件の一致。2026-09-02）。
 *   - **ディレクトリの参照（末尾が `/`、または末尾セグメントに拡張子が無いもの）は照合しない。**
 *     実測では該当 31 件のうち実在しないのは 1 件（`backend/coverage/`）で、それは
 *     `.gitignore` された生成物への正当な言及であった。生成物の有無で結果が変わる検査は
 *     再現しないため、ディレクトリは対象から外す。
 *   - **フェンスで囲まれたコードブロックの中は見ない。** 実測では該当トークンは 1 件のみで、
 *     しかも実在するため、着手時点の結果はこの除外に依存しない。
 *   - **`*` / `<` / `>` / `{` / `}` を含むトークンは対象外。** `site-survey/design.md` の
 *     呼称規約7 が定めるプレースホルダ表記であり、実体を指していない。
 *   - **`design.md` 以外の文書は見ない。** `requirements.md` / `tasks.md` は対象外である。
 *   - **シンボル名（型名・関数名）の実在は見ない。** 根拠は実測である:
 *     `site-survey/design.md` は「実装に実体を持たない契約名（設計上の抽象契約）」を
 *     **意図して**定義しており、その一覧は同書の「契約名の実在対照表」に置かれている。
 *     どの名前が意図的な不在かは名前の見た目から判別できない（同書自身が
 *     「`IAuditLogService` は実在し `ISurveyService` は実在しない。どちらも同じ `I*Service` 表記」
 *     と述べる）。機械で区別するには当該表を権威として読むほかなく、それは許容リストである。
 *     したがってシンボルは本検査の対象外とし、steering 側の同型の課題（後続 115.198）と
 *     揃えて所管を分ける。
 *
 * ## 検出しすぎる可能性（限界。過検出側）
 *
 *   - **これから作るファイルを現在形で挙げると検出される。** 設計文書は計画の文書であり、
 *     未作成のパスを挙げることがある。着手時の実測では、この形の該当 7 件はいずれも
 *     「計画のまま作られず、実装は別のパスへ行った」失効であって、**作成待ちの計画は
 *     一件も無かった**。作成待ちのパスを書くときは、その旨を同じ記述単位に書けば
 *     免除される（`ABSENCE_MARKERS` に `未作成` / `新設予定` を含めてある）。
 *   - **撤去の記録に不在の語を書き忘れると検出される。** これは意図した挙動である。
 *     記録の側へ一語足すことで、後任が存在しないパスへ導かれなくなる。
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   走査対象の設計文書が一件も見つからない場合は「合格」ではなく失敗として扱う。
 *   **実在の判定に許容リストは持たない。** 検出を名指しで逃がす経路そのものを置かない。
 *   `DEFAULT_BASELINE_PATH` の基準は実在の判定には一切関与せず、免除の面と免除件数の
 *   増減だけを見張る（基準が無い場合は「面 0・免除 0」として扱うため、増加として落ちる）。
 *   基準の `documents` が面の集合として読めない場合も「面 0」とは解さず、照合の前に拒否する
 *   （タスク 115.241。読めない基準を無言の合格へ落とさないため）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

/** 参照の書き方 */
export type ReferenceKind = 'qualified-path' | 'bare-filename';

export interface DesignPathFinding {
  /** リポジトリ相対の設計文書パス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 実在しないと判定した記載 */
  reference: string;
  /** 参照の書き方 */
  kind: ReferenceKind;
  /** 検出行の内容（前後の空白を除く） */
  snippet: string;
}

export interface RunOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** 設計文書の置き場所（リポジトリ相対） */
  specDir?: string;
  /** 免除の面の基準の位置。省略時は `DEFAULT_BASELINE_PATH`（自己検査から使い捨ての基準を渡す） */
  baselinePath?: string;
}

/** 一つの設計文書における免除の面の実測 */
export interface DocumentReach {
  /** リポジトリ相対の設計文書パス */
  file: string;
  /**
   * 免除の宣言集合に入っている**現存する**参照（distinct・整列済み）。
   * これらのファイルが撤去されても、同じ文書内の全言及が無言で免除される。
   */
  reached: string[];
  /** 当該文書から取り出した候補参照（distinct・整列済み）。免除の面の母数 */
  candidates: string[];
  /**
   * `reached` を実体のファイルへ束ねた件数（タスク 115.241）。
   * 面は参照トークン単位であり、同じファイルがルート相対パスと裸のファイル名の
   * 両方で名指されていれば 2 件を占める。束ね方は `bundleReachEntities` が持つ。
   */
  entities: number;
  /**
   * 面に入っている裸のファイル名のうち、**同名の実在が複数ある**もの（タスク 115.241）。
   * この参照が面から外れるのは同名の一致が**全て**消えたときだけであり、
   * `entities` はこの曖昧性を 1 件として畳んでいる。
   */
  ambiguousBareNames: Array<{ name: string; matches: number }>;
  /** 当該文書で**いま免除している**参照の延べ件数（面が現に免除へ転じた分を含む） */
  exempted: number;
  /**
   * 当該文書で**いま免除している**参照の**集合**（distinct・整列済み。タスク 115.293）。
   * `exempted` は延べ件数であり、同じ参照が複数行で言及されればその回数だけ数える。
   * 延べだけを基準にすると、1 件が抜け 1 件が入る**入れ替え**は総数が動かず素通りする——
   * 面について 115.241 が塞いだのと同じ穴が、免除の側に残っていた。
   * **延べは捨てずに両方を持つ。** 二つは互いに包含関係を持たない（本ファイル冒頭の 115.293 の節）。
   */
  exemptedReferences: string[];
}

/** 免除機構の面（blast radius）の実測 */
export interface ExemptionReach {
  /**
   * 文書ごとの面の件数（reached の distinct 件数）。
   * 基準との照合は `documents[].reached` の**集合**で行うため（タスク 115.241）、
   * この値は `--json` の要約と自己検査の整合確認にだけ使う。
   */
  perDocument: Record<string, number>;
  /** perDocument の合計 */
  total: number;
  /** 文書ごとの候補 distinct の合計（面の母数） */
  candidateTotal: number;
  /** 文書ごとの `entities` の合計（面が指す実体のファイル数。タスク 115.241） */
  entityTotal: number;
  /** 文書ごとの `ambiguousBareNames` を連ねたもの（タスク 115.241） */
  ambiguousBareNames: Array<{ file: string; name: string; matches: number }>;
  /** 文書ごとの、いま免除している件数 */
  exemptedPerDocument: Record<string, number>;
  /** exemptedPerDocument の合計（`RunResult.exemptedCount` と一致する） */
  exemptedTotal: number;
  /** 文書ごとの、いま免除している参照の集合（タスク 115.293） */
  exemptedReferencesPerDocument: Record<string, readonly string[]>;
  /** exemptedReferencesPerDocument の各集合の要素数の合計（タスク 115.293） */
  exemptedDistinctTotal: number;
  /** 文書ごとの内訳（--verbose / --json 用） */
  documents: DocumentReach[];
}

/** 免除の面の基準（`DEFAULT_BASELINE_PATH` に置く） */
export interface ReachBaseline {
  /**
   * 文書ごとの面の**集合**（参照トークンの整列済み配列。タスク 115.241）。
   * 115.215 は件数だけを持っていたため、同一文書内で 1 件が抜け 1 件が入る**入れ替え**は
   * どちらの件数も動かず素通りしていた。集合で持つことで入れ替えが差分に現れる。
   */
  documents: Record<string, readonly string[]>;
  /** documents の各集合の要素数の合計。内訳と食い違う基準は手書き換えとみなして拒否する */
  reachTotal: number;
  /** 記録時点の母数（合否には用いず、比を示すために持つ） */
  candidateTotal: number;
  /**
   * 記録時点の実体のファイル数（タスク 115.241）。`documents` の集合から
   * `bundleReachEntities` で導けるため、食い違う基準は手書き換えとみなして拒否する。
   */
  entityTotal: number;
  /** 文書ごとの、いま免除している件数 */
  exempted: Record<string, number>;
  /** exempted の合計。食い違う基準は手書き換えとみなして拒否する */
  exemptedTotal: number;
  /**
   * 文書ごとの、いま免除している参照の**集合**（タスク 115.293）。
   * 延べ件数だけを持っていた 115.241 までの形では、同一文書内で 1 件が抜け 1 件が入る
   * 入れ替えがどちらの件数も動かさず素通りしていた。
   */
  exemptedReferences: Record<string, readonly string[]>;
  /** exemptedReferences の各集合の要素数の合計。食い違う基準は拒否する（タスク 115.293） */
  exemptedDistinctTotal: number;
  /**
   * 母数と面の**追記のみ**の履歴（タスク 115.293）。
   * 115.241 は基準記録時の母数を一つだけ持ったため、薄まりが見えるのは**前回の更新からの差だけ**
   * であった。更新のたびに追記することで、起点からの薄まりが毎回の出力に出る。
   * **合否には用いない**——母数を関門にすると設計文書の編集そのものが赤を出すためである
   * （115.215 の却下理由。115.293 が変異で再確認した。本ファイル冒頭の 115.293 の節を見よ）。
   */
  candidateHistory: CandidateHistoryEntry[];
  /**
   * 面の集合として読めなかった `documents` の鍵（タスク 115.241）。
   * 115.215 の件数形式の基準や、手で書き換えられた基準がここに落ちる。
   * 空でなければ照合の前に拒否する——読めない基準を「面 0」と解して合格させないため。
   */
  malformedDocuments: string[];
  /**
   * 免除の集合として読めなかった `exemptedReferences` の鍵（タスク 115.293）。
   * 115.241 までの形式の基準（`exemptedReferences` を持たない）は、鍵が一つも無い形で
   * ここへは落ちないため、`compareReach` が「延べが 0 でない文書に集合が無い」ことを別に拒否する。
   */
  malformedExemptedReferences: string[];
}

/** 母数と面の追記のみの履歴の一項（タスク 115.293） */
export interface CandidateHistoryEntry {
  /** 基準を書き出した日（YYYY-MM-DD） */
  recordedAt: string;
  /** 書き出した時点の面の件数 */
  reachTotal: number;
  /** 書き出した時点の母数（候補 distinct の合計） */
  candidateTotal: number;
}

export interface RunResult {
  findings: DesignPathFinding[];
  /** 不在の明記により免除した参照の件数（免除が静かに広がっていないかを見るため） */
  exemptedCount: number;
  /**
   * 免除機構の**面**。`exemptedCount` が「いま免除されている件数」であるのに対し、
   * こちらは「免除の射程に入っている現存参照の件数」である（タスク 115.215）。
   */
  reach: ExemptionReach;
  scannedFiles: string[];
  specDir: string;
}

/** リポジトリの実在ファイルの索引 */
export interface FileIndex {
  /** リポジトリ相対パスの集合 */
  paths: ReadonlySet<string>;
  /** basename の集合 */
  names: ReadonlySet<string>;
  /**
   * basename ごとの実在件数。裸のファイル名で面に入る参照が
   * 「何件の実在に支えられているか」を開示するために持つ（タスク 115.241）。
   * `names` は 1 件以上かどうかしか答えないため、曖昧性はこちらでしか測れない。
   */
  nameCounts: ReadonlyMap<string, number>;
  /** 最上位エントリ名の集合（ディレクトリ・ファイルの双方） */
  topLevelEntries: ReadonlySet<string>;
}

// ============================================================================
// 走査対象の決定
// ============================================================================

// 走査根（`SPEC_DIR` / `DESIGN_DOC_NAME` / `collectDesignDocuments`）は
// scripts/design-document.ts が唯一の担い手である（タスク 115.231）。本ファイルは使うだけで
// 持たない。かつては本ファイルが三つとも自前で複製しており、
// scripts/check-design-code-reference-format.ts の定義との差は共有部品の冒頭に記す。

/**
 * 免除の面の基準の既定の位置。
 *
 * 自己検査は関門（増加方向の更新の拒否・基準の自己整合・退行の検出）を実際に発火させる
 * 必要があるため、`execute()` の引数で使い捨ての基準へ差し替えられるようにしてある。
 * 差し替えられるのは引数からだけであり、コマンドラインからは指定できない。
 */
export const DEFAULT_BASELINE_PATH = path.join(SCRIPTS_DIR, 'design-path-exemption-baseline.json');

/**
 * リポジトリ走査から外すディレクトリ（すべてビルド生成物・取得物）。
 * ここに挙げたものは「在るファイル」として数えない（115.169 と同じ判断）。
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
]);

/** リポジトリの実在ファイルを索引する */
export function buildFileIndex(root: string): FileIndex {
  const paths = new Set<string>();
  const names = new Set<string>();
  const nameCounts = new Map<string, number>();
  const topLevelEntries = new Set<string>();

  let rootEntries: fs.Dirent[];
  try {
    rootEntries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }
  for (const entry of rootEntries) {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    topLevelEntries.add(entry.name);
  }

  const stack: string[] = [root];
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
      paths.add(path.relative(root, absolute).split(path.sep).join('/'));
      names.add(entry.name);
      nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1);
    }
  }
  return { paths, names, nameCounts, topLevelEntries };
}

// ============================================================================
// 検出規則
// ============================================================================

/**
 * 裸のファイル名で照合する拡張子。
 * 絞りの根拠は冒頭の限界節に実測で記した（広げても真の失効は増えず誤検出だけが増える）。
 */
export const BARE_NAME_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.css'];

/**
 * 不在を明記する語。これがあると「撤去の記録」とみなして免除する。
 * 名前ではなく**述語**の一覧であり、特定のファイルを逃がすものではない。
 */
export const ABSENCE_MARKERS: readonly string[] = [
  '撤去',
  '削除',
  '廃止',
  '改名',
  '移設',
  '当時',
  'かつて',
  '実在しない',
  '存在しない',
  '非実在',
  '旧',
  '生成物',
  '未作成',
  '新設予定',
];

/** バッククォートで囲まれたトークンを取り出す */
const BACKTICKED_TOKEN = /`([^`]+)`/g;

/** ルート相対パスの形（セグメントが二つ以上） */
const QUALIFIED_SHAPE = /^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+$/;

/** 裸のファイル名の形 */
const BARE_SHAPE = /^[A-Za-z0-9_@-][A-Za-z0-9_@.-]*$/;

/** 呼称規約7 のプレースホルダ表記（実体を指していない） */
const PLACEHOLDER_CHARACTERS = /[*<>{}]/;

/** 末尾セグメントが拡張子を持つか */
function hasExtension(token: string): boolean {
  const last = token.slice(token.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot > 0 && dot < last.length - 1;
}

/** 記述単位が不在を明記しているか */
export function statesAbsence(unitText: string): boolean {
  return ABSENCE_MARKERS.some((marker) => unitText.includes(marker));
}

/**
 * 一行から「このパス／ファイルが在る」という主張を取り出す。
 * 主張でないトークンは落とす。
 */
export function extractClaims(
  lineText: string,
  topLevelEntries: ReadonlySet<string>
): Array<{ reference: string; kind: ReferenceKind }> {
  const claims: Array<{ reference: string; kind: ReferenceKind }> = [];
  let matched: RegExpExecArray | null;
  BACKTICKED_TOKEN.lastIndex = 0;
  while ((matched = BACKTICKED_TOKEN.exec(lineText)) !== null) {
    const token = matched[1];
    if (token === undefined) continue;
    if (PLACEHOLDER_CHARACTERS.test(token)) continue;
    if (token.endsWith('/')) continue;

    if (QUALIFIED_SHAPE.test(token)) {
      const head = token.slice(0, token.indexOf('/'));
      if (!topLevelEntries.has(head)) continue;
      if (!hasExtension(token)) continue;
      claims.push({ reference: token, kind: 'qualified-path' });
      continue;
    }

    if (BARE_SHAPE.test(token)) {
      if (!BARE_NAME_EXTENSIONS.some((extension) => token.endsWith(extension))) continue;
      claims.push({ reference: token, kind: 'bare-filename' });
    }
  }
  return claims;
}

/**
 * 文書の中から「不在を述べている行」を集め、そこで名指されたファイルの索引を作る。
 *
 * 返す集合には、ルート相対パスそのものと、その basename の両方を入れる。
 * 裸のファイル名での参照は、ルート相対パスでの撤去の記録でも免除できるようにするためである。
 * 名指しの許容リストではない——集合の中身は**文書が実際に書いた内容だけ**で決まる。
 */
export function collectAbsenceDeclarations(
  lines: readonly string[],
  topLevelEntries: ReadonlySet<string>
): Set<string> {
  const declared = new Set<string>();
  let insideFence = false;
  for (const lineText of lines) {
    if (/^\s*(?:```|~~~)/.test(lineText)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    if (!statesAbsence(lineText)) continue;
    for (const claim of extractClaims(lineText, topLevelEntries)) {
      declared.add(claim.reference);
      declared.add(claim.reference.slice(claim.reference.lastIndexOf('/') + 1));
    }
  }
  return declared;
}

/**
 * 面の参照トークンを**実体のファイル**へ束ねる（タスク 115.241）。
 *
 * 束ねの規則は、同じ basename の束の中でルート相対パスを実体として数え、
 * ルート相対パスが一つも無い束（裸の名前だけで面に入っている束）を 1 と数えることである。
 * `package.json` のように同じ basename で複数のルート相対パスが面に入っている場合は
 * その本数だけ数えるため、basename だけで素朴に束ねた値より大きくなる。
 *
 * **束ねは曖昧性を畳む。** 裸の名前だけで面に入る束は実体 1 件として数えられるが、
 * その名前が複数の実在に一致していれば、面から外れるのは一致が**全て**消えたときだけである。
 * 畳んだ分は `ambiguous` として返し、開示側で必ず併記する。
 * `ambiguous` は束ではなく**裸の参照そのもの**を単位に数える——ルート相対パスの兄弟が
 * 同じ束に居ても、裸の言及が複数の実在に支えられている事実は変わらないためである。
 */
export function bundleReachEntities(
  reached: readonly string[],
  nameCounts: ReadonlyMap<string, number>
): { entities: number; ambiguous: Array<{ name: string; matches: number }> } {
  const bundles = new Map<string, number>();
  const ambiguous: Array<{ name: string; matches: number }> = [];
  for (const reference of [...reached].sort()) {
    const base = reference.slice(reference.lastIndexOf('/') + 1);
    const qualified = reference.includes('/');
    bundles.set(base, (bundles.get(base) ?? 0) + (qualified ? 1 : 0));
    if (!qualified) {
      const matches = nameCounts.get(base) ?? 0;
      if (matches > 1) ambiguous.push({ name: base, matches });
    }
  }
  let entities = 0;
  for (const qualifiedCount of bundles.values())
    entities += qualifiedCount > 0 ? qualifiedCount : 1;
  return { entities, ambiguous };
}

/** 一つの設計文書から、実在しないパスの記載を検出する */
export function scanDocument(
  relativePath: string,
  source: string,
  index: FileIndex
): { findings: DesignPathFinding[]; exemptedCount: number; reach: DocumentReach } {
  const findings: DesignPathFinding[] = [];
  let exemptedCount = 0;
  const lines = source.split(/\r?\n/);
  const declaredAbsent = collectAbsenceDeclarations(lines, index.topLevelEntries);
  const candidates = new Set<string>();
  const reached = new Set<string>();
  // 免除は延べ件数で数えるが、集合でも持つ（タスク 115.293）。延べだけでは入れ替えが素通りする。
  const exemptedReferences = new Set<string>();
  let insideFence = false;

  lines.forEach((lineText, offset) => {
    if (/^\s*(?:```|~~~)/.test(lineText)) {
      insideFence = !insideFence;
      return;
    }
    if (insideFence) return;

    for (const claim of extractClaims(lineText, index.topLevelEntries)) {
      candidates.add(claim.reference);
      const exists =
        claim.kind === 'qualified-path'
          ? index.paths.has(claim.reference)
          : index.names.has(claim.reference);
      if (exists) {
        // 免除の「面」。いま実在するが、同じ文書の不在を述べる行がこのファイルを名指している。
        // 撤去された瞬間に、同じ文書内の全言及が無言で免除へ移る射程である（タスク 115.215）。
        if (declaredAbsent.has(claim.reference)) reached.add(claim.reference);
        continue;
      }
      if (declaredAbsent.has(claim.reference)) {
        exemptedCount += 1;
        exemptedReferences.add(claim.reference);
        continue;
      }
      findings.push({
        file: relativePath,
        line: offset + 1,
        reference: claim.reference,
        kind: claim.kind,
        snippet: lineText.trim(),
      });
    }
  });

  const sortedReached = [...reached].sort();
  const bundled = bundleReachEntities(sortedReached, index.nameCounts);
  const reach: DocumentReach = {
    file: relativePath,
    reached: sortedReached,
    candidates: [...candidates].sort(),
    entities: bundled.entities,
    ambiguousBareNames: bundled.ambiguous,
    exempted: exemptedCount,
    exemptedReferences: [...exemptedReferences].sort(),
  };

  return { findings, exemptedCount, reach };
}

// ============================================================================
// 免除の面の集計と基準
// ============================================================================

/** 文書ごとの面を合算する */
export function summariseReach(documents: readonly DocumentReach[]): ExemptionReach {
  const perDocument: Record<string, number> = {};
  const exemptedPerDocument: Record<string, number> = {};
  const exemptedReferencesPerDocument: Record<string, readonly string[]> = {};
  const ambiguousBareNames: Array<{ file: string; name: string; matches: number }> = [];
  let total = 0;
  let candidateTotal = 0;
  let entityTotal = 0;
  let exemptedTotal = 0;
  let exemptedDistinctTotal = 0;
  for (const document of documents) {
    if (document.reached.length > 0) perDocument[document.file] = document.reached.length;
    if (document.exempted > 0) exemptedPerDocument[document.file] = document.exempted;
    if (document.exemptedReferences.length > 0)
      exemptedReferencesPerDocument[document.file] = document.exemptedReferences;
    exemptedDistinctTotal += document.exemptedReferences.length;
    total += document.reached.length;
    candidateTotal += document.candidates.length;
    entityTotal += document.entities;
    exemptedTotal += document.exempted;
    for (const entry of document.ambiguousBareNames) {
      ambiguousBareNames.push({ file: document.file, name: entry.name, matches: entry.matches });
    }
  }
  return {
    perDocument,
    total,
    candidateTotal,
    entityTotal,
    ambiguousBareNames,
    exemptedPerDocument,
    exemptedTotal,
    exemptedReferencesPerDocument,
    exemptedDistinctTotal,
    documents: [...documents],
  };
}

/**
 * 基準を読む。基準が無い場合は「面 0」として扱う。
 * 面が 0 でない限り退行として落ちるため、基準の欠落が無言の合格にはならない（第3原則）。
 */
export function loadReachBaseline(baselinePath: string): ReachBaseline {
  if (!fs.existsSync(baselinePath)) {
    return {
      documents: {},
      reachTotal: 0,
      candidateTotal: 0,
      entityTotal: 0,
      exempted: {},
      exemptedTotal: 0,
      exemptedReferences: {},
      exemptedDistinctTotal: 0,
      candidateHistory: [],
      malformedDocuments: [],
      malformedExemptedReferences: [],
    };
  }
  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as Record<string, unknown>;
  // 文字列配列の辞書として読む。読めなかった鍵は呼び出し側で拒否させるため名前で返す
  // （読めない基準を「0 件」と解して無言の合格へ落とさないため。タスク 115.241 / 115.293）。
  const setsOf = (
    raw: unknown,
    label: string
  ): { sets: Record<string, readonly string[]>; malformed: string[] } => {
    const sets: Record<string, readonly string[]> = {};
    const malformed: string[] = [];
    if (raw !== null && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
          sets[key] = value as string[];
        } else {
          malformed.push(key);
        }
      }
    } else if (raw !== undefined) {
      malformed.push(label);
    }
    return { sets, malformed };
  };
  const parsedDocuments = setsOf(parsed.documents, 'documents');
  const documents = parsedDocuments.sets;
  const malformedDocuments = parsedDocuments.malformed;
  const parsedExempted = setsOf(parsed.exemptedReferences, 'exemptedReferences');
  const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);
  const countsOf = (value: unknown): Record<string, number> => {
    const counts: Record<string, number> = {};
    if (value === null || typeof value !== 'object') return counts;
    for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
      if (typeof count === 'number') counts[key] = count;
    }
    return counts;
  };
  const candidateHistory: CandidateHistoryEntry[] = [];
  if (Array.isArray(parsed.candidateHistory)) {
    for (const raw of parsed.candidateHistory as unknown[]) {
      if (raw === null || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      if (typeof entry.recordedAt !== 'string') continue;
      if (typeof entry.reachTotal !== 'number' || typeof entry.candidateTotal !== 'number')
        continue;
      candidateHistory.push({
        recordedAt: entry.recordedAt,
        reachTotal: entry.reachTotal,
        candidateTotal: entry.candidateTotal,
      });
    }
  }
  return {
    documents,
    reachTotal: numberOf(parsed.reachTotal),
    candidateTotal: numberOf(parsed.candidateTotal),
    entityTotal: numberOf(parsed.entityTotal),
    exempted: countsOf(parsed.exempted),
    exemptedTotal: numberOf(parsed.exemptedTotal),
    exemptedReferences: parsedExempted.sets,
    exemptedDistinctTotal: numberOf(parsed.exemptedDistinctTotal),
    candidateHistory,
    malformedDocuments,
    malformedExemptedReferences: parsedExempted.malformed,
  };
}

/** 基準を書き出す */
export function writeReachBaseline(baselinePath: string, reach: ExemptionReach): void {
  const ordered: Record<string, readonly string[]> = {};
  for (const document of [...reach.documents].sort((a, b) => (a.file < b.file ? -1 : 1))) {
    if (document.reached.length === 0) continue;
    ordered[document.file] = document.reached;
  }
  const orderedExempted: Record<string, number> = {};
  for (const file of Object.keys(reach.exemptedPerDocument).sort()) {
    orderedExempted[file] = reach.exemptedPerDocument[file]!;
  }
  const orderedExemptedReferences: Record<string, readonly string[]> = {};
  for (const file of Object.keys(reach.exemptedReferencesPerDocument).sort()) {
    orderedExemptedReferences[file] = [...reach.exemptedReferencesPerDocument[file]!].sort();
  }
  // 母数の履歴は**追記のみ**である（タスク 115.293）。前回と同じ値なら追記しない。
  // 上書きにすると 115.241 の形へ戻り、薄まりが前回の更新からの差だけになる。
  const previous = loadReachBaseline(baselinePath);
  const candidateHistory: CandidateHistoryEntry[] = [...previous.candidateHistory];
  const last = candidateHistory[candidateHistory.length - 1];
  if (!last || last.reachTotal !== reach.total || last.candidateTotal !== reach.candidateTotal) {
    candidateHistory.push({
      recordedAt: new Date().toISOString().slice(0, 10),
      reachTotal: reach.total,
      candidateTotal: reach.candidateTotal,
    });
  }
  const payload = {
    $comment: [
      '設計文書の実在検査における「免除機構の面」の基準（scripts/check-design-path-references.ts）。',
      '面とは、いま実在しながら同じ文書の不在を述べる行に名指されている参照の集合である。',
      'これらのファイルが撤去された瞬間、同じ文書内の全言及が無言で免除へ移る（タスク 115.215）。',
      'documents は文書ごとの面の集合そのものを持つ（タスク 115.241）。件数だけを持っていた',
      '115.215 の形では、同一文書内で 1 件が抜け 1 件が入る入れ替えが素通りしていた。',
      '面に無かった参照が増えた場合は検査が失敗する。減った場合は助言のみ（基準の更新を促す）。',
      '更新は `npm run check:design-path-refs:update`。増える方向の更新は既定で拒否し、',
      '`npm run check:design-path-refs:update -- --allow-increase` の明示を要求する。',
      '実在検査に失格が出ているツリーでは更新そのものを拒否する（タスク 115.241）。',
      'reachTotal は documents の各集合の要素数の合計。entityTotal は documents の集合を',
      'basename で束ねた実体のファイル数。いずれも documents から導けるため、食い違う基準は',
      '手書き換えとみなして照合の前に拒否する。documents が集合として読めない場合も拒否する。',
      'candidateTotal は面の母数（候補 distinct の合計）であり、比を示すために持つ。合否には用いない。',
      'exempted / exemptedTotal は「いま免除している件数」の延べ。面が現に免除へ転じた分もここに現れる。',
      'exemptedReferences / exemptedDistinctTotal は同じものの distinct の集合（タスク 115.293）。',
      '延べだけを持っていた 115.241 までの形では、免除の側で 1 件が抜け 1 件が入る入れ替えが',
      'どちらの件数も動かさず素通りしていた。延べと集合は互いに包含関係を持たないため両方を持つ。',
      'exempted に件数がある文書は exemptedReferences にも集合を持たねばならない（照合の前に拒否する）。',
      'candidateHistory は母数と面の追記のみの履歴（タスク 115.293）。合否には用いず、',
      '起点からの薄まりを毎回の出力に出すために持つ。末尾は reachTotal / candidateTotal と一致する。',
      '面に入っていたファイルを撤去すると面は減り免除は跳ねるため、両方を見張らないと素通りする。',
    ],
    reachTotal: reach.total,
    candidateTotal: reach.candidateTotal,
    entityTotal: reach.entityTotal,
    exemptedTotal: reach.exemptedTotal,
    exemptedDistinctTotal: reach.exemptedDistinctTotal,
    candidateHistory,
    documents: ordered,
    exempted: orderedExempted,
    exemptedReferences: orderedExemptedReferences,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

/** 基準と現状の差 */
export interface ReachComparison {
  /** 基準の内訳と総数が食い違っている、または面の集合として読めない（手書き換えの疑い） */
  inconsistent: boolean;
  /** 面に無かった参照が増えた文書、または免除が増えた文書 */
  regressions: string[];
  /** 面から外れた文書、または免除が減った文書 */
  improvements: string[];
}

/**
 * 基準と現状を突き合わせる。
 *
 * 面は**集合**で比べる（タスク 115.241）。件数だけで比べていた 115.215 の形は、
 * 同一文書内で 1 件が抜け 1 件が入る入れ替えを素通りさせていた——どちらの件数も動かないためである。
 * **免除も集合で比べる（タスク 115.293）。延べ件数での照合は残す。** 二つは互いに包含関係を
 * 持たない——同じ参照への言及が一つ増えると延べだけが動き、参照が入れ替わると集合だけが動く。
 * 母数（`candidateTotal`）は**合否に用いない**。設計文書の編集そのものが赤を出すためであり、
 * この却下理由は 115.293 が変異で再確認した（本ファイル冒頭の 115.293 の節）。
 */
export function compareReach(baseline: ReachBaseline, reach: ExemptionReach): ReachComparison {
  // 基準そのものの自己整合。reachTotal / entityTotal は documents から導けるため、
  // 食い違いは手書き換えの徴候である（タスク 115.241 が entityTotal を追加）。
  // 実体は**文書ごとに**束ねる（summariseReach が文書ごとの entities を合算するのと同じ規則）。
  let reachSum = 0;
  let baselineEntities = 0;
  const emptyNameCounts: ReadonlyMap<string, number> = new Map();
  for (const references of Object.values(baseline.documents)) {
    reachSum += references.length;
    baselineEntities += bundleReachEntities(references, emptyNameCounts).entities;
  }
  let exemptedSum = 0;
  for (const count of Object.values(baseline.exempted)) exemptedSum += count;

  // 免除の集合の自己整合（タスク 115.293）。
  //   - 集合の要素数の合計は exemptedDistinctTotal と一致する
  //   - 延べに件数がある文書には集合が無ければならない（集合だけ消して関門を外せないように）
  //   - distinct は延べを超えられない（延べは同じ参照を何度でも数えるため）
  let exemptedDistinctSum = 0;
  let exemptedSetsBroken = false;
  for (const [file, references] of Object.entries(baseline.exemptedReferences)) {
    exemptedDistinctSum += references.length;
    if (references.length > (baseline.exempted[file] ?? 0)) exemptedSetsBroken = true;
  }
  for (const [file, count] of Object.entries(baseline.exempted)) {
    if (count > 0 && (baseline.exemptedReferences[file] ?? []).length === 0)
      exemptedSetsBroken = true;
  }

  // 母数の履歴の自己整合（タスク 115.293）。合否には用いないが、履歴を空にしたり
  // 末尾を書き換えたりして「起点からの薄まり」を見えなくする経路は塞ぐ。
  const baselineIsPopulated =
    Object.keys(baseline.documents).length > 0 ||
    baseline.reachTotal > 0 ||
    baseline.exemptedTotal > 0;
  const lastHistory = baseline.candidateHistory[baseline.candidateHistory.length - 1];
  const historyBroken =
    baselineIsPopulated &&
    (!lastHistory ||
      lastHistory.reachTotal !== baseline.reachTotal ||
      lastHistory.candidateTotal !== baseline.candidateTotal);

  const regressions: string[] = [];
  const improvements: string[] = [];

  // 面: 文書ごとに集合の差を取る。入れ替えは「入った側」が退行として現れる
  const reachNow: Record<string, readonly string[]> = {};
  for (const document of reach.documents) {
    if (document.reached.length > 0) reachNow[document.file] = document.reached;
  }
  for (const file of [
    ...new Set([...Object.keys(baseline.documents), ...Object.keys(reachNow)]),
  ].sort()) {
    const was = new Set(baseline.documents[file] ?? []);
    const is = new Set(reachNow[file] ?? []);
    const added = [...is].filter((reference) => !was.has(reference)).sort();
    const removed = [...was].filter((reference) => !is.has(reference)).sort();
    if (added.length > 0) {
      regressions.push(`${file} [面] +${added.length} 件: ${added.join(' / ')}`);
    }
    if (removed.length > 0) {
      improvements.push(`${file} [面] -${removed.length} 件: ${removed.join(' / ')}`);
    }
  }

  // 免除: 延べ件数で比べる
  const exemptedNow = reach.exemptedPerDocument;
  for (const file of [
    ...new Set([...Object.keys(baseline.exempted), ...Object.keys(exemptedNow)]),
  ].sort()) {
    const was = baseline.exempted[file] ?? 0;
    const is = exemptedNow[file] ?? 0;
    if (is > was) regressions.push(`${file} [免除の延べ] ${was} → ${is}`);
    if (is < was) improvements.push(`${file} [免除の延べ] ${was} → ${is}`);
  }

  // 免除: 集合でも比べる（タスク 115.293）。入れ替えは「入った側」が退行として現れる
  const exemptedReferencesNow = reach.exemptedReferencesPerDocument;
  for (const file of [
    ...new Set([
      ...Object.keys(baseline.exemptedReferences),
      ...Object.keys(exemptedReferencesNow),
    ]),
  ].sort()) {
    const was = new Set(baseline.exemptedReferences[file] ?? []);
    const is = new Set(exemptedReferencesNow[file] ?? []);
    const added = [...is].filter((reference) => !was.has(reference)).sort();
    const removed = [...was].filter((reference) => !is.has(reference)).sort();
    if (added.length > 0) {
      regressions.push(`${file} [免除の集合] +${added.length} 件: ${added.join(' / ')}`);
    }
    if (removed.length > 0) {
      improvements.push(`${file} [免除の集合] -${removed.length} 件: ${removed.join(' / ')}`);
    }
  }

  return {
    inconsistent:
      baseline.malformedDocuments.length > 0 ||
      baseline.malformedExemptedReferences.length > 0 ||
      reachSum !== baseline.reachTotal ||
      exemptedSum !== baseline.exemptedTotal ||
      baselineEntities !== baseline.entityTotal ||
      exemptedDistinctSum !== baseline.exemptedDistinctTotal ||
      exemptedSetsBroken ||
      historyBroken,
    regressions,
    improvements,
  };
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const specDir = options.specDir ?? SPEC_DIR;
  const documents = collectDesignDocuments(root, specDir);
  const index = buildFileIndex(root);

  const findings: DesignPathFinding[] = [];
  let exemptedCount = 0;
  const reachPerDocument: DocumentReach[] = [];
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    const scanned = scanDocument(relativePath, source, index);
    findings.push(...scanned.findings);
    exemptedCount += scanned.exemptedCount;
    reachPerDocument.push(scanned.reach);
  }

  return {
    findings,
    exemptedCount,
    reach: summariseReach(reachPerDocument),
    scannedFiles: documents,
    specDir,
  };
}

/** 面の比（母数が 0 のときは 0%） */
function reachRatio(total: number, candidateTotal: number): string {
  if (candidateTotal === 0) return '0.0%';
  return `${((total / candidateTotal) * 100).toFixed(1)}%`;
}

/** 免除の面を、合否とは別に常に開示する */
function reportReach(reach: ExemptionReach, baseline: ReachBaseline, verbose: boolean): void {
  console.log(
    `📐 免除機構の面: ${reach.total} 件 / 候補 distinct ${reach.candidateTotal} 件` +
      `（${reachRatio(reach.total, reach.candidateTotal)}、基準 ${baseline.reachTotal} 件）`
  );
  console.log(
    '   面とは「いま実在しながら、同じ文書の不在を述べる行に名指されている参照」である。' +
      'そのファイルが撤去された瞬間、同じ文書内の全言及が無言で免除へ移る。'
  );
  // 数える単位の違いを、無条件の不等式ではなく**測った値**で述べる（タスク 115.241）。
  // 115.215 は「面の件数は撤去され得るファイルの数より多い」と無条件に書いていたが、
  // これは狭義の不等式であり、両方の綴りで名指されたファイルが一つも無ければ偽になる。
  console.log(
    `   数える単位は参照トークンであってファイルではない。実体のファイルは ${reach.entityTotal} 件で、` +
      `残る ${reach.total - reach.entityTotal} 件は既に数えたファイルの別表記である` +
      '（同じファイルがルート相対パスと裸のファイル名の両方で名指されている分）。'
  );
  // 束ねが畳んだ曖昧性を必ず併記する（タスク 115.241）。
  if (reach.ambiguousBareNames.length === 0) {
    console.log('   実体の数え方: 面に入る裸のファイル名は、いずれも同名の実在が 1 件だけである。');
  } else {
    const maximum = Math.max(...reach.ambiguousBareNames.map((entry) => entry.matches));
    console.log(
      `   実体の数え方: 面に入る裸のファイル名のうち ${reach.ambiguousBareNames.length} 件は` +
        `同名の実在が複数ある（最大 ${maximum} 件の一致）。実体 ${reach.entityTotal} 件はこれを` +
        '各 1 件に畳んだ値であり、この参照が面から外れるのは一致が全て消えたときだけである。'
    );
  }
  // 母数は合否に用いない（設計文書の増減そのものが赤を出すため。115.215 の判断を 115.293 が
  // 変異で再確認した）。用いない以上、母数が増えて比が静かに薄まる向きには信号が無い。
  // 115.241 は基準記録時の一点だけを並べたため、見えるのは前回の更新からの差だけであった。
  // 115.293 は基準へ追記のみの履歴を持たせ、**起点からの薄まり**を毎回出す。
  console.log(
    `   母数は合否に用いない。基準記録時の母数は ${baseline.candidateTotal} 件` +
      `（比 ${reachRatio(baseline.reachTotal, baseline.candidateTotal)}）である——` +
      '現在の比との差は面の増減ではなく設計文書の記述量の増減で動く。'
  );
  if (baseline.candidateHistory.length === 0) {
    console.log(
      '   母数の推移: 基準に履歴がない。起点からの薄まりは測れない——' +
        '`npm run check:design-path-refs:update` で書き出すと以後の推移が積まれる。'
    );
  } else {
    const trail = baseline.candidateHistory
      .map(
        (entry) =>
          `${entry.recordedAt} 面 ${entry.reachTotal}/母数 ${entry.candidateTotal}` +
          `（${reachRatio(entry.reachTotal, entry.candidateTotal)}）`
      )
      .join(' → ');
    const origin = baseline.candidateHistory[0]!;
    console.log(
      `   母数の推移（追記のみ。合否には用いない）: ${trail} → 現在 面 ${reach.total}/母数 ` +
        `${reach.candidateTotal}（${reachRatio(reach.total, reach.candidateTotal)}）`
    );
    console.log(
      `   起点（${origin.recordedAt}）からの薄まり: 母数は ${origin.candidateTotal} 件から ` +
        `${reach.candidateTotal} 件へ ${reach.candidateTotal - origin.candidateTotal} 件動き、` +
        `起点の面 ${origin.reachTotal} 件が今の母数に置かれていれば比は ` +
        `${reachRatio(origin.reachTotal, reach.candidateTotal)} である` +
        `（起点の比は ${reachRatio(origin.reachTotal, origin.candidateTotal)}）。` +
        '前回の更新からの差だけでなく起点からの差が読める（タスク 115.293）。'
    );
  }
  console.log(
    `   いま免除している件数: 延べ ${reach.exemptedTotal} 件（基準 ${baseline.exemptedTotal} 件）` +
      ` / distinct ${reach.exemptedDistinctTotal} 件（基準 ${baseline.exemptedDistinctTotal} 件）。` +
      '面が減って免除が跳ねたときは、面に入っていたファイルが撤去された合図である。'
  );
  console.log(
    `   免除は延べと集合の両方で見張る（タスク 115.293）。差 ` +
      `${reach.exemptedTotal - reach.exemptedDistinctTotal} 件は同じ参照が複数行で言及されている分であり、` +
      '延べだけを見ると 1 件が抜け 1 件が入る入れ替えが素通りする。'
  );
  if (!verbose) return;
  for (const document of reach.documents) {
    if (document.reached.length === 0) continue;
    console.log(
      `   ${document.file}: 面 ${document.reached.length} 件 / 実体 ${document.entities} 件` +
        ` / 候補 ${document.candidates.length} 件 / 免除 延べ ${document.exempted} 件・` +
        `distinct ${document.exemptedReferences.length} 件`
    );
    for (const entry of document.ambiguousBareNames) {
      console.log(`     ! ${entry.name}: 同名の実在 ${entry.matches} 件（実体 1 件に畳んでいる）`);
    }
    for (const reference of document.reached) console.log(`     - ${reference}`);
  }
}

/**
 * コマンドラインの本体。終了コードを返す。
 * 基準の位置は引数からのみ差し替えられる（自己検査が関門を発火させるため）。
 */
export function execute(args: readonly string[], options: RunOptions = {}): number {
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');
  const update = args.includes('--update-baseline');
  const allowIncrease = args.includes('--allow-increase');
  const baselinePath = options.baselinePath ?? DEFAULT_BASELINE_PATH;

  const result = run(options);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗
  if (result.scannedFiles.length === 0) {
    if (!json) {
      console.error('❌ 走査対象の設計文書が一件も見つかりませんでした');
      console.error(`   走査したディレクトリ: ${result.specDir}`);
      console.error(
        '   リポジトリルートで実行しているか、対象パスが変わっていないか確認してください'
      );
    }
    return 1;
  }

  // 免除の面の開示は合否と独立に行うため、実在の失格でここから抜けない
  let exitCode = 0;

  if (result.findings.length > 0) {
    exitCode = 1;
    if (!json) {
      console.error('❌ 設計文書が挙げるパスに、実在しないものがあります');
      console.error('');
      console.error('   設計文書は歴史記録を保存してよい文書ですが、記録であることが');
      console.error('   読み取れない参照は、後任を存在しないパスへ導きます（タスク 115.173）。');
      console.error('   次のいずれかで解消してください。');
      console.error('     (a) いま在るものを指している記述 → 実在するパスへ指し直す');
      console.error('     (b) 当時こうしたという記録 → 当該ファイルを名指したうえで');
      console.error('         不在を述べる行を文書内に一つ置く（「撤去済み」「削除」など）');
      console.error('');
      const byFile = new Map<string, DesignPathFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        console.error(`   ${file} (${list.length}件)`);
        for (const finding of list) {
          console.error(`     L${finding.line}: ${finding.reference} [${finding.kind}]`);
          if (verbose) console.error(`        ${finding.snippet}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル` +
          `（走査 ${result.scannedFiles.length} ファイル、不在の明記により免除 ${result.exemptedCount} 件）`
      );
    }
  }

  if (!json && result.findings.length === 0) {
    console.log(
      `✅ 設計文書が挙げるパスはすべて実在します` +
        `（走査 ${result.scannedFiles.length} ファイル: ${result.specDir}/*/${DESIGN_DOC_NAME}、` +
        `不在の明記により免除 ${result.exemptedCount} 件）`
    );
    if (verbose) {
      console.log(
        '   免除は「撤去済み」等の不在の明記がある記述単位に限られます。' +
          '件数が不意に増えたときは、現存主張へ不在の語が紛れていないか確認してください。'
      );
    }
  }

  // ------------------------------------------------------------------
  // 免除の面の開示と基準照合（タスク 115.215）
  // ------------------------------------------------------------------
  const baseline = loadReachBaseline(baselinePath);

  if (update) {
    // 実在検査に失格が出ているツリーでは基準を書き出さない（タスク 115.241）。
    // 115.215 の形は findings が在っても 0 を返し、失格の赤を出したうえで
    // 「✅ 基準を更新しました」と成功を報告していた。落ちているツリーで測った面を
    // 基準へ焼き付ければ、次回以降その面が正当な現況として扱われる。
    if (result.findings.length > 0) {
      console.error('');
      console.error('❌ 実在検査に失格がある状態では免除の面の基準を更新しません:');
      console.error(`   失格 ${result.findings.length} 件（内訳は上の一覧）`);
      console.error('   失格を解消してから更新してください。');
      return 1;
    }
    const updateComparison = compareReach(baseline, result.reach);
    // 面は「いま許している射程」であって「広げてよい」の記録ではない。
    // 増える方向の書き出しを無言で通せば、跳ねた面をその場で基準へ吸収して黙らせられる。
    // 自己整合しない基準は差分を判定できない。基準が無い場合と同じ扱いにする——
    // すなわち黙って上書きせず `--allow-increase` の明示を要求する（タスク 115.241）。
    if (updateComparison.inconsistent && !allowIncrease) {
      console.error('');
      console.error(
        '❌ 現在の基準が自己整合していないため、差分を判定できません（手作業での書き換えが疑われます）'
      );
      console.error('   内訳と総数を突き合わせるか、作り直す場合のみ次を実行します:');
      console.error('     npm run check:design-path-refs:update -- --allow-increase');
      return 1;
    }
    if (updateComparison.regressions.length > 0 && !allowIncrease) {
      console.error('');
      console.error('❌ 面・免除が増える方向の基準更新は既定で拒否します:');
      for (const line of updateComparison.regressions) console.error(`   ${line}`);
      console.error('');
      console.error('   面が広がるとは、免除の射程に入る現存参照が増えたということです。');
      console.error('   まず不在の語が現存主張へ紛れていないか確認してください。');
      console.error('   記録が必要な場合のみ次を実行します:');
      console.error('     npm run check:design-path-refs:update -- --allow-increase');
      return 1;
    }
    writeReachBaseline(baselinePath, result.reach);
    console.log('');
    console.log(`✅ 免除の面の基準を更新しました: ${baselinePath}`);
    if (updateComparison.regressions.length > 0) {
      console.log('   ⚠️ 増加を記録しました（--allow-increase）:');
      for (const line of updateComparison.regressions) console.log(`      ${line}`);
    }
    return 0;
  }

  if (!json) {
    console.log('');
    reportReach(result.reach, baseline, verbose);
  }

  const comparison = compareReach(baseline, result.reach);

  // 内訳の合計と総数がずれた基準は手で書き換えられた疑いがあり、面の総量を見えなくする
  if (comparison.inconsistent) {
    console.error('');
    console.error('❌ 免除の面の基準の内訳と総数が一致しません（手作業での書き換えが疑われます）');
    console.error(`   documents の合計と reachTotal ${baseline.reachTotal}、`);
    console.error(`   documents から導いた実体の数と entityTotal ${baseline.entityTotal}、`);
    console.error(
      `   exempted の合計と exemptedTotal ${baseline.exemptedTotal}、` +
        `exemptedReferences の合計と exemptedDistinctTotal ${baseline.exemptedDistinctTotal}、`
    );
    console.error('   または candidateHistory の末尾と reachTotal / candidateTotal が食い違います');
    if (baseline.malformedDocuments.length > 0) {
      console.error(
        `   面の集合として読めない項目: ${baseline.malformedDocuments.join(', ')}` +
          '（documents は文書ごとに参照トークンの配列を持ちます）'
      );
    }
    if (baseline.malformedExemptedReferences.length > 0) {
      console.error(
        `   免除の集合として読めない項目: ${baseline.malformedExemptedReferences.join(', ')}` +
          '（exemptedReferences は文書ごとに参照トークンの配列を持ちます）'
      );
    }
    console.error('   `npm run check:design-path-refs:update` で書き出し直してください。');
    return 1;
  }

  if (comparison.improvements.length > 0) {
    console.log('');
    console.log('ℹ️  免除の面が基準より狭まっています。基準の更新を推奨します:');
    for (const line of comparison.improvements) console.log(`   ${line}`);
    console.log('   更新: npm run check:design-path-refs:update');
  }

  if (comparison.regressions.length > 0) {
    console.error('');
    console.error('❌ 免除機構の面に無かった参照が増えたか、いま免除している件数が広がっています:');
    for (const line of comparison.regressions) console.error(`   ${line}`);
    console.error('');
    console.error('   面が広がると、そのファイルが撤去されたときに文書内の全言及が');
    console.error('   無言で免除されます（タスク 115.215）。件数が同じでも中身が入れ替われば');
    console.error('   ここに現れます（面はタスク 115.241、免除はタスク 115.293）。');
    console.error('   次のいずれかで解消してください。');
    console.error('     (a) 現存主張の行に不在の語（「削除」「撤去」など）が紛れていないか見直す');
    console.error('     (b) 広がりが妥当なら次で記録する:');
    console.error('         npm run check:design-path-refs:update -- --allow-increase');
    console.error('   内訳: npm run check:design-path-refs:verbose');
    return 1;
  }

  return exitCode;
}

function main(): void {
  const exitCode = execute(process.argv.slice(2));
  if (exitCode !== 0) process.exit(exitCode);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
