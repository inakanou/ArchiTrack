# E2E 検証無効化の抑止一覧 段階的削減計画（Task 115.93）

本書は `e2e/assertion-guard-baseline.json` に登録された「抑止されている既知の欠陥」を、
どの順で、どこまで減らすかを定めた計画である。`tasks.md` は制御側が管理するため、
計画本体は本書に置き、`tasks.md` からは参照のみを行う。

## 0. なぜ本書が要るか

`scripts/check-e2e-assertion-guards.ts` は検出した構造を型別・ファイル別に基準へ登録し、
**増えた場合のみ**失敗する。したがって既登録の分は検出されていても検査は通る。
115.89〜115.91 が挙げた欠陥はいずれもこの検出器が検出しており、しかし抑止されていた。
すなわち「検査は通るのに欠陥は残る」。

抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではない。
本書はその区別を、番号で確認できる形にするために置く。

## 1. 現在地（実測）

```
$ node -e "const b=require('./e2e/assertion-guard-baseline.json');console.log('generatedTotal',b.generatedTotal,'allowedTotal',b.allowedTotal,'files',Object.keys(b.files).length)"
generatedTotal 1044 allowedTotal 3 files 123
```

```
$ npm run check:e2e-guards
   検出件数: 1044
     T1-conditional-expect: 64
     T2-ignored-timeout: 285
     T3-tautology: 85
     T4-response-field-gate: 5
     T5-observed-result-gate: 539
     T6-conditional-skip: 66
   除外件数 (e2e-guard-allow): 3
```

### 1.1 課題文の 1102 件との差

課題文は 1102 件と書いているが、これは 2026-08-17 時点の値である。以降の是正で 1044 まで減っている。

```
$ for c in $(git log --format=%H -12 -- e2e/assertion-guard-baseline.json | tac); do \
    t=$(git show $c:e2e/assertion-guard-baseline.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log(b.generatedTotal+' allow='+b.allowedTotal)})"); \
    echo "$(git log -1 --format='%h %ad %s' --date=short $c) | total=$t"; done
4ff8e43 2026-08-15 検証が実質を持たない構造を洗い出す仕組みを設ける | total=1288 allow=1
02b28b2 2026-08-15 検証無効化の検出の網羅と精度を高める           | total=1171 allow=1
15fd077 2026-08-15 数量表の検証が前提を自ら用意するよう改める     | total=1124 allow=1
afab68e 2026-08-15 入力上限の検証が常に成立する構造を解消する     | total=1121 allow=1
c75ae38 2026-08-17 前提条件で自動的に無効化されるE2Eを実データ生成へ組み替える | total=1108 allow=1
d582763 2026-08-17 注釈付きサムネイルのE2Eを実データ生成へ組み替える | total=1102 allow=1  ← 課題文の 1102
77d89e5 2026-08-18 自動保存と復元の基盤を注釈編集画面へ結線する   | total=1094 allow=1
1a62076 2026-08-18 寸法値の入力欄を注釈編集画面へ結線する         | total=1092 allow=2
aeb099c 2026-08-18 要件5 の担当を実態へ付け替え閲覧時の表示操作を結線する | total=1084 allow=2
f30421c 2026-08-19 前提条件による検証の自動無効化を解消する（115.89） | total=1067 allow=2
c293b7a 2026-08-19 閲覧と応答性のE2Eから恒真の判定を除く（115.91）   | total=1046 allow=2
1d8e4d0 2026-08-19 沈黙する前提準備を共通の補助へ集約する（115.92）   | total=1044 allow=3
```

1102 → 1044 の 58 件は上記 6 コミットの合計である（-8 / -2 / -8 / -17 / -21 / -2）。

### 1.2 延べ件数とユニーク箇所

```
$ npx tsx scripts/check-e2e-assertion-guards.ts --json > /tmp/guards.json
$ node -e "const d=require('/tmp/guards.json');const at={};for(const f of d.findings){const k=f.file+':'+f.line;(at[k]??=[]).push(f.type)}console.log('延べ',d.total,'ユニーク',Object.keys(at).length,'二重計上',Object.values(at).filter(v=>v.length>1).length)"
延べ 1044 ユニーク 950 二重計上 94
```

94 箇所が T2 と T5 の二重計上である。**二重計上は T2 と T5 の組み合わせのみで、T6 との重複は 0 件**である
（次の実測による。`node -e "const d=require('/tmp/guards.json');const at={};for(const f of d.findings){const k=f.file+':'+f.line;(at[k]??=[]).push(f.type)}const dup=Object.values(at).filter(v=>v.length>1);const c={};for(const v of dup){const k=v.slice().sort().join('+');c[k]=(c[k]??0)+1}console.log(c)"` の出力が
`{ 'T2-ignored-timeout+T5-observed-result-gate': 94 }` である）。
したがって T2 を解消すると、そのうち 94 箇所は T5 側の判断も同時に必要になる。

### 1.3 偏り

```
$ node -e "const d=require('/tmp/guards.json');const m={};for(const f of d.findings)m[f.file]=(m[f.file]||0)+1;const s=Object.entries(m).sort((a,b)=>b[1]-a[1]);let a=0;s.slice(0,10).forEach(([f,v])=>{a+=v;console.log(String(v).padStart(4),f)});console.log('上位10小計',a);let b=0;s.slice(0,20).forEach(x=>b+=x[1]);console.log('上位20小計',b)"
 107 e2e/specs/quantity-tables/quantity-table-crud.spec.ts
  57 e2e/specs/quantity-tables/quantity-table-phase10.spec.ts
  48 e2e/specs/quantity-tables/autocomplete-optimization.spec.ts
  40 e2e/specs/quantity-tables/field-specification.spec.ts
  35 e2e/specs/quantity-tables/photo-comment-e2e.spec.ts
  32 e2e/specs/quantity-tables/group-sort-e2e.spec.ts
  27 e2e/specs/quantity-tables/import-e2e.spec.ts
  27 e2e/specs/site-surveys/site-survey-annotations.spec.ts
  26 e2e/specs/estimate-requests/pdf-text-extraction-e2e.spec.ts
  25 e2e/specs/estimate-requests/number-format-e2e.spec.ts
上位10小計 424
上位20小計 627
```

上位 10 ファイルで 424 件（40.6%）、上位 20 ファイルで 627 件（60.1%）。
領域別では数量表 523 / 現場調査 170 / 見積依頼 142 / プロジェクト 74 / 認証 43 が上位である。

## 2. 型ごとの意味・重さ・機械的に直せるか

### T6 conditional-skip（66 件）— 最重

**意味**: 前提が満たせない場合に検証を丸ごと飛ばす。AI運用7原則 第3原則に直接抵触する唯一の型。

**実例**: `e2e/specs/quantity-tables/field-specification.spec.ts:104`

```ts
test('数量表を作成する', async ({ page }) => {
  test.skip(!testProjectId, 'プロジェクトIDが取得できなかったためスキップ');
```

`testProjectId` は同ファイル冒頭の「事前準備」テストが設定する（同 99 行）。
前提の生成に失敗すると、以降の全テストが緑でも赤でもなく消える。

**機械的に直せるか**: 直せる。全 66 件が同一の 2 パターンに収まる。

```
$ grep -rhn "test\.skip(!" e2e --include=*.ts | sed 's/.*test\.skip(!\([A-Za-z]*\).*/\1/' | sort | uniq -c
     21 createdEstimateRequestId
     45 testProjectId
```

7 ファイル。`test.skip(!id, …)` を、値が無ければ throw する型ガード補助
（`assertPrepared(id, '前提: プロジェクト')`）の呼び出しへ機械置換すれば足りる。
115.92 が `selectFirstRealOption` で 129 箇所を一つの補助へ畳んだのと同型の作業である。

### T6 の検出漏れ（49 件）— 最重・**現在は抑止一覧にすら載っていない**

T6 は `test.skip(<式>, …)` の形のみを検出する。**引数なしの `test.skip();` を条件分岐の
内側で呼ぶ形は検出されない**。

```
$ grep -rn "test\.skip()" e2e --include=*.ts | wc -l
50
$ grep -rn "test\.skip()" e2e --include=*.ts | cut -d: -f1 | sort | uniq -c | sort -rn
     22 e2e/specs/quantity-tables/quantity-table-phase10.spec.ts
     16 e2e/specs/quantity-tables/quantity-item-action-menu.spec.ts
     11 e2e/specs/quantity-tables/photo-comment-display.spec.ts
      1 e2e/specs/projects/project-address-autofill.spec.ts
```

構文木で数えると 50 件中 49 件が `if` の内側にある（残り 1 件は無条件）。実例:

```ts
// e2e/specs/quantity-tables/photo-comment-display.spec.ts:175
if (!roleDialogVisible) {
  test.skip();
  return;
}
```

効果は `test.skip(!cond, …)` と同一であり、第3原則への抵触も同一である。
**抑止一覧の 1044 という数字自体が、この 49 件だけ実態より小さい。**
検出規則を先に足すと基準が増えるため、順序は「49 件を是正 → 検出規則を追加」とする（第3段落）。

### T2 ignored-timeout（285 件）— 中（ただし上流原因）

**意味**: `locator.isVisible({ timeout })` の `timeout` は無視され即時判定される。
描画前に false となり、その結果で分岐すると検証が飛ぶ。

**実例**: `e2e/specs/quantity-tables/photo-comment-display.spec.ts:172`

```ts
const roleDialogVisible = await roleDialog
  .isVisible({ timeout: getTimeout(3000) })
  .catch(() => false);
```

**機械的に直せるか**: 直せる。**285 件すべてが同一の構文**である。

```
$ grep -rn "isVisible({ *timeout" e2e --include=*.ts | wc -l
285
$ grep -rn "isHidden({ *timeout\|isEnabled({ *timeout\|isDisabled({ *timeout\|isChecked({ *timeout\|isEditable({ *timeout" e2e --include=*.ts | wc -l
0
```

検出件数 285 と `isVisible({ timeout` の出現 285 が一致する。他の即時判定述語に
`timeout` を渡している箇所は 0 件。したがって置換対象は一種類しかない。

`waitFor({ state, timeout })` を包んで真偽を返す補助（`isVisibleWithin(locator, timeout)`）
一つへ寄せれば、待機の指定が実際に効くようになる。単体では「観測」に留まるが、
**この型が偽の観測を供給していることが、T5 の判断を濁らせている**。先に潰す価値がここにある。

### T5 / T1 / T4（539 + 64 + 5 = 608 件）— 重（沈黙する関門の一族）

**意味**:
- T5 = 自ら観測した結果を条件にして検証を包む／黙って抜ける
- T1 = 条件分岐で検証本体を包む（条件が観測でないもの）
- T4 = 応答の項目の有無を条件にする

608 件を構造で排他的に分類した（分類の手順は付録 A）。

**下表は策定時（総数 1044）の値であり、再現できないまま据え置かれていた。**
段3 で構文木による分類走査を資材として作成し（`scripts/classify-e2e-assertion-guards.ts`）、
内訳を測り直した。**現在の正は付録 A の実測表である。**下表は策定時の記録として残す。

| 群 | 件数（策定時・再現不能） | 内容 | 直し方 |
|---|---:|---|---|
| A | 72 | 述語ヘルパー／`page.evaluate` の内側、すなわち判定そのものの実装 | 検出器の精度（後述） |
| B | 1 | 分岐の内側で throw している（既に失敗する） | 検出器の精度 |
| C | 31 | 直前の無条件の主張の後、TypeScript の型を絞るための `if` | 機械的（型ガード補助） |
| D1 | 4 | 再試行ループの成功時 return。ループの外に throw がある | 注釈または補助へ集約 |
| D2 | 76 | 観測結果で沈黙して脱出（失敗させる経路が無い） | 箇所ごとの判断 |
| E | 186 | 観測結果で主張を包むだけ（出ても出なくても通る） | 箇所ごとの判断 |
| F | 182 | 復旧・再試行を含む分岐（主張も操作も含む） | 箇所ごとの判断 |
| G | 56 | `if/else` の双方で主張する全域分岐 | 箇所ごとの判断（多くは正当） |

合計 608。

**実例（E 群）**: `e2e/specs/api/jwks.spec.ts:94`

```ts
// 公開鍵が設定されている場合のみ検証
if (body.keys.length > 0) {
  for (const key of body.keys) {
    expect(key).toHaveProperty('kty');
```

鍵が 0 本なら一つも検証されない。115.68 の基準（供給を無条件に主張する）に照らせば
`expect(body.keys.length).toBeGreaterThan(0)` を先に置くだけで解消する。

**実例（C 群・機械的）**: `e2e/specs/estimate-requests/estimate-request-layout-net-e2e.spec.ts:287`

```ts
expect(itemSelectionBbox).toBeTruthy();
expect(selectionStatusBbox).toBeTruthy();

if (itemSelectionBbox && selectionStatusBbox) {
  expect(selectionStatusBbox.y).toBeGreaterThan(itemSelectionBbox.y);
}
```

