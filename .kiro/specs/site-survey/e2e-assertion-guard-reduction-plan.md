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
| 6 | E | E **171** 件が 0、`generatedTotal ≤ 227`（段5 完了時点の実測。導出時の見積もりは E 194 / ≤231 だった） |
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
| 6〜7 | 未着手 | — |

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

### 段2 の時点で残る既知の赤

`quantity-tables/quantity-item-action-menu-clipping-e2e.spec.ts:426`（REQ-46.1/46.2/46.3）は
**段2 の着手前から落ちている**。`MENU_ITEM_COUNT = 4` に対しメニュー項目が 5 件あるためで、
`a241d54`（数量項目のグループ間移動と一括操作の実装）が「別グループに移動」を足したときに
本ファイルの定数が追随しなかったことによる。段2 の変更とは無関係であり、直列 describe のため
同ファイルの後続 5 件が実行されない。別タスクで扱うこと。

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

### 6.1 注釈による除外と、規則による対象外（段3 で追加）

段3 で、上の (1) と (3) に**構造上必ず該当する形**を検出器の規則で対象外にした
（`predicateImplementationExclusion` / `guaranteedFailureExclusion`）。両者は別物である。

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
