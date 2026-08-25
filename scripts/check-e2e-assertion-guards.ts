/**
 * @fileoverview E2Eテストの「検証無効化」構造の検出スクリプト
 *
 * E2Eテストには、書かれてはいるが実質的に何も検証しない構造が混入しやすい。
 * site-survey タスク 115.19 で整理した五つの型を、TypeScript の構文木を用いて
 * 機械的に洗い出す。加えて、同じ効果を持つ「条件付きスキップ」を補助規則として検出する。
 *
 * 使用方法:
 *   npx tsx scripts/check-e2e-assertion-guards.ts [options]
 *   npm run check:e2e-guards
 *
 * 検出する型:
 *   T1 conditional-expect   条件分岐で検証本体を包む
 *                           `if (cond) { await expect(...) }` — 条件が偽なら何も検証しない
 *   T2 ignored-timeout      待機の指定を尊重しない判定
 *                           `locator.isVisible({ timeout })` は timeout が無視され即時判定される。
 *                           描画前に false となり、その結果で分岐・早期終了すると検証が飛ぶ
 *   T3 tautology            常に真になる判定
 *                           `expect(typeof x === 'number').toBeTruthy()` のような恒真式
 *   T4 response-field-gate  応答の項目の有無を条件にする
 *                           `if (response.someField) { expect(...) }` — 当該項目が常に空なら一度も実行されない
 *   T5 observed-result-gate 自ら観測した結果を条件にする
 *                           `const has = await x.isVisible(); if (has) { await expect(x).toBeVisible(); }`
 *                           — 出ても出なくても通る。観測結果による早期 return / continue も含む
 *   T6 conditional-skip     前提が満たせない場合に沈黙して飛ばす
 *                           `test.skip(<式>, '理由')` / `test.fixme(<式>, ...)` — 条件次第で検証が丸ごと消える。
 *                           引数なしの `test.skip()` / `test.fixme()` も同型として計上する。
 *                           条件分岐の内側で呼ぶ形（`if (!cond) { test.skip(); return; }`）は
 *                           条件式を渡す形と効果が同一であり、無条件に呼ぶ形は検証そのものの放棄である
 *                           （Task 115.127 段0）。
 *                           第一引数が文字列（タイトル）や関数（実行条件の宣言）の形は対象外
 *   T7 excluded-absence     抽出で除外したものの不在を主張する
 *                           `expect(text.match(/[\d,]+/)![0]).not.toContain('.')` — 抜き出しの
 *                           正規表現が小数点を受理しないため、抽出後の文字列に小数点が
 *                           現れることが原理的に無い。したがってこの主張は決して失敗しない。
 *                           T3 が「真偽を直接主張する形」だけを対象とするのに対し、こちらは
 *                           **主題の作り方**が結論を先取りしている形である（Task 115.139）
 *   T8 ambiguous-absence   不在と観測の失敗を区別しない主張
 *                           `const a = await getActiveObject(page); expect(a).toBeNull();` で、
 *                           `getActiveObject` が「対象が不在」のときと「そもそも観測できなかった」
 *                           ときの双方で同じ空値を返す形。主張は前者を述べているつもりで、
 *                           後者でも成立する。**不在の主張は、対象が存在することを別に
 *                           確かめない限り何も主張していない**（Task 115.140）
 *   T9 discarded-predicate-result  真偽を返す関数の結果を式文として捨てる
 *                           `await ensureImageExists(page, id);` のように、真偽を返す
 *                           前提の補助を呼び、**戻り値を一切見ていない**形。
 *                           直後に無条件の主張があれば沈黙はしないが、前提が崩れたときの
 *                           失敗は前提の地点ではなく後段に現れ、前提の崩れなのか
 *                           検証対象の欠陥なのかを判別できなくなる。
 *                           さらに `predicateImplementationExclusion`（段3 が加えた除外）の
 *                           正当性は「真偽を**呼び出し側が**どう扱うかは依然として関門である」
 *                           ことに依拠している。戻り値を捨てる呼び出しは、その依拠を
 *                           呼び出し側で空洞にする（Task 115.141）
 *   T10 settled-type-assertion    型が構文で確定した値に対する型の主張
 *                           `const text = (await area.textContent()) ?? ''; expect(typeof text).toBe('string')`
 *                           のように、主題の実行時の型が**構文だけで一つに定まる**にもかかわらず
 *                           その型を主張する形。既定値 `?? ''` が null を文字列へ潰しているため、
 *                           画面に何が出ていても（コメントが有っても無くても）成立する。
 *                           T3 は `expect(typeof x === 'string').toBeTruthy()` を恒真として数えるが、
 *                           **真偽以外の matcher に載せ替えた同じ主張**（`expect(typeof x).toBe('string')`）は
 *                           `matcherArgIsBoolean` の関門で外れて無検出になっていた（Task 115.143）。
 *                           ただし T3 と同じ広さでは数えない。詳細は下の「限界」を参照
 *   T11 empty-population-absence  空の母集団に対する不在の主張
 *                           `const reasons = failed.map((f) => f.error).join(' / ');`
 *                           `expect(reasons).not.toMatch(/拒否/)` のように、**母集団から作った値**に
 *                           対して不在を主張しながら、**母集団が空でないことを別に確かめていない**形。
 *                           母集団が空なら連結の結果は空文字（写像の結果は空配列）となり、
 *                           不在の主張は画面や API が何を返していても成立する。
 *                           T7 が「**主題の作り方**が結論を先取りしている形」であるのに対し、
 *                           こちらは「**主題の元になる集まりが空でありうる**形」である。
 *                           T8 が述べた「不在の主張は、対象が存在することを別に確かめない限り
 *                           何も主張していない」を、単一の空値ではなく**集まり**へ広げたものに当たる
 *                           （Task 115.162）
 *
 * 分類の優先順位: T3 > T4 > T5 > T1（T2 と T6 と T7 と T8 と T9 と T10 と T11 は別軸のため重複して計上する）
 *
 * 検証を包む形（T1 / T4 / T5 の入口）:
 *   - `if (cond) { await expect(...) }`
 *   - `cond && (await expect(...))` / `cond ?? (await expect(...))`
 *   - `cond ? await expect(...) : undefined`（三項で包む形）
 *   - 観測結果を条件に黙って抜ける形（`if (!observed) { return; }` など）
 *     後始末や記録が脱出の直前に挟まる形も含む。検証が飛ぶかどうかを決めるのは
 *     「途中に何が書かれているか」ではなく「主張も失敗もせずに制御が抜けるか」である
 *     （Task 115.137。詳細は isSilentExit を参照）。
 *
 * 観測の語彙:
 *   条件式が「観測を運ぶか」の判定は、識別子の綴りを含む展開後の文字列に対して行う。
 *   語彙を語境界だけで一致させると、同じ観測を包んだ補助（`isVisibleWithin` など）が
 *   一致しなくなる。Task 115.137 で、この取りこぼしにより二百五十六箇所の分類が
 *   実質 `await` の有無だけに依存していたことが判明した。現在は次の二つで補う。
 *     - 述語の族（`isX`）と待機の族（`waitForX`）は接頭辞で一致させる
 *     - `e2e/helpers/` 配下で「真偽を返す」と**構文で判る**関数の名前を自動で取り込む
 *       （補助が増えるたびに検出器を書き換える運用は、書き換え漏れがそのまま
 *       静かな無検出になるため。判定は命名ではなく構造で行う）
 *
 * 局所変数の追跡:
 *   検出は「expect や if の直下に書かれた式」だけを見ると容易に迂回できる。
 *   同一ファイル内の値の出どころを表引きし、識別子が判定の主題・条件に現れた場合は
 *   その値を展開したうえで分類する。したがって次の二つは同じ扱いになる。
 *
 *     expect(a === null || a.ok()).toBeTruthy();            // 直接記述
 *     const ok = a === null || a.ok(); expect(ok).toBeTruthy(); // 変数を挟む形（同じく T3）
 *
 *   表に載せるのは次の三つの形である。
 *     (1) 初期化子を伴う宣言（`const ok = await res.json()`）
 *     (2) 分割して受ける形（`const { ok } = await res.json()` / `const [a] = await ...`）
 *     (3) 宣言と代入を分ける形（`let id: string;` … `id = await createProject()`）
 *   (3) は上位の有効範囲での宣言と組み合わさる用例が多く、表に載せないと
 *   `if (!id) { return; }` のような沈黙して終える構造が無検出になる。
 *
 *   値が次のいずれかを含む場合、その識別子は「観測」を運ぶものとして扱う。
 *     (a) 即時判定・観測（isVisible / count / textContent / getAttribute / evaluate 等）
 *     (b) await を伴う呼び出し（画面や API から結果を取り出す行為そのもの）
 *     (c) 失敗の握り潰し（`.catch(...)`）
 *   論理和・既定値（`||` / `??`）を含む値は恒真になり得るものとして扱う。
 *   スコープは追わず、同名の宣言は検出側に有利な方（観測を含む方）へ寄せて併合する。
 *
 *   表は「宣言の初期化子」と「代入の右辺」に分けて持つ。上記の分類（T1/T4/T5）では
 *   双方を同じように展開するが、T3 の主題の判断では扱いを変える。
 *     - 宣言の初期化子は、後から代入される名前については参照しない。
 *       `let accessToken = ''` のように宣言時の値が仮置きで、代入後の値を検証する形は
 *       正当な主張であり、宣言時の偽値のリテラルで恒真と数えてはならないためである。
 *     - 代入の右辺は、その形自体が論理和・既定値（右辺が偽値のリテラルでないもの）
 *       または型判定であるものに限って評価する。
 *       `let errorFound = false; errorFound = a || b;` は代入した式そのものが恒真であり、
 *       同じ式を `const` で書いた場合と扱いを変える理由が無いためである。
 *
 * 検出対象外とした構造（意図的に対象外。再検討時はこの記述を更新すること）:
 *   - 論理和による検証のうち、真偽以外の matcher に渡る形（`expect(a || b).toContain(...)` 等）
 *     既定値を与えてから内容を検証する正当な用法と区別できず、誤検出が支配的になるため。
 *     真偽値の matcher（toBeTruthy / toBeFalsy / toBe(true|false)）に渡る形は T3 で検出する。
 *   - 握り潰しの例外処理（`try { ... } catch { }` のように catch 節で何もしない形）
 *     後始末・クリーンアップでの使用が多数を占め、構文だけでは検証の放棄と区別できないため。
 *   - 応答待ちの握り潰し（`await page.waitForResponse(...).catch(() => null)`）
 *     待機自体を落とさない用法は正当でもあるため単独では対象外とする。
 *     ただし、その結果が条件や検証の主題に現れた時点で上記の局所変数の追跡により
 *     T3 / T5 として検出される（無害な待機と、検証を骨抜きにする使い方とを区別する）。
 *   - 比較の形を持つ式（`expect(status === 304).toBeTruthy()` 等）
 *     比較そのものは実質のある検証であり、恒真ではない。
 *     被演算子へ再帰するとリテラル比較まで恒真として数えてしまうため、比較を見つけた
 *     時点で打ち切る（型判定 `typeof x === 'number'` を持つ場合のみ例外）。
 *     `a === null || a.ok() || a.status() === 304` のように「比較を含むが全体としては
 *     恒真」な論理和は、打ち切りの前に論理和として判定されるため従来どおり検出される。
 *   - 既定値として偽値を補うだけの形（`const id = match?.[1] ?? null;` の検証）
 *     左辺が偽なら結果も偽であり、真偽の主張を骨抜きにしないため。
 *   - 真偽のリテラルを代入した値の検証（`let ok = false; ok = true; expect(ok).toBeTruthy()`）
 *     代入の右辺を評価する対象から真偽のリテラルを外した結果、この形は無検出になる。
 *     これは意図した限界であり、無条件に真を代入する恒真の主張は取り逃がす。
 *     `let downloadHappened = false; … downloadHappened = true;` のように、事象の発生や
 *     条件の成立を記録して検証する観測フラグが正当な用法として多数を占めるためである。
 *     本稿の執筆時点の走査では、この形に該当する箇所は e2e 配下に 34 箇所あり、
 *     いずれも条件分岐・例外処理・コールバックの内側でのみ真を代入している
 *     （無条件に真を代入する箇所は 0 件）。真偽のリテラルの代入まで辿ると、
 *     この 34 箇所がそのまま過検出として戻る。
 *   - 一致しうる文字の上界が定まらない正規表現からの抽出（T7 の限界。Task 115.139）
 *     `.` / `\S` / `\D` / `\W` / 否定文字クラス / 後方参照 / コードポイント表記を含む
 *     正規表現は、一致した文字列に何が現れうるかを構文だけでは決められない。
 *     判定を諦めた側は検出しない（過検出は主張を消す圧力になるため、
 *     「解析できない＝欠陥ではない」側へ倒す）。
 *   - 正規表現を needle に取る不在の主張（`expect(x).not.toMatch(/\./)`）
 *     needle が言語である場合の包含判定を要するため対象外とする。
 *     不在の主張の needle は文字列リテラルの形（`not.toContain`）だけを見る。
 *   - 不在の主張のうち、主題が補助の呼び出しでない形（T8 の限界。Task 115.140）
 *     `expect(probe.activeType).toBeNull()` のように主題が項目参照である形、
 *     `expect(await page.evaluate(...)).toBeNull()` のようにその場で書き下した形、
 *     同名の補助が複数宣言されている形は、空値が返る経路を構文だけで数え切れないため
 *     対象外とする。数え切れない側は検出しない（過検出は主張を消す圧力になるため）。
 *     同名の宣言が併合される表を辿るため、補助の外と内で同じ名前を使うと
 *     （`const record = await readRecord(page)` と補助の内側の `const record = ...`）
 *     出どころが一つに定まらず検出されない。これも数え切れない側の限界である。
 *     同じ理由で `await expect.poll(() => readRecord(page)).toBeNull()` の形も母集団に
 *     入らない（受け手が `expect(...)` の呼び出しではないため）。Task 115.140 の是正で
 *     この形が2件生じたが、いずれも主題の補助が空値を返す経路は一本であり
 *     （観測の失敗は throw させる）、母集団に入れても該当しない。
 *   - 空値を返す経路が一つだけの補助（T8 の限界。Task 115.140）
 *     `return localStorage.getItem(k)` のように空値の出どころが一つなら、
 *     主張はその条件を確かに指しており、観測の失敗と取り違えようが無い。
 *     ただし `return active ? {...} : null` のように**三項で空値を作る形**は
 *     `return` 文として数えないため、二つ目の経路があっても数え落とす。
 *   - 二経路とも真正の不在である補助（T8 の**過検出**方向の限界。Task 115.140）
 *     ここまでの二つは見逃し側の限界だが、T8 には過検出側の限界もある。
 *     `if (rows.length === 0) return null; if (!hit) return null;` のように、
 *     空値を返す経路が二つあっても**そのどちらもが「対象が実在しない」という真正の不在**
 *     である補助を、T8 は該当と判定する。T8 が構文で数えるのは経路の本数だけであり、
 *     各経路が「対象の不在」なのか「観測そのものの失敗」なのかまでは区別しないためである。
 *     この形が現れれば偽陽性になる。Task 115.140 の査読で自作の例により確認したうえで、
 *     現時点のリポジトリ内の該当（偽陽性）は 0 件であることを走査で確かめている。
 *   - ブラウザ側で評価される関数の早期脱出のうち、真偽以外を返す形（Task 115.140）
 *     `predicateImplementationExclusion` のブラウザ側評価経路は、戻り値が真偽でなくても
 *     早期脱出を対象外にする。これは意図した設計である。**同じ形は
 *     `valueProducingExitExclusion`（値を作る補助が値を返す分岐）にも該当するため、
 *     この経路だけへ「戻り値が真偽であること」を課しても検出は一件も増えない**
 *     （Task 115.140 で実測）。値を返す関数が値を返す経路を持つのは関数であることそのもので、
 *     債務は呼び出し側がその値をどう扱うかにある。呼び出し側の債務は T8 が受け持つ。
 *     この経路へ真偽を課すと、`if (!el) return;`（値を伴わない脱出）だけが新たに
 *     検出対象へ移る。それが「値を返す形と同じく呼び出し側の債務であるから過検出になる」
 *     というのは**構造から導いた設計上の帰結**であって、実測した事実ではない。
 *     実測して得たのは「同じ改変を当てて e2e 配下 208 ファイルを走査しても新たな検出は
 *     0 件」という結果の方であり（Task 115.140 で実測。査読者が独立に再現）、
 *     過検出の実例そのものはリポジトリ内に観測していない。
 *   - ブラウザ側で評価される関数の内側で結果を捨てる呼び出し（T9 の限界。Task 115.141）
 *     `page.evaluate(() => { ... dispatch(handle, 'dragstart'); ... })` のように、
 *     ブラウザ側で評価される関数の内側で真偽を返す関数を呼び、結果を捨てる形は対象外とする。
 *     DOM の API は真偽を返すものが多く（`dispatchEvent` は「既定動作が抑止されなかったか」を
 *     返す）、その真偽が前提の成否を表しているとは限らない。ブラウザ側の観測は最終的に
 *     `evaluate` の戻り値として呼び出し側へ渡り、そこで主張されるかどうかが関門である。
 *     除外の考え方は `predicateImplementationExclusion` のブラウザ側評価経路と同じである。
 *     実測では e2e 配下の該当は 3 箇所（`site-survey-images.spec.ts` の drag 系イベントの送出）
 *     であり、いずれも `dragOverDefaultPrevented` / `dropDefaultPrevented` として
 *     意味のある戻り値だけを別に受けて呼び出し側で主張している。
 *   - 名前を解決できない呼び出し（T9 の限界。Task 115.141）
 *     被呼び出しが識別子でない形（`obj.method()` / `arr[0]()`）、および同一ファイルにも
 *     名前付きの取り込みにも宣言が見つからない名前（既定取り込み・名前空間取り込みを含む）は
 *     対象外とする。真偽を返すかを構文だけでは決められないためである。
 *     実測（走査対象の e2e 配下 208 ファイル）では、結果を捨てる呼び出しの式文は 28726 箇所あり、
 *     内訳は識別子の被呼び出し 6005 / 項目参照 `obj.m()` 22720 / その他 1 である。
 *     識別子の 6005 のうち名前を解決できないものは 36 箇所。項目参照 22720 のうち
 *     Playwright の即時判定（`isVisible` 等）の結果を捨てるものは 0 箇所であり、
 *     この限界により現時点で見逃している該当は観測されていない。
 *   - 同一ファイルに同名の宣言が複数あり、真偽を返すものと返さないものが混在する形
 *     （T9 の限界。Task 115.141）どれが呼ばれるかを構文だけでは決められないため
 *     対象外とする。数え切れない側は検出しない。
 *   - 取り込んだ名前の同名衝突（T9 の**過検出**方向の限界。Task 115.141）
 *     名前付きで取り込んだ識別子は、`e2e/helpers/` から集めた「真偽を返す関数の名前」との
 *     **名前の一致**で判定する。取り込み元のファイルまでは辿らないため、`e2e/helpers/` の
 *     ある補助と同名の別の関数を他所から取り込んで結果を捨てている場合は偽陽性になる。
 *     現時点のリポジトリ内にこの形は 0 件である（走査で確認）。
 *     逆に、同一ファイルで宣言された名前は取り込みより優先して解決する。この優先を
 *     置かないと、`navigateToQuantityTableEdit` のように**複数の spec が同名で別々に
 *     宣言している**関数が名前の一致だけで巻き込まれ、3 件の偽陽性が生じる（Task 115.141 で実測）。
 *   - 真偽以外を返す関数の結果を捨てる形（T9 の限界。Task 115.141）
 *     `await createProject(page)` のように値を返す関数の結果を捨てる形は対象外である。
 *     値を返す関数の値は「前提の成否」を表すとは限らず、構文だけでは区別できない。
 *     実測では、名前を解決できた式文の呼び出し 5969 箇所のうち真偽を返すものは 5 箇所である。
 *   - 実行時の型が構文だけでは定まらない主題に対する型の主張（T10 の限界。Task 115.143）
 *     `expect(typeof body.sections.estimates.totalCount).toBe('number')` のように、
 *     主題が `await response.json()` 由来の項目参照である形は**対象外**とする。
 *     静的な型が何であれ、応答に当該の項目が無ければ `typeof` は `'undefined'` になり
 *     主張は落ちる。すなわち実質のある実行時の検査であって恒真ではない。
 *     実測では e2e 配下の `expect(typeof …)` は 32 箇所あり（走査時点）、
 *     その内訳は応答の JSON の項目参照 29・exceljs のセルの値 1・JWK の項目参照 2 で、
 *     **いずれも型が構文で定まらない**。T3 と同じ広さ（`typeof` を見た時点で恒真とみなす）
 *     へ広げると、この 32 箇所がそのまま過検出として現れる。とりわけ
 *     `itemized-statements/itemized-statement-crud.spec.ts` の REQ-13.5 は、
 *     Task 115.127 段5 が「値の有無で包んだうえ真偽で主張していた」形を**この形へ是正した**
 *     ものであり、広い規則はその是正を欠陥として数え返すことになる。
 *     したがって T10 は「構文だけで型が一つに定まる」場合に限って数える。
 *     広い規則で何件出るかは**実測**である（判定の関門を `typeof` を見た時点へ一時的に
 *     差し替えて 208 ファイルを走査したところ検出は 32 件で、ファイル別の内訳は
 *     上に数えた 32 箇所と一致した）。
 *   - 呼び出しの表を**メソッド名だけ**で引くこと（T10 の**過検出**方向の限界。Task 115.143）
 *     `SETTLED_RETURN_TYPES` は受け手を見ずメソッド名だけで引く。したがって Playwright の
 *     locator 以外の対象が同名のメソッド（独自の `count()` など）を持ち、その戻り値が
 *     表の型と異なる場合は偽陽性になりうる。現時点のリポジトリ内にこの形は 0 件である
 *     （`expect(typeof …)` の 32 箇所はいずれも項目参照であって呼び出しではない）。
 *   - 既定値を伴わない観測の型の主張（T10 の**見逃し側**の限界。Task 115.143）
 *     `const text = await area.textContent(); expect(typeof text).toBe('string')` は、
 *     `textContent()` の戻り値の型が `string | null` であるため型の集合が
 *     `{'string', 'object'}` となり、T10 は検出しない。Playwright の locator は
 *     要素が無ければ待機の末に例外を投げるため実際には null を返さず、この形も
 *     実質は恒真である。構文だけではそこまで決められないため、見逃す側へ倒している。
 *   - 戻り値の型を表に持たない呼び出し（T10 の限界。Task 115.143）
 *     主題の出どころが `SETTLED_RETURN_TYPES` に無い呼び出し・関数・項目参照である場合は
 *     「判らない」として検出しない。表は Playwright の文字列／数値を返す少数の
 *     アクセサだけを持つ。**表を持つ方式は、対象の API が増えるたびに書き換えを要し、
 *     書き換え漏れがそのまま静かな無検出になる**という負債を抱える。これは
 *     「過検出は主張を消す圧力になる」ため見逃す側へ倒すという方針の帰結であり、
 *     型検査器（`ts.Program`）を持ち込めば表なしで判定できるが、走査 208 ファイルに
 *     対して型検査器を構築する費用を検出一つのために払う判断は取っていない。
 *   - 再代入される名前・同名の宣言が複数ある名前（T10 の限界。Task 115.143）
 *     `let text = ''; text = await …;` のように後から代入される名前、および同一ファイルに
 *     同名の宣言が複数ある名前は、どの値が主題か構文だけでは決められないため検出しない。
 *   - 否定を挟む型の主張（T10 の限界。Task 115.143）
 *     `expect(typeof x).not.toBe('string')` は「その型ではない」ことの主張であり、
 *     型が確定していれば**常に落ちる**（恒偽）。恒真の検出とは別の話であるため対象外とする。
 *   - 宣言のあとに積んで作る集まり（T11 の**見逃し側**の限界。Task 115.162）
 *     `const headerTexts: string[] = []; for (...) headerTexts.push(...)` のように、
 *     宣言時は空で、あとから繰り返しの中で積んで作る集まりは**対象外**とする。
 *     主題の値が宣言だけでは定まらず、判定には変更の追跡を要するためである。
 *     T10 が「再代入される名前を対象外とする」のと同じ理由であり、数え切れない側は検出しない。
 *     実測では、この形に当たる同型の該当が e2e 配下に 1 件ある
 *     （`e2e/specs/projects/project-list-columns.spec.ts` の REQ-2.2。表のヘッダから
 *     `th` の文字列を積み、`expect(headerTexts).not.toContain('ID')` と主張する。
 *     `th` が一つも取れなければ主張は素通りするが、大きさを固定する主張が無い）。
 *     Task 115.162 の境界（画像アップロード検証E2E）の外であるため是正していない。
 *   - 綴りが構文で定まらない needle（T11 の見逃し側の限界。Task 115.162）
 *     `expect(pages.join('')).not.toContain(coverOnlyText)` のように needle が識別子である形は、
 *     空の値がその needle を含まないかを構文だけでは決められないため対象外とする。
 *     実測では e2e 配下に 1 件ある（`estimate/estimate-report-export-e2e.spec.ts`。
 *     ただしこの箇所は母集団の大きさを別に固定しており、needle を解決できたとしても該当しない）。
 *   - 母集団の大きさを固定する主張の探索を「名前が現れるか」で行うこと
 *     （T11 の**見逃し側**の限界。Task 115.162）
 *     母集団を指す名前が、否定を伴わない `expect(...)` の主題に語として現れれば
 *     「母集団は別に確かめられている」と見なす。したがって
 *     `expect(items).toHaveLength(0)` のように**空であることを主張している**場合や、
 *     大きさと無関係な主張（`expect(items).toBeDefined()`）でも固定済みと見なす。
 *     広く見積もる方向であり、過検出は主張を消す圧力になるため見逃す側へ倒している。
 *     実測では、この探索を外すと e2e 配下の検出は 0 件から 6 件へ増え、増えた 4 件は
 *     いずれも母集団の大きさ・要素の実在を別に主張している箇所であった
 *     （`admin/rbac.spec.ts` `estimate/estimate-hierarchy-move-e2e.spec.ts`
 *     `estimate/estimate-hierarchy-reload-save-e2e.spec.ts`
 *     `site-surveys/site-survey-image-request-scaling.spec.ts`）。
 *   - 母集団は空でないが要素の値が空である形（T11 の限界。Task 115.162）
 *     `failed.map((f) => f.error ?? '').join(' / ')` は、`failed` に要素があっても
 *     すべての `error` が未定義なら空文字になる。これは母集団の大きさではなく
 *     **既定値が値を潰す**形であり、本型ではなく別の型として扱う。対象外とする。
 *   - 判定・抽出の実装そのものである分岐（Task 115.127 段3・計画の A 群）
 *     真偽を返す関数、またはブラウザ側で評価される関数（`evaluate` 族）の内側で、
 *     **expect を一つも含まず** then 節が脱出だけの分岐。述語は false を返す経路を必ず持ち、
 *     その `return false` を数えることは「述語が述語であること」を欠陥として数えるに等しい。
 *     真偽を呼び出し側がどう扱うかは関門であり、呼び出し側の分岐は従来どおり検出される。
 *     真偽を返す関数かどうかは**構造**で判定する（戻り値の型注釈、または自らの return が
 *     すべて真偽の値であること）。`isX` / `hasX` のような命名では判定しない。
 *     詳細は predicateImplementationExclusion を参照。
 *   - 探索・再試行の繰り返しを抜けるだけの `break` / `continue`（Task 115.137 の査読）
 *     `break` / `continue` は繰り返しを抜けるだけでテストからは抜けない。抜けた先で
 *     観測の結果が無条件に検査される（主張・throw・必ず落ちる関門）なら検証は飛んでいない。
 *     **これは削減計画が E 群の是正先として推奨している形そのもの**であり、負債として
 *     数えてはならない。抜けた先で結果を一切検査しない形は従来どおり検出する。
 *     詳細は escapesCheckedLoop を参照。
 *   - 値を作る補助の中の「値を伴う return」（Task 115.137 の査読・計画 §6 の条件 (3) の拡張）
 *     値を返す関数が値を返す経路を持つのは関数であることそのものであり、検証の放棄ではない。
 *     債務は呼び出し側がその値をどう扱うかにあり、呼び出し側の分岐は従来どおり検出される。
 *     テスト本体の中の値を伴わない `return;` は真正の沈黙脱出として検出したまま残す。
 *     詳細は valueProducingExitExclusion を参照。
 *   - 再試行の成功時に関数ごと抜ける `return`（Task 115.127 段7・計画の D1 群）
 *     繰り返しの内側で観測が成立したときに `return` し、繰り返しが尽きた直後に無条件の
 *     `throw` がある形。結末は「成立したので抜ける」か「上限まで成立せず落ちる」の二つだけで、
 *     素通りする経路が無い。`throw` より後の文は到達しないため飛び越す検証も存在しない。
 *     繰り返しの後に `throw` が無い形は真正の沈黙脱出として従来どおり検出する。
 *     詳細は retryExhaustionFailureExclusion を参照。
 *   - どの経路でも throw か無条件の主張に到達する分岐（Task 115.127 段3・計画の B 群）
 *     `else` を持ち、then / else の双方の到達しうる終端がすべて throw か無条件の主張であり、
 *     かつ内側に throw を含む分岐。素通りする経路が構造上存在しない。
 *     throw を含まない全域分岐（計画の G 群）は「どの経路でも**同等の**検証が実行されるか」
 *     という中身の判断を要するため対象外にしない。詳細は guaranteedFailureExclusion を参照。
 *
 * 走査の対象:
 *   `e2e/specs/` `e2e/helpers/` `e2e/fixtures/` だけを走査する。検出しているのは
 *   「テストが検証を放棄している構造」であり、Playwright の実行基盤（`e2e/global-setup.ts` /
 *   `e2e/config.ts` / `e2e/reporters/`）はテストのライフサイクルの外で走るため対象外である。
 *   除外はファイル名の羅列ではなく置き場所の役割で決める（詳細は SCAN_SUBDIRS を参照）。
 *
 * 検出規則の確認:
 *   scripts/check-e2e-assertion-guards.selftest.ts に、捕捉すべき書き方と
 *   捕捉してはならない書き方を注入する一覧を置いている。規則を変更したら
 *   `npm run check:e2e-guards:selftest` を実行すること。
 *
 * 正当な用途の除外:
 *   条件分岐が正当な箇所は、該当行の直前行に以下の注釈を置くことで検出対象から外せる。
 *   理由は必須であり、理由が空の注釈は除外として扱わず（検出はそのまま残る）、検査を失敗させる。
 *
 *     // e2e-guard-allow: <理由>
 *
 *   除外を認める条件は一つだけである（Task 115.68 / 115.93）。
 *
 *     **前提が満たせない場合に必ず失敗すること。沈黙して通る経路が一つも無いこと。**
 *
 *   「検証ではなく前提の準備だから」は、それ単独では理由にならない。前提の準備であっても、
 *   前提が崩れたまま素通りすれば、失敗は崩れた地点ではなく後段に現れ、前提の崩れなのか
 *   検証対象の欠陥なのかを判別できなくなる。したがって理由には、
 *   「どこで失敗するか」（直後の throw／無条件の主張／全域である分岐のいずれか）を書くこと。
 *   逆に言えば、次のいずれかに当たるものだけが除外に値する。
 *     (1) 条件が偽なら直後に throw / 無条件の主張で落ちる（再試行の待機など）
 *     (2) 分岐が全域であり、どの経路でも同等の検証・操作が必ず実行される（変種の吸収）
 *     (3) 判定そのものを実装している述語ヘルパー（真偽を返す関数の内部）
 *
 *   除外は実行のたびに件数と箇所の一覧を出力し、基準にも件数を記録する。
 *   除外が増えた場合も検査は失敗する（大量除外による見かけ上の解消を防ぐため）。
 *
 * 再発検知:
 *   e2e/assertion-guard-baseline.json に「ファイル別・型別の既知件数」と
 *   「ファイル別の除外件数」を記録する。
 *   件数が増えた場合、または基準に無いファイルで検出された場合は exit 1 とする。
 *   件数が減った場合は警告のみ（基準の更新を促す）。
 *
 * 抑止一覧（基準）の位置づけ:
 *   基準に載っている件数は「解消済み」ではない。**いま抑止しているだけの既知の欠陥**である。
 *   放置すると「検査は通るのに欠陥は残る」状態が恒久化するため、次の三つを設けている。
 *
 *   (1) 負債の可視化
 *       実行のたびに、型別に「現在 / 基準 / 目標 / 残り」を出力する。目標と削減計画の所在は
 *       基準の `reduction` に記録する。CI の出力を見れば、通ったかどうかとは別に
 *       いくつ抑止されたままかが常に分かる。
 *   (2) 抑止一覧を増やす操作に摩擦を与える
 *       `--update-baseline` は件数が増える方向の書き出しを既定で拒否する。
 *       増加を記録する必要がある場合は `--allow-increase` を明示的に付けること。
 *       これは「直せないので登録して黙らせる」を無言でできないようにするための関門である。
 *   (3) 基準そのものの自己整合
 *       内訳の合計と総数が食い違う基準（総数だけを手で書き換えた形）は照合の前に拒否する。
 *
 *   (2) と (3) は自己検査（`scripts/check-e2e-assertion-guards.selftest.ts` の 115.128 群）が
 *   使い捨ての基準を用いて実際に発火させ、守られていることを固定している（Task 115.128）。
 *
 * オプション:
 *   --verbose           検出箇所を全件表示する
 *   --json              JSON形式で出力する
 *   --update-baseline   現状を基準として書き出す（是正後に実行する）
 *   --allow-increase    件数が増える方向の基準更新を許可する（--update-baseline と併用）
 *   --no-baseline       基準と照合せず検出結果のみ出力する
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const E2E_DIR = path.join(ROOT, 'e2e');
/**
 * 抑止一覧（基準）の既定の位置。
 *
 * 自己検査は関門（増加方向の基準更新の拒否・基準の自己整合の検査）を実際に発火させる必要が
 * あるため、`run()` の引数で使い捨ての基準へ差し替えられるようにしてある。差し替えられるのは
 * 引数からだけであり、コマンドラインからは指定できない。直接起動した本番の実行は常にこの
 * 既定を用いる（Task 115.128）。
 */