直前で無条件に主張しているので沈黙はしない。`if` は型を絞るためだけにある。
`assertPresent(x)`（`asserts x is NonNullable<T>` を返し、偽なら throw する補助）へ
置き換えれば 31 件が一括で消える。うち 19 件は `boundingBox()` の null 絞り込みである。

```
$ node -e "const fs=require('fs');const d=require('/tmp/guards.json');const R='./';const c={};const S=f=>c[f]??=fs.readFileSync(R+f,'utf8');const FAM=['T5-observed-result-gate','T1-conditional-expect','T4-response-field-gate'];let bb=0;for(const f of d.findings.filter(x=>FAM.includes(x.type))){const L=S(f.file).split('\n');const ids=[...new Set([...L[f.line-1].matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(x=>x[0]).filter(x=>!['if','await','else','return','true','false','null','undefined','expect','not','toBe','length'].includes(x)))];if(!ids.length)continue;if(ids.every(id=>new RegExp('(const|let)\\s+'+id+'\\b[^;]*=\\s*await[^;]*\\.boundingBox\\(').test(S(f.file))))bb++;}console.log(bb)"
19
```

**実例（A 群・検出器の精度）**: `e2e/specs/auth/auth-initialization.spec.ts:28`

```ts
const count = await loginForm.count();
if (count === 0) return false;
```

真偽を返す述語ヘルパーの実装そのものであり、検証を無効化していない。
検出器のヘッダも「検証ロジックそのもの」を正当な除外として挙げている。
ただし 72 件を注釈で外すのは「大量除外による見かけ上の解消」と区別できないため、
**注釈ではなく検出器の規則で外す**（自己検証に「捕捉してはならない書き方」として登録する）。

**機械的に直せるか**: A/B/C の 104 件は機械的、D1 の 4 件は集約可能、
残る D2/E/F/G の 500 件は箇所ごとの判断が要る。
判断が要ると言い切る根拠として、D / E / F / G 群から 17 箇所を実際に読んだ（本タスクで実施）。
直し方の内訳は次のとおりで、**同じ標本の中で 5 通りに割れた**。一括置換はできない。

| 直し方 | 件数 | 例 |
|---|---:|---|
| 前提を無条件に主張すれば済む | 11 | `e2e/specs/api/jwks.spec.ts:94`、`e2e/specs/estimate-requests/ocr-retry-e2e.spec.ts:560` |
| 型の絞り込み（C 群と同型・機械的） | 2 | `e2e/specs/estimate-requests/estimate-request-layout-net-e2e.spec.ts:287` |
| 再試行ループの成功時 return（末尾に throw があり正当） | 2 | `e2e/specs/api/health.spec.ts:29`、`e2e/specs/auth/invitations.spec.ts:51` |
| 無引数 `test.skip()` による飛ばし（第3原則抵触・別枠） | 1 | `e2e/specs/quantity-tables/photo-comment-display.spec.ts:175` |
| ループ添字による全域分岐（検出器の誤検出） | 1 | `e2e/specs/auth/two-factor.spec.ts:529` の `if (attempt < 4)` |

### T3 tautology（85 件）— 重

**意味**: 常に真になる判定。**緑が積極的に嘘をつく**唯一の型。

**内訳**（分類は付録 A と同じ走査による）:

| 形 | 件数 |
|---|---:|
| 論理和・既定値の真偽主張（どちらでも通る） | 69 |
| `typeof` 判定 | 3 |
| リテラル `true` の主張 | 2 |
| その他（観測フラグ等） | 11 |

**実例**: `expect(response.ok() || response.status() === 404).toBeTruthy()`
（`grep -rn "response.ok() || response.status()" e2e --include=*.ts | wc -l` → 5 件）

**機械的に直せるか**: 直せない。69 件の論理和はいずれも
「どちらの経路が要件の期待なのか」を決める作業であり、要件を読む必要がある。
1 件あたりの重さは大きいが件数は少ない。

### T4 response-field-gate（5 件）— 軽（件数のみ）

意味は T5 と同じ「沈黙する関門」で、条件が応答の項目である点だけが異なる。
5 件しかないため独立した段を設けず、T5/T1 と同じ段で扱う。

## 3. 優先順位と理由

1. **検出の穴（bare `test.skip()` 49 件）** — 第3原則直撃であり、かつ**抑止一覧にすら載っていない**。
   数が間違っている状態で計画を立てても意味がないため最初に置く。
2. **T6（66 件）** — 第3原則直撃。全件が 2 パターンで、費用が最も小さい。
3. **T2（285 件）** — 全件が同一構文で完全に機械的。単体では観測に過ぎないが、
   偽の観測を供給して T5 の判断を濁らせている。先に潰すと後段の判断が正直になる。
4. **A/B/C（104 件）** — 72+1 は欠陥ですらなく、31 は機械的。
   ここを片付けないと「残り件数」が実態より重く見え、優先順位を誤らせる。
5. **D2（76 件）** — 沈黙脱出は以降の検証が丸ごと消える。効果は T6 に最も近い。
6. **T3（85 件）** — 恒真は「検証がある」と偽って報告する。件数が少なく早く終わる。
7. **E（186 件）** — 沈黙する関門の本体。件数が最大で、1 件ずつ要件に照らす必要がある。
8. **F（182 件）+ G（56 件）+ D1（4 件）** — 復旧分岐・全域分岐・再試行ループ。多くは
   「どこで失敗するか」を明記した除外注釈、または共通補助への集約へ落ち着く見込みである。

T2 を T5/T1 より先に置いたのは、T2 が「単なる観測」だからではなく、
**その観測が偽であることが下流の関門を正当化してしまう**ためである。

## 4. 段階と出口条件

出口条件はすべて `npm run check:e2e-guards` の出力と基準の数値で確認できる。
各段の上限値は重複解消（T2 と T5 の二重計上 94 件）を勘定に入れない**単調な上限**であり、
実際にはこれを下回る。

| 段 | 対象 | 出口条件（機械的に確認できるもの） |
|---|---|---|
| 0 | bare `test.skip()` 49 件の是正と検出規則の追加 | `grep -rn "test\.skip()" e2e --include=*.ts \| wc -l` が **0**、かつ検出器に無引数 `test.skip` の規則を追加しても `generatedTotal` が増えないこと（自己検証に捕捉すべき書き方として登録） |
| 1 | T6 | `T6-conditional-skip` が **0**、`generatedTotal ≤ 978` |
| 2 | T2 | `T2-ignored-timeout` が **0**、`generatedTotal ≤ 693` |
| 3 | A / B / C | `grep -rn "isVisible({ *timeout"` 相当の残存 0 に加え、A/B/C が **0**（実測 34 / 1 / 16）で `generatedTotal ≤ 589` |
| 4 | D2 | 沈黙脱出 **43** 件が 0、`generatedTotal ≤ 502` |
| 5 | T3 | `T3-tautology` が **0**、`generatedTotal ≤ 425` |
| 6 | E | E **171** 件が 0、`generatedTotal ≤ 222`（Task 115.137 で検出器の取りこぼしと誤検出の双方を正した後の実測。総数 393 − E 171。段5 完了時点の上限 ≤227 は母数 398 から導いたもので、是正で総数が 393 へ減ったぶん改めた。査読前に一度置いた「E 170 / ≤248」は誤検出 19 件を含む 418 から導いた値であり破棄した。§4.3 参照） |
| 7 | F / G / D1 | `generatedTotal` が **0**。残るのは「どこで失敗するか」を明記した `e2e-guard-allow` のみ |

段4 以降の出口数値は、**段3 で作成した分類走査による実測から確定させたもの**である
（付録 A が課していた「暫定」の制約は段3 で解除した）。導出は次のとおりで、合計が
段3 完了時点の `generatedTotal` 545 に一致する。

```
$ npm run classify:e2e-guards   # 段3 完了時点
   検出件数（全型）: 545        （T3 77 + 関門の一族 468）
     G 52 / D1 10 / D2 43 / F 169 / E 194   （A 0 / B 0 / C 0）
$ node -e "console.log(545-43, 545-43-77, 545-43-77-194, 43+77+194+52+10+169)"
502 425 231 545
```

策定時の数値（≤513 / ≤428 / ≤242）は総数 1044・内訳 D2 76 / T3 85 / E 186 から導いたもので、
段0〜段3 の是正で総数と内訳の双方が動いたため上記へ改める。
各段の拘束は**群別・型別の 0** のほうであり、総数の上限は単調な確認手段にすぎない。

各段の完了時に、基準の `reduction.targets` を次段の値へ進める。
検査の出力は毎回「現在 / 目標 / 残り」を印字するため、進捗は主張ではなく数字で確認できる。

### 4.1 進捗（実測・段の完了ごとに追記する）

| 段 | 状態 | 完了時の実測 |
|---|---|---|
| 0 | **完了**（Task 115.127） | bare `test.skip()` 50 → **0**、`generatedTotal` 1025 → **919**、`T6` 66（新規則による増加 **0 件**）、自己検査 21/21 |
| 1 | **完了**（Task 115.127 段1） | `test.skip(!<id>, …)` 66 → **0**、`T6` 66 → **0**、`generatedTotal` 919 → **852**（上限 978 を満たす）、対象7ファイル **72 passed** / **skipped 0**、自己検査 21/21 |
| 2 | **完了**（Task 115.127 段2） | `isVisible({ timeout: … })` 256 → **0**（43ファイル）、`T2` 256 → **0**、`generatedTotal` 852 → **596**（上限 693 を満たす）、対象43ファイル **628 passed** / **skipped 0**（既知の陳腐化 1 件は後述）、総実行時間 41.97分 → 47.2分（+12.5%）、自己検査 21/21 |
| 3 | **完了**（Task 115.127 段3） | A 群 34 件・B 群 1 件を**検出器の規則**で対象外化、C 群 16 件を `assertPresent` へ畳み込み。`generatedTotal` 596 → **545**（上限 589 を満たす）、A/B/C いずれも **0**、`T4` 5 → 4・`T5` 450 → 400、自己検査 **31/31**（段3 の 10 件を追加）、分類走査の合計 468 が検出件数と一致 |
| 4 | **完了**（Task 115.127 段4） | D2 群 43 件（21ファイル）を 0 に。`generatedTotal` 545 → **497**（上限 502 を満たす）、`T5` 400 → 352、E 194 → **189**（D2 の是正が呼び出し側の関門も消したため）、自己検査 31/31、対象21ファイルの E2E **370 passed / skipped 0 / failed 0** |
| 5 | **完了**（Task 115.127 段5） | T3 77 件（34ファイル）を 0 に。`generatedTotal` 497 → **398**（上限 425 を満たす）、`T1` 64 → 61・`T4` 4 → 3・`T5` 352 → 334、除外注釈 3 → 1、自己検査 31/31。対象34ファイル745件の E2E を実測。1回目は 672 passed / 5 failed / 68 did not run（直列の巻き添え。38.5分）。5件の失敗のうち3件は production 未実装（下表）、2件は本段の誤り（後始末の過剰な主張・401の提示先の誤認）で是正済み。未実装の8件へ `test.fail()` のラチェットを付けて再実行し、巻き添えの68件を含めて **failed 0 / skipped 0**（13.4分＋7.0分）。変異検証3件で「是正前は緑・是正後は赤」を実測。査読の指摘で是正を1周（要件検証を放棄した3件を前提生成器で肯定的な主張へ、実装の書き写し2件を削除、陳腐化した要件タグ4件を REQ-14.x → REQ-16.x へ訂正、ラチェット中の3要件を `pending-implementation` へ登録、テスト名の要件番号2件を訂正、段6 の目標値を実測へ訂正）。是正後も `generatedTotal` 398・除外注釈 1 で増加なし、`check:req-coverage` は PASSED |
| 6 の前提 | **完了**（Task 115.137） | 検出器の観測の語彙・沈黙脱出の見極め・走査対象を実態へ合わせた。`generatedTotal` 398 → **393**（追加 1 件・削除 6 件の差し引き **減少 5**）、`T5` 334 → **329**（T1 61・T4 3 は不変）、除外注釈 1 → **0**、分類は D2 **0 → 1**（真正の沈黙脱出 `import-e2e.spec.ts:809`）・D1 10 → 4・E **171 のまま**（F 168・G 49 は不変）、自己検査 31/31 → **45/45**。査読前の一周では 418 件（誤検出 19 件を含む）と記録したが、破棄して測り直した。E2E スペック本体は一行も変更していない。詳細は §4.3 |
| 6 | **完了**（Task 115.127 段6） | E 群 171 件（56ファイル）を 0 に。`generatedTotal` 393 → **191**（上限 222 を満たす）、`T1` 61 → **51**・`T4` 3 → **0**・`T5` 329 → **140**、除外注釈 0 のまま。分類は F 168 → **143**・G 49 → **43**（D1 4・D2 1 は不変）。**是正が上流を直したため、対象外の群も併せて減った**（債務の移動は 0 件）。自己検査 45/45 を維持。E2E は変更した 53 spec 882 件を実測（1巡 約44分）。要件どおりの主張へ改めた結果、**これまで一度も落ちなかった検証が 7 箇所で赤くなった**。内訳は検証側の誤り 5 箇所（是正済み）と production 未実装 2 件で、後者（site-survey/REQ-4.6・REQ-3.1）は要件どおりの主張を残して `test.fail()` のラチェットへ計上し `pending-implementation` へ登録した（§4.4）。変異検証 3 件で「是正前は緑・是正後は赤」を実測 |
| 7 | 未着手 | — |