export const DEFAULT_BASELINE_PATH = path.join(E2E_DIR, 'assertion-guard-baseline.json');
const ALLOW_MARKER = 'e2e-guard-allow:';

/**
 * 走査対象の下位ディレクトリ（Task 115.137 の是正）。
 *
 * 検出しているのは「テストが検証を放棄している構造」である。したがって走査してよいのは
 * **テストの実行中に働くもの**に限る。次の三つがそれに当たる。
 *   - `e2e/specs/`    テストの本体
 *   - `e2e/helpers/`  テストから呼ばれ、テストの中で観測・主張を行う補助
 *   - `e2e/fixtures/` テストから呼ばれる前提の準備（テストの成否に直結する）
 *
 * 逆に `e2e/` の直下に置かれるもの（`global-setup.ts` / `config.ts`）と `e2e/reporters/` は
 * Playwright の**実行基盤**であり、テストのライフサイクルの外で走る。そこにある
 * `return` / `break` は疎通待ちの成功や進捗表示の分岐であって検証の放棄ではない。
 * 実基盤を走査した結果、`e2e/global-setup.ts:31`（疎通待ちの成功時 return。枯渇時は throw）と
 * `e2e/reporters/progress-reporter.ts:74`（再試行の進捗表示）が誤検出されていた。
 *
 * 除外はファイル名の羅列ではなく**置き場所の役割**で決める。名前を並べる方式は、
 * 基盤のファイルが増えるたびに検出器を書き換える運用になり、書き換え漏れが誤検出として残る。
 */
const SCAN_SUBDIRS = ['specs', 'helpers', 'fixtures'];

// ============================================================================
// 型定義
// ============================================================================

export type GuardType =
  | 'T1-conditional-expect'
  | 'T2-ignored-timeout'
  | 'T3-tautology'
  | 'T4-response-field-gate'
  | 'T5-observed-result-gate'
  | 'T6-conditional-skip'
  | 'T7-excluded-absence'
  | 'T8-ambiguous-absence'
  | 'T9-discarded-predicate-result'
  | 'T10-settled-type-assertion'
  | 'T11-empty-population-absence';

export interface Finding {
  file: string;
  line: number;
  type: GuardType;
  snippet: string;
}

interface AllowEntry {
  file: string;
  line: number;
  type: GuardType;
  reason: string;
  snippet: string;
}

export interface ScanResult {
  findings: Finding[];
  allowed: AllowEntry[];
  /** 理由の無い除外注釈（除外として扱わない） */
  invalidAllows: AllowEntry[];
  /**
   * 検出の元になった構文木の節点（`findings` と同じ並び・同じ長さ）。
   *
   * 分類走査（scripts/classify-e2e-assertion-guards.ts）が、検出箇所を
   * 行番号で当て直すことなく構文木のまま受け取るために持つ。
   * JSON 出力には含めない（節点は直列化できないため）。
   */
  findingNodes: ts.Node[];
}

type Baseline = Record<string, Partial<Record<GuardType, number>>>;
type AllowBaseline = Record<string, number>;

/**
 * 抑止一覧の削減計画。基準に記録し、実行のたびに残りを出力する。
 * 目標は「いつまでに何件へ落とすか」の宣言であり、検査の合否には用いない
 * （合否は従来どおり基準からの増加で判定する）。
 */
interface ReductionPlan {
  /** 削減計画を記した文書の位置 */
  doc?: string;
  /** 型別の目標件数 */
  targets?: Partial<Record<GuardType, number>>;
  /** 除外注釈の目標件数 */
  allowedTarget?: number;
}

const GUARD_TYPES: GuardType[] = [
  'T1-conditional-expect',
  'T2-ignored-timeout',
  'T3-tautology',
  'T4-response-field-gate',
  'T5-observed-result-gate',
  'T6-conditional-skip',
  'T7-excluded-absence',
  'T8-ambiguous-absence',
  'T9-discarded-predicate-result',
  'T10-settled-type-assertion',
  'T11-empty-population-absence',
];

/** 即時判定であり timeout 指定が無視される Playwright の述語メソッド */
export const IMMEDIATE_PREDICATES = [
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isChecked',
  'isEditable',
];

/**
 * 観測を示す語のうち、**接頭辞**で一致させるもの。
 *
 * 語境界だけで一致させると、同じ観測を包んだ補助（`isVisibleWithin` など）が
 * 一致しなくなる（末尾に語が続くため `\bisVisible\b` が成立しない）。
 * Task 115.137 で、この取りこぼしにより二百五十六箇所の分類が
 * 実質 `await` の有無だけに依存していたことが判明した。
 * 述語の族（`isX`）と待機の族（`waitForX`）は、接頭辞が一致する識別子が
 * 観測以外を指すことは事実上ありえないため、接頭辞一致へ広げる。
 */
const OBSERVATION_PREFIX_WORDS = [...IMMEDIATE_PREDICATES, 'waitFor'];

/** 観測を示す語のうち、語境界で一致させるもの（接頭辞へ広げると別語を巻き込むもの） */
const OBSERVATION_EXACT_WORDS = [
  'count',
  'textContent',
  'innerText',
  'inputValue',
  'getAttribute',
  'boundingBox',
  'locator',
  'getByTestId',
  'getByRole',
  'getByText',
  'evaluate',
];

/** 正規表現の特殊文字を無効化する */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `e2e/helpers/` 配下で「真偽を返す」と**構文で判る**関数の名前を集める。
 *
 * 観測を包んだ補助が増えるたびに検出器を書き換える運用は、書き換え漏れが
 * そのまま静かな無検出になる（Task 115.137 の再発源）。補助の名前を列挙するのではなく、
 * 補助の**形**（真偽を返す関数であること）から名前を自動で取り込む。
 * 判定には述語ヘルパーの判定と同じ `isBooleanReturningFunction` を用いるため、
 * `isX` / `hasX` のような命名には一切依存しない。
 */