### 4.2 段5 で露見した production の未実装（Task 115.127 段5）

恒真を本物の主張へ変えた結果、**これまで一度も落ちなかった 8 件の検証が落ちた**。いずれも
検証の誤りではなく実装が要件を満たしていないためであり、要件どおりの主張はそのまま残し、
`test.fail()`（本リポジトリが site-survey-responsive.spec.ts で先に用いている
「実装されたら赤くなるラチェット」）で既知失敗として計上している。**被覆済みではない。**

| 要件 | 内容 | 実装の現状 |
|---|---|---|
| quantity-table-generation/REQ-8.4 | 数量欄への数値以外の入力を拒否しエラーを表示 | blur で 0 に置き換えるだけ。直前の確定値が失われ、エラーも出ない。要件を実装した `QuantityInput` は存在するが未参照 |
| quantity-table-generation/REQ-9.5 | 調整係数への数値以外の入力を拒否しエラーを表示 | blur で既定値 1.00 に置き換えるだけ |
| quantity-table-generation/REQ-10.5 | 丸め設定への数値以外の入力を拒否しエラーを表示 | blur で既定値 0.01 に置き換えるだけ |
| quantity-table-generation/REQ-15.1 | 数量欄の入力可能範囲外にエラーを表示 | 範囲検証が無く 99999999 をそのまま受け付ける |
| quantity-table-generation/REQ-15.3 | 寸法欄の入力可能範囲外にエラーを表示 | 範囲検証が無く -1 をそのまま受け付ける |
| site-survey/REQ-9.3 | 注釈編集中の離脱時に確認ダイアログ | `AnnotationEditor` に beforeunload もナビゲーションガードも無い |
| site-survey/REQ-13.5 | 注釈保存時に操作履歴をクリア | `UndoManager.clear()` が保存処理から呼ばれていない |
| project-management/REQ-21.13 | 存在しないプロジェクトのエラー画面に一覧への戻るリンク | 再試行ボタンのみ。戻るリンクが無い |

段5 では併せて、**恒真の陰に隠れていた「一度も実行されていない検証」**も複数見つかった。
`project-status-transition` の不許可遷移は相対URLでAPIではなく配信サーバへ要求しており、
本文の無い 4xx で常に成立していた。`trading-partner-error-handling` の 401 は
`waitForURL(...).catch(() => false).then(() => true)` により待機の失敗が真へ畳まれ、
後段が一度も実行されていなかった。`two-factor` の使用済みバックアップコードは
`find(async …)` が常に先頭要素を返すため絞り込みが効いていなかった。

段5 の変異検証は3件で行った。フォーカスリングの box-shadow をフォーカス前と同じ値に固定する、
ソートアイコンを CSS で消す、戻り先（redirectUrl）を捨てるログイン手順に差し替える、の三つである。
**是正前の恒真な形では 3 件とも緑のまま通り、是正後は 3 件とも赤になる。**

段0 の着手時点の実測は本書 §1 の 1044 ではなく **1025** であった（Task 115.126 が 19 件を先に解消したため）。
また §2 が「49 件」とする bare `test.skip()` は着手時の実測で **50 件**であった。
§5 の表が bare `test.skip()` を「含まない（未検出）」としているのは段0 完了前の記述であり、
現在は検出器の対象である。**本書の数値は策定時のスナップショットであり、現在地は常に
`npm run check:e2e-guards` の出力を正とすること。**

段0 の出口条件の後半（規則を追加しても `generatedTotal` が増えない）は、
検出器の `isConditionalSkip` の該当分岐を元へ戻しても総数が 919 のまま・`T6` が 66 のままである
ことをもって機械的に確認した。すなわち規則は新規の検出を 1 件も生んでおらず、
50 件は規則の追加前に是正されている。

段1 以降の上限値（≤978 / ≤693 / …）は 1044 から導いた**単調な上限**である。
現在地が 919 であるため段1 の上限は既に満たされているが、
**各段の拘束は型別の 0 のほうであり、総数の上限ではない。**

段0 で新設した `e2e/helpers/preconditions.ts` の `assertPrepared` は、
段1 が対象とする `test.skip(!testProjectId, …)` 45 件と
`test.skip(!createdEstimateRequestId, …)` 21 件の畳み先としてそのまま使えた。

段1 の是正前に対象7ファイルを `--retries=0` で実測したところ、**skip は 0 件**（76 passed）であった。
是正後は 72 passed である。減った 4 件は数量表4ファイルの事前準備テストを共通の補助へ統合したものであり、
**判定を持つテストは 1 件も減っていない**（消えた主張はすべて補助の内側で行われる）。
すなわち 66 件の `test.skip` はいずれもこの時点では発火していない。段1 の価値は
「いま飛んでいる検証を戻す」ことではなく、**前提が崩れたときに沈黙する経路を塞ぐ**ことにある。
それを変異検証で確かめた。前提を用意するテストを外して各ファイルの代表1件を単独で走らせると、
是正前は `1 skipped`（終了コード 0・緑）であったものが、是正後は
`1 failed`（`前提が用意されていない: …`・終了コード 1）になる。7ファイルすべてで同じ結果である。

畳み先は次の三つである。

- `assertPrepared(id, ラベル)` — 前提の識別子を無条件に主張する（`preconditions.ts`・段0 で新設）
- `quantity-table-preconditions.ts` の `createTestProject` / `createTestQuantityTable` /
  `openEditPageWithSingleItemRow` — 数量表4ファイルの事前準備を、探す形から**作る形**へ寄せた
- `estimate-request-preconditions.ts` の `seedEstimateRequest` — **段1 で新設**。
  見積依頼3ファイルが「プロジェクト → 取引先 → 数量表 → 数量グループ → 数量項目 → 内訳書 →
  見積依頼」の約110行を各自に複製していたため、複製したまま個別に直すと再発する。

内訳は T6 が 66 件、T5 が 1 件（前提を「表示されていれば」で探す分岐の除去による副次的な減少）で、
合計 **67 件**である（919 → 852）。**段1 の上限 978 は満たしている。**

なお §2 の「T6 は全 66 件が 2 パターンなので機械置換すれば足りる」は、結果として**不正確**であった。
`test.skip(!testProjectId, …)` の 45 件のうち、`testProjectId` を実際の前提として使っている
テストは僅かで、大半は `createdQuantityTableId`（数量表のID）を使いながら、
それとは別の識別子で守られていた。守っている値と実際に必要な値が食い違っていたため、
`assertPrepared(testProjectId, …)` への機械置換では前提の崩れを捉えられない。
主張する対象を、そのテストが実際に必要とする識別子へ付け替えている。

段2 の着手時点の `isVisible({ timeout: … })` は §2 の 285 件ではなく **256 件**であった
（段0・段1 の是正で該当行ごと消えたものがあるため）。43 ファイルに散っており、
構文はすべて同一である（options は `timeout` の 1 キーのみ・`await` を必ず伴い、
168 件が `.catch(() => false)` を後置、88 件が素の `await`）。他の即時判定述語に
`timeout` を渡している箇所は §2 の実測どおり 0 件であった。

畳み先は `wait-helpers.ts` に新設した `isVisibleWithin(locator, timeout)` 一つである。
`waitFor({ state: 'visible', timeout })` を包み、**待機切れのときだけ false を返す**。
`.catch(() => false)` は補助が同じ役割を担うため、置換時に吸収して消した。

**待機切れ以外の失敗は握り潰さずに送出する**設計とした。これは意図した強化である。
偽の false を返すことは、本段が解消しようとしている欠陥そのものであるため。
その結果、置換だけで 2 件の検証が落ちた。いずれも production ではなく**検証の誤り**で、
strict mode 違反が `.catch(() => false)` に飲まれて**判定が一度も成立していなかった**ものである。

| 箇所 | 症状 | 是正 |
|---|---|---|
| `quantity-table-crud.spec.ts` REQ-5.3 | `getByText(/名称は必須です\|必須/i)` が同じ行の工種・単位のエラーにも一致し 3 要素 | 名称欄の必須エラーだけを指す `getByText('名称は必須です')` へ |
| `number-format-e2e.spec.ts` REQ-18.12 | `[data-testid="total-amount"].or(getByText(/合計/i))` が見出しと金額の 2 要素に一致 | REQ-18.12 の主題である `[data-testid="total-amount"]` のみへ |

前者は `hasErrorMessage || hasErrorField` の**論理和で覆い隠されて**いた（§2 T3 の
「どちらでも通る」と同型である）。後者は三重の `if` の最も外側であり、
内側の `expect(numStr).not.toContain('.')` は一度も実行されていなかった。

### 待機が実際に効くことの実証（変異検証）

1.5 秒後に現れる要素へ、是正前後の形を同一ページで当てた実測は次のとおりである。

| 形 | 結果 | 所要 |
|---|---|---|
| `locator.isVisible({ timeout: 5000 })` | **false** | 27ms |
| `isVisibleWithin(locator, 5000)` | **true** | 1848ms |
| `isVisibleWithin(現れない要素, 1000)` | false | 1017ms |

すなわち是正前は 5 秒の指定が 27ms で捨てられていた。

### 実行時間と、待って無駄になった箇所

対象43ファイルの総実行時間は **41.97分 → 47.2分（+12.5%）**である。
補助へ計測を仕込んで 1 巡させたところ、`isVisibleWithin` の呼び出しは 350 回で、
その内訳は **247 回が即時に true**（従来と挙動も費用も同じ）、
**4 回が 100ms 以上待ってから true**（従来は false を返していた＝**分岐が反転した**）、
**99 回が待機切れの false** であった。待機切れが費やした時間の合計は **302.9 秒**であり、
上記の増分 315 秒とほぼ一致する。**実行時間の増加は、現れない要素を待つ分がすべてである。**

待機切れが集中する箇所は次のとおりで、**E 群（段6）が扱うべき「死んでいる分岐」の候補**である。

| 費やした時間 | 回数 | 箇所 |
|---:|---:|---|
| 31.5s | 9 | `quantity-tables/name-remarks-autocomplete.spec.ts:267`（`for...of` の内側） |
| 15.0s | 14 | `estimate-requests/structured-data-ocr-e2e.spec.ts:33`（共通の前提補助） |
| 14.4s | 1 | `site-surveys/site-survey-crud.spec.ts:274` |
| 12.1s | 3 | `quantity-tables/photo-select-overlap-e2e.spec.ts:107` |
| 11.7s | 1 | `quantity-tables/autocomplete-optimization.spec.ts:412` |
| 9.1s | 9 | `quantity-tables/autocomplete-optimization.spec.ts:615`（`for...of` の内側） |

また、256 箇所のうち 1 巡で実際に評価されたのは **211 箇所**であった。
残る 45 箇所は当該の巡回では一度も通っていない。これも段6 の材料である。

**段2 は待機を効かせただけであり、待った結果で黙って抜ける構造（T5）は 450 件のまま残る。**
`await` を残しているため検出は失われていない（450 → 450 で不変）ことを実測で確認した。

> **追記（Task 115.137）**: この「不変」は正しかったが、**維持されていた理由が `await` の
> 一語だけだった**。検出器の観測の語彙は `\bisVisible\b` で語境界一致しており、段2 が
> 新設した補助 `isVisibleWithin` には一致していなかった。すなわち 256 箇所の分類は
> 「観測を運ぶ式であること」ではなく「`await` を含むこと」だけに依存していた。
> 115.137 で語彙を実態へ合わせた。経緯と件数の動きは §4.3 を参照。

### 段2 の時点で残る既知の赤

`quantity-tables/quantity-item-action-menu-clipping-e2e.spec.ts:426`（REQ-46.1/46.2/46.3）は
**段2 の着手前から落ちている**。`MENU_ITEM_COUNT = 4` に対しメニュー項目が 5 件あるためで、
`a241d54`（数量項目のグループ間移動と一括操作の実装）が「別グループに移動」を足したときに
本ファイルの定数が追随しなかったことによる。段2 の変更とは無関係であり、直列 describe のため
同ファイルの後続 5 件が実行されない。別タスクで扱うこと。

### 4.3 検出器が実態を見ていなかった期間（Task 115.137）