export function collectBooleanHelperNames(dir: string = path.join(E2E_DIR, 'helpers')): string[] {
  const names = new Set<string>();
  // 取り込み元が失われた場合は黙って空を返さない（Task 115.137）。
  // 基礎語彙が残るため検出が丸ごと消えることはないが、`await` を条件式の外へ出した書き方は
  // 静かに無検出へ落ちる。本タスクが解消しようとしている「静かに消える」問題そのものなので、
  // 取り込みが成立しない場合は検査を失敗させる。
  if (!fs.existsSync(dir)) {
    throw new Error(
      `観測の語彙の取り込み元が見つかりません: ${dir}\n` +
        '取り込みが成立しないと、補助へ畳んだ観測が静かに無検出になります。'
    );
  }
  for (const file of collectFiles(dir)) {
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && isBooleanReturningFunction(node)) {
        names.add(node.name.text);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
        isBooleanReturningFunction(node.initializer)
      ) {
        names.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  if (names.size === 0) {
    throw new Error(
      `観測の語彙を取り込めませんでした（真偽を返す関数が一つも見つかりません）: ${dir}\n` +
        '取り込みが空のまま通すと、補助へ畳んだ観測が静かに無検出になります。'
    );
  }
  return [...names].sort();
}

/**
 * 画面・応答からの観測を示す語（条件式の分類に用いる）。
 *
 * 自己検査から「接頭辞一致」「自動取り込み」それぞれの寄与を切り分けて確かめられるよう公開する。
 */
export function buildObservationPattern(helperNames: string[]): RegExp {
  const alternatives = [
    ...OBSERVATION_PREFIX_WORDS.map((word) => `${escapeRegExp(word)}\\w*`),
    ...OBSERVATION_EXACT_WORDS.map(escapeRegExp),
    ...helperNames.map(escapeRegExp),
  ];
  return new RegExp(`\\b(${alternatives.join('|')})\\b`);
}

/** 走査が実際に用いている観測の語彙（取り込んだ名前と、そこから組んだ正規表現の対） */
export interface ObservationVocabulary {
  /** `e2e/helpers/` から自動で取り込んだ真偽を返す関数の名前 */
  readonly helperNames: readonly string[];
  /** 基礎語彙と `helperNames` から組んだ、走査が実際に用いる正規表現 */
  readonly pattern: RegExp;
}

let observationVocabulary: ObservationVocabulary | undefined;

/**
 * 走査が実際に用いる観測の語彙。`e2e/helpers/` の走査結果を取り込むため遅延して組み立てる。
 * 走査のたびに読み直す必要は無いので一度だけ組む。
 *
 * 取り込んだ名前を `pattern` と対で公開するのは、自己検査が「部品が動くこと」ではなく
 * **走査本体への結線**を主張できるようにするため。部品（`collectBooleanHelperNames` /
 * `buildObservationPattern`）を個別に呼ぶだけの確認では、両者を繋ぐ一行が失われても
 * 気づけない。それは本タスクが潰そうとしている「書き換え漏れが静かな無検出になる」形
 * そのものなので、結線の結果をここから観測できる形にしておく。
 */
export function getObservationVocabulary(): ObservationVocabulary {
  if (!observationVocabulary) {
    const helperNames = collectBooleanHelperNames();
    observationVocabulary = { helperNames, pattern: buildObservationPattern(helperNames) };
  }
  return observationVocabulary;
}

export function getObservationPattern(): RegExp {
  return getObservationVocabulary().pattern;
}

/** 応答の項目参照を示す語 */
const RESPONSE_PATTERN = /\b(response|res|body|json|payload|detail|result|data|api)\w*\s*[.?[]/i;

/** await を伴う呼び出し（画面・API から結果を取り出す行為） */
const AWAIT_PATTERN = /\bawait\b/;

/** 失敗の握り潰し */
const SWALLOW_PATTERN = /\.catch\s*\(/;

/** 局所変数の追跡で辿る深さの上限（循環・過剰展開の防止） */
const RESOLVE_DEPTH_LIMIT = 4;

// ============================================================================
// 走査
// ============================================================================

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectFiles(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** 式の最も内側の識別子を取り出す（`expect(x).not.toBe` → `expect`） */
function rootIdentifier(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isCallExpression(current)) {
      current = current.expression;
    } else if (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

export function isExpectCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const root = rootIdentifier(node.expression);
  return ts.isIdentifier(root) && root.text === 'expect';
}

/** 検証が実行される呼び出し（expect の matcher 呼び出し） */
export function containsAssertion(node: ts.Node): boolean {
  return containsNode(node, (n) => isExpectCall(n));
}

/** 前提が満たせないときに失敗させる構造（throw / expect.fail / test.fail） */
export function containsFailure(node: ts.Node): boolean {
  return containsNode(node, (n) => {
    if (ts.isThrowStatement(n)) return true;
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText();
      return text === 'expect.fail' || text === 'test.fail';
    }
    return false;
  });
}

function containsNode(node: ts.Node, predicate: (n: ts.Node) => boolean): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (predicate(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** ブラウザ側で評価する関数を受け取る呼び出し（内側は判定・抽出の実装そのもの） */
const EVALUATE_CALLEES = new Set([
  'evaluate',
  'evaluateAll',
  'evaluateHandle',
  'waitForFunction',
  '$eval',
  '$$eval',
]);

/** テスト本体・フックの実行単位を受け取る呼び出し（述語ヘルパーの探索の打ち切り地点） */
const TEST_BODY_CALLEES = new Set([
  'test',
  'it',
  'describe',
  'test.step',
  'test.describe',
  'test.beforeAll',
  'test.afterAll',
  'test.beforeEach',
  'test.afterEach',
  'test.describe.serial',
  'test.describe.parallel',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
]);

/**
 * 真偽の値を持つ式か（述語ヘルパーの判定に用いる）。
 *
 * 識別子は辿らない。辿ると「真偽を返す関数」の範囲が曖昧に広がり、
 * 除外して良い形と紛らわしい形の区別が付かなくなるためである。
 */
function isBooleanValued(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (ts.isAwaitExpression(inner)) return isBooleanValued(inner.expression);
  if (inner.kind === ts.SyntaxKind.TrueKeyword || inner.kind === ts.SyntaxKind.FalseKeyword) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken) {
    return true;
  }
  if (ts.isTypeOfExpression(inner)) return false;
  if (ts.isConditionalExpression(inner)) {
    return isBooleanValued(inner.whenTrue) && isBooleanValued(inner.whenFalse);
  }
  if (ts.isBinaryExpression(inner)) {
    const kind = inner.operatorToken.kind;
    if (COMPARISON_OPERATORS.has(kind)) return true;
    if (
      kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      kind === ts.SyntaxKind.BarBarToken ||
      kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return isBooleanValued(inner.left) && isBooleanValued(inner.right);
    }
    return false;
  }
  if (ts.isCallExpression(inner)) {
    if (ts.isIdentifier(inner.expression) && inner.expression.text === 'Boolean') return true;
    if (ts.isPropertyAccessExpression(inner.expression)) {
      const name = inner.expression.name.text;
      if (IMMEDIATE_PREDICATES.includes(name)) return true;
      if (['some', 'every', 'includes', 'startsWith', 'endsWith', 'test', 'has'].includes(name)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/** 型注釈が真偽（または真偽の Promise）か */
function isBooleanTypeNode(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  if (type.kind === ts.SyntaxKind.BooleanKeyword) return true;
  if (ts.isTypeReferenceNode(type) && type.typeName.getText() === 'Promise') {
    return isBooleanTypeNode(type.typeArguments?.[0]);
  }
  return false;
}

/** 当該の関数が自ら持つ return 文（入れ子の関数の内側は辿らない） */
function ownReturnStatements(fn: ts.SignatureDeclaration): ts.ReturnStatement[] {
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body || !ts.isBlock(body)) return [];
  const found: ts.ReturnStatement[] = [];
  const visit = (n: ts.Node): void => {
    if (n !== body && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/**
 * 真偽を返す関数の本体か。**命名ではなく構造で判定する。**
 *
 * `hasX` / `isX` のような命名で判定してはならない。段1 で「ガードが見張る値と
 * テストが実際に使う値が違っていた」実例があり、名前は構造の保証にならない。
 *
 * 次のいずれかを満たす場合に真とする。
 *   - 戻り値の型注釈が `boolean` / `Promise<boolean>` である
 *   - 本体が式である矢印関数で、その式が真偽の値を持つ
 *   - 自らの return 文が一つ以上あり、そのすべてが真偽の値を返す
 */
function isBooleanReturningFunction(fn: ts.SignatureDeclaration): boolean {
  if (isBooleanTypeNode(fn.type)) return true;
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body) return false;
  if (!ts.isBlock(body)) return isBooleanValued(body as ts.Expression);
  const returns = ownReturnStatements(fn);
  if (returns.length === 0) return false;
  return returns.every((r) => r.expression !== undefined && isBooleanValued(r.expression));
}

/** 呼び出しの被呼び出し名（`page.evaluate` → `evaluate`、`test.step` → `test.step`） */
function calleeNames(call: ts.CallExpression): { last: string; full: string } {
  const full = call.expression.getText();
  const last = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : ts.isIdentifier(call.expression)
      ? call.expression.text
      : '';
  return { last, full };
}

/**
 * 判定そのものを実装している文脈の内側か（計画 §6 の除外条件 (3)）。
 *
 * 該当する場合はその細目を、しない場合は `undefined` を返す。
 * 判定は構文木の形のみで行い、識別子の綴りは一切見ない。
 *
 * 内側の関数から外側へ辿り、テスト本体・フックの実行単位に達した時点で打ち切る
 * （そこから先はテストの本体であり、述語の実装ではないため）。
 */
function booleanPredicateContext(node: ts.Node): string | undefined {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parent = current.parent;
    if (parent && ts.isCallExpression(parent) && parent.arguments.some((a) => a === current)) {
      const { last, full } = calleeNames(parent);
      if (EVALUATE_CALLEES.has(last)) {
        return isBooleanReturningFunction(current)
          ? 'evaluate:真偽を返す'
          : 'evaluate:真偽を返さない';
      }
      if (TEST_BODY_CALLEES.has(full) || TEST_BODY_CALLEES.has(last)) return undefined;
      if (isBooleanReturningFunction(current)) return '述語:引数として渡す関数';
      continue;
    }
    if (isBooleanReturningFunction(current)) return '述語:名前に束ねた関数';
  }
  return undefined;
}

/**
 * ブラウザ側で評価される関数の内側か（`page.evaluate(() => { ... })` の本体。T9。Task 115.141）。
 *
 * ブラウザ側の DOM の API は真偽を返すものが多く（`dispatchEvent` は「既定動作が抑止され
 * なかったか」を返す）、その真偽が前提の成否を表しているとは限らない。ブラウザ側の観測は
 * 最終的に `evaluate` の戻り値として呼び出し側へ渡り、そこで主張されるかどうかが関門である。
 * 除外の考え方は `predicateImplementationExclusion` のブラウザ側評価経路と同じである。
 */
function insideBrowserEvaluatedFunction(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parent = current.parent;
    if (parent && ts.isCallExpression(parent) && parent.arguments.some((a) => a === current)) {
      const { last } = calleeNames(parent);
      if (EVALUATE_CALLEES.has(last)) return true;
    }
  }
  return false;
}

/** 当該の分岐が自ら持つ return 文（入れ子の関数の内側は辿らない） */
function ownReturnsIn(statement: ts.Statement): ts.ReturnStatement[] {
  const found: ts.ReturnStatement[] = [];
  const visit = (n: ts.Node): void => {
    if (n !== statement && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(statement);
  return found;
}

/**
 * 【検出器の規則による対象外 (1)】判定・抽出の実装そのものである分岐か。
 *
 * 計画（e2e-assertion-guard-reduction-plan.md）§6 の除外条件 (3)
 * 「判定そのものを実装している述語ヘルパーの内部」に、構造上必ず該当する形だけを外す。
 * 該当する場合は理由を、しない場合は `undefined` を返す。
 *
 * 次のすべてを満たす場合に限る。**識別子の綴りは一切見ない。**
 *   (a) `if` 文であり、その内側（then / else の全体）に **expect が一つも無い**。
 *       主張を包む分岐は「判定の実装」ではなく検証の無効化であるため、ここで必ず落ちる。
 *   (b) then 節が脱出だけで構成される（`return` / `continue` / `break`）。
 *       すなわち分岐の役目は「この関数の値を決めること」に尽きる。
 *   (c) 外側が (i) 真偽を返す関数、または (ii) ブラウザ側で評価される関数
 *       （`evaluate` 族）である。(i) の場合は then 節の return がすべて真偽の値であること。
 *
 * **なぜこれが「抑止」ではないか**: 述語は false を返す経路を必ず持つ。
 * その `return false` を数えることは「述語が述語であること」を欠陥として数えることに等しい。
 * 一方、その真偽を**呼び出し側がどう扱うか**は関門であり、呼び出し側の
 * `if (await hasX())` は従来どおり検出される。したがって債務は移動しない。
 * (a) の条件があるため、述語の内部であっても主張を条件で包んでいれば検出は残る。
 */
export function predicateImplementationExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (containsAssertion(node)) return undefined;
  if (!isSilentExit(node.thenStatement)) return undefined;
  const context = booleanPredicateContext(node);
  if (!context) return undefined;
  if (context.startsWith('evaluate')) {
    return `ブラウザ側で評価される関数の内側で値を決める分岐（${context}）`;
  }
  const returns = ownReturnsIn(node.thenStatement);
  if (returns.length === 0) return undefined;
  if (!returns.every((r) => r.expression !== undefined && isBooleanValued(r.expression))) {
    return undefined;
  }
  return `真偽を返す関数の内側で真偽を決める分岐（${context}）`;
}

/**
 * 分岐の到達しうる終端がすべて「throw する」か「主張する」か。
 *
 * 入れ子の `if` は else を伴う場合に限り再帰する（else が無ければ素通りする経路が残るため）。
 */
function alwaysFailsOrAsserts(statement: ts.Statement): boolean {
  const list = ts.isBlock(statement) ? [...statement.statements] : [statement];
  for (const s of list) {
    if (ts.isThrowStatement(s)) return true;
    if (ts.isExpressionStatement(s) && containsAssertion(s)) return true;
    if (
      ts.isIfStatement(s) &&
      s.elseStatement &&
      alwaysFailsOrAsserts(s.thenStatement) &&
      alwaysFailsOrAsserts(s.elseStatement)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 【検出器の規則による対象外 (2)】どの経路でも throw か主張に到達する分岐か。
 *
 * 計画 §6 の除外条件 (1)「条件が偽なら直後に throw / 無条件の主張で落ちる」に
 * 構造上必ず該当する形だけを外す。
 *
 * 次のすべてを満たす場合に限る。
 *   (a) `if` 文であり `else` を持つ（else が無ければ素通りする経路が残る）。
 *   (b) then / else の双方について、到達しうる終端がすべて throw か無条件の主張である。
 *   (c) その内側に throw が少なくとも一つある。
 *
 * (c) を課すのは、throw を含まない全域分岐（計画の G 群）を巻き込まないためである。
 * G 群の正当性は「どの経路でも**同等の**検証・操作が実行される」という中身の判断を要し、
 * 構造だけでは決められない（計画 §6 の条件 (2)。段7 で一件ずつ扱う）。
 * throw は中身の判断を要さない無条件の失敗であるため、ここだけを構造で外せる。
 */
export function guaranteedFailureExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (!node.elseStatement) return undefined;
  if (!containsNode(node, (n) => ts.isThrowStatement(n))) return undefined;
  if (!alwaysFailsOrAsserts(node.thenStatement)) return undefined;
  if (!alwaysFailsOrAsserts(node.elseStatement)) return undefined;
  return 'どの経路でも throw か無条件の主張に到達する分岐';
}

/** テスト本体・フックとして渡された関数か（`test('...', async () => {...})` の本体） */
function isTestBodyFunction(fn: ts.Node): boolean {
  const parent = fn.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  if (!parent.arguments.some((a) => a === fn)) return false;
  const { last, full } = calleeNames(parent);
  return TEST_BODY_CALLEES.has(full) || TEST_BODY_CALLEES.has(last);
}

/** 節点を囲む最も内側の関数がテスト本体でない（値を作る補助である）か */
function insideNonTestFunction(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) return !isTestBodyFunction(n);
  }
  return false;
}

/**
 * 【検出器の規則による対象外 (3)】値を作る補助が値を返す分岐か。
 *
 * 計画 §6 の除外条件 (3)「判定そのものを実装している補助の内部」を、真偽以外を返す
 * 補助（抽出・遷移）まで同じ理屈で広げたものである。
 *
 * 次のすべてを満たす場合に限る。**識別子の綴りは一切見ない。**
 *   (a) `if` 文であり、その内側に **expect が一つも無い**（主張を包む分岐はここで落ちる）。
 *   (b) then 節が沈黙して抜ける形であり、その終端が **値を伴う `return`** である。
 *   (c) その分岐を囲む最も内側の関数が**テスト本体ではない**（補助の内部である）。
 *
 * **なぜこれが「抑止」ではないか**: 値を返す関数が値を返す経路を持つのは、その関数が
 * 関数であることそのものである。`return <値>` はテストの流れを放棄しておらず、
 * 呼び出し側へ結果を渡している。債務は呼び出し側がその値をどう扱うかにあり、
 * 呼び出し側の `if (await navigateTo...())` は従来どおり検出される（A 群と同じ理屈）。
 *
 * テスト本体の中の `return;`（値を伴わない）は、以降の検証が丸ごと実行されない
 * 真正の沈黙脱出であり、この規則には当たらない
 * （`e2e/specs/quantity-tables/import-e2e.spec.ts:809` がその実例）。
 *
 * Task 115.137 の査読で、沈黙脱出の見極めを広げた結果、補助の中の
 * `return <値>`（`e2e/specs/auth/password-reset.spec.ts:587` の受信メールの取り出し、
 * `e2e/specs/quantity-tables/import-e2e.spec.ts:132` の遷移補助）が
 * 誤検出になっていたため加えた。
 */
export function valueProducingExitExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (containsAssertion(node)) return undefined;
  if (!isSilentExit(node.thenStatement)) return undefined;
  const list = ts.isBlock(node.thenStatement)
    ? [...node.thenStatement.statements]
    : [node.thenStatement];
  const terminal = list[list.length - 1];
  if (!terminal || !ts.isReturnStatement(terminal) || !terminal.expression) return undefined;
  if (!insideNonTestFunction(node)) return undefined;
  return '値を作る補助が値を返す分岐（検証からの脱出ではない）';
}

/** 節点を囲む最も内側の繰り返し（関数の境界に達したら `undefined`） */
function enclosingIteration(node: ts.Node): ts.IterationStatement | undefined {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isIterationStatement(n, /* lookInLabeledStatements */ false)) return n;
    if (ts.isFunctionLike(n)) return undefined;
  }
  return undefined;
}

/**
 * 繰り返しが尽きたときに、直後の無条件の `throw` で必ず失敗するか。
 *
 * `throw` が握り潰されうる形（繰り返しから関数の境界までの間に `try` が挟まる形）は
 * 偽を返す。関門が実際に落ちることを構造で確かめられない以上、検出を残す側へ倒す。
 */
function loopExhaustionThrows(loop: ts.IterationStatement): boolean {
  for (let n: ts.Node | undefined = loop.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) break;
    if (ts.isTryStatement(n)) return false;
  }
  const parent = loop.parent;
  if (!parent || !ts.isBlock(parent)) return false;
  const index = parent.statements.indexOf(loop as ts.Statement);
  if (index < 0) return false;
  for (const s of parent.statements.slice(index + 1)) {
    if (ts.isThrowStatement(s)) return true;
    // 繰り返しを抜けた先に別の脱出があるなら、素通りする経路が残る
    if (ts.isReturnStatement(s)) return false;
  }
  return false;
}

/**
 * 【検出器の規則による対象外 (4)】再試行の成功時に抜ける分岐か（計画の D1 群）。
 *
 * 計画 §6 の除外条件 (1)「条件が偽なら直後に throw / 無条件の主張で落ちる（再試行の待機）」に
 * 構造上必ず該当する形だけを外す。`escapesCheckedLoop` が `break` / `continue` について
 * 行っている判定を、**関数ごと抜ける `return`** について行うものである。
 *
 * 次のすべてを満たす場合に限る。**識別子の綴りは一切見ない。**
 *   (a) `else` を持たない `if` 文であり、その内側に **expect が一つも無い**
 *       （主張を包む分岐は「再試行の待機」ではなく検証の無効化であるため、ここで落ちる）。
 *   (b) then 節が沈黙して抜ける形であり、その終端が **値を伴わない `return`** である。
 *   (c) その分岐が繰り返しの内側にある。
 *   (d) その繰り返しが尽きた直後に**無条件の `throw`** がある（握り潰されうる形は除く）。
 *
 * **なぜこれが「抑止」ではないか**: この形の関数は「観測が成立したので抜ける」か
 * 「上限まで成立しなかったので落ちる」の二つの結末しか持たない。素通りする経路が無い。
 * また `throw` より後に書かれた文は到達しないため、`return` が飛び越す検証も存在しない。
 *
 * 実例（`e2e/helpers/api-readiness.ts` の疎通待ち、
 * `e2e/specs/auth/invitations.spec.ts` の招待一覧の読み込み待ち）。
 * **繰り返しの後に `throw` が無い形**（上限に達しても黙って戻る形）は真正の沈黙脱出であり、
 * 本規則には当たらず従来どおり検出される。
 */
export function retryExhaustionFailureExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (node.elseStatement) return undefined;
  if (containsAssertion(node)) return undefined;
  if (!isSilentExit(node.thenStatement)) return undefined;
  const list = ts.isBlock(node.thenStatement)
    ? [...node.thenStatement.statements]
    : [node.thenStatement];
  const terminal = list[list.length - 1];
  if (!terminal || !ts.isReturnStatement(terminal) || terminal.expression) return undefined;
  const loop = enclosingIteration(node);
  if (!loop) return undefined;
  if (!loopExhaustionThrows(loop)) return undefined;
  return '再試行の成功時に抜ける分岐（繰り返しが尽きれば直後の throw で必ず失敗する）';
}

/**
 * 検出器の規則による対象外。該当する場合は理由を返す。
 *
 * 注釈（`e2e-guard-allow`）による除外と違い、こちらは**そもそも欠陥ではない構造**を
 * 検出器が誤って拾っていた分である（計画 §5 の A 群・B 群、Task 115.127 段3）。
 * 規則を戻すと自己検査（check-e2e-assertion-guards.selftest.ts）が落ちる。
 */
export function ruleBasedExclusion(node: ts.Node): string | undefined {
  return (
    predicateImplementationExclusion(node) ??
    guaranteedFailureExclusion(node) ??
    valueProducingExitExclusion(node) ??
    retryExhaustionFailureExclusion(node)
  );
}

/** 制御を分岐の外へ出す文か（return / continue / break / test.skip / test.fixme） */
function isExitStatement(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement)) return true;
  if (ts.isContinueStatement(statement)) return true;
  if (ts.isBreakStatement(statement)) return true;
  if (ts.isExpressionStatement(statement)) {
    const text = statement.expression.getText();
    return text.startsWith('test.skip') || text.startsWith('test.fixme');
  }
  return false;
}

/**
 * `break` / `continue` が抜ける繰り返し。
 *
 * 判定できない形（ラベル付き、`switch` を挟む、関数の境界に達する）では `undefined` を返す。
 * 判定できない場合は検出を残す側（沈黙脱出として扱う側）へ倒す。
 */
function enclosingLoop(statement: ts.BreakOrContinueStatement): ts.IterationStatement | undefined {
  if (statement.label) return undefined; // ラベル付きは抜ける先を構造だけでは決められない
  for (let n: ts.Node | undefined = statement.parent; n; n = n.parent) {
    if (ts.isIterationStatement(n, /* lookInLabeledStatements */ false)) return n;
    // `switch` の中の `break` は繰り返しではなく `switch` を抜ける
    if (ts.isSwitchStatement(n) && ts.isBreakStatement(statement)) return undefined;
    if (ts.isFunctionLike(n)) return undefined;
  }
  return undefined;
}

/** 文（またはブロック）の直下に throw があるか（前提が崩れたら必ず落ちる関門） */
function throwsDirectly(statement: ts.Statement): boolean {
  const list = ts.isBlock(statement) ? [...statement.statements] : [statement];
  return list.some((s) => ts.isThrowStatement(s));
}

/**
 * 続く文の並びが「観測の結果を無条件に検査する」か。
 *
 * 次のいずれかが並びの中にあれば真とする。
 *   (a) 無条件の主張（`expect(found).toBe(true)` / `await expect(...).toBeVisible()`）
 *   (b) 無条件の throw
 *   (c) `else` を持たない分岐で、その本体が必ず throw する（`if (!found) { throw ... }`）
 *   (d) `else` を持つ分岐で、どちらの経路も throw か主張に至る
 */
function checksOutcome(list: readonly ts.Statement[]): boolean {
  for (const s of list) {
    if (ts.isThrowStatement(s)) return true;
    if (ts.isExpressionStatement(s) && containsAssertion(s)) return true;
    if (ts.isVariableStatement(s) && containsAssertion(s)) return true;
    if (ts.isIfStatement(s)) {
      if (!s.elseStatement) {
        if (throwsDirectly(s.thenStatement)) return true;
        continue;
      }
      if (alwaysFailsOrAsserts(s.thenStatement) && alwaysFailsOrAsserts(s.elseStatement)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 【誤検出の抑止】探索・再試行の繰り返しから抜けるだけの `break` / `continue` か。
 *
 * `break` / `continue` は**繰り返しを抜けるだけ**であり、テストからは抜けない。
 * 抜けた先で観測の結果が無条件に検査されていれば、検証は一つも飛んでいない。
 *
 *     let found = false;
 *     for (let i = 0; i < rowCount; i++) {
 *       const rowText = await rows.nth(i).textContent();
 *       if (rowText?.includes(TARGET)) {
 *         found = true;
 *         break;            // ← 繰り返しを抜けるだけ
 *       }
 *     }
 *     expect(found).toBe(true);   // ← 観測が偽なら必ず失敗する
 *
 * **これは削減計画が E 群の是正先として推奨している形そのものである。**
 * 沈黙脱出の見極めを「本体の終端が脱出であること」へ広げた際、この定型が丸ごと
 * 誤検出になった（Task 115.137 の査読で判明。誤検出 16 件）。正しい書き方を
 * 負債として数えてはならないため、繰り返しを抜けた先の検査を見て除く。
 *
 * **`isExitStatement` から `break` / `continue` を外す案は採らなかった。**
 * 実測では、その案でも今日の走査結果は本規則と同じ箇所（誤検出だった三件）しか動かない。
 * 違いが出るのは将来である。その案は「抜けた先で結果を一切検査しない `break` / `continue`」
 * （`if (!(await row.isVisible())) continue;` だけで終わる形）まで一律に無検出にするため、
 * E 群の是正先として推奨した形が劣化したときに検出できない。本規則は劣化した形を残す。
 */
function escapesCheckedLoop(statement: ts.Statement): boolean {
  if (!ts.isBreakStatement(statement) && !ts.isContinueStatement(statement)) return false;
  const loop = enclosingLoop(statement);
  if (!loop) return false;
  const parent = loop.parent;
  if (!parent || !ts.isBlock(parent)) return false;
  const index = parent.statements.indexOf(loop as ts.Statement);
  if (index < 0) return false;
  return checksOutcome(parent.statements.slice(index + 1));
}

/**
 * 分岐の本体が「黙って抜ける」か。
 *
 * **「脱出の文だけで構成される」ではなく「脱出で終わり、その途中で主張も失敗もしない」**
 * を条件とする（Task 115.137）。
 *
 * 以前は本体の**すべての文**が脱出であることを求めていた。この形は、脱出の直前に
 * 後始末や記録が一つでも挟まると成立せず、沈黙して抜ける経路が丸ごと無検出になっていた。
 * 実例（`e2e/specs/quantity-tables/import-e2e.spec.ts:809`）:
 *
 *     if (!(await isVisibleWithin(groupButton, getTimeout(3000)))) {
 *       const cancelBtn = dialog.getByRole('button', { name: 'キャンセル' }).last();
 *       if (await isVisibleWithin(cancelBtn, getTimeout(2000))) {
 *         await cancelBtn.click();   // ← 後始末が挟まるだけで無検出になっていた
 *       }
 *       return;                      // ← 以降の検証は丸ごと実行されない
 *     }
 *
 * 検証が飛ぶかどうかを決めるのは「途中に何が書かれているか」ではなく、
 * 「主張も失敗もせずに制御が抜けるか」である。したがって次を条件とする。
 *   (a) 本体の終端が脱出の文である（そこで必ず分岐の外へ出る）
 *   (b) 本体のどこにも主張（expect）が無い
 *   (c) 本体のどこにも失敗（throw / expect.fail / test.fail）が無い
 *
 * (b)(c) があるため、後始末の途中で必ず落ちる形や、抜ける前に主張する形は含まれない。
 * 終端が脱出でない形（`if (x) return;` で終わる等、素通りする経路が残る形）も含まれない。
 *
 * さらに (d) として、終端が `break` / `continue` であり、抜けた繰り返しの後で観測の結果が
 * 無条件に検査される形を除く（Task 115.137 の査読。詳細は escapesCheckedLoop を参照）。
 * `break` / `continue` は繰り返しを抜けるだけでテストからは抜けないため、
 * これを一律に「検証からの脱出」とみなすと、探索・再試行の正しい定型が誤検出になる。
 */
export function isSilentExit(statement: ts.Statement): boolean {
  const statements = ts.isBlock(statement) ? [...statement.statements] : [statement];
  if (statements.length === 0) return false;
  const terminal = statements[statements.length - 1]!;
  if (!isExitStatement(terminal)) return false;
  // 繰り返しを抜けるだけで、抜けた先で結果が無条件に検査される形は沈黙脱出ではない
  if (escapesCheckedLoop(terminal)) return false;
  if (containsAssertion(statement)) return false;
  if (containsFailure(statement)) return false;
  return true;
}

/** 比較の演算子（比較そのものは実質のある検証なので恒真とはみなさない） */
const COMPARISON_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

/** 代入の演算子か（`=` および複合代入） */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function unwrapParentheses(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * 偽値のリテラルか。
 *
 * `x ?? null` や `x || ''` のように既定値として偽値を補う形は、
 * 真偽の主張（toBeTruthy）を骨抜きにしない。左辺が偽なら結果も偽であり、
 * 主張はそのまま左辺に対して働くためである。
 */
function isFalsyLiteral(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (inner.kind === ts.SyntaxKind.NullKeyword) return true;
  if (inner.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isIdentifier(inner) && inner.text === 'undefined') return true;
  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
    return inner.text === '';
  }
  if (ts.isNumericLiteral(inner)) return Number(inner.text) === 0;
  return false;
}

/** 型判定を直接の被演算子に持つか（`typeof x === 'number'` の判別） */
function hasTypeOfOperand(node: ts.BinaryExpression): boolean {
  return (
    ts.isTypeOfExpression(unwrapParentheses(node.left)) ||
    ts.isTypeOfExpression(unwrapParentheses(node.right))
  );
}

/**
 * 恒真になり得る式か。
 *
 * 対象は次の三つに限る。
 * - リテラルそのもの（`expect(true)`）
 * - 型判定（`typeof x === 'number'`。実行時の値ではなく静的な型に依存する）
 * - 論理和・既定値（`expect(A || B)`。どちらの結果でも通るため観測を検証していない）
 *
 * 比較（`a === b`、`a <= b` 等）は実質のある検証なので含めない。被演算子へ再帰すると
 * `x === 304` のようなリテラル比較まで恒真として数えてしまうため、比較の形を見つけた
 * 時点で打ち切る（型判定を被演算子に持つ場合のみ例外とする）。
 * これにより `a === null || a.ok() || a.status() === 304` のように
 * 「比較を含むが全体としては恒真」な論理和は従来どおり検出される。
 *
 * 既定値として偽値を補うだけの形（`match?.[1] ?? null`）も、真偽の主張を
 * 骨抜きにしないため恒真とはみなさない。
 */
function isVacuousBoolean(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return isVacuousBoolean(node.expression);
  if (ts.isTypeOfExpression(node)) return true;
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      if (isFalsyLiteral(node.right)) return isVacuousBoolean(node.left);
      return true;
    }
    if (COMPARISON_OPERATORS.has(kind)) return hasTypeOfOperand(node);
    if (isAssignmentOperator(kind)) return false;
    return isVacuousBoolean(node.left) || isVacuousBoolean(node.right);
  }
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node)
  );
}

/**
 * 代入の右辺のうち、恒真の主題として評価してよい形か。
 *
 * 後から代入される名前については、宣言時の仮置きの値を主題にしてはならない
 * （`let accessToken = ''`）。しかし代入の右辺まで一律に打ち切ると、
 * `let errorFound = false; errorFound = a || b;` のように代入した式そのものが
 * 恒真である形を取り逃がす。そこで右辺の形を見て次の二つに限り評価する。
 *
 * - 論理和・既定値（`a || b` / `a ?? b`。右辺が偽値のリテラルである既定値は除く）
 * - 型判定（`typeof x === 'number'` / `typeof x`）
 *
 * 真偽のリテラルの単純な代入（`flag = true`）は評価しない。
 * `let downloadHappened = false; … downloadHappened = true;` のように、
 * 事象の発生を記録して検証する観測フラグが正当な用法として多数を占めるためである。
 */
function isEvaluableAssignment(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (ts.isTypeOfExpression(inner)) return true;
  if (ts.isBinaryExpression(inner)) {
    const kind = inner.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      return !isFalsyLiteral(inner.right);
    }
    if (COMPARISON_OPERATORS.has(kind)) return hasTypeOfOperand(inner);
  }
  return false;
}