段6 に入る前に、**検出器の観測の語彙と沈黙脱出の見極めが実態から外れていた**ことが判明したため、
母数を測り直した。E2E スペック本体は一行も変更していない（`git diff --stat` で確認）。

本節は**二周ぶんの記録**である。一周目（`generatedTotal` 398 → 418）は独立査読で
**REJECTED** となった。増えた 20 件のうち真正の沈黙脱出は 1 件だけで、19 件は
検出器の誤検出だったためである。二周目でその誤検出を構造で止め、**398 → 393**（差し引き減少 5）
へ改めた。一周目の 418 という数字は残さない。誤りの経緯だけを教訓として残す。

#### 何が見えていなかったか

取りこぼしは**二つ**あり、当初の見立て（語彙だけ）では片方しか説明できなかった。

**(1) 観測の語彙が語境界一致だった。**
`OBSERVATION_PATTERN` は `\b(isVisible|…|evaluate)\b` の形であり、段2 が
`isVisible({ timeout })` 256 箇所を畳んだ先の補助 `isVisibleWithin` に一致しない
（`Within` が続くため語境界が成立しない）。その結果、これら 256 箇所が「観測を運ぶ」と
判定されていた根拠は `AWAIT_PATTERN`（`\bawait\b`）だけになっていた。
段2 完了時点で検出が不変だったのは事実だが、**維持されていたのは偶然に近い**。

実測（旧検出器・注入した書き方）:

```
const seen = isVisibleWithin(importButton, 3000);   // await を外へ出した形
if (!seen) { return; }
await expect(importButton).toBeVisible();
→ 旧: 無検出 ／ 新: T5-observed-result-gate
```

**脆さの大きさも測った。**課題文は「`await` を外へ持ち出す書き換えが入ると
約 250 件の検出が静かに消える」と見立てていたが、実測ではそこまで大きくない。
`AWAIT_PATTERN` を観測の合図から外した検出器で全件走査すると、
**検出件数は語彙の新旧いずれでも 393 件で変わらない**。多くの条件式は局所変数の展開後に
`locator` / `getByRole` / `count` といった別の観測の語を含むためである。
変わるのは**型の分類**で、`T5` は新語彙 298 件・旧語彙 285 件（差 13 件）。
つまり `await` 依存で脆かったのは「検出の有無」ではなく「型の分類」だった。
型の分類は段の出口条件と削減計画の母数に直結するため是正の価値はあるが、
**「約 250 件が消える」という見立ては過大であり、本節で訂正する。**
`e2e` 配下で `isVisibleWithin` が条件式に現れる行は 126 行ある。

**(2) 沈黙脱出の見極めが「本体のすべての文が脱出であること」を求めていた。**
`isSilentExit` は `then` 節の全文が `return` / `continue` / `break` / `test.skip` である
ことを条件としていた。したがって**脱出の直前に後始末が一文でも挟まると無検出**になる。
これは語彙とは独立した取りこぼしであり、(1) だけを是正しても解けない。

#### 実害の実測（`e2e/specs/quantity-tables/import-e2e.spec.ts:809`）

段4 のレビューが指摘した「D2 が零でも沈黙脱出は零ではない」実例を、旧新の検出器で測った。

```ts
if (!(await isVisibleWithin(groupButton, getTimeout(3000)))) {
  const cancelBtn = dialog.getByRole('button', { name: 'キャンセル' }).last();
  if (await isVisibleWithin(cancelBtn, getTimeout(2000))) {
    await cancelBtn.click();          // ← 後始末が一文挟まるだけで無検出だった
  }
  return;                             // ← REQ-31.3〜31.9 の検証が丸ごと飛ぶ
}
```

| | 当該ファイルの検出件数 | 809 行の検出 |
|---|---:|---|
| 旧検出器（`db2417d`） | 10 | **0 件（無検出）** |
| 是正後の検出器 | 11 | **1 件（T5-observed-result-gate）** |

原因の切り分けも実測した。**補助名を語彙に一致する `isVisible` へ差し替えても旧検出器では
無検出**であり、809 が報告されなかった主因は語彙ではなく (2) の `isSilentExit` だった。
課題文が挙げていた「補助名に一致しないため」という見立ては、この一件については誤りである。
語彙の是正 (1) だけを入れた時点の全件走査は **398 件のまま不変**であり、
809 は依然として無検出のままだった。

#### 一周目の誤り: 判定規則を広げた結果、正しい書き方を負債として数えた

(2) を「終端が脱出であること」へ広げた一周目は、`break` / `continue` を
`return` と同じ「検証からの脱出」として扱っていた。しかし **`break` / `continue` は
繰り返しを抜けるだけでテストからは抜けない**。その結果、次の形が丸ごと誤検出になった。

```ts
let foundTestProject = false;
for (let i = 0; i < rowCount; i++) {
  const rowText = await rows.nth(i).textContent();
  if (rowText && rowText.includes(PROJECT_WITH_KANA_PARTNER)) {
    foundTestProject = true;
    break;                       // ← 一周目の規則が「沈黙脱出」と誤判定
  }
}
expect(foundTestProject).toBe(true);   // ← 観測が偽なら必ず失敗する
```

**この形は本計画が E 群の是正先として推奨している形そのもの**である。
検出を広げたことで、**正しい書き方を負債として数えていた**。
同種の誤検出は、値を作る補助の中の `return <値>`（`password-reset.spec.ts:587` の
受信メールの取り出し、`import-e2e.spec.ts:132` の遷移補助）にも及んでいた。
さらに、走査対象が `e2e/` 全体だったため、Playwright の実行基盤
（`global-setup.ts` の疎通待ち、`reporters/` の進捗表示）まで拾っていた。

一周目の +20 件を一件ずつ読んだ結果は次のとおり。

| 判定 | 件数 | 内訳 |
|---|---:|---|
| **真正の沈黙脱出** | **1** | `import-e2e.spec.ts:809` |
| 誤検出（探索・再試行の `break`） | 16 | `profile` 98/465/669/883/992、`estimate-request-e2e` 2803/3219、`itemized-statement-crud` 1219、`project-status-transition` 62、`project-additional-requirements` 558、`project-breadcrumb` 280/594、`project-kana-search` 445、`project-search-scope` 236/301 |
| 誤検出（値を作る補助の `return <値>`） | 2 | `password-reset.spec.ts:587`、`import-e2e.spec.ts:132` |
| 誤検出（テストではない実行基盤） | 2 | `global-setup.ts:31`、`reporters/progress-reporter.ts:74` |

#### 採用した形

**(1) 語彙**: 「補助名を列挙するだけでは同じ壊れ方を繰り返す」ため、次の二段構えとした。

- **接頭辞一致**: 述語の族（`isVisible` … `isEditable`）と待機の族（`waitFor`）は
  `isVisible\w*` / `waitFor\w*` の形で一致させる。この接頭辞を持つ識別子が
  観測以外を指すことは事実上ありえない。
- **`e2e/helpers/` からの自動取り込み**: 当該配下で「真偽を返す」と**構文で判る**関数の
  名前を走査時に集め、語彙へ足す（`collectBooleanHelperNames`）。判定には述語ヘルパーの
  対象外判定と同じ `isBooleanReturningFunction` を用いるため、`isX` / `hasX` のような
  **命名には一切依存しない**。補助が増えても検出器の書き換えは要らない。

補助名に依存しない形（呼び出しを構文だけで捉える）を第一候補として検討したが、**採用しなかった**。
本検出器は型チェッカを持たず、`ts.createSourceFile` による単一ファイルの構文木しか見ない。
`await someHelper(locator, 3000)` という呼び出しから「これは真偽を返す待機である」ことを
構文だけで決める手段が無く、識別子の解決が必要になる。自動取り込みは、その解決を
「定義側を構文で判定して名前を集める」形へ置き換えたものであり、
**検出器に名前の一覧を持たせない**という目的は満たす。現時点の取り込み結果は
`isVisibleWithin` / `waitForAuthState` / `waitForElementWithRetry` /
`waitForSessionDataLoaded` の 4 件で、いずれも接頭辞一致にも掛かるため
**今日の件数への寄与は 0** である。将来 `hasVisibleRow` のような接頭辞外の補助が
足されたときに効く備えとして入れている。

**(2) 沈黙脱出**: 「脱出の文だけで構成される」から
「**脱出で終わり、その途中で主張も失敗もしない**」へ改めた。検証が飛ぶかどうかを
決めるのは途中に何が書かれているかではなく、主張も失敗もせずに制御が抜けるかである。
条件は (a) 本体の終端が脱出の文、(b) 本体のどこにも `expect` が無い、
(c) 本体のどこにも `throw` / `expect.fail` / `test.fail` が無い、の三つ。
(b)(c) があるため、抜ける前に主張する形や必ず落ちる形は含まれない。

**(3) 繰り返しを抜けるだけの `break` / `continue`**（二周目で追加）:
終端が `break` / `continue` であり、**抜けた繰り返しの後で観測の結果が無条件に検査される**
場合は沈黙脱出としない（`escapesCheckedLoop`）。「無条件に検査される」は
(a) 無条件の主張、(b) 無条件の `throw`、(c) `else` を持たない分岐で本体が必ず `throw` する、
(d) `else` を持つ分岐で双方の経路が主張か `throw` に至る、のいずれかを構造で判定する。
これは分類走査の D1「繰り返しの外に `throw` がある」と同じ発想を、主張側へ広げたものである。

代案として **`isExitStatement` から `break` / `continue` を外す案**も実装して測った。
今日の走査結果は両案で**完全に一致**する（ともに 393 件、差分 0）。それでも採らなかったのは、
その案が「抜けた先で結果を一切検査しない `break` / `continue`」まで一律に無検出にするためである。
つまり **E 群の是正先として推奨した形が将来劣化しても検出できない**。実測でも、その案は
自己検査 `115.137-8`（同じ探索ループで結果を検査しない形は検出する）に落ちる。

**(4) 値を作る補助の中の `return <値>`**（二周目で追加）:
分岐の内側に `expect` が無く、終端が**値を伴う** `return` であり、その分岐を囲む
最も内側の関数がテスト本体でない場合は対象外とする（`valueProducingExitExclusion`）。
値を返す関数が値を返す経路を持つのは関数であることそのものであり、検証の放棄ではない。
債務は呼び出し側がその値をどう扱うかにあり、呼び出し側の分岐は従来どおり検出される
（A 群＝述語ヘルパーの内部を対象外にしたのと同じ理屈を、真偽以外を返す補助へ広げたもの）。
テスト本体の中の**値を伴わない** `return;` は真正の沈黙脱出として検出したまま残る
（`import-e2e.spec.ts:809` がその実例）。

**(5) 走査対象**（二周目で追加）: `e2e/specs/` `e2e/helpers/` `e2e/fixtures/` の三つだけを走査する
（`SCAN_SUBDIRS`）。検出しているのは「テストが検証を放棄している構造」であり、
Playwright の実行基盤（`e2e/global-setup.ts` / `e2e/config.ts` / `e2e/reporters/`）は
テストのライフサイクルの外で走るため、そこの `return` / `break` は通常の制御フローである。
除外は**ファイル名の羅列ではなく置き場所の役割**で決めた。名前を並べる方式は、
基盤のファイルが増えるたびに検出器を書き換える運用になり、書き換え漏れが誤検出として残るためである。
走査対象のディレクトリが失われた場合は黙って空にせず**例外で検査を落とす**。

**(6) 語彙の取り込みが空になったら失敗させる**（二周目で追加）:
`collectBooleanHelperNames` は取り込み元が無い／真偽を返す関数が一つも無い場合に例外を投げる。
以前は黙って空を返しており、基礎語彙が残るため検出が丸ごと消えることはないものの、
`await` を外へ出した書き方だけが静かに無検出へ落ちた。本タスクが解消しようとしている
「静かに消える」問題そのものなので、失敗させる形へ改めた。

#### 件数の動き

`generatedTotal` 398 → **393**（**減少 5**。追加 1 件・削除 6 件）。

| 動き | 件数 | 箇所と根拠 |
|---|---:|---|
| **追加** | **1** | `e2e/specs/quantity-tables/import-e2e.spec.ts:809` — テスト本体の中で、後始末を挟んで値を伴わない `return;` で抜ける真正の沈黙脱出。以降の REQ-31.3〜31.9 の検証が丸ごと飛ぶ |
| 削除 | 3 | `site-survey-annotation-mobile.spec.ts` 319/1033/1626 — `getCanvasBox(): Promise<CanvasBox>` の中で値を返す `return box;`。繰り返しの外に `throw` があり素通りする経路が無い（旧規則の誤検出） |
| 削除 | 3 | `site-survey-annotation-tools.spec.ts:492`、`site-survey-image-rotation.spec.ts` 189/228 — 再試行ループの `break` で、ループの後に `throw` の関門がある（旧規則の誤検出）。ただし関門の強さは一様でない。`getCanvasSize`（rotation:228）は `if (!box || box.width <= 10 …) throw` で必ず落ちるが、`getCanvasCenter`（tools:492 / rotation:189）の関門は `if (!box) throw` であり、**フォールバックで box が非 null かつ極小のコンテナ座標に入ると素通りする**。それでも座標を返して以降の主張は無条件に実行されるため検証の放棄ではなく、対象外の判定は変わらない |