/**
 * 条件付きスキップか（`test.skip(<式>, ...)` / `test.fixme(<式>, ...)`）
 *
 * 引数なしの呼び出し（`test.skip()`）も対象とする。条件分岐の内側で呼ぶ形は
 * 条件式を渡す形と効果が同一であり、無条件に呼ぶ形は検証そのものの放棄であるため、
 * どちらも「前提が満たせない場合に沈黙して飛ばす」型に属する（Task 115.127 段0）。
 */
function isConditionalSkip(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression.getText(sourceFile);
  if (callee !== 'test.skip' && callee !== 'test.fixme') return false;
  const first = node.arguments[0];
  // 引数なしの飛ばし（`test.skip();`）。条件分岐の内側／外側を問わず検証が消える
  if (!first) return true;
  // タイトル指定（文字列）や実行条件の宣言（関数）は対象外
  if (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first)) return false;
  if (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) return false;
  return true;
}

export function scanFile(absPath: string): ScanResult {
  return scanSource(path.relative(ROOT, absPath), fs.readFileSync(absPath, 'utf8'));
}

// ============================================================================
// 抽出で除外したものの不在を主張する形（T7。Task 115.139）
// ============================================================================

/** 正規表現の拡張表記のうち、そのまま一文字を表すもの */
const REGEX_ESCAPE_LITERALS: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  f: '\f',
  v: '\v',
  '0': '\0',
};

/**
 * 正規表現に一致した文字列に現れうる文字の**上界**を、原子ごとの判定の一覧として作る。
 *
 * 一致した文字列は、原子が受理した文字だけで構成される。したがって上界に無い文字は
 * 一致した文字列に現れ得ない。上界が定まらない書き方（`.` / `\S` / `\D` / `\W` /
 * 否定文字クラス / 後方参照 / コードポイント表記）に出会った時点で `undefined` を返し、
 * 判定を諦める。諦めた側は検出しない（過検出は主張を消す圧力になるため）。
 *
 * 先読み・後読みの中身も原子として数える。実際には文字を消費しないため上界としては
 * 過大だが、過大な上界は「含み得ない」の結論を弱めるだけで、誤検出の方向には働かない。
 */
function regexCharTests(pattern: string): Array<(ch: string) => boolean> | undefined {
  const tests: Array<(ch: string) => boolean> = [];
  const literal = (ch: string): void => {
    tests.push((c) => c === ch);
  };
  let i = 0;
  let inClass = false;
  /** 文字クラスの範囲指定（`a-z`）の始端 */
  let previous: string | undefined;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) return undefined;
      i += 2;
      if (next === 'd') {
        tests.push((c) => c >= '0' && c <= '9');
        previous = undefined;
        continue;
      }
      if (next === 'w') {
        tests.push((c) => /[A-Za-z0-9_]/.test(c));
        previous = undefined;
        continue;
      }
      if (next === 's') {
        tests.push((c) => /\s/.test(c));
        previous = undefined;
        continue;
      }
      // 否定の族・コードポイント表記・後方参照は上界が定まらない
      if ('DWSuxpPk'.includes(next) || (next >= '1' && next <= '9')) return undefined;
      if ((next === 'b' || next === 'B') && !inClass) {
        // 語境界は文字を消費しない
        previous = undefined;
        continue;
      }
      const value = REGEX_ESCAPE_LITERALS[next] ?? (next === 'b' ? '\b' : next);
      literal(value);
      previous = value;
      continue;
    }

    if (inClass) {
      if (ch === ']') {
        inClass = false;
        previous = undefined;
        i += 1;
        continue;
      }
      const to = pattern[i + 1];
      if (ch === '-' && previous !== undefined && to !== undefined && to !== ']') {
        if (to === '\\') return undefined;
        const from = previous;
        tests.push((c) => c >= from && c <= to);
        previous = undefined;
        i += 2;
        continue;
      }
      literal(ch);
      previous = ch;
      i += 1;
      continue;
    }

    if (ch === '[') {
      if (pattern[i + 1] === '^') return undefined;
      inClass = true;
      previous = undefined;
      i += 1;
      continue;
    }
    if (ch === '.') return undefined;
    if (ch === '(') {
      const group = /^\((\?:|\?=|\?!|\?<=|\?<!|\?<[A-Za-z_$][\w$]*>)?/.exec(pattern.slice(i));
      i += group?.[0].length ?? 1;
      previous = undefined;
      continue;
    }
    if (ch === '{') {
      const quantifier = /^\{\d+(,\d*)?\}/.exec(pattern.slice(i));
      if (quantifier) {
        i += quantifier[0].length;
        previous = undefined;
        continue;
      }
      literal(ch);
      previous = ch;
      i += 1;
      continue;
    }
    if (')|^$*+?'.includes(ch)) {
      previous = undefined;
      i += 1;
      continue;
    }
    literal(ch);
    previous = ch;
    i += 1;
  }

  if (inClass) return undefined;
  return tests;
}

/**
 * 正規表現に一致した文字列が `needle` を含み得ないか。
 *
 * `needle` の文字のうち一つでも上界に含まれないものがあれば、
 * 一致した文字列が `needle` を部分文字列として含むことはあり得ない。
 */
function regexCannotYield(pattern: string, needle: string): boolean {
  if (needle === '') return false;
  const tests = regexCharTests(pattern);
  if (!tests) return false;
  return [...needle].some((ch) => !tests.some((test) => test(ch)));
}

/** 正規表現リテラルの本体と修飾子（正規表現リテラルでなければ `undefined`） */
function regexLiteralParts(node: ts.Node): { pattern: string; flags: string } | undefined {
  if (!ts.isRegularExpressionLiteral(node)) return undefined;
  const text = node.getText();
  const end = text.lastIndexOf('/');
  if (end <= 0) return undefined;
  return { pattern: text.slice(1, end), flags: text.slice(end + 1) };
}

/** その置換が `needle` を残らず取り除くか（`.replace(/\./g, '')` の形） */
function replacementRemovesNeedle(
  parts: { pattern: string; flags: string },
  replacement: string,
  needle: string
): boolean {
  if (replacement !== '' || !parts.flags.includes('g')) return false;
  try {
    return needle.replace(new RegExp(parts.pattern, parts.flags), '') === '';
  } catch {
    return false;
  }
}

// ============================================================================
// 型が構文で確定した値に対する型の主張（T10。Task 115.143）
// ============================================================================

/**
 * 実行時の型の主張を受け取る matcher。
 *
 * `expect(typeof x).toBe('string')` の形だけを見る。`not` を挟む形は「その型ではない」
 * という別の主張（型が確定していれば恒偽）であるため対象外とする。
 */
const TYPE_EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/**
 * 戻り値の実行時の型が構文だけで判る呼び出し。
 *
 * ここに無い呼び出しは「判らない」として扱い、検出しない（見逃す側へ倒す）。
 * `null` は `typeof` では `'object'` として観測されるが、既定値（`?? ''`）で
 * 潰されるかどうかを見分けるために内部では `'null'` のまま持ち、判定の直前に
 * `'object'` へ写す。
 */
const SETTLED_RETURN_TYPES: Record<string, readonly string[] | undefined> = {
  // Playwright: 要素の中身が無ければ null を返す
  textContent: ['string', 'null'],
  getAttribute: ['string', 'null'],
  // Playwright: 常に文字列を返す
  innerText: ['string'],
  innerHTML: ['string'],
  inputValue: ['string'],
  // Playwright: 常に数値を返す
  count: ['number'],
};