このファイル単体（`import-e2e.spec.ts`）では 10 → 11 の**増加**であるため、
基準の更新には `--update-baseline --allow-increase` を用いた（全体は減少）。
増加を無言で記録しない関門が働くことも実測している（`--allow-increase` 無しでは拒否される）。

型別: `T1` 61（不変）、`T4` 3（不変）、`T5` 334 → **329**、`T2`/`T3`/`T6` 0（不変）。
除外注釈は 1 → **0**。`site-survey-annotation-tools.spec.ts:536` に付けていた
「直後の `throw` で必ず失敗する」という注釈は、(4) の規則が構造で吸収したため不要になった
（注釈そのものはスペック本体を変更しないため残置。段7 で削除を判断する）。

分類（`npm run classify:e2e-guards`）の動きは次のとおり。

| 群 | 旧（398） | 一周目（418・誤） | 是正後（393） | 備考 |
|---|---:|---:|---:|---|
| A / B / C | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 不変 |
| G | 49 | 49 | 49 | 不変 |
| D1 | 10 | 11 | **4** | `break` の誤検出 3 件と補助の `return <値>` 3 件が対象外になった |
| **D2** | **0** | 20 | **1** | 段4 で 0 にしたはずの沈黙脱出。残る 1 件が `import-e2e.spec.ts:809` |
| F | 168 | 168 | 168 | 不変 |
| **E** | **171** | 170 | **171** | 一周目に E → D2 へ移っていた `two-factor.spec.ts:786` は誤検出であり、E へ戻った |
| 合計 | 398 | 418 | **393** | いずれも検出件数と一致 |

#### 段6 の母数の測り直し

段6 の出口条件を **E 171 件が 0 かつ `generatedTotal ≤ 222`**（393 − 171）とした。
一周目に置いた「E 170 件 / `≤ 248`」は、誤検出 19 件を含んだ 418 から導いた値なので破棄する。
E 群の件数自体は段5 完了時点と同じ 171 件であり、**段6 の作業量は変わっていない**。

#### 回帰を止める関門（自己検査）

一周目の誤検出を素通しさせた直接の原因は、**「推奨している正しい書き方は検出してはならない」
という反証事例が自己検査に一件も無かった**ことである。二周目で次を追加した（31 → **45 件**）。

**この表の「戻すと落ちること」は、当初は実測せずに書いていた。**二周目の記録には
「いずれも『規則を戻すと落ちる』ことを実測で確認している」と書いたが、実際に測っていたのは
一部だけで、`115.137-12` は**測っていなかった**。査読が実測したところ、
`115.137-12` は自動取り込みの結線を切っても緑のままだった（詳細は次項）。
現在の表は、下記の変異検証をすべて実際に走らせた結果に基づいている。

| 事例 | 何を固定するか | 戻すと落ちること |
|---|---|---|
| `115.137-6` | 探索ループ＋`break`＋ループ直後の無条件の主張は**検出しない** | `escapesCheckedLoop` を無効化すると落ちる |
| `115.137-7` | 再試行ループ＋`break`＋ループ後に `throw` する関門は**検出しない** | 同上 |
| `115.137-8` | 同じ形でも結果を検査しなければ**検出する** | `break`/`continue` を脱出から外す代案で落ちる |
| `115.137-9` | 値を作る補助の中の `return <値>` は**検出しない** | `valueProducingExitExclusion` を外すと落ちる |
| `115.137-10` | テスト本体の中の `return;` は**検出する** | （真正の沈黙脱出の側を固定する） |
| `115.137-11` | 接頭辞一致でしか捉えられない補助（`e2e/helpers` に無い名前）で**検出する** | 接頭辞一致を語境界一致へ戻すと落ちる |
| `115.137-12` | 自動取り込みが**走査本体の語彙へ結線されている**（部品が動くだけでは通さない） | `getObservationVocabulary()` の取り込み呼び出しを空配列へ置き換えると落ちる |
| `115.137-13` | 取り込み元が失われたら例外で落ちる | 空配列を返す旧挙動に戻すと落ちる |
| `115.137-14` | 走査対象に実行基盤を含まない | 走査対象を `e2e/` 全体へ戻すと落ちる |

`115.137-1`（`await` を条件式の外へ出しても検出が消えないこと）は語彙**全体**の関門である。
接頭辞一致と自動取り込みはどちらか一方が残れば `isVisibleWithin` を捉えるため、
片方だけを戻しても `115.137-1` は通る。そこで `115.137-11` / `115.137-12` を別々に置き、
**二つの規則を独立に固定**した。

#### 関門を「作ったつもりで作れていなかった」（三周目の是正）

査読が変異検証で測ったところ、`115.137-12` は**自動取り込みの結線を切っても緑のまま**だった。
原因は事例の書き方にある。当時の `115.137-12` は
`collectBooleanHelperNames()` と `buildObservationPattern()` を**部品として直接呼ぶだけ**で、
その二つを繋ぐ一行（走査が用いる語彙を組み立てる箇所）を一切見ていなかった。
したがって `getObservationPattern()` から取り込みの呼び出しが失われても、
部品は個別に動くため自己検査は通ってしまう。

**これは本節が潰そうとしている失敗様式そのものの再演である。**
「書き換え漏れがそのまま静かな無検出になる」ことを止めるために置いた関門が、
まさに「関門の書き換え漏れが静かに素通りする」形をしていた。
さらに悪いことに、その関門の実効性を**測らずに「実測で確認している」と書いた**ため、
文書の側からも誤りに気づけなくなっていた。

是正として、走査が実際に用いる語彙を**取り込んだ名前と正規表現の対**
（`getObservationVocabulary(): ObservationVocabulary`）として公開し、
`115.137-12` が次の両方を主張する形へ改めた。

1. `collectBooleanHelperNames()` の結果が空でないこと（構造で拾えていること）。
2. その結果が**走査本体の語彙へ実際に反映されている**こと
   （取り込んだ名前が一つ残らず `vocabulary.helperNames` に載り、
   かつ `vocabulary.pattern` がその名前から組まれていること）。

2 があるため、取り込みの呼び出しを外す／名前を保持したまま組み立てへ渡さない、
のいずれの書き換えでも `115.137-12` が落ちる。

#### 関門の実効性の変異検証（実測）

規則を一つずつ戻した版で自己検査を走らせた結果である。作業ツリーは汚さず、
`e2e` / `node_modules` / `package.json` を実体へ張ったシャドウのルートに
変異版の `scripts/` を置いて実行した（`ROOT` が `__dirname` 由来のため成立する）。

| 戻した規則 | 落ちる事例 | 結果 |
|---|---|---|
| （変異なし） | — | 45/45 |
| 語彙を旧 `OBSERVATION_PATTERN` 相当へ全戻し（接頭辞一致・自動取り込みの双方） | `115.137-1` / `-11` / `-12` | 42/45 |
| 接頭辞一致だけを語境界一致へ戻す | `115.137-11` | 44/45 |
| **自動取り込みの結線を切る**（`getObservationVocabulary()` の取り込みを空配列へ） | **`115.137-12`** | 44/45 |
| 取り込みが空でも例外にしない（旧挙動） | `115.137-13` | 44/45 |
| `escapesCheckedLoop` を無効化 | `115.137-6` / `-7` | 43/45 |
| `valueProducingExitExclusion` を外す | `115.137-9` | 44/45 |
| 走査対象を `e2e/` 全体へ戻す | `115.137-14` | 44/45 |

是正前の `115.137-12` は、四行目の変異で **45/45 のまま緑**だった。

#### 効力を失った除外注釈（段7 で削除を判断する）

`e2e/specs/site-surveys/site-survey-annotation-tools.spec.ts:536` の
`// e2e-guard-allow:` 注釈は、**現在なんの効力も持たない死んだ記述である。**
走査は `ruleBasedExclusion` を注釈の判定より先に評価する（`scanSource` の `visit` 冒頭）ため、
当該の分岐は注釈に到達する前に (4) の `valueProducingExitExclusion` で対象外になる。
`allowedTotal` が 1 → 0 になったのはこのためであり、注釈が効いた結果ではない。
本タスクは E2E スペック本体を変更しない制約のため注釈を残置しているが、
**残っていることが「注釈が効いている」という誤読を生む。**段7 で削除を判断する。

#### 教訓

- **「検出を広げたら件数が増えた」ことは「隠れていた負債が見つかった」ことを意味しない。**
  増えた件を**一件ずつ読むまで、増加の性質は分からない**。一周目は +20 を全件
  「取りこぼしの解消」と断じたが、実際には真正は 1 件で 19 件は誤検出だった。
- **判定規則を広げるときは、計画自身が推奨している正しい書き方が誤検出にならないかを先に確かめる。**
  今回は E 群の是正先として推奨している「探索ループ＋`break`＋ループ後の無条件の主張」を
  負債として数えていた。推奨形は自己検査に「検出してはならない」側として置くこと。
- **効き目の無い是正を「効いた」と書かない。** 語彙の是正（接頭辞一致・自動取り込み）は
  今日の走査結果へ**一切影響していない**（語彙のみ適用した版は旧版と検出集合が完全一致）。
  それでも入れる価値があるのは将来の書き換えに対する備えとしてであり、
  その価値は自己検査の関門（`115.137-1` / `-11` / `-12`）でしか担保できない。
- **「静かに消える」の大きさも測る。** 恐れていた劣化（`await` を条件式の外へ出す書き換え）を
  検出器側で模して測ったところ、消えるのは検出そのものではなく型の分類 13 件だった。
  対策の要否は変わらないが、規模を測らずに「約 250 件」と書いたのは誤りだった。
- **走査対象は「どこに置かれているか」で決める。** テストではないものを走査すると、
  通常の制御フローが負債として計上される。
- **関門は「作った」ではなく「規則を戻すと落ちる」を実測してはじめて関門になる。**
  `115.137-12` は部品を個別に呼ぶだけで、走査本体への結線を見ていなかったため、
  結線を切っても緑のままだった。**本節が潰そうとしている「書き換え漏れが静かな無検出になる」形が、
  それを止めるはずの関門自身に残っていた**という再演である。
  部品が動くことを確かめる事例は、部品が使われていることを保証しない。
  関門は**利用側が実際に用いている値**（ここでは `getObservationVocabulary()`）を主張すること。
- **測っていないことを「実測で確認した」と書かない。** 上の誤りが査読まで生き延びた直接の原因は、
  実効性を測らずに関門表へ「戻すと落ちる」と書いたことである。文書の断定が、
  唯一気づける手掛かりを覆い隠した。実測の記述は、走らせた変異と結果を対で残す。

#### 最後の一跳ねも閉じた（査読 round 3 の提案）

査読 round 3 は APPROVED としたうえで、なお一つ抜けていることを変異検証で示した。
`115.137-12` は `getObservationVocabulary()` までしか主張しないため、
**その先の包み `getObservationPattern()` が語彙を迂回して別の正規表現を返す書き換え**は、
上の主張をすべて満たしたまま素通りする（実測: 45/45 のまま緑）。

`getObservationPattern` を公開し、`115.137-12` に
`getObservationPattern() === vocabulary.pattern`（**参照そのものの同一性**）の一行を足して閉じた。
是正後に同じ変異（`getObservationPattern()` が `buildObservationPattern([])` を返す）を入れると
`115.137-12` が落ちることを実測で確認している（`1/45 件の確認に失敗しました`）。

**教訓**: 関門は「部品が動くこと」でも「値が届いていること」でもなく、
**走査が実際に参照している当のものを主張して**はじめて関門になる。
一段ずつ内側へ寄せていくと、必ずどこかに「最後の一跳ね」が残る。
残っていないことは、**その一跳ねを壊す変異を実際に入れて確かめる**以外に確認する方法がない。

#### 残る既知の限界

- 語彙の自動取り込みは今日の取り込み結果 4 件がいずれも接頭辞一致にも掛かるため、
  **走査結果への寄与は 0** である。将来の備えであることを明記して残す。
- `escapesCheckedLoop` は「繰り返しの後に無条件の主張がある」ことを見るが、
  その主張が**当該の観測を受けているか**までは見ない（変数の同一性を追わない）。
  変数を追う案も検討したが、`profile.spec.ts:883` のように観測の結果を
  主張ではなく無条件の代替操作で受け、その後で無条件に検証する形を誤検出として残すため採らなかった。
- ラベル付きの `break` / `continue`、`switch` を挟む `break` は抜ける先を構造だけで決められないため、
  検出を残す側（沈黙脱出として扱う側）に倒している。

### 4.4 段6 で露見した production の未実装（Task 115.127 段6）