/** `typeof` で観測される綴りへ写す（`null` は `'object'` として現れる） */
function toObservedTypeName(name: string): string {
  return name === 'null' ? 'object' : name;
}

// ============================================================================
// 不在と観測の失敗を区別しない主張（T8。Task 115.140）
// ============================================================================

/** 不在を主張する matcher と、その主張が指す「不在の値」 */
export type AbsenceKind = 'null' | 'undefined';

const ABSENCE_MATCHERS: Record<string, AbsenceKind | undefined> = {
  toBeNull: 'null',
  toBeUndefined: 'undefined',
};

// ============================================================================
// 空の母集団に対する不在の主張（T11。Task 115.162）
// ============================================================================

/**
 * 集まりから集まりを作る操作。母集団が空なら結果も空である。
 *
 * `concat` は引数側に要素があれば空にならないが、**空になりうる**ことが本型の関門であり、
 * 空にならない形は「母集団の大きさを固定する主張」の探索で外れる。
 */
const COLLECTION_PROJECTIONS = new Set(['map', 'filter', 'flatMap', 'slice', 'concat']);

/** 文字列の形を保つ加工。連結の結果が空文字であることを変えない */
const STRING_PRESERVING = new Set([
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'normalize',
]);

/** 空の母集団に対する不在の主張を数える matcher */
const EMPTY_POPULATION_MATCHERS = new Set(['toContain', 'toMatch']);

/** その `return` が当該の不在の値を返すか（`return null` / `return undefined` / `return;`） */
function returnsAbsentValue(node: ts.ReturnStatement, kind: AbsenceKind): boolean {
  if (!node.expression) return kind === 'undefined';
  const inner = unwrapParentheses(node.expression);
  if (kind === 'null') return inner.kind === ts.SyntaxKind.NullKeyword;
  if (ts.isIdentifier(inner)) return inner.text === 'undefined';
  return ts.isVoidExpression(inner);
}

/**
 * 補助の内側で当該の不在の値を返す経路。
 *
 * **入れ子の関数の内側も数える。** `return await page.evaluate(() => { ... })` の形では、
 * ブラウザ側で評価される関数が返した空値がそのまま補助の戻り値として呼び出し側へ届く。
 * 外側の `return` だけを数えると、まさに本型が対象とする形（観測できなかった場合の空値）を
 * 数え落とす。
 */