E 群は「観測結果で主張を包むだけ」であり、観測が偽であれば主張が一件も実行されない。
171 件を無条件の主張へ改めた結果、**これまで一度も落ちなかった検証が 7 箇所で落ちた**。
一件ずつ切り分けた内訳は次のとおりで、**production の欠陥は 2 件**、残る 5 箇所は検証側の誤りである。
5 箇所のうち 1 件（REQ-4.10）は**単体実行では緑・全 spec の通し実行では赤**という形で現れた。通しでしか出ない食い違いは 1 巡目の実測で見落としやすいため、実測は通し実行で行うこと。

| 箇所 | 判別 | 内容 |
|---|---|---|
| `estimate-requests/number-format-e2e.spec.ts` REQ-18.10 | 検証側の誤り | PDF の取り込み経路では構造上、行に数量が生まれない。資材を Excel のデータパース経路へ差し替えて前提を成立させた |
| `site-surveys/site-survey-batch-annotations.spec.ts` REQ-18.5 | 検証側の誤り | 観測の窓が画面表示中の取得まで含んでいた。要件が定める「調査報告書出力ボタンを押して以降」へ窓を限った |
| `site-surveys/site-survey-image-rotation.spec.ts` REQ-22.2 | 検証側の誤り | 注釈の描画を click 二回で行っており図形が生まれていなかった。ドラッグへ改めた。**従来は `0 === 0` で成立しており、E 群の陰に隠れていた** |
| `quantity-tables/autocomplete-optimization.spec.ts` REQ-7.3a / REQ-7.7 | 検証側の誤り | `AutocompleteInput` の blur による 150ms の遅延クローズがあり、観測を再試行できる形になっていなかった |
| `site-surveys/site-survey-viewer.spec.ts` REQ-4.10 | 検証側の誤り | 事前準備の画像アップロードが `input[type="file"]` の**即時の件数**で包まれており、0 件なら前提ごと飛んで事前準備が緑になっていた。`count()` は待たないため、画面の描画が遅い状況（全 spec の通し実行）では 0 件と観測される。**単体では緑・通し実行では赤**という食い違いとして現れた。ファイル入力が現れるまで待ってから、2枚のアップロードと一覧への反映を無条件に主張する形へ改めた |
| **`site-survey/REQ-4.6`** | **production の欠陥** | 圧縮後のサイズが受入基準の下限（250KB）を下回る。`backend/src/services/image-processor.service.ts` の圧縮ループは継続条件が `size > TARGET_MAX_SIZE_BYTES`（350KB）だけで、下限を大きく下回っても抜ける。品質を上げ直して範囲へ戻す経路が無い。実測では 2MB / 1920x1080 の JPEG が 61,638 バイトで登録された |
| **`site-survey/REQ-3.1`** | **production の欠陥** | 現場調査一覧にページ操作の UI が無い。`frontend/src/pages/SiteSurveyListPage.tsx` は `page: 1, limit: 50` を固定で渡すだけで、ページ番号を変える状態も操作も持たない |

production の 2 件はいずれも**要件どおりの主張をそのまま残し**、`test.fail()` のラチェット
（`site-survey-responsive.spec.ts` および `project-navigation.spec.ts:383` が先行実装）で
既知失敗として計上した。あわせて `e2e/requirement-exclusions.json` へ
`pending-implementation` として登録している（8 件 → **10 件**）。**被覆済みとは数えていない。**
REQ-4.6 は従来 `infrastructure` 区分で「統合テストで 250KB〜350KB 範囲に圧縮されることを確認」と
していたが、当該の単体テストは sharp をモックして範囲内のサイズだけを与えており、
**下限を下回る経路を通していなかった**。根拠が実態を指していなかったため区分ごと差し替えた。

#### 要件の裏づけが無い主張が 1 件見つかった（JWKS の Cache-Control）

`e2e/specs/api/jwks.spec.ts` の「キャッシュ制御: 適切な Cache-Control ヘッダーが設定されていること」は
`if (cacheControl) { … }` の形であり、`backend/src/routes/jwks.routes.ts` が Cache-Control を
一切設定していないため**一度も発火せず恒久的に緑**だった。テスト名が掲げる主張を無条件へ改めたが、
**requirements.md にも design.md にも JWKS のキャッシュ制御を定めた項目は無い**。
本タスクは要件を発明しない立場を採り、テスト名どおりの主張を残して `test.fail()` のラチェットに計上した。
当該テストは `@requirement` を持たないため `check:req-coverage` の被覆には影響しない。
**(a) Cache-Control を実装して要件へ昇格させるか、(b) 要件外のテストとして削除するかは、
本スペックの所管者が決めるべき事項として残す。**

#### 段6 で主張を削除した箇所と、その受入基準の記録先（査読 round 4 の是正）

段6 の 56 ファイルのうち、`expect(` の件数が実質的に減ったのは
`estimate-requests/estimate-request-ocr-vision-e2e.spec.ts` の 1 ファイルだけである（57 → 39・−18）。
他のファイルの −1 / −2 は `expect(x).not.toBeNull()` を `assertPresent()` へ畳んだもので主張は失われていない。

当該ファイルの 3 テストは構造主張を 200 / 422 分岐の内側に置いていた。
テスト環境の backend は `ANTHROPIC_API_KEY` を持たない
（実測: `docker exec architrack-backend-test printenv | grep -i anthropic` は何も返さない）ため、
REQ-22.3 / REQ-22.6 により応答は 503 で確定し、これらの分岐は一度も実行されていない。
段6 は分岐を 503 の無条件主張へ畳んだが、**`@requirement` タグを据え置いた**。
その結果、到達し得ない受入基準が「機能が使えないこと」を主張するテストによって
`check:req-coverage` 上は被覆済みと数えられ続けていた。段5・段6 が `site-survey/REQ-4.6` や
`site-survey/REQ-3.1` に対して採った「主張は残す・ラチェットで赤にする・除外へ登録する」の逆であり、
債務を可視化せずに消した形である。査読 round 4 でこれを是正した。

| 受入基準 | 段6 で消えた主張 | 是正後の記録先 |
|---|---|---|
| `estimate-request/REQ-21.5` `21.6` `21.7` | `lineItems` / `pageCount` の存在と型、明細 9 フィールドの構成（13 件） | タグを外し `requirement-exclusions.json` へ `integration-test` 区分で登録。根拠は `backend/src/__tests__/unit/services/claude-vision.service.test.ts`（Anthropic SDK をモック・26 件緑を実測） |
| `estimate-request/REQ-23.4` | 422 分岐の `errorType: 'parse_error'` | 同上（`should throw ClaudeVisionError.parseError() …` 2 件） |
| `estimate-request/REQ-26.5` `26.6` `26.7` `26.8` | `Array.isArray(lineItems)` と `typeof quantity\|unitPrice\|amount === 'number'` | 同上（`should parse JSON response …` / `should convert string number fields …` / `should handle comma-separated numbers …`） |
| `estimate-request/REQ-21.8` | `expect(data.pageCount).toBe(3)`（唯一「3 ページ」に触れていた主張） | **E2E に復活**。境界のスキーマに対して 3 ページ一括送信＝503 到達・3 ページ目だけ不正＝400・21 ページ＝上限超過で 400 の 3 点を無条件に主張し、単一画像のテストと区別が付く形にした |

**なぜ (a)（前提を作って主張を復活させる）を採らなかったか**

- **実測**: `page.route('**/api/claude-vision/extract')` を張った状態で `page.request.post` を投げると、
  ハンドラは一度も発火せず（`routed=0`）実在の backend が応答した（`status=401`）。
  `page.request` は APIRequestContext でありページのルーティングを経由しない。
  `structured-data-ocr-e2e.spec.ts` の REQ-13.14 がスタブを使えるのは、要求を出すのが**画面側**だからである。
- 仮に画面経由でスタブしても、スタブは backend そのものを置き換える。REQ-21.5〜21.7 と REQ-26.5〜26.8 は
  「Claude API の応答を解釈する backend の振る舞い」を定めた受入基準であるから、
  スタブした応答を主張しても**テストが自分で書いた資材を主張するだけ**になり、被覆の虚偽は形を変えて残る。
  前提を実際に作るには実在の APIキー、もしくは Anthropic のモックサーバを compose.test へ追加して
  `ANTHROPIC_BASE_URL` を向ける改修が要る。後者は Vision を「有効」にするため、
  同ファイルが持つ REQ-22.6（無効時 503）の主張群と両立せず、段6 の是正の範囲を超える。
- したがって「検証できない受入基準はタグから外し、代替検証の根拠とともに除外へ記録する」道を採った。
  除外は 265 件 → **273 件**（`integration-test` 60 → 68 件）。

**残る既知の弱さ（本タスクの境界外・後続で扱うこと）**

同ファイルは `estimate-request/REQ-21.3`・`21.4`・`26.1`〜`26.4`（Anthropic のモデル指定とプロンプトの内容）も
タグに掲げているが、これらも 503 の応答からは何も分からない。段6 の前後で主張の量は変わっていないため
本是正の対象からは外したが、**被覆の根拠としては同じ弱さを持つ**。上記 8 件と同じく
`claude-vision.service.test.ts` が実際の検証を担っている。

**併せて是正したテスト名と要件タグの食い違い（`projects/project-trading-partner.spec.ts`）**

段6 で本体を「入力中に取引先一覧 API を発生させない」形へ改めた一方、テスト名は
「300ms 後に検索実行される」、タグは `project-management/REQ-22.5`（フリガナ検索）のままだった。
本体が検証しているのは `TradingPartnerSelect` のクライアント側絞り込み、すなわち
requirements.md L403 の `REQ-22.4`（入力文字列に部分一致する顧客を候補としてフィルタリング表示する）である。
テスト名を本体へ合わせ、タグを `REQ-22.4` へ訂正した。`REQ-22.5` は
`trading-partner-select-kana.spec.ts`（8 件）と `project-kana-search.spec.ts`（7 件）が所管しており被覆は失われない。

#### 段6 の変異検証（実測）

**M1 前提の主張を落とせるかどうか（`company-info-navigation.spec.ts` REQ-5.2）**

段3 §5.3・段4 M3 と同じ検証である。是正後の形から `assertPresent` の 2 行を削除する。

| 形 | 操作 | 結果 |
|---|---|---|
| 段6 前（`if (tradingPartnerBox && companyInfoBox) { … }`） | そのまま | **型検査は通る**。矩形が取れなければ主張は一つも実行されない |
| 段6 後（`assertPresent` ×2） | 2 行を削除 | **型検査が失敗**（`error TS18047: 'companyInfoBox' is possibly 'null'` / `'tradingPartnerBox' is possibly 'null'`）。**削除できない** |

**M2 母集団を壊す（`project-list-operations.spec.ts` REQ-3.1）**

`GET /api/projects` が空の一覧を返すようにして、同じ変異のもとで両方の形を走らせた。

| 形 | 結果 |
|---|---|
| 段6 前（`emptyMessage.or(errorMessage).or(pagination)` を待ち、`if (paginationVisible)`） | **PASS**（2s）。表示件数の主張は一つも実行されない |
| 段6 後（前提を `seedProject` で作り `await expect(pagination).toBeVisible()`） | **FAIL**（13s・`expect(locator).toBeVisible() failed`） |

**M3 設定が失われた場合（`security-measures.spec.ts` REQ-26.10）**

観測したヘッダーの写しから `x-content-type-options` / `x-frame-options` を取り除いた。

| 形 | 結果 |
|---|---|
| 段6 前（`if (headers['x-content-type-options']) { … }`） | **PASS**（40ms）。ヘッダーが消えた瞬間に検証ごと消える |
| 段6 後（無条件の `toBe('nosniff')` / `toContain`） | **FAIL**（25ms） |

変異検証に用いた一時のスペックは検証後に削除している（作業ツリーに残していない）。

#### 段6 の検証（実測）

- `npm run classify:e2e-guards`: **E 0**（171 → 0）、合計 191 が検出件数と一致
- `npm run check:e2e-guards`: `generatedTotal` 393 → **191**（上限 222 を満たす）、除外注釈 0 で不変
- `npm run check:e2e-guards:selftest`: **45/45**
- `npm run check:req-coverage`: **PASSED**（除外 264 → 265 件、`pending-implementation` 8 → 10 件）。
  査読 round 4 の是正でさらに 8 件を登録し **273 件**（`integration-test` 60 → 68 件）
- 変更した 53 spec の E2E（`--retries=0`・通し実行 44分30秒）: **873 passed / 0 skipped**。
  残る 9 件は `test.fail()` のラチェット（期待された失敗）であり、Playwright の総合判定は **PASSED**（終了コード 0）。
  内訳は段5 由来 6 件（project-management/REQ-21.13、quantity-table-generation/REQ-8.4・9.5・10.5・15.1・15.3）と
  段6 由来 3 件（site-survey/REQ-4.6、site-survey/REQ-3.1、JWKS の Cache-Control）である。
  **カスタムレポータの「Failed」欄はラチェットを含めて数えるため、合否の判断は Playwright の総合判定を正とすること。**