function absentReturnPaths(
  fn: ts.FunctionLikeDeclaration,
  kind: AbsenceKind
): ts.ReturnStatement[] {
  const found: ts.ReturnStatement[] = [];
  const body = fn.body;
  if (!body) return found;
  if (!ts.isBlock(body)) {
    return found;
  }
  const visit = (n: ts.Node): void => {
    if (ts.isReturnStatement(n) && returnsAbsentValue(n, kind)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/**
 * e2e 配下の走査対象ファイル（分類走査から同じ集合を辿るために公開する）。
 *
 * `SCAN_SUBDIRS` の説明のとおり、テストの実行中に働くものだけを走査する。
 * 走査対象のディレクトリが失われている場合は**黙って空にせず失敗させる**。
 * 走査対象が消えれば検出は静かにゼロへ近づき、検査は「通った」ように見えるためである。
 */
export function collectE2eFiles(): string[] {
  const files: string[] = [];
  for (const name of SCAN_SUBDIRS) {
    const dir = path.join(E2E_DIR, name);
    if (!fs.existsSync(dir)) {
      throw new Error(
        `走査対象のディレクトリが見つかりません: ${path.relative(ROOT, dir)}\n` +
          '走査対象が失われると検出は静かに消えます。SCAN_SUBDIRS を実態に合わせてください。'
      );
    }
    collectFiles(dir, files);
  }
  return files.sort();
}

/**
 * 走査本体。ファイルの内容そのものを受け取るため、検出規則の確認では
 * 任意の書き方を注入して結果を検証できる（scripts/check-e2e-assertion-guards.selftest.ts）。
 */
export function scanSource(relPath: string, source: string): ScanResult {
  const sourceFile = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true);
  const lines = source.split('\n');
  const findings: Finding[] = [];
  const findingNodes: ts.Node[] = [];
  const allowed: AllowEntry[] = [];
  const invalidAllows: AllowEntry[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const snippetOf = (node: ts.Node): string =>
    node.getText(sourceFile).split('\n')[0]!.trim().slice(0, 110);

  // --------------------------------------------------------------------------
  // 局所変数の表（同名は併合する）
  //
  // 初期化子を伴う宣言のほか、次の二つの書き方も同じ表に載せる。
  //   - 分割して受ける形（`const { ok } = await res.json()` / `const [a] = await ...`）
  //   - 宣言と代入を分ける形（`let id: string;` … `id = await createProject()`）
  // 後者は上位の有効範囲での宣言と組み合わさる用例が多く、表に載せないと
  // `if (!id) { return; }` のような沈黙して終える構造が無検出になる。
  // --------------------------------------------------------------------------
  //
  // 表は「宣言の初期化子」と「代入の右辺」に分ける。分類（T1/T4/T5）では双方を
  // 同じように展開するが、T3 の主題の判断では扱いが異なるためである（後述）。
  // --------------------------------------------------------------------------
  /** 宣言の初期化子（分割して受ける形を含む） */
  const declTable = new Map<string, ts.Expression[]>();
  /** 代入の右辺（`id = await createProject()` の右辺） */
  const assignTable = new Map<string, ts.Expression[]>();
  /** 後から代入される名前（宣言時の値を主題の判断に用いない） */
  const reassigned = new Set<string>();
  /** 同一ファイルで宣言された関数（名前 → 実体。同名は併合する。T8 / T9 の追跡に用いる） */
  const localFunctions = new Map<string, ts.FunctionLikeDeclaration[]>();
  /** 名前付きで取り込んだ識別子（T9 で `e2e/helpers/` 由来の補助を見分けるために用いる） */
  const namedImports = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) namedImports.add(element.name.text);
    }
  }
  {
    const register = (
      table: Map<string, ts.Expression[]>,
      name: string,
      expression: ts.Expression
    ): void => {
      const list = table.get(name) ?? [];
      list.push(expression);
      table.set(name, list);
    };
    const registerBinding = (name: ts.BindingName, expression: ts.Expression): void => {
      if (ts.isIdentifier(name)) {
        register(declTable, name.text, expression);
        return;
      }
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) continue;
        registerBinding(element.name, expression);
      }
    };
    const registerFunction = (name: string, fn: ts.FunctionLikeDeclaration): void => {
      const list = localFunctions.get(name) ?? [];
      list.push(fn);
      localFunctions.set(name, list);
    };
    const collect = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        registerBinding(n.name, n.initializer);
      }
      if (ts.isFunctionDeclaration(n) && n.name) {
        registerFunction(n.name.text, n);
      }
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
      ) {
        registerFunction(n.name.text, n.initializer);
      }
      if (ts.isBinaryExpression(n) && isAssignmentOperator(n.operatorToken.kind)) {
        const target = unwrapParentheses(n.left);
        if (ts.isIdentifier(target)) {
          reassigned.add(target.text);
          if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            register(assignTable, target.text, n.right);
          }
        }
      }
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken ||
          n.operator === ts.SyntaxKind.MinusMinusToken) &&
        ts.isIdentifier(n.operand)
      ) {
        reassigned.add(n.operand.text);
      }
      ts.forEachChild(n, collect);
    };
    collect(sourceFile);
  }

  /** 式に現れる識別子の初期化子を展開した文字列（分類に用いる） */
  const expandedText = (node: ts.Node): string => {
    const parts = [node.getText(sourceFile)];
    const seen = new Set<string>();
    const walk = (n: ts.Node, depth: number): void => {
      if (depth > RESOLVE_DEPTH_LIMIT) return;
      const visitIdentifiers = (m: ts.Node): void => {
        if (ts.isIdentifier(m) && !seen.has(m.text)) {
          const values = [...(declTable.get(m.text) ?? []), ...(assignTable.get(m.text) ?? [])];
          if (values.length > 0) {
            seen.add(m.text);
            for (const value of values) {
              parts.push(value.getText(sourceFile));
              walk(value, depth + 1);
            }
          }
        }
        ts.forEachChild(m, visitIdentifiers);
      };
      visitIdentifiers(n);
    };
    walk(node, 0);
    return parts.join(' ');
  };

  /**
   * 判定の主題が恒真になり得るか（識別子は値の出どころまで辿る）。
   *
   * 後から代入される名前は、宣言時の値を辿らない。`let accessToken = ''` のように
   * 宣言時の値が仮置きで、代入後の値を検証する形が正当な主張であるため。
   * 一方で代入の右辺は、その形自体が恒真になり得るもの（論理和・既定値・型判定）に
   * 限って評価する。`let ok = false; ok = a || b;` は宣言時の値ではなく代入した式が
   * 恒真なのであり、同じ式を `const` で書いた場合と扱いを変える理由が無いためである。
   */
  const isVacuousSubject = (node: ts.Expression, depth = 0): boolean => {
    if (ts.isParenthesizedExpression(node)) return isVacuousSubject(node.expression, depth);
    if (ts.isAwaitExpression(node)) return isVacuousSubject(node.expression, depth);
    if (isVacuousBoolean(node)) return true;
    if (ts.isIdentifier(node) && depth < RESOLVE_DEPTH_LIMIT) {
      if (reassigned.has(node.text)) {
        for (const assigned of assignTable.get(node.text) ?? []) {
          if (isEvaluableAssignment(assigned) && isVacuousSubject(assigned, depth + 1)) return true;
        }
        return false;
      }
      for (const initializer of declTable.get(node.text) ?? []) {
        if (isVacuousSubject(initializer, depth + 1)) return true;
      }
    }
    return false;
  };

  /**
   * 「抽出で除外したものの不在を主張する」形か（第八の型。Task 115.139）。
   *
   * 主張の主題が正規表現による抜き出しに由来し、その正規表現が `needle` を含む
   * 文字列を一致させ得ないなら、抽出後の文字列に `needle` が現れることは原理的に無い。
   * すなわち「`needle` を含まない」という主張は、画面が何を表示していても成立する。
   *
   *   const matched = text.match(/[\d,]+/);            // 小数点を受理しない抜き出し
   *   expect(matched![0].replace(/,/g, '')).not.toContain('.');  // 決して失敗しない
   *
   * 抜き出しから主張までの間に挟まる形のうち、`needle` を作り出さないと構文で判る
   * ものだけを遡る（要素参照・`trim` 族・`needle` の文字を含まない文字列への置換）。
   * `needle` を残らず取り除く置換（`.replace(/\./g, '')`）も同じ形として扱う。
   * 除去そのものが主張の結論を先取りしているためである。
   */
  const assertsExcludedAbsence = (expr: ts.Expression, needle: string, depth = 0): boolean => {
    if (depth > RESOLVE_DEPTH_LIMIT) return false;
    const node = unwrapParentheses(expr);
    if (ts.isNonNullExpression(node) || ts.isAwaitExpression(node)) {
      return assertsExcludedAbsence(node.expression, needle, depth + 1);
    }
    if (ts.isElementAccessExpression(node)) {
      return assertsExcludedAbsence(node.expression, needle, depth + 1);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      const target = node.expression.expression;
      const first = node.arguments[0] ? unwrapParentheses(node.arguments[0]!) : undefined;
      if ((name === 'match' || name === 'matchAll') && first) {
        const parts = regexLiteralParts(first);
        return parts !== undefined && regexCannotYield(parts.pattern, needle);
      }
      if (name === 'exec') {
        const parts = regexLiteralParts(unwrapParentheses(target));
        return parts !== undefined && regexCannotYield(parts.pattern, needle);
      }
      if (name === 'replace' || name === 'replaceAll') {
        const replacement = node.arguments[1];
        if (!replacement || !ts.isStringLiteralLike(replacement)) return false;
        const parts = first ? regexLiteralParts(first) : undefined;
        if (parts && replacementRemovesNeedle(parts, replacement.text, needle)) return true;
        // 置換が needle を作り出しうる場合は、抜き出しの出どころへ遡らない
        if ([...needle].some((ch) => replacement.text.includes(ch))) return false;
        return assertsExcludedAbsence(target, needle, depth + 1);
      }
      if (name === 'trim' || name === 'trimStart' || name === 'trimEnd') {
        return assertsExcludedAbsence(target, needle, depth + 1);
      }
      return false;
    }
    if (ts.isIdentifier(node) && !reassigned.has(node.text)) {
      const values = declTable.get(node.text) ?? [];
      return values.length === 1 && assertsExcludedAbsence(values[0]!, needle, depth + 1);
    }
    return false;
  };

  /**
   * 不在の主張の主題が「観測の失敗」と区別できないか（T8。Task 115.140）。
   *
   * 主題が同一ファイルで宣言された補助の呼び出しであり、その補助が**当該の不在の値を
   * 二つ以上の経路で返す**場合に該当する。経路が一つなら、その値が返る条件は一つに定まり、
   * 主張はその条件を確かに指している。二つ以上あるとき、主張は「対象が不在である」経路と
   * 「そもそも観測できなかった」経路のどちらで成立したのかを区別しない。
   *
   * **識別子の綴りは一切見ない。** 補助の名前・変数の名前は判定に用いない。
   */
  const ambiguousAbsence = (
    subject: ts.Expression,
    kind: AbsenceKind,
    depth = 0
  ): string | undefined => {
    if (depth > RESOLVE_DEPTH_LIMIT) return undefined;
    let inner = unwrapParentheses(subject);
    if (ts.isAwaitExpression(inner)) inner = unwrapParentheses(inner.expression);
    if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) {
      const name = inner.expression.text;
      const fns = localFunctions.get(name);
      // 同名の宣言が複数ある場合、どれが呼ばれるかを構文だけでは決められないため諦める
      if (!fns || fns.length !== 1) return undefined;
      const paths = absentReturnPaths(fns[0]!, kind);
      if (paths.length < 2) return undefined;
      return `${name} が ${kind} を ${paths.length} 通りの経路で返す`;
    }
    if (ts.isIdentifier(inner) && !reassigned.has(inner.text)) {
      const values = declTable.get(inner.text) ?? [];
      if (values.length === 0) return undefined;
      const reasons = values.map((v) => ambiguousAbsence(v, kind, depth + 1));
      const first = reasons[0];
      if (first === undefined) return undefined;
      // 同名の宣言が複数あるときは、すべてが同じ補助を指す場合に限る
      return reasons.every((r) => r === first) ? first : undefined;
    }
    return undefined;
  };

  /**
   * 主題が「母集団から作られた値」であるか（T11。Task 115.162）。
   *
   * 返すのは次の二つである。
   *   - `kind`  母集団が空になったときに主題が取る値の種別
   *             `'string'` = 連結（`join`）で作った文字列。空なら `''`
   *             `'array'`  = 写像・抽出（`map` / `filter` / `flatMap` / `slice` / `concat`）で
   *                          作った配列。空なら `[]`
   *   - `names` 母集団を指す名前の集合。主題から母集団へ遡る途中で**受け手として現れた**
   *             識別子・項目参照の綴りだけを集める。式の内側に埋もれた識別子は集めない。
   *             集めすぎると「母集団の大きさを固定した主張」の探索が緩くなり、
   *             まさに本型が対象とする形を「固定済み」と誤って見なしてしまう。
   *
   * 構文だけで決められない形は `undefined` を返し、検出しない（数え切れない側は検出しない）。
   */
  const populationOf = (
    expr: ts.Expression,
    depth = 0
  ): { kind: 'string' | 'array'; names: Set<string> } | undefined => {
    if (depth > RESOLVE_DEPTH_LIMIT) return undefined;
    const node = unwrapParentheses(expr);
    if (ts.isNonNullExpression(node) || ts.isAwaitExpression(node) || ts.isAsExpression(node)) {
      return populationOf(node.expression, depth + 1);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      const target = unwrapParentheses(node.expression.expression);
      const inherited = populationOf(target, depth + 1);
      const names = new Set<string>(inherited?.names ?? []);
      if (ts.isIdentifier(target) || ts.isPropertyAccessExpression(target)) {
        names.add(target.getText(sourceFile));
      }
      if (name === 'join') return { kind: 'string', names };
      if (COLLECTION_PROJECTIONS.has(name)) return { kind: 'array', names };
      // 文字列の形を保つ加工は、連結の結果が空文字であることを変えない
      if (STRING_PRESERVING.has(name) && inherited?.kind === 'string') return inherited;
      return undefined;
    }
    if (ts.isIdentifier(node) && !reassigned.has(node.text)) {
      const values = declTable.get(node.text) ?? [];
      if (values.length === 0) return undefined;
      const shapes = values.map((value) => populationOf(value, depth + 1));
      const first = shapes[0];
      if (!first) return undefined;
      // 同名の宣言が複数あるときは、すべてが同じ種別・同じ母集団を指す場合に限る
      const signature = (x: { kind: string; names: Set<string> }): string =>
        `${x.kind}|${[...x.names].sort().join(',')}`;
      if (!shapes.every((x) => x !== undefined && signature(x) === signature(first))) {
        return undefined;
      }
      const names = new Set(first.names);
      names.add(node.text);
      return { kind: first.kind, names };
    }
    return undefined;
  };

  /**
   * 母集団が空でも成立する不在の主張か（T11。Task 115.162）。
   *
   * 該当する場合は理由を、しない場合は `undefined` を返す。判定は二段である。
   *
   *   (1) 母集団が空になったときの値（`''` または `[]`）で、その不在の主張が成立するか。
   *       `not.toContain` / `not.toMatch` の needle は**実際に空の値へ当てて確かめる**。
   *       上界を見積もる必要は無い。`/^$/` のように空文字に一致する正規表現なら
   *       主張は空のときに落ちるため、素通りしない（該当としない）。
   *   (2) 同じテスト本体の中に、その母集団の大きさを固定する主張が**別に**あるか。
   *       母集団を指す名前のいずれかが、否定を伴わない `expect(...)` の主題に
   *       （局所変数を展開したうえで）現れれば、母集団は別に確かめられていると見なす。
   *       広く見積もる方向であり、見逃す側へ倒している。
   */
  const emptyPopulationAbsence = (
    assertion: ts.CallExpression,
    subject: ts.Expression,
    matcher: 'toContain' | 'toMatch',
    needle: ts.Expression | undefined
  ): string | undefined => {
    const population = populationOf(subject);
    if (!population) return undefined;
    // toMatch は文字列にしか当たらない。配列の母集団は toContain だけを見る
    if (population.kind === 'array' && matcher !== 'toContain') return undefined;
    if (!needle) return undefined;

    const emptyValueLabel = population.kind === 'string' ? "''（空文字）" : '[]（空配列）';
    if (population.kind === 'string') {
      if (ts.isRegularExpressionLiteral(needle)) {
        const parts = regexLiteralParts(needle);
        if (!parts) return undefined;
        try {
          if (new RegExp(parts.pattern, parts.flags).test('')) return undefined;
        } catch {
          return undefined;
        }
      } else if (ts.isStringLiteralLike(needle)) {
        if (needle.text === '') return undefined;
      } else {
        // 綴りが構文で定まらない needle は諦める
        return undefined;
      }
    }
    // 配列の母集団は、空配列がどんな needle も含まないため needle を見る必要が無い

    const guardScope = enclosingAssertionScope(assertion);
    if (fixesPopulationSize(guardScope, population.names, assertion)) return undefined;
    const names = [...population.names].join(' / ');
    return `母集団（${names}）が空なら主題は ${emptyValueLabel} となり、この不在の主張は成立する。母集団の大きさを固定する主張が同じテストに無い`;
  };

  /**
   * 母集団の大きさを固定する主張が走査範囲にあるか（T11。Task 115.162）。
   *
   * 「否定を伴わない `expect(...)` の主題に、母集団を指す名前が語として現れる」ことを見る。
   * 当の不在の主張そのものは数えない（自分で自分を保証させないため）。
   */
  const fixesPopulationSize = (
    scope: ts.Node,
    names: Set<string>,
    self: ts.CallExpression
  ): boolean => {
    const patterns = [...names].map(
      (name) => new RegExp(`(^|[^\\w$])${escapeRegExp(name)}([^\\w$]|$)`)
    );
    let found = false;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        let receiver: ts.Node = n.expression.expression;
        let negated = false;
        while (ts.isPropertyAccessExpression(receiver)) {
          if (receiver.name.text === 'not') negated = true;
          receiver = receiver.expression;
        }
        if (
          n !== self &&
          !negated &&
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const asserted = receiver.arguments[0];
          if (asserted) {
            const text = expandedText(asserted);
            if (patterns.some((pattern) => pattern.test(text))) {
              found = true;
              return;
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(scope);
    return found;
  };

  /** 母集団の大きさを固定する主張を探す範囲（テスト本体、無ければ最も内側の関数） */
  const enclosingAssertionScope = (node: ts.Node): ts.Node => {
    let innermost: ts.Node | undefined;
    for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
      if (!ts.isFunctionLike(n)) continue;
      innermost ??= n;
      if (isTestBodyFunction(n)) return n;
    }
    return innermost ?? sourceFile;
  };

  /**
   * 真偽を返す関数の結果を式文として捨てているか（T9。Task 115.141）。
   *
   * 該当する場合は理由を、しない場合は `undefined` を返す。**識別子の綴りは一切見ない。**
   * 真偽を返すかは `isBooleanReturningFunction`（戻り値の型注釈、または自らの return が
   * すべて真偽の値であること）で構造から判定する。
   *
   * 名前の解決は次の順で行う。
   *   (1) 同一ファイルの宣言。同名の宣言がすべて真偽を返す場合に限って該当とする
   *       （混在する形はどれが呼ばれるか決められないため諦める）。
   *   (2) 名前付きで取り込んだ識別子であり、かつ `e2e/helpers/` から集めた
   *       「真偽を返す関数の名前」に一致する場合。
   * (1) を (2) より先に見るのは、複数の spec が同名で別々に宣言している関数を
   * 名前の一致だけで巻き込まないためである（Task 115.141 で実測。3 件の偽陽性）。
   */
  const discardsPredicateResult = (statement: ts.ExpressionStatement): string | undefined => {
    let expression = unwrapParentheses(statement.expression);
    if (ts.isAwaitExpression(expression)) expression = unwrapParentheses(expression.expression);
    if (ts.isVoidExpression(expression)) expression = unwrapParentheses(expression.expression);
    if (!ts.isCallExpression(expression)) return undefined;
    if (!ts.isIdentifier(expression.expression)) return undefined;
    const name = expression.expression.text;
    const declarations = localFunctions.get(name);
    if (declarations && declarations.length > 0) {
      if (!declarations.every((fn) => isBooleanReturningFunction(fn))) return undefined;
      return `${name} は真偽を返す（同一ファイルの宣言）`;
    }
    if (!namedImports.has(name)) return undefined;
    if (!getObservationVocabulary().helperNames.includes(name)) return undefined;
    return `${name} は真偽を返す（e2e/helpers の宣言）`;
  };

  /**
   * 式の実行時の型として現れうるものの集合（T10。Task 115.143）。
   *
   * 構文だけで決められない場合は `undefined` を返し、検出しない。集合は
   * **過大に見積もる方向**へ倒す。判定は「集合がちょうど一つで、主張された型に
   * 一致する」ときにのみ成立するため、過大な見積もりは見逃しにはなっても
   * 過検出にはならない。
   *
   * 辿るのは次の形に限る。
   *   - リテラル・テンプレートリテラル・`null` / `undefined`
   *   - `await` / `!` / `as`（いずれも実行時の値を変えない）
   *   - 既定値・論理和（`A ?? B` / `A || B`。左辺から `null` / `undefined` を落として合併）
   *   - `SETTLED_RETURN_TYPES` に載る呼び出し
   *   - 再代入されず、同一ファイルに宣言が一つだけある名前（その初期化子へ辿る）
   */
  const runtimeTypesOf = (expr: ts.Expression, depth = 0): Set<string> | undefined => {
    if (depth > RESOLVE_DEPTH_LIMIT) return undefined;
    const inner = unwrapParentheses(expr);
    if (ts.isAwaitExpression(inner)) return runtimeTypesOf(inner.expression, depth);
    if (ts.isNonNullExpression(inner)) return runtimeTypesOf(inner.expression, depth);
    if (ts.isAsExpression(inner)) return runtimeTypesOf(inner.expression, depth);
    if (ts.isStringLiteralLike(inner) || ts.isTemplateExpression(inner)) {
      return new Set(['string']);
    }
    if (ts.isNumericLiteral(inner)) return new Set(['number']);
    if (inner.kind === ts.SyntaxKind.TrueKeyword || inner.kind === ts.SyntaxKind.FalseKeyword) {
      return new Set(['boolean']);
    }
    if (inner.kind === ts.SyntaxKind.NullKeyword) return new Set(['null']);
    if (ts.isIdentifier(inner) && inner.text === 'undefined') return new Set(['undefined']);
    if (ts.isBinaryExpression(inner)) {
      const kind = inner.operatorToken.kind;
      if (kind !== ts.SyntaxKind.QuestionQuestionToken && kind !== ts.SyntaxKind.BarBarToken) {
        return undefined;
      }
      const left = runtimeTypesOf(inner.left, depth);
      const right = runtimeTypesOf(inner.right, depth);
      if (!left || !right) return undefined;
      const merged = new Set(right);
      for (const name of left) {
        if (name !== 'null' && name !== 'undefined') merged.add(name);
      }
      return merged;
    }
    if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression)) {
      const known = SETTLED_RETURN_TYPES[inner.expression.name.text];
      return known ? new Set(known) : undefined;
    }
    if (ts.isIdentifier(inner) && !reassigned.has(inner.text)) {
      const values = declTable.get(inner.text) ?? [];
      // 同名の宣言が複数あるときはどれが主題か決められないため諦める
      if (values.length !== 1) return undefined;
      return runtimeTypesOf(values[0]!, depth + 1);
    }
    return undefined;
  };

  /**
   * 型が構文で確定した値に対する型の主張か（T10。Task 115.143）。
   *
   * 該当する場合は理由を、しない場合は `undefined` を返す。
   */
  const assertsSettledType = (subject: ts.Expression, asserted: string): string | undefined => {
    const inner = unwrapParentheses(subject);
    if (!ts.isTypeOfExpression(inner)) return undefined;
    const types = runtimeTypesOf(inner.expression);
    if (!types || types.size === 0) return undefined;
    const observed = new Set([...types].map(toObservedTypeName));
    if (observed.size !== 1 || !observed.has(asserted)) return undefined;
    return `typeof の主題は構文上 '${asserted}' にしかなり得ない`;
  };

  const isObservation = (text: string): boolean =>
    getObservationPattern().test(text) || AWAIT_PATTERN.test(text) || SWALLOW_PATTERN.test(text);

  /** 条件式の分類（局所変数を挟んだ形も直接記述と同等に扱う） */
  const classifyCondition = (node: ts.Node): GuardType => {
    const text = expandedText(node);
    if (isObservation(text)) return 'T5-observed-result-gate';
    if (RESPONSE_PATTERN.test(text)) return 'T4-response-field-gate';
    return 'T1-conditional-expect';
  };

  /** 条件式が観測または応答参照を運ぶか（黙って抜ける分岐の判定に用いる） */
  const carriesObservation = (node: ts.Node): boolean => {
    const text = expandedText(node);
    return isObservation(text) || RESPONSE_PATTERN.test(text);
  };

  // --------------------------------------------------------------------------
  // 除外注釈（理由必須）
  // --------------------------------------------------------------------------
  /** 直前の非空行の除外注釈。marked=注釈あり、reason=注釈に続く理由 */
  const allowAnnotation = (line: number): { marked: boolean; reason: string } => {
    for (let i = line - 2; i >= 0; i -= 1) {
      const text = lines[i]!.trim();
      if (text === '') continue;
      const index = text.indexOf(ALLOW_MARKER);
      if (index === -1) return { marked: false, reason: '' };
      return { marked: true, reason: text.slice(index + ALLOW_MARKER.length).trim() };
    }
    return { marked: false, reason: '' };
  };

  const push = (node: ts.Node, type: GuardType, snippetNode?: ts.Node): void => {
    // 検出器の規則による対象外（欠陥ではない構造の誤検出を外す。Task 115.127 段3）。
    // 注釈による除外と違い件数にも残さない。詳細は ruleBasedExclusion の説明を参照。
    if (ruleBasedExclusion(node)) return;
    const line = lineOf(node);
    const snippet = snippetOf(snippetNode ?? node);
    const { marked, reason } = allowAnnotation(line);
    if (marked && reason !== '') {
      allowed.push({ file: relPath, line, type, reason, snippet });
      return;
    }
    if (marked) {
      // 理由の無い注釈は除外として扱わない（検出は残したうえで検査を失敗させる）
      invalidAllows.push({ file: relPath, line, type, reason: '', snippet });
    }
    findings.push({ file: relPath, line, type, snippet });
    findingNodes.push(node);
  };

  const visit = (node: ts.Node): void => {
    // --- T2: 待機の指定を尊重しない判定 ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (IMMEDIATE_PREDICATES.includes(node.expression.name.text)) {
        const arg = node.arguments[0];
        if (
          arg &&
          ts.isObjectLiteralExpression(arg) &&
          arg.properties.some((p) => p.name?.getText(sourceFile) === 'timeout')
        ) {
          push(node, 'T2-ignored-timeout');
        }
      }
    }

    // --- T6: 条件付きスキップ ---
    if (isConditionalSkip(node, sourceFile)) {
      push(node, 'T6-conditional-skip');
    }

    // --- T3: 常に真になる判定 ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.text;
      if (matcher === 'toBeTruthy' || matcher === 'toBeFalsy' || matcher === 'toBe') {
        let receiver: ts.Node = node.expression.expression;
        while (ts.isPropertyAccessExpression(receiver)) receiver = receiver.expression;
        if (
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const subject = receiver.arguments[0];
          const matcherArgIsBoolean =
            matcher !== 'toBe' ||
            (node.arguments.length === 1 &&
              (node.arguments[0]!.kind === ts.SyntaxKind.TrueKeyword ||
                node.arguments[0]!.kind === ts.SyntaxKind.FalseKeyword));
          if (subject && matcherArgIsBoolean && isVacuousSubject(subject)) {
            push(node, 'T3-tautology', receiver);
          }
        }
      }
    }

    // --- T10: 型が構文で確定した値に対する型の主張（Task 115.143） ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (TYPE_EQUALITY_MATCHERS.has(node.expression.name.text)) {
        let receiver: ts.Node = node.expression.expression;
        let negated = false;
        while (ts.isPropertyAccessExpression(receiver)) {
          if (receiver.name.text === 'not') negated = true;
          receiver = receiver.expression;
        }
        const asserted = node.arguments[0];
        if (
          !negated &&
          node.arguments.length === 1 &&
          asserted &&
          ts.isStringLiteralLike(asserted) &&
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const subject = receiver.arguments[0];
          if (subject && assertsSettledType(subject, asserted.text)) {
            push(node, 'T10-settled-type-assertion', receiver);
          }
        }
      }
    }

    // --- T7: 抽出で除外したものの不在を主張する（第八の型。Task 115.139） ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'toContain') {
        let receiver: ts.Node = node.expression.expression;
        let negated = false;
        while (ts.isPropertyAccessExpression(receiver)) {
          if (receiver.name.text === 'not') negated = true;
          receiver = receiver.expression;
        }
        const needleArg = node.arguments[0];
        if (
          negated &&
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect' &&
          needleArg &&
          ts.isStringLiteralLike(needleArg)
        ) {
          const subject = receiver.arguments[0];
          if (subject && assertsExcludedAbsence(subject, needleArg.text)) {
            push(node, 'T7-excluded-absence', receiver);
          }
        }
      }
    }

    // --- T11: 空の母集団に対する不在の主張（第十二の型。Task 115.162） ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.text;
      if (EMPTY_POPULATION_MATCHERS.has(matcher)) {
        let receiver: ts.Node = node.expression.expression;
        let negated = false;
        while (ts.isPropertyAccessExpression(receiver)) {
          if (receiver.name.text === 'not') negated = true;
          receiver = receiver.expression;
        }
        if (
          negated &&
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const subject = receiver.arguments[0];
          const needle = node.arguments[0] ? unwrapParentheses(node.arguments[0]!) : undefined;
          if (
            subject &&
            emptyPopulationAbsence(node, subject, matcher as 'toContain' | 'toMatch', needle)
          ) {
            push(node, 'T11-empty-population-absence', receiver);
          }
        }
      }
    }

    // --- T8: 不在と観測の失敗を区別しない主張（Task 115.140） ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const kind = ABSENCE_MATCHERS[node.expression.name.text];
      if (kind) {
        let receiver: ts.Node = node.expression.expression;
        let negated = false;
        while (ts.isPropertyAccessExpression(receiver)) {
          if (receiver.name.text === 'not') negated = true;
          receiver = receiver.expression;
        }
        if (
          !negated &&
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const subject = receiver.arguments[0];
          if (subject && ambiguousAbsence(subject, kind)) {
            push(node, 'T8-ambiguous-absence', receiver);
          }
        }
      }
    }

    // --- T9: 真偽を返す関数の結果を式文として捨てる形（Task 115.141） ---
    if (ts.isExpressionStatement(node) && !insideBrowserEvaluatedFunction(node)) {
      if (discardsPredicateResult(node)) {
        push(node, 'T9-discarded-predicate-result');
      }
    }

    // --- T1 / T4 / T5: 分岐による検証の無効化 ---
    if (ts.isIfStatement(node)) {
      const thenAsserts = containsAssertion(node.thenStatement);
      const elseAsserts = node.elseStatement ? containsAssertion(node.elseStatement) : false;
      const elseFails = node.elseStatement ? containsFailure(node.elseStatement) : false;
      const thenFails = containsFailure(node.thenStatement);

      // 前提が満たせないときに失敗させる分岐は正当な用途として扱う
      const isFailFast = thenFails && !thenAsserts;

      if (!isFailFast && (thenAsserts || elseAsserts) && !elseFails) {
        push(node, classifyCondition(node.expression), node.expression);
      } else if (!isFailFast && isSilentExit(node.thenStatement)) {
        // 観測結果を条件に黙って抜ける（検証本体に到達しない）
        if (carriesObservation(node.expression)) {
          push(node, classifyCondition(node.expression), node.expression);
        }
      }
    }

    // --- 論理短絡による検証の無効化 ---
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      containsAssertion(node.right) &&
      !containsAssertion(node.left)
    ) {
      push(node, classifyCondition(node.left), node.left);
    }

    // --- 三項で検証を包む形（if 文と同じく条件次第で検証本体に到達しない） ---
    if (ts.isConditionalExpression(node) && !containsAssertion(node.condition)) {
      const branchAsserts = containsAssertion(node.whenTrue) || containsAssertion(node.whenFalse);
      const branchFails = containsFailure(node.whenTrue) || containsFailure(node.whenFalse);
      if (branchAsserts && !branchFails) {
        push(node, classifyCondition(node.condition), node.condition);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { findings, allowed, invalidAllows, findingNodes };
}

// ============================================================================
// 基準との照合
// ============================================================================

function tally(findings: Finding[]): Baseline {
  const result: Baseline = {};
  for (const finding of findings) {
    const perFile = (result[finding.file] ??= {});
    perFile[finding.type] = (perFile[finding.type] ?? 0) + 1;
  }
  return result;
}

function tallyAllowed(allowed: AllowEntry[]): AllowBaseline {
  const result: AllowBaseline = {};
  for (const entry of allowed) {
    result[entry.file] = (result[entry.file] ?? 0) + 1;
  }
  return result;
}

function loadBaseline(baselinePath: string): {
  files: Baseline;
  allowedFiles: AllowBaseline;
  generatedTotal: number;
  allowedTotal: number;
  reduction: ReductionPlan;
} {
  if (!fs.existsSync(baselinePath)) {
    return { files: {}, allowedFiles: {}, generatedTotal: 0, allowedTotal: 0, reduction: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
    files?: Baseline;
    allowedFiles?: AllowBaseline;
    generatedTotal?: number;
    allowedTotal?: number;
    reduction?: ReductionPlan;
  };
  return {
    files: parsed.files ?? {},
    allowedFiles: parsed.allowedFiles ?? {},
    generatedTotal: parsed.generatedTotal ?? 0,
    allowedTotal: parsed.allowedTotal ?? 0,
    reduction: parsed.reduction ?? {},
  };
}

function writeBaseline(
  baselinePath: string,
  current: Baseline,
  total: number,
  allowedFiles: AllowBaseline,
  allowedTotal: number,
  reduction: ReductionPlan
): void {
  const ordered: Baseline = {};
  for (const file of Object.keys(current).sort()) {
    const perType: Partial<Record<GuardType, number>> = {};
    for (const type of GUARD_TYPES) {
      const count = current[file]![type];
      if (count) perType[type] = count;
    }
    ordered[file] = perType;
  }
  const orderedAllowed: AllowBaseline = {};
  for (const file of Object.keys(allowedFiles).sort()) {
    orderedAllowed[file] = allowedFiles[file]!;
  }
  const payload = {
    $comment: [
      'E2Eテストの「検証無効化」構造の既知件数（scripts/check-e2e-assertion-guards.ts）。',
      '件数が増えた場合、または一覧に無いファイルで検出された場合は検査が失敗する。',
      '是正して件数を減らしたら `npm run check:e2e-guards:update` で更新すること。',
      '正当な分岐は該当行の直前に `// e2e-guard-allow: <理由>` を置いて除外できる（理由は必須）。',
      'allowedFiles は除外注釈の件数。除外が増えた場合も検査は失敗する（差分として現れる）。',
      'ここに載っている件数は解消済みではなく、いま抑止しているだけの既知の欠陥である。',
      'reduction は削減の目標と計画文書の所在。実行のたびに残り件数を出力する（合否には用いない）。',
      '件数が増える方向の更新は既定で拒否する。記録が必要な場合のみ --allow-increase を付けること。',
    ],
    generatedTotal: total,
    allowedTotal,
    reduction,
    allowedFiles: orderedAllowed,
    files: ordered,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

// ============================================================================
// 実行
// ============================================================================

/**
 * 実行時の差し替え（自己検査のための seam）。
 *
 * どちらも省略時は本番の経路（実基準・`e2e/` 配下の走査）になる。コマンドラインからは
 * 指定できないため、直接起動した実行が実基準以外を見ることはない（Task 115.128）。
 */
export interface RunOptions {
  /** 抑止一覧（基準）の位置。省略時は `DEFAULT_BASELINE_PATH`。 */
  baselinePath?: string;
  /** 走査するファイルの集め方。省略時は `collectE2eFiles`。 */
  collectFiles?: () => string[];
}

/**
 * 検査本体。終了コードを返す（呼び出し側が `process.exit` を行う）。
 * 自己検査はこの関数をそのまま呼び、関門が実際に発火することを確かめる。
 */
export function run(args: string[], options: RunOptions = {}): number {
  const baselinePath = options.baselinePath ?? DEFAULT_BASELINE_PATH;
  const verbose = args.includes('--verbose');
  const asJson = args.includes('--json');
  const update = args.includes('--update-baseline');
  const allowIncrease = args.includes('--allow-increase');
  const skipBaseline = args.includes('--no-baseline');

  const files = (options.collectFiles ?? collectE2eFiles)();
  const results = files.map(scanFile);
  const findings = results.flatMap((r) => r.findings);
  const allowed = results.flatMap((r) => r.allowed);
  const invalidAllows = results.flatMap((r) => r.invalidAllows);
  const current = tally(findings);
  const currentAllowed = tallyAllowed(allowed);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          total: findings.length,
          allowedTotal: allowed.length,
          findings,
          allowed,
          invalidAllows,
        },
        null,
        2
      )
    );
    return 0;
  }

  const byType = new Map<GuardType, number>(GUARD_TYPES.map((t) => [t, 0]));
  for (const finding of findings) {
    byType.set(finding.type, (byType.get(finding.type) ?? 0) + 1);
  }

  console.log('🔍 E2E 検証無効化チェック (scripts/check-e2e-assertion-guards.ts)');
  console.log(`   走査ファイル数: ${files.length}`);
  console.log(`   検出件数: ${findings.length}`);
  for (const type of GUARD_TYPES) {
    console.log(`     ${type}: ${byType.get(type)}`);
  }

  console.log(`   除外件数 (e2e-guard-allow): ${allowed.length}`);
  for (const entry of allowed) {
    console.log(`     ${entry.file}:${entry.line} [${entry.type}] 理由: ${entry.reason}`);
  }

  // 抑止一覧の残高を常に出力する。「検査が通ったこと」と「欠陥が残っていないこと」は別であり、
  // 出力に残高が出ないと、抑止一覧が「直さなくてよい」の記録へ静かに変質する（Task 115.93）。
  if (!skipBaseline) {
    const recorded = loadBaseline(baselinePath);
    const targets = recorded.reduction.targets ?? {};
    console.log('');
    console.log(
      `   抑止されている既知の欠陥（負債）: ${findings.length} 件 / 基準 ${recorded.generatedTotal} 件`
    );
    for (const type of GUARD_TYPES) {
      const now = byType.get(type) ?? 0;
      const target = targets[type];
      const label = `     ${type.padEnd(24)} 現在 ${String(now).padStart(4)}`;
      if (target === undefined) {
        console.log(`${label}  （目標 未設定）`);
      } else if (now === 0 && target === 0) {
        console.log(`${label}  目標 ${String(target).padStart(4)}  ✅ 解消済み`);
      } else if (now <= target) {
        // 目標が現状と同じ型は「解消済み」ではない。今の段では着手しないという宣言である。
        console.log(
          `${label}  目標 ${String(target).padStart(4)}  据置（本段の対象外・負債は残存）`
        );
      } else {
        console.log(
          `${label}  目標 ${String(target).padStart(4)}  残り ${String(now - target).padStart(4)}`
        );
      }
    }
    if (recorded.reduction.allowedTarget !== undefined) {
      console.log(
        `     ${'e2e-guard-allow'.padEnd(24)} 現在 ${String(allowed.length).padStart(4)}  目標 ${String(recorded.reduction.allowedTarget).padStart(4)}`
      );
    }
    if (recorded.reduction.doc) {
      console.log(`   削減計画: ${recorded.reduction.doc}`);
    } else {
      console.log('   削減計画: 未登録（基準の reduction.doc に計画文書の位置を記録すること）');
    }
  }

  if (verbose) {
    console.log('');
    for (const finding of findings) {
      console.log(`   ${finding.file}:${finding.line} [${finding.type}] ${finding.snippet}`);
    }
  }

  if (invalidAllows.length > 0) {
    console.log('\n❌ 理由の無い除外注釈があります（除外として扱いません）:');
    for (const entry of invalidAllows) {
      console.log(`   ${entry.file}:${entry.line} [${entry.type}] ${entry.snippet}`);
    }
    console.log(`\n   \`// ${ALLOW_MARKER} <理由>\` の形で理由を書いてください。`);
    return 1;
  }

  if (update) {
    const previous = loadBaseline(baselinePath);
    // 抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではない。
    // 増える方向の書き出しを無言で通すと、検出された欠陥をその場で登録して黙らせられる。
    // 増加の記録には明示的な意思表示（--allow-increase）を要求する（Task 115.93）。
    const growth: string[] = [];
    for (const file of Object.keys(current).sort()) {
      for (const type of GUARD_TYPES) {
        const now = current[file]![type] ?? 0;
        const before = previous.files[file]?.[type] ?? 0;
        if (now > before) growth.push(`${file} [${type}] ${before} → ${now}`);
      }
    }
    for (const file of Object.keys(currentAllowed).sort()) {
      const now = currentAllowed[file] ?? 0;
      const before = previous.allowedFiles[file] ?? 0;
      if (now > before) growth.push(`${file} [e2e-guard-allow] ${before} → ${now}`);
    }
    if (growth.length > 0 && !allowIncrease) {
      console.log('\n❌ 件数が増える方向の基準更新は既定で拒否します:');
      for (const line of growth) console.log(`   ${line}`);
      console.log(
        '\n   抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではありません。'
      );
      console.log('   まず是正を試みてください。記録が必要な場合のみ次を実行します:');
      console.log(
        '     npx tsx scripts/check-e2e-assertion-guards.ts --update-baseline --allow-increase'
      );
      console.log(
        '   その際は増加の理由と解消の見通しを、基準の reduction.doc が指す計画文書に残してください。'
      );
      return 1;
    }
    writeBaseline(
      baselinePath,
      current,
      findings.length,
      currentAllowed,
      allowed.length,
      previous.reduction
    );
    console.log(`\n✅ 基準を更新しました: ${path.relative(ROOT, baselinePath)}`);
    if (growth.length > 0) {
      console.log('   ⚠️ 増加を記録しました（--allow-increase）。計画文書への記載を忘れないこと:');
      for (const line of growth) console.log(`      ${line}`);
    }
    return 0;
  }

  if (skipBaseline) return 0;

  const baseline = loadBaseline(baselinePath);
  const regressions: string[] = [];
  const improvements: string[] = [];

  // 基準そのものの整合を確かめる。件数の内訳と総数がずれている基準は手で書き換えられた
  // 疑いがあり、抑止の総量を見えなくする（Task 115.93）。
  let baselineSum = 0;
  for (const perType of Object.values(baseline.files)) {
    for (const count of Object.values(perType)) baselineSum += count ?? 0;
  }
  let baselineAllowSum = 0;
  for (const count of Object.values(baseline.allowedFiles)) baselineAllowSum += count;
  if (baselineSum !== baseline.generatedTotal || baselineAllowSum !== baseline.allowedTotal) {
    console.log('\n❌ 基準の内訳と総数が一致しません（手作業での書き換えが疑われます）:');
    console.log(`   files の合計 ${baselineSum} / generatedTotal ${baseline.generatedTotal}`);
    console.log(
      `   allowedFiles の合計 ${baselineAllowSum} / allowedTotal ${baseline.allowedTotal}`
    );
    console.log('   `npm run check:e2e-guards:update` で書き出し直してください。');
    return 1;
  }

  for (const file of Object.keys(current).sort()) {
    for (const type of GUARD_TYPES) {
      const actual = current[file]![type] ?? 0;
      const allowedCount = baseline.files[file]?.[type] ?? 0;
      if (actual > allowedCount) {
        regressions.push(`${file} [${type}] ${allowedCount} → ${actual}`);
      }
    }
  }
  for (const file of Object.keys(baseline.files).sort()) {
    for (const type of GUARD_TYPES) {
      const allowedCount = baseline.files[file]?.[type] ?? 0;
      const actual = current[file]?.[type] ?? 0;
      if (actual < allowedCount) {
        improvements.push(`${file} [${type}] ${allowedCount} → ${actual}`);
      }
    }
  }

  const allowRegressions: string[] = [];
  for (const file of Object.keys(currentAllowed).sort()) {
    const actual = currentAllowed[file] ?? 0;
    const known = baseline.allowedFiles[file] ?? 0;
    if (actual > known) {
      allowRegressions.push(`${file} [e2e-guard-allow] ${known} → ${actual}`);
    }
  }

  if (improvements.length > 0) {
    console.log('\nℹ️  基準より減っています（是正済み）。基準の更新を推奨します:');
    for (const line of improvements) console.log(`   ${line}`);
    console.log('   更新: npm run check:e2e-guards:update');
  }

  if (allowRegressions.length > 0) {
    console.log('\n❌ 除外（e2e-guard-allow）が増えています:');
    for (const line of allowRegressions) console.log(`   ${line}`);
    console.log('\n   除外は正当性をレビューできる形で残す必要があります。');
    console.log('   妥当であれば `npm run check:e2e-guards:update` で基準に反映してください。');
  }

  if (regressions.length > 0) {
    console.log('\n❌ 検証無効化の構造が増えています:');
    for (const line of regressions) console.log(`   ${line}`);
    console.log('\n   検証を無条件にするか、前提が満たせない場合に失敗させてください。');
    console.log('   正当な分岐であれば直前行に `// e2e-guard-allow: <理由>` を付けてください。');
    console.log('   詳細: npm run check:e2e-guards -- --verbose');
  }

  if (regressions.length > 0 || allowRegressions.length > 0) {
    return 1;
  }

  console.log('\n✅ 新規の検証無効化は検出されませんでした');
  return 0;
}

// 直接起動されたときのみ実行する（検出規則の確認からは走査部分だけを読み込む）
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const exitCode = run(process.argv.slice(2));
  if (exitCode !== 0) process.exit(exitCode);
}