- `npm run lint` / `npx tsc --noEmit` / `npm run format:check`: いずれも 0 件

#### 段6 が用いた畳み先

- `assertPresent` / `assertPrepared`（段0・段3 で新設）— 矩形・ビューポート・ダウンロード先など、
  観測できたはずの値の型絞り込みを主張と一体にする
- `e2e/helpers/project-list-preconditions.ts` の `seedProject` / `seedTradingPartner` — **段6 で新設**。
  プロジェクト一覧・取引先一覧は production 側が「1 件以上あるとき」にだけ表・ページネーションを描くため、
  「一覧が空かもしれない」を関門にせず前提を API で作る。同型が 4 ファイルに散っていた
- `openEditPageWithSingleItemRow`（段1 で新設）— 数量表の補完・並び順の検証が
  「項目行が 1 つも無い編集画面」の下に置かれていたため、前提を作る形へ寄せた

## 5. 一括で畳める同型の定型（115.92 と同じ手口）

| 定型 | 件数 | 1044 に含まれるか | 畳み先 |
|---|---:|---|---|
| `test.skip(!testProjectId, …)` | 45 | 含む | `assertPrepared(id, ラベル)`（偽なら throw する型ガード） |
| `test.skip(!createdEstimateRequestId, …)` | 21 | 含む | 同上 |
| `X.isVisible({ timeout: … })` | 285 | 含む | `isVisibleWithin(locator, timeout)`（`waitFor` を包んで真偽を返す） |
| 無条件の主張の直後の型絞り込み `if`（C 群） | 31（段3 の実測 **16**・うち `boundingBox()` 由来 12） | 含む | `assertPresent(value, ラベル)`（`asserts value is NonNullable<T>`） |
| 述語ヘルパー／`page.evaluate` 内部の早期 return（A 群） | 72（段3 の実測 **34**） | 含む | 注釈ではなく検出器の規則で対象外にする |
| 分岐内で throw している（B 群） | 1（段3 の実測 **1**） | 含む | 同上 |
| `test.skip();` を `if` の内側で呼ぶ形 | 49 | **含まない（未検出）** | `assertPrepared`（前提の生成を無条件に主張する形へ） |

1044 件のうち **455 件（43.6%）** が上表の機械的な置換または検出器の精度で片付く。

```
$ node -e "console.log(45+21+285+31+72+1)"
455
$ node -e "console.log(1044-455)"
589
```

残る **589 件**（D1 4 / D2 76 / E 186 / F 182 / G 56 / T3 85）が箇所ごとの判断を要する本体である。
これに加えて、抑止一覧に載っていない 49 件（bare `test.skip()`）が機械的に片付く。
115.92 が 129 箇所を `selectFirstRealOption` 一つへ畳んだのと同じ手口が、
少なくとも 4 種類（`assertPrepared` / `isVisibleWithin` / `assertPresent` / 検出器の規則）残っている。

### 5.1 段3 の実績（A / B / C）

| 群 | 策定時 | 段3 の実測 | 扱い |
|---|---:|---:|---|
| A | 72 | 34 | 検出器の規則で対象外（`predicateImplementationExclusion`） |
| B | 1 | 1 | 検出器の規則で対象外（`guaranteedFailureExclusion`） |
| C | 31 | 16 | `e2e/helpers/preconditions.ts` の `assertPresent` へ畳み込み（9 ファイル） |

`generatedTotal` は 596 → **545**（-51 = 34 + 1 + 16）。

**A / B は「件数を減らす」操作ではなく「検出器の偽陽性を止める」操作である。**
両者を取り違えないために、規則は次のように**構造だけ**で書き、
自己検査へ「対象外にすべき形」と「対象外にしてはならない紛らわしい形」の双方を登録した
（段3-1〜段3-10 の 10 件）。

- **A（計画 §6 の除外条件 (3)）**: 真偽を返す関数、またはブラウザ側で評価される関数
  （`evaluate` 族）の内側で、**その分岐に `expect` が一つも無く**、then 節が脱出だけの分岐。
  述語は false を返す経路を必ず持ち、その `return false` を数えることは
  「述語が述語であること」を欠陥として数えるに等しい。**真偽を呼び出し側がどう扱うかは
  依然として関門であり、呼び出し側の分岐は従来どおり検出される**（債務は移動しない）。
  真偽を返す関数かどうかは戻り値の型注釈、または自らの `return` がすべて真偽の値であることで
  判定する。`isX` / `hasX` のような**命名では判定しない**。
- **B（同 (1)）**: `else` を持ち、then / else の双方の到達しうる終端がすべて `throw` か
  無条件の主張であり、かつ内側に `throw` を含む分岐。素通りする経路が構造上存在しない。
  `throw` を含まない全域分岐（G 群）は「どの経路でも**同等の**検証が実行されるか」という
  中身の判断を要するため、ここでは対象外にしない（段7 で一件ずつ扱う）。

規則を元へ戻すと自己検査が **4/31 件失敗**し、`generatedTotal` は 596 へ戻る。
規則を広げる向きの変異（A から「`expect` を含まない」条件を外す／B から「`throw` を含む」条件を
外す）でも、それぞれ 1 件ずつ失敗する。すなわち規則の**幅**が両側から固定されている。
B を広げた場合、実コーパスの検出は 545 から **499** へ落ちる（G 群 46 件を飲み込む）。

なお A の条件「`expect` を含まない」は、**実コーパスの件数には寄与していない**。
段3 のレビューが実測したところ、当該条件を外しても総数は 545 のまま変わらない。
条件が救うと説明していた `e2e/helpers/wait-helpers.ts` の再試行分岐 4 件は、
別の条件（then 節が脱出だけであること）で既に対象外から落ちている。
条件自体は自己検査（段3-5 / 段3-10）で固定されており規則としては有効だが、
**現時点の実コーパスに対しては空振りである**。

### 5.2 C 群の畳み込みが除いたもの（到達不能な分岐）

`photo-select-overlap-e2e.spec.ts` の重なり検証は、矩形が取れなかった場合に
`rects.push(box)` ごと `if` の内側で飛ばしていた。

**当初これを「母集団から黙って外れていた欠陥の副次的な修正」と記したが、これは誤りである。**
段3 のレビューが実測したところ、当該の `if` の直前には無条件の主張（`expect(box).not.toBeNull()`）
が既に置かれており、矩形が取れなければ `rects.push` に到達する前に失敗していた。
すなわち `if` は**到達不能**であり、母集団は実際には変わっていない。
畳み込みが除いたのは沈黙ではなく到達不能な分岐である。REQ-39.1〜39.6 の主張は
弱くも、誤って強くもなっていない（形のみの変更）。

**この訂正自体が本書の慣行の実例である。**「直った」という主張は、直る前に何が起きていたかを
実測で確かめるまで書いてはならない。C 群の本当の価値は §5.3 が示すとおり
「主張と型の絞り込みを分離できなくすること」であって、いま飛んでいる検証を戻すことではない。

### 5.3 C 群の畳み込みが何を保証するか（変異検証）

C 群は「直前に無条件の主張があるので沈黙しない」形である。したがって畳み込みは
**いま飛んでいる検証を戻す**作業ではない。価値は、**主張と型の絞り込みを分離できなくする**
ことにある。分離したままだと、主張のほうが失われても `if` は残り、静かに沈黙する関門へ変わる。

`estimate-requests/dialog-width-e2e.spec.ts` の REQ-32.2 で三通りを実測した。

| 形 | 操作 | 結果 |
|---|---|---|
| 段3 後（`assertPresent` へ畳み込み） | `assertPresent` の行を削除 | **型検査が失敗**（`error TS18047: 'box' is possibly 'null'`）。**削除できない** |
| 段3 後 | 値が `null` になる状況を作る（`boundingBox()` が null を返す要素を指す） | **1 failed**（`取得できているはずの値が無い: ダイアログ本体の境界ボックス`）。終了コード 1 |
| 段3 前の形から主張だけを落とす（`if (box) { … }` のみ） | 同上 | **7 passed**・終了コード 0。**REQ-32.2 は緑のまま**。この構造は検出器が T5 として拾う |

すなわち畳み込みの後は、前提の主張を落とすと**コンパイルが通らない**。
落とせないので、沈黙する関門へ退行する経路が構造的に閉じる。

### 5.4 段3 の検証（実測）

- `npm run check:e2e-guards`: `generatedTotal` 596 → **545**（上限 589 を満たす）、除外注釈 3 件で不変
- `npm run classify:e2e-guards`: A/B/C いずれも **0**、合計 468 が分類対象の検出件数と一致
- `npm run check:e2e-guards:selftest`: **31/31**（段3 で 10 件追加）
- 変更した 9 ファイルの E2E（`--retries=0`）: **137 passed / skipped 0 / failed 0**
  （77 passed 3.9分 ＋ 60 passed 2.5分）
- `npm run lint` / `npm run type-check`: いずれも 0 件

### 5.5 段4 の実績（D2 群 43 件）

D2 は「観測が偽なら黙って終わる」形である。到達点は「前提が崩れたらその場で失敗する」。
43 件は 21 ファイルに散っており、**一括置換できる定型ではなかった**。是正の内訳は次の 7 型である。

| 型 | 件数 | 是正 |
|---|---:|---|
| 事前準備で作った ID の後始末を `if (!id) return` で飛ばす | 8 | `assertPrepared(id, ラベル)` |
| 直前に無条件の主張がある型絞り込みを `return` で書いた形 | 10 | `assertPresent(value, ラベル)` |
| 発火し得ない死んだ観測で検証全体を飛ばす | 8 | 観測ごと除去（`project-autocomplete.spec.ts`） |
| 繰り返しの `break` を観測で行う再試行・上限操作 | 6 | 継続条件をループの見出しへ移す |
| 繰り返しの `continue` で母集団から黙って落とす | 4 | 母集団を先に確定させ、除外後の件数を無条件に主張する |
| API 応答の失敗を `return null` / `return` で飲む補助 | 3 | `expect(res.ok(), …).toBeTruthy()` |
| 観測できなければ null／弱い代替へ落ちる補助・前提探し | 4 | 補助の内側で無条件に主張し、呼び出し側の分岐ごと除く |

D2 の是正は E 群も 194 → **189** へ動かした。`group-rename-e2e.spec.ts` の
`getFirstGroupCard`（無ければ null を返す補助）を「無ければ失敗する補助」へ改めたことで、
呼び出し側 5 箇所の `if (!groupCard) { 弱い主張; return; }` がまとめて不要になったためである。
**群は固定された集合ではなく、上流を直すと下流が消える。**

#### 発火し得ない観測が 8 件の検証を人質にしていた（`project-autocomplete.spec.ts`）

8 件のテストの先頭に、次の形が置かれていた。

```ts
// 現在の実装はセレクトボックスのため、オートコンプリート機能は未実装
const isSelect = await tradingPartnerInput.evaluate((el) => el.tagName === 'SELECT');
if (isSelect) {
  return;  // セレクトボックスの場合はテストをスキップ
}
```

注記は事実ではない。実装（`frontend/src/components/projects/TradingPartnerSelect.tsx:471`）は
`<input role="combobox">` であり `<select>` ではない。したがって `isSelect` は常に偽で、
**この分岐は一度も発火していない**（是正の前後で 8 件とも緑のまま変わらないことを実測した）。

それでも欠陥である。実装がセレクトボックスへ退行した瞬間に REQ-16 の 8 件が
赤にならず、緑のまま何も主張しなくなるためである。これを変異で示した（後述 M4）。

#### 段4 の変異検証（実測）

**M1 前提の生成を外す（`itemized-statement-reorder.spec.ts` のクリーンアップ）**

前提（プロジェクトID）を作るテストを実行対象から外し、後始末のテストだけを単独で走らせる。

| 形 | 結果 |
|---|---|
| 段4 前（`if (!testProjectId) return;`） | **1 passed**（2.3s・終了コード 0）。**後始末は一切行われていない** |
| 段4 後（`assertPrepared`） | **1 failed**（`前提が用意されていない: 事前準備で作成したプロジェクトのID`） |

**M2 前提の状態を壊す（`project-list-operations.spec.ts` REQ-6.3）**

一覧取得 API を 500 で返し、「表が表示されている」という前提を崩す。

| 形 | 結果 |
|---|---|
| 段4 前（`table.or(empty).or(error)` を待ち、表が無ければ `return`） | **1 passed**（19.2s）。REQ-6.3 の主張は一つも実行されない |
| 段4 後（`await expect(table).toBeVisible()`） | **1 failed**（表が現れない地点で失敗） |

**M3 主張を落とせるかどうか（`site-survey-annotation-mobile.spec.ts` REQ-33.6）**

段3 §5.3 と同じ検証である。前提の主張を消したときに何が起きるかを見る。

| 形 | 操作 | 結果 |
|---|---|---|
| 段4 前（`expect(vpt).not.toBeNull();` ＋ `if (!vpt) return;`） | 主張の行だけ削除 | **型検査は通る**。以後 REQ-33.6 は沈黙して消える |
| 段4 後（`assertPresent(vpt, …)`） | 同じ行を削除 | **型検査が失敗**（`TS18047: 'vpt' is possibly 'null'` ×3）。**削除できない** |

**M4 死んだ観測が生き返った場合（`project-autocomplete.spec.ts`）**

「実装がセレクトボックスである」状況を模すため、段4 前の形の観測を
`el.tagName === 'SELECT'` から `el.tagName === 'INPUT'` へ差し替える（＝観測が真になる）。

| 形 | 結果 |
|---|---|
| 段4 前 | 当該の 8 件が **8 passed**。**一つも主張を実行していない**（すべて先頭で `return`） |
| 段4 後 | 同じ差し替えを当てる場所が無い（分岐そのものが存在しない） |

なお同ファイル REQ-16.11 の `if (isSelect) { … } else { … }`（G 群・全域分岐）は
M4 で **1 failed** となった。全域分岐は沈黙しないという G 群の想定を裏づけている。
本箇所は段7 の対象であり、段4 では触れていない。

#### 段4 の検証（実測）

- `npm run classify:e2e-guards`: **D2 0**（43 → 0）、合計 420 が分類対象と一致
- `npm run check:e2e-guards`: `generatedTotal` 545 → **497**（上限 502 を満たす）、除外注釈 3 件で不変
- `npm run check:e2e-guards:selftest`: **31/31**
- 変更した 21 ファイルの E2E（`--retries=0`・6分割）: **370 passed / skipped 0 / failed 0**
  （81 + 58 + 49 + 31 + 60 + 91）
- `npm run lint` / `npm run type-check` / `npm run format:check`: いずれも 0 件

#### 段4 で列挙の資材を足したこと

`scripts/classify-e2e-assertion-guards.ts` の `--list` に、複数群の指定（`--list D2,E`）と
**該当コードの前後を印字する `--context N`** を加えた。件数だけでは着手できず、
段6（E 194 件）・段7（F/G/D1 231 件）でも同じ列挙が要る。

## 6. 検査そのものへの手当て（本タスクで実施済み）

抑止一覧が静かに恒久化しないよう、`scripts/check-e2e-assertion-guards.ts` に三点を入れた。

1. **負債の常時可視化**: 実行のたびに型別の「現在 / 目標 / 残り」と削減計画の所在を印字する。
   CI の出力を見れば、通ったかどうかとは別に、いくつ抑止されたままかが常に分かる。
   目標と計画の所在は基準の `reduction` に記録する（合否には用いない）。
2. **抑止を増やす操作への摩擦**: `--update-baseline` は件数が増える方向の書き出しを既定で拒否する。
   記録が必要な場合は `--allow-increase` を明示すること。
   「直せないので登録して黙らせる」を無言でできないようにするための関門である。
3. **基準の自己整合の検査**: `files` の合計と `generatedTotal`、`allowedFiles` の合計と
   `allowedTotal` が食い違う基準を失敗させる（手作業での書き換えで総量を見えなくする経路を塞ぐ）。

あわせて、除外注釈を認める条件をヘッダに明文化した。
**「検証ではなく前提の準備だから」は、それ単独では理由にならない。**
前提の準備であっても、前提が崩れたまま素通りすれば、失敗は崩れた地点ではなく後段に現れる。
理由には「どこで失敗するか」を書くこととし、認めるのは次の三つに限る。

- 条件が偽なら直後に throw / 無条件の主張で落ちる（再試行の待機など）
- 分岐が全域であり、どの経路でも同等の検証・操作が必ず実行される（変種の吸収）
- 判定そのものを実装している述語ヘルパーの内部

### 6.1 注釈による除外と、規則による対象外（段3 で追加。Task 115.137 で拡張）

段3 で、上の (1) と (3) に**構造上必ず該当する形**を検出器の規則で対象外にした
（`predicateImplementationExclusion` / `guaranteedFailureExclusion`）。
Task 115.137 で、(3) を真偽以外を返す補助まで広げた `valueProducingExitExclusion` と、
繰り返しを抜けるだけの `break` / `continue` を沈黙脱出から外す `escapesCheckedLoop` を足した
（§4.3 の「採用した形」(3)(4)）。いずれも注釈による除外とは別物である。

| | 注釈（`e2e-guard-allow`） | 規則による対象外 |
|---|---|---|
| 主張 | 欠陥に見えるが、この箇所では正当である | **そもそも欠陥ではない**（検出器の偽陽性） |
| 判断 | 箇所ごと。理由文をレビューする | 構造のみ。箇所ごとの判断を含まない |
| 記録 | 件数と理由を毎回出力し、基準にも記録する | 記録しない（検出しないのと同じ） |
| 歯止め | 増えると検査が失敗する | 自己検査に「対象外にすべき形」と「対象外にしてはならない紛らわしい形」を登録する |

規則で外す以上、**「大量除外による見かけ上の解消」と区別できる形にしておく必要がある**。
そのため規則は識別子の綴りを一切見ず、幅を自己検査で両側から固定した（§5.1）。
**箇所ごとの判断を要するもの（G 群など）は規則で外してはならない。**注釈か、是正である。

## 7. 現存する除外注釈の再評価（本タスクで実施済み）

| 箇所 | 判断 | 理由 |
|---|---|---|
| `e2e/specs/site-surveys/site-survey-annotation-tools.spec.ts:545` | **書き換え** | 構造は正当（再試行の外に `throw` があり、満たせなければ必ず失敗する）。ただし理由文が「検証ではなく前提の準備」を先頭に置いており、沈黙する前提準備まで許容する読み方ができた。理由を「前提が満たせない場合は直後の throw で必ず失敗する（沈黙して通る経路が無い再試行の待機）」へ改め、失敗地点を明示した |
| `e2e/specs/site-surveys/site-survey-list.spec.ts:281` | **維持** | 直前に `expect(hasSortByDate \|\| hasSortHeader \|\| hasSortSelect).toBeTruthy()` があり、続く `if / else if / else` が全域。どの経路でも並び替えが必ず実行される。沈黙して通る経路が無い |
| `e2e/specs/site-surveys/site-survey-list.spec.ts:284` | **維持** | 同上（同じ分岐連鎖の第二経路） |

課題文が名指しした「検証ではなく前提の準備」を理由に沈黙する前提準備を許容していた除外は
`e2e/specs/quantity-tables/photo-change-dialog-e2e.spec.ts:110` にあったもので、
**115.92（コミット `1d8e4d0`）で既に解消されている**。現在は共通補助
`selectFirstRealOption` を呼ぶ形になっており、当該ファイルに除外注釈は残っていない。

```
$ grep -rn "e2e-guard-allow" e2e --include=*.ts
e2e/specs/site-surveys/site-survey-annotation-tools.spec.ts:544
e2e/specs/site-surveys/site-survey-list.spec.ts:280
e2e/specs/site-surveys/site-survey-list.spec.ts:283
```

## 付録 A: 608 件の分類スクリプト

`npx tsx scripts/check-e2e-assertion-guards.ts --json > /tmp/guards.json` の出力に対し、
各検出箇所の構文木上の位置（`test` 本体か、真偽を返す述語ヘルパーか、`page.evaluate` の内側か）と
`if` の then/else 節の内容（`throw` / `expect` / 操作 / `return` の有無）、
および直前 12 行に同名識別子への無条件の主張があるかを見て、A〜G へ排他的に振り分けた。
振り分けの優先順位は A → B → C → G → D → F → E であり、合計が 608 に一致することを確認している。

**この内訳は現時点で再現できない（タスク 115.93 のレビュー指摘3、および再現の試行結果）。**
分類に用いた走査そのものが成果物として残っておらず、上の手順の記述だけでは同じ値へ到達しない。
行単位の波括弧の釣り合いと素朴な述語検出で書き直した走査は
`{"A":96,"B":1,"C":1,"D1":0,"D2":49,"E":388,"F":27,"G":0}`（合計 562・未分類 46）を返し、
掲げた内訳と一致しなかった。書き直した走査のほうが粗い可能性が高く、内訳が誤っていると断定はできないが、
**「閉じた列挙は直前に実行したコマンドで裏づける」という本スペックの慣行を、本節だけが満たしていない。**

### 【段3 で解除済み】上記の制約と、その解除

策定当時は次の制約を課していた。

> - 独立に再現できている数値は **T5 539 / T1 64 / T4 5 の合計 608**、および `generatedTotal` と型別件数だけである。
> - **A〜G の内訳に依存する段4・段6・段7 の出口数値（≤513 / ≤242 / 0）は暫定である。**
>   当該の段に着手する前に、構文木に基づく分類走査を資材として作成し、内訳を測り直したうえで
>   出口数値を確定させること。測り直した結果が上の内訳と食い違う場合は、内訳のほうを実測へ合わせる。
> - 段7 の出口「`generatedTotal` が 0」だけは内訳に依存しないため、この制約の対象外である。

**Task 115.127 段3 でこの制約を解除した。**分類走査を
`scripts/classify-e2e-assertion-guards.ts`（`npm run classify:e2e-guards`）として資材化し、
内訳を測り直したうえで §4 の出口数値を確定値へ改めた。

### 分類走査の資材（`scripts/classify-e2e-assertion-guards.ts`）

再現できなかった原因は、走査が「行単位の文字列処理」で書かれ、かつ残っていなかったことにある。
資材化にあたって二点を変えた。

1. **入力を検出器の出力そのものにした。**`scanFile` の戻り値に検出の元になった構文木の節点
   （`findingNodes`）を持たせ、分類はその節点から親子を辿る。行番号で当て直さないため、
   **「分類の合計＝検出件数」が構成上保証される**（走査の出力に一致・不一致を印字する）。
2. **判定を構文の形だけで行う。**識別子の綴り（`isX` / `hasX` など）は一切見ない。
   段1 で「ガードが見張る値とテストが実際に使う値が違っていた」実例があり、名前は当てにならない。

振り分けの優先順位は **A → B → C → G → D1 → D2 → F → E** である。

### 測り直した内訳（段3 着手時点・`generatedTotal` 596）

```
$ npm run classify:e2e-guards
   検出件数（全型）: 596
   分類対象（T1 / T4 / T5）: 519
     A     34  述語ヘルパー／page.evaluate の内側（判定の実装そのもの）
     B      1  分岐の内側で throw している（必ず失敗する）
     C     16  無条件の主張の直後の型絞り込み
     G     52  if/else の双方で主張する全域分岐
     D1    10  再試行の成功時の脱出（繰り返しの外に throw がある）
     D2    43  観測結果で沈黙して脱出（失敗させる経路が無い）
     F    169  復旧・再試行を含む分岐（主張も操作も含む）
     E    194  観測結果で主張を包むだけ
   合計 519（分類対象 519 と一致）
```

策定時の内訳（A 72 / B 1 / C 31 / D1 4 / D2 76 / E 186 / F 182 / G 56、合計 608）とは食い違う。
付録 A の指示どおり**内訳のほうを実測へ合わせた**。差の主因は二つである。

- 母数が 608 → 519 へ減っている（段0〜段2 の是正で該当行ごと消えたもの、および
  段1 で「表示されていれば」で前提を探す分岐が消えたもの）。
- 群の定義を構文へ落とす過程で境界が変わった。とくに A は「真偽を返す関数の内側」だけでなく
  **「その分岐に expect が一つも無く、then 節が脱出だけである」**ことを要求する。
  策定時の A に含まれていたと思われる `wait-helpers.ts` の再試行分岐（内側に `expect` を持つ）は
  この定義では A に入らず F へ回る。**主張を包む分岐は、述語の内側であっても対象外にしない。**

### 段4 以降の出口数値の確定

段3 完了時点（`generatedTotal` 545 / A・B・C いずれも 0）の内訳から §4 の表を確定させた。

```
$ npm run classify:e2e-guards   # 段3 完了時点
   検出件数（全型）: 545
     G 52 / D1 10 / D2 43 / F 169 / E 194   （T3 77 は別軸）
```

段4 ≤502（D2 43 を解消）、段5 ≤425（T3 77 を解消）、段6 ≤231（E 194 を解消）、段7 0（F+G+D1 231）。
合計 43 + 77 + 194 + 231 = 545 で `generatedTotal` に一致する。
段5 完了時点で再度実測したところ `generatedTotal` は 398・E は 171 であったため、§4 の表の段6 は
E **171** / `generatedTotal ≤ 227`（398 − 171）へ改めた。上の導出は段3 時点の記録として残す。
なお内訳は是正の進行に伴って群の間を移動しうる（例: D2 の解消が E を巻き込むことがある）。
上限値は**単調な確認手段**であり、各段の拘束は群別・型別の 0 のほうである。
